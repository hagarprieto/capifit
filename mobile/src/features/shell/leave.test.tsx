import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { LocalDataProvider, useLocalData } from '@/data/LocalDataProvider';
import { createMemoryDb } from '@/data/local/memoryDb';
import { migrate } from '@/data/local/migrations';
import { createQueueRepo } from '@/data/local/queueRepo';
import { createSessionsRepo } from '@/data/local/sessionsRepo';
import { buildOfflineSession } from '@/data/sync/snapshot';
import { ThemeProvider } from '@/design-system/ThemeProvider';

import { ProfileScreen } from './ProfileScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const mockAuth = {
  status: 'signedIn' as const,
  user: { id: 'user-ana', nome: 'Ana' },
  offline: false,
  signOut: jest.fn(),
  api: { post: jest.fn() },
};
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));

let mockOpen: () => Promise<unknown>;
jest.mock('@/data/local/open', () => ({ openLocalDb: () => mockOpen() }));

let mockCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockCounter + 3000).padStart(12, '0')}` }));

const networkError = () => new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' });
const allApplied = async (_path: string, body: { operacoes: { operacao_uuid: string }[] }) => ({
  data: { server_time: 'x', resultados: body.operacoes.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: 'aplicada' })) },
});

async function mount(options: { pending?: number } = {}) {
  const db = createMemoryDb();
  await migrate(db);
  const queue = createQueueRepo(db, 'user-ana');
  const sessions = createSessionsRepo(db, 'user-ana');
  const { session, payload } = buildOfflineSession({ title: 'Treino livre' }, '2026-10-22T10:00:00.000Z');
  if (options.pending) {
    await sessions.save(session, false);
    await queue.enqueue({ entidade: 'sessao_treino', entidade_uuid: session.id, sessao_uuid: session.id, tipo: 'criar', payload: payload as Record<string, unknown> });
    for (let i = 1; i < options.pending; i += 1) {
      await queue.enqueue({ entidade: 'sessao_serie', entidade_uuid: `serie-${i}`, sessao_uuid: session.id, tipo: 'atualizar', payload: { repeticoes: i } });
    }
  }
  mockOpen = () => Promise.resolve(db);
  let engine: ReturnType<typeof useLocalData>['engine'] = null;
  function Grab() {
    engine = useLocalData().engine;
    return null;
  }
  mockAuth.api.post.mockRejectedValue(networkError()); // o envio automático da abertura não chega ao servidor
  await render(
    <ThemeProvider initialPreference="dark">
      <LocalDataProvider>
        <Grab />
        <ProfileScreen />
      </LocalDataProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(engine).not.toBeNull());
  await act(async () => {
    await (engine as unknown as { flush: () => Promise<unknown> }).flush();
  });
  mockAuth.signOut.mockClear();
  mockAuth.api.post.mockClear();
  return { db, queue, sessions, session };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.signOut.mockResolvedValue(undefined);
});

describe('sair da conta com dados pendentes', () => {
  it('sem nada pendente sai direto, sem falar com o servidor', async () => {
    const { db } = await mount();

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalledTimes(1));
    expect(mockAuth.api.post).not.toHaveBeenCalled();
    db.close();
  });

  it('com pendência e conexão: envia primeiro e só então sai', async () => {
    const { db, queue } = await mount({ pending: 3 });
    mockAuth.api.post.mockImplementation(allApplied);

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalledTimes(1));
    expect(mockAuth.api.post).toHaveBeenCalledTimes(1);
    expect((await queue.counts()).pendente).toBe(0);
    expect(screen.queryByText('Antes de sair')).toBeNull();
    db.close();
  });

  it('sem conexão: NÃO sai; avisa quantos registros ficam e oferece as escolhas', async () => {
    const { db } = await mount({ pending: 3 });

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByText('Antes de sair')).toBeTruthy();
    expect(screen.getByText('Ainda há 3 registro(s) neste dispositivo que não chegaram ao servidor.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair e manter no aparelho' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair e apagar do aparelho' })).toBeTruthy();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    db.close();
  });

  it('"Sair e manter no aparelho" sai e os registros continuam guardados', async () => {
    const { db, queue, sessions, session } = await mount({ pending: 2 });
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Sair e manter no aparelho' }));

    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalledTimes(1));
    expect((await queue.counts()).pendente).toBe(2);
    expect(await sessions.get(session.id)).not.toBeNull();
    db.close();
  });

  it('"Tentar enviar agora" com a conexão de volta envia e sai', async () => {
    const { db } = await mount({ pending: 2 });
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    await screen.findByText('Antes de sair');
    mockAuth.api.post.mockImplementation(allApplied);

    await fireEvent.press(screen.getByRole('button', { name: 'Tentar enviar agora' }));

    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalledTimes(1));
    db.close();
  });

  it('"Sair e apagar" exige confirmação; cancelar não apaga nem sai', async () => {
    const { db, queue, sessions, session } = await mount({ pending: 2 });
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Sair e apagar do aparelho' }));

    expect(screen.getByText('Apagar os registros deste aparelho?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect((await queue.counts()).pendente).toBe(2);

    await fireEvent.press(screen.getByRole('button', { name: 'Sair e apagar do aparelho' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Sair e apagar' }));

    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalledTimes(1));
    expect((await queue.counts()).pendente).toBe(0);
    expect(await sessions.get(session.id)).toBeNull();
    db.close();
  });

  it('registros que o servidor recusou também impedem a saída automática e levam à revisão', async () => {
    const { db } = await mount({ pending: 2 });
    mockAuth.api.post.mockImplementation(async (_p: string, body: { operacoes: { operacao_uuid: string; tipo: string }[] }) => ({
      data: { server_time: 'x', resultados: body.operacoes.map((o) => (o.tipo === 'criar' ? { operacao_uuid: o.operacao_uuid, resultado: 'aplicada' } : { operacao_uuid: o.operacao_uuid, resultado: 'conflito', erro: { code: 'SESSION_CLOSED', message: 'x' } })) },
    }));

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByText('1 registro(s) que o servidor não aceitou esperam sua revisão.')).toBeTruthy();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Revisar registros' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/sincronizacao');
    db.close();
  });

  it('"Cancelar" volta ao botão Sair sem sair', async () => {
    const { db } = await mount({ pending: 2 });
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    db.close();
  });
});
