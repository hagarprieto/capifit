<?php

declare(strict_types=1);

namespace CapiFit;

/** Configuração lida do ambiente (.env em desenvolvimento; variáveis do servidor em produção). */
final class Config
{
    /** @param list<string> $corsOrigins */
    public function __construct(
        public readonly string $env,
        public readonly string $dbHost,
        public readonly int $dbPort,
        public readonly string $dbName,
        public readonly string $dbUser,
        public readonly string $dbPassword,
        public readonly array $corsOrigins,
        public readonly int $maxBodyBytes,
        public readonly string $jwtSecret = '',
        public readonly string $jwtIssuer = 'capifit',
        public readonly int $accessTtlSeconds = 900,
        public readonly int $refreshTtlSeconds = 2_592_000,
        public readonly int $refreshReuseGraceSeconds = 10,
        public readonly string $mediaBaseUrl = '',
        public readonly string $mediaSigningSecret = '',
        public readonly int $mediaUrlTtlSeconds = 600,
        public readonly bool $rateLimitEnabled = true,
        public readonly bool $trustForwardedFor = false,
        public readonly string $passwordResetUrl = 'capifit://redefinir-senha',
        public readonly string $emailVerifyUrl = 'capifit://verificar-email',
    ) {
    }

    /** @param array<string, mixed> $env */
    public static function fromArray(array $env): self
    {
        $get = static fn (string $key, string $default = ''): string => isset($env[$key]) && is_string($env[$key]) ? $env[$key] : $default;
        $origins = array_values(array_filter(array_map('trim', explode(',', $get('CORS_ORIGINS'))), static fn (string $o): bool => $o !== ''));

        return new self(
            env: $get('APP_ENV', 'production'),
            dbHost: $get('DB_HOST', '127.0.0.1'),
            dbPort: (int) $get('DB_PORT', '3306'),
            dbName: $get('DB_NAME', 'capifit'),
            dbUser: $get('DB_USER'),
            dbPassword: $get('DB_PASSWORD'),
            corsOrigins: $origins,
            maxBodyBytes: max(1024, (int) $get('MAX_BODY_BYTES', '1048576')),
            jwtSecret: $get('JWT_SECRET'),
            jwtIssuer: $get('JWT_ISSUER', 'capifit'),
            accessTtlSeconds: max(60, (int) $get('ACCESS_TOKEN_TTL', '900')),
            refreshTtlSeconds: max(3600, (int) $get('REFRESH_TOKEN_TTL', '2592000')),
            refreshReuseGraceSeconds: max(0, (int) $get('REFRESH_REUSE_GRACE', '10')),
            mediaBaseUrl: $get('MEDIA_BASE_URL'),
            mediaSigningSecret: $get('MEDIA_SIGNING_SECRET'),
            mediaUrlTtlSeconds: min(3600, max(60, (int) $get('MEDIA_URL_TTL', '600'))),
            rateLimitEnabled: !in_array(strtolower($get('RATE_LIMIT_ENABLED', '1')), ['0', 'false', 'off', 'no'], true),
            trustForwardedFor: in_array(strtolower($get('TRUST_FORWARDED_FOR', '0')), ['1', 'true', 'on', 'yes'], true),
            passwordResetUrl: $get('PASSWORD_RESET_URL', 'capifit://redefinir-senha'),
            emailVerifyUrl: $get('EMAIL_VERIFY_URL', 'capifit://verificar-email'),
        );
    }
}
