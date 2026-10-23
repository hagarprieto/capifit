import type { Schemas } from '@/api/client';

import type { LocalDb, SqlValue } from './db';

type Session = Schemas['Sessao'];
type SessionItem = Schemas['SessaoExercicio'];
type SessionSeries = Schemas['SessaoSerie'];
type SessionSummary = Schemas['SessaoResumo'];

type SessionRow = {
  uuid: string;
  tipo: Session['tipo'];
  titulo: string | null;
  programa_uuid: string | null;
  versao_numero: number | null;
  ficha_uuid: string | null;
  status: Session['status'];
  iniciada_em: string;
  encerrada_em: string | null;
  duracao_ativa_segundos: number | null;
  observacoes: string | null;
  sincronizada: number;
};
type ItemRow = {
  uuid: string;
  sessao_uuid: string;
  exercicio_json: string;
  ficha_exercicio_uuid: string | null;
  exercicio_prescrito_uuid: string | null;
  tipo_item: SessionItem['tipo_item'];
  ordem: number;
};
type SeriesRow = {
  uuid: string;
  sessao_exercicio_uuid: string;
  serie_prescrita_uuid: string | null;
  ordem: number;
  tipo: SessionSeries['tipo'];
  status: SessionSeries['status'];
  carga_kg: number | null;
  repeticoes: number | null;
  duracao_segundos: number | null;
  rir_real: number | null;
  concluida_em: string | null;
  revision: number;
};

const orNull = <T>(value: T | null | undefined): T | null => value ?? null;
const SERIES_COLUMNS = ['carga_kg', 'repeticoes', 'duracao_segundos', 'rir_real', 'status', 'concluida_em'] as const;

/** Troca `?` por uma lista de marcadores para `IN (...)`. */
const marks = (count: number) => Array.from({ length: count }, () => '?').join(', ');

function toSeries(row: SeriesRow): SessionSeries {
  return {
    id: row.uuid,
    serie_prescrita_id: row.serie_prescrita_uuid,
    ordem: row.ordem,
    tipo: row.tipo,
    status: row.status,
    carga_kg: row.carga_kg,
    repeticoes: row.repeticoes,
    duracao_segundos: row.duracao_segundos,
    rir_real: row.rir_real,
    concluida_em: row.concluida_em,
    revision: row.revision,
  };
}

function toSummary(row: SessionRow, done = 0, total = 0): SessionSummary {
  return {
    id: row.uuid,
    tipo: row.tipo,
    titulo: row.titulo,
    status: row.status,
    iniciada_em: row.iniciada_em,
    encerrada_em: row.encerrada_em,
    duracao_ativa_segundos: row.duracao_ativa_segundos,
    programa_id: row.programa_uuid,
    versao_numero: row.versao_numero,
    ficha_id: row.ficha_uuid,
    series_realizadas: done,
    series_total: total,
  };
}

/**
 * Sessões de treino guardadas no aparelho. Lê e grava no MESMO formato da API (`Sessao`), para o executor trabalhar
 * igual online e offline. Toda leitura é do usuário informado: dois usuários no mesmo aparelho nunca se enxergam.
 */
