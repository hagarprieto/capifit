import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '@/api/client';
import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';

import { demoOf, instructionSteps, musclesOf } from './demo';
import { ExerciseDetailScreen } from './ExerciseDetailScreen';
import { createExercisesApi, type ExerciseDetail, type ExercisesApi, type ExerciseSummary } from './exercisesApi';
import { ExerciseSearch } from './ExerciseSearch';
import { LibraryScreen } from './LibraryScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = { uuid: 'ex-1' };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: {} }) }));

const summary = (id: string, nome: string, extra: Partial<ExerciseSummary> = {}): ExerciseSummary =>
  ({ id, nome, modalidade: 'reps_carga', equipamento: { id: 'eq-barra', nome: 'Barra' }, grupos_primarios: [{ id: 'g-peito', nome: 'Peito' }], ...extra }) as ExerciseSummary;

const detail = (extra: Partial<ExerciseDetail> = {}): ExerciseDetail =>
  ({
    id: 'ex-1',
    nome: 'Supino reto com barra',
    equipamento: { id: 'eq-barra', nome: 'Barra' },
    musculos: [
      { id: 'm1', nome: 'Peitoral maior', papel: 'primario' },
      { id: 'm2', nome: 'Tríceps', papel: 'secundario' },
    ],
    unilateral: false,
    modalidade: 'reps_carga',
    dificuldade: 'intermediario',
    instrucoes: '1. Deite no banco.\n2) Desça a barra até o peito.\n- Empurre para cima.',
    observacoes_seguranca: 'Use um parceiro de segurança com cargas altas.',
    midias: [],
    ...extra,
  }) as ExerciseDetail;

function fakeApi(over: Partial<ExercisesApi> = {}): ExercisesApi {
  return {
    search: jest.fn().mockResolvedValue([]),
    list: jest.fn().mockResolvedValue({ items: [summary('ex-1', 'Supino reto com barra'), summary('ex-2', 'Puxada na frente')], next: null }),
    get: jest.fn().mockResolvedValue(detail()),
    alternatives: jest.fn().mockResolvedValue([summary('ex-3', 'Supino reto com halteres')]),
    muscleGroups: jest.fn().mockResolvedValue([{ id: 'g-peito', nome: 'Peito' }, { id: 'g-costas', nome: 'Costas' }]),
    equipment: jest.fn().mockResolvedValue([{ id: 'eq-barra', nome: 'Barra' }, { id: 'eq-halter', nome: 'Halteres' }]),
    ...over,
  } as ExercisesApi;
}

const show = (node: React.ReactElement) => render(<ThemeProvider initialPreference="dark">{node}</ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { uuid: 'ex-1' };
});

describe('regras da demonstração e das instruções', () => {
  it('prefere a imagem aprovada; vídeo sem player avisa; sem mídia é "none"', () => {
    expect(demoOf([{ id: 'v', tipo: 'video_capi', versao: '2', status: 'aprovado', url: 'https://x/v.mp4' }, { id: 'i', tipo: 'imagem', versao: '1', status: 'aprovado', url: 'https://x/i.png' }])).toEqual({ kind: 'image', url: 'https://x/i.png', version: '1' });
    expect(demoOf([{ id: 'v', tipo: 'video_humano', versao: '3', url: 'https://x/v.mp4' }])).toEqual({ kind: 'video', version: '3' });
    expect(demoOf([])).toEqual({ kind: 'none' });
    expect(demoOf(undefined)).toEqual({ kind: 'none' });
  });

  it('quebra as instruções em passos sem repetir a numeração', () => {
    expect(instructionSteps('1. Deite.\n2) Desça.\n- Suba.\n\n  \n• Respire.')).toEqual(['Deite.', 'Desça.', 'Suba.', 'Respire.']);
    expect(instructionSteps(null)).toEqual([]);
    expect(instructionSteps('Uma frase só.')).toEqual(['Uma frase só.']);
  });

  it('separa músculos principais e secundários', () => {
    expect(musclesOf(detail())).toEqual({ primary: ['Peitoral maior'], secondary: ['Tríceps'] });
    expect(musclesOf({ musculos: undefined })).toEqual({ primary: [], secondary: [] });
  });
});

