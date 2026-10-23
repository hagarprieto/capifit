import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { AuthProvider, useAuth } from './AuthProvider';
import { clearSession, getDeviceId, loadSession, saveSession, type StoredSession } from './tokenStore';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'after-first-unlock',
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockStore.delete(key);
  },
}));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `11111111-1111-4111-8111-${String(++n).padStart(12, '0')}` };
});

const USER = { id: '5b2c1a54-1111-4222-8333-444455556666', nome: 'Ana', email: 'ana@exemplo.invalid', papeis: ['aluno'] };

function tokenResponse(access = 'acesso-1', refresh = 'refresh-1', expiresIn = 900) {
  return { data: { access_token: access, expires_in: expiresIn, refresh_token: refresh, token_type: 'Bearer', usuario: USER } };
}

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Auth = ReturnType<typeof useAuth>;
const holder: { current: Auth | null } = { current: null };
const auth = (): Auth => holder.current as Auth;
function Probe() {
  const value = useAuth();
  useEffect(() => {
    holder.current = value;
  });
  return <Text>{`${value.status}|${value.user?.nome ?? '-'}|${value.offline ? 'offline' : 'online'}`}</Text>;
}

function mount(fetchImpl: jest.Mock) {
  return render(
    <AuthProvider baseUrl="https://api.exemplo.invalid" fetchImpl={fetchImpl as unknown as typeof fetch}>
      <Probe />
    </AuthProvider>,
  );
}

const session = (over: Partial<StoredSession> = {}): StoredSession => ({ accessToken: 'acesso-salvo', accessExpiresAt: Date.now() + 600_000, refreshToken: 'segredo-de-teste-refresh-salvo', user: { id: USER.id, nome: 'Ana' }, ...over });

beforeEach(() => {
  mockStore.clear();
});

