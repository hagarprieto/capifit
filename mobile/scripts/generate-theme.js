// Gera src/design-system/tokens.generated.ts a partir de docs/08_design_tokens.json (fonte única do design).
// Uso: node scripts/generate-theme.js           -> escreve o arquivo
//      node scripts/generate-theme.js --check   -> falha se o arquivo estiver desatualizado (CI)
const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '../../docs/08_design_tokens.json');
const target = path.resolve(__dirname, '../src/design-system/tokens.generated.ts');
const tokens = JSON.parse(fs.readFileSync(source, 'utf8'));

// "bg.primary" -> { bg: { primary } }
function nest(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let node = out;
    parts.slice(0, -1).forEach((p) => {
      node[p] = node[p] ?? {};
      node = node[p];
    });
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

// O tema claro tem `brand.text` (verde escuro legível sobre fundo claro); no escuro o próprio
// `brand.primary` já é legível como texto (13,4:1), então ele é o valor equivalente.
const dark = { ...tokens.color.dark };
const light = { ...tokens.color.light };
for (const key of Object.keys(light)) {
  if (!(key in dark)) {
    if (key !== 'brand.text') throw new Error(`Token só existe no tema claro: ${key}`);
    dark[key] = dark['brand.primary'];
  }
}
for (const key of Object.keys(dark)) {
  if (!(key in light)) throw new Error(`Token só existe no tema escuro: ${key}`);
}

const data = {
  version: tokens.version,
  color: { dark: nest(dark), light: nest(light) },
  typography: tokens.typography,
  space: tokens.space,
  radius: tokens.radius,
  size: nest(tokens.size),
  motion: { duration: tokens.motion.duration, easing: tokens.motion.easing },
};

const output = `// GERADO por scripts/generate-theme.js a partir de docs/08_design_tokens.json (v${tokens.version}).
// Não edite à mão: altere o JSON e rode \`npm run tokens\`.
export const tokens = ${JSON.stringify(data, null, 2)} as const;
`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== output) {
    console.error('tokens.generated.ts está desatualizado. Rode: npm run tokens');
    process.exit(1);
  }
  console.log('Tokens em dia.');
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output, 'utf8');
  console.log(`Gerado: ${path.relative(process.cwd(), target)}`);
}
