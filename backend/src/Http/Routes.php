<?php

declare(strict_types=1);

namespace CapiFit\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Tabela de rotas. Cada rota guarda o seu padrão para o log de acesso e as métricas. */
final class Routes
{
    /** @var list<array{string, string, callable(ServerRequestInterface): ResponseInterface}> */
    private array $items = [];

    /** @param callable(ServerRequestInterface): ResponseInterface $handler */
    public function add(string $method, string $pattern, callable $handler): self
    {
        $this->items[] = [$method, $pattern, $handler];

        return $this;
    }

    /** @return list<array{string, string, callable(ServerRequestInterface): ResponseInterface}> */
    public function all(): array
    {
        return $this->items;
    }
}
