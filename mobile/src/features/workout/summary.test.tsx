import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';

import { SummaryScreen } from './SummaryScreen';
import { formatVolume, summarize } from './summary';
import type { Session, SessionSeries, WorkoutApi } from './workoutApi';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ uuid: 'sessao-1' }),
}));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: {} }) }));

const done = (ordem: number, over: Partial<SessionSeries> = {}): SessionSeries => ({ id: `s${ordem}`, ordem, tipo: 'normal', status: 'realizada', revision: 1, ...over });
const pending = (ordem: number): SessionSeries => ({ id: `p${ordem}`, ordem, tipo: 'normal', status: 'pendente', revision: 1 });

function item(id: string, nome: string, modalidade: string, series: SessionSeries[]) {
  return { id, exercicio: { id: `ex-${id}`, nome, equipamento: null, grupos_primarios: [], modalidade, miniatura_url: null }, tipo_item: 'adicionado', ordem: 1, series };
}

function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: 'sessao-1',
    tipo: 'avulso',
    titulo: null,
    status: 'concluida',
    duracao_ativa_segundos: 3240,
    pausas: [],
    exercicios: [
      item('1', 'Supino reto', 'reps_carga', [done(1, { carga_kg: 40, repeticoes: 10 }), done(2, { carga_kg: 42.5, repeticoes: 8 }), pending(3)]),
      item('2', 'Prancha', 'tempo', [done(1, { duracao_segundos: 45 })]),
      item('3', 'Barra fixa', 'reps_peso_corporal', [done(1, { repeticoes: 8 }), done(2, { carga_kg: 10, repeticoes: 5 })]),
      item('4', 'Esteira leve', 'reps_carga', [pending(1)]),
    ],
    ...over,
  } as unknown as Session;
}

describe('summarize', () => {
  it('conta séries, exercícios executados e a duração em minutos', () => {
    const summary = summarize(makeSession());

    expect(summary.seriesDone).toBe(5);
    expect(summary.seriesTotal).toBe(7);
    expect(summary.exercisesDone).toBe(3);
    expect(summary.minutes).toBe(54);
    expect(summary.exercises.map((e) => e.nome)).toEqual(['Supino reto', 'Prancha', 'Barra fixa']);
  });

  it('o volume é carga × repetições das séries de trabalho (mesma regra do servidor)', () => {
    // supino: 40×10 + 42,5×8 = 740; barra fixa com +10 kg: 10×5 = 50; sem carga, tempo e série pendente ficam fora
    expect(summarize(makeSession()).volumeKg).toBe(790);
  });

  it('aquecimento e assistido não entram no volume', () => {
    const session = makeSession({
      exercicios: [
        item('1', 'Supino', 'reps_carga', [done(1, { tipo: 'aquecimento', carga_kg: 20, repeticoes: 12 }), done(2, { carga_kg: 40, repeticoes: 10 })]),
        item('2', 'Barra assistida', 'reps_assistido', [done(1, { carga_kg: 30, repeticoes: 8 })]),
      ],
    } as Partial<Session>);

    expect(summarize(session).volumeKg).toBe(400);
  });

  it('sessão sem carga registrada tem volume zero e duração desconhecida vira null', () => {
    const summary = summarize(makeSession({ duracao_ativa_segundos: null, exercicios: [item('1', 'Flexão', 'reps_peso_corporal', [done(1, { repeticoes: 15 })])] } as Partial<Session>));

    expect(summary.volumeKg).toBe(0);
    expect(summary.minutes).toBeNull();
  });

  it('treino curto não aparece como 0 min', () => {
    expect(summarize(makeSession({ duracao_ativa_segundos: 20 })).minutes).toBe(1);
    expect(summarize(makeSession({ duracao_ativa_segundos: 0 })).minutes).toBe(0);
  });

  it('formata o volume com separador de milhar e vírgula do pt-BR', () => {
    expect(formatVolume(12450)).toBe('12.450');
    expect(formatVolume(790)).toBe('790');
    expect(formatVolume(1234567.5)).toBe('1.234.567,5');
    expect(formatVolume(0)).toBe('0');
  });
});

