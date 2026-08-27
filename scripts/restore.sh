#!/bin/sh
# Restore a Cleep backup produced by scripts/backup.sh. Run from the directory holding
# docker-compose.yml. THIS OVERWRITES the current database and attachment files.
#
#   ./scripts/restore.sh BACKUP_DIR [--yes]
set -eu

if [ $# -lt 1 ]; then
  echo "Usage: ./scripts/restore.sh BACKUP_DIR [--yes]" >&2
  exit 2
fi

SRC="$1"
ASSUME_YES="no"
[ "${2:-}" = "--yes" ] && ASSUME_YES="yes"

[ -f "$SRC/postgres.sql" ] || { echo "No postgres.sql in $SRC" >&2; exit 1; }

if [ "$ASSUME_YES" != "yes" ]; then
  printf 'This will REPLACE the current Cleep database and attachments with %s. Continue? [y/N] ' "$SRC"
  read -r answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "Aborted."; exit 0 ;; esac
fi

echo "Ensuring Postgres is up"
docker compose up -d postgres
# Wait for it to accept connections.
i=0
until docker compose exec -T postgres pg_isready -U cleep -d cleep >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 30 ] && { echo "Postgres did not become ready" >&2; exit 1; }
  sleep 1
done

echo "Restoring database from $SRC/postgres.sql"
docker compose exec -T postgres psql -U cleep -d cleep < "$SRC/postgres.sql"

if [ -f "$SRC/attachments.tgz" ]; then
  echo "Restoring attachments"
  rm -rf ./data/attachments
  mkdir -p ./data/attachments
  tar xzf "$SRC/attachments.tgz" -C ./data/attachments
fi

echo "Restarting Cleep"
docker compose up -d
echo "Done."
