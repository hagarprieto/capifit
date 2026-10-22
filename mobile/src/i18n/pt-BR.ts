/** Catálogo de textos (pt-BR). Toda string visível ao usuário nasce aqui (Doc 03 §13.3). */
export const ptBR = {
  'app.nome': 'CapiFit',

  'tema.sistema': 'Sistema',
  'tema.claro': 'Claro',
  'tema.escuro': 'Escuro',

  'themeCheck.titulo': 'Verificação do tema',
  'themeCheck.subtitulo': 'Marco M0 · confira cores, tipografia e fonte ampliada',
  'themeCheck.secaoTema': 'Tema',
  'themeCheck.temaAtual': 'Tema em uso: {tema}',
  'themeCheck.secaoCores': 'Cores',
  'themeCheck.secaoTipografia': 'Tipografia',
  'themeCheck.amostra': 'Série 2 · 40 kg × 10',
  'themeCheck.secaoFonte': 'Fonte ampliada',
  'themeCheck.dicaFonte': 'Aumente a fonte do sistema até 200% e confirme que nenhum texto é cortado e que os botões continuam acessíveis.',
  'themeCheck.versaoTokens': 'Tokens v{versao}',

  'a11y.selecionarTema': 'Usar tema {tema}',
} as const;

export type MessageKey = keyof typeof ptBR;
