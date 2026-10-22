<?php

declare(strict_types=1);

namespace CapiFit\Auth;

use CapiFit\Config;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

/**
 * Access token JWT (HS256, curta duração) e refresh token opaco (Documento 06, D-11).
 * O JWT só identifica o usuário e a sessão; papel, estado da conta e revogação são conferidos no banco.
 */
final class TokenService
{
    private const MIN_SECRET_BYTES = 32;

    public function __construct(private readonly Config $config)
    {
        if (strlen($config->jwtSecret) < self::MIN_SECRET_BYTES) {
            throw new \RuntimeException('JWT_SECRET ausente ou curto demais (mínimo de 32 bytes).');
        }
    }

    /** @return array{token: string, expires_in: int} */
    public function issueAccessToken(string $userUuid, string $sessionUuid): array
    {
        $now = time();
        $ttl = $this->config->accessTtlSeconds;
        $token = JWT::encode([
            'iss' => $this->config->jwtIssuer,
            'sub' => $userUuid,
            'sid' => $sessionUuid,
            'iat' => $now,
            'nbf' => $now,
            'exp' => $now + $ttl,
            'jti' => bin2hex(random_bytes(8)),
        ], $this->config->jwtSecret, 'HS256');

        return ['token' => $token, 'expires_in' => $ttl];
    }

    /**
     * Valida assinatura, algoritmo, emissor e validade. Devolve null para qualquer token inválido.
     *
     * @return array{sub: string, sid: string}|null
     */
    public function verifyAccessToken(string $token): ?array
    {
        try {
            JWT::$leeway = 5;
            $claims = (array) JWT::decode($token, new Key($this->config->jwtSecret, 'HS256'));
        } catch (\Throwable) {
            return null;
        }
        if (($claims['iss'] ?? null) !== $this->config->jwtIssuer) {
            return null;
        }
        $sub = $claims['sub'] ?? null;
        $sid = $claims['sid'] ?? null;
        if (!is_string($sub) || !is_string($sid)) {
            return null;
        }

        return ['sub' => $sub, 'sid' => $sid];
    }

    /** Token de renovação: 256 bits aleatórios, em base64url (sem preenchimento). */
    public function newRefreshToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    /** Só o hash do refresh token é guardado no banco. */
    public function hashRefreshToken(string $token): string
    {
        return hash('sha256', $token);
    }
}
