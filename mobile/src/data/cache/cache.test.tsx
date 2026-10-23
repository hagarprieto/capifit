import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiError } from '@/api/errors';
import type { ActiveProgram, ProgramsApi } from '@/features/programs/programsApi';
import type { LastRecord, WorkoutApi } from '@/features/workout/workoutApi';

import { LocalDataProvider, useLocalData } from '../LocalDataProvider';
import { createCacheRepo } from '../local/cacheRepo';
import { createMemoryDb } from '../local/memoryDb';
import { migrate } from '../local/migrations';
import { createTodayCache, exerciseIds, loadActiveWithCache } from './todayWorkout';

const mockAuth = { status: 'signedIn' as 'signedIn' | 'signedOut' | 'loading', user: { id: 'user-ana', nome: 'Ana' } as { id: string; nome: string } | null };
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));

let mockOpen: () => Promise<unknown>;
jest.mock('../local/open', () => ({ openLocalDb: () => mockOpen() }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function makeActive(programId = uuid(100), exercises = [uuid(501), uuid(502)]): ActiveProgram {
  return {
    programa: { id: programId, titulo: 'Full body', origem: 'usuario', status: 'publicado', autor: { id: 'u', nome: 'Ana', papeis: [] }, versao_atual: 1 },
    versao: {
      numero: 1,
      estado: 'publicado',
      revision: 1,
      fichas: [
        { id: uuid(101), codigo: 'A', titulo: 'Treino A', ordem: 1, exercicios: exercises.map((id, i) => ({ id: uuid(600 + i), exercicio: { id, nome: `Ex ${i}` }, ordem: i + 1, series: [] })) },
        { id: uuid(102), codigo: 'B', titulo: 'Treino B', ordem: 2, exercicios: [{ id: uuid(610), exercicio: { id: exercises[0], nome: 'Ex 0' }, ordem: 1, series: [] }] },
      ],
    },
    ativado_em: '2026-10-01T10:00:00.000Z',
  } as unknown as ActiveProgram;
}

const record = (exercise: string, reps: number): LastRecord => ({ exercicio_id: exercise, sessao_id: uuid(1), data: '2026-10-20T10:00:00.000Z', series: [{ ordem: 1, carga_kg: 40, repeticoes: reps }] });
const networkError = () => new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' });

async function setup() {
  const db = createMemoryDb();
  await migrate(db);
  const today = createTodayCache(createCacheRepo(db, 'user-ana'));
  const active = jest.fn();
  const lastRecords = jest.fn().mockResolvedValue({});
  return { db, today, active, lastRecords, programsApi: { active } as unknown as ProgramsApi, workoutApi: { lastRecords } as unknown as WorkoutApi };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 20)); // a atualização da cópia roda em segundo plano
}

