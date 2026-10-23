import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { getDeviceId } from '@/auth/tokenStore';
import { createWorkoutApi, type WorkoutApi } from '@/features/workout/workoutApi';

import { createTodayCache, type TodayCache } from './cache/todayWorkout';
import { createCacheRepo } from './local/cacheRepo';
import { openLocalDb } from './local/open';
import { createQueueRepo } from './local/queueRepo';
import { createSessionsRepo } from './local/sessionsRepo';
import { createLocalFirstWorkoutApi } from './offline/localFirstWorkoutApi';
import { createSyncEngine, type SyncEngine } from './sync/syncEngine';

type LocalData = {
  /** `true` quando a abertura do banco terminou (com ou sem sucesso); antes disso as telas esperam. */
  ready: boolean;
  /** Cache do treino do dia do usuário atual; `null` se não houver sessão ou se o banco local não abriu. */
  today: TodayCache | null;
  /** Executor de treino com o aparelho em primeiro lugar; `null` sem banco local (as telas usam a API online). */
  workout: WorkoutApi | null;
  /** Envio da fila de operações ao servidor; `null` sem banco local. */
  engine: SyncEngine | null;
};

const IDLE: LocalData = { ready: true, today: null, workout: null, engine: null };
const LocalDataContext = createContext<LocalData>(IDLE);

export function useLocalData(): LocalData {
  return useContext(LocalDataContext);
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
          setOpened({ userId, data: { today, workout, engine } });
        }
      } catch {
        if (!cancelled) {
          setOpened({ userId, data: { today: null, workout: null, engine: null } });
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
    return opened?.userId === userId ? { ready: true, ...opened.data } : { ready: false, today: null, workout: null, engine: null };
  }, [userId, opened]);

  return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>;
}
