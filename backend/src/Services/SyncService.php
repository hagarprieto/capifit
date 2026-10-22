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

/**
 * Lote de sincronização offline (`POST /sync/push`, E08-04; Doc 05 §10, Doc 06 §7).
 *
 * Cada operação vira a chamada do serviço REST equivalente (mesmas regras de validação) dentro de uma transação
 * própria, junto com o registro em `operacoes_sync`. Resultado por item: `aplicada`, `conflito` (estado do servidor
 * mudou: sessão encerrada, outra sessão aberta, série alterada por outro dispositivo) ou `rejeitada` (dado inválido).
 * O mesmo `operacao_uuid` com o mesmo conteúdo devolve o resultado guardado; com conteúdo diferente, conflito.
 */
final class SyncService
{
    public const MAX_OPERATIONS = 50;
    private const CONFLICTS = [ErrorCode::SessionClosed, ErrorCode::SessionAlreadyOpen, ErrorCode::RevisionConflict, ErrorCode::ProgramVersionConflict, ErrorCode::VersionImmutable, ErrorCode::IdempotencyKeyReused];
    private const ALLOWED = [
        'sessao_treino' => ['criar', 'atualizar', 'concluir', 'cancelar'],
        'sessao_pausa' => ['criar', 'atualizar'],
        'sessao_exercicio' => ['criar'],
        'sessao_serie' => ['criar', 'atualizar'],
    ];
    private const CLOCK_SKEW_SECONDS = 86400;

    public function __construct(
        private readonly Connection $db,
        private readonly SessionService $sessions,
    ) {
    }

    /**
     * @param array<string, mixed> $input
     * @return array{resultados: list<array<string, mixed>>, server_time: string}
     */
    public function push(AuthenticatedUser $user, array $input): array
    {
        [$deviceId, $operations] = $this->validateEnvelope($user, $input);

        $order = array_keys($operations);
        if (!in_array(null, array_column($operations, 'sequencia_cliente'), true)) {
            usort($order, static fn (int $a, int $b): int => [$operations[$a]['sequencia_cliente'], $a] <=> [$operations[$b]['sequencia_cliente'], $b]);
        }
        $results = [];
        foreach ($order as $index) {
            $results[$index] = $this->process($user, $deviceId, $operations[$index]);
        }
        ksort($results);
        $this->db->execute('UPDATE dispositivos_sync SET ultima_sync_em = NOW(6) WHERE id = ?', 'i', $deviceId);

        return ['resultados' => array_values($results), 'server_time' => (string) Dates::fromDb(Dates::toDb(Dates::nowUtc()))];
    }

