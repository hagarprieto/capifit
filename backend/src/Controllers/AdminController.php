<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiResponse;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Services\AdminExerciseService;
use CapiFit\Services\AuditService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Rotas /admin (tag Admin): exercícios e auditoria. Toda escrita roda em transação, junto do registro de auditoria. */
final class AdminController
{
    public function __construct(
        private readonly AdminExerciseService $exercises,
        private readonly AuditService $audit,
        private readonly Connection $db,
    ) {
    }

    public function createExercise(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->exercises->create($user, $this->body($request))), 201);
    }

    public function updateExercise(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->exercises->update($user, $this->param($request), $this->body($request))));
    }

    public function submitExercise(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->exercises->submitForReview($user, $this->param($request))));
    }

    public function reviewExercise(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->exercises->review($user, $this->param($request), $this->body($request))));
    }

    public function publishExercise(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->exercises->publish($user, $this->param($request))));
    }

    public function audit(ServerRequestInterface $request): ResponseInterface
    {
        $result = $this->audit->search($this->user($request), $request->getQueryParams());

        return ApiResponse::list($request, $result['items'], $result['limit'], $result['next']);
    }

    /** @return array<string, mixed> */
    private function body(ServerRequestInterface $request): array
    {
        $json = $request->getAttribute('json');

        return is_array($json) ? $json : [];
    }

    private function param(ServerRequestInterface $request): string
    {
        $params = $request->getAttribute('route_params');

        return is_array($params) && is_string($params['uuid'] ?? null) ? $params['uuid'] : '';
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
