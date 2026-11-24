#!/bin/bash
# ==============================================================================
# Bayti Kitchen - Automated Database Backup Script
# Supports PostgreSQL and SQLite databases
# ==============================================================================

set -e

BACKUP_DIR="/var/backups/bayti-kitchen"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

echo "=== [$(date)] Starting Bayti Kitchen Database Backup ==="

# 1. PostgreSQL Backup if container is running
if docker ps --format '{{.Names}}' | grep -q "bayti_postgres"; then
    echo "Creating PostgreSQL backup..."
    docker exec bayti_postgres pg_dump -U postgres bayti_kitchen | gzip > "$BACKUP_DIR/postgres_bayti_$TIMESTAMP.sql.gz"
    echo "PostgreSQL backup saved to: $BACKUP_DIR/postgres_bayti_$TIMESTAMP.sql.gz"
fi

# 2. SQLite Backup if database file exists
if [ -f "/app/data/bayti_kitchen.db" ]; then
    echo "Creating SQLite backup..."
    sqlite3 /app/data/bayti_kitchen.db ".backup '$BACKUP_DIR/sqlite_bayti_$TIMESTAMP.db'"
    gzip -f "$BACKUP_DIR/sqlite_bayti_$TIMESTAMP.db"
    echo "SQLite backup saved to: $BACKUP_DIR/sqlite_bayti_$TIMESTAMP.db.gz"
fi

# 3. Clean backups older than retention days
echo "Cleaning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -type f -name "*bayti_*" -mtime +$RETENTION_DAYS -delete

echo "=== Backup completed successfully! ==="
