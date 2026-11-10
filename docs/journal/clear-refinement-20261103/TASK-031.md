# TASK-031 — Provide richer timed-result writers and read models (#658)

Body `clear-refinement-v2-20261109b`, attempt 1, base `c2166e1` (after TASK-039, TASK-001 to TASK-014,
TASK-030 and TASK-032). Task-owned progress note: the approved exception to the shared daily
journal for this body. Only TASK-031 writes this file.

## Intended outcome

REQ-031 (TASK-AC-1D3D95F6D419, TASK-AC-FCFBE3CD46A6, TASK-AC-D37D178270A8). Role: foundation provider
for JOURNEY-031. **JOURNEY-031 is not claimed complete**: TASK-047 owns the visible Workout →
Summary → History save, retry and reload proof on the real lane. No entry UI is built (TASK-015).

Build the validated data side of richer timed results that TASK-030 specified:

- categorical block effort (MIG-A) and per-movement partials and loads (MIG-B), as migrations;
- schemas, a correction writer, a movement writer and a save provider;
- the History read model.

Prove them deterministically without the hosted backend. Expose the migrations and the exact live
authority separately; none is applied.

## What landed

- **Migrations (NOT APPLIED).**
  - `supabase/migrations/20261110000029_block_result_effort.sql` (MIG-A): one nullable
    `block_results.effort public.set_effort`.
  - `supabase/migrations/20261110000030_block_movement_results.sql` (MIG-B): the
    `block_movement_results` table with CHECKs, the composite FK to an active prescription, UNIQUE
    `workout_exercise_id`, an `updated_at` trigger, owner-only RLS and column grants. It also
    redefines `session_reconstruction` with the same signature, adding each exercise's
    `movement_result`.
  - Types regenerated offline with `npm run gen:types`, which reads the migration files and needs
    no hosted project. `npm run gr:matrix` and `gr:dispositions` were regenerated (offline; their
    source lists only).
- **Schemas** (`src/state/schemas.ts`).
  - `blockResultRowSchema.effort`: `setEffortSchema.nullable().default(null)`. A row without the key
    reads as unanswered.
  - `blockMovementResultRowSchema` mirrors MIG-B's CHECKs.
  - The reconstruction has `movement_result` (default null).
- **Mapping** (`src/state/block-completion.ts`).
  - `BlockOutcome.effort` holds the category. `blockResultInsert` writes it by omission when
    unanswered, so every shipped save is byte-for-byte unchanged.
  - `blockResultCorrection` restates the whole outcome, the notes and the effort; null clears.
  - `MovementResultWrite` / `movementResultViolation` mirror MIG-B's CHECKs before anything is
    sent.
- **Writers** (`src/data/workout.ts`, `createWorkoutClients().blockResults`).
  - `correct`: an UPDATE by `block_id`. With nothing to correct it returns `PERSISTENCE_NOT_FOUND`
    and never inserts.
  - `recordMovements`: inserts each movement in order. On 23505 it restates the row by UPDATE
    addressed to the movement, keeping the first id. A cleared movement is deleted. It stops at
    the first failure with `written`.
  - A missing column or table (PGRST204/205) is answered with
    `details.reason: 'migration-not-applied'` and `details.migration` (`MIG-A` / `MIG-B`).
  - `unconfiguredWorkoutClients` and the workout double gained the two methods.
- **Save provider** (`src/state/timed-results.ts`), for TASK-015/019/026/047.
  - `timedResultDraft` mints the row ids once.
  - `timedResultRequest` builds the request through the TASK-030 contract (`partialRoundFor`,
    `movementActualFromDraft`).
  - `saveTimedResult`: record, then correct on 23505, then recordMovements. Errors carry `stage`.
  - `timedSaveStarted` / `timedSaveSettled` keep the draft through every outcome.
  - No shipped file imports it.
- **History read model** (`src/state/session-detail.ts`).
  - `BlockDetailView.effort` is the category, never on the 1–10 scale.
  - `BlockDetailView.movementActuals` comes from `movementActualReadings`: movement identity,
    `Round N` / `Rung N`, the amount of the prescription's modality, and the stamped load.
  - Nothing is read from targets or `load_value`. Movement rows are not sets and are not counted.
