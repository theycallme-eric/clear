#!/usr/bin/env bash
# REQ-008 read-only live inventory capture.
# Requires: SUPABASE_DB_URL (PRE-004), psql on PATH. Writes to docs/backend/capture/.
# Optionally captures Edge Function and secret *names* via the authenticated Supabase CLI
# (PRE-007). No secret values are read, printed, or written.
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${SUPABASE_DB_URL:?PRE-004 SUPABASE_DB_URL is required (never commit its value)}"

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
OUT="docs/backend/capture"
mkdir -p "$OUT"

echo "Capturing read-only SQL inventory -> $OUT/inventory-$STAMP.txt"
psql "$SUPABASE_DB_URL" \
  --no-psqlrc --set ON_ERROR_STOP=1 --set AUTOCOMMIT=off \
  -c 'BEGIN TRANSACTION READ ONLY;' \
  -f scripts/backend-audit/inventory.sql \
  -c 'ROLLBACK;' \
  > "$OUT/inventory-$STAMP.txt"

if command -v supabase >/dev/null 2>&1 || command -v npx >/dev/null 2>&1; then
  echo "Capturing deployed Edge Function list -> $OUT/functions-$STAMP.txt"
  npx supabase functions list --project-ref qxckevxniacktaqecypl \
    > "$OUT/functions-$STAMP.txt" || echo "WARN: functions list failed (PRE-007?)"
  echo "Capturing secret NAMES only -> $OUT/secret-names-$STAMP.txt"
  npx supabase secrets list --project-ref qxckevxniacktaqecypl \
    | awk '{print $1}' > "$OUT/secret-names-$STAMP.txt" \
    || echo "WARN: secrets list failed (PRE-007?)"
fi

echo "Done. Review the capture, then update docs/backend/live-inventory.md §Live capture."
