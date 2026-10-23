import { fireEvent, render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';

import { ThemeProvider } from './ThemeProvider';
import { ErrorState, LoadingState, OfflineState, PermissionState } from './States';

const show = (node: React.ReactElement) => render(<ThemeProvider initialPreference="dark">{node}</ThemeProvider>);

describe('estados padrão (Doc 03 §9.1)', () => {
  it('carregando: mostra o texto (anunciado com educação) e esconde o indicador do leitor de tela', async () => {
    await show(<LoadingState message="Carregando seus treinos…" />);

    const text = screen.getByText('Carregando seus treinos…');
    expect(text.props.accessibilityLiveRegion).toBe('polite');
  });

  it('erro: mensagem clara e tentar de novo', async () => {
    const onRetry = jest.fn();
    await show(<ErrorState message="Não foi possível carregar." onRetry={onRetry} />);

    expect(screen.getByText('Não foi possível carregar.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('erro: rótulo próprio, aviso em vez de erro e botão principal quando é a tela inteira', async () => {
    const onRetry = jest.fn();
    await show(<ErrorState kind="warning" primary retryLabel="Recarregar" message="Alterado em outro lugar." onRetry={onRetry} />);

    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('offline: diz que são os últimos dados e quantos registros esperam envio', async () => {
    await show(<OfflineState message="Sem conexão." savedAt="22/10 14:05" waiting={3} />);

    expect(screen.getByText('Sem conexão. Dados salvos em 22/10 14:05. 3 registro(s) aguardando envio.')).toBeTruthy();
  });

  it('offline: só a mensagem quando não há mais nada a dizer', async () => {
    await show(<OfflineState message="Sem conexão." />);

    expect(screen.getByText('Sem conexão.')).toBeTruthy();
  });

  it('sem permissão: explica e oferece o que é permitido', async () => {
    const onAction = jest.fn();
    await show(<PermissionState message="Este programa é do seu coach." actionLabel="Criar minha cópia" onAction={onAction} />);

    expect(screen.getByText('Este programa é do seu coach.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Criar minha cópia' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('sem permissão e sem alternativa: só a explicação', async () => {
    await show(<PermissionState message="Sem acesso." />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

/** Padroniza de verdade: nenhuma tela volta a montar o seu próprio "carregando" ou "erro + tentar de novo". */
describe('as telas usam os estados padrão', () => {
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return sources(full);
      }
      return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [full] : [];
    });
  }
  const files = sources(path.resolve(__dirname, '../features')).map((file) => [path.relative(path.resolve(__dirname, '..'), file), fs.readFileSync(file, 'utf8')] as const);

  it.each(files)('%s não monta "carregando" na mão', (_name, source) => {
    expect(source).not.toMatch(/<Text color="secondary" accessibilityLiveRegion="polite">\s*\{t\('[a-zA-Z.]+\.carregando'\)\}/);
  });

  it.each(files)('%s não monta "erro + tentar de novo" na mão', (_name, source) => {
    expect(source).not.toMatch(/<Notice kind="(error|warning)" message=\{t\('[a-zA-Z.]+'\)\} \/>\s*<Button label=\{t\('treino\.tentarDeNovo'\)\}/);
  });
});
