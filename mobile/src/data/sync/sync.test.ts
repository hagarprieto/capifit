import type { ApiClient, Schemas } from '@/api/client';
import { ApiError } from '@/api/errors';

import { createMemoryDb } from '../local/memoryDb';
import { migrate } from '../local/migrations';
import { createQueueRepo } from '../local/queueRepo';
import { createSessionsRepo } from '../local/sessionsRepo';
import { buildOfflineSession } from './snapshot';
import { serverContractProblems } from './contract';
import { BATCH_SIZE, createSyncEngine } from './syncEngine';

type Ficha = Schemas['Ficha'];

const USER = 'user-ana';
const DEVICE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function counter(start = 1000) {
  let n = start;
  return () => uuid(++n);
}

const FICHA = {
  id: uuid(101),
  codigo: 'A',
  titulo: 'Treino A',
  ordem: 1,
  exercicios: [
    {
      id: uuid(112),
      exercicio: { id: uuid(502), nome: 'Remada', modalidade: 'reps_carga' },
      ordem: 2,
      series: [{ id: uuid(122), ordem: 1, tipo: 'normal' }],
    },
    {
      id: uuid(111),
      exercicio: { id: uuid(501), nome: 'Supino', modalidade: 'reps_carga' },
      ordem: 1,
      series: [
        { id: uuid(121), ordem: 2, tipo: 'normal' },
        { id: uuid(120), ordem: 1, tipo: 'aquecimento' },
      ],
    },
  ],
} as unknown as Ficha;

describe('snapshot offline (RG-020)', () => {
  it('gera todos os UUIDs no aparelho e liga cada série à prescrita', () => {
    const { session, payload } = buildOfflineSession({ ficha: FICHA, programId: uuid(100), versionNumber: 2 }, '2026-10-22T10:00:00.000Z', counter());

    expect(payload).toEqual({
      sessao_uuid: uuid(1001),
      tipo: 'programado',
      iniciada_em: '2026-10-22T10:00:00.000Z',
      ficha_uuid: uuid(101),
      exercicios: [
        {
          uuid: uuid(1002),
          ficha_exercicio_uuid: uuid(111),
          exercicio_uuid: uuid(501),
          tipo_item: 'prescrito',
          ordem: 1,
          series: [
            { uuid: uuid(1003), serie_prescrita_uuid: uuid(120), ordem: 1, tipo: 'aquecimento' },
            { uuid: uuid(1004), serie_prescrita_uuid: uuid(121), ordem: 2, tipo: 'normal' },
          ],
        },
        { uuid: uuid(1005), ficha_exercicio_uuid: uuid(112), exercicio_uuid: uuid(502), tipo_item: 'prescrito', ordem: 2, series: [{ uuid: uuid(1006), serie_prescrita_uuid: uuid(122), ordem: 1, tipo: 'normal' }] },
      ],
    });
    expect(serverContractProblems({ entidade: 'sessao_treino', tipo: 'criar', payload })).toEqual([]);
    expect(session).toMatchObject({ id: uuid(1001), tipo: 'programado', titulo: 'Treino A', status: 'em_andamento', programa_id: uuid(100), versao_numero: 2, ficha_id: uuid(101), series_total: 3 });
    expect(session.exercicios[0].exercicio.nome).toBe('Supino');
    expect(session.exercicios[0].series.map((s) => [s.id, s.status])).toEqual([[uuid(1003), 'pendente'], [uuid(1004), 'pendente']]);
  });

  it('treino avulso começa sem exercícios e sem ficha', () => {
    const { session, payload } = buildOfflineSession({ title: 'Peito livre' }, '2026-10-22T10:00:00.000Z', counter());

    expect(payload).toEqual({ sessao_uuid: uuid(1001), tipo: 'avulso', iniciada_em: '2026-10-22T10:00:00.000Z', titulo_avulso: 'Peito livre', exercicios: [] });
    expect(serverContractProblems({ entidade: 'sessao_treino', tipo: 'criar', payload })).toEqual([]);
    expect(session).toMatchObject({ tipo: 'avulso', titulo: 'Peito livre', ficha_id: null, programa_id: null, series_total: 0 });
  });
});

type Post = jest.Mock<Promise<{ data: unknown }>, [string, { dispositivo_uuid: string; operacoes: { operacao_uuid: string; sequencia_cliente: number }[] }]>;

