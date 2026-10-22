<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Presenters\ExercisePresenter;
use CapiFit\Repositories\CatalogRepository;
use CapiFit\Support\Dates;
use CapiFit\Support\Text;
use CapiFit\Support\Uuid;
use CapiFit\Validation\FieldErrors;

/**
 * Cadastro, revisão e publicação de exercícios (E03-05; Doc 09 §3). Só `admin`.
 *
 * Estados: `rascunho → em_revisao → publicado`. A aprovação do revisor fica registrada em `revisado_por/revisado_em`
 * enquanto o exercício segue `em_revisao` até alguém publicar; rejeitar devolve a `rascunho` com justificativa (na
 * auditoria). Quem cadastra não aprova (separação de funções). Só `publicado` aparece para os usuários.
 */
final class AdminExerciseService
{
    private const MODALITIES = ['reps_carga', 'reps_peso_corporal', 'reps_assistido', 'tempo'];
    private const DIFFICULTIES = ['iniciante', 'intermediario', 'avancado'];
    private const FIELDS = ['nome', 'equipamento_id', 'instrucoes', 'observacoes_seguranca', 'unilateral', 'modalidade', 'dificuldade', 'musculos'];

    public function __construct(
        private readonly Connection $db,
        private readonly CatalogRepository $catalog,
        private readonly AuditService $audit,
    ) {
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function create(AuthenticatedUser $user, array $input): array
    {
        $this->requireAdmin($user);
        $data = $this->validate($input, true, null);

        $uuid = Uuid::v4();
        $this->db->execute(
            "INSERT INTO exercicios(uuid, nome, nome_normalizado, equipamento_id, instrucoes, observacoes_seguranca, unilateral, modalidade, dificuldade, status, criado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?)",
            'sssississi',
            $uuid,
            $data['nome'],
            Text::normalize($data['nome']),
            $data['equipamento_id'] ?? null,
            $data['instrucoes'] ?? null,
            $data['observacoes_seguranca'] ?? null,
            (int) ($data['unilateral'] ?? false),
            $data['modalidade'] ?? 'reps_carga',
            $data['dificuldade'] ?? null,
            $user->id,
        );
        $id = $this->db->lastInsertId();
        $this->replaceMuscles($id, $data['musculos'] ?? []);
        $this->audit->record($user, 'exercicio.criado', 'exercicio', $uuid);

        return $this->present($this->row($uuid));
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function update(AuthenticatedUser $user, string $uuid, array $input): array
    {
        $this->requireAdmin($user);
        $row = $this->row($uuid, true);
        if ($row['status'] !== 'rascunho') {
            throw new ApiException(ErrorCode::InvalidState, 'Só é possível editar um exercício em rascunho.', ['estado' => $row['status']]);
        }
        if ($input === []) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['corpo' => ['Informe ao menos um campo.']]]);
        }
        $data = $this->validate($input, false, (int) $row['id']);

        $columns = [
            'nome' => 's', 'equipamento_id' => 'i', 'instrucoes' => 's', 'observacoes_seguranca' => 's', 'unilateral' => 'i',
            'modalidade' => 's', 'dificuldade' => 's',
        ];
        $sets = [];
        $types = '';
        $params = [];
        foreach ($columns as $column => $type) {
            if (!array_key_exists($column, $data)) {
                continue;
            }
            $sets[] = "$column = ?";
            $types .= $type;
            $params[] = $column === 'unilateral' ? (int) $data[$column] : $data[$column];
            if ($column === 'nome') {
                $sets[] = 'nome_normalizado = ?';
                $types .= 's';
                $params[] = Text::normalize((string) $data['nome']);
            }
        }
        if ($sets !== []) {
            $params[] = (int) $row['id'];
            $this->db->execute('UPDATE exercicios SET ' . implode(', ', $sets) . ' WHERE id = ?', $types . 'i', ...$params);
        }
        if (array_key_exists('musculos', $data)) {
            $this->replaceMuscles((int) $row['id'], $data['musculos']);
        }
        $this->audit->record($user, 'exercicio.editado', 'exercicio', $uuid, ['campos' => implode(',', array_keys($data))]);

