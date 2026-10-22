<?php

declare(strict_types=1);

namespace CapiFit\Repositories;

use CapiFit\Infrastructure\Database\Connection;

/** Acesso a dados de sessões de treino, exercícios e séries da sessão. Sempre filtrado pelo dono quando aplicável. */
final class SessionRepository
{
    private const SUMMARY_COLUMNS = "s.id, s.uuid, s.tipo, s.titulo_avulso, s.status, s.iniciada_em, s.encerrada_em, s.duracao_ativa_segundos, s.observacoes,
        (SELECT COUNT(*) FROM sessoes_series ss JOIN sessoes_exercicios se ON se.id = ss.sessao_exercicio_id WHERE se.sessao_id = s.id) AS series_total,
        (SELECT COUNT(*) FROM sessoes_series ss JOIN sessoes_exercicios se ON se.id = ss.sessao_exercicio_id WHERE se.sessao_id = s.id AND ss.status = 'realizada') AS series_realizadas";

    public function __construct(private readonly Connection $db)
    {
    }

    /** @return array<string, mixed>|null */
    public function findOwned(string $uuid, int $userId): ?array
    {
        return $this->db->fetchOne('SELECT ' . self::SUMMARY_COLUMNS . ' FROM sessoes_treino s WHERE s.uuid = ? AND s.aluno_id = ?', 'si', $uuid, $userId);
    }

    /** @return array<string, mixed>|null */
    public function findOwnedForUpdate(string $uuid, int $userId): ?array
    {
        return $this->db->fetchOne('SELECT ' . self::SUMMARY_COLUMNS . ' FROM sessoes_treino s WHERE s.uuid = ? AND s.aluno_id = ? FOR UPDATE', 'si', $uuid, $userId);
    }

    public function openSessionUuid(int $userId): ?string
    {
        $row = $this->db->fetchOne("SELECT uuid FROM sessoes_treino WHERE aluno_id = ? AND status = 'em_andamento'", 'i', $userId);

        return $row === null ? null : (string) $row['uuid'];
    }

    public function uuidExists(string $uuid): bool
    {
        return $this->db->fetchOne('SELECT 1 AS x FROM sessoes_treino WHERE uuid = ?', 's', $uuid) !== null;
    }

    public function insertAvulsa(string $uuid, int $userId, ?string $title, string $startedAtDb): int
    {
        $this->db->execute(
            "INSERT INTO sessoes_treino(uuid, aluno_id, tipo, titulo_avulso, status, iniciada_em) VALUES (?, ?, 'avulso', ?, 'em_andamento', ?)",
            'siss',
            $uuid,
            $userId,
            $title,
            $startedAtDb,
        );

        return $this->db->lastInsertId();
    }

    /**
     * @param array{string, int}|null $after posição do cursor (iniciada_em no formato do banco, id)
     * @return list<array<string, mixed>>
     */
    public function list(int $userId, ?string $status, ?string $fromDb, ?string $toDb, ?array $after, int $limit): array
    {
        $where = ['s.aluno_id = ?'];
        $types = 'i';
        $params = [$userId];
        if ($status !== null) {
            $where[] = 's.status = ?';
            $types .= 's';
            $params[] = $status;
        }
        if ($fromDb !== null) {
            $where[] = 's.iniciada_em >= ?';
            $types .= 's';
            $params[] = $fromDb;
        }
        if ($toDb !== null) {
            $where[] = 's.iniciada_em <= ?';
            $types .= 's';
            $params[] = $toDb;
        }
        if ($after !== null) {
            $where[] = '(s.iniciada_em < ? OR (s.iniciada_em = ? AND s.id < ?))';
            $types .= 'ssi';
            array_push($params, $after[0], $after[0], $after[1]);
        }
        $types .= 'i';
        $params[] = $limit + 1;

        return $this->db->fetchAll(
            'SELECT ' . self::SUMMARY_COLUMNS . ' FROM sessoes_treino s WHERE ' . implode(' AND ', $where) . ' ORDER BY s.iniciada_em DESC, s.id DESC LIMIT ?',
            $types,
            ...$params,
        );
    }

