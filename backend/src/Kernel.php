<?php

declare(strict_types=1);

namespace CapiFit;

use CapiFit\Auth\Authenticator;
use CapiFit\Auth\PasswordHasher;
use CapiFit\Auth\TokenService;
use CapiFit\Controllers\AuthController;
use CapiFit\Controllers\CatalogController;
use CapiFit\Controllers\HealthController;
use CapiFit\Controllers\MeController;
use CapiFit\Controllers\SessionController;
use CapiFit\Http\Middleware\AccessLogMiddleware;
use CapiFit\Http\Middleware\CorsMiddleware;
use CapiFit\Http\Middleware\ErrorHandlerMiddleware;
use CapiFit\Http\Middleware\JsonBodyMiddleware;
use CapiFit\Http\Middleware\RequestIdMiddleware;
use CapiFit\Http\Pipeline;
use CapiFit\Http\Router;
use CapiFit\Http\Routes;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Repositories\CatalogRepository;
use CapiFit\Repositories\SessionRepository;
use CapiFit\Services\AuthService;
use CapiFit\Services\IdempotencyService;
use CapiFit\Services\SessionService;
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
            ->add('GET', '/me', fn (ServerRequestInterface $r): ResponseInterface => (new MeController($this->db))->show($r))
            ->add('GET', '/exercicios', fn (ServerRequestInterface $r): ResponseInterface => $this->catalogController()->list($r))
            ->add('GET', '/exercicios/{uuid}', fn (ServerRequestInterface $r): ResponseInterface => $this->catalogController()->show($r))
            ->add('GET', '/exercicios/{uuid}/alternativas', fn (ServerRequestInterface $r): ResponseInterface => $this->catalogController()->alternatives($r))
            ->add('GET', '/exercicios/{uuid}/midias', fn (ServerRequestInterface $r): ResponseInterface => $this->catalogController()->mediaList($r))
            ->add('GET', '/grupos-musculares', fn (ServerRequestInterface $r): ResponseInterface => $this->catalogController()->muscleGroups($r))
            ->add('GET', '/equipamentos', fn (ServerRequestInterface $r): ResponseInterface => $this->catalogController()->equipmentList($r))
            ->add('POST', '/me/sessoes', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->create($r))
            ->add('GET', '/me/sessoes', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->list($r))
            ->add('GET', '/me/sessoes/{uuid}', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->show($r))
            ->add('PATCH', '/me/sessoes/{uuid}', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->update($r))
            ->add('PATCH', '/me/sessoes/{uuid}/series/{serie_uuid}', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->updateSeries($r))
            ->add('POST', '/me/sessoes/{uuid}/series', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->addSeries($r))
            ->add('POST', '/me/sessoes/{uuid}/exercicios', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->addExercise($r))
            ->add('POST', '/me/sessoes/{uuid}/concluir', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->complete($r))
            ->add('POST', '/me/sessoes/{uuid}/cancelar', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->cancel($r))
            ->add('POST', '/me/sessoes/{uuid}/exercicios/{ex_uuid}/substituir', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->replaceExercise($r))
            ->add('POST', '/me/sessoes/{uuid}/pausar', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->pause($r))
            ->add('POST', '/me/sessoes/{uuid}/retomar', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->resume($r));

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

    private function sessionController(): SessionController
    {
        $sessions = new SessionService(new SessionRepository($this->db), new CatalogRepository($this->db));

        return new SessionController($sessions, new IdempotencyService($this->db), $this->db);
    }

    private function catalogController(): CatalogController
    {
        return new CatalogController(new CatalogRepository($this->db), $this->config);
    }

    private function authController(): AuthController
    {
        $this->authService ??= new AuthService($this->db, $this->config, $this->tokens(), new PasswordHasher(), $this->logger);

        return new AuthController($this->authService);
    }
}
