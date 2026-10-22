<?php

declare(strict_types=1);

namespace CapiFit\Http;

/**
 * Estado mutável compartilhado durante uma requisição (atributo `context`).
 * Permite que camadas externas (log de acesso) conheçam o que as internas decidiram (rota casada).
 */
final class RequestContext
{
    /** Padrão da rota casada (ex.: /me/sessoes/{uuid}); nulo se nenhuma rota casou. */
    public ?string $routePattern = null;

    public function __construct(
        public readonly string $requestId,
        public readonly int $startedAtNs,
    ) {
    }

    public function elapsedMs(): float
    {
        return round((hrtime(true) - $this->startedAtNs) / 1_000_000, 2);
    }
}
