<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Config;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\ClientIp;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Limite de taxa por janela fixa, contado no banco (tabela `limites_requisicao`), para as rotas de autenticação
 * (E01-05; Doc 05 §12.8). Excedeu: 429 RATE_LIMITED com `Retry-After`.
 *
 * Privacidade: o banco guarda apenas um HMAC do identificador (IP ou e-mail), com o segredo da aplicação —
 * nunca o IP nem o e-mail em claro. A contagem é gravada fora de qualquer transação de negócio, então tentativas
 * que falham continuam contando.
 */
final class RateLimiter
{
    /**
     * Limites iniciais (tentativas por janela em segundos), a calibrar com a linha de base do beta.
     * IP com folga maior porque redes móveis e Wi-Fi compartilhado reúnem muitos usuários atrás de um endereço.
     *
     * @var array<string, array<string, array{int, int}>>
     */
    public const RULES = [
        'register' => ['ip' => [10, 3600]],
        'login' => ['ip' => [30, 900], 'email' => [10, 900]],
        'refresh' => ['ip' => [60, 900]],
        'forgot' => ['ip' => [10, 3600], 'email' => [3, 3600]],
        'reset' => ['ip' => [10, 3600]],
        'verify' => ['ip' => [20, 3600]],
    ];

    public function __construct(private readonly Connection $db, private readonly Config $config)
    {
    }

    /** @param string|null $email e-mail normalizado (minúsculas), quando a rota o recebe */
    public function enforce(ServerRequestInterface $request, string $scope, ?string $email = null): void
    {
        if (!$this->config->rateLimitEnabled) {
            return;
        }
        $rules = self::RULES[$scope] ?? throw new \InvalidArgumentException("Escopo de limite desconhecido: $scope");

        [$limit, $window] = $rules['ip'];
        $this->hit($scope, 'ip', ClientIp::from($request, $this->config->trustForwardedFor), $limit, $window);
        if ($email !== null && isset($rules['email'])) {
            [$limit, $window] = $rules['email'];
            $this->hit($scope, 'email', $email, $limit, $window);
        }
    }

    private function hit(string $scope, string $kind, string $identifier, int $limit, int $window): void
    {
        $now = time();
        $windowStart = intdiv($now, $window) * $window;
        $key = hash_hmac('sha256', "$scope|$kind|$window|$identifier", $this->secret());
        $startDb = gmdate('Y-m-d H:i:s', $windowStart);

        $this->db->execute(
            'INSERT INTO limites_requisicao(chave_hash, janela_inicio, contagem) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE contagem = contagem + 1',
            'ss',
            $key,
            $startDb,
        );
        $row = $this->db->fetchOne('SELECT contagem FROM limites_requisicao WHERE chave_hash = ? AND janela_inicio = ?', 'ss', $key, $startDb);

        // Limpeza oportunista de janelas antigas (a faxina agendada é a história E00-10).
        if (random_int(1, 200) === 1) {
            $this->db->execute('DELETE FROM limites_requisicao WHERE janela_inicio < ?', 's', gmdate('Y-m-d H:i:s', $now - 2 * 86400));
        }

        if ((int) ($row['contagem'] ?? 0) > $limit) {
            $retryAfter = max(1, $windowStart + $window - $now);
            throw new ApiException(ErrorCode::RateLimited, null, ['reason' => 'TOO_MANY_ATTEMPTS'], ['Retry-After' => (string) $retryAfter]);
        }
    }

    private function secret(): string
    {
        if ($this->config->jwtSecret === '') {
            throw new \RuntimeException('JWT_SECRET é necessário para o limite de taxa (usado como chave do HMAC).');
        }

        return $this->config->jwtSecret;
    }
}
