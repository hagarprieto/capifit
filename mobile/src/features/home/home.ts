import type { Schemas } from '@/api/client';
import type { WeekDay } from '@/design-system/StatusAndStats';
import { t } from '@/i18n';

export type SessionSummary = Schemas['SessaoResumo'];
export type Ficha = Schemas['Ficha'];

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
const LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const;

/** Meia-noite (horário do aparelho) da segunda-feira da semana de `now`. */
export function startOfWeek(now: Date): Date {
  const day = (now.getDay() + 6) % 7; // segunda = 0 … domingo = 6
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Quando a sessão foi feita: o fim, ou o início se o fim faltar. */
function doneAt(session: SessionSummary): Date | null {
  const raw = session.encerrada_em ?? session.iniciada_em;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Sessões concluídas desta semana (segunda a domingo, no fuso do aparelho). */
export function sessionsThisWeek(sessions: SessionSummary[], now: Date): SessionSummary[] {
  const start = startOfWeek(now).getTime();
  return sessions.filter((s) => {
    const at = s.status === 'concluida' ? doneAt(s) : null;
    return at !== null && at.getTime() >= start && at.getTime() < start + 7 * DAY_MS;
  });
}

/** Os 7 dias da semana com marca de "treinou" e de "hoje", com rótulo falado. */
export function weekDays(now: Date, sessions: SessionSummary[]): WeekDay[] {
  const start = startOfWeek(now);
  const done = sessionsThisWeek(sessions, now).map(doneAt).filter((d): d is Date => d !== null);
  return SHORT.map((label, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const trained = done.some((d) => sameDay(d, date));
    const today = sameDay(date, now);
    const spoken = `${LONG[index]}${today ? t('semana.hojeFalado') : ''}: ${t(trained ? 'semana.treinoConcluido' : 'semana.semTreino')}`;
    return { key: String(index), label, done: trained, today, spoken };
  });
}

export function weekStats(sessions: SessionSummary[], now: Date): { count: number; activeSeconds: number } {
  const week = sessionsThisWeek(sessions, now);
  return { count: week.length, activeSeconds: week.reduce((sum, s) => sum + (s.duracao_ativa_segundos ?? 0), 0) };
}

/** 3240 → "54 min"; 7800 → "2 h 10 min"; 0 → "0 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}

/** "22/10" (dia e mês no fuso do aparelho). */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Próxima ficha do programa ativo: a que vem DEPOIS da ficha do último treino concluído deste programa (volta à
 * primeira depois da última); sem treino anterior (ou se a ficha anterior saiu do programa), a primeira. As fichas sem
 * exercício não entram na rotação.
 */
export function nextFicha(fichas: Ficha[], programId: string, completed: SessionSummary[]): Ficha | null {
  const usable = [...fichas].filter((f) => f.exercicios.length > 0).sort((a, b) => a.ordem - b.ordem);
  if (usable.length === 0) {
    return null;
  }
  const last = completed.find((s) => s.status === 'concluida' && s.programa_id === programId && usable.some((f) => f.id === s.ficha_id));
  if (!last) {
    return usable[0];
  }
  const index = usable.findIndex((f) => f.id === last.ficha_id);
  return usable[(index + 1) % usable.length];
}
