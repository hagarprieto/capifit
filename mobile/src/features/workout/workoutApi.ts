import type { ApiClient, Schemas } from '@/api/client';
import { isApiError } from '@/api/errors';
import { newUuid } from '@/lib/uuid';

import type { SeriesValues } from './input';

export type Session = Schemas['Sessao'];
export type SessionItem = Schemas['SessaoExercicio'];
export type SessionSeries = Schemas['SessaoSerie'];
export type LastRecord = Schemas['UltimoRegistro'];
export type ExerciseSummary = Schemas['ExercicioResumo'];

const nowIso = () => new Date().toISOString();

/** Chamadas do executor de treino. Escritas levam UUID do cliente (reenvio seguro) e série leva o horário do aparelho. */
export function createWorkoutApi(api: ApiClient) {
  return {
    /** UUID da sessão em andamento, se houver. */
    async openSession(): Promise<string | null> {
      const result = await api.get<Schemas['SessaoResumo'][]>('/me/sessoes', { query: { status: 'em_andamento', limit: 1 } });
      return result.data[0]?.id ?? null;
    },

    /** Inicia um treino avulso. Se já houver um aberto, devolve o dele (o servidor aceita só um por vez). */
    async startFreeWorkout(): Promise<string> {
      const sessionUuid = newUuid();
      try {
        await api.post('/me/sessoes', { sessao_uuid: sessionUuid, iniciada_em: nowIso() }, { idempotencyKey: true });
        return sessionUuid;
      } catch (error) {
        const open = isApiError(error) && error.code === 'SESSION_ALREADY_OPEN' ? error.details.sessao_uuid : null;
        if (typeof open === 'string') {
          return open;
        }
        throw error;
      }
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

    async finish(sessionUuid: string): Promise<void> {
      await api.post(`/me/sessoes/${sessionUuid}/concluir`, { encerrada_em: nowIso() }, { idempotencyKey: true });
    },

    async searchExercises(query: string): Promise<ExerciseSummary[]> {
      const result = await api.get<ExerciseSummary[]>('/exercicios', { query: { q: query.trim() === '' ? undefined : query.trim(), limit: 30 } });
      return result.data;
    },
  };
}

export type WorkoutApi = ReturnType<typeof createWorkoutApi>;
