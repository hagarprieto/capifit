import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react';

import { isApiError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import type { EditorDraft } from '@/data/cache/editorDrafts';
import { useLocalData } from '@/data/LocalDataProvider';
import type { MessageKey } from '@/i18n';

import { createProgramsApi, type Program, type ProgramsApi } from '../programsApi';
import { fromVersion, isDirty, publishIssues, saveIssues, toPayload, type EditorState } from './model';
import { editorReducer, type EditorAction } from './reducer';

export type EditorStatus = 'loading' | 'error' | 'blocked' | 'ready';

/**
 * Rascunho do aparelho que apareceu ao abrir o editor:
 * - `restored`: era do mesmo ponto do servidor e já foi aplicado (a pessoa pode descartar);
 * - `stale`: o programa mudou no servidor depois do rascunho: NADA foi aplicado e a pessoa escolhe, porque salvar por
 *   cima apagaria a mudança feita em outro lugar.
 */
export type DraftRestore = { kind: 'restored'; savedAt: string } | { kind: 'stale'; draft: EditorDraft } | null;

const AUTOSAVE_MS = 500;

type EditorContextValue = {
  status: EditorStatus;
  program: Program | null;
  versionNumber: number;
  /** Alterações ainda não salvas no servidor (estrutura, nome ou objetivo). */
  dirty: boolean;
  editor: EditorState;
  dispatch: Dispatch<EditorAction>;
  meta: { titulo: string; objetivo: string };
  setMeta: (meta: { titulo: string; objetivo: string }) => void;
  saving: boolean;
  notice: MessageKey | null;
  clearNotice: () => void;
  save: () => Promise<boolean>;
  publish: () => Promise<boolean>;
  reload: () => void;
  /** Há onde guardar rascunho neste aparelho (banco local aberto). */
  canKeepDraft: boolean;
  restore: DraftRestore;
  /** Esconde o aviso de rascunho restaurado (o rascunho continua guardado até salvar ou descartar). */
  dismissRestore: () => void;
  /** Descarta as alterações não salvas e volta à versão do servidor. */
  discardChanges: () => Promise<void>;
  /** Rascunho antigo: aplica por cima do que está no servidor (escolha explícita). */
  applyStaleDraft: () => void;
  /** Rascunho antigo: descarta e fica com a versão do servidor. */
  dropStaleDraft: () => Promise<void>;
};

const EditorContext = createContext<EditorContextValue | null>(null);

const EMPTY: EditorState = { fichas: [] };

/**
 * Estado do editor de programa, compartilhado pelas telas de programa, ficha e exercício (TEL-021/022/023). Edita a
 * versão em RASCUNHO em memória; "Salvar" envia a estrutura inteira com a revisão que o app conhece (conflito → o
 * usuário é avisado e nada é sobrescrito). Programa publicado abre uma nova versão em rascunho; do coach ou arquivado
 * não se edita.
 */
export function ProgramEditorProvider({ programId, api, children }: { programId: string; api?: ProgramsApi; children: ReactNode }) {
  const auth = useAuth();
  const { drafts } = useLocalData();
  const programsApi = useMemo(() => api ?? createProgramsApi(auth.api), [api, auth.api]);

  const [status, setStatus] = useState<EditorStatus>('loading');
  const [program, setProgram] = useState<Program | null>(null);
  const [versionNumber, setVersionNumber] = useState(0);
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState<EditorState>(EMPTY);
  const [savedMeta, setSavedMeta] = useState({ titulo: '', objetivo: '' });
  const [meta, setMeta] = useState({ titulo: '', objetivo: '' });
  const [editor, dispatch] = useReducer(editorReducer, EMPTY);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [restore, setRestore] = useState<DraftRestore>(null);
  const flush = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await programsApi.get(programId);
        if (loaded.origem === 'coach' || loaded.status === 'arquivado') {
          if (!cancelled) {
            setProgram(loaded);
            setStatus('blocked');
          }
          return;
        }
        const version = loaded.versao_rascunho != null ? await programsApi.version(loaded.id, loaded.versao_rascunho) : await programsApi.createVersion(loaded.id);
        if (cancelled) {
          return;
        }
        const state = fromVersion(version);
        const text = { titulo: loaded.titulo, objetivo: loaded.objetivo ?? '' };
        setProgram(loaded);
        setVersionNumber(version.numero);
        setRevision(version.revision);
        setSaved(state);
        dispatch({ type: 'replace', state });
        setSavedMeta(text);
        setMeta(text);
        setRestore(null);
        const draft = drafts ? await drafts.get(programId).catch(() => null) : null;
        if (cancelled) {
          return;
        }
        if (draft) {
          const sameAsServer = !isDirty(draft.editor, state) && draft.meta.titulo.trim() === text.titulo && draft.meta.objetivo.trim() === text.objetivo;
          if (sameAsServer) {
            void drafts?.remove(programId).catch(() => undefined);
          } else if (draft.versionNumber === version.numero && draft.baseRevision === version.revision) {
            dispatch({ type: 'replace', state: draft.editor });
            setMeta(draft.meta);
            setRestore({ kind: 'restored', savedAt: draft.savedAt });
          } else {
            setRestore({ kind: 'stale', draft });
          }
        }
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programsApi, programId, attempt, drafts]);

  const dirty = status === 'ready' && (isDirty(editor, saved) || meta.titulo.trim() !== savedMeta.titulo || meta.objetivo.trim() !== savedMeta.objetivo);

  // Guarda o rascunho no aparelho a cada alteração (com uma pequena espera) e o apaga quando não há mais nada a guardar.
  // Enquanto houver um rascunho antigo esperando decisão, não mexe nele.
  useEffect(() => {
    if (!drafts || status !== 'ready' || program === null || restore?.kind === 'stale') {
      return;
    }
    const programUuid = program.id;
    const run = () => {
      if (dirty) {
        drafts.save({ programId: programUuid, versionNumber, baseRevision: revision, editor, meta, savedAt: new Date().toISOString() }).catch(() => undefined);
      } else {
        drafts.remove(programUuid).catch(() => undefined);
      }
    };
    flush.current = run;
    const timer = setTimeout(() => {
      flush.current = null;
      run();
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [drafts, status, program, dirty, editor, meta, versionNumber, revision, restore]);

  // Saiu da tela antes da espera acabar (voltar do sistema): guarda agora, para não perder o último toque.
  useEffect(
    () => () => {
      flush.current?.();
    },
    [],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (program === null) {
      return false;
    }
    const title = meta.titulo.trim();
    if (title.length < 1 || title.length > 180) {
      setNotice('programas.erroTitulo');
      return false;
    }
    if (meta.objetivo.trim().length > 100) {
      setNotice('programas.erroObjetivo');
      return false;
    }
    const issues = saveIssues(editor);
    if (issues.length > 0) {
      setNotice(issues[0]);
      return false;
    }
    setSaving(true);
    setNotice(null);
    try {
      if (title !== savedMeta.titulo || meta.objetivo.trim() !== savedMeta.objetivo) {
        const updated = await programsApi.rename(program.id, { titulo: title, objetivo: meta.objetivo.trim() });
        setProgram(updated);
        setSavedMeta({ titulo: updated.titulo, objetivo: updated.objetivo ?? '' });
        setMeta({ titulo: updated.titulo, objetivo: updated.objetivo ?? '' });
      }
      if (isDirty(editor, saved)) {
        const version = await programsApi.saveStructure(program.id, versionNumber, revision, toPayload(editor));
        setRevision(version.revision);
        setSaved(editor);
      }
      setRestore(null);
      return true;
    } catch (error) {
      if (isApiError(error) && error.code === 'REVISION_CONFLICT') {
        setNotice('editor.erro.conflito');
      } else if (isApiError(error) && error.code === 'VERSION_IMMUTABLE') {
        setNotice('editor.erro.imutavel');
      } else if (isApiError(error) && error.isNetwork) {
        setNotice('auth.erro.rede');
      } else {
        setNotice('editor.erro.salvar');
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [program, meta, editor, saved, savedMeta, programsApi, versionNumber, revision]);

  const publish = useCallback(async (): Promise<boolean> => {
    if (program === null) {
      return false;
    }
    const issues = publishIssues(editor);
    if (issues.length > 0) {
      setNotice(issues[0]);
      return false;
    }
    if (dirty && !(await save())) {
      return false;
    }
    setSaving(true);
    setNotice(null);
    try {
      await programsApi.publish(program.id, versionNumber);
      return true;
    } catch (error) {
      setNotice(isApiError(error) && error.isNetwork ? 'auth.erro.rede' : 'editor.erro.publicar');
      return false;
    } finally {
      setSaving(false);
    }
  }, [program, editor, dirty, save, programsApi, versionNumber]);

  const reload = useCallback(() => {
    setStatus('loading');
    setNotice(null);
    setAttempt((n) => n + 1);
  }, []);

  const dismissRestore = useCallback(() => setRestore(null), []);

  const discardChanges = useCallback(async () => {
    flush.current = null;
    if (drafts && program) {
      await drafts.remove(program.id).catch(() => undefined);
    }
    setRestore(null);
    reload();
  }, [drafts, program, reload]);

  const applyStaleDraft = useCallback(() => {
    if (restore?.kind !== 'stale') {
      return;
    }
    dispatch({ type: 'replace', state: restore.draft.editor });
    setMeta(restore.draft.meta);
    setRestore({ kind: 'restored', savedAt: restore.draft.savedAt });
  }, [restore]);

  const dropStaleDraft = useCallback(async () => {
    if (drafts && program) {
      await drafts.remove(program.id).catch(() => undefined);
    }
    setRestore(null);
  }, [drafts, program]);

  const value = useMemo<EditorContextValue>(
    () => ({
      status, program, versionNumber, dirty, editor, dispatch, meta, setMeta, saving, notice, clearNotice: () => setNotice(null), save, publish, reload,
      canKeepDraft: drafts !== null, restore, dismissRestore, discardChanges, applyStaleDraft, dropStaleDraft,
    }),
    [status, program, versionNumber, dirty, editor, meta, saving, notice, save, publish, reload, drafts, restore, dismissRestore, discardChanges, applyStaleDraft, dropStaleDraft],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useProgramEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useProgramEditor precisa estar dentro de <ProgramEditorProvider>.');
  }
  return context;
}
