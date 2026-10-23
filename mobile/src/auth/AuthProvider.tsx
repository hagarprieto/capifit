import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ApiClient, Schemas } from '@/api/client';
import { isApiError } from '@/api/errors';
import { config } from '@/config';

import { createAuthCore, sessionFromTokenResponse } from './authCore';
import { getDeviceId, loadSession } from './tokenStore';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export type SignUpInput = {
  nome: string;
  email: string;
  senha: string;
};

type AuthContextValue = {
  status: AuthStatus;
  user: { id: string; nome: string } | null;
  /** `true` quando a sessão foi restaurada sem conseguir falar com o servidor (o treino segue funcionando). */
  offline: boolean;
  api: ApiClient;
  signIn: (email: string, senha: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, novaSenha: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Margem para renovar antes de o token expirar de fato (relógio do aparelho pode divergir um pouco). */
const EXPIRY_MARGIN_MS = 30_000;

type Props = { children: ReactNode; baseUrl?: string; fetchImpl?: typeof fetch };

/**
 * Estado de autenticação do app (E01-06/E01-07): guarda a sessão no armazenamento seguro, renova o token de acesso
 * com uma única chamada por vez (ver `authCore`), restaura a sessão ao abrir (inclusive sem rede) e encerra tudo quando
 * o servidor recusa a renovação. Nenhum token vai para log nem para o estado de tela.
 */
export function AuthProvider({ children, baseUrl = config.apiBaseUrl, fetchImpl }: Props) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [offline, setOffline] = useState(false);

  const [core] = useState(() =>
    createAuthCore({
      baseUrl,
      fetchImpl,
      onSession: (session) => {
        setUser(session?.user ?? null);
        setStatus(session === null ? 'signedOut' : 'signedIn');
      },
      // O estado "sem conexão" acompanha a última tentativa real de falar com o servidor, não só a abertura do app.
      onReachable: (reachable) => setOffline(!reachable),
    }),
  );
  const { api } = core;

  // Restauração ao abrir o app (TEL-001).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadSession();
      if (cancelled) {
        return;
      }
      if (stored === null) {
        setStatus('signedOut');
        return;
      }
      core.restore(stored);
      setUser(stored.user);
      try {
        if (stored.accessExpiresAt - Date.now() < EXPIRY_MARGIN_MS) {
          await core.refreshStored(stored);
        } else {
          setStatus('signedIn');
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isApiError(error) && !error.isNetwork && error.status >= 400 && error.status < 500) {
          await core.adopt(null); // o servidor recusou a renovação: a sessão acabou
          return;
        }
        // Sem rede (ou servidor fora): entra com a sessão guardada; o treino não depende da conexão.
        setOffline(true);
        setStatus('signedIn');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core]);

  const registerDevice = useCallback(async () => {
    try {
      await api.post('/me/dispositivos', { dispositivo_uuid: await getDeviceId() });
    } catch {
      // melhor esforço: o cadastro do dispositivo é refeito na próxima sincronização
    }
  }, [api]);

  const signIn = useCallback(async (email: string, senha: string) => {
    const result = await api.post<Schemas['TokenResponse']>(
      '/auth/login',
      { email: email.trim().toLowerCase(), senha, dispositivo_uuid: await getDeviceId() },
      { auth: false },
    );
    setOffline(false);
    await core.adopt(sessionFromTokenResponse(result.data));
    void registerDevice();
  }, [api, core, registerDevice]);

  const signUp = useCallback(async (input: SignUpInput) => {
    const result = await api.post<Schemas['TokenResponse']>(
      '/auth/register',
      {
        nome: input.nome.trim(),
        email: input.email.trim().toLowerCase(),
        senha: input.senha,
        aceita_termos: true,
        versao_termos: config.termsVersion,
        versao_privacidade: config.privacyVersion,
        maior_de_18: true,
        dispositivo_uuid: await getDeviceId(),
      },
      { auth: false },
    );
    setOffline(false);
    await core.adopt(sessionFromTokenResponse(result.data));
    void registerDevice();
  }, [api, core, registerDevice]);

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // sem rede: a sessão local é apagada mesmo assim (o servidor a expira sozinho)
    }
    await core.adopt(null);
  }, [api, core]);

  const requestPasswordReset = useCallback(async (email: string) => {
    await api.post('/auth/password/forgot', { email: email.trim().toLowerCase() }, { auth: false });
  }, [api]);

  const resetPassword = useCallback(async (token: string, novaSenha: string) => {
    await api.post('/auth/password/reset', { token, nova_senha: novaSenha }, { auth: false });
  }, [api]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, offline, api, signIn, signUp, signOut, requestPasswordReset, resetPassword }),
    [status, user, offline, api, signIn, signUp, signOut, requestPasswordReset, resetPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  }
  return context;
}
