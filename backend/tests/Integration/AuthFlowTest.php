<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Config;
use CapiFit\Kernel;
use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Nyholm\Psr7\ServerRequest;
use Nyholm\Psr7\Stream;
use PHPUnit\Framework\TestCase;

/**
 * Fluxo completo de autenticação contra um MySQL real (E01-01/E01-02, Doc 05 §4, Doc 06 D-11).
 * Roda com DB_* e CAPIFIT_ALLOW_DB_TESTS=1 (banco descartável: os testes deixam usuários de teste).
 */
final class AuthFlowTest extends TestCase
{
    private const PASSWORD = 'senha-de-teste-bem-longa-42';

    private Kernel $kernel;
    private TestHandler $logs;

    protected function setUp(): void
    {
        if (getenv('DB_NAME') === false || getenv('CAPIFIT_ALLOW_DB_TESTS') !== '1') {
            self::markTestSkipped('Defina DB_NAME, DB_* e CAPIFIT_ALLOW_DB_TESTS=1 para rodar contra um banco descartável.');
        }
        $this->logs = new TestHandler();
        $env = [...getenv(), 'JWT_SECRET' => 'segredo-de-teste-com-mais-de-32-bytes-0123456789'];
        // Quando houver usuário da aplicação (somente DML), o fluxo roda com ele: prova que a API funciona sem privilégios de DDL.
        if (getenv('DB_APP_USER') !== false) {
            $env['DB_USER'] = (string) getenv('DB_APP_USER');
            $env['DB_PASSWORD'] = (string) getenv('DB_APP_PASSWORD');
        }
        $config = Config::fromArray($env);
        $this->kernel = new Kernel($config, new Logger('t', [$this->logs]));
    }

    protected function tearDown(): void
    {
        if (isset($this->kernel)) {
            $this->kernel->db->close();
        }
    }

    /**
     * @param array<string, mixed>|null $body
     * @return array{status: int, body: array<string, mixed>, headers: array<string, string>}
     */
    private function call(string $method, string $path, ?array $body = null, ?string $bearer = null): array
    {
        $json = $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR);
        $headers = $json === '' ? [] : ['Content-Type' => 'application/json'];
        if ($bearer !== null) {
            $headers['Authorization'] = 'Bearer ' . $bearer;
        }
        $request = new ServerRequest($method, $path, $headers, $json);
        $response = $this->kernel->handle($json === '' ? $request : $request->withBody(Stream::create($json)));
        $raw = (string) $response->getBody();
        /** @var array<string, mixed> $decoded */
        $decoded = $raw === '' ? [] : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

