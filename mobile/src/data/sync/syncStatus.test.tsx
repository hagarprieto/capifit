import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';
import { SyncBanner } from '@/features/shell/SyncBanner';

import { LocalDataProvider, useLocalData, useSyncStatus } from '../LocalDataProvider';
import { createMemoryDb } from '../local/memoryDb';
import { migrate } from '../local/migrations';
import { createQueueRepo } from '../local/queueRepo';
import { deriveSyncState, NO_COUNTS } from './syncState';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockAuth = {
  status: 'signedIn' as const,
  user: { id: 'user-ana', nome: 'Ana' },
  offline: false,
  api: { post: jest.fn() },
};
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));

let mockOpen: () => Promise<unknown>;
jest.mock('../local/open', () => ({ openLocalDb: () => mockOpen() }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('estado de sincronização', () => {
  it('conflito > offline > pendente > sincronizado', () => {
    expect(deriveSyncState(NO_COUNTS, false)).toEqual({ state: 'synced', waiting: 0, review: 0 });
    expect(deriveSyncState({ ...NO_COUNTS, pendente: 2, enviando: 1 }, false)).toEqual({ state: 'pending', waiting: 3, review: 0 });
    expect(deriveSyncState({ ...NO_COUNTS, pendente: 2 }, true)).toMatchObject({ state: 'offline', waiting: 2 });
    expect(deriveSyncState(NO_COUNTS, true)).toMatchObject({ state: 'offline', waiting: 0 });
    expect(deriveSyncState({ ...NO_COUNTS, pendente: 2, rejeitada: 1, conflito: 1 }, true)).toEqual({ state: 'conflict', waiting: 2, review: 2 });
    expect(deriveSyncState({ ...NO_COUNTS, aplicada: 5 }, false).state).toBe('synced');
  });
});

const seen: { local: ReturnType<typeof useLocalData> | null } = { local: null };

function Probe() {
  const local = useLocalData();
  useEffect(() => {
    seen.local = local;
  }, [local]);
  const { state, waiting, review } = useSyncStatus();
  return <Text>{`${state}:${waiting}:${review}`}</Text>;
}

async function mount(compact = false) {
  const db = createMemoryDb();
  await migrate(db);
  mockOpen = () => Promise.resolve(db);
  await render(
    <ThemeProvider initialPreference="dark">
      <LocalDataProvider>
        <Probe />
        <SyncBanner compact={compact} />
      </LocalDataProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(seen.local?.engine).not.toBeNull());
  // O provedor já manda um envio ao abrir; espera ele acabar para o teste controlar os próximos.
  await act(async () => {
    await seen.local?.engine?.flush();
  });
  return { db, queue: createQueueRepo(db, 'user-ana') };
}

const op = (n: number) => ({ operacao_uuid: uuid(900 + n), entidade: 'sessao_serie' as const, entidade_uuid: uuid(n), tipo: 'atualizar' as const, payload: { repeticoes: n } });
const networkError = () => new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' });

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.offline = false;
  mockAuth.api.post.mockReset();
  seen.local = null;
});

describe('com a fila de verdade', () => {
  it('sem pendências está sincronizado e sem avisos', async () => {
    const { db } = await mount();

    expect(await screen.findByText('synced:0:0')).toBeTruthy();
    expect(screen.getAllByLabelText('Sincronizado').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
    db.close();
  });

  it('sem conexão com registros na fila: offline, com o aviso e a quantidade', async () => {
    const { db, queue } = await mount();
    await queue.enqueue(op(1));
    await queue.enqueue(op(2));
    mockAuth.api.post.mockRejectedValue(networkError());

    await act(async () => {
      await seen.local?.engine?.flush();
    });

    expect(await screen.findByText('offline:2:0')).toBeTruthy();
    expect(screen.getByText('Sem conexão. 2 registro(s) salvo(s) neste dispositivo vão sincronizar quando a conexão voltar.')).toBeTruthy();
    db.close();
  });

  it('a conexão volta e a fila é enviada: sincronizado de novo', async () => {
    const { db, queue } = await mount();
    await queue.enqueue(op(1));
    mockAuth.api.post.mockRejectedValueOnce(networkError());
    await act(async () => {
      await seen.local?.engine?.flush();
    });
    await screen.findByText('offline:1:0');
    mockAuth.api.post.mockImplementation(async (_p: string, body: { operacoes: { operacao_uuid: string }[] }) => ({
      data: { server_time: 'x', resultados: body.operacoes.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: 'aplicada' })) },
    }));

    await act(async () => {
      await seen.local?.engine?.flush();
    });

    expect(await screen.findByText('synced:0:0')).toBeTruthy();
    db.close();
  });

  it('operação rejeitada pelo servidor vira "Conflito — revisar" com o aviso', async () => {
    const { db, queue } = await mount();
    await queue.enqueue(op(1));
    mockAuth.api.post.mockResolvedValue({ data: { server_time: 'x', resultados: [{ operacao_uuid: uuid(901), resultado: 'conflito', erro: { code: 'SESSION_CLOSED', message: 'x' } }] } });

    await act(async () => {
      await seen.local?.engine?.flush();
    });

    expect(await screen.findByText('conflict:0:1')).toBeTruthy();
    expect(screen.getByText('1 registro(s) não foram aceitos pelo servidor. Eles continuam guardados neste dispositivo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revisar registros' })).toBeTruthy();
    db.close();
  });

  it('o aviso "offline" do início da sessão some depois de um envio que falou com o servidor', async () => {
    mockAuth.offline = true;
    const { db, queue } = await mount();
    expect(await screen.findByText('offline:0:0')).toBeTruthy();
    await queue.enqueue(op(1));
    mockAuth.api.post.mockImplementation(async (_p: string, body: { operacoes: { operacao_uuid: string }[] }) => ({
      data: { server_time: 'x', resultados: body.operacoes.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: 'aplicada' })) },
    }));

    await act(async () => {
      await seen.local?.engine?.flush();
    });

    expect(await screen.findByText('synced:0:0')).toBeTruthy();
    db.close();
  });

  it('com conexão e registros ainda sendo enviados: pendente, com o aviso e o botão para tentar de novo', async () => {
    const { db, queue } = await mount();
    mockAuth.api.post.mockImplementation(async (_p: string, body: { operacoes: { operacao_uuid: string }[] }) => ({
      data: { server_time: 'x', resultados: body.operacoes.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: 'aplicada' })) },
    }));
    await queue.enqueue(op(1));
    await act(async () => {
      await seen.local?.engine?.flush(); // um envio bem-sucedido: sabemos que há conexão
    });
    mockAuth.api.post.mockReturnValue(new Promise(() => undefined)); // o próximo envio fica em andamento
    await queue.enqueue(op(2));
    await act(async () => {
      void seen.local?.engine?.flush();
    });

    expect(await screen.findByText('pending:1:0')).toBeTruthy();
    expect(screen.getByText('Não conseguimos sincronizar agora. Seus dados estão salvos neste dispositivo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
    db.close();
  });
});

describe('SyncBanner compacto', () => {
  it('mostra só o indicador, sem os avisos', async () => {
    const { db, queue } = await mount(true);
    mockAuth.api.post.mockRejectedValue(networkError());
    await queue.enqueue(op(1));
    await act(async () => {
      await seen.local?.engine?.flush();
    });

    expect(await screen.findByText('offline:1:0')).toBeTruthy();
    expect(screen.getAllByLabelText('Offline — salvo neste dispositivo').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sem conexão. 1 registro/)).toBeNull();
    db.close();
  });
});
