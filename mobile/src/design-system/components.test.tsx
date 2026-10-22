import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { Button } from './Button';
import { CheckField } from './CheckField';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { NumberField } from './NumberField';
import { Notice } from './Notice';
import { TextField } from './TextField';
import { ThemeProvider } from './ThemeProvider';

function wrap(node: React.ReactElement) {
  return render(<ThemeProvider initialPreference="dark">{node}</ThemeProvider>);
}

describe('Button', () => {
  it('dispara o toque e expõe papel e rótulo de botão', async () => {
    const onPress = jest.fn();
    await wrap(<Button label="Entrar" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignora o toque quando desabilitado ou carregando e anuncia o estado ocupado', async () => {
    const onPress = jest.fn();
    await wrap(
      <>
        <Button label="Desabilitado" onPress={onPress} disabled />
        <Button label="Carregando" onPress={onPress} loading />
      </>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Desabilitado' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Carregando' }));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Carregando' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });
});

describe('TextField', () => {
  function Controlled({ error }: { error?: string }) {
    const [value, setValue] = useState('');
    return <TextField label="Senha" value={value} onChangeText={setValue} secret error={error} />;
  }

  it('oculta a senha e alterna Mostrar/Ocultar com rótulo acessível', async () => {
    await wrap(<Controlled />);
    const input = screen.getByLabelText('Senha');
    expect(input.props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar senha' }));

    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toBeTruthy();
  });

  it('mostra o erro com o prefixo textual, sem depender só da cor', async () => {
    await wrap(<Controlled error="Mínimo de 10 caracteres." />);

    expect(screen.getByText('Erro: Mínimo de 10 caracteres.')).toBeTruthy();
  });

  it('repassa o texto digitado', async () => {
    const onChange = jest.fn();
    await wrap(<TextField label="E-mail" value="" onChangeText={onChange} />);

    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'a@b.co');

    expect(onChange).toHaveBeenCalledWith('a@b.co');
  });
});

describe('CheckField e Notice', () => {
  it('alterna a caixa e anuncia o estado marcado', async () => {
    const onChange = jest.fn();
    await wrap(<CheckField label="Aceito os termos" checked={false} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Aceito os termos' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('mostra o erro da caixa com prefixo textual', async () => {
    await wrap(<CheckField label="Aceito os termos" checked={false} onChange={jest.fn()} error="Obrigatório." />);

    expect(screen.getByText('Erro: Obrigatório.')).toBeTruthy();
  });

  it('o aviso tem papel de alerta e título textual por tipo', async () => {
    await wrap(<Notice kind="error" message="Sem conexão." />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Algo deu errado')).toBeTruthy();
    expect(screen.getByText('Sem conexão.')).toBeTruthy();
  });
});

describe('NumberField, ConfirmDialog e EmptyState', () => {
  it('campo numérico usa teclado decimal para carga e numérico para repetições', async () => {
    await wrap(
      <>
        <NumberField label="Carga" value="40" onChangeText={jest.fn()} kind="decimal" />
        <NumberField label="Reps" value="10" onChangeText={jest.fn()} />
      </>,
    );

    expect(screen.getByLabelText('Carga').props.keyboardType).toBe('decimal-pad');
    expect(screen.getByLabelText('Reps').props.keyboardType).toBe('number-pad');
  });

  it('campo bloqueado (série concluída) não aceita edição', async () => {
    await wrap(<NumberField label="Reps" value="10" onChangeText={jest.fn()} editable={false} />);

    expect(screen.getByLabelText('Reps').props.editable).toBe(false);
  });

  it('diálogo mostra título e efeito, e separa cancelar de confirmar', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await wrap(<ConfirmDialog visible title="Excluir?" message="Isso não pode ser desfeito." confirmLabel="Excluir" destructive onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText('Isso não pode ser desfeito.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Excluir' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('diálogo fechado não mostra nada', async () => {
    await wrap(<ConfirmDialog visible={false} title="Excluir?" message="x" confirmLabel="Excluir" onConfirm={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.queryByText('Excluir?')).toBeNull();
  });

  it('estado vazio mostra a frase e uma única ação', async () => {
    const onAction = jest.fn();
    await wrap(<EmptyState title="Nada aqui" message="Comece adicionando." actionLabel="Adicionar" onAction={onAction} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Nada aqui. Comece adicionando.')).toBeTruthy();
  });
});
