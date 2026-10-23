import type { EditorState } from '@/features/programs/editor/model';

import type { CacheRepo } from '../local/cacheRepo';

/**
 * Rascunho local do editor de programa (D-03: editar a estrutura exige conexão; sem ela, o editor guarda o rascunho no
 * aparelho, não sincronizado). Guarda o que a pessoa montou e ainda não salvou no servidor, junto com a versão e a
 * revisão do servidor sobre as quais ela estava trabalhando, para saber depois se o programa mudou nesse meio-tempo.
 */
export type EditorDraft = {
  programId: string;
  versionNumber: number;
  /** Revisão do servidor sobre a qual o rascunho foi feito. */
  baseRevision: number;
  editor: EditorState;
  meta: { titulo: string; objetivo: string };
  savedAt: string;
};

const key = (programId: string) => `editor-rascunho:${programId}`;

export function createDraftStore(cache: CacheRepo) {
  return {
    async get(programId: string): Promise<EditorDraft | null> {
      const stored = await cache.get<EditorDraft>(key(programId));
      const draft = stored?.value;
      // Valor de outra versão do app ou corrompido é tratado como ausente.
      return draft && draft.programId === programId && Array.isArray(draft.editor?.fichas) && typeof draft.baseRevision === 'number' ? draft : null;
    },

    async save(draft: EditorDraft): Promise<void> {
      await cache.set(key(draft.programId), draft);
    },

    async remove(programId: string): Promise<void> {
      await cache.remove(key(programId));
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
