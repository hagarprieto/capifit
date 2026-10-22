// Varredura simples de segredos nos arquivos versionados (rede de segurança do CI; não substitui gestor de segredos).
// Uso: node tools/security/scan-secrets.js            (arquivos rastreados pelo Git)
//      node tools/security/scan-secrets.js caminho... (arquivos/pastas específicos, usado nos testes)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const PATTERNS = [
  { nome: 'chave privada', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { nome: 'chave de acesso AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { nome: 'token do GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { nome: 'token do Slack', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { nome: 'chave de API do Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { nome: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  {
    nome: 'credencial atribuída em texto',
    re: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|db_password)\b["']?\s*[:=]\s*["'][^"'\s${}<>]{8,}["']/i,
  },
];

// Valores de exemplo/teste conhecidos e inofensivos (senhas efêmeras do CI e fixtures de teste).
const ALLOW_VALUES = [/ci_only_(?:app_)?password/, /senha-de-teste/i, /exemplo\.invalid/, /<senha[^>]*>/i, /hunter2/];
const SKIP_FILES = [/package-lock\.json$/, /composer\.lock$/, /\.(png|jpg|jpeg|gif|ico|webp|gz|zip|pdf|woff2?)$/i];
const SKIP_DIRS = ['node_modules', 'vendor', '.git', 'dist', '.expo'];

function listFiles(args) {
  if (args.length) {
    return args.flatMap((p) => walk(path.resolve(p)));
  }
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean).map((f) => path.join(root, f));
}

function walk(p) {
  if (!fs.existsSync(p)) return [];
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  return fs.readdirSync(p).filter((n) => !SKIP_DIRS.includes(n)).flatMap((n) => walk(path.join(p, n)));
}

const findings = [];
for (const file of listFiles(process.argv.slice(2))) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (SKIP_FILES.some((re) => re.test(rel))) continue;

  // .env reais nunca devem ser versionados (só .env.example).
  if (/(^|\/)\.env(\.[^/]*)?$/.test(rel) && !/\.env\.example$/.test(rel)) {
    findings.push(`${rel}: arquivo .env versionado`);
    continue;
  }

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue;

  text.split(/\r?\n/).forEach((line, i) => {
    for (const { nome, re } of PATTERNS) {
      if (re.test(line) && !ALLOW_VALUES.some((ok) => ok.test(line))) {
        findings.push(`${rel}:${i + 1}: possível ${nome}`);
      }
    }
  });
}

if (findings.length) {
  console.error(`Varredura de segredos: ${findings.length} achado(s):`);
  findings.forEach((f) => console.error(' - ' + f));
  console.error('Se for um valor de teste inofensivo, ajuste ALLOW_VALUES em tools/security/scan-secrets.js com justificativa.');
  process.exit(1);
}
console.log('Varredura de segredos: nenhum achado.');
