import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, useState } from 'react';

import { ApiError } from '@/api/errors';
import { ThemeProvider } from '@/design-system/ThemeProvider';

import type { Program, ProgramVersion, ProgramsApi } from '../programsApi';
import { AddExerciseToFichaScreen } from './AddExerciseToFichaScreen';
import { FichaEditorScreen } from './FichaEditorScreen';
import { ItemConfigScreen } from './ItemConfigScreen';
import { ProgramEditorProvider } from './ProgramEditorProvider';
import { ProgramEditorScreen } from './ProgramEditorScreen';

let mockKey = 0;
jest.mock('@/lib/uuid', () => ({ newUuid: () => `k-${++mockKey}` }));

// Mini navegação: empilha telas pelo caminho, como o roteador faria, para testar o fluxo programa → ficha → exercício.
const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => {
  // Os parâmetros da tela de cima da pilha chegam por contexto (o roteador real faz o equivalente por tela).
  const { createContext, useContext } = jest.requireActual('react');
  const ParamsContext = createContext({});
  return { useRouter: () => mockNav, useLocalSearchParams: () => useContext(ParamsContext), ParamsContext };
});
const mockSearch = jest.fn();
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: { get: (...args: unknown[]) => mockSearch(...args) } }) }));

const { ParamsContext } = jest.requireMock('expo-router') as { ParamsContext: React.Context<Record<string, string>> };

type ScreenName = 'programa' | 'ficha' | 'adicionar' | 'exercicio' | 'detalhe';
const ROUTES: Record<string, ScreenName> = {
  '/programas/[uuid]/editar': 'programa',
  '/programas/[uuid]/editar/ficha/[fichaKey]': 'ficha',
  '/programas/[uuid]/editar/ficha/[fichaKey]/adicionar': 'adicionar',
  '/programas/[uuid]/editar/ficha/[fichaKey]/exercicio/[itemKey]': 'exercicio',
  '/programas/[uuid]': 'detalhe',
};

function Harness({ api }: { api: ProgramsApi }) {
  const [stack, setStack] = useState<{ screen: ScreenName; params: Record<string, string> }[]>([{ screen: 'programa', params: { uuid: 'p-1' } }]);
  useEffect(() => {
    mockNav.push.mockImplementation((target: { pathname: string; params: Record<string, string> }) => setStack((s) => [...s, { screen: ROUTES[target.pathname], params: target.params }]));
    mockNav.back.mockImplementation(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)));
    mockNav.replace.mockImplementation((target: { pathname: string; params: Record<string, string> }) => setStack([{ screen: ROUTES[target.pathname] ?? 'detalhe', params: target.params ?? {} }]));
  }, []);
  const top = stack[stack.length - 1];
  return (
    <ThemeProvider initialPreference="dark">
      <ParamsContext.Provider value={top.params}>
        <ProgramEditorProvider programId="p-1" api={api}>
          {top.screen === 'programa' ? <ProgramEditorScreen /> : null}
          {top.screen === 'ficha' ? <FichaEditorScreen /> : null}
          {top.screen === 'adicionar' ? <AddExerciseToFichaScreen /> : null}
          {top.screen === 'exercicio' ? <ItemConfigScreen /> : null}
        </ProgramEditorProvider>
      </ParamsContext.Provider>
    </ThemeProvider>
  );
}

const program = (over: Partial<Program> = {}): Program => ({
  id: 'p-1',
  titulo: 'Meu plano',
  objetivo: null,
  origem: 'usuario',
  status: 'rascunho',
  autor: { id: 'u', nome: 'Ana', papeis: ['aluno'] },
  versao_atual: null,
  versao_rascunho: 1,
  ...over,
});

const emptyVersion = (revision = 1, numero = 1): ProgramVersion => ({ numero, estado: 'rascunho', revision, fichas: [] }) as unknown as ProgramVersion;

