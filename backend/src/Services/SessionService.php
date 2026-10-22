<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Presenters\ExercisePresenter;
use CapiFit\Repositories\CatalogRepository;
use CapiFit\Repositories\SessionRepository;
use CapiFit\Support\Cursor;
use CapiFit\Support\Dates;
use CapiFit\Support\Uuid;
use CapiFit\Validation\FieldErrors;

/**
 * Sessões de treino AVULSAS (sem ficha): criar, consultar, anotar, adicionar exercícios e séries, registrar,
 * concluir e cancelar (E07-01; Doc 04 §7, Doc 06 D-05). Sessão programada: E07-12; substituir/pausar: E07-02.
 *
 * Regras: só o dono acessa (outro usuário = 404, sem vazamento); só sessão `em_andamento` aceita mudanças
 * (senão 409 SESSION_CLOSED); no máximo uma sessão aberta por aluno (RG-013).
 */
final class SessionService
{
    private const SERIES_TYPES = ['aquecimento', 'normal', 'preparatoria', 'dropset'];
    private const SERIES_STATUS = ['pendente', 'realizada', 'ignorada'];
    private const DEFAULT_LIMIT = 20;
    private const MAX_LIMIT = 100;

    public function __construct(
        private readonly SessionRepository $sessions,
        private readonly CatalogRepository $catalog,
    ) {
    }

    /**
     * @param array<string, mixed> $input
     * @return array{status: int, data: array<string, mixed>}
     */
    public function create(AuthenticatedUser $user, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['sessao_uuid', 'ficha_uuid', 'titulo_avulso', 'iniciada_em', 'exercicios']);
        $uuid = $input['sessao_uuid'] ?? null;
        if (!Uuid::isValid($uuid)) {
            $errors->add('sessao_uuid', 'Informe um UUID válido.');
        }
        $startedAt = Dates::parse($input['iniciada_em'] ?? null);
        if ($startedAt === null) {
            $errors->add('iniciada_em', 'Informe a data e hora em ISO 8601 com fuso (ex.: 2026-10-21T14:30:00Z).');
        } else {
            $now = Dates::nowUtc();
            if ($startedAt > $now->modify('+5 minutes')) {
                $errors->add('iniciada_em', 'O início não pode estar no futuro.');
            } elseif ($startedAt < $now->modify('-30 days')) {
                $errors->add('iniciada_em', 'O início não pode ser anterior a 30 dias.');
            }
        }
        $title = $input['titulo_avulso'] ?? null;
        if ($title !== null) {
            $title = is_string($title) ? trim($title) : $title;
            if (!is_string($title) || $title === '' || mb_strlen($title) > 160) {
                $errors->add('titulo_avulso', 'Deve ter entre 1 e 160 caracteres.');
            }
        }
        $errors->throwIfAny();

        if (($input['ficha_uuid'] ?? null) !== null || ($input['exercicios'] ?? null) !== null) {
            throw new ApiException(ErrorCode::NotImplemented, 'Sessão a partir de ficha ainda não está disponível. Use o treino avulso.');
        }
        /** @var string $uuid */
        /** @var \DateTimeImmutable $startedAt */
        $uuid = strtolower($uuid);

