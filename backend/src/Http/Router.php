<?php

declare(strict_types=1);

namespace CapiFit\Http;

use CapiFit\Auth\Authenticator;
use FastRoute\Dispatcher;
use FastRoute\RouteCollector;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

use function FastRoute\simpleDispatcher;

/**
 * Roteador. Rota inexistente e método não permitido retornam o mesmo 404
 * RESOURCE_NOT_FOUND (o contrato não define 405; não revelamos a estrutura da API).
 * Registra o padrão da rota casada no contexto da requisição (log de acesso) e autentica
 * as rotas não públicas antes de chamar o controlador.
 */
final class Router implements RequestHandlerInterface
{
    private readonly Dispatcher $dispatcher;

    /** @param callable(): Authenticator $authenticator Fábrica preguiçosa: rotas públicas não precisam de banco nem de segredo JWT. */
    public function __construct(Routes $routes, private readonly mixed $authenticator)
    {
        $this->dispatcher = simpleDispatcher(static function (RouteCollector $collector) use ($routes): void {
            foreach ($routes->all() as [$method, $pattern, $handler, $public]) {
                $collector->addRoute($method, $pattern, [$pattern, $handler, $public]);
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

        /** @var array{string, callable(ServerRequestInterface): ResponseInterface, bool} $target */
        $target = $result[1];
        [$pattern, $handler, $public] = $target;

        $context = $request->getAttribute('context');
        if ($context instanceof RequestContext) {
            $context->routePattern = $pattern;
        }

        $request = $request->withAttribute('route_params', $result[2]);
        if (!$public) {
            /** @var callable(): Authenticator $factory */
            $factory = $this->authenticator;
            $request = $request->withAttribute('auth', $factory()->authenticate($request));
        }

        return $handler($request);
    }
}
