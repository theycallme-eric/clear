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

Attempt 1 (2026-11-16) implemented and committed on the worker branch, awaiting controller
verification. One reading of the brief is an open question for the owner (see "Open assumptions",
first item): with no rest prescribed, the dialog closes itself after the confirmed save, as Round 7
did; with a rest that has already ended, the carried TASK-020 rule keeps the confirmation until Close.

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
- `src/ui/circuit-block.tsx`, `src/ui/app-dialog.tsx`, `src/styles/logging-overlay.css`: unchanged.
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
`src/ui/superset-block.tsx`, `src/ui/standard-block.tsx` (comment). All are named by the objective
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

## Verification (this worktree, final tree, 2026-11-16)

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

Controller: run the brief's commands; diff the gallery-owned files above; review the parity
receipts and the test ledger; take the no-rest question to the owner.
