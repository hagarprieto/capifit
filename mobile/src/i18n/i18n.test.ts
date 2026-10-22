import { t, type MessageKey } from './index';

describe('t()', () => {
  it('devolve o texto do catálogo', () => {
    expect(t('app.nome')).toBe('CapiFit');
  });

  it('substitui parâmetros', () => {
    expect(t('themeCheck.versaoTokens', { versao: '0.2.0' })).toBe('Tokens v0.2.0');
  });

  it('mantém o marcador quando o parâmetro não é informado', () => {
    expect(t('themeCheck.versaoTokens')).toBe('Tokens v{versao}');
    expect(t('themeCheck.versaoTokens', {})).toBe('Tokens v{versao}');
  });

  it('chave inexistente devolve a própria chave (nunca quebra a tela)', () => {
    expect(t('nao.existe' as MessageKey)).toBe('nao.existe');
  });
});