    /**
     * @param array<string, mixed> $input
     * @return array{int, list<array<string, mixed>>}
     */
    private function validateEnvelope(AuthenticatedUser $user, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['dispositivo_uuid', 'operacoes']);
        $deviceUuid = $input['dispositivo_uuid'] ?? null;
        if (!Uuid::isValid($deviceUuid)) {
            $errors->add('dispositivo_uuid', 'Informe um UUID válido.');
        }
        $list = $input['operacoes'] ?? null;
        if (!is_array($list) || !array_is_list($list) || $list === [] || count($list) > self::MAX_OPERATIONS) {
            $errors->add('operacoes', 'Envie de 1 a ' . self::MAX_OPERATIONS . ' operações.');
            $list = [];
        }
        $operations = [];
        foreach ($list as $i => $op) {
            $p = "operacoes.$i";
            if (!is_array($op)) {
                $errors->add($p, 'Deve ser um objeto.');
                continue;
            }
            foreach (array_keys($op) as $key) {
                if (!in_array($key, ['operacao_uuid', 'sequencia_cliente', 'entidade', 'entidade_uuid', 'tipo', 'payload'], true)) {
                    $errors->add("$p.$key", 'Campo não permitido.');
                }
            }
            foreach (['operacao_uuid', 'entidade_uuid'] as $field) {
                if (!Uuid::isValid($op[$field] ?? null)) {
                    $errors->add("$p.$field", 'Informe um UUID válido.');
                }
            }
            $entity = $op['entidade'] ?? null;
            if (!is_string($entity) || !isset(self::ALLOWED[$entity])) {
                $errors->add("$p.entidade", 'Use sessao_treino, sessao_pausa, sessao_exercicio ou sessao_serie.');
            }
            $type = $op['tipo'] ?? null;
            if (!is_string($type) || !in_array($type, ['criar', 'atualizar', 'concluir', 'cancelar'], true)) {
                $errors->add("$p.tipo", 'Use criar, atualizar, concluir ou cancelar.');
            }
            $sequence = $op['sequencia_cliente'] ?? null;
            if ($sequence !== null && (!is_int($sequence) || $sequence < 0)) {
                $errors->add("$p.sequencia_cliente", 'Deve ser um inteiro a partir de 0.');
                $sequence = null;
            }
            $payload = $op['payload'] ?? null;
            if (!is_array($payload) || ($payload !== [] && array_is_list($payload))) {
                $errors->add("$p.payload", 'Deve ser um objeto.');
                $payload = [];
            }
            $operations[] = [
                'operacao_uuid' => strtolower((string) ($op['operacao_uuid'] ?? '')),
                'entidade_uuid' => strtolower((string) ($op['entidade_uuid'] ?? '')),
                'entidade' => (string) $entity,
                'tipo' => (string) $type,
                'sequencia_cliente' => $sequence,
                'payload' => $payload,
            ];
        }
        $errors->throwIfAny();

