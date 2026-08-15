#!/usr/bin/env sh
set -eu

# Disposable local verification only. This never targets the configured
# application database for restore; it creates impact_restore in the local DB
# container and removes it when the drill completes.
OUT_DIR="${1:-$(mktemp -d)}"
mkdir -p "$OUT_DIR"

COMPOSE="${COMPOSE_BIN:-docker-compose}"

"$COMPOSE" exec -T db pg_dump -U "${POSTGRES_USER:-impact}" -Fc "${POSTGRES_DB:-impact}" > "$OUT_DIR/impact.dump"
"$COMPOSE" exec -T app tar -czf - -C /app/data uploads > "$OUT_DIR/uploads.tar.gz"

"$COMPOSE" exec -T db psql -U "${POSTGRES_USER:-impact}" -d "${POSTGRES_DB:-impact}" \
  -c 'DROP DATABASE IF EXISTS impact_restore;' \
  -c 'CREATE DATABASE impact_restore;'
"$COMPOSE" exec -T db pg_restore -U "${POSTGRES_USER:-impact}" -d impact_restore --no-owner < "$OUT_DIR/impact.dump"

"$COMPOSE" exec -T db psql -U "${POSTGRES_USER:-impact}" -d impact_restore -Atc \
  "SELECT (SELECT count(*) FROM incidents),(SELECT count(*) FROM reports),(SELECT count(*) FROM report_private_locations),(SELECT count(*) FROM uploads),(SELECT count(*) FROM audit_events),(SELECT postgis_full_version() IS NOT NULL);"

"$COMPOSE" exec -T db psql -U "${POSTGRES_USER:-impact}" -d "${POSTGRES_DB:-impact}" \
  -c 'DROP DATABASE IF EXISTS impact_restore;'
echo "Backup/restore drill passed; artifacts written to $OUT_DIR"
