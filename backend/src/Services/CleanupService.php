<?php

declare(strict_types=1);

namespace CapiFit\Services;

use CapiFit\Infrastructure\Database\Connection;
use CapiFit\Support\Dates;

/**
 * Faxina de dados operacionais que perdem a utilidade (E00-10). Remove em lotes pequenos para não segurar
 * travas por muito tempo e devolve só contagens (nunca conteúdo). Não toca em dados de treino nem em histórico.
 *
 * Retenção: janelas de limite de taxa 2 dias; chaves de idempotência 7 dias; tokens de ação (recuperação de senha e
 * verificação de e-mail) 7 dias depois de expirados ou usados; sessões de login 30 dias depois de expiradas ou revogadas.
 */
final class CleanupService
{
    private const BATCH = 1000;

    public function __construct(private readonly Connection $db)
    {
    }

    /** @return array<string, int> linhas removidas por tabela */
    public function run(?\DateTimeImmutable $now = null): array
    {
        $now ??= Dates::nowUtc();
        $at = static fn (string $modifier): string => Dates::toDb($now->modify($modifier));

        return [
            'limites_requisicao' => $this->purge('DELETE FROM limites_requisicao WHERE janela_inicio < ? LIMIT ' . self::BATCH, $at('-2 days')),
            'requisicoes_idempotentes' => $this->purge('DELETE FROM requisicoes_idempotentes WHERE criado_em < ? LIMIT ' . self::BATCH, $at('-7 days')),
            'tokens_acao' => $this->purge(
                'DELETE FROM tokens_acao WHERE expira_em < ? OR (usado_em IS NOT NULL AND usado_em < ?) LIMIT ' . self::BATCH,
                $at('-7 days'),
                $at('-7 days'),
            ),
            'sessoes_autenticacao' => $this->purge(
                'DELETE FROM sessoes_autenticacao WHERE expira_em < ? OR (revogado_em IS NOT NULL AND revogado_em < ?) LIMIT ' . self::BATCH,
                $at('-30 days'),
                $at('-30 days'),
            ),
        ];
    }

    /** Repete o lote até esgotar (a consulta já limita cada passada). */
    private function purge(string $sql, string ...$params): int
    {
        $total = 0;
        do {
            $removed = $this->db->execute($sql, str_repeat('s', count($params)), ...$params);
            $total += $removed;
        } while ($removed === self::BATCH);

        return $total;
    }
}
