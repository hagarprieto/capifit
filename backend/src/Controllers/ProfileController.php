<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiResponse;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Services\ProfileService;
use CapiFit\Services\ProgressService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Conta, perfil de treino, último registro por exercício e resumo de evolução (tags Conta e Progresso). */
final class ProfileController
{
    public function __construct(
        private readonly ProfileService $profile,
        private readonly ProgressService $progress,
        private readonly Connection $db,
    ) {
    }

    public function me(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->profile->account($this->user($request)));
    }

    public function updateMe(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->profile->updateAccount($user, $this->body($request))));
    }

    public function trainingProfile(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->profile->trainingProfile($this->user($request)));
    }

    public function replaceTrainingProfile(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->profile->replaceTrainingProfile($user, $this->body($request))));
    }

    public function lastRecord(ServerRequestInterface $request): ResponseInterface
    {
        $params = $request->getAttribute('route_params');

        return ApiResponse::data($request, $this->progress->lastRecord($this->user($request), is_array($params) && is_string($params['uuid'] ?? null) ? $params['uuid'] : ''));
    }

    public function lastRecords(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->progress->lastRecords($this->user($request), $request->getQueryParams()));
    }

    public function summary(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->progress->summary($this->user($request), $request->getQueryParams()));
    }

    /** @return array<string, mixed> */
    private function body(ServerRequestInterface $request): array
    {
        $json = $request->getAttribute('json');

        return is_array($json) ? $json : [];
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
