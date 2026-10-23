import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system/ThemeProvider';
import type { WorkoutApi } from '@/features/workout/workoutApi';

import { AppTabBar } from './AppTabBar';
import { ProfileScreen } from './ProfileScreen';
import { ProgressScreen } from './ProgressScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockPathname = '/';
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}));

const mockAuth = { user: { id: 'u1', nome: 'Ana' }, signOut: jest.fn(), api: {} };
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Início' },
  { key: 'programas-1', name: 'programas', title: 'Treinos' },
  { key: 'evolucao-1', name: 'evolucao', title: 'Evolução' },
  { key: 'perfil-1', name: 'perfil', title: 'Perfil' },
];

function bar(options: { index?: number; api: Partial<WorkoutApi>; emitter?: { emit: jest.Mock }; navigateToTab?: jest.Mock }) {
  const emitter = options.emitter ?? { emit: jest.fn().mockReturnValue({ defaultPrevented: false }) };
  const navigateToTab = options.navigateToTab ?? jest.fn();
  const props = {
    state: { index: options.index ?? 0, routes: ROUTES.map(({ key, name }) => ({ key, name })) },
    descriptors: Object.fromEntries(ROUTES.map((r) => [r.key, { options: { title: r.title } }])),
    emitter,
    navigateToTab,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  return {
    emitter,
    navigateToTab,
    node: (
      <ThemeProvider initialPreference="dark">
        <AppTabBar {...(props as unknown as React.ComponentProps<typeof AppTabBar>)} api={options.api as WorkoutApi} />
      </ThemeProvider>
    ),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/';
});

describe('AppTabBar', () => {
  it('mostra as quatro abas com a ativa selecionada', async () => {
    await render(bar({ index: 1, api: { openSessionSummary: jest.fn().mockResolvedValue(null) } }).node);

    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual(['Início', 'Treinos', 'Evolução', 'Perfil']);
    expect(screen.getByRole('tab', { name: 'Treinos', selected: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Voltar ao treino' })).toBeNull();
  });

  it('tocar em outra aba navega; tocar na ativa não faz nada', async () => {
    const { node, emitter, navigateToTab } = bar({ api: { openSessionSummary: jest.fn().mockResolvedValue(null) } });
    await render(node);

    await fireEvent.press(screen.getByRole('tab', { name: 'Perfil' }));
    expect(emitter.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'tabPress', target: 'perfil-1' }));
    expect(navigateToTab).toHaveBeenCalledWith('perfil-1');

    navigateToTab.mockClear();
    await fireEvent.press(screen.getByRole('tab', { name: 'Início' }));
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it('respeita quando a navegação é impedida pelo evento', async () => {
    const { node, navigateToTab } = bar({
      api: { openSessionSummary: jest.fn().mockResolvedValue(null) },
      emitter: { emit: jest.fn().mockReturnValue({ defaultPrevented: true }) },
    });
    await render(node);

    await fireEvent.press(screen.getByRole('tab', { name: 'Treinos' }));

    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it('com treino em andamento oferece voltar ao treino em qualquer aba', async () => {
    const open = { id: 'sessao-aberta', status: 'em_andamento' };
    await render(bar({ index: 3, api: { openSessionSummary: jest.fn().mockResolvedValue(open) } }).node);

    await fireEvent.press(await screen.findByRole('button', { name: 'Voltar ao treino' }));

    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/treino/[uuid]', params: { uuid: 'sessao-aberta' } });
  });

  it('consulta de novo quando a rota muda (voltou do treino) e esconde o atalho se acabou', async () => {
    const summary = jest.fn().mockResolvedValueOnce({ id: 'sessao-aberta' }).mockResolvedValue(null);
    const api = { openSessionSummary: summary };
    const { rerender } = await render(bar({ api }).node);
    await screen.findByRole('button', { name: 'Voltar ao treino' });

    mockPathname = '/programas';
    await rerender(bar({ api }).node);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Voltar ao treino' })).toBeNull());
    expect(summary).toHaveBeenCalledTimes(2);
  });

  it('falha na consulta não mostra o atalho nem quebra a barra', async () => {
    await render(bar({ api: { openSessionSummary: jest.fn().mockRejectedValue(new Error('rede')) } }).node);

    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Voltar ao treino' })).toBeNull();
  });
});

describe('abas Perfil e Evolução', () => {
  it('Perfil mostra o nome, abre a verificação do tema e sai', async () => {
    await render(
      <ThemeProvider initialPreference="dark">
        <ProfileScreen />
      </ThemeProvider>,
    );

    expect(screen.getByText('Ana')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Verificação do tema' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/tema');
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('Evolução explica que o histórico ainda vem', async () => {
    await render(
      <ThemeProvider initialPreference="dark">
        <ProgressScreen />
      </ThemeProvider>,
    );

    expect(screen.getByText('Sua evolução aparece aqui')).toBeTruthy();
  });
});
