# TASK-104 — A3 task 4 (F2): timed Pause, Resume and Finish early, kept across reloads (#727)

Body `clear-gallery-adoption-v2-20261116`, attempt 1, integration branch
`build/clear-gallery-adoption-2026-11-13`, base `ebedaf23` (TASK-103 merged). Source material only:
the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note;
it satisfies the shared daily journal rule for this body. Only TASK-104 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body
names `clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 did.

## Status

Attempt 1 (2026-11-16) implemented and committed on the worker branch; check-01 (both manifests),
parity and the CI chain pass. Two items need the
controller (see "Open assumptions and questions"): a scope conflict over 23 of the 32 inherited
build tests, and the axe scan at the end of six `task-006.spec.ts` route cases, which fails on a
pre-existing Round 7 duplicate landmark outside this task's files.

## Intended outcome

- JOURNEY-006 (completion owner): `/workout`'s timed blocks — Round 7's `TimedWorkoutFlow` — carry
  the build's lifecycle: one primary Start; running, a secondary Pause beside the format's primary
  Finish or Finish early; paused, Resume in Pause's place; ended, nothing. The slot sits after the
  work and before coaching, the long ladder's at the top. Section Finish stays distinct from Finish
  workout.
- Pause, Resume and Finish go through `src/state/timed-lifecycle.ts`; the pause is kept, so a reload
  while paused restores the paused clock with the same time left. A raced ladder pauses and resumes
  inside its durable attempt. An EMOM ended early says PAUSED / FINISHED EARLY and "Finished early,
  in minute N of M"; the For Time Finish label follows the cap.

## Changes

- `src/state/timed-attempt.ts` (gallery-owned; named by the objective): `moveTimedAttempt` moves the
  clock through `pauseClock`, `resumeClock` and `clockStopMoment`; new `timedAttemptClock` (the
  attempt as the stored clock: start moved on by every Resume, pause stamp while paused) and
  `timedAttemptFromClock` (the inverse, repairing an end before the start and a pause on an ended
  clock). Round 7's own `timed-attempt.test.ts` passes unchanged.
- `src/state/timed-attempt-records.ts` (TASK-103's): records keep `pausedAt` beside the start
  (`clear.workout-emom`, `clear.workout-amraps`, `clear.workout-for-time`); reading restores a paused
  attempt. A raced ladder's clock is kept in its durable attempt (`clear.workout-ladders`) under the
  workout's session, moved by `startLadderAttempt`, `pauseLadderAttempt`, `resumeLadderAttempt`,
  `finishLadderAttempt` and `undoLadderFinish`; an older ladder clock under the For Time key is
  adopted on the first action (`restoreLadderAttempt`) and the For Time record is left as it was.
  Progress, draft and save authority in that record stay TASK-105's; nothing here writes them.
- `src/ui/timed-workout-flow.tsx` (gallery-owned; named by the objective): the action row is an
  internal `TimedWorkoutActions` (Round 7's own `.clr-timed-actions` markup, unchanged look) with
  `data-timed-actions` (`after-work` / `top`) and `data-timed-phase`; the lead control is one element
  through Start → Pause → Resume, so focus is kept; Finish words from `finishLabel(format,
  hasWindow)`; Undo finish returns focus to the lead control; each action is recorded through
  `recordTimedAction`; an EMOM ended early captions "Finished early" (drawn FINISHED EARLY) and adds
  the build's note "Finished early, in minute N of M. Continue when you are ready." (windowless:
  "Finished in minute N."). The gallery states render this live component, so `/gallery/refinements`
  shows the change in the same commit; their accepted captures (ready, past the cap) are unchanged.
- Tests: `src/ui/timed-workout-flow.test.tsx` (new on this branch): the build's nine TASK-006 cases
  under their exact names, rewritten to Round 7's controls, plus five TASK-104 cases.
  `e2e/refinement/task-006.spec.ts`: the build's seven cases rewritten to Round 7 (same names).
  New `e2e/refinement/task-104-parity.spec.ts` (10 cases).
- Evidence: `evidence/refinement/task-104/required-cases.json` (check-01: 74 cases; parity: 10),
  `test-ledger.json`, `results/check-01.json`, `results/parity.json`, `parity/*.json`. TASK-006's
  `results/check-01.json` rewritten by its own guard. Captures are outside Git, in the evidence store
  under `clear-gallery-adoption-v2-20261116/task-104/captures/`, hashed in the receipts.
- `PROJECT_MAP.md`: the lifecycle and the ladder clock's new home.

Gallery-owned files changed (for the controller's hand diff): `src/ui/timed-workout-flow.tsx` and
`src/state/timed-attempt.ts`, both named by the objective (TASK-AC-591C4D5CE263,
TASK-AC-8E33C288F00C, AC-C18-01). No other gallery-owned file changed.

## Failures and corrections

- Exporting the action row tripped the gallery registry's coverage test; it is kept internal instead
  of adding a registry exemption.
- The first AC-C18-01 rewrite paused For Time after it had already run past its cap; the cap-hold
  check moved to the first pause (the build's own step), so it proves the cap freezes.
- After Undo finish the running readout lags by one tick (the elapsed hook re-reads on its interval;
  Round 7's existing behaviour). The test lets the clock tick before reading.
- `task-006.spec.ts` first measured the slot against the outer card; the build measured the card's
  content box. It now measures Round 7's content box (`.clr-movement-group`).
- `task-006.spec.ts`: after that, every behaviour assertion passes; six route cases fail only at
  their final unexcepted axe scan: `landmark-unique` on the four grouped "Coaching and notes"
  regions, which share one accessible name. Cause: Round 7's `GroupExerciseCoaching`
  (`src/ui/exercise-coaching.tsx`, gallery-owned) labels each region "Coaching and notes"; the build
  added a visually hidden "— FORMAT: names" (TASK-005, F7 → TASK-109). Not fixed here (outside this
  task's criteria; renaming breaks base assertions in `src/app/circuit-rounds.test.tsx` and
  `src/app/Workout.test.tsx`) and not excepted.
- The parity spec first captured the ended card under its open log; it now captures the log, closes
  it, then captures the ended card.

## Verification (this worktree)

- `run-required-check TASK-104 check-01`: PASSED, 147/147 (74 required cases).
- `run-required-check TASK-006 check-01`: PASSED, 14/14 (the 9 TASK-006 cases required).
- New unit cases checked against the base implementation (sources reverted, tests kept): 13 of 14
  fail (AC-R006-02, section Finish apart from Finish workout, already held on Round 7); all pass with
  the change.
- `npx playwright test e2e/refinement/task-104-parity.spec.ts` (host lock): 10/10, zero text and zero
  layout differences at ready, running, paused, log and ended, at 320 and 390, on all five states.
- `npx playwright test e2e/refinement/task-006.spec.ts` (host lock): 1/7 (gallery case); the six
  route cases fail at the final axe scan only (above).
- `run-required-check TASK-104 parity` (host lock): PASSED, 10/10.
- `run-required-check TASK-006 check-02` (host lock): REJECTED, 1/7. The six route cases fail only at
  their final axe scan (`landmark-unique`, the four grouped "Coaching and notes" regions); every
  earlier assertion in them passes. Its receipt was restored to the committed version; the
  controller's run will rewrite it.
- The brief's CI chain on the final tree: exit 0 — typecheck pass; lint 0 errors, 175 warnings (as
  base); lint:ds pass; `gen-issues --check` pass; `gen:types --check` pass; `npm test` 6,255/6,255
  (264 files; base 6,241 + 14); build pass; console grep no match.
- Not run here: the design-0143 timed e2e specs (pre-UAT per the groundwork ledger) and real
  phones.

## Open assumptions and questions

- **Scope conflict (for the controller).** The groundwork ledger gives all 32 tests of the build's
  `timed-workout-flow.test.tsx` to F2, and the issue says all 32 are rewritten. Nine are TASK-006's
  (rewritten here). The other 23 assert F3 behaviour end to end — TASK-011's EMOM end log (8),
  TASK-013's durable ladder check-off and handoff (8), TASK-014's durable Undo (7) — owned by TASK-116
  and TASK-105, whose own verification runs this file by name pattern. They are recorded in the test
  ledger as `deferred-unresolved`, not carried, rewritten or retired. Implementing them here would be
  those tasks' scope.
- **Axe on `/workout` (for the controller).** TASK-006 check-02 cannot pass at this point in the
  graph without TASK-005's unique coaching names (F7, TASK-109) or a decision to carry that one
  naming change here (it touches a gallery-owned file and two base assertions).
- Round 7 draws no EMOM rest line ("15s rest at the end of each minute"), no "Cap in mm:ss" line and
  no For Time "Finished under cap" status; the rewritten cases assert the same behaviour through
  Round 7's own words (recorded per case in the test ledger). The EMOM keeps Round 7's caption
  "Paused" while paused (the minute is held by its Now marker and its seconds left).
- At 320 the route's element capture of a tall card is clipped by the shell's scroll region and
  footer (as TASK-103 recorded); the box comparison measures the whole card.

## Next action

Controller: decide the two conflicts above; run the brief's commands; diff the two gallery-owned
files; review the parity receipts and captures.
