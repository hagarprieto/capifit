import { DatabaseSync } from 'node:sqlite';

import type { LocalDb, SqlValue } from './db';

/**
 * SQLite em memória (o `node:sqlite` do Node) para os testes dos repositórios e das migrações, com a mesma interface
 * `LocalDb` do app. Só os testes importam este arquivo: ele nunca entra no pacote do aplicativo.
 */
export function createMemoryDb(path = ':memory:'): LocalDb & { close(): void } {
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON');
  let depth = 0;

  const db: LocalDb & { close(): void } = {
    execAsync: async (sql) => {
      raw.exec(sql);
    },
    runAsync: async (sql, params: SqlValue[] = []) => ({ changes: Number(raw.prepare(sql).run(...params).changes) }),
    getFirstAsync: async <T>(sql: string, params: SqlValue[] = []) => ((raw.prepare(sql).get(...params) as T | undefined) ?? null),
    getAllAsync: async <T>(sql: string, params: SqlValue[] = []) => raw.prepare(sql).all(...params) as T[],
    transaction: async (task) => {
      if (depth > 0) {
        throw new Error('transação aninhada');
      }
      depth += 1;
      raw.exec('BEGIN');
      try {
        await task(db);
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth -= 1;
      }
    },
    close: () => raw.close(),
  };
  return db;
}
