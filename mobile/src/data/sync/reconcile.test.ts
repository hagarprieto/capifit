import type { ApiClient, Schemas } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { ActiveProgram, ProgramsApi } from '@/features/programs/programsApi';
import type { WorkoutApi } from '@/features/workout/workoutApi';

import { createTodayCache } from '../cache/todayWorkout';
import { createCacheRepo } from '../local/cacheRepo';
import { createMemoryDb } from '../local/memoryDb';
import { migrate } from '../local/migrations';
import { createQueueRepo } from '../local/queueRepo';
import { createSessionsRepo } from '../local/sessionsRepo';
import { createReconciler } from './reconcile';
import { buildOfflineSession } from './snapshot';
import { createSyncEngine } from './syncEngine';

type Session = Schemas['Sessao'];

const USER = 'user-ana';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let mockCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockCounter + 6000).padStart(12, '0')}` }));

const ACTIVE = { programa: { id: uuid(100), titulo: 'Full body', origem: 'usuario', status: 'publicado', autor: { id: 'u', nome: 'Ana', papeis: [] }, versao_atual: 1 }, versao: { numero: 1, estado: 'publicado', revision: 1, fichas: [] }, ativado_em: 'x' } as unknown as ActiveProgram;

async function setup() {
  const db = createMemoryDb();
  await migrate(db);
  const sessions = createSessionsRepo(db, USER);
  const queue = createQueueRepo(db, USER);
  const today = createTodayCache(createCacheRepo(db, USER));
  const getSession = jest.fn();
  const active = jest.fn().mockResolvedValue(ACTIVE);
  const remote = { getSession, lastRecords: jest.fn().mockResolvedValue({}) } as unknown as WorkoutApi;
  const reconciler = createReconciler({ remote, programsApi: { active } as unknown as ProgramsApi, sessions, queue, today });
  return { db, sessions, queue, today, getSession, active, reconciler };
}

/** Treino avulso concluído no aparelho: série registrada com 60 kg × 10. */
async function localDoneSession(env: Awaited<ReturnType<typeof setup>>, status: Session['status'] = 'concluida') {
  const { session } = buildOfflineSession({ title: 'Livre' }, '2026-10-22T10:00:00.000Z');
  const withItem = {
    ...session,
    status,
    exercicios: [{ id: uuid(10), exercicio: { id: uuid(500), nome: 'Supino' }, tipo_item: 'adicionado', ordem: 1, series: [{ id: uuid(20), ordem: 1, tipo: 'normal', status: 'realizada', carga_kg: 60, repeticoes: 10, revision: 1 }] }],
  } as unknown as Session;
  await env.sessions.save(withItem, true);
  return withItem;
}

describe('reconciliação por snapshot', () => {
  it('troca a cópia local do treino encerrado pela do servidor', async () => {
    const env = await setup();
    const local = await localDoneSession(env);
    const server = { ...local, duracao_ativa_segundos: 3300, encerrada_em: '2026-10-22T10:55:00.000Z', exercicios: [{ ...local.exercicios[0], series: [{ ...local.exercicios[0].series[0], repeticoes: 9, revision: 4 }] }] } as Session;
    env.getSession.mockResolvedValue(server);

    const result = await env.reconciler.run([local.id]);

    expect(result.reconciled).toEqual([local.id]);
    const back = await env.sessions.get(local.id);
    expect(back).toMatchObject({ duracao_ativa_segundos: 3300, encerrada_em: '2026-10-22T10:55:00.000Z' });
    expect(back?.exercicios[0].series[0]).toMatchObject({ repeticoes: 9, revision: 4 });
    expect(await env.sessions.isSynced(local.id)).toBe(true);
    env.db.close();
  });

  it('não mexe em treino em andamento (o usuário pode estar registrando)', async () => {
    const env = await setup();
    const local = await localDoneSession(env, 'em_andamento');

    const result = await env.reconciler.run([local.id]);

    expect(result.reconciled).toEqual([]);
    expect(env.getSession).not.toHaveBeenCalled();
    env.db.close();
  });

  it('não troca a cópia se entrou algo na fila durante a leitura', async () => {
    const env = await setup();
    const local = await localDoneSession(env);
    env.getSession.mockImplementation(async () => {
      await env.queue.enqueue({ entidade: 'sessao_serie', entidade_uuid: uuid(20), sessao_uuid: local.id, tipo: 'atualizar', payload: { repeticoes: 12 } });
      return { ...local, duracao_ativa_segundos: 1 } as Session;
    });

    const result = await env.reconciler.run([local.id]);

    expect(result.reconciled).toEqual([]);
    expect((await env.sessions.get(local.id))?.duracao_ativa_segundos).not.toBe(1);
    env.db.close();
  });

  it('sem rede mantém a cópia local e não lança erro', async () => {
    const env = await setup();
    const local = await localDoneSession(env);
    env.getSession.mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' }));
    env.active.mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' }));

    await expect(env.reconciler.run([local.id])).resolves.toEqual({ reconciled: [] });
    expect(await env.sessions.get(local.id)).not.toBeNull();
    env.db.close();
  });

  it('atualiza o programa ativo guardado', async () => {
    const env = await setup();

    await env.reconciler.run([]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(env.active).toHaveBeenCalled();
    expect((await env.today.read())?.active?.programa.titulo).toBe('Full body');
    env.db.close();
  });

  it('ignora treino que não existe no aparelho', async () => {
    const env = await setup();

    expect((await env.reconciler.run([uuid(999)])).reconciled).toEqual([]);
    expect(env.getSession).not.toHaveBeenCalled();
    env.db.close();
  });
});

describe('o motor avisa quando um treino ficou confirmado', () => {
  async function engineSetup() {
    const env = await setup();
    const post = jest.fn();
    const onConfirmed = jest.fn();
    const engine = createSyncEngine({ api: { post } as unknown as ApiClient, queue: env.queue, sessions: env.sessions, deviceUuid: uuid(7), onConfirmed });
    const { session, payload } = buildOfflineSession({ title: 'Livre' }, '2026-10-22T10:00:00.000Z');
    await env.sessions.save(session, false);
    await env.queue.enqueue({ entidade: 'sessao_treino', entidade_uuid: session.id, sessao_uuid: session.id, tipo: 'criar', payload: payload as Record<string, unknown> });
    return { ...env, post, onConfirmed, engine, session };
  }

  it('chama com os treinos confirmados depois do envio completo', async () => {
    const env = await engineSetup();
    env.post.mockImplementation(async (_p: string, body: { operacoes: { operacao_uuid: string }[] }) => ({ data: { server_time: 'x', resultados: body.operacoes.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: 'aplicada' })) } }));

    await env.engine.flush();

    expect(env.onConfirmed).toHaveBeenCalledWith([env.session.id]);
    env.db.close();
  });

  it('não chama quando o servidor recusou ou a rede falhou', async () => {
    const env = await engineSetup();
    env.post.mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' }));
    await env.engine.flush();
    env.post.mockImplementation(async (_p: string, body: { operacoes: { operacao_uuid: string }[] }) => ({ data: { server_time: 'x', resultados: body.operacoes.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: 'conflito', erro: { code: 'SESSION_ALREADY_OPEN', message: 'x' } })) } }));
    await env.engine.flush();

    expect(env.onConfirmed).not.toHaveBeenCalled();
    env.db.close();
  });

  it('um erro na reconciliação não atrapalha o envio', async () => {
    const env = await engineSetup();
    env.onConfirmed.mockImplementation(() => {
      throw new Error('falhou');
    });
    env.post.mockImplementation(async (_p: string, body: { operacoes: { operacao_uuid: string }[] }) => ({ data: { server_time: 'x', resultados: body.operacoes.map((o) => ({ operacao_uuid: o.operacao_uuid, resultado: 'aplicada' })) } }));

    await expect(env.engine.flush()).resolves.toMatchObject({ status: 'done', applied: 1 });
    env.db.close();
  });
});