function setup() {
  const db = createMemoryDb();
  const post: Post = jest.fn();
  const api = { post } as unknown as ApiClient;
  const queue = createQueueRepo(db, USER);
  const sessions = createSessionsRepo(db, USER);
  const engine = createSyncEngine({ api, queue, sessions, deviceUuid: DEVICE });
  return { db, post, queue, sessions, engine };
}

const applied = (ops: { operacao_uuid: string }[]) => ({ data: { server_time: '2026-10-22T10:00:00Z', resultados: ops.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: 'aplicada', recurso_uuid: null })) } });

async function enqueueSession(env: ReturnType<typeof setup>, id = 1) {
  const { session, payload } = buildOfflineSession({ ficha: FICHA, programId: uuid(100), versionNumber: 1 }, '2026-10-22T10:00:00.000Z', counter(id * 10000));
  await env.sessions.save(session, false);
  await env.queue.enqueue({ operacao_uuid: uuid(900 + id), entidade: 'sessao_treino', entidade_uuid: session.id, sessao_uuid: session.id, tipo: 'criar', payload: payload as Record<string, unknown> });
  await env.queue.enqueue({ operacao_uuid: uuid(950 + id), entidade: 'sessao_treino', entidade_uuid: session.id, sessao_uuid: session.id, tipo: 'concluir', payload: { encerrada_em: '2026-10-22T11:00:00.000Z' } });
  return session.id;
}

async function ready() {
  const env = setup();
  await migrate(env.db);
  return env;
}

afterEach(() => jest.clearAllMocks());

