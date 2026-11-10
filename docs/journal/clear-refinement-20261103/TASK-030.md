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
  the accepted gallery's null→round 1 is not adopted, as it reads unreported as zero); For Time, when
  Incomplete, round `1` only for a single-pass block (`workout_blocks.rounds` null or 1), otherwise
  `roundsCompleted + 1` from a recorded count while a round is left, and **none** for a multi-round
  race with no recorded count (repair round 1; see below); ladder `highest_rung + 1` while a rung is
  left; EMOM none. Loads attach where the set logger's base load rule says
  (`incrementFor(equipment_used)` not null; its carried/recorded-weight exception on unloaded
  equipment has no timed counterpart). Values are bounded exactly as
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
- **`LIVE-PRE-1` (owner decision):** applying MIG-A/MIG-B to the hosted project TASK-047's real lane
  writes to. The repository documents one hosted Supabase project, the reused live project
  (`IMPLEMENTATION_PLAN.md`, `CATALOG_MIGRATION_SCOPE.md`, `HUMAN_GATES.md`), and the "disposable"
  lane is namespaced throwaway users and data inside it (`e2e/README.md`,
  `CLEAR-OVERNIGHT-VIBE-PREFLIGHT.md`). Unless the owner names a separate project, that is a
  production schema change, not test-lane setup (spec §7; corrected in repair round 1). PRE-001
  does not cover it; no task in this body is authorised to change a hosted database; no repository
  workflow applies migrations, so TASK-031 can land files and double-based tests without it.

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
  edited), `docs/specs/DATA_MODEL.md` (one pointer line at §8; repair round 1 also corrects the §8
  timer-contract line's EMOM claim), `src/data/README.md` (module bullet).
- Unchanged: every writer, schema, migration, generated type, renderer and gallery file.

## Tests added (with the criterion each justifies)

- **check-01** `src/state/schemas.test.ts`, describe "TASK-030 logging field ownership at the schema
  boundary" (6): AC-R030-02 `perceived_effort` 1–10 refuses every category, `isPerceivedEffort`
  agrees with the column at both ends (repair round 1), and no categorical column is read; AC-R030-02 per-set effort is exactly the three categories, absent → null, `rpe` beside it
  unchanged; AC-R030-02 mood 1–5 is not effort; AC-R030-01 null versus zero for every outcome and
  measurement column the matrix names (and each named column is read by its schema); AC-R030-01
  rest-day and debrief reasons and note bounds; AC-R030-01 every schema the matrix names is exported.
- **check-02** `src/data/refinement-logging-contract.test.ts`, describe "TASK-030 logging field
  ownership before dependent writes" (12 after repair round 1): AC-R030-01 the 16-moment inventory and reconciliation;
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
  the real outcome functions and `ladderRungs`; AC-R030-03 (repair round 1) For Time round identity by
  the block's real `rounds` — single pass 1, multi-round only from a recorded count, never guessed —
  beside `likeForLike`'s capped For Time reading; AC-R030-03 isolation (no migration defines them, no
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

## Repair round 1 (review `TASK-030-a1-3eb2ce0d0321`, 2026-11-10)

**Failure (blocking; AC-R030-01, AC-R030-03; JOURNEY-015/031).** The proposed For Time partial
identity was fabricated for multi-round blocks: `partialRoundFor({ family: 'for_time' })` returned 1
for any Incomplete answer, and spec §3/§6 pinned "1 (the single pass)". But
`workout_blocks.rounds` is a nullable int with no For Time restriction (20260921000003), and the
conditioning reader already models a capped multi-round For Time as `rounds_completed` × reps per
round + `partial_round_reps` (`conditioning.ts`; `conditioning.test.ts` "for_time, rounds: 5").
A 3-round race stopped in round 3 would have been stored and read back as a round-1 partial,
against the contract's own Rule 5 (never a guessed round). My earlier analysis assumed every For
Time was one pass without checking the block's `rounds` column.

**Correction.**

- `partialRoundFor`'s For Time input now carries the block row (`block: Pick<WorkoutBlockRow,
  'rounds'>`). Incomplete only; with a recorded `roundsCompleted`, the round after it while one is
  left (bounded by `rounds ?? 1`); with none, round 1 only for a single pass (`rounds` null or 1) and
  **no identity** for a multi-round race. `rounds` is structure, never the source of the round.
  Today `forTimeOutcome` records no count, so every multi-round partial amount is refused on
  `round_number` and only loads can be entered.
- Spec §2 (`for_time` "Rounds" paragraph: nullable rounds, no count recorded, conditioning's
  reading, so a capped For Time has no like-for-like score today), §3 (`round_number`,
  `rounds_completed`, `partial_round_reps` meanings; conditioning named as a reader of the outcome
  columns), §5, §6 (the rule, plus a new **open item owned by TASK-015**: whether a For Time records
  a completed-rounds count at all, whether a movement amount is in-round or a total, and whether
  `partial_round_reps` is written beside it; nothing derived either way or filled from the plan),
  §8. Typed contract: `partialRoundFor` doc/implementation, the For Time moment's identity and
  History text, the `round_number`, `rounds_completed`, `partial_round_reps` meanings, the
  `timed-entry` summary, and `conditioning.ts` `timedOutcome` added as a reader of the six outcome
  columns (`notes` stays History-only).
- check-02: the existing identity case now passes the session's real single-pass For Time block
  (rounds null). New required case "AC-R030-03 a For Time partial is in round 1 only for a
  single-pass block; a multi-round race takes its round from a recorded completed-rounds count, or
  has none" (declared in `required-cases.json`): blocks from `snapshotFixture` with rounds null / 1 /
  3 and the real `forTimeOutcome` (capped, stopped Incomplete, Complete). Single pass → 1; 3 rounds
  with today's outcome (no count) → none, capped or stopped; recorded 2 → 3, 1 → 2, 0 → 1, 3 →
  none; Complete → none; a multi-round amount is refused on `round_number` while a load-only entry
  is accepted; `likeForLike` (real `sessionProgress` block) scores nothing for today's capped
  outcome and 4.5 reps/min from 2 rounds + 5 reps; the spec states the rule and the TASK-015 item.

**Non-blocking reviewer notes.**

- Addressed: `DATA_MODEL.md` §8 timer-contract line now says an EMOM writes no count
  (`minutes_completed` null for every current ending; older rows keep theirs).
- Addressed: set-logger load wording (spec §2 `timed-movement`/`distance-movement`, §6, the
  timed-movement moment's null text, `loadApplies` doc): load fields also appear on unloaded
  equipment when a weight is carried forward (`prefillFrom`) or the corrected set has one.
- Addressed: the double's `anchor_evidence` now follows 0014's `we.revision_status = 'active'`
  filter (header cites 0011 + 0014; spec §5 and §11 cite 0014). Every rehearsed prescription is
  active, so no conclusion changes; check-02 passed unchanged in that case.
- Addressed: check-01's AC-R030-02 effort case now asserts `PERCEIVED_EFFORT_MIN/MAX` = 1/10 and
  that `isPerceivedEffort` agrees with the column at -1, 0, 0.5, 1, 1.5, 9.5, 10, 10.5, 11.
- Addressed (stated, not resolved): LIVE-PRE-1 wording, above and spec §7. Read only repository
  docs; no `.env*` or private file read.

**Mutation checks (repair; each applied to the real file and restored, `cmp`/`git checkout`
confirmed).**

| Mutation | Result |
| --- | --- |
| For Time Incomplete → constant 1 again | 1 failed (new check-02 case: "expected 1 to be null") |
| planned `rounds` returned as the round when no count | 1 failed (new case: "expected 3 to be null") |
| `PERCEIVED_EFFORT_MIN` 1 → 0 | 1 failed (check-01 AC-R030-02 effort case) |
| `isPerceivedEffort` lower bound `>= 0` | 1 failed (check-01: "0: expected true to be false") |

## Verification (repair round 1, 2026-11-10)

This worktree, uncommitted repair on top of `0e13beb`. Existing `node_modules` (installed by
round 0's `npm ci`) reused.

- `node scripts/refinement/run-required-check.mjs --task TASK-030 --check check-01 -- npx vitest run src/state/schemas.test.ts --passWithNoTests=false`:
  PASSED. Native 112 total, 112 executed, 112 passed, 0 failed/skipped/todo (6 declared).
- `node scripts/refinement/run-required-check.mjs --task TASK-030 --check check-02 -- npx vitest run src/data/refinement-logging-contract.test.ts --passWithNoTests=false`:
  PASSED. Native 12 total, 12 executed, 12 passed (12 declared, including the new For Time case).
- Manifest sha256 `90e3ec57ebcfb854faa0f68483d303d32df4d68bc99e7a7d685f3d7b78ed5dfd` (one case
  identity added; nothing else in the manifest edited).
- `npm run build`: exit 0. `npm run lint:ds`: exit 0. `npx eslint` on the four changed source/test
  files: exit 0, no warnings.
- `npm test`: 264 files, 6233 tests passed, 0 failed (round 0: 264 / 6232; +1 case).
- `npm run gen:types -- --check`: current. `git diff b24ccfe -- supabase .github
  src/test/design-0143-final-audit.test.ts`: empty.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008,TASK-009,TASK-010,TASK-011,TASK-012,TASK-030`:
  PASSED, exit 0; every task "current passing receipts"; accepted-gallery 1193 files verified.
- Both guarded checks were re-run after this note's last edit so the receipts match the final
  targets (the note is not a check target).

## Verification (attempt 1 round 0, superseded by the above)

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

- **LIVE-PRE-1 needs the owner.** MIG-A/MIG-B must reach the hosted project TASK-047's real lane
  writes to before it can prove a real write. Per the repository's docs that is the reused live
  (production) project, whose "disposable" lane is namespaced test users, so unless the owner names a
  separate project this is a production schema change. Which project the private PRE-001
  configuration points at was not read (no `.env*`). Not authorised or attempted here.
- **The migrations are engineering conclusions, not product changes.** The approved REQ-031/TASK-047
  criteria require persisting categorical section effort and per-movement partials/loads; this task
  shows from the schema that both need new storage. TASK-031 may refine the draft DDL (recording why)
  but must keep the identity and null/zero contract the tests pin.
- **For TASK-015 (not decided here):** whether the AMRAP keeps its single "Reps into the next round"
  (`partial_round_reps`) once per-movement next-round amounts exist; neither may be derived from the
  other, and the conditioning score reads only `partial_round_reps`. One load per movement per attempt
  is the accepted shape; a load that changed between rounds is not representable.
- **For TASK-015 (not decided here; added in repair round 1): the multi-round For Time amount.**
  Whether the For Time log records a completed-rounds count (the existing `rounds_completed`, which
  conditioning already reads for a capped For Time, or none); whether a movement amount is in-round
  or a total; whether `partial_round_reps` is written beside it. Until then a multi-round For Time has
  no round identity and accepts loads only; a single pass keeps round 1.
- **Ladder Incomplete without a rung** records nothing (`highest_rung` null), so no partial can attach
  until the completed-through count is recorded (0 allowed) — TASK-013/TASK-015.
- **Unowned observations, not changed:** History has no reader for the per-set effort category or for
  movement notes; block results are insert-once, so a retry with changed values after a lost answer is
  absorbed by the 409 rule (TASK-031's correction writer is the fix for timed results); stale code
  comments still say an EMOM supplies `minutes_completed` (recorded by TASK-011; `DATA_MODEL.md`'s
  line is corrected here, the code comments are left).
- The rehearsal double is a transcription of the migrations, not Postgres; deployed-database proof is
  TASK-047's.

## Next action

Controller verification and commit.
