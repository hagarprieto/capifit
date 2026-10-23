import type { TodayCache } from '../cache/todayWorkout';
import { loadActiveWithCache } from '../cache/todayWorkout';
import type { QueueRepo } from '../local/queueRepo';
import type { SessionsRepo } from '../local/sessionsRepo';
import type { ProgramsApi } from '@/features/programs/programsApi';
import type { WorkoutApi } from '@/features/workout/workoutApi';

type Deps = {
  /** A API online (não a "local primeiro"): a reconciliação quer o que o SERVIDOR tem. */
  remote: WorkoutApi;
  programsApi: ProgramsApi;
  sessions: SessionsRepo;
  queue: QueueRepo;
  today: TodayCache | null;
};

/**
 * Reconciliação por snapshot depois do envio (Doc 05 §10.2, "MVP alternativo": sem delta sync). Quando a fila termina de
 * enviar, o aparelho confere com o servidor:
 * - cada treino que acabou de ficar confirmado e já está encerrado é relido do servidor, e a cópia local passa a ser a
 *   dele (duração calculada, revisões e qualquer ajuste feito no servidor);
 * - o programa ativo e os últimos registros guardados são atualizados.
 * Treino ainda em andamento não é trocado (o usuário pode estar registrando), nem treino com operações na fila (a cópia
 * local tem alterações que o servidor ainda não viu). Tudo é "melhor esforço": sem rede, a cópia local continua valendo.
 */
export function createReconciler({ remote, programsApi, sessions, queue, today }: Deps) {
  async function session(sessionUuid: string): Promise<boolean> {
    const local = await sessions.get(sessionUuid);
    if (!local || local.status === 'em_andamento') {
      return false;
    }
    const server = await remote.getSession(sessionUuid);
    if (server.id !== sessionUuid || server.status === 'em_andamento') {
      return false;
    }
    // Conferido de novo logo antes de gravar: se algo entrou na fila durante a leitura, a cópia local manda.
    if ((await queue.openForSession(sessionUuid)) > 0) {
      return false;
    }
    await sessions.save(server, true);
    return true;
  }

  return {
    /** Reconcilia os treinos informados e atualiza o cache do treino do dia. Nunca lança: falhar é só não reconciliar. */
    async run(sessionUuids: string[]): Promise<{ reconciled: string[] }> {
      const reconciled: string[] = [];
      for (const id of sessionUuids) {
        try {
          if (await session(id)) {
            reconciled.push(id);
          }
        } catch {
          // sem rede ou erro do servidor: fica a cópia local, que já está confirmada
        }
      }
      try {
        await loadActiveWithCache({ programsApi, workoutApi: remote, today });
      } catch {
        // idem
      }
      return { reconciled };
    },
  };
}

export type Reconciler = ReturnType<typeof createReconciler>;