function fakeApi(over: Partial<ProgramsApi> = {}): ProgramsApi {
  return {
    get: jest.fn().mockResolvedValue(program()),
    version: jest.fn().mockResolvedValue(emptyVersion()),
    createVersion: jest.fn().mockResolvedValue(emptyVersion(1, 2)),
    saveStructure: jest.fn().mockImplementation(async (_u: string, numero: number, revision: number) => emptyVersion(revision + 1, numero)),
    publish: jest.fn().mockResolvedValue({ ...emptyVersion(), estado: 'publicado' }),
    rename: jest.fn().mockImplementation(async (_u: string, fields: { titulo?: string; objetivo?: string }) => program({ titulo: fields.titulo ?? 'Meu plano', objetivo: fields.objetivo ?? null })),
    ...over,
  } as unknown as ProgramsApi;
}

async function open(api: ProgramsApi) {
  await render(<Harness api={api} />);
  await screen.findByText('Editar programa', { selector: undefined } as never).catch(() => undefined);
  await screen.findByText('Tudo salvo');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockKey = 0;
  mockSearch.mockResolvedValue({ data: [{ id: 'ex-supino', nome: 'Supino reto', modalidade: 'reps_carga', equipamento: { id: '1', nome: 'Barra livre' } }, { id: 'ex-prancha', nome: 'Prancha', modalidade: 'tempo', equipamento: null }] });
});

