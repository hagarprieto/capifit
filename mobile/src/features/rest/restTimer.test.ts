import { ADJUST_STEP_SECONDS, IDLE, adjust, formatClock, pause, progress, remainingMs, resume, skip, start, tick } from './restTimer';

const T0 = 1_000_000;

describe('timer de descanso por instante final', () => {
  it('guarda o instante em que termina e calcula o que falta pelo relógio', () => {
    const state = start(T0, 90);

    expect(state).toEqual({ status: 'running', endsAt: T0 + 90_000, totalMs: 90_000 });
    expect(remainingMs(state, T0)).toBe(90_000);
    expect(remainingMs(state, T0 + 30_000)).toBe(60_000);
    expect(remainingMs(state, T0 + 999_999)).toBe(0);
  });

  it('com a tela bloqueada o tempo continua: depois de 2 minutos fora, o descanso de 90 s já terminou', () => {
    const state = start(T0, 90);

    expect(tick(state, T0 + 120_000)).toEqual({ status: 'finished' });
    expect(tick(state, T0 + 89_999)).toBe(state);
    expect(tick(state, T0 + 90_000)).toEqual({ status: 'finished' });
  });

  it('pausar congela o que falta e retomar recalcula o instante final', () => {
    const paused = pause(start(T0, 90), T0 + 30_000);
    expect(paused).toEqual({ status: 'paused', remainingMs: 60_000, totalMs: 90_000 });
    expect(remainingMs(paused, T0 + 500_000)).toBe(60_000); // parado: não anda com o relógio
    expect(tick(paused, T0 + 500_000)).toBe(paused);

    expect(resume(paused, T0 + 100_000)).toEqual({ status: 'running', endsAt: T0 + 160_000, totalMs: 90_000 });
  });

  it('pular volta ao repouso e as ações fora de hora não mudam nada', () => {
    expect(skip()).toBe(IDLE);
    expect(pause(IDLE, T0)).toBe(IDLE);
    expect(resume(start(T0), T0)).toEqual(start(T0));
    expect(adjust(IDLE, T0, 15)).toBe(IDLE);
    expect(adjust({ status: 'finished' }, T0, 15)).toEqual({ status: 'finished' });
  });

  it('ajusta de 15 em 15 s, contando ou pausado, dentro dos limites de 15 s a 10 min', () => {
    const running = start(T0, 90);

    expect(adjust(running, T0 + 10_000, ADJUST_STEP_SECONDS)).toEqual({ status: 'running', endsAt: T0 + 10_000 + 95_000, totalMs: 95_000 });
    expect(remainingMs(adjust(running, T0, -ADJUST_STEP_SECONDS), T0)).toBe(75_000);
    expect(remainingMs(adjust(running, T0, -1000), T0)).toBe(15_000);
    expect(remainingMs(adjust(running, T0, 10_000), T0)).toBe(600_000);
    expect(adjust(pause(running, T0 + 30_000), T0 + 30_000, 15)).toMatchObject({ status: 'paused', remainingMs: 75_000 });
  });

  it('duração inicial também respeita os limites', () => {
    expect(start(T0, 1)).toMatchObject({ totalMs: 15_000 });
    expect(start(T0, 5000)).toMatchObject({ totalMs: 600_000 });
  });

  it('o relógio arredonda para cima e o anel vai de 0 a 1', () => {
    expect(formatClock(90_000)).toBe('01:30');
    expect(formatClock(300)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(605_000)).toBe('10:05');

    const state = start(T0, 100);
    expect(progress(state, T0)).toBe(0);
    expect(progress(state, T0 + 50_000)).toBeCloseTo(0.5);
    expect(progress({ status: 'finished' }, T0)).toBe(1);
    expect(progress(IDLE, T0)).toBe(0);
  });
});
