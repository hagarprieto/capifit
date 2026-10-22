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
 * Registra o padrão da rota casada no contexto da requisição, para o log de acesso.
 */
final class Router implements RequestHandlerInterface
{
    private readonly Dispatcher $dispatcher;

    public function __construct(Routes $routes)
    {
        $this->dispatcher = simpleDispatcher(static function (RouteCollector $collector) use ($routes): void {
            foreach ($routes->all() as [$method, $pattern, $handler]) {
                $collector->addRoute($method, $pattern, [$pattern, $handler]);
            }
        });
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $path = rawurldecode($request->getUri()->getPath());
        $result = $this->dispatcher->dispatch($request->getMethod(), $path === '' ? '/' : $path);

        if ($result[0] !== Dispatcher::FOUND) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        /** @var array{string, callable(ServerRequestInterface): ResponseInterface} $target */
        $target = $result[1];
        [$pattern, $handler] = $target;

        $context = $request->getAttribute('context');
        if ($context instanceof RequestContext) {
            $context->routePattern = $pattern;
        }

        return $handler($request->withAttribute('route_params', $result[2]));
    }
}
