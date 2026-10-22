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
        );
    }
}
