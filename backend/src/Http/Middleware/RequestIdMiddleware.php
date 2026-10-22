<?php

declare(strict_types=1);

namespace CapiFit\Http\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/** Garante um identificador de requisição para logs, erros e respostas (Doc 05 §14). */
final class RequestIdMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $incoming = $request->getHeaderLine('X-Request-Id');
        $id = preg_match('/^[A-Za-z0-9_-]{8,64}$/', $incoming) === 1
            ? $incoming
            : 'req_' . bin2hex(random_bytes(13));

        return $handler->handle($request->withAttribute('request_id', $id))
            ->withHeader('X-Request-Id', $id);
    }
}
