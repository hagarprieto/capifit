// Gera src/api/schema.generated.ts a partir de docs/07_openapi.yaml (contrato único da API).
// Uso: node scripts/generate-api-types.js           -> escreve o arquivo
//      node scripts/generate-api-types.js --check   -> falha se o arquivo estiver desatualizado (CI)
// O gerador roda via npx com versão fixa: o pacote exige TypeScript 5 e o app usa 6, então ele não entra nas dependências.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = '7.13.0';
const source = path.resolve(__dirname, '../../docs/07_openapi.yaml');
const target = path.resolve(__dirname, '../src/api/schema.generated.ts');
const check = process.argv.includes('--check');
const output = check ? path.join(os.tmpdir(), `capifit-api-types-${process.pid}.ts`) : target;

const run = spawnSync('npx', ['--yes', `openapi-typescript@${VERSION}`, source, '-o', output], { stdio: 'inherit', shell: true });
if (run.status !== 0) {
  console.error('Falha ao gerar os tipos da API.');
  process.exit(1);
}
if (check) {
  const normalize = (text) => text.replace(/\r\n/g, '\n');
  const fresh = normalize(fs.readFileSync(output, 'utf8'));
  fs.unlinkSync(output);
  const current = fs.existsSync(target) ? normalize(fs.readFileSync(target, 'utf8')) : '';
  if (fresh !== current) {
    console.error('src/api/schema.generated.ts está desatualizado: rode `npm run api:types` e commite.');
    process.exit(1);
  }
  console.log('Tipos da API em dia com docs/07_openapi.yaml.');
}
