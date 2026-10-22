<?php

declare(strict_types=1);

namespace CapiFit\Infrastructure\Logger;

use Monolog\LogRecord;
use Monolog\Processor\ProcessorInterface;

/**
 * Remove valores sensíveis de contexto e extras antes de gravar (CT-80; Doc 05 §12.2).
 * A lista é por NOME de chave, em qualquer profundidade; ela existe como rede de segurança:
 * a regra é não colocar dado sensível no log em primeiro lugar.
 */
final class RedactingProcessor implements ProcessorInterface
{
    public const REDACTED = '[REDACTED]';

    private const SENSITIVE_KEYS = [
        'senha', 'nova_senha', 'password', 'passwd', 'secret', 'token', 'access_token', 'refresh_token',
        'authorization', 'cookie', 'set-cookie', 'api_key', 'apikey', 'restricoes', 'restricoes_json',
        'db_password', 'jwt',
    ];

    public function __invoke(LogRecord $record): LogRecord
    {
        return $record->with(
            context: $this->redact($record->context),
            extra: $this->redact($record->extra),
        );
    }

    /**
     * @param array<mixed> $data
     * @return array<mixed>
     */
    private function redact(array $data): array
    {
        foreach ($data as $key => $value) {
            if (is_string($key) && in_array(strtolower($key), self::SENSITIVE_KEYS, true)) {
                $data[$key] = self::REDACTED;
            } elseif (is_array($value)) {
                $data[$key] = $this->redact($value);
            }
        }

        return $data;
    }
}
