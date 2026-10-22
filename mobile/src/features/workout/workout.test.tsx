import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';
import { HomeScreen } from '@/features/home/HomeScreen';

import { ExercisePickerScreen } from './ExercisePickerScreen';
import { WorkoutScreen } from './WorkoutScreen';
import type { LastRecord, Session, SessionSeries, WorkoutApi } from './workoutApi';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ uuid: 'sessao-1' }),
  useFocusEffect: () => undefined,
}));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: {}, user: { id: 'u', nome: 'Ana' }, offline: false, signOut: jest.fn() }) }));

const serie = (id: string, ordem: number, over: Partial<SessionSeries> = {}): SessionSeries => ({ id, ordem, tipo: 'normal', status: 'pendente', revision: 1, ...over });

function makeSession(): Session {
  return {
    id: 'sessao-1',
    tipo: 'avulso',
    titulo: null,
    status: 'em_andamento',
    iniciada_em: '2026-10-22T10:00:00.000Z',
    encerrada_em: null,
    duracao_ativa_segundos: null,
    programa_id: null,
    versao_numero: null,
    ficha_id: null,
    series_realizadas: 0,
    series_total: 4,
    observacoes: null,
    pausas: [],
    exercicios: [
      {
        id: 'item-1',
        exercicio: { id: 'ex-supino', nome: 'Supino reto', equipamento: null, grupos_primarios: [], modalidade: 'reps_carga', miniatura_url: null },
        tipo_item: 'adicionado',
        ordem: 1,
        series: [serie('s1', 1), serie('s2', 2), serie('s3', 3)],
      },
      {
        id: 'item-2',
        exercicio: { id: 'ex-prancha', nome: 'Prancha', equipamento: null, grupos_primarios: [], modalidade: 'tempo', miniatura_url: null },
        tipo_item: 'adicionado',
        ordem: 2,
        series: [serie('s4', 1)],
      },
    ],
  } as unknown as Session;
}

const last: LastRecord = {
  exercicio_id: 'ex-supino',
  sessao_id: 'antiga',
  data: '2026-10-10T10:00:00.000Z',
  series: [
    { ordem: 1, carga_kg: 40, repeticoes: 10 },
    { ordem: 2, carga_kg: 40, repeticoes: 10 },
    { ordem: 3, carga_kg: 40, repeticoes: 8 },
  ],
};

function fakeApi(over: Partial<WorkoutApi> = {}): WorkoutApi {
  return {
    openSession: jest.fn().mockResolvedValue(null),
    startFreeWorkout: jest.fn().mockResolvedValue('sessao-nova'),
    getSession: jest.fn().mockResolvedValue(makeSession()),
    lastRecords: jest.fn().mockResolvedValue({ 'ex-supino': last }),
    completeSeries: jest.fn().mockImplementation(async (_s: string, id: string, values: object) => serie(id, Number(id.slice(1)), { status: 'realizada', ...values })),
    addSeries: jest.fn().mockImplementation(async () => serie('s-novo', 4)),
    addExercise: jest.fn().mockResolvedValue({ id: 'item-novo' }),
    finish: jest.fn().mockResolvedValue(undefined),
    searchExercises: jest.fn().mockResolvedValue([]),
    ...over,
  } as WorkoutApi;
}

function show(node: React.ReactElement) {
  return render(<ThemeProvider initialPreference="dark">{node}</ThemeProvider>);
}

