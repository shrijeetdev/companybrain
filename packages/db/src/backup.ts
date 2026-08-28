// SQLite backups — the one database is one file, so a backup is one consistent copy of it.
//
// Uses better-sqlite3's online backup API rather than a filesystem copy: with WAL enabled a
// plain `cp` can capture a torn database (the -wal and -shm files move independently), while
// the backup API produces a single self-consistent file even while the app is writing.
//
// Backups are written to a directory, named by timestamp, and pruned to a retention count.
// Nothing here is scheduled; the caller decides when to run it (the app runs one nightly,
// and `companybrain backup` runs one on demand).

import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface BackupResult {
  /** Absolute path of the file written. */
  path: string;
  /** Size on disk, in bytes. */
  bytes: number;
  /** How long the copy took. */
  durationMs: number;
  /** Backups deleted by retention pruning, oldest first. */
  pruned: string[];
}

const PREFIX = 'companybrain-';
const SUFFIX = '.sqlite';

/** Default backup directory: alongside the database, in ~/.companybrain/backups. */
export function defaultBackupDir(): string {
  return process.env.COMPANYBRAIN_BACKUP_DIR ?? join(homedir(), '.companybrain', 'backups');
}

/** Default number of backups to keep. */
export function defaultRetention(): number {
  const raw = Number(process.env.COMPANYBRAIN_BACKUP_RETENTION ?? '');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 14;
}

/** `2026-08-28T20-41-07` — sortable, and legal on every filesystem. */
function stamp(at = new Date()): string {
  return at.toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '-');
}

/**
 * Copy `sourcePath` to a timestamped file in `dir`, then prune to `keep` most recent.
 * Throws if the source cannot be opened or the copy fails — callers decide whether a failed
 * backup is fatal (the CLI exits non-zero; the nightly job logs and carries on).
 */
export async function backupDatabase(opts: {
  sourcePath: string;
  dir?: string;
  keep?: number;
  now?: Date;
}): Promise<BackupResult> {
  const dir = opts.dir ?? defaultBackupDir();
  const keep = opts.keep ?? defaultRetention();
  const started = Date.now();

  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${PREFIX}${stamp(opts.now)}${SUFFIX}`);

  // readonly: a backup must never be the thing that writes to your database.
  const db = new Database(opts.sourcePath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(target);
  } finally {
    db.close();
  }

  const bytes = statSync(target).size;
  return { path: target, bytes, durationMs: Date.now() - started, pruned: pruneBackups(dir, keep) };
}

/**
 * Delete all but the `keep` newest backups in `dir`. Only files this module named are
 * considered, so an unrelated file in the directory is never removed.
 */
export function pruneBackups(dir: string, keep: number): string[] {
  if (keep <= 0) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // no directory yet — nothing to prune
  }
  const mine = entries
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .sort() // timestamped names sort chronologically
    .map((f) => join(dir, f));

  const doomed = mine.slice(0, Math.max(0, mine.length - keep));
  const pruned: string[] = [];
  for (const f of doomed) {
    try {
      unlinkSync(f);
      pruned.push(f);
    } catch { /* already gone, or not ours to delete */ }
  }
  return pruned;
}

/** List existing backups, newest first. */
export function listBackups(dir = defaultBackupDir()): { path: string; bytes: number; at: number }[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .map((f) => {
      const path = join(dir, f);
      const st = statSync(path);
      return { path, bytes: st.size, at: st.mtimeMs };
    })
    .sort((a, b) => b.at - a.at);
}
