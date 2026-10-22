<?php

declare(strict_types=1);

namespace CapiFit;

use CapiFit\Auth\Authenticator;
use CapiFit\Auth\PasswordHasher;
use CapiFit\Auth\TokenService;
use CapiFit\Controllers\AuthController;
use CapiFit\Controllers\HealthController;
use CapiFit\Controllers\MeController;
use CapiFit\Http\Middleware\AccessLogMiddleware;
use CapiFit\Http\Middleware\CorsMiddleware;
use CapiFit\Http\Middleware\ErrorHandlerMiddleware;
use CapiFit\Http\Middleware\JsonBodyMiddleware;
use CapiFit\Http\Middleware\RequestIdMiddleware;
use CapiFit\Http\Pipeline;
use CapiFit\Http\Router;
use CapiFit\Http\Routes;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Services\AuthService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;

/**
 * Composição da aplicação. Ordem dos middlewares (Doc 05 §14):
 * request-id → log de acesso → CORS → tratamento de erros → corpo JSON → roteador (que autentica as rotas não públicas).
 * Limitação de taxa (E01-05) entra antes do roteador na próxima história de autenticação.
 *
 * Serviços são criados sob demanda: rotas públicas simples (/health) não exigem banco nem segredo JWT.
 */
final class Kernel
{
    public readonly Connection $db;
    private ?TokenService $tokens = null;
    private ?AuthService $authService = null;

    public function __construct(private readonly Config $config, private readonly LoggerInterface $logger)
    {
        $this->db = new Connection($config);
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $routes = (new Routes())
            ->public('GET', '/health', new HealthController())
            ->public('POST', '/auth/register', fn (ServerRequestInterface $r): ResponseInterface => $this->authController()->register($r))
            ->public('POST', '/auth/login', fn (ServerRequestInterface $r): ResponseInterface => $this->authController()->login($r))
            ->public('POST', '/auth/refresh', fn (ServerRequestInterface $r): ResponseInterface => $this->authController()->refresh($r))
            ->add('POST', '/auth/logout', fn (ServerRequestInterface $r): ResponseInterface => $this->authController()->logout($r))
            ->add('POST', '/auth/logout-all', fn (ServerRequestInterface $r): ResponseInterface => $this->authController()->logoutAll($r))
            ->add('GET', '/me', fn (ServerRequestInterface $r): ResponseInterface => (new MeController($this->db))->show($r));

        return (new Pipeline([
            new RequestIdMiddleware(),
            new AccessLogMiddleware($this->logger),
            new CorsMiddleware($this->config->corsOrigins),
            new ErrorHandlerMiddleware($this->logger),
            new JsonBodyMiddleware($this->config->maxBodyBytes),
        ], new Router($routes, fn (): Authenticator => new Authenticator($this->tokens(), $this->db))))->handle($request);
    }

    private function tokens(): TokenService
    {
        return $this->tokens ??= new TokenService($this->config);
    }

    private function authController(): AuthController
    {
        $this->authService ??= new AuthService($this->db, $this->config, $this->tokens(), new PasswordHasher(), $this->logger);

        return new AuthController($this->authService);
    }
}
