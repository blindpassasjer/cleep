#!/bin/sh
# Back up a Docker Compose Cleep deployment: the Postgres database (pg_dump) and every attachment
# file. Run it from the directory that holds docker-compose.yml.
#
#   ./scripts/backup.sh [--output-dir DIR] [--keep N]
#
#   --output-dir DIR   Where to write backups (default: ./backups)
#   --keep N           After a successful backup, delete all but the N newest (default: keep all)
set -eu

OUT_DIR="./backups"
KEEP=""

while [ $# -gt 0 ]; do
  case "$1" in
    --output-dir) OUT_DIR="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found -- run this on the host where Cleep's containers live." >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$OUT_DIR/$STAMP"
mkdir -p "$DEST"

echo "Dumping Postgres -> $DEST/postgres.sql"
docker compose exec -T postgres pg_dump -U cleep -d cleep --clean --if-exists > "$DEST/postgres.sql"

echo "Archiving attachments -> $DEST/attachments.tgz"
if [ -d ./data/attachments ]; then
  tar czf "$DEST/attachments.tgz" -C ./data/attachments .
else
  echo "  (./data/attachments not found -- skipping)"
fi

cat > "$DEST/README.txt" <<EOF
Cleep backup taken $STAMP (UTC).

Restore with:  ./scripts/restore.sh "$DEST"

Contents:
  postgres.sql     pg_dump of the 'cleep' database (--clean --if-exists)
  attachments.tgz  tar of ./data/attachments (photos, video, audio)
EOF

echo "Done: $DEST"

if [ -n "$KEEP" ]; then
  echo "Pruning old backups, keeping newest $KEEP"
  # shellcheck disable=SC2012
  ls -1dt "$OUT_DIR"/*/ 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
    echo "  removing $old"
    rm -rf "$old"
  done
fi
