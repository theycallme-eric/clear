# TASK-103 — A3 task 3 (F1): save timed results for real and read them back in History (#726)

Body `clear-gallery-adoption-v2-20261116`, attempt 1, integration branch
`build/clear-gallery-adoption-2026-11-13`, base `a6cd01c9`. Source material only: the old build
`build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note; it satisfies
the shared daily journal rule for this body. Only TASK-103 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body
names `clear-gallery-adoption-20261113`. The brief's path is used; the controller may move it.

## Status

Implementation complete and committed on the worker branch, awaiting controller verification.
Everything ran here except the two TASK-047 backend-lane cases, which need the PRE-001 test
backend (no `.env.runner.local` in this worktree; they fail at their explicit precondition).

## Intended outcome

- JOURNEY-031 (completion owner): `/workout`'s timed blocks are Round 7's `TimedWorkoutFlow` and
  `TimedResultLog`, and their Save log writes `block_results` and `block_movement_results` through
  `BlockCompletionProvider` and TASK-031's `saveTimedResult`; a refused write keeps the draft and the
  dialog; the retry converges; History reads the saved effort face and movement actuals back.
- JOURNEY-026 (completion owner): `/history` keeps Round 7's rows (title, then status with the date,
  then metrics) and the carried TASK-026 filter (All entries, Completed, Partial).
- Nothing the shipped timed renderers did on the base is lost while TASK-104, TASK-105 and TASK-116
  are pending.

## Changes

- **The seam.** `PRODUCT_PRESENTATION.timedWorkflows.saveResult` is `saveLogThroughShell`
  (`src/ui/timed-result-shell.ts`). `saveResult` now also receives `{ block, shell }`; the gallery's
  sample ignores it. With it present, `BlockSlot` draws EMOM, AMRAP, For Time and timed ladders with
  `TimedWorkoutFlow` (scheduled-start ladders keep `LadderBlock`).
- **The provider.** `BlockCompletionApi.saveTimedLog` (`src/state/block-completion.ts`, provider in
  `block-completion-provider.tsx`): keeps the report as the block's latest, waits for an in-flight
  section save, saves through the existing `saveTimed` (row, 23505 → correct, movement rows under
  ids minted once per block), then records the block (`onBlockRecorded` `saved`) or replaces its
  rows on a correction. No new `perceivedEffort:` or `effort:` key in the provider.
- **The translation** (`src/ui/timed-result-shell.ts`): receipt/draft → outcome in each format's
  existing contract (EMOM no measured outcome; AMRAP elapsed + counts once ended; For Time elapsed +
  completed under cap once ended; ladder highest rung only), report (category effort, typed entries;
  blank not sent unless a saved row must be removed), and saved row → receipt (TASK-048 read-back).
- **`TimedWorkoutFlow`:** reports outcome and timed report through `BlockPanel` continuously, so the
  forward action still saves what was entered without Save log; reads a saved row back as the saved
  log; keeps its clock (and an AMRAP's counts) in the shipped renderers' records through
  `src/state/timed-attempt-records.ts` when inside the shell, nothing in the gallery; does not reopen
  an already-ended log on remount; carries the shipped renderers' `data-urgent` marker; draws the
  shipped AMRAP's like-for-like score line (`AmrapComparison`, now exported).
- **`TimedResultLog`:** the AMRAP's "Reps into the next round" count (`partialReps`) beside the
  per-movement amounts — the shipped AMRAP's partial round, kept per the logging contract's owner
  decision ("the AMRAP keeps partial_round_reps beside the amounts").
- **`BlockPanel`:** passes `completion.timed` to `BlockCompletionControl` (TASK-015).
- **History detail** (`src/ui/session-detail.tsx`): the block's categorical effort through
  `SetEffortReading`, each movement's recorded actual under it (`data-movement-actual`), and the set
  table's column named RPE again. `src/app/SessionDetail.tsx`: facts in Review's order (TASK-004),
  as the F1 test body requires.
- **History rows** (`src/ui/history-list.tsx`): under Round 7 the status and the stored date share
  one line beneath the title (Home's status-date style), so they no longer wrap apart at 320.
- **Tests:** `src/ui/session-detail-timed-actuals.test.tsx` (build file, byte-identical);
  `src/app/SessionDetail.test.tsx` (now byte-identical to the build); new
  `src/ui/timed-flow-save.test.tsx` (7); one new ownership assertion; `Workout.test.tsx`'s two AMRAP
  helpers read Round 7's log (bodies unchanged); gallery registry exemption for `AmrapComparison`;
  `e2e/refinement/task-047.spec.ts` and `task-026.spec.ts` rewritten for Round 7 (same assertions);
  new `e2e/refinement/task-103-parity.spec.ts` (10).
- **Evidence:** `evidence/refinement/task-103/required-cases.json`, `test-ledger.json`,
  `results/check-01.json`, `results/parity.json`, `parity/*.json` (receipts). Captures are outside
  Git, in the project evidence store under `clear-gallery-adoption-v2-20261116/task-103/captures/`,
  hashed in the receipts.
- `PROJECT_MAP.md`: the Save log data flow.

Gallery-owned files changed (for the controller's hand diff): `src/ui/timed-workout-flow.tsx`,
`src/ui/timed-result-log.tsx` (AMRAP partial count; visible in the gallery's AMRAP log),
`src/ui/workout-experience-presentation.tsx` (seam type), `src/ui/block-renderers-frame.tsx`,
`src/ui/session-detail.tsx`, `src/ui/history-list.tsx`, `src/ui/amrap-block.tsx` (export only).
The gallery states render these live components, so `/gallery/refinements` shows the changes in the
same commit; the parity check found no text difference between the timed states and the route.

## Failures and corrections

- Switching the timed formats on failed 5 base tests in `Workout.test.tsx`: the AMRAP lost its
  clock and counts on navigation. Fixed by keeping the attempt in the shipped renderers' records, not
  by changing the tests' assertions.
- `initialTimedResultDraft` first lived in `timed-result-log.tsx` and added a fast-refresh lint
  warning; moved to `timed-result-shell.ts` (lint back to 175 warnings).
- TASK-026's e2e failed on Round 7 rows: at 320 the status and the date wrapped onto two lines.
  The row was fixed (one status-date line), not the assertion.
- The parity spec first read the route card before its movement list was drawn; it now waits for
  animations and stable text.
- Exporting `AmrapComparison` tripped the gallery registry's coverage test; recorded as an exemption
  (it draws `ConditioningScoreLine`, already framed).

## Verification (this worktree)

- `run-required-check TASK-103 check-01` (vitest, 7 files): PASSED, 139/139.
- `run-required-check TASK-103 parity` (playwright, host lock): PASSED, 10/10. Every timed state
  matched the route with zero text differences at 320 and 390 (ready, log, ended); History's
  differences are all labelled (TASK-AC-6BFF651DF237, AC-C53-01, AC-R026-01).
- `run-required-check TASK-026 check-01`: PASSED, 5/5.
- `run-required-check TASK-047 check-01`: 3/5 — the two synthetic lanes and the gallery case pass;
  the two backend lanes fail at their PRE-001 precondition (no credentials here). Not proved here.
- `TASK-030 check-01` 112/112, `TASK-030 check-02` 12/12, `TASK-031 check-01` 12/12: PASSED. Their
  receipts were restored to the committed versions (other tasks own them).
- `npm run typecheck` pass; `npm run lint` 0 errors, 175 warnings (as base); `npm run lint:ds`
  pass; console check pass; `gen-issues --check` pass; `gen:types --check` pass; `npm test`
  6,239/6,239; `npm run build` pass.

## Open assumptions and questions

- Pause is still held in memory (TASK-104): the record keeps the clock's start moved on by completed
  pauses, but a reload while paused restores a running clock.
- An edit made after a save and then abandoned is not saved by the forward action (the block is
  already recorded); Save log is the authority once a log is saved.
- An AMRAP amount entered with no round count is refused by the contract (no round identity) and the
  log says it did not save; TASK-116 owns the AMRAP entry rules (amounts reset when rounds change).
- For the owner: Round 7's gallery History sample reads "date · status"; the app reads the status,
  then the date (decision 7 as task 1 implemented it, C53's carried row). Labelled AC-C53-01 in the
  receipt; worth confirming at approval.
- The backend lanes of TASK-047 are unverified until the controller runs them with PRE-001.

## Next action

Controller: run the brief's commands with the disposable backend, diff the gallery-owned files
above, and review the parity receipts and captures.