- **Contract and spec.**
  - `src/data/refinement-logging-contract.ts` gains a new status, `pending-live-migration`, for
    `block_results.effort` and every `block_movement_results.*` field. Real names are recorded and
    `proposedBy` is removed. A new path, `timed-result-save`, is added.
  - `docs/specs/LOGGING_FIELD_CONTRACT.md` changes §3, §6 and §7 (landed files plus "Exact live
    authority still required"), and §8, §9 and §10. It adds §12, the amendment. Pointers were added
    in `DATA_MODEL.md` §8, `src/data/README.md` and `PROJECT_MAP.md`.
- **RLS register.**
  - `scripts/e2e/dispositions.mjs` adds `block_movement_results` as cross-user with
    **`seeded: false`** (reason below).
  - `scripts/e2e/namespace.mjs` adds its selector, its forged row and `forgedMovementResult` ids.
- **Double** (`src/test/logging-contract-double.ts`):
  - the effort enum and an owner-scoped PATCH of `block_results`;
  - the whole MIG-B table: grants (42501), RLS, FK, CHECKs, 23502, 23505 on the PK or the movement,
    delete, and `updated_at`;
  - `movement_result` in the performed reconstruction;
  - `refuseNext(path, status, method?)` and `loseNextAnswer(path, method?)` (the write applies, then
    the fetch rejects);
  - `schema: 'hosted-before-timed-actuals'`, which answers as the hosted project does today.

## Design decisions (and changes from the TASK-030 draft)

- **Effort lives in `BlockOutcome`, beside `notes`.** It is what the timed log reports.
  `perceivedEffort` stays the shell's legacy number, always `null` from the shipped path.
- **Current saves keep working before the migration (scope decision 2).**
  - The shipped completion path never names `effort`, because the writer omits an unanswered one
    and no renderer reports one yet.
  - It never calls `correct` or `recordMovements`.
  - The hosted reconstruction without `movement_result` reads as nothing recorded.
  - All three facts are proven against the hosted-schema double.
- **`updated_at` is a trigger, not a client grant**, so the client cannot write a stamp the database
  did not observe.
- **The `performed` predicate keeps a superseded prescription that carries a movement result**, as
  it keeps one with set logs (D6).
- **Correction addressed to the movement, not the id.** The first-minted id stays. A retry that
  re-minted an id still collides on UNIQUE `workout_exercise_id` and is restated, never duplicated.
- **The For Time rule from TASK-030 is kept unchanged.** A partial is round 1 only for a single pass
  (`rounds` null or 1). Otherwise it is the round after a recorded completed-rounds count. With
  neither there is no round: a multi-round amount is refused and a load is accepted.
- **Ownership.** `BlockCompletionProvider` remains the only caller of `blockResults.record`.
  TASK-047 should call `saveTimedResult` from that same path, not from a renderer.

## Migrations and live authority (exposed separately; LIVE-PRE-1 not taken)

- **Must be applied:** exactly `20261110000029_block_result_effort.sql`, then
  `20261110000030_block_movement_results.sql`. Both are additive; no row is rewritten.
- **Where:** the hosted Supabase project the app and TASK-047's lane use. The repository documents
  one, the reused live project `qxckevxniacktaqecypl`. Unless the owner names another, this is a
  production schema change.
- **Who:** the owner (LIVE-PRE-1), or someone the owner explicitly authorises. Not this task.
- **How:** `docs/process/generation-reliability/release-checklist.md` §3.1: a tracked push dry run
  listing only these two files, the push, then fresh hosted Standing RLS.
- **Not done here:** no `supabase db push`, `link` or `psql`, and no hosted call of any kind. No
  `.env*` file was read.
- **Consequence until applied:** the hosted Standing RLS matrix
  (`.github/workflows/rls-standing.yml`, gated by `E2E_LIVE_SCHEMA_READY`) will report
  `block_movement_results` missing on PRs from this branch onward. This matches the precedent of
  migration 28 before the 2026-10-28 release. The disposition audit requires a disposition for every
  migrated table, so this cannot be avoided without weakening a check. I chose `seeded: false` so
  the shared fixture seed (used by `rls.spec`, `d6-swap-persistence`, `settings-appearance`) still
  works on the hosted schema; only the new table's own denial assertions report the gap. Flip it to
  `seeded: true`, with a seed row in `scripts/e2e/lifecycle.mjs`, in the change that applies MIG-B.
  The `backend-e2e` job on `main` would see the same gap if this merged to main before LIVE-PRE-1.

## Gallery disposition

Explicit non-gallery disposition (REQ-031 coverage entry; `templates/gallery-authority.md`):

- No gallery state applies and none is adopted, because no consumer renders the new fields yet.
- `src/dev/gallery-registry.tsx` (`SAMPLE_DETAIL_BLOCK`) and `src/dev/gallery-refinement-overview-data.ts`
  only state the new fields as `null` / `[]` for type completeness, so nothing they render changes.
  `src/app/FormatPreview.tsx` is changed the same way.
- No synthetic production writer is added.

## Tests added

`src/data/refinement-timed-actuals.test.ts` (check-01) has 12 cases, all declared in
`evidence/refinement/task-031/required-cases.json`. Heavy cases have an explicit 20 s timeout.

- **TASK-AC-1D3D95F6D419:**
  - the landed schema agrees across the migrations, the generated types, the row schemas and the
    double;
  - per-family mappings: AMRAP round 4, single-pass For Time round 1, ladder rung 3, and EMOM
    load-only, with effort and notes, read back in History as entries rather than the plan, and
    not as sets;
  - category versus legacy number, including the conditioning trend;
  - null versus zero versus unreported;
  - the For Time round rule;
  - correction identity: same ids, restated, a cleared movement removed, and changed progress
    clearing amounts while keeping loads.
- **TASK-AC-FCFBE3CD46A6:**
  - a refused block save and a refused movement save, with the draft and error retained and the
    retry writing once;
  - lost answers for the block and a movement: 23505 leads to a correction, no duplicate, and
    repeated saves leave the same rows;
  - the boundary: a mismatched or foreign movement, the wrong block, a ladder without a rung count,
    another user's RLS, a column grant, and a malformed stored row with a control;
  - the hosted schema before LIVE-PRE-1;
  - the separately exposed migration and authority.
- **TASK-AC-D37D178270A8:** the providers exist, no shipped file adopts them, the contract stays out
  of the shipped graph, and JOURNEY-031 is not claimed.

**Mutation checks.** Each was applied to the real file, the test run, and the file restored from a
scratch copy confirmed with `cmp`. Every one was caught:

| Mutation | Result |
| --- | --- |
| category mapped into `perceived_effort` | 2 failed |
| `effort` always sent (breaks hosted saves) | 2 failed |
| no correction on 23505 | 4 failed |
| movement 23505 not restated | 3 failed |
| cleared movement not removed | 1 failed |
| draft dropped on failure | 2 failed |
| schema gap not named | 1 failed |
| read model fills an amount from the plan | 1 failed |
| ladder rung labelled as a round | 2 failed |
| For Time constant round 1 | 1 failed |
| whitespace notes sent | 1 failed |
| correction falls back to an insert | 2 failed |

## Earlier tasks' targets edited (each guard genuinely re-run)

- `src/state/schemas.test.ts` (TASK-030 check-01): two assertions said "no categorical block column
  yet". They now assert the landed column reads the category beside the number.
- `src/data/refinement-logging-contract.test.ts` (TASK-030 check-02) has five superseded
  assertions:
  - the migration iff status;
  - the absent table/column;
  - the DRAFT SQL in the spec;
  - "today's writer drops a category";
  - the 404 table, now shown on the hosted-schema double.

  The isolation case is restated as each MIG being defined only by its own file, nothing in
  workflows or scripts applying migrations, and no shipped caller. Its frozen title still reads
  "no migration … is added", which no longer matches; the manifest is not mine to edit.
- `src/ui/timed-workout-flow.test.tsx` (TASK-006, TASK-011, TASK-013 and TASK-014 check-01): one
  `BlockResultRow` literal gained `effort: null`, which the type change requires.
- No `required-cases.json` of another task was edited.

## Sweep

- Other consumers found and updated:
  - `generated-types.test.ts`, `generation-persistence.test.ts` and `goal-focus-journeys.test.tsx`
    (migration and table lists);
  - `e2e-lifecycle.test.ts` (USER_TABLES);
  - `workout.test.ts` (stored row);
  - `session-double.ts` and `workout-double.ts` (row and reconstruction fixtures).
- Checked and not edited:
  - The backend-lane specs (`e2e/design-0143/workout-ladder.spec.ts`, `workout-lifecycle`,
    `task-040-*`, `core-loop`, the B05 specs and `e2e/refinement/task-0NN`) use explicit column
    selects or `toMatchObject`, or mock reconstructions that parse with the new defaults. The
    shipped insert body is unchanged, so none is superseded.
  - `e2e/rls.spec.ts` derives its matrix from the register.
- `src/test/design-0143-final-audit.test.ts` and `.github/**` were not modified.

## Failures and corrections

- My first guard re-runs were piped into `head -2`. That closed the pipe and killed the runner, so
  the receipts recorded "rejected: absent native report". All six were re-run without truncation
  and passed (below).
- In the test file, `fixtureId('m' | 'x' | 'y', n)` builds non-hex uuids. The schema refused one
  for its id, not for the property under test. I switched to hex prefixes and added a control
  parse to the malformed-row case.
- Two SQL-shape assertions matched words in the migration comments. They now strip comments and
  check statements.
- Typecheck ripple from the schema defaults (eight sites) was fixed at each literal. No type was
  loosened.

## Verification (this worktree, uncommitted)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-031 --check check-01 -- npx vitest run src/data/refinement-timed-actuals.test.ts --passWithNoTests=false`:
  PASSED, 12/12. Re-run after this note's last edit.
- Earlier guards, re-run because their targets changed. All PASSED:
  - TASK-030 check-01: 112/112.
  - TASK-030 check-02: 12/12.
  - TASK-006 check-01: 32/32.
  - TASK-011 check-01: 9 executed, 9 passed.
  - TASK-013 check-01: 11 executed, 11 passed.
  - TASK-014 check-01: 15 executed, 15 passed.
- `npm test`: 266 files, 6272 tests passed, 0 failed.
- `npm run build`: exit 0. The contract and the provider are in no bundle; the writers are in
  `AppRuntime` with the other data clients.
- `npm run lint:ds`: exit 0. `npx eslint` on the changed sources: 0 errors (only the existing
  fast-refresh warnings in `src/dev`).
- `npm run gen:types -- --check`: current.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-014,TASK-030,TASK-031,TASK-032,TASK-039`:
  REJECTED, exit 1. The only problem is "TASK-039: declares only setup checks; a baseline/setup
  receipt is not delivery evidence". TASK-039's manifest has one check, `bootstrap`, with
  `purpose: setup`. Final mode refuses setup receipts by design, and neither that manifest nor the
  verifier is changed here. Every other task reports "current passing receipts", including
  TASK-030, TASK-031 and the four re-run timed-flow tasks; accepted-gallery 1193 files verified;
  Foundation 0.14.3 unchanged.
- The same command without TASK-039: PASSED, exit 0.

## Open items (for the controller and owner)

- **LIVE-PRE-1 (owner).** MIG-A and MIG-B must be applied before TASK-047 can prove a real write.
  Until then the hosted Standing RLS reports the new table missing (above).
- **TASK-015.** Entry UI that reports `effort` in the outcome and fills `TimedResultDraft`. The open
  For Time completed-rounds-count question from TASK-030 is still open.
- **TASK-047.** Wire `saveTimedResult` through `BlockCompletionProvider` (keeping it the one path)
  and update `block-completion-ownership.test.ts` accordingly. Prove it visibly on the real lane.
- **TASK-026 / TASK-047.** Render `BlockDetailView.effort` through the existing effort owner
  (`SET_EFFORT_CHOICES` / `SetEffortReading`) and render `movementActuals`.
- The double is a transcription of the migrations, not Postgres. Only TASK-047's real lane can show
  Postgres agrees.

## Next action

Controller verification and commit.
