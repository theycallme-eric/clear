# Post-cutover verification checklist

REQ-008 (TASK-008, issue #80). Named checks to run after the DATA tasks cut the reused Supabase
project over to the rebuild schema. Every check names its verifier; all must pass before the
cutover is declared done. Failures route to `docs/backend/rollback.md`.

## PC-1 Catalog integrity

- [ ] **PC-1a** Exercise count equals the reconciled canonical count from
      `docs/backend/live-inventory.md` §4 (140/173 resolution), verified by SQL count.
- [ ] **PC-1b** Taxonomy equivalence proof passes: every anchor, component movement, exercise
      role, and muscle-group mapping present pre-cutover is present (or deliberately mapped) in
      the new tables — diff of snapshot CSVs vs new-table exports.
- [ ] **PC-1c** No catalog row lost nulls: cues and progression/regression relationships preserve
      valid nulls per `docs/process/CATALOG_MIGRATION_SCOPE.md`.

## PC-2 Row-level security

- [ ] **PC-2a** Anonymous key cannot read or write any personal table (automated RLS probe).
- [ ] **PC-2b** User A cannot read user B's rows on every owner-scoped table.
- [ ] **PC-2c** Catalog/reference tables are readable with the anon or authenticated role as the
      new schema intends, and never writable by clients.

## PC-3 Authentication

- [ ] **PC-3a** New-user email OTP signup completes on the deployed URL.
- [ ] **PC-3b** Sign-in triggers profile creation in the new shape (`handle_new_user`
      replacement).
- [ ] **PC-3c** Redirect allow-list contains only the new deployment URLs.
- [ ] **PC-3d** No pre-cutover test user can authenticate (population retired).

## PC-4 Workout generation

- [ ] **PC-4a** The new generation Edge Function returns a contract-valid workout for a seeded
      profile (prompt 5.0.0 / contract 4.1.0 validation passes).
- [ ] **PC-4b** `ANTHROPIC_API_KEY` is read from the Supabase secret store; no secret value
      appears in logs or responses.
- [ ] **PC-4c** Generation failure paths return the platform's typed errors (CORE-01), not raw
      500s.

## PC-5 Persistence

- [ ] **PC-5a** A generated workout persists through the new save path and reads back
      identically (blocks, prescriptions, lineage fields).
- [ ] **PC-5b** Set logging writes and last-set prefill reads succeed against the new log shape.

## PC-6 Project hygiene

- [ ] **PC-6a** Applied-migration bookkeeping contains exactly the rebuild's migration series.
- [ ] **PC-6b** Retired surfaces (old views, retired enums, old functions) are absent live.
- [ ] **PC-6c** Secret names present in the project match the inventory's expected set — no
      orphaned or missing secrets (names only; values never inspected).

Record the run (date, commit, per-check result) in `docs/journal/` and link it from the cutover
PR.
