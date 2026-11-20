# TASK-116 — A3 task 5b-1 (F3): AMRAP scoring, timed completion choices and effort (#739)

Body `clear-gallery-adoption-v2-20261118`, attempt 1, branch `v2/clear-gallery-adoption-v2-20261118/task-116-a1`,
integration branch `build/clear-gallery-adoption-2026-11-13`, base `eb6b20af` (TASK-105 and TASK-106 merged). Source
material only: the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note; it
satisfies the shared daily journal rule for this body. Only TASK-116 writes it.

Round 07: body `clear-gallery-adoption-v2-20261120`, attempt 1, branch `v2/clear-gallery-adoption-v2-20261120/task-116-a1`,
base `779b3436` (TASK-107 merged). The round-06 work came in by fast-forward (round-07 decision R7-4); see "Round 07".

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body names
`clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 to TASK-106 did.

## Status

Round 06: attempt 1 implemented, every required check passed, two-run proof done (see "Verification"); accepted as
it stands (Eric, chat, 2026-11-19: "Yes, accept both").

Round 07: the accepted work merged unchanged; only this task's placement records were brought in line with round 07,
and every required check was run again on the merged tree (see "Round 07"). Round 07 places every body the round-06
placement question listed, so no placement question is open. Nothing pushed.

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

All browser runs were under the host lock (`v2.mjs with-lock`). No other task's parity spec was run.

Run 1 (final sources, through the guard; receipts written, then committed as `15617ffd`):

| Check | Result |
|---|---|
| TASK-116 check-01 (`set-effort.test.tsx` whole) | PASSED, 13/13 |
| TASK-116 check-02 (`amrap-block.test.tsx`, `TASK-009`) | PASSED, 4 executed of 45 (41 filtered out) |
| TASK-009 check-01 (`timed-result-log.test.tsx`, `^TASK-009 `) | PASSED, 9 executed of 19 |
| TASK-009 check-02 (`task-009.spec.ts`) | PASSED, 3/3 |
| TASK-010 check-01 (`timed-result-log.test.tsx`, `^TASK-010 `) | PASSED, 10 executed of 19 |
| TASK-010 check-02 (`task-010.spec.ts`) | PASSED, 3/3 |
| TASK-116 parity (`task-116-parity.spec.ts`) | PASSED, 6/6; zero text and zero layout differences on all four moments of every case |

The brief's whole CI chain, as one command on the run-1 tree, exits 0: typecheck pass; lint 0 errors, 175 warnings
(as at base); lint:ds pass; `gen-issues --check` (71 requirements, 136 edges); `gen:types --check` current; `npm test`
270 files, 6,330/6,330 tests; `npm run build` pass; console grep no match.

Earlier, before the receipts: the neighbouring suites the product change touches (`timed-workout-flow`,
`timed-flow-save`, `for-time`, `amrap`, `workout-persistence`, the gallery's own test, `for-time-block`,
`amrap-block`, `Workout`, `session-detail-timed-actuals`) passed 353/353; at base, before any product change, the new
`timed-result-log.test.tsx` failed 5 of 19, each on the work above.

Two-run proof: see "Verification (run 2)" below.

### Verification (run 2)

On the committed tree (`15617ffd`) all seven checks were run again, the same commands through the guard. The first
attempt at the browser checks waited out the host lock held by another run (environment waiting, retried; no defect).

- TASK-116 check-01 13/13, check-02 4/4, TASK-009 check-01 9/9, TASK-010 check-01 10/10, TASK-009 check-02 3/3,
  TASK-010 check-02 3/3, TASK-116 parity 6/6: all PASSED again.
- Afterwards `git status` showed no change under `evidence/`, `e2e/` or `src/`: every receipt (`results/*.json`) and
  every parity receipt (`parity/*.json`) came out byte-identical.
- The 36 parity captures in the evidence store (`clear-gallery-adoption-v2-20261118/task-116/captures/`) hash
  identically to run 1 (36/36, `shasum -a 256`).

## Round 07 (body `clear-gallery-adoption-v2-20261120`, attempt 1, 2026-11-20)

**Merge.** The accepted round-06 branch `v2/clear-gallery-adoption-v2-20261118/task-116-a1` was fetched from the
round-06 body's clone at `aa9ec055` and fast-forwarded onto `779b3436` with `git merge --ff-only`. The work now sits
as `6ad160af` and `aa9ec055` on `779b3436`; round 06's work commit `15617ffd` was on `eb6b20af`. Nothing this task
changes or inherits differs between `eb6b20af` and `779b3436`, checked with `git diff --stat` on its product, test and
spec files.

**Criteria.** Round 07 changed only the shared placement criterion (TASK-AC-E929B618AB5A, decision R7-1). Under it,
TASK-116 restores only its four TASK-009 blank and zero cases in `src/ui/amrap-block.test.tsx`. The branch matches:

- it changes exactly those four cases, ported onto the route by `renderRouteAmrap`;
- it changes no case in `emom-block`, `for-time-block` or `Workout.test.tsx`.

Every other criterion's text is round 06's, so the delivered work stands.

**Records changed.** No product code and no test assertion changed.

- `evidence/refinement/task-116/test-ledger.json`:
  - `source` names round 07's placement criterion and decision R7-1.
  - `rules.deferred` splits the AC-C26-01 entry in two. The exact per-movement group list goes to TASK-117, which
    restores it with TASK-015's gating (scan finding S5). The TASK-046 assertion that the form has no name of its own
    is retired by TASK-117 under R7-3.
  - `rules.notInherited` names a receiver for every body round 06 left as a plan question: TASK-110 for the
    amrap-block bodies and the Workout.test.tsx body, and TASK-108 for the urgency body. Open item 1 below gives the
    full list.
  - The AC-C26-01 entry's note says the same.
  - The summary counts are unchanged.
- This note: the status, Open items 1 and 5, this section and the next action.

**Verification on the merged tree** (2026-11-20). Every browser run was under the host lock
(`node …/agent-runner-v2/bin/v2.mjs with-lock -- <command>`). No other task's parity spec was run.

| Check | Result |
|---|---|
| `npm ci` | exit 0 |
| TASK-116 check-01 (`set-effort.test.tsx` whole) | PASSED, 13/13 |
| TASK-116 check-02 (`amrap-block.test.tsx`, `TASK-009`) | PASSED, 4 executed of 45 (41 filtered out) |
| TASK-009 check-01 (`timed-result-log.test.tsx`, `^TASK-009 `) | PASSED, 9 executed of 19 |
| TASK-010 check-01 (`timed-result-log.test.tsx`, `^TASK-010 `) | PASSED, 10 executed of 19 |
| TASK-009 check-02 (`task-009.spec.ts`) | PASSED, 3/3 |
| TASK-010 check-02 (`task-010.spec.ts`) | PASSED, 3/3 |
| TASK-116 parity, run 1 | PASSED, 6/6 |
| TASK-116 parity, run 2 | PASSED, 6/6 |
| CI chain (one command) | exit 0 |

Notes on the results:

- **Receipts.** After every check, `git status` showed no change under `evidence/`, `e2e/` or `src/`. Every
  `results/*.json` and every `parity/*.json` receipt came out byte-identical to the committed ones.
- **Parity.** Every receipt records 0 text and 0 layout differences.
- **Captures.** The 36 captures in `evidence-store/clear-gallery-adoption-v2-20261118/task-116/captures/` (the folder
  the spec already uses) hash the same before run 1, after run 1 and after run 2 (36/36, `shasum -a 256`).
- **CI chain.** Typecheck passed. Lint had 0 errors and 175 warnings, the same as at base. lint:ds passed.
  `gen-issues --check` found 71 requirements and 136 edges. `gen:types --check` found the types current. `npm test`
  passed 270 files and 6,339/6,339 tests (TASK-107 added tests since round 06's 6,330). `npm run build` passed. The
  console grep found no match.

**Failures and corrections** (environment only):

- The suggested lock command passed the body path as an argument. The installed `v2.mjs with-lock` takes only
  `-- <command>` because the lock is host-wide, so it was run in that form.
- The first try at parity run 2 timed out waiting for the host lock, which another run was holding. This was
  environment waiting, not a defect. The retry got the lock at once and passed.

## Open

1. **Placement of other TASK-009-citing build bodies: placed by round 07 (no longer open).** Round 06 left this as a
   plan question: beyond the four blank/zero cases, the build edited more bodies of `src/ui/amrap-block.test.tsx` that
   cite TASK-009, and one of `src/app/Workout.test.tsx`. Round 07's placement criterion (TASK-AC-E929B618AB5A,
   decision R7-1, replacing round 06's TASK-AC-3DBA941FE56F) keeps TASK-116 to its four TASK-009 cases in amrap-block
   and places the rest. Each receiver is in the ledger's `rules.notInherited`:
   - **TASK-110** (owns amrap-block and Workout.test.tsx and runs them whole):
     - “takes a round back, and never counts below zero”, “is asked for after the window and nowhere before it”,
       “supplies an entered zero as a zero” and “labels each group inside the card it belongs to”. These are among the
       33 bodies its criteria list; each is ported onto the route's dispatch or retired as superseded (R7-2).
     - “ends on its own when the block’s seconds have passed…”, “shows the elapsed time when the user finishes early,
       not the cap” and “comes back into the completion state when the buzzer went while it was away”. Their
       `NN:NN on the clock` readout is retired under R7-3; the rest of each body is ported or retired under R7-2.
     - “does not call an early finish a cap”, carried as it is at base. TASK-115's UAT list names it (R7-3).
     - Workout.test.tsx “retries a failed entered set with its original identity and saves once before continuing”.
   - **TASK-108**: the absent “leaves urgency to the timer’s own shared warning…” (TASK-008, TASK-009). R7-1 has
     TASK-108 restore the bodies that assert its own work (TASK-007/008/027), and its criteria name “the urgency case
     in src/ui/amrap-block.test.tsx”.
2. **A disabled saved effort has no Round 7 surface** (as TASK-105 noted). `SetEffortChoice`'s `disabled` face and its
   always-named Clear are proved at component level (set-effort.test.tsx). Round 7 reads a saved timed log back as
   “Log saved” with “Effort: About right” in words and offers “Edit log”, not the build's disabled form; that read-back
   was not changed.
3. Effort and notes of an AMRAP or For Time are the log's memory: they survive close, reopen and a failed save, not a
   reload (the build's TASK-010 asserted the For Time's face is not stored). Counts and the For Time answer are stored.
4. Round 7 shows the AMRAP's clock as the window left after Finish early (`Finished`, 06:25), where the build said
   “01:35 on the clock”; the elapsed time is what is saved (`elapsed_seconds 95`).
5. Per-movement gating (an AMRAP's amounts only after a rounds count; the exact movement-group list) is TASK-015's.
   Round 07 places both of the AC-C26-01 assertions not carried in `src/ui/timed-result-log.test.tsx` with TASK-117
   (its round-07 placement criterion):
   - The exact per-movement group list comes back in that case with TASK-015's gating (scan finding S5).
   - The build's TASK-046 assertion that the form has no name of its own is retired by TASK-117 under decision R7-3.
     Round 7's accepted `TimedResultLog` names its form “Log section results”, and that name stays.

## Next action

Controller (round 07):

- Verify the candidate.
- Hand-diff the gallery-owned files against the allowance: `src/ui/timed-workout-flow.tsx`, `src/ui/timed-result-log.tsx`
  and the `src/ui/amrap-block.test.tsx` cases. They are unchanged since round 06's accepted hand-diff.
- Look at the captures under `evidence-store/clear-gallery-adoption-v2-20261118/task-116/captures/`.
- No owner decision is pending from this task. TASK-108, TASK-110, TASK-115 and TASK-117 carry the placements in Open
  items 1 and 5.
