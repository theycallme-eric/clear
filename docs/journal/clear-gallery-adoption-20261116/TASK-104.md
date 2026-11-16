# TASK-104 — A3 task 4 (F2): timed Pause, Resume and Finish early, kept across reloads (#727)

Body `clear-gallery-adoption-v2-20261116`, attempt 1, integration branch
`build/clear-gallery-adoption-2026-11-13`, base `ebedaf23` (TASK-103 merged). Source material only:
the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note;
it satisfies the shared daily journal rule for this body. Only TASK-104 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body
names `clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 did.

## Status

Attempt 1 (2026-11-16) implemented and committed on the worker branch (`bf9dadf6`), which stopped
on two conflicts. The controller decided both the same day, and the follow-up commit on top of it
applies them (see "Controller decisions (2026-11-16)"): the build's TASK-005 unique accessible name
for each grouped Coaching and notes region is brought into `src/ui/exercise-coaching.tsx`, so
TASK-006 check-02 passes for real; the 23 inherited build tests that belong to TASK-105 and
TASK-116 are recorded in the test ledger as `deferred`, each with its owning task and reason.

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
TASK-AC-8E33C288F00C, AC-C18-01). Under the controller's decision 1 (below), the follow-up commit
also changes these files, all listed in the adopted gallery's pinned file set:

- `src/ui/exercise-coaching.tsx`;
- `src/ui/block-renderers-frame.tsx` (one prop at the caller);
- the two base assertions in `src/app/circuit-rounds.test.tsx` and `src/app/Workout.test.tsx`.

The gallery states render the live component. Their look is unchanged (see the verification
section).

## Controller decisions (2026-11-16)

The controller decided both conflicts the first commit stopped on. The follow-up commit on top of
`bf9dadf6` applies them.

1. **TASK-006 check-02 passes for real.** The build's TASK-005 naming (181e580) is brought into
   `src/ui/exercise-coaching.tsx` in its smallest form. `GroupExerciseCoaching` takes the block's
   `format` (its badge words) as the build's did, and its trigger reads "Coaching and notes" plus a
   visually hidden (`a11y-hidden`) "— FORMAT: movement, …". The visible words and look are
   unchanged, and each grouped region gets its own accessible name (for example "Coaching and
   notes — EMOM: kb swing, burpee"). The two callers pass `block.identity.format`, exactly as the
   build's callers did: `BlockPanel` (`src/ui/block-renderers-frame.tsx`) and the one-movement
   timed card (`src/ui/timed-workout-flow.tsx`). There is no scan exception and no disabled rule.
   TASK-109 re-proves it later.
   - The two base assertions this changes now use the build's own versions:
     `src/app/circuit-rounds.test.tsx` checks the name "Coaching and notes — CIRCUIT: kettlebell
     swing, push up, goblet squat"; `src/app/Workout.test.tsx` uses the build's `GROUP` constant
     "Coaching and notes — SUPERSET: back squat, barbell row" for the button and region. Both are
     recorded in the test ledger as `rewritten`, with the reason "TASK-005 accessibility naming,
     required by TASK-006 check-02".
   - This task's own lookups follow the name. `src/ui/timed-workout-flow.test.tsx` `coachingOf`
     finds each card's disclosure by its exact unique name, and the card still holds exactly one.
     `e2e/refinement/task-006.spec.ts` `readSlot` finds the disclosure by the visible words followed
     by "— FORMAT: …". The ledger notes for those cases say so.
2. **The 23 inherited tests that belong to later tasks** (the build's `timed-workout-flow.test.tsx`:
   TASK-011 ×8, TASK-013 ×8, TASK-014 ×7) are recorded in
   `evidence/refinement/task-104/test-ledger.json` as disposition `deferred`, each with `task`
   (TASK-116 for TASK-011's EMOM end log; TASK-105 for TASK-013/TASK-014's ladder check-off,
   handoff and durable Undo) and a `reason`. The reason says the owning task owns the behaviour,
   its approved verification runs the test by name (TASK-011 check-01 `--testNamePattern EMOM`;
   TASK-013 check-01 `"ladder|rung|handoff"`; TASK-014 check-01 `"undo|resume|cap"`), and
   TASK-115's end-of-run ledger check requires it carried. None of them is added as a failing,
   skipped or todo test. No checker refuses `deferred`: nothing in the repository reads the
   ledger, and the A3 ledger tool (`gallery-a2/tools/a3-test-ledger.mjs`) already knows `deferred`
   with `task` and `reason`.

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
- Follow-up (decision 1): `readSlot` in `task-006.spec.ts` matched the disclosure by its exact
  `textContent`. Once the name carried the hidden qualifier, that match would find nothing, so it
  now matches the visible words followed by "— FORMAT: …". In the same way,
  `timed-workout-flow.test.tsx` looks the disclosure up by its exact unique name. Before the
  implementation, the four updated unit assertions failed (circuit-rounds 1, Workout 1, timed flow
  2); with it, all pass.

## Verification (this worktree, first commit `bf9dadf6`)

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

## Verification after the controller's decisions (2026-11-16, follow-up commit)

- `run-required-check TASK-104 check-01`: PASSED, 147/147 (74 required cases).
- `run-required-check TASK-006 check-01`: PASSED, 14/14.
- `run-required-check TASK-006 check-02` (host lock): **PASSED, 7/7**. The six route cases now pass
  their closing axe scan with no exception and no disabled rule; the receipt is rewritten by the
  guard.
- `run-required-check TASK-104 parity` (host lock): PASSED, 10/10, with zero text and zero layout
  differences. All 100 gallery and route captures (5 moments × 2 sides × 10 cases) are
  byte-identical to the run on `bf9dadf6`. The only receipt changes are `lines` (the hidden
  qualifier, read by `innerText`; see below) and one more element measured per moment (the hidden
  span), identical on both sides.
- Gallery look check, before and after (host lock; a scratch script outside the repo, not a
  deliverable): every `/gallery/refinements` state that draws a Coaching and notes disclosure was
  captured at 320 and 390 with the clock fixed and reduced motion, first with the three changed
  sources at `bf9dadf6` and then with the change. That is 14 states with a grouped disclosure
  (cards, preparation, ladder-4, ladder-12, ladder-long, urgency, superset, circuit-round,
  circuit-movement, movement-note, emom, amrap, for_time, ladder) and 6 with the standalone panel
  as a control. All 88 disclosure captures, closed and opened (64 grouped, 24 standalone), are
  byte-identical, at the same boxes. Full-page captures are identical except on 4 states at 390,
  where every differing pixel is in the 15 CSS px right-edge strip (the transient overlay
  scrollbar) or the 20 CSS px bottom edge; there are zero differences elsewhere.
- Unit tests before the implementation: the four updated assertions failed (red). After it they
  pass, along with `exercise-coaching`, `movement-countdown-circuit`, `gallery-registry`,
  `Review`, `superset-block` and `circuit-block`.
- The brief's CI chain on the final tree exited 0:
  - typecheck passes;
  - lint: 0 errors, 175 warnings (the same as the base);
  - lint:ds, `gen-issues --check` and `gen:types --check` pass;
  - `npm test`: 6,255/6,255 in 264 files (the count is unchanged; only assertions changed);
  - the build passes;
  - the console grep finds no match.

## Open assumptions and questions

- **Scope conflict, decided 2026-11-16 (decision 2 above).** The groundwork ledger gives all 32
  of the build's `timed-workout-flow.test.tsx` tests to F2, and the issue says all 32 are
  rewritten. Nine are TASK-006's and are rewritten here. The other 23 assert F3 behaviour end to
  end: TASK-011's EMOM end log (8), TASK-013's durable ladder check-off and handoff (8) and
  TASK-014's durable Undo (7). They are now ledgered as `deferred` to TASK-116 or TASK-105. They
  stay open until those tasks carry them; TASK-115's end-of-run ledger rerun accepts no
  `deferred` entry.
- **Axe on `/workout`, decided 2026-11-16 (decision 1 above).** The build's TASK-005 unique
  coaching names are carried here; TASK-109 (F7) re-proves them later.
- Round 7 draws no EMOM rest line ("15s rest at the end of each minute"), no "Cap in mm:ss" line and
  no For Time "Finished under cap" status; the rewritten cases assert the same behaviour through
  Round 7's own words (recorded per case in the test ledger). The EMOM keeps Round 7's caption
  "Paused" while paused (the minute is held by its Now marker and its seconds left).
- At 320 the route's element capture of a tall card is clipped by the shell's scroll region and
  footer (as TASK-103 recorded); the box comparison measures the whole card.
- The parity receipts' `lines` come from `innerText`, which also reads text that is visually
  clipped. Since decision 1, each card's line list therefore includes the hidden qualifier (for
  example "— EMOM: KB SWING") on both the gallery side and the route side. That text is not
  visible: the receipts' gallery and route captures are byte-identical to the ones from before the
  change.

## Next action

Controller: run the brief's commands on the follow-up commit. Diff these gallery-owned files by
hand:

- `src/ui/timed-workout-flow.tsx` and `src/state/timed-attempt.ts` (the objective);
- `src/ui/exercise-coaching.tsx`, `src/ui/block-renderers-frame.tsx` and the two base test files
  `src/app/circuit-rounds.test.tsx` and `src/app/Workout.test.tsx` (decision 1).

Then review the parity receipts and captures. TASK-105 and TASK-116 must carry their deferred
build tests before TASK-115's ledger rerun.
