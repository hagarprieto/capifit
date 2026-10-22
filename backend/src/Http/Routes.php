<?php

declare(strict_types=1);

namespace CapiFit\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Tabela de rotas. Cada rota guarda o seu padrão (para log de acesso e métricas) e se é pública.
 * Negar por padrão: toda rota exige autenticação, a menos que seja declarada pública de forma explícita.
 */
final class Routes
{
    /** @var list<array{string, string, callable(ServerRequestInterface): ResponseInterface, bool}> */
    private array $items = [];

    /** @param callable(ServerRequestInterface): ResponseInterface $handler */
    public function add(string $method, string $pattern, callable $handler, bool $public = false): self
    {
        $this->items[] = [$method, $pattern, $handler, $public];

        return $this;
    }

    /** @param callable(ServerRequestInterface): ResponseInterface $handler */
    public function public(string $method, string $pattern, callable $handler): self
    {
        return $this->add($method, $pattern, $handler, true);
    }

    /** @return list<array{string, string, callable(ServerRequestInterface): ResponseInterface, bool}> */
    public function all(): array
    {
        return $this->items;
    }
}
