// @companybrain/db — SQLite schema, versioned migrations (incl. v1 → v2 import), org-scoped repos.
// See docs/v2/WIRING.md. Repositories are synchronous (better-sqlite3); core wraps them in services.

import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createSecretBox, loadKey, type SecretBox } from './crypto.js';
import { runMigrations } from './schema.js';
import { apiKeyRepo, kvRepo, memberRepo, orgRepo, sessionRepo } from './repos/identity.js';
import { activityRepo, projectRepo, taskRepo } from './repos/work.js';
import { auditRepo, feedRepo, inboxRepo, jobRepo, leadRepo, meetingRepo, notificationRepo, pushRepo } from './repos/ops.js';

export * from './time.js';
export * from './util.js';
export { createSecretBox, deriveKey, loadKey, sha256Hex, type SecretBox } from './crypto.js';
export { MIGRATIONS, runMigrations } from './schema.js';
export { importV1, type V1ImportResult } from './v1-import.js';
export { maskUrl, type PushSubRow } from './repos/ops.js';
export { PRIORITY_RANK, type ProjectCounts, type TaskFilter, type Visibility } from './repos/work.js';
export type { SessionRow } from './repos/identity.js';

export interface Db {
  /** Resolved file path (or ':memory:'). */
  path: string;
  /** Raw better-sqlite3 handle (other packages, e.g. game, create their own tables on it). */
  sqlite: BetterSqlite3.Database;
  /** AES-256-GCM box for secrets at rest. */
  secrets: SecretBox;
  orgs: ReturnType<typeof orgRepo>;
  members: ReturnType<typeof memberRepo>;
  sessions: ReturnType<typeof sessionRepo>;
  apiKeys: ReturnType<typeof apiKeyRepo>;
  kv: ReturnType<typeof kvRepo>;
  projects: ReturnType<typeof projectRepo>;
  tasks: ReturnType<typeof taskRepo>;
  activity: ReturnType<typeof activityRepo>;
  meetings: ReturnType<typeof meetingRepo>;
  feeds: ReturnType<typeof feedRepo>;
  notifications: ReturnType<typeof notificationRepo>;
  push: ReturnType<typeof pushRepo>;
  jobs: ReturnType<typeof jobRepo>;
  inbox: ReturnType<typeof inboxRepo>;
  leads: ReturnType<typeof leadRepo>;
  audit: ReturnType<typeof auditRepo>;
  /** Migration versions applied by this open() call. */
  migrated: number[];
  /** Run `fn` in a transaction (nested calls become savepoints). */
  tx<T>(fn: () => T): T;
  close(): void;
}

export interface OpenOptions {
  /** Overrides COMPANYBRAIN_SECRET (tests). */
  secret?: string;
  env?: NodeJS.ProcessEnv;
}

/** $COMPANYBRAIN_DB_PATH or ~/.companybrain/companybrain.sqlite */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const p = env.COMPANYBRAIN_DB_PATH?.trim();
  if (p) return p === ':memory:' ? p : resolve(p);
  return join(env.HOME?.trim() || homedir(), '.companybrain', 'companybrain.sqlite');
}

/** Opens the DB (WAL, foreign keys, busy timeout) and runs pending migrations (incl. v1 import). */
export function openDatabase(path: string | ':memory:', opts: OpenOptions = {}): Db {
  const env = opts.env ?? process.env;
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');
    sqlite.pragma('synchronous = NORMAL');
    const migrated = runMigrations(sqlite);
    const secrets = createSecretBox(loadKey(path, opts.secret !== undefined ? { ...env, COMPANYBRAIN_SECRET: opts.secret } : env));
    return {
      path,
      sqlite,
      secrets,
      migrated,
      orgs: orgRepo(sqlite),
      members: memberRepo(sqlite),
      sessions: sessionRepo(sqlite),
      apiKeys: apiKeyRepo(sqlite),
      kv: kvRepo(sqlite),
      projects: projectRepo(sqlite),
      tasks: taskRepo(sqlite),
      activity: activityRepo(sqlite),
      meetings: meetingRepo(sqlite),
      feeds: feedRepo(sqlite, secrets),
      notifications: notificationRepo(sqlite),
      push: pushRepo(sqlite),
      jobs: jobRepo(sqlite),
      inbox: inboxRepo(sqlite),
      leads: leadRepo(sqlite),
      audit: auditRepo(sqlite),
      tx<T>(fn: () => T): T {
        return sqlite.transaction(fn)();
      },
      close() {
        if (sqlite.open) sqlite.close();
      },
    };
  } catch (err) {
    sqlite.close();
    throw err;
  }
}
