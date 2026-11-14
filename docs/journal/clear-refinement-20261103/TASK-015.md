# TASK-015 — Truthful per-movement partial and actual-load entry (#642)

Body `clear-refinement-v2-20261109b`, attempt 1, base `d3cea8d` (after TASK-039, TASK-001 to
TASK-014, TASK-030, TASK-031 and TASK-032). Task-owned progress note: the approved exception to the
shared daily journal for this body. Only TASK-015 writes this file.

## Intended outcome

REQ-015 (AC-C37-01, AC-R015-01, AC-R015-02), completion owner of JOURNEY-015: on `/workout` and
result edit, a timed attempt that ends incomplete takes per-movement partials and actual loads in
`TimedResultLog`, saves, and on reopen/edit reads back the actual values with the right round,
movement, units and null/zero meaning; a failure or retry never discards the draft or fabricates
performed work.

## Run 1 (2026-11-10, earlier the same day): stopped for a product decision

The first run of this attempt changed only this note. Its findings, kept because the second run
builds on them:

- **The only save is the section's forward action.** `TimedResultLog` has no Save; Next section /
  Finish workout call `completeSection` (`BlockCompletionProvider`), and any error keeps the athlete
  on the section with the existing `ErrorDialog` ("That didn’t save", "Try again", Close).
- **Before LIVE-PRE-1 every per-movement write failed on the hosted project** (`recordMovements`
  answered PGRST205 as `migration-not-applied`; a reported category made the block insert itself
  name the MIG-A column). The accepted gallery defines one failure state only (`Your log didn’t
  save. Try again.`), none for "the result saved but the movement details did not".
- So each way of wiring entry broke one of the three constraints then in force (today's saves must
  keep working on the hosted schema; a refused movement write may neither drop nor misreport the
  draft; no copy the accepted gallery does not define). Options A (apply LIVE-PRE-1 first), B (ship
  non-blocking copy), C (gate on schema capability) were put to the owner, plus the TASK-015 /
  TASK-047 wiring split, and two engineering proposals for the items TASK-030 left open (keep the
  AMRAP's "Reps into the next round" beside per-movement amounts; a multi-round For Time takes
  loads only, with no new rounds-count control).

## Owner decision (Eric, 2026-11-10, "lets go with A") — the basis of run 2

- LIVE-PRE-1 is done: MIG-A and MIG-B are applied to the hosted project and verified (18/18
  schema/privilege checks, zero rows; result file
  `project-workspaces/clear-visual-refinement-2026-11-03/handoffs/LIVE-PRE-1-RESULT-20261110.md`,
  read only). Nothing here runs against a hosted project.
- TASK-015 wires the per-movement save: TASK-031's `saveTimedResult` through
  `BlockCompletionProvider`, which stays the only save path. Failures use the existing section
  `ErrorDialog` with the draft retained; a retry must not duplicate actuals (TASK-031's 23505
  restate / lost-answer semantics). A save with no new per-movement data behaves exactly as today.
  TASK-047 keeps the full Workout → Summary → History real-lane proof.
- AMRAP keeps "Reps into the next round" beside per-movement amounts, neither derived from the
  other; amounts only once a rounds count is recorded; an explicit 0 gives round 1.
- Multi-round For Time: loads only — no partial round, no new rounds-count control. Single-pass For
  Time keeps round 1.
- Categorical section effort may persist via MIG-A through the same path; never numerically coerced.
- TASK-031's "no shipped route or renderer adopts them yet" case is superseded: it now asserts
  adoption only through `BlockCompletionProvider`; TASK-031's guard re-run; its manifest untouched.
  Same for any TASK-030 case touched.
- The access-policy register: seed a `block_movement_results` row in the shared e2e seed and set
  `seeded: true` in `scripts/e2e/dispositions.mjs`.

## Selected design (from the approved sources and the decision; no new product decision)

