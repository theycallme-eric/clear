# TASK-043 — Adopt shared logging for sets, measurements and corrections (#669)

Body `clear-refinement-v2-20261109b`, attempt 1. This is the task-owned progress note, the approved
exception to the shared daily journal for this body. Only TASK-043 writes this file.

## Status

Repair round 1 complete (on candidate `b369673`), awaiting controller verification and commit. See
"Repair round 1" at the end for what changed after the review, and "Verification" / "Open items" for
the first pass.

## History of this attempt

1. **First pass (base `e6c5f89`, after TASK-020 #706): stopped before implementation.** The migration
   replaces the half-sheet's `Minimize` with the dialog's `Close log` X, and the confirmation heading
   moves from `section.clr-set-sheet` into the dialog. Merged, protected specs of TASK-002, 007, 008
   and 020, and TASK-007's Vitest target `timer-frame-layout.test.tsx`, locate exactly those. The
   brief's AC-342CDDB7111A says "without editing another task's spec or shared helper", so the task
   was parked for an owner decision. Options were recorded here (amendment, keep a second Minimize,
   or re-sequence to TASK-041).
2. **Owner decision (Eric, 2026-11-10, chat, relayed by the controller):** answering "May tasks
   update earlier tests when their approved requirement replaces that UI?" — "Yes, go ahead". Scope
   as relayed: a task whose approved requirement replaces earlier UI may update earlier tasks' test
   locators and assertions; keep each assertion's meaning where it still applies; do not rename
   cases; do not edit any `required-cases.json`; re-run each affected owner's exact guard; record the
   changes line by line here. Superset/circuit entry (TASK-044) stays on the old sheet.
3. **Resumed** after `git fetch origin && git rebase origin/build/clear-refinement-2026-11-04`
   (exit 0; new base `0060324`, after TASK-029 #712).

## Intended outcome

REQ-019 / C45 for this family only (TASK-AC-4E98D150903F, TASK-AC-2990AF36316E,
TASK-AC-342CDDB7111A). Role: foundation provider contributing to JOURNEY-019. The standard block's
entries — anchor/primary lift, other lift, timed movement, distance movement, extra set and saved-set
correction (`ExerciseSetLogger` drawn by `StandardBlock`) — move from the pinned-foot half-sheet into
the shared `LoggingOverlay`. Fields, drafts, writers, correction/clear, TASK-020's Save confirmation
and the session's one rest are kept.

## Changes (product)

- `src/ui/set-logger.tsx`: new `focused` prop on `ExerciseSetLogger`. With it, the entry is
  `LoggingOverlay` (title from `setSheetTitle`, `onClose` = the same `collapse()` Minimize used; the
  form is rendered only while open, the draft stays in the logger). The clear confirmation
  (`AppDialog`) is drawn inside the log when focused, so it is above the log in the top layer and in
  document order (TASK-008's edge host picks the last open dialog). While the modal is open the
  workout is inert, so returning focus to Rest/Edit is deferred until the commit that closes the
  dialog (`pendingFocus`). Without `focused` nothing changes (superset movements and the circuit's
  optional entry, TASK-044).
- `src/ui/standard-block.tsx`: passes `focused`. This is the only family entry point.
- `src/ui/set-logging-sheet.tsx`: `SetLoggingSheet` reads `useLoggingOverlayTitle()`; inside the
  dialog it draws only its body (`.clr-set-log`: context, rest, confirmation status, form) — no
  frame, accent bar, head or Minimize. The title/X are the dialog's. On Save, focus moves to the
  dialog title only when focus was lost (the X keeps the opening focus); the title is given
  `tabindex="-1"` at runtime as a programmatic target only, because TASK-018's check forbids
  `tabIndex` in the overlay source. `setSheetTitle()` exported. `SetLoggingSheetHost` records whether
  the open entry is focused; `SetLoggingSheetOverlay` (half-sheet layer + its dim) stays closed for a
  focused entry, so the dialog's backdrop is the only one.
- `src/ui/set-logging-sheet-context.ts`: `open(key, focused?)`, `openFocused`,
  `useSetLoggingSheetLayerOpen()`; `useSetLoggingSheetPlacement(key, { focused })` portals a focused
  dialog to `document.body` under a host (always mounted, so the native dialog closes itself and
  returns focus), in place without one. `useSetLoggingSheetOpen()` still means "an entry is open", so
  the footer rest steps aside and the footer stays inert as before.
- `src/ui/set-save-confirmation.ts`: `focusIsInSetSheet()` also counts `.clr-accepted-log`.
- `src/ui/set-logging-sheet.css`: `.clr-set-log` body (column, `--logging-section-gap`). Not a
  hotspot file. `.clr-set-sheet-layer` z-index rule kept (TASK-008 check reads it).
- Gallery: new `src/dev/gallery-refinement-set-logging.tsx` and six appended states in
  `src/dev/gallery-refinements.tsx` (append-only): `anchor`, `other-lift`, `timed-movement`,
  `distance-movement`, `extra-set`, `set-correction`. Each renders the route's own `StandardBlock`
  over the shell's `SetLoggingProvider` (`corrections`, `storage={null}`), `RestTimerProvider` and
  host, with a gallery-only in-memory set-observation client (no production writer substituted; all
  other clients refuse). Deliberate consolidation of the reference's synthetic `GalleryLoggingMoment`.
- Shared owners: `logging-overlay.tsx` adopted unchanged; `timed-result-log.tsx` not applicable
  (timed families are TASK-046); `gallery-refinement-forms.tsx` read, not changed (this family's
  states live in their own file).

## Tests added / migrated

- New `e2e/refinement/task-043.spec.ts` and `evidence/refinement/task-043/required-cases.json`
  (check-01, 7 required cases: anchor + extra set at 390 touch; correction + refused write/retry at
  390 keyboard + reduced motion; other lift, timed and distance at 320 plus superset-stays-on-sheet;
  the six gallery states in each of clear, vapour, signal, mono at 390).
- Owned migrations (brief): `src/ui/set-logging-sheet.test.tsx` (harness draws the standard logger
  `focused`; pinned-foot/chevron/half-sheet-frame cases replaced by modal/`showModal`/X/one-frame/
  no-accent-bar cases; Escape added to the collapse case; draft/correction/rest/save/error coverage
  kept), `src/app/sheet-minimize-access.test.tsx` (X is the only collapse; footer `inert` and the
  half-sheet layer closed while the log is open), `src/app/rest-footer-lifecycle.test.tsx`.
- Superseded locators in non-protected unit tests: `src/app/Workout.test.tsx` (2 lines),
  `src/app/movement-countdown.test.tsx` (2), `src/ui/set-correction.test.tsx` (1).

## Earlier tasks' checks changed (owner decision 2026-11-10), line by line

Line numbers are in the edited files.

- **TASK-002 check-02, `e2e/refinement/task-002.spec.ts` ~555:** `Minimize` → `Close log` (one
  locator). Meaning kept: closing the back squat's entry logs nothing.
- **TASK-007 check-02, `e2e/refinement/task-007.spec.ts` ~508, ~572, ~580, ~632:** each `Minimize` →
  `Close log` (touch ×3, keyboard ×1). Meaning kept: the same rest moves log → footer, same reading.
- **TASK-007 check-01, `src/ui/timer-frame-layout.test.tsx` ~196:** the log container is
  `dialog.clr-accepted-log` instead of `.clr-set-sheet`; **~322:** `Minimize` → `Close log`.
- **TASK-008 check-01, `src/ui/countdown-urgency.test.tsx` AC-C24-01 (~398–420):** the one edge's
  parent is now the open log's own `<dialog>` (the log is a native dialog in the top layer, so "above
  the open log" is inside it) instead of `document.body`. **One step added:** the log is closed with
  its X before the Actions menu is used (the workout behind a modal is inert, so the old order —
  Abandon over an open log — no longer exists in a browser); after closing, the edge is asserted back
  on the body with the rest (footer) still urgent. All later assertions are unchanged.
- **TASK-008 check-02, `e2e/refinement/task-008.spec.ts` (touch case, ~595–620):** the open-log edge
  host is `dialog:open:Log set 1` instead of `body`. **Reordered:** the case's "Minimised in the final
  seconds" block (now `Close log`) moved from after the Abandon dialog to before it, for the same
  inertness reason; its assertions (log gone, one Rest, one edge on the body, in phase) are kept
  word for word. This is more than a pure locator change; flagged for controller review.
- **TASK-020 check-01, `src/ui/set-logging-sheet.test.tsx` TASK-020 describe:** set confirmations
  and entries read from `dialog` instead of `region` (`Set 1/2 logged`, `Log set 1/2/3`); `Minimize`
  → `Close log`; `openSheets()` counts open dialogs and regions. The superset case is unchanged
  (still the half-sheet). No case renamed.
- **TASK-020 check-02, `e2e/refinement/task-020.spec.ts`:** new `logDialog()` locator; the squat's
  confirmation/heading/status/rest read from the open log (`.clr-set-log > [role="status"]`) instead
  of `section.clr-set-sheet`; `toHaveCount(0)` on the sheet → on the open log for the squat;
  `Minimize` → `Close log` for the squat (×2); `expectConfirmation()`/`attachSheet()` take the
  surface, defaulting to the log, and the superset round passes `sheet(page)` explicitly (its
  `Minimize` unchanged).
- No `required-cases.json` was edited; no case was renamed.

## Sweep (non-protected)

- Edited: `e2e/ui-polish-integrated.spec.ts` (squat: `Close log`, open state read from Rest's
  `aria-expanded`, `Set 1 logged` dialog, and the log closed before Edit after Save correction);
  `e2e/ui-polish-b05-active-hierarchy.spec.ts`, `-movement-countdown.spec.ts`, `-rest-log.spec.ts`
  (family-agnostic `sheet()` = half-sheet or open log; collapse by `Minimize|Close log`; rest-log's
  capture reads `[data-logging-head]` / `.clr-set-log > [role="status"]` too). Not run: they need the
  out-of-repo B05 `.evidence` references (pre-existing).
- Left unedited, flagged: `ui-polish-b05-sheet-surface`, `-scroll-boundaries`, `-unit-fields`,
  `-generate`, `-header-back`. They measure the B05 half-sheet surface itself (accent bar, non-modal
  dim layer, chevron, its scroll region) against out-of-repo reviewed captures. For a standard block
  that surface no longer exists; rewriting them means new visual baselines, which is TASK-041 /
  owner territory. They cannot run locally either way.
- Not this family, unchanged: `task-003.spec.ts:548` (circuit `Rest for kb swing`),
  `design-0143/workout-circuit.spec.ts`, superset/circuit unit tests, `block-panel.test.tsx:312`
  (circuit). Bare `ExerciseSetLogger` unit tests (`set-logger`, `set-correction-values`,
  `set-effort`) still render without `focused` (logic coverage; the half-sheet path stays live for
  TASK-044's consumers).

## Failures and corrections

- First spec run: 3 of 7 failed. (a) A distance prescription is not prefilled — my assertion
  expected `40`; corrected to the actual blank measure. (b) Gallery `set-correction` had no Edit:
  the gallery provider lacked `corrections` (the route passes it); added.
- A new `react-refresh/only-export-components` warning in `set-logging-sheet.tsx` (exported
  `setSheetTitle`); warnings do not fail Lint.

## Verification

All on the rebased tree (base `0060324`). Every Playwright guard ran under
`node …/agent-runner-v2/bin/v2.mjs with-lock --`.

- `node scripts/refinement/run-required-check.mjs --task TASK-043 --check check-01 -- npx playwright test e2e/refinement/task-043.spec.ts --project=mobile`:
  PASSED, 7/7 required.
- Earlier owners' exact guards, re-run because their targets were edited:
  - TASK-002 check-02 (`task-002.spec.ts`): PASSED.
  - TASK-007 check-01 (`timed-clock.test.ts`, `timer-frame-layout.test.tsx`): PASSED.
  - TASK-007 check-02 (`task-007.spec.ts`): PASSED.
  - TASK-008 check-01 (`countdown-urgency.test.ts/.tsx`): PASSED.
  - TASK-008 check-02 (`task-008.spec.ts`): PASSED.
  - TASK-020 check-01 (`set-logging-sheet.test.tsx`, pattern `rest|save|collapse`): PASSED.
  - TASK-020 check-02 (`task-020.spec.ts`): PASSED.
- `npx vitest run`: 269 files, 6356 tests passed.
- `npm run build`: passed. `npm run lint:ds`: clean.
- `npx eslint` on every changed file: 0 errors (3 fast-refresh warnings: 2 existing in
  `set-logger.tsx`, 1 new in `set-logging-sheet.tsx`).
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-037,TASK-043`
  (every task directory except TASK-039): PASSED, every receipt current.
- Not run: the B05 / `ui-polish-integrated` specs edited in the sweep (out-of-repo `.evidence`,
  pre-existing failures), and the backend-lane specs.

## Open items

- Contrast in the four skins is covered by axe only (`checkA11y`), which cannot decide text over the
  card/frame pseudo-elements; no direct per-element contrast measurement was added (TASK-041).
- UAT: the clear confirmation now opens inside the log (nested native dialog); on Clear the log
  closes at once without its own exit fade.
- UAT: after Save correction the log stays open on the next entry (existing behaviour, now modal).
- Superset movement corrections and the circuit's optional entry stay on the half-sheet (TASK-044).

## Repair round 1 (2026-11-11)

Review `reviews/TASK-043-a1-fafe579f17d5.json` rejected the candidate: a required TASK-033 check-01
case regressed and was not swept. Fixed under the same owner decision (2026-11-10): locators and
assertions updated with their meaning kept, case names kept, no `required-cases.json` edited, each
affected owner's exact guard re-run.

### Earlier tasks' checks changed in this round, line by line

- **TASK-033 check-01, `e2e/refinement/task-033.spec.ts`, case "JOURNEY-033 touch phone-390 /workout:
  one front glass over the open log and a native dialog…" (l.694, name unchanged):**
  - ~l.729: open-log edge host `body` → `dialog:open` (the open log is a native dialog now, so the
    one edge is drawn in its top layer, above the log). The glass, urgent-timer, topmost-paint and
    glass-over-log assertions are unchanged.
  - ~l.736–743 (added): `Close log` before Actions (the workout behind the modal log is inert), then
    the log is gone, the edge returns to `body` (polled) and `expectOneGlass` + `expectOneEdge(body)`
    hold, in phase.
  - ~l.788–794: after "Keep going", the draft `42` is read by reopening the log with the plank's
    Rest, then the log is closed with `Close log` before the deadlines run out (and before the second
    Actions/Abandon).
  - ~l.814–820: after the second "Keep going", the same reopen with Rest → draft `42` → `Close log`.
  - Everything else in the case (dialog edge host, effects off/on, storage unchanged, a11y,
    containment) is unchanged.
- **TASK-008 check-02, `e2e/refinement/task-008.spec.ts` touch case:** `bodyEdge` is now captured
  after the "minimised" probe (~l.620), i.e. the body edge just before Abandon, so "a new element,
  pinned to the same epoch" again compares the Abandon dialog's edge with the body edge (round 0
  captured it inside the log dialog).
- **TASK-020 check-01, `src/ui/set-logging-sheet.test.tsx`:** the case renamed in the first pass to
  "titles the dialog Log set N with its framed Close log X, then…" lost the word "collapse" and so
  dropped out of TASK-020's guard pattern `rest|save|collapse` (17 → 16). Renamed to "titles the
  dialog Log set N with its framed Close log X as the top collapse control, then context, fields and
  one full-width action" (meaning unchanged); the guard executes 17 again.
- **Correction to "No case renamed" above:** that line is true for the TASK-020 describe and for other
  tasks' specs. In TASK-043's own migration of `set-logging-sheet.test.tsx` (brief-owned) six cases
  were renamed to describe the dialog instead of the half-sheet (pinned foot, title/collapse,
  collapse/reopen, frame, accent bar, Edit set N). Of those, only the title/collapse case had changed
  TASK-020 guard membership; it is fixed above. No `required-cases.json` names any of them.

### Guards re-run in this round (exact manifest commands)

- `node …/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-033 --check check-01 -- npx playwright test e2e/refinement/task-033.spec.ts --project=mobile`:
  PASSED, 8 total / 8 executed / 8 passed / 0 skipped. Receipt
  `evidence/refinement/task-033/results/check-01.json` refreshed.
- `node …/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-008 --check check-02 -- npx playwright test e2e/refinement/task-008.spec.ts --project=mobile`:
  PASSED, 5/5/5/0. Receipt refreshed.
- `node scripts/refinement/run-required-check.mjs --task TASK-020 --check check-01 -- npx vitest run src/ui/set-logging-sheet.test.tsx --testNamePattern "rest|save|collapse" --passWithNoTests=false`:
  PASSED, 36 total, 17 executed, 17 passed, 19 skipped. Receipt refreshed (16 → 17 executed).

### Full sweep

`node …/v2.mjs with-lock -- npx playwright test e2e/refinement/ --project=mobile --workers=1`
(every `e2e/refinement/task-*.spec.ts`, 144 tests): 140 passed, 4 failed, 18.4 min. Per spec:
task-001 9/9, task-002 7/7, task-003 5/5, task-004 5/5, task-005 5/5, task-006 7/7, task-007 7/7,
task-008 5/5, task-009 0/3 (the three "one result group" cases at l.472, l.571, l.647 — known
pre-existing, also failing on base `0060324` per the review), task-010 3/3, task-011 3/3, task-012
5/5, task-013 5/5, task-014 5/5, task-015 3/3, task-020 3/3, task-022 4/4, task-023 5/5, task-024
6/6, task-025 5/5, task-026 5/5, task-028 11/11, task-029 13/13, task-033 7/8, task-043 7/7.

- task-033 l.902 ("JOURNEY-033 reduced motion phone-320…", gallery `ladder-long`) failed once in the
  sweep at "long log header: the glass is painted over this foreground" (0 changed pixels). It passed
  in the TASK-033 guard run, 4/4 with `--repeat-each=4` alone, and the whole spec passed 16/16 with
  `--repeat-each=2 --workers=1`. TASK-043 does not touch `ladder-long`, `TimedResultLog`,
  `LoggingOverlay` or the glass; treated as an intermittent paint-reading flake [inferred], not
  reproduced on base in this round.
- `npx vitest run`: 269 files, 6356 tests passed.
- `npx eslint` on the three edited files: 0 errors, 0 warnings.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks <all 34 task dirs except TASK-039>`:
  PASSED, every receipt current.

## Next action

Controller verification and commit.
