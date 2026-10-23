import type { ApiClient, Schemas } from '@/api/client';
import { isApiError } from '@/api/errors';
import { newUuid } from '@/lib/uuid';

import { createExercisesApi } from '../exercises/exercisesApi';

import type { SeriesValues } from './input';
import type { Target } from './prefill';

export type Session = Schemas['Sessao'];
export type SessionItem = Schemas['SessaoExercicio'];
export type SessionSeries = Schemas['SessaoSerie'];
export type SessionPause = Schemas['Pausa'];
export type LastRecord = Schemas['UltimoRegistro'];
export type { ExerciseSummary } from '../exercises/exercisesApi';

const nowIso = () => new Date().toISOString();

/** Metas prescritas de uma versão do programa, por id da série prescrita. */
export function targetsFromVersion(version: Schemas['Versao']): Record<string, Target> {
  const targets: Record<string, Target> = {};
  for (const ficha of version.fichas) {
    for (const item of ficha.exercicios) {
      for (const series of item.series) {
        targets[series.id] = {
          repsMin: series.reps_min ?? null,
          repsMax: series.reps_max ?? null,
          loadKg: series.carga_alvo_kg ?? null,
          durationSeconds: series.duracao_alvo_segundos ?? null,
        };
      }
    }
  }
  return targets;
}

/** Chamadas do executor de treino. Escritas levam UUID do cliente (reenvio seguro) e série leva o horário do aparelho. */
export function createWorkoutApi(api: ApiClient) {
  const exercises = createExercisesApi(api);

  async function openSummary(): Promise<Schemas['SessaoResumo'] | null> {
    const result = await api.get<Schemas['SessaoResumo'][]>('/me/sessoes', { query: { status: 'em_andamento', limit: 1 } });
    return result.data[0] ?? null;
  }

  async function startSession(extra: { ficha_uuid?: string }): Promise<string> {
    const sessionUuid = newUuid();
    try {
      await api.post('/me/sessoes', { sessao_uuid: sessionUuid, iniciada_em: nowIso(), ...extra }, { idempotencyKey: true });
      return sessionUuid;
    } catch (error) {
      const open = isApiError(error) && error.code === 'SESSION_ALREADY_OPEN' ? error.details.sessao_uuid : null;
      if (typeof open === 'string') {
        return open;
      }
      throw error;
    }
  }

  return {
    /** Resumo da sessão em andamento (com a ficha de origem, se for programada), ou `null`. */
    openSessionSummary: openSummary,

    /** Sessões concluídas mais recentes primeiro (para a semana, a última sessão e a próxima ficha do Início). */
    async recentCompleted(limit = 30): Promise<Schemas['SessaoResumo'][]> {
      return (await api.get<Schemas['SessaoResumo'][]>('/me/sessoes', { query: { status: 'concluida', limit } })).data;
    },

    /** UUID da sessão em andamento, se houver. */
    async openSession(): Promise<string | null> {
      return (await openSummary())?.id ?? null;
    },

    /** Inicia um treino avulso. Se já houver um aberto, devolve o dele (o servidor aceita só um por vez). */
    async startFreeWorkout(): Promise<string> {
      return startSession({});
    },

    /**
     * Inicia um treino a partir de uma ficha de versão publicada: o servidor copia exercícios e séries prescritas.
     * Se já houver um treino aberto, devolve o dele (quem chama decide se avisa; a tela de ficha já checa antes).
     */
    async startProgrammedWorkout(fichaUuid: string): Promise<string> {
      return startSession({ ficha_uuid: fichaUuid });
    },

    async getSession(sessionUuid: string): Promise<Session> {
      return (await api.get<Session>(`/me/sessoes/${sessionUuid}`)).data;
    },

    /** Último registro de cada exercício (referência de pré-preenchimento). Falha aqui não impede treinar. */
    async lastRecords(exerciseIds: string[]): Promise<Record<string, LastRecord>> {
      const ids = [...new Set(exerciseIds)].slice(0, 50);
      if (ids.length === 0) {
        return {};
      }
      try {
        const result = await api.get<LastRecord[]>('/me/exercicios/ultimos-registros', { query: { ids: ids.join(',') } });
        return Object.fromEntries(result.data.map((record) => [record.exercicio_id, record]));
      } catch {
        return {};
      }
    },

    /**
     * Metas prescritas da versão do programa de onde a sessão nasceu, por id da série prescrita (a sessão guarda esse
     * vínculo em `serie_prescrita_id`). Serve só de sugestão: se falhar, o treino segue com o último registro.
     */
    async programTargets(programId: string, versionNumber: number): Promise<Record<string, Target>> {
      try {
        return targetsFromVersion((await api.get<Schemas['Versao']>(`/programas/${programId}/versoes/${versionNumber}`)).data);
      } catch {
        return {};
      }
    },

    async completeSeries(sessionUuid: string, seriesId: string, values: SeriesValues): Promise<SessionSeries> {
      const result = await api.patch<SessionSeries>(`/me/sessoes/${sessionUuid}/series/${seriesId}`, { ...values, status: 'realizada', atualizado_cliente_em: nowIso() });
      return result.data;
    },

    async addSeries(sessionUuid: string, itemId: string): Promise<SessionSeries> {
      const result = await api.post<SessionSeries>(`/me/sessoes/${sessionUuid}/series`, { uuid: newUuid(), sessao_exercicio_uuid: itemId });
      return result.data;
    },

    async addExercise(sessionUuid: string, exerciseUuid: string): Promise<SessionItem> {
      const result = await api.post<SessionItem>(`/me/sessoes/${sessionUuid}/exercicios`, { uuid: newUuid(), exercicio_uuid: exerciseUuid });
      return result.data;
    },

    /** Pausa o treino (o tempo parado não conta na duração). Repetir não cria outra pausa. */
    async pause(sessionUuid: string): Promise<SessionPause> {
      return (await api.post<SessionPause>(`/me/sessoes/${sessionUuid}/pausar`)).data;
    },

    async resume(sessionUuid: string): Promise<SessionPause> {
      return (await api.post<SessionPause>(`/me/sessoes/${sessionUuid}/retomar`)).data;
    },

    /** Descarta o treino: ele é cancelado e não entra no histórico. */
    async cancel(sessionUuid: string): Promise<void> {
      await api.post(`/me/sessoes/${sessionUuid}/cancelar`, {}, { idempotencyKey: true });
    },

    async finish(sessionUuid: string): Promise<void> {
      await api.post(`/me/sessoes/${sessionUuid}/concluir`, { encerrada_em: nowIso() }, { idempotencyKey: true });
    },

    searchExercises: exercises.search,
  };
}

export type WorkoutApi = ReturnType<typeof createWorkoutApi>;
