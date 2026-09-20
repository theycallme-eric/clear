# Backend rollback procedure

REQ-008 (TASK-008, issue #80). This procedure must be **rehearsed once** (step R) before
migration approval; it exists so that any cutover step can be undone to the pre-mutation state.

## Preconditions (all must hold before the first live mutation)

1. `npm run backend:snapshot` has produced, from the live project:
   - a committed schema-only dump under `docs/backend/snapshot/<stamp>/schema.sql`;
   - committed catalog CSVs under `docs/backend/snapshot/<stamp>/catalog/`;
   - a full custom-format dump `backups/clear-full-<stamp>.dump` (gitignored) whose
     `pg_restore --list` TOC has been reviewed and which is copied to at least one location off
     the operator's machine (owner's choice; never a public bucket).
2. The applied-migration list and auth settings are recorded in
   `docs/backend/live-inventory.md` §5.
3. Previous Edge Function sources are committed at `docs/backend/evidence/previous-functions/`
   (done) and the deployed function list is captured.
4. `docs/backend/dispositions.md` carries owner approval.

## R. Rehearsal (no live access required beyond the snapshot)

Restore into a disposable local database — never the live project:

```sh
supabase start                                  # local stack, or any scratch Postgres
pg_restore --no-owner --no-privileges \
  --dbname "$LOCAL_SCRATCH_DB_URL" backups/clear-full-<stamp>.dump
psql "$LOCAL_SCRATCH_DB_URL" -c "SELECT count(*) FROM exercise_definitions;"
```

The rehearsal passes when the restored catalog count equals the live count recorded in the
inventory and spot-checked RPCs (`\df`) match the schema dump. Record the result in the journal.

## Rollback steps (live incident during/after cutover)

1. **Freeze.** Stop all DATA-task activity; note the failing step and current migration version.
2. **Restore database.** Into the reused project via `SUPABASE_DB_URL`:
   ```sh
   psql "$SUPABASE_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
   pg_restore --no-owner --no-privileges --dbname "$SUPABASE_DB_URL" \
     backups/clear-full-<stamp>.dump
   ```
   (Supabase-managed schemas — auth, storage — are not touched by the rebuild's migrations; if
   auth settings were changed, restore them from the values recorded in the inventory.)
   Alternative when the damage window is small and the plan supports it: Supabase dashboard
   point-in-time recovery / scheduled backup restore to just before the first mutation.
3. **Restore functions** (only if new functions were already deployed): redeploy the vendored
   previous sources from `docs/backend/evidence/previous-functions/` or delete the new functions,
   per the incident's needs. `ANTHROPIC_API_KEY` remains in the Supabase secret store throughout.
4. **Verify restoration** against the inventory: applied-migration list, table set, catalog
   counts, one owner-scoped RLS probe, auth sign-in on the recorded site URL.
5. **Record** the incident, cause, and verification results in `docs/journal/` before resuming.

## Out of scope

Rolling back *forward* schema work in this repository is ordinary git revert; this procedure
covers only live-project state.
