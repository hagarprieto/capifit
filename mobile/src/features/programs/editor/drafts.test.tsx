import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createDraftStore, type DraftStore } from '@/data/cache/editorDrafts';
import { createCacheRepo } from '@/data/local/cacheRepo';
import { createMemoryDb } from '@/data/local/memoryDb';
import { migrate } from '@/data/local/migrations';
import { ThemeProvider } from '@/design-system/ThemeProvider';

import type { Program, ProgramVersion, ProgramsApi } from '../programsApi';
import { ProgramEditorProvider } from './ProgramEditorProvider';
import { ProgramEditorScreen } from './ProgramEditorScreen';

let mockKey = 0;
jest.mock('@/lib/uuid', () => ({ newUuid: () => `k-${++mockKey}` }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ uuid: 'p-1' }) }));
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ api: {} }) }));
let mockDrafts: DraftStore | null = null;
jest.mock('@/data/LocalDataProvider', () => ({ useLocalData: () => ({ drafts: mockDrafts }) }));

const program: Program = { id: 'p-1', titulo: 'Meu plano', objetivo: null, origem: 'usuario', status: 'rascunho', autor: { id: 'u', nome: 'Ana', papeis: ['aluno'] }, versao_atual: null, versao_rascunho: 1 };
const version = (revision = 1, numero = 1): ProgramVersion => ({ numero, estado: 'rascunho', revision, fichas: [] }) as unknown as ProgramVersion;

function fakeApi(over: Partial<ProgramsApi> = {}): ProgramsApi {
  return {
    get: jest.fn().mockResolvedValue(program),
    version: jest.fn().mockResolvedValue(version()),
    createVersion: jest.fn().mockResolvedValue(version(1, 2)),
    saveStructure: jest.fn().mockImplementation(async (_u: string, numero: number, revision: number) => version(revision + 1, numero)),
    rename: jest.fn().mockResolvedValue(program),
    publish: jest.fn(),
    ...over,
  } as unknown as ProgramsApi;
}

const stored = (over: Record<string, unknown> = {}) => ({
  programId: 'p-1',
  versionNumber: 1,
  baseRevision: 1,
  editor: { fichas: [{ key: 'f-rascunho', titulo: 'Treino do rascunho', items: [] }] },
  meta: { titulo: 'Plano alterado', objetivo: '' },
  savedAt: '2026-10-22T14:05:00.000Z',
  ...over,
});

let db: ReturnType<typeof createMemoryDb>;

beforeEach(async () => {
  jest.clearAllMocks();
  mockKey = 0;
  db = createMemoryDb();
  await migrate(db);
  mockDrafts = createDraftStore(createCacheRepo(db, 'user-ana'));
});

afterEach(() => db.close());

const show = (api: ProgramsApi) =>
  render(
    <ThemeProvider initialPreference="dark">
      <ProgramEditorProvider programId="p-1" api={api}>
        <ProgramEditorScreen />
      </ProgramEditorProvider>
    </ThemeProvider>,
  );

/** Espera o autosave (500 ms) gravar no banco. */
async function settle() {
  // O autosave só grava no banco local (nenhum estado de tela muda), então não precisa de act().
  await new Promise((resolve) => setTimeout(resolve, 700));
}