        return ['status' => $response->getStatusCode(), 'body' => $decoded, 'headers' => array_map(static fn (array $v): string => $v[0], $response->getHeaders())];
    }

    private function email(): string
    {
        return 'u' . bin2hex(random_bytes(6)) . '@exemplo.invalid';
    }

    /** @return array{email: string, access: string, refresh: string, user: string} */
    private function register(?string $email = null): array
    {
        $email ??= $this->email();
        $r = $this->call('POST', '/auth/register', [
            'nome' => 'Ana Conceição', 'email' => $email, 'senha' => self::PASSWORD, 'aceita_termos' => true,
            'versao_termos' => '2026-10', 'versao_privacidade' => '2026-10', 'maior_de_18' => true,
        ]);
        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');

        return ['email' => $email, 'access' => $r['body']['data']['access_token'], 'refresh' => $r['body']['data']['refresh_token'], 'user' => $r['body']['data']['usuario']['id']];
    }

    /** @return array{access: string, refresh: string} */
    private function login(string $email, string $password = self::PASSWORD): array
    {
        $r = $this->call('POST', '/auth/login', ['email' => $email, 'senha' => $password]);
        self::assertSame(200, $r['status'], json_encode($r['body']) ?: '');

        return ['access' => $r['body']['data']['access_token'], 'refresh' => $r['body']['data']['refresh_token']];
    }

    private function sql(string $sql, string $types = '', mixed ...$params): int
    {
        return $this->kernel->db->execute($sql, $types, ...$params);
    }

    public function testRegisterReturnsTokensAndStoresOnlySafeData(): void
    {
        $email = $this->email();
        $r = $this->call('POST', '/auth/register', [
            'nome' => '  Ana Conceição ', 'email' => strtoupper($email), 'senha' => self::PASSWORD, 'aceita_termos' => true,
            'versao_termos' => '2026-10', 'versao_privacidade' => '2026-10', 'maior_de_18' => true,
        ]);
        $data = $r['body']['data'];

        self::assertSame(201, $r['status']);
        self::assertSame('Bearer', $data['token_type']);
        self::assertSame(900, $data['expires_in']);
        self::assertSame(['aluno'], $data['usuario']['papeis']);
        self::assertSame('Ana Conceição', $data['usuario']['nome'], 'o nome é aparado');
        self::assertSame('req_', substr($r['body']['meta']['request_id'], 0, 4));

        $row = $this->kernel->db->fetchOne('SELECT id, senha_hash, estado, maioridade_declarada_em, email FROM usuarios WHERE uuid = ?', 's', $data['usuario']['id']);
        self::assertNotNull($row);
        self::assertSame($email, $row['email'], 'o e-mail é guardado em minúsculas');
        self::assertSame('ativo', $row['estado']);
        self::assertNotNull($row['maioridade_declarada_em']);
        self::assertStringStartsWith('$argon2id$', (string) $row['senha_hash']);
        self::assertStringNotContainsString(self::PASSWORD, (string) $row['senha_hash']);

        $consents = $this->kernel->db->fetchAll('SELECT tipo, versao_documento FROM consentimentos_privacidade WHERE usuario_id = ? ORDER BY id', 'i', $row['id']);
        self::assertSame([['tipo' => 'termos_uso', 'versao_documento' => '2026-10'], ['tipo' => 'politica_privacidade', 'versao_documento' => '2026-10']], $consents);

        // O refresh token nunca é guardado em claro: só o hash.
        $stored = $this->kernel->db->fetchOne('SELECT refresh_hash FROM sessoes_autenticacao WHERE usuario_id = ?', 'i', $row['id']);
        self::assertNotNull($stored);
        self::assertSame(hash('sha256', $data['refresh_token']), $stored['refresh_hash']);
        self::assertNotSame($data['refresh_token'], $stored['refresh_hash']);
    }

    public function testMeReturnsTheAuthenticatedUser(): void
    {
        $u = $this->register();
        $r = $this->call('GET', '/me', null, $u['access']);

        self::assertSame(200, $r['status']);
        self::assertSame($u['user'], $r['body']['data']['id']);
        self::assertSame($u['email'], $r['body']['data']['email']);
        self::assertSame(['aluno'], $r['body']['data']['papeis']);
        self::assertFalse($r['body']['data']['email_verificado']);
        self::assertArrayNotHasKey('senha_hash', $r['body']['data']);
        self::assertStringNotContainsString($u['refresh'], json_encode($r['body'], JSON_THROW_ON_ERROR));
    }

    public function testDuplicateEmailIsConflictRegardlessOfCaseAndLeavesNoPartialData(): void
    {
        $u = $this->register();
        $before = $this->kernel->db->fetchOne('SELECT (SELECT COUNT(*) FROM usuarios) AS u, (SELECT COUNT(*) FROM consentimentos_privacidade) AS c, (SELECT COUNT(*) FROM sessoes_autenticacao) AS s');

        $r = $this->call('POST', '/auth/register', [
            'nome' => 'Outra', 'email' => strtoupper($u['email']), 'senha' => self::PASSWORD, 'aceita_termos' => true,
            'versao_termos' => '2026-10', 'versao_privacidade' => '2026-10', 'maior_de_18' => true,
        ]);
        $after = $this->kernel->db->fetchOne('SELECT (SELECT COUNT(*) FROM usuarios) AS u, (SELECT COUNT(*) FROM consentimentos_privacidade) AS c, (SELECT COUNT(*) FROM sessoes_autenticacao) AS s');

        self::assertSame(409, $r['status']);
        self::assertSame('EMAIL_ALREADY_REGISTERED', $r['body']['error']['code']);
        self::assertSame($before, $after, 'o rollback não pode deixar linhas parciais');
    }

    public function testLoginWorksAndFailuresAreIndistinguishable(): void
    {
        $u = $this->register();
        $this->login($u['email']);

        $wrongPassword = $this->call('POST', '/auth/login', ['email' => $u['email'], 'senha' => 'senha-errada-qualquer']);
        $unknownUser = $this->call('POST', '/auth/login', ['email' => $this->email(), 'senha' => 'senha-errada-qualquer']);

        self::assertSame(401, $wrongPassword['status']);
        self::assertSame(401, $unknownUser['status']);
        self::assertSame('UNAUTHENTICATED', $wrongPassword['body']['error']['code']);
        self::assertSame($wrongPassword['body']['error']['code'], $unknownUser['body']['error']['code']);
        self::assertSame($wrongPassword['body']['error']['message'], $unknownUser['body']['error']['message']);
    }

    public function testSuspendedUserCannotLoginUseTokensOrRefresh(): void
    {
        $u = $this->register();
        $this->sql("UPDATE usuarios SET estado = 'suspenso' WHERE uuid = ?", 's', $u['user']);

        self::assertSame(401, $this->call('POST', '/auth/login', ['email' => $u['email'], 'senha' => self::PASSWORD])['status']);
        self::assertSame(401, $this->call('GET', '/me', null, $u['access'])['status']);
        self::assertSame(401, $this->call('POST', '/auth/refresh', ['refresh_token' => $u['refresh']])['status']);
    }

    public function testRefreshRotatesTheTokenAndToleratesImmediateReuse(): void
    {
        $u = $this->register();
        $r = $this->call('POST', '/auth/refresh', ['refresh_token' => $u['refresh']]);

        self::assertSame(200, $r['status']);
        $newRefresh = $r['body']['data']['refresh_token'];
        $newAccess = $r['body']['data']['access_token'];
        self::assertNotSame($u['refresh'], $newRefresh);
        self::assertSame(200, $this->call('GET', '/me', null, $newAccess)['status']);

        // Reuso imediato (dentro da janela de tolerância): 401, mas a família NÃO é revogada.
        $again = $this->call('POST', '/auth/refresh', ['refresh_token' => $u['refresh']]);
        self::assertSame(401, $again['status']);
        self::assertSame(200, $this->call('GET', '/me', null, $newAccess)['status'], 'a sessão legítima continua válida');
        self::assertSame(200, $this->call('POST', '/auth/refresh', ['refresh_token' => $newRefresh])['status']);
    }

    public function testReuseOfAStaleRefreshTokenRevokesTheWholeFamily(): void
    {
        $u = $this->register();
        $r = $this->call('POST', '/auth/refresh', ['refresh_token' => $u['refresh']]);
        $newRefresh = $r['body']['data']['refresh_token'];
        $newAccess = $r['body']['data']['access_token'];

        // Simula que o token antigo foi rotacionado há uma hora e agora aparece de novo (roubo provável).
        $this->sql('UPDATE sessoes_autenticacao SET usado_em = DATE_SUB(NOW(6), INTERVAL 1 HOUR) WHERE refresh_hash = ?', 's', hash('sha256', $u['refresh']));
        $stolen = $this->call('POST', '/auth/refresh', ['refresh_token' => $u['refresh']]);

        self::assertSame(401, $stolen['status']);
        self::assertSame(401, $this->call('POST', '/auth/refresh', ['refresh_token' => $newRefresh])['status'], 'o token novo também foi revogado');
        self::assertSame(401, $this->call('GET', '/me', null, $newAccess)['status'], 'o access token da família também deixa de valer');
        $events = array_map(static fn ($r) => $r->context['event'] ?? null, $this->logs->getRecords());
        self::assertContains('auth.refresh_reuse', $events, 'o reuso é registrado');
        self::assertStringNotContainsString($u['refresh'], json_encode(array_map(static fn ($x) => $x->context, $this->logs->getRecords()), JSON_THROW_ON_ERROR));
    }

    public function testExpiredAndUnknownRefreshTokensAreRejected(): void
    {
        $u = $this->register();
        $this->sql('UPDATE sessoes_autenticacao SET expira_em = DATE_SUB(NOW(6), INTERVAL 1 MINUTE) WHERE refresh_hash = ?', 's', hash('sha256', $u['refresh']));

        self::assertSame(401, $this->call('POST', '/auth/refresh', ['refresh_token' => $u['refresh']])['status']);
        self::assertSame(401, $this->call('POST', '/auth/refresh', ['refresh_token' => str_repeat('a', 43)])['status']);
    }

    public function testLogoutRevokesOnlyTheCurrentSession(): void
    {
        $u = $this->register();
        $other = $this->login($u['email']);

        $out = $this->call('POST', '/auth/logout', null, $u['access']);
        self::assertSame(204, $out['status']);
        self::assertSame([], $out['body']);

        self::assertSame(401, $this->call('GET', '/me', null, $u['access'])['status']);
        self::assertSame(401, $this->call('POST', '/auth/refresh', ['refresh_token' => $u['refresh']])['status']);
        self::assertSame(200, $this->call('GET', '/me', null, $other['access'])['status'], 'o outro dispositivo continua logado');
    }

    public function testLogoutAllRevokesEverySession(): void
    {
        $u = $this->register();
        $other = $this->login($u['email']);

        self::assertSame(204, $this->call('POST', '/auth/logout-all', null, $u['access'])['status']);

        self::assertSame(401, $this->call('GET', '/me', null, $u['access'])['status']);
        self::assertSame(401, $this->call('GET', '/me', null, $other['access'])['status']);
        self::assertSame(401, $this->call('POST', '/auth/refresh', ['refresh_token' => $other['refresh']])['status']);
        // Novo login continua possível.
        self::assertSame(200, $this->call('GET', '/me', null, $this->login($u['email'])['access'])['status']);
    }

    public function testNoSecretReachesTheLogs(): void
    {
        $u = $this->register();
        $login = $this->login($u['email']);
        $this->call('POST', '/auth/refresh', ['refresh_token' => $login['refresh']]);
        $this->call('POST', '/auth/login', ['email' => $u['email'], 'senha' => 'tentativa-errada-123']);

        $everything = json_encode(array_map(static fn ($r) => [$r->message, $r->context, $r->extra], $this->logs->getRecords()), JSON_THROW_ON_ERROR);
        foreach ([self::PASSWORD, 'tentativa-errada-123', $u['access'], $u['refresh'], $login['access'], $login['refresh'], $u['email']] as $secret) {
            self::assertStringNotContainsString($secret, $everything);
        }
    }
}
