import { useCallback, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useLocalData } from '@/data/LocalDataProvider';

export type LeaveState =
  | { kind: 'idle' }
  /** Enviando o que está guardado no aparelho antes de sair. */
  | { kind: 'sending' }
  /** Sobrou algo que não deu para enviar: o usuário escolhe o que fazer. */
  | { kind: 'blocked'; waiting: number; review: number }
  | { kind: 'leaving' };

/**
 * Sair da conta sem perder treino (Doc 03 §9.2: "não apagar registros por logout sem tratamento de dados pendentes").
 * Primeiro tenta enviar o que está na fila (precisa da sessão ainda válida, por isso vem antes de sair). Se tudo foi
 * enviado, sai. Se sobrou algo, NÃO sai sozinho: oferece tentar de novo, sair mantendo os registros no aparelho (voltam a
 * ser enviados quando esta conta entrar de novo aqui) ou sair apagando-os (perda definitiva, só por escolha explícita).
 */
export function useLeave() {
  const { signOut } = useAuth();
  const { engine, queue, erase } = useLocalData();
  const [state, setState] = useState<LeaveState>({ kind: 'idle' });

  const leaveNow = useCallback(async () => {
    setState({ kind: 'leaving' });
    try {
      await signOut();
    } finally {
      setState({ kind: 'idle' });
    }
  }, [signOut]);

  const attempt = useCallback(async () => {
    if (!engine || !queue) {
      await leaveNow(); // sem banco local não há nada guardado aqui
      return;
    }
    setState({ kind: 'sending' });
    try {
      const before = await queue.counts();
      if (before.pendente + before.enviando + before.rejeitada + before.conflito > 0) {
        await engine.flush().catch(() => undefined);
      }
      const after = await queue.counts();
      const waiting = after.pendente + after.enviando;
      const review = after.rejeitada + after.conflito;
      if (waiting + review === 0) {
        await leaveNow();
      } else {
        setState({ kind: 'blocked', waiting, review });
      }
    } catch {
      // Não conseguiu nem ler a fila: por segurança não sai (pode haver registros).
      setState({ kind: 'blocked', waiting: 0, review: 0 });
    }
  }, [engine, queue, leaveNow]);

  /** Sair deixando os registros no aparelho. */
  const leaveKeeping = useCallback(() => leaveNow(), [leaveNow]);

  /** Sair apagando do aparelho os treinos e registros que não foram enviados. Definitivo. */
  const leaveErasing = useCallback(async () => {
    setState({ kind: 'leaving' });
    try {
      await erase?.();
      await signOut();
    } finally {
      setState({ kind: 'idle' });
    }
  }, [erase, signOut]);

  const cancel = useCallback(() => setState({ kind: 'idle' }), []);

  return { state, attempt, leaveKeeping, leaveErasing, cancel };
}
