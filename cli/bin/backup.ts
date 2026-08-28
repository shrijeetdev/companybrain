// `companybrain backup` — take a consistent copy of the SQLite database and exit.
//
// Meant for cron and for a pre-deploy snapshot. The running app also takes a nightly one on
// its own; this exists so backups do not depend on the app being up, and so a restore can be
// rehearsed. Exits non-zero when the backup fails, which is what a cron job needs in order
// to alert.
//
//   companybrain backup                 take one now
//   companybrain backup --list          list what exists, newest first
//   companybrain backup --keep 30       take one, keep the 30 newest
//   companybrain restore <file>         print the (deliberately manual) restore steps

import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { backupDatabase, listBackups, defaultBackupDir, defaultRetention } from '@companybrain/db';

const args = process.argv.slice(process.argv.indexOf(process.argv.includes('backup') ? 'backup' : 'restore') + 1);

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function resolveDbPath(): string {
  const fromEnv = process.env.COMPANYBRAIN_DB_PATH;
  return fromEnv ?? join(homedir(), '.companybrain', 'companybrain.sqlite');
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

if (process.argv.includes('restore')) {
  // Restoring is deliberately not automated: it overwrites live data, and the right move
  // depends on whether the app is running. Print the steps instead of guessing.
  const file = args.find((a) => !a.startsWith('--'));
  const dbPath = resolveDbPath();
  console.log(`
Restore is manual on purpose — it overwrites live data.

  1. Stop companybrain.
  2. Move the current database aside (do not delete it):
       mv ${dbPath} ${dbPath}.before-restore
       rm -f ${dbPath}-wal ${dbPath}-shm
  3. Copy the backup into place:
       cp ${file ?? '<backup file>'} ${dbPath}
  4. Start companybrain and check that recent data is present.

Available backups:`);
  const list = listBackups();
  if (!list.length) console.log('  (none)');
  for (const b of list) console.log(`  ${b.path}  ${mb(b.bytes)}  ${new Date(b.at).toISOString()}`);
  process.exit(0);
}

if (args.includes('--list')) {
  const dir = flag('dir') ?? defaultBackupDir();
  const list = listBackups(dir);
  if (!list.length) {
    console.log(`No backups in ${dir}.`);
  } else {
    console.log(`${list.length} backup(s) in ${dir}, newest first:`);
    for (const b of list) console.log(`  ${b.path}  ${mb(b.bytes)}  ${new Date(b.at).toISOString()}`);
  }
  process.exit(0);
}

const sourcePath = flag('db') ?? resolveDbPath();
if (!existsSync(sourcePath)) {
  console.error(`[backup] no database at ${sourcePath}. Set COMPANYBRAIN_DB_PATH or pass --db <path>.`);
  process.exit(1);
}

const dir = flag('dir') ?? defaultBackupDir();
const keepRaw = flag('keep');
const keep = keepRaw ? Number(keepRaw) : defaultRetention();
if (!Number.isFinite(keep) || keep < 1) {
  console.error(`[backup] --keep must be a positive number, got "${keepRaw}".`);
  process.exit(1);
}

try {
  const r = await backupDatabase({ sourcePath, dir, keep });
  console.log(`[backup] ${sourcePath} → ${r.path} (${mb(r.bytes)} in ${r.durationMs}ms)`);
  if (r.pruned.length) console.log(`[backup] pruned ${r.pruned.length} old backup(s), keeping ${keep}`);
  process.exit(0);
} catch (err) {
  // Non-zero so cron alerts instead of silently never backing up.
  console.error('[backup] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}
