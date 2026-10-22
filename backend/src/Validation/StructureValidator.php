<?php

declare(strict_types=1);

namespace CapiFit\Validation;

use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\Uuid;

/**
 * Valida e normaliza a estrutura de uma versão de programa (corpo de `PUT .../estrutura`).
 * Erros saem por caminho (ex.: `fichas.0.exercicios.1.series.0.reps_min`), no formato `details.fields` do contrato.
 * Regras: Doc 05 §7.3. Exercício precisa estar `publicado`.
 */
final class StructureValidator
{
    private const SERIES_TYPES = ['aquecimento', 'normal', 'preparatoria', 'dropset'];
    private const MAX_FICHAS = 14;
    private const MAX_EXERCISES = 30;
    private const MAX_SERIES = 20;

    public function __construct(private readonly Connection $db)
    {
    }

    /**
     * @param mixed $fichas valor do campo `fichas` do corpo
     * @return list<array<string, mixed>> estrutura normalizada (lança 422 se houver qualquer erro)
     */
    public function validate(mixed $fichas, FieldErrors $errors): array
    {
        if (!is_array($fichas) || !array_is_list($fichas)) {
            $errors->add('fichas', 'Deve ser uma lista de fichas.');

            return [];
        }
        if (count($fichas) > self::MAX_FICHAS) {
            $errors->add('fichas', 'No máximo ' . self::MAX_FICHAS . ' fichas.');

            return [];
        }

        $exerciseIds = $this->resolveExercises($fichas);
        $result = [];
        $codes = [];
        $orders = [];
        foreach ($fichas as $i => $ficha) {
            $p = "fichas.$i";
            if (!is_array($ficha)) {
                $errors->add($p, 'Deve ser um objeto.');
                continue;
            }
            $this->unknown($ficha, ['codigo', 'titulo', 'ordem', 'exercicios'], $p, $errors);
            $codigo = $this->text($ficha, 'codigo', 1, 25, "$p.codigo", $errors);
            $titulo = $this->text($ficha, 'titulo', 1, 160, "$p.titulo", $errors);
            $ordem = $this->integer($ficha, 'ordem', 1, 500, "$p.ordem", $errors, false);
            if ($codigo !== null) {
                if (isset($codes[mb_strtolower($codigo)])) {
                    $errors->add("$p.codigo", 'Já existe uma ficha com este código.');
                }
                $codes[mb_strtolower($codigo)] = true;
            }
            if ($ordem !== null) {
                if (isset($orders[$ordem])) {
                    $errors->add("$p.ordem", 'Já existe uma ficha nesta posição.');
                }
                $orders[$ordem] = true;
            }
            $exercicios = $this->exercises($ficha['exercicios'] ?? null, $exerciseIds, $p, $errors);
            $result[] = ['codigo' => $codigo, 'titulo' => $titulo, 'ordem' => $ordem, 'exercicios' => $exercicios];
        }
        $errors->throwIfAny();

        return $result;
    }

    /**
     * @param list<mixed> $fichas
     * @return array<string, int> uuid (minúsculo) → id dos exercícios publicados
     */
    private function resolveExercises(array $fichas): array
    {
        $uuids = [];
        foreach ($fichas as $ficha) {
            foreach (is_array($ficha) && is_array($ficha['exercicios'] ?? null) ? $ficha['exercicios'] : [] as $item) {
                $u = is_array($item) ? ($item['exercicio_uuid'] ?? null) : null;
                if (Uuid::isValid($u)) {
                    $uuids[strtolower((string) $u)] = true;
                }
            }
        }
        if ($uuids === []) {
            return [];
        }
        $list = array_keys($uuids);
        $marks = implode(',', array_fill(0, count($list), '?'));
        $rows = $this->db->fetchAll("SELECT id, uuid FROM exercicios WHERE status = 'publicado' AND uuid IN ($marks)", str_repeat('s', count($list)), ...$list);
        $map = [];
        foreach ($rows as $row) {
            $map[strtolower((string) $row['uuid'])] = (int) $row['id'];
        }

        return $map;
    }

