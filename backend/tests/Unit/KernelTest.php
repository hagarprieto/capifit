<?php

declare(strict_types=1);

namespace CapiFit\Tests\Unit;

use CapiFit\Config;
use CapiFit\Kernel;
use Monolog\Handler\TestHandler;
use Monolog\Logger;
use Nyholm\Psr7\ServerRequest;
use Nyholm\Psr7\Stream;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;

final class KernelTest extends TestCase
{
    private TestHandler $logs;

    protected function setUp(): void
    {
        $this->logs = new TestHandler();
    }

    /** @param array<string, string> $env */
    private function kernel(array $env = []): Kernel
    {
        return new Kernel(Config::fromArray($env + ['CORS_ORIGINS' => 'https://painel.exemplo.invalid']), new Logger('t', [$this->logs]));
    }

    /** @return array<string, mixed> */
    private function body(ResponseInterface $response): array
    {
        $decoded = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);

        return $decoded;
    }

    /** @param array<string, string> $headers */
    private function request(string $method, string $path, string $body = '', array $headers = []): ServerRequest
    {
        $request = new ServerRequest($method, $path, $headers, $body);

        return $body === '' ? $request : $request->withBody(Stream::create($body));
    }

    public function testHealthRespondsOkWithRequestId(): void
    {
        $response = $this->kernel()->handle($this->request('GET', '/health'));

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['status' => 'ok'], $this->body($response));
        self::assertMatchesRegularExpression('/^req_[0-9a-f]{26}$/', $response->getHeaderLine('X-Request-Id'));
        self::assertSame('application/json; charset=utf-8', $response->getHeaderLine('Content-Type'));
        self::assertSame('nosniff', $response->getHeaderLine('X-Content-Type-Options'));
    }

    public function testUnknownRouteReturnsErrorEnvelopeWithSameRequestId(): void
    {
        $response = $this->kernel()->handle($this->request('GET', '/nao-existe'));
        $body = $this->body($response);

        self::assertSame(404, $response->getStatusCode());
        self::assertSame('RESOURCE_NOT_FOUND', $body['error']['code']);
        self::assertSame($response->getHeaderLine('X-Request-Id'), $body['error']['request_id']);
        self::assertArrayNotHasKey('data', $body);
    }

    public function testMethodNotAllowedIsReportedAsNotFound(): void
    {
        $response = $this->kernel()->handle($this->request('DELETE', '/health'));

        self::assertSame(404, $response->getStatusCode());
        self::assertSame('RESOURCE_NOT_FOUND', $this->body($response)['error']['code']);
    }

    public function testValidIncomingRequestIdIsKeptAndInvalidIsReplaced(): void
    {
        $kept = $this->kernel()->handle($this->request('GET', '/health', '', ['X-Request-Id' => 'abc-12345678']));
        self::assertSame('abc-12345678', $kept->getHeaderLine('X-Request-Id'));

        $replaced = $this->kernel()->handle($this->request('GET', '/health', '', ['X-Request-Id' => 'curto']));
        self::assertStringStartsWith('req_', $replaced->getHeaderLine('X-Request-Id'));
    }

    public function testMalformedJsonIsRejectedBeforeRouting(): void
    {
        $response = $this->kernel()->handle($this->request('POST', '/health', '{"a":', ['Content-Type' => 'application/json']));
        $body = $this->body($response);

        self::assertSame(400, $response->getStatusCode());
        self::assertSame('INVALID_JSON', $body['error']['code']);
        self::assertSame('MALFORMED_JSON', $body['error']['details']['reason']);
    }

    public function testJsonScalarIsRejected(): void
    {
        $response = $this->kernel()->handle($this->request('POST', '/health', '"texto"', ['Content-Type' => 'application/json']));

        self::assertSame(400, $response->getStatusCode());
        self::assertSame('NOT_AN_OBJECT', $this->body($response)['error']['details']['reason']);
    }

    public function testNonJsonContentTypeIsRejected(): void
    {
        $response = $this->kernel()->handle($this->request('POST', '/health', 'a=1', ['Content-Type' => 'application/x-www-form-urlencoded']));

        self::assertSame(400, $response->getStatusCode());
        self::assertSame('UNSUPPORTED_CONTENT_TYPE', $this->body($response)['error']['details']['reason']);
    }

    public function testOversizedBodyIsRejected(): void
    {
        $response = $this->kernel(['MAX_BODY_BYTES' => '1024'])
            ->handle($this->request('POST', '/health', json_encode(['x' => str_repeat('a', 2000)], JSON_THROW_ON_ERROR), ['Content-Type' => 'application/json']));
        $body = $this->body($response);

        self::assertSame(400, $response->getStatusCode());
        self::assertSame('BODY_TOO_LARGE', $body['error']['details']['reason']);
        self::assertSame(1024, $body['error']['details']['max_bytes']);
    }

    public function testCorsHeadersOnlyForAllowedOrigins(): void
    {
        $allowed = $this->kernel()->handle($this->request('GET', '/health', '', ['Origin' => 'https://painel.exemplo.invalid']));
        self::assertSame('https://painel.exemplo.invalid', $allowed->getHeaderLine('Access-Control-Allow-Origin'));
        self::assertSame('Origin', $allowed->getHeaderLine('Vary'));

        $denied = $this->kernel()->handle($this->request('GET', '/health', '', ['Origin' => 'https://outro.exemplo.invalid']));
        self::assertFalse($denied->hasHeader('Access-Control-Allow-Origin'));
    }

    public function testCorsPreflight(): void
    {
        $headers = ['Origin' => 'https://painel.exemplo.invalid', 'Access-Control-Request-Method' => 'POST'];
        $response = $this->kernel()->handle($this->request('OPTIONS', '/qualquer', '', $headers));

        self::assertSame(204, $response->getStatusCode());
        self::assertStringContainsString('Idempotency-Key', $response->getHeaderLine('Access-Control-Allow-Headers'));
        self::assertStringNotContainsString('*', $response->getHeaderLine('Access-Control-Allow-Origin'));

        $denied = $this->kernel()->handle($this->request('OPTIONS', '/qualquer', '', ['Origin' => 'https://x.invalid', 'Access-Control-Request-Method' => 'POST']));
        self::assertSame(204, $denied->getStatusCode());
        self::assertFalse($denied->hasHeader('Access-Control-Allow-Origin'));
    }
}
