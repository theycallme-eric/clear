# TASK-072 live cutover runbook

This directory holds the bounded operator steps for issue #82. It targets only the reused CLEAR
project `qxckevxniacktaqecypl`. It never stores a credential and every mutating step has an exact
confirmation or a preceding assertion.

The operator must use the reviewed commit, a clean worktree, the CLI credential store, and the
gitignored `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. Before `reset-public.sql`, verify a current custom-format dump with
`pg_restore --list` and SHA-256.

Ordered execution:

1. Run `preflight.sql` over `psql "$SUPABASE_DB_URL"`. It proves the 29-entry legacy ledger,
   140/150/488/27 preservation counts, no rebuild migrations, and eight disposable users.
2. Run `reset-public.sql` over the same connection. It replaces only `public` and restores the
   schema permissions that the Supabase API roles require; managed schemas remain untouched.
3. Remove ledger versions `00001` through `00029` with `supabase migration repair --db-url ...
   --status reverted`. The matching no-op marker files are removed in TASK-072.
4. Run `supabase db push --db-url ... --include-all --include-seed`. The rebuild contains 18
   uniquely ordered migrations and the reviewed catalog seed.
5. Deploy `generate-workout` and `generate-section` from `supabase/functions/`.
6. Run `retire-auth-users.mjs` with
   `TASK_072_CONFIRM_RETIRE_AUTH_USERS=8-disposable-test-users`.
7. Run `update-auth-config.mjs` with the CLI token supplied only in process memory and
   `TASK_072_CONFIRM_AUTH_URLS=https://clear-peach.vercel.app`.
8. Run `verify.sql`, the RLS/OTP/generation/persistence E2E suite, and repository verification.
9. Set repository variable `E2E_LIVE_SCHEMA_READY=true`, then verify the standing RLS workflow.

Any failure after step 2 freezes the sequence and routes to the selective public-schema and ledger
restore in `docs/backend/rollback.md`; the full dump is never replayed wholesale over managed
Supabase schemas. The old Vercel project is retired only after the new production URL and all
post-cutover checks pass.
