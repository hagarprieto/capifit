<?php

declare(strict_types=1);

namespace CapiFit;

use CapiFit\Controllers\HealthController;
use CapiFit\Http\Middleware\AccessLogMiddleware;
use CapiFit\Http\Middleware\CorsMiddleware;
use CapiFit\Http\Middleware\ErrorHandlerMiddleware;
use CapiFit\Http\Middleware\JsonBodyMiddleware;
use CapiFit\Http\Middleware\RequestIdMiddleware;
use CapiFit\Http\Pipeline;
use CapiFit\Http\Router;
use CapiFit\Http\Routes;
use CapiFit\Infrastructure\Database\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;

/**
 * Composição da aplicação. Ordem dos middlewares (Doc 05 §14):
 * request-id → log de acesso → CORS → tratamento de erros → corpo JSON → roteador.
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
        $routes = (new Routes())
            ->add('GET', '/health', new HealthController());

        return (new Pipeline([
            new RequestIdMiddleware(),
            new AccessLogMiddleware($this->logger),
            new CorsMiddleware($this->config->corsOrigins),
            new ErrorHandlerMiddleware($this->logger),
            new JsonBodyMiddleware($this->config->maxBodyBytes),
        ], new Router($routes)))->handle($request);
    }
}
