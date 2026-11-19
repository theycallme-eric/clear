# TASK-107 — A3 task 7 (F5): circuit "Round N recorded" read back from stored history (#730)

Body `clear-gallery-adoption-v2-20261118`, attempt 1, integration branch
`build/clear-gallery-adoption-2026-11-13`, base `eb6b20af` (TASK-105 and TASK-106 delivered). Source material
only: the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note; it
satisfies the shared daily journal rule for this body. Only TASK-107 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body names
`clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 to TASK-106 did.

## Status

Attempt 1 (2026-11-19): implemented, verified and committed in this worktree; see "Verification". Every
required check passes, twice, with byte-identical receipts and captures. Two small plan conflicts are reported for
the controller (see "Open"); neither blocks this task's own criteria.

## Intended outcome

JOURNEY-021 (completion owner): on `/workout`, a circuit's Finish round N confirms the round in Round 7's
dialog (`LoggingOverlay`, gallery state `circuit-round`) through `CircuitBlock` and the one circuit controller
(`src/state/circuit.ts`), replacing Round 7's in-memory round clock. The round time is read back from the
stored `circuit.state.history`; the circuit's rest runs inside the dialog and the dialog closes itself when that
rest ends, recording nothing more; Take back this round is `takeBackRound` and resumes the round's own clock;
focus returns to the round clock's control however the dialog closed. Round times, active time, history and
optional movement actuals are kept (C48).

## Changes

Product (`src/ui/circuit-block.tsx`, gallery-owned; the gallery's `circuit-round` and `circuit-movement`
states render this real component, so `/gallery/refinements` changes with it in the same commit):

- The recorded round's state moved from `RoundRecord` (Round 7: `{ round, seconds }` taken from the on-screen
  round clock) to `CircuitBlock`: `{ round, rested, closed }`, set by Finish round only under the presentation's
  logging dialog (Round 7's switch, kept). The dialog's open state is derived: open while the round is still
  recorded (`roundsCompleted >= round`), not closed by its X/Escape, and — if a rest began with it — while that
  rest runs. So the rest running out, the card's Start round (its early end) and Take back this round all close
  it, and nothing else is written.
- The round time is `roundDuration` of the round's entry in `circuit.state.history` ("Round recorded" when its
  clock never ran). Round 7's markup is kept: `<p role="status">mm:ss round time recorded</p>`, the rest as
  `CountdownDisplay` in `aria-label="Rest between rounds"` (Round 7's full-width log timer), and
  `Take back this round` as a secondary button.
- The card's rest timer is not drawn while the dialog holds the recorded round (open or leaving), so the
  circuit's rest is one clock, drawn once: in the dialog, then beside the card again after it closes.
- No rest to run (none prescribed, or the last round): the confirmation is drawn and, on the next animation
  frame, the dialog closes itself (owner decision 5, 2026-11-16), leaving through the shared Dialog exit.
- Focus: `onAfterClose` (TASK-106's `LoggingOverlay` contract) clears the recorded round and focuses the round
  clock group's first button — Start round N during a rest, Finish round N while a round runs, Take back a
  round once every round is recorded.
- The dialog is drawn in place beside the round clock group (Round 7 had it inside the group, which gave the
  group a second `role="status"`). It is not portalled, so Round 7's presentation styles still apply.

Tests and specs: see "Test ledger" below and `evidence/refinement/task-107/test-ledger.json`.

Evidence: `evidence/refinement/task-107/required-cases.json` (check-01: 60 cases in 3 files; parity: 4),
`test-ledger.json`, `results/*.json`, `parity/*.json`. TASK-021's manifest renames one check-01 case for owner
decision 5 and notes the Round 7 delivery; TASK-044's manifest notes it (names unchanged).

Gallery-owned files changed (for the controller's hand diff): `src/ui/circuit-block.tsx` only. Named by
TASK-AC-793C48069668, TASK-AC-022EA79369E8 and TASK-AC-3A057AEB41D0. No CSS changed. The look change on the
gallery state (the card no longer draws the rest behind the open dialog) is intended by TASK-AC-022EA79369E8
("the rest runs inside the dialog") and C21 (one clock, drawn once).

## Test ledger

- Unit (`src/ui/circuit-block.test.tsx`, `src/app/circuit-rounds.test.tsx`,
  `src/app/movement-countdown-circuit.test.tsx`): 58 build tests — 42 carried byte-identical to the build, 14
  rewritten for Round 7 (one renamed for owner decision 5), 2 kept at their Round 7 bodies (the TASK-003 badge,
  TASK-110's); 2 added (TASK-AC-793C48069668, TASK-AC-3A057AEB41D0); task 1's Round 7 row case merged into the
  build's row case (superseded).
- E2E: `task-021.spec.ts` (6) and `task-044.spec.ts` (7) rewritten for Round 7, names unchanged; every
  measurement and tolerance unchanged. `task-107-parity.spec.ts` (4) added.
- No `.skip`, `.only` or `.todo` added; no matcher weakened.

## Failures and corrections

- Base state: the three unit files passed 51/51 on the base, but with Round 7 bodies (task 1); the old build's
  bodies, probed against the base in scratch copies (deleted), failed 18 cases. `task-021.spec.ts` and
  `task-044.spec.ts` failed every case on the base at their first build-only selector
  (`dialog.clr-accepted-log`, `[data-gallery-circuit-round]`, `[data-gallery-group-logging]`).
- The no-rest self-close did not happen under the test clock at first: `act()` holds React's update until its
  timer advance is over, so the Dialog's 200 ms exit was scheduled after it. `leaves()` now advances the frame
  and the exit in two `act` steps.
- The history read-back case first hung with fully fake timers: Testing Library's async wrapper waits on a
  real `setTimeout(0)`. It now fakes only `setInterval` (the round clock's on-screen tick), which makes it
  deterministic.
- task-021 and task-044: the inert-behind probe counted the open log's own two buttons, because Round 7 draws
  the log in place inside `main`; it now leaves them out (as TASK-106's task-019 rewrite does). Where task-021
  holds the page clock still, Round 7's 200 ms exit needs the clock run through it (`throughExit`).
- task-021: an added assertion that "Set 1 logged" is visible before the movement log closes itself was racy
  (the decision-5 exit is 200 ms, a hard cut under reduced motion); replaced by the card's read-back.
- Parity: the first draft compared words case-sensitively (some labels are set in capitals) and read the
  "closed" block two levels above the card, which in Round 7 stops inside `ForegroundEchoFrame`, not at
  `BlockPanel`'s root, so the rest timer was outside the part. It now takes the card's nearest `.clr-stack` and
  asserts the part holds the one rest timer. One run hit the host lock's 120 s timeout (environment, retried).

## Verification

This worktree, 2026-11-19, `npm ci` first. Browser commands under the host lock (`v2.mjs with-lock`).

- Red before green: with this branch's tests over the base `circuit-block.tsx`, 9 of the 60 check-01 cases fail
  (five of the seven TASK-021 cases, the two new TASK-107 cases, and the build's AC-061 "records every round" and
  AC-062 "finishes into the shared rest" bodies); all 60 pass with the change. The TASK-021 AC-C48-01 and
  AC-R021-01 cases already held on Round 7 and stay as regression guards.
- Run 1 (receipts written): TASK-107 check-01 PASSED 60/60; TASK-021 check-01 PASSED 41/41 (7 required);
  TASK-021 check-02 PASSED 6/6; TASK-044 check-01 PASSED 7/7; TASK-107 parity PASSED 4/4.
- Parity receipts: 0 text differences and 0 element-box differences (2 px tolerance) in every moment — card,
  open dialog and (circuit round) the block after Close log — at 320 and 390, for both states. No intended
  difference needed a label. By eye: the route's and the gallery's "Round 1 recorded" are alike; in the route's
  closed-block capture the fixed section footer covers the card's foot (capture framing, as noted for
  TASK-103/104; the boxes are compared regardless).
- Two-run stability: the tree was staged after run 1 and every check was run again (run 2: the same five
  results). No unstaged change anywhere after run 2, and the 20 capture images in
  `evidence-store/clear-gallery-adoption-v2-20261118/task-107/captures/` have identical SHA-256 in both runs.
- `verify-delivery-evidence.mjs --mode final --body clear-refinement-20261103 --tasks TASK-107,TASK-021,TASK-044`:
  current passing receipts for all three.
- CI chain (the brief's one command), once, at the end: exit 0 — typecheck pass; lint 0 errors, 175 warnings
  (as base); lint:ds pass; gen-issues --check pass (71 requirements, 136 edges); gen:types --check current;
  `npm test` 6,319/6,319 in 269 files; build pass; console grep no match.
- `src/dev/` gallery tests (73) pass with the change.
- No `.skip`, `.only` or `.todo` added (grep of the staged src and e2e diff: 0).
- Not run: any other task's parity spec; `task-019.spec.ts` (TASK-120's); real phones; WebKit.

## Open

- **Plan conflict (small): two circuit-block build bodies need TASK-110's work.** The groundwork ledger gives this
  task "states the total rounds…" and "carries the identity row…", whose build bodies assert the format-only
  badge with the rounds outside it ("CIRCUIT" and "3 ROUNDS"; TASK-003, AC-C08-01). That is TASK-110's work, and
  TASK-110's checks do not run `src/ui/circuit-block.test.tsx`. Both are kept at their passing Round 7 bodies
  ("CIRCUIT · 3 ROUNDS", rendered without the presentation). When TASK-110 lands, its badge change may need these
  two cases updated in a file this task owns.
- **Plan conflict (small): one circuit-rounds assertion needs TASK-109's work.** The build's AC-061 row case
  asserts a `role="group"` per movement in the circuit's coaching panel (TASK-005), which TASK-109 restores; its
  checks do not run `src/app/circuit-rounds.test.tsx`. The case reads each movement's section by its heading
  instead, recorded in the ledger as deferred to TASK-109.
- **No rest to run: how long the confirmation shows** [inferred]. Owner decision 5 says the confirmation shows and
  the dialog then closes itself, with no duration. As TASK-106 did for sets, it closes on the next frame and leaves
  through the shared 200 ms exit (a hard cut under reduced motion), so the round dialog only flashes; the card's
  round count, round-time history and Take back a round carry the read-back. Worth a look at UAT.
- **"The last round" read as "no rest prescribed"** [inferred]. After the last round no rest follows even when the
  block prescribes one between rounds; it is treated like a block with no rest (closes itself). The old build
  grouped the two ("none prescribed, or the last round"), and decision 5's only "stays until Close" case (a
  prescribed rest that ended before Save) cannot arise for a round.
- `task-019.spec.ts`'s circuit-round assertions (TASK-120's suite) are covered by this task's own checks, as the
  ledger's entry lists; that suite was not run here.

## Next action

Controller: run `V2 verify` on this candidate (`npm ci`, then the brief's commands). Hand-diff the one
gallery-owned file, `src/ui/circuit-block.tsx` (behaviour plus one look change: the circuit's rest is drawn in
the dialog instead of beside the card while the dialog is open). Review the parity receipts and contact sheets,
the test ledger, and the two plan-conflict notes above.
