import type { QueuedOperation, QueueRepo } from '../local/queueRepo';
import type { SessionsRepo } from '../local/sessionsRepo';
import type { SyncEngine } from './syncEngine';

/** Por que o servidor não aceitou a operação, em termos que o usuário entende. */
export type ReviewReason = 'serie_alterada' | 'treino_encerrado' | 'treino_aberto' | 'rejeitado';

export type SeriesView = { carga_kg: number | null; repeticoes: number | null; duracao_segundos: number | null };

export type ReviewItem = {
  op: QueuedOperation;
  reason: ReviewReason;
  /** Nome do exercício, quando a operação é de uma série. */
  exercise: string | null;
  /** O que o usuário registrou neste aparelho (série). */
  mine: SeriesView | null;
  /** O que o servidor tem (série, num conflito). */
  server: SeriesView | null;
  /** Vale enviar o meu por cima: só quando outro aparelho gravou a série (a escrita mais nova vence). */
  canKeepMine: boolean;
  /** Vale mandar a mesma operação de novo: a recusa pode ter sido passageira. */
  canResend: boolean;
};

export type ReviewGroup = {
  sessionUuid: string | null;
  title: string | null;
  startedAt: string | null;
  items: ReviewItem[];
};

const REASONS: Record<string, ReviewReason> = {
  REVISION_CONFLICT: 'serie_alterada',
  SESSION_CLOSED: 'treino_encerrado',
  SESSION_ALREADY_OPEN: 'treino_aberto',
};

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function seriesView(source: Record<string, unknown> | null): SeriesView | null {
  if (!source) {
    return null;
  }
  const view = { carga_kg: num(source.carga_kg), repeticoes: num(source.repeticoes), duracao_segundos: num(source.duracao_segundos) };
  return view.carga_kg === null && view.repeticoes === null && view.duracao_segundos === null ? null : view;
}

type Deps = { queue: QueueRepo; sessions: SessionsRepo; engine: SyncEngine; now?: () => Date };

/**
 * Revisão do que o servidor não aceitou (TEL-050, D-04). Nada é descartado sem o usuário escolher:
 * - **Manter o meu**: reenvia a série com horário novo, que vence a do outro aparelho (última escrita vence);
 * - **Usar o do servidor**: a cópia do aparelho passa a ter os valores do servidor e a operação sai da fila;
 * - **Tentar de novo**: reenvia a mesma operação;
 * - **Descartar**: tira só aquela operação da fila;
 * - **Descartar o treino**: apaga do aparelho o treino e tudo que ficou esperando dele.
 * Reenviar sempre usa um `operacao_uuid` novo: o servidor guarda o resultado de cada um e repetiria a recusa.
 */
export function createReview({ queue, sessions, engine, now = () => new Date() }: Deps) {
  async function itemOf(op: QueuedOperation, exerciseOf: (seriesUuid: string) => string | null): Promise<ReviewItem> {
    const reason = REASONS[op.erro_codigo ?? ''] ?? 'rejeitado';
    const isSeries = op.entidade === 'sessao_serie' && op.tipo === 'atualizar';
    return {
      op,
      reason,
      exercise: op.entidade === 'sessao_serie' ? exerciseOf(op.entidade_uuid) : null,
      mine: isSeries ? seriesView(op.payload) : null,
      server: reason === 'serie_alterada' ? seriesView(op.estado_servidor) : null,
      canKeepMine: reason === 'serie_alterada' && isSeries,
      canResend: reason !== 'treino_encerrado' && reason !== 'serie_alterada',
    };
  }

  /** Depois de resolver, uma sessão sem nada esperando já está toda no servidor. */
  async function settle(sessionUuid: string | null): Promise<void> {
    if (sessionUuid && (await sessions.isSynced(sessionUuid)) === false && (await queue.openForSession(sessionUuid)) === 0) {
      await sessions.markSynced(sessionUuid);
    }
  }

  async function discardSession(sessionUuid: string): Promise<void> {
    await queue.removeForSession(sessionUuid);
    await sessions.remove(sessionUuid);
  }

  const flush = () => void engine.flush().catch(() => undefined);

  async function load(operacaoUuid: string): Promise<QueuedOperation | null> {
    const op = await queue.get(operacaoUuid);
    return op && (op.estado === 'rejeitada' || op.estado === 'conflito') ? op : null;
  }

  return {
    async list(): Promise<ReviewGroup[]> {
      const ops = await queue.needsReview();
      const bySession = new Map<string | null, QueuedOperation[]>();
      for (const op of ops) {
        bySession.set(op.sessao_uuid, [...(bySession.get(op.sessao_uuid) ?? []), op]);
      }
      const groups: ReviewGroup[] = [];
      for (const [sessionUuid, list] of bySession) {
        const session = sessionUuid ? await sessions.get(sessionUuid).catch(() => null) : null;
        const names = new Map<string, string>();
        for (const item of session?.exercicios ?? []) {
          for (const series of item.series) {
            names.set(series.id, item.exercicio.nome);
          }
        }
        groups.push({
          sessionUuid,
          title: session?.titulo ?? null,
          startedAt: session?.iniciada_em ?? null,
          items: await Promise.all(list.map((op) => itemOf(op, (id) => names.get(id) ?? null))),
        });
      }
      return groups;
    },

    /** Reenvia a série do usuário com horário novo para ela ganhar do outro aparelho. */
    async keepMine(operacaoUuid: string): Promise<boolean> {
      const op = await load(operacaoUuid);
      if (!op || op.entidade !== 'sessao_serie') {
        return false;
      }
      const stamp = now().toISOString();
      const replaced = await queue.replace(operacaoUuid, { payload: { ...op.payload, atualizado_cliente_em: stamp } });
      if (replaced) {
        flush();
      }
      return replaced !== null;
    },

    /** Aceita a versão do servidor: a série local passa a ter os valores dele e a operação sai da fila. */
    async useServer(operacaoUuid: string): Promise<boolean> {
      const op = await load(operacaoUuid);
      if (!op || op.entidade !== 'sessao_serie' || !op.estado_servidor) {
        return false;
      }
      await sessions.applyServerSeries(op.entidade_uuid, op.estado_servidor as Parameters<SessionsRepo['applyServerSeries']>[1]);
      await queue.remove(operacaoUuid);
      await settle(op.sessao_uuid);
      return true;
    },

    async resend(operacaoUuid: string): Promise<boolean> {
      const op = await load(operacaoUuid);
      if (!op) {
        return false;
      }
      const replaced = await queue.replace(operacaoUuid, {});
      if (replaced) {
        flush();
      }
      return replaced !== null;
    },

    /** Descarta só esta operação. Se for a criação do treino, o treino inteiro sai (o resto dele não faria sentido). */
    async discard(operacaoUuid: string): Promise<boolean> {
      const op = await load(operacaoUuid);
      if (!op) {
        return false;
      }
      if (op.entidade === 'sessao_treino' && op.tipo === 'criar' && op.sessao_uuid) {
        await discardSession(op.sessao_uuid);
        return true;
      }
      await queue.remove(operacaoUuid);
      await settle(op.sessao_uuid);
      return true;
    },

    discardSession,
  };
}

export type Review = ReturnType<typeof createReview>;
