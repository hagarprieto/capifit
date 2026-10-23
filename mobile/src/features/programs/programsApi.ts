import type { ApiClient, Schemas } from '@/api/client';
import { isApiError } from '@/api/errors';

export type Program = Schemas['Programa'];
export type ProgramVersion = Schemas['Versao'];
export type ActiveProgram = { programa: Program; versao: ProgramVersion; ativado_em: string };
export type StructureBody = Schemas['EstruturaRequest']['fichas'];

const PAGE_LIMIT = 100;
const MAX_PAGES = 5;

/** Chamadas de programas do app (listar, ativo, detalhe, criar, editar). Escrita leva chave de idempotência quando cabe. */
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

    async version(programUuid: string, number: number): Promise<ProgramVersion> {
      return (await api.get<ProgramVersion>(`/programas/${programUuid}/versoes/${number}`)).data;
    },

    async create(title: string, objective?: string, idempotencyKey?: string): Promise<Program> {
      const body = objective && objective.trim() !== '' ? { titulo: title.trim(), objetivo: objective.trim() } : { titulo: title.trim() };
      return (await api.post<Program>('/me/programas', body, { idempotencyKey: idempotencyKey ?? true })).data;
    },

    /** Renomeia e/ou muda o objetivo (campo vazio limpa o objetivo). */
    async rename(programUuid: string, fields: { titulo?: string; objetivo?: string }): Promise<Program> {
      return (await api.patch<Program>(`/programas/${programUuid}`, fields)).data;
    },

    /** Abre uma versão em rascunho copiando a vigente (409 se já existir um rascunho). */
    async createVersion(programUuid: string): Promise<ProgramVersion> {
      return (await api.post<ProgramVersion>(`/programas/${programUuid}/versoes`, undefined, { idempotencyKey: true })).data;
    },

    /** Substitui toda a estrutura da versão em rascunho; `expectedRevision` evita sobrescrever edição de outro lugar. */
    async saveStructure(programUuid: string, versionNumber: number, expectedRevision: number, fichas: StructureBody): Promise<ProgramVersion> {
      return (await api.put<ProgramVersion>(`/programas/${programUuid}/versoes/${versionNumber}/estrutura`, { expected_revision: expectedRevision, fichas })).data;
    },

    /** Torna uma versão PUBLICADA o programa em uso (troca o que estava ativo). Não altera treinos já feitos. */
    async activate(programUuid: string, versionNumber: number): Promise<Schemas['ProgramaAtivo']> {
      return (await api.post<Schemas['ProgramaAtivo']>(`/programas/${programUuid}/ativar`, { versao_numero: versionNumber })).data;
    },

    /** Arquiva (sem apagar histórico); se estava em uso, deixa de ser o ativo. Não há desarquivar. */
    /**
     * Cria um programa NOVO do usuário (origem "usuario", `derivado_de` apontando para o original) com as fichas da
     * versão vigente. O original nunca é alterado — é o caminho para personalizar um programa do coach (RG-005).
     */
    async copy(programUuid: string): Promise<Program> {
      return (await api.post<Program>(`/programas/${programUuid}/copiar`, undefined, { idempotencyKey: true })).data;
    },

    async archive(programUuid: string): Promise<Program> {
      return (await api.post<Program>(`/programas/${programUuid}/arquivar`)).data;
    },

    async publish(programUuid: string, versionNumber: number): Promise<ProgramVersion> {
      return (await api.post<ProgramVersion>(`/programas/${programUuid}/versoes/${versionNumber}/publicar`, undefined, { idempotencyKey: true })).data;
    },
  };
}

export type ProgramsApi = ReturnType<typeof createProgramsApi>;
