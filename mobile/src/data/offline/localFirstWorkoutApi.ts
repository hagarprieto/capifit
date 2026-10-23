import type { Schemas } from '@/api/client';
import type { WorkoutApi } from '@/features/workout/workoutApi';
import { targetsFromVersion } from '@/features/workout/workoutApi';
import type { SeriesValues } from '@/features/workout/input';
import { newUuid } from '@/lib/uuid';

import { isTemporary, type TodayCache } from '../cache/todayWorkout';
import type { QueueRepo } from '../local/queueRepo';
import type { SessionsRepo } from '../local/sessionsRepo';
import { buildOfflineSession } from '../sync/snapshot';
import type { SyncEngine } from '../sync/syncEngine';

type Session = Schemas['Sessao'];
type Series = Schemas['SessaoSerie'];

type Deps = {
  remote: WorkoutApi;
  sessions: SessionsRepo;
  queue: QueueRepo;
  engine: SyncEngine;
  today: TodayCache | null;
  now?: () => Date;
};

/**
 * O executor de treino com o aparelho em primeiro lugar. Tem a mesma interface da API online e decide caso a caso:
 * - Treino que o servidor já conhece e não tem nada pendente: vai ao servidor; se a conexão falhar, o registro é salvo
 *   no aparelho e entra na fila, e o treino segue.
 * - Treino criado sem rede (ou com operações ainda na fila): tudo é gravado no aparelho e enfileirado NA ORDEM, para o
 *   servidor nunca receber uma série de uma sessão que ainda não conhece. Voltou a rede, a fila é enviada.
 * Só falha de conexão cai para o aparelho; erro do servidor (ex.: treino já encerrado) continua aparecendo como erro.
 */
