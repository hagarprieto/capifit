<?php

declare(strict_types=1);

namespace CapiFit;

use CapiFit\Auth\Authenticator;
use CapiFit\Auth\PasswordHasher;
use CapiFit\Auth\TokenService;
use CapiFit\Controllers\AccountDataController;
use CapiFit\Controllers\AdminController;
use CapiFit\Controllers\AuthController;
use CapiFit\Controllers\CatalogController;
use CapiFit\Controllers\HealthController;
use CapiFit\Controllers\ProfileController;
use CapiFit\Controllers\ProgramController;
use CapiFit\Controllers\SessionController;
use CapiFit\Controllers\SyncController;
use CapiFit\Http\Middleware\AccessLogMiddleware;
use CapiFit\Http\Middleware\CorsMiddleware;
use CapiFit\Http\Middleware\ErrorHandlerMiddleware;
use CapiFit\Http\Middleware\JsonBodyMiddleware;
use CapiFit\Http\Middleware\RequestIdMiddleware;
use CapiFit\Http\Pipeline;
use CapiFit\Http\Router;
use CapiFit\Http\Routes;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Mail\FileMailer;
use CapiFit\Mail\Mailer;
use CapiFit\Mail\NullMailer;
use CapiFit\Repositories\CatalogRepository;
use CapiFit\Repositories\ProgramRepository;
use CapiFit\Repositories\SessionRepository;
use CapiFit\Repositories\StructureRepository;
use CapiFit\Services\AccountTokens;
use CapiFit\Services\AdminExerciseService;
use CapiFit\Services\AdminMediaService;
use CapiFit\Services\AuditService;
use CapiFit\Services\AuthService;
use CapiFit\Services\ConsentService;
use CapiFit\Services\DeviceService;
use CapiFit\Services\IdempotencyService;
use CapiFit\Services\ProfileService;
use CapiFit\Services\ProgramService;
use CapiFit\Services\ProgressService;
use CapiFit\Services\RateLimiter;
use CapiFit\Services\SessionService;
use CapiFit\Services\SyncService;
use CapiFit\Validation\StructureValidator;
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

    public function __construct(private readonly Config $config, private readonly LoggerInterface $logger, private ?Mailer $mailer = null)
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
            ->public('POST', '/auth/password/forgot', fn (ServerRequestInterface $r): ResponseInterface => $this->authController()->forgotPassword($r))
            ->public('POST', '/auth/password/reset', fn (ServerRequestInterface $r): ResponseInterface => $this->authController()->resetPassword($r))
            ->public('POST', '/auth/email/verify', fn (ServerRequestInterface $r): ResponseInterface => $this->authController()->verifyEmail($r))
            ->add('POST', '/auth/logout', fn (ServerRequestInterface $r): ResponseInterface => $this->authController()->logout($r))
            ->add('POST', '/auth/logout-all', fn (ServerRequestInterface $r): ResponseInterface => $this->authController()->logoutAll($r))
            ->add('GET', '/me', fn (ServerRequestInterface $r): ResponseInterface => $this->profileController()->me($r))
            ->add('PATCH', '/me', fn (ServerRequestInterface $r): ResponseInterface => $this->profileController()->updateMe($r))
            ->add('GET', '/me/perfil-treinamento', fn (ServerRequestInterface $r): ResponseInterface => $this->profileController()->trainingProfile($r))
            ->add('PUT', '/me/perfil-treinamento', fn (ServerRequestInterface $r): ResponseInterface => $this->profileController()->replaceTrainingProfile($r))
            ->add('GET', '/me/exercicios/ultimos-registros', fn (ServerRequestInterface $r): ResponseInterface => $this->profileController()->lastRecords($r))
            ->add('GET', '/me/exercicios/{uuid}/ultimo-registro', fn (ServerRequestInterface $r): ResponseInterface => $this->profileController()->lastRecord($r))
            ->add('GET', '/me/progresso/resumo', fn (ServerRequestInterface $r): ResponseInterface => $this->profileController()->summary($r))
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
            ->add('POST', '/me/sessoes/{uuid}/retomar', fn (ServerRequestInterface $r): ResponseInterface => $this->sessionController()->resume($r))
            ->add('POST', '/sync/push', fn (ServerRequestInterface $r): ResponseInterface => $this->syncController()->push($r))
            ->add('POST', '/admin/exercicios', fn (ServerRequestInterface $r): ResponseInterface => $this->adminController()->createExercise($r))
            ->add('PATCH', '/admin/exercicios/{uuid}', fn (ServerRequestInterface $r): ResponseInterface => $this->adminController()->updateExercise($r))
            ->add('POST', '/admin/exercicios/{uuid}/enviar-revisao', fn (ServerRequestInterface $r): ResponseInterface => $this->adminController()->submitExercise($r))
            ->add('POST', '/admin/exercicios/{uuid}/revisar', fn (ServerRequestInterface $r): ResponseInterface => $this->adminController()->reviewExercise($r))
            ->add('POST', '/admin/exercicios/{uuid}/publicar', fn (ServerRequestInterface $r): ResponseInterface => $this->adminController()->publishExercise($r))
            ->add('POST', '/admin/exercicios/{uuid}/midias', fn (ServerRequestInterface $r): ResponseInterface => $this->adminController()->linkMedia($r))
            ->add('POST', '/admin/midias/{id}/aprovar', fn (ServerRequestInterface $r): ResponseInterface => $this->adminController()->approveMedia($r))
            ->add('GET', '/admin/auditoria', fn (ServerRequestInterface $r): ResponseInterface => $this->adminController()->audit($r))
            ->add('GET', '/me/consentimentos', fn (ServerRequestInterface $r): ResponseInterface => $this->accountDataController()->listConsents($r))
            ->add('POST', '/me/consentimentos', fn (ServerRequestInterface $r): ResponseInterface => $this->accountDataController()->grantConsent($r))
            ->add('POST', '/me/consentimentos/{id}/revogar', fn (ServerRequestInterface $r): ResponseInterface => $this->accountDataController()->revokeConsent($r))
            ->add('GET', '/me/dispositivos', fn (ServerRequestInterface $r): ResponseInterface => $this->accountDataController()->listDevices($r))
            ->add('POST', '/me/dispositivos', fn (ServerRequestInterface $r): ResponseInterface => $this->accountDataController()->registerDevice($r))
            ->add('DELETE', '/me/dispositivos/{uuid}', fn (ServerRequestInterface $r): ResponseInterface => $this->accountDataController()->revokeDevice($r))
            ->add('GET', '/me/programas', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->list($r))
            ->add('POST', '/me/programas', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->create($r))
            ->add('GET', '/me/programa-ativo', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->active($r))
            ->add('GET', '/programas/{uuid}', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->show($r))
            ->add('PATCH', '/programas/{uuid}', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->update($r))
            ->add('POST', '/programas/{uuid}/versoes', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->createVersion($r))
            ->add('GET', '/programas/{uuid}/versoes/{numero}', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->showVersion($r))
            ->add('PUT', '/programas/{uuid}/versoes/{numero}/estrutura', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->replaceStructure($r))
            ->add('POST', '/programas/{uuid}/versoes/{numero}/publicar', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->publish($r))
            ->add('POST', '/programas/{uuid}/ativar', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->activate($r))
            ->add('POST', '/programas/{uuid}/arquivar', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->archive($r))
            ->add('POST', '/programas/{uuid}/copiar', fn (ServerRequestInterface $r): ResponseInterface => $this->programController()->copy($r));

        return (new Pipeline([
            new RequestIdMiddleware(),
            new AccessLogMiddleware($this->logger),
            new CorsMiddleware($this->config->corsOrigins),
            new ErrorHandlerMiddleware($this->logger),
            new JsonBodyMiddleware($this->config->maxBodyBytes),
        ], new Router($routes, fn (): Authenticator => new Authenticator($this->tokens(), $this->db))))->handle($request);
    }

    /** Sem provedor de e-mail configurado: em desenvolvimento local grava arquivos; fora dele não envia (e avisa no log). */
    private function mailer(): Mailer
    {
        return $this->mailer ??= $this->config->env === 'local'
            ? new FileMailer(dirname(__DIR__) . '/storage/mail')
            : new NullMailer($this->logger);
    }

    private function tokens(): TokenService
    {
        return $this->tokens ??= new TokenService($this->config);
    }

    private function sessionService(): SessionService
    {
        return new SessionService(new SessionRepository($this->db), new CatalogRepository($this->db));
    }

    private function sessionController(): SessionController
    {
        return new SessionController($this->sessionService(), new IdempotencyService($this->db), $this->db);
    }

    private function syncController(): SyncController
    {
        return new SyncController(new SyncService($this->db, $this->sessionService()));
    }

    private function adminController(): AdminController
    {
        $audit = new AuditService($this->db);

        return new AdminController(new AdminExerciseService($this->db, new CatalogRepository($this->db), $audit), new AdminMediaService($this->db, $audit), $audit, $this->db);
    }

    private function accountDataController(): AccountDataController
    {
        return new AccountDataController(new ConsentService($this->db), new DeviceService($this->db), $this->db);
    }

    private function programController(): ProgramController
    {
        $programs = new ProgramService(
            new ProgramRepository($this->db),
            new StructureRepository($this->db),
            new StructureValidator($this->db),
            new CatalogRepository($this->db),
        );

        return new ProgramController($programs, new IdempotencyService($this->db), $this->db);
    }

    private function profileController(): ProfileController
    {
        return new ProfileController(new ProfileService($this->db), new ProgressService($this->db), $this->db);
    }

    private function catalogController(): CatalogController
    {
        return new CatalogController(new CatalogRepository($this->db), $this->config);
    }

    private function authController(): AuthController
    {
        $this->authService ??= new AuthService($this->db, $this->config, $this->tokens(), new PasswordHasher(), $this->logger, new AccountTokens($this->db, $this->tokens()), $this->mailer());

        return new AuthController($this->authService, new RateLimiter($this->db, $this->config));
    }
}
