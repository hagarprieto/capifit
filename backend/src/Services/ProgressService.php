<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\Dates;
use CapiFit\Support\Uuid;
use CapiFit\Validation\FieldErrors;

/** Último registro por exercício (E07-03) e resumo de evolução por período (E09-02). */
final class ProgressService
{
    private const MAX_BATCH = 50;
    private const MAX_RANGE_DAYS = 366;

    public function __construct(private readonly Connection $db)
    {
    }

    /** @return array<string, mixed> */
    public function lastRecord(AuthenticatedUser $user, string $exerciseUuid): array
    {
        $exercise = Uuid::isValid($exerciseUuid) ? $this->db->fetchOne('SELECT id, uuid FROM exercicios WHERE uuid = ?', 's', strtolower($exerciseUuid)) : null;
        $record = $exercise === null ? null : $this->findLast($user->id, (int) $exercise['id'], (string) $exercise['uuid']);
        if ($record === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return $record;
    }

    /**
     * @param array<string, mixed> $query
     * @return list<array<string, mixed>> só os exercícios que têm registro
     */
    public function lastRecords(AuthenticatedUser $user, array $query): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($query, ['ids']);
        $raw = $query['ids'] ?? null;
        $ids = [];
        if (!is_string($raw) || $raw === '') {
            $errors->add('ids', 'Informe os UUIDs separados por vírgula.');
        } else {
            $ids = array_values(array_unique(array_map(static fn (string $s): string => strtolower(trim($s)), explode(',', $raw))));
            if (count($ids) > self::MAX_BATCH) {
                $errors->add('ids', 'No máximo ' . self::MAX_BATCH . ' exercícios por chamada.');
            }
            foreach ($ids as $id) {
                if (!Uuid::isValid($id)) {
                    $errors->add('ids', 'Todos os itens devem ser UUIDs válidos.');
                    break;
                }
            }
        }
        $errors->throwIfAny();

        $result = [];
        foreach ($ids as $id) {
            $exercise = $this->db->fetchOne('SELECT id, uuid FROM exercicios WHERE uuid = ?', 's', $id);
            $record = $exercise === null ? null : $this->findLast($user->id, (int) $exercise['id'], (string) $exercise['uuid']);
            if ($record !== null) {
                $result[] = $record;
            }
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $query
     * @return array<string, mixed>
     */
    public function summary(AuthenticatedUser $user, array $query): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($query, ['de', 'ate']);
        $from = $this->day($query, 'de', $errors);
        $to = $this->day($query, 'ate', $errors);
        if ($from !== null && $to !== null) {
            if ($from > $to) {
                $errors->add('ate', 'Deve ser igual ou posterior a "de".');
            } elseif ($from->diff($to)->days >= self::MAX_RANGE_DAYS) {
                $errors->add('ate', 'O período máximo é de ' . self::MAX_RANGE_DAYS . ' dias.');
            }
        }
        $errors->throwIfAny();
        /** @var \DateTimeImmutable $from @var \DateTimeImmutable $to */

        // O dia é o do fuso horário do usuário (uma sessão às 23:30 locais conta no dia local, não no do UTC).
        $row = $this->db->fetchOne('SELECT fuso_horario FROM usuarios WHERE id = ?', 'i', $user->id);
        $zone = new \DateTimeZone(is_string($row['fuso_horario'] ?? null) ? $row['fuso_horario'] : 'UTC');
        $startLocal = new \DateTimeImmutable($from->format('Y-m-d') . ' 00:00:00', $zone);
        $endLocal = (new \DateTimeImmutable($to->format('Y-m-d') . ' 00:00:00', $zone))->modify('+1 day');
        $startDb = Dates::toDb($startLocal);
        $endDb = Dates::toDb($endLocal);

        $sessions = $this->db->fetchAll(
            "SELECT id, encerrada_em, duracao_ativa_segundos FROM sessoes_treino
              WHERE aluno_id = ? AND status = 'concluida' AND encerrada_em >= ? AND encerrada_em < ?",
            'iss',
            $user->id,
            $startDb,
            $endDb,
        );
        $totals = $this->db->fetchOne(
            "SELECT COUNT(*) AS series,
                    COALESCE(SUM(CASE WHEN ss.tipo <> 'aquecimento' AND e.modalidade IN ('reps_carga', 'reps_peso_corporal')
                                       AND ss.carga_kg IS NOT NULL AND ss.carga_kg > 0 AND ss.repeticoes IS NOT NULL
                                      THEN ss.carga_kg * ss.repeticoes ELSE 0 END), 0) AS volume
               FROM sessoes_series ss
               JOIN sessoes_exercicios se ON se.id = ss.sessao_exercicio_id
               JOIN exercicios e ON e.id = se.exercicio_id
               JOIN sessoes_treino s ON s.id = se.sessao_id
              WHERE s.aluno_id = ? AND s.status = 'concluida' AND s.encerrada_em >= ? AND s.encerrada_em < ? AND ss.status = 'realizada'",
            'iss',
            $user->id,
            $startDb,
            $endDb,
        );

        // Frequência por semana (segunda a domingo, no fuso do usuário), incluindo semanas sem treino.
        $perWeek = [];
        $cursor = $startLocal->modify('monday this week');
        while ($cursor < $endLocal) {
            $perWeek[$cursor->format('Y-m-d')] = 0;
            $cursor = $cursor->modify('+7 days');
        }
        $activeSeconds = 0;
        foreach ($sessions as $s) {
            $ended = \DateTimeImmutable::createFromFormat('!Y-m-d H:i:s.u', (string) $s['encerrada_em'], new \DateTimeZone('UTC'));
            if ($ended !== false) {
                $week = $ended->setTimezone($zone)->modify('monday this week')->format('Y-m-d');
                $perWeek[$week] = ($perWeek[$week] ?? 0) + 1;
            }
            $activeSeconds += (int) ($s['duracao_ativa_segundos'] ?? 0);
        }
        ksort($perWeek);

        return [
            'de' => $from->format('Y-m-d'),
            'ate' => $to->format('Y-m-d'),
            'sessoes_concluidas' => count($sessions),
            'series_realizadas' => (int) ($totals['series'] ?? 0),
            'tempo_ativo_segundos' => $activeSeconds,
            'volume_kg' => round((float) ($totals['volume'] ?? 0), 2),
            'frequencia_semanal' => array_map(static fn (string $week, int $n): array => ['semana_inicio' => $week, 'sessoes' => $n], array_keys($perWeek), array_values($perWeek)),
        ];
    }

    /** @return array<string, mixed>|null */
    private function findLast(int $userId, int $exerciseId, string $exerciseUuid): ?array
    {
        $session = $this->db->fetchOne(
            "SELECT s.id, s.uuid, s.encerrada_em FROM sessoes_treino s
              WHERE s.aluno_id = ? AND s.status = 'concluida'
                AND EXISTS (SELECT 1 FROM sessoes_series ss JOIN sessoes_exercicios se ON se.id = ss.sessao_exercicio_id
                             WHERE se.sessao_id = s.id AND se.exercicio_id = ? AND ss.status = 'realizada')
              ORDER BY s.encerrada_em DESC, s.id DESC LIMIT 1",
            'ii',
            $userId,
            $exerciseId,
        );
        if ($session === null) {
            return null;
        }
        $series = $this->db->fetchAll(
            "SELECT ss.ordem, ss.carga_kg, ss.repeticoes, ss.duracao_segundos
               FROM sessoes_series ss JOIN sessoes_exercicios se ON se.id = ss.sessao_exercicio_id
              WHERE se.sessao_id = ? AND se.exercicio_id = ? AND ss.status = 'realizada'
              ORDER BY se.ordem, ss.ordem",
            'ii',
            $session['id'],
            $exerciseId,
        );

        return [
            'exercicio_id' => $exerciseUuid,
            'sessao_id' => $session['uuid'],
            'data' => Dates::fromDb($session['encerrada_em']),
            'series' => array_map(static fn (array $r): array => [
                'ordem' => (int) $r['ordem'],
                'carga_kg' => $r['carga_kg'] === null ? null : (float) $r['carga_kg'],
                'repeticoes' => $r['repeticoes'] === null ? null : (int) $r['repeticoes'],
                'duracao_segundos' => $r['duracao_segundos'] === null ? null : (int) $r['duracao_segundos'],
            ], $series),
        ];
    }

    /** @param array<string, mixed> $query */
    private function day(array $query, string $field, FieldErrors $errors): ?\DateTimeImmutable
    {
        $value = $query[$field] ?? null;
        if (!is_string($value)) {
            $errors->add($field, 'Informe a data no formato AAAA-MM-DD.');

            return null;
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        $problems = \DateTimeImmutable::getLastErrors();
        if ($date === false || ($problems !== false && ($problems['warning_count'] > 0 || $problems['error_count'] > 0))) {
            $errors->add($field, 'Informe uma data válida no formato AAAA-MM-DD.');

            return null;
        }

        return $date;
    }
}