async function ready(api: WorkoutApi) {
  await show(<WorkoutScreen api={api} />);
  await screen.findByText('Supino reto');
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('WorkoutScreen', () => {
  it('mostra o exercício, a posição, a última vez e os valores sugeridos do último treino', async () => {
    await ready(fakeApi());

    expect(screen.getByText('Exercício 1 de 2')).toBeTruthy();
    expect(screen.getByText('Última vez: 40 kg · 10/10/8')).toBeTruthy();
    expect(screen.getByText('0 de 4 séries concluídas')).toBeTruthy();
    expect(screen.getByLabelText('Carga em kg, série 1 de Supino reto').props.value).toBe('40');
    expect(screen.getByLabelText('Repetições, série 3 de Supino reto').props.value).toBe('8');
  });

  it('um toque em concluir registra a sugestão; a série seguinte parte dos valores recém-confirmados', async () => {
    const api = fakeApi();
    await ready(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Concluir série 1 de Supino reto: 40 kg, 10 repetições' }));

    await waitFor(() => expect(api.completeSeries).toHaveBeenCalledWith('sessao-1', 's1', { carga_kg: 40, repeticoes: 10 }));
    expect(await screen.findByLabelText('Série 1 de Supino reto concluída: 40 kg, 10 repetições')).toBeTruthy();
    expect(screen.getByText('1 de 4 séries concluídas')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Corrigir série 1 de Supino reto' })).toBeTruthy();
  });

  it('o que o usuário edita é o que vai para o registro, aceitando vírgula na carga', async () => {
    const api = fakeApi();
    await ready(api);

    await fireEvent.changeText(screen.getByLabelText('Carga em kg, série 2 de Supino reto'), '42,5');
    await fireEvent.changeText(screen.getByLabelText('Repetições, série 2 de Supino reto'), '9');
    await fireEvent.press(screen.getByRole('button', { name: 'Concluir série 2 de Supino reto: 42,5 kg, 9 repetições' }));

    await waitFor(() => expect(api.completeSeries).toHaveBeenCalledWith('sessao-1', 's2', { carga_kg: 42.5, repeticoes: 9 }));
  });

  it('não registra com campo exigido vazio ou inválido e mostra o motivo', async () => {
    const api = fakeApi({ lastRecords: jest.fn().mockResolvedValue({}) });
    await ready(api);

    await fireEvent.changeText(screen.getByLabelText('Carga em kg, série 1 de Supino reto'), '40');
    await fireEvent.press(screen.getByRole('button', { name: /Concluir série 1 de Supino reto/ }));

    expect(api.completeSeries).not.toHaveBeenCalled();
    expect(screen.getByText('Erro: Informe as repetições (1 ou mais).')).toBeTruthy();
  });

  it('falha ao salvar avisa e mantém o que foi digitado para tentar de novo', async () => {
    const api = fakeApi({ completeSeries: jest.fn().mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })) });
    await ready(api);

    await fireEvent.press(screen.getByRole('button', { name: /Concluir série 1 de Supino reto/ }));

    expect(await screen.findByText('Não foi possível registrar a série. Tente de novo.')).toBeTruthy();
    expect(screen.getByLabelText('Carga em kg, série 1 de Supino reto').props.value).toBe('40');
    expect(screen.getByRole('button', { name: /Concluir série 1 de Supino reto/ })).toBeTruthy();
  });

  it('sessão já encerrada no servidor explica o motivo', async () => {
    const api = fakeApi({ completeSeries: jest.fn().mockRejectedValue(new ApiError({ status: 409, code: 'SESSION_CLOSED', message: '' })) });
    await ready(api);

    await fireEvent.press(screen.getByRole('button', { name: /Concluir série 1 de Supino reto/ }));

    expect(await screen.findByText('Este treino já foi encerrado e não aceita mais mudanças.')).toBeTruthy();
  });

  it('corrigir reabre os campos da série concluída para registrar de novo', async () => {
    const api = fakeApi();
    await ready(api);
    await fireEvent.press(screen.getByRole('button', { name: /Concluir série 1 de Supino reto/ }));
    await screen.findByLabelText(/Série 1 de Supino reto concluída/);

    await fireEvent.press(screen.getByRole('button', { name: 'Corrigir série 1 de Supino reto' }));
    await fireEvent.changeText(screen.getByLabelText('Repetições, série 1 de Supino reto'), '11');
    await fireEvent.press(screen.getByRole('button', { name: /Concluir série 1 de Supino reto/ }));

    await waitFor(() => expect(api.completeSeries).toHaveBeenLastCalledWith('sessao-1', 's1', { carga_kg: 40, repeticoes: 11 }));
  });

  it('+ série acrescenta uma linha e navegação entre exercícios mostra o de tempo com campo em segundos', async () => {
    const api = fakeApi();
    await ready(api);

    await fireEvent.press(screen.getByRole('button', { name: '+ série' }));
    await waitFor(() => expect(api.addSeries).toHaveBeenCalledWith('sessao-1', 'item-1'));
    expect(await screen.findByLabelText('Carga em kg, série 4 de Supino reto')).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Anterior' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Próximo' }));

    expect(screen.getByText('Exercício 2 de 2')).toBeTruthy();
    expect(screen.getByText('Prancha')).toBeTruthy();
    expect(screen.getByLabelText('Tempo em segundos, série 1 de Prancha')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Próximo' }).props.accessibilityState.disabled).toBe(true);
  });

  it('finalizar com séries pendentes pede confirmação, conta as pendentes e abre o resumo', async () => {
    const api = fakeApi();
    await ready(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Finalizar treino' }));
    expect(screen.getByText('Há 4 séries sem concluir. Elas ficam como estão no histórico.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.finish).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Finalizar treino' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finalizar' }));

    await waitFor(() => expect(api.finish).toHaveBeenCalledWith('sessao-1'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/treino/[uuid]/resumo', params: { uuid: 'sessao-1' } }));
  });

  it('erro ao carregar oferece tentar de novo', async () => {
    const getSession = jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })).mockResolvedValueOnce(makeSession());
    await show(<WorkoutScreen api={fakeApi({ getSession })} />);

    expect(await screen.findByText('Não foi possível carregar o treino. Verifique a conexão e tente de novo.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Supino reto')).toBeTruthy();
  });

  it('treino sem exercícios mostra o estado vazio e leva ao seletor', async () => {
    const empty = { ...makeSession(), exercicios: [] };
    await show(<WorkoutScreen api={fakeApi({ getSession: jest.fn().mockResolvedValue(empty) })} />);

    expect(await screen.findByText('Nenhum exercício neste treino')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar exercício' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]/exercicios', params: { uuid: 'sessao-1' } });
  });
});

