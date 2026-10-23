import { formatDecimal, type Modality } from './input';
import { loadUnit } from './loadLabels';
import type { Session } from './workoutApi';

export type SummarySet = {
  ordem: number;
  kind: 'loadReps' | 'reps' | 'time';
  carga: string;
  /** Unidade da carga conforme a convenção do exercício ("kg por halter"…). */
  unit: string;
  /** As repetições são de cada lado (exercício unilateral). */
  perSide: boolean;
  reps: number;
  segundos: number;
};

export type SummaryExercise = { id: string; nome: string; sets: SummarySet[] };

export type SessionSummary = {
  /** Minutos de treino ativo (descontadas as pausas); `null` se o servidor ainda não calculou. */
  minutes: number | null;
  seriesDone: number;
  seriesTotal: number;
  /** Exercícios com ao menos uma série realizada. */
  exercisesDone: number;
  /** Carga × repetições das séries de trabalho, como registrado (0 quando não há carga). */
  volumeKg: number;
  exercises: SummaryExercise[];
};

/**
 * Resumo de uma sessão concluída (TEL-014). O volume segue a mesma regra do servidor (`/me/progresso/resumo`):
 * só séries realizadas, sem aquecimento, de exercícios com repetições, e com carga maior que zero. Não compara
 * exercícios de convenções diferentes e não é medida de qualidade do treino (Doc 03 §5.6, Doc 09 §4.1).
 */
export function summarize(session: Session): SessionSummary {
  let seriesDone = 0;
  let seriesTotal = 0;
  let volume = 0;
  let exercisesDone = 0;
  const exercises: SummaryExercise[] = [];

  for (const item of session.exercicios) {
    const modality = (item.exercicio.modalidade ?? 'reps_carga') as Modality;
    const sets: SummarySet[] = [];
    for (const series of item.series) {
      seriesTotal += 1;
      if (series.status !== 'realizada') {
        continue;
      }
      seriesDone += 1;
      const load = series.carga_kg ?? null;
      const reps = series.repeticoes ?? 0;
      if (series.tipo !== 'aquecimento' && modality !== 'tempo' && modality !== 'reps_assistido' && load !== null && load > 0 && series.repeticoes != null) {
        volume += load * reps;
      }
      sets.push({
        ordem: series.ordem,
        kind: modality === 'tempo' ? 'time' : load !== null ? 'loadReps' : 'reps',
        carga: formatDecimal(load),
        unit: loadUnit(item.exercicio.convencao_carga, modality),
        perSide: Boolean(item.exercicio.unilateral),
        reps,
        segundos: series.duracao_segundos ?? 0,
      });
    }
    if (sets.length > 0) {
      exercisesDone += 1;
      exercises.push({ id: item.id, nome: item.exercicio.nome, sets });
    }
  }

  const seconds = session.duracao_ativa_segundos;
  return {
    minutes: seconds == null ? null : Math.max(seconds > 0 ? 1 : 0, Math.round(seconds / 60)),
    seriesDone,
    seriesTotal,
    exercisesDone,
    volumeKg: Math.round(volume * 100) / 100,
    exercises,
  };
}

/** 12450 → "12.450"; 42.5 → "42,5" (separadores do pt-BR, sem depender de Intl no aparelho). */
export function formatVolume(kg: number): string {
  const [whole, fraction] = String(kg).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction ? `${grouped},${fraction}` : grouped;
}
