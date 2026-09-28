# `supabase/migrations`

This directory contains only the rebuild's migration series.

`20260921000000_catalog_domain.sql` onwards. Authored against
`docs/specs/DATA_MODEL.md`, one per domain, commented, idempotent on an empty
project. These are the migrations the project actually owns.

TASK-072 removed the previous application's `00001` through `00029` no-op marker files and used
`supabase migration repair` to reset the remote migration bookkeeping after the reviewed recovery
gate cleared. Their original SQL is still preserved as read-only evidence under
`docs/backend/evidence/previous-migrations/`, and the pre-cutover schema remains in the verified
dump recorded by `docs/backend/live-inventory.md`.

Every migration version in this directory is unique. The cutover preflight caught and corrected a
duplicate timestamp between the constraints and workout-domain files before either reached the
live ledger.
