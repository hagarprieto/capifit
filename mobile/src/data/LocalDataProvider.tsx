import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/AuthProvider';

import { createTodayCache, type TodayCache } from './cache/todayWorkout';
import { createCacheRepo } from './local/cacheRepo';
import { openLocalDb } from './local/open';

type LocalData = {
  /** `true` quando a abertura do banco terminou (com ou sem sucesso); antes disso as telas esperam. */
  ready: boolean;
  /** Cache do treino do dia do usuário atual; `null` se não houver sessão ou se o banco local não abriu. */
  today: TodayCache | null;
};

const LocalDataContext = createContext<LocalData>({ ready: true, today: null });

export function useLocalData(): LocalData {
  return useContext(LocalDataContext);
}

/**
 * Abre o banco local quando há usuário conectado e entrega os repositórios dele. Se o banco não abrir (disco cheio,
 * versão mais nova que o app), o app segue funcionando só online: o banco local é um reforço, nunca um requisito.
 */
export function LocalDataProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const userId = status === 'signedIn' ? (user?.id ?? null) : null;
  const [opened, setOpened] = useState<{ userId: string; today: TodayCache | null } | null>(null);

  useEffect(() => {
    if (userId === null) {
      return;
    }
    let cancelled = false;
    openLocalDb()
      .then((db) => !cancelled && setOpened({ userId, today: createTodayCache(createCacheRepo(db, userId)) }))
      .catch(() => !cancelled && setOpened({ userId, today: null }));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<LocalData>(() => {
    if (userId === null) {
      return { ready: true, today: null };
    }
    return opened?.userId === userId ? { ready: true, today: opened.today } : { ready: false, today: null };
  }, [userId, opened]);

  return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>;
}
