<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Services\CleanupService;
use CapiFit\Support\Uuid;

/** Faxina de limites de taxa, chaves de idempotência, tokens de ação e sessões de login (E00-10). */
final class CleanupTest extends ApiTestCase
{
    private function rows(string $table, string $where = '1=1'): int
    {
        return (int) $this->kernel->db->fetchOne("SELECT COUNT(*) AS n FROM $table WHERE $where")['n'];
    }

    public function testRemovesOnlyWhatIsPastRetentionAndKeepsTheRest(): void
    {
        $db = $this->kernel->db;
        $userId = (int) $db->fetchOne('SELECT id FROM usuarios WHERE uuid = ?', 's', $this->userUuid)['id'];
        $old = gmdate('Y-m-d H:i:s', time() - 40 * 86400);
        $recent = gmdate('Y-m-d H:i:s', time() - 3600);
        $marker = 'faxina-' . bin2hex(random_bytes(4));

        $db->execute('INSERT INTO limites_requisicao(chave_hash, janela_inicio, contagem) VALUES (?, ?, 1), (?, ?, 1)', 'ssss', hash('sha256', $marker . 'a'), $old, hash('sha256', $marker . 'b'), $recent);
        $db->execute('INSERT INTO requisicoes_idempotentes(usuario_id, chave, metodo, rota, payload_hash, criado_em) VALUES (?, ?, \'POST\', \'/x\', ?, ?), (?, ?, \'POST\', \'/x\', ?, ?)', 'isssisss', $userId, Uuid::v4(), hash('sha256', 'a'), $old, $userId, Uuid::v4(), hash('sha256', 'b'), $recent);
        $db->execute('INSERT INTO tokens_acao(usuario_id, tipo, token_hash, expira_em) VALUES (?, \'recuperacao_senha\', ?, ?), (?, \'recuperacao_senha\', ?, ?)', 'ississ', $userId, hash('sha256', $marker . 'c'), $old, $userId, hash('sha256', $marker . 'd'), gmdate('Y-m-d H:i:s', time() + 3600));
        $db->execute(
            'INSERT INTO sessoes_autenticacao(uuid, usuario_id, familia_uuid, refresh_hash, expira_em, revogado_em) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, NULL)',
            'sisssssisss',
            Uuid::v4(), $userId, Uuid::v4(), hash('sha256', $marker . 'e'), gmdate('Y-m-d H:i:s', time() + 86400), $old,
            Uuid::v4(), $userId, Uuid::v4(), hash('sha256', $marker . 'f'), gmdate('Y-m-d H:i:s', time() + 86400),
        );
        $sessionsBefore = $this->rows('sessoes_autenticacao', "usuario_id = $userId");

        $removed = (new CleanupService($db))->run();

        self::assertGreaterThanOrEqual(1, $removed['limites_requisicao']);
        self::assertSame(0, $this->rows('limites_requisicao', 'chave_hash = \'' . hash('sha256', $marker . 'a') . '\''));
        self::assertSame(1, $this->rows('limites_requisicao', 'chave_hash = \'' . hash('sha256', $marker . 'b') . '\''), 'janela recente permanece');
        self::assertSame(1, $this->rows('requisicoes_idempotentes', "usuario_id = $userId"), 'só a chave recente permanece');
        self::assertSame(0, $this->rows('tokens_acao', "token_hash = '" . hash('sha256', $marker . 'c') . "'"), 'token expirado há muito sai');
        self::assertSame(1, $this->rows('tokens_acao', "token_hash = '" . hash('sha256', $marker . 'd') . "'"), 'token ainda válido permanece');
        self::assertSame($sessionsBefore - 1, $this->rows('sessoes_autenticacao', "usuario_id = $userId"), 'só a sessão revogada há muito tempo sai');
        self::assertSame(200, $this->call('GET', '/me')['status'], 'a sessão ativa do usuário continua valendo');

        $second = (new CleanupService($db))->run();
        self::assertSame(0, $second['requisicoes_idempotentes'] + $second['tokens_acao'] + $second['sessoes_autenticacao'], 'rodar de novo não remove mais nada');
    }
}
