<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Presenters\ExercisePresenter;
use CapiFit\Repositories\CatalogRepository;
use CapiFit\Repositories\ProgramRepository;
use CapiFit\Repositories\StructureRepository;
use CapiFit\Support\Cursor;
use CapiFit\Support\Dates;
use CapiFit\Support\Uuid;
use CapiFit\Validation\FieldErrors;
use CapiFit\Validation\StructureValidator;

/**
 * Programas manuais, versões, publicação e ativação (E06-01; Doc 04 §5–§6, Doc 05 §7).
 *
 * Regras centrais: a versão publicada é imutável (o banco também impede); editar um programa publicado
 * cria uma NOVA versão em rascunho; só o dono acessa; programa de coach é visível mas não editável pelo aluno
 * (a saída é a cópia, RG-005); publicar não ativa — ativar é uma ação separada do aluno (D-13).
 */
final class ProgramService
{
    private const ORIGINS = ['usuario', 'coach', 'app'];
    private const STATUSES = ['rascunho', 'publicado', 'arquivado'];
    private const DEFAULT_LIMIT = 20;
    private const MAX_LIMIT = 100;

    public function __construct(
        private readonly ProgramRepository $programs,
        private readonly StructureRepository $structure,
        private readonly StructureValidator $validator,
        private readonly CatalogRepository $catalog,
    ) {
    }

    /**
     * @param array<string, mixed> $input
     * @return array{status: int, data: array<string, mixed>}
     */
    public function create(AuthenticatedUser $user, array $input): array
    {
        [$title, $objective] = $this->validMeta($input, true);

        $programId = $this->programs->insertProgram(Uuid::v4(), $user->id, 'usuario', (string) $title, $objective, null);
        $this->programs->insertVersion($programId, 1);

        return ['status' => 201, 'data' => $this->presentProgram($this->reload($programId, $user))];
    }

    /**
     * @param array<string, mixed> $query
     * @return array{items: list<array<string, mixed>>, limit: int, next: ?string}
     */
    public function list(AuthenticatedUser $user, array $query): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($query, ['origem', 'status', 'limit', 'cursor']);
        $origin = $query['origem'] ?? null;
        if ($origin !== null && (!is_string($origin) || !in_array($origin, self::ORIGINS, true))) {
            $errors->add('origem', 'Use usuario, coach ou app.');
            $origin = null;
        }
        $status = $query['status'] ?? null;
        if ($status !== null && (!is_string($status) || !in_array($status, self::STATUSES, true))) {
            $errors->add('status', 'Use rascunho, publicado ou arquivado.');
            $status = null;
        }
        $limit = self::DEFAULT_LIMIT;
        if (array_key_exists('limit', $query)) {
            $raw = $query['limit'];
            if (!is_string($raw) || preg_match('/^\d{1,4}$/', $raw) !== 1 || (int) $raw < 1 || (int) $raw > self::MAX_LIMIT) {
                $errors->add('limit', 'Deve ser um número inteiro entre 1 e ' . self::MAX_LIMIT . '.');
            } else {
                $limit = (int) $raw;
            }
        }
        $errors->throwIfAny();
        $after = array_key_exists('cursor', $query) ? Cursor::decode(is_string($query['cursor']) ? $query['cursor'] : '') : null;

        $rows = $this->programs->list($user->id, is_string($origin) ? $origin : null, is_string($status) ? $status : null, $after, $limit);
        $hasMore = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        $last = $rows === [] ? null : $rows[count($rows) - 1];

