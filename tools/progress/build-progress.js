// Gera PROGRESS.html a partir de docs/10_backlog.csv + docs/progress-status.json.
// Uso: node tools/progress/build-progress.js
// Atualizar o progresso = editar docs/progress-status.json e rodar este script.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const csvPath = path.join(root, 'docs/10_backlog.csv');
const statusPath = path.join(root, 'docs/progress-status.json');
const templatePath = path.join(__dirname, 'template.html');
const outPath = path.join(root, 'PROGRESS.html');

const VALID = ['done', 'in-progress', 'not-started', 'pending'];

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const [head, ...body] = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

const FASES = [
  { n: 1, nome: 'Fase 1 — Núcleo individual' },
  { n: 2, nome: 'Fase 2 — Sugestões e conforto' },
  { n: 3, nome: 'Fase 3 — Coach ponta a ponta' },
];
const MARCOS = [
  ['M0', 1, 'Fundações', 'Fundações e dependências externas iniciadas.'],
  ['M1', 1, 'Fatia vertical', 'Login → catálogo → treino avulso online com série registrada.'],
  ['M2', 1, 'Núcleo online', 'Programas manuais, executor, resumo e histórico funcionando online.'],
  ['M3', 1, 'Offline e sincronização', 'Registro offline, recuperação de sessão e sync idempotente completos.'],
  ['M4', 1, 'Beta fechado', 'Acessibilidade, segurança e privacidade auditadas; mídia da onda 1 aprovada.'],
  ['M5', 1, 'Lançamento da Fase 1', 'Lojas aprovadas, runbook e métricas ativos.', 'Fase 1 concluída — lançamento'],
  ['M6', 2, 'Sugestões por regras', 'Motor rules-1.0 com modelos aprovados e assistente no app.'],
  ['M7', 2, 'Conforto e evolução avançada', 'Evolução por exercício, sync incremental, exercício personalizado e notificações.', 'Fase 2 concluída'],
  ['M8', 3, 'Coach: API, app e portal', 'Verificação, vínculo, prescrição, aceite, portal e revogação.'],
  ['M9', 3, 'Piloto com coaches', 'Piloto fechado com coaches verificados e acompanhamento mínimo.', 'Fase 3 concluída'],
].map(([id, fase, titulo, objetivo, milestoneAfter]) => ({ id, fase, titulo, objetivo, ...(milestoneAfter ? { milestoneAfter } : {}) }));

const idx = Object.fromEntries(head.map((h, i) => [h, i]));
const marcoFase = Object.fromEntries(MARCOS.map((m) => [m.id, m.fase]));
const stories = body.map((r) => {
  const id = r[idx.id];
  const st = status.stories[id] || 'not-started';
  if (!VALID.includes(st)) throw new Error(`Estado inválido para ${id}: ${st}`);
  return {
    id, titulo: r[idx.titulo], marco: r[idx.marco], fase: marcoFase[r[idx.marco]],
    pts: Number(r[idx.pontos]), papel: r[idx.papel], status: st, ...(status.notas?.[id] ? { nota: status.notas[id] } : {}),
  };
});
for (const id of Object.keys(status.stories)) if (!stories.some((s) => s.id === id)) throw new Error(`História inexistente em progress-status.json: ${id}`);
for (const s of stories) if (!s.fase) throw new Error(`Marco sem fase: ${s.id} (${s.marco})`);

const EXT = {
  revisor: ['Revisor técnico', 'Profissional de Educação Física habilitado para aprovar instruções, cuidados, alternativas, mídia e modelos. Bloqueia o M2 em diante.'],
  capi: ['Responsável pela Capi', 'Model sheet, rig e vídeos (Doc 08); definir fornecedor e cessão de direitos.'],
  juridico: ['Responsável jurídico e LGPD', 'Termos, política de privacidade, retenção e parecer sobre prescrição por terceiros (Fase 3).'],
  marca: ['Pesquisa de marca', 'CapiFit no INPI, domínio e nomes nas lojas.'],
  contas_lojas: ['Contas Apple e Google', 'Necessárias para o beta no M4; podem exigir verificação de identidade.'],
  hospedagem: ['Hospedagem e storage', 'Provedor de API/banco e de objetos para o staging do M1.'],
  equipe: ['Equipe e capacidade', 'Disponibilidade por papel, para converter pontos em calendário (Doc 10 §5.2).'],
  gestao: ['Ferramenta de gestão', 'Importar docs/10_backlog.csv (opcional: esta página já acompanha o backlog).'],
};
const externas = Object.entries(EXT).map(([k, [titulo, detalhe]]) => {
  const st = status.externas?.[k] || 'pending';
  if (!VALID.includes(st)) throw new Error(`Estado inválido em externas.${k}`);
  return { titulo, detalhe, status: st };
});

const planejamento = [
  ['01 — Visão geral e especificação funcional', 'docs/01_visao_geral_especificacao_funcional.md'],
  ['02 — Personas, jornadas e fluxos de navegação', 'docs/02_personas_jornadas_fluxos_navegacao.md'],
  ['03 — Arquitetura de informação, telas e componentes', 'docs/03_arquitetura_informacao_telas_componentes.md'],
  ['04 — Modelagem de dados e regras de domínio (+ SQL)', 'docs/04_modelagem_dados_regras_dominio.md'],
  ['05 — Arquitetura e contratos da API REST', 'docs/05_arquitetura_contratos_api_rest.md'],
  ['06 — Reconciliação, decisões e Migration 001', 'docs/06_reconciliacao_decisoes_migration_endpoints.md'],
  ['07 — OpenAPI 3.1 e testes de contrato', 'docs/07_openapi_testes_contrato.md'],
  ['08 — Design system e Character Bible da Capi', 'docs/08_design_system_character_bible_capi.md'],
  ['09 — Catálogo de exercícios e padrões de prescrição', 'docs/09_catalogo_exercicios_padroes_prescricao.md'],
  ['10 — Backlog, roadmap e plano de testes', 'docs/10_backlog_roadmap_plano_testes.md'],
  ['11 — Checklist de execução do marco M0', 'docs/11_checklist_execucao_marco_m0.md'],
].map(([titulo, arquivo]) => ({ titulo, arquivo }));

const agora = new Date();
const geradoEm = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
const data = { geradoEm, atualizadoEm: status.atualizado_em, fases: FASES, marcos: MARCOS, stories, externas, planejamento };

const template = fs.readFileSync(templatePath, 'utf8');
if (!template.includes('/*__DATA__*/null')) throw new Error('Marcador de dados ausente no template');
// "</" é escapado para não fechar a tag <script> por acidente.
const json = JSON.stringify(data).replace(/</g, '\\u003c');
fs.writeFileSync(outPath, template.replace('/*__DATA__*/null', () => json), 'utf8');

const total = stories.reduce((a, s) => a + s.pts, 0);
const feitos = stories.filter((s) => s.status === 'done').reduce((a, s) => a + s.pts, 0);
console.log(`PROGRESS.html gerado: ${stories.length} histórias, ${feitos}/${total} pts concluídos.`);