describe('tokenStore', () => {
  it('guarda e lê a sessão, e trata dado corrompido como "sem sessão"', async () => {
    await saveSession(session());
    expect((await loadSession())?.refreshToken).toBe('segredo-de-teste-refresh-salvo');

    mockStore.set('capifit.session', '{"accessToken": 1}');
    expect(await loadSession()).toBeNull();
    mockStore.set('capifit.session', 'não é json');
    expect(await loadSession()).toBeNull();

    await saveSession(session());
    await clearSession();
    expect(await loadSession()).toBeNull();
  });

  it('o identificador do aparelho é criado uma vez e sobrevive ao logout', async () => {
    const first = await getDeviceId();
    await saveSession(session());
    await clearSession();

    expect(await getDeviceId()).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('AuthProvider', () => {
  it('sem sessão guardada, abre como "signedOut"', async () => {
    await mount(jest.fn());

    await waitFor(() => expect(screen.getByText('signedOut|-|online')).toBeTruthy());
  });

  it('restaura a sessão válida sem chamar o servidor', async () => {
    await saveSession(session());
    const fetchImpl = jest.fn();
    await mount(fetchImpl);

    await waitFor(() => expect(screen.getByText('signedIn|Ana|online')).toBeTruthy());
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('com o token vencido renova na abertura e guarda os novos tokens', async () => {
    await saveSession(session({ accessExpiresAt: Date.now() - 1000 }));
    const fetchImpl = jest.fn().mockResolvedValue(reply(200, tokenResponse('acesso-2', 'refresh-2')));
    await mount(fetchImpl);

    await waitFor(() => expect(screen.getByText('signedIn|Ana|online')).toBeTruthy());
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://api.exemplo.invalid/auth/refresh');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ refresh_token: 'segredo-de-teste-refresh-salvo' });
    expect((await loadSession())?.refreshToken).toBe('refresh-2');
  });

  it('renovação recusada pelo servidor apaga a sessão e volta para "signedOut"', async () => {
    await saveSession(session({ accessExpiresAt: 0 }));
    await mount(jest.fn().mockResolvedValue(reply(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })));

    await waitFor(() => expect(screen.getByText('signedOut|-|online')).toBeTruthy());
    expect(await loadSession()).toBeNull();
  });

  it('o aviso de conexão acompanha a última chamada ao servidor: cai com uma falha de rede e volta com uma resposta', async () => {
    await saveSession(session());
    let down = false;
    const fetchImpl = jest.fn().mockImplementation(async () => {
      if (down) {
        throw new TypeError('Network request failed');
      }
      return reply(200, { data: { ok: true } });
    });
    await mount(fetchImpl);
    await waitFor(() => expect(screen.getByText('signedIn|Ana|online')).toBeTruthy());

    down = true;
    await act(async () => {
      await auth().api.get('/me/sessoes').catch(() => undefined);
    });
    await waitFor(() => expect(screen.getByText('signedIn|Ana|offline')).toBeTruthy());

    down = false;
    await act(async () => {
      await auth().api.get('/me/sessoes');
    });
    await waitFor(() => expect(screen.getByText('signedIn|Ana|online')).toBeTruthy());
  });

  it('sem rede na abertura, entra com a sessão guardada e marca o modo offline', async () => {
    await saveSession(session({ accessExpiresAt: 0 }));
    await mount(jest.fn().mockRejectedValue(new TypeError('Network request failed')));

    await waitFor(() => expect(screen.getByText('signedIn|Ana|offline')).toBeTruthy());
    expect((await loadSession())?.refreshToken).toBe('segredo-de-teste-refresh-salvo');
  });

  it('login envia e-mail normalizado e o aparelho, guarda a sessão e registra o dispositivo', async () => {
    const fetchImpl = jest.fn().mockImplementation(async (url: string) => (String(url).endsWith('/auth/login') ? reply(200, tokenResponse()) : reply(201, { data: {} })));
    await mount(fetchImpl);
    await waitFor(() => expect(screen.getByText('signedOut|-|online')).toBeTruthy());

    await act(async () => {
      await auth().signIn('  ANA@Exemplo.invalid ', 'senha-longa-123');
    });

    await waitFor(() => expect(screen.getByText('signedIn|Ana|online')).toBeTruthy());
    const login = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/auth/login'));
    expect(JSON.parse(String((login?.[1] as RequestInit).body))).toMatchObject({ email: 'ana@exemplo.invalid', senha: 'senha-longa-123' });
    expect(JSON.parse(String((login?.[1] as RequestInit).body)).dispositivo_uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect((await loadSession())?.accessToken).toBe('acesso-1');
    await waitFor(() => expect(fetchImpl.mock.calls.some(([u]) => String(u).endsWith('/me/dispositivos'))).toBe(true));
  });

  it('login recusado não cria sessão e repassa o erro da API', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }));
    await mount(fetchImpl);
    await waitFor(() => expect(screen.getByText('signedOut|-|online')).toBeTruthy());

    await expect(act(async () => auth().signIn('a@b.co', 'errada-errada'))).rejects.toMatchObject({ status: 401 });

    expect(await loadSession()).toBeNull();
    expect(screen.getByText('signedOut|-|online')).toBeTruthy();
  });

  it('cadastro envia os aceites e a versão dos documentos', async () => {
    const fetchImpl = jest.fn().mockImplementation(async (url: string) => (String(url).endsWith('/auth/register') ? reply(201, tokenResponse()) : reply(201, { data: {} })));
    await mount(fetchImpl);
    await waitFor(() => expect(screen.getByText('signedOut|-|online')).toBeTruthy());

    await act(async () => {
      await auth().signUp({ nome: ' Ana ', email: 'Ana@Exemplo.invalid', senha: 'senha-longa-123' });
    });

    const call = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/auth/register'));
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toMatchObject({
      nome: 'Ana', email: 'ana@exemplo.invalid', aceita_termos: true, maior_de_18: true, versao_termos: '1', versao_privacidade: '1',
    });
    await waitFor(() => expect(screen.getByText('signedIn|Ana|online')).toBeTruthy());
  });

  it('logout apaga a sessão local mesmo sem rede', async () => {
    await saveSession(session());
    await mount(jest.fn().mockRejectedValue(new TypeError('Network request failed')));
    await waitFor(() => expect(screen.getByText('signedIn|Ana|online')).toBeTruthy());

    await act(async () => {
      await auth().signOut();
    });

    // A sessão sai mesmo sem rede; o aviso de conexão reflete que a última chamada (o logout) falhou.
    await waitFor(() => expect(screen.getByText('signedOut|-|offline')).toBeTruthy());
    expect(await loadSession()).toBeNull();
  });

  it('um 401 numa chamada autenticada renova uma vez, mesmo com várias chamadas simultâneas', async () => {
    await saveSession(session());
    let renewals = 0;
    const fetchImpl = jest.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        renewals += 1;
        return reply(200, tokenResponse('acesso-novo', 'refresh-novo'));
      }
      const header = (init.headers as Record<string, string>).Authorization;
      return header === 'Bearer acesso-novo' ? reply(200, { data: { ok: true } }) : reply(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } });
    });
    await mount(fetchImpl);
    await waitFor(() => expect(screen.getByText('signedIn|Ana|online')).toBeTruthy());

    let results: unknown[] = [];
    await act(async () => {
      results = await Promise.all([auth().api.get('/me'), auth().api.get('/me/sessoes'), auth().api.get('/me/programas')]);
    });

    expect(results).toHaveLength(3);
    expect(renewals).toBe(1);
    expect((await loadSession())?.refreshToken).toBe('refresh-novo');
  });
});
