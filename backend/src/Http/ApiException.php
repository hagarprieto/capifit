<?php

declare(strict_types=1);

namespace CapiFit\Http;

/** Erro de domínio/contrato que vira resposta HTTP no envelope de erro. */
final class ApiException extends \RuntimeException
{
    /**
     * @param array<string, mixed> $details
     * @param array<string, string> $headers
     */
    public function __construct(
        public readonly ErrorCode $errorCode,
        ?string $message = null,
        public readonly array $details = [],
        public readonly array $headers = [],
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message ?? $errorCode->defaultMessage(), $errorCode->status(), $previous);
    }

    public function status(): int
    {
        return $this->errorCode->status();
    }
}
