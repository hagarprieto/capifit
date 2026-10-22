import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { Button } from './Button';
import { CheckField } from './CheckField';
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
