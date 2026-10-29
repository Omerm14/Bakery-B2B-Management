#!/usr/bin/env bash
# Database tests: replays every migration on a fresh Postgres database, then
# runs each test in supabase/tests/sql/ (each inside a transaction that is
# rolled back). Any failed assertion or SQL error fails the run.
#
# Needs a Postgres 16 superuser connection (standard PG* env vars) with the
# pg_cron extension available (shared_preload_libraries = 'pg_cron' and
# cron.database_name set to $TEST_DB). See .github/workflows/ci.yml.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${TEST_DB:-bakery_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

dropdb --force --if-exists "$DB"
createdb "$DB"

echo "→ prelude"
"${PSQL[@]}" -f "$DIR/prelude.sql" >/dev/null

echo "→ migrations"
for f in $(ls "$DIR"/../migrations/*.sql | LC_ALL=C sort); do
  if ! out=$("${PSQL[@]}" -f "$f" 2>&1); then
    echo "✗ $(basename "$f")"; echo "$out"; exit 1
  fi
done

"${PSQL[@]}" -f "$DIR/helpers.sql" >/dev/null

failed=0
for t in "$DIR"/sql/*.sql; do
  name=$(basename "$t")
  if out=$( { echo 'BEGIN;'; cat "$t"; echo 'ROLLBACK;'; } | "${PSQL[@]}" 2>&1); then
    echo "✓ $name"
  else
    echo "✗ $name"; echo "$out" | grep -v '^NOTICE' | sed 's/^/    /'; failed=1
  fi
done
exit $failed
