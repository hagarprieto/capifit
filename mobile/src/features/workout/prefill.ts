import type { Schemas } from '@/api/client';

import { EMPTY_DRAFT, formatDecimal, formatWhole, type Draft, type Modality } from './input';

export type SessionSeries = Schemas['SessaoSerie'];
export type LastRecord = Schemas['UltimoRegistro'];

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

/**
 * Valores iniciais dos campos de uma série (Doc 06 D-14). São REFERÊNCIA: só viram registro quando o usuário toca em
 * concluir. Ordem de preferência: o que já foi registrado nesta série; a série anterior já concluída deste exercício
 * nesta sessão; a série de mesma posição (ou a última) do último treino concluído; em branco.
 */
export function initialDraft(series: SessionSeries, siblings: SessionSeries[], last: LastRecord | undefined): { draft: Draft; prefilled: boolean } {
  if (series.status === 'realizada') {
    return { draft: toDraft(series), prefilled: false };
  }
  const earlierDone = siblings.filter((s) => s.status === 'realizada' && s.ordem < series.ordem).sort((a, b) => b.ordem - a.ordem)[0];
  if (earlierDone && hasValue(earlierDone)) {
    return { draft: toDraft(earlierDone), prefilled: true };
  }
  const recorded = last?.series ?? [];
  const sameOrder = recorded.find((s) => s.ordem === series.ordem) ?? recorded[recorded.length - 1];
  if (sameOrder && hasValue(sameOrder)) {
    return { draft: toDraft(sameOrder), prefilled: true };
  }
  return { draft: { ...EMPTY_DRAFT }, prefilled: false };
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
