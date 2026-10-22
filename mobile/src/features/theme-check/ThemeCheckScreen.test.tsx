import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system/ThemeProvider';

import { ThemeCheckScreen } from './ThemeCheckScreen';

function renderScreen(initial: 'system' | 'light' | 'dark' = 'dark') {
  return render(
    <ThemeProvider initialPreference={initial}>
      <ThemeCheckScreen />
    </ThemeProvider>,
  );
}

describe('ThemeCheckScreen', () => {
  it('mostra títulos, tema atual e versão dos tokens a partir do catálogo de textos', async () => {
    await renderScreen('dark');

    expect(screen.getByText('Verificação do tema')).toBeTruthy();
    expect(screen.getByText('Tema em uso: escuro · Tokens v0.2.0')).toBeTruthy();
    expect(screen.getByText('bg.primary')).toBeTruthy();
    expect(screen.getAllByText('#0D1117').length).toBeGreaterThan(0);
  });

  it('alterna para o tema claro ao tocar na opção', async () => {
    await renderScreen('dark');

    await fireEvent.press(screen.getByLabelText('Usar tema claro'));

    expect(screen.getByText('Tema em uso: claro · Tokens v0.2.0')).toBeTruthy();
    expect(screen.getAllByText('#F6F8FA').length).toBeGreaterThan(0);
  });

  it('expõe as opções de tema como botões de rádio acessíveis, com estado selecionado', async () => {
    await renderScreen('light');

    const claro = screen.getByLabelText('Usar tema claro');
    expect(claro.props.accessibilityRole).toBe('radio');
    expect(claro.props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('Usar tema escuro').props.accessibilityState).toEqual({ selected: false });
  });
});