        return $this->present($this->row($uuid));
    }

    /** @return array<string, mixed> rascunho → em_revisao (exige a ficha completa) */
    public function submitForReview(AuthenticatedUser $user, string $uuid): array
    {
        $this->requireAdmin($user);
        $row = $this->row($uuid, true);
        if ($row['status'] !== 'rascunho') {
            throw new ApiException(ErrorCode::InvalidState, 'Só um rascunho pode ser enviado para revisão.', ['estado' => $row['status']]);
        }
        $missing = [];
        foreach (['instrucoes' => 'Preencha as instruções.', 'dificuldade' => 'Informe a dificuldade.', 'equipamento_id' => 'Informe o equipamento.'] as $field => $message) {
            if ($row[$field] === null || $row[$field] === '') {
                $missing[$field] = [$message];
            }
        }
        $primary = (int) $this->db->fetchOne("SELECT COUNT(*) AS n FROM exercicios_musculos WHERE exercicio_id = ? AND papel = 'primario'", 'i', (int) $row['id'])['n'];
        if ($primary === 0) {
            $missing['musculos'] = ['Informe ao menos um grupo muscular primário.'];
        }
        if ($missing !== []) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => $missing]);
        }
        $this->db->execute("UPDATE exercicios SET status = 'em_revisao', revisado_por = NULL, revisado_em = NULL WHERE id = ?", 'i', (int) $row['id']);
        $this->audit->record($user, 'exercicio.enviado_revisao', 'exercicio', $uuid);

        return $this->present($this->row($uuid));
    }

    /**
     * Aprova ou rejeita. Quem cadastrou não revisa o próprio exercício (separação de funções).
     *
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function review(AuthenticatedUser $user, string $uuid, array $input): array
    {
        $this->requireAdmin($user);
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['decisao', 'justificativa']);
        $decision = $input['decisao'] ?? null;
        if (!is_string($decision) || !in_array($decision, ['aprovar', 'rejeitar'], true)) {
            $errors->add('decisao', 'Use aprovar ou rejeitar.');
        }
        $reason = $input['justificativa'] ?? null;
        $reason = is_string($reason) ? trim($reason) : $reason;
        if ($reason !== null && (!is_string($reason) || mb_strlen($reason) > 1000)) {
            $errors->add('justificativa', 'Deve ter até 1000 caracteres.');
        } elseif ($decision === 'rejeitar' && ($reason === null || $reason === '')) {
            $errors->add('justificativa', 'Informe a justificativa da rejeição.');
        }
        $errors->throwIfAny();

        $row = $this->row($uuid, true);
        if ($row['status'] !== 'em_revisao' || $row['revisado_por'] !== null) {
            throw new ApiException(ErrorCode::InvalidState, 'Este exercício não está aguardando revisão.', ['estado' => $row['status']]);
        }
        if ($row['criado_por'] !== null && (int) $row['criado_por'] === $user->id) {
            throw new ApiException(ErrorCode::Forbidden, 'Quem cadastrou o exercício não pode revisá-lo.');
        }
        if ($decision === 'aprovar') {
            $this->db->execute('UPDATE exercicios SET revisado_por = ?, revisado_em = NOW(6) WHERE id = ?', 'ii', $user->id, (int) $row['id']);
            $this->audit->record($user, 'exercicio.aprovado', 'exercicio', $uuid);
        } else {
            $this->db->execute("UPDATE exercicios SET status = 'rascunho', revisado_por = NULL, revisado_em = NULL WHERE id = ?", 'i', (int) $row['id']);
            $this->audit->record($user, 'exercicio.rejeitado', 'exercicio', $uuid, ['justificativa' => (string) $reason]);
        }

        return $this->present($this->row($uuid));
    }

    /** @return array<string, mixed> publica um exercício aprovado e com instrução textual (CT-72) */
    public function publish(AuthenticatedUser $user, string $uuid): array
    {
        $this->requireAdmin($user);
        $row = $this->row($uuid, true);
        if ($row['status'] !== 'em_revisao' || $row['revisado_por'] === null) {
            throw new ApiException(ErrorCode::InvalidState, 'Só um exercício com revisão aprovada pode ser publicado.', ['estado' => $row['status']]);
        }
        if (trim((string) $row['instrucoes']) === '') {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['instrucoes' => ['A instrução textual é obrigatória para publicar.']]]);
        }
        $this->db->execute("UPDATE exercicios SET status = 'publicado' WHERE id = ?", 'i', (int) $row['id']);
        $this->audit->record($user, 'exercicio.publicado', 'exercicio', $uuid);

        return $this->present($this->row($uuid));
    }

    // ---------------------------------------------------------------------------------------------------

    private function requireAdmin(AuthenticatedUser $user): void
    {
        if (!$user->hasRole('admin')) {
            throw new ApiException(ErrorCode::Forbidden);
        }
    }

    /** @return array<string, mixed> */
    private function row(string $uuid, bool $forUpdate = false): array
    {
        $row = Uuid::isValid($uuid)
            ? $this->db->fetchOne(
                'SELECT e.id, e.uuid, e.nome, e.modalidade, e.unilateral, e.dificuldade, e.instrucoes, e.observacoes_seguranca, e.status, e.criado_por,
                        e.revisado_por, e.revisado_em, e.equipamento_id, eq.nome AS equipamento_nome
                   FROM exercicios e LEFT JOIN equipamentos eq ON eq.id = e.equipamento_id WHERE e.uuid = ?' . ($forUpdate ? ' FOR UPDATE' : ''),
                's',
                strtolower($uuid),
            )
            : null;
        if ($row === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return $row;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed> campos válidos e normalizados (apenas os informados, ou todos na criação)
     */
    private function validate(array $input, bool $creating, ?int $selfId): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, self::FIELDS);
        $data = [];

        if ($creating || array_key_exists('nome', $input)) {
            $name = $input['nome'] ?? null;
            $name = is_string($name) ? trim($name) : $name;
            if (!is_string($name) || mb_strlen($name) < 1 || mb_strlen($name) > 180) {
                $errors->add('nome', 'Deve ter entre 1 e 180 caracteres.');
            } else {
                $normalized = Text::normalize($name);
                $dup = $this->db->fetchOne(
                    "SELECT e.id FROM exercicios e WHERE e.status <> 'arquivado' AND e.id <> ? AND (e.nome_normalizado = ?
                       OR EXISTS (SELECT 1 FROM exercicios_sinonimos s WHERE s.exercicio_id = e.id AND s.termo_normalizado = ?)) LIMIT 1",
                    'iss',
                    $selfId ?? 0,
                    $normalized,
                    $normalized,
                );
                if ($dup !== null) {
                    $errors->add('nome', 'Já existe um exercício com este nome (ou sinônimo).');
                } else {
                    $data['nome'] = $name;
                }
            }
        }
        if (array_key_exists('equipamento_id', $input)) {
            $v = $input['equipamento_id'];
            if ($v === null) {
                $data['equipamento_id'] = null;
            } elseif (!is_string($v) || preg_match('/^\d{1,5}$/', $v) !== 1 || $this->db->fetchOne('SELECT 1 AS x FROM equipamentos WHERE id = ?', 'i', (int) $v) === null) {
                $errors->add('equipamento_id', 'Equipamento inexistente.');
            } else {
                $data['equipamento_id'] = (int) $v;
            }
        }
        foreach (['instrucoes' => 10000, 'observacoes_seguranca' => 5000] as $field => $max) {
            if (array_key_exists($field, $input)) {
                $v = $input[$field];
                if (!is_string($v) || mb_strlen($v) > $max) {
                    $errors->add($field, "Deve ter até $max caracteres.");
                } else {
                    $data[$field] = trim($v) === '' ? null : trim($v);
                }
            }
        }
        if (array_key_exists('unilateral', $input)) {
            if (!is_bool($input['unilateral'])) {
                $errors->add('unilateral', 'Deve ser verdadeiro ou falso.');
            } else {
                $data['unilateral'] = $input['unilateral'];
            }
        }
        if (array_key_exists('modalidade', $input)) {
            if (!is_string($input['modalidade']) || !in_array($input['modalidade'], self::MODALITIES, true)) {
                $errors->add('modalidade', 'Use reps_carga, reps_peso_corporal, reps_assistido ou tempo.');
            } else {
                $data['modalidade'] = $input['modalidade'];
            }
        }
        if (array_key_exists('dificuldade', $input)) {
            if (!is_string($input['dificuldade']) || !in_array($input['dificuldade'], self::DIFFICULTIES, true)) {
                $errors->add('dificuldade', 'Use iniciante, intermediario ou avancado.');
            } else {
                $data['dificuldade'] = $input['dificuldade'];
            }
        }
        if (array_key_exists('musculos', $input)) {
            $muscles = $input['musculos'];
            $clean = [];
            $seen = [];
            if (!is_array($muscles) || !array_is_list($muscles) || count($muscles) > 16) {
                $errors->add('musculos', 'Deve ser uma lista de até 16 grupos.');
            } else {
                foreach ($muscles as $i => $m) {
                    $group = is_array($m) && is_string($m['grupo_id'] ?? null) && preg_match('/^\d{1,5}$/', $m['grupo_id']) === 1 ? (int) $m['grupo_id'] : 0;
                    $role = is_array($m) ? ($m['papel'] ?? null) : null;
                    if (is_array($m) && array_diff(array_keys($m), ['grupo_id', 'papel']) !== []) {
                        $errors->add("musculos.$i", 'Campos permitidos: grupo_id e papel.');
                    } elseif ($group === 0 || $this->db->fetchOne('SELECT 1 AS x FROM grupos_musculares WHERE id = ?', 'i', $group) === null) {
                        $errors->add("musculos.$i.grupo_id", 'Grupo muscular inexistente.');
                    } elseif (!is_string($role) || !in_array($role, ['primario', 'secundario'], true)) {
                        $errors->add("musculos.$i.papel", 'Use primario ou secundario.');
                    } elseif (isset($seen[$group])) {
                        $errors->add("musculos.$i.grupo_id", 'Grupo repetido.');
                    } else {
                        $seen[$group] = true;
                        $clean[] = ['grupo_id' => $group, 'papel' => $role];
                    }
                }
            }
            $data['musculos'] = $clean;
        }
        $errors->throwIfAny();

        return $data;
    }

    /** @param list<array{grupo_id: int, papel: string}> $muscles */
    private function replaceMuscles(int $exerciseId, array $muscles): void
    {
        $this->db->execute('DELETE FROM exercicios_musculos WHERE exercicio_id = ?', 'i', $exerciseId);
        foreach ($muscles as $m) {
            $this->db->execute('INSERT INTO exercicios_musculos(exercicio_id, grupo_id, papel) VALUES (?, ?, ?)', 'iis', $exerciseId, $m['grupo_id'], $m['papel']);
        }
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function present(array $row): array
    {
        return [
            'id' => $row['uuid'],
            'nome' => $row['nome'],
            'equipamento' => ExercisePresenter::equipment($row),
            'musculos' => $this->catalog->muscles((int) $row['id']),
            'unilateral' => (bool) $row['unilateral'],
            'modalidade' => $row['modalidade'],
            'dificuldade' => $row['dificuldade'],
            'instrucoes' => $row['instrucoes'],
            'observacoes_seguranca' => $row['observacoes_seguranca'],
            'midias' => [],
            'status' => $row['status'],
            'revisado_em' => Dates::fromDb($row['revisado_em']),
        ];
    }
}