    public function updateNotes(int $sessionId, string $notes): void
    {
        $this->db->execute('UPDATE sessoes_treino SET observacoes = ? WHERE id = ?', 'si', $notes, $sessionId);
    }

    /** Conclui a sessão calculando a duração ativa (sem as pausas já encerradas). */
    public function complete(int $sessionId, string $endedAtDb): void
    {
        $this->db->execute(
            "UPDATE sessoes_treino SET status = 'concluida', encerrada_em = ?,
                    duracao_ativa_segundos = GREATEST(0, TIMESTAMPDIFF(SECOND, iniciada_em, ?) - COALESCE((
                        SELECT SUM(TIMESTAMPDIFF(SECOND, p.iniciada_em, COALESCE(p.encerrada_em, ?))) FROM sessoes_pausas p WHERE p.sessao_id = sessoes_treino.id), 0))
              WHERE id = ?",
            'sssi',
            $endedAtDb,
            $endedAtDb,
            $endedAtDb,
            $sessionId,
        );
    }

    public function cancel(int $sessionId, string $endedAtDb): void
    {
        $this->db->execute("UPDATE sessoes_treino SET status = 'cancelada', encerrada_em = ? WHERE id = ?", 'si', $endedAtDb, $sessionId);
    }

    /** @return list<array<string, mixed>> */
    public function exercises(int $sessionId): array
    {
        return $this->db->fetchAll(
            'SELECT se.id, se.uuid, se.ordem, se.tipo_item, se.ficha_exercicio_id, se.exercicio_prescrito_id,
                    e.id AS exercicio_id, e.uuid AS exercicio_uuid, e.nome, e.modalidade, eq.id AS equipamento_id, eq.nome AS equipamento_nome
               FROM sessoes_exercicios se
               JOIN exercicios e ON e.id = se.exercicio_id
               LEFT JOIN equipamentos eq ON eq.id = e.equipamento_id
              WHERE se.sessao_id = ?
              ORDER BY se.ordem, se.id',
            'i',
            $sessionId,
        );
    }

    /** @return array<string, mixed>|null exercício da sessão por uuid, restrito à sessão */
    public function findExercise(int $sessionId, string $uuid): ?array
    {
        return $this->db->fetchOne(
            'SELECT se.id, se.uuid, se.ordem, se.tipo_item, se.exercicio_id, e.modalidade
               FROM sessoes_exercicios se JOIN exercicios e ON e.id = se.exercicio_id
              WHERE se.sessao_id = ? AND se.uuid = ?',
            'is',
            $sessionId,
            $uuid,
        );
    }

    /** @return array<string, mixed>|null */
    public function findPublishedExercise(string $uuid): ?array
    {
        return $this->db->fetchOne("SELECT id, uuid, nome, modalidade FROM exercicios WHERE uuid = ? AND status = 'publicado'", 's', $uuid);
    }

    public function nextExerciseOrder(int $sessionId): int
    {
        $row = $this->db->fetchOne('SELECT COALESCE(MAX(ordem), 0) + 1 AS n FROM sessoes_exercicios WHERE sessao_id = ? FOR UPDATE', 'i', $sessionId);

        return (int) ($row['n'] ?? 1);
    }

    public function exerciseOrderTaken(int $sessionId, int $order): bool
    {
        return $this->db->fetchOne('SELECT 1 AS x FROM sessoes_exercicios WHERE sessao_id = ? AND ordem = ?', 'ii', $sessionId, $order) !== null;
    }

    public function insertExercise(string $uuid, int $sessionId, int $exerciseId, int $order): int
    {
        $this->db->execute(
            "INSERT INTO sessoes_exercicios(uuid, sessao_id, exercicio_id, ordem, tipo_item) VALUES (?, ?, ?, ?, 'adicionado')",
            'siii',
            $uuid,
            $sessionId,
            $exerciseId,
            $order,
        );

        return $this->db->lastInsertId();
    }

