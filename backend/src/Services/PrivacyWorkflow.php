<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Config;
use CapiFit\Infrastructure\Database\Connection;

/**
 * Workflow interno dos pedidos do titular (E02-02), executado por `php bin/process-privacy-requests.php` (agendado).
 * Cada pedido é reservado (`solicitada → em_processamento`) antes de processar, então duas execuções simultâneas não
 * o processam duas vezes; falha devolve o pedido a `solicitada` para a próxima rodada.
 *
 * Exportação: grava o pacote JSON em EXPORT_DIR (privado) e guarda só a CHAVE do arquivo; a URL é gerada, temporária
 * e assinada, a cada consulta. Exclusão: ANONIMIZA a conta (nome, e-mail, senha) e remove dados pessoais e sensíveis
 * (perfil e restrições de saúde, sessões de login, tokens, dispositivos, anotações livres e títulos dos programas do
 * próprio usuário). Ficam, sem identificação: o histórico de treino anônimo, o registro dos consentimentos e dos
 * pedidos e a trilha de auditoria (prova de conformidade). Títulos de ficha em versões já publicadas são imutáveis
 * por trigger e permanecem, sem vínculo com pessoa identificável.
 */
final class PrivacyWorkflow
{
    public function __construct(
        private readonly Connection $db,
        private readonly Config $config,
        private readonly DataExportBuilder $exports,
    ) {
    }

    /** @return array{exportacoes: int, exclusoes: int, falhas: int} */
    public function run(int $limit = 50): array
    {
        $result = ['exportacoes' => 0, 'exclusoes' => 0, 'falhas' => 0];
        $pending = $this->db->fetchAll(
            "SELECT id, uuid, usuario_id, tipo FROM solicitacoes_titular WHERE estado = 'solicitada' ORDER BY id LIMIT ?",
            'i',
            $limit,
        );
        foreach ($pending as $request) {
            if ($this->db->execute("UPDATE solicitacoes_titular SET estado = 'em_processamento' WHERE id = ? AND estado = 'solicitada'", 'i', (int) $request['id']) !== 1) {
                continue; // outra execução reservou primeiro
            }
            try {
                if ($request['tipo'] === 'exportacao') {
                    $this->export((int) $request['id'], (string) $request['uuid'], (int) $request['usuario_id']);
                    ++$result['exportacoes'];
                } else {
                    $this->erase((int) $request['id'], (int) $request['usuario_id']);
                    ++$result['exclusoes'];
                }
            } catch (\Throwable) {
                $this->db->execute("UPDATE solicitacoes_titular SET estado = 'solicitada' WHERE id = ? AND estado = 'em_processamento'", 'i', (int) $request['id']);
                ++$result['falhas'];
            }
        }

        return $result;
    }

    private function export(int $requestId, string $requestUuid, int $userId): void
    {
        $dir = rtrim($this->config->exportDir, '/\\');
        if ($dir === '' || (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir))) {
            throw new \RuntimeException('Diretório de exportação indisponível.');
        }
        $key = "exports/$requestUuid.json";
        $path = $dir . DIRECTORY_SEPARATOR . $requestUuid . '.json';
        $json = json_encode($this->exports->build($userId), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException('Não foi possível gravar a exportação.');
        }
        @chmod($path, 0600);
        $this->db->execute("UPDATE solicitacoes_titular SET estado = 'concluida', concluida_em = NOW(6), arquivo_url = ? WHERE id = ?", 'si', $key, $requestId);
    }

    private function erase(int $requestId, int $userId): void
    {
        $this->db->transaction(function () use ($requestId, $userId): void {
            $uuid = (string) ($this->db->fetchOne('SELECT uuid FROM usuarios WHERE id = ? FOR UPDATE', 'i', $userId)['uuid'] ?? '');
            if ($uuid === '') {
                throw new \RuntimeException('Conta inexistente.');
            }
            $this->db->execute(
                "UPDATE usuarios SET nome = 'Conta excluída', email = ?, senha_hash = NULL, estado = 'excluido', excluido_em = NOW(6), email_verificado_em = NULL WHERE id = ?",
                'si',
                "excluido-$uuid@excluido.capifit.invalid",
                $userId,
            );
            foreach (['perfis_treinamento' => 'usuario_id', 'sessoes_autenticacao' => 'usuario_id', 'tokens_acao' => 'usuario_id', 'requisicoes_idempotentes' => 'usuario_id', 'operacoes_sync' => 'usuario_id', 'programas_ativos' => 'aluno_id'] as $table => $column) {
                $this->db->execute("DELETE FROM $table WHERE $column = ?", 'i', $userId);
            }
            $this->db->execute('UPDATE dispositivos_sync SET revogado_em = COALESCE(revogado_em, NOW(6)) WHERE usuario_id = ?', 'i', $userId);
            $this->db->execute('UPDATE sessoes_treino SET observacoes = NULL, titulo_avulso = NULL WHERE aluno_id = ?', 'i', $userId);
            $this->db->execute("UPDATE programas_treino SET titulo = 'Programa excluído', objetivo = NULL, status = 'arquivado' WHERE aluno_id = ? AND origem = 'usuario'", 'i', $userId);
            $this->db->execute("UPDATE solicitacoes_titular SET estado = 'concluida', concluida_em = NOW(6) WHERE id = ?", 'i', $requestId);
            $this->db->execute(
                "INSERT INTO auditoria_eventos(ator_id, acao, recurso, recurso_id) VALUES (NULL, 'titular.conta_anonimizada', 'usuario', ?)",
                's',
                $uuid,
            );
        });
    }
}
