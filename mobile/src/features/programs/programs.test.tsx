import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import { OriginBadge } from '@/design-system/OriginBadge';
import { ThemeProvider } from '@/design-system/ThemeProvider';
import { WorkoutCard } from '@/design-system/WorkoutCard';

import { formatDate, groupPrograms } from './grouping';
import { NewProgramScreen } from './NewProgramScreen';
import { ProgramDetailScreen } from './ProgramDetailScreen';
import { ProgramsScreen } from './ProgramsScreen';
import type { ActiveProgram, Program, ProgramVersion, ProgramsApi } from './programsApi';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = { uuid: 'p-1' };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
}));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: {} }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));

const program = (id: string, over: Partial<Program> = {}): Program => ({
  id,
  titulo: `Programa ${id}`,
  objetivo: null,
  origem: 'usuario',
  status: 'publicado',
  autor: { id: 'u', nome: 'Ana', papeis: ['aluno'] },
  versao_atual: 2,
  versao_rascunho: null,
  criado_em: '2026-10-01T12:00:00.000Z',
  atualizado_em: '2026-10-20T12:00:00.000Z',
  ...over,
});

const version = (numero: number, estado: 'rascunho' | 'publicado' = 'publicado'): ProgramVersion =>
  ({
    numero,
    estado,
    revision: 1,
    fichas: [
      {
        id: 'f1',
        codigo: 'A',
        titulo: 'Treino A',
        ordem: 1,
        exercicios: [{ id: 'i1', exercicio: { id: 'e1', nome: 'Supino reto' }, ordem: 1, series: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] }],
      },
      { id: 'f2', codigo: 'B', titulo: 'Treino B', ordem: 2, exercicios: [] },
    ],
  }) as unknown as ProgramVersion;

function fakeApi(over: Partial<ProgramsApi> = {}): ProgramsApi {
  return {
    list: jest.fn().mockResolvedValue([]),
    active: jest.fn().mockResolvedValue(null),
    get: jest.fn().mockResolvedValue(program('p-1')),
    version: jest.fn().mockResolvedValue(version(2)),
    create: jest.fn().mockResolvedValue(program('p-novo', { status: 'rascunho', versao_atual: null })),
    activate: jest.fn().mockResolvedValue({ programa_id: 'p-1', versao_numero: 2, ativado_em: '2026-10-22T12:00:00.000Z' }),
    archive: jest.fn().mockResolvedValue(program('p-1', { status: 'arquivado' })),
    copy: jest.fn().mockResolvedValue(program('p-copia', { titulo: 'Cópia de Programa p-1', status: 'rascunho', versao_atual: null, derivado_de: 'p-1' })),
    ...over,
  } as ProgramsApi;
}

function show(node: React.ReactElement) {
  return render(<ThemeProvider initialPreference="dark">{node}</ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { uuid: 'p-1' };
});

