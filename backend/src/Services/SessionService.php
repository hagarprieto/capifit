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
 * Sessões de treino, avulsas (sem ficha) ou programadas (a partir de uma ficha): criar, consultar, anotar, adicionar
 * exercícios e séries, registrar, concluir e cancelar (E07-01, E07-12; Doc 04 §7, Doc 06 D-05). Substituir/pausar: E07-02.
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
    private const MAX_SNAPSHOT_EXERCISES = 60;
    private const MAX_SNAPSHOT_SERIES = 20;

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
        $snapshot = $input['exercicios'] ?? null;
        if ($snapshot !== null && (!is_array($snapshot) || !array_is_list($snapshot))) {
            $errors->add('exercicios', 'Deve ser uma lista de exercícios.');
        }
        $fichaUuid = $input['ficha_uuid'] ?? null;
        if ($fichaUuid !== null && !Uuid::isValid($fichaUuid)) {
            $errors->add('ficha_uuid', 'Informe um UUID válido.');
        }
        if ($fichaUuid !== null && $title !== null) {
            $errors->add('titulo_avulso', 'Treino a partir de ficha usa o título da ficha.');
        }
        $errors->throwIfAny();

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
        $ficha = null;
        if ($fichaUuid !== null) {
            $ficha = $this->sessions->findTrainableFicha(strtolower((string) $fichaUuid), $user->id);
            if ($ficha === null) {
                throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['ficha_uuid' => ['Ficha inexistente, de programa arquivado ou ainda em rascunho.']]]);
            }
        }
        try {
            if ($ficha !== null) {
                $sessionId = $this->sessions->insertProgrammed($uuid, $user->id, (int) $ficha['versao_id'], (int) $ficha['id'], Dates::toDb($startedAt));
            } else {
                $sessionId = $this->sessions->insertAvulsa($uuid, $user->id, is_string($title) ? $title : null, Dates::toDb($startedAt));
            }
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() === 1062 && str_contains($e->getMessage(), 'uq_sessao_em_andamento')) {
                throw $this->alreadyOpen($this->sessions->openSessionUuid($user->id), $e);
            }
            throw $e;
        }
        if ($snapshot !== null) {
            $this->insertSnapshot($sessionId, $snapshot, $ficha === null ? null : (int) $ficha['id']);
        } elseif ($ficha !== null) {
            $this->copyPrescription($sessionId, (int) $ficha['id']);
        }
        $row = $this->sessions->findOwned($uuid, $user->id);
        if ($row === null) {
            throw new \LogicException('Sessão recém-criada não encontrada.');
        }

        return ['status' => 201, 'data' => $this->present($row)];
    }

    /**
     * Grava o instantâneo enviado pelo cliente (RG-020): exercícios e séries com os UUIDs gerados offline, validados
     * contra a prescrição da ficha. Qualquer falha rejeita o instantâneo inteiro (422 com `details.fields` por caminho).
     *
     * @param array<mixed> $snapshot
     */
    private function insertSnapshot(int $sessionId, array $snapshot, ?int $fichaId): void
    {
        $errors = new FieldErrors();
        if (count($snapshot) > self::MAX_SNAPSHOT_EXERCISES) {
            $errors->add('exercicios', 'No máximo ' . self::MAX_SNAPSHOT_EXERCISES . ' exercícios.');
            $errors->throwIfAny();
        }
        $index = $fichaId === null ? null : $this->sessions->prescribedIndex($fichaId);
        $seenUuids = [];
        $orders = [];
        $plan = [];
        foreach ($snapshot as $i => $item) {
            $p = "exercicios.$i";
            if (!is_array($item)) {
                $errors->add($p, 'Deve ser um objeto.');
                continue;
            }
            foreach (array_keys($item) as $key) {
                if (!in_array($key, ['uuid', 'ficha_exercicio_uuid', 'exercicio_uuid', 'tipo_item', 'ordem', 'exercicio_prescrito_uuid', 'series'], true)) {
                    $errors->add("$p.$key", 'Campo não permitido.');
                }
            }
            $uuid = $this->snapshotUuid($item, 'uuid', "$p.uuid", $errors, $seenUuids, true);
            $exercise = null;
            if (!Uuid::isValid($item['exercicio_uuid'] ?? null)) {
                $errors->add("$p.exercicio_uuid", 'Informe um UUID válido.');
            } else {
                $exercise = $this->sessions->findPublishedExercise(strtolower((string) $item['exercicio_uuid']));
                if ($exercise === null) {
                    $errors->add("$p.exercicio_uuid", 'Exercício inexistente ou não publicado.');
                }
            }
            $itemType = $item['tipo_item'] ?? null;
            if (!is_string($itemType) || !in_array($itemType, ['prescrito', 'adicionado', 'substituido'], true)) {
                $errors->add("$p.tipo_item", 'Use prescrito, adicionado ou substituido.');
                $itemType = null;
            }
            $order = $item['ordem'] ?? null;
            if (!is_int($order) || $order < 1 || $order > 500) {
                $errors->add("$p.ordem", 'Deve ser um inteiro entre 1 e 500.');
                $order = null;
            } elseif (isset($orders[$order])) {
                $errors->add("$p.ordem", 'Já existe um exercício nesta posição.');
            } else {
                $orders[$order] = true;
            }

            $fichaItem = null;
            $fichaItemUuid = $item['ficha_exercicio_uuid'] ?? null;
            if ($fichaItemUuid !== null) {
                $key = Uuid::isValid($fichaItemUuid) ? strtolower((string) $fichaItemUuid) : '';
                $fichaItem = $index['items'][$key] ?? null;
                if ($fichaItem === null) {
                    $errors->add("$p.ficha_exercicio_uuid", 'Não pertence à ficha informada.');
                }
            }
            if ($itemType === 'prescrito') {
                if ($fichaItemUuid === null) {
                    $errors->add("$p.ficha_exercicio_uuid", 'Obrigatório para exercício prescrito.');
                } elseif ($fichaItem !== null && $exercise !== null && (int) $exercise['id'] !== $fichaItem['exercicio_id']) {
                    $errors->add("$p.exercicio_uuid", 'Diferente do exercício prescrito; use tipo_item substituido.');
                }
            } elseif ($itemType === 'adicionado' && $fichaItemUuid !== null) {
                $errors->add("$p.ficha_exercicio_uuid", 'Exercício adicionado não tem item na ficha.');
            }
            $plannedId = null;
            if ($itemType === 'substituido') {
                $plannedUuid = $item['exercicio_prescrito_uuid'] ?? null;
                $planned = Uuid::isValid($plannedUuid) ? $this->sessions->findPublishedExercise(strtolower((string) $plannedUuid)) : null;
                if ($planned === null) {
                    $errors->add("$p.exercicio_prescrito_uuid", 'Informe o exercício originalmente previsto (publicado).');
                } else {
                    $plannedId = (int) $planned['id'];
                }
            } elseif (($item['exercicio_prescrito_uuid'] ?? null) !== null) {
                $errors->add("$p.exercicio_prescrito_uuid", 'Só se aplica a exercício substituído.');
            }

            $series = $item['series'] ?? [];
            $seriesPlan = [];
            if (!is_array($series) || !array_is_list($series) || count($series) > self::MAX_SNAPSHOT_SERIES) {
                $errors->add("$p.series", 'Deve ser uma lista com até ' . self::MAX_SNAPSHOT_SERIES . ' séries.');
                $series = [];
            }
            $seriesOrders = [];
            foreach ($series as $k => $s) {
                $r = "$p.series.$k";
                if (!is_array($s)) {
                    $errors->add($r, 'Deve ser um objeto.');
                    continue;
                }
                foreach (array_keys($s) as $key) {
                    if (!in_array($key, ['uuid', 'serie_prescrita_uuid', 'ordem', 'tipo'], true)) {
                        $errors->add("$r.$key", 'Campo não permitido.');
                    }
                }
                $sUuid = $this->snapshotUuid($s, 'uuid', "$r.uuid", $errors, $seenUuids, true);
                $sOrder = $s['ordem'] ?? null;
                if (!is_int($sOrder) || $sOrder < 1 || $sOrder > 100) {
                    $errors->add("$r.ordem", 'Deve ser um inteiro entre 1 e 100.');
                } elseif (isset($seriesOrders[$sOrder])) {
                    $errors->add("$r.ordem", 'Já existe uma série nesta posição.');
                } else {
                    $seriesOrders[$sOrder] = true;
                }
                $sType = $s['tipo'] ?? 'normal';
                if (!is_string($sType) || !in_array($sType, self::SERIES_TYPES, true)) {
                    $errors->add("$r.tipo", 'Use aquecimento, normal, preparatoria ou dropset.');
                }
                $prescribedSeriesId = null;
                if (($s['serie_prescrita_uuid'] ?? null) !== null) {
                    $key = Uuid::isValid($s['serie_prescrita_uuid']) ? strtolower((string) $s['serie_prescrita_uuid']) : '';
                    $prescribed = $index['series'][$key] ?? null;
                    if ($prescribed === null || $fichaItemUuid === null || $prescribed['item_uuid'] !== strtolower((string) $fichaItemUuid)) {
                        $errors->add("$r.serie_prescrita_uuid", 'Não pertence ao exercício prescrito.');
                    } else {
                        $prescribedSeriesId = $prescribed['id'];
                    }
                }
                $seriesPlan[] = ['uuid' => $sUuid, 'ordem' => $sOrder, 'tipo' => (string) $sType, 'prescrita_id' => $prescribedSeriesId];
            }
            $plan[] = ['uuid' => $uuid, 'exercicio_id' => (int) ($exercise['id'] ?? 0), 'ordem' => (int) $order, 'tipo_item' => (string) $itemType, 'planned' => $plannedId, 'ficha_item_id' => $fichaItem['id'] ?? null, 'series' => $seriesPlan];
        }
        $errors->throwIfAny();

        try {
            foreach ($plan as $item) {
                $itemId = $this->sessions->insertExercise((string) $item['uuid'], $sessionId, $item['exercicio_id'], $item['ordem'], $item['tipo_item'], $item['planned'], $item['ficha_item_id']);
                foreach ($item['series'] as $s) {
                    $this->sessions->insertSeries((string) $s['uuid'], $itemId, (int) $s['ordem'], $s['tipo'], $s['prescrita_id']);
                }
            }
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() === 1062) {
                throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['exercicios' => ['Algum UUID informado já foi utilizado.']]], [], $e);
            }
            throw $e;
        }
    }

    /**
     * @param array<mixed> $data
     * @param array<string, true> $seen
     */
    private function snapshotUuid(array $data, string $key, string $path, FieldErrors $errors, array &$seen, bool $required): ?string
    {
        $value = $data[$key] ?? null;
        if ($value === null && !$required) {
            return null;
        }
        if (!Uuid::isValid($value)) {
            $errors->add($path, 'Informe um UUID válido.');

            return null;
        }
        $value = strtolower((string) $value);
        if (isset($seen[$value])) {
            $errors->add($path, 'UUID repetido no instantâneo.');
        }
        $seen[$value] = true;

        return $value;
    }

    /**
     * Início de pausa com o horário do dispositivo (sincronização). Repetir a mesma pausa devolve a existente.
     *
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function startPauseAt(AuthenticatedUser $user, string $sessionUuid, string $pauseUuid, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['iniciada_em']);
        $startedAt = Dates::parse($input['iniciada_em'] ?? null);
        if ($startedAt === null) {
            $errors->add('iniciada_em', 'Informe a data e hora em ISO 8601 com fuso.');
        }
        if (!Uuid::isValid($pauseUuid)) {
            $errors->add('uuid', 'Informe um UUID válido.');
        }
        $errors->throwIfAny();

        $session = $this->openOwned($user, $sessionUuid, true);
        $sessionId = (int) $session['id'];
        $existing = $this->sessions->findSessionPause($sessionId, strtolower($pauseUuid));
        if ($existing !== null) {
            return $this->presentPause($existing);
        }
        $started = Dates::parse(Dates::fromDb($session['iniciada_em']));
        if (($started !== null && $startedAt < $started) || $startedAt > Dates::nowUtc()->modify('+5 minutes')) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['iniciada_em' => ['Deve ser posterior ao início do treino e não pode estar no futuro.']]]);
        }
        if ($this->sessions->openPause($sessionId) !== null) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['sessao' => ['Já existe uma pausa em andamento.']]]);
        }
        try {
            $this->sessions->insertPause(strtolower($pauseUuid), $sessionId, Dates::toDb($startedAt));
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() === 1062) {
                throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['uuid' => ['Este UUID já foi utilizado.']]], [], $e);
            }
            throw $e;
        }

        return $this->presentPause($this->sessions->findSessionPause($sessionId, strtolower($pauseUuid)) ?? []);
    }

    /**
     * Fim de pausa com o horário do dispositivo (sincronização). Pausa já encerrada: devolve como está.
     *
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function endPauseAt(AuthenticatedUser $user, string $sessionUuid, string $pauseUuid, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['encerrada_em']);
        $endedAt = Dates::parse($input['encerrada_em'] ?? null);
        if ($endedAt === null) {
            $errors->add('encerrada_em', 'Informe a data e hora em ISO 8601 com fuso.');
        }
        $errors->throwIfAny();

        $session = $this->openOwned($user, $sessionUuid, true);
        $pause = Uuid::isValid($pauseUuid) ? $this->sessions->findSessionPause((int) $session['id'], strtolower($pauseUuid)) : null;
        if ($pause === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        if ($pause['encerrada_em'] !== null) {
            return $this->presentPause($pause);
        }
        $started = Dates::parse(Dates::fromDb($pause['iniciada_em']));
        if (($started !== null && $endedAt < $started) || $endedAt > Dates::nowUtc()->modify('+5 minutes')) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['encerrada_em' => ['Deve ser posterior ao início da pausa e não pode estar no futuro.']]]);
        }
        $this->sessions->closePause((int) $pause['id'], Dates::toDb($endedAt));

        return $this->presentPause($this->sessions->findSessionPause((int) $session['id'], strtolower($pauseUuid)) ?? []);
    }

    /** Copia a prescrição para a sessão: o que foi feito fica independente de edições futuras do programa. */
    private function copyPrescription(int $sessionId, int $fichaId): void
    {
        foreach ($this->sessions->prescribedItems($fichaId) as $item) {
            $itemId = $this->sessions->insertExercise(Uuid::v4(), $sessionId, (int) $item['exercicio_id'], (int) $item['ordem'], 'prescrito', null, (int) $item['id']);
            foreach ($item['series'] as $series) {
                $this->sessions->insertSeries(Uuid::v4(), $itemId, (int) $series['ordem'], (string) $series['tipo'], (int) $series['id']);
            }
        }
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
     * Troca o exercício no meio da sessão sem perder o histórico (Doc 06 §8.1, CT-34): o item original continua com
     * o que já foi registrado; as séries pendentes passam ao substituto, que fica logo depois e guarda qual era
     * o exercício originalmente previsto.
     *
     * @param array<string, mixed> $input
     * @return array{status: int, data: array<string, mixed>}
     */
    public function replaceExercise(AuthenticatedUser $user, string $uuid, string $itemUuid, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['uuid', 'exercicio_uuid']);
        $clientUuid = $this->optionalUuid($input, 'uuid', $errors);
        $exercise = null;
        $exerciseUuid = $input['exercicio_uuid'] ?? null;
        if (!Uuid::isValid($exerciseUuid)) {
            $errors->add('exercicio_uuid', 'Informe um UUID válido.');
        } else {
            $exercise = $this->sessions->findPublishedExercise(strtolower((string) $exerciseUuid));
            if ($exercise === null) {
                $errors->add('exercicio_uuid', 'Exercício inexistente ou não publicado.');
            }
        }
        $errors->throwIfAny();

        $session = $this->openOwned($user, $uuid, true);
        $sessionId = (int) $session['id'];
        $old = Uuid::isValid($itemUuid) ? $this->sessions->findExercise($sessionId, strtolower($itemUuid)) : null;
        if ($old === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        if ($clientUuid !== null && $this->sessions->findExercise($sessionId, $clientUuid) !== null) {
            return ['status' => 200, 'data' => $this->exercisePayload($sessionId, $clientUuid)];
        }
        $newExerciseId = (int) ($exercise['id'] ?? 0);
        if ($newExerciseId === (int) $old['exercicio_id']) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['exercicio_uuid' => ['Escolha um exercício diferente do atual.']]]);
        }

        $newUuid = $clientUuid ?? Uuid::v4();
        $originalPlanned = $old['exercicio_prescrito_id'] !== null ? (int) $old['exercicio_prescrito_id'] : (int) $old['exercicio_id'];
        $this->sessions->shiftOrdersAfter($sessionId, (int) $old['ordem']);
        try {
            $newItemId = $this->sessions->insertExercise(
                $newUuid,
                $sessionId,
                $newExerciseId,
                (int) $old['ordem'] + 1,
                'substituido',
                $originalPlanned,
                $old['ficha_exercicio_id'] === null ? null : (int) $old['ficha_exercicio_id'],
            );
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() === 1062 && $clientUuid !== null) {
                throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['uuid' => ['Este UUID já foi utilizado.']]], [], $e);
            }
            throw $e;
        }
        $this->sessions->migratePendingSeries((int) $old['id'], $newItemId);

        return ['status' => 201, 'data' => $this->exercisePayload($sessionId, $newUuid)];
    }

    /**
     * Pausa a sessão. Se já estiver pausada, devolve a pausa em aberto (idempotente).
     *
     * @return array<string, mixed>
     */
    public function pause(AuthenticatedUser $user, string $uuid): array
    {
        $session = $this->openOwned($user, $uuid, true);
        $sessionId = (int) $session['id'];
        $open = $this->sessions->openPause($sessionId);
        if ($open === null) {
            $pauseUuid = Uuid::v4();
            $this->sessions->insertPause($pauseUuid, $sessionId, Dates::toDb(Dates::nowUtc()));
            $open = $this->sessions->findPause($pauseUuid);
        }

        return $this->presentPause($open ?? []);
    }

    /**
     * Retoma a sessão, encerrando a pausa em aberto. Sem pausa em aberto, não há o que retomar.
     *
     * @return array<string, mixed>
     */
    public function resume(AuthenticatedUser $user, string $uuid): array
    {
        $session = $this->openOwned($user, $uuid, true);
        $open = $this->sessions->openPause((int) $session['id']);
        if ($open === null) {
            throw new ApiException(ErrorCode::ValidationError, 'Não há pausa em andamento para retomar.', ['fields' => ['sessao' => ['A sessão não está pausada.']]]);
        }
        $this->sessions->closePause((int) $open['id'], Dates::toDb(Dates::nowUtc()));

        return $this->presentPause($this->sessions->findPause((string) $open['uuid']) ?? []);
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
    public function updateSeries(AuthenticatedUser $user, string $uuid, string $seriesUuid, array $input, ?int $deviceId = null): array
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
        if ($deviceId !== null && $series['dispositivo_id'] !== null && (int) $series['dispositivo_id'] !== $deviceId
            && $clientTime !== null && $series['atualizado_cliente_em'] !== null && $clientTime <= (string) $series['atualizado_cliente_em']
            && $this->diverges($series, $changes)) {
            // Outro dispositivo gravou valores diferentes e mais recentes: sem sobrescrita silenciosa (Doc 06 §7.4).
            throw new ApiException(ErrorCode::RevisionConflict, null, ['estado_servidor' => $this->presentSeries($series)]);
        }
        if ($clientTime !== null && $series['atualizado_cliente_em'] !== null && $clientTime < (string) $series['atualizado_cliente_em']) {
            return $this->presentSeries($series); // escrita mais antiga: o estado mais novo prevalece
        }
        if ($deviceId !== null) {
            $changes['dispositivo_id'] = $deviceId;
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
     * @param array<string, mixed> $series linha atual
     * @param array<string, mixed> $changes valores novos (colunas)
     */
    private function diverges(array $series, array $changes): bool
    {
        foreach (['carga_kg', 'repeticoes', 'duracao_segundos', 'rir_real', 'status', 'tipo'] as $field) {
            if (!array_key_exists($field, $changes)) {
                continue;
            }
            $current = $series[$field] ?? null;
            $same = is_float($changes[$field]) ? $current !== null && abs((float) $current - $changes[$field]) < 0.005 : (string) $current === (string) $changes[$field];
            if (!$same) {
                return true;
            }
        }

        return false;
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
            'titulo' => $row['titulo_avulso'] ?? $row['ficha_titulo'],
            'status' => $row['status'],
            'iniciada_em' => Dates::fromDb($row['iniciada_em']),
            'encerrada_em' => Dates::fromDb($row['encerrada_em']),
            'duracao_ativa_segundos' => $row['duracao_ativa_segundos'] === null ? null : (int) $row['duracao_ativa_segundos'],
            'programa_id' => $row['programa_uuid'],
            'versao_numero' => $row['versao_numero'] === null ? null : (int) $row['versao_numero'],
            'ficha_id' => $row['ficha_uuid'],
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
            'pausas' => array_map(fn (array $p): array => $this->presentPause($p), $this->sessions->pauses($sessionId)),
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
            'ficha_exercicio_id' => $e['ficha_exercicio_uuid'] ?? null,
            'exercicio' => ExercisePresenter::summary(['uuid' => $e['exercicio_uuid']] + $e, $groups),
            'exercicio_prescrito_id' => $e['prescrito_uuid'] ?? null,
            'tipo_item' => $e['tipo_item'],
            'ordem' => (int) $e['ordem'],
            'series' => $series,
        ];
    }

    /**
     * @param array<string, mixed> $p
     * @return array<string, mixed>
     */
    private function presentPause(array $p): array
    {
        return ['id' => $p['uuid'] ?? null, 'iniciada_em' => Dates::fromDb($p['iniciada_em'] ?? null), 'encerrada_em' => Dates::fromDb($p['encerrada_em'] ?? null)];
    }

    /**
     * @param array<string, mixed> $s
     * @return array<string, mixed>
     */
    private function presentSeries(array $s): array
    {
        return [
            'id' => $s['uuid'] ?? null,
            'serie_prescrita_id' => $s['serie_prescrita_uuid'] ?? null,
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
