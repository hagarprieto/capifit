<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiResponse;
use CapiFit\Services\SyncService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** `POST /sync/push` (tag Sync). Sempre 200 quando o lote é válido; cada operação traz o próprio resultado. */
final class SyncController
{
    public function __construct(private readonly SyncService $sync)
    {
    }

    public function push(ServerRequestInterface $request): ResponseInterface
    {
        $user = $request->getAttribute('auth');
        if (!$user instanceof AuthenticatedUser) {
            throw new \LogicException('Rota protegida chamada sem usuário autenticado.');
        }
        $json = $request->getAttribute('json');

        return ApiResponse::data($request, $this->sync->push($user, is_array($json) ? $json : []));
    }
}
