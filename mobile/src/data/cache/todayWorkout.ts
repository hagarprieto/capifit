import { isApiError } from '@/api/errors';
import type { ActiveProgram, ProgramsApi } from '@/features/programs/programsApi';
import type { LastRecord, WorkoutApi } from '@/features/workout/workoutApi';

import type { CacheRepo } from '../local/cacheRepo';

const KEY = 'treino-do-dia';
const MAX_IDS = 50;

export type TodaySnapshot = {
  /** Programa ativo com a versão completa (fichas, exercícios e séries com UUIDs e metas). `null` = sem programa. */
  active: ActiveProgram | null;
  /** Último registro de cada exercício do programa, para sugerir os valores da série. */
  lastRecords: Record<string, LastRecord>;
};
export type StoredToday = TodaySnapshot & { savedAt: string };

/** Ids dos exercícios do programa (sem repetir), limitados ao que o servidor aceita num lote. */
export function exerciseIds(active: ActiveProgram): string[] {
  return [...new Set(active.versao.fichas.flatMap((ficha) => ficha.exercicios.map((item) => item.exercicio.id)))].slice(0, MAX_IDS);
}

/**
 * Cache do treino do dia (Doc 06 §7.5): o necessário para abrir o Início e preparar o treino sem rede. É só uma cópia
 * de leitura: o servidor continua sendo a fonte da verdade, e cada atualização bem-sucedida substitui a cópia.
 */
export function createTodayCache(cache: CacheRepo) {
  return {
    async read(): Promise<StoredToday | null> {
      const stored = await cache.get<TodaySnapshot>(KEY);
      return stored ? { ...stored.value, lastRecords: stored.value.lastRecords ?? {}, savedAt: stored.updatedAt } : null;
    },

    async save(snapshot: TodaySnapshot): Promise<void> {
      await cache.set(KEY, snapshot);
    },

    async clear(): Promise<void> {
      await cache.remove(KEY);
    },
  };
}

export type TodayCache = ReturnType<typeof createTodayCache>;

/** Sem rede, servidor fora do ar ou limite de requisições: vale usar a cópia. Erro de contrato ou permissão não. */
function isTemporary(error: unknown): boolean {
  return isApiError(error) && (error.isNetwork || error.status >= 500 || error.status === 429 || error.status === 408);
}

export type ActiveResult = { active: ActiveProgram | null; fromCache: boolean; savedAt: string | null };

/**
 * Programa ativo para o Início. Com rede: devolve o do servidor e atualiza a cópia (e, em segundo plano, os últimos
 * registros dos exercícios). Sem rede: devolve a cópia salva, marcada como `fromCache`. Sem cópia, o erro segue para a
 * tela mostrar o aviso. Um erro que não é de conexão nunca é escondido pela cópia.
 */
export async function loadActiveWithCache(deps: { programsApi: ProgramsApi; workoutApi: WorkoutApi; today: TodayCache | null }): Promise<ActiveResult> {
  const { programsApi, workoutApi, today } = deps;
  let active: ActiveProgram | null;
  try {
    active = await programsApi.active();
  } catch (error) {
    const stored = isTemporary(error) && today ? await today.read().catch(() => null) : null;
    if (stored) {
      return { active: stored.active, fromCache: true, savedAt: stored.savedAt };
    }
    throw error;
  }

  if (today) {
    void refresh(active, workoutApi, today).catch(() => undefined);
  }
  return { active, fromCache: false, savedAt: null };
}

async function refresh(active: ActiveProgram | null, workoutApi: WorkoutApi, today: TodayCache): Promise<void> {
  if (!active) {
    await today.clear();
    return;
  }
  const previous = await today.read().catch(() => null);
  // Grava o programa já; os últimos registros chegam em seguida e se somam aos que já havia.
  const kept = previous && previous.active?.programa.id === active.programa.id ? previous.lastRecords : {};
  await today.save({ active, lastRecords: kept });
  const fresh = await workoutApi.lastRecords(exerciseIds(active));
  if (Object.keys(fresh).length > 0) {
    await today.save({ active, lastRecords: { ...kept, ...fresh } });
  }
}
