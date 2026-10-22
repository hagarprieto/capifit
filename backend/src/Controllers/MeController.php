<?php

declare(strict_types=1);

namespace CapiFit\Controllers;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiException;
use CapiFit\Http\ApiResponse;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** GET /me — perfil mínimo e papéis do usuário autenticado. */
final class MeController
{
    public function __construct(private readonly Connection $db)
    {
    }

    public function show(ServerRequestInterface $request): ResponseInterface
    {
        $user = $request->getAttribute('auth');
        if (!$user instanceof AuthenticatedUser) {
            throw new \LogicException('Rota protegida chamada sem usuário autenticado.');
        }

        $row = $this->db->fetchOne(
            'SELECT uuid, nome, email, fuso_horario, unidade_peso, idioma, email_verificado_em FROM usuarios WHERE id = ?',
            'i',
            $user->id,
        );
        if ($row === null) {
            throw new ApiException(ErrorCode::Unauthenticated);
        }

        return ApiResponse::data($request, [
            'id' => $row['uuid'],
            'nome' => $row['nome'],
            'email' => $row['email'],
            'papeis' => $user->roles,
            'fuso_horario' => $row['fuso_horario'],
            'unidade_peso' => $row['unidade_peso'],
            'idioma' => $row['idioma'],
            'email_verificado' => $row['email_verificado_em'] !== null,
        ]);
    }
}
