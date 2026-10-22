import { createApiClient, type ApiClient, type Schemas } from '@/api/client';
import { isApiError } from '@/api/errors';

import { clearSession, getDeviceId, saveSession, type StoredSession } from './tokenStore';

export function sessionFromTokenResponse(response: Schemas['TokenResponse']): StoredSession {
  return {
    accessToken: response.access_token,
    accessExpiresAt: Date.now() + response.expires_in * 1000,
    refreshToken: response.refresh_token,
    user: { id: response.usuario.id, nome: response.usuario.nome },
  };
}

export type AuthCore = {
  api: ApiClient;
  /** Define a sessão em memória sem gravar (usada ao restaurar o que já está guardado). */
  restore(session: StoredSession): void;
  /** Guarda (ou apaga, com `null`) a sessão e avisa a interface. */
  adopt(session: StoredSession | null): Promise<void>;
  /** Renova a sessão restaurada na abertura do app, sem passar pelo caminho de uma chamada com 401. */
  refreshStored(session: StoredSession): Promise<void>;
};

/**
 * Núcleo sem React da autenticação: guarda a sessão em memória, renova o token com UMA chamada por vez (o refresh
 * token é de uso único; várias chamadas com 401 ao mesmo tempo esperam a mesma renovação) e entrega o cliente de API.
 */
export function createAuthCore(options: { baseUrl: string; fetchImpl?: typeof fetch; onSession: (session: StoredSession | null) => void }): AuthCore {
  let current: StoredSession | null = null;
  let refreshing: Promise<string | null> | null = null;

  async function adopt(next: StoredSession | null): Promise<void> {
    current = next;
    if (next === null) {
      await clearSession();
    } else {
      await saveSession(next);
    }
    options.onSession(next);
  }

  async function exchange(refreshToken: string): Promise<string> {
    const result = await api.post<Schemas['TokenResponse']>(
      '/auth/refresh',
      { refresh_token: refreshToken, dispositivo_uuid: await getDeviceId() },
      { auth: false },
    );
    await adopt(sessionFromTokenResponse(result.data));
    return result.data.access_token;
  }

  function renew(): Promise<string | null> {
    refreshing ??= (async () => {
      if (current === null) {
        return null;
      }
      try {
        return await exchange(current.refreshToken);
      } catch (error) {
        if (isApiError(error) && !error.isNetwork && error.status >= 400 && error.status < 500) {
          await adopt(null); // renovação recusada: sessão encerrada no servidor
          return null;
        }
        throw error; // sem rede ou servidor fora: mantém a sessão para tentar depois
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  const api = createApiClient({
    baseUrl: options.baseUrl,
    fetchImpl: options.fetchImpl,
    getAccessToken: () => current?.accessToken ?? null,
    refreshAccessToken: renew,
  });

  return {
    api,
    restore: (session) => {
      current = session;
    },
    adopt,
    refreshStored: async (session) => {
      current = session;
      await exchange(session.refreshToken);
    },
  };
}
