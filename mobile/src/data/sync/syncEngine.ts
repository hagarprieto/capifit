import type { ApiClient, Schemas } from '@/api/client';
import { isApiError } from '@/api/errors';

import type { QueuedOperation, QueueRepo } from '../local/queueRepo';
import type { SessionsRepo } from '../local/sessionsRepo';

type PushResponse = Schemas['SyncPushResponse'];

/** Tamanho máximo do lote aceito pelo servidor. */
export const BATCH_SIZE = 50;

export type FlushOutcome =
  | { status: 'done'; applied: number; needsReview: number }
  | { status: 'offline'; applied: number }
  | { status: 'blocked'; applied: number; code: string };

type Deps = {
  api: ApiClient;
  queue: QueueRepo;
  sessions: SessionsRepo;
  deviceUuid: string;
  /** Chamado ao fim de um envio completo com os treinos que acabaram de ficar confirmados pelo servidor. */
  onConfirmed?: (sessionUuids: string[]) => void;
};

/**
 * Envia a fila ao servidor (`POST /sync/push`) em lotes, na ordem em que as operações foram criadas. Regras:
 * - cada operação leva o `operacao_uuid` de sempre e a `sequencia_cliente`; reenviar nunca cria nada em duplicata;
 * - "aplicada" sai da fila; "conflito" e "rejeitada" ficam, com o motivo, para o usuário revisar (nada é descartado);
 * - sem rede, erro 5xx ou limite de requisições: o lote volta a "pendente" e o envio para, para tentar depois;
 * - só um envio por vez: chamadas simultâneas esperam o que já está em andamento.
 */
export function createSyncEngine({ api, queue, sessions, deviceUuid, onConfirmed }: Deps) {
  let running: Promise<FlushOutcome> | null = null;
  let reachable: boolean | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  async function sendBatch(batch: QueuedOperation[]): Promise<{ applied: number; answered: number } | { stop: FlushOutcome }> {
    await queue.markSending(batch.map((op) => op.operacao_uuid));
    let response: PushResponse;
    try {
      response = (
        await api.post<PushResponse>('/sync/push', {
          dispositivo_uuid: deviceUuid,
          operacoes: batch.map((op) => ({
            operacao_uuid: op.operacao_uuid,
            sequencia_cliente: op.sequencia,
            entidade: op.entidade,
            entidade_uuid: op.entidade_uuid,
            tipo: op.tipo,
            payload: op.payload,
          })),
        })
      ).data;
    } catch (error) {
      if (isApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429 && error.status !== 408 && error.status !== 401) {
        // O lote inteiro foi recusado (contrato, permissão): fica visível para revisão em vez de repetir para sempre.
        for (const op of batch) {
          await queue.markFailed(op.operacao_uuid, 'rejeitada', error.code, error.message);
        }
        return { stop: { status: 'blocked', applied: 0, code: error.code } };
      }
      await queue.requeueInterrupted();
      return { stop: { status: 'offline', applied: 0 } };
    }

    const byUuid = new Map(response.resultados.map((result) => [result.operacao_uuid, result]));
    let applied = 0;
    let answered = 0;
    for (const op of batch) {
      const result = byUuid.get(op.operacao_uuid);
      if (!result) {
        // O servidor não respondeu esta operação: volta para a fila e segue na próxima rodada.
        await queue.retryUnanswered(op.operacao_uuid);
      } else if (result.resultado === 'aplicada') {
        await queue.markApplied(op.operacao_uuid);
        applied += 1;
        answered += 1;
      } else {
        answered += 1;
        await queue.markFailed(op.operacao_uuid, result.resultado, result.erro?.code ?? 'UNKNOWN', result.erro?.message ?? '', result.estado_servidor ?? null);
      }
    }
    return { applied, answered };
  }

  async function run(): Promise<FlushOutcome> {
    await queue.requeueInterrupted();
    let applied = 0;
    for (;;) {
      const batch = await queue.pending(BATCH_SIZE);
      if (batch.length === 0) {
        break;
      }
      const result = await sendBatch(batch);
      if ('stop' in result) {
        return { ...result.stop, applied };
      }
      applied += result.applied;
      if (result.answered === 0) {
        // O servidor não respondeu nenhuma operação do lote: para aqui em vez de repetir sem avançar.
        return { status: 'offline', applied };
      }
    }

    // Uma sessão só vira "confirmada" quando nada dela está esperando, em revisão ou com erro.
    const confirmed: string[] = [];
    for (const sessionUuid of await sessions.unsyncedIds()) {
      if ((await queue.openForSession(sessionUuid)) === 0 && (await queue.hasApplied(sessionUuid))) {
        await sessions.markSynced(sessionUuid);
        confirmed.push(sessionUuid);
      }
    }
    await queue.purgeApplied();
    if (confirmed.length > 0) {
      try {
        onConfirmed?.(confirmed);
      } catch {
        // a reconciliação é um complemento: nunca atrapalha o envio
      }
    }
    return { status: 'done', applied, needsReview: (await queue.needsReview()).length };
  }

  return {
    flush(): Promise<FlushOutcome> {
      if (!running) {
        notify(); // o envio vai começar: quem mostra o estado relê a fila
        running = run()
          .then((outcome) => {
            // Só um envio que de fato falou com o servidor diz se há rede; fila vazia não diz nada.
            if (outcome.status === 'offline') {
              reachable = false;
            } else if (outcome.applied > 0 || outcome.status === 'blocked' || (outcome.status === 'done' && outcome.needsReview > 0)) {
              reachable = true;
            }
            return outcome;
          })
          .finally(() => {
            running = null;
            notify();
          });
      }
      return running;
    },

    /** `true` = o último envio falou com o servidor; `false` = falhou por conexão; `null` = ainda não se sabe. */
    isReachable: (): boolean | null => reachable,

    /** Avisa quando um envio começa ou termina. Devolve a função que cancela o aviso. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
