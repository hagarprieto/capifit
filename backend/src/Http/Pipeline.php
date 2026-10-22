<?php

declare(strict_types=1);

namespace CapiFit\Http;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/** Encadeia middlewares PSR-15 até o manipulador final (o roteador). */
final class Pipeline implements RequestHandlerInterface
{
    /** @param list<MiddlewareInterface> $middlewares */
    public function __construct(
        private readonly array $middlewares,
        private readonly RequestHandlerInterface $final,
        private readonly int $index = 0,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        if (!isset($this->middlewares[$this->index])) {
            return $this->final->handle($request);
        }

        return $this->middlewares[$this->index]->process(
            $request,
            new self($this->middlewares, $this->final, $this->index + 1),
        );
    }
}