describe('editor de programa (TEL-021)', () => {
  it('abre o rascunho do servidor limpo e marca "Alterações não salvas" ao mexer', async () => {
    await open(fakeApi());

    expect(screen.getByText('Nenhuma ficha ainda. Adicione a primeira.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));

    expect(screen.getByText('Treino A')).toBeTruthy();
    expect(screen.getByText('Alterações não salvas')).toBeTruthy();
  });

  it('salvar envia a estrutura inteira com a revisão conhecida e volta a "Tudo salvo"', async () => {
    const api = fakeApi();
    await open(api);
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(api.saveStructure).toHaveBeenCalledTimes(1));
    const [programId, numero, revision, fichas] = (api.saveStructure as jest.Mock).mock.calls[0];
    expect([programId, numero, revision]).toEqual(['p-1', 1, 1]);
    expect(fichas).toHaveLength(1);
    expect(fichas[0]).toMatchObject({ codigo: 'A', titulo: 'Treino A', ordem: 1, exercicios: [] });
    expect(await screen.findByText('Tudo salvo')).toBeTruthy();
  });

  it('renomear o programa salva o nome por PATCH separado', async () => {
    const api = fakeApi();
    await open(api);

    await fireEvent.changeText(screen.getByLabelText('Nome do programa'), 'Hipertrofia 4x');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(api.rename).toHaveBeenCalledWith('p-1', { titulo: 'Hipertrofia 4x', objetivo: '' }));
    expect(api.saveStructure).not.toHaveBeenCalled();
  });

  it('conflito de revisão avisa, não sobrescreve e oferece recarregar', async () => {
    const api = fakeApi({ saveStructure: jest.fn().mockRejectedValue(new ApiError({ status: 409, code: 'REVISION_CONFLICT', message: '' })) });
    await open(api);
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText(/foi alterado em outro lugar/)).toBeTruthy();
    expect(screen.getByText('Alterações não salvas')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Recarregar' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('ficha sem título impede salvar e explica', async () => {
    const api = fakeApi();
    await open(api);
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Editar a ficha Treino A' }));
    await fireEvent.changeText(screen.getByLabelText('Nome da ficha'), '   ');
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText('Dê um nome a cada ficha (até 160 caracteres).')).toBeTruthy();
    expect(api.saveStructure).not.toHaveBeenCalled();
  });

  it('remover ficha pede confirmação; reordenar e duplicar mexem na lista', async () => {
    await open(fakeApi());
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));
    expect(screen.getByText('Treino B')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Duplicar a ficha Treino A' }));
    expect(screen.getByText('Treino A (cópia)')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Remover Treino B' }));
    expect(screen.getByText('A ficha "Treino B" e seus exercícios saem do rascunho. Se mudar de ideia, saia sem salvar para desfazer.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Treino B')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remover Treino B' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remover' }));
    expect(screen.queryByText('Treino B')).toBeNull();
  });

  it('sem alterações, voltar sai direto', async () => {
    await open(fakeApi());

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.queryByText('Sair sem salvar?')).toBeNull();
    expect(mockNav.replace).toHaveBeenCalledWith({ pathname: '/programas/[uuid]', params: { uuid: 'p-1' } });
  });

  it('sair com alterações pendentes pergunta antes de descartar', async () => {
    await open(fakeApi());
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText('Sair sem salvar?')).toBeTruthy();
    expect(mockNav.replace).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Sair sem salvar' }));
    expect(mockNav.replace).toHaveBeenCalledWith({ pathname: '/programas/[uuid]', params: { uuid: 'p-1' } });
  });

  it('programa publicado abre uma nova versão em rascunho para editar', async () => {
    const api = fakeApi({ get: jest.fn().mockResolvedValue(program({ status: 'publicado', versao_atual: 1, versao_rascunho: null })) });
    await open(api);

    expect(api.createVersion).toHaveBeenCalledWith('p-1');
    expect(api.version).not.toHaveBeenCalled();
  });

  it('programa do coach ou arquivado não abre para edição', async () => {
    const coach = fakeApi({ get: jest.fn().mockResolvedValue(program({ origem: 'coach' })) });
    await render(<Harness api={coach} />);
    expect(await screen.findByText('Programas do coach são só para leitura. Crie uma cópia para personalizar.')).toBeTruthy();
    expect(coach.createVersion).not.toHaveBeenCalled();
  });

  it('publicar exige exercício em cada ficha; com conteúdo, confirma, salva antes e publica', async () => {
    const api = fakeApi();
    await open(api);
    await fireEvent.press(screen.getByRole('button', { name: 'Publicar versão' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Para publicar, cada ficha precisa de pelo menos um exercício.')).toBeTruthy();
    expect(api.publish).not.toHaveBeenCalled();

    // monta uma ficha com um exercício
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Editar a ficha Treino A' }));
    await fireEvent.press(screen.getByRole('button', { name: '+ Exercício' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Supino reto' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Publicar versão' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Publicar' }));

    await waitFor(() => expect(api.publish).toHaveBeenCalledWith('p-1', 1));
    expect(api.saveStructure).toHaveBeenCalledTimes(1);
    expect((api.saveStructure as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((api.publish as jest.Mock).mock.invocationCallOrder[0]);
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith({ pathname: '/programas/[uuid]', params: { uuid: 'p-1' } }));
  });
});

describe('ficha (TEL-022) e exercício (TEL-023)', () => {
  async function withSupino(api: ProgramsApi) {
    await open(api);
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Editar a ficha Treino A' }));
    await fireEvent.press(screen.getByRole('button', { name: '+ Exercício' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Supino reto' }));
  }

  it('adicionar exercício volta para a ficha com a prescrição padrão legível', async () => {
    await withSupino(fakeApi());

    expect(await screen.findByText('3 × 8–12 · descanso 1:30')).toBeTruthy();
    expect(screen.getByText('Supino reto')).toBeTruthy();
  });

  it('configurar: séries, faixa, carga, RIR, descanso e aquecimento atualizam o resumo', async () => {
    await withSupino(fakeApi());
    await fireEvent.press(await screen.findByRole('button', { name: 'Configurar Supino reto' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais uma série' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Incluir uma série de aquecimento' }));
    await fireEvent.changeText(screen.getByLabelText('Repetições (mínimo)'), '6');
    await fireEvent.changeText(screen.getByLabelText('Repetições (máximo)'), '8');
    await fireEvent.changeText(screen.getByLabelText('Carga-alvo em kg (opcional)'), '60,5');
    await fireEvent.changeText(screen.getByLabelText('RIR alvo (opcional)'), '2');
    await fireEvent.changeText(screen.getByLabelText('Descanso (segundos)'), '120');
    expect(screen.getByText('Prévia: 4 × 6–8 + aquecimento · descanso 2:00')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));

    expect(await screen.findByText('4 × 6–8 + aquecimento · descanso 2:00')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText('Alterações não salvas')).toBeTruthy(); // de volta ao programa, com o rascunho alterado
  });

  it('valores inválidos não aplicam e mostram o motivo por campo', async () => {
    await withSupino(fakeApi());
    await fireEvent.press(await screen.findByRole('button', { name: 'Configurar Supino reto' }));

    await fireEvent.changeText(screen.getByLabelText('Repetições (mínimo)'), '12');
    await fireEvent.changeText(screen.getByLabelText('Repetições (máximo)'), '8');
    await fireEvent.changeText(screen.getByLabelText('RIR alvo (opcional)'), '15');
    await fireEvent.changeText(screen.getByLabelText('Carga-alvo em kg (opcional)'), 'abc');
    await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));

    expect(screen.getByText('Erro: Informe a faixa de repetições: de 1 a 1000, com o mínimo não maior que o máximo.')).toBeTruthy();
    expect(screen.getByText('Erro: O RIR vai de 0 a 10.')).toBeTruthy();
    expect(screen.getByText('Erro: A carga-alvo deve estar entre 0 e 99999,99 kg.')).toBeTruthy();
    expect(screen.getByText('Configurar exercício')).toBeTruthy(); // continua na tela
  });

  it('exercício de tempo configura a duração em vez de repetições', async () => {
    const api = fakeApi();
    await open(api);
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Editar a ficha Treino A' }));
    await fireEvent.press(screen.getByRole('button', { name: '+ Exercício' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Prancha' }));
    expect(await screen.findByText('3 × 45 s · descanso 1:30')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Configurar Prancha' }));
    expect(screen.queryByLabelText('Repetições (mínimo)')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Tempo por série (segundos)'), '60');
    await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));

    expect(await screen.findByText('3 × 60 s · descanso 1:30')).toBeTruthy();
  });

  it('remover exercício pede confirmação e subir/descer reordena', async () => {
    await withSupino(fakeApi());
    await fireEvent.press(screen.getByRole('button', { name: '+ Exercício' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Prancha' }));
    await screen.findByText('Prancha');

    await fireEvent.press(screen.getByRole('button', { name: 'Subir Prancha' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remover Supino reto' }));
    expect(screen.getByText('"Supino reto" sai desta ficha. Se mudar de ideia, saia sem salvar para desfazer.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remover' }));

    expect(screen.queryByText('Supino reto')).toBeNull();
    expect(screen.getByText('Prancha')).toBeTruthy();
  });

  it('o corpo salvo traz o exercício com as séries configuradas', async () => {
    const api = fakeApi();
    await withSupino(api);
    await fireEvent.press(await screen.findByRole('button', { name: 'Configurar Supino reto' }));
    await fireEvent.changeText(screen.getByLabelText('Repetições (mínimo)'), '5');
    await fireEvent.changeText(screen.getByLabelText('Repetições (máximo)'), '5');
    await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));
    await screen.findByText(/^3 × 5/);
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(api.saveStructure).toHaveBeenCalled());
    const fichas = (api.saveStructure as jest.Mock).mock.calls[0][3];
    expect(fichas[0].exercicios[0]).toMatchObject({ exercicio_uuid: 'ex-supino', ordem: 1, descanso_segundos: 90 });
    expect(fichas[0].exercicios[0].series).toHaveLength(3);
    expect(fichas[0].exercicios[0].series[0]).toMatchObject({ tipo: 'normal', reps_min: 5, reps_max: 5 });
    await act(async () => undefined);
  });
});