export function createLocalFirstWorkoutApi({ remote, sessions, queue, engine, today, now = () => new Date() }: Deps): WorkoutApi {
  const iso = () => now().toISOString();
  const flushLater = () => {
    void engine.flush().catch(() => undefined);
  };

  /** Modo local: a sessão só existe aqui, ou já tem operações esperando na fila. */
  async function isLocalMode(sessionUuid: string): Promise<boolean> {
    const synced = await sessions.isSynced(sessionUuid);
    if (synced === null) {
      return false;
    }
    return !synced || (await queue.openForSession(sessionUuid)) > 0;
  }

  async function localSession(sessionUuid: string): Promise<Session> {
    const session = await sessions.get(sessionUuid);
    if (!session) {
      throw new Error('Sessão não encontrada neste aparelho.');
    }
    return session;
  }

  async function completeLocally(sessionUuid: string, seriesId: string, values: SeriesValues): Promise<Series> {
    const at = iso();
    const changed = await sessions.updateSeries(seriesId, { ...values, status: 'realizada', concluida_em: at });
    if (!changed) {
      throw new Error('Série não encontrada neste aparelho.');
    }
    await queue.enqueue({
      entidade: 'sessao_serie',
      entidade_uuid: seriesId,
      sessao_uuid: sessionUuid,
      tipo: 'atualizar',
      payload: { ...values, status: 'realizada', concluida_em: at, atualizado_cliente_em: at },
    });
    flushLater();
    const series = (await localSession(sessionUuid)).exercicios.flatMap((item) => item.series).find((s) => s.id === seriesId);
    return series as Series;
  }

  async function addLocally(sessionUuid: string, itemId: string): Promise<Series> {
    const seriesUuid = newUuid();
    const created = await sessions.addSeries(itemId, seriesUuid);
    if (!created) {
      throw new Error('Exercício não encontrado neste aparelho.');
    }
    await queue.enqueue({ entidade: 'sessao_serie', entidade_uuid: seriesUuid, sessao_uuid: sessionUuid, tipo: 'criar', payload: { uuid: seriesUuid, sessao_exercicio_uuid: itemId } });
    flushLater();
    return created;
  }

  async function finishLocally(sessionUuid: string): Promise<void> {
    const session = await localSession(sessionUuid);
    const ended = now();
    const paused = (session.pausas ?? []).reduce((sum, pause) => sum + Math.max(0, new Date(pause.encerrada_em ?? ended.toISOString()).getTime() - new Date(pause.iniciada_em).getTime()), 0);
    const active = Math.max(0, Math.round((ended.getTime() - new Date(session.iniciada_em).getTime() - paused) / 1000));
    await sessions.setStatus(sessionUuid, 'concluida', ended.toISOString(), active);
    await queue.enqueue({ entidade: 'sessao_treino', entidade_uuid: sessionUuid, sessao_uuid: sessionUuid, tipo: 'concluir', payload: { encerrada_em: ended.toISOString() } });
    flushLater();
  }

  async function startOffline(origin: Parameters<typeof buildOfflineSession>[0]): Promise<string> {
    const { session, payload } = buildOfflineSession(origin, iso());
    await sessions.save(session, false);
    await queue.enqueue({ entidade: 'sessao_treino', entidade_uuid: session.id, sessao_uuid: session.id, tipo: 'criar', payload: payload as Record<string, unknown> });
    flushLater();
    return session.id;
  }

  /** Há um treino aberto só neste aparelho (ou com pendências)? Então ele manda: só pode haver um por vez. */
  async function localOpenId(): Promise<string | null> {
    const open = await sessions.open();
    return open && (await isLocalMode(open.id)) ? open.id : null;
  }

  const api: WorkoutApi = {
    ...remote,

    async openSessionSummary() {
      const local = await sessions.open().catch(() => null);
      if (local && (await isLocalMode(local.id))) {
        return local;
      }
      try {
        return await remote.openSessionSummary();
      } catch (error) {
        if (isTemporary(error)) {
          return local;
        }
        throw error;
      }
    },

    async openSession() {
      return (await api.openSessionSummary())?.id ?? null;
    },

    async recentCompleted(limit = 30) {
      const local = await sessions.listCompleted(limit).catch(() => []);
      try {
        const remoteList = await remote.recentCompleted(limit);
        const known = new Set(remoteList.map((s) => s.id));
        const pending = local.filter((s) => !known.has(s.id));
        return [...pending, ...remoteList].sort((a, b) => (b.encerrada_em ?? b.iniciada_em).localeCompare(a.encerrada_em ?? a.iniciada_em)).slice(0, limit);
      } catch (error) {
        if (isTemporary(error)) {
          return local;
        }
        throw error;
      }
    },

    async startFreeWorkout() {
      const open = await localOpenId();
      if (open) {
        return open;
      }
      try {
        return await remote.startFreeWorkout();
      } catch (error) {
        if (isTemporary(error)) {
          return startOffline({});
        }
        throw error;
      }
    },

    async startProgrammedWorkout(fichaUuid: string) {
      const open = await localOpenId();
      if (open) {
        return open;
      }
      try {
        return await remote.startProgrammedWorkout(fichaUuid);
      } catch (error) {
        if (!isTemporary(error)) {
          throw error;
        }
        const stored = await today?.read().catch(() => null);
        const ficha = stored?.active?.versao.fichas.find((f) => f.id === fichaUuid);
        if (!stored?.active || !ficha) {
          throw error; // sem a ficha salva no aparelho não dá para montar o treino sem rede
        }
        return startOffline({ ficha, programId: stored.active.programa.id, versionNumber: stored.active.versao.numero });
      }
    },

    async getSession(sessionUuid: string) {
      if (await isLocalMode(sessionUuid)) {
        return localSession(sessionUuid);
      }
      try {
        const session = await remote.getSession(sessionUuid);
        await sessions.save(session, true).catch(() => undefined); // a cópia local é um reforço: se falhar, o treino segue
        return session;
      } catch (error) {
        const stored = isTemporary(error) ? await sessions.get(sessionUuid).catch(() => null) : null;
        if (stored) {
          return stored;
        }
        throw error;
      }
    },

    async lastRecords(exerciseIds: string[]) {
      const fresh = await remote.lastRecords(exerciseIds);
      if (Object.keys(fresh).length > 0 || exerciseIds.length === 0) {
        return fresh;
      }
      // O cliente devolve {} quando a busca falha: nesse caso vale o que ficou salvo no aparelho.
      const stored = await today?.read().catch(() => null);
      return Object.fromEntries(Object.entries(stored?.lastRecords ?? {}).filter(([id]) => exerciseIds.includes(id)));
    },

    async programTargets(programId: string, versionNumber: number) {
      const fresh = await remote.programTargets(programId, versionNumber);
      if (Object.keys(fresh).length > 0) {
        return fresh;
      }
      const stored = await today?.read().catch(() => null);
      return stored?.active && stored.active.programa.id === programId && stored.active.versao.numero === versionNumber ? targetsFromVersion(stored.active.versao) : fresh;
    },

    async completeSeries(sessionUuid: string, seriesId: string, values: SeriesValues) {
      if (await isLocalMode(sessionUuid)) {
        return completeLocally(sessionUuid, seriesId, values);
      }
      try {
        return await remote.completeSeries(sessionUuid, seriesId, values);
      } catch (error) {
        if (isTemporary(error) && (await sessions.isSynced(sessionUuid)) !== null) {
          return completeLocally(sessionUuid, seriesId, values);
        }
        throw error;
      }
    },

    async addSeries(sessionUuid: string, itemId: string) {
      if (await isLocalMode(sessionUuid)) {
        return addLocally(sessionUuid, itemId);
      }
      try {
        return await remote.addSeries(sessionUuid, itemId);
      } catch (error) {
        if (isTemporary(error) && (await sessions.isSynced(sessionUuid)) !== null) {
          return addLocally(sessionUuid, itemId);
        }
        throw error;
      }
    },

    async finish(sessionUuid: string) {
      if (await isLocalMode(sessionUuid)) {
        return finishLocally(sessionUuid);
      }
      try {
        await remote.finish(sessionUuid);
        // Mantém a cópia local em dia (histórico e semana do Início sem esperar nova leitura); se falhar, não importa.
        await sessions.setStatus(sessionUuid, 'concluida', iso(), null).catch(() => undefined);
      } catch (error) {
        if (isTemporary(error) && (await sessions.isSynced(sessionUuid)) !== null) {
          return finishLocally(sessionUuid);
        }
        throw error;
      }
    },
  };
  return api;
}
