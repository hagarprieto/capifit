// Verifica contraste WCAG 2.2 dos pares de tokens em docs/08_design_tokens.json (temas dark e light).
// Uso: node tools/design/check-contrast.js
const fs = require('fs');
const path = require('path');

const tokens = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../docs/08_design_tokens.json'), 'utf8'));

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

let falhas = 0;
for (const theme of ['dark', 'light']) {
  const t = tokens.color[theme];
  const pares = [...tokens.contrastPairs, ...(tokens.contrastPairsByTheme[theme] || [])];
  for (const { fg, bg, min } of pares) {
    if (!t[fg] || !t[bg]) { console.error(`[${theme}] token ausente: ${fg} / ${bg}`); falhas++; continue; }
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) falhas++;
    console.log(`${ok ? 'OK  ' : 'FALHA'} [${theme}] ${fg} sobre ${bg}: ${r.toFixed(2)} (mín. ${min})`);
  }
}
if (falhas) { console.error(`\n${falhas} par(es) abaixo do mínimo`); process.exit(1); }
console.log('\nContraste OK em todos os pares');
