<?php

declare(strict_types=1);

/**
 * Faxina operacional (E00-10): `php bin/cleanup.php`, agendada uma vez por dia (cron/agendador da hospedagem).
 * Imprime uma linha JSON com as contagens removidas, sem nenhum dado pessoal.
 */

use CapiFit\Config;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Services\CleanupService;
use Dotenv\Dotenv;

require __DIR__ . '/../vendor/autoload.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

try {
    Dotenv::createImmutable(dirname(__DIR__))->safeLoad();
    $db = new Connection(Config::fromArray($_ENV + $_SERVER));
    $removed = (new CleanupService($db))->run();
    $db->close();
    fwrite(STDOUT, json_encode(['cleanup' => $removed], JSON_THROW_ON_ERROR) . PHP_EOL);
} catch (Throwable $e) {
    fwrite(STDERR, 'Falha na faxina: ' . $e::class . PHP_EOL);
    exit(1);
}
