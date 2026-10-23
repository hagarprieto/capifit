import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Text } from './Text';
import { ThemeProvider } from './ThemeProvider';

const wrap = (node: React.ReactElement) => <ThemeProvider initialPreference="dark">{node}</ThemeProvider>;
const variantOf = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style).fontVariant;

/**
 * Achado na validação em aparelho: ao fim do descanso, o cartão troca o relógio (Text tabular) pela mensagem de fim (Text
 * comum) NA MESMA posição. Com `fontVariant: undefined`, a atualização nativa manda `null` e o React Native quebra em
 * `processFontVariant` ("Cannot read property 'split' of null"). Os testes simulam a tela, não o nativo; por isso o
 * contrato fica aqui: o valor nunca pode sumir.
 */
describe('Text e fontVariant', () => {
  it('texto numérico usa algarismos de largura fixa', async () => {
    await render(wrap(<Text variant="numeric">12</Text>));

    expect(variantOf('12')).toEqual(['tabular-nums']);
  });

  it('texto comum NÃO deixa o fontVariant indefinido (sempre uma lista)', async () => {
    await render(wrap(<Text>Olá</Text>));

    expect(variantOf('Olá')).toEqual(['proportional-nums']);
  });

  it('a mesma instância trocando de tabular para comum continua com uma lista, sem undefined', async () => {
    const { rerender } = await render(wrap(<Text variant="display" tabular>01:30</Text>));
    expect(variantOf('01:30')).toEqual(['tabular-nums']);

    await rerender(wrap(<Text variant="body" tabular={false}>01:30</Text>));

    expect(variantOf('01:30')).toEqual(['proportional-nums']);
    expect(variantOf('01:30')).not.toBeUndefined();
  });
});