export function createSessionsRepo(db: LocalDb, userUuid: string) {
  async function load(row: SessionRow): Promise<Session> {
    const items = await db.getAllAsync<ItemRow>('SELECT * FROM sessao_exercicio WHERE sessao_uuid = ? ORDER BY ordem', [row.uuid]);
    const series = items.length
      ? await db.getAllAsync<SeriesRow>(`SELECT * FROM sessao_serie WHERE sessao_exercicio_uuid IN (${marks(items.length)}) ORDER BY ordem`, items.map((i) => i.uuid))
      : [];
    const pauses = await db.getAllAsync<{ uuid: string; iniciada_em: string; encerrada_em: string | null }>('SELECT * FROM sessao_pausa WHERE sessao_uuid = ? ORDER BY iniciada_em', [row.uuid]);
    const done = series.filter((s) => s.status === 'realizada').length;

    return {
      ...toSummary(row, done, series.length),
      observacoes: row.observacoes,
      exercicios: items.map((item) => ({
        id: item.uuid,
        ficha_exercicio_id: item.ficha_exercicio_uuid,
        exercicio: JSON.parse(item.exercicio_json) as SessionItem['exercicio'],
        exercicio_prescrito_id: item.exercicio_prescrito_uuid,
        tipo_item: item.tipo_item,
        ordem: item.ordem,
        series: series.filter((s) => s.sessao_exercicio_uuid === item.uuid).map(toSeries),
      })),
      pausas: pauses.map((p) => ({ id: p.uuid, iniciada_em: p.iniciada_em, encerrada_em: p.encerrada_em })),
    } as Session;
  }

  return {
    /**
     * Grava a sessão inteira (substitui a cópia local de mesmo UUID). `synced` diz se o servidor já a tem: sessão vinda
     * da API entra com `true`; a criada offline entra com `false` até a fila confirmar.
     */
    async save(session: Session, synced: boolean): Promise<void> {
      await db.transaction(async (tx) => {
        const existing = await tx.getFirstAsync<{ usuario_uuid: string }>('SELECT usuario_uuid FROM sessao WHERE uuid = ?', [session.id]);
        if (existing && existing.usuario_uuid !== userUuid) {
          throw new Error('Sessão pertence a outro usuário deste aparelho.');
        }
        // Os filhos saem em cascata; a sessão é regravada por inteiro dentro da mesma transação.
        await tx.runAsync('DELETE FROM sessao WHERE uuid = ?', [session.id]);
        await tx.runAsync(
          `INSERT INTO sessao (uuid, usuario_uuid, tipo, titulo, programa_uuid, versao_numero, ficha_uuid, status, iniciada_em, encerrada_em, duracao_ativa_segundos, observacoes, sincronizada)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            session.id, userUuid, session.tipo, orNull(session.titulo), orNull(session.programa_id), orNull(session.versao_numero), orNull(session.ficha_id),
            session.status, session.iniciada_em, orNull(session.encerrada_em), orNull(session.duracao_ativa_segundos), orNull(session.observacoes), synced ? 1 : 0,
          ],
        );
        for (const item of session.exercicios) {
          await tx.runAsync(
            `INSERT INTO sessao_exercicio (uuid, sessao_uuid, exercicio_uuid, exercicio_json, ficha_exercicio_uuid, exercicio_prescrito_uuid, tipo_item, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [item.id, session.id, item.exercicio.id, JSON.stringify(item.exercicio), orNull(item.ficha_exercicio_id), orNull(item.exercicio_prescrito_id), item.tipo_item, item.ordem],
          );
          for (const set of item.series) {
            await tx.runAsync(
              `INSERT INTO sessao_serie (uuid, sessao_exercicio_uuid, serie_prescrita_uuid, ordem, tipo, status, carga_kg, repeticoes, duracao_segundos, rir_real, concluida_em, revision)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                set.id, item.id, orNull(set.serie_prescrita_id), set.ordem, set.tipo, set.status, orNull(set.carga_kg), orNull(set.repeticoes),
                orNull(set.duracao_segundos), orNull(set.rir_real), orNull(set.concluida_em), set.revision,
              ],
            );
          }
        }
        for (const pause of session.pausas ?? []) {
          await tx.runAsync('INSERT INTO sessao_pausa (uuid, sessao_uuid, iniciada_em, encerrada_em) VALUES (?, ?, ?, ?)', [pause.id, session.id, pause.iniciada_em, orNull(pause.encerrada_em)]);
        }
      });
    },

    async get(uuid: string): Promise<Session | null> {
      const row = await db.getFirstAsync<SessionRow>('SELECT * FROM sessao WHERE uuid = ? AND usuario_uuid = ?', [uuid, userUuid]);
      return row ? load(row) : null;
    },

    /** `true`/`false` = a sessão existe no aparelho e o servidor já a tem (ou não); `null` = não existe aqui. */
    async isSynced(uuid: string): Promise<boolean | null> {
      const row = await db.getFirstAsync<{ sincronizada: number }>('SELECT sincronizada FROM sessao WHERE uuid = ? AND usuario_uuid = ?', [uuid, userUuid]);
      return row ? row.sincronizada === 1 : null;
    },

    /** Acrescenta uma série ao exercício da sessão (depois da última), com o UUID já gerado pelo aparelho. */
    async addSeries(itemUuid: string, seriesUuid: string, type: SessionSeries['tipo'] = 'normal'): Promise<SessionSeries | null> {
      const owned = await db.getFirstAsync<{ uuid: string }>(
        'SELECT se.uuid FROM sessao_exercicio se JOIN sessao s ON s.uuid = se.sessao_uuid WHERE se.uuid = ? AND s.usuario_uuid = ?',
        [itemUuid, userUuid],
      );
      if (!owned) {
        return null;
      }
      const last = await db.getFirstAsync<{ ordem: number | null }>('SELECT MAX(ordem) AS ordem FROM sessao_serie WHERE sessao_exercicio_uuid = ?', [itemUuid]);
      const ordem = (last?.ordem ?? 0) + 1;
      await db.runAsync("INSERT INTO sessao_serie (uuid, sessao_exercicio_uuid, ordem, tipo, status, revision) VALUES (?, ?, ?, ?, 'pendente', 0)", [seriesUuid, itemUuid, ordem, type]);
      return { id: seriesUuid, serie_prescrita_id: null, ordem, tipo: type, status: 'pendente', carga_kg: null, repeticoes: null, duracao_segundos: null, rir_real: null, concluida_em: null, revision: 0 };
    },

    /** A sessão em andamento, se houver (só uma por vez). */
    async open(): Promise<Session | null> {
      const row = await db.getFirstAsync<SessionRow>("SELECT * FROM sessao WHERE usuario_uuid = ? AND status = 'em_andamento' ORDER BY iniciada_em DESC LIMIT 1", [userUuid]);
      return row ? load(row) : null;
    },

    /** Sessões concluídas, mais recentes primeiro, com o progresso de séries de cada uma. */
    async listCompleted(limit = 30): Promise<SessionSummary[]> {
      const rows = await db.getAllAsync<SessionRow & { feitas: number; total: number }>(
        `SELECT s.*,
                (SELECT COUNT(*) FROM sessao_serie ss JOIN sessao_exercicio se ON se.uuid = ss.sessao_exercicio_uuid WHERE se.sessao_uuid = s.uuid AND ss.status = 'realizada') AS feitas,
                (SELECT COUNT(*) FROM sessao_serie ss JOIN sessao_exercicio se ON se.uuid = ss.sessao_exercicio_uuid WHERE se.sessao_uuid = s.uuid) AS total
           FROM sessao s WHERE s.usuario_uuid = ? AND s.status = 'concluida' ORDER BY COALESCE(s.encerrada_em, s.iniciada_em) DESC LIMIT ?`,
        [userUuid, limit],
      );
      return rows.map((row) => toSummary(row, row.feitas, row.total));
    },

    /** Atualiza só os campos informados de uma série, preservando o resto, e sobe a revisão local. */
    async updateSeries(seriesUuid: string, values: Partial<Pick<SessionSeries, 'carga_kg' | 'repeticoes' | 'duracao_segundos' | 'rir_real' | 'status' | 'concluida_em'>>): Promise<boolean> {
      // Só colunas conhecidas entram no SQL: o nome vem de uma lista fixa, nunca do objeto recebido.
      const columns = SERIES_COLUMNS.filter((column) => column in values);
      const params: SqlValue[] = columns.map((column) => orNull(values[column] as SqlValue | undefined));
      const result = await db.runAsync(
        `UPDATE sessao_serie SET ${[...columns.map((c) => `${c} = ?`), 'revision = revision + 1'].join(', ')}
          WHERE uuid = ? AND sessao_exercicio_uuid IN (SELECT se.uuid FROM sessao_exercicio se JOIN sessao s ON s.uuid = se.sessao_uuid WHERE s.usuario_uuid = ?)`,
        [...params, seriesUuid, userUuid],
      );
      return result.changes > 0;
    },

    /** Muda o estado da sessão (concluir, cancelar). */
    async setStatus(uuid: string, status: Session['status'], endedAt: string | null, activeSeconds: number | null): Promise<boolean> {
      const result = await db.runAsync('UPDATE sessao SET status = ?, encerrada_em = ?, duracao_ativa_segundos = ? WHERE uuid = ? AND usuario_uuid = ?', [status, endedAt, activeSeconds, uuid, userUuid]);
      return result.changes > 0;
    },

    /** Marca como confirmada pelo servidor (a fila aplicou todas as operações da sessão). */
    async markSynced(uuid: string): Promise<void> {
      await db.runAsync('UPDATE sessao SET sincronizada = 1 WHERE uuid = ? AND usuario_uuid = ?', [uuid, userUuid]);
    },

    /** Sessões que o servidor ainda não tem por inteiro. */
    async unsyncedIds(): Promise<string[]> {
      return (await db.getAllAsync<{ uuid: string }>('SELECT uuid FROM sessao WHERE usuario_uuid = ? AND sincronizada = 0 ORDER BY iniciada_em', [userUuid])).map((r) => r.uuid);
    },

    async remove(uuid: string): Promise<void> {
      await db.runAsync('DELETE FROM sessao WHERE uuid = ? AND usuario_uuid = ?', [uuid, userUuid]);
    },
  };
}

export type SessionsRepo = ReturnType<typeof createSessionsRepo>;