- **Where the entries live (draft owners).** Each family's existing draft owner, never a second
  draft: `AmrapState.movements` and `ForTimeState.movements` (new optional fields on the records
  `clear.workout-amraps` / `clear.workout-for-time`, absent until typed so every record written
  before is rewritten unchanged — TASK-009's and TASK-010's "records written before this change"
  cases still pass byte for byte), and the ladder's `LadderDraft.movements` (TASK-032 built it for
  this; `editLadderDraft` already clears amounts when the rung changes). Effort stays each
  renderer's memory, as TASK-010/013 left it (their "no category in storage" assertions hold), and
  is now *reported* and saved.
- **Round identity, bounds, applicability** are TASK-030's rules, unchanged: `partialRoundFor`
  (AMRAP `rounds_completed + 1`, unrecorded → none, explicit 0 → round 1; For Time round 1 only for a
  single pass answered Incomplete, a multi-round race none; ladder the rung after the stated
  prefix while one is left), `loadApplies` (the set logger's loaded-equipment rule),
  `movementActualFromDraft` (blank unrecorded, 0 kept, bounds as a set's, a ladder amount bounded by
  that rung's target). A change of recorded progress clears the amounts and keeps the loads
  (`draftsAfterProgressChange`) — in `setRoundsCompleted` / `countRound` (AMRAP), `answerForTime`
  (For Time) and TASK-032's `editLadderDraft` (ladder).
- **The log** (`TimedResultLog`, `movements?: MovementEntryLog`): the accepted per-movement groups
  between the result and the effort, one `clr-timed-log__group--movement` per movement titled by
  its name (`.clr-timed-log__group-title`, the accepted h4 display face), the amount field only
  while a partial round applies (`Completed in round N`; the single-pass For Time's `Completed`;
  `aria-label` `Round N · name` / `Completed · name`, the movement's `modalityUnit`, `type=number`,
  `min=0`, `step` 1 or `any` for distance, `max` from `movementAmountMax`), the load field only on a
  loaded movement (`Weight used`, the athlete's unit). The same `movementActualFromDraft` that builds
  the row checks each entry inline (`invalid` + `errorText`: "Enter a weight of zero or more" — the
  set logger's words — "Enter reps as a whole number, 0 or more", "At most 6 reps in round 3");
  blank is never refused. Once the block is saved the fields keep their values and are disabled
  (`saved`). "Reps into the next round" stays beside the AMRAP's groups.
- **The seam.** `BlockCompletionApi.reportTimedResult?(blockId, report | null)` beside
  `reportOutcome` (optional, like `onBlockRecorded`, so every bare test seam still typechecks and
  the 31 older renderer assertions on `reportOutcome`'s two-argument shape stay untouched).
  `TimedResultReport` = `{ family, effort, movements, weightUnit, rungCount? }`. The one
  `BlockCompletionControl` reports it (`timed` prop; `BlockPanelCompletion.timed`); the AMRAP,
  For Time and ladder renderers supply it, memoised.
- **The provider.** `BlockCompletionProvider` keeps the reports as it keeps outcomes (across
  unmounts) and, in `completeSection`, saves a block whose report carries an effort or a typed
  entry (`reportedTimedEntries`) through `saveTimedResult` over the same `blockResults` writers —
  `timedDraftFromReport` builds TASK-031's draft from the outcome and the report; movement row ids
  are minted once per block (`crypto.randomUUID`) so a retry addresses the same rows; the context's
  movements are the block's `exercises[].prescription`, its `rounds` the block's. A refused
  movement write leaves the block unrecorded here (so `onBlockRecorded` does not fire and the
  retry restates the row and writes the movements once); the forward action's existing dialog and
  retry are unchanged. A report with nothing new takes the bare insert, byte for byte as before.
- **The rules module.** `src/data/refinement-logging-rules.ts` holds TASK-030's functions and
  types, moved verbatim, plus `movementAmountMax`, `isMovementActualDraft`, `movementEntryBlank`;
  the contract module re-exports every one under the same names and now imports nothing from the
  state layer. Reason: the matrix's tables are built by function calls that Rollup keeps whenever
  the module is reached (TASK-032 measured it), and the shipped graph now runs the rules. Checked
  after `npm run build`: `LOGGING_MOMENTS` and `MIG-B` are absent from the workout chunk
  (`toast-host`); `block_movement_results` appears there only in TASK-031's zod constraint messages
  and in `AppRuntime` for TASK-031's writer, as before.
- **Register and seed (MIG-B live).** `scripts/e2e/dispositions.mjs` `block_movement_results`
  `seeded: true`; `scripts/e2e/namespace.mjs` `movementResult` ids (table block 2); the shared seed
  (`scripts/e2e/lifecycle.mjs`) writes one row per slot on the seeded workout exercise (round 1,
  3 reps, 135 lb). `e2e/rls.spec.ts` `timestampPatch` learned the table (the owner's real UPDATE
  restates `weight`, because MIG-B grants the authenticated role no `created_at` update — the same
  per-table branch `exercise_set_logs`, `load_anchors` and `saved_workout_completions` already
  have; without it the matrix's owner-write case would be a 42501 on this table). The e2e double
  (`src/test/supabase-double.ts`) learned the table's parent chain for the cascade; the lifecycle
  test's seed/reset cases now cover it unchanged.
- **Gallery** (`templates/gallery-authority.md`): `?state=amrap`, `?state=for_time` and
  `?state=ladder` render the route's own blocks, so the fields they now draw are the route's — no
  gallery-only form, no duplicated route CSS, no synthetic writer. The AMRAP finished early (3
  rounds) and the For Time run into its cap seed one typed entry each in their memory records
  (7 reps / 20 kg against a prescribed 12 / 24; 28 reps / 8 kg against 40 / 9), so nothing in the
  gallery can be mistaken for a field filled from the plan; the records are built against the
  block's own exercise ids (`record(now, block)`). Every timed gallery state now runs under the same
  `SetLoggingProvider` the EMOM state used (`GalleryTimedShell`), so a load is stated in the
  gallery's known unit as the route states the profile's. Two register specimens
  (`TimedResultLogAmrapMovements`, `TimedResultLogLadderPartial`); `COMPONENTS.md` regenerated (72).

## Scope dispositions

- **EMOM loads** (the EMOM's "applicable weights"): not drawn. The brief's states are `amrap`,
  `for_time`, `ladder`; the EMOM family keeps its notes-only log (TASK-046's shared timed logging).
- **Notes for AMRAP / For Time / ladder, AMRAP effort:** not added (TASK-046). AC-R015-02's "keep
  optional effort/notes … truthful" is met for what exists: the EMOM's notes reach the row as
  before; the For Time's and ladder's effort now reaches `block_results.effort` as the category.
- **The ladder's saved readback:** a saved ladder still claims no draft (`saved-elsewhere`,
  TASK-010/032 rule), so its movement entries are not shown after a save+remount; TASK-048 reads the
  row back. The For Time's and AMRAP's entries read back from their records (proven after a return
  and a reload).
- **Multi-round For Time** records no count and no partial; `partial_round_reps` is not written.
- **TASK-013 UAT items** ("20 / 10" overrun, double count → TASK-046, saved-ladder answer →
  TASK-048): untouched.
- **Copy** (TASK-037 may refine): `Completed in round N`, `Completed`, `Weight used`, the three
  inline refusals above.

## Changes

- New: `src/data/refinement-logging-rules.ts`; `src/test/timed-actuals-fixture.ts`;
  `e2e/refinement/task-015.spec.ts`; `evidence/refinement/task-015/required-cases.json` and the
  guard's receipts; this note.
- Source: `src/state/block-completion.ts` (`TimedResultReport`, `reportTimedResult?`),
  `src/state/block-completion-provider.tsx` (the timed path), `src/state/timed-results.ts`
  (`timedDraftFromReport`, `reportedTimedEntries`; imports the rules module; header),
  `src/state/amrap.ts` (`movements`, `setAmrapMovement`, clearing in `setRoundsCompleted` /
  `countRound`, `clampAmrapState`), `src/state/for-time.ts` (`movements`, `setForTimeMovement`,
  clearing in `answerForTime`, `clampForTimeState`), `src/state/workout-persistence.ts` (the
  guards accept the optional entries), `src/ui/block-completion-control.tsx` (`timed`),
  `src/ui/block-renderers-frame.tsx` (`BlockPanelCompletion.timed`),
  `src/ui/refinements/timed-result-log.tsx` (`MovementEntryLog`, `MovementGroups`,
  `UNSCOPED_WEIGHT_UNIT`, `WEIGHT_USED_LABEL`), `src/ui/refinements/presentation.css`
  (`.clr-timed-log__group-title`, `.clr-timed-log__group--movement`), `src/ui/refinements/tokens.css`
  (`--logging-movement-gap`), `src/ui/amrap-block.tsx`, `src/ui/for-time-block.tsx`,
  `src/ui/ladder-block.tsx`, `src/data/refinement-logging-contract.ts` (re-exports; prose).
- Gallery and register: `src/dev/gallery-refinement-forms.tsx`, `src/dev/gallery-refinement-forms-data.ts`,
  `src/dev/gallery-registry.tsx`, `docs/design/library/COMPONENTS.md`.
- Register, seed, matrix, doubles: `scripts/e2e/dispositions.mjs`, `scripts/e2e/namespace.mjs`,
  `scripts/e2e/lifecycle.mjs`, `e2e/rls.spec.ts`, `src/test/supabase-double.ts`.
- Docs: `docs/specs/LOGGING_FIELD_CONTRACT.md` (§2 timed moments, §3 status wording, §6 decided
  items, §7 applied / register, §8, §9, §12, new §13), `src/data/README.md`, `src/state/README.md`
  (TASK-015 row), `PROJECT_MAP.md`.
- Tests of earlier tasks (each superseded assertion cites TASK-015 in place; every guard re-run):
  `src/ui/timed-result-log.test.tsx` (TASK-009 check-01: the per-movement group titles beside the
  one log title; TASK-010 check-01: the same, the spinbutton assertion scoped to the effort, the
  "failed save … no effort" and "effort … never a numeric block effort" cases now assert the
  category as `effort` beside a null numeric effort — the frozen case title "writes the same
  completion once with no effort" is now read as "no numeric effort"; the manifest is not mine to
  edit), `e2e/refinement/task-010.spec.ts` (TASK-010 check-02: the For Time's row carries
  `effort: 'too_easy'`, the ladder's none), `src/data/refinement-logging-contract.test.ts`
  (TASK-030 check-02: the one shipped caller is the provider; the spec says **Applied**; the
  decided multi-round rule), `src/data/refinement-timed-actuals.test.ts` (TASK-031 check-01: the
  D37D case asserts adoption only through the provider; the live-authority case asserts the owner
  took LIVE-PRE-1, `seeded: true` and the seed row), `src/test/block-completion-ownership.test.ts`
  (one adopter of `saveTimedResult`; `reportTimedResult` only in the control; the movement table
  named only in `workout.ts`).
- Untouched: `supabase/`, `.github/**`, `src/test/design-0143-final-audit.test.ts`, every earlier
  `required-cases.json`, `src/state/ladder-recovery.ts`, `src/ui/timed-workout-flow.test.tsx`.

## Tests added (each with its criterion)

**check-01** — 6 cases in `src/ui/timed-result-log.test.tsx`, describe `TASK-015 truthful
per-movement partial and actual-load entry`, over the real router at `/workout` over the new
fixture (a 24 kg kettlebell swing, a bodyweight burpee and a 200 m row as one AMRAP round; forty
9 kg wall balls and a 60 s plank under a 15:00 cap; a four-rung 20 kg goblet squat / push up ladder
under 07:00; a three-round 40 kg thruster / burpee race in a second section), 30 s timeouts. Every
name carries "partial", "load" or "round"; none carries "AMRAP", "completion" or "effort" in a way
that changes TASK-009's or TASK-010's selections beyond extras.

1. **AC-C37-01 AMRAP:** no amount field until a rounds count is recorded (the loaded swing's load
   alone); one round → `Completed in round 2` for each movement in reps / reps / m (decimal input
   mode for the distance); an explicit 0 → round 1; every field blank, the plan's 24 kg nowhere;
   typed as typed (7, an explicit 0, 20 kg) on the record; "Reps into the next round" its own count,
   neither moving the other; a count change clears the amounts and keeps the load; the group titled
   by the movement; no reset control.
2. **AC-C37-01 For Time:** Complete → the wall ball's load alone; Incomplete → `Completed` (reps,
   sec) and the load, `Completed · wall ball`; typed on the record; a negative load and a fractional
   second refused in the field by the row rule, a blank never; Complete again clears the amounts
   and keeps the load; no rounds control; the three-round race Incomplete → the thruster's load
   alone, no amount field, no rounds control.
3. **AC-R015-01 ladder:** Finish with round 2 checked → `Completed in round 3` (the round the log
   already names), `max` 6, blank, the plan's 20 kg nowhere; 7 refused ("At most 6 reps in round
   3"), 4 taken; the prefix corrected to 3 → round 4, amounts cleared, 16 kg kept, on the durable
   draft; Complete → the load alone; Incomplete again → no round, no amount field.
4. **AC-R015-02 the save** over the real `createWorkoutClients` and the logging double: the AMRAP's
   round-3 entries, the For Time's round-1 entries and `too_hard`, the ladder Complete with nothing
   typed; the first forward action's movement write refused (503) → the dialog, every entry kept,
   the AMRAP row stored, no movement row, no "Block saved"; the retry → 23505 restate (one PATCH),
   three block rows (`effort: 'too_hard'` on the For Time, `perceived_effort` null everywhere), four
   movement rows (round, modality column, stamped `kg`), none for the blank row or the ladder, five
   movement POSTs in all (one refused), no movement PATCH; back to the section → values read back,
   disabled, "Block saved"; a reload → the same, nothing written again; History's `sessionDetail`
   → `Round 3 · 7 reps · 20 kg`, `Round 3 · 0 reps`, `Round 1 · 28 reps · 8 kg`, `Round 1 · 45s`,
   `effort` `too_hard`, the ladder `[]`.
5. **AC-R015-02 exactly as today:** counts only and no effort → three bare inserts with the shipped
   nine keys and no `effort`, no PATCH, no movement request, no movement row; then the race with a
   load typed → one load-only row through the same path.
6. **JOURNEY-015 gallery:** `amrap` (the seeded 7 / 20 kg round-4 entry, the cap's load alone, live
   over memory: a count moves the round), `for_time` (the cap's seeded 28 / 8 kg round-1 entry, the
   burpee blank, the finish's load alone), `ladder` (nothing until round 2 is stated, then
   `Completed in round 3` bounded by its target, typed 3); no storage key, no fetch.

**check-02** — `e2e/refinement/task-015.spec.ts` (3 cases, mobile; a contained synthetic lane
answering as PostgREST does — a second insert of the same block or movement is a 23505, PATCH by
`block_id` / `workout_exercise_id` restates, DELETE removes; the performed read returns each
movement's `movement_result`). Not backend proof (TASK-047).

1. **touch phone-390 Signal:** For Time Finish → Complete, the load alone; Incomplete → `Completed`
   × 2 and the load, blank, nothing from the plan; geometry (each movement's uppercase titled group
   after the result, fields label-then-frame at the log's full width, unit inside the frame, no
   clipping, the effort after); typed, on the record; `-1` refused in the field; reload keeps the
   entries; the first movement write refused → the dialog, every entry kept, the row stored and no
   movement row; retry → POST, POST (23505), PATCH with `effort: 'too_hard'`, three movement POSTs
   (the refused one, then two), the rows' columns; the AMRAP and ladder bare inserts; Previous →
   values disabled, "Block saved"; History `Cap Incomplete`, `Elapsed 01:30`; axe; captures.
2. **keyboard phone-320 reduced motion:** AMRAP Finish early by keyboard → the load alone; two
   rounds by keyboard → `Completed in round 3` × 3 in reps / reps / m; five partial reps; Tab order
   amount → load → next movement, the row blank; reduced motion; geometry; axe; a count corrected
   to 1 clears the amounts (the burpee's zero included) and keeps the load; re-entered; saved by
   keyboard → the row `rounds_completed 1, partial_round_reps 5`, two movement rows (round 2; 9 reps
   + 20 kg; an explicit 0), none for the row; the three-round race → the thruster's load alone, no
   rounds control, a load-only row.
3. **gallery phone-390:** the three states' fields and seeded values as in check-01 case 6, with
   geometry, axe, captures; no storage, no network.

Captures attached: `for-time-incomplete-blank-signal-phone-390`,
`for-time-incomplete-entered-signal-phone-390`, `for-time-saved-readback-signal-phone-390`,
`amrap-round-3-entries-keyboard-reduced-phone-320`, `gallery-amrap-entries-signal-phone-390`,
`gallery-for-time-entries-signal-phone-390`, `gallery-ladder-entries-signal-phone-390`. Comparable
references: the accepted `amrap` / `for_time` / `ladder` states (eded158c…) and the R7 replay
`scene.html?view=timed`.

## Sweep (every spec and test under `e2e/` and `src/`)

Searched for: `reportOutcome(` call-shape assertions (31 in `amrap-block`, `for-time-block`,
`ladder-block`, `ladder-rungs` tests — kept intact by the separate seam member), `Object.keys(body)`
/ `not.toMatch(/too_hard|…/)` on saved rows (task-010's two, superseded; task-013/014's
`resultColumns` pick named columns and hold), `movements` on stored records (TASK-013's `{}`
assertions hold: nothing is written until typed), `'Log results'` heading lists and
`.clr-timed-log__group` counts (TASK-009/010, updated to exclude the movement groups), `spinbutton`
(TASK-010, scoped), the contract's importers and `blockResults.correct|recordMovements` callers
(TASK-030/031, restated as the one adopter), `seeded: false` (TASK-031), `USER_TABLES` seeds
(`e2e-lifecycle.test.ts`, now covering the new row through the double's cascade). Backend-lane
specs (`e2e/design-0143/workout-ladder.spec.ts`, `workout-lifecycle`, `task-040-*`, `core-loop`,
B05): none asserts the saved body's key set, a movement row or the seam's shape; not edited, not
runnable here. `e2e/rls.spec.ts` edited as above (not runnable here).

## Failures and corrections

- `FIXTURE_USER_ID` is not a uuid; the real performed read over the logging double refused the
  reconstruction (`session.user_id: Invalid UUID`). The TASK-015 harness owns its session under
  `a0000015-0000-4000-8000-000000000000`.
- The For Time case first used the workout double, whose `recordMovements` throws when unwired; it
  now runs over the real writers and the logging double like the save cases.
- The ownership test's `\bsaveTimedResult\(` matched the function's own declaration; `(?<!function )`
  as `blockResultInsert`'s rule already does.
- `exportsName` in TASK-030's check scans for `export function name`; the contract's one
  self-reference (`movementActualFromDraft`) now names the rules module where the function is.
- The TASK-031 live-authority regex expected `seeded: true` right after `ownerColumn`; it now allows
  the comment lines between.
- check-02 run 1: case 1 read the load unit from a card already unmounted after leaving the section
  (a 180 s wait); case 2 expected `rounds_completed 2` after correcting the count to 1. Run 2: case
  2 expected a burpee POST, but correcting the count had cleared its zero (amounts never carry to
  another round), so the writer sent a DELETE for the blank movement — the owner's rule; the case
  now re-enters the zero after the correction and asserts the clearing. Run 3: 3/3.

## Verification (this worktree, uncommitted candidate on `d3cea8d`, 2026-11-10)

`npm ci`: exit 0. Final runs, after the last source and test edit:

- `node scripts/refinement/run-required-check.mjs --task TASK-015 --check check-01 -- npx vitest run src/ui/timed-result-log.test.tsx --testNamePattern "partial|load|round" --passWithNoTests=false`:
  **PASSED**. Native 23 total, 13 executed, 13 passed (6 declared plus 7 TASK-009/010 cases whose
  names carry "round" or "load"), 0 failed, 10 skipped.
- `node scripts/refinement/run-required-check.mjs --task TASK-015 --check check-02 -- npx playwright test e2e/refinement/task-015.spec.ts --project=mobile`:
  **PASSED**. Native 3 total, 3 executed, 3 passed (synthetic origin, no credentials used).
- Earlier guards re-run because their targets were edited (exact manifest commands; no manifest
  edited): TASK-009 check-01 10/10 executed; TASK-010 check-01 11/11; TASK-010 check-02 (see the
  final results below); TASK-030 check-02 12/12; TASK-031 check-01 12/12. All PASSED.
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). The contract's tables
  stay out of every chunk (`LOGGING_MOMENTS` absent everywhere; `MIG-B` only in `AppRuntime`, from
  TASK-031's writer).
- `npm run lint:ds`: exit 0. `npx eslint` over every changed TypeScript file: 0 errors; the only
  warnings are the pre-existing fast-refresh warnings in `src/dev`.
- `node scripts/gallery-index.mjs --check`: 72 verified.
- `npm test`: 266 files, **6279 passed**, 0 failed (TASK-031: 266 / 6272; +7 = 6 TASK-015 cases
  + 1 ownership case).
- TASK-010 check-02 run 1 after this task's spec edit: REJECTED on its geometry reader, which
  counted every `.clr-timed-log__group` and expected two (the For Time's loaded wall ball now adds
  its movement group between the result and the effort). Superseded as its vitest twin was: the
  reader excludes `.clr-timed-log__group--movement`. Run 2: **PASSED**, 3/3.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-014,TASK-015,TASK-030,TASK-031,TASK-032`:
  **PASSED**, exit 0; every task "current passing receipts"; accepted-gallery 1193 files verified
  (94 staged, 1099 from the integration base); Foundation 0.14.3 unchanged.
- `git diff -- supabase .github src/test/design-0143-final-audit.test.ts src/state/ladder-recovery.ts src/ui/timed-workout-flow.test.tsx`:
  empty. `git diff -- 'evidence/refinement/*/required-cases.json'`: empty (changed receipts:
  TASK-009 check-01, TASK-010 check-01 and check-02, TASK-030 check-02, TASK-031 check-01 — each a
  target this task edited).
- Not run: the backend-lane specs (`e2e/rls.spec.ts` and the design-0143 lane need
  `.env.runner.local`); no `.env*` read; no hosted call.
- This note is not a check target, so editing it after the runs leaves every receipt current.

## Open assumptions / unresolved (for the controller and owner)

- **`e2e/rls.spec.ts` owner-write branch** for `block_movement_results` cannot run here (hosted
  matrix). It follows the spec's own per-table pattern and is needed for the matrix to go green
  with `seeded: true`, because MIG-B grants no `created_at` update; the hosted Standing RLS run is
  the proof.
- **The ladder's entries after a save** are not shown on remount (`saved-elsewhere` claims no
  draft): TASK-048's row readback, as for its answer.
- **History's screen** does not yet render `movementActuals` (TASK-026/047); check-01 proves the
  read model, check-02 the reconstruction carrying `movement_result`.
- **A blank movement that once had a value** sends a DELETE on save (TASK-031's writer: cleared →
  removed, never zeroed); on a row that never existed it deletes nothing. Observed in check-02 run 2.
- **Copy** for TASK-037: the labels and the three inline refusals above.
- **`UNSCOPED_WEIGHT_UNIT`** (`kg`) is the unit only for a bare mount with no set-logging context
  (direct renderer tests); the route and every gallery timed state supply the profile's / the
  gallery's unit.
- **Status name** `pending-live-migration` is kept as TASK-031's identity for the MIG-A/B fields
  (its description now records the application and the adoption); renaming it would touch TASK-030's
  matrix assertions for no behaviour.

## Next action

Controller verification and commit.
