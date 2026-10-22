/**
 * Timer de descanso por INSTANTE FINAL (UX-09, Doc 08 §9): o estado guarda quando o descanso termina, não um contador
 * que desce. Assim, bloquear a tela, trocar de app ou o JavaScript ficar suspenso não faz o tempo "parar": ao voltar,
 * basta comparar o agora com o instante final. Funções puras, sem relógio embutido (o `now` vem de fora).
 */
export type RestState =
  | { status: 'idle' }
  | { status: 'running'; endsAt: number; totalMs: number }
  | { status: 'paused'; remainingMs: number; totalMs: number }
  | { status: 'finished' };

export const IDLE: RestState = { status: 'idle' };

export const DEFAULT_REST_SECONDS = 90;
export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 600;
export const ADJUST_STEP_SECONDS = 15;

const clampMs = (ms: number) => Math.min(MAX_REST_SECONDS * 1000, Math.max(MIN_REST_SECONDS * 1000, ms));

export function start(now: number, seconds: number = DEFAULT_REST_SECONDS): RestState {
  const totalMs = clampMs(seconds * 1000);
  return { status: 'running', endsAt: now + totalMs, totalMs };
}

/** Milissegundos que faltam (0 se não está contando ou já acabou). */
export function remainingMs(state: RestState, now: number): number {
  if (state.status === 'running') {
    return Math.max(0, state.endsAt - now);
  }
  return state.status === 'paused' ? state.remainingMs : 0;
}

/** Marca como terminado quando o instante final passou; qualquer outro estado fica como está. */
export function tick(state: RestState, now: number): RestState {
  return state.status === 'running' && now >= state.endsAt ? { status: 'finished' } : state;
}

export function pause(state: RestState, now: number): RestState {
  return state.status === 'running' ? { status: 'paused', remainingMs: remainingMs(state, now), totalMs: state.totalMs } : state;
}

export function resume(state: RestState, now: number): RestState {
  return state.status === 'paused' ? { status: 'running', endsAt: now + state.remainingMs, totalMs: state.totalMs } : state;
}

export function skip(): RestState {
  return IDLE;
}

/** Soma ou subtrai segundos do descanso em curso (contando ou pausado), dentro dos limites; o resto fica igual. */
export function adjust(state: RestState, now: number, deltaSeconds: number): RestState {
  const delta = deltaSeconds * 1000;
  if (state.status === 'running') {
    const left = clampMs(remainingMs(state, now) + delta);
    return { status: 'running', endsAt: now + left, totalMs: Math.max(state.totalMs, left) };
  }
  if (state.status === 'paused') {
    const left = clampMs(state.remainingMs + delta);
    return { status: 'paused', remainingMs: left, totalMs: Math.max(state.totalMs, left) };
  }
  return state;
}

/** 90000 → "01:30". Arredonda para cima: com 0,3 s faltando ainda mostra 00:01, nunca 00:00 antes de terminar. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Fração já decorrida (0 a 1), para o anel de progresso. */
export function progress(state: RestState, now: number): number {
  if (state.status === 'finished') {
    return 1;
  }
  if (state.status === 'idle') {
    return 0;
  }
  return state.totalMs === 0 ? 0 : Math.min(1, Math.max(0, 1 - remainingMs(state, now) / state.totalMs));
}
