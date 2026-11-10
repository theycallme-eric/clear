# TASK-030 — Validate complete logging field ownership before dependent writes (#657)

Body `clear-refinement-v2-20261109b`, attempt 1, base `b24ccfe` (after TASK-039 #679 and TASK-001 to
TASK-012 #680 to #691). Task-owned progress note: the approved exception to the shared daily journal
for this body. Only TASK-030 writes this file.

## Intended outcome

REQ-030 (AC-R030-01, AC-R030-02, AC-R030-03), role foundation-provider (JOURNEY-015, -019, -026,
-031, -032; completion owner of none). An engineering definition, before any dependent task writes:

- a field-to-contract matrix for the 16 logging moments and every proposed measurement, load,
  effort and note field — schema, validator, writer, identity, null/zero/update meaning and
  History/readback owner — describing the current source truthfully and naming the owner of every
  proposed piece (AC-R030-01);
- categorical block effort never written into `perceived_effort` 1–10; per-set categories and the
  legacy numbers kept explicit; reuse versus migration decided from the schema (AC-R030-02);
- the proposed contract validated by deterministic boundary tests and consumer rehearsal, with every
  migration and live-service prerequisite isolated, not applied (AC-R030-03).

No user-facing feature, writer, migration, gallery state or live call is added.

## Where the matrix lives

- **Specification:** [`docs/specs/LOGGING_FIELD_CONTRACT.md`](../../specs/LOGGING_FIELD_CONTRACT.md),
  beside `DATA_MODEL.md` (whose §8 now points to it). §2 the 16 moments, §3 the field matrix, §4
  effort, §5 reuse versus migration, §6 the proposed timed contract, §7 isolated prerequisites and
  the draft SQL, §8 what the checks prove, §9 gallery disposition, §10 observations, §11 sources.
- **Typed contract:** `src/data/refinement-logging-contract.ts` (`LOGGING_MOMENTS`,
  `LOGGING_FIELDS`, `PROPOSED_PATHS`, `partialRoundFor`, `loadApplies`, `movementActualFromDraft`,
  `draftsAfterProgressChange`). Data and pure functions only; listed in `src/data/README.md`.
  Dependent tasks import it; a task that lands a proposed field flips its status and records the
  real names, and check-02 fails until it does.

## The 16 moments: reconciliation

The accepted reference's `src/dev/gallery-refinement-data.ts` `LOGGING_CONTEXTS` lists 16 stable ids
(REUSE.md "All 16 contexts"; REQ-019's coverage states and CURRENT-REQUIREMENTS-AUTHORITY list the
same 16). LOGGING-FIELDS.md has 15 rows because its first row ("Anchor / primary and other lift")
covers `anchor` and `other-lift` with one field contract. 15 rows + 1 split row = 16; nothing merged
or invented. The ids and order are the gallery's.

## Decisions (from the schema and source, not from fixture success)

- **Effort (AC-R030-02).** Four distinct values: per-set `exercise_set_logs.effort` (`set_effort`,
  20261027000027 — reused), per-set `rpe` (legacy 1–10, written null), block `perceived_effort`
  (legacy 1–10 smallint, written null since E04; `conditioningTrend` reads ≤ 7 + complete as
  `ready`), session `mood` (1–5). A category cannot go into `perceived_effort` (smallint range, and
  any number would fabricate a progression signal), nor into `notes` (verbatim text),
  `exercise_set_logs.effort` (would fabricate set rows) or `mood` (another question). **Block
  categorical effort genuinely needs a migration: MIG-A**, one nullable `block_results.effort` reusing
  the `set_effort` type; table-level grants and `to_jsonb(br)` reconstructions need no change.
- **Per-movement timed partials and loads: MIG-B, a new table** (`block_movement_results`), not
  `exercise_set_logs`, because (1) `anchor_evidence` reads every set log regardless of structure, so a
  partial (5 of 12) becomes a short working set and trips the missed-rep deload D5 (rehearsed with
  the real reader and `d5MissedReps`); (2) History shows it as an ordinary set and counts it; (3) a
  per-attempt load has no set identity; (4) `set_number` is immutable under correction (fence
  trigger, 20261027000028) while a partial's round must follow a corrected count.
- **Reused without migration:** notes for AMRAP / For Time / ladder (`block_results.notes`, already
  written by EMOM); correction of a saved block row (UPDATE grant + `block_results_update_own` exist;
  only a client method is missing — TASK-031); durable ladder draft (local `workout-persistence.ts`,
  TASK-032); ordered ladder progress (`highest_rung`, 0 admitted — TASK-013).
- **Identities (`partialRoundFor`):** AMRAP `rounds_completed + 1` (unrecorded rounds give none —
  the accepted gallery's null→round 1 is not adopted, as it reads unreported as zero); For Time `1`
  when Incomplete; ladder `highest_rung + 1` while a rung is left; EMOM none. Loads attach where the
  set logger's own rule says (`incrementFor(equipment_used)` not null). Values are bounded exactly as
  a set (`setLogViolation`); blank is null, `0` kept; ladder amounts bounded by that rung's target
  (the accepted input `max`); amounts cleared and loads kept when progress changes (accepted owner
  rule). Nothing reads `load_value` or targets to fill a value.

## Isolated prerequisites (AC-R030-03; nothing applied)

- `MIG-A` (block categorical effort) and `MIG-B` (movement actuals table, RLS, grants, reconstruction
  extension): draft SQL only in the specification §7, labelled "DRAFT … not a migration". Owner:
  **TASK-031** (lands the migration files, schemas, writers and read model).
- Proposed paths with owners: `block-effort-schema`, `movement-actual-schema`,
  `block-result-correction`, `movement-actuals-writer`, `timed-read-model` (TASK-031); `timed-entry`
  (TASK-015); `ladder-durable-draft` (TASK-032); `visible-proof` (TASK-047).
- **`LIVE-PRE-1` (owner authority):** applying MIG-A/MIG-B to the disposable test project before
  TASK-047's real lane, and to production only as a release decision. PRE-001 does not cover it; no
  task in this body is authorised to change a hosted database.

## Gallery disposition

Not applicable. REQ-030's coverage entry is "explicit non-gallery disposition" with no states or
owners; this task changes no consumer, so no gallery state needs adoption, and no synthetic writer
was added anywhere (spec §9).

## Changes

- New: `docs/specs/LOGGING_FIELD_CONTRACT.md`; `src/data/refinement-logging-contract.ts`;
  `src/data/refinement-logging-contract.test.ts` (check-02); `src/test/logging-contract-double.ts`
  (in-memory PostgREST for the logging tables, transcribed from the migrations; answers only);
  `evidence/refinement/task-030/required-cases.json` and guard receipts `results/check-01.json`,
  `results/check-02.json`.
- Changed: `src/state/schemas.test.ts` (6 cases appended in a new describe block; no existing case
  edited), `docs/specs/DATA_MODEL.md` (one pointer line at §8), `src/data/README.md` (module bullet).
- Unchanged: every writer, schema, migration, generated type, renderer and gallery file.

## Tests added (with the criterion each justifies)

- **check-01** `src/state/schemas.test.ts`, describe "TASK-030 logging field ownership at the schema
  boundary" (6): AC-R030-02 `perceived_effort` 1–10 refuses every category and reads no categorical
  column; AC-R030-02 per-set effort is exactly the three categories, absent → null, `rpe` beside it
  unchanged; AC-R030-02 mood 1–5 is not effort; AC-R030-01 null versus zero for every outcome and
  measurement column the matrix names (and each named column is read by its schema); AC-R030-01
  rest-day and debrief reasons and note bounds; AC-R030-01 every schema the matrix names is exported.
- **check-02** `src/data/refinement-logging-contract.test.ts`, describe "TASK-030 logging field
  ownership before dependent writes" (11): AC-R030-01 the 16-moment inventory and reconciliation;
  AC-R030-01 every named source is a real export / existing columns in the generated types / proposed
  absent / the double's column lists equal the generated ones; AC-R030-01 the specification states
  the same moments, fields, statuses, migrations and owners; AC-R030-01 consumer rehearsal of sets
  (lifts, time, distance, extra, superset, circuit movement) through `setLogs.mutate` read back by
  `loggedSetFromRow` and `sessionDetail`; AC-R030-01 correction, replay, stale conflict, clear and
  active-only; AC-R030-01 block outcomes from the real `amrapOutcome` / `forTimeOutcome` with a refused
  save, retry and 23505, read back in History; AC-R030-01 movement notes, debrief and rest days;
  AC-R030-02 no category ever becomes `perceived_effort` (writer, table, mapping, legacy meaning in
  History and `conditioningTrend`); AC-R030-02 why set logs cannot carry timed partials (anchor
  evidence → D5, History, load identity, absent table); AC-R030-03 proposed identities and values from
  the real outcome functions and `ladderRungs`; AC-R030-03 isolation (no migration defines them, no
  transport in the module, drafts only in the spec, no client path today).
- Heavy cases carry an explicit 20 s timeout (CI note).

## Mutation checks (each applied to the real file and restored; tracked files with `git checkout`,
## new files from a scratch copy confirmed with `cmp`)

| Mutation | Result |
| --- | --- |
| `blockResultInsert` carries a category into the row | 1 failed (check-02 AC-R030-02) |
| the block writer maps a category to a number | 1 failed |
| `setObservationMutation` derives `rpe` from the category | 2 failed (set rehearsals) |
| `blockResultRowSchema.perceived_effort` accepts categories | 1 failed (check-01) |
| History reads an unrecorded rep count as `0 reps` | 1 failed |
| `partialRoundFor` reads blank AMRAP rounds as zero | 1 failed |
| `movementActualFromDraft` turns a blank amount into 0 | 1 failed |
| MIG-A claimed `existing` in the contract | 6 failed (both checks) |
| a blank partial filled from the planned target | 1 failed |
| the specification's matrix drifts from the contract | 1 failed |
| a moment dropped from the inventory | 2 failed |

## Sweep

Existing assertions changed: none. Existing files edited: `schemas.test.ts` (append only),
`DATA_MODEL.md` and `src/data/README.md` (pointers). Searched `e2e/`, `scripts/` and `src/` for any
reader of `docs/specs/DATA_MODEL.md`, `src/data/README.md`, `LOGGING_FIELD_CONTRACT` or
`schemas.test`: references are comments only ("DATA_MODEL §8"); no code reads either document. No
runtime file imports the new module; no ownership/scan test is affected (`block-completion-ownership`,
`schemas` "declares every schema … nowhere else", `generated-types` scans all pass).
`src/test/design-0143-final-audit.test.ts` not modified.

## Failures and corrections

- First full `npm test`: `src/test/generated-types.test.ts` "lets no `any` escape the data layer"
  failed on the new test file — its regex scans every `src/data` file (tests included) and matched the
  comment phrase ": any number claims a set". Reworded; the suite then passed. Check-02 was re-run
  through the guard afterwards so its receipt matches the final target.
- Mutation "`setLogInsert` derives `rpe`" survived: the current set path builds `rpe` in
  `setObservationMutation` (the direct-insert mapping serves only the unused `setLogs.log`, and
  `set-logging.test.ts` already pins its `rpe: null`). Re-targeted at the real path: caught.
- Read before running: `parseBoundary` defaults to `VALIDATION_CONSTRAINT`, so the debrief refusal
  expectation uses that code.
- Spec wording corrected: `session_snapshot` carries no block result (only the `session_as_*`
  reconstructions return `to_jsonb(br)`).

## Verification (this worktree, uncommitted candidate, 2026-11-10)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-030 --check check-01 -- npx vitest run src/state/schemas.test.ts --passWithNoTests=false`:
  PASSED. Native 112 total, 112 executed, 112 passed, 0 failed/skipped/todo (6 declared + 106
  existing as undeclared extras).
- `node scripts/refinement/run-required-check.mjs --task TASK-030 --check check-02 -- npx vitest run src/data/refinement-logging-contract.test.ts --passWithNoTests=false`:
  PASSED. Native 11 total, 11 executed, 11 passed.
- Manifest sha256 `0f85605df329e9ecf9b355003fa51655da9f6f34c9c8ee95db924ef69cbf5454`.
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). `npm run lint:ds`: exit 0.
- `npm test`: 264 files, 6232 tests passed, 0 failed (TASK-012: 263 / 6215; +1 file, +17 = 6 + 11).
- `npx eslint src/data src/test/logging-contract-double.ts src/state/schemas.test.ts`: no error or
  warning.
- `npm run gen:types -- --check`: `database.types.ts` is current; `git diff -- supabase` empty.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008,TASK-009,TASK-010,TASK-011,TASK-012,TASK-030`:
  PASSED, exit 0; every task "current passing receipts"; accepted-gallery 1193 files verified;
  Foundation 0.14.3 unchanged.
- Not run: no Playwright or backend lane (none declared; no credentials used or needed).

## Earlier-task receipts

None refreshed, none needed: no earlier task's check target (any file in another
`evidence/refinement/task-NNN/required-cases.json`) was edited, and no runtime code they render or
assert changed (the only new runtime module is imported by nothing). The final verification above
confirms every earlier receipt is current; `git status -- evidence/` shows only `task-030/`.

## Open assumptions / unresolved (for the controller and owner)

- **LIVE-PRE-1 needs the owner.** MIG-A/MIG-B must reach the disposable test project before TASK-047
  can prove a real write; production is a release decision. Not authorised or attempted here.
- **The migrations are engineering conclusions, not product changes.** The approved REQ-031/TASK-047
  criteria require persisting categorical section effort and per-movement partials/loads; this task
  shows from the schema that both need new storage. TASK-031 may refine the draft DDL (recording why)
  but must keep the identity and null/zero contract the tests pin.
- **For TASK-015 (not decided here):** whether the AMRAP keeps its single "Reps into the next round"
  (`partial_round_reps`) once per-movement next-round amounts exist; neither may be derived from the
  other, and the conditioning score reads only `partial_round_reps`. One load per movement per attempt
  is the accepted shape; a load that changed between rounds is not representable.
- **Ladder Incomplete without a rung** records nothing (`highest_rung` null), so no partial can attach
  until the completed-through count is recorded (0 allowed) — TASK-013/TASK-015.
- **Unowned observations, not changed:** History has no reader for the per-set effort category or for
  movement notes; block results are insert-once, so a retry with changed values after a lost answer is
  absorbed by the 409 rule (TASK-031's correction writer is the fix for timed results); stale comments
  still say an EMOM supplies `minutes_completed` (recorded by TASK-011).
- The rehearsal double is a transcription of the migrations, not Postgres; deployed-database proof is
  TASK-047's.

## Next action

Controller verification and commit.
