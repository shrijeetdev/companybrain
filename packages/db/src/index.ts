import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Database } from './port';
import { SqliteDatabase } from './sqlite';

export type { Database, LoopRepo, TaskRepo, LeadRepo, EventRepo } from './port';
export { SqliteDatabase } from './sqlite';

export interface DbOptions {
  /** SQLite file path (default ~/.companybrain/companybrain.sqlite, or $COMPANYBRAIN_DB_PATH) */
  sqlitePath?: string;
}

/** The factory `core` uses. One embedded SQLite file — no database server to run. */
export function createDatabase(opts: DbOptions = {}): Database {
  const fromEnv = process.env.COMPANYBRAIN_DB_PATH;
  const dir = join(homedir(), '.companybrain');
  mkdirSync(dir, { recursive: true });
  return new SqliteDatabase(opts.sqlitePath ?? fromEnv ?? join(dir, 'companybrain.sqlite'));
}