        return [
            'items' => array_map(fn (array $r): array => $this->presentProgram($r), $rows),
            'limit' => $limit,
            'next' => $hasMore && $last !== null ? Cursor::encode([(string) $last['criado_em'], (int) $last['id']]) : null,
        ];
    }

    /** @return array<string, mixed> */
    public function show(AuthenticatedUser $user, string $uuid): array
    {
        return $this->presentProgram($this->visible($user, $uuid));
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function update(AuthenticatedUser $user, string $uuid, array $input): array
    {
        [$title, $objective] = $this->validMeta($input, false);
        $program = $this->editable($user, $uuid);
        $this->assertNotArchived($program);

        $fields = [];
        if ($title !== null) {
            $fields['titulo'] = $title;
        }
        if (array_key_exists('objetivo', $input)) {
            $fields['objetivo'] = $objective;
        }
        $this->programs->updateMeta((int) $program['id'], $fields);

        return $this->presentProgram($this->reload((int) $program['id'], $user));
    }

    /** @return array{status: int, data: array<string, mixed>} nova versão em rascunho, copiada da publicada (ou da última) */
    public function createVersion(AuthenticatedUser $user, string $uuid): array
    {
        $program = $this->editable($user, $uuid);
        $this->assertNotArchived($program);
        $programId = (int) $program['id'];

        $draft = $this->programs->draftVersion($programId);
        if ($draft !== null) {
            throw new ApiException(ErrorCode::ProgramVersionConflict, 'Já existe uma versão em rascunho. Edite ou publique antes de criar outra.', ['versao_rascunho' => (int) $draft['numero']]);
        }
        $sourceNumber = $program['versao_atual'] !== null ? (int) $program['versao_atual'] : $this->programs->latestVersionNumber($programId);
        $source = $this->programs->findVersion($programId, $sourceNumber);

        $number = $this->programs->latestVersionNumber($programId) + 1;
        $versionId = $this->programs->insertVersion($programId, $number);
        if ($source !== null) {
            $this->structure->insert($versionId, StructureRepository::toInsertFormat($this->structure->load((int) $source['id'])));
        }
        $this->programs->touch($programId);

        return ['status' => 201, 'data' => $this->presentVersion($this->versionOrFail($programId, $number))];
    }

    /** @return array<string, mixed> */
    public function showVersion(AuthenticatedUser $user, string $uuid, string $number): array
    {
        $program = $this->visible($user, $uuid);

        return $this->presentVersion($this->versionOrFail((int) $program['id'], $this->versionNumber($number)));
    }

    /**
     * Substitui toda a estrutura de uma versão em RASCUNHO. Conflito de revisão → 409.
     *
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function replaceStructure(AuthenticatedUser $user, string $uuid, string $number, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['expected_revision', 'fichas']);
        $expected = $input['expected_revision'] ?? null;
        if (!is_int($expected) || $expected < 1) {
            $errors->add('expected_revision', 'Informe a revisão que você está editando (inteiro a partir de 1).');
        }
        $fichas = $this->validator->validate($input['fichas'] ?? null, $errors);
        $errors->throwIfAny();

        $program = $this->editable($user, $uuid);
        $this->assertNotArchived($program);
        $version = $this->programs->findVersion((int) $program['id'], $this->versionNumber($number), true);
        if ($version === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        $this->assertDraft($version);
        if ((int) $version['revision'] !== $expected) {
            throw new ApiException(ErrorCode::RevisionConflict, null, ['expected_revision' => $expected, 'current_revision' => (int) $version['revision']]);
        }

        $this->structure->clear((int) $version['id']);
        $this->structure->insert((int) $version['id'], $fichas);
        $this->programs->bumpRevision((int) $version['id']);
        $this->programs->touch((int) $program['id']);

        return $this->presentVersion($this->versionOrFail((int) $program['id'], (int) $version['numero']));
    }

    /** @return array<string, mixed> */
    public function publish(AuthenticatedUser $user, string $uuid, string $number): array
    {
        $program = $this->editable($user, $uuid);
        $this->assertNotArchived($program);
        $version = $this->programs->findVersion((int) $program['id'], $this->versionNumber($number), true);
        if ($version === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        $this->assertDraft($version);

        $fichas = $this->structure->load((int) $version['id']);
        $withExercises = array_filter($fichas, static fn (array $f): bool => $f['exercicios'] !== []);
        if ($withExercises === []) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['fichas' => ['Inclua ao menos uma ficha com um exercício antes de publicar.']]]);
        }
        if ($this->programs->unpublishedExerciseCount((int) $version['id']) > 0) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['fichas' => ['Há exercícios que deixaram de estar disponíveis. Substitua-os e publique de novo.']]]);
        }

        $this->programs->publishVersion((int) $program['id'], (int) $version['id'], $user->id);

        return $this->presentVersion($this->versionOrFail((int) $program['id'], (int) $version['numero']));
    }

    /**
     * Torna uma versão PUBLICADA a ativa do aluno. Publicar nunca ativa sozinho.
     *
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function activate(AuthenticatedUser $user, string $uuid, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['versao_numero']);
        $number = $input['versao_numero'] ?? null;
        if (!is_int($number) || $number < 1) {
            $errors->add('versao_numero', 'Informe o número da versão (inteiro a partir de 1).');
        }
        $errors->throwIfAny();

        $program = $this->visible($user, $uuid, true);
        $this->assertNotArchived($program);
        $version = $this->programs->findVersion((int) $program['id'], (int) $number);
        if ($version === null || $version['estado'] !== 'publicado') {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['versao_numero' => ['Só é possível ativar uma versão publicada e vigente.']]]);
        }
        if ($program['origem'] === 'coach' && !$this->programs->hasAcceptedPrescription((int) $program['id'], (int) $version['id'])) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['programa' => ['Aceite a prescrição do coach antes de ativá-la.']]]);
        }

        $this->programs->setActive($user->id, (int) $program['id'], (int) $version['id']);
        $active = $this->programs->active($user->id);

        return [
            'programa_id' => $program['uuid'],
            'versao_numero' => (int) $number,
            'ativado_em' => Dates::fromDb($active['ativado_em'] ?? null),
        ];
    }

    /** @return array<string, mixed> arquiva sem apagar histórico; se for o ativo, deixa de ser ativo */
    public function archive(AuthenticatedUser $user, string $uuid): array
    {
        $program = $this->visible($user, $uuid, true);
        if ($program['status'] !== 'arquivado') {
            $this->programs->archive((int) $program['id']);
            $this->programs->clearActiveIf($user->id, (int) $program['id']);
        }

        return $this->presentProgram($this->reload((int) $program['id'], $user));
    }

    /**
     * Cópia editável (RG-005): sempre `origem=usuario`, autoria do aluno e `derivado_de` apontando para o original.
     *
     * @return array{status: int, data: array<string, mixed>}
     */
    public function copy(AuthenticatedUser $user, string $uuid): array
    {
        $source = $this->visible($user, $uuid);
        $sourceNumber = $source['versao_atual'] !== null ? (int) $source['versao_atual'] : $this->programs->latestVersionNumber((int) $source['id']);
        $sourceVersion = $this->programs->findVersion((int) $source['id'], $sourceNumber);

        $title = mb_substr('Cópia de ' . (string) $source['titulo'], 0, 180);
        $programId = $this->programs->insertProgram(Uuid::v4(), $user->id, 'usuario', $title, $source['objetivo'] === null ? null : (string) $source['objetivo'], (int) $source['id']);
        $versionId = $this->programs->insertVersion($programId, 1);
        if ($sourceVersion !== null) {
            $this->structure->insert($versionId, StructureRepository::toInsertFormat($this->structure->load((int) $sourceVersion['id'])));
        }

        return ['status' => 201, 'data' => $this->presentProgram($this->reload($programId, $user))];
    }

    /** @return array<string, mixed> programa ativo com a versão completa */
    public function activeProgram(AuthenticatedUser $user): array
    {
        $active = $this->programs->active($user->id);
        if ($active === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        $program = $this->visible($user, (string) $active['programa_uuid']);

        return [
            'programa' => $this->presentProgram($program),
            'versao' => $this->presentVersion($this->versionOrFail((int) $program['id'], (int) $active['versao_numero'])),
            'ativado_em' => Dates::fromDb($active['ativado_em']),
        ];
    }

    // ---------------------------------------------------------------------------------------------------

    /**
     * @param array<string, mixed> $input
     * @return array{?string, ?string} título e objetivo
     */
    private function validMeta(array $input, bool $titleRequired): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['titulo', 'objetivo']);
        $title = null;
        if (array_key_exists('titulo', $input) || $titleRequired) {
            $raw = $input['titulo'] ?? null;
            $raw = is_string($raw) ? trim($raw) : $raw;
            if (!is_string($raw) || mb_strlen($raw) < 1 || mb_strlen($raw) > 180) {
                $errors->add('titulo', 'Deve ter entre 1 e 180 caracteres.');
            } else {
                $title = $raw;
            }
        }
        $objective = null;
        if (array_key_exists('objetivo', $input)) {
            $raw = $input['objetivo'];
            $raw = is_string($raw) ? trim($raw) : $raw;
            if (!is_string($raw) || mb_strlen($raw) > 100) {
                $errors->add('objetivo', 'Deve ter até 100 caracteres.');
            } else {
                $objective = $raw === '' ? null : $raw;
            }
        }
        if (!$titleRequired && $input === []) {
            $errors->add('corpo', 'Informe ao menos um campo.');
        }
        $errors->throwIfAny();

        return [$title, $objective];
    }

    /** @return array<string, mixed> programa do aluno (404 se inexistente, de outro usuário ou invisível) */
    private function visible(AuthenticatedUser $user, string $uuid, bool $forUpdate = false): array
    {
        $row = Uuid::isValid($uuid) ? $this->programs->findVisible(strtolower($uuid), $user->id, $forUpdate) : null;
        if ($row === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return $row;
    }

    /** @return array<string, mixed> programa visível e editável pelo aluno (travado para atualização) */
    private function editable(AuthenticatedUser $user, string $uuid): array
    {
        $row = $this->visible($user, $uuid, true);
        if ($row['origem'] === 'coach') {
            throw new ApiException(ErrorCode::Forbidden, 'Programas do coach não podem ser editados. Crie uma cópia para personalizar.');
        }

        return $row;
    }

    /** @param array<string, mixed> $program */
    private function assertNotArchived(array $program): void
    {
        if ($program['status'] === 'arquivado') {
            throw new ApiException(ErrorCode::VersionImmutable, 'Programa arquivado não pode ser alterado.');
        }
    }

    /** @param array<string, mixed> $version */
    private function assertDraft(array $version): void
    {
        if ($version['estado'] !== 'rascunho') {
            throw new ApiException(ErrorCode::VersionImmutable, null, ['versao_numero' => (int) $version['numero'], 'estado' => $version['estado']]);
        }
    }

    private function versionNumber(string $raw): int
    {
        if (preg_match('/^\d{1,6}$/', $raw) !== 1 || (int) $raw < 1) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return (int) $raw;
    }

    /** @return array<string, mixed> */
    private function versionOrFail(int $programId, int $number): array
    {
        $version = $this->programs->findVersion($programId, $number);
        if ($version === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return $version;
    }

    /** @return array<string, mixed> */
    private function reload(int $programId, AuthenticatedUser $user): array
    {
        $uuid = $this->programUuid($programId);

        return $this->visible($user, $uuid);
    }

    private function programUuid(int $programId): string
    {
        // Consulta mínima pelo id interno, só para recarregar o que acabamos de gravar.
        $row = $this->programs->uuidOf($programId);
        if ($row === null) {
            throw new \LogicException('Programa não encontrado após a gravação.');
        }

        return $row;
    }

    // ---- apresentação (schemas Programa, Versao, Ficha, ExercicioFicha e SeriePrescrita do OpenAPI) ----

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function presentProgram(array $row): array
    {
        return [
            'id' => $row['uuid'],
            'titulo' => $row['titulo'],
            'objetivo' => $row['objetivo'],
            'origem' => $row['origem'],
            'status' => $row['status'],
            'autor' => ['id' => $row['autor_uuid'], 'nome' => $row['autor_nome'], 'papeis' => $this->programs->rolesOf((int) $row['autor_id'])],
            'versao_atual' => $row['versao_atual'] === null ? null : (int) $row['versao_atual'],
            'versao_rascunho' => $row['versao_rascunho'] === null ? null : (int) $row['versao_rascunho'],
            'derivado_de' => $row['derivado_uuid'],
            'criado_em' => Dates::fromDb($row['criado_em']),
            'atualizado_em' => Dates::fromDb($row['atualizado_em']),
        ];
    }

    /**
     * @param array<string, mixed> $version
     * @return array<string, mixed>
     */
    private function presentVersion(array $version): array
    {
        $fichas = $this->structure->load((int) $version['id']);
        $exerciseIds = [];
        foreach ($fichas as $f) {
            foreach ($f['exercicios'] as $e) {
                $exerciseIds[] = (int) $e['exercicio_id'];
            }
        }
        $groups = $this->catalog->primaryGroups(array_values(array_unique($exerciseIds)));

        return [
            'numero' => (int) $version['numero'],
            'estado' => $version['estado'],
            'revision' => (int) $version['revision'],
            'notas' => $version['notas'],
            'gerador_versao' => $version['gerador_versao'],
            'publicado_em' => Dates::fromDb($version['publicado_em']),
            'fichas' => array_map(static fn (array $f): array => [
                'id' => $f['uuid'],
                'codigo' => $f['codigo'],
                'titulo' => $f['titulo'],
                'ordem' => (int) $f['ordem'],
                'exercicios' => array_map(static fn (array $e): array => [
                    'id' => $e['uuid'],
                    'exercicio' => ExercisePresenter::summary(['uuid' => $e['exercicio_uuid']] + $e, $groups[(int) $e['exercicio_id']] ?? []),
                    'ordem' => (int) $e['ordem'],
                    'descanso_segundos' => $e['descanso_segundos'] === null ? null : (int) $e['descanso_segundos'],
                    'grupo_superset' => $e['grupo_superset'],
                    'instrucoes' => $e['instrucoes'],
                    'series' => array_map(static fn (array $s): array => [
                        'id' => $s['uuid'],
                        'ordem' => (int) $s['ordem'],
                        'tipo' => $s['tipo'],
                        'reps_min' => $s['reps_min'] === null ? null : (int) $s['reps_min'],
                        'reps_max' => $s['reps_max'] === null ? null : (int) $s['reps_max'],
                        'carga_alvo_kg' => $s['carga_alvo_kg'] === null ? null : (float) $s['carga_alvo_kg'],
                        'rir_alvo' => $s['rir_alvo'] === null ? null : (int) $s['rir_alvo'],
                        'duracao_alvo_segundos' => $s['duracao_alvo_segundos'] === null ? null : (int) $s['duracao_alvo_segundos'],
                    ], $e['series']),
                ], $f['exercicios']),
            ], $fichas),
        ];
    }
}
