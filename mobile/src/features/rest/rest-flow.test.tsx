import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { AppState } from 'react-native';

import { ThemeProvider } from '@/design-system/ThemeProvider';
import { WorkoutScreen } from '@/features/workout/WorkoutScreen';
import type { Session, SessionSeries, WorkoutApi } from '@/features/workout/workoutApi';

const mockSchedule = jest.fn();
const mockCancel = jest.fn();
jest.mock('./notifications', () => ({
  restNotifier: { schedule: (...args: unknown[]) => mockSchedule(...args), cancel: (...args: unknown[]) => mockCancel(...args) },
}));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn().mockResolvedValue(undefined), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ uuid: 'sessao-1' }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    // Como o de verdade: roda ao abrir a tela e DE NOVO sempre que a função recebida muda de identidade.
    jest.requireActual('react').useEffect(callback, [callback]);
  },
}));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: {} }) }));

const serie = (id: string, ordem: number, over: Partial<SessionSeries> = {}): SessionSeries => ({ id, ordem, tipo: 'normal', status: 'pendente', revision: 1, ...over });

function session(): Session {
  return {
    id: 'sessao-1',
    tipo: 'avulso',
    titulo: null,
    status: 'em_andamento',
    pausas: [],
    exercicios: [
      {
        id: 'item-1',
        exercicio: { id: 'ex-1', nome: 'Supino reto', equipamento: null, grupos_primarios: [], modalidade: 'reps_carga', miniatura_url: null },
        tipo_item: 'adicionado',
        ordem: 1,
        series: [serie('s1', 1, { carga_kg: 40, repeticoes: 10 }), serie('s2', 2, { carga_kg: 40, repeticoes: 10 })],
      },
    ],
  } as unknown as Session;
}

function fakeApi(): WorkoutApi {
  return {
    getSession: jest.fn().mockResolvedValue(session()),
    // Último treino: é dele que vêm os valores sugeridos (40 kg × 10) que o toque em Concluir confirma.
    lastRecords: jest.fn().mockResolvedValue({ 'ex-1': { exercicio_id: 'ex-1', sessao_id: 'antiga', data: '2026-10-10T10:00:00.000Z', series: [{ ordem: 1, carga_kg: 40, repeticoes: 10 }, { ordem: 2, carga_kg: 40, repeticoes: 10 }] } }),
    completeSeries: jest.fn().mockImplementation(async (_s: string, id: string, values: object) => serie(id, Number(id.slice(1)), { status: 'realizada', ...values })),
    addSeries: jest.fn(),
    finish: jest.fn().mockResolvedValue(undefined),
  } as unknown as WorkoutApi;
}

async function open() {
  await render(
    <ThemeProvider initialPreference="dark">
      <WorkoutScreen api={fakeApi()} />
    </ThemeProvider>,
  );
  await screen.findByText('Supino reto');
}

