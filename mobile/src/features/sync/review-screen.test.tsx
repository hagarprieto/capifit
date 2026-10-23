import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { QueuedOperation } from '@/data/local/queueRepo';
import type { Review, ReviewGroup, ReviewItem } from '@/data/sync/review';
import { ThemeProvider } from '@/design-system/ThemeProvider';

import { ReviewScreen } from './ReviewScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/data/LocalDataProvider', () => ({
  useLocalData: () => ({ review: null }),
  useSyncStatus: () => ({ state: 'conflict', waiting: 0, review: 1, retry: undefined }),
}));

function op(over: Partial<QueuedOperation> = {}): QueuedOperation {
  return {
    sequencia: 1,
    operacao_uuid: 'op-1',
    entidade: 'sessao_serie',
    entidade_uuid: 'serie-1',
    sessao_uuid: 'sessao-1',
    tipo: 'atualizar',
    payload: {},
    estado: 'conflito',
    tentativas: 1,
    erro_codigo: 'REVISION_CONFLICT',
    erro_mensagem: '',
    estado_servidor: null,
    criada_em: '2026-10-22T10:00:00.000Z',
    ...over,
  };
}

const conflict: ReviewItem = {
  op: op(),
  reason: 'serie_alterada',
  exercise: 'Supino reto',
  mine: { carga_kg: 60, repeticoes: 10, duracao_segundos: null },
  server: { carga_kg: 55, repeticoes: 8, duracao_segundos: null },
  canKeepMine: true,
  canResend: false,
};
const closed: ReviewItem = { op: op({ operacao_uuid: 'op-2', entidade_uuid: 'serie-2', erro_codigo: 'SESSION_CLOSED' }), reason: 'treino_encerrado', exercise: 'Supino reto', mine: { carga_kg: 60, repeticoes: 9, duracao_segundos: null }, server: null, canKeepMine: false, canResend: false };
const rejected: ReviewItem = { op: op({ operacao_uuid: 'op-3', entidade: 'sessao_treino', tipo: 'concluir', erro_codigo: 'VALIDATION_ERROR' }), reason: 'rejeitado', exercise: null, mine: null, server: null, canKeepMine: false, canResend: true };

const group = (items: ReviewItem[]): ReviewGroup => ({ sessionUuid: 'sessao-1', title: 'Treino A', startedAt: new Date(2026, 9, 22, 10).toISOString(), items });

function fakeReview(groups: ReviewGroup[]) {
  const review = {
    list: jest.fn().mockResolvedValue(groups),
    keepMine: jest.fn().mockResolvedValue(true),
    useServer: jest.fn().mockResolvedValue(true),
    resend: jest.fn().mockResolvedValue(true),
    discard: jest.fn().mockResolvedValue(true),
    discardSession: jest.fn().mockResolvedValue(undefined),
  };
  return review;
}

async function show(review: ReturnType<typeof fakeReview>) {
  await render(
    <ThemeProvider initialPreference="dark">
      <ReviewScreen review={review as unknown as Review} />
    </ThemeProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('ReviewScreen', () => {
  it('mostra o motivo e os dois lados de um conflito de série', async () => {
    await show(fakeReview([group([conflict])]));

    expect(await screen.findByText('Treino A · 22/10')).toBeTruthy();
    expect(screen.getByText('Supino reto')).toBeTruthy();
    expect(screen.getByText('Esta série foi alterada em outro aparelho com valores diferentes.')).toBeTruthy();
    expect(screen.getByText('Neste dispositivo: 60 kg × 10')).toBeTruthy();
    expect(screen.getByText('No servidor: 55 kg × 8')).toBeTruthy();
  });

  it('oferece só as escolhas que fazem sentido para cada caso', async () => {
    await show(fakeReview([group([conflict, closed, rejected])]));
    await screen.findByText('Treino A · 22/10');

    expect(screen.getAllByRole('button', { name: 'Manter o meu' })).toHaveLength(1); // só o conflito de série
    expect(screen.getAllByRole('button', { name: 'Usar o do servidor' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Tentar de novo' })).toHaveLength(1); // só o rejeitado
    expect(screen.getAllByRole('button', { name: 'Descartar' })).toHaveLength(3);
    expect(screen.getByText('Este treino já estava encerrado no servidor, então o registro não pôde ser salvo lá.')).toBeTruthy();
    expect(screen.getByText('Fim do treino')).toBeTruthy();
  });

  it('manter o meu, usar o do servidor e tentar de novo chamam a ação certa e relêem a lista', async () => {
    const review = fakeReview([group([conflict, rejected])]);
    await show(review);

    await fireEvent.press(await screen.findByRole('button', { name: 'Manter o meu' }));
    await waitFor(() => expect(review.keepMine).toHaveBeenCalledWith('op-1'));
    await fireEvent.press(screen.getByRole('button', { name: 'Usar o do servidor' }));
    await waitFor(() => expect(review.useServer).toHaveBeenCalledWith('op-1'));
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(review.resend).toHaveBeenCalledWith('op-3'));
    await waitFor(() => expect(review.list.mock.calls.length).toBeGreaterThanOrEqual(4));
  });

  it('descartar pede confirmação e só então descarta; cancelar não faz nada', async () => {
    const review = fakeReview([group([closed])]);
    await show(review);

    await fireEvent.press(await screen.findByRole('button', { name: 'Descartar' }));
    expect(screen.getByText('Descartar este registro?')).toBeTruthy();
    expect(review.discard).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(review.discard).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Descartar' }));
    const buttons = screen.getAllByRole('button', { name: 'Descartar' });
    await fireEvent.press(buttons[buttons.length - 1]);
    await waitFor(() => expect(review.discard).toHaveBeenCalledWith('op-2'));
  });

  it('descartar o treino do aparelho explica o efeito e exige confirmação', async () => {
    const review = fakeReview([group([closed])]);
    await show(review);

    await fireEvent.press(await screen.findByRole('button', { name: 'Descartar este treino do aparelho' }));

    expect(screen.getByText('Descartar o treino?')).toBeTruthy();
    expect(screen.getByText('O treino e todos os registros dele saem deste dispositivo e não serão enviados. Isso não pode ser desfeito.')).toBeTruthy();
    expect(review.discardSession).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole('button', { name: 'Descartar' });
    await fireEvent.press(buttons[buttons.length - 1]);
    await waitFor(() => expect(review.discardSession).toHaveBeenCalledWith('sessao-1'));
  });

  it('sem nada para revisar mostra o estado vazio e volta', async () => {
    await show(fakeReview([]));

    expect(await screen.findByText('Nada para revisar')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('falha ao carregar avisa sem derrubar a tela', async () => {
    const review = fakeReview([]);
    review.list.mockRejectedValue(new Error('x'));
    await show(review);

    expect(await screen.findByText('Não foi possível carregar a revisão agora.')).toBeTruthy();
  });
});
