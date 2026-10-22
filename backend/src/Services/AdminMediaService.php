<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Auth\AuthenticatedUser;
use CapiFit\Http\ApiException;
use CapiFit\Http\ErrorCode;
use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\MediaUrlSigner;
use CapiFit\Support\Uuid;
use CapiFit\Validation\FieldErrors;

/**
 * Mídia dos exercícios (E03-06; Doc 08 §11.3, Doc 09 §3). O arquivo já está no storage; aqui só se vincula a chave.
 * A mídia nasce `em_revisao` e só aparece aos usuários depois de `aprovado` por OUTRO admin (quem vincula não aprova).
 * Aprovada, a mídia não é alterada: troca de arquivo = nova mídia, com novo ciclo.
 */
final class AdminMediaService
{
    private const TYPES = ['video_capi', 'video_humano', 'imagem', 'animacao_3d'];

    public function __construct(
        private readonly Connection $db,
        private readonly AuditService $audit,
    ) {
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function link(AuthenticatedUser $user, string $exerciseUuid, array $input): array
    {
        $this->requireAdmin($user);
        $errors = new FieldErrors();
        $errors->rejectUnknown($input, ['tipo', 'storage_key', 'versao']);
        $type = $input['tipo'] ?? null;
        if (!is_string($type) || !in_array($type, self::TYPES, true)) {
            $errors->add('tipo', 'Use video_capi, video_humano, imagem ou animacao_3d.');
        }
        $key = $input['storage_key'] ?? null;
        if (!is_string($key) || !MediaUrlSigner::validKey($key)) {
            $errors->add('storage_key', 'Chave inválida: use um caminho relativo simples (letras, números, "-", "_", "." e "/"), sem "..".');
        }
        $version = $input['versao'] ?? '1';
        $version = is_string($version) ? trim($version) : $version;
        if (!is_string($version) || $version === '' || mb_strlen($version) > 30) {
            $errors->add('versao', 'Deve ter entre 1 e 30 caracteres.');
        }
        $errors->throwIfAny();

        $exercise = Uuid::isValid($exerciseUuid)
            ? $this->db->fetchOne("SELECT id, uuid FROM exercicios WHERE uuid = ? AND status <> 'arquivado' FOR UPDATE", 's', strtolower($exerciseUuid))
            : null;
        if ($exercise === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }
        $duplicate = $this->db->fetchOne(
            "SELECT 1 AS x FROM midias_exercicio WHERE (url_storage = ? AND status <> 'rejeitado') OR (exercicio_id = ? AND tipo = ? AND versao = ? AND status <> 'rejeitado') LIMIT 1",
            'siss',
            $key,
            (int) $exercise['id'],
            $type,
            $version,
        );
        if ($duplicate !== null) {
            throw new ApiException(ErrorCode::ValidationError, null, ['fields' => ['storage_key' => ['Este arquivo, ou esta versão deste tipo de mídia, já está vinculado.']]]);
        }
        $this->db->execute("INSERT INTO midias_exercicio(exercicio_id, tipo, url_storage, versao, status) VALUES (?, ?, ?, ?, 'em_revisao')", 'isss', (int) $exercise['id'], $type, $key, $version);
        $id = $this->db->lastInsertId();
        $this->audit->record($user, 'midia.vinculada', 'midia', (string) $id, ['exercicio' => (string) $exercise['uuid'], 'tipo' => (string) $type]);

        return $this->present($this->row($id));
    }

    /**
     * Aprovação técnica e editorial. Só o que está `em_revisao`; quem vinculou não aprova.
     *
     * @return array<string, mixed>
     */
    public function approve(AuthenticatedUser $user, string $id): array
    {
        $this->requireAdmin($user);
        $row = preg_match('/^[1-9]\d{0,18}$/', $id) === 1 ? $this->row((int) $id, true) : throw new ApiException(ErrorCode::ResourceNotFound);
        if ($row['status'] !== 'em_revisao') {
            throw new ApiException(ErrorCode::InvalidState, 'Esta mídia não está aguardando revisão.', ['estado' => $row['status']]);
        }
        $linker = $this->db->fetchOne("SELECT ator_id FROM auditoria_eventos WHERE acao = 'midia.vinculada' AND recurso = 'midia' AND recurso_id = ? ORDER BY id LIMIT 1", 's', (string) $row['id']);
        if ($linker !== null && $linker['ator_id'] !== null && (int) $linker['ator_id'] === $user->id) {
            throw new ApiException(ErrorCode::Forbidden, 'Quem vinculou a mídia não pode aprová-la.');
        }
        $this->db->execute("UPDATE midias_exercicio SET status = 'aprovado', revisado_por = ?, revisado_em = NOW(6) WHERE id = ?", 'ii', $user->id, (int) $row['id']);
        $this->audit->record($user, 'midia.aprovada', 'midia', (string) $row['id']);

        return $this->present($this->row((int) $row['id']));
    }

    private function requireAdmin(AuthenticatedUser $user): void
    {
        if (!$user->hasRole('admin')) {
            throw new ApiException(ErrorCode::Forbidden);
        }
    }

    /** @return array<string, mixed> */
    private function row(int $id, bool $forUpdate = false): array
    {
        $row = $this->db->fetchOne('SELECT id, tipo, versao, status FROM midias_exercicio WHERE id = ?' . ($forUpdate ? ' FOR UPDATE' : ''), 'i', $id);
        if ($row === null) {
            throw new ApiException(ErrorCode::ResourceNotFound);
        }

        return $row;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function present(array $row): array
    {
        return ['id' => (string) $row['id'], 'tipo' => $row['tipo'], 'versao' => $row['versao'], 'status' => $row['status']];
    }
}