describe('SummaryScreen', () => {
  function show(api: Partial<WorkoutApi>) {
    return render(
      <ThemeProvider initialPreference="dark">
        <SummaryScreen api={api as WorkoutApi} />
      </ThemeProvider>,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  it('confirma no servidor e mostra duração, séries, exercícios e volume com a regra explicada', async () => {
    await show({ getSession: jest.fn().mockResolvedValue(makeSession()) });

    expect(await screen.findByText('Treino concluído!')).toBeTruthy();
    expect(screen.getByText('Duração: 54 min')).toBeTruthy();
    expect(screen.getByText('Séries concluídas: 5 de 7')).toBeTruthy();
    expect(screen.getByText('Exercícios executados: 3')).toBeTruthy();
    expect(screen.getByText('Volume: 790 kg')).toBeTruthy();
    expect(screen.getByText(/sem aquecimento/)).toBeTruthy();
  });

  it('ver registros expande as séries feitas e esconde as pendentes', async () => {
    await show({ getSession: jest.fn().mockResolvedValue(makeSession()) });
    await screen.findByText('Treino concluído!');
    expect(screen.queryByText('Série 1: 40 kg × 10')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Ver registros' }));

    expect(screen.getByText('Série 1: 40 kg × 10')).toBeTruthy();
    expect(screen.getByText('Série 2: 42,5 kg × 8')).toBeTruthy();
    expect(screen.getByText('Série 1: 45 s')).toBeTruthy();
    expect(screen.getByText('Série 1: 8 repetições')).toBeTruthy();
    expect(screen.queryByText('Esteira leve')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Ocultar registros' }));
    expect(screen.queryByText('Série 1: 40 kg × 10')).toBeNull();
  });

  it('os registros mostram a unidade pela convenção do exercício e "por lado" nos unilaterais', async () => {
    const dumbbell = {
      ...item('1', 'Remada com halter', 'reps_carga', [done(1, { carga_kg: 20, repeticoes: 10 })]),
      exercicio: { id: 'ex-1', nome: 'Remada com halter', modalidade: 'reps_carga', convencao_carga: 'por_halter', unilateral: true },
    };
    const machine = { ...item('2', 'Leg press', 'reps_carga', [done(1, { carga_kg: 120, repeticoes: 12 })]), exercicio: { id: 'ex-2', nome: 'Leg press', modalidade: 'reps_carga', convencao_carga: 'selecao_maquina', unilateral: false } };
    await show({ getSession: jest.fn().mockResolvedValue(makeSession({ exercicios: [dumbbell, machine] } as unknown as Partial<Session>)) });
    await screen.findByText('Treino concluído!');

    await fireEvent.press(screen.getByRole('button', { name: 'Ver registros' }));

    expect(screen.getByText('Série 1: 20 kg por halter × 10 por lado')).toBeTruthy();
    expect(screen.getByText('Série 1: 120 kg (máquina) × 12')).toBeTruthy();
  });

  it('o resumo explica o cálculo do volume sob demanda', async () => {
    await show({ getSession: jest.fn().mockResolvedValue(makeSession()) });
    await screen.findByText('Treino concluído!');

    await fireEvent.press(screen.getByRole('button', { name: 'Como calculamos o volume' }));

    expect(screen.getByText(/Exemplo: 40 kg × 10 e 42,5 kg × 8 dão 740 kg\./)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ocultar explicação' }));
    expect(screen.queryByText(/Exemplo: 40 kg × 10/)).toBeNull();
  });

  it('sem carga registrada não mostra volume', async () => {
    await show({ getSession: jest.fn().mockResolvedValue(makeSession({ exercicios: [item('1', 'Flexão', 'reps_peso_corporal', [done(1, { repeticoes: 15 })])] } as Partial<Session>)) });

    await screen.findByText('Treino concluído!');

    expect(screen.queryByText(/Volume:/)).toBeNull();
  });

  it('se o servidor ainda mostra a sessão aberta, não comemora e deixa tentar de novo', async () => {
    const getSession = jest.fn().mockResolvedValueOnce(makeSession({ status: 'em_andamento' })).mockResolvedValueOnce(makeSession());
    await show({ getSession });

    expect(await screen.findByText('Este treino ainda não aparece como concluído. Tente de novo em instantes.')).toBeTruthy();
    expect(screen.queryByText('Treino concluído!')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Treino concluído!')).toBeTruthy();
  });

  it('erro de rede avisa e permite voltar ao início', async () => {
    await show({ getSession: jest.fn().mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })) });

    expect(await screen.findByText('Não foi possível conferir o treino agora. Verifique a conexão e tente de novo.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar ao início' }));

    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('voltar ao início troca a tela (não deixa o resumo no histórico de navegação)', async () => {
    await show({ getSession: jest.fn().mockResolvedValue(makeSession()) });
    await screen.findByText('Treino concluído!');

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar ao início' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });
});
