<?php

declare(strict_types=1);

namespace CapiFit\Repositories;

use CapiFit\Infrastructure\Database\Connection;

/**
 * Programas, versões e programa ativo do aluno. Todo acesso é pelo DONO e respeita a regra de visibilidade
 * (RG-019): programa de coach só aparece ao aluno depois de existir um aceite (`aceites_programa`).
 */
final class ProgramRepository
{
    private const PROGRAM_COLUMNS = "p.id, p.uuid, p.aluno_id, p.autor_id, p.origem, p.titulo, p.objetivo, p.status, p.versao_atual_id,
        p.derivado_de_programa_id, p.criado_em, p.atualizado_em, a.uuid AS autor_uuid, a.nome AS autor_nome,
        (SELECT v.numero FROM versoes_programa v WHERE v.id = p.versao_atual_id) AS versao_atual,
        (SELECT MAX(v.numero) FROM versoes_programa v WHERE v.programa_id = p.id AND v.estado = 'rascunho') AS versao_rascunho,
        (SELECT d.uuid FROM programas_treino d WHERE d.id = p.derivado_de_programa_id) AS derivado_uuid";

    private const VISIBLE = "p.aluno_id = ? AND (p.origem <> 'coach' OR EXISTS (SELECT 1 FROM aceites_programa ac WHERE ac.programa_id = p.id))";

    public function __construct(private readonly Connection $db)
    {
    }

    /** @return array<string, mixed>|null */
    public function findVisible(string $uuid, int $userId, bool $forUpdate = false): ?array
    {
        return $this->db->fetchOne(
            'SELECT ' . self::PROGRAM_COLUMNS . ' FROM programas_treino p JOIN usuarios a ON a.id = p.autor_id WHERE p.uuid = ? AND ' . self::VISIBLE . ($forUpdate ? ' FOR UPDATE' : ''),
            'si',
            $uuid,
            $userId,
        );
    }

    public function insertProgram(string $uuid, int $userId, string $origin, string $title, ?string $objective, ?int $derivedFromId): int
    {
        $this->db->execute(
            "INSERT INTO programas_treino(uuid, aluno_id, autor_id, origem, titulo, objetivo, status, derivado_de_programa_id) VALUES (?, ?, ?, ?, ?, ?, 'rascunho', ?)",
            'siisssi',
            $uuid,
            $userId,
            $userId,
            $origin,
            $title,
            $objective,
            $derivedFromId,
        );

        return $this->db->lastInsertId();
    }

    public function uuidOf(int $programId): ?string
    {
        $row = $this->db->fetchOne('SELECT uuid FROM programas_treino WHERE id = ?', 'i', $programId);

        return $row === null ? null : (string) $row['uuid'];
    }

    /**
     * @param array{string, int}|null $after (criado_em no formato do banco, id)
     * @return list<array<string, mixed>>
     */
    public function list(int $userId, ?string $origin, ?string $status, ?array $after, int $limit): array
    {
        $where = [self::VISIBLE];
        $types = 'i';
        $params = [$userId];
        if ($origin !== null) {
            $where[] = 'p.origem = ?';
            $types .= 's';
            $params[] = $origin;
        }
        if ($status !== null) {
            $where[] = 'p.status = ?';
            $types .= 's';
            $params[] = $status;
        }
        if ($after !== null) {
            $where[] = '(p.criado_em < ? OR (p.criado_em = ? AND p.id < ?))';
            $types .= 'ssi';
            array_push($params, $after[0], $after[0], $after[1]);
        }
        $types .= 'i';
        $params[] = $limit + 1;

        return $this->db->fetchAll(
            'SELECT ' . self::PROGRAM_COLUMNS . ' FROM programas_treino p JOIN usuarios a ON a.id = p.autor_id WHERE ' . implode(' AND ', $where) . ' ORDER BY p.criado_em DESC, p.id DESC LIMIT ?',
            $types,
            ...$params,
        );
    }

    /** @param array<string, ?string> $fields coluna (titulo|objetivo) => valor */
    public function updateMeta(int $programId, array $fields): void
    {
        $allowed = ['titulo', 'objetivo'];
        $sets = [];
        $params = [];
        foreach ($fields as $column => $value) {
            if (!in_array($column, $allowed, true)) {
                throw new \InvalidArgumentException("Coluna não permitida: $column");
            }
            $sets[] = "$column = ?";
            $params[] = $value;
        }
        $params[] = $programId;
        $this->db->execute('UPDATE programas_treino SET ' . implode(', ', $sets) . ' WHERE id = ?', str_repeat('s', count($fields)) . 'i', ...$params);
    }

    public function touch(int $programId): void
    {
        $this->db->execute('UPDATE programas_treino SET atualizado_em = NOW(6) WHERE id = ?', 'i', $programId);
    }

