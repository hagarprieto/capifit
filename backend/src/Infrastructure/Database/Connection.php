<?php

declare(strict_types=1);

namespace CapiFit\Infrastructure\Database;

use CapiFit\Config;

/**
 * Conexão mysqli preguiçosa: utf8mb4, exceções estritas e sessão em UTC (Doc 04 RG-014).
 * Todas as consultas usam prepared statements; nunca interpolar valores do cliente.
 */
final class Connection
{
    private const RETRYABLE = [1205, 1213]; // lock wait timeout, deadlock

    private ?\mysqli $mysqli = null;
    private int $depth = 0;

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
     * Primeira linha do resultado (coluna => valor) ou null.
     *
     * @return array<string, mixed>|null
     */
    public function fetchOne(string $sql, string $types = '', mixed ...$params): ?array
    {
        $rows = $this->fetchAll($sql, $types, ...$params);

        return $rows[0] ?? null;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function fetchAll(string $sql, string $types = '', mixed ...$params): array
    {
        $stmt = $this->mysqli()->prepare($sql);
        try {
            if ($params !== []) {
                $stmt->bind_param($types, ...$params);
            }
            $stmt->execute();
            $result = $stmt->get_result();
            /** @var list<array<string, mixed>> $rows */
            $rows = $result === false ? [] : $result->fetch_all(MYSQLI_ASSOC);

            return $rows;
        } finally {
            $stmt->close();
        }
    }

    /** Executa INSERT/UPDATE/DELETE e devolve o número de linhas afetadas. */
    public function execute(string $sql, string $types = '', mixed ...$params): int
    {
        $stmt = $this->mysqli()->prepare($sql);
        try {
            if ($params !== []) {
                $stmt->bind_param($types, ...$params);
            }
            $stmt->execute();

            return $stmt->affected_rows;
        } finally {
            $stmt->close();
        }
    }

    public function lastInsertId(): int
    {
        return (int) $this->mysqli()->insert_id;
    }

    /**
     * Executa $work em transação. Em deadlock ou espera de lock, reexecuta (até $attempts vezes);
     * $work deve ser idempotente em relação a efeitos fora do banco. Chamadas aninhadas reaproveitam a transação externa.
     *
     * @template T
     * @param callable(\mysqli): T $work
     * @return T
     */
    public function transaction(callable $work, int $attempts = 3): mixed
    {
        $m = $this->mysqli();
        // Chamada aninhada: participa da transação externa (sem BEGIN/COMMIT próprios, que encerrariam a externa).
        // Se falhar, a exceção sobe e a transação externa inteira sofre rollback.
        if ($this->depth > 0) {
            return $work($m);
        }
        for ($attempt = 1; ; $attempt++) {
            $m->begin_transaction();
            $this->depth = 1;
            try {
                $result = $work($m);
                $this->depth = 0;
                $m->commit();

                return $result;
            } catch (\Throwable $e) {
                $this->depth = 0;
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
