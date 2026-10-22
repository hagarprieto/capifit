<?php

declare(strict_types=1);

namespace CapiFit\Tests\Unit;

use CapiFit\Config;
use CapiFit\Http\Middleware\AccessLogMiddleware;
use CapiFit\Http\RequestContext;
use CapiFit\Kernel;
use Monolog\Handler\TestHandler;
use Monolog\Level;
use Monolog\Logger;
use Nyholm\Psr7\Response;
use Nyholm\Psr7\ServerRequest;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class AccessLogTest extends TestCase
{
    private TestHandler $logs;
    private Kernel $kernel;

    protected function setUp(): void
    {
        $this->logs = new TestHandler();
        $this->kernel = new Kernel(Config::fromArray([]), new Logger('t', [$this->logs]));
    }

    /** @return array<string, mixed> */
    private function lastAccessLog(): array
    {
        foreach (array_reverse($this->logs->getRecords()) as $record) {
            if ($record->message === 'request') {
                return $record->context;
            }
        }
        self::fail('Nenhum log de acesso foi gravado.');
    }

    public function testLogsOneLinePerRequestWithRoutePatternStatusAndDuration(): void
    {
        $response = $this->kernel->handle(new ServerRequest('GET', '/health'));
        $log = $this->lastAccessLog();

        self::assertSame($response->getHeaderLine('X-Request-Id'), $log['request_id']);
        self::assertSame('GET', $log['method']);
        self::assertSame('/health', $log['route']);
        self::assertSame(200, $log['status']);
        self::assertIsFloat($log['duration_ms']);
        self::assertGreaterThanOrEqual(0.0, $log['duration_ms']);
        self::assertSame(15, $log['response_bytes']);
        self::assertCount(1, array_filter($this->logs->getRecords(), static fn ($r) => $r->message === 'request'));
    }

    public function testUnknownRouteIsGroupedAsUnmatchedWithoutTheRealPath(): void
    {
        $this->kernel->handle(new ServerRequest('GET', '/me/sessoes/9b2c1c9e-0000-4000-8000-000000000001/segredo'));
        $log = $this->lastAccessLog();

        self::assertSame(AccessLogMiddleware::UNMATCHED, $log['route']);
        self::assertSame(404, $log['status']);
        self::assertStringNotContainsString('9b2c1c9e', json_encode($log, JSON_THROW_ON_ERROR));
    }

    public function testNeverLogsQueryStringHeadersBodyOrClientAddress(): void
    {
        $request = new ServerRequest(
            'POST',
            '/health?token=abc123&email=ana@exemplo.invalid',
            ['Authorization' => 'Bearer SEGREDO', 'Content-Type' => 'application/json', 'X-Forwarded-For' => '203.0.113.9'],
            '{"senha":"hunter2"}',
            '1.1',
            ['REMOTE_ADDR' => '203.0.113.9'],
        );
        $this->kernel->handle($request);

        $everything = json_encode(array_map(static fn ($r) => [$r->message, $r->context, $r->extra], $this->logs->getRecords()), JSON_THROW_ON_ERROR);
        foreach (['abc123', 'ana@exemplo', 'SEGREDO', '203.0.113.9', 'hunter2', 'senha'] as $leak) {
            self::assertStringNotContainsString($leak, $everything, "O log de acesso vazou: $leak");
        }
        self::assertSame(['request_id', 'method', 'route', 'status', 'duration_ms', 'response_bytes'], array_keys($this->lastAccessLog()));
    }

    public function testSuccessfulRequestsAreLoggedAtInfoLevel(): void
    {
        $this->kernel->handle(new ServerRequest('GET', '/health'));

        self::assertTrue($this->logs->hasInfoRecords());
        self::assertFalse($this->logs->hasRecords(Level::Warning));
    }

    public function testServerErrorsAreLoggedAtWarningLevel(): void
    {
        $handler = new class () implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return new Response(503);
            }
        };
        $request = (new ServerRequest('GET', '/x'))->withAttribute('context', new RequestContext('req_teste12345', hrtime(true)));

        (new AccessLogMiddleware(new Logger('t', [$this->logs])))->process($request, $handler);

        self::assertTrue($this->logs->hasWarningRecords());
        self::assertSame(503, $this->lastAccessLog()['status']);
    }
}
