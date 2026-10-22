<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Kernel;

/** Limite de taxa nas rotas de autenticação (E01-05). */
final class RateLimitTest extends ApiTestCase
{
    private Kernel $limited;

    protected function setUp(): void
    {
        parent::setUp();
        $this->limited = $this->makeKernel(['RATE_LIMIT_ENABLED' => '1']);
    }

    protected function tearDown(): void
    {
        if (isset($this->limited)) {
            $this->limited->db->close();
        }
        parent::tearDown();
    }

    /** IP de documentação/benchmark (198.18.0.0/15), sorteado para não colidir com janelas de outras execuções. */
    private function randomIp(): string
    {
        return '198.18.' . random_int(0, 255) . '.' . random_int(1, 254);
    }

    /**
     * @param array<string, mixed> $body
     * @param array<string, string> $headers
     * @return array{status: int, body: array<string, mixed>, headers: array<string, string>}
     */
    private function post(string $path, array $body, string $ip, array $headers = [], ?Kernel $kernel = null): array
    {
        return $this->call('POST', $path, $body, null, false, null, $headers, $kernel ?? $this->limited, ['REMOTE_ADDR' => $ip]);
    }

    /** @return array<string, mixed> */
    private function registration(): array
    {
        return [
            'nome' => 'Limite', 'email' => 'l' . bin2hex(random_bytes(6)) . '@exemplo.invalid', 'senha' => 'senha-de-teste-bem-longa-42',
            'aceita_termos' => true, 'versao_termos' => '1', 'versao_privacidade' => '1', 'maior_de_18' => true,
        ];
    }

    public function testRegistrationIsLimitedPerIpAndOtherIpsAreUnaffected(): void
    {
        $ip = $this->randomIp();
        for ($i = 1; $i <= 10; $i++) {
            self::assertSame(201, $this->post('/auth/register', $this->registration(), $ip)['status'], "tentativa $i");
        }

        $blocked = $this->post('/auth/register', $this->registration(), $ip);

        self::assertSame(429, $blocked['status']);
        self::assertSame('RATE_LIMITED', $blocked['body']['error']['code']);
        self::assertGreaterThanOrEqual(1, (int) $blocked['headers']['Retry-After']);
        self::assertLessThanOrEqual(3600, (int) $blocked['headers']['Retry-After']);
        self::assertSame(201, $this->post('/auth/register', $this->registration(), $this->randomIp())['status']);
    }

    public function testLoginIsLimitedPerEmailEvenWhenTheIpChangesAndFailuresAndSuccessesBothCount(): void
    {
        for ($i = 1; $i <= 10; $i++) {
            $r = $this->post('/auth/login', ['email' => $this->userEmail, 'senha' => 'senha-errada-' . $i], $this->randomIp());
            self::assertSame(401, $r['status'], "tentativa $i");
        }

        $blocked = $this->post('/auth/login', ['email' => strtoupper($this->userEmail), 'senha' => 'senha-de-teste-bem-longa-42'], $this->randomIp());
        self::assertSame(429, $blocked['status'], 'mesmo com a senha certa, o e-mail está bloqueado (e maiúsculas não escapam do limite)');

        $other = $this->post('/auth/login', ['email' => 'outro' . bin2hex(random_bytes(4)) . '@exemplo.invalid', 'senha' => 'qualquer-senha-123'], $this->randomIp());
        self::assertSame(401, $other['status'], 'outro e-mail não é afetado');
    }

    public function testLoginIsLimitedPerIp(): void
    {
        $ip = $this->randomIp();
        for ($i = 1; $i <= 30; $i++) {
            $r = $this->post('/auth/login', ['email' => "x$i" . bin2hex(random_bytes(3)) . '@exemplo.invalid', 'senha' => 'senha-qualquer-123'], $ip);
            self::assertSame(401, $r['status'], "tentativa $i");
        }

        self::assertSame(429, $this->post('/auth/login', ['email' => 'y' . bin2hex(random_bytes(3)) . '@exemplo.invalid', 'senha' => 'senha-qualquer-123'], $ip)['status']);
    }

