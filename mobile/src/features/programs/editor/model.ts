import type { Schemas } from '@/api/client';
import type { MessageKey } from '@/i18n';
import { newUuid } from '@/lib/uuid';

export type SeriesType = 'aquecimento' | 'normal' | 'preparatoria' | 'dropset';
export type Modality = 'reps_carga' | 'reps_peso_corporal' | 'reps_assistido' | 'tempo';

export type EditorExercise = { id: string; nome: string; modalidade: Modality };

export type EditorSeries = {
  tipo: SeriesType;
  repsMin: number | null;
  repsMax: number | null;
  loadKg: number | null;
  rir: number | null;
  durationSeconds: number | null;
};

export type EditorItem = {
  key: string;
  exercise: EditorExercise;
  restSeconds: number | null;
  superset: string | null;
  notes: string | null;
  series: EditorSeries[];
};

export type EditorFicha = { key: string; titulo: string; items: EditorItem[] };

export type EditorState = { fichas: EditorFicha[] };

/** Limites do servidor (StructureValidator): conferidos aqui para avisar antes de enviar. */
export const LIMITS = { fichas: 14, itemsPerFicha: 30, seriesPerItem: 20, title: 160, notes: 2000, reps: 1000, load: 99999.99, rir: 10, rest: 3600, seconds: 65535 } as const;

export const DEFAULT_SETS = 3;
export const DEFAULT_REPS: [number, number] = [8, 12];
export const DEFAULT_REST_SECONDS = 90;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Código da ficha pela posição: A, B, C… (único, curto, estável para o servidor). */
export function fichaCode(index: number): string {
  return LETTERS[index % 26].repeat(Math.floor(index / 26) + 1);
}

export function defaultFichaTitle(index: number): string {
  return `Treino ${fichaCode(index)}`;
}

// ---- API → editor -------------------------------------------------------------------------------------------------

export function fromVersion(version: Schemas['Versao']): EditorState {
  return {
    fichas: [...version.fichas]
      .sort((a, b) => a.ordem - b.ordem)
      .map((ficha) => ({
        key: ficha.id,
        titulo: ficha.titulo,
        items: [...ficha.exercicios]
          .sort((a, b) => a.ordem - b.ordem)
          .map((item) => ({
            key: item.id,
            exercise: { id: item.exercicio.id, nome: item.exercicio.nome, modalidade: (item.exercicio.modalidade ?? 'reps_carga') as Modality },
            restSeconds: item.descanso_segundos ?? null,
            superset: item.grupo_superset ?? null,
            notes: item.instrucoes ?? null,
            series: [...item.series]
              .sort((a, b) => a.ordem - b.ordem)
              .map((s) => ({
                tipo: s.tipo as SeriesType,
                repsMin: s.reps_min ?? null,
                repsMax: s.reps_max ?? null,
                loadKg: s.carga_alvo_kg ?? null,
                rir: s.rir_alvo ?? null,
                durationSeconds: s.duracao_alvo_segundos ?? null,
              })),
          })),
      })),
  };
}

// ---- editor → API -------------------------------------------------------------------------------------------------

/** Corpo do `PUT .../estrutura` (sem `expected_revision`). A ordem e o código vêm da posição na lista. */
export function toPayload(state: EditorState) {
  return state.fichas.map((ficha, fichaIndex) => ({
    codigo: fichaCode(fichaIndex),
    titulo: ficha.titulo.trim(),
    ordem: fichaIndex + 1,
    exercicios: ficha.items.map((item, itemIndex) => ({
      exercicio_uuid: item.exercise.id,
      ordem: itemIndex + 1,
      descanso_segundos: item.restSeconds,
      grupo_superset: item.superset,
      instrucoes: item.notes === null || item.notes.trim() === '' ? null : item.notes.trim(),
      series: item.series.map((s, seriesIndex) => ({
        ordem: seriesIndex + 1,
        tipo: s.tipo,
        reps_min: s.repsMin,
        reps_max: s.repsMax,
        carga_alvo_kg: s.loadKg,
        rir_alvo: s.rir,
        duracao_alvo_segundos: s.durationSeconds,
      })),
    })),
  }));
}

export function isDirty(current: EditorState, saved: EditorState): boolean {
  return JSON.stringify(toPayload(current)) !== JSON.stringify(toPayload(saved));
}

// ---- configuração de um exercício (TEL-023) ----------------------------------------------------------------------

/**
 * O que o formulário de "Configurar exercício" edita: os mesmos parâmetros valem para todas as séries de trabalho,
 * mais uma série de aquecimento opcional. Séries com tipos diferentes (preparatória, dropset) vindas de outra origem
 * são preservadas enquanto o formulário não for aplicado.
 */
export type ItemConfig = {
  workSets: number;
  warmup: boolean;
  repsMin: number | null;
  repsMax: number | null;
  loadKg: number | null;
  rir: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  notes: string;
};

export function configOf(item: EditorItem): ItemConfig {
  const work = item.series.filter((s) => s.tipo !== 'aquecimento');
  const first = work[0];
  return {
    workSets: Math.max(1, work.length),
    warmup: item.series.some((s) => s.tipo === 'aquecimento'),
    repsMin: first?.repsMin ?? null,
    repsMax: first?.repsMax ?? null,
    loadKg: first?.loadKg ?? null,
    rir: first?.rir ?? null,
    durationSeconds: first?.durationSeconds ?? null,
    restSeconds: item.restSeconds,
    notes: item.notes ?? '',
  };
}

