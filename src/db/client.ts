import * as SQLite from 'expo-sqlite';

import { createSerialQueue } from '@/features/llm/serial-queue';

import { migrate } from './migrations';
import { createRepos, type Repos } from './repos';
import type { Db } from './types';

export const DATABASE_NAME = 'mull.db';

let repos: Repos | null = null;
let opening: Promise<Repos> | null = null;

/**
 * expo-sqlite runs one transaction per connection, so concurrent
 * withTransactionAsync calls are queued instead of nesting.
 */
function wrap(database: SQLite.SQLiteDatabase): Db {
  const transactions = createSerialQueue();
  return {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, params = []) => database.runAsync(source, params),
    getAllAsync: (source, params = []) => database.getAllAsync(source, params),
    getFirstAsync: (source, params = []) =>
      database.getFirstAsync(source, params),
    withTransactionAsync: (task) =>
      transactions.run(() => database.withTransactionAsync(task)),
  };
}

/** Opens and migrates the database once; later calls reuse it. */
export function openDatabase(): Promise<Repos> {
  if (repos) return Promise.resolve(repos);
  opening ??= (async () => {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    const db = wrap(database);
    await migrate(db);
    repos = createRepos(db);
    return repos;
  })();
  return opening;
}

/** The repositories, for code that runs after the root layout has opened the database. */
export function getRepos(): Repos {
  if (!repos) throw new Error('Database is not open yet');
  return repos;
}

/** Tests inject an in-memory database here. */
export function setReposForTesting(next: Repos | null) {
  repos = next;
  opening = null;
}
