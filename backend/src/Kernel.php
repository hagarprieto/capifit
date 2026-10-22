<?php

declare(strict_types=1);

namespace CapiFit;

use CapiFit\Controllers\HealthController;
use CapiFit\Http\Middleware\CorsMiddleware;
use CapiFit\Http\Middleware\ErrorHandlerMiddleware;
use CapiFit\Http\Middleware\JsonBodyMiddleware;
use CapiFit\Http\Middleware\RequestIdMiddleware;
use CapiFit\Http\Pipeline;
use CapiFit\Http\Router;
use CapiFit\Infrastructure\Database\Connection;
use FastRoute\RouteCollector;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;

/**
 * Composição da aplicação. Ordem dos middlewares (Doc 05 §14):
 * request-id → CORS → tratamento de erros → corpo JSON → roteador.
 * Limitação de taxa (E01-05), autenticação (E01-02) e autorização entram antes do roteador nas próximas histórias.
 */
final class Kernel
{
    public readonly Connection $db;

    public function __construct(private readonly Config $config, private readonly LoggerInterface $logger)
    {
        $this->db = new Connection($config);
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $router = new Router(function (RouteCollector $r): void {
            $r->addRoute('GET', '/health', new HealthController());
        });

        return (new Pipeline([
            new RequestIdMiddleware(),
            new CorsMiddleware($this->config->corsOrigins),
            new ErrorHandlerMiddleware($this->logger),
            new JsonBodyMiddleware($this->config->maxBodyBytes),
        ], $router))->handle($request);
    }
}
