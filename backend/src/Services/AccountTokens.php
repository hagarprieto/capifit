<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\TokenService;
use CapiFit\Infrastructure\Database\Connection;

/**
 * Tokens de uso único enviados por e-mail (`tokens_acao`): recuperação de senha e verificação de e-mail.
 * Só o SHA-256 do token é guardado. Um token novo do mesmo tipo invalida os anteriores ainda não usados.
 */
final class AccountTokens
{
    public const PASSWORD_RESET = 'recuperacao_senha';
    public const EMAIL_VERIFICATION = 'verificacao_email';

    public function __construct(private readonly Connection $db, private readonly TokenService $tokens)
    {
    }

    /** Cria um token (valor em claro devolvido uma única vez, para ir no e-mail). */
    public function issue(int $userId, string $type, int $ttlSeconds): string
    {
        $this->db->execute('UPDATE tokens_acao SET usado_em = NOW(6) WHERE usuario_id = ? AND tipo = ? AND usado_em IS NULL', 'is', $userId, $type);
        $token = $this->tokens->newOpaqueToken();
        $this->db->execute(
            'INSERT INTO tokens_acao(usuario_id, tipo, token_hash, expira_em) VALUES (?, ?, ?, DATE_ADD(NOW(6), INTERVAL ? SECOND))',
            'issi',
            $userId,
            $type,
            $this->tokens->hashOpaqueToken($token),
            $ttlSeconds,
        );

        return $token;
    }

    /** Consome o token (uso único). Devolve o id do usuário, ou null se inexistente, de outro tipo, usado ou expirado. */
    public function consume(string $token, string $type): ?int
    {
        $row = $this->db->fetchOne(
            'SELECT id, usuario_id FROM tokens_acao WHERE token_hash = ? AND tipo = ? AND usado_em IS NULL AND expira_em > NOW(6) FOR UPDATE',
            'ss',
            $this->tokens->hashOpaqueToken($token),
            $type,
        );
        if ($row === null) {
            return null;
        }
        $this->db->execute('UPDATE tokens_acao SET usado_em = NOW(6) WHERE id = ?', 'i', $row['id']);

        return (int) $row['usuario_id'];
    }
}
