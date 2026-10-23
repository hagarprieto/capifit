import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';
import type { WorkoutApi } from '@/features/workout/workoutApi';

import { FichaDetailScreen } from './FichaDetailScreen';
import { ProgramDetailScreen } from './ProgramDetailScreen';
import type { Program, ProgramVersion, ProgramsApi } from './programsApi';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ uuid: 'p-1', fichaId: 'f-a' }),
}));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: {} }) }));

const program = (over: Partial<Program> = {}): Program => ({
  id: 'p-1',
  titulo: 'Hipertrofia 4x',
  objetivo: null,
  origem: 'usuario',
  status: 'publicado',
  autor: { id: 'u', nome: 'Ana', papeis: ['aluno'] },
  versao_atual: 2,
  versao_rascunho: null,
  ...over,
});

const serie = (id: string, ordem: number, tipo = 'normal') => ({ id, ordem, tipo, reps_min: 8, reps_max: 12 });

const version = (estado: 'publicado' | 'rascunho' = 'publicado'): ProgramVersion =>
  ({
    numero: 2,
    estado,
    revision: 1,
    fichas: [
      {
        id: 'f-a',
        codigo: 'A',
        titulo: 'Treino A',
        ordem: 1,
        exercicios: [
          { id: 'i1', exercicio: { id: 'e1', nome: 'Supino reto com barra', modalidade: 'reps_carga' }, ordem: 1, descanso_segundos: 90, instrucoes: 'Pausa de 1 s no peito', series: [serie('s1', 1, 'aquecimento'), serie('s2', 2), serie('s3', 3), serie('s4', 4)] },
          { id: 'i2', exercicio: { id: 'e2', nome: 'Prancha isométrica', modalidade: 'tempo' }, ordem: 2, series: [{ id: 's5', ordem: 1, tipo: 'normal', duracao_alvo_segundos: 45 }] },
        ],
      },
      { id: 'f-b', codigo: 'B', titulo: 'Treino B', ordem: 2, exercicios: [] },
    ],
  }) as unknown as ProgramVersion;

function fakePrograms(over: Partial<ProgramsApi> = {}): ProgramsApi {
  return { get: jest.fn().mockResolvedValue(program()), version: jest.fn().mockResolvedValue(version()), active: jest.fn().mockResolvedValue(null), ...over } as unknown as ProgramsApi;
}

function fakeWorkout(over: Partial<WorkoutApi> = {}): WorkoutApi {
  return { openSessionSummary: jest.fn().mockResolvedValue(null), startProgrammedWorkout: jest.fn().mockResolvedValue('sessao-nova'), ...over } as unknown as WorkoutApi;
}

function show(node: React.ReactElement) {
  return render(<ThemeProvider initialPreference="dark">{node}</ThemeProvider>);
}

beforeEach(() => jest.clearAllMocks());

