<?php

declare(strict_types=1);

namespace CapiFit\Tests\Unit;

use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Http\Middleware\ErrorHandlerMiddleware;
use CapiFit\Infrastructure\Logger\RedactingProcessor;
use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Nyholm\Psr7\Response;
use Nyholm\Psr7\ServerRequest;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class ErrorHandlerTest extends TestCase
{
    private function throwing(\Throwable $e): RequestHandlerInterface
    {
        return new class ($e) implements RequestHandlerInterface {
            public function __construct(private readonly \Throwable $e)
            {
            }

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                throw $this->e;
            }
        };
    }

    public function testUnexpectedErrorNeverLeaksInternalDetails(): void
    {
        $logs = new TestHandler();
        $logger = new Logger('t', [$logs]);
        $logger->pushProcessor(new RedactingProcessor());
        $secret = "SELECT * FROM usuarios WHERE senha='hunter2' -- /var/www/segredo.php";

        $response = (new ErrorHandlerMiddleware($logger))->process(
            (new ServerRequest('GET', '/x'))->withAttribute('request_id', 'req_teste12345'),
            $this->throwing(new \RuntimeException($secret)),
        );
        $raw = (string) $response->getBody();
        $body = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

        self::assertSame(500, $response->getStatusCode());
        self::assertSame('INTERNAL_ERROR', $body['error']['code']);
        self::assertSame('req_teste12345', $body['error']['request_id']);
        foreach (['SELECT', 'hunter2', 'usuarios', 'segredo', 'Stack', 'RuntimeException'] as $leak) {
            self::assertStringNotContainsString($leak, $raw);
        }

        // O log tem a classe da exceção e o request_id, mas não a mensagem (pode conter valores).
        self::assertTrue($logs->hasErrorRecords());
        $logged = json_encode($logs->getRecords()[0]->context, JSON_THROW_ON_ERROR);
        self::assertStringContainsString('req_teste12345', $logged);
        self::assertStringContainsString('RuntimeException', $logged);
        self::assertStringNotContainsString('hunter2', $logged);
    }

    public function testApiExceptionBecomesContractError(): void
    {
        $response = (new ErrorHandlerMiddleware(new Logger('t')))->process(
            new ServerRequest('GET', '/x'),
            $this->throwing(new ApiException(ErrorCode::RateLimited, null, [], ['Retry-After' => '30'])),
        );

        self::assertSame(429, $response->getStatusCode());
        self::assertSame('30', $response->getHeaderLine('Retry-After'));
    }

    public function testKnownDatabaseErrorIsTranslated(): void
    {
        $e = new \mysqli_sql_exception('SESSION_CLOSED: sessao encerrada', 1644);
        (new \ReflectionProperty(\mysqli_sql_exception::class, 'sqlstate'))->setValue($e, '45000');

        $response = (new ErrorHandlerMiddleware(new Logger('t')))->process(new ServerRequest('PATCH', '/x'), $this->throwing($e));

        self::assertSame(409, $response->getStatusCode());
        self::assertStringContainsString('SESSION_CLOSED', (string) $response->getBody());
        self::assertStringNotContainsString('sessao encerrada', (string) $response->getBody());
    }

    public function testUnknownDatabaseErrorIsInternal(): void
    {
        $logs = new TestHandler();
        $response = (new ErrorHandlerMiddleware(new Logger('t', [$logs])))->process(
            new ServerRequest('GET', '/x'),
            $this->throwing(new \mysqli_sql_exception("Duplicate entry 'ana@x' for key 'uq_usuarios_email'", 1062)),
        );

        self::assertSame(500, $response->getStatusCode());
        self::assertStringNotContainsString('ana@x', (string) $response->getBody());
        self::assertStringNotContainsString('ana@x', json_encode($logs->getRecords()[0]->context, JSON_THROW_ON_ERROR));
    }

    public function testSuccessPassesThrough(): void
    {
        $ok = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return new Response(204);
            }
        };

        self::assertSame(204, (new ErrorHandlerMiddleware(new Logger('t')))->process(new ServerRequest('GET', '/x'), $ok)->getStatusCode());
    }
}
