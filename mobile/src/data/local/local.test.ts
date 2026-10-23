import type { Schemas } from '@/api/client';

import { createCacheRepo, purgeUserData } from './cacheRepo';
import type { LocalDb } from './db';
import { createMemoryDb } from './memoryDb';
import { DatabaseTooNewError, LATEST_VERSION, MIGRATIONS, migrate } from './migrations';
import { createQueueRepo } from './queueRepo';
import { createSessionsRepo } from './sessionsRepo';

type Session = Schemas['Sessao'];

let mockCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockCounter + 700).padStart(12, '0')}` }));

const ANA = 'user-ana';
const BIA = 'user-bia';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function makeSession(over: Partial<Session> = {}, shift = 0): Session {
  const session = {
    id: uuid(1),
    tipo: 'programado',
    titulo: 'Treino A',
    status: 'em_andamento',
    iniciada_em: '2026-10-22T10:00:00.000Z',
    encerrada_em: null,
    duracao_ativa_segundos: null,
    programa_id: uuid(100),
    versao_numero: 2,
    ficha_id: uuid(101),
    observacoes: null,
    exercicios: [
      {
        id: uuid(10),
        ficha_exercicio_id: uuid(110),
        exercicio: { id: uuid(500), nome: 'Supino reto' },
        exercicio_prescrito_id: null,
        tipo_item: 'prescrito',
        ordem: 1,
        series: [
          { id: uuid(20), serie_prescrita_id: uuid(120), ordem: 1, tipo: 'aquecimento', status: 'realizada', carga_kg: 20, repeticoes: 12, concluida_em: '2026-10-22T10:05:00.000Z', revision: 1 },
          { id: uuid(21), serie_prescrita_id: null, ordem: 2, tipo: 'normal', status: 'pendente', revision: 0 },
        ],
      },
      {
        id: uuid(11),
        exercicio: { id: uuid(501), nome: 'Remada curvada' },
        tipo_item: 'adicionado',
        ordem: 2,
        series: [{ id: uuid(22), ordem: 1, tipo: 'normal', status: 'pendente', revision: 0 }],
      },
    ],
    pausas: [{ id: uuid(30), iniciada_em: '2026-10-22T10:20:00.000Z', encerrada_em: '2026-10-22T10:22:00.000Z' }],
    ...over,
  } as unknown as Session;
  if (shift) {
    const move = (id: string) => uuid(Number(id.slice(-12)) + shift);
    for (const item of session.exercicios) {
      item.id = move(item.id);
      for (const set of item.series) {
        set.id = move(set.id);
      }
    }
    for (const pause of session.pausas ?? []) {
      pause.id = move(pause.id);
    }
  }
  return session;
}

let db: ReturnType<typeof createMemoryDb>;

beforeEach(async () => {
  db = createMemoryDb();
  await migrate(db);
});

afterEach(() => db.close());

describe('migrações', () => {
  it('cria o esquema e grava a versão', async () => {
    expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(LATEST_VERSION);
    const tables = (await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((t) => t.name);
    expect(tables).toEqual(['cache_json', 'fila_operacao', 'sessao', 'sessao_exercicio', 'sessao_pausa', 'sessao_serie']);
  });

  it('rodar de novo não faz nada e não perde dados', async () => {
    await createSessionsRepo(db, ANA).save(makeSession(), true);

    await migrate(db);

    expect(await createSessionsRepo(db, ANA).get(uuid(1))).not.toBeNull();
  });

  it('uma migração que falha volta atrás e deixa a versão como estava', async () => {
    const failing = createMemoryDb();
    const original = MIGRATIONS[0];
    MIGRATIONS[0] = `${original}\nCREATE TABLE tabela_quebrada (x INTEGER REFERENCES nao_existe_;`;
    try {
      await expect(migrate(failing)).rejects.toThrow();
    } finally {
      MIGRATIONS[0] = original;
    }

    expect((await failing.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(0);
    expect(await failing.getAllAsync("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual([]);
    await migrate(failing);
    expect((await failing.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(LATEST_VERSION);
    failing.close();
  });

  it('um banco na versão 1 com dados sobe para a atual sem perder nada', async () => {
    const old = createMemoryDb();
    await old.execAsync(`${MIGRATIONS[0]}
PRAGMA user_version = 1`);
    await old.runAsync("INSERT INTO fila_operacao (operacao_uuid, usuario_uuid, entidade, entidade_uuid, tipo, payload, criada_em, atualizada_em) VALUES ('op-1', 'u', 'sessao_serie', 's', 'atualizar', '{}', 'x', 'x')");

    await migrate(old);

    expect(await old.getAllAsync<{ operacao_uuid: string; sessao_uuid: string | null }>('SELECT operacao_uuid, sessao_uuid FROM fila_operacao')).toEqual([{ operacao_uuid: 'op-1', sessao_uuid: null }]);
    expect((await old.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(LATEST_VERSION);
    old.close();
  });

  it('banco mais novo que o app não é alterado e avisa', async () => {
    const newer = createMemoryDb();
    await newer.execAsync(`CREATE TABLE guardado (x INTEGER); PRAGMA user_version = ${LATEST_VERSION + 1}`);

    await expect(migrate(newer)).rejects.toBeInstanceOf(DatabaseTooNewError);

    expect(await newer.getAllAsync('SELECT * FROM guardado')).toEqual([]);
    newer.close();
  });
});

describe('sessões', () => {
  it('guarda e devolve a sessão inteira no formato da API', async () => {
    const repo = createSessionsRepo(db, ANA);
    await repo.save(makeSession(), false);

    const back = await repo.get(uuid(1));

    expect(back).toMatchObject({ id: uuid(1), tipo: 'programado', titulo: 'Treino A', status: 'em_andamento', programa_id: uuid(100), versao_numero: 2, ficha_id: uuid(101), series_realizadas: 1, series_total: 3 });
    expect(back?.exercicios.map((e) => [e.exercicio.nome, e.tipo_item, e.ordem])).toEqual([
      ['Supino reto', 'prescrito', 1],
      ['Remada curvada', 'adicionado', 2],
    ]);
    expect(back?.exercicios[0].series[0]).toMatchObject({ id: uuid(20), tipo: 'aquecimento', status: 'realizada', carga_kg: 20, repeticoes: 12, revision: 1, serie_prescrita_id: uuid(120) });
    expect(back?.pausas).toEqual([{ id: uuid(30), iniciada_em: '2026-10-22T10:20:00.000Z', encerrada_em: '2026-10-22T10:22:00.000Z' }]);
  });

  it('salvar de novo substitui a cópia (sem séries duplicadas)', async () => {
    const repo = createSessionsRepo(db, ANA);
    await repo.save(makeSession(), false);
    const changed = makeSession();
    changed.exercicios = changed.exercicios.slice(0, 1);

    await repo.save(changed, true);

    const back = await repo.get(uuid(1));
    expect(back?.exercicios).toHaveLength(1);
    expect(await repo.unsyncedIds()).toEqual([]);
  });

  it('uma falha no meio do salvamento não deixa a sessão pela metade', async () => {
    const repo = createSessionsRepo(db, ANA);
    const broken = makeSession();
    broken.exercicios[1].series[0].tipo = 'invalido' as never;

    await expect(repo.save(broken, false)).rejects.toThrow();

    expect(await repo.get(uuid(1))).toBeNull();
    expect(await db.getAllAsync('SELECT * FROM sessao_exercicio')).toEqual([]);
  });

  it('o mesmo UUID de outro usuário é recusado e nunca aparece para o outro', async () => {
    await createSessionsRepo(db, ANA).save(makeSession(), true);
    const bia = createSessionsRepo(db, BIA);

    expect(await bia.get(uuid(1))).toBeNull();
    expect(await bia.open()).toBeNull();
    await expect(bia.save(makeSession(), true)).rejects.toThrow('outro usuário');
    expect(await bia.updateSeries(uuid(21), { carga_kg: 50 })).toBe(false);
    expect(await bia.setStatus(uuid(1), 'cancelada', null, null)).toBe(false);
    expect(await createSessionsRepo(db, ANA).get(uuid(1))).toMatchObject({ status: 'em_andamento' });
  });

  it('acha a sessão em andamento', async () => {
    const repo = createSessionsRepo(db, ANA);
    expect(await repo.open()).toBeNull();
    await repo.save(makeSession(), false);

    expect((await repo.open())?.id).toBe(uuid(1));
  });

  it('atualiza só os campos informados e sobe a revisão', async () => {
    const repo = createSessionsRepo(db, ANA);
    await repo.save(makeSession(), false);

    expect(await repo.updateSeries(uuid(21), { carga_kg: 42.5, repeticoes: 8, status: 'realizada', concluida_em: '2026-10-22T10:30:00.000Z' })).toBe(true);

    const set = (await repo.get(uuid(1)))?.exercicios[0].series[1];
    expect(set).toMatchObject({ carga_kg: 42.5, repeticoes: 8, status: 'realizada', revision: 1, duracao_segundos: null });
    // Aquecimento ao lado não mudou.
    expect((await repo.get(uuid(1)))?.exercicios[0].series[0]).toMatchObject({ carga_kg: 20, revision: 1 });
  });

  it('ignora campos desconhecidos em vez de montá-los no SQL', async () => {
    const repo = createSessionsRepo(db, ANA);
    await repo.save(makeSession(), false);

    await repo.updateSeries(uuid(21), { repeticoes: 5, ['revision = 99, carga_kg']: 1 } as never);

    expect((await repo.get(uuid(1)))?.exercicios[0].series[1]).toMatchObject({ repeticoes: 5, revision: 1, carga_kg: null });
  });

  it('concluir muda o estado e entra no histórico, mais recente primeiro', async () => {
    const repo = createSessionsRepo(db, ANA);
    await repo.save(makeSession({ id: uuid(1), status: 'concluida', encerrada_em: '2026-10-20T11:00:00.000Z', duracao_ativa_segundos: 3000 } as Partial<Session>), true);
    await repo.save(makeSession({ id: uuid(2) }, 1000), false);
    await repo.setStatus(uuid(2), 'concluida', '2026-10-22T11:00:00.000Z', 3300);

    const list = await repo.listCompleted();

    expect(list.map((s) => s.id)).toEqual([uuid(2), uuid(1)]);
    expect(list[0]).toMatchObject({ status: 'concluida', duracao_ativa_segundos: 3300 });
  });

  it('lembra o que ainda não foi confirmado pelo servidor', async () => {
    const repo = createSessionsRepo(db, ANA);
    await repo.save(makeSession({ id: uuid(1) }), false);
    await repo.save(makeSession({ id: uuid(2), iniciada_em: '2026-10-22T12:00:00.000Z' }, 1000), false);

    expect(await repo.unsyncedIds()).toEqual([uuid(1), uuid(2)]);
    await repo.markSynced(uuid(1));
    expect(await repo.unsyncedIds()).toEqual([uuid(2)]);
  });

  it('apagar a sessão leva exercícios, séries e pausas junto', async () => {
    const repo = createSessionsRepo(db, ANA);
    await repo.save(makeSession(), false);

    await repo.remove(uuid(1));

    for (const table of ['sessao', 'sessao_exercicio', 'sessao_serie', 'sessao_pausa']) {
      expect(await db.getAllAsync(`SELECT * FROM ${table}`)).toEqual([]);
    }
  });
});

describe('fila de operações', () => {
  const op = (n: number) => ({ operacao_uuid: uuid(900 + n), entidade: 'sessao_serie' as const, entidade_uuid: uuid(20 + n), tipo: 'atualizar' as const, payload: { repeticoes: n } });

  it('mantém a ordem de criação e o UUID da operação', async () => {
    const queue = createQueueRepo(db, ANA);
    const first = await queue.enqueue(op(1));
    const second = await queue.enqueue(op(2));

    expect(second.sequencia).toBeGreaterThan(first.sequencia);
    expect((await queue.pending()).map((o) => o.operacao_uuid)).toEqual([uuid(901), uuid(902)]);
    expect(first).toMatchObject({ estado: 'pendente', tentativas: 0, payload: { repeticoes: 1 } });
  });

  it('gera um UUID próprio quando não é informado', async () => {
    const queued = await createQueueRepo(db, ANA).enqueue({ entidade: 'sessao_treino', entidade_uuid: uuid(1), tipo: 'criar', payload: {} });

    expect(queued.operacao_uuid).toMatch(/^[0-9a-f-]{36}$/);
    const other = await createQueueRepo(db, ANA).enqueue({ entidade: 'sessao_treino', entidade_uuid: uuid(1), tipo: 'concluir', payload: {} });
    expect(other.operacao_uuid).not.toBe(queued.operacao_uuid);
  });

  it('o mesmo operacao_uuid não entra duas vezes', async () => {
    const queue = createQueueRepo(db, ANA);
    await queue.enqueue(op(1));

    await expect(queue.enqueue(op(1))).rejects.toThrow();
    expect(await queue.pending()).toHaveLength(1);
  });

  it('enviando, aplicada e limpeza', async () => {
    const queue = createQueueRepo(db, ANA);
    await queue.enqueue(op(1));
    await queue.enqueue(op(2));

    await queue.markSending([uuid(901), uuid(902)]);
    expect(await queue.pending()).toEqual([]);
    await queue.markApplied(uuid(901));

    expect(await queue.counts()).toMatchObject({ aplicada: 1, enviando: 1, pendente: 0 });
    expect(await queue.purgeApplied()).toBe(1);
    expect((await queue.counts()).aplicada).toBe(0);
  });

  it('o que ficou enviando por causa de um fechamento volta para pendente com a mesma identidade', async () => {
    const queue = createQueueRepo(db, ANA);
    await queue.enqueue(op(1));
    await queue.markSending([uuid(901)]);

    expect(await queue.requeueInterrupted()).toBe(1);

    const [again] = await queue.pending();
    expect(again).toMatchObject({ operacao_uuid: uuid(901), tentativas: 1, estado: 'pendente' });
  });

  it('rejeitada e conflito não somem: ficam para revisão e podem ser reenviadas', async () => {
    const queue = createQueueRepo(db, ANA);
    await queue.enqueue(op(1));
    await queue.enqueue(op(2));
    await queue.markFailed(uuid(901), 'rejeitada', 'VALIDATION_ERROR', 'Valor inválido');
    await queue.markFailed(uuid(902), 'conflito', 'CONFLICT', 'Alterada em outro aparelho');

    expect((await queue.needsReview()).map((o) => [o.operacao_uuid, o.estado, o.erro_codigo])).toEqual([
      [uuid(901), 'rejeitada', 'VALIDATION_ERROR'],
      [uuid(902), 'conflito', 'CONFLICT'],
    ]);
    expect(await queue.purgeApplied()).toBe(0);
    expect(await queue.retry(uuid(901))).toBe(true);
    expect(await queue.retry(uuid(901))).toBe(false); // já voltou a pendente
    expect((await queue.pending()).map((o) => o.operacao_uuid)).toEqual([uuid(901)]);
    expect((await queue.needsReview()).map((o) => o.operacao_uuid)).toEqual([uuid(902)]);
  });

  it('cada usuário só enxerga e altera a própria fila', async () => {
    await createQueueRepo(db, ANA).enqueue(op(1));
    const bia = createQueueRepo(db, BIA);

    expect(await bia.pending()).toEqual([]);
    await bia.markApplied(uuid(901));
    expect((await createQueueRepo(db, ANA).counts()).pendente).toBe(1);
  });
});

describe('cache e limpeza', () => {
  it('guarda, lê, substitui e remove por usuário', async () => {
    const cache = createCacheRepo(db, ANA);

    expect(await cache.get('programa-ativo')).toBeNull();
    await cache.set('programa-ativo', { id: 'p1', titulo: 'Full body' });
    await cache.set('programa-ativo', { id: 'p2', titulo: 'ABC' });

    expect((await cache.get<{ id: string }>('programa-ativo'))?.value).toEqual({ id: 'p2', titulo: 'ABC' });
    expect(await createCacheRepo(db, BIA).get('programa-ativo')).toBeNull();
    await cache.remove('programa-ativo');
    expect(await cache.get('programa-ativo')).toBeNull();
  });

  it('valor corrompido vira ausente', async () => {
    await db.runAsync("INSERT INTO cache_json VALUES (?, 'x', '{quebrado', '2026-10-22T10:00:00.000Z')", [ANA]);

    expect(await createCacheRepo(db, ANA).get('x')).toBeNull();
  });

  it('apagar os dados de um usuário não toca nos do outro', async () => {
    for (const user of [ANA, BIA]) {
      await createSessionsRepo(db, user).save(makeSession({ id: user === ANA ? uuid(1) : uuid(2) }, user === ANA ? 0 : 1000), false);
      await createQueueRepo(db, user).enqueue({ entidade: 'sessao_treino', entidade_uuid: uuid(1), tipo: 'criar', payload: {} });
      await createCacheRepo(db, user).set('k', 1);
    }

    await purgeUserData(db, ANA);

    expect(await createSessionsRepo(db, ANA).get(uuid(1))).toBeNull();
    expect((await createQueueRepo(db, ANA).counts()).pendente).toBe(0);
    expect(await createCacheRepo(db, ANA).get('k')).toBeNull();
    expect(await createSessionsRepo(db, BIA).get(uuid(2))).not.toBeNull();
    expect((await createQueueRepo(db, BIA).counts()).pendente).toBe(1);
    expect(await createCacheRepo(db, BIA).get('k')).not.toBeNull();
  });
});

// A interface fica estável para a camada de dados que virá (E08-02/03): este tipo falha na compilação se mudar.
const _contract: LocalDb | null = null;
void _contract;
