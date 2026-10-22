<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Config;
use CapiFit\Kernel;
use CapiFit\Support\Text;
use CapiFit\Support\Uuid;
use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Nyholm\Psr7\ServerRequest;
use Nyholm\Psr7\Stream;
use PHPUnit\Framework\TestCase;

/**
 * Base dos testes de API contra um MySQL real: monta o Kernel (com o usuário somente DML quando existir),
 * registra um usuário e oferece `call()` para exercitar as rotas de ponta a ponta.
 * Só roda com DB_* e CAPIFIT_ALLOW_DB_TESTS=1 (banco descartável).
 */
abstract class ApiTestCase extends TestCase
{
    protected Kernel $kernel;
    protected TestHandler $logs;
    protected string $token = '';
    protected string $userUuid = '';
    protected string $userEmail = '';

    protected function setUp(): void
    {
        if (getenv('DB_NAME') === false || getenv('CAPIFIT_ALLOW_DB_TESTS') !== '1') {
            self::markTestSkipped('Defina DB_NAME, DB_* e CAPIFIT_ALLOW_DB_TESTS=1 para rodar contra um banco descartável.');
        }
        $this->logs = new TestHandler();
        $this->kernel = $this->makeKernel();
        [$this->token, $this->userUuid, $this->userEmail] = $this->newUser();
    }

    protected function tearDown(): void
    {
        if (isset($this->kernel)) {
            $this->kernel->db->close();
        }
    }

    /** @param array<string, string> $extraEnv */
    protected function makeKernel(array $extraEnv = []): Kernel
    {
        $env = [...getenv(), 'JWT_SECRET' => 'segredo-de-teste-com-mais-de-32-bytes-0123456789', 'RATE_LIMIT_ENABLED' => '0', ...$extraEnv];
        if (getenv('DB_APP_USER') !== false) {
            $env['DB_USER'] = (string) getenv('DB_APP_USER');
            $env['DB_PASSWORD'] = (string) getenv('DB_APP_PASSWORD');
        }

        return new Kernel(Config::fromArray($env), new Logger('t', [$this->logs ?? new TestHandler()]));
    }

    /** @return array{string, string, string, string} token de acesso, uuid, e-mail e refresh token */
    protected function newUser(?Kernel $kernel = null): array
    {
        $email = 'u' . bin2hex(random_bytes(6)) . '@exemplo.invalid';
        $r = $this->call('POST', '/auth/register', [
            'nome' => 'Teste', 'email' => $email, 'senha' => 'senha-de-teste-bem-longa-42',
            'aceita_termos' => true, 'versao_termos' => '1', 'versao_privacidade' => '1', 'maior_de_18' => true,
        ], null, false, null, [], $kernel);
        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');

        return [$r['body']['data']['access_token'], $r['body']['data']['usuario']['id'], $email, $r['body']['data']['refresh_token']];
    }

    /**
     * @param array<string, mixed>|null $body
     * @param array<string, string> $headers
     * @return array{status: int, body: array<string, mixed>, headers: array<string, string>}
     */
    protected function call(string $method, string $path, ?array $body = null, ?string $key = null, bool $auth = true, ?string $token = null, array $headers = [], ?Kernel $kernel = null): array
    {
        $json = $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR);
        $all = $headers + ($json === '' ? [] : ['Content-Type' => 'application/json']);
        if ($auth) {
            $all['Authorization'] = 'Bearer ' . ($token ?? $this->token);
        }
        if ($key !== null) {
            $all['Idempotency-Key'] = $key;
        }
        $request = new ServerRequest($method, $path, $all, $json);
        if (str_contains($path, '?')) {
            parse_str((string) parse_url($path, PHP_URL_QUERY), $query);
            $request = $request->withQueryParams($query);
        }
        $response = ($kernel ?? $this->kernel)->handle($json === '' ? $request : $request->withBody(Stream::create($json)));
        $raw = (string) $response->getBody();
        /** @var array<string, mixed> $decoded */
        $decoded = $raw === '' ? [] : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

        return ['status' => $response->getStatusCode(), 'body' => $decoded, 'headers' => array_map(static fn (array $v): string => $v[0], $response->getHeaders())];
    }

    protected function iso(int $secondsAgo = 0): string
    {
        return gmdate('Y-m-d\TH:i:s\Z', time() - $secondsAgo);
    }

    protected function open(?string $token = null, int $secondsAgo = 60): string
    {
        $r = $this->call('POST', '/me/sessoes', ['sessao_uuid' => Uuid::v4(), 'iniciada_em' => $this->iso($secondsAgo)], Uuid::v4(), true, $token);
        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');

        return $r['body']['data']['id'];
    }

    protected function published(string $name, string $modalidade = 'reps_carga', string $status = 'publicado'): string
    {
        $uuid = Uuid::v4();
        $this->kernel->db->execute(
            'INSERT INTO exercicios(uuid, nome, nome_normalizado, modalidade, status) VALUES (?, ?, ?, ?, ?)',
            'sssss',
            $uuid,
            $name,
            Text::normalize($name),
            $modalidade,
            $status,
        );

        return $uuid;
    }

    /** @return array{id: string, exercicio: string} item de exercício adicionado à sessão */
    protected function addItem(string $session, ?string $name = null): array
    {
        $exercise = $this->published($name ?? 'Ex ' . bin2hex(random_bytes(3)));
        $r = $this->call('POST', "/me/sessoes/$session/exercicios", ['exercicio_uuid' => $exercise]);
        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');

        return ['id' => $r['body']['data']['id'], 'exercicio' => $exercise];
    }

    protected function addSeriesTo(string $session, string $itemUuid): string
    {
        $r = $this->call('POST', "/me/sessoes/$session/series", ['sessao_exercicio_uuid' => $itemUuid]);
        self::assertSame(201, $r['status'], json_encode($r['body']) ?: '');

        return $r['body']['data']['id'];
    }

    protected function doSeries(string $session, string $seriesUuid, float $kg = 40, int $reps = 10): void
    {
        $r = $this->call('PATCH', "/me/sessoes/$session/series/$seriesUuid", ['carga_kg' => $kg, 'repeticoes' => $reps, 'status' => 'realizada']);
        self::assertSame(200, $r['status'], json_encode($r['body']) ?: '');
    }
}
