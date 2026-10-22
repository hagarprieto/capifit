import type { Program } from './programsApi';

export type ProgramTab = 'ativo' | 'rascunhos' | 'arquivados';

export type ProgramGroups = {
  /** Programa em uso (se houver) e, depois dele, os outros publicados. */
  ativo: Program[];
  rascunhos: Program[];
  arquivados: Program[];
};

const byUpdatedDesc = (a: Program, b: Program) => (b.atualizado_em ?? b.criado_em ?? '').localeCompare(a.atualizado_em ?? a.criado_em ?? '');

/**
 * Agrupa para as abas de "Meus treinos" (TEL-020). Aba Ativo: o programa ativo primeiro, depois os demais publicados;
 * Rascunhos: ainda não publicados; Arquivados: preservados no histórico. Mais recente primeiro dentro de cada grupo.
 */
export function groupPrograms(programs: Program[], activeId: string | null): ProgramGroups {
  const published = programs.filter((p) => p.status === 'publicado').sort(byUpdatedDesc);
  const active = published.find((p) => p.id === activeId);
  return {
    ativo: active ? [active, ...published.filter((p) => p !== active)] : published,
    rascunhos: programs.filter((p) => p.status === 'rascunho').sort(byUpdatedDesc),
    arquivados: programs.filter((p) => p.status === 'arquivado').sort(byUpdatedDesc),
  };
}

/** "2026-10-22T15:30:00.000Z" → "22/10/2026" (dia no fuso do aparelho). */
export function formatDate(iso: string | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}