    /** @return list<array<string, mixed>> séries da sessão, com o id da linha do exercício da sessão */
    public function series(int $sessionId): array
    {
        return $this->db->fetchAll(
            'SELECT ss.id, ss.uuid, ss.sessao_exercicio_id, ss.ordem, ss.tipo, ss.carga_kg, ss.repeticoes, ss.duracao_segundos, ss.rir_real,
                    ss.status, ss.concluida_em, ss.revision, ss.atualizado_cliente_em
               FROM sessoes_series ss JOIN sessoes_exercicios se ON se.id = ss.sessao_exercicio_id
              WHERE se.sessao_id = ? ORDER BY se.ordem, ss.ordem',
            'i',
            $sessionId,
        );
    }

    /** @return array<string, mixed>|null série por uuid, restrita à sessão (trava a linha para atualização) */
    public function findSeriesForUpdate(int $sessionId, string $uuid): ?array
    {
        return $this->db->fetchOne(
            'SELECT ss.id, ss.uuid, ss.sessao_exercicio_id, ss.ordem, ss.tipo, ss.carga_kg, ss.repeticoes, ss.duracao_segundos, ss.rir_real,
                    ss.status, ss.concluida_em, ss.revision, ss.atualizado_cliente_em, e.modalidade
               FROM sessoes_series ss
               JOIN sessoes_exercicios se ON se.id = ss.sessao_exercicio_id
               JOIN exercicios e ON e.id = se.exercicio_id
              WHERE se.sessao_id = ? AND ss.uuid = ? FOR UPDATE',
            'is',
            $sessionId,
            $uuid,
        );
    }

    public function nextSeriesOrder(int $sessionExerciseId): int
    {
        $row = $this->db->fetchOne('SELECT COALESCE(MAX(ordem), 0) + 1 AS n FROM sessoes_series WHERE sessao_exercicio_id = ? FOR UPDATE', 'i', $sessionExerciseId);

        return (int) ($row['n'] ?? 1);
    }

    public function insertSeries(string $uuid, int $sessionExerciseId, int $order, string $type): int
    {
        $this->db->execute(
            "INSERT INTO sessoes_series(uuid, sessao_exercicio_id, ordem, tipo, status) VALUES (?, ?, ?, ?, 'pendente')",
            'siis',
            $uuid,
            $sessionExerciseId,
            $order,
            $type,
        );

        return $this->db->lastInsertId();
    }

    /** @param array<string, mixed> $fields coluna => valor (somente colunas conhecidas, definidas pelo serviço) */
    public function updateSeries(int $seriesId, array $fields): void
    {
        $allowed = [
            'carga_kg' => 'd', 'repeticoes' => 'i', 'duracao_segundos' => 'i', 'rir_real' => 'i', 'status' => 's',
            'concluida_em' => 's', 'atualizado_cliente_em' => 's', 'tipo' => 's',
        ];
        $sets = [];
        $types = '';
        $params = [];
        foreach ($fields as $column => $value) {
            if (!isset($allowed[$column])) {
                throw new \InvalidArgumentException("Coluna não permitida: $column");
            }
            $sets[] = "$column = ?";
            $types .= $allowed[$column];
            $params[] = $value;
        }
        $sets[] = 'revision = revision + 1';
        $types .= 'i';
        $params[] = $seriesId;
        $this->db->execute('UPDATE sessoes_series SET ' . implode(', ', $sets) . ' WHERE id = ?', $types, ...$params);
    }

    /** @return array<string, mixed>|null */
    public function findSeriesById(int $seriesId): ?array
    {
        return $this->db->fetchOne(
            'SELECT ss.id, ss.uuid, ss.sessao_exercicio_id, ss.ordem, ss.tipo, ss.carga_kg, ss.repeticoes, ss.duracao_segundos, ss.rir_real,
                    ss.status, ss.concluida_em, ss.revision, ss.atualizado_cliente_em
               FROM sessoes_series ss WHERE ss.id = ?',
            'i',
            $seriesId,
        );
    }

    /** @return list<array<string, mixed>> */
    public function pauses(int $sessionId): array
    {
        return $this->db->fetchAll('SELECT uuid, iniciada_em, encerrada_em FROM sessoes_pausas WHERE sessao_id = ? ORDER BY iniciada_em, id', 'i', $sessionId);
    }
}
