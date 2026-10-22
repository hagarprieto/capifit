<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiResponse;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Services\DataSubjectService;
use CapiFit\Services\RateLimiter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** `/me/solicitacoes` (tag Privacidade): pedidos de exportação e exclusão de dados do próprio titular. */
final class DataSubjectController
{
    public function __construct(
        private readonly DataSubjectService $requests,
        private readonly RateLimiter $limiter,
        private readonly Connection $db,
    ) {
    }

    public function list(ServerRequestInterface $request): ResponseInterface
    {
        return ApiResponse::data($request, $this->requests->list($this->user($request)));
    }

    public function show(ServerRequestInterface $request): ResponseInterface
    {
        $params = $request->getAttribute('route_params');

        return ApiResponse::data($request, $this->requests->get($this->user($request), is_array($params) && is_string($params['uuid'] ?? null) ? $params['uuid'] : ''));
    }

    public function create(ServerRequestInterface $request): ResponseInterface
    {
        $user = $this->user($request);
        // A senha é conferida aqui: limita as tentativas por IP e por conta (identificador = uuid do usuário).
        $this->limiter->enforce($request, 'titular', $user->uuid);
        $json = $request->getAttribute('json');
        $body = is_array($json) ? $json : [];

        return ApiResponse::data($request, $this->db->transaction(fn (): array => $this->requests->create($user, $body)), 201);
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
