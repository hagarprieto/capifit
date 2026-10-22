import type { ApiClient, Schemas } from '@/api/client';
import { isApiError } from '@/api/errors';

export type Program = Schemas['Programa'];
export type ProgramVersion = Schemas['Versao'];
export type ActiveProgram = { programa: Program; versao: ProgramVersion; ativado_em: string };

const PAGE_LIMIT = 100;
const MAX_PAGES = 5;

/** Chamadas de programas do app (listar, ativo, detalhe, criar). Escrita leva chave de idempotência (reenvio seguro). */
export function createProgramsApi(api: ApiClient) {
  return {
    /** Todos os programas visíveis ao aluno (páginas de 100, até 500). */
    async list(): Promise<Program[]> {
      const all: Program[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await api.get<Program[]>('/me/programas', { query: { limit: PAGE_LIMIT, cursor } });
        all.push(...result.data);
        cursor = result.pagination?.next_cursor ?? undefined;
        if (!cursor) {
          break;
        }
      }
      return all;
    },

    /** Programa ativo com a versão completa; `null` se não houver (404). */
    async active(): Promise<ActiveProgram | null> {
      try {
        return (await api.get<ActiveProgram>('/me/programa-ativo')).data;
      } catch (error) {
        if (isApiError(error) && error.status === 404) {
          return null;
        }
        throw error;
      }
    },

    async get(programUuid: string): Promise<Program> {
      return (await api.get<Program>(`/programas/${programUuid}`)).data;
    },

    /** Versão para ler: a vigente (publicada) ou, na falta dela, a de rascunho. */
    async version(programUuid: string, number: number): Promise<ProgramVersion> {
      return (await api.get<ProgramVersion>(`/programas/${programUuid}/versoes/${number}`)).data;
    },

    async create(title: string, objective?: string, idempotencyKey?: string): Promise<Program> {
      const body = objective && objective.trim() !== '' ? { titulo: title.trim(), objetivo: objective.trim() } : { titulo: title.trim() };
      return (await api.post<Program>('/me/programas', body, { idempotencyKey: idempotencyKey ?? true })).data;
    },
  };
}

export type ProgramsApi = ReturnType<typeof createProgramsApi>;
