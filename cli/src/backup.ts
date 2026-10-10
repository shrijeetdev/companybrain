// `companybrain backup`: online backup of the SQLite file plus (optionally) the key files next to it.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openDatabase } from '@companybrain/db';

/**
 * Files in the data dir that hold secrets. `secret.key` decrypts the secrets stored in the
 * database (WhatsApp session, calendar feed URLs): a backup that contains both is as sensitive
 * as the running server. `signing.key` signs OAuth client ids/codes; `vapid.json` is the Web
 * Push identity.
 */
export const KEY_FILES = ['secret.key', 'signing.key', 'vapid.json'] as const;

export interface BackupOptions {
  /** Skip the key files (store/restore them separately, e.g. from your host's secret store). */
  withoutKeys?: boolean;
  now?: Date;
}

/** Safe while the app runs (SQLite online-backup API). Returns the backup directory. */
export async function backupTo(dbPath: string, dataDir: string, target: string, opts: BackupOptions = {}): Promise<{ dir: string; files: string[] }> {
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = resolve(target, `companybrain-${stamp}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = openDatabase(dbPath);
  try {
    await db.sqlite.backup(join(dir, 'companybrain.sqlite'));
  } finally {
    db.close();
  }
  const files = ['companybrain.sqlite'];
  if (!opts.withoutKeys) {
    for (const f of KEY_FILES) {
      if (existsSync(join(dataDir, f))) {
        copyFileSync(join(dataDir, f), join(dir, f));
        files.push(f);
      }
    }
  }
  return { dir, files };
}
