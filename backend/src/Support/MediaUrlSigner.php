<?php

declare(strict_types=1);

namespace CapiFit\Support;

/**
 * URL temporária e assinada para mídia aprovada (E03-06). A mídia fica em storage/CDN privado; a API entrega uma URL
 * que vale por pouco tempo: `<base>/<chave>?exp=<unix>&sig=<base64url(HMAC-SHA256(segredo, chave "\n" exp))>`.
 * O storage/CDN confere a assinatura e o prazo com o mesmo segredo (função de borda). Sem base ou sem segredo
 * (mínimo 32 bytes) não há URL: falha fechada, nunca um caminho público ou interno.
 */
final class MediaUrlSigner
{
    private const MIN_SECRET_BYTES = 32;

    public function __construct(
        private readonly string $baseUrl,
        private readonly string $secret,
        private readonly int $ttlSeconds,
    ) {
    }

    public function enabled(): bool
    {
        return $this->baseUrl !== '' && strlen($this->secret) >= self::MIN_SECRET_BYTES;
    }

    public function sign(string $storageKey, ?int $now = null): ?string
    {
        if (!$this->enabled() || !self::validKey($storageKey)) {
            return null;
        }
        $expires = ($now ?? time()) + $this->ttlSeconds;
        $path = implode('/', array_map('rawurlencode', explode('/', $storageKey)));

        return rtrim($this->baseUrl, '/') . '/' . $path . '?exp=' . $expires . '&sig=' . $this->signature($storageKey, $expires);
    }

    /** Conferência equivalente à que o storage/CDN faz (usada nos testes e na documentação do contrato com a borda). */
    public function verify(string $storageKey, int $expires, string $signature, ?int $now = null): bool
    {
        return $this->enabled() && $expires >= ($now ?? time()) && hash_equals($this->signature($storageKey, $expires), $signature);
    }

    /** Chave de objeto segura: relativa, sem `..`, sem barras duplas, só caracteres simples. */
    public static function validKey(string $key): bool
    {
        return preg_match('~^[a-z0-9][a-z0-9_.-]*(/[a-z0-9][a-z0-9_.-]*)*$~i', $key) === 1 && strlen($key) <= 600 && !str_contains($key, '..');
    }

    private function signature(string $storageKey, int $expires): string
    {
        return rtrim(strtr(base64_encode(hash_hmac('sha256', $storageKey . "\n" . $expires, $this->secret, true)), '+/', '-_'), '=');
    }
}