    public function insertVersion(int $programId, int $number): int
    {
        $this->db->execute("INSERT INTO versoes_programa(programa_id, numero, estado) VALUES (?, ?, 'rascunho')", 'ii', $programId, $number);

        return $this->db->lastInsertId();
    }

    /** @return array<string, mixed>|null */
    public function findVersion(int $programId, int $number, bool $forUpdate = false): ?array
    {
        return $this->db->fetchOne(
            'SELECT id, programa_id, numero, estado, revision, notas, gerador_versao, publicado_em FROM versoes_programa WHERE programa_id = ? AND numero = ?' . ($forUpdate ? ' FOR UPDATE' : ''),
            'ii',
            $programId,
            $number,
        );
    }

    public function latestVersionNumber(int $programId): int
    {
        return (int) ($this->db->fetchOne('SELECT COALESCE(MAX(numero), 0) AS n FROM versoes_programa WHERE programa_id = ?', 'i', $programId)['n'] ?? 0);
    }

    /** @return array<string, mixed>|null */
    public function draftVersion(int $programId): ?array
    {
        return $this->db->fetchOne("SELECT id, numero FROM versoes_programa WHERE programa_id = ? AND estado = 'rascunho' ORDER BY numero DESC LIMIT 1", 'i', $programId);
    }

    public function bumpRevision(int $versionId): void
    {
        $this->db->execute('UPDATE versoes_programa SET revision = revision + 1 WHERE id = ?', 'i', $versionId);
    }

    /** @return int quantos itens da versão usam exercício que NÃO está mais publicado */
    public function unpublishedExerciseCount(int $versionId): int
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM ficha_exercicios fe JOIN fichas_treino f ON f.id = fe.ficha_id JOIN exercicios e ON e.id = fe.exercicio_id
              WHERE f.versao_id = ? AND e.status <> 'publicado'",
            'i',
            $versionId,
        );

        return (int) ($row['n'] ?? 0);
    }

    public function publishVersion(int $programId, int $versionId, int $userId): void
    {
        // A anterior vira "substituída" antes; a publicada não volta a rascunho (trigger tg_versoes_bu).
        $this->db->execute("UPDATE versoes_programa SET estado = 'substituido' WHERE programa_id = ? AND estado = 'publicado'", 'i', $programId);
        $this->db->execute("UPDATE versoes_programa SET estado = 'publicado', publicado_por = ?, publicado_em = NOW(6) WHERE id = ?", 'ii', $userId, $versionId);
        $this->db->execute("UPDATE programas_treino SET versao_atual_id = ?, status = 'publicado' WHERE id = ?", 'ii', $versionId, $programId);
    }

    public function archive(int $programId): void
    {
        $this->db->execute("UPDATE programas_treino SET status = 'arquivado' WHERE id = ?", 'i', $programId);
    }

    public function clearActiveIf(int $userId, int $programId): void
    {
        $this->db->execute('DELETE FROM programas_ativos WHERE aluno_id = ? AND programa_id = ?', 'ii', $userId, $programId);
    }

    public function setActive(int $userId, int $programId, int $versionId): void
    {
        $this->db->execute(
            'INSERT INTO programas_ativos(aluno_id, programa_id, versao_id, ativado_em) VALUES (?, ?, ?, NOW(6))
             ON DUPLICATE KEY UPDATE programa_id = VALUES(programa_id), versao_id = VALUES(versao_id), ativado_em = VALUES(ativado_em)',
            'iii',
            $userId,
            $programId,
            $versionId,
        );
    }

    /** @return array<string, mixed>|null programa ativo do aluno (uuid do programa, versão e instante) */
    public function active(int $userId): ?array
    {
        return $this->db->fetchOne(
            'SELECT pa.ativado_em, pa.programa_id, pa.versao_id, p.uuid AS programa_uuid, v.numero AS versao_numero
               FROM programas_ativos pa
               JOIN programas_treino p ON p.id = pa.programa_id
               JOIN versoes_programa v ON v.id = pa.versao_id
              WHERE pa.aluno_id = ?',
            'i',
            $userId,
        );
    }

    public function hasAcceptedPrescription(int $programId, int $versionId): bool
    {
        return $this->db->fetchOne("SELECT 1 AS x FROM aceites_programa WHERE programa_id = ? AND versao_id = ? AND estado = 'aceito'", 'ii', $programId, $versionId) !== null;
    }

    /** @return list<string> papéis do usuário (para o autor exibido no programa) */
    public function rolesOf(int $userId): array
    {
        return array_map(
            static fn (array $r): string => (string) $r['codigo'],
            $this->db->fetchAll('SELECT p.codigo FROM usuarios_papeis up JOIN papeis p ON p.id = up.papel_id WHERE up.usuario_id = ? ORDER BY p.id', 'i', $userId),
        );
    }
}
