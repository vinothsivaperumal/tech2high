#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCHEMA_FILE="${1:-$ROOT_DIR/apps/api/src/db/schema.sql}"

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql is not installed or not in PATH." >&2
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-}"
DB_HOST="${DB_HOST:-}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-}"
DB_USER="${DB_USER:-}"
DB_PASSWORD="${DB_PASSWORD:-}"

if [[ -n "$DATABASE_URL" ]]; then
  echo "Applying schema using DATABASE_URL"
else
  if [[ -z "$DB_HOST" || -z "$DB_NAME" || -z "$DB_USER" || -z "$DB_PASSWORD" ]]; then
    cat <<'USAGE'
Error: missing database connection values.

Use one of these options:
1) Set DATABASE_URL
   DATABASE_URL='postgres://user:password@host:5432/dbname' npm run deploy:sql:manual

2) Set individual variables
   DB_HOST=... DB_PORT=5432 DB_NAME=... DB_USER=... DB_PASSWORD=... npm run deploy:sql:manual

Optional:
- Pass schema path as first argument (default: apps/api/src/db/schema.sql)
  npm run deploy:sql:manual -- ./path/to/schema.sql
USAGE
    exit 1
  fi
fi

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "Error: schema file not found at $SCHEMA_FILE" >&2
  exit 1
fi

echo "Schema file: $SCHEMA_FILE"

if [[ -n "$DATABASE_URL" ]]; then
  psql \
    "$DATABASE_URL" \
    --set ON_ERROR_STOP=on \
    --file "$SCHEMA_FILE"
else
  PGPASSWORD="$DB_PASSWORD" psql \
    --host "$DB_HOST" \
    --port "$DB_PORT" \
    --username "$DB_USER" \
    --dbname "$DB_NAME" \
    --set ON_ERROR_STOP=on \
    --file "$SCHEMA_FILE"
fi

echo "Manual SQL deployment completed successfully."
