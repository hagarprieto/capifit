import fs from 'node:fs';
import path from 'node:path';

import { flattenTokens, fontFamilyFor, getTheme, resolveScheme } from './theme';
import { tokens } from './tokens.generated';

const source = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../docs/08_design_tokens.json'), 'utf8'));

describe('resolveScheme', () => {
  it('segue o sistema quando a preferência é "system"', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('usa claro quando o sistema não informa o esquema', () => {
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });

  it('a escolha manual vence o sistema', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});

describe('tokens gerados', () => {
  it('contêm todas as cores de docs/08_design_tokens.json nos dois temas', () => {
    for (const scheme of ['dark', 'light'] as const) {
      const generated = Object.fromEntries(flattenTokens(tokens.color[scheme]));
      for (const [key, value] of Object.entries(source.color[scheme])) {
        expect(generated[key]).toBe(value);
      }
    }
  });

  it('os dois temas têm exatamente as mesmas chaves', () => {
    const dark = flattenTokens(tokens.color.dark).map(([key]) => key).sort();
    const light = flattenTokens(tokens.color.light).map(([key]) => key).sort();
    expect(dark).toEqual(light);
  });

  it('brand.text no tema escuro usa o verde da marca (legível sobre fundo escuro)', () => {
    expect(tokens.color.dark.brand.text).toBe(tokens.color.dark.brand.primary);
    expect(tokens.color.light.brand.text).toBe('#2E6414');
  });

  it('mantém espaçamento em múltiplos de 4 e alvos de toque mínimos do Doc 08', () => {
    expect(tokens.space.every((value) => value % 4 === 0)).toBe(true);
    expect(tokens.size.touchMin.ios).toBeGreaterThanOrEqual(44);
    expect(tokens.size.touchMin.android).toBeGreaterThanOrEqual(48);
    expect(tokens.typography.maxFontScale).toBe(2);
  });
});

describe('getTheme', () => {
  it('devolve o conjunto de cores do esquema pedido', () => {
    expect(getTheme('dark').colors.bg.primary).toBe('#0D1117');
    expect(getTheme('light').colors.bg.primary).toBe('#F6F8FA');
    expect(getTheme('dark').scheme).toBe('dark');
  });
});

describe('fontFamilyFor', () => {
  it('mapeia os pesos da escala para as famílias da Inter', () => {
    expect(fontFamilyFor(400)).toBe('Inter_400Regular');
    expect(fontFamilyFor(500)).toBe('Inter_500Medium');
    expect(fontFamilyFor(600)).toBe('Inter_600SemiBold');
    expect(fontFamilyFor(700)).toBe('Inter_700Bold');
  });

  it('todo peso usado na escala tem família definida', () => {
    for (const { weight } of Object.values(tokens.typography.scale)) {
      expect([400, 500, 600, 700]).toContain(weight);
    }
  });
});