describe('ExercisePickerScreen', () => {
  const found = [{ id: 'ex-1', nome: 'Remada baixa', equipamento: { id: '1', nome: 'Polia' }, grupos_primarios: [], modalidade: 'reps_carga', miniatura_url: null }];

  it('busca pelo nome digitado, adiciona o exercício com 3 séries e volta ao treino', async () => {
    const api = fakeApi({ searchExercises: jest.fn().mockResolvedValue(found) });
    await show(<ExercisePickerScreen api={api} />);

    await fireEvent.changeText(screen.getByLabelText('Buscar exercício'), 'remada');
    await waitFor(() => expect(api.searchExercises).toHaveBeenLastCalledWith('remada'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remada baixa' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.addExercise).toHaveBeenCalledWith('sessao-1', 'ex-1');
    expect(api.addSeries).toHaveBeenCalledTimes(3);
  });

  it('falha ao buscar mostra o aviso', async () => {
    const api = fakeApi({ searchExercises: jest.fn().mockRejectedValue(new Error('x')) });
    await show(<ExercisePickerScreen api={api} />);

    expect(await screen.findByText('Não foi possível buscar os exercícios. Tente de novo.')).toBeTruthy();
  });
});

describe('HomeScreen e o treino', () => {
  it('sem treino aberto inicia um avulso e abre o executor', async () => {
    const api = fakeApi();
    await show(<HomeScreen api={api} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar treino avulso' }));

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]', params: { uuid: 'sessao-nova' } }));
  });

  it('com treino aberto oferece continuar em vez de iniciar outro', async () => {
    const api = fakeApi({ openSession: jest.fn().mockResolvedValue('sessao-aberta') });
    await show(<HomeScreen api={api} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Continuar treino em andamento' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]', params: { uuid: 'sessao-aberta' } });
    expect(screen.queryByRole('button', { name: 'Iniciar treino avulso' })).toBeNull();
  });

  it('falha ao iniciar avisa e deixa tentar de novo', async () => {
    const api = fakeApi({ startFreeWorkout: jest.fn().mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })) });
    await show(<HomeScreen api={api} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar treino avulso' }));

    expect(await screen.findByText('Não foi possível iniciar o treino agora. Tente de novo.')).toBeTruthy();
    await act(async () => undefined);
    expect(screen.getByRole('button', { name: 'Iniciar treino avulso' })).toBeTruthy();
  });
});
