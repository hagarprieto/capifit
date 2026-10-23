import type { SyncState } from '@/design-system/StatusAndStats';

import type { QueueState } from '../local/queueRepo';

export type QueueCounts = Record<QueueState, number>;

export const NO_COUNTS: QueueCounts = { pendente: 0, enviando: 0, aplicada: 0, rejeitada: 0, conflito: 0 };

/**
 * O estado único que o app mostra (UX-04), em ordem de gravidade:
 * - **conflito**: há operação rejeitada ou em conflito esperando revisão do usuário;
 * - **offline**: sem conexão com o servidor (guardado no aparelho, se houver pendências);
 * - **pendente**: há registros salvos só no aparelho, com conexão, ainda sendo enviados;
 * - **sincronizado**: nada esperando.
 */
export function deriveSyncState(counts: QueueCounts, offline: boolean): { state: SyncState; waiting: number; review: number } {
  const waiting = counts.pendente + counts.enviando;
  const review = counts.rejeitada + counts.conflito;
  const state: SyncState = review > 0 ? 'conflict' : offline ? 'offline' : waiting > 0 ? 'pending' : 'synced';
  return { state, waiting, review };
}
