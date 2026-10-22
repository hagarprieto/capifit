<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Auth\PasswordHasher;
use CapiFit\Config;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\Dates;
use CapiFit\Support\MediaUrlSigner;
use CapiFit\Support\Uuid;
use CapiFit\Validation\FieldErrors;

/**
 * Pedidos do titular de dados: exportação e exclusão de conta (E02-02; LGPD, RG-021, Doc 06 §8.3).
 *
 * A API só REGISTRA o pedido e acompanha o estado. Exportação: o arquivo é gerado depois pelo workflow interno
 * (`PrivacyWorkflow`). Exclusão: exige a senha e, no mesmo instante, suspende a conta e revoga todas as sessões;
 * a anonimização acontece no workflow. Um pedido ativo do mesmo tipo não se duplica: pedir de novo devolve o ativo.
 */
final class DataSubjectService
{
    public function __construct(
        private readonly Connection $db,
        private readonly Config $config,
        private readonly PasswordHasher $hasher,
        private readonly AuditService $audit,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthenticatedUser $user): array
    {
        $rows = $this->db->fetchAll('SELECT uuid, tipo, estado, solicitada_em, concluida_em, arquivo_url FROM solicitacoes_titular WHERE usuario_id = ? ORDER BY id DESC', 'i', $user->id);

        return array_map(fn (array $r): array => $this->present($r), $rows);
    }

    /** @return array<string, mixed> */
    public function get(AuthenticatedUser $user, string $uuid): array
    {
        $row = Uuid::isValid($uuid)
            ? $this->db->fetchOne('SELECT uuid, tipo, estado, solicitada_em, concluida_em, arquivo_url FROM solicitacoes_titular WHERE uuid = ? AND usuario_id = ?', 'si', strtolower($uuid), $user->id)
            : null;
        if ($row === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return $this->present($row);
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function create(AuthenticatedUser $user, array $input): array
    {
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['tipo', 'senha']);
        $type = $input['tipo'] ?? null;
        if (!is_string($type) || !in_array($type, ['exportacao', 'exclusao'], true)) {
            $errors->add('tipo', 'Use exportacao ou exclusao.');
            $type = null;
        }
        $password = $input['senha'] ?? null;
        if ($type === 'exclusao') {
            if (!is_string($password) || $password === '' || strlen($password) > 1024) {
                $errors->add('senha', 'Informe sua senha para confirmar a exclusão.');
            }
        } elseif ($password !== null) {
            $errors->add('senha', 'A senha só se aplica à exclusão.');
        }
        $errors->throwIfAny();

        // Trava a conta: dois pedidos simultâneos não criam dois registros ativos.
        $account = $this->db->fetchOne('SELECT senha_hash FROM usuarios WHERE id = ? FOR UPDATE', 'i', $user->id);
        if ($account === null) {
            throw new ApiException(ErrorCode::Unauthenticated);
        }
        if ($type === 'exclusao' && !$this->hasher->verify((string) $password, $account['senha_hash'] === null ? null : (string) $account['senha_hash'])) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['senha' => ['Senha incorreta.']]]);
        }

        $active = $this->db->fetchOne(
            "SELECT uuid, tipo, estado, solicitada_em, concluida_em, arquivo_url FROM solicitacoes_titular WHERE usuario_id = ? AND tipo = ? AND estado IN ('solicitada','em_processamento') ORDER BY id DESC LIMIT 1",
            'is',
            $user->id,
            $type,
        );
        if ($active === null) {
            $uuid = Uuid::v4();
            $this->db->execute('INSERT INTO solicitacoes_titular(uuid, usuario_id, tipo) VALUES (?, ?, ?)', 'sis', $uuid, $user->id, $type);
            $active = $this->db->fetchOne('SELECT uuid, tipo, estado, solicitada_em, concluida_em, arquivo_url FROM solicitacoes_titular WHERE uuid = ?', 's', $uuid);
            $this->audit->record($user, $type === 'exclusao' ? 'titular.exclusao_solicitada' : 'titular.exportacao_solicitada', 'usuario', (string) $this->db->fetchOne('SELECT uuid FROM usuarios WHERE id = ?', 'i', $user->id)['uuid']);
        }
        if ($type === 'exclusao') {
            // Acesso revogado na hora (RG-021), mesmo que a anonimização rode depois.
            $this->db->execute("UPDATE usuarios SET estado = 'suspenso' WHERE id = ? AND estado <> 'excluido'", 'i', $user->id);
            $this->db->execute('UPDATE sessoes_autenticacao SET revogado_em = NOW(6) WHERE usuario_id = ? AND revogado_em IS NULL', 'i', $user->id);
        }

        return $this->present($active ?? []);
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function present(array $row): array
    {
        $url = null;
        if ($row['estado'] === 'concluida' && $row['tipo'] === 'exportacao' && is_string($row['arquivo_url']) && $row['arquivo_url'] !== '') {
            $url = (new MediaUrlSigner($this->config->exportBaseUrl, $this->config->exportSigningSecret, $this->config->exportUrlTtlSeconds))->sign($row['arquivo_url']);
        }

        return [
            'id' => $row['uuid'],
            'tipo' => $row['tipo'],
            'estado' => $row['estado'],
            'solicitada_em' => Dates::fromDb($row['solicitada_em']),
            'concluida_em' => Dates::fromDb($row['concluida_em']),
            'download_url' => $url,
        ];
    }
}