describe('groupPrograms e formatDate', () => {
  it('põe o ativo primeiro, depois os demais publicados, e separa rascunhos e arquivados (mais recente primeiro)', () => {
    const a = program('a', { atualizado_em: '2026-10-10T00:00:00.000Z' });
    const b = program('b', { atualizado_em: '2026-10-15T00:00:00.000Z' });
    const c = program('c', { atualizado_em: '2026-10-12T00:00:00.000Z' });
    const draft1 = program('d1', { status: 'rascunho', atualizado_em: '2026-10-01T00:00:00.000Z' });
    const draft2 = program('d2', { status: 'rascunho', atualizado_em: '2026-10-05T00:00:00.000Z' });
    const old = program('x', { status: 'arquivado' });

    const groups = groupPrograms([a, b, c, draft1, draft2, old], 'a');

    expect(groups.ativo.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(groups.rascunhos.map((p) => p.id)).toEqual(['d2', 'd1']);
    expect(groups.arquivados.map((p) => p.id)).toEqual(['x']);
  });

  it('sem programa ativo, os publicados seguem por data', () => {
    const groups = groupPrograms([program('a', { atualizado_em: '2026-10-01T00:00:00.000Z' }), program('b', { atualizado_em: '2026-10-09T00:00:00.000Z' })], null);

    expect(groups.ativo.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('formata a data em dd/mm/aaaa e tolera valor ausente ou inválido', () => {
    expect(formatDate('2026-10-22T15:30:00.000Z')).toMatch(/^2[12]\/10\/2026$/);
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('não é data')).toBe('');
  });
});

describe('OriginBadge e WorkoutCard', () => {
  it('cada origem tem ícone, texto e rótulo falado próprios (nunca só a cor)', async () => {
    await show(
      <>
        <OriginBadge origin="usuario" />
        <OriginBadge origin="coach" authorName="Carla" />
        <OriginBadge origin="app" />
      </>,
    );

    expect(screen.getByLabelText('Criado por você')).toBeTruthy();
    expect(screen.getByLabelText('Prescrito por Carla')).toBeTruthy();
    expect(screen.getByLabelText('Sugerido pelo CapiFit')).toBeTruthy();
    expect(screen.getByText('●', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('▲', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('★', { includeHiddenElements: true })).toBeTruthy();
  });

  it('o cartão é um botão único que lê a origem antes do título', async () => {
    const onPress = jest.fn();
    await show(<WorkoutCard title="Hipertrofia" origin="coach" authorName="Carla" detail="versão 2 · atualizado em 20/10/2026" tags={['Treino A', 'Treino B']} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Prescrito por Carla. Hipertrofia. versão 2 · atualizado em 20/10/2026' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Treino B')).toBeTruthy();
  });
});

describe('ProgramsScreen', () => {
  const active: ActiveProgram = { programa: program('a', { titulo: 'Hipertrofia', origem: 'coach', autor: { id: 'c', nome: 'Carla', papeis: ['coach'] } }), versao: version(2), ativado_em: '2026-10-20T12:00:00.000Z' };
  const list = [active.programa, program('b', { titulo: 'Full body' }), program('d', { titulo: 'Rascunho ABC', status: 'rascunho', versao_atual: null, versao_rascunho: 1 }), program('x', { titulo: 'Antigo', status: 'arquivado' })];

  it('mostra o ativo com origem, "Em uso" e as fichas, e os demais publicados depois', async () => {
    await show(<ProgramsScreen api={fakeApi({ list: jest.fn().mockResolvedValue(list), active: jest.fn().mockResolvedValue(active) })} />);

    expect(await screen.findByText('Hipertrofia')).toBeTruthy();
    expect(screen.getByLabelText('Prescrito por Carla')).toBeTruthy();
    expect(screen.getByText('Em uso')).toBeTruthy();
    expect(screen.getByText('Treino A')).toBeTruthy();
    expect(screen.getByText('Full body')).toBeTruthy();
    expect(screen.queryByText('Rascunho ABC')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Ativo (2)' }).props.accessibilityState.selected).toBe(true);
  });

  it('as abas trocam a lista e mostram a contagem', async () => {
    await show(<ProgramsScreen api={fakeApi({ list: jest.fn().mockResolvedValue(list), active: jest.fn().mockResolvedValue(active) })} />);
    await screen.findByText('Hipertrofia');

    await fireEvent.press(screen.getByRole('tab', { name: 'Rascunhos (1)' }));
    expect(screen.getByText('Rascunho ABC')).toBeTruthy();
    expect(screen.getByText(/^rascunho · atualizado em/)).toBeTruthy();
    expect(screen.queryByText('Hipertrofia')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: 'Arquivados (1)' }));
    expect(screen.getByText('Antigo')).toBeTruthy();
  });

  it('tocar no cartão abre o detalhe e o botão cria um programa', async () => {
    await show(<ProgramsScreen api={fakeApi({ list: jest.fn().mockResolvedValue(list), active: jest.fn().mockResolvedValue(active) })} />);
    await screen.findByText('Hipertrofia');

    await fireEvent.press(screen.getByRole('button', { name: /Full body/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Criar programa' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/programas/[uuid]', params: { uuid: 'b' } });
    expect(mockRouter.push).toHaveBeenCalledWith('/programas/novo');
  });

  it('sem nenhum programa mostra o estado vazio da aba com a ação de criar', async () => {
    await show(<ProgramsScreen api={fakeApi()} />);

    expect(await screen.findByText('Nenhum programa ativo')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Criar programa' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/programas/novo');

    await fireEvent.press(screen.getByRole('tab', { name: 'Arquivados (0)' }));
    expect(screen.getByText('Nenhum programa arquivado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Criar programa' })).toBeNull();
  });

  it('erro de rede avisa e permite tentar de novo', async () => {
    const listFn = jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })).mockResolvedValueOnce(list);
    await show(<ProgramsScreen api={fakeApi({ list: listFn, active: jest.fn().mockResolvedValue(active) })} />);

    expect(await screen.findByText('Não foi possível carregar seus programas. Verifique a conexão e tente de novo.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Hipertrofia')).toBeTruthy();
  });
});