        // Repetição da mesma sessao_uuid pelo mesmo usuário devolve a sessão existente (efeito único).
        if ($this->sessions->uuidExists($uuid)) {
            $existing = $this->sessions->findOwned($uuid, $user->id);
            if ($existing === null) {
                throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['sessao_uuid' => ['Este UUID já foi utilizado.']]]);
            }

            return ['status' => 200, 'data' => $this->present($existing)];
        }

        $open = $this->sessions->openSessionUuid($user->id);
        if ($open !== null) {
            throw $this->alreadyOpen($open);
        }
        try {
            $this->sessions->insertAvulsa($uuid, $user->id, is_string($title) ? $title : null, Dates::toDb($startedAt));
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() === 1062 && str_contains($e->getMessage(), 'uq_sessao_em_andamento')) {
                throw $this->alreadyOpen($this->sessions->openSessionUuid($user->id), $e);
            }
            throw $e;
        }
        $row = $this->sessions->findOwned($uuid, $user->id);
        if ($row === null) {
            throw new \LogicException('Sessão recém-criada não encontrada.');
        }

        return ['status' => 201, 'data' => $this->present($row)];
    }

    /** @return array<string, mixed> */
    public function get(AuthenticatedUser $user, string $uuid): array
    {
        return $this->present($this->owned($user, $uuid));
    }

    /**
     * @param array<string, mixed> $query
     * @return array{items: list<array<string, mixed>>, limit: int, next: ?string}
     */
    public function list(AuthenticatedUser $user, array $query): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($query, ['status', 'de', 'ate', 'limit', 'cursor']);
        $status = $query['status'] ?? null;
        if ($status !== null && (!is_string($status) || !in_array($status, ['em_andamento', 'concluida', 'cancelada'], true))) {
            $errors->add('status', 'Use em_andamento, concluida ou cancelada.');
            $status = null;
        }
        $from = $this->optionalDate($query, 'de', $errors);
        $to = $this->optionalDate($query, 'ate', $errors);
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

        $rows = $this->sessions->list(
            $user->id,
            is_string($status) ? $status : null,
            $from === null ? null : Dates::toDb($from),
            $to === null ? null : Dates::toDb($to),
            $after,
            $limit,
        );
        $hasMore = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        $last = $rows === [] ? null : $rows[count($rows) - 1];

        return [
            'items' => array_map(fn (array $r): array => $this->summary($r), $rows),
            'limit' => $limit,
            'next' => $hasMore && $last !== null ? Cursor::encode([(string) $last['iniciada_em'], (int) $last['id']]) : null,
        ];
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function updateNotes(AuthenticatedUser $user, string $uuid, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['observacoes']);
        $notes = $errors->requireString($input, 'observacoes', 0, 5000);
        $errors->throwIfAny();

        $session = $this->openOwned($user, $uuid);
        $this->sessions->updateNotes((int) $session['id'], (string) $notes);

        return $this->get($user, $uuid);
    }

    /**
     * @param array<string, mixed> $input
     * @return array{status: int, data: array<string, mixed>}
     */
    public function addExercise(AuthenticatedUser $user, string $uuid, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['uuid', 'exercicio_uuid', 'ordem']);
        $clientUuid = $this->optionalUuid($input, 'uuid', $errors);
        $exerciseUuid = $input['exercicio_uuid'] ?? null;
        $exercise = null;
        if (!Uuid::isValid($exerciseUuid)) {
            $errors->add('exercicio_uuid', 'Informe um UUID válido.');
        } else {
            $exercise = $this->sessions->findPublishedExercise(strtolower((string) $exerciseUuid));
            if ($exercise === null) {
                $errors->add('exercicio_uuid', 'Exercício inexistente ou não publicado.');
            }
        }
        $order = $input['ordem'] ?? null;
        if ($order !== null && (!is_int($order) || $order < 1 || $order > 500)) {
            $errors->add('ordem', 'Deve ser um inteiro entre 1 e 500.');
        }
        $errors->throwIfAny();

        $session = $this->openOwned($user, $uuid);
        $sessionId = (int) $session['id'];
        if ($clientUuid !== null) {
            $existing = $this->sessions->findExercise($sessionId, $clientUuid);
            if ($existing !== null) {
                return ['status' => 200, 'data' => $this->exercisePayload($sessionId, $clientUuid)];
            }
        }
        if (is_int($order) && $this->sessions->exerciseOrderTaken($sessionId, $order)) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['ordem' => ['Já existe um exercício nesta posição.']]]);
        }
        $newUuid = $clientUuid ?? Uuid::v4();
        try {
            $this->sessions->insertExercise($newUuid, $sessionId, (int) ($exercise['id'] ?? 0), is_int($order) ? $order : $this->sessions->nextExerciseOrder($sessionId));
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() === 1062 && $clientUuid !== null) {
                throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['uuid' => ['Este UUID já foi utilizado.']]], [], $e);
            }
            throw $e;
        }

        return ['status' => 201, 'data' => $this->exercisePayload($sessionId, $newUuid)];
    }

    /**
     * @param array<string, mixed> $input
     * @return array{status: int, data: array<string, mixed>}
     */
    public function addSeries(AuthenticatedUser $user, string $uuid, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['uuid', 'sessao_exercicio_uuid', 'tipo']);
        $clientUuid = $this->optionalUuid($input, 'uuid', $errors);
        $exerciseUuid = $input['sessao_exercicio_uuid'] ?? null;
        if (!Uuid::isValid($exerciseUuid)) {
            $errors->add('sessao_exercicio_uuid', 'Informe um UUID válido.');
        }
        $type = $input['tipo'] ?? 'normal';
        if (!is_string($type) || !in_array($type, self::SERIES_TYPES, true)) {
            $errors->add('tipo', 'Use aquecimento, normal, preparatoria ou dropset.');
        }
        $errors->throwIfAny();

        $session = $this->openOwned($user, $uuid);
        $sessionId = (int) $session['id'];
        $item = $this->sessions->findExercise($sessionId, strtolower((string) $exerciseUuid));
        if ($item === null) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['sessao_exercicio_uuid' => ['Exercício não pertence a esta sessão.']]]);
        }
        if ($clientUuid !== null) {
            foreach ($this->sessions->series($sessionId) as $existing) {
                if ($existing['uuid'] === $clientUuid) {
                    return ['status' => 200, 'data' => $this->presentSeries($existing)];
                }
            }
        }
        $newUuid = $clientUuid ?? Uuid::v4();
        try {
            $id = $this->sessions->insertSeries($newUuid, (int) $item['id'], $this->sessions->nextSeriesOrder((int) $item['id']), (string) $type);
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() === 1062 && $clientUuid !== null) {
                throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['uuid' => ['Este UUID já foi utilizado.']]], [], $e);
            }
            throw $e;
        }
        $row = $this->sessions->findSeriesById($id);

        return ['status' => 201, 'data' => $this->presentSeries($row ?? [])];
    }

    /**
     * Registra uma série. Última-escrita-vence por `atualizado_cliente_em` (Doc 06 D-04): uma escrita mais
     * antiga que a já gravada é ignorada e a série atual é devolvida.
     *
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function updateSeries(AuthenticatedUser $user, string $uuid, string $seriesUuid, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['carga_kg', 'repeticoes', 'duracao_segundos', 'rir_real', 'status', 'concluida_em', 'atualizado_cliente_em', 'tipo']);
        if ($input === []) {
            $errors->add('corpo', 'Informe ao menos um campo.');
        }
        $changes = [];
        if (array_key_exists('carga_kg', $input)) {
            $v = $input['carga_kg'];
            if ((!is_int($v) && !is_float($v)) || $v < 0 || $v > 99999.99) {
                $errors->add('carga_kg', 'Deve ser um número entre 0 e 99999,99.');
            } else {
                $changes['carga_kg'] = round((float) $v, 2);
            }
        }
        foreach (['repeticoes' => 1000, 'duracao_segundos' => 65535, 'rir_real' => 10] as $field => $max) {
            if (array_key_exists($field, $input)) {
                $v = $input[$field];
                if (!is_int($v) || $v < 0 || $v > $max) {
                    $errors->add($field, "Deve ser um inteiro entre 0 e $max.");
                } else {
                    $changes[$field] = $v;
                }
            }
        }
        if (array_key_exists('status', $input)) {
            $v = $input['status'];
            if (!is_string($v) || !in_array($v, self::SERIES_STATUS, true)) {
                $errors->add('status', 'Use pendente, realizada ou ignorada.');
            } else {
                $changes['status'] = $v;
            }
        }
        if (array_key_exists('tipo', $input)) {
            $v = $input['tipo'];
            if (!is_string($v) || !in_array($v, self::SERIES_TYPES, true)) {
                $errors->add('tipo', 'Use aquecimento, normal, preparatoria ou dropset.');
            } else {
                $changes['tipo'] = $v;
            }
        }
        $clientTime = null;
        foreach (['concluida_em', 'atualizado_cliente_em'] as $field) {
            if (array_key_exists($field, $input)) {
                $date = Dates::parse($input[$field]);
                if ($date === null) {
                    $errors->add($field, 'Informe a data e hora em ISO 8601 com fuso.');
                } else {
                    $changes[$field] = Dates::toDb($date);
                    if ($field === 'atualizado_cliente_em') {
                        $clientTime = $changes[$field];
                    }
                }
            }
        }
        $errors->throwIfAny();

        $session = $this->openOwned($user, $uuid, true);
        $series = $this->sessions->findSeriesForUpdate((int) $session['id'], strtolower($seriesUuid));
        if ($series === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        if ($clientTime !== null && $series['atualizado_cliente_em'] !== null && $clientTime < (string) $series['atualizado_cliente_em']) {
            return $this->presentSeries($series); // escrita mais antiga: o estado mais novo prevalece
        }

        $merged = array_merge($series, $changes);
        $finalStatus = (string) $merged['status'];
        if ($finalStatus === 'realizada') {
            $missing = $this->missingForDone((string) $series['modalidade'], $merged);
            if ($missing !== []) {
                throw new ApiException(ErrorCode::ValidationError, null, ['fields' => array_fill_keys($missing, ['Obrigatório para marcar a série como realizada neste exercício.'])]);
            }
            if (!array_key_exists('concluida_em', $changes) && $series['concluida_em'] === null) {
                $changes['concluida_em'] = Dates::toDb(Dates::nowUtc());
            }
        }

        $this->sessions->updateSeries((int) $series['id'], $changes);
        $row = $this->sessions->findSeriesById((int) $series['id']);

        return $this->presentSeries($row ?? []);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function complete(AuthenticatedUser $user, string $uuid, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['encerrada_em']);
        $endedAt = null;
        if (array_key_exists('encerrada_em', $input)) {
            $endedAt = Dates::parse($input['encerrada_em']);
            if ($endedAt === null) {
                $errors->add('encerrada_em', 'Informe a data e hora em ISO 8601 com fuso.');
            }
        }
        $errors->throwIfAny();

        $session = $this->sessions->findOwnedForUpdate(strtolower($uuid), $user->id);
        if ($session === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        if ($session['status'] === 'concluida') {
            return $this->present($session); // já concluída: repetir não cria novo efeito
        }
        if ($session['status'] !== 'em_andamento') {
            throw new ApiException(ErrorCode::SessionClosed);
        }

        $now = Dates::nowUtc();
        $endedAt ??= $now;
        $started = Dates::parse(Dates::fromDb($session['iniciada_em']));
        if ($endedAt > $now->modify('+5 minutes') || ($started !== null && $endedAt < $started)) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['encerrada_em' => ['Deve ser posterior ao início e não pode estar no futuro.']]]);
        }
        $this->sessions->complete((int) $session['id'], Dates::toDb($endedAt));

        return $this->get($user, $uuid);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function cancel(AuthenticatedUser $user, string $uuid, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['motivo']);
        if (array_key_exists('motivo', $input) && (!is_string($input['motivo']) || mb_strlen($input['motivo']) > 255)) {
            $errors->add('motivo', 'Deve ter até 255 caracteres.');
        }
        $errors->throwIfAny();

        $session = $this->sessions->findOwnedForUpdate(strtolower($uuid), $user->id);
        if ($session === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        if ($session['status'] === 'cancelada') {
            return $this->present($session);
        }
        if ($session['status'] !== 'em_andamento') {
            throw new ApiException(ErrorCode::SessionClosed);
        }
        // O motivo é aceito, mas não há coluna para guardá-lo (o schema não o prevê); não é registrado em log.
        $this->sessions->cancel((int) $session['id'], Dates::toDb(Dates::nowUtc()));

        return $this->get($user, $uuid);
    }

    // ---------------------------------------------------------------------------------------------------

    /** @return array<string, mixed> */
    private function owned(AuthenticatedUser $user, string $uuid): array
    {
        $row = Uuid::isValid($uuid) ? $this->sessions->findOwned(strtolower($uuid), $user->id) : null;
        if ($row === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return $row;
    }

    /** @return array<string, mixed> sessão do usuário, garantindo que ainda está em andamento */
    private function openOwned(AuthenticatedUser $user, string $uuid, bool $forUpdate = false): array
    {
        $row = Uuid::isValid($uuid)
            ? ($forUpdate ? $this->sessions->findOwnedForUpdate(strtolower($uuid), $user->id) : $this->sessions->findOwned(strtolower($uuid), $user->id))
            : null;
        if ($row === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        if ($row['status'] !== 'em_andamento') {
            throw new ApiException(ErrorCode::SessionClosed);
        }

        return $row;
    }

    private function alreadyOpen(?string $openUuid, ?\Throwable $previous = null): ApiException
    {
        return new ApiException(ErrorCode::SessionAlreadyOpen, null, $openUuid === null ? [] : ['sessao_uuid' => $openUuid], [], $previous);
    }

    /**
     * @param array<string, mixed> $merged
     * @return list<string>
     */
    private function missingForDone(string $modality, array $merged): array
    {
        $required = match ($modality) {
            'tempo' => ['duracao_segundos'],
            'reps_carga' => ['repeticoes', 'carga_kg'],
            default => ['repeticoes'],
        };

        return array_values(array_filter($required, static fn (string $f): bool => ($merged[$f] ?? null) === null));
    }

    /** @param array<string, mixed> $query */
    private function optionalDate(array $query, string $field, FieldErrors $errors): ?\DateTimeImmutable
    {
        if (!array_key_exists($field, $query)) {
            return null;
        }
        $date = Dates::parse(is_string($query[$field]) ? str_replace(' ', '+', $query[$field]) : null);
        if ($date === null) {
            $errors->add($field, 'Informe a data e hora em ISO 8601 com fuso.');
        }

        return $date;
    }

    /** @param array<string, mixed> $input */
    private function optionalUuid(array $input, string $field, FieldErrors $errors): ?string
    {
        if (!array_key_exists($field, $input) || $input[$field] === null) {
            return null;
        }
        if (!Uuid::isValid($input[$field])) {
            $errors->add($field, 'Deve ser um UUID válido.');

            return null;
        }

        return strtolower((string) $input[$field]);
    }

    // ---- apresentação (formato dos schemas SessaoResumo, Sessao, SessaoExercicio e SessaoSerie do OpenAPI) ----

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function summary(array $row): array
    {
        return [
            'id' => $row['uuid'],
            'tipo' => $row['tipo'],
            'titulo' => $row['titulo_avulso'],
            'status' => $row['status'],
            'iniciada_em' => Dates::fromDb($row['iniciada_em']),
            'encerrada_em' => Dates::fromDb($row['encerrada_em']),
            'duracao_ativa_segundos' => $row['duracao_ativa_segundos'] === null ? null : (int) $row['duracao_ativa_segundos'],
            'programa_id' => null,
            'versao_numero' => null,
            'ficha_id' => null,
            'series_realizadas' => (int) $row['series_realizadas'],
            'series_total' => (int) $row['series_total'],
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function present(array $row): array
    {
        $sessionId = (int) $row['id'];
        $seriesByItem = [];
        foreach ($this->sessions->series($sessionId) as $series) {
            $seriesByItem[(int) $series['sessao_exercicio_id']][] = $this->presentSeries($series);
        }
        $exerciseRows = $this->sessions->exercises($sessionId);
        $groups = $this->catalog->primaryGroups(array_map(static fn (array $r): int => (int) $r['exercicio_id'], $exerciseRows));
        $items = array_map(fn (array $e): array => $this->presentExercise($e, $groups[(int) $e['exercicio_id']] ?? [], $seriesByItem[(int) $e['id']] ?? []), $exerciseRows);

        return $this->summary($row) + [
            'observacoes' => $row['observacoes'],
            'exercicios' => $items,
            'pausas' => array_map(static fn (array $p): array => [
                'id' => $p['uuid'],
                'iniciada_em' => Dates::fromDb($p['iniciada_em']),
                'encerrada_em' => Dates::fromDb($p['encerrada_em']),
            ], $this->sessions->pauses($sessionId)),
        ];
    }

    /** @return array<string, mixed> */
    private function exercisePayload(int $sessionId, string $exerciseUuid): array
    {
        foreach ($this->sessions->exercises($sessionId) as $e) {
            if ($e['uuid'] === $exerciseUuid) {
                $groups = $this->catalog->primaryGroups([(int) $e['exercicio_id']]);
                $series = array_values(array_map(
                    fn (array $s): array => $this->presentSeries($s),
                    array_filter($this->sessions->series($sessionId), static fn (array $s): bool => (int) $s['sessao_exercicio_id'] === (int) $e['id']),
                ));

                return $this->presentExercise($e, $groups[(int) $e['exercicio_id']] ?? [], $series);
            }
        }
        throw new \LogicException('Exercício da sessão não encontrado após a gravação.');
    }

    /**
     * @param array<string, mixed> $e
     * @param list<array{id: string, nome: string}> $groups
     * @param list<array<string, mixed>> $series
     * @return array<string, mixed>
     */
    private function presentExercise(array $e, array $groups, array $series): array
    {
        return [
            'id' => $e['uuid'],
            'ficha_exercicio_id' => null,
            'exercicio' => ExercisePresenter::summary(['uuid' => $e['exercicio_uuid']] + $e, $groups),
            'exercicio_prescrito_id' => null,
            'tipo_item' => $e['tipo_item'],
            'ordem' => (int) $e['ordem'],
            'series' => $series,
        ];
    }

    /**
     * @param array<string, mixed> $s
     * @return array<string, mixed>
     */
    private function presentSeries(array $s): array
    {
        return [
            'id' => $s['uuid'] ?? null,
            'serie_prescrita_id' => null,
            'ordem' => (int) ($s['ordem'] ?? 0),
            'tipo' => $s['tipo'] ?? 'normal',
            'carga_kg' => ($s['carga_kg'] ?? null) === null ? null : (float) $s['carga_kg'],
            'repeticoes' => ($s['repeticoes'] ?? null) === null ? null : (int) $s['repeticoes'],
            'duracao_segundos' => ($s['duracao_segundos'] ?? null) === null ? null : (int) $s['duracao_segundos'],
            'rir_real' => ($s['rir_real'] ?? null) === null ? null : (int) $s['rir_real'],
            'status' => $s['status'] ?? 'pendente',
            'concluida_em' => Dates::fromDb($s['concluida_em'] ?? null),
            'revision' => (int) ($s['revision'] ?? 1),
        ];
    }
}
