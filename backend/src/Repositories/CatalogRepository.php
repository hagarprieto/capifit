<?php

declare(strict_types=1);

namespace CapiFit\Repositories;

use CapiFit\Infrastructure\Database\Connection;

/**
 * Leitura do catálogo para usuários finais: só exercícios `publicado` e mídias `aprovado`
 * (RG-016, BR-09). Valores sempre por parâmetros; as únicas partes dinâmicas do SQL são
 * fragmentos fixos escolhidos pelo código.
 */
final class CatalogRepository
{
    public function __construct(private readonly Connection $db)
    {
    }

    /**
     * @param array{string, int}|null $after posição do cursor (texto de ordenação, id)
     * @return list<array<string, mixed>> linhas de exercícios (até $limit + 1, para detectar próxima página)
     */
    public function search(string $normalizedQuery, ?int $groupId, ?int $equipmentId, ?array $after, int $limit): array
    {
        $where = ["e.status = 'publicado'"];
        $types = '';
        $params = [];

        if ($normalizedQuery !== '') {
            $like = '%' . \CapiFit\Support\Text::escapeLike($normalizedQuery) . '%';
            $where[] = '(e.nome_normalizado LIKE ? OR EXISTS (SELECT 1 FROM exercicios_sinonimos s WHERE s.exercicio_id = e.id AND s.termo_normalizado LIKE ?))';
            $types .= 'ss';
            array_push($params, $like, $like);
        }
        if ($groupId !== null) {
            $where[] = 'EXISTS (SELECT 1 FROM exercicios_musculos m WHERE m.exercicio_id = e.id AND m.grupo_id = ?)';
            $types .= 'i';
            $params[] = $groupId;
        }
        if ($equipmentId !== null) {
            $where[] = 'e.equipamento_id = ?';
            $types .= 'i';
            $params[] = $equipmentId;
        }
        if ($after !== null) {
            $where[] = '(e.nome_normalizado > ? OR (e.nome_normalizado = ? AND e.id > ?))';
            $types .= 'ssi';
            array_push($params, $after[0], $after[0], $after[1]);
        }
        $types .= 'i';
        $params[] = $limit + 1;

        return $this->db->fetchAll(
            'SELECT e.id, e.uuid, e.nome, e.nome_normalizado, e.modalidade, eq.id AS equipamento_id, eq.nome AS equipamento_nome
               FROM exercicios e
               LEFT JOIN equipamentos eq ON eq.id = e.equipamento_id
              WHERE ' . implode(' AND ', $where) . '
              ORDER BY e.nome_normalizado, e.id
              LIMIT ?',
            $types,
            ...$params,
        );
    }

    /** @return array<string, mixed>|null */
    public function findPublished(string $uuid): ?array
    {
        return $this->db->fetchOne(
            "SELECT e.id, e.uuid, e.nome, e.modalidade, e.unilateral, e.dificuldade, e.instrucoes, e.observacoes_seguranca,
                    eq.id AS equipamento_id, eq.nome AS equipamento_nome
               FROM exercicios e
               LEFT JOIN equipamentos eq ON eq.id = e.equipamento_id
              WHERE e.uuid = ? AND e.status = 'publicado'",
            's',
            $uuid,
        );
    }

    /**
     * Grupos primários de vários exercícios de uma vez (evita uma consulta por item).
     *
     * @param list<int> $exerciseIds
     * @return array<int, list<array{id: string, nome: string}>>
     */
    public function primaryGroups(array $exerciseIds): array
    {
        if ($exerciseIds === []) {
            return [];
        }
        $marks = implode(',', array_fill(0, count($exerciseIds), '?'));
        $rows = $this->db->fetchAll(
            "SELECT m.exercicio_id, g.id, g.nome FROM exercicios_musculos m JOIN grupos_musculares g ON g.id = m.grupo_id
              WHERE m.papel = 'primario' AND m.exercicio_id IN ($marks) ORDER BY g.nome",
            str_repeat('i', count($exerciseIds)),
            ...$exerciseIds,
        );
        $byExercise = [];
        foreach ($rows as $row) {
            $byExercise[(int) $row['exercicio_id']][] = ['id' => (string) $row['id'], 'nome' => (string) $row['nome']];
        }

        return $byExercise;
    }

    /** @return list<array{id: string, nome: string, papel: string}> */
    public function muscles(int $exerciseId): array
    {
        $rows = $this->db->fetchAll(
            "SELECT g.id, g.nome, m.papel FROM exercicios_musculos m JOIN grupos_musculares g ON g.id = m.grupo_id
              WHERE m.exercicio_id = ? ORDER BY m.papel, g.nome",
            'i',
            $exerciseId,
        );

        return array_map(static fn (array $r): array => ['id' => (string) $r['id'], 'nome' => (string) $r['nome'], 'papel' => (string) $r['papel']], $rows);
    }

    /** @return list<array<string, mixed>> */
    public function alternatives(int $exerciseId): array
    {
        return $this->db->fetchAll(
            "SELECT a.id, a.uuid, a.nome, a.nome_normalizado, a.modalidade, eq.id AS equipamento_id, eq.nome AS equipamento_nome
               FROM exercicios_alternativas ea
               JOIN exercicios a ON a.id = ea.alternativa_id AND a.status = 'publicado'
               LEFT JOIN equipamentos eq ON eq.id = a.equipamento_id
              WHERE ea.exercicio_id = ?
              ORDER BY a.nome_normalizado, a.id",
            'i',
            $exerciseId,
        );
    }

    /** @return list<array<string, mixed>> somente mídia APROVADA */
    public function approvedMedia(int $exerciseId): array
    {
        return $this->db->fetchAll(
            "SELECT id, tipo, versao, url_storage FROM midias_exercicio WHERE exercicio_id = ? AND status = 'aprovado' ORDER BY id",
            'i',
            $exerciseId,
        );
    }

    /** @return list<array{id: string, nome: string}> */
    public function taxonomy(string $table): array
    {
        // Nome da tabela vem do código (lista fixa), nunca do cliente.
        $allowed = ['grupos_musculares', 'equipamentos'];
        if (!in_array($table, $allowed, true)) {
            throw new \InvalidArgumentException('Tabela de taxonomia desconhecida.');
        }
        $rows = $this->db->fetchAll("SELECT id, nome FROM $table ORDER BY nome");

        return array_map(static fn (array $r): array => ['id' => (string) $r['id'], 'nome' => (string) $r['nome']], $rows);
    }
}
