<?php

declare(strict_types=1);

namespace CapiFit\Repositories;

use CapiFit\Infrastructure\Database\Connection;

/** Acesso a dados de sessões de treino, exercícios e séries da sessão. Sempre filtrado pelo dono quando aplicável. */
final class SessionRepository
{
    private const SUMMARY_COLUMNS = "s.id, s.uuid, s.tipo, s.titulo_avulso, s.status, s.iniciada_em, s.encerrada_em, s.duracao_ativa_segundos, s.observacoes,
        (SELECT p.uuid FROM versoes_programa v JOIN programas_treino p ON p.id = v.programa_id WHERE v.id = s.programa_versao_id) AS programa_uuid,
        (SELECT v.numero FROM versoes_programa v WHERE v.id = s.programa_versao_id) AS versao_numero,
        (SELECT f.uuid FROM fichas_treino f WHERE f.id = s.ficha_id) AS ficha_uuid,
        (SELECT f.titulo FROM fichas_treino f WHERE f.id = s.ficha_id) AS ficha_titulo,
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
     * Ficha que o aluno pode treinar: de versão já publicada (ou substituída, para histórico), de programa não arquivado
     * e visível a ele (programa de coach só depois do aceite).
     *
     * @return array<string, mixed>|null
     */
    public function findTrainableFicha(string $fichaUuid, int $userId): ?array
    {
        return $this->db->fetchOne(
            "SELECT f.id, f.versao_id FROM fichas_treino f
               JOIN versoes_programa v ON v.id = f.versao_id
               JOIN programas_treino p ON p.id = v.programa_id
              WHERE f.uuid = ? AND v.estado <> 'rascunho' AND p.status <> 'arquivado' AND p.aluno_id = ?
                AND (p.origem <> 'coach' OR EXISTS (SELECT 1 FROM aceites_programa ac WHERE ac.programa_id = p.id))",
            'si',
            $fichaUuid,
            $userId,
        );
    }

    public function insertProgrammed(string $uuid, int $userId, int $versionId, int $fichaId, string $startedAtDb): int
    {
        $this->db->execute(
            "INSERT INTO sessoes_treino(uuid, aluno_id, tipo, programa_versao_id, ficha_id, status, iniciada_em) VALUES (?, ?, 'programado', ?, ?, 'em_andamento', ?)",
            'siiis',
            $uuid,
            $userId,
            $versionId,
            $fichaId,
            $startedAtDb,
        );

        return $this->db->lastInsertId();
    }

    /**
     * Uuids da prescrição de uma ficha, para validar o instantâneo enviado pelo cliente.
     *
     * @return array{items: array<string, array{id: int, exercicio_id: int}>, series: array<string, array{id: int, item_uuid: string}>}
     */
    public function prescribedIndex(int $fichaId): array
    {
        $items = [];
        foreach ($this->db->fetchAll('SELECT id, uuid, exercicio_id FROM ficha_exercicios WHERE ficha_id = ?', 'i', $fichaId) as $r) {
            $items[strtolower((string) $r['uuid'])] = ['id' => (int) $r['id'], 'exercicio_id' => (int) $r['exercicio_id']];
        }
        $series = [];
        $rows = $this->db->fetchAll(
            'SELECT sp.id, sp.uuid, fe.uuid AS item_uuid FROM series_prescritas sp JOIN ficha_exercicios fe ON fe.id = sp.ficha_exercicio_id WHERE fe.ficha_id = ?',
            'i',
            $fichaId,
        );
        foreach ($rows as $r) {
            $series[strtolower((string) $r['uuid'])] = ['id' => (int) $r['id'], 'item_uuid' => strtolower((string) $r['item_uuid'])];
        }

        return ['items' => $items, 'series' => $series];
    }

    /** @return array<string, mixed>|null pausa da sessão por uuid */
    public function findSessionPause(int $sessionId, string $uuid): ?array
    {
        return $this->db->fetchOne('SELECT id, uuid, iniciada_em, encerrada_em FROM sessoes_pausas WHERE sessao_id = ? AND uuid = ? FOR UPDATE', 'is', $sessionId, $uuid);
    }

