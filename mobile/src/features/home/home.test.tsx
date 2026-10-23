import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';
import type { ProgramsApi } from '@/features/programs/programsApi';
import type { WorkoutApi } from '@/features/workout/workoutApi';

import { HomeScreen } from './HomeScreen';
import { formatDuration, formatShortDate, nextFicha, sessionsThisWeek, startOfWeek, weekDays, weekStats, type Ficha, type SessionSummary } from './home';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: () => undefined,
}));

const mockAuth = { user: { id: 'u1', nome: 'Ana' }, offline: false, signOut: jest.fn(), api: {} };
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));

// Quinta-feira, 22/10/2026, 12h (horário local do aparelho).
const NOW = new Date(2026, 9, 22, 12, 0, 0);

function done(id: string, at: Date, extra: Partial<SessionSummary> = {}): SessionSummary {
  return { id, tipo: 'programado', status: 'concluida', iniciada_em: at.toISOString(), encerrada_em: at.toISOString(), duracao_ativa_segundos: 3000, programa_id: 'prog-1', ficha_id: 'f-a', ...extra };
}

function ficha(id: string, ordem: number, titulo: string, exercicios = 2): Ficha {
  return { id, codigo: titulo, titulo, ordem, exercicios: Array.from({ length: exercicios }, (_, i) => ({ id: `${id}-${i}` })) } as unknown as Ficha;
}

const FICHAS = [ficha('f-a', 1, 'Treino A'), ficha('f-b', 2, 'Treino B', 1), ficha('f-c', 3, 'Treino C', 0)];

const ACTIVE = {
  programa: { id: 'prog-1', titulo: 'Full body', origem: 'usuario', status: 'publicado', autor: { id: 'u1', nome: 'Ana', papeis: [] }, versao_atual: 1 },
  versao: { numero: 1, estado: 'publicado', revision: 1, fichas: FICHAS },
  ativado_em: '2026-10-01T10:00:00.000Z',
} as unknown as Awaited<ReturnType<ProgramsApi['active']>>;

function workoutApi(over: Partial<WorkoutApi> = {}): WorkoutApi {
  return {
    openSessionSummary: jest.fn().mockResolvedValue(null),
    recentCompleted: jest.fn().mockResolvedValue([]),
    startFreeWorkout: jest.fn().mockResolvedValue('sessao-nova'),
    startProgrammedWorkout: jest.fn().mockResolvedValue('sessao-ficha'),
    ...over,
  } as unknown as WorkoutApi;
}

function programsApi(active: unknown = null): ProgramsApi {
  return { active: jest.fn().mockResolvedValue(active) } as unknown as ProgramsApi;
}

async function show(api: WorkoutApi, programs: ProgramsApi) {
  await render(
    <ThemeProvider initialPreference="dark">
      <HomeScreen api={api} programsApi={programs} now={NOW} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.offline = false;
});

describe('regras da semana', () => {
  it('a semana começa na segunda-feira à meia-noite', () => {
    expect(startOfWeek(NOW)).toEqual(new Date(2026, 9, 19));
    expect(startOfWeek(new Date(2026, 9, 25, 23, 0))).toEqual(new Date(2026, 9, 19)); // domingo ainda é a mesma semana
    expect(startOfWeek(new Date(2026, 9, 26))).toEqual(new Date(2026, 9, 26)); // segunda inicia a seguinte
  });

  it('só conta sessões concluídas desta semana', () => {
    const list = [
      done('hoje', new Date(2026, 9, 22, 8)),
      done('segunda', new Date(2026, 9, 19, 7)),
      done('passada', new Date(2026, 9, 18, 20)),
      done('cancelada', new Date(2026, 9, 21, 8), { status: 'cancelada' }),
    ];

    expect(sessionsThisWeek(list, NOW).map((s) => s.id)).toEqual(['hoje', 'segunda']);
    expect(weekStats(list, NOW)).toEqual({ count: 2, activeSeconds: 6000 });
  });

  it('marca os dias treinados e o dia de hoje, com rótulo falado', () => {
    const days = weekDays(NOW, [done('seg', new Date(2026, 9, 19, 7))]);

    expect(days.map((d) => d.label)).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
    expect(days[0]).toMatchObject({ done: true, today: false, spoken: 'Segunda: treino concluído' });
    expect(days[3]).toMatchObject({ done: false, today: true, spoken: 'Quinta (hoje): sem treino' });
  });

  it('formata duração e data curta', () => {
    expect(formatDuration(3240)).toBe('54 min');
    expect(formatDuration(7800)).toBe('2 h 10 min');
    expect(formatDuration(0)).toBe('0 min');
    expect(formatShortDate(new Date(2026, 9, 2, 12).toISOString())).toBe('02/10');
    expect(formatShortDate('lixo')).toBe('');
  });
});