const complete = (n: number) => fireEvent.press(screen.getByRole('button', { name: new RegExp(`Concluir série ${n} de Supino reto`) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date('2026-10-22T12:00:00Z') });
  mockSchedule.mockResolvedValue('notif-1');
  mockCancel.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('descanso no executor', () => {
  it('fica em repouso até a primeira série e oferece iniciar à mão', async () => {
    await open();

    expect(screen.getByRole('button', { name: 'Iniciar descanso' })).toBeTruthy();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('concluir uma série inicia o descanso de 01:30 e agenda o aviso local para 90 s', async () => {
    await open();

    await complete(1);

    expect(await screen.findByText('01:30')).toBeTruthy();
    expect(mockSchedule).toHaveBeenCalledWith(90);
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
  });

  it('o executor continua editável durante a contagem (não bloqueia)', async () => {
    await open();
    await complete(1);
    await screen.findByText('01:30');

    await fireEvent.changeText(screen.getByLabelText('Repetições, série 2 de Supino reto'), '8');
    await complete(2);

    await waitFor(() => expect(screen.getByText('2 de 2 séries concluídas')).toBeTruthy());
  });

  it('com o início automático desligado, concluir não inicia o descanso', async () => {
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Iniciar o descanso ao concluir uma série' }));

    await complete(1);
    await screen.findByLabelText(/Série 1 de Supino reto concluída/);

    expect(screen.queryByText('01:30')).toBeNull();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('corrigir uma série já concluída não reinicia o descanso', async () => {
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Iniciar o descanso ao concluir uma série' }));
    await complete(1);
    await screen.findByLabelText(/Série 1 de Supino reto concluída/);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Iniciar o descanso ao concluir uma série' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Corrigir série 1 de Supino reto' }));
    await complete(1);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Corrigir série 1 de Supino reto' })).toBeTruthy());
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('o tempo vem do relógio: a contagem desce e, ao passar do instante final, o descanso termina com háptico uma vez', async () => {
    await open();
    await complete(1);
    await screen.findByText('01:30');

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('01:00')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(await screen.findByText('Descanso terminou. Pronto para a próxima série.')).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  it('ao voltar para o app depois de ficar suspenso, recalcula pelo relógio e já mostra que terminou', async () => {
    let onChange: (state: string) => void = () => undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onChange = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
    await open();
    await complete(1);
    await screen.findByText('01:30');

    // o JavaScript ficou suspenso (tela bloqueada): o relógio andou 2 minutos sem nenhum tick
    jest.setSystemTime(new Date('2026-10-22T12:02:00Z'));
    await act(async () => {
      onChange('active');
    });

    expect(await screen.findByText('Descanso terminou. Pronto para a próxima série.')).toBeTruthy();
    spy.mockRestore();
  });

  it('pausar congela e cancela o aviso; retomar agenda de novo só com o que faltava', async () => {
    await open();
    await complete(1);
    await screen.findByText('01:30');
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Pausar' }));
    expect(screen.getByText('Descanso pausado em 01:00')).toBeTruthy();
    expect(mockCancel).toHaveBeenCalledWith('notif-1');
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(screen.getByText('01:00')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Retomar' }));
    await waitFor(() => expect(mockSchedule).toHaveBeenLastCalledWith(60));
  });

  it('pular volta ao repouso e cancela o aviso agendado', async () => {
    await open();
    await complete(1);
    await screen.findByText('01:30');

    await fireEvent.press(screen.getByRole('button', { name: 'Pular' }));

    expect(screen.getByRole('button', { name: 'Iniciar descanso' })).toBeTruthy();
    expect(mockCancel).toHaveBeenCalledWith('notif-1');
  });

  it('ajusta o descanso de 15 em 15 s e reagenda o aviso', async () => {
    await open();
    await complete(1);
    await screen.findByText('01:30');

    await fireEvent.press(screen.getByRole('button', { name: 'Aumentar o descanso em 15 segundos' }));
    expect(await screen.findByText('01:45')).toBeTruthy();
    await waitFor(() => expect(mockSchedule).toHaveBeenLastCalledWith(105));

    await fireEvent.press(screen.getByRole('button', { name: 'Diminuir o descanso em 15 segundos' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Diminuir o descanso em 15 segundos' }));
    expect(await screen.findByText('01:15')).toBeTruthy();
  });

  it('sem permissão para notificar (aviso nulo), o descanso funciona normalmente dentro do app', async () => {
    mockSchedule.mockResolvedValue(null);
    await open();

    await complete(1);

    expect(await screen.findByText('01:30')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Pular' }));
    expect(screen.getByRole('button', { name: 'Iniciar descanso' })).toBeTruthy();
  });

  it('ao sair da tela do treino o aviso agendado é cancelado', async () => {
    const view = await render(
      <ThemeProvider initialPreference="dark">
        <WorkoutScreen api={fakeApi()} />
      </ThemeProvider>,
    );
    await screen.findByText('Supino reto');
    await complete(1);
    await screen.findByText('01:30');
    mockCancel.mockClear();

    await view.unmount();

    expect(mockCancel).toHaveBeenCalledWith('notif-1');
  });
});
