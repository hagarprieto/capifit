<?php

declare(strict_types=1);

/**
 * Importa o seed do catálogo de forma idempotente (E03-02): `php bin/import-seed.php [caminho/do/seed.sql]`.
 * Sem argumento usa `docs/09_seed_catalogo.sql`. Pode ser repetido à vontade: insere só o que falta e nunca
 * sobrescreve o que já existe. Imprime uma linha JSON com as linhas novas por tabela.
 */

use CapiFit\Config;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Services\SeedImporter;
use Dotenv\Dotenv;

require __DIR__ . '/../vendor/autoload.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

try {
    Dotenv::createImmutable(dirname(__DIR__))->safeLoad();
    $path = $argv[1] ?? dirname(__DIR__, 2) . '/docs/09_seed_catalogo.sql';
    $sql = is_file($path) ? file_get_contents($path) : false;
    if ($sql === false) {
        throw new RuntimeException('Arquivo de seed não encontrado.');
    }
    $db = new Connection(Config::fromArray($_ENV + $_SERVER));
    $inserted = (new SeedImporter($db))->import($sql);
    $db->close();
    fwrite(STDOUT, json_encode(['seed' => $inserted], JSON_THROW_ON_ERROR) . PHP_EOL);
} catch (Throwable $e) {
    fwrite(STDERR, 'Falha na importação do seed: ' . ($e instanceof RuntimeException ? $e->getMessage() : $e::class) . PHP_EOL);
    exit(1);
}
