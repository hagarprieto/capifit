// Valida docs/07_openapi.yaml: lint + invariantes de contrato dos Documentos 05–07.
// Uso: cd tools/contract && npm install && npm run validate
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { lint, loadConfig } = require('@redocly/openapi-core');

const FILE = path.resolve(__dirname, '../../docs/07_openapi.yaml');
const spec = yaml.load(fs.readFileSync(FILE, 'utf8'));
const falhas = [];
const falha = (m) => falhas.push(m);

const METODOS = ['get', 'post', 'put', 'patch', 'delete'];
const ops = [];
for (const [p, item] of Object.entries(spec.paths)) {
  for (const m of METODOS) if (item[m]) ops.push({ p, m, o: item[m] });
}

// Operações que exigem Idempotency-Key (Doc 05 §3 e Doc 06 §8).
const IDEMPOTENTES = new Set([
  'post /me/programas', 'post /me/sessoes', 'post /me/sessoes/{uuid}/concluir',
  'post /programas/{uuid}/versoes', 'post /programas/{uuid}/versoes/{numero}/publicar',
  'post /programas/{uuid}/copiar', 'post /me/sugestoes', 'post /coach/convites',
  'post /coach/alunos/{aluno_uuid}/programas',
]);

// Rotas exigidas pela matriz TEL→API (Doc 06 §9). Falha se alguma sumir do contrato.
const OBRIGATORIAS = [
  'post /auth/login', 'post /auth/refresh', 'post /auth/register', 'get /me', 'put /me/perfil-treinamento',
  'get /me/programa-ativo', 'get /me/sessoes', 'post /me/sessoes', 'patch /me/sessoes/{uuid}/series/{serie_uuid}',
  'post /me/sessoes/{uuid}/exercicios', 'post /me/sessoes/{uuid}/exercicios/{ex_uuid}/substituir',
  'post /me/sessoes/{uuid}/pausar', 'post /me/sessoes/{uuid}/retomar', 'post /me/sessoes/{uuid}/concluir',
  'get /me/exercicios/ultimos-registros', 'get /me/progresso/resumo', 'post /sync/push',
  'get /exercicios', 'get /exercicios/{uuid}', 'put /programas/{uuid}/versoes/{numero}/estrutura',
  'post /programas/{uuid}/ativar', 'post /me/solicitacoes', 'get /me/consentimentos',
  'post /me/prescricoes/{uuid}/aceitar', 'post /me/prescricoes/{uuid}/recusar', 'get /me/dispositivos',
  'post /admin/exercicios/{uuid}/revisar', 'get /admin/auditoria',
];

const ids = new Set();
const chaves = new Set(ops.map(({ p, m }) => `${m} ${p}`));
for (const k of OBRIGATORIAS) if (!chaves.has(k)) falha(`rota obrigatória ausente: ${k}`);

for (const { p, m, o } of ops) {
  const k = `${m} ${p}`;
  if (!o.operationId) falha(`${k}: sem operationId`);
  else if (ids.has(o.operationId)) falha(`${k}: operationId duplicado ${o.operationId}`);
  ids.add(o.operationId);
  if (!Array.isArray(o['x-papeis']) || !o['x-papeis'].length) falha(`${k}: sem x-papeis`);
  if (!['1', '2', '3'].includes(String(o['x-fase']))) falha(`${k}: x-fase inválido`);
  const r = o.responses || {};
  if (!r['400']) falha(`${k}: falta 400`);
  if (!r['429']) falha(`${k}: falta 429`);
  const publica = (o['x-papeis'] || []).includes('publico');
  if (!publica && !r['401']) falha(`${k}: rota protegida sem 401`);
  if (publica && !Array.isArray(o.security)) falha(`${k}: rota pública sem security: []`);
  const temIdem = (o.parameters || []).some((x) => x.$ref === '#/components/parameters/IdempotencyKey');
  if (IDEMPOTENTES.has(k) && !temIdem) falha(`${k}: deveria exigir Idempotency-Key`);
  if (!IDEMPOTENTES.has(k) && temIdem) falha(`${k}: Idempotency-Key não esperado (atualize a lista)`);
  if (['post', 'put', 'patch'].includes(m) && o.requestBody) {
    const s = o.requestBody.content['application/json'].schema;
    if (!s) falha(`${k}: requestBody sem schema`);
  }
  for (const [code, resp] of Object.entries(r)) {
    if (!/^2/.test(code) || code === '204' || !resp.content) continue;
    const s = resp.content['application/json'].schema;
    if (!s.properties || !s.properties.data) falha(`${k}: resposta ${code} fora do envelope {data}`);
  }
  for (const prm of o.parameters || []) {
    if (prm.in === 'path' && prm.name !== 'numero' && prm.schema && prm.schema.type === 'integer') {
      falha(`${k}: parâmetro de path inteiro '${prm.name}' (use UUID ou id opaco)`);
    }
  }
  // Rotas de coach/admin não podem aceitar papel 'aluno' como único autorizado.
  if ((p.startsWith('/coach') || p.startsWith('/admin')) && o['x-papeis'].includes('aluno')) falha(`${k}: papel aluno em rota de coach/admin`);
}

// Códigos de erro usados nos documentos devem estar no enum.
const enumErros = spec.components.schemas.ErrorCode.enum;
for (const c of ['VERSION_IMMUTABLE', 'SESSION_ALREADY_OPEN', 'SESSION_CLOSED', 'IDEMPOTENCY_KEY_REUSED', 'REVISION_CONFLICT', 'UNDERAGE_NOT_ALLOWED', 'COACH_NOT_VERIFIED', 'PRESCRIPTION_NOT_PENDING', 'CONSENT_REQUIRED']) {
  if (!enumErros.includes(c)) falha(`ErrorCode sem ${c}`);
}

(async () => {
  const config = await loadConfig({ extends: ['recommended'] });
  const lintResult = await lint({ ref: FILE, config });
  for (const p of lintResult) {
    if (p.severity === 'error') falha(`lint ${p.ruleId}: ${p.message} (${p.location?.[0]?.pointer})`);
    else console.warn(`aviso lint ${p.ruleId}: ${p.message}`);
  }
  console.log(`${ops.length} operações, ${Object.keys(spec.components.schemas).length} schemas`);
  if (falhas.length) {
    console.error(`\n${falhas.length} falha(s):`);
    falhas.forEach((f) => console.error(' - ' + f));
    process.exit(1);
  }
  console.log('Contrato OK');
})();
