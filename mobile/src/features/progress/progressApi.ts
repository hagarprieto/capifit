import type { ApiClient, Schemas } from '@/api/client';

export type ProgressSummary = Schemas['ProgressoResumo'];
export type HistoryItem = Schemas['SessaoResumo'];
export type HistoryPage = { items: HistoryItem[]; next: string | null };

const PAGE_SIZE = 20;

/** Chamadas da aba Evolução: resumo por período (fuso do usuário) e histórico de sessões concluídas, mais recentes primeiro. */
export function createProgressApi(api: ApiClient) {
  return {
    async summary(de: string, ate: string): Promise<ProgressSummary> {
      return (await api.get<ProgressSummary>('/me/progresso/resumo', { query: { de, ate } })).data;
    },

    async history(cursor?: string): Promise<HistoryPage> {
      const result = await api.get<HistoryItem[]>('/me/sessoes', { query: { status: 'concluida', limit: PAGE_SIZE, cursor } });
      return { items: result.data, next: result.pagination?.next_cursor ?? null };
    },
  };
}

export type ProgressApi = ReturnType<typeof createProgressApi>;
