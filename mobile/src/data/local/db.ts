import type { SQLiteDatabase } from 'expo-sqlite';

export type SqlValue = string | number | null;

/**
 * O pedaço do SQLite que os repositórios usam. Os repositórios só conhecem esta interface: no app ela vem do
 * `expo-sqlite` (`fromExpo`), nos testes de um SQLite em memória, e as consultas rodam iguais nos dois.
 */
export type LocalDb = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Tudo ou nada: se `task` lançar, nada do que ela gravou fica. Só as consultas feitas pelo `tx` entram na transação. */
  transaction(task: (tx: LocalDb) => Promise<void>): Promise<void>;
};

type Queryable = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

function wrap(source: Queryable, transaction: LocalDb['transaction']): LocalDb {
  return {
    execAsync: (sql) => source.execAsync(sql),
    runAsync: async (sql, params = []) => ({ changes: (await source.runAsync(sql, params)).changes }),
    getFirstAsync: <T>(sql: string, params: SqlValue[] = []) => source.getFirstAsync<T>(sql, params),
    getAllAsync: <T>(sql: string, params: SqlValue[] = []) => source.getAllAsync<T>(sql, params),
    transaction,
  };
}

export function fromExpo(db: SQLiteDatabase): LocalDb {
  const local: LocalDb = wrap(db, (task) => db.withExclusiveTransactionAsync(async (txn) => task(wrap(txn, () => Promise.reject(new Error('transação aninhada'))))));
  return local;
}