describe('NewProgramScreen', () => {
  it('valida o nome antes de enviar', async () => {
    const api = fakeApi();
    await show(<NewProgramScreen api={api} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Criar programa' }));

    expect(api.create).not.toHaveBeenCalled();
    expect(screen.getByText('Erro: Informe um nome de até 180 caracteres.')).toBeTruthy();
  });

  it('cria com a chave de idempotência da tela e abre o detalhe do novo programa', async () => {
    const api = fakeApi();
    await show(<NewProgramScreen api={api} />);

    await fireEvent.changeText(screen.getByLabelText('Nome do programa'), 'Meu plano');
    await fireEvent.changeText(screen.getByLabelText('Objetivo (opcional)'), 'Hipertrofia');
    await fireEvent.press(screen.getByRole('button', { name: 'Criar programa' }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith('Meu plano', 'Hipertrofia', '00000000-0000-4000-8000-000000000001'));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/programas/[uuid]', params: { uuid: 'p-novo' } });
  });

  it('falha de rede mantém o formulário e avisa; tentar de novo reusa a mesma chave', async () => {
    const create = jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })).mockResolvedValueOnce(program('p-novo'));
    await show(<NewProgramScreen api={fakeApi({ create })} />);
    await fireEvent.changeText(screen.getByLabelText('Nome do programa'), 'Meu plano');

    await fireEvent.press(screen.getByRole('button', { name: 'Criar programa' }));
    expect(await screen.findByText('Sem conexão. Verifique a internet e tente de novo.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Criar programa' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0][2]).toBe(create.mock.calls[1][2]);
  });

  it('erro de validação do servidor aparece no campo', async () => {
    const create = jest.fn().mockRejectedValue(new ApiError({ status: 422, code: 'VALIDATION_ERROR', message: '', fields: { titulo: ['Deve ter entre 1 e 180 caracteres.'] } }));
    await show(<NewProgramScreen api={fakeApi({ create })} />);
    await fireEvent.changeText(screen.getByLabelText('Nome do programa'), 'x');

    await fireEvent.press(screen.getByRole('button', { name: 'Criar programa' }));

    expect(await screen.findByText('Erro: Deve ter entre 1 e 180 caracteres.')).toBeTruthy();
  });
});

