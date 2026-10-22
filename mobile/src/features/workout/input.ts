import { t } from '@/i18n';

export type Modality = 'reps_carga' | 'reps_peso_corporal' | 'reps_assistido' | 'tempo';

/** Valores digitados de uma série (texto, como o usuário vê no campo). */
export type Draft = { carga: string; reps: string; duracao: string };

export type SeriesValues = { carga_kg?: number; repeticoes?: number; duracao_segundos?: number };

export const EMPTY_DRAFT: Draft = { carga: '', reps: '', duracao: '' };

const MAX_LOAD = 99999.99;
const MAX_REPS = 1000;
const MAX_SECONDS = 65535;

/** Aceita "42", "42.5" e "42,5" (vírgula é o normal no pt-BR); recusa vazio, negativo e texto. */
export function parseDecimal(text: string): number | null {
  const value = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    return null;
  }
  const number = Number(value);
  return number <= MAX_LOAD ? number : null;
}

export function parseWhole(text: string, max: number): number | null {
  const value = text.trim();
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const number = Number(value);
  return number <= max ? number : null;
}

/** 42.5 → "42,5"; 40 → "40"; vazio → "". */
export function formatDecimal(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

export function formatWhole(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Campos exigidos para marcar a série como realizada, iguais aos do servidor (SessionService::missingForDone):
 * carga e repetições; só repetições (peso corporal e assistido, carga é opcional); só duração (tempo).
 */
export function requiredFields(modality: Modality): ('carga' | 'reps' | 'duracao')[] {
  switch (modality) {
    case 'tempo':
      return ['duracao'];
    case 'reps_carga':
      return ['reps', 'carga'];
    default:
      return ['reps'];
  }
}

export type DraftResult = { ok: true; values: SeriesValues } | { ok: false; errors: Partial<Record<keyof Draft, string>> };

/** Confere o que foi digitado e devolve os números a enviar. Campo opcional em branco simplesmente não vai. */
export function validateDraft(modality: Modality, draft: Draft): DraftResult {
  const errors: Partial<Record<keyof Draft, string>> = {};
  const values: SeriesValues = {};
  const required = requiredFields(modality);

  if (modality !== 'tempo') {
    if (draft.carga.trim() === '') {
      if (required.includes('carga')) {
        errors.carga = t('treino.erro.carga');
      }
    } else {
      const load = parseDecimal(draft.carga);
      if (load === null) {
        errors.carga = t('treino.erro.carga');
      } else {
        values.carga_kg = load;
      }
    }
    const reps = parseWhole(draft.reps, MAX_REPS);
    if (reps === null || reps < 1) {
      errors.reps = t('treino.erro.reps');
    } else {
      values.repeticoes = reps;
    }
  } else {
    const seconds = parseWhole(draft.duracao, MAX_SECONDS);
    if (seconds === null || seconds < 1) {
      errors.duracao = t('treino.erro.duracao');
    } else {
      values.duracao_segundos = seconds;
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}
