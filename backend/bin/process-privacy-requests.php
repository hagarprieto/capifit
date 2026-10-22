<?php

declare(strict_types=1);

/**
 * Workflow interno dos pedidos do titular (E02-02): `php bin/process-privacy-requests.php`.
 * Gera as exportações de dados e anonimiza as contas cuja exclusão foi pedida. Agendar com frequência curta
 * (ex.: a cada 15 minutos). Imprime uma linha JSON com as contagens, sem dado pessoal.
 */

use CapiFit\Config;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Services\DataExportBuilder;
use CapiFit\Services\PrivacyWorkflow;
use Dotenv\Dotenv;

require __DIR__ . '/../vendor/autoload.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

try {
    Dotenv::createImmutable(dirname(__DIR__))->safeLoad();
    $config = Config::fromArray($_ENV + $_SERVER);
    $db = new Connection($config);
    $result = (new PrivacyWorkflow($db, $config, new DataExportBuilder($db)))->run();
    $db->close();
    fwrite(STDOUT, json_encode(['privacidade' => $result], JSON_THROW_ON_ERROR) . PHP_EOL);
    exit($result['falhas'] > 0 ? 2 : 0);
} catch (Throwable $e) {
    fwrite(STDERR, 'Falha no processamento dos pedidos do titular: ' . $e::class . PHP_EOL);
    exit(1);
}
