import type { ApiClient, Schemas } from '@/api/client';

export type ExerciseSummary = Schemas['ExercicioResumo'];
export type ExerciseDetail = Schemas['Exercicio'];
export type Taxonomy = Schemas['ItemTaxonomia'];
export type ExerciseMedia = Schemas['Midia'];
export type ExercisePage = { items: ExerciseSummary[]; next: string | null };
export type ExerciseFilters = { query?: string; groupId?: string | null; equipmentId?: string | null; cursor?: string | null };

const PAGE_SIZE = 20;

/** Catálogo de exercícios publicados: busca, filtros, detalhe com mídia aprovada, alternativas e taxonomias. */
export function createExercisesApi(api: ApiClient) {
  return {
    /** Busca no catálogo publicado (por nome ou sinônimo). Vazio lista os primeiros em ordem alfabética. */
    async search(query: string): Promise<ExerciseSummary[]> {
      const q = query.trim();
      return (await api.get<ExerciseSummary[]>('/exercicios', { query: { q: q === '' ? undefined : q, limit: 30 } })).data;
    },

    /** Biblioteca paginada, com filtro por grupo muscular e equipamento. */
    async list(filters: ExerciseFilters = {}): Promise<ExercisePage> {
      const q = (filters.query ?? '').trim();
      const result = await api.get<ExerciseSummary[]>('/exercicios', {
        query: {
          q: q === '' ? undefined : q,
          grupo_id: filters.groupId ?? undefined,
          equipamento_id: filters.equipmentId ?? undefined,
          limit: PAGE_SIZE,
          cursor: filters.cursor ?? undefined,
        },
      });
      return { items: result.data, next: result.pagination?.next_cursor ?? null };
    },

    async get(exerciseUuid: string): Promise<ExerciseDetail> {
      return (await api.get<ExerciseDetail>(`/exercicios/${exerciseUuid}`)).data;
    },

    /** Alternativas publicadas. Falhar aqui não impede ver o exercício: quem chama trata como "sem alternativas". */
    async alternatives(exerciseUuid: string): Promise<ExerciseSummary[]> {
      return (await api.get<ExerciseSummary[]>(`/exercicios/${exerciseUuid}/alternativas`)).data;
    },

    async muscleGroups(): Promise<Taxonomy[]> {
      return (await api.get<Taxonomy[]>('/grupos-musculares')).data;
    },

    async equipment(): Promise<Taxonomy[]> {
      return (await api.get<Taxonomy[]>('/equipamentos')).data;
    },
  };
}

export type ExercisesApi = ReturnType<typeof createExercisesApi>;
