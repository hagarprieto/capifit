// Resume o log de acesso (JSON, uma linha por evento) em métricas por rota: requisições, 4xx, 5xx e latência p50/p95.
// Uso: node tools/ops/summarize-access-log.js < arquivo.log      (linhas que não são JSON do log de acesso são ignoradas)
const readline = require('readline');

const rows = new Map();

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.ceil(p * sortedValues.length) - 1);
  return sortedValues[Math.max(0, index)];
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }
  if (event.message !== 'request' || !event.context) return;
  const { method, route, status, duration_ms: duration } = event.context;
  const key = `${method} ${route}`;
  const row = rows.get(key) ?? { requests: 0, c4xx: 0, c5xx: 0, durations: [] };
  row.requests += 1;
  if (status >= 500) row.c5xx += 1;
  else if (status >= 400) row.c4xx += 1;
  row.durations.push(Number(duration));
  rows.set(key, row);
});

rl.on('close', () => {
  const table = [...rows.entries()]
    .sort((a, b) => b[1].requests - a[1].requests)
    .map(([route, r]) => {
      const sorted = r.durations.sort((a, b) => a - b);
      return {
        rota: route,
        requisicoes: r.requests,
        '4xx': r.c4xx,
        '5xx': r.c5xx,
        'taxa_5xx_%': Number(((r.c5xx / r.requests) * 100).toFixed(2)),
        p50_ms: percentile(sorted, 0.5),
        p95_ms: percentile(sorted, 0.95),
      };
    });
  if (table.length === 0) {
    console.log('Nenhum evento de acesso encontrado.');
    return;
  }
  console.table(table);
});
