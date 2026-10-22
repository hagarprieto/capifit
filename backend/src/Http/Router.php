<?php

declare(strict_types=1);

namespace CapiFit\Http;

use FastRoute\Dispatcher;
use FastRoute\RouteCollector;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

use function FastRoute\simpleDispatcher;

/**
 * Roteador. Rota inexistente e método não permitido retornam o mesmo 404
 * RESOURCE_NOT_FOUND (o contrato não define 405; não revelamos a estrutura da API).
 */
final class Router implements RequestHandlerInterface
{
    private readonly Dispatcher $dispatcher;

    /** @param callable(RouteCollector): void $routes */
    public function __construct(callable $routes)
    {
        $this->dispatcher = simpleDispatcher($routes);
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $path = rawurldecode($request->getUri()->getPath());
        $result = $this->dispatcher->dispatch($request->getMethod(), $path === '' ? '/' : $path);

        if ($result[0] !== Dispatcher::FOUND) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        /** @var callable(ServerRequestInterface): ResponseInterface $handler */
        $handler = $result[1];

        return $handler($request->withAttribute('route_params', $result[2]));
    }
}
