<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\Dates;
use CapiFit\Validation\FieldErrors;

/**
 * Consentimentos do titular (E02-01; Doc 06 §8.3, LGPD). Só o dono vê e altera os seus. O registro é um histórico:
 * revogar preenche `revogado_em`, nunca apaga. Termos e política são condição de uso: para sair, o caminho é a
 * solicitação de exclusão. `compartilhamento_coach` nasce do vínculo com um coach (Fase 3), não desta rota.
 */
final class ConsentService
{
    private const SELF_SERVICE = ['termos_uso', 'politica_privacidade', 'dados_saude'];
    private const MANDATORY = ['termos_uso', 'politica_privacidade'];
    private const TYPES = ['termos_uso', 'politica_privacidade', 'dados_saude', 'compartilhamento_coach'];

    public function __construct(private readonly Connection $db)
    {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthenticatedUser $user): array
    {
        $rows = $this->db->fetchAll('SELECT id, tipo, versao_documento, concedido_em, revogado_em FROM consentimentos_privacidade WHERE usuario_id = ? ORDER BY concedido_em DESC, id DESC', 'i', $user->id);

        return array_map(fn (array $r): array => $this->present($r), $rows);
    }

    /**
     * Registra o aceite de uma versão do documento. Repetir o mesmo aceite ainda vigente não duplica a linha.
     *
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function grant(AuthenticatedUser $user, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['tipo', 'versao_documento']);
        $type = $input['tipo'] ?? null;
        if (!is_string($type) || !in_array($type, self::TYPES, true)) {
            $errors->add('tipo', 'Use termos_uso, politica_privacidade ou dados_saude.');
            $type = null;
        } elseif (!in_array($type, self::SELF_SERVICE, true)) {
            $errors->add('tipo', 'Este consentimento é registrado ao aceitar o vínculo com um coach.');
            $type = null;
        }
        $version = $input['versao_documento'] ?? null;
        $version = is_string($version) ? trim($version) : $version;
        if (!is_string($version) || mb_strlen($version) < 1 || mb_strlen($version) > 30) {
            $errors->add('versao_documento', 'Deve ter entre 1 e 30 caracteres.');
        }
        $errors->throwIfAny();

        $existing = $this->db->fetchOne(
            'SELECT id, tipo, versao_documento, concedido_em, revogado_em FROM consentimentos_privacidade WHERE usuario_id = ? AND tipo = ? AND versao_documento = ? AND revogado_em IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE',
            'iss',
            $user->id,
            $type,
            $version,
        );
        if ($existing !== null) {
            return $this->present($existing);
        }
        $this->db->execute('INSERT INTO consentimentos_privacidade(usuario_id, tipo, versao_documento) VALUES (?, ?, ?)', 'iss', $user->id, $type, $version);

        return $this->present($this->owned($user, (string) $this->db->lastInsertId()));
    }

    /**
     * Revoga um consentimento (idempotente). Termos e política não se revogam por aqui.
     *
     * @return array<string, mixed>
     */
    public function revoke(AuthenticatedUser $user, string $id): array
    {
        $row = $this->owned($user, $id, true);
        if (in_array($row['tipo'], self::MANDATORY, true)) {
            throw new ApiException(ErrorCode::ConsentMandatory);
        }
        if ($row['revogado_em'] === null) {
            $this->db->execute('UPDATE consentimentos_privacidade SET revogado_em = NOW(6) WHERE id = ?', 'i', $row['id']);
            $row = $this->owned($user, $id);
        }

        return $this->present($row);
    }

    /** @return array<string, mixed> consentimento do próprio usuário (404 para inexistente ou de outro) */
    private function owned(AuthenticatedUser $user, string $id, bool $forUpdate = false): array
    {
        $row = preg_match('/^[1-9]\d{0,18}$/', $id) === 1
            ? $this->db->fetchOne('SELECT id, tipo, versao_documento, concedido_em, revogado_em FROM consentimentos_privacidade WHERE id = ? AND usuario_id = ?' . ($forUpdate ? ' FOR UPDATE' : ''), 'ii', (int) $id, $user->id)
            : null;
        if ($row === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return $row;
    }

    /**
     * @param array<string, mixed> $r
     * @return array<string, mixed>
     */
    private function present(array $r): array
    {
        return [
            'id' => (string) $r['id'],
            'tipo' => $r['tipo'],
            'versao_documento' => $r['versao_documento'],
            'concedido_em' => Dates::fromDb($r['concedido_em']),
            'revogado_em' => Dates::fromDb($r['revogado_em']),
        ];
    }
}
