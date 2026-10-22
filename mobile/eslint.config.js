// ESLint (flat config). Além do conjunto do Expo, impõe duas regras do projeto:
//  - DS-02: nenhuma cor literal fora dos tokens (use o tema);
//  - Doc 03 §13.3: nenhum texto fixo no JSX (use o catálogo de strings, t()).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*', 'node_modules/*'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/design-system/tokens.generated.ts', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message: 'Cor literal não é permitida: use os tokens do tema (DS-02).',
        },
        {
          selector: 'Literal[value=/^(rgb|rgba|hsl|hsla)\\(/]',
          message: 'Cor literal não é permitida: use os tokens do tema (DS-02).',
        },
        {
          selector: 'JSXText[value=/\\S/]',
          message: 'Texto fixo na interface deve vir do catálogo de strings: use t().',
        },
      ],
    },
  },
]);