describe('envio da fila', () => {
  it('manda em ordem, com o aparelho e a sequência do cliente, e limpa o que foi aplicado', async () => {
    const env = await ready();
    const sessionId = await enqueueSession(env);
    env.post.mockImplementation(async (_path, body) => applied(body.operacoes));

    const outcome = await env.engine.flush();

    expect(outcome).toEqual({ status: 'done', applied: 2, needsReview: 0 });
    expect(env.post).toHaveBeenCalledTimes(1);
    const [path, body] = env.post.mock.calls[0];
    expect(path).toBe('/sync/push');
    expect(body.dispositivo_uuid).toBe(DEVICE);
    expect(body.operacoes.map((o) => o.operacao_uuid)).toEqual([uuid(901), uuid(951)]);
    expect(body.operacoes[1].sequencia_cliente).toBeGreaterThan(body.operacoes[0].sequencia_cliente);
    expect((await env.queue.counts()).aplicada).toBe(0);
    expect(await env.sessions.unsyncedIds()).toEqual([]);
    expect(await env.sessions.get(sessionId)).not.toBeNull();
    env.db.close();
  });

  it('divide em lotes de 50 mantendo a ordem', async () => {
    const env = await ready();
    for (let i = 1; i <= 120; i += 1) {
      await env.queue.enqueue({ operacao_uuid: uuid(2000 + i), entidade: 'sessao_serie', entidade_uuid: uuid(i), tipo: 'atualizar', payload: { repeticoes: i } });
    }
    env.post.mockImplementation(async (_path, body) => applied(body.operacoes));

    const outcome = await env.engine.flush();

    expect(outcome).toMatchObject({ status: 'done', applied: 120 });
    expect(env.post.mock.calls.map((c) => c[1].operacoes.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 20]);
    expect(env.post.mock.calls[2][1].operacoes[0].operacao_uuid).toBe(uuid(2101));
    env.db.close();
  });

  it('conflito e rejeitada ficam na fila com o motivo e a sessão não vira confirmada', async () => {
    const env = await ready();
    const sessionId = await enqueueSession(env);
    env.post.mockResolvedValue({
      data: {
        server_time: 'x',
        resultados: [
          { operacao_uuid: uuid(901), resultado: 'aplicada' },
          { operacao_uuid: uuid(951), resultado: 'conflito', erro: { code: 'SESSION_CLOSED', message: 'Sessão já encerrada' } },
        ],
      },
    });

    const outcome = await env.engine.flush();

    expect(outcome).toEqual({ status: 'done', applied: 1, needsReview: 1 });
    expect((await env.queue.needsReview())[0]).toMatchObject({ operacao_uuid: uuid(951), estado: 'conflito', erro_codigo: 'SESSION_CLOSED', erro_mensagem: 'Sessão já encerrada' });
    expect(await env.sessions.unsyncedIds()).toEqual([sessionId]);
    expect((await env.queue.pending())).toEqual([]);
    env.db.close();
  });

  it('sem rede: nada se perde, a fila volta a pendente e o reenvio usa as mesmas identidades', async () => {
    const env = await ready();
    await enqueueSession(env);
    env.post.mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' }));

    expect(await env.engine.flush()).toEqual({ status: 'offline', applied: 0 });
    expect((await env.queue.pending()).map((o) => o.operacao_uuid)).toEqual([uuid(901), uuid(951)]);

    env.post.mockImplementationOnce(async (_p, body) => applied(body.operacoes));
    expect(await env.engine.flush()).toMatchObject({ status: 'done', applied: 2 });
    expect(env.post.mock.calls[1][1].operacoes.map((o) => o.operacao_uuid)).toEqual([uuid(901), uuid(951)]);
    env.db.close();
  });

  it('erro do servidor (5xx) e limite de requisições também só adiam', async () => {
    const env = await ready();
    await enqueueSession(env);

    for (const status of [503, 429]) {
      env.post.mockRejectedValueOnce(new ApiError({ status, code: status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR', message: '' }));
      expect(await env.engine.flush()).toMatchObject({ status: 'offline' });
    }
    expect((await env.queue.pending())).toHaveLength(2);
    env.db.close();
  });

  it('lote recusado inteiro (422) fica visível para revisão em vez de repetir sempre', async () => {
    const env = await ready();
    await enqueueSession(env);
    env.post.mockRejectedValueOnce(new ApiError({ status: 422, code: 'VALIDATION_ERROR', message: 'Dados inválidos' }));

    expect(await env.engine.flush()).toEqual({ status: 'blocked', applied: 0, code: 'VALIDATION_ERROR' });
    expect((await env.queue.needsReview()).map((o) => o.estado)).toEqual(['rejeitada', 'rejeitada']);
    expect(await env.queue.pending()).toEqual([]);
    env.db.close();
  });

  it('operação sem resposta volta para a fila e segue na rodada seguinte', async () => {
    const env = await ready();
    await enqueueSession(env);
    env.post.mockResolvedValueOnce({ data: { server_time: 'x', resultados: [{ operacao_uuid: uuid(901), resultado: 'aplicada' }] } });
    env.post.mockImplementationOnce(async (_p, body) => applied(body.operacoes));

    expect(await env.engine.flush()).toMatchObject({ status: 'done', applied: 2 });
    expect(env.post.mock.calls[1][1].operacoes.map((o) => o.operacao_uuid)).toEqual([uuid(951)]);
    env.db.close();
  });

  it('servidor que não responde nenhuma operação não prende o envio num laço', async () => {
    const env = await ready();
    await enqueueSession(env);
    env.post.mockResolvedValue({ data: { server_time: 'x', resultados: [] } });

    expect(await env.engine.flush()).toEqual({ status: 'offline', applied: 0 });
    expect(env.post).toHaveBeenCalledTimes(1);
    expect(await env.queue.pending()).toHaveLength(2);
    env.db.close();
  });

  it('retoma o que ficou "enviando" quando o app fechou no meio do envio', async () => {
    const env = await ready();
    await enqueueSession(env);
    await env.queue.markSending([uuid(901)]);
    env.post.mockImplementation(async (_p, body) => applied(body.operacoes));

    expect(await env.engine.flush()).toMatchObject({ status: 'done', applied: 2 });
    env.db.close();
  });

  it('dois pedidos de envio ao mesmo tempo viram um só', async () => {
    const env = await ready();
    await enqueueSession(env);
    env.post.mockImplementation(async (_p, body) => applied(body.operacoes));

    const [a, b] = await Promise.all([env.engine.flush(), env.engine.flush()]);

    expect(a).toEqual(b);
    expect(env.post).toHaveBeenCalledTimes(1);
    env.db.close();
  });

  it('fila vazia não chama o servidor', async () => {
    const env = await ready();

    expect(await env.engine.flush()).toEqual({ status: 'done', applied: 0, needsReview: 0 });
    expect(env.post).not.toHaveBeenCalled();
    env.db.close();
  });
});
