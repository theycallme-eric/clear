# TASK-105 — A3 task 5a (F3): durable ladder, live rung progress and Undo finish (#728)

Body `clear-gallery-adoption-v2-20261116`, attempt 1, integration branch
`build/clear-gallery-adoption-2026-11-13`, base `caa3dcce` (TASK-103 and TASK-104 merged). Source
material only: the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the
task-owned progress note; it satisfies the shared daily journal rule for this body. Only TASK-105
writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body
names `clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 and TASK-104 did.

## Status

Attempt 1 (2026-11-16) committed on the worker branch. Everything inside the lane is done and
proved. Two parts of the approved scope need files outside the lane, so they were not edited (as
the controller instructed) and their inherited tests fail until those files are granted:

1. **Review's ladder rounds** (TASK-AC-F3CDA21AC50B; JOURNEY-012 on `/review`) need
   `src/app/Review.tsx`. Round 7's `ReviewSectionCard` / `ReviewBlockRows` read the Review model
   but never draw a ladder block's `ladderRounds` (carried in `src/state/review.ts`). The
   `/review` page shows each ladder's rung sequence row ("12 rungs · 2-4-…-24 reps") and no
   rounds grid.
2. **Scheduled ladders on `/workout`** (AC-R012-02, TASK-AC-65E0E29153D0, TASK-AC-72579D52073C
   for `scheduled_starts`) need `src/ui/ladder-block.tsx`, or `src/ui/block-renderers.tsx` plus a
   schedule mode in `TimedWorkoutFlow`. `BlockSlot` still sends a scheduled ladder to Round 7's
   `LadderBlock`. That component still draws the rejected "— same every round" suffix and "Round N"
   rows, keeps its clock under the For Time key and has no durable answer.

## Intended outcome

- JOURNEY-012/013/014/032 (completion owner) on `/workout`: a raced ladder is Round 7's
  `TimedWorkoutFlow` holding the ladder's one durable attempt. The compact prescription and live
  check-off are `LadderPrescription`. The log is the one "Log results" `LoggingOverlay` with
  `TimedResultLog`, `LadderCompletion`, `SetEffortChoice` and notes. Undo finish · resume ladder
  and save authority work as the build's did.
- The ladder cases of JOURNEY-010/015/019/031 on the same owners.

## Changes

- `src/ui/timed-workout-flow.tsx` (gallery-owned; named by the objective): for a ladder, the
  flow holds `usePersistedLadder` (TASK-032's record, `clear.workout-ladders`). That one owner has
  the clock against the original cap, the progress, the draft (answer, rung, entries, effort,
  notes), the Undo checkpoint and the save state. Other formats are unchanged.
  - The log's draft is the durable draft (changes are sent as patches; an answer and its rung
    always travel together).
  - Undo uses `ladderUndoAvailability`. It re-reads the clock each second while it can run out, so
    it is withdrawn at the original cap.
  - Shell listeners close the attempt in the same act: `onBlockRecorded` (`saved` → saveSucceeded;
    `known` → markRecorded, or `reopenBlock` when this attempt's richer save had failed);
    `onBlockSaveFailed` → saveFailed. Save log failures and successes are kept on the attempt too.
  - A saved ladder shows its row read back (`receiptFromRecorded`); with no row known here it shows
    the draft this device saved, and saved elsewhere it claims nothing. It is closed: no lifecycle,
    even if it was never started, and "Edit log" stays Round 7's correction.
  - Other details: the malformed-ladder note; the timing's own round count; the quiet Undo's row
    gives the small button's inset back (`margin-inline: calc(var(--spacing-300) * -1)`, C60).
  - The clock readout is read from the attempt at render, which fixes Round 7's one-tick-stale
    readout after Undo (all formats; AC-R014-03).
- `src/ui/ladder-rungs.tsx` (gallery-owned; named by the criteria): `LadderPrescription` reads
  the shared `ladderProgressionText` and `ladderRoundReadings`, the readings Review's
  `ladderRounds` also uses.
  - A read-only round is spoken in words. Live toggles keep Round 7's name "Complete round N"
    (pinned by the gallery's own test) and describe their work through `aria-describedby`.
  - A tap inside the selection leaves the rounds before it (`ladderPrefixAfterTap`, AC-R013-01).
    Round 7's live grid used to select through it.
  - Nothing marked reads "No rounds marked yet", not "0 of N" (AC-C34-01; real data only).
  - A live tile keeps the read-only tile's declared inset, so "BURPEE" no longer breaks mid-word at
    390 (JOURNEY-012 "readable wrapping").
  - Hooks `data-ladder-prescription`, `data-ladder-round`, `data-ladder-entry`,
    `data-ladder-movement`, `data-movement-load`.
  - `LadderCompletion`: `data-ladder-rung`, `disabled`, `role="status"` on its count, and the same
    words and tap rule.
- `src/ui/ladder-rungs.css` (gallery-owned): the summary line wraps a long word
  (`overflow-wrap: anywhere`); no drawn change for the accepted states.
- `src/ui/timed-result-log.tsx` (gallery-owned): a durable `saveFailed` message (one alert, the
  accepted words); the ladder's partial-amount fields only once a round is stated (null is not
  round 0); the rung unit is the shared `ladderUnit` (`sec`, not "seconds").
- `src/ui/set-effort.tsx` (gallery-owned): the build's union props (the Clear is always named) and
  `disabled` (TASK-048).
- `src/state/workout-persistence.ts`: `usePersistedLadder` option
  `adoptLegacyClock: 'at-once' | 'on-first-change'`. The default is TASK-032's; the route uses
  TASK-104's lazy adoption, so TASK-104's test holds.
- `src/state/timed-attempt-records.ts`: the ladder branch is removed (one writer).
- Tests:
  - `src/ui/timed-workout-flow.test.tsx`: the 15 TASK-013/TASK-014 build tests, rewritten.
  - `src/ui/ladder-block.test.tsx`: the build's 35 definitions (39 tests).
  - `src/ui/ladder-rungs.test.tsx`: new on this branch, the build's 9.
- E2E: `e2e/refinement/task-012|013|014|048.spec.ts` rewritten for Round 7; new
  `e2e/refinement/task-105-parity.spec.ts` (8 cases).
- Evidence: `evidence/refinement/task-105/required-cases.json`, `test-ledger.json`,
  `parity/*.json`, `results/*.json`; carry notes appended to the TASK-012/013/014/048 manifests'
  descriptions (case names unchanged). Captures are outside Git, in the evidence store under
  `clear-gallery-adoption-v2-20261116/task-105/captures/`, hashed in the receipts.
- `PROJECT_MAP.md`: the ladder's one owner on the route.

Gallery-owned files changed (for the controller's hand diff): `src/ui/timed-workout-flow.tsx`,
`src/ui/ladder-rungs.tsx`, `src/ui/ladder-rungs.css`, `src/ui/timed-result-log.tsx`,
`src/ui/set-effort.tsx`. The gallery states render these live components, so `/gallery/refinements`
shows each change in the same commit. Each parity receipt lists the changes against bec4454 with
their criteria (`galleryChanges`).

## Failures and corrections

- Removing the live tiles' "Complete round N" name broke the gallery's own test
  (`src/dev/gallery-refinements.test.tsx`, outside the lane). The name was kept, and the work is
  given as a description instead.
- `usePersistedLadder` writes an older ladder clock as soon as it mounts, but TASK-104's test needs
  the route to adopt it only on the first action. The hook got an explicit option rather than a
  changed default (TASK-032's test pins the default).
- Round 7's log said "seconds" for a timed ladder where its grid said "sec". The log now uses the
  shared `ladderUnit`.
- A saved, never-started ladder offered "Start ladder" and an "Edit log" that opened nothing. Fixed:
  a saved ladder is closed, and its log is offered whether or not it ran here.
- The first C60 fix dropped the button's padding, which the build's browser check rejects (the focus
  frame must clear the first letter). It was replaced by the build's recipe: keep the inset, give it
  back outside the box.
- After Undo, Round 7's readout showed the finished time until the next tick. With the browser clock
  held it never updated (task-014.spec.ts). Fixed in the flow; the unit tests no longer need an
  extra clock read after Undo.
- Browser helpers: Round 7 opens the log by itself a moment after Finish, so `openLog` waits briefly
  for it. The design system's dialog leaves after a 200 ms timer, so `closeLog` runs a held clock by
  that exit only when the dialog has not left (running it unconditionally installed a held clock in
  the gallery case and froze it).
- The parity spec's new word-break guard failed on the unfixed padding (the gallery's running state,
  six broken words) and passes with the fix.

## Verification (this worktree)

- Unit: `npx vitest run src/ui/timed-workout-flow.test.tsx`: 28/29. The one failure is JOURNEY-013
  "…and a schedule" (its schedule third; out-of-lane `ladder-block.tsx`).
- `src/ui/ladder-block.test.tsx`: 34/39. The 5 failures are the scheduled-ladder cases.
- `src/ui/ladder-rungs.test.tsx`: 5/9. The 4 failures: Review (Review.tsx) and three
  scheduled-ladder cases.
- State tests (`ladder-save-authority`, `refinement-ladder-recovery`, `review`): 62/62.
- Browser (host lock):
  - `task-013.spec.ts` 5/5; `task-014.spec.ts` 5/5.
  - `task-048.spec.ts` 4/6: both synthetic lanes, the deterministic clocks and the gallery case
    pass. The two backend lanes stop at their PRE-001 precondition (no test backend in this
    worktree).
  - `task-105-parity.spec.ts` 8/8: zero unintended text and layout differences at 320 and 390, and
    no broken word in a live tile.
- CI pieces: typecheck pass; lint 0 errors, 175 warnings (as base); lint:ds pass;
  `gen-issues --check` pass; `gen:types --check` pass; console grep no match.

## Verification (final, through the guard; receipts in `evidence/refinement/*/results/`)

| Check | Result | Why |
|---|---|---|
| TASK-105 check-01 | REJECTED, 101/110 | 5 scheduled-ladder cases in `ladder-block.test.tsx`; Review and 3 scheduled cases in `ladder-rungs.test.tsx` |
| TASK-012 check-01 | REJECTED, 5/9 | The same 4 `ladder-rungs.test.tsx` cases |
| TASK-012 check-02 | REJECTED, 2/5 | The two "Review then Workout" cases stop at Review's missing grid; touch-and-recovery stops at the scheduled card. The keyboard and gallery cases pass. |
| TASK-013 check-01 | REJECTED, 7/8 required | JOURNEY-013 "…and a schedule" |
| TASK-013 check-02 | PASSED, 5/5 | |
| TASK-014 check-01 | REJECTED | All 7 required TASK-014 cases pass. The pattern `undo\|resume\|cap` also runs the blocked JOURNEY-013 "no cap … schedule" case, so the runner exits 1. |
| TASK-014 check-02 | PASSED, 5/5 | |
| TASK-032 check-01 | PASSED, 10/10 | Run with `--no-receipt`: TASK-032's evidence folder is outside the lane |
| TASK-048 check-01 | REJECTED, 4/6 | The two backend lanes stop at their PRE-001 precondition (no test backend here). Both synthetic lanes, the deterministic clocks and the gallery case pass. |
| TASK-105 parity | PASSED, 8/8 | |

- CI chain pieces:
  - typecheck pass;
  - lint 0 errors, 175 warnings (as base);
  - lint:ds pass;
  - `gen-issues --check` and `gen:types --check` pass;
  - console grep: no match;
  - `npm run build` pass (one built rule each for the touched selectors);
  - `npm test` 6,269/6,279. The 10 failures are exactly the out-of-lane cases above.
- Regression: `e2e/refinement/task-006.spec.ts` (TASK-104's lifecycle journeys over the same flow),
  run directly so it writes no receipt: 7/7.
- Side effect to know: TASK-006 check-01 and TASK-104 check-01 run the whole
  `src/ui/timed-workout-flow.test.tsx`, so the one blocked JOURNEY-013 case rejects them too until
  the scheduled ladder is wired. Every TASK-006 and TASK-104 case in the file passes.

## Open assumptions and questions

- Out-of-lane needs (see Status): `src/app/Review.tsx` and `src/ui/ladder-block.tsx` (or
  `block-renderers.tsx`).
- Round 7 offers the ladder's log once the attempt has ended. The build let an athlete answer, give
  an effort or write notes before Start or while paused; Round 7's accepted flow does not. The
  inherited tests now enter them after Finish, still before the reloads, Undo and saves that must
  keep them.
- A saved ladder is Round 7's saved log ("Log saved" with the row read back, plus "Edit log" for a
  correction), not the build's disabled form. `SetEffortChoice`'s `disabled` and
  `LadderCompletion`'s `disabled` are carried as component behaviour (the F3 inventory row), but no
  Round 7 surface shows a disabled saved effort. Worth the owner's word.
- Round 7's raced ladders draw no free-paced pacing paragraph ("Start each round when you finish the
  last…"), which the build kept for the `for_time` mode. The rewritten AC-R012-02 case reads Round
  7's flow. Flagged in the ledger.
- Round 7's ladder summary has no equipment word beside the movement (R132 in the build). This is
  the accepted gallery's look and is kept.
- The live toggles' accessible name stays Round 7's "Complete round N"; the round's work is their
  accessible description.
- Undo words are Round 7's "Undo finish · resume ladder" (lower-case "resume"; drawn in capitals).
  The card's "Resume ladder" beside "Log results" is Round 7's too.

## Next action

Controller: grant `src/app/Review.tsx` and `src/ui/ladder-block.tsx` (or decide how scheduled
ladders reach Round 7's owners) for a repair round, then rerun the brief's commands with PRE-001.
Diff the five gallery-owned files above by hand.
