<?php

declare(strict_types=1);

namespace CapiFit\Http\Middleware;

use CapiFit\Http\RequestContext;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/** Garante um identificador de requisição para logs, erros e respostas e cria o contexto da requisição (Doc 05 §14). */
final class RequestIdMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $started = hrtime(true);
        $incoming = $request->getHeaderLine('X-Request-Id');
        $id = preg_match('/^[A-Za-z0-9_-]{8,64}$/', $incoming) === 1
            ? $incoming
            : 'req_' . bin2hex(random_bytes(13));

        $request = $request
            ->withAttribute('request_id', $id)
            ->withAttribute('context', new RequestContext($id, $started));

        return $handler->handle($request)->withHeader('X-Request-Id', $id);
    }
}