describe('próxima ficha', () => {
  it('sem histórico é a primeira com exercício', () => {
    expect(nextFicha(FICHAS, 'prog-1', [])?.id).toBe('f-a');
  });

  it('depois da A vem a B, e depois da B volta à A (a C vazia fica fora)', () => {
    expect(nextFicha(FICHAS, 'prog-1', [done('x', NOW, { ficha_id: 'f-a' })])?.id).toBe('f-b');
    expect(nextFicha(FICHAS, 'prog-1', [done('x', NOW, { ficha_id: 'f-b' })])?.id).toBe('f-a');
  });

  it('ignora treinos de outro programa e programa sem ficha utilizável', () => {
    expect(nextFicha(FICHAS, 'prog-1', [done('x', NOW, { programa_id: 'outro', ficha_id: 'f-a' })])?.id).toBe('f-a');
    expect(nextFicha([ficha('v', 1, 'Vazia', 0)], 'prog-1', [])).toBeNull();
  });
});

describe('HomeScreen', () => {
  it('com programa ativo mostra a próxima ficha e inicia por ela', async () => {
    const api = workoutApi({ recentCompleted: jest.fn().mockResolvedValue([done('x', new Date(2026, 9, 20, 9), { ficha_id: 'f-a' })]) });
    await show(api, programsApi(ACTIVE));

    expect(await screen.findByText('Olá, Ana! Bora treinar?')).toBeTruthy();
    expect(await screen.findByText('Próximo: Treino B')).toBeTruthy();
    expect(screen.getByText('1 exercício')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar Treino B' }));

    await waitFor(() => expect(api.startProgrammedWorkout).toHaveBeenCalledWith('f-b'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]', params: { uuid: 'sessao-ficha' } });
  });

  it('mostra a semana, o total e a última sessão', async () => {
    const api = workoutApi({
      recentCompleted: jest.fn().mockResolvedValue([done('b', new Date(2026, 9, 21, 9)), done('a', new Date(2026, 9, 19, 9))]),
    });
    await show(api, programsApi(ACTIVE));

    expect(await screen.findByText('Última sessão: 21/10 · 50 min')).toBeTruthy();
    expect(screen.getByLabelText('Treinos concluídos na semana: 2')).toBeTruthy();
    expect(screen.getByLabelText('Tempo de treino na semana: 1 h 40 min')).toBeTruthy();
    expect(screen.getByLabelText('Quinta (hoje): sem treino')).toBeTruthy();
  });

  it('sem programa oferece criar um e o treino avulso', async () => {
    const api = workoutApi();
    await show(api, programsApi(null));

    expect(await screen.findByText('Você ainda não tem um programa ativo')).toBeTruthy();
    expect(screen.getByText(/Você ainda não concluiu nenhum treino/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Criar programa' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/programas/novo');

    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar treino avulso' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]', params: { uuid: 'sessao-nova' } }));
  });

  it('com treino em andamento oferece continuar e esconde o avulso', async () => {
    const open = { id: 'sessao-aberta', tipo: 'programado', titulo: 'Treino A', status: 'em_andamento', iniciada_em: NOW.toISOString(), series_realizadas: 3, series_total: 9 };
    await show(workoutApi({ openSessionSummary: jest.fn().mockResolvedValue(open) }), programsApi(ACTIVE));

    expect(await screen.findByText('3 de 9 séries concluídas')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar treino' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]', params: { uuid: 'sessao-aberta' } });
    expect(screen.queryByRole('button', { name: 'Iniciar treino avulso' })).toBeNull();
  });

  it('abre a ficha em vez de iniciar quando toca em Ver a ficha', async () => {
    await show(workoutApi(), programsApi(ACTIVE));

    await fireEvent.press(await screen.findByRole('button', { name: 'Ver a ficha' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/programas/[uuid]/ficha/[fichaId]', params: { uuid: 'prog-1', fichaId: 'f-a' } });
  });

  it('falha ao carregar o resumo avisa, mantém o avulso e tenta de novo', async () => {
    const recent = jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })).mockResolvedValue([]);
    await show(workoutApi({ recentCompleted: recent }), programsApi(null));

    expect(await screen.findByText('Não foi possível atualizar o resumo agora. Verifique a conexão.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Iniciar treino avulso' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(screen.queryByText('Não foi possível atualizar o resumo agora. Verifique a conexão.')).toBeNull());
    expect(recent).toHaveBeenCalledTimes(2);
  });

  it('falha ao iniciar o treino avisa e deixa tentar de novo', async () => {
    const api = workoutApi({ startFreeWorkout: jest.fn().mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })) });
    await show(api, programsApi(null));

    await fireEvent.press(await screen.findByRole('button', { name: 'Iniciar treino avulso' }));

    expect(await screen.findByText('Não foi possível iniciar o treino agora. Tente de novo.')).toBeTruthy();
    await act(async () => undefined);
    expect(screen.getByRole('button', { name: 'Iniciar treino avulso' })).toBeTruthy();
  });

  it('offline avisa e mostra o estado de sincronização', async () => {
    mockAuth.offline = true;
    await show(workoutApi(), programsApi(null));

    expect(await screen.findByText('Sem conexão: você pode treinar normalmente.')).toBeTruthy();
    expect(screen.getAllByLabelText('Offline — salvo neste dispositivo').length).toBeGreaterThan(0);
  });
});
