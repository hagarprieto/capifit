<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiResponse;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Services\IdempotencyService;
use CapiFit\Services\ProgramService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Rotas de programas manuais (contrato: docs/07_openapi.yaml, tag Programas). Toda escrita roda em transação
 * (os `SELECT ... FOR UPDATE` do serviço só travam dentro de uma). Criar, nova versão, publicar e copiar
 * exigem `Idempotency-Key`; ativar e arquivar são naturalmente idempotentes.
 */
final class ProgramController
{
    public function __construct(
        private readonly ProgramService $programs,
        private readonly IdempotencyService $idempotency,
        private readonly Connection $db,
    ) {
    }

    public function create(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return $this->idempotent($user, $request, fn (): array => $this->programs->create($user, $this->body($request)));
    }

    public function list(ServerRequestInterface $request): ResponseInterface
    {
        $result = $this->programs->list($this->user($request), $request->getQueryParams());

        return ApiResponse::list($request, $result['items'], $result['limit'], $result['next']);
    }

    public function active(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->programs->activeProgram($this->user($request)));
    }

    public function show(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->programs->show($this->user($request), $this->param($request, 'uuid')));
    }

    public function update(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->programs->update($user, $this->param($request, 'uuid'), $this->body($request))));
    }

    public function createVersion(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return $this->idempotent($user, $request, fn (): array => $this->programs->createVersion($user, $this->param($request, 'uuid')));
    }

    public function showVersion(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->programs->showVersion($this->user($request), $this->param($request, 'uuid'), $this->param($request, 'numero')));
    }

    public function replaceStructure(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(
            fn (): array => $this->programs->replaceStructure($user, $this->param($request, 'uuid'), $this->param($request, 'numero'), $this->body($request)),
        ));
    }

    public function publish(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return $this->idempotent($user, $request, fn (): array => ['status' => 200, 'data' => $this->programs->publish($user, $this->param($request, 'uuid'), $this->param($request, 'numero'))]);
    }

    public function activate(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->programs->activate($user, $this->param($request, 'uuid'), $this->body($request))));
    }

    public function archive(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->programs->archive($user, $this->param($request, 'uuid'))));
    }

    public function copy(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return $this->idempotent($user, $request, fn (): array => $this->programs->copy($user, $this->param($request, 'uuid')));
    }

    /**
     * @param callable(): array{status: int, data: array<string, mixed>} $action
     */
    private function idempotent(AuthenticatedUser $user, ServerRequestInterface $request, callable $action): ResponseInterface
    {
        return $this->idempotency->run($user, $request, function () use ($action, $request): array {
            $result = $action();

            return ['status' => $result['status'], 'body' => ['data' => $result['data'], 'meta' => ApiResponse::meta($request)]];
        });
    }

    /** @return array<string, mixed> */
    private function body(ServerRequestInterface $request): array
    {
        $json = $request->getAttribute('json');

        return is_array($json) ? $json : [];
    }

    private function param(ServerRequestInterface $request, string $name): string
    {
        $params = $request->getAttribute('route_params');

        return is_array($params) && is_string($params[$name] ?? null) ? $params[$name] : '';
    }

    private function user(ServerRequestInterface $request): AuthenticatedUser
    {
        $user = $request->getAttribute('auth');
        if (!$user instanceof AuthenticatedUser) {
            throw new \LogicException('Rota protegida chamada sem usuário autenticado.');
        }

        return $user;
    }
}
