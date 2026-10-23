import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import type { SyncState } from '@/design-system/StatusAndStats';
import { getDeviceId } from '@/auth/tokenStore';
import { createWorkoutApi, type WorkoutApi } from '@/features/workout/workoutApi';

import { createDraftStore, type DraftStore } from './cache/editorDrafts';
import { createTodayCache, type TodayCache } from './cache/todayWorkout';
import { createCacheRepo, purgeUserData } from './local/cacheRepo';
import { openLocalDb } from './local/open';
import { createQueueRepo, type QueueRepo } from './local/queueRepo';
import { createSessionsRepo } from './local/sessionsRepo';
import { createLocalFirstWorkoutApi } from './offline/localFirstWorkoutApi';
import { createProgramsApi } from '@/features/programs/programsApi';

import { createReconciler } from './sync/reconcile';
import { createReview, type Review } from './sync/review';
import { createSyncEngine, type SyncEngine } from './sync/syncEngine';
import { deriveSyncState, NO_COUNTS, type QueueCounts } from './sync/syncState';

type LocalData = {
  /** `true` quando a abertura do banco terminou (com ou sem sucesso); antes disso as telas esperam. */
  ready: boolean;
  /** Cache do treino do dia do usuário atual; `null` se não houver sessão ou se o banco local não abriu. */
  today: TodayCache | null;
  /** Executor de treino com o aparelho em primeiro lugar; `null` sem banco local (as telas usam a API online). */
  workout: WorkoutApi | null;
  /** Envio da fila de operações ao servidor; `null` sem banco local. */
  engine: SyncEngine | null;
  /** Fila de operações do usuário atual; `null` sem banco local. */
  queue: QueueRepo | null;
  /** Revisão do que o servidor não aceitou; `null` sem banco local. */
  review: Review | null;
  /** Apaga do aparelho TUDO do usuário atual (treinos, fila e cache); `null` sem banco local. */
  erase: (() => Promise<void>) | null;
  /** Rascunhos do editor de programa guardados no aparelho; `null` sem banco local. */
  drafts: DraftStore | null;
};

/** Intervalo entre tentativas de envio enquanto houver registros esperando. */
const RETRY_MS = 30_000;

const IDLE: LocalData = { ready: true, today: null, workout: null, engine: null, queue: null, review: null, drafts: null, erase: null };
const LocalDataContext = createContext<LocalData>(IDLE);

export function useLocalData(): LocalData {
  return useContext(LocalDataContext);
}

export type SyncStatusView = {
  state: SyncState;
  /** Registros salvos no aparelho esperando envio. */
  waiting: number;
  /** Operações que o servidor não aceitou e esperam revisão. */
  review: number;
  /** Tenta enviar a fila agora; `undefined` se não há fila (sem banco local). */
  retry: (() => void) | undefined;
};

/**
 * O estado de sincronização único do app (UX-04): lê a fila e se há conexão. Sem banco local, só distingue online de
 * offline pela informação de sessão.
 */
export function useSyncStatus(): SyncStatusView {
  const { engine, queue } = useLocalData();
  const { offline: authOffline } = useAuth();
  const [counts, setCounts] = useState<QueueCounts>(NO_COUNTS);

  useEffect(() => {
    if (!engine || !queue) {
      return;
    }
    let cancelled = false;
    const refresh = () => {
      queue.counts().then((next) => !cancelled && setCounts(next)).catch(() => undefined);
    };
    refresh();
    const unsubscribe = engine.subscribe(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [engine, queue]);

  // `authOffline` acompanha a última tentativa real de falar com o servidor (qualquer chamada do app, inclusive o envio da fila).
  const derived = deriveSyncState(engine && queue ? counts : NO_COUNTS, authOffline);
  return { ...derived, retry: engine ? () => void engine.flush().catch(() => undefined) : undefined };
}

/**
 * Abre o banco local quando há usuário conectado e entrega os repositórios dele. Se o banco não abrir (disco cheio,
 * versão mais nova que o app), o app segue funcionando só online: o banco local é um reforço, nunca um requisito.
 * Com o banco aberto, a fila é enviada ao abrir o app e sempre que ele volta para o primeiro plano.
 */
export function LocalDataProvider({ children }: { children: ReactNode }) {
  const { status, user, api } = useAuth();
  const userId = status === 'signedIn' ? (user?.id ?? null) : null;
  const [opened, setOpened] = useState<{ userId: string; data: Omit<LocalData, 'ready'> } | null>(null);

  useEffect(() => {
    if (userId === null) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const db = await openLocalDb();
        const deviceUuid = await getDeviceId();
        const sessions = createSessionsRepo(db, userId);
        const queue = createQueueRepo(db, userId);
        const cacheRepo = createCacheRepo(db, userId);
        const today = createTodayCache(cacheRepo);
        const drafts = createDraftStore(cacheRepo);
        const remote = createWorkoutApi(api);
        const reconciler = createReconciler({ remote, programsApi: createProgramsApi(api), sessions, queue, today });
        const engine = createSyncEngine({ api, queue, sessions, deviceUuid, onConfirmed: (ids) => void reconciler.run(ids) });
        const workout = createLocalFirstWorkoutApi({ remote, sessions, queue, engine, today });
        if (!cancelled) {
          setOpened({ userId, data: { today, workout, engine, queue, review: createReview({ queue, sessions, engine }), erase: () => purgeUserData(db, userId), drafts } });
        }
      } catch {
        if (!cancelled) {
          setOpened({ userId, data: { today: null, workout: null, engine: null, queue: null, review: null, drafts: null, erase: null } });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, api]);

  const engine = opened?.userId === userId ? opened?.data.engine : null;
  const queue = opened?.userId === userId ? opened?.data.queue : null;
  useEffect(() => {
    if (!engine || !queue) {
      return;
    }
    const flush = () => void engine.flush().catch(() => undefined);
    flush();
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && flush());
    // Sem sinal de rede disponível, a única forma de saber que a conexão voltou é tentar: enquanto houver registros
    // esperando, tenta de novo a cada 30 s (o envio só fala com o servidor se houver fila).
    const timer = setInterval(() => {
      queue
        .counts()
        .then((counts) => counts.pendente + counts.enviando > 0 && flush())
        .catch(() => undefined);
    }, RETRY_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [engine, queue]);

  const value = useMemo<LocalData>(() => {
    if (userId === null) {
      return IDLE;
    }
    return opened?.userId === userId ? { ready: true, ...opened.data } : { ready: false, today: null, workout: null, engine: null, queue: null, review: null, drafts: null, erase: null };
  }, [userId, opened]);

  return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>;
}
