// Prova que as regras de lint do projeto reprovam o código proibido (DS-02 e catálogo de strings) e aceitam o correto.
// Roda em Node puro (o ESLint não carrega a configuração dentro do ambiente do Jest). Uso: npm run lint:rules
const path = require('path');
const { ESLint } = require('eslint');

const eslint = new ESLint({ cwd: path.resolve(__dirname, '..') });
const file = path.resolve(__dirname, '../src/features/exemplo/Exemplo.tsx');

const cases = [
  { nome: 'reprova cor hexadecimal literal', code: "export const cor = '#94F047';\n", espera: 'DS-02' },
  { nome: 'reprova cor rgb() literal', code: "export const cor = 'rgb(0, 0, 0)';\n", espera: 'DS-02' },
  {
    nome: 'reprova texto fixo no JSX',
    code: "import { Text } from 'react-native';\nexport const A = () => <Text>Olá</Text>;\n",
    espera: 'catálogo de strings',
  },
  {
    nome: 'aceita texto do catálogo e cor vinda do tema',
    code: [
      "import { Text } from 'react-native';",
      "import { t } from '@/i18n';",
      'export const A = ({ cor }: { cor: string }) => <Text style={{ color: cor }}>{t("app.nome")}</Text>;',
      '',
    ].join('\n'),
    espera: null,
  },
];

(async () => {
  let falhas = 0;
  for (const { nome, code, espera } of cases) {
    const [result] = await eslint.lintText(code, { filePath: file });
    const proibidas = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);
    const ok = espera === null ? proibidas.length === 0 : proibidas.some((m) => m.includes(espera));
    console.log(`${ok ? 'OK   ' : 'FALHA'} ${nome}`);
    if (!ok) falhas++;
  }
  if (falhas) {
    console.error(`${falhas} caso(s) falharam`);
    process.exit(1);
  }
})();
