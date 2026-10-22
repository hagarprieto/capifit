<?php

declare(strict_types=1);

namespace CapiFit\Tests\Unit;

use CapiFit\Config;
use CapiFit\Kernel;
use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Nyholm\Psr7\ServerRequest;
use Nyholm\Psr7\Stream;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;

/** Validação e proteção das rotas de autenticação — tudo que acontece antes de tocar no banco. */
final class AuthRoutesTest extends TestCase
{
    private TestHandler $logs;
    private Kernel $kernel;

    protected function setUp(): void
    {
        $this->logs = new TestHandler();
        $this->kernel = new Kernel(Config::fromArray(['JWT_SECRET' => 'segredo-de-teste-com-mais-de-32-bytes-0123456789', 'RATE_LIMIT_ENABLED' => '0']), new Logger('t', [$this->logs]));
    }

    /**
     * @param array<string, mixed>|null $body
     * @param array<string, string> $headers
     */
    private function call(string $method, string $path, ?array $body = null, array $headers = []): ResponseInterface
    {
        $json = $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR);
        $request = new ServerRequest($method, $path, $headers + ($json === '' ? [] : ['Content-Type' => 'application/json']), $json);

        return $this->kernel->handle($json === '' ? $request : $request->withBody(Stream::create($json)));
    }

    /** @return array<string, mixed> */
    private function error(ResponseInterface $response): array
    {
        $body = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($body);

        return $body['error'];
    }

    /** @return array<string, mixed> */
    private static function validRegistration(): array
    {
        return [
            'nome' => 'Ana Souza', 'email' => 'ana@exemplo.invalid', 'senha' => 'uma-senha-bem-longa-9',
            'aceita_termos' => true, 'versao_termos' => '2026-10', 'versao_privacidade' => '2026-10', 'maior_de_18' => true,
        ];
    }

    public function testProtectedRoutesRequireAuthentication(): void
    {
        foreach ([['GET', '/me'], ['POST', '/auth/logout'], ['POST', '/auth/logout-all']] as [$method, $path]) {
            $response = $this->call($method, $path);
            self::assertSame(401, $response->getStatusCode(), "$method $path deveria exigir autenticação");
            self::assertSame('UNAUTHENTICATED', $this->error($response)['code']);
        }
    }

    /** @return array<string, array{string}> */
    public static function badAuthorizationHeaders(): array
    {
        return [
            'sem esquema' => ['abc.def.ghi'],
            'esquema errado' => ['Basic YTpi'],
            'token lixo' => ['Bearer isto-nao-e-jwt'],
            'caracteres inválidos' => ['Bearer abc def'],
            'vazio' => ['Bearer '],
        ];
    }

    #[DataProvider('badAuthorizationHeaders')]
    public function testMalformedAuthorizationIsRejected(string $header): void
    {
        $response = $this->call('GET', '/me', null, ['Authorization' => $header]);

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('UNAUTHENTICATED', $this->error($response)['code']);
    }

    public function testEmptyRegistrationListsEveryRequiredField(): void
    {
        $response = $this->call('POST', '/auth/register', []);
        $error = $this->error($response);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame('VALIDATION_ERROR', $error['code']);
        foreach (['nome', 'email', 'senha', 'aceita_termos', 'maior_de_18', 'versao_termos', 'versao_privacidade'] as $field) {
            self::assertArrayHasKey($field, $error['details']['fields'], "faltou erro para $field");
        }
    }

    public function testUnderageDeclarationIsRefusedWithoutValidatingAnythingElse(): void
    {
        $response = $this->call('POST', '/auth/register', ['maior_de_18' => false]);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame('UNDERAGE_NOT_ALLOWED', $this->error($response)['code']);
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function invalidRegistrations(): array
    {
        $ok = self::validRegistration();

        return [
            'campo desconhecido' => [$ok + ['admin' => true], 'admin'],
            'e-mail inválido' => [['email' => 'sem-arroba'] + $ok, 'email'],
            'senha curta' => [['senha' => 'curta123'] + $ok, 'senha'],
            'senha igual ao e-mail' => [['senha' => 'ana@exemplo.invalid', 'email' => 'ana@exemplo.invalid'] + $ok, 'senha'],
            'termos não aceitos' => [['aceita_termos' => false] + $ok, 'aceita_termos'],
            'termos como texto' => [['aceita_termos' => 'true'] + $ok, 'aceita_termos'],
            'maior_de_18 como texto' => [['maior_de_18' => 'sim'] + $ok, 'maior_de_18'],
            'nome em branco' => [['nome' => '   '] + $ok, 'nome'],
            'nome longo' => [['nome' => str_repeat('a', 161)] + $ok, 'nome'],
            'dispositivo inválido' => [['dispositivo_uuid' => '123'] + $ok, 'dispositivo_uuid'],
            'versão como número' => [['versao_termos' => 5] + $ok, 'versao_termos'],
        ];
    }

    /** @param array<string, mixed> $body */
    #[DataProvider('invalidRegistrations')]
    public function testInvalidRegistrationsAreRejectedPerField(array $body, string $field): void
    {
        $response = $this->call('POST', '/auth/register', $body);
        $error = $this->error($response);

        self::assertSame(422, $response->getStatusCode());
        self::assertArrayHasKey($field, $error['details']['fields']);
    }

    public function testLoginAndRefreshValidateInputBeforeTouchingTheDatabase(): void
    {
        $login = $this->call('POST', '/auth/login', ['email' => 'x']);
        self::assertSame(422, $login->getStatusCode());
        self::assertArrayHasKey('email', $this->error($login)['details']['fields']);
        self::assertArrayHasKey('senha', $this->error($login)['details']['fields']);

        $refresh = $this->call('POST', '/auth/refresh', ['refresh_token' => 'curto']);
        self::assertSame(422, $refresh->getStatusCode());
        self::assertArrayHasKey('refresh_token', $this->error($refresh)['details']['fields']);
    }

    public function testPasswordNeverReachesTheLogs(): void
    {
        $this->call('POST', '/auth/register', ['senha' => 'senha-super-secreta-777', 'email' => 'x'] + self::validRegistration());
        $this->call('POST', '/auth/login', ['email' => 'ana@exemplo.invalid', 'senha' => 'senha-super-secreta-777', 'extra' => 1]);

        $everything = json_encode(array_map(static fn ($r) => [$r->message, $r->context, $r->extra], $this->logs->getRecords()), JSON_THROW_ON_ERROR);
        self::assertStringNotContainsString('senha-super-secreta-777', $everything);
    }

    public function testMissingJwtSecretIsAServerErrorNotAnOpenDoor(): void
    {
        $kernel = new Kernel(Config::fromArray([]), new Logger('t', [new TestHandler()]));
        $response = $kernel->handle(new ServerRequest('GET', '/me', ['Authorization' => 'Bearer abc.def.ghi']));

        self::assertSame(500, $response->getStatusCode());
        self::assertSame('INTERNAL_ERROR', $this->error($response)['code']);
    }
}
