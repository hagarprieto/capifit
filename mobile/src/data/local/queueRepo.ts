import { newUuid } from '@/lib/uuid';

import type { LocalDb } from './db';

export type QueueEntity = 'sessao_treino' | 'sessao_pausa' | 'sessao_exercicio' | 'sessao_serie';
export type QueueType = 'criar' | 'atualizar' | 'concluir' | 'cancelar';
export type QueueState = 'pendente' | 'enviando' | 'aplicada' | 'rejeitada' | 'conflito';

export type QueuedOperation = {
  sequencia: number;
  operacao_uuid: string;
  entidade: QueueEntity;
  entidade_uuid: string;
  sessao_uuid: string | null;
  tipo: QueueType;
  payload: Record<string, unknown>;
  estado: QueueState;
  tentativas: number;
  erro_codigo: string | null;
  erro_mensagem: string | null;
  criada_em: string;
};

type Row = Omit<QueuedOperation, 'payload'> & { payload: string };

const parse = (row: Row): QueuedOperation => ({ ...row, payload: JSON.parse(row.payload) as Record<string, unknown> });
const now = () => new Date().toISOString();

/**
 * Fila de operações a enviar ao servidor (`/sync/push`). A ordem de envio é a `sequencia` (crescente por usuário) e o
 * `operacao_uuid` nasce junto com a operação e nunca muda: reenviar a mesma operação é sempre seguro. Uma operação que o
 * servidor rejeitou ou deu conflito NÃO sai da fila: fica visível para o usuário revisar.
 */
export function createQueueRepo(db: LocalDb, userUuid: string) {
  return {
    async enqueue(op: { entidade: QueueEntity; entidade_uuid: string; tipo: QueueType; payload: Record<string, unknown>; sessao_uuid?: string; operacao_uuid?: string }): Promise<QueuedOperation> {
      const operacaoUuid = op.operacao_uuid ?? newUuid();
      const at = now();
      await db.runAsync(
        `INSERT INTO fila_operacao (operacao_uuid, usuario_uuid, entidade, entidade_uuid, sessao_uuid, tipo, payload, criada_em, atualizada_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [operacaoUuid, userUuid, op.entidade, op.entidade_uuid, op.sessao_uuid ?? null, op.tipo, JSON.stringify(op.payload), at, at],
      );
      const row = await db.getFirstAsync<Row>('SELECT * FROM fila_operacao WHERE operacao_uuid = ?', [operacaoUuid]);
      return parse(row as Row);
    },

    /** Próximas operações a enviar, na ordem em que foram criadas. */
    async pending(limit = 50): Promise<QueuedOperation[]> {
      return (await db.getAllAsync<Row>("SELECT * FROM fila_operacao WHERE usuario_uuid = ? AND estado = 'pendente' ORDER BY sequencia LIMIT ?", [userUuid, limit])).map(parse);
    },

    /** Operações que pedem atenção do usuário (rejeitadas ou em conflito). */
    async needsReview(): Promise<QueuedOperation[]> {
      return (await db.getAllAsync<Row>("SELECT * FROM fila_operacao WHERE usuario_uuid = ? AND estado IN ('rejeitada', 'conflito') ORDER BY sequencia", [userUuid])).map(parse);
    },

    /** Contagem por estado, para o indicador de sincronização. */
    async counts(): Promise<Record<QueueState, number>> {
      const rows = await db.getAllAsync<{ estado: QueueState; total: number }>('SELECT estado, COUNT(*) AS total FROM fila_operacao WHERE usuario_uuid = ? GROUP BY estado', [userUuid]);
      const counts: Record<QueueState, number> = { pendente: 0, enviando: 0, aplicada: 0, rejeitada: 0, conflito: 0 };
      for (const row of rows) {
        counts[row.estado] = row.total;
      }
      return counts;
    },

    /** Marca as operações como "enviando" e conta a tentativa. */
    async markSending(operacaoUuids: string[]): Promise<void> {
      await db.transaction(async (tx) => {
        for (const uuid of operacaoUuids) {
          await tx.runAsync("UPDATE fila_operacao SET estado = 'enviando', tentativas = tentativas + 1, atualizada_em = ? WHERE operacao_uuid = ? AND usuario_uuid = ?", [now(), uuid, userUuid]);
        }
      });
    },

    async markApplied(operacaoUuid: string): Promise<void> {
      await db.runAsync("UPDATE fila_operacao SET estado = 'aplicada', erro_codigo = NULL, erro_mensagem = NULL, atualizada_em = ? WHERE operacao_uuid = ? AND usuario_uuid = ?", [now(), operacaoUuid, userUuid]);
    },

    async markFailed(operacaoUuid: string, state: 'rejeitada' | 'conflito', code: string, message: string): Promise<void> {
      await db.runAsync('UPDATE fila_operacao SET estado = ?, erro_codigo = ?, erro_mensagem = ?, atualizada_em = ? WHERE operacao_uuid = ? AND usuario_uuid = ?', [state, code, message, now(), operacaoUuid, userUuid]);
    },

    /**
     * Devolve a "pendente" o que ficou "enviando" (o app fechou no meio do envio). Seguro: o servidor devolve o mesmo
     * resultado para um `operacao_uuid` repetido.
     */
    async requeueInterrupted(): Promise<number> {
      return (await db.runAsync("UPDATE fila_operacao SET estado = 'pendente', atualizada_em = ? WHERE usuario_uuid = ? AND estado = 'enviando'", [now(), userUuid])).changes;
    },

    /** O servidor não respondeu esta operação no lote: ela volta a pendente para a próxima rodada. */
    async retryUnanswered(operacaoUuid: string): Promise<void> {
      await db.runAsync("UPDATE fila_operacao SET estado = 'pendente', atualizada_em = ? WHERE operacao_uuid = ? AND usuario_uuid = ? AND estado = 'enviando'", [now(), operacaoUuid, userUuid]);
    },

    /** Operações da sessão que ainda não foram aplicadas (pendentes, enviando ou em revisão). */
    async openForSession(sessionUuid: string): Promise<number> {
      return (await db.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM fila_operacao WHERE usuario_uuid = ? AND sessao_uuid = ? AND estado <> 'aplicada'", [userUuid, sessionUuid]))?.total ?? 0;
    },

    async hasApplied(sessionUuid: string): Promise<boolean> {
      return ((await db.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM fila_operacao WHERE usuario_uuid = ? AND sessao_uuid = ? AND estado = 'aplicada'", [userUuid, sessionUuid]))?.total ?? 0) > 0;
    },

    /** Reenvia uma operação revisada pelo usuário. */
    async retry(operacaoUuid: string): Promise<boolean> {
      return (await db.runAsync("UPDATE fila_operacao SET estado = 'pendente', erro_codigo = NULL, erro_mensagem = NULL, atualizada_em = ? WHERE operacao_uuid = ? AND usuario_uuid = ? AND estado IN ('rejeitada', 'conflito')", [now(), operacaoUuid, userUuid])).changes > 0;
    },

    /** Apaga as operações já aplicadas (as pendentes e as que pedem revisão ficam). */
    async purgeApplied(): Promise<number> {
      return (await db.runAsync("DELETE FROM fila_operacao WHERE usuario_uuid = ? AND estado = 'aplicada'", [userUuid])).changes;
    },
  };
}

export type QueueRepo = ReturnType<typeof createQueueRepo>;
