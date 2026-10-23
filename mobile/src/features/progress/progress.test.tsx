import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';

import { ProgressScreen } from './ProgressScreen';
import { barRatio, isoDay, periodRange, weekLabel } from './progress';
import type { HistoryItem, ProgressApi, ProgressSummary } from './progressApi';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: () => undefined,
}));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: {} }) }));

// Quinta-feira, 22/10/2026.
const NOW = new Date(2026, 9, 22, 12, 0, 0);

const SUMMARY: ProgressSummary = {
  de: '2026-10-05',
  ate: '2026-10-22',
  sessoes_concluidas: 5,
  series_realizadas: 42,
  tempo_ativo_segundos: 15600,
  volume_kg: 12450,
  frequencia_semanal: [
    { semana_inicio: '2026-10-05', sessoes: 0 },
    { semana_inicio: '2026-10-12', sessoes: 2 },
    { semana_inicio: '2026-10-19', sessoes: 3 },
  ],
};

function item(id: string, day: number, extra: Partial<HistoryItem> = {}): HistoryItem {
  const at = new Date(2026, 9, day, 9).toISOString();
  return { id, tipo: 'programado', titulo: `Treino ${id}`, status: 'concluida', iniciada_em: at, encerrada_em: at, duracao_ativa_segundos: 3300, series_realizadas: 9, ...extra };
}

function fakeApi(over: Partial<ProgressApi> = {}): ProgressApi {
  return {
    summary: jest.fn().mockResolvedValue(SUMMARY),
    history: jest.fn().mockResolvedValue({ items: [item('A', 21), item('B', 19)], next: null }),
    ...over,
  };
}

async function show(api: ProgressApi) {
  await render(
    <ThemeProvider initialPreference="dark">
      <ProgressScreen api={api} now={NOW} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('regras do período', () => {
  it('o período termina hoje e começa na segunda da primeira semana', () => {
    expect(periodRange(4, NOW)).toEqual({ de: '2026-09-28', ate: '2026-10-22' });
    expect(periodRange(12, NOW)).toEqual({ de: '2026-08-03', ate: '2026-10-22' });
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('rótulo da semana e proporção da barra', () => {
    expect(weekLabel('2026-10-19')).toBe('19/10');
    expect(barRatio(3, 3)).toBe(1);
    expect(barRatio(1, 4)).toBe(0.25);
    expect(barRatio(0, 4)).toBe(0);
    expect(barRatio(2, 0)).toBe(0);
  });
});

describe('ProgressScreen', () => {
  it('mostra os indicadores, a frequência por semana e o histórico', async () => {
    const api = fakeApi();
    await show(api);

    expect(await screen.findByLabelText('Treinos concluídos no período: 5')).toBeTruthy();
    expect(screen.getByLabelText('Tempo de treino no período: 4 h 20 min')).toBeTruthy();
    expect(screen.getByLabelText('Séries realizadas no período: 42')).toBeTruthy();
    expect(screen.getByLabelText('Volume no período: 12.450 quilos')).toBeTruthy();
    expect(screen.getByLabelText('Semana de 19/10: 3 treinos')).toBeTruthy();
    expect(screen.getByLabelText('Semana de 05/10: 0 treinos')).toBeTruthy();
    expect(api.summary).toHaveBeenCalledWith('2026-09-28', '2026-10-22');
    expect(await screen.findByText('Treino A')).toBeTruthy();
    expect(screen.getByText('21/10 · 55 min · 9 séries')).toBeTruthy();
  });

  it('"Como calculamos o volume" abre e fecha a explicação do cálculo', async () => {
    await show(fakeApi());
    await screen.findByLabelText('Treinos concluídos no período: 5');
    expect(screen.queryByText(/Volume = carga × repetições/)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Como calculamos o volume' }));

    expect(screen.getByText(/Volume = carga × repetições de cada série de trabalho que você fez, somadas\./)).toBeTruthy();
    expect(screen.getByText(/Não entram: séries de aquecimento, exercícios medidos por tempo, exercícios assistidos/)).toBeTruthy();
    expect(screen.getByText(/compare o volume do mesmo exercício ao longo do tempo/)).toBeTruthy();
    expect(screen.getByText('É um número para você acompanhar. Não é uma nota do treino nem uma meta.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ocultar explicação' }));
    expect(screen.queryByText(/Volume = carga × repetições/)).toBeNull();
  });

  it('treinos sem nenhuma série com carga mostram "—" no volume, com texto falado claro (nada de "0 kg" frio)', async () => {
    await show(fakeApi({ summary: jest.fn().mockResolvedValue({ ...SUMMARY, volume_kg: 0 }) }));

    expect(await screen.findByLabelText('Volume no período: nenhuma série com carga')).toBeTruthy();
    expect(screen.queryByText('0 kg')).toBeNull();
  });

  it('trocar para 12 semanas consulta o novo período', async () => {
    const api = fakeApi();
    await show(api);
    await screen.findByLabelText('Treinos concluídos no período: 5');

    await fireEvent.press(screen.getByRole('button', { name: '12 semanas' }));

    await waitFor(() => expect(api.summary).toHaveBeenLastCalledWith('2026-08-03', '2026-10-22'));
  });

  it('abrir uma sessão do histórico leva ao resumo dela', async () => {
    await show(fakeApi());

    await fireEvent.press(await screen.findByRole('button', { name: /Treino B, 19\/10/ }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]/resumo', params: { uuid: 'B' } });
  });

  it('carrega mais sessões quando há próxima página', async () => {
    const history = jest
      .fn()
      .mockResolvedValueOnce({ items: [item('A', 21)], next: 'cursor-2' })
      .mockResolvedValueOnce({ items: [item('B', 19)], next: null });
    await show(fakeApi({ history }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByText('Treino B')).toBeTruthy();
    expect(history).toHaveBeenLastCalledWith('cursor-2');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('falha ao carregar mais avisa e mantém a lista', async () => {
    const history = jest.fn().mockResolvedValueOnce({ items: [item('A', 21)], next: 'cursor-2' }).mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' }));
    await show(fakeApi({ history }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByText('Não foi possível carregar mais sessões.')).toBeTruthy();
    expect(screen.getByText('Treino A')).toBeTruthy();
  });

  it('sem treinos concluídos mostra o estado vazio', async () => {
    await show(
      fakeApi({
        summary: jest.fn().mockResolvedValue({ ...SUMMARY, sessoes_concluidas: 0, series_realizadas: 0, tempo_ativo_segundos: 0, volume_kg: 0, frequencia_semanal: [] }),
        history: jest.fn().mockResolvedValue({ items: [], next: null }),
      }),
    );

    expect(await screen.findByText('Nenhum treino concluído ainda')).toBeTruthy();
    expect(screen.getByLabelText('Treinos concluídos no período: 0')).toBeTruthy();
  });

  it('falha ao carregar avisa e tenta de novo', async () => {
    const summary = jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })).mockResolvedValue(SUMMARY);
    await show(fakeApi({ summary }));

    expect(await screen.findByText('Não foi possível carregar a evolução agora. Verifique a conexão.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByLabelText('Treinos concluídos no período: 5')).toBeTruthy();
    expect(screen.queryByText('Não foi possível carregar a evolução agora. Verifique a conexão.')).toBeNull();
  });
});
