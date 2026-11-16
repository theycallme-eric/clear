# TASK-106 — A3 task 6 (F4): set logging in the Round 7 dialog, with saved read-back and focus return (#729)

Body `clear-gallery-adoption-v2-20261116`, attempt 1, integration branch
`build/clear-gallery-adoption-2026-11-13`, base `4e65efb1` (TASK-103, TASK-104 and TASK-113 merged).
Source material only: the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the
task-owned progress note; it satisfies the shared daily journal rule for this body. Only TASK-106
writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body
names `clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103/104/113 did.

Lane note: TASK-105 ran in parallel. `PROJECT_MAP.md` is TASK-105's, so the map note is below.

## Status

Attempt 1 (2026-11-16) implemented and committed on the worker branch (`2794e3dd`). Controller
verification round 0 failed on TASK-041 check-01 (timed out; JOURNEY-017 waited 6.1 minutes per try
on a build-only selector) and never reached TASK-019 check-01. Repair round 1 (same day, same
worktree, on top of `2794e3dd`): both specs rewritten for Round 7 and two product defects they found
fixed — see "Repair round 1". Both checks still fail on this candidate, only at behaviour other A3
tasks restore (listed there); that is an ordering question for the controller and the owner.

One reading of the brief is an open question for the owner (see "Open assumptions", first item):
with no rest prescribed, the dialog closes itself after the confirmed save, as Round 7 did; with a
rest that has already ended, the carried TASK-020 rule keeps the confirmation until Close.

## Intended outcome

- JOURNEY-020 (completion owner): on `/workout`, a set, extra set, correction, superset round or
  circuit movement opens in Round 7's centred dialog (`LoggingOverlay`, owner decision 1), with the
  session's one rest running inside it. Save turns the entry into its confirmation — `Set N logged` /
  `Round N logged`, the saved result read back from the shell's set list with values, effort face and
  sync badge (`role="status"`), each ticked superset movement under its own name — beside the same
  rest, never the next form. The rest ending (run out or skipped) closes the dialog and resets the
  confirmation; an early Close ends it; only a deliberate Rest opens the next entry (AC-037: on the
  same running rest). Focus lands on the dialog title on Save, and returns to the card's logging
  control (a correction's Edit for its X or Escape) once the native dialog has closed — never the
  page body. The Clear-set confirmation is drawn inside the dialog.

## Changes

Components (all named by the objective; the gallery states render them live, so
`/gallery/refinements` shows each change in the same commit):

- `src/ui/logging-overlay.tsx` (gallery-owned, Round 7's shared owner; look unchanged): the title
  has an id, provided to held forms through `LoggingOverlayTitleContext`
  (`src/ui/refinements/logging-overlay-context.ts`, carried by task 2, now used); the opener is
  remembered and focus returns to it once the native dialog has closed if it is stranded (after the
  consumer's new `onAfterClose`); opening focus goes to the X when nothing inside has it (what
  Chromium's dialog focusing steps already do); stranded focus inside goes to the title (TASK-019);
  the focus-bracket layer is hosted while open (TASK-041); a queued `close` after a reopen is ignored
  (TASK-045); the X and Escape (`cancel`) ask the consumer to close in the same turn, so the dialog
  leaves through the shared exit as a controlled close. The dialog keeps Round 7's `aria-label`.
- `src/ui/set-logging-sheet.tsx` (gallery-owned): `confirmation` is now `{ entryName, reading }`;
  `setSheetTitle` names the entry (`Log set N`, `Edit set N`, `Log round N`, `Set N logged`); held by
  the dialog it draws its body only (context, rest, `role="status"` read-back, form) in Round 7's
  `clr-stack clr-stack--tight` wrapper; when the confirmation replaces the form, focus goes to the
  dialog title (programmatic target only). Round 7's `SetLoggingConfirmation` is replaced by the
  carried read-back. The half-sheet path (no presentation) is unchanged.
- `src/ui/set-logging-sheet-context.ts` (gallery-owned): `place(sheet, keep)` keeps the dialog
  drawn in the shell's slot through its exit. The build's per-entry `focused` placement is retired
  with that reason (Round 7 draws every entry in its dialog), not carried.
- `src/ui/set-save-confirmation.ts` (carried by task 2): the build's lifecycle, plus
  `restPrescribed` (an entry with no rest prescribed, saved with none running, ends its
  confirmation once recorded, so the dialog closes itself); a dialog still open when its rest ends
  keeps showing the confirmation until it closes; the confirmation ends at rest end either way;
  `focusIsInSetSheet` reads Round 7's `.clr-logging-overlay`.
- `src/ui/set-logger.tsx` (gallery-owned): `ExerciseSetLogger` holds its entry in `LoggingOverlay`
  under the presentation (open while its sheet is, drawn until the native close), with
  `useSaveConfirmation`, `SavedSetLine` (the row's formatter, effort reading and sync badge), the
  Clear-set dialog inside the overlay, and one pending focus target resolved in `onAfterClose`
  (Rest, or the correction's Edit for X/Escape, or the block's Rest for a superset movement).
  `logSet`'s answer still gates the confirmation (a refused set keeps its form). While the dialog
  closes itself it goes on showing its title and confirmation. `SupersetRoundSheet` takes
  `confirmed`/`onSaved` and reads back each ticked movement's actuals and effort.
- `src/ui/superset-block.tsx` (gallery-owned): the round in `LoggingOverlay` with the same
  lifecycle, focus return to the block's Rest; the title is always `Round N logged` (Round 7's
  "Round N entries logged" variant is replaced: the read-back names the movements logged).
- `src/ui/standard-block.tsx` (gallery-owned): documentation only (wiring and the retired prop).
- `src/ui/app-dialog.tsx`, `src/styles/logging-overlay.css`: unchanged. `src/ui/circuit-block.tsx`:
  unchanged in round 0; repair round 1 changed its movement entry's rest (see "Repair round 1").
  The circuit movement entry is `ExerciseSetLogger` and is wired through it.

Tests and specs:

- `src/ui/logging-overlay.test.tsx` (new on this branch): the build's eight TASK-016 cases, same
  names, rewritten against Round 7's dialog. The build's TASK-018 (9) and TASK-017 (7) cases are
  deferred to TASK-114 (its verification runs them by name here).
- `src/ui/logging-overlay-focus-brackets.test.tsx`, `-focus-kept.test.tsx`, `-stale-close.test.tsx`:
  the build's bodies unchanged (import path only).
- `src/ui/set-logging-sheet.test.tsx`, `src/app/sheet-minimize-access.test.tsx`,
  `src/app/rest-footer-lifecycle.test.tsx`, `src/app/superset-logging.test.tsx`,
  `src/ui/superset-block.test.tsx`: the build's versions brought back, then adapted where Round 7
  differs (dialog markup, its exit, no half-sheet layer, the slot outside the pinned foot); task 1's
  Round 7 bodies kept where the build's read presentation Round 7 replaced (AC-025 ×2, six superset
  presentation cases). Four TASK-106 cases added to `set-logging-sheet.test.tsx`.
  `src/ui/set-correction.test.tsx`, `src/ui/set-logger.test.tsx`: unchanged.
- `e2e/refinement/task-020.spec.ts`, `task-043.spec.ts`: Round 7 selectors; the gallery case of
  task-043 reads Round 7's states. New `e2e/refinement/task-106-parity.spec.ts` (16 cases).
- Evidence: `evidence/refinement/task-106/required-cases.json` (check-01: 168 cases in 11 files;
  parity: 16), `test-ledger.json`, `results/*.json`, `parity/*.json`; task-020 and task-043
  manifests' descriptions note the Round 7 delivery (case names unchanged).

Gallery-owned files changed (for the controller's hand diff): `src/ui/logging-overlay.tsx`,
`src/ui/set-logging-sheet.tsx`, `src/ui/set-logging-sheet-context.ts`, `src/ui/set-logger.tsx`,
`src/ui/superset-block.tsx`, `src/ui/standard-block.tsx` (comment); repair round 1 adds
`src/ui/circuit-block.tsx` and a second change to `src/ui/logging-overlay.tsx`. All are named by the objective
(TASK-AC-8A16F03271D0, TASK-AC-20C6E9E8B952, TASK-AC-A7CEAC5DC9DB, TASK-AC-C53DC0A896ED). No CSS
changed. The parity check found zero unlabelled text or layout differences on the eight states.

Map note (PROJECT_MAP.md not edited): set logging's dialog lifecycle is now the logger's: the
entry is held by `LoggingOverlay` from opening until the native close (`place(sheet, keep)`),
`useSaveConfirmation` derives the confirmation from the rest it was saved during, and focus returns
through `LoggingOverlay.onAfterClose`.

## Failures and corrections

- Keeping the dialog mounted after its first open made `reopened === sheet` true but broke four
  integration tests outside this lane that expect the closed dialog to leave the DOM
  (`set-effort`, `movement-countdown-circuit`). The dialog is now removed once its native close has
  played; the build case that compared elements now compares the slot ("the same place").
- Switching the dialog's name to `aria-labelledby` broke the gallery's own test (it reads
  `aria-label`); Round 7's `aria-label` is kept.
- The Round 7 rule "close whenever no rest is running" broke the carried TASK-020 and B05 cases
  (confirmation until Close after a rest that already ended); the build's rule, with no-rest-
  prescribed self-closing, keeps every carried case and the integration tests outside the lane
  (Workout, circuit) passing. See the open question below.
- Browser flake found by repetition (2 of 4 runs of task-043's correction case): after Escape the
  native dialog had closed (and Chromium restored focus) while React still held `open` until the
  queued `close` event; a quick Edit then reopened nothing. Fix: the X and Escape now ask the
  consumer to close in the same turn (`onCancel`), and the dialog leaves as a controlled close.
  After it: 20/20 over task-020 + task-043 `--repeat-each=2`.
- The parity draft first compared timings unevenly (the gallery's driver presses on a 40 ms interval)
  and then flagged the gallery's sample section label and load; the clock is now stepped until the
  driver has pressed, both sides read 500 ms later, and the sample words are labelled
  (TASK-AC-EFB0DB480A73) and read as one name in the layout keys so every element is still compared.

## Repair round 1 (2026-11-16)

Input: the round-0 verification log (`TASK-106-a1-r0-…-verify.log`), the controller's lane widening
(`e2e/refinement/task-019.spec.ts`, `task-041.spec.ts`, `evidence/refinement/task-019/`,
`task-041/`). Both checks are obligations of this task's criteria: AC-C45-01 runs TASK-019
check-01 and AC-R016-03 runs TASK-041 check-01. Round 0 had recorded task-019 as deferred to
TASK-114 and treated task-041 as another task's; that was wrong.

Specs rewritten for Round 7 (case names unchanged, every assertion and measurement kept; each change
recorded per case in `evidence/refinement/task-106/test-ledger.json`):

- Both: the open log is `dialog.clr-logging-overlay` and its parts (`.clr-logging-overlay__head`,
  `__scroll`, `__body`, the frame `:scope > .clr-bleed > .clr-chamfer`); a set's read-back is
  `[role=status].clr-set-sheet__saved`; the movement note is Round 7's "Movement note" dialog with
  its field named by the movement; timed cards are `TimedWorkoutFlow` by format ("Start FOR TIME"),
  whose log opens itself at the end and is reopened from the card's Log results; the ladder's rounds
  are "Complete round N" (TASK-105's words); the gallery cases read Round 7's states by the route's
  own controls. `test.use({ actionTimeout: 30_000 })`: a control that never appears fails where it
  is looked for (round 0's 6.1-minute wait was `locator.evaluate` on the build's /review list).
- task-019: the inert-behind check leaves out the open log's own controls (Round 7 draws a log in
  place, inside `main`; task-041's check already did this); the timed case follows TASK-103's
  accepted change (Save log is the block's writer, so the refused write and its retry are the log's).
- task-041: groups are `.clr-round-movement` / titled `.clr-timed-log__group`, cards
  `.clr-movement-identity`; ladder-long is Round 7's one state (the build's separate specimen has no
  Round 7 counterpart).

Product defects the rewritten specs found, fixed here:

- `src/ui/logging-overlay.tsx`: opened by keyboard at 320 px, a long correction's opening focus was
  on the dialog's scrolling region (Chromium counts a scroller as a focusable area ahead of the X),
  and the overlay left it there because focus was "inside". It now moves focus to the X unless a
  consumer put it on a control. Unit case added (red on round 0's overlay, green now):
  `set-logging-sheet.test.tsx` "… a long entry opened by keyboard takes its opening focus on the X,
  never on the dialog's scrolling region" (TASK-106 check-01 now 169 cases).
- `src/ui/circuit-block.tsx` (gallery-owned, in this lane): a circuit movement's entry drew the
  circuit's rest between rounds in place of the session's running rest, so while the circuit rested
  the session's rest was drawn nowhere (footer hidden behind the open entry). Restored the build's
  TASK-044 behaviour: the entry shows the session's one rest; the circuit's rest stays on its card.
  No gallery state shows a resting circuit's movement entry, so no accepted state changes.

What still fails on this candidate, and whose behaviour it needs (each found with an uncommitted
soft-assertion copy of the spec, so every later assertion was also read; full detail per case in the
ledger's `blockedOnThisCandidate`):

- TASK-019 check-01 (5 cases, all fail):
  - set/group/note moments: TASK-107 — the circuit's rest is drawn twice (card and "Round 1
    recorded" log), C21. Everything else passes.
  - errors by keyboard: TASK-107 — Escape from "Round 1 recorded" does not return focus into the
    round clock. Everything else passes.
  - timed families: TASK-105 — no ladder log while the ladder runs (its reviewer item 1, a pending
    decision) and no "Rounds completed … 1 of 4" group in the ladder's log. AMRAP, For Time, EMOM,
    notes over the clock, refused Save log and retry, every block row pass.
  - /summary and Home: TASK-111 — Home's refused rest day alert is drawn behind the dialog, not in
    it. Everything else passes.
  - gallery: TASK-107 — circuit-round focus return. All other states pass.
- TASK-041 check-01 (10 cases, all fail): every case opens logs through `inspect`, which asserts
  TASK-114's REQ-016 C41 (X frame on the title's visible top; 4–14 px apart on Round 7) and REQ-018
  frame contract (dialog box ≠ frame, scroller inset, scroll padding, no chamfer clip, visible
  scrollbar, the 320 px long form not filling the viewport). Also: TASK-105 (ladder log while
  running); TASK-112/TASK-110 (/review has no "Movements in this block" list; REQ-017 tokens
  absent); TASK-107 (gallery circuit-round focus); TASK-114 (no urgency log in Round 7's gallery);
  and a decision: Round 7's note title is the generic "Movement note" and never wraps, where the
  build asserts the long note title wraps. Everything TASK-106 owns in these cases passed in the
  soft run: drafts through X/Escape/reopen, clocks counting behind, inert screen, focus return,
  keyboard brackets and Tab stops in the frame, touch reopen without a ring, AA contrast in all
  four skins.

## Verification, repair round 1 (this worktree, final tree, 2026-11-16)

Browser checks under the host lock (`v2.mjs with-lock`), receipts written by `run-required-check`:

- TASK-106 check-01 (vitest, 11 files): PASSED, 169 executed (the new opening-focus case included).
- TASK-020 check-01: PASSED (19 executed by the name filter). TASK-016 check-01: PASSED (8).
- TASK-106 parity: PASSED, 16/16. TASK-020 check-02: PASSED, 3/3. TASK-043 check-01: PASSED, 7/7.
- TASK-041 check-01: REJECTED, 0/10 — each case fails within 2–32 s at the first blocked assertion
  (nine at TASK-114's C41 X/title visible top; JOURNEY-017 at Round 7's /review list), no hang.
- TASK-019 check-01: REJECTED, 0/5 — at TASK-107 (cases 1, 2, 5), TASK-105 (case 3) and TASK-111
  (case 4), as listed in "Repair round 1".
- Uncommitted soft-assertion copies of both specs (scratch, deleted) read every later assertion;
  results are in "Repair round 1" and the ledger's `blockedOnThisCandidate`.
- New unit case red on round 0's `logging-overlay.tsx`, green with the fix.
- CI chain (the brief's one command): exit 0 — typecheck pass; lint 0 errors, 175 warnings (as
  base); lint:ds pass; gen-issues --check pass; gen:types --check pass; `npm test` 6,284/6,284 in
  268 files; build pass; console grep no match.
- `verify-delivery-evidence.mjs --mode final --body clear-refinement-20261103 --tasks
  TASK-106,TASK-020,TASK-043,TASK-016`: current passing receipts for all four.
- Not run: real phones.

## Verification round 0 (this worktree, 2026-11-16)

- `run-required-check TASK-106 check-01` (vitest, 11 files): PASSED, 167 required cases (168
  executed; one `it.each` title prints twice).
- `run-required-check TASK-020 check-01`: PASSED (the five TASK-020 cases).
- `run-required-check TASK-016 check-01`: PASSED (the eight TASK-016 cases); its receipt was then
  restored to the committed version (TASK-016's evidence is not this task's; the controller's run
  rewrites it).
- `run-required-check TASK-020 check-02` (host lock): PASSED, 3/3.
- `run-required-check TASK-043 check-01` (host lock): PASSED, 7/7.
- `run-required-check TASK-106 parity` (host lock): PASSED, 16/16. Zero unlabelled text or layout
  differences. Labelled (TASK-AC-EFB0DB480A73, real data only): the gallery's sample section label
  "Accessories" against the product's "Accessory" (other-lift, superset), and the gallery's sample
  load guidance "20–25 lb per hand" against the prescription's "25 lb" (distance-movement). Every
  other state: 0 differences in words and boxes, at 320 and 390, for the card, the open dialog and
  (anchor, superset) the saved confirmation.
- Repeats (host lock, no receipts): task-020 + task-043 `--repeat-each=2`: 20/20 (after the
  same-turn close fix; before it the correction case failed 2 of 4).
- `verify-delivery-evidence.mjs --mode final --body clear-refinement-20261103 --tasks
  TASK-106,TASK-020,TASK-043`: current passing receipts for all three.
- Red before green: the 118 cases of the nine changed or new unit files run against the base
  sources (`git archive 4e65efb1` in a scratch copy, this task's test files on top): 24 fail
  (focus return, focus kept, brackets, stale close, the TASK-020 lifecycle and read-back, the no-rest
  focus case, the correction/clear focus cases, the superset confirmations); all pass with the change.
- CI chain pieces on the final tree: `npm run typecheck` pass; `npm run lint` 0 errors, 175
  warnings (as base); `npm run lint:ds` pass; `python3 scripts/gen-issues.py --check` pass;
  `npm run gen:types -- --check` pass; `npm test` 6,283/6,283 in 268 files (base 6,255 in 264);
  `npm run build` pass; console grep: no match.
- Not this task's specs, run for status only (host lock, no receipts written): `npx playwright test
  e2e/refinement/task-019.spec.ts e2e/refinement/task-041.spec.ts --project=mobile` (the controller
  runs TASK-019 and TASK-041 check-01 on this candidate): 0 passed, 15 failed. 11 stop at their first
  build-only selector, `dialog.clr-accepted-log[open]` (the build's overlay class, absent on the base
  and on Round 7); the other four time out or look for the build's note dialog name. These specs are
  TASK-114's (its verification runs both) and are not yet rewritten for Round 7; they are expected
  to fail the same way on the base [inferred: not rerun on the base].
- Not run: real phones; the design-0143 e2e suites (pre-UAT per the groundwork ledger).

## Open assumptions and questions

- **Ordering (controller and owner).** TASK-019 and TASK-041 check-01 run every logging moment,
  including families other A3 tasks wire later (TASK-105 ladder, TASK-107 circuit round, TASK-111
  rest day, TASK-112/110 Review cards, TASK-114 dialog geometry and rhythm). TASK-106 cannot pass
  them alone; see "Repair round 1" for each case's blocker.
- **Movement-note title (owner decision).** Round 7's note dialog is titled "Movement note" and
  never wraps; task-041 (kept as written) asserts the long note title wraps. Either the note title
  names the movement again (TASK-109) or the assertion is retired with the owner's reason.
- **Circuit movement rest.** Restored the build's rule (the entry shows the session's rest; the
  circuit's rest stays on its card); Round 7 had drawn the circuit's rest instead. [inferred: no
  owner decision chose Round 7's version; the inventory lists only the dialog for F4.]
- **No rest prescribed (owner question).** The brief's TASK-AC-C53DC0A896ED says the dialog closes
  itself when "rest ended or skipped, or no rest prescribed". The carried TASK-020 rule (check-01's
  AC-R020-02 case, the B05 case, TASK-107's circuit cases) keeps a confirmation saved with no rest
  running until Close. Implemented: no rest prescribed (and none running) → confirmed, then closes
  itself once recorded, focus to the card's control; a rest prescribed but already over at Save →
  confirmation until Close. The build's circuit-block cases (TASK-107) expect `Set 1 logged` to stay
  for a circuit movement (no rest of its own); under this reading they need the owner's decision.
- "A refused or queued save keeps the form": read as the shell refusing the set (not in its list).
  A set the network refuses is queued in the list and confirmed with "On this device only" (TASK-020
  check-02's own case name: "a refused write is confirmed only as held on this device").
- TASK-016's header case: Round 7's recipe aligns the X to the title's line box (flex-start,
  line-height 1) but does not trim the line box to the capitals (`text-box`), uppercase or
  `overflow-wrap: anywhere` it, as the build asserted; and Round 7's TimedResultLog carries a default
  name ("Log section results") inline and on the route (TimedWorkoutFlow passes no dialog title).
  Recorded in the ledger for TASK-114 (C40/C41), not changed in gallery-owned CSS here.
- The confirmation keeps its context line (the build's), which Round 7's `SetLoggingConfirmation`
  dropped; the gallery has no confirmation state.
- `set-effort.test.tsx`'s F4 case is kept as task 1 rewrote it (file untouched).

## Next action

Controller: run the brief's commands; diff the gallery-owned files (round 0's list plus
`src/ui/circuit-block.tsx` and the second `logging-overlay.tsx` change); review the parity receipts
and the test ledger; decide the ordering of TASK-019/TASK-041 check-01 (they need TASK-105, TASK-107,
TASK-111, TASK-112/110 and TASK-114 behaviour, listed above); take the no-rest question and the
note-title question to the owner.