describe('API da biblioteca', () => {
  it('monta a busca com filtros e a paginação', async () => {
    const get = jest.fn().mockResolvedValue({ data: [], pagination: { limit: 20, next_cursor: 'c2' } });
    const api = createExercisesApi({ get } as unknown as ApiClient);

    const page = await api.list({ query: ' supino ', groupId: 'g1', equipmentId: 'e1', cursor: 'c1' });

    expect(get).toHaveBeenCalledWith('/exercicios', { query: { q: 'supino', grupo_id: 'g1', equipamento_id: 'e1', limit: 20, cursor: 'c1' } });
    expect(page.next).toBe('c2');
    await api.list();
    expect(get).toHaveBeenLastCalledWith('/exercicios', { query: { q: undefined, grupo_id: undefined, equipamento_id: undefined, limit: 20, cursor: undefined } });
  });
});

describe('LibraryScreen', () => {
  it('lista os exercícios com equipamento e grupo e abre o detalhe', async () => {
    await show(<LibraryScreen api={fakeApi()} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Supino reto com barra. Barra · Peito' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/exercicios/[uuid]', params: { uuid: 'ex-1' } });
  });

  it('busca depois de digitar e filtra por grupo e equipamento', async () => {
    const api = fakeApi();
    await show(<LibraryScreen api={api} />);
    await screen.findByText('Puxada na frente');

    await fireEvent.changeText(screen.getByLabelText('Buscar exercício'), 'puxada');
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ query: 'puxada', groupId: null, equipmentId: null }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Costas' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ query: 'puxada', groupId: 'g-costas', equipmentId: null }));
    await fireEvent.press(screen.getByRole('button', { name: 'Halteres' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ query: 'puxada', groupId: 'g-costas', equipmentId: 'eq-halter' }));
    expect(screen.getByRole('button', { name: 'Costas', selected: true })).toBeTruthy();
  });

  it('sem resultado explica e limpa a busca e os filtros', async () => {
    const list = jest.fn().mockResolvedValueOnce({ items: [summary('ex-1', 'Supino')], next: null }).mockResolvedValue({ items: [], next: null });
    await show(<LibraryScreen api={fakeApi({ list })} />);
    await screen.findByText('Supino');

    await fireEvent.press(screen.getByRole('button', { name: 'Costas' }));
    expect(await screen.findByText('Nenhum exercício encontrado')).toBeTruthy();
    expect(screen.getByText('Tente outro nome ou tire algum filtro.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Limpar busca e filtros' }));

    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ query: '', groupId: null, equipmentId: null }));
  });

  it('carrega mais quando há próxima página', async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce({ items: [summary('ex-1', 'Supino')], next: 'c2' })
      .mockResolvedValueOnce({ items: [summary('ex-2', 'Remada')], next: null });
    await show(<LibraryScreen api={fakeApi({ list })} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByText('Remada')).toBeTruthy();
    expect(screen.getByText('Supino')).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith({ query: '', groupId: null, equipmentId: null, cursor: 'c2' });
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('falha ao carregar avisa e tenta de novo; filtros que não carregam não impedem a lista', async () => {
    const list = jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })).mockResolvedValue({ items: [summary('ex-1', 'Supino')], next: null });
    const api = fakeApi({ list, muscleGroups: jest.fn().mockRejectedValue(new Error('x')), equipment: jest.fn().mockRejectedValue(new Error('x')) });
    await show(<LibraryScreen api={api} />);

    expect(await screen.findByText('Não foi possível carregar os exercícios agora. Verifique a conexão.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Supino')).toBeTruthy();
  });
});

