import { t, type MessageKey } from '@/i18n';

import type { Modality } from './input';

/**
 * O que o número de carga digitado significa em cada exercício (Doc 09 §6, CAT-10). O servidor informa a convenção; o
 * app mostra o rótulo certo para a pessoa não confundir "40 kg" de cada halter com "40 kg" no total.
 */
const UNIT_KEY: Record<string, MessageKey> = {
  total: 'carga.total',
  por_halter: 'carga.porHalter',
  por_lado: 'carga.porLado',
  selecao_maquina: 'carga.maquina',
  adicional_corporal: 'carga.extra',
  assistencia: 'carga.assistencia',
};

/** "kg", "kg (total)", "kg por halter"… Sem convenção informada, o padrão vem da modalidade do exercício. */
export function loadUnit(convention: string | null | undefined, modality: Modality | string | undefined): string {
  const key = convention ? UNIT_KEY[convention] : undefined;
  if (key) {
    return t(key);
  }
  if (modality === 'reps_peso_corporal') {
    return t('carga.extra');
  }
  if (modality === 'reps_assistido') {
    return t('carga.assistencia');
  }
  return t('carga.kg');
}

/**
 * Linha única sob o nome do exercício: só aparece quando há algo a esclarecer (a unidade não é um "kg" simples, ou as
 * repetições são por lado). Ex.: "Carga em kg por halter · Repetições por lado".
 */
export function loadCaption(convention: string | null | undefined, modality: Modality | string | undefined, unilateral: boolean | undefined): string | null {
  if (modality === 'tempo') {
    return unilateral ? t('carga.tempoPorLado') : null;
  }
  const unit = loadUnit(convention, modality);
  const parts: string[] = [];
  if (unit !== t('carga.kg')) {
    parts.push(t('carga.legendaCarga', { unidade: unit }));
  }
  if (unilateral) {
    parts.push(t('carga.repsPorLado'));
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
