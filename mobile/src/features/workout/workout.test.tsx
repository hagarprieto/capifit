import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';

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
    replaceExercise: jest.fn().mockResolvedValue({ id: 'item-troca' }),
    finish: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue({ id: 'pausa-1', iniciada_em: '2026-10-22T10:20:00.000Z', encerrada_em: null }),
    resume: jest.fn().mockResolvedValue({ id: 'pausa-1', iniciada_em: '2026-10-22T10:20:00.000Z', encerrada_em: '2026-10-22T10:22:00.000Z' }),
    cancel: jest.fn().mockResolvedValue(undefined),
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

describe('WorkoutScreen: rótulos de carga por convenção e unilaterais', () => {
  const dumbbell = (): Session => {
    const base = makeSession();
    return { ...base, exercicios: [{ ...base.exercicios[0], exercicio: { ...base.exercicios[0].exercicio, nome: 'Remada com halter', convencao_carga: 'por_halter', unilateral: true } }] } as Session;
  };

  it('mostra a legenda e usa a unidade e "por lado" nos rótulos do campo e da conclusão', async () => {
    await show(<WorkoutScreen api={fakeApi({ getSession: jest.fn().mockResolvedValue(dumbbell()) })} />);
    await screen.findByText('Remada com halter');

    expect(screen.getByText('Carga em kg por halter · Repetições por lado')).toBeTruthy();
    expect(screen.getByLabelText('Carga em kg por halter, série 1 de Remada com halter')).toBeTruthy();
    expect(screen.getByLabelText('Repetições por lado, série 1 de Remada com halter')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Concluir série 1 de Remada com halter: 40 kg por halter, 10 repetições por lado' })).toBeTruthy();
  });

  it('exercício comum continua com "kg" e sem legenda', async () => {
    await ready(fakeApi());

    expect(screen.queryByText(/Carga em kg/)).toBeNull();
    expect(screen.getByLabelText('Carga em kg, série 1 de Supino reto')).toBeTruthy();
  });
});

describe('WorkoutScreen: substituir exercício', () => {
  it('leva à escolha do substituto com o exercício atual', async () => {
    await ready(fakeApi());

    await fireEvent.press(screen.getByRole('button', { name: 'Substituir exercício' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]/substituir', params: { uuid: 'sessao-1', itemId: 'item-1' } });
  });
});

describe('WorkoutScreen: pausar, retomar e descartar', () => {
  const paused = (): Session => ({ ...makeSession(), pausas: [{ id: 'pausa-1', iniciada_em: '2026-10-22T10:20:00.000Z', encerrada_em: null }] });

  it('pausar mostra o aviso e troca o botão por Retomar; retomar volta ao normal', async () => {
    const getSession = jest.fn().mockResolvedValueOnce(makeSession()).mockResolvedValueOnce(paused()).mockResolvedValue(makeSession());
    const api = fakeApi({ getSession });
    await ready(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Pausar treino' }));

    expect(await screen.findByText('Treino pausado. O tempo parado não conta na duração do treino.')).toBeTruthy();
    expect(api.pause).toHaveBeenCalledWith('sessao-1');
    await fireEvent.press(screen.getByRole('button', { name: 'Retomar treino' }));
    await waitFor(() => expect(screen.queryByText('Treino pausado. O tempo parado não conta na duração do treino.')).toBeNull());
    expect(api.resume).toHaveBeenCalledWith('sessao-1');
    expect(screen.getByRole('button', { name: 'Pausar treino' })).toBeTruthy();
  });

  it('falha ao pausar avisa e mantém o treino como estava', async () => {
    const api = fakeApi({ pause: jest.fn().mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })) });
    await ready(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Pausar treino' }));

    expect(await screen.findByText('Não foi possível pausar ou retomar o treino agora. Tente de novo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pausar treino' })).toBeTruthy();
  });

  it('descartar pede confirmação, cancela o treino e volta ao início', async () => {
    const api = fakeApi();
    await ready(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Descartar treino' }));
    expect(screen.getByText('Descartar este treino?')).toBeTruthy();
    expect(api.cancel).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole('button', { name: 'Descartar treino' });
    await fireEvent.press(buttons[buttons.length - 1]);

    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('sessao-1'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('cancelar na confirmação não descarta nada', async () => {
    const api = fakeApi();
    await ready(api);

    await fireEvent.press(screen.getByRole('button', { name: 'Descartar treino' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(api.cancel).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('WorkoutScreen com treino vindo de uma ficha (metas prescritas)', () => {
  function programmed(): Session {
    const base = makeSession();
    return {
      ...base,
      tipo: 'programado',
      titulo: 'Treino A',
      programa_id: 'prog-1',
      versao_numero: 2,
      exercicios: [
        {
          ...base.exercicios[0],
          tipo_item: 'prescrito',
          series: [serie('w1', 1, { tipo: 'aquecimento', serie_prescrita_id: 'sp-0' }), serie('w2', 2, { serie_prescrita_id: 'sp-1' }), serie('w3', 3, { serie_prescrita_id: 'sp-2' })],
        },
      ],
    } as unknown as Session;
  }

  const targets = {
    'sp-0': { repsMin: 12, repsMax: 12, loadKg: null, durationSeconds: null },
    'sp-1': { repsMin: 8, repsMax: 12, loadKg: 60, durationSeconds: null },
    'sp-2': { repsMin: 8, repsMax: 12, loadKg: 60, durationSeconds: null },
  };

  it('mostra a meta, sugere a carga-alvo (e não a do último treino) e não carrega carga no aquecimento', async () => {
    const api = fakeApi({ getSession: jest.fn().mockResolvedValue(programmed()), lastRecords: jest.fn().mockResolvedValue({}), programTargets: jest.fn().mockResolvedValue(targets) } as Partial<WorkoutApi>);
    await ready(api);

    expect(api.programTargets).toHaveBeenCalledWith('prog-1', 2);
    expect(screen.getByText('Meta: 8–12 repetições · 60 kg')).toBeTruthy();
    expect(screen.getByLabelText('Carga em kg, série 1 de Supino reto').props.value).toBe(''); // aquecimento: sem carga
    expect(screen.getByLabelText('Repetições, série 1 de Supino reto').props.value).toBe('12');
    expect(screen.getByLabelText('Carga em kg, série 2 de Supino reto').props.value).toBe('60');
    expect(screen.getByLabelText('Repetições, série 2 de Supino reto').props.value).toBe('8');
  });

  it('falha ao buscar as metas não impede treinar: cai no último treino', async () => {
    const api = fakeApi({ getSession: jest.fn().mockResolvedValue(programmed()), programTargets: jest.fn().mockResolvedValue({}) } as Partial<WorkoutApi>);
    await ready(api);

    expect(screen.queryByText(/^Meta:/)).toBeNull();
    expect(screen.getByLabelText('Carga em kg, série 2 de Supino reto').props.value).toBe('40');
  });

  it('treino avulso não busca metas', async () => {
    const api = fakeApi();
    await ready(api);

    expect(screen.queryByText(/^Meta:/)).toBeNull();
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
    expect(api.addExercise).toHaveBeenCalledWith('sessao-1', expect.objectContaining({ id: 'ex-1' }));
    expect(api.addSeries).toHaveBeenCalledTimes(3);
  });

  it('falha ao buscar mostra o aviso', async () => {
    const api = fakeApi({ searchExercises: jest.fn().mockRejectedValue(new Error('x')) });
    await show(<ExercisePickerScreen api={api} />);

    expect(await screen.findByText('Não foi possível buscar os exercícios. Tente de novo.')).toBeTruthy();
  });
});