    /** @return list<array<string, mixed>> exercícios prescritos da ficha, com as séries prescritas em `series` */
    public function prescribedItems(int $fichaId): array
    {
        $items = $this->db->fetchAll('SELECT id, exercicio_id, ordem FROM ficha_exercicios WHERE ficha_id = ? ORDER BY ordem, id', 'i', $fichaId);
        $series = $this->db->fetchAll(
            'SELECT sp.id, sp.ficha_exercicio_id, sp.ordem, sp.tipo FROM series_prescritas sp JOIN ficha_exercicios fe ON fe.id = sp.ficha_exercicio_id WHERE fe.ficha_id = ? ORDER BY sp.ordem, sp.id',
            'i',
            $fichaId,
        );
        $byItem = [];
        foreach ($series as $s) {
            $byItem[(int) $s['ficha_exercicio_id']][] = $s;
        }
        foreach ($items as &$item) {
            $item['series'] = $byItem[(int) $item['id']] ?? [];
        }
        unset($item);

        return $items;
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
        // Uma pausa ainda aberta termina junto com a sessão.
        $this->db->execute('UPDATE sessoes_pausas SET encerrada_em = ? WHERE sessao_id = ? AND encerrada_em IS NULL', 'si', $endedAtDb, $sessionId);
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
            'SELECT se.id, se.uuid, se.ordem, se.tipo_item, se.ficha_exercicio_id, se.exercicio_prescrito_id, p.uuid AS prescrito_uuid,
                    (SELECT fe.uuid FROM ficha_exercicios fe WHERE fe.id = se.ficha_exercicio_id) AS ficha_exercicio_uuid,
                    e.id AS exercicio_id, e.uuid AS exercicio_uuid, e.nome, e.modalidade, e.unilateral, e.convencao_carga, eq.id AS equipamento_id, eq.nome AS equipamento_nome
               FROM sessoes_exercicios se
               JOIN exercicios e ON e.id = se.exercicio_id
               LEFT JOIN equipamentos eq ON eq.id = e.equipamento_id
               LEFT JOIN exercicios p ON p.id = se.exercicio_prescrito_id
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
            'SELECT se.id, se.uuid, se.ordem, se.tipo_item, se.ficha_exercicio_id, se.exercicio_id, se.exercicio_prescrito_id, e.modalidade
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

    public function insertExercise(
        string $uuid,
        int $sessionId,
        int $exerciseId,
        int $order,
        string $itemType = 'adicionado',
        ?int $prescribedExerciseId = null,
        ?int $fichaExerciseId = null,
    ): int {
        $this->db->execute(
            'INSERT INTO sessoes_exercicios(uuid, sessao_id, exercicio_id, ordem, tipo_item, exercicio_prescrito_id, ficha_exercicio_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            'siiisii',
            $uuid,
            $sessionId,
            $exerciseId,
            $order,
            $itemType,
            $prescribedExerciseId,
            $fichaExerciseId,
        );

        return $this->db->lastInsertId();
    }

    /** Abre espaço logo depois de um item (para o substituto): desloca os seguintes, do último para o primeiro. */
    public function shiftOrdersAfter(int $sessionId, int $order): void
    {
        $this->db->execute('UPDATE sessoes_exercicios SET ordem = ordem + 1 WHERE sessao_id = ? AND ordem > ? ORDER BY ordem DESC', 'ii', $sessionId, $order);
    }

    /** Séries ainda pendentes passam para o exercício substituto; as realizadas ou ignoradas ficam no original. */
    public function migratePendingSeries(int $fromItemId, int $toItemId): int
    {
        return $this->db->execute("UPDATE sessoes_series SET sessao_exercicio_id = ?, revision = revision + 1 WHERE sessao_exercicio_id = ? AND status = 'pendente'", 'ii', $toItemId, $fromItemId);
    }

    /** @return array<string, mixed>|null pausa em aberto da sessão */
    public function openPause(int $sessionId): ?array
    {
        return $this->db->fetchOne('SELECT id, uuid, iniciada_em, encerrada_em FROM sessoes_pausas WHERE sessao_id = ? AND encerrada_em IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE', 'i', $sessionId);
    }

    public function insertPause(string $uuid, int $sessionId, string $startedAtDb): void
    {
        $this->db->execute('INSERT INTO sessoes_pausas(uuid, sessao_id, iniciada_em) VALUES (?, ?, ?)', 'sis', $uuid, $sessionId, $startedAtDb);
    }

    public function closePause(int $pauseId, string $endedAtDb): void
    {
        $this->db->execute('UPDATE sessoes_pausas SET encerrada_em = ? WHERE id = ?', 'si', $endedAtDb, $pauseId);
    }

    /** @return array<string, mixed>|null */
    public function findPause(string $uuid): ?array
    {
        return $this->db->fetchOne('SELECT id, uuid, iniciada_em, encerrada_em FROM sessoes_pausas WHERE uuid = ?', 's', $uuid);
    }

    /** @return list<array<string, mixed>> séries da sessão, com o id da linha do exercício da sessão */
    public function series(int $sessionId): array
    {
        return $this->db->fetchAll(
            'SELECT ss.id, ss.uuid, ss.sessao_exercicio_id, ss.ordem, ss.tipo, ss.carga_kg, ss.repeticoes, ss.duracao_segundos, ss.rir_real,
                    ss.status, ss.concluida_em, ss.revision, ss.atualizado_cliente_em,
                    (SELECT sp.uuid FROM series_prescritas sp WHERE sp.id = ss.serie_prescrita_id) AS serie_prescrita_uuid
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
                    ss.status, ss.concluida_em, ss.revision, ss.atualizado_cliente_em, ss.dispositivo_id, ss.serie_prescrita_id, e.modalidade
               FROM sessoes_series ss
               JOIN sessoes_exercicios se ON se.id = ss.sessao_exercicio_id
               JOIN exercicios e ON e.id = se.exercicio_id
              WHERE se.sessao_id = ? AND ss.uuid = ? FOR UPDATE',
            'is',
            $sessionId,
            $uuid,
        );
    }

    public function deleteSeries(int $seriesId): void
    {
        $this->db->execute('DELETE FROM sessoes_series WHERE id = ?', 'i', $seriesId);
    }

    public function nextSeriesOrder(int $sessionExerciseId): int
    {
        $row = $this->db->fetchOne('SELECT COALESCE(MAX(ordem), 0) + 1 AS n FROM sessoes_series WHERE sessao_exercicio_id = ? FOR UPDATE', 'i', $sessionExerciseId);

        return (int) ($row['n'] ?? 1);
    }

    public function insertSeries(string $uuid, int $sessionExerciseId, int $order, string $type, ?int $prescribedSeriesId = null): int
    {
        $this->db->execute(
            "INSERT INTO sessoes_series(uuid, sessao_exercicio_id, ordem, tipo, status, serie_prescrita_id) VALUES (?, ?, ?, ?, 'pendente', ?)",
            'siisi',
            $uuid,
            $sessionExerciseId,
            $order,
            $type,
            $prescribedSeriesId,
        );

        return $this->db->lastInsertId();
    }

    /** @param array<string, mixed> $fields coluna => valor (somente colunas conhecidas, definidas pelo serviço) */
    public function updateSeries(int $seriesId, array $fields): void
    {
        $allowed = [
            'carga_kg' => 'd', 'repeticoes' => 'i', 'duracao_segundos' => 'i', 'rir_real' => 'i', 'status' => 's',
            'concluida_em' => 's', 'atualizado_cliente_em' => 's', 'tipo' => 's', 'dispositivo_id' => 'i',
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
