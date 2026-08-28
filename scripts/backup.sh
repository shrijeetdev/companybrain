#!/bin/bash
# Company Brain backup — cron wrapper around the built-in backup command.
#
#   0 2 * * * /path/to/companybrain/scripts/backup.sh >> /var/log/companybrain-backup.log 2>&1
#
# The app also takes a nightly backup on its own while it is running; this script exists so
# backups keep happening when it is not, and so cron can alert on failure (it exits non-zero).
#
# Uses SQLite's online backup API via `companybrain backup`, which is safe against a live
# database — unlike `cp`, which can capture a torn file when WAL is on. No `sqlite3` CLI
# needed; the app's own better-sqlite3 does the work.
#
# Environment:
#   COMPANYBRAIN_DB_PATH         database to copy   (default ~/.companybrain/companybrain.sqlite)
#   COMPANYBRAIN_BACKUP_DIR      where copies land  (default ~/.companybrain/backups)
#   COMPANYBRAIN_BACKUP_RETENTION how many to keep  (default 14)
#   COMPANYBRAIN_BACKUP_GZIP=1   also gzip each new backup

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f "dist/server.js" ]; then
  node dist/server.js backup "$@"
elif command -v npx >/dev/null 2>&1; then
  npx tsx cli/bin/companybrain.ts backup "$@"
else
  echo "[backup] neither dist/server.js nor npx is available in $ROOT" >&2
  exit 1
fi

# Optional compression. Off by default: an uncompressed backup can be opened directly with
# `sqlite3` or copied straight back into place during an incident.
if [ "${COMPANYBRAIN_BACKUP_GZIP:-0}" = "1" ]; then
  BACKUP_DIR="${COMPANYBRAIN_BACKUP_DIR:-$HOME/.companybrain/backups}"
  find "$BACKUP_DIR" -name 'companybrain-*.sqlite' -exec gzip -f {} \;
  echo "[backup] compressed backups in $BACKUP_DIR"
fi
