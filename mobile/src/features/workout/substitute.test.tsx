import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';

import { SubstituteExerciseScreen } from './SubstituteExerciseScreen';
import type { WorkoutApi } from './workoutApi';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ uuid: 'sessao-1', itemId: 'item-1' }),
}));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: {} }) }));

const fly = { id: 'ex-fly', nome: 'Crucifixo', modalidade: 'reps_carga', equipamento: { id: 'e', nome: 'Halteres' } };

function fakeApi(over: Partial<WorkoutApi> = {}): WorkoutApi {
  return { searchExercises: jest.fn().mockResolvedValue([fly]), replaceExercise: jest.fn().mockResolvedValue({ id: 'item-novo' }), ...over } as unknown as WorkoutApi;
}

const show = (api: WorkoutApi) =>
  render(
    <ThemeProvider initialPreference="dark">
      <SubstituteExerciseScreen api={api} />
    </ThemeProvider>,
  );

beforeEach(() => jest.clearAllMocks());

describe('SubstituteExerciseScreen', () => {
  it('explica o efeito e, ao escolher, troca o exercício do item e volta ao treino', async () => {
    const api = fakeApi();
    await show(api);

    expect(screen.getByText('O que você já registrou fica no exercício atual. As séries que faltam passam para o novo, que entra logo depois dele.')).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'Crucifixo' }));

    await waitFor(() => expect(api.replaceExercise).toHaveBeenCalledWith('sessao-1', 'item-1', fly));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('falha ao trocar avisa e deixa tentar de novo, sem voltar', async () => {
    const api = fakeApi({ replaceExercise: jest.fn().mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })) });
    await show(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Crucifixo' }));

    expect(await screen.findByText('Não foi possível buscar os exercícios. Tente de novo.')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Crucifixo' })).toBeTruthy();
  });

  it('dá para ver os detalhes de um candidato antes de escolher', async () => {
    const api = fakeApi();
    await show(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Ver detalhes de Crucifixo' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/exercicios/[uuid]', params: { uuid: 'ex-fly' } });
    expect(api.replaceExercise).not.toHaveBeenCalled();
  });
});
