# TASK-116 — A3 task 5b-1 (F3): AMRAP scoring, timed completion choices and effort (#739)

Body `clear-gallery-adoption-v2-20261118`, attempt 1, branch `v2/clear-gallery-adoption-v2-20261118/task-116-a1`,
integration branch `build/clear-gallery-adoption-2026-11-13`, base `eb6b20af` (TASK-105 and TASK-106 merged). Source
material only: the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note; it
satisfies the shared daily journal rule for this body. Only TASK-116 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body names
`clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 to TASK-106 did.

## Status

Attempt 1 implemented, every required check passed in this worktree, two-run proof done (see "Verification").
One placement question is open for the controller (see "Open"). Nothing pushed.

## Intended outcome

- JOURNEY-009 (completion owner) on `/workout`: the AMRAP's work and prescription come first; once the window closes
  the one "Log results" dialog holds rounds and the partial round as one group of two framed counts, blank distinct
  from an explicit 0, no reset controls, nothing cleared implicitly.
- JOURNEY-010 (completion owner) on `/workout`: For Time and ladder logs ask Work completed with Complete beside
  Incomplete in one row, starting where the attempt ended (never every round because Finish was pressed), the athlete
  corrects it, For Time asks only with a cap, and the existing three faces stay optional (null unanswered, never a
  number or a mood). The face is saved as `block_results.effort` through the shell's one completion path.
- Save authority for AMRAP and For Time as TASK-105 holds it for the ladder (TASK-AC-8FF68F3F5241), and the draft
  survives close, reopen and a failed save (TASK-AC-ABFEF4069683).

## What was already there

TASK-103 made `TimedWorkoutFlow` the route's timed renderer with `TimedResultLog`, `QuantitySelector` and
`SetEffortChoice` inside one `LoggingOverlay`; TASK-105 added the ladder's durable attempt, `saveFailed` on the log and
`SetEffortChoice`'s named Clear and `disabled` face; TASK-106 the dialog's focus rules. The carried TASK-009/TASK-010
unit cases were written first: 14 of 19 already held on Round 7; the 5 that failed were exactly the For Time answer's
persistence and the AMRAP/For Time save authority.

## Changes

Product (none in the scheduling lane except tests; each listed for the controller):

- `src/ui/timed-workout-flow.tsx` (gallery-owned; named by the objective):
  - For Time starts where the race ended (Finish under the cap Complete, the cap Incomplete; `startDraft`) and only the
    athlete's answer is stored on the race (`writeForTimeAnswer`, TASK-010's `workCompleted`), so a reload brings back
    a correction. With no cap nothing is asked or claimed (`askCompletion`).
  - AMRAP and For Time save authority: a refused Save log or forward-action save (`onBlockSaveFailed`) is kept on the
    attempt's own record (`writeTimedSaveFailed`) and passed to the log as `saveFailed`, so `Your log didn’t save. Try
    again.` is said after a reload; a landed save (`Save log`, or `onBlockRecorded` `saved`) clears it; a `known` row
    while this attempt's own richer save (face or typed entry) had failed calls `reopenBlock`, else the row is the
    result. The saved row was already read back ahead of the local echo (TASK-103/TASK-048) and still is.
- `src/ui/timed-result-log.tsx` (gallery-owned): `askCompletion` prop (default true); a For Time's partial amounts only
  when answered Incomplete (`draft.completed === false`), so an unanswered (uncapped) race offers none. No look change
  for any accepted state (each has a cap).
- `src/ui/timed-result-shell.ts`: For Time's `completedUnderCap` is the athlete's answer (TASK-010's
  `forTimeCompletion` rule), no longer forced false at the cap, so a Complete given at the cap is recorded as given.
- `src/state/timed-attempt-records.ts`: `RestoredTimedAttempt.answer` and `.saveFailed`; both kept on every write;
  `writeForTimeAnswer`, `writeTimedSaveFailed` (written only when the flag changes, so an old record is never
  rewritten).
- `src/state/amrap.ts`, `src/state/for-time.ts`: optional `saveFailed` on the records, kept by the clamps as `true`
  only. `src/state/workout-persistence.ts`: the validators accept it (optional boolean).

Tests and specs:

- `src/ui/timed-result-log.test.tsx` (new): the build's TASK-009 (8) and TASK-010 (9) describe blocks, every case
  rewritten onto Round 7's owners with the build's names and asserted behaviour (each read change is in the ledger),
  plus one added case per block for TASK-AC-8FF68F3F5241 / TASK-AC-ABFEF4069683 (and TASK-AC-85F76FF493AB). Titles
  start `TASK-009 ` / `TASK-010 `, so the anchored filters select exactly 9 and 10 cases.
- `src/ui/amrap-block.test.tsx` (TASK-110's file): the build's four TASK-009 blank/zero cases, in place of the four base
  cases they supersede, mounted as the route draws the AMRAP (`renderRouteAmrap`: `BlockSlot` under the product
  presentation). The other base cases are untouched.
- `src/ui/set-effort.test.tsx` (owned whole): unchanged cases plus one TASK-010 case for the always-named Clear and the
  disabled saved face.
- `e2e/refinement/task-009.spec.ts`, `task-010.spec.ts`: rewritten onto Round 7 (same cases, same asserted behaviour;
  added reads for TASK-AC-8FF68F3F5241: the log still says it did not save after the refused save and a reload).
- `e2e/refinement/task-116-parity.spec.ts` (new, 6 cases): amrap, for_time, ladder at 320 and 390 — card before Start,
  log past the cap, the same log answered alike on both sides, and the card behind it; words and element boxes;
  captures in the evidence store under `clear-gallery-adoption-v2-20261118/task-116/captures/`.
- Evidence: `evidence/refinement/task-116/required-cases.json` (check-01 13, check-02 4, parity 6), `test-ledger.json`,
  `parity/*.json`, `results/*.json`; the TASK-009 and TASK-010 manifests' check-01 commands now use the anchored
  patterns, add the two new cases, and their descriptions name the Round 7 owners (case names unchanged).

Gallery-owned files changed (for the controller's hand diff): `src/ui/timed-workout-flow.tsx`,
`src/ui/timed-result-log.tsx`. Each change is named by a criterion and listed in each parity receipt's
`galleryChanges`; the parity check found zero text and zero layout differences on all four moments of the six cases.

Not changed: `src/ui/amrap-block.tsx` (the presentation-less renderer no route draws), `src/ui/set-effort.tsx`,
`src/ui/quantity-selector.tsx`, `src/ui/logging-overlay.tsx`, `src/test/timed-log-dialog.ts` (the build's unused
TASK-046 helper; the carried cases use local Round 7 helpers), `PROJECT_MAP.md` (no new boundary or flow).

## Failures and corrections

- First carried TASK-010 end-to-end run: two `Conditioning` headings on return (Round 7 heads each block's card with the
  section's name) — the lookup now waits for the work list instead.
- Reading the ladder's saved read-back after "Edit log" found none: while a saved log is being edited Round 7 hides its
  read-back (owner decision 8, 2026-11-18, leaves that behaviour to UAT). The rung read-back is read before Edit log.
- `react-hooks/immutability`: the AMRAP/For Time listeners first sat before the completion seam's destructuring and
  read `draftNow` before its declaration; moved after it and read the non-ladder draft directly.
- First browser run: (a) Round 7 draws a blank count's dash in the disabled role, not the timer role the build asserted
  — the contract now asserts the timer role (and "distinct from its label") of a number, the disabled role of a blank;
  (b) my own assumption that Round 7 opens the log at the cap was wrong in one run and right in the next — its own
  opening is timing-dependent under Playwright's held clock. The keyboard cases now run the held clock a second, close
  a log that opened by itself, then open it from the card's action as the build did; the touch and gallery cases wait
  briefly for Round 7's own opening before closing it (`ownOpening`).
- Parity, first pass: the answered AMRAP frame at 320 px showed the dialog scrolled to the face just tapped (both sides
  alike, zero differences); the moment is now read from the log's top on both sides so the capture shows the counts.

## Verification

See the final table below (filled in at the end of the session).

## Open

1. **Placement of other TASK-009-citing build bodies (plan question, not decided here).** Beyond the four blank/zero
   cases the brief names, the build edited more bodies of `src/ui/amrap-block.test.tsx` whose comments cite TASK-009:
   “ends on its own when the block’s seconds have passed…” (TASK-009, TASK-046), “shows the elapsed time when the user
   finishes early, not the cap”, “takes a round back, and never counts below zero”, “is asked for after the window and
   nowhere before it”, “supplies an entered zero as a zero”, “labels each group inside the card it belongs to”
   (TASK-009, TASK-046), “does not call an early finish a cap”, “comes back into the completion state when the buzzer
   went while it was away”, and the absent “leaves urgency to the timer’s own shared warning…” (TASK-008, TASK-009);
   and `src/app/Workout.test.tsx` “retries a failed entered set with its original identity and saves once before
   continuing” (TASK-009, TASK-046). TASK-AC-3DBA941FE56F places a restored body with the task that builds what it
   asserts, but the brief enumerates only the four and says this task runs only its own cases in that file. Their base
   bodies still pass on `AmrapBlock`, which no route draws now; two of them assert the build's “05:23 on the clock”,
   which Round 7's accepted clock (the window left) does not draw. Recorded in the ledger (`rules.notInherited`).
2. **A disabled saved effort has no Round 7 surface** (as TASK-105 noted). `SetEffortChoice`'s `disabled` face and its
   always-named Clear are proved at component level (set-effort.test.tsx). Round 7 reads a saved timed log back as
   “Log saved” with “Effort: About right” in words and offers “Edit log”, not the build's disabled form; that read-back
   was not changed.
3. Effort and notes of an AMRAP or For Time are the log's memory: they survive close, reopen and a failed save, not a
   reload (the build's TASK-010 asserted the For Time's face is not stored). Counts and the For Time answer are stored.
4. Round 7 shows the AMRAP's clock as the window left after Finish early (`Finished`, 06:25), where the build said
   “01:35 on the clock”; the elapsed time is what is saved (`elapsed_seconds 95`).
5. Per-movement gating (an AMRAP's amounts only after a rounds count; the exact movement-group list) is TASK-015's,
   carried by TASK-117.

## Next action

Controller: verify the candidate; hand-diff `src/ui/timed-workout-flow.tsx` and `src/ui/timed-result-log.tsx` against
the allowance; look at the captures under `evidence-store/clear-gallery-adoption-v2-20261118/task-116/captures/`; take
Open item 1 to the owner if a placement decision is needed.
