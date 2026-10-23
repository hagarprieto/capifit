import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import type { SyncState } from '@/design-system/StatusAndStats';
import { getDeviceId } from '@/auth/tokenStore';
import { createWorkoutApi, type WorkoutApi } from '@/features/workout/workoutApi';

import { createTodayCache, type TodayCache } from './cache/todayWorkout';
import { createCacheRepo } from './local/cacheRepo';
import { openLocalDb } from './local/open';
import { createQueueRepo, type QueueRepo } from './local/queueRepo';
import { createSessionsRepo } from './local/sessionsRepo';
import { createLocalFirstWorkoutApi } from './offline/localFirstWorkoutApi';
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
};

const IDLE: LocalData = { ready: true, today: null, workout: null, engine: null, queue: null };
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
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!engine || !queue) {
      return;
    }
    let cancelled = false;
    const refresh = () => {
      setReachable(engine.isReachable());
      queue.counts().then((next) => !cancelled && setCounts(next)).catch(() => undefined);
    };
    refresh();
    const unsubscribe = engine.subscribe(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [engine, queue]);

  // Um envio que falou com o servidor vale mais que a informação de quando o app abriu.
  const offline = reachable === null ? authOffline : !reachable;
  const derived = deriveSyncState(engine && queue ? counts : NO_COUNTS, offline);
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
        const today = createTodayCache(createCacheRepo(db, userId));
        const engine = createSyncEngine({ api, queue, sessions, deviceUuid });
        const workout = createLocalFirstWorkoutApi({ remote: createWorkoutApi(api), sessions, queue, engine, today });
        if (!cancelled) {
          setOpened({ userId, data: { today, workout, engine, queue } });
        }
      } catch {
        if (!cancelled) {
          setOpened({ userId, data: { today: null, workout: null, engine: null, queue: null } });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, api]);

  const engine = opened?.userId === userId ? opened?.data.engine : null;
  useEffect(() => {
    if (!engine) {
      return;
    }
    const flush = () => void engine.flush().catch(() => undefined);
    flush();
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && flush());
    return () => subscription.remove();
  }, [engine]);

  const value = useMemo<LocalData>(() => {
    if (userId === null) {
      return IDLE;
    }
    return opened?.userId === userId ? { ready: true, ...opened.data } : { ready: false, today: null, workout: null, engine: null, queue: null };
  }, [userId, opened]);

  return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>;
}
