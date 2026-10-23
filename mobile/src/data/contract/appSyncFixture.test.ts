import fs from 'fs';
import path from 'path';

import { ApiError } from '@/api/errors';
import type { ActiveProgram } from '@/features/programs/programsApi';
import type { WorkoutApi } from '@/features/workout/workoutApi';

import { createTodayCache } from '../cache/todayWorkout';
import { createCacheRepo } from '../local/cacheRepo';
import { createMemoryDb } from '../local/memoryDb';
import { migrate } from '../local/migrations';
import { createQueueRepo } from '../local/queueRepo';
import { createSessionsRepo } from '../local/sessionsRepo';
import { createLocalFirstWorkoutApi } from '../offline/localFirstWorkoutApi';

/**
 * Gera as operações que o APP de verdade monta para um treino feito sem rede e compara com o arquivo
 * `backend/tests/fixtures/app-sync-ops.json`. O PHPUnit (`AppSyncContractTest`) empurra esse mesmo arquivo no
 * `/sync/push` da API real, então os dois lados ficam presos ao mesmo contrato: se o app mudar o que envia, este teste
 * falha até a fixture ser regenerada (`UPDATE_CONTRACT_FIXTURE=1 npx jest appSyncFixture`) e a API passa a ser testada
 * com o novo formato.
 */

const FIXTURE = path.resolve(__dirname, '../../../../backend/tests/fixtures/app-sync-ops.json');
const BASE = '2026-10-22T10:00:00.000Z';

let mockCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockCounter).padStart(12, '0')}` }));

const sentinel = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const SENTINELS = {
  ficha: sentinel(1),
  ficha_exercicio: [sentinel(2), sentinel(3)],
  serie_prescrita: [
    [sentinel(11), sentinel(12)],
    [sentinel(13), sentinel(14)],
  ],
  exercicio: [sentinel(21), sentinel(22), sentinel(23), sentinel(24)],
};

const ACTIVE = {
  programa: { id: sentinel(100), titulo: 'Programa', origem: 'usuario', status: 'publicado', autor: { id: 'u', nome: 'A', papeis: [] }, versao_atual: 1 },
  versao: {
    numero: 1,
    estado: 'publicado',
    revision: 1,
    fichas: [
      {
        id: SENTINELS.ficha,
        codigo: 'A',
        titulo: 'Peito e tríceps',
        ordem: 1,
        exercicios: SENTINELS.exercicio.slice(0, 2).map((exercise, i) => ({
          id: SENTINELS.ficha_exercicio[i],
          exercicio: { id: exercise, nome: `Exercício ${i + 1}`, modalidade: 'reps_carga' },
          ordem: i + 1,
          series: [
            { id: SENTINELS.serie_prescrita[i][0], ordem: 1, tipo: 'aquecimento' },
            { id: SENTINELS.serie_prescrita[i][1], ordem: 2, tipo: 'normal' },
          ],
        })),
      },
    ],
  },
  ativado_em: BASE,
} as unknown as ActiveProgram;

const networkError = () => new ApiError({ status: 0, code: 'NETWORK_ERROR', message: '' });

async function scenario(run: (api: WorkoutApi, at: (hhmm: string) => void) => Promise<void>) {
  const db = createMemoryDb();
  await migrate(db);
  const sessions = createSessionsRepo(db, 'user-fixture');
  const queue = createQueueRepo(db, 'user-fixture');
  const today = createTodayCache(createCacheRepo(db, 'user-fixture'));
  await today.save({ active: ACTIVE, lastRecords: {} });
  let clock = new Date(BASE);
  const failing = () => jest.fn().mockRejectedValue(networkError());
  const remote = {
    openSessionSummary: failing(), recentCompleted: failing(), startFreeWorkout: failing(), startProgrammedWorkout: failing(), getSession: failing(),
    lastRecords: jest.fn().mockResolvedValue({}), programTargets: jest.fn().mockResolvedValue({}), completeSeries: failing(), addSeries: failing(),
    pause: failing(), resume: failing(), cancel: failing(), finish: failing(), addExercise: failing(), searchExercises: failing(),
  } as unknown as WorkoutApi;
  // O envio automático em segundo plano é desligado: o arquivo guarda a fila como o app a montou.
  const api = createLocalFirstWorkoutApi({ remote, sessions, queue, engine: { flush: jest.fn().mockResolvedValue(undefined) } as never, today, now: () => clock });
  await run(api, (hhmm) => {
    clock = new Date(`2026-10-22T${hhmm}:00.000Z`);
  });
  const rows = await db.getAllAsync<{ sequencia: number; operacao_uuid: string; entidade: string; entidade_uuid: string; tipo: string; payload: string }>(
    'SELECT sequencia, operacao_uuid, entidade, entidade_uuid, tipo, payload FROM fila_operacao ORDER BY sequencia',
  );
  db.close();
  return rows.map((row) => ({
    operacao_uuid: row.operacao_uuid,
    sequencia_cliente: row.sequencia,
    entidade: row.entidade,
    entidade_uuid: row.entidade_uuid,
    tipo: row.tipo,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  }));
}

async function build() {
  mockCounter = 0; // UUIDs determinísticos: o arquivo gerado é sempre o mesmo
  // Treino de ficha, todo feito sem rede: série a série, uma série extra, uma pausa de 5 min e a conclusão.
  const programado = await scenario(async (api, at) => {
    at('10:00');
    const id = await api.startProgrammedWorkout(SENTINELS.ficha);
    const session = await api.getSession(id);
    const [first, second] = session.exercicios;
    at('10:05');
    await api.completeSeries(id, first.series[0].id, { carga_kg: 20, repeticoes: 12 });
    at('10:07');
    await api.completeSeries(id, first.series[1].id, { carga_kg: 60, repeticoes: 10 });
    at('10:10');
    const extra = await api.addSeries(id, first.id);
    at('10:12');
    await api.completeSeries(id, extra.id, { carga_kg: 55, repeticoes: 8 });
    at('10:15');
    await api.pause(id);
    at('10:20');
    await api.resume(id);
    at('10:25');
    await api.completeSeries(id, second.series[0].id, { carga_kg: 30, repeticoes: 12 });
    at('10:27');
    await api.completeSeries(id, second.series[1].id, { carga_kg: 40, repeticoes: 10 });
    at('10:40');
    await api.finish(id);
  });

  // Treino avulso que o usuário pausou, retomou e depois descartou.
  const avulso = await scenario(async (api, at) => {
    at('10:00');
    const id = await api.startFreeWorkout();
    at('10:03');
    await api.pause(id);
    at('10:04');
    await api.resume(id);
    at('10:06');
    await api.cancel(id);
  });

  // Treino avulso em que o usuário acrescentou um exercício, deixou duas séries, fez uma, trocou o exercício (a série
  // que faltava passa ao substituto) e concluiu — tudo sem rede.
  const troca = await scenario(async (api, at) => {
    at('10:00');
    const id = await api.startFreeWorkout();
    at('10:02');
    const item = await api.addExercise(id, { id: SENTINELS.exercicio[2], nome: 'Crucifixo', modalidade: 'reps_carga' } as never);
    const first = await api.addSeries(id, item.id);
    const second = await api.addSeries(id, item.id);
    at('10:05');
    await api.completeSeries(id, first.id, { carga_kg: 30, repeticoes: 12 });
    at('10:07');
    await api.replaceExercise(id, item.id, { id: SENTINELS.exercicio[3], nome: 'Remada alta', modalidade: 'reps_carga' } as never);
    at('10:10');
    await api.completeSeries(id, second.id, { carga_kg: 25, repeticoes: 12 });
    at('10:20');
    await api.finish(id);
  });

  return {
    comentario: 'GERADO por mobile/src/data/contract/appSyncFixture.test.ts. Não edite: regenere com UPDATE_CONTRACT_FIXTURE=1 npx jest appSyncFixture.',
    base_time: BASE,
    sentinelas: SENTINELS,
    cenarios: {
      programado_completo: {
        operacoes: programado,
        esperado: { tipo: 'programado', status: 'concluida', duracao_ativa_segundos: 40 * 60 - 5 * 60, series_total: 5, series_realizadas: 5, pausas: 1 },
      },
      avulso_com_troca: {
        operacoes: troca,
        esperado: { tipo: 'avulso', status: 'concluida', exercicios: 2, tipos_item: ['adicionado', 'substituido'], series_total: 2, series_realizadas: 2 },
      },
      avulso_descartado: {
        operacoes: avulso,
        esperado: { tipo: 'avulso', status: 'cancelada', pausas: 1 },
      },
    },
  };
}

describe('fixture de operações do app para o servidor', () => {
  it('as operações geradas pelo app são as do arquivo que o backend testa', async () => {
    const generated = `${JSON.stringify(await build(), null, 2)}\n`;
    if (process.env.UPDATE_CONTRACT_FIXTURE === '1') {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, generated);
    }

    expect(fs.existsSync(FIXTURE)).toBe(true);
    // Compara sem diferenças de fim de linha (o arquivo pode ter sido salvo com CRLF no Windows).
    expect(fs.readFileSync(FIXTURE, 'utf8').replace(/\r\n/g, '\n')).toBe(generated);
  });

  it('os cenários têm o que o servidor precisa checar (nada vazio por engano)', async () => {
    const fixture = (await build()) as { cenarios: Record<string, { operacoes: { entidade: string; tipo: string }[] }> };

    expect(fixture.cenarios.programado_completo.operacoes.map((o) => `${o.entidade}:${o.tipo}`)).toEqual([
      'sessao_treino:criar',
      'sessao_serie:atualizar',
      'sessao_serie:atualizar',
      'sessao_serie:criar',
      'sessao_serie:atualizar',
      'sessao_pausa:criar',
      'sessao_pausa:atualizar',
      'sessao_serie:atualizar',
      'sessao_serie:atualizar',
      'sessao_treino:concluir',
    ]);
    expect(fixture.cenarios.avulso_com_troca.operacoes.map((o) => `${o.entidade}:${o.tipo}`)).toEqual([
      'sessao_treino:criar',
      'sessao_exercicio:criar',
      'sessao_serie:criar',
      'sessao_serie:criar',
      'sessao_serie:atualizar',
      'sessao_exercicio:criar',
      'sessao_serie:atualizar',
      'sessao_treino:concluir',
    ]);
    expect(fixture.cenarios.avulso_descartado.operacoes.map((o) => `${o.entidade}:${o.tipo}`)).toEqual(['sessao_treino:criar', 'sessao_pausa:criar', 'sessao_pausa:atualizar', 'sessao_treino:cancelar']);
  });
});

