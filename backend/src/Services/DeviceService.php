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
 * Dispositivos de sincronização do aluno (E01-08). Registrar é idempotente por UUID; revogar corta o acesso:
 * as sessões de login daquele dispositivo são revogadas junto, para ele não continuar entrando com um refresh antigo.
 */
final class DeviceService
{
    private const MAX_ACTIVE = 20;

    public function __construct(private readonly Connection $db)
    {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthenticatedUser $user): array
    {
        $rows = $this->db->fetchAll('SELECT dispositivo_uuid, ultima_sync_em, revogado_em FROM dispositivos_sync WHERE usuario_id = ? ORDER BY id DESC', 'i', $user->id);

        return array_map(fn (array $r): array => $this->present($r), $rows);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function register(AuthenticatedUser $user, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['dispositivo_uuid']);
        $uuid = $input['dispositivo_uuid'] ?? null;
        if (!Uuid::isValid($uuid)) {
            $errors->add('dispositivo_uuid', 'Informe um UUID válido.');
        }
        $errors->throwIfAny();
        $uuid = strtolower((string) $uuid);

        $existing = $this->find($user, $uuid, true);
        if ($existing !== null) {
            if ($existing['revogado_em'] !== null) {
                throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['dispositivo_uuid' => ['Este dispositivo foi revogado. Gere um novo identificador.']]]);
            }

            return $this->present($existing);
        }
        $active = (int) ($this->db->fetchOne('SELECT COUNT(*) AS n FROM dispositivos_sync WHERE usuario_id = ? AND revogado_em IS NULL', 'i', $user->id)['n'] ?? 0);
        if ($active >= self::MAX_ACTIVE) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['dispositivo_uuid' => ['Limite de dispositivos atingido. Revogue algum antes de adicionar outro.']]]);
        }
        $this->db->execute('INSERT INTO dispositivos_sync(usuario_id, dispositivo_uuid) VALUES (?, ?)', 'is', $user->id, $uuid);

        return $this->present($this->find($user, $uuid) ?? []);
    }

    /** Revoga o dispositivo e as sessões de login dele (idempotente). */
    public function revoke(AuthenticatedUser $user, string $uuid): void
    {
        $row = Uuid::isValid($uuid) ? $this->find($user, strtolower($uuid), true) : null;
        if ($row === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        if ($row['revogado_em'] === null) {
            $this->db->execute('UPDATE dispositivos_sync SET revogado_em = NOW(6) WHERE usuario_id = ? AND dispositivo_uuid = ?', 'is', $user->id, $row['dispositivo_uuid']);
        }
        $this->db->execute('UPDATE sessoes_autenticacao SET revogado_em = NOW(6) WHERE usuario_id = ? AND dispositivo_uuid = ? AND revogado_em IS NULL', 'is', $user->id, $row['dispositivo_uuid']);
    }

    /** @return array<string, mixed>|null */
    private function find(AuthenticatedUser $user, string $uuid, bool $forUpdate = false): ?array
    {
        return $this->db->fetchOne(
            'SELECT dispositivo_uuid, ultima_sync_em, revogado_em FROM dispositivos_sync WHERE usuario_id = ? AND dispositivo_uuid = ?' . ($forUpdate ? ' FOR UPDATE' : ''),
            'is',
            $user->id,
            $uuid,
        );
    }

    /**
     * @param array<string, mixed> $r
     * @return array<string, mixed>
     */
    private function present(array $r): array
    {
        return ['dispositivo_uuid' => $r['dispositivo_uuid'], 'ultima_sync_em' => Dates::fromDb($r['ultima_sync_em'] ?? null), 'revogado_em' => Dates::fromDb($r['revogado_em'] ?? null)];
    }
}
