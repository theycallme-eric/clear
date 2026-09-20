#!/usr/bin/env bash
# REQ-008 recoverable schema-and-catalog snapshot of the reused Supabase project.
# Requires: SUPABASE_DB_URL (PRE-004), pg_dump + psql on PATH.
#
# Produces three artifacts:
#   1. docs/backend/snapshot/<stamp>/schema.sql          — full schema, no data (committable)
#   2. docs/backend/snapshot/<stamp>/catalog/*.csv       — catalog tables only (committable)
#   3. backups/clear-full-<stamp>.dump                   — full custom-format dump incl. data
#      (gitignored: may contain personal test rows; rollback source of record)
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${SUPABASE_DB_URL:?PRE-004 SUPABASE_DB_URL is required (never commit its value)}"

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
SNAP="docs/backend/snapshot/$STAMP"
mkdir -p "$SNAP/catalog" backups

echo "1/3 Schema-only dump -> $SNAP/schema.sql"
pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --no-privileges \
  --schema=public --schema=supabase_migrations > "$SNAP/schema.sql"

echo "2/3 Catalog CSV export -> $SNAP/catalog/"
for table in exercise_definitions exercise_anchors exercise_muscle_groups; do
  psql "$SUPABASE_DB_URL" --no-psqlrc --set ON_ERROR_STOP=1 \
    -c "\\copy (SELECT * FROM $table ORDER BY 1) TO '$SNAP/catalog/$table.csv' WITH (FORMAT csv, HEADER)"
done
# movement_patterns exists only if live state predates migration 00030; export it if present.
if psql "$SUPABASE_DB_URL" --no-psqlrc -t -A -c "SELECT to_regclass('public.movement_patterns') IS NOT NULL;" | grep -q t; then
  psql "$SUPABASE_DB_URL" --no-psqlrc --set ON_ERROR_STOP=1 \
    -c "\\copy (SELECT * FROM movement_patterns ORDER BY 1) TO '$SNAP/catalog/movement_patterns.csv' WITH (FORMAT csv, HEADER)"
fi

echo "3/3 Full recoverable dump (NOT committed) -> backups/clear-full-$STAMP.dump"
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  > "backups/clear-full-$STAMP.dump"
pg_restore --list "backups/clear-full-$STAMP.dump" > "backups/clear-full-$STAMP.toc.txt"

echo "Snapshot complete. Commit $SNAP; verify backups/clear-full-$STAMP.toc.txt lists all tables."
echo "Store a second copy of the full dump outside this machine before any live mutation."
