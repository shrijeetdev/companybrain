#!/bin/bash
# Company Brain automated backup script
# Run daily via cron: 0 2 * * * /path/to/backup.sh
# Or use Docker volume mounting for persistent backups

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups/companybrain}"
DB_PATH="${COMPANYBRAIN_DB_PATH:-$HOME/.companybrain/companybrain.sqlite}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/companybrain_$DATE.sqlite"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "Error: Database not found at $DB_PATH"
    exit 1
fi

# Create backup using SQLite's backup API (safe for live databases)
echo "Creating backup: $BACKUP_FILE"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Verify backup
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup created successfully: $BACKUP_SIZE"
else
    echo "Error: Backup failed"
    exit 1
fi

# Compress backup
echo "Compressing backup..."
gzip "$BACKUP_FILE"
echo "Compressed: ${BACKUP_FILE}.gz"

# Clean up old backups
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "companybrain_*.sqlite.gz" -mtime +$RETENTION_DAYS -delete

# List remaining backups
echo "Remaining backups:"
ls -lh "$BACKUP_DIR"/companybrain_*.sqlite.gz 2>/dev/null || echo "No backups found"

echo "Backup completed at $(date)"
