<?php

declare(strict_types=1);

namespace CapiFit\Http\Middleware;

use Nyholm\Psr7\Factory\Psr17Factory;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * CORS por origem explícita (sem curinga). CORS não substitui autenticação (Doc 05 §12.5).
 * O app móvel não usa CORS; a lista serve ao painel web.
 */
final class CorsMiddleware implements MiddlewareInterface
{
    /** @param list<string> $allowedOrigins */
    public function __construct(private readonly array $allowedOrigins)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $origin = $request->getHeaderLine('Origin');
        $allowed = $origin !== '' && in_array($origin, $this->allowedOrigins, true);

        if ($request->getMethod() === 'OPTIONS' && $request->hasHeader('Access-Control-Request-Method')) {
            $response = (new Psr17Factory())->createResponse(204)->withHeader('Cache-Control', 'no-store');

            return $allowed ? $this->withCors($response, $origin, true) : $response;
        }

        $response = $handler->handle($request);

        return $allowed ? $this->withCors($response, $origin, false) : $response;
    }

    private function withCors(ResponseInterface $response, string $origin, bool $preflight): ResponseInterface
    {
        $response = $response
            ->withHeader('Access-Control-Allow-Origin', $origin)
            ->withHeader('Vary', 'Origin')
            ->withHeader('Access-Control-Expose-Headers', 'X-Request-Id, Retry-After');
        if ($preflight) {
            $response = $response
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                ->withHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Request-Id')
                ->withHeader('Access-Control-Max-Age', '600');
        }

        return $response;
    }
}