describe('FichaDetailScreen (TEL-011)', () => {
  it('mostra a ficha com a origem, os exercícios e a prescrição legível', async () => {
    await show(<FichaDetailScreen api={fakePrograms()} workoutApi={fakeWorkout()} />);

    expect(await screen.findByText('Treino A')).toBeTruthy();
    expect(screen.getByLabelText('Criado por você')).toBeTruthy();
    expect(screen.getByText('Hipertrofia 4x')).toBeTruthy();
    expect(screen.getByText('2 exercícios')).toBeTruthy();
    expect(screen.getByText('Supino reto com barra')).toBeTruthy();
    expect(screen.getByText('3 × 8–12 + aquecimento · descanso 1:30')).toBeTruthy();
    expect(screen.getByText('1 × 45 s')).toBeTruthy();
    expect(screen.getByText('Pausa de 1 s no peito')).toBeTruthy();
  });

  it('iniciar cria o treino a partir DESTA ficha e abre o executor', async () => {
    const workout = fakeWorkout();
    await show(<FichaDetailScreen api={fakePrograms()} workoutApi={workout} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Iniciar Treino A' }));

    await waitFor(() => expect(workout.startProgrammedWorkout).toHaveBeenCalledWith('f-a'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]', params: { uuid: 'sessao-nova' } });
  });

  it('se o treino aberto já é desta ficha, oferece continuar em vez de iniciar outro', async () => {
    const workout = fakeWorkout({ openSessionSummary: jest.fn().mockResolvedValue({ id: 'sessao-aberta', tipo: 'programado', titulo: 'Treino A', ficha_id: 'f-a', status: 'em_andamento' }) });
    await show(<FichaDetailScreen api={fakePrograms()} workoutApi={workout} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Continuar este treino' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]', params: { uuid: 'sessao-aberta' } });
    expect(screen.queryByRole('button', { name: 'Iniciar Treino A' })).toBeNull();
    expect(workout.startProgrammedWorkout).not.toHaveBeenCalled();
  });

  it('se o treino aberto é de outra origem, avisa e só oferece continuar aquele', async () => {
    const workout = fakeWorkout({ openSessionSummary: jest.fn().mockResolvedValue({ id: 'sessao-avulsa', tipo: 'avulso', titulo: null, ficha_id: null, status: 'em_andamento' }) });
    await show(<FichaDetailScreen api={fakePrograms()} workoutApi={workout} />);

    expect(await screen.findByText('Você já tem um treino em andamento (Treino avulso). Termine ou continue esse antes de iniciar outro.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Iniciar Treino A' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar treino em andamento' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]', params: { uuid: 'sessao-avulsa' } });
  });

  it('falha ao iniciar avisa (rede ou genérico) e deixa tentar de novo', async () => {
    const start = jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })).mockRejectedValueOnce(new ApiError({ status: 422, code: 'VALIDATION_ERROR', message: '' })).mockResolvedValueOnce('s-ok');
    await show(<FichaDetailScreen api={fakePrograms()} workoutApi={fakeWorkout({ startProgrammedWorkout: start })} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Iniciar Treino A' }));
    expect(await screen.findByText('Sem conexão. Verifique a internet e tente de novo.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar Treino A' }));
    expect(await screen.findByText('Não foi possível iniciar o treino agora. Tente de novo.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar Treino A' }));

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]', params: { uuid: 's-ok' } }));
  });

  it('não consegue saber se há treino aberto (erro de rede): ainda mostra a ficha e permite iniciar', async () => {
    const workout = fakeWorkout({ openSessionSummary: jest.fn().mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })) });
    await show(<FichaDetailScreen api={fakePrograms()} workoutApi={workout} />);

    expect(await screen.findByRole('button', { name: 'Iniciar Treino A' })).toBeTruthy();
  });

  it('programa sem versão publicada, ficha inexistente ou erro de rede mostram o aviso com nova tentativa', async () => {
    await show(<FichaDetailScreen api={fakePrograms({ get: jest.fn().mockResolvedValue(program({ status: 'rascunho', versao_atual: null, versao_rascunho: 1 })) })} workoutApi={fakeWorkout()} />);

    expect(await screen.findByText('Não foi possível abrir a ficha. Verifique a conexão e tente de novo.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('detalhe do programa → ficha', () => {
  it('cada ficha da versão publicada abre o seu detalhe', async () => {
    await show(<ProgramDetailScreen api={fakePrograms()} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Abrir a ficha Treino A' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/programas/[uuid]/ficha/[fichaId]', params: { uuid: 'p-1', fichaId: 'f-a' } });
  });

  it('rascunho não abre ficha para treinar', async () => {
    const api = fakePrograms({ get: jest.fn().mockResolvedValue(program({ status: 'rascunho', versao_atual: null, versao_rascunho: 2 })), version: jest.fn().mockResolvedValue(version('rascunho')) });
    await show(<ProgramDetailScreen api={api} />);

    await screen.findByText('Treino A');

    expect(screen.queryByRole('button', { name: /Abrir a ficha/ })).toBeNull();
  });
});