    public function testRefreshIsLimitedAndTheWindowExpires(): void
    {
        $ip = $this->randomIp();
        for ($i = 1; $i <= 60; $i++) {
            self::assertSame(401, $this->post('/auth/refresh', ['refresh_token' => str_repeat('a', 43)], $ip)['status'], "tentativa $i");
        }
        self::assertSame(429, $this->post('/auth/refresh', ['refresh_token' => str_repeat('a', 43)], $ip)['status']);

        // Passada a janela, o contador recomeça.
        $this->kernel->db->execute('UPDATE limites_requisicao SET janela_inicio = DATE_SUB(janela_inicio, INTERVAL 1 DAY)');
        self::assertSame(401, $this->post('/auth/refresh', ['refresh_token' => str_repeat('a', 43)], $ip)['status']);
    }

    public function testForwardedForIsIgnoredUnlessTheProxyIsTrusted(): void
    {
        $ip = $this->randomIp();
        for ($i = 1; $i <= 60; $i++) {
            $this->post('/auth/refresh', ['refresh_token' => str_repeat('a', 43)], $ip, ['X-Forwarded-For' => "203.0.113.$i"]);
        }
        self::assertSame(429, $this->post('/auth/refresh', ['refresh_token' => str_repeat('a', 43)], $ip, ['X-Forwarded-For' => '203.0.113.200'])['status'], 'forjar X-Forwarded-For não escapa do limite');

        $trusting = $this->makeKernel(['RATE_LIMIT_ENABLED' => '1', 'TRUST_FORWARDED_FOR' => '1']);
        $proxy = $this->randomIp();
        $clientA = '192.0.2.' . random_int(1, 120);
        for ($i = 1; $i <= 61; $i++) {
            $r = $this->post('/auth/refresh', ['refresh_token' => str_repeat('a', 43)], $proxy, ['X-Forwarded-For' => '192.0.2.' . (130 + ($i % 100))], $trusting);
            self::assertNotSame(429, $r['status'], 'atrás de proxy confiável, cada cliente tem o próprio contador');
        }
        for ($i = 1; $i <= 60; $i++) {
            $this->post('/auth/refresh', ['refresh_token' => str_repeat('a', 43)], $proxy, ['X-Forwarded-For' => $clientA], $trusting);
        }
        self::assertSame(429, $this->post('/auth/refresh', ['refresh_token' => str_repeat('a', 43)], $proxy, ['X-Forwarded-For' => $clientA], $trusting)['status']);
        $trusting->db->close();
    }

    public function testNoIdentifierIsStoredInPlainText(): void
    {
        $ip = $this->randomIp();
        $email = 'privado' . bin2hex(random_bytes(4)) . '@exemplo.invalid';
        $this->post('/auth/login', ['email' => $email, 'senha' => 'qualquer-senha-123'], $ip);

        $rows = $this->kernel->db->fetchAll('SELECT chave_hash, janela_inicio, contagem FROM limites_requisicao');
        self::assertNotEmpty($rows);
        foreach ($rows as $row) {
            self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', (string) $row['chave_hash']);
        }
        $dump = json_encode($rows, JSON_THROW_ON_ERROR);
        self::assertStringNotContainsString($ip, $dump);
        self::assertStringNotContainsString($email, $dump);
        self::assertStringNotContainsString('exemplo.invalid', $dump);
    }

    public function testRateLimitCanBeDisabledByConfiguration(): void
    {
        $ip = $this->randomIp();
        for ($i = 1; $i <= 65; $i++) {
            self::assertSame(401, $this->post('/auth/refresh', ['refresh_token' => str_repeat('a', 43)], $ip, [], $this->kernel)['status']);
        }
    }
}