        $device = $this->db->fetchOne('SELECT id, revogado_em FROM dispositivos_sync WHERE usuario_id = ? AND dispositivo_uuid = ?', 'is', $user->id, strtolower((string) $deviceUuid));
        if ($device === null) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['dispositivo_uuid' => ['Registre o dispositivo antes de sincronizar.']]]);
        }
        if ($device['revogado_em'] !== null) {
            throw new ApiException(ErrorCode::Forbidden, 'Este dispositivo foi revogado e não pode sincronizar.');
        }

        return [(int) $device['id'], $operations];
    }

    /**
     * @param array<string, mixed> $op
     * @return array<string, mixed>
     */
    private function process(AuthenticatedUser $user, int $deviceId, array $op): array
    {
        $hash = $this->hash($op);
        $stored = $this->stored($user, $op['operacao_uuid']);
        if ($stored !== null) {
            return $this->replay($stored, $hash, $op);
        }
        if (!in_array($op['tipo'], self::ALLOWED[$op['entidade']], true)) {
            return $this->record($user, $deviceId, $op, $hash, $this->failure($op, new ApiException(ErrorCode::ValidationError, null, ['fields' => ['tipo' => ['Operação não permitida para esta entidade.']]])));
        }

        try {
            return $this->db->transaction(function () use ($user, $deviceId, $op, $hash): array {
                $skew = $this->apply($user, $deviceId, $op);
                $item = ['operacao_uuid' => $op['operacao_uuid'], 'resultado' => 'aplicada', 'recurso_uuid' => $op['entidade_uuid']] + ($skew ? ['clock_skew' => true] : []);

                return $this->insertRecord($user, $deviceId, $op, $hash, $item);
            });
        } catch (ApiException $e) {
            return $this->record($user, $deviceId, $op, $hash, $this->failure($op, $e));
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() === 1062 && str_contains($e->getMessage(), 'uq_sync_idempotencia')) {
                $stored = $this->stored($user, $op['operacao_uuid']);
                if ($stored !== null) {
                    return $this->replay($stored, $hash, $op); // outra requisição idêntica gravou primeiro
                }
            }
            throw $e;
        }
    }

    /**
     * Executa a operação pelo serviço REST equivalente. Devolve se o horário do dispositivo foi corrigido.
     *
     * @param array<string, mixed> $op
     */
    private function apply(AuthenticatedUser $user, int $deviceId, array $op): bool
    {
        $uuid = $op['entidade_uuid'];
        $payload = $op['payload'];
        $key = $op['entidade'] . ':' . $op['tipo'];

        if ($key === 'sessao_treino:criar') {
            $type = $payload['tipo'] ?? null;
            unset($payload['tipo']);
            $hasFicha = ($payload['ficha_uuid'] ?? null) !== null;
            if (($type === 'programado') !== $hasFicha || ($type !== null && !in_array($type, ['avulso', 'programado'], true))) {
                throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['tipo' => ['Use programado com ficha_uuid ou avulso sem ele.']]]);
            }
            $this->sessions->create($user, ['sessao_uuid' => $uuid] + $payload);

            return false;
        }
        match ($key) {
            'sessao_treino:atualizar' => $this->sessions->updateNotes($user, $uuid, $payload),
            'sessao_treino:concluir' => $this->sessions->complete($user, $uuid, $payload),
            'sessao_treino:cancelar' => $this->sessions->cancel($user, $uuid, $payload),
            default => null,
        };
        if (str_starts_with($key, 'sessao_treino:')) {
            return false;
        }

        $session = $this->take($payload, 'sessao_uuid');
        switch ($key) {
            case 'sessao_pausa:criar':
                $this->sessions->startPauseAt($user, $session, $uuid, $payload);
                break;
            case 'sessao_pausa:atualizar':
                $this->sessions->endPauseAt($user, $session, $uuid, $payload);
                break;
            case 'sessao_exercicio:criar':
                $replaces = $this->take($payload, 'substitui_uuid', false);
                $body = ['uuid' => $uuid] + $payload;
                if ($replaces !== null) {
                    unset($body['ordem']);
                    $this->sessions->replaceExercise($user, $session, $replaces, $body);
                } else {
                    $this->sessions->addExercise($user, $session, $body);
                }
                break;
            case 'sessao_serie:criar':
                $this->sessions->addSeries($user, $session, ['uuid' => $uuid] + $payload);
                break;
            case 'sessao_serie:atualizar':
                $skew = false;
                $sent = Dates::parse($payload['atualizado_cliente_em'] ?? null);
                if ($sent !== null && abs($sent->getTimestamp() - Dates::nowUtc()->getTimestamp()) > self::CLOCK_SKEW_SECONDS) {
                    $payload['atualizado_cliente_em'] = Dates::fromDb(Dates::toDb(Dates::nowUtc()));
                    $skew = true;
                }
                $this->sessions->updateSeries($user, $session, $uuid, $payload, $deviceId);

                return $skew;
        }

        return false;
    }

    /**
     * Retira do payload o campo que identifica a sessão (ou outro de roteamento); ausente ou inválido vira 422.
     *
     * @param array<string, mixed> $payload
     */
    private function take(array &$payload, string $field, bool $required = true): ?string
    {
        $value = $payload[$field] ?? null;
        unset($payload[$field]);
        if ($value === null && !$required) {
            return null;
        }
        if (!Uuid::isValid($value)) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => [$field => ['Informe um UUID válido.']]]);
        }

        return strtolower((string) $value);
    }

    /**
     * @param array<string, mixed> $op
     * @return array<string, mixed>
     */
    private function failure(array $op, ApiException $e): array
    {
        $details = $e->details;
        $serverState = null;
        if (isset($details['estado_servidor']) && is_array($details['estado_servidor'])) {
            $serverState = $details['estado_servidor'];
            unset($details['estado_servidor']);
        }
        $conflict = in_array($e->errorCode, self::CONFLICTS, true);
        if ($serverState === null && $conflict) {
            $serverState = $this->serverState($op, $e);
        }
        $item = [
            'operacao_uuid' => $op['operacao_uuid'],
            'resultado' => $conflict ? 'conflito' : 'rejeitada',
            'recurso_uuid' => null,
            'erro' => ['code' => $e->errorCode->value, 'message' => $e->getMessage()] + ($details === [] ? [] : ['details' => $details]),
        ];
        if ($serverState !== null) {
            $item['estado_servidor'] = $serverState;
        }

        return $item;
    }

    /**
     * @param array<string, mixed> $op
     * @return array<string, mixed>|null
     */
    private function serverState(array $op, ApiException $e): ?array
    {
        if ($e->errorCode === ErrorCode::SessionAlreadyOpen) {
            return isset($e->details['sessao_uuid']) ? ['sessao_uuid' => $e->details['sessao_uuid']] : null;
        }
        $sessionUuid = $op['entidade'] === 'sessao_treino' ? $op['entidade_uuid'] : ($op['payload']['sessao_uuid'] ?? null);
        if ($e->errorCode === ErrorCode::SessionClosed && Uuid::isValid($sessionUuid)) {
            $row = $this->db->fetchOne('SELECT status FROM sessoes_treino WHERE uuid = ?', 's', strtolower((string) $sessionUuid));

            return $row === null ? null : ['sessao_uuid' => strtolower((string) $sessionUuid), 'status' => $row['status']];
        }

        return null;
    }

    /**
     * @param array<string, mixed> $op
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private function record(AuthenticatedUser $user, int $deviceId, array $op, string $hash, array $item): array
    {
        try {
            return $this->db->transaction(fn (): array => $this->insertRecord($user, $deviceId, $op, $hash, $item));
        } catch (\mysqli_sql_exception $e) {
            if ($e->getCode() === 1062) {
                $stored = $this->stored($user, $op['operacao_uuid']);
                if ($stored !== null) {
                    return $this->replay($stored, $hash, $op);
                }
            }
            throw $e;
        }
    }

    /**
     * @param array<string, mixed> $op
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private function insertRecord(AuthenticatedUser $user, int $deviceId, array $op, string $hash, array $item): array
    {
        $this->db->execute(
            'INSERT INTO operacoes_sync(usuario_id, dispositivo_id, operacao_uuid, entidade, entidade_uuid, tipo, resultado, resposta_json, payload_hash, sequencia_cliente) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            'iisssssssi',
            $user->id,
            $deviceId,
            $op['operacao_uuid'],
            $op['entidade'],
            $op['entidade_uuid'],
            $op['tipo'],
            $item['resultado'],
            json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR),
            $hash,
            $op['sequencia_cliente'],
        );

        return $item;
    }

    /** @return array<string, mixed>|null */
    private function stored(AuthenticatedUser $user, string $operationUuid): ?array
    {
        return $this->db->fetchOne('SELECT payload_hash, resposta_json FROM operacoes_sync WHERE usuario_id = ? AND operacao_uuid = ?', 'is', $user->id, $operationUuid);
    }

    /**
     * @param array<string, mixed> $stored
     * @param array<string, mixed> $op
     * @return array<string, mixed>
     */
    private function replay(array $stored, string $hash, array $op): array
    {
        if (!hash_equals((string) $stored['payload_hash'], $hash)) {
            return $this->failure($op, new ApiException(ErrorCode::IdempotencyKeyReused));
        }
        $decoded = json_decode((string) $stored['resposta_json'], true, 512, JSON_THROW_ON_ERROR);

        return is_array($decoded) ? $decoded : $this->failure($op, new ApiException(ErrorCode::InternalError));
    }

    /** @param array<string, mixed> $op */
    private function hash(array $op): string
    {
        $canonical = $this->canonical([$op['entidade'], $op['entidade_uuid'], $op['tipo'], $op['payload']]);

        return hash('sha256', json_encode($canonical, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR));
    }

    /** Ordena as chaves recursivamente: a mesma operação gera o mesmo hash, qualquer que seja a ordem dos campos. */
    private function canonical(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        $value = array_map(fn (mixed $v): mixed => $this->canonical($v), $value);
        if (!array_is_list($value)) {
            ksort($value);
        }

        return $value;
    }
}
