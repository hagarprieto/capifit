import { formatShortDate, startOfWeek } from '../home/home';

export type PeriodWeeks = 4 | 12;

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10-22" no fuso do aparelho (o servidor interpreta o intervalo no fuso do usuário). */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Da segunda-feira da primeira semana do período até hoje. O período conta a semana atual como a última. */
export function periodRange(weeks: PeriodWeeks, now: Date): { de: string; ate: string } {
  const start = startOfWeek(now);
  start.setDate(start.getDate() - (weeks - 1) * 7);
  return { de: isoDay(start), ate: isoDay(now) };
}

/** "2026-10-19" → "19/10". */
export function weekLabel(isoDate: string): string {
  return formatShortDate(`${isoDate}T12:00:00`);
}

/** Largura (0 a 1) da barra da semana em relação à semana mais cheia; semana vazia fica sem barra. */
export function barRatio(sessions: number, max: number): number {
  return max <= 0 || sessions <= 0 ? 0 : sessions / max;
}
