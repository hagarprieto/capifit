import type { ApiClient, Schemas } from '@/api/client';

export type ExerciseSummary = Schemas['ExercicioResumo'];

/** Busca no catálogo publicado (por nome ou sinônimo). Vazio lista os primeiros em ordem alfabética. */
export function createExercisesApi(api: ApiClient) {
  return {
    async search(query: string): Promise<ExerciseSummary[]> {
      const q = query.trim();
      return (await api.get<ExerciseSummary[]>('/exercicios', { query: { q: q === '' ? undefined : q, limit: 30 } })).data;
    },
  };
}
