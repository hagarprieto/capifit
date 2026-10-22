import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { restNotifier, type RestNotifier } from './notifications';
import { ADJUST_STEP_SECONDS, DEFAULT_REST_SECONDS, IDLE, adjust, pause, progress, remainingMs, resume, skip, start, tick, type RestState } from './restTimer';

const TICK_MS = 250;

type Options = { notifier?: RestNotifier; haptic?: boolean; seconds?: number };

/**
 * Descanso entre séries (TEL-013). O tempo vem do instante final (ver `restTimer`), então não "para" com a tela
 * bloqueada: ao voltar para o app, o relógio é recalculado na hora. O aviso local é agendado no início e cancelado ao
 * pausar, pular ou sair da tela. Não bloqueia nada: o usuário segue registrando outras séries durante a contagem.
 */
export function useRestTimer({ notifier = restNotifier, haptic = true, seconds = DEFAULT_REST_SECONDS }: Options = {}) {
  const [state, setState] = useState<RestState>(IDLE);
  const [now, setNow] = useState(() => Date.now());
  const notificationId = useRef<string | null>(null);
  // Estado mais recente para os manipuladores de toque (nunca lido durante a renderização).
  const latest = useRef<RestState>(IDLE);
  const finishedHandled = useRef(false);

  const cancelNotification = useCallback(async () => {
    const id = notificationId.current;
    notificationId.current = null;
    await notifier.cancel(id);
  }, [notifier]);

  /** Aplica a mudança de estado e deixa o aviso local de acordo com ela (agenda se contando; cancela nos demais). */
  const apply = useCallback(
    (next: RestState, at: number) => {
      latest.current = next;
      setState(next);
      setNow(at);
      void (async () => {
        await cancelNotification();
        if (next.status === 'running') {
          notificationId.current = await notifier.schedule(remainingMs(next, at) / 1000);
        }
      })();
    },
    [cancelNotification, notifier],
  );

  const startRest = useCallback((overrideSeconds?: number) => {
    finishedHandled.current = false;
    const at = Date.now();
    apply(start(at, overrideSeconds ?? seconds), at);
  }, [apply, seconds]);

  const pauseRest = useCallback(() => {
    const at = Date.now();
    apply(pause(latest.current, at), at);
  }, [apply]);

  const resumeRest = useCallback(() => {
    const at = Date.now();
    apply(resume(latest.current, at), at);
  }, [apply]);

  const skipRest = useCallback(() => apply(skip(), Date.now()), [apply]);

  const adjustRest = useCallback((deltaSeconds: number) => {
    const at = Date.now();
    apply(adjust(latest.current, at, deltaSeconds), at);
  }, [apply]);

  // Relógio: só roda enquanto está contando. Ao voltar para o app, recalcula na hora (o JS pode ter ficado suspenso).
  const running = state.status === 'running';
  useEffect(() => {
    if (!running) {
      return;
    }
    const refresh = () => {
      const at = Date.now();
      setNow(at);
      setState((current) => tick(current, at));
    };
    const timer = setInterval(refresh, TICK_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        refresh();
      }
    });
    return () => {
      clearInterval(timer);
      subscription?.remove();
    };
  }, [running]);

  // O relógio também muda o estado (fim do descanso): mantém o ref em dia.
  useEffect(() => {
    latest.current = state;
  }, [state]);

  // Fim do descanso: háptico (opcional) uma única vez e limpeza do aviso agendado.
  const finished = state.status === 'finished';
  useEffect(() => {
    if (!finished || finishedHandled.current) {
      return;
    }
    finishedHandled.current = true;
    void cancelNotification();
    if (haptic) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
        // aparelho sem háptico ou desligado: o aviso visual basta
      });
    }
  }, [finished, haptic, cancelNotification]);

  // Ao sair da tela do treino, o aviso agendado não deve disparar depois.
  useEffect(() => {
    return () => {
      const id = notificationId.current;
      notificationId.current = null;
      void notifier.cancel(id);
    };
  }, [notifier]);

  return {
    state,
    remainingMs: remainingMs(state, now),
    progress: progress(state, now),
    start: startRest,
    pause: pauseRest,
    resume: resumeRest,
    skip: skipRest,
    adjust: adjustRest,
    step: ADJUST_STEP_SECONDS,
    defaultSeconds: seconds,
  };
}
