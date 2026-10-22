<?php

declare(strict_types=1);

namespace CapiFit\Auth;

/** Usuário autenticado na requisição (atributo `auth`). Papéis vêm do banco, não do token. */
final class AuthenticatedUser
{
    /** @param list<string> $roles */
    public function __construct(
        public readonly int $id,
        public readonly string $uuid,
        public readonly string $name,
        public readonly array $roles,
        public readonly string $sessionUuid,
        public readonly string $familyUuid,
    ) {
    }

    public function hasRole(string $role): bool
    {
        return in_array($role, $this->roles, true);
    }
}
