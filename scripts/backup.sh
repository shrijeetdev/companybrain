#!/usr/bin/env bash
# companybrain backup — hot, consistent copy of the database + key files, with retention.
#
#   scripts/backup.sh [backup-dir] [--without-keys]   (default dir: $BACKUP_DIR or ./backups)
#
# Cron (daily 02:00):   0 2 * * * cd /path/to/companybrain && scripts/backup.sh /backups >> /var/log/cb-backup.log 2>&1
# Docker:               docker exec <container> node server.js backup /data/backups
#
# Uses the app's own `backup` command (SQLite online-backup API — safe while the app is running),
# so no sqlite3 CLI is needed. Honors COMPANYBRAIN_DB_PATH like the app does.
set -euo pipefail

DIR="${1:-${BACKUP_DIR:-./backups}}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
cd "$(dirname "$0")/.."

node server.js backup "$DIR" "${@:2}"
# Keep the last $RETENTION_DAYS days.
find "$DIR" -maxdepth 1 -type d -name 'companybrain-*' -mtime "+$RETENTION_DAYS" -exec rm -rf {} +
echo "[backup] done; retention ${RETENTION_DAYS}d in $DIR"
