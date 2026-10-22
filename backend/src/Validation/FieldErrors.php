<?php

declare(strict_types=1);

namespace CapiFit\Validation;

use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;

/**
 * Acumula erros por campo e os transforma em 422 VALIDATION_ERROR com `details.fields`
 * (campo => lista de mensagens), como no contrato (Doc 05 §3.2).
 */
final class FieldErrors
{
    /** @var array<string, list<string>> */
    private array $errors = [];

    public function add(string $field, string $message): void
    {
        $this->errors[$field][] = $message;
    }

    public function has(string $field): bool
    {
        return isset($this->errors[$field]);
    }

    public function any(): bool
    {
        return $this->errors !== [];
    }

    public function throwIfAny(): void
    {
        if ($this->errors !== []) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => $this->errors]);
        }
    }

    /**
     * Campos fora da lista permitida são rejeitados, e não ignorados (Doc 05 §3.2).
     *
     * @param array<mixed> $input
     * @param list<string> $allowed
     */
    public function rejectUnknown(array $input, array $allowed): void
    {
        foreach (array_keys($input) as $key) {
            if (!is_string($key) || !in_array($key, $allowed, true)) {
                $this->add((string) $key, 'Campo não permitido.');
            }
        }
    }

    /** @param array<string, mixed> $input */
    public function requireString(array $input, string $field, int $min, int $max): ?string
    {
        $value = $input[$field] ?? null;
        if (!is_string($value)) {
            $this->add($field, 'Informe um texto.');

            return null;
        }
        $length = mb_strlen($value);
        if ($length < $min || $length > $max) {
            $this->add($field, $min === $max ? "Deve ter exatamente $min caracteres." : "Deve ter entre $min e $max caracteres.");

            return null;
        }

        return $value;
    }
}
