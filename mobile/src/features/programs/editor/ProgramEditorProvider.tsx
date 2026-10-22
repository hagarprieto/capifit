import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type Dispatch, type ReactNode } from 'react';

import { isApiError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import type { MessageKey } from '@/i18n';

import { createProgramsApi, type Program, type ProgramsApi } from '../programsApi';
import { fromVersion, isDirty, publishIssues, saveIssues, toPayload, type EditorState } from './model';
import { editorReducer, type EditorAction } from './reducer';

export type EditorStatus = 'loading' | 'error' | 'blocked' | 'ready';

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
  }, [programsApi, programId, attempt]);

  const dirty = status === 'ready' && (isDirty(editor, saved) || meta.titulo.trim() !== savedMeta.titulo || meta.objetivo.trim() !== savedMeta.objetivo);

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

  const value = useMemo<EditorContextValue>(
    () => ({ status, program, versionNumber, dirty, editor, dispatch, meta, setMeta, saving, notice, clearNotice: () => setNotice(null), save, publish, reload }),
    [status, program, versionNumber, dirty, editor, meta, saving, notice, save, publish, reload],
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