describe('ExerciseDetailScreen', () => {
  it('mostra tags, passos numerados, cuidados, músculos e alternativas', async () => {
    await show(<ExerciseDetailScreen api={fakeApi()} />);

    expect(await screen.findByText('Supino reto com barra')).toBeTruthy();
    expect(screen.getByText('Barra · Carga e repetições · Intermediário')).toBeTruthy();
    expect(screen.getByText('1. Deite no banco.')).toBeTruthy();
    expect(screen.getByText('2. Desça a barra até o peito.')).toBeTruthy();
    expect(screen.getByText('3. Empurre para cima.')).toBeTruthy();
    expect(screen.getByText('Use um parceiro de segurança com cargas altas.')).toBeTruthy();
    expect(screen.getByText('Principais: Peitoral maior')).toBeTruthy();
    expect(screen.getByText('Secundários: Tríceps')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Supino reto com halteres' }));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/exercicios/[uuid]', params: { uuid: 'ex-3' } });
  });

  it('sem mídia aprovada: aviso de demonstração indisponível e as instruções continuam (UX-10)', async () => {
    await show(<ExerciseDetailScreen api={fakeApi()} />);

    expect(await screen.findByText('Este exercício ainda não tem demonstração em vídeo ou imagem. Siga as instruções abaixo.')).toBeTruthy();
    expect(screen.getByText('1. Deite no banco.')).toBeTruthy();
  });

  it('com imagem aprovada mostra a imagem e a versão revisada; se ela não carregar, volta ao texto', async () => {
    const withImage = detail({ midias: [{ id: 'i', tipo: 'imagem', versao: '2', status: 'aprovado', url: 'https://exemplo.invalid/supino.png' }] });
    await show(<ExerciseDetailScreen api={fakeApi({ get: jest.fn().mockResolvedValue(withImage) })} />);

    const image = await screen.findByLabelText('Demonstração de Supino reto com barra');
    expect(screen.getByText('Demonstração revisada · versão 2')).toBeTruthy();
    await fireEvent(image, 'error');

    expect(await screen.findByText('Não foi possível mostrar a demonstração agora. Siga as instruções abaixo.')).toBeTruthy();
    expect(screen.getByText('1. Deite no banco.')).toBeTruthy();
  });

  it('vídeo aprovado sem player: avisa que ainda não abre e segue com o texto', async () => {
    const withVideo = detail({ midias: [{ id: 'v', tipo: 'video_capi', versao: '1', status: 'aprovado', url: 'https://exemplo.invalid/v.mp4' }] });
    await show(<ExerciseDetailScreen api={fakeApi({ get: jest.fn().mockResolvedValue(withVideo) })} />);

    expect(await screen.findByText('Há um vídeo de demonstração deste exercício, mas ele ainda não abre neste app. Siga as instruções abaixo.')).toBeTruthy();
  });

  it('sem instruções, sem cuidados e sem alternativas: textos honestos, sem seções vazias', async () => {
    const bare = detail({ instrucoes: null, observacoes_seguranca: null, musculos: [] });
    await show(<ExerciseDetailScreen api={fakeApi({ get: jest.fn().mockResolvedValue(bare), alternatives: jest.fn().mockResolvedValue([]) })} />);

    expect(await screen.findByText('As instruções deste exercício ainda estão em revisão.')).toBeTruthy();
    expect(screen.getByText('Este exercício ainda não tem alternativas cadastradas.')).toBeTruthy();
    expect(screen.queryByText('Cuidados')).toBeNull();
    expect(screen.queryByText('Músculos trabalhados')).toBeNull();
  });

  it('falha nas alternativas não impede ver o exercício', async () => {
    await show(<ExerciseDetailScreen api={fakeApi({ alternatives: jest.fn().mockRejectedValue(new Error('x')) })} />);

    expect(await screen.findByText('Supino reto com barra')).toBeTruthy();
    expect(screen.getByText('Este exercício ainda não tem alternativas cadastradas.')).toBeTruthy();
  });

  it('falha ao carregar o exercício avisa, tenta de novo e volta', async () => {
    const get = jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })).mockResolvedValue(detail());
    await show(<ExerciseDetailScreen api={fakeApi({ get })} />);

    expect(await screen.findByText('Não foi possível carregar o exercício agora. Verifique a conexão.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockRouter.back).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Supino reto com barra')).toBeTruthy();
  });

  it('exibe a unilateralidade nas tags', async () => {
    await show(<ExerciseDetailScreen api={fakeApi({ get: jest.fn().mockResolvedValue(detail({ unilateral: true, dificuldade: null })) })} />);

    expect(await screen.findByText('Barra · Carga e repetições · Unilateral')).toBeTruthy();
  });
});

describe('ExerciseSearch com detalhes', () => {
  it('cada item ganha "Detalhes" sem atrapalhar a escolha', async () => {
    const onSelect = jest.fn();
    const onDetails = jest.fn();
    const items = [summary('ex-1', 'Supino reto com barra')];
    await show(<ExerciseSearch search={jest.fn().mockResolvedValue(items)} onSelect={onSelect} onDetails={onDetails} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Ver detalhes de Supino reto com barra' }));
    expect(onDetails).toHaveBeenCalledWith(items[0]);
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Supino reto com barra' }));
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  it('sem onDetails o botão não aparece', async () => {
    await show(<ExerciseSearch search={jest.fn().mockResolvedValue([summary('ex-1', 'Supino')])} onSelect={jest.fn()} />);

    await screen.findByText('Supino');
    expect(screen.queryByRole('button', { name: /Ver detalhes/ })).toBeNull();
  });
});
