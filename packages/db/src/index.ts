import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Database } from './port';
import { SqliteDatabase } from './sqlite';
import { SupabaseDatabase, type SupabaseDbOptions } from './supabase';

export type { Database, LoopRepo, TaskRepo, LeadRepo, EventRepo, ApiKeyRow, ApiKeyRepo } from './port';
export { SqliteDatabase } from './sqlite';
export { SupabaseDatabase } from './supabase';
export { assertEncryptionKey, usingFallbackEncryptionKey } from './crypto';
export { backupDatabase, pruneBackups, listBackups, defaultBackupDir, defaultRetention, type BackupResult } from './backup';

export interface DbOptions {
  /** SQLite file path (default ~/.companybrain/companybrain.sqlite, or $COMPANYBRAIN_DB_PATH) */
  sqlitePath?: string;
}

/**
 * Database factory.
 * Uses Supabase when SUPABASE_URL and SUPABASE_ANON_KEY are set.
 * Otherwise falls back to local SQLite.
 */
export function createDatabase(opts: DbOptions = {}): Database {
  // Check for Supabase configuration
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    return new SupabaseDatabase({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
  }

  // Fall back to local SQLite
  const fromEnv = process.env.COMPANYBRAIN_DB_PATH;
  const dir = join(homedir(), '.companybrain');
  mkdirSync(dir, { recursive: true });
  return new SqliteDatabase(opts.sqlitePath ?? fromEnv ?? join(dir, 'companybrain.sqlite'));
}