    /**
     * @param array<string, int> $exerciseIds
     * @return list<array<string, mixed>>
     */
    private function exercises(mixed $list, array $exerciseIds, string $p, FieldErrors $errors): array
    {
        if (!is_array($list) || !array_is_list($list)) {
            $errors->add("$p.exercicios", 'Deve ser uma lista de exercícios.');

            return [];
        }
        if (count($list) > self::MAX_EXERCISES) {
            $errors->add("$p.exercicios", 'No máximo ' . self::MAX_EXERCISES . ' exercícios por ficha.');

            return [];
        }
        $out = [];
        $orders = [];
        foreach ($list as $j => $item) {
            $q = "$p.exercicios.$j";
            if (!is_array($item)) {
                $errors->add($q, 'Deve ser um objeto.');
                continue;
            }
            $this->unknown($item, ['exercicio_uuid', 'ordem', 'descanso_segundos', 'grupo_superset', 'instrucoes', 'series'], $q, $errors);
            $uuid = $item['exercicio_uuid'] ?? null;
            $exerciseId = null;
            if (!Uuid::isValid($uuid)) {
                $errors->add("$q.exercicio_uuid", 'Informe um UUID válido.');
            } elseif (!isset($exerciseIds[strtolower((string) $uuid)])) {
                $errors->add("$q.exercicio_uuid", 'Exercício inexistente ou não publicado.');
            } else {
                $exerciseId = $exerciseIds[strtolower((string) $uuid)];
            }
            $ordem = $this->integer($item, 'ordem', 1, 500, "$q.ordem", $errors, false);
            if ($ordem !== null) {
                if (isset($orders[$ordem])) {
                    $errors->add("$q.ordem", 'Já existe um exercício nesta posição da ficha.');
                }
                $orders[$ordem] = true;
            }
            $rest = $this->integer($item, 'descanso_segundos', 0, 3600, "$q.descanso_segundos", $errors, true);
            $superset = $item['grupo_superset'] ?? null;
            if ($superset !== null && (!is_string($superset) || $superset === '' || mb_strlen($superset) > 30)) {
                $errors->add("$q.grupo_superset", 'Deve ter até 30 caracteres.');
                $superset = null;
            }
            $notes = $item['instrucoes'] ?? null;
            if ($notes !== null && (!is_string($notes) || mb_strlen($notes) > 2000)) {
                $errors->add("$q.instrucoes", 'Deve ter até 2000 caracteres.');
                $notes = null;
            }
            $out[] = [
                'exercicio_id' => $exerciseId,
                'ordem' => $ordem,
                'grupo_superset' => $superset,
                'descanso_segundos' => $rest,
                'instrucoes' => $notes,
                'series' => $this->series($item['series'] ?? null, $q, $errors),
            ];
        }

        return $out;
    }

    /** @return list<array<string, mixed>> */
    private function series(mixed $list, string $q, FieldErrors $errors): array
    {
        if (!is_array($list) || !array_is_list($list) || $list === []) {
            $errors->add("$q.series", 'Informe ao menos uma série.');

            return [];
        }
        if (count($list) > self::MAX_SERIES) {
            $errors->add("$q.series", 'No máximo ' . self::MAX_SERIES . ' séries por exercício.');

            return [];
        }
        $out = [];
        $orders = [];
        foreach ($list as $k => $s) {
            $r = "$q.series.$k";
            if (!is_array($s)) {
                $errors->add($r, 'Deve ser um objeto.');
                continue;
            }
            $this->unknown($s, ['ordem', 'tipo', 'reps_min', 'reps_max', 'carga_alvo_kg', 'rir_alvo', 'duracao_alvo_segundos'], $r, $errors);
            $ordem = $this->integer($s, 'ordem', 1, 100, "$r.ordem", $errors, false);
            if ($ordem !== null) {
                if (isset($orders[$ordem])) {
                    $errors->add("$r.ordem", 'Já existe uma série nesta posição.');
                }
                $orders[$ordem] = true;
            }
            $type = $s['tipo'] ?? null;
            if (!is_string($type) || !in_array($type, self::SERIES_TYPES, true)) {
                $errors->add("$r.tipo", 'Use aquecimento, normal, preparatoria ou dropset.');
                $type = null;
            }
            $min = $this->integer($s, 'reps_min', 1, 1000, "$r.reps_min", $errors, true);
            $max = $this->integer($s, 'reps_max', 1, 1000, "$r.reps_max", $errors, true);
            if ($min !== null && $max !== null && $min > $max) {
                $errors->add("$r.reps_min", 'Não pode ser maior que reps_max.');
            }
            $load = $s['carga_alvo_kg'] ?? null;
            if ($load !== null && ((!is_int($load) && !is_float($load)) || $load < 0 || $load > 99999.99)) {
                $errors->add("$r.carga_alvo_kg", 'Deve ser um número entre 0 e 99999,99.');
                $load = null;
            }
            $out[] = [
                'ordem' => $ordem,
                'tipo' => $type,
                'reps_min' => $min,
                'reps_max' => $max,
                'carga_alvo_kg' => $load === null ? null : round((float) $load, 2),
                'rir_alvo' => $this->integer($s, 'rir_alvo', 0, 10, "$r.rir_alvo", $errors, true),
                'duracao_alvo_segundos' => $this->integer($s, 'duracao_alvo_segundos', 1, 65535, "$r.duracao_alvo_segundos", $errors, true),
            ];
        }

        return $out;
    }

    /**
     * @param array<mixed> $data
     * @param list<string> $allowed
     */
    private function unknown(array $data, array $allowed, string $path, FieldErrors $errors): void
    {
        foreach (array_keys($data) as $key) {
            if (!in_array($key, $allowed, true)) {
                $errors->add("$path." . (string) $key, 'Campo não permitido.');
            }
        }
    }

    /** @param array<mixed> $data */
    private function text(array $data, string $key, int $min, int $max, string $path, FieldErrors $errors): ?string
    {
        $v = $data[$key] ?? null;
        $v = is_string($v) ? trim($v) : $v;
        if (!is_string($v) || mb_strlen($v) < $min || mb_strlen($v) > $max) {
            $errors->add($path, "Deve ter entre $min e $max caracteres.");

            return null;
        }

        return $v;
    }

    /** @param array<mixed> $data */
    private function integer(array $data, string $key, int $min, int $max, string $path, FieldErrors $errors, bool $nullable): ?int
    {
        $v = $data[$key] ?? null;
        if ($v === null) {
            if (!$nullable) {
                $errors->add($path, 'Obrigatório.');
            }

            return null;
        }
        if (!is_int($v) || $v < $min || $v > $max) {
            $errors->add($path, "Deve ser um inteiro entre $min e $max.");

            return null;
        }

        return $v;
    }
}
