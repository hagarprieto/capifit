import * as SecureStore from 'expo-secure-store';

import { newUuid } from '@/lib/uuid';

/** Sessão guardada no armazenamento seguro do aparelho (Keychain no iOS, Keystore no Android). */
export type StoredSession = {
  accessToken: string;
  /** Instante (ms desde 1970) em que o token de acesso expira. */
  accessExpiresAt: number;
  refreshToken: string;
  user: { id: string; nome: string };
};

const SESSION_KEY = 'capifit.session';
const DEVICE_KEY = 'capifit.device';
// Acessível depois do primeiro desbloqueio: o treino e a renovação em segundo plano não podem depender do aparelho estar desbloqueado.
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

function isSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  const user = v.user as Record<string, unknown> | undefined;
  return (
    typeof v.accessToken === 'string' &&
    typeof v.accessExpiresAt === 'number' &&
    typeof v.refreshToken === 'string' &&
    typeof user?.id === 'string' &&
    typeof user?.nome === 'string'
  );
}

/** Lê a sessão salva; qualquer dado corrompido ou ilegível vale como "sem sessão". */
export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY, OPTIONS);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), OPTIONS);
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY, OPTIONS);
  } catch {
    // já não existe ou o armazenamento falhou: o chamador segue como "sem sessão"
  }
}

/**
 * Identificador deste aparelho (UUID v4), criado na primeira vez e mantido entre logins: a API o usa para
 * sessões por dispositivo e para a fila de sincronização. Não é apagado no logout.
 */
export async function getDeviceId(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(DEVICE_KEY, OPTIONS);
    if (stored !== null && /^[0-9a-f-]{36}$/i.test(stored)) {
      return stored;
    }
  } catch {
    // cai na geração abaixo
  }
  const created = newUuid();
  try {
    await SecureStore.setItemAsync(DEVICE_KEY, created, OPTIONS);
  } catch {
    // sem persistência: vale nesta execução; a próxima gera outro (a API trata como novo dispositivo)
  }
  return created;
}