export function newItem(exercise: EditorExercise): EditorItem {
  return applyConfig(
    { key: newUuid(), exercise, restSeconds: null, superset: null, notes: null, series: [] },
    exercise.modalidade === 'tempo'
      ? { workSets: DEFAULT_SETS, warmup: false, repsMin: null, repsMax: null, loadKg: null, rir: null, durationSeconds: 45, restSeconds: DEFAULT_REST_SECONDS, notes: '' }
      : { workSets: DEFAULT_SETS, warmup: false, repsMin: DEFAULT_REPS[0], repsMax: DEFAULT_REPS[1], loadKg: null, rir: null, durationSeconds: null, restSeconds: DEFAULT_REST_SECONDS, notes: '' },
  );
}

/** Reconstrói as séries a partir do formulário. Em exercício de tempo vale a duração; nos demais, as repetições. */
export function applyConfig(item: EditorItem, config: ItemConfig): EditorItem {
  const timed = item.exercise.modalidade === 'tempo';
  const work: EditorSeries = {
    tipo: 'normal',
    repsMin: timed ? null : config.repsMin,
    repsMax: timed ? null : config.repsMax,
    loadKg: timed ? null : config.loadKg,
    rir: timed ? null : config.rir,
    durationSeconds: timed ? config.durationSeconds : null,
  };
  const series: EditorSeries[] = [];
  if (config.warmup) {
    series.push({ ...work, tipo: 'aquecimento', loadKg: null, rir: null });
  }
  for (let n = 0; n < config.workSets; n += 1) {
    series.push({ ...work });
  }
  return { ...item, restSeconds: config.restSeconds, notes: config.notes.trim() === '' ? null : config.notes, series };
}

/** "3 × 8–12", "3 × 10", "3 × 45 s" (+ "aquecimento" quando houver). */
export function prescriptionSummary(item: EditorItem): { sets: number; warmup: boolean; range: string; kind: 'reps' | 'time' | 'none' } {
  const work = item.series.filter((s) => s.tipo !== 'aquecimento');
  const first = work[0];
  const warmup = item.series.length > work.length;
  if (!first) {
    return { sets: 0, warmup, range: '', kind: 'none' };
  }
  if (first.durationSeconds !== null) {
    return { sets: work.length, warmup, range: String(first.durationSeconds), kind: 'time' };
  }
  const { repsMin, repsMax } = first;
  const range = repsMin === null && repsMax === null ? '' : repsMin !== null && repsMax !== null && repsMin !== repsMax ? `${repsMin}–${repsMax}` : String(repsMin ?? repsMax);
  return { sets: work.length, warmup, range, kind: range === '' ? 'none' : 'reps' };
}

// ---- validação ----------------------------------------------------------------------------------------------------

export type ConfigErrors = Partial<Record<'workSets' | 'reps' | 'load' | 'rir' | 'duration' | 'rest' | 'notes', MessageKey>>;

/** Erros do formulário de configuração, como chaves de mensagem do catálogo (a tela traduz). */
export function validateConfig(exercise: EditorExercise, config: ItemConfig): ConfigErrors {
  const errors: ConfigErrors = {};
  // Texto que não é número chega como NaN: nunca passa em comparação, então é tratado como inválido à parte.
  const invalid = (value: number | null) => value !== null && !Number.isFinite(value);
  const total = config.workSets + (config.warmup ? 1 : 0);
  if (!Number.isInteger(config.workSets) || config.workSets < 1 || total > LIMITS.seriesPerItem) {
    errors.workSets = 'editor.erro.series';
  }
  if (exercise.modalidade === 'tempo') {
    if (config.durationSeconds === null || invalid(config.durationSeconds) || config.durationSeconds < 1 || config.durationSeconds > LIMITS.seconds) {
      errors.duration = 'editor.erro.duracao';
    }
  } else {
    const { repsMin, repsMax } = config;
    if (repsMin === null || repsMax === null || invalid(repsMin) || invalid(repsMax) || repsMin < 1 || repsMax > LIMITS.reps || repsMin > repsMax) {
      errors.reps = 'editor.erro.reps';
    }
    if (config.loadKg !== null && (invalid(config.loadKg) || config.loadKg < 0 || config.loadKg > LIMITS.load)) {
      errors.load = 'editor.erro.carga';
    }
    if (config.rir !== null && (invalid(config.rir) || config.rir < 0 || config.rir > LIMITS.rir)) {
      errors.rir = 'editor.erro.rir';
    }
  }
  if (config.restSeconds !== null && (invalid(config.restSeconds) || config.restSeconds < 0 || config.restSeconds > LIMITS.rest)) {
    errors.rest = 'editor.erro.descanso';
  }
  if (config.notes.length > LIMITS.notes) {
    errors.notes = 'editor.erro.notas';
  }
  return errors;
}

export type ProgramIssue = 'editor.erro.fichaTitulo' | 'editor.erro.fichaSemExercicio' | 'editor.erro.itemSemSerie';

/** Problemas que impedem SALVAR (o servidor recusaria). Ficha vazia é permitida em rascunho; não em publicação. */
export function saveIssues(state: EditorState): ProgramIssue[] {
  const issues = new Set<ProgramIssue>();
  for (const ficha of state.fichas) {
    const title = ficha.titulo.trim();
    if (title.length < 1 || title.length > LIMITS.title) {
      issues.add('editor.erro.fichaTitulo');
    }
    if (ficha.items.some((item) => item.series.length < 1)) {
      issues.add('editor.erro.itemSemSerie');
    }
  }
  return [...issues];
}

/** Para PUBLICAR: o servidor exige ao menos uma ficha com exercício e nenhuma ficha vazia vira treino útil. */
export function publishIssues(state: EditorState): ProgramIssue[] {
  const issues = new Set<ProgramIssue>(saveIssues(state));
  if (!state.fichas.some((f) => f.items.length > 0) || state.fichas.some((f) => f.items.length === 0)) {
    issues.add('editor.erro.fichaSemExercicio');
  }
  return [...issues];
}
