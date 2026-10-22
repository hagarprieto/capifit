<?php

declare(strict_types=1);

namespace CapiFit\Auth;

/** Hash de senha com Argon2id (Doc 04 §11). Não há limite de 72 bytes como no bcrypt. */
final class PasswordHasher
{
    /**
     * Hash de uma senha aleatória descartada. Serve para gastar o mesmo tempo quando o e-mail não existe,
     * evitando revelar contas pelo tempo de resposta do login.
     */
    private const DUMMY_HASH = '$argon2id$v=19$m=65536,t=4,p=1$eXJyUDZSbjdsZFhIc0dqaQ$+Gx2GujEb1KaUkMlJszSKkQbwmcIlE6ab1rI12U0SGo';

    public function hash(string $password): string
    {
        return password_hash($password, PASSWORD_ARGON2ID);
    }

    public function verify(string $password, ?string $hash): bool
    {
        if ($hash === null || $hash === '') {
            password_verify($password, self::DUMMY_HASH);

            return false;
        }

        return password_verify($password, $hash);
    }

    public function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, PASSWORD_ARGON2ID);
    }
}
