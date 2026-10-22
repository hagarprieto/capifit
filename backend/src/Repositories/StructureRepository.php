<?php

declare(strict_types=1);

namespace CapiFit\Repositories;

use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\Uuid;

/**
 * Estrutura de uma versão de programa: fichas → exercícios → séries prescritas.
 * Gravação só em versão `rascunho` (os triggers do banco recusam qualquer mudança em versão publicada).
 */
final class StructureRepository
{
    public function __construct(private readonly Connection $db)
    {
    }

    /**
     * Estrutura completa (com os dados do exercício para apresentação), ordenada.
     *
     * @return list<array<string, mixed>>
     */
    public function load(int $versionId): array
    {
        $fichas = $this->db->fetchAll('SELECT id, uuid, codigo, titulo, ordem FROM fichas_treino WHERE versao_id = ? ORDER BY ordem, id', 'i', $versionId);
        if ($fichas === []) {
            return [];
        }
        $items = $this->db->fetchAll(
            'SELECT fe.id, fe.uuid, fe.ficha_id, fe.ordem, fe.grupo_superset, fe.descanso_segundos, fe.instrucoes,
                    e.id AS exercicio_id, e.uuid AS exercicio_uuid, e.nome, e.modalidade, eq.id AS equipamento_id, eq.nome AS equipamento_nome
               FROM ficha_exercicios fe
               JOIN fichas_treino f ON f.id = fe.ficha_id
               JOIN exercicios e ON e.id = fe.exercicio_id
               LEFT JOIN equipamentos eq ON eq.id = e.equipamento_id
              WHERE f.versao_id = ? ORDER BY fe.ordem, fe.id',
            'i',
            $versionId,
        );
        $series = $this->db->fetchAll(
            'SELECT sp.id, sp.uuid, sp.ficha_exercicio_id, sp.ordem, sp.tipo, sp.reps_min, sp.reps_max, sp.carga_alvo_kg, sp.rir_alvo, sp.duracao_alvo_segundos
               FROM series_prescritas sp
               JOIN ficha_exercicios fe ON fe.id = sp.ficha_exercicio_id
               JOIN fichas_treino f ON f.id = fe.ficha_id
              WHERE f.versao_id = ? ORDER BY sp.ordem, sp.id',
            'i',
            $versionId,
        );

        $seriesByItem = [];
        foreach ($series as $s) {
            $seriesByItem[(int) $s['ficha_exercicio_id']][] = $s;
        }
        $itemsByFicha = [];
        foreach ($items as $item) {
            $item['series'] = $seriesByItem[(int) $item['id']] ?? [];
            $itemsByFicha[(int) $item['ficha_id']][] = $item;
        }
        foreach ($fichas as &$ficha) {
            $ficha['exercicios'] = $itemsByFicha[(int) $ficha['id']] ?? [];
        }
        unset($ficha);

        return $fichas;
    }

    /** Remove toda a estrutura de uma versão em rascunho (séries → exercícios → fichas). */
    public function clear(int $versionId): void
    {
        $this->db->execute('DELETE sp FROM series_prescritas sp JOIN ficha_exercicios fe ON fe.id = sp.ficha_exercicio_id JOIN fichas_treino f ON f.id = fe.ficha_id WHERE f.versao_id = ?', 'i', $versionId);
        $this->db->execute('DELETE fe FROM ficha_exercicios fe JOIN fichas_treino f ON f.id = fe.ficha_id WHERE f.versao_id = ?', 'i', $versionId);
        $this->db->execute('DELETE FROM fichas_treino WHERE versao_id = ?', 'i', $versionId);
    }

    /**
     * Grava a estrutura já validada, com UUIDs novos.
     *
     * @param list<array<string, mixed>> $fichas formato normalizado pelo StructureValidator
     */
    public function insert(int $versionId, array $fichas): void
    {
        foreach ($fichas as $ficha) {
            $this->db->execute(
                'INSERT INTO fichas_treino(uuid, versao_id, codigo, titulo, ordem) VALUES (?, ?, ?, ?, ?)',
                'sissi',
                Uuid::v4(),
                $versionId,
                $ficha['codigo'],
                $ficha['titulo'],
                $ficha['ordem'],
            );
            $fichaId = $this->db->lastInsertId();
            foreach ($ficha['exercicios'] as $item) {
                $this->db->execute(
                    'INSERT INTO ficha_exercicios(uuid, ficha_id, exercicio_id, ordem, grupo_superset, descanso_segundos, instrucoes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    'siiisis',
                    Uuid::v4(),
                    $fichaId,
                    $item['exercicio_id'],
                    $item['ordem'],
                    $item['grupo_superset'],
                    $item['descanso_segundos'],
                    $item['instrucoes'],
                );
                $itemId = $this->db->lastInsertId();
                foreach ($item['series'] as $s) {
                    $this->db->execute(
                        'INSERT INTO series_prescritas(uuid, ficha_exercicio_id, ordem, tipo, reps_min, reps_max, carga_alvo_kg, rir_alvo, duracao_alvo_segundos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        'siisiidii',
                        Uuid::v4(),
                        $itemId,
                        $s['ordem'],
                        $s['tipo'],
                        $s['reps_min'],
                        $s['reps_max'],
                        $s['carga_alvo_kg'],
                        $s['rir_alvo'],
                        $s['duracao_alvo_segundos'],
                    );
                }
            }
        }
    }

    /**
     * Converte a estrutura lida do banco (load) no formato de gravação, para copiar uma versão.
     *
     * @param list<array<string, mixed>> $loaded
     * @return list<array<string, mixed>>
     */
    public static function toInsertFormat(array $loaded): array
    {
        return array_map(static fn (array $f): array => [
            'codigo' => $f['codigo'],
            'titulo' => $f['titulo'],
            'ordem' => (int) $f['ordem'],
            'exercicios' => array_map(static fn (array $e): array => [
                'exercicio_id' => (int) $e['exercicio_id'],
                'ordem' => (int) $e['ordem'],
                'grupo_superset' => $e['grupo_superset'],
                'descanso_segundos' => $e['descanso_segundos'] === null ? null : (int) $e['descanso_segundos'],
                'instrucoes' => $e['instrucoes'],
                'series' => array_map(static fn (array $s): array => [
                    'ordem' => (int) $s['ordem'],
                    'tipo' => $s['tipo'],
                    'reps_min' => $s['reps_min'] === null ? null : (int) $s['reps_min'],
                    'reps_max' => $s['reps_max'] === null ? null : (int) $s['reps_max'],
                    'carga_alvo_kg' => $s['carga_alvo_kg'] === null ? null : (float) $s['carga_alvo_kg'],
                    'rir_alvo' => $s['rir_alvo'] === null ? null : (int) $s['rir_alvo'],
                    'duracao_alvo_segundos' => $s['duracao_alvo_segundos'] === null ? null : (int) $s['duracao_alvo_segundos'],
                ], $e['series']),
            ], $f['exercicios']),
        ], $loaded);
    }
}