describe('ProgramDetailScreen', () => {
  it('mostra origem, título, versão e as fichas com os exercícios', async () => {
    await show(<ProgramDetailScreen api={fakeApi({ get: jest.fn().mockResolvedValue(program('p-1', { titulo: 'Hipertrofia', objetivo: 'Ganhar massa' })) })} />);

    expect(await screen.findByText('Hipertrofia')).toBeTruthy();
    expect(screen.getByText('Ganhar massa')).toBeTruthy();
    expect(screen.getByText('Versão 2 · publicada')).toBeTruthy();
    expect(screen.getByText('Treino A')).toBeTruthy();
    expect(screen.getByText('Supino reto · 3 séries')).toBeTruthy();
  });

  it('programa recém-criado mostra o rascunho vazio', async () => {
    const api = fakeApi({
      get: jest.fn().mockResolvedValue(program('p-1', { status: 'rascunho', versao_atual: null, versao_rascunho: 1 })),
      version: jest.fn().mockResolvedValue({ ...version(1, 'rascunho'), fichas: [] }),
    });
    await show(<ProgramDetailScreen api={api} />);

    expect(await screen.findByText('Este programa ainda não tem fichas.')).toBeTruthy();
    expect(screen.getByText('Versão 1 · rascunho')).toBeTruthy();
    expect(api.version).toHaveBeenCalledWith('p-1', 1);
  });

  it('erro mostra aviso e permite voltar', async () => {
    await show(<ProgramDetailScreen api={fakeApi({ get: jest.fn().mockRejectedValue(new ApiError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: '' })) })} />);

    expect(await screen.findByText('Não foi possível carregar este programa. Verifique a conexão e tente de novo.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('ativar, trocar e arquivar (E06-08)', () => {
  const current: ActiveProgram = { programa: program('atual', { titulo: 'Programa atual' }), versao: version(1), ativado_em: '2026-10-01T12:00:00.000Z' };

  it('sem programa em uso, ativa a versão vigente direto e confirma o resultado', async () => {
    const api = fakeApi();
    await show(<ProgramDetailScreen api={api} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Ativar este programa' }));

    await waitFor(() => expect(api.activate).toHaveBeenCalledWith('p-1', 2));
    expect(await screen.findByText('Programa ativado. Ele agora é o programa em uso.')).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2); // recarregou o detalhe
  });

  it('com outro programa em uso, pergunta antes de trocar e diz que o atual continua guardado', async () => {
    const api = fakeApi({ active: jest.fn().mockResolvedValue(current) });
    await show(<ProgramDetailScreen api={api} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Trocar para este programa' }));
    expect(screen.getByText(/Hoje você usa "Programa atual"/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.activate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Trocar para este programa' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Trocar' }));

    await waitFor(() => expect(api.activate).toHaveBeenCalledWith('p-1', 2));
  });

  it('o programa que já está em uso mostra o aviso e não oferece ativar de novo', async () => {
    const api = fakeApi({ active: jest.fn().mockResolvedValue({ ...current, programa: program('p-1') }) });
    await show(<ProgramDetailScreen api={api} />);

    expect(await screen.findByText('Este é o programa em uso.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ativar este programa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trocar para este programa' })).toBeNull();
  });

  it('rascunho não ativa: orienta a publicar uma versão', async () => {
    const api = fakeApi({ get: jest.fn().mockResolvedValue(program('p-1', { status: 'rascunho', versao_atual: null, versao_rascunho: 1 })), version: jest.fn().mockResolvedValue(version(1, 'rascunho')) });
    await show(<ProgramDetailScreen api={api} />);

    expect(await screen.findByText('Para ativar, publique uma versão no editor.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ativar este programa' })).toBeNull();
  });

  it('arquivar pede confirmação, explica que o histórico fica, e volta para a lista', async () => {
    const api = fakeApi();
    await show(<ProgramDetailScreen api={api} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Arquivar programa' }));
    expect(screen.getByText(/Os treinos já feitos continuam no histórico/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.archive).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Arquivar programa' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Arquivar' }));

    await waitFor(() => expect(api.archive).toHaveBeenCalledWith('p-1'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/programas'));
  });

  it('arquivar o programa em uso avisa que ficará sem programa ativo', async () => {
    const api = fakeApi({ active: jest.fn().mockResolvedValue({ ...current, programa: program('p-1') }) });
    await show(<ProgramDetailScreen api={api} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Arquivar programa' }));

    expect(screen.getByText(/ao arquivar, você fica sem programa ativo/)).toBeTruthy();
  });

  it('programa arquivado não tem ações, só o aviso', async () => {
    const api = fakeApi({ get: jest.fn().mockResolvedValue(program('p-1', { status: 'arquivado' })) });
    await show(<ProgramDetailScreen api={api} />);

    expect(await screen.findByText('Programa arquivado: fica guardado com o histórico, sem ações.')).toBeTruthy();
    for (const name of ['Ativar este programa', 'Editar programa', 'Arquivar programa']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('programa do coach pode ser ativado, mas não editado', async () => {
    const api = fakeApi({ get: jest.fn().mockResolvedValue(program('p-1', { origem: 'coach', autor: { id: 'c', nome: 'Carla', papeis: ['coach'] } })) });
    await show(<ProgramDetailScreen api={api} />);

    expect(await screen.findByRole('button', { name: 'Ativar este programa' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar programa' })).toBeNull();
  });

  it('falha ao ativar mostra o motivo (rede ou genérico) sem fechar a tela', async () => {
    const network = fakeApi({ activate: jest.fn().mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })) });
    await show(<ProgramDetailScreen api={network} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Ativar este programa' }));
    expect(await screen.findByText('Sem conexão. Verifique a internet e tente de novo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ativar este programa' })).toBeTruthy();
  });

  it('falha ao arquivar avisa e permanece no detalhe', async () => {
    const api = fakeApi({ archive: jest.fn().mockRejectedValue(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: '' })) });
    await show(<ProgramDetailScreen api={api} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Arquivar programa' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Arquivar' }));

    expect(await screen.findByText('Não foi possível concluir agora. Tente de novo.')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('cópia de programa (E06-09)', () => {
  it('pede confirmação explicando que o original não muda e abre a cópia criada', async () => {
    const api = fakeApi();
    await show(<ProgramDetailScreen api={api} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Criar cópia' }));
    expect(screen.getByText('Criar uma cópia?')).toBeTruthy();
    expect(screen.getByText('Cria um programa novo, seu, com as mesmas fichas e exercícios, para você editar. O original não muda.')).toBeTruthy();
    expect(api.copy).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole('button', { name: 'Criar cópia' });
    await fireEvent.press(buttons[buttons.length - 1]);

    await waitFor(() => expect(api.copy).toHaveBeenCalledWith('p-1'));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/programas/[uuid]', params: { uuid: 'p-copia' } });
  });

  it('cancelar não cria nada', async () => {
    const api = fakeApi();
    await show(<ProgramDetailScreen api={api} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Criar cópia' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(api.copy).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('programa do coach não edita: explica e a cópia é o caminho principal', async () => {
    const coach = program('p-1', { origem: 'coach', autor: { id: 'c', nome: 'Marcos', papeis: ['coach'] } });
    await show(<ProgramDetailScreen api={fakeApi({ get: jest.fn().mockResolvedValue(coach) })} />);

    expect(await screen.findByText('Este programa foi prescrito por Marcos e não pode ser editado. Crie uma cópia sua para personalizar; o original continua como está.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Criar minha cópia para editar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar programa' })).toBeNull();
  });

  it('falha de rede e erro genérico avisam e deixam tentar de novo', async () => {
    const network = fakeApi({ copy: jest.fn().mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' })) });
    await show(<ProgramDetailScreen api={network} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Criar cópia' }));
    const buttons = screen.getAllByRole('button', { name: 'Criar cópia' });
    await fireEvent.press(buttons[buttons.length - 1]);

    expect(await screen.findByText('Sem conexão. Verifique a internet e tente de novo.')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Criar cópia' })).toBeTruthy();
  });

  it('a API manda o POST de cópia com chave de idempotência', async () => {
    const post = jest.fn().mockResolvedValue({ data: { id: 'p-copia' } });
    const { createProgramsApi } = jest.requireActual('./programsApi') as typeof import('./programsApi');

    await createProgramsApi({ post } as never).copy('p-1');

    expect(post).toHaveBeenCalledWith('/programas/p-1/copiar', undefined, { idempotencyKey: true });
  });
});
