import { useCallback, useEffect, useMemo, useState } from 'react';

import { isApiError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { t } from '@/i18n';

import { EMPTY_DRAFT, validateDraft, type Draft, type Modality } from './input';
import { initialDraft, type LastRecord } from './prefill';
import { createWorkoutApi, type Session, type SessionItem, type SessionSeries, type WorkoutApi } from './workoutApi';

export type RowView = {
  series: SessionSeries;
  draft: Draft;
  prefilled: boolean;
  done: boolean;
  saving: boolean;
  errors: Partial<Record<keyof Draft, string>>;
};

export type ItemView = {
  item: SessionItem;
  modality: Modality;
  rows: RowView[];
  last: LastRecord | undefined;
};

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; session: Session };

/** Estado do executor: sessão do servidor + o que o usuário digitou e ainda não confirmou (D-14). */
export function useWorkout(sessionUuid: string, injected?: WorkoutApi) {
  const { api } = useAuth();
  const workoutApi = useMemo(() => injected ?? createWorkoutApi(api), [api, injected]);

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [last, setLast] = useState<Record<string, LastRecord>>({});
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [correcting, setCorrecting] = useState<Record<string, true>>({});
  const [saving, setSaving] = useState<Record<string, true>>({});
  const [errors, setErrors] = useState<Record<string, Partial<Record<keyof Draft, string>>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await workoutApi.getSession(sessionUuid);
        const records = await workoutApi.lastRecords(session.exercicios.map((e) => e.exercicio.id));
        if (!cancelled) {
          setLast(records);
          setLoad({ kind: 'ready', session });
        }
      } catch {
        if (!cancelled) {
          setLoad({ kind: 'error' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutApi, sessionUuid, attempt]);

  const session = load.kind === 'ready' ? load.session : null;

  const items = useMemo<ItemView[]>(() => {
    return (session?.exercicios ?? []).map((item) => {
      const modality = (item.exercicio.modalidade ?? 'reps_carga') as Modality;
      const record = last[item.exercicio.id];
      const rows = item.series.map((series) => {
        const isDone = series.status === 'realizada' && !correcting[series.id];
        const base = initialDraft(series, item.series, record);
        const edited = edits[series.id];
        return {
          series,
          draft: edited ?? base.draft,
          prefilled: !edited && base.prefilled,
          done: isDone,
          saving: Boolean(saving[series.id]),
          errors: errors[series.id] ?? {},
        };
      });
      return { item, modality, rows, last: record };
    });
  }, [session, last, edits, correcting, saving, errors]);

  const safeIndex = Math.min(index, Math.max(0, items.length - 1));

  const replaceSeries = useCallback((updated: SessionSeries) => {
    setLoad((current) =>
      current.kind !== 'ready'
        ? current
        : {
            kind: 'ready',
            session: { ...current.session, exercicios: current.session.exercicios.map((item) => ({ ...item, series: item.series.map((s) => (s.id === updated.id ? updated : s)) })) },
          },
    );
  }, []);

  const change = useCallback((seriesId: string, field: keyof Draft, value: string) => {
    setEdits((current) => {
      const item = items.flatMap((i) => i.rows).find((r) => r.series.id === seriesId);
      return { ...current, [seriesId]: { ...(current[seriesId] ?? item?.draft ?? EMPTY_DRAFT), [field]: value } };
    });
    setErrors((current) => ({ ...current, [seriesId]: {} }));
  }, [items]);

  /** `new` = primeira conclusão da série; `corrected` = correção de série já concluída; `failed` = nada foi registrado. */
  const complete = useCallback(async (seriesId: string): Promise<'new' | 'corrected' | 'failed'> => {
    const view = items.find((i) => i.rows.some((r) => r.series.id === seriesId));
    const row = view?.rows.find((r) => r.series.id === seriesId);
    if (!view || !row || saving[seriesId]) {
      return 'failed';
    }
    const result = validateDraft(view.modality, row.draft);
    if (!result.ok) {
      setErrors((current) => ({ ...current, [seriesId]: result.errors }));
      return 'failed';
    }
    setNotice(null);
    setSaving((current) => ({ ...current, [seriesId]: true }));
    try {
      const wasCorrection = Boolean(correcting[seriesId]);
      replaceSeries(await workoutApi.completeSeries(sessionUuid, seriesId, result.values));
      setEdits(({ [seriesId]: _dropped, ...rest }) => rest);
      setCorrecting(({ [seriesId]: _dropped, ...rest }) => rest);
      return wasCorrection ? 'corrected' : 'new';
    } catch (error) {
      setNotice(isApiError(error) && error.code === 'SESSION_CLOSED' ? t('treino.erro.encerrado') : t('treino.erro.salvar'));
      return 'failed';
    } finally {
      setSaving(({ [seriesId]: _dropped, ...rest }) => rest);
    }
  }, [items, saving, correcting, workoutApi, sessionUuid, replaceSeries]);

  const correct = useCallback((seriesId: string) => {
    setCorrecting((current) => ({ ...current, [seriesId]: true }));
  }, []);

  const addSeries = useCallback(async (itemId: string) => {
    setNotice(null);
    try {
      const created = await workoutApi.addSeries(sessionUuid, itemId);
      setLoad((current) =>
        current.kind !== 'ready'
          ? current
          : { kind: 'ready', session: { ...current.session, exercicios: current.session.exercicios.map((item) => (item.id === itemId ? { ...item, series: [...item.series, created] } : item)) } },
      );
    } catch (error) {
      setNotice(isApiError(error) && error.code === 'SESSION_CLOSED' ? t('treino.erro.encerrado') : t('treino.erro.salvar'));
    }
  }, [workoutApi, sessionUuid]);

  const finish = useCallback(async (): Promise<boolean> => {
    setFinishing(true);
    setNotice(null);
    try {
      await workoutApi.finish(sessionUuid);
      return true;
    } catch (error) {
      setNotice(isApiError(error) && error.code === 'SESSION_CLOSED' ? t('treino.erro.encerrado') : t('treino.erro.salvar'));
      return false;
    } finally {
      setFinishing(false);
    }
  }, [workoutApi, sessionUuid]);

  const totals = useMemo(() => {
    const all = items.flatMap((i) => i.item.series);
    return { total: all.length, done: all.filter((s) => s.status === 'realizada').length };
  }, [items]);

  return {
    status: load.kind,
    session,
    items,
    index: safeIndex,
    setIndex,
    totals,
    notice,
    finishing,
    reload: () => {
      setLoad({ kind: 'loading' });
      setAttempt((n) => n + 1);
    },
    change,
    complete,
    correct,
    addSeries,
    finish,
  };
}
