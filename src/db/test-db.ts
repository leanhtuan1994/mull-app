/* eslint-disable @typescript-eslint/no-require-imports -- Node's SQLite is loaded lazily so the app bundle never sees it. */
import { createSerialQueue } from '@/features/llm/serial-queue';

import { migrate } from './migrations';
import type { Db, SqlValue } from './types';

type Statement = {
  run(...params: SqlValue[]): {
    lastInsertRowid: number | bigint;
    changes: number | bigint;
  };
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
};
type NodeDatabase = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
};

/** An in-memory database for Jest, backed by Node's built-in SQLite (with FTS5). */
export async function createTestDb(): Promise<Db> {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => NodeDatabase;
  };
  const raw = new DatabaseSync(':memory:');
  const transactions = createSerialQueue();
  const plain = <T>(row: unknown) =>
    row ? ({ ...(row as object) } as T) : null;

  const db: Db = {
    async execAsync(source) {
      raw.exec(source);
    },
    async runAsync(source, params = []) {
      const result = raw.prepare(source).run(...params);
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    async getAllAsync<T>(source: string, params: SqlValue[] = []) {
      return raw
        .prepare(source)
        .all(...params)
        .map((row) => plain<T>(row) as T);
    },
    async getFirstAsync<T>(source: string, params: SqlValue[] = []) {
      return plain<T>(raw.prepare(source).get(...params));
    },
    withTransactionAsync(task) {
      return transactions.run(async () => {
        raw.exec('BEGIN');
        try {
          await task();
          raw.exec('COMMIT');
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      });
    },
  };
  await migrate(db);
  return db;
}
