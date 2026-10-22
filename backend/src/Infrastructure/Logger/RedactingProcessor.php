<?php

declare(strict_types=1);

namespace CapiFit\Infrastructure\Logger;

use Monolog\LogRecord;
use Monolog\Processor\ProcessorInterface;

/**
 * Rede de segurança do log (CT-80; Doc 05 §12.2; E02-05). A regra é NÃO colocar dado pessoal ou sensível no log em
 * primeiro lugar (há um teste que varre os logs de todos os fluxos sem este filtro); este processador cobre o erro de
 * quem esquecer, de duas formas:
 *  - por NOME de chave, em qualquer profundidade, o valor vira `[REDACTED]`;
 *  - por PADRÃO, dentro de qualquer texto (mensagem, contexto, extras): e-mails, JWT, cabeçalho Bearer e sequências
 *    longas de aparência de token são trocados por marcadores.
 */
final class RedactingProcessor implements ProcessorInterface
{
    public const REDACTED = '[REDACTED]';

    private const SENSITIVE_KEYS = [
        // segredos e credenciais
        'senha', 'nova_senha', 'password', 'passwd', 'secret', 'token', 'access_token', 'refresh_token',
        'authorization', 'cookie', 'set-cookie', 'api_key', 'apikey', 'db_password', 'jwt', 'senha_hash', 'refresh_hash', 'token_hash',
        'signature', 'sig', 'download_url', 'url', 'storage_key',
        // dados pessoais e de saúde
        'restricoes', 'restricoes_json', 'email', 'nome', 'name', 'observacoes', 'observacao_livre', 'justificativa',
        'titulo', 'titulo_avulso', 'instrucoes', 'preferencias', 'preferencias_json',
        // rede
        'ip', 'x-forwarded-for', 'remote_addr',
    ];

    /** @var array<string, string> padrão => substituição */
    private const PATTERNS = [
        '/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/' => '[EMAIL]',
        '/\beyJ[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]*/' => '[JWT]',
        '/Bearer\s+[A-Za-z0-9._~+\/\-]+=*/i' => 'Bearer [REDACTED]',
        '/(?<![A-Za-z0-9_\-])[A-Za-z0-9_\-]{43,}(?![A-Za-z0-9_\-])/' => '[TOKEN]',
    ];

    public function __invoke(LogRecord $record): LogRecord
    {
        return $record->with(
            message: $this->scrub($record->message),
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
            } elseif (is_string($value)) {
                $data[$key] = $this->scrub($value);
            }
        }

        return $data;
    }

    private function scrub(string $text): string
    {
        return preg_replace(array_keys(self::PATTERNS), array_values(self::PATTERNS), $text) ?? self::REDACTED;
    }
}
