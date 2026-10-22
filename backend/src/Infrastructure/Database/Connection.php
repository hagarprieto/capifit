<?php

declare(strict_types=1);

namespace CapiFit\Infrastructure\Database;

use CapiFit\Config;

/**
 * Conexão mysqli preguiçosa: utf8mb4, exceções estritas e sessão em UTC (Doc 04 RG-014).
 * Consultas devem usar prepared statements; nunca interpolar valores do cliente.
 */
final class Connection
{
    private const RETRYABLE = [1205, 1213]; // lock wait timeout, deadlock

    private ?\mysqli $mysqli = null;

    public function __construct(private readonly Config $config)
    {
    }

    public function mysqli(): \mysqli
    {
        if ($this->mysqli === null) {
            mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
            $m = new \mysqli($this->config->dbHost, $this->config->dbUser, $this->config->dbPassword, $this->config->dbName, $this->config->dbPort);
            $m->set_charset('utf8mb4');
            $m->query("SET time_zone = '+00:00'");
            $this->mysqli = $m;
        }

        return $this->mysqli;
    }

    /**
     * Executa $work em transação. Em deadlock ou espera de lock, reexecuta (até $attempts vezes);
     * $work deve ser idempotente em relação a efeitos fora do banco.
     *
     * @template T
     * @param callable(\mysqli): T $work
     * @return T
     */
    public function transaction(callable $work, int $attempts = 3): mixed
    {
        $m = $this->mysqli();
        for ($attempt = 1; ; $attempt++) {
            $m->begin_transaction();
            try {
                $result = $work($m);
                $m->commit();

                return $result;
            } catch (\Throwable $e) {
                try {
                    $m->rollback();
                } catch (\Throwable) {
                    // conexão pode já ter sido perdida; o erro original é o relevante
                }
                if ($e instanceof \mysqli_sql_exception && in_array($e->getCode(), self::RETRYABLE, true) && $attempt < $attempts) {
                    continue;
                }
                throw $e;
            }
        }
    }

    public function close(): void
    {
        $this->mysqli?->close();
        $this->mysqli = null;
    }
}
