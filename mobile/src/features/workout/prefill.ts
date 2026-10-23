import type { Schemas } from '@/api/client';

import { EMPTY_DRAFT, formatDecimal, formatWhole, type Draft, type Modality } from './input';

export type SessionSeries = Schemas['SessaoSerie'];
export type LastRecord = Schemas['UltimoRegistro'];

/** Meta prescrita de UMA série (do programa): faixa de repetições, carga-alvo e duração. */
export type Target = { repsMin: number | null; repsMax: number | null; loadKg: number | null; durationSeconds: number | null };

type Source = { carga_kg?: number | null; repeticoes?: number | null; duracao_segundos?: number | null };

function toDraft(source: Source): Draft {
  return {
    carga: formatDecimal(source.carga_kg),
    reps: formatWhole(source.repeticoes),
    duracao: formatWhole(source.duracao_segundos),
  };
}

function hasValue(source: Source): boolean {
  return source.carga_kg != null || source.repeticoes != null || source.duracao_segundos != null;
}

/** Mantém as repetições sugeridas dentro da faixa prescrita (último treino com 15 reps numa meta de 8–12 sugere 12). */
function withinRange(reps: number | null, target: Target | undefined): number | null {
  if (reps === null || !target) {
    return reps;
  }
  const low = target.repsMin ?? 0;
  const high = target.repsMax ?? Number.POSITIVE_INFINITY;
  return Math.min(Math.max(reps, low), high);
}

/**
 * Valores iniciais dos campos de uma série (Doc 06 D-14: "meta prescrita ou último registro"). São REFERÊNCIA: só viram
 * registro quando o usuário toca em concluir. Ordem de preferência:
 *  1. o que já foi registrado nesta série;
 *  2. a série anterior já concluída do mesmo tipo neste treino (aquecimento não semeia série de trabalho);
 *  3. campo a campo, a meta prescrita com o último treino como apoio: a **carga-alvo** manda quando existe, senão vale
 *     a do último treino; as **repetições** partem do último treino e, sem ele, do mínimo da faixa, sempre dentro da
 *     faixa; a **duração** (exercício de tempo) segue a meta, senão o último treino;
 *  4. em branco.
 * Série de aquecimento sem carga-alvo própria fica sem carga sugerida (não copia a carga de trabalho).
 */
export function initialDraft(series: SessionSeries, siblings: SessionSeries[], last: LastRecord | undefined, target?: Target): { draft: Draft; prefilled: boolean } {
  if (series.status === 'realizada') {
    return { draft: toDraft(series), prefilled: false };
  }
  const warmup = series.tipo === 'aquecimento';
  const earlierDone = siblings
    .filter((s) => s.status === 'realizada' && s.ordem < series.ordem && (s.tipo === 'aquecimento') === warmup)
    .sort((a, b) => b.ordem - a.ordem)[0];
  if (earlierDone && hasValue(earlierDone)) {
    return { draft: toDraft(earlierDone), prefilled: true };
  }

  const recorded = last?.series ?? [];
  const reference = recorded.find((s) => s.ordem === series.ordem) ?? recorded[recorded.length - 1];
  const load = target?.loadKg ?? (warmup ? null : (reference?.carga_kg ?? null));
  const reps = withinRange(reference?.repeticoes ?? target?.repsMin ?? null, target);
  const duration = target?.durationSeconds ?? reference?.duracao_segundos ?? null;
  const suggestion: Source = { carga_kg: load, repeticoes: reps, duracao_segundos: duration };
  return hasValue(suggestion) ? { draft: toDraft(suggestion), prefilled: true } : { draft: { ...EMPTY_DRAFT }, prefilled: false };
}

/** Texto "Última vez: 40 kg · 10/10/8" montado a partir do último registro (ou `null` se não houver). */
export function lastTimeSummary(modality: Modality, last: LastRecord | undefined): { load: string | null; values: string } | null {
  if (!last || last.series.length === 0) {
    return null;
  }
  if (modality === 'tempo') {
    return { load: null, values: last.series.map((s) => s.duracao_segundos ?? 0).join('/') };
  }
  const loads = [...new Set(last.series.map((s) => s.carga_kg).filter((v): v is number => v != null))];
  return {
    load: loads.length === 1 ? formatDecimal(loads[0]) : null,
    values: last.series.map((s) => s.repeticoes ?? 0).join('/'),
  };
}

/**
 * Resumo da meta do exercício para a tela ("Meta: 8–12 repetições · 60 kg"), a partir das séries de trabalho que têm
 * meta. Se as séries de trabalho têm metas diferentes entre si, devolve `null` (a sugestão por série continua valendo).
 */
export function targetSummary(modality: Modality, targets: (Target | undefined)[]): { kind: 'reps' | 'time'; range: string; load: string | null } | null {
  const present = targets.filter((t): t is Target => t !== undefined);
  if (present.length === 0) {
    return null;
  }
  const key = (t: Target) => JSON.stringify([t.repsMin, t.repsMax, t.loadKg, t.durationSeconds]);
  if (new Set(present.map(key)).size !== 1) {
    return null;
  }
  const [t] = present;
  if (modality === 'tempo') {
    return t.durationSeconds === null ? null : { kind: 'time', range: String(t.durationSeconds), load: null };
  }
  if (t.repsMin === null && t.repsMax === null) {
    return null;
  }
  const range = t.repsMin !== null && t.repsMax !== null && t.repsMin !== t.repsMax ? `${t.repsMin}–${t.repsMax}` : String(t.repsMin ?? t.repsMax);
  return { kind: 'reps', range, load: t.loadKg === null ? null : formatDecimal(t.loadKg) };
}
