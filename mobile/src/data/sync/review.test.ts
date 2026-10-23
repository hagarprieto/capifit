import type { ApiClient, Schemas } from '@/api/client';

import { createMemoryDb } from '../local/memoryDb';
import { migrate } from '../local/migrations';
import { createQueueRepo } from '../local/queueRepo';
import { createSessionsRepo } from '../local/sessionsRepo';
import { createReview } from './review';
import { buildOfflineSession } from './snapshot';
import { createSyncEngine } from './syncEngine';

type Ficha = Schemas['Ficha'];

const USER = 'user-ana';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let mockCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockCounter + 8000).padStart(12, '0')}` }));

const FICHA = {
  id: uuid(101),
  codigo: 'A',
  titulo: 'Treino A',
  ordem: 1,
  exercicios: [{ id: uuid(111), exercicio: { id: uuid(501), nome: 'Supino reto', modalidade: 'reps_carga' }, ordem: 1, series: [{ id: uuid(121), ordem: 1, tipo: 'normal' }, { id: uuid(122), ordem: 2, tipo: 'normal' }] }],
} as unknown as Ficha;

const NOW = new Date('2026-10-22T12:00:00.000Z');

async function setup() {
  const db = createMemoryDb();
  await migrate(db);
  const sessions = createSessionsRepo(db, USER);
  const queue = createQueueRepo(db, USER);
  const post = jest.fn();
  const engine = createSyncEngine({ api: { post } as unknown as ApiClient, queue, sessions, deviceUuid: uuid(7) });
  const flush = jest.fn().mockResolvedValue({ status: 'done', applied: 0, needsReview: 0 });
  const review = createReview({ queue, sessions, engine: { flush } as never, now: () => NOW });

  // Treino feito sem rede: criou, registrou a série 1 (60 kg × 10) e a série 2.
  const { session, payload } = buildOfflineSession({ ficha: FICHA, programId: uuid(100), versionNumber: 1 }, '2026-10-22T10:00:00.000Z');
  await sessions.save(session, false);
  await queue.enqueue({ entidade: 'sessao_treino', entidade_uuid: session.id, sessao_uuid: session.id, tipo: 'criar', payload: payload as Record<string, unknown> });
  const [s1, s2] = session.exercicios[0].series;
  for (const [series, reps] of [[s1, 10], [s2, 9]] as const) {
    await sessions.updateSeries(series.id, { carga_kg: 60, repeticoes: reps, status: 'realizada', concluida_em: '2026-10-22T10:30:00.000Z' });
    await queue.enqueue({
      entidade: 'sessao_serie',
      entidade_uuid: series.id,
      sessao_uuid: session.id,
      tipo: 'atualizar',
      payload: { carga_kg: 60, repeticoes: reps, status: 'realizada', concluida_em: '2026-10-22T10:30:00.000Z', atualizado_cliente_em: '2026-10-22T10:30:00.000Z' },
    });
  }
  return { db, sessions, queue, post, engine, flush, review, session, s1, s2 };
}

/** O servidor aplica a criação, recusa a série 1 por conflito e a série 2 por treino encerrado. */
async function serverRefuses(env: Awaited<ReturnType<typeof setup>>) {
  env.post.mockImplementation(async (_p: string, body: { operacoes: { operacao_uuid: string; tipo: string; entidade_uuid: string }[] }) => ({
    data: {
      server_time: 'x',
      resultados: body.operacoes.map((o) =>
        o.tipo === 'criar'
          ? { operacao_uuid: o.operacao_uuid, resultado: 'aplicada' }
          : o.entidade_uuid === env.s1.id
            ? { operacao_uuid: o.operacao_uuid, resultado: 'conflito', erro: { code: 'REVISION_CONFLICT', message: 'x' }, estado_servidor: { id: env.s1.id, carga_kg: 55, repeticoes: 8, status: 'realizada' } }
            : { operacao_uuid: o.operacao_uuid, resultado: 'conflito', erro: { code: 'SESSION_CLOSED', message: 'x' } },
      ),
    },
  }));
  await env.engine.flush();
}

describe('revisão do que o servidor não aceitou', () => {
  it('guarda o que o servidor tinha e agrupa por treino, com o exercício e os dois lados', async () => {
    const env = await setup();
    await serverRefuses(env);

    const groups = await env.review.list();

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ sessionUuid: env.session.id, title: 'Treino A', startedAt: '2026-10-22T10:00:00.000Z' });
    const [conflict, closed] = groups[0].items;
    expect(conflict).toMatchObject({ reason: 'serie_alterada', exercise: 'Supino reto', canKeepMine: true, canResend: false });
    expect(conflict.mine).toEqual({ carga_kg: 60, repeticoes: 10, duracao_segundos: null });
    expect(conflict.server).toEqual({ carga_kg: 55, repeticoes: 8, duracao_segundos: null });
    expect(closed).toMatchObject({ reason: 'treino_encerrado', canKeepMine: false, canResend: false, server: null });
    env.db.close();
  });

  it('"Manter o meu" troca a operação por uma nova, com outro UUID e horário novo, e manda enviar', async () => {
    const env = await setup();
    await serverRefuses(env);
    const [conflict] = (await env.review.list())[0].items;

    expect(await env.review.keepMine(conflict.op.operacao_uuid)).toBe(true);

    expect(await env.queue.get(conflict.op.operacao_uuid)).toBeNull();
    const [fresh] = await env.queue.pending();
    expect(fresh.operacao_uuid).not.toBe(conflict.op.operacao_uuid);
    expect(fresh).toMatchObject({ entidade: 'sessao_serie', entidade_uuid: env.s1.id, tipo: 'atualizar', estado: 'pendente', tentativas: 0 });
    expect(fresh.payload).toMatchObject({ carga_kg: 60, repeticoes: 10, atualizado_cliente_em: NOW.toISOString() });
    expect(env.flush).toHaveBeenCalled();
    env.db.close();
  });

  it('"Usar o do servidor" copia os valores dele para o aparelho e tira a operação da fila', async () => {
    const env = await setup();
    await serverRefuses(env);
    const [conflict, closed] = (await env.review.list())[0].items;

    expect(await env.review.useServer(conflict.op.operacao_uuid)).toBe(true);

    const series = (await env.sessions.get(env.session.id))?.exercicios[0].series[0];
    expect(series).toMatchObject({ carga_kg: 55, repeticoes: 8 });
    expect(await env.queue.get(conflict.op.operacao_uuid)).toBeNull();
    expect(await env.sessions.isSynced(env.session.id)).toBe(false); // ainda resta a série 2 em revisão
    expect(await env.review.useServer(closed.op.operacao_uuid)).toBe(false); // sem estado do servidor não há o que copiar
    env.db.close();
  });

  it('quando tudo foi resolvido, o treino passa a confirmado', async () => {
    const env = await setup();
    await serverRefuses(env);
    const [conflict, closed] = (await env.review.list())[0].items;

    await env.review.useServer(conflict.op.operacao_uuid);
    await env.review.discard(closed.op.operacao_uuid);

    expect(await env.sessions.isSynced(env.session.id)).toBe(true);
    expect(await env.review.list()).toEqual([]);
    env.db.close();
  });

  it('"Tentar de novo" reenvia o mesmo conteúdo com UUID novo', async () => {
    const env = await setup();
    env.post.mockImplementation(async (_p: string, body: { operacoes: { operacao_uuid: string; tipo: string }[] }) => ({
      data: { server_time: 'x', resultados: body.operacoes.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: o.tipo === 'criar' ? 'aplicada' : 'rejeitada', erro: { code: 'VALIDATION_ERROR', message: 'x' } })) },
    }));
    await env.engine.flush();
    const [first] = (await env.review.list())[0].items;
    expect(first).toMatchObject({ reason: 'rejeitado', canResend: true });

    expect(await env.review.resend(first.op.operacao_uuid)).toBe(true);

    const [fresh] = await env.queue.pending();
    expect(fresh.operacao_uuid).not.toBe(first.op.operacao_uuid);
    expect(fresh.payload).toEqual(first.op.payload);
    expect(env.flush).toHaveBeenCalled();
    env.db.close();
  });

  it('descartar a criação do treino apaga o treino e tudo que dependia dele, só depois da escolha', async () => {
    const env = await setup();
    env.post.mockImplementation(async (_p: string, body: { operacoes: { operacao_uuid: string }[] }) => ({
      data: { server_time: 'x', resultados: body.operacoes.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: 'conflito', erro: { code: 'SESSION_ALREADY_OPEN', message: 'x' } })) },
    }));
    await env.engine.flush();
    const group = (await env.review.list())[0];
    expect(group.items[0]).toMatchObject({ reason: 'treino_aberto', canResend: true });
    expect(await env.sessions.get(env.session.id)).not.toBeNull(); // nada some sozinho

    await env.review.discard(group.items[0].op.operacao_uuid);

    expect(await env.sessions.get(env.session.id)).toBeNull();
    expect(await env.review.list()).toEqual([]);
    expect((await env.queue.counts()).conflito).toBe(0);
    env.db.close();
  });

  it('só atua em operações que estão mesmo em revisão', async () => {
    const env = await setup();
    const [pending] = await env.queue.pending();

    expect(await env.review.discard(pending.operacao_uuid)).toBe(false);
    expect(await env.review.resend(pending.operacao_uuid)).toBe(false);
    expect(await env.review.keepMine(pending.operacao_uuid)).toBe(false);
    expect(await env.queue.get(pending.operacao_uuid)).not.toBeNull();
    env.db.close();
  });
});
