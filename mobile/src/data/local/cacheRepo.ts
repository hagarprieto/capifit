import type { LocalDb } from './db';

/**
 * Cache de respostas da API em JSON (programa ativo, últimos registros…), por usuário e chave. É só uma cópia para uso
 * offline: a fonte da verdade é o servidor. Um valor ilegível é tratado como ausente, nunca derruba a tela.
 */
export function createCacheRepo(db: LocalDb, userUuid: string) {
  return {
    async set(key: string, value: unknown): Promise<void> {
      await db.runAsync(
        `INSERT INTO cache_json (usuario_uuid, chave, valor, atualizado_em) VALUES (?, ?, ?, ?)
         ON CONFLICT (usuario_uuid, chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`,
        [userUuid, key, JSON.stringify(value), new Date().toISOString()],
      );
    },

    async get<T>(key: string): Promise<{ value: T; updatedAt: string } | null> {
      const row = await db.getFirstAsync<{ valor: string; atualizado_em: string }>('SELECT valor, atualizado_em FROM cache_json WHERE usuario_uuid = ? AND chave = ?', [userUuid, key]);
      if (!row) {
        return null;
      }
      try {
        return { value: JSON.parse(row.valor) as T, updatedAt: row.atualizado_em };
      } catch {
        return null;
      }
    },

    async remove(key: string): Promise<void> {
      await db.runAsync('DELETE FROM cache_json WHERE usuario_uuid = ? AND chave = ?', [userUuid, key]);
    },
  };
}

export type CacheRepo = ReturnType<typeof createCacheRepo>;

/**
 * Apaga TUDO do usuário no aparelho (sair da conta ou excluir dados). A fila vai junto: use só depois de confirmar com
 * o usuário quando houver operações não enviadas.
 */
export async function purgeUserData(db: LocalDb, userUuid: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.runAsync('DELETE FROM sessao WHERE usuario_uuid = ?', [userUuid]);
    await tx.runAsync('DELETE FROM fila_operacao WHERE usuario_uuid = ?', [userUuid]);
    await tx.runAsync('DELETE FROM cache_json WHERE usuario_uuid = ?', [userUuid]);
  });
}
