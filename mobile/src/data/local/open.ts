import { openDatabaseAsync } from 'expo-sqlite';

import { fromExpo, type LocalDb } from './db';
import { migrate } from './migrations';

const DATABASE_NAME = 'capifit.db';

let opening: Promise<LocalDb> | null = null;

/**
 * Abre (uma vez por execução) o banco local do app, liga as chaves estrangeiras e aplica as migrações pendentes.
 * Se a abertura falhar, a próxima chamada tenta de novo em vez de guardar o erro para sempre.
 */
export function openLocalDb(): Promise<LocalDb> {
  if (!opening) {
    opening = (async () => {
      const native = await openDatabaseAsync(DATABASE_NAME);
      await native.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const db = fromExpo(native);
      await migrate(db);
      return db;
    })().catch((error) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}
