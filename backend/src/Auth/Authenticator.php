<?php

declare(strict_types=1);

namespace CapiFit\Auth;

use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Autentica a requisição: JWT válido + sessão não revogada + conta ativa, tudo reconferido no banco.
 * Qualquer falha devolve o mesmo 401 genérico (sem dizer o motivo).
 */
final class Authenticator
{
    public function __construct(private readonly TokenService $tokens, private readonly Connection $db)
    {
    }

    public function authenticate(ServerRequestInterface $request): AuthenticatedUser
    {
        $header = $request->getHeaderLine('Authorization');
        if (preg_match('/^Bearer ([A-Za-z0-9._-]+)$/', $header, $m) !== 1) {
            throw new ApiException(ErrorCode::Unauthenticated);
        }
        $claims = $this->tokens->verifyAccessToken($m[1]);
        if ($claims === null) {
            throw new ApiException(ErrorCode::Unauthenticated);
        }

        $row = $this->db->fetchOne(
            'SELECT u.id, u.uuid, u.nome, u.estado, s.familia_uuid
               FROM sessoes_autenticacao s
               JOIN usuarios u ON u.id = s.usuario_id
              WHERE s.uuid = ? AND u.uuid = ? AND s.revogado_em IS NULL',
            'ss',
            $claims['sid'],
            $claims['sub'],
        );
        if ($row === null || $row['estado'] !== 'ativo') {
            throw new ApiException(ErrorCode::Unauthenticated);
        }

        $roles = array_map(
            static fn (array $r): string => (string) $r['codigo'],
            $this->db->fetchAll(
                'SELECT p.codigo FROM usuarios_papeis up JOIN papeis p ON p.id = up.papel_id WHERE up.usuario_id = ? ORDER BY p.id',
                'i',
                $row['id'],
            ),
        );

        return new AuthenticatedUser((int) $row['id'], (string) $row['uuid'], (string) $row['nome'], $roles, $claims['sid'], (string) $row['familia_uuid']);
    }
}
