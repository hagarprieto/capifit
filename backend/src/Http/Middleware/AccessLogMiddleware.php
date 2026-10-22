<?php

declare(strict_types=1);

namespace CapiFit\Http\Middleware;

use CapiFit\Http\RequestContext;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Psr\Log\LoggerInterface;

/**
 * Uma linha de log por requisição: base das métricas (contagem, latência, taxa de erro) — Doc 12 §3.
 *
 * Privacidade: registra o PADRÃO da rota (/me/sessoes/{uuid}), nunca o caminho real, a query string,
 * cabeçalhos, corpo, IP ou usuário. Isso evita dado pessoal em log e mantém a cardinalidade baixa.
 */
final class AccessLogMiddleware implements MiddlewareInterface
{
    public const UNMATCHED = 'unmatched';

    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);

        $context = $request->getAttribute('context');
        if ($context instanceof RequestContext) {
            $status = $response->getStatusCode();
            $this->logger->log(
                $status >= 500 ? 'warning' : 'info',
                'request',
                [
                    'request_id' => $context->requestId,
                    'method' => $request->getMethod(),
                    'route' => $context->routePattern ?? self::UNMATCHED,
                    'status' => $status,
                    'duration_ms' => $context->elapsedMs(),
                    'response_bytes' => $response->getBody()->getSize(),
                ],
            );
        }

        return $response;
    }
}