describe('rascunho local do editor (E06-07, D-03, UX-17)', () => {
  it('guarda no aparelho o que foi montado e ainda não foi salvo', async () => {
    await show(fakeApi());
    await screen.findByText('Tudo salvo');

    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));
    expect(screen.getByText('Alterações não salvas no servidor — guardadas neste aparelho.')).toBeTruthy();
    await settle();

    const draft = await mockDrafts!.get('p-1');
    expect(draft).toMatchObject({ programId: 'p-1', versionNumber: 1, baseRevision: 1 });
    expect(draft?.editor.fichas.map((f) => f.titulo)).toEqual(['Treino A']);
  });

  it('ao reabrir, recupera o rascunho do mesmo ponto do servidor e avisa de quando é', async () => {
    await mockDrafts!.save(stored());

    await show(fakeApi());

    expect(await screen.findByText(/Recuperamos suas alterações não salvas, guardadas neste aparelho em \d\d\/\d\d \d\d:\d\d\./)).toBeTruthy();
    expect(screen.getByText('Treino do rascunho')).toBeTruthy();
    expect(screen.getByLabelText('Nome do programa').props.value).toBe('Plano alterado');
    expect(screen.getByText('Alterações não salvas no servidor — guardadas neste aparelho.')).toBeTruthy();
  });

  it('salvar no servidor apaga o rascunho e tira o aviso', async () => {
    await mockDrafts!.save(stored());
    const api = fakeApi();
    await show(api);
    await screen.findByText('Treino do rascunho');

    await fireEvent.press(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(api.saveStructure).toHaveBeenCalledWith('p-1', 1, 1, expect.any(Array)));
    expect(await screen.findByText('Tudo salvo')).toBeTruthy();
    expect(screen.queryByText(/Recuperamos suas alterações/)).toBeNull();
    await settle();
    expect(await mockDrafts!.get('p-1')).toBeNull();
  });

  it('descartar as alterações pede confirmação, apaga o rascunho e volta à versão do servidor', async () => {
    await mockDrafts!.save(stored());
    await show(fakeApi());
    await screen.findByText('Treino do rascunho');

    await fireEvent.press(screen.getByRole('button', { name: 'Descartar alterações' }));
    expect(screen.getByText('Descartar as alterações?')).toBeTruthy();
    expect(await mockDrafts!.get('p-1')).not.toBeNull(); // nada some antes da confirmação
    const buttons = screen.getAllByRole('button', { name: 'Descartar alterações' });
    await fireEvent.press(buttons[buttons.length - 1]);

    await waitFor(() => expect(screen.queryByText('Treino do rascunho')).toBeNull());
    expect(await screen.findByText('Tudo salvo')).toBeTruthy();
    expect(await mockDrafts!.get('p-1')).toBeNull();
  });

  it('rascunho igual ao servidor é apagado em silêncio', async () => {
    await mockDrafts!.save(stored({ editor: { fichas: [] }, meta: { titulo: 'Meu plano', objetivo: '' } }));

    await show(fakeApi());
    await screen.findByText('Tudo salvo');

    expect(screen.queryByText(/Recuperamos/)).toBeNull();
    await waitFor(async () => expect(await mockDrafts!.get('p-1')).toBeNull());
  });

  it('se o programa mudou no servidor depois do rascunho, NÃO aplica sozinho: pergunta', async () => {
    await mockDrafts!.save(stored({ baseRevision: 1 }));
    const api = fakeApi({ version: jest.fn().mockResolvedValue(version(5)) }); // alterado em outro lugar

    await show(api);

    expect(await screen.findByText('Rascunho antigo neste aparelho')).toBeTruthy();
    expect(screen.getByText(/mas o programa mudou depois disso/)).toBeTruthy();
    expect(screen.queryByText('Treino do rascunho')).toBeNull(); // o servidor continua valendo
    expect(screen.getByText('Tudo salvo')).toBeTruthy();
    await settle();
    expect(await mockDrafts!.get('p-1')).not.toBeNull(); // e o rascunho não foi apagado por baixo dos panos
  });

  it('rascunho antigo: "Usar meu rascunho" aplica por cima, e salvar usa a revisão atual do servidor', async () => {
    await mockDrafts!.save(stored({ baseRevision: 1 }));
    const api = fakeApi({ version: jest.fn().mockResolvedValue(version(5)) });
    await show(api);

    await fireEvent.press(await screen.findByRole('button', { name: 'Usar meu rascunho' }));
    expect(await screen.findByText('Treino do rascunho')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(api.saveStructure).toHaveBeenCalledWith('p-1', 1, 5, expect.any(Array)));
  });

  it('rascunho antigo: "Descartar rascunho" apaga e fica com o servidor', async () => {
    await mockDrafts!.save(stored({ baseRevision: 1 }));
    await show(fakeApi({ version: jest.fn().mockResolvedValue(version(5)) }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Descartar rascunho' }));

    await waitFor(() => expect(screen.queryByText('Rascunho antigo neste aparelho')).toBeNull());
    expect(await mockDrafts!.get('p-1')).toBeNull();
  });

  it('rascunho de outra versão do programa também pergunta', async () => {
    await mockDrafts!.save(stored({ versionNumber: 1, baseRevision: 1 }));

    await show(fakeApi({ get: jest.fn().mockResolvedValue({ ...program, versao_rascunho: 2 }), version: jest.fn().mockResolvedValue(version(1, 2)) }));

    expect(await screen.findByText('Rascunho antigo neste aparelho')).toBeTruthy();
  });

  it('sair com alterações explica que elas ficam guardadas no aparelho', async () => {
    await show(fakeApi());
    await screen.findByText('Tudo salvo');
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.getByText('Sair do editor?')).toBeTruthy();
    expect(screen.getByText(/Elas ficam guardadas neste aparelho e voltam quando você abrir o editor deste programa de novo\./)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Sair e guardar rascunho' }));
    expect(mockRouter.replace).toHaveBeenCalled();
  });

  it('sair do editor logo após mexer (antes da espera do autosave) não perde a última alteração', async () => {
    const view = await show(fakeApi());
    await screen.findByText('Tudo salvo');
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));

    view.unmount();
    await settle();

    expect((await mockDrafts!.get('p-1'))?.editor.fichas).toHaveLength(1);
  });

  it('sem banco local (nenhum lugar para guardar) o editor funciona como antes e avisa do descarte', async () => {
    mockDrafts = null;
    await show(fakeApi());
    await screen.findByText('Tudo salvo');
    await fireEvent.press(screen.getByRole('button', { name: '+ Ficha' }));

    expect(screen.getByText('Alterações não salvas')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByText('Sair sem salvar?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Descartar alterações' })).toBeNull();
  });
});