describe('cache do treino do dia', () => {
  it('lista os exercícios do programa sem repetir', () => {
    expect(exerciseIds(makeActive())).toEqual([uuid(501), uuid(502)]);
    const many = Array.from({ length: 70 }, (_, i) => uuid(1000 + i));
    expect(exerciseIds(makeActive(uuid(100), many))).toHaveLength(50);
  });

  it('com rede devolve o do servidor e guarda a cópia com os últimos registros', async () => {
    const env = await setup();
    env.active.mockResolvedValue(makeActive());
    env.lastRecords.mockResolvedValue({ [uuid(501)]: record(uuid(501), 10) });

    const result = await loadActiveWithCache(env);
    await settle();

    expect(result).toMatchObject({ fromCache: false, savedAt: null, active: { programa: { id: uuid(100) } } });
    expect(env.lastRecords).toHaveBeenCalledWith([uuid(501), uuid(502)]);
    const stored = await env.today.read();
    expect(stored?.active?.programa.titulo).toBe('Full body');
    expect(stored?.lastRecords[uuid(501)].series[0].repeticoes).toBe(10);
    env.db.close();
  });

  it('sem rede usa a cópia e diz quando ela foi salva', async () => {
    const env = await setup();
    await env.today.save({ active: makeActive(), lastRecords: {} });
    env.active.mockRejectedValue(networkError());

    const result = await loadActiveWithCache(env);

    expect(result.fromCache).toBe(true);
    expect(result.active?.programa.id).toBe(uuid(100));
    expect(result.savedAt).toMatch(/^2\d{3}-/);
    env.db.close();
  });

  it('servidor fora do ar ou limite de requisições também usam a cópia', async () => {
    const env = await setup();
    await env.today.save({ active: makeActive(), lastRecords: {} });

    for (const status of [503, 429]) {
      env.active.mockRejectedValueOnce(new ApiError({ status, code: 'X', message: '' }));
      expect((await loadActiveWithCache(env)).fromCache).toBe(true);
    }
    env.db.close();
  });

  it('sem rede e sem cópia o erro segue para a tela', async () => {
    const env = await setup();
    env.active.mockRejectedValue(networkError());

    await expect(loadActiveWithCache(env)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    env.db.close();
  });

  it('erro de permissão ou de contrato não é escondido pela cópia', async () => {
    const env = await setup();
    await env.today.save({ active: makeActive(), lastRecords: {} });
    env.active.mockRejectedValue(new ApiError({ status: 403, code: 'FORBIDDEN', message: '' }));

    await expect(loadActiveWithCache(env)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    env.db.close();
  });

  it('sem banco local funciona como antes, sem cópia', async () => {
    const env = await setup();
    env.active.mockResolvedValue(makeActive());

    expect((await loadActiveWithCache({ ...env, today: null })).fromCache).toBe(false);
    env.active.mockRejectedValue(networkError());
    await expect(loadActiveWithCache({ ...env, today: null })).rejects.toBeInstanceOf(ApiError);
    env.db.close();
  });

  it('quando o programa deixa de existir no servidor, a cópia é apagada', async () => {
    const env = await setup();
    await env.today.save({ active: makeActive(), lastRecords: {} });
    env.active.mockResolvedValue(null);

    const result = await loadActiveWithCache(env);
    await settle();

    expect(result).toMatchObject({ active: null, fromCache: false });
    expect(await env.today.read()).toBeNull();
    env.db.close();
  });

  it('falha ao buscar os últimos registros não apaga os que já havia', async () => {
    const env = await setup();
    await env.today.save({ active: makeActive(), lastRecords: { [uuid(501)]: record(uuid(501), 9) } });
    env.active.mockResolvedValue(makeActive());
    env.lastRecords.mockResolvedValue({}); // o cliente devolve {} quando a busca falha

    await loadActiveWithCache(env);
    await settle();

    expect((await env.today.read())?.lastRecords[uuid(501)].series[0].repeticoes).toBe(9);
    env.db.close();
  });

  it('registros novos substituem os antigos e os de outro programa não vazam', async () => {
    const env = await setup();
    await env.today.save({ active: makeActive(), lastRecords: { [uuid(501)]: record(uuid(501), 9), [uuid(502)]: record(uuid(502), 7) } });
    env.active.mockResolvedValue(makeActive());
    env.lastRecords.mockResolvedValue({ [uuid(501)]: record(uuid(501), 12) });

    await loadActiveWithCache(env);
    await settle();
    const same = await env.today.read();
    expect(same?.lastRecords[uuid(501)].series[0].repeticoes).toBe(12);
    expect(same?.lastRecords[uuid(502)].series[0].repeticoes).toBe(7);

    env.active.mockResolvedValue(makeActive(uuid(200)));
    env.lastRecords.mockResolvedValue({});
    await loadActiveWithCache(env);
    await settle();
    expect((await env.today.read())?.lastRecords).toEqual({});
    env.db.close();
  });
});

function Probe() {
  const { ready, today } = useLocalData();
  return <Text>{`${ready ? 'pronto' : 'abrindo'}:${today ? 'com-cache' : 'sem-cache'}`}</Text>;
}

describe('LocalDataProvider', () => {
  beforeEach(() => {
    mockAuth.status = 'signedIn';
    mockAuth.user = { id: 'user-ana', nome: 'Ana' };
  });

  it('abre o banco do usuário conectado e entrega o cache', async () => {
    const db = createMemoryDb();
    await migrate(db);
    let release: (value: unknown) => void = () => undefined;
    mockOpen = () => new Promise((resolve) => (release = resolve));

    await render(
      <LocalDataProvider>
        <Probe />
      </LocalDataProvider>,
    );

    expect(screen.getByText('abrindo:sem-cache')).toBeTruthy();
    release(db);
    expect(await screen.findByText('pronto:com-cache')).toBeTruthy();
    db.close();
  });

  it('se o banco não abre, segue pronto e sem cache (só online)', async () => {
    mockOpen = () => Promise.reject(new Error('disco cheio'));

    await render(
      <LocalDataProvider>
        <Probe />
      </LocalDataProvider>,
    );

    expect(await screen.findByText('pronto:sem-cache')).toBeTruthy();
  });

  it('sem usuário conectado não abre nada', async () => {
    mockAuth.status = 'signedOut';
    mockAuth.user = null;
    const open = jest.fn();
    mockOpen = open;

    await render(
      <LocalDataProvider>
        <Probe />
      </LocalDataProvider>,
    );

    await waitFor(() => expect(screen.getByText('pronto:sem-cache')).toBeTruthy());
    expect(open).not.toHaveBeenCalled();
  });
});
