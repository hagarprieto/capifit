import type { Schemas } from '@/api/client';
import { newUuid } from '@/lib/uuid';

type Session = Schemas['Sessao'];
type Ficha = Schemas['Ficha'];
type CreatePayload = Schemas['SessaoCriarRequest'];

export type OfflineSession = {
  /** A sessão como o executor a lê (mesmo formato da API), já com todos os UUIDs. */
  session: Session;
  /** O corpo da operação `criar` da fila: o mesmo snapshot, no formato do `/sync/push`. */
  payload: CreatePayload & { tipo: 'programado' | 'avulso' };
};

type Origin = { ficha: Ficha; programId: string; versionNumber: number } | { title?: string };

/**
 * RG-020: o aparelho é a fonte dos UUIDs de tudo que cria offline. Monta a sessão (a partir da ficha, ou avulsa) com os
 * UUIDs de sessão, exercícios e séries gerados aqui; o servidor grava com esses mesmos UUIDs, então as operações
 * seguintes (concluir série, concluir treino) já apontam para registros que existem. Cada série leva o UUID da série
 * prescrita, que liga o registro à meta da ficha.
 */
export function buildOfflineSession(origin: Origin, startedAt: string, uuid: () => string = newUuid): OfflineSession {
  const sessionUuid = uuid();
  const ficha = 'ficha' in origin ? origin.ficha : null;

  const exercises = ficha
    ? [...ficha.exercicios]
        .sort((a, b) => a.ordem - b.ordem)
        .map((item, index) => ({
          uuid: uuid(),
          ficha_exercicio_uuid: item.id,
          exercicio_uuid: item.exercicio.id,
          exercicio: item.exercicio,
          tipo_item: 'prescrito' as const,
          ordem: index + 1,
          series: [...item.series]
            .sort((a, b) => a.ordem - b.ordem)
            .map((set, position) => ({ uuid: uuid(), serie_prescrita_uuid: set.id, ordem: position + 1, tipo: set.tipo })),
        }))
    : [];

  const payload: OfflineSession['payload'] = {
    sessao_uuid: sessionUuid,
    tipo: ficha ? 'programado' : 'avulso',
    iniciada_em: startedAt,
    ...(ficha ? { ficha_uuid: ficha.id } : 'title' in origin && origin.title ? { titulo_avulso: origin.title } : {}),
    exercicios: exercises.map(({ exercicio: _exercicio, ...snapshot }) => snapshot),
  };

  const session = {
    id: sessionUuid,
    tipo: ficha ? 'programado' : 'avulso',
    titulo: ficha ? ficha.titulo : ('title' in origin ? (origin.title ?? null) : null),
    status: 'em_andamento',
    iniciada_em: startedAt,
    encerrada_em: null,
    duracao_ativa_segundos: null,
    programa_id: ficha && 'programId' in origin ? origin.programId : null,
    versao_numero: ficha && 'versionNumber' in origin ? origin.versionNumber : null,
    ficha_id: ficha ? ficha.id : null,
    observacoes: null,
    series_realizadas: 0,
    series_total: exercises.reduce((sum, item) => sum + item.series.length, 0),
    exercicios: exercises.map((item) => ({
      id: item.uuid,
      ficha_exercicio_id: item.ficha_exercicio_uuid,
      exercicio: item.exercicio,
      exercicio_prescrito_id: null,
      tipo_item: item.tipo_item,
      ordem: item.ordem,
      series: item.series.map((set) => ({ id: set.uuid, serie_prescrita_id: set.serie_prescrita_uuid, ordem: set.ordem, tipo: set.tipo, status: 'pendente' as const, revision: 0 })),
    })),
    pausas: [],
  } as unknown as Session;

  return { session, payload };
}
