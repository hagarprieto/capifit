import type { ApiClient, Schemas } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { ActiveProgram } from '@/features/programs/programsApi';
import type { WorkoutApi } from '@/features/workout/workoutApi';

import { createTodayCache } from '../cache/todayWorkout';
import { createCacheRepo } from '../local/cacheRepo';
import { createMemoryDb } from '../local/memoryDb';
import { migrate } from '../local/migrations';
import { createQueueRepo } from '../local/queueRepo';
import { createSessionsRepo } from '../local/sessionsRepo';
import { createSyncEngine } from '../sync/syncEngine';
import { serverContractProblems } from '../sync/contract';
import { createLocalFirstWorkoutApi } from './localFirstWorkoutApi';

type Session = Schemas['Sessao'];

const USER = 'user-ana';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const networkError = () => new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' });

let mockCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockCounter + 5000).padStart(12, '0')}` }));

const ACTIVE = {
  programa: { id: uuid(100), titulo: 'Full body', origem: 'usuario', status: 'publicado', autor: { id: 'u', nome: 'Ana', papeis: [] }, versao_atual: 3 },
  versao: {
    numero: 3,
    estado: 'publicado',
    revision: 1,
    fichas: [
      {
        id: uuid(101),
        codigo: 'A',
        titulo: 'Treino A',
        ordem: 1,
        exercicios: [
          {
            id: uuid(111),
            exercicio: { id: uuid(501), nome: 'Supino', modalidade: 'reps_carga' },
            ordem: 1,
            series: [
              { id: uuid(121), ordem: 1, tipo: 'normal', reps_min: 8, reps_max: 12, carga_alvo_kg: 60 },
              { id: uuid(122), ordem: 2, tipo: 'normal', reps_min: 8, reps_max: 12, carga_alvo_kg: 60 },
            ],
          },
        ],
      },
    ],
  },
  ativado_em: '2026-10-01T10:00:00.000Z',
} as unknown as ActiveProgram;

const REMOTE_SESSION = {
  id: uuid(900),
  tipo: 'avulso',
  titulo: null,
  status: 'em_andamento',
  iniciada_em: '2026-10-22T09:00:00.000Z',
  encerrada_em: null,
  exercicios: [{ id: uuid(910), exercicio: { id: uuid(501), nome: 'Supino' }, tipo_item: 'prescrito', ordem: 1, series: [{ id: uuid(920), ordem: 1, tipo: 'normal', status: 'pendente', revision: 0 }] }],
  pausas: [],
} as unknown as Session;

let clock = new Date('2026-10-22T10:00:00.000Z');

async function setup(options: { cached?: boolean } = {}) {
  const db = createMemoryDb();
  await migrate(db);
  const sessions = createSessionsRepo(db, USER);
  const queue = createQueueRepo(db, USER);
  // Toda operação que o app cria tem de ser uma que o servidor aceita (campos e obrigatórios do /sync/push).
  const enqueue = queue.enqueue;
  queue.enqueue = async (op) => {
    expect(serverContractProblems(op)).toEqual([]);
    return enqueue(op);
  };
  const today = createTodayCache(createCacheRepo(db, USER));
  if (options.cached !== false) {
    await today.save({ active: ACTIVE, lastRecords: { [uuid(501)]: { exercicio_id: uuid(501), sessao_id: uuid(1), data: '2026-10-20T10:00:00.000Z', series: [{ ordem: 1, carga_kg: 55, repeticoes: 10 }] } } });
  }
  const post = jest.fn().mockRejectedValue(networkError());
  const engine = createSyncEngine({ api: { post } as unknown as ApiClient, queue, sessions, deviceUuid: uuid(7) });
  const remote = {
    openSessionSummary: jest.fn().mockRejectedValue(networkError()),
    recentCompleted: jest.fn().mockRejectedValue(networkError()),
    startFreeWorkout: jest.fn().mockRejectedValue(networkError()),
    startProgrammedWorkout: jest.fn().mockRejectedValue(networkError()),
    getSession: jest.fn().mockRejectedValue(networkError()),
    lastRecords: jest.fn().mockResolvedValue({}),
    programTargets: jest.fn().mockResolvedValue({}),
    completeSeries: jest.fn().mockRejectedValue(networkError()),
    addSeries: jest.fn().mockRejectedValue(networkError()),
    finish: jest.fn().mockRejectedValue(networkError()),
    pause: jest.fn().mockRejectedValue(networkError()),
    resume: jest.fn().mockRejectedValue(networkError()),
    cancel: jest.fn().mockRejectedValue(networkError()),
    addExercise: jest.fn().mockRejectedValue(networkError()),
    replaceExercise: jest.fn().mockRejectedValue(networkError()),
    searchExercises: jest.fn(),
  };
  const api = createLocalFirstWorkoutApi({ remote: remote as unknown as WorkoutApi, sessions, queue, engine: { flush: jest.fn().mockResolvedValue({ status: 'offline', applied: 0 }) } as never, today, now: () => clock });
  return { db, sessions, queue, today, post, engine, remote, api };
}

beforeEach(() => {
  clock = new Date('2026-10-22T10:00:00.000Z');
});

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 20)); // o envio em segundo plano roda depois de gravar
}

describe('começar o treino sem rede', () => {
  it('monta a sessão da ficha salva, com UUIDs do aparelho, e põe a criação na fila', async () => {
    const env = await setup();

    const id = await env.api.startProgrammedWorkout(uuid(101));
    await settle();

    const session = await env.api.getSession(id);
    expect(session).toMatchObject({ tipo: 'programado', titulo: 'Treino A', programa_id: uuid(100), versao_numero: 3, ficha_id: uuid(101), status: 'em_andamento' });
    expect(session.exercicios[0].series.map((s) => s.serie_prescrita_id)).toEqual([uuid(121), uuid(122)]);
    expect(await env.sessions.isSynced(id)).toBe(false);
    const [created] = await env.queue.pending();
    expect(created).toMatchObject({ entidade: 'sessao_treino', tipo: 'criar', entidade_uuid: id, sessao_uuid: id });
    expect(created.payload).toMatchObject({ sessao_uuid: id, ficha_uuid: uuid(101) });
    env.db.close();
  });

  it('treino avulso também começa sem rede', async () => {
    const env = await setup({ cached: false });

    const id = await env.api.startFreeWorkout();

    expect(await env.api.getSession(id)).toMatchObject({ tipo: 'avulso', status: 'em_andamento' });
    env.db.close();
  });

  it('de ficha sem a cópia no aparelho não dá para começar: o erro de conexão aparece', async () => {
    const env = await setup({ cached: false });

    await expect(env.api.startProgrammedWorkout(uuid(101))).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    env.db.close();
  });

  it('erro do servidor que não é de conexão não vira treino local', async () => {
    const env = await setup();
    env.remote.startProgrammedWorkout.mockRejectedValue(new ApiError({ status: 403, code: 'FORBIDDEN', message: '' }));

    await expect(env.api.startProgrammedWorkout(uuid(101))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await env.sessions.open()).toBeNull();
    env.db.close();
  });

  it('com treino local aberto devolve o mesmo em vez de criar outro', async () => {
    const env = await setup();
    const first = await env.api.startProgrammedWorkout(uuid(101));

    expect(await env.api.startFreeWorkout()).toBe(first);
    expect(await env.api.startProgrammedWorkout(uuid(101))).toBe(first);
    expect(env.remote.startFreeWorkout).toHaveBeenCalledTimes(0);
    env.db.close();
  });

  it('com rede usa o servidor e não cria nada na fila', async () => {
    const env = await setup();
    env.remote.startProgrammedWorkout.mockResolvedValue(uuid(900));

    expect(await env.api.startProgrammedWorkout(uuid(101))).toBe(uuid(900));
    expect(await env.queue.pending()).toEqual([]);
    env.db.close();
  });
});

describe('registrar e finalizar no aparelho', () => {
  it('concluir série grava local e enfileira com o mesmo corpo da API', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));
    const seriesId = (await env.api.getSession(id)).exercicios[0].series[0].id;
    clock = new Date('2026-10-22T10:05:00.000Z');

    const done = await env.api.completeSeries(id, seriesId, { carga_kg: 60, repeticoes: 10 });

    expect(done).toMatchObject({ id: seriesId, status: 'realizada', carga_kg: 60, repeticoes: 10, concluida_em: '2026-10-22T10:05:00.000Z' });
    expect(env.remote.completeSeries).not.toHaveBeenCalled();
    const ops = await env.queue.pending();
    expect(ops.map((o) => o.tipo)).toEqual(['criar', 'atualizar']);
    expect(ops[1]).toMatchObject({ entidade: 'sessao_serie', entidade_uuid: seriesId, sessao_uuid: id });
    expect(ops[1].payload).toEqual({ sessao_uuid: id, carga_kg: 60, repeticoes: 10, status: 'realizada', concluida_em: '2026-10-22T10:05:00.000Z', atualizado_cliente_em: '2026-10-22T10:05:00.000Z' });
    env.db.close();
  });

  it('série extra nasce com UUID do aparelho e vai para a fila', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));
    const item = (await env.api.getSession(id)).exercicios[0];

    const extra = await env.api.addSeries(id, item.id);

    expect(extra).toMatchObject({ ordem: 3, tipo: 'normal', status: 'pendente' });
    expect((await env.api.getSession(id)).exercicios[0].series).toHaveLength(3);
    const last = (await env.queue.pending()).at(-1);
    expect(last).toMatchObject({ entidade: 'sessao_serie', tipo: 'criar', entidade_uuid: extra.id });
    expect(last?.payload).toEqual({ sessao_uuid: id, uuid: extra.id, sessao_exercicio_uuid: item.id });
    env.db.close();
  });

  it('finalizar fecha a sessão local, calcula a duração e enfileira a conclusão', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));
    clock = new Date('2026-10-22T10:55:00.000Z');

    await env.api.finish(id);

    expect(await env.api.getSession(id)).toMatchObject({ status: 'concluida', encerrada_em: '2026-10-22T10:55:00.000Z', duracao_ativa_segundos: 3300 });
    expect((await env.queue.pending()).at(-1)).toMatchObject({ tipo: 'concluir', entidade: 'sessao_treino', payload: { encerrada_em: '2026-10-22T10:55:00.000Z' } });
    expect(await env.sessions.open()).toBeNull();
    env.db.close();
  });

  it('o treino concluído sem rede aparece no histórico e na semana do Início', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));
    await env.api.finish(id);

    expect((await env.api.recentCompleted()).map((s) => s.id)).toEqual([id]); // sem rede

    env.remote.recentCompleted.mockResolvedValue([{ id: uuid(800), tipo: 'avulso', status: 'concluida', iniciada_em: '2026-10-20T10:00:00.000Z', encerrada_em: '2026-10-20T11:00:00.000Z' }]);
    expect((await env.api.recentCompleted()).map((s) => s.id)).toEqual([id, uuid(800)]); // com rede, junto com o do servidor
    env.db.close();
  });
});

const FLY = { id: uuid(503), nome: 'Crucifixo', modalidade: 'reps_carga' } as never;
const ROW = { id: uuid(504), nome: 'Remada alta', modalidade: 'reps_carga' } as never;

describe('adicionar e trocar exercício no aparelho', () => {
  it('adicionar sem rede grava o item local e enfileira com o contrato do servidor', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));

    const item = await env.api.addExercise(id, FLY);
    const extra = await env.api.addSeries(id, item.id); // as séries do novo exercício também funcionam sem rede

    expect(item).toMatchObject({ tipo_item: 'adicionado', ordem: 2 });
    expect((await env.api.getSession(id)).exercicios[1].series.map((s) => s.id)).toEqual([extra.id]);
    const ops = await env.queue.pending();
    expect(ops.map((o) => o.entidade + ':' + o.tipo)).toEqual(['sessao_treino:criar', 'sessao_exercicio:criar', 'sessao_serie:criar']);
    expect(ops[1]).toMatchObject({ entidade_uuid: item.id });
    expect(ops[1].payload).toEqual({ sessao_uuid: id, exercicio_uuid: uuid(503) });
    env.db.close();
  });

  it('trocar sem rede leva as séries pendentes ao substituto e enfileira a troca', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));
    const first = (await env.api.getSession(id)).exercicios[0];
    await env.api.completeSeries(id, first.series[0].id, { carga_kg: 60, repeticoes: 10 });

    const replacement = await env.api.replaceExercise(id, first.id, FLY);

    expect(replacement).toMatchObject({ tipo_item: 'substituido', ordem: 2, series: [{ id: first.series[1].id }] });
    const back = await env.api.getSession(id);
    expect(back.exercicios[0].series.map((s) => s.status)).toEqual(['realizada']);
    const last = (await env.queue.pending()).at(-1);
    expect(last).toMatchObject({ entidade: 'sessao_exercicio', tipo: 'criar', entidade_uuid: replacement.id });
    expect(last?.payload).toEqual({ sessao_uuid: id, substitui_uuid: first.id, exercicio_uuid: uuid(503) });
    env.db.close();
  });

  it('com rede vai direto ao servidor e a cópia local acompanha; se a conexão cair, a ação seguinte já funciona', async () => {
    const env = await setup();
    env.remote.getSession.mockResolvedValueOnce(REMOTE_SESSION);
    await env.api.getSession(uuid(900));
    env.remote.addExercise.mockResolvedValueOnce({ id: uuid(940), exercicio: { id: uuid(503), nome: 'Crucifixo' }, tipo_item: 'adicionado', ordem: 2, series: [] });

    const item = await env.api.addExercise(uuid(900), FLY);
    expect(await env.queue.pending()).toEqual([]);
    const series = await env.api.addSeries(uuid(900), item.id); // a conexão caiu logo depois
    expect(series).toMatchObject({ ordem: 1, status: 'pendente' });

    env.remote.replaceExercise.mockResolvedValueOnce({ id: uuid(941), exercicio: { id: uuid(504), nome: 'Remada alta' }, tipo_item: 'substituido', ordem: 3, series: [] });
    expect((await env.queue.pending()).map((o) => o.entidade + ':' + o.tipo)).toEqual(['sessao_serie:criar']);
    env.db.close();
  });

  it('erro do servidor ao trocar (exercício igual, treino encerrado) continua sendo erro', async () => {
    const env = await setup();
    env.remote.getSession.mockResolvedValueOnce(REMOTE_SESSION);
    await env.api.getSession(uuid(900));
    env.remote.replaceExercise.mockRejectedValue(new ApiError({ status: 422, code: 'VALIDATION_ERROR', message: '' }));

    await expect(env.api.replaceExercise(uuid(900), uuid(910), ROW)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await env.queue.pending()).toEqual([]);
    env.db.close();
  });

  it('trocar pelo mesmo exercício sem rede é recusado sem enfileirar nada', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));
    const first = (await env.api.getSession(id)).exercicios[0];

    await expect(env.api.replaceExercise(id, first.id, { id: uuid(501), nome: 'Supino', modalidade: 'reps_carga' } as never)).rejects.toThrow();
    expect((await env.queue.pending()).map((o) => o.tipo)).toEqual(['criar']);
    env.db.close();
  });
});

describe('pausar, retomar e descartar no aparelho', () => {
  it('pausar e retomar gravam a pausa local e enfileiram com o contrato do servidor', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));
    clock = new Date('2026-10-22T10:20:00.000Z');

    const pause = await env.api.pause(id);
    expect(pause).toMatchObject({ iniciada_em: '2026-10-22T10:20:00.000Z', encerrada_em: null });
    expect((await env.api.getSession(id)).pausas).toHaveLength(1);
    expect((await env.api.pause(id)).id).toBe(pause.id); // pausar de novo não cria outra pausa

    clock = new Date('2026-10-22T10:23:00.000Z');
    const resumed = await env.api.resume(id);

    expect(resumed).toMatchObject({ id: pause.id, encerrada_em: '2026-10-22T10:23:00.000Z' });
    const ops = await env.queue.pending();
    expect(ops.map((o) => o.entidade + ':' + o.tipo)).toEqual(['sessao_treino:criar', 'sessao_pausa:criar', 'sessao_pausa:atualizar']);
    expect(ops[1]).toMatchObject({ entidade_uuid: pause.id });
    expect(ops[2].payload).toEqual({ sessao_uuid: id, encerrada_em: '2026-10-22T10:23:00.000Z' });
    env.db.close();
  });

  it('a pausa é descontada da duração ao finalizar', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));
    clock = new Date('2026-10-22T10:20:00.000Z');
    await env.api.pause(id);
    clock = new Date('2026-10-22T10:25:00.000Z');
    await env.api.resume(id);
    clock = new Date('2026-10-22T10:55:00.000Z');

    await env.api.finish(id);

    expect((await env.api.getSession(id)).duracao_ativa_segundos).toBe(3300 - 300);
    env.db.close();
  });

  it('descartar cancela o treino local e enfileira o cancelamento', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));

    await env.api.cancel(id);

    expect(await env.api.getSession(id)).toMatchObject({ status: 'cancelada' });
    expect(await env.sessions.open()).toBeNull();
    expect((await env.queue.pending()).at(-1)).toMatchObject({ entidade: 'sessao_treino', tipo: 'cancelar', payload: {} });
    expect(env.remote.cancel).not.toHaveBeenCalled();
    env.db.close();
  });

  it('treino que o servidor conhece: com rede vai direto; se a conexão cair, salva e enfileira na ordem', async () => {
    const env = await setup();
    env.remote.getSession.mockResolvedValueOnce(REMOTE_SESSION);
    await env.api.getSession(uuid(900));
    env.remote.pause.mockResolvedValueOnce({ id: uuid(930), iniciada_em: '2026-10-22T10:20:00.000Z', encerrada_em: null });

    await env.api.pause(uuid(900)); // com rede
    expect(await env.queue.pending()).toEqual([]);
    expect((await env.sessions.openPause(uuid(900)))?.id).toBe(uuid(930)); // a cópia local acompanha

    const resumed = await env.api.resume(uuid(900)); // a conexão caiu
    expect(resumed).toMatchObject({ id: uuid(930) });
    await env.api.cancel(uuid(900)); // continua pela fila, sem passar pelo servidor
    expect(env.remote.cancel).not.toHaveBeenCalled();
    expect((await env.queue.pending()).map((o) => o.entidade + ':' + o.tipo)).toEqual(['sessao_pausa:atualizar', 'sessao_treino:cancelar']);
    env.db.close();
  });

  it('erro do servidor ao cancelar (treino já encerrado) continua sendo erro', async () => {
    const env = await setup();
    env.remote.getSession.mockResolvedValueOnce(REMOTE_SESSION);
    await env.api.getSession(uuid(900));
    env.remote.cancel.mockRejectedValue(new ApiError({ status: 409, code: 'SESSION_CLOSED', message: '' }));

    await expect(env.api.cancel(uuid(900))).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
    expect(await env.queue.pending()).toEqual([]);
    env.db.close();
  });
});

describe('treino que o servidor já conhece', () => {
  it('com rede tudo vai direto ao servidor e a cópia local acompanha', async () => {
    const env = await setup();
    env.remote.getSession.mockResolvedValue(REMOTE_SESSION);
    env.remote.completeSeries.mockResolvedValue({ id: uuid(920), status: 'realizada', ordem: 1, tipo: 'normal', revision: 1 });

    await env.api.getSession(uuid(900));
    await env.api.completeSeries(uuid(900), uuid(920), { repeticoes: 8 });

    expect(env.remote.completeSeries).toHaveBeenCalledTimes(1);
    expect(await env.queue.pending()).toEqual([]);
    expect(await env.sessions.isSynced(uuid(900))).toBe(true);
    env.db.close();
  });

  it('se a conexão cair no meio, salva no aparelho e as ações seguintes mantêm a ordem pela fila', async () => {
    const env = await setup();
    env.remote.getSession.mockResolvedValueOnce(REMOTE_SESSION);
    await env.api.getSession(uuid(900)); // a cópia local nasce aqui
    env.remote.completeSeries.mockRejectedValueOnce(networkError());

    const done = await env.api.completeSeries(uuid(900), uuid(920), { repeticoes: 8 });

    expect(done).toMatchObject({ status: 'realizada', repeticoes: 8 });
    expect((await env.queue.pending()).map((o) => o.tipo)).toEqual(['atualizar']);
    // Agora há pendência: a próxima ação NÃO vai direto ao servidor (ele ainda não recebeu a anterior).
    await env.api.finish(uuid(900));
    expect(env.remote.finish).not.toHaveBeenCalled();
    expect((await env.queue.pending()).map((o) => o.tipo)).toEqual(['atualizar', 'concluir']);
    env.db.close();
  });

  it('erro do servidor (treino já encerrado) continua sendo erro, sem gravar local', async () => {
    const env = await setup();
    env.remote.getSession.mockResolvedValueOnce(REMOTE_SESSION);
    await env.api.getSession(uuid(900));
    env.remote.completeSeries.mockRejectedValue(new ApiError({ status: 409, code: 'SESSION_CLOSED', message: '' }));

    await expect(env.api.completeSeries(uuid(900), uuid(920), { repeticoes: 8 })).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
    expect(await env.queue.pending()).toEqual([]);
    env.db.close();
  });

  it('sem cópia local e sem rede, o erro de conexão segue para a tela', async () => {
    const env = await setup();

    await expect(env.api.completeSeries(uuid(900), uuid(920), { repeticoes: 8 })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    await expect(env.api.getSession(uuid(900))).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    env.db.close();
  });

  it('reabrir sem rede recupera o treino da cópia local', async () => {
    const env = await setup();
    env.remote.getSession.mockResolvedValueOnce(REMOTE_SESSION);
    await env.api.getSession(uuid(900));

    expect(await env.api.getSession(uuid(900))).toMatchObject({ id: uuid(900), status: 'em_andamento' });
    expect(await env.api.openSession()).toBe(uuid(900));
    env.db.close();
  });
});

describe('leituras de apoio sem rede', () => {
  it('últimos registros e metas vêm do que ficou salvo', async () => {
    const env = await setup();

    expect((await env.api.lastRecords([uuid(501), uuid(999)]))[uuid(501)].series[0].carga_kg).toBe(55);
    expect(Object.keys(await env.api.lastRecords([uuid(999)]))).toEqual([]);
    expect(await env.api.programTargets(uuid(100), 3)).toEqual({
      [uuid(121)]: { repsMin: 8, repsMax: 12, loadKg: 60, durationSeconds: null },
      [uuid(122)]: { repsMin: 8, repsMax: 12, loadKg: 60, durationSeconds: null },
    });
    expect(await env.api.programTargets(uuid(100), 2)).toEqual({}); // outra versão: não inventa meta
    env.db.close();
  });

  it('o treino aberto: pendente local manda; senão o do servidor; sem rede, a cópia local', async () => {
    const env = await setup();
    env.remote.openSessionSummary.mockResolvedValue({ id: uuid(900), status: 'em_andamento' });
    expect((await env.api.openSessionSummary())?.id).toBe(uuid(900));

    env.remote.getSession.mockResolvedValueOnce(REMOTE_SESSION);
    await env.api.getSession(uuid(900)); // cópia local já confirmada
    env.remote.openSessionSummary.mockRejectedValue(networkError());
    expect((await env.api.openSessionSummary())?.id).toBe(uuid(900));

    await env.sessions.setStatus(uuid(900), 'cancelada', null, null);
    env.remote.openSessionSummary.mockResolvedValue({ id: uuid(901), status: 'em_andamento' });
    const local = await env.api.startFreeWorkout(); // sem rede: nasce local e passa a mandar
    env.remote.openSessionSummary.mockResolvedValue({ id: uuid(901), status: 'em_andamento' });
    expect((await env.api.openSessionSummary())?.id).toBe(local);
    env.db.close();
  });
});

describe('ciclo completo: sem rede e depois com rede', () => {
  it('começa, registra e finaliza offline; ao voltar a rede o servidor recebe tudo na ordem e a sessão fica confirmada', async () => {
    const env = await setup();
    const id = await env.api.startProgrammedWorkout(uuid(101));
    const series = (await env.api.getSession(id)).exercicios[0].series;
    await env.api.completeSeries(id, series[0].id, { carga_kg: 60, repeticoes: 10 });
    await env.api.completeSeries(id, series[1].id, { carga_kg: 60, repeticoes: 9 });
    await env.api.finish(id);
    await settle();

    env.post.mockImplementation(async (_path: string, body: { operacoes: { operacao_uuid: string }[] }) => ({
      data: { server_time: 'x', resultados: body.operacoes.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: 'aplicada' })) },
    }));
    const outcome = await env.engine.flush();

    expect(outcome).toMatchObject({ status: 'done', applied: 4, needsReview: 0 });
    const sent = env.post.mock.calls.at(-1)?.[1].operacoes as { tipo: string; entidade: string; sequencia_cliente: number }[];
    expect(sent.map((o) => `${o.entidade}:${o.tipo}`)).toEqual(['sessao_treino:criar', 'sessao_serie:atualizar', 'sessao_serie:atualizar', 'sessao_treino:concluir']);
    expect(sent.map((o) => o.sequencia_cliente)).toEqual([...sent.map((o) => o.sequencia_cliente)].sort((a, b) => a - b));
    expect(await env.sessions.unsyncedIds()).toEqual([]);
    expect(await env.queue.pending()).toEqual([]);
    env.db.close();
  });
});
