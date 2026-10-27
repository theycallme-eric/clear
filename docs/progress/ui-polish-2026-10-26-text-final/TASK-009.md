# TASK-009 — Sheet minimize control and logging access independent of rest

Issue #529 · REQ-010 · role: completion-owner for JOURNEY-008 (depends on TASK-006 and TASK-010).
This is the task's own progress record. It stands in for the shared daily journal for this task.

## Outcome intended

- The top chevron is the sheet's only minimize control, with no bottom Minimize button.
- Log set and saved-row Edit stay reachable from the movement card when the sheet is minimized and
  when rest is collapsed, skipped or expired.
- Minimized unsaved input comes back on reopen, and the rest keeps running while the sheet is hidden.

## Baseline, as found (HEAD `f3c35a2`)

- `src/ui/set-logging-sheet.tsx` already draws only the head chevron (`IconButton` "Minimize",
  `aria-expanded`). The form has no bottom Minimize, and edit mode keeps Cancel / Save correction.
- The card's Log set and saved-row Edit (TASK-011 wired `corrections` in `Workout.tsx`) are drawn
  whatever the rest is doing. The footer `RestTimerBar` holds only Add 30s and Skip rest, and it
  disappears on expiry or skip (TASK-010).
- The rest is read from the wall clock (`src/state/rest.ts`), so hiding the sheet cannot pause it.
- The new-entry draft lives in `SetLogger` state, outside the sheet, so it survives collapse/reopen.
- **Gap found:** an unsaved correction did not survive. Minimizing an Edit sheet and then reopening
  it through that same row's Edit called `setCorrection(editDraft(set, …))`, which replaced the typed
  correction with the stored result.

## What changed (local, unpublished)

- `src/ui/set-logger.tsx`: when the saved row's Edit reopens the row an unsaved correction was
  opened on, it now gets that correction back. Any other row still starts from its stored result.
  Cancel, Save correction and the card's Log set still clear the correction, as before.
- New: `src/app/sheet-minimize-access.test.tsx`. It has 8 tests that run through the real route tree
  on a synthetic `createWorkoutDouble` session, with no personal data and no backend:
  - AC-036: there is exactly one Minimize control on the screen, in the sheet head beside the title.
    The form has no minimize/hide/collapse button. Edit mode keeps Cancel / Save correction with the
    same single chevron.
  - AC-037: with the sheet minimized and the rest running in the footer, the card's Log set opens
    `Log set 2` and Edit set 1 opens `Edit set 1`. The rest region's buttons are exactly
    `Add 30s` and `Skip rest`. The same holds after skip, after expiry (91 s), and with no rest at all.
  - AC-038: a typed Reps value (6) is back after minimize and reopen. The rest reads 01:30, then
    01:05 after 25 s hidden, then 00:50 on reopen. Nothing is recorded by collapse or reopen. A
    minimized correction (Reps 5) comes back through the row's Edit.
- Nothing changed in GitHub or any external service. The vendored design system was not touched.

## Failures and corrections

- First run: 2 of 8 tests failed. (1) A harness error: `toHaveValue('6')` on a number input, which
  should be `6`. (2) The real gap above: the reopened correction showed the stored 8, not the typed 5.
  After the fix, all 8 pass. The failure before the fix is this test's discrimination evidence.

## Verification

| Command | Result |
| --- | --- |
| `npm test -- sheet-minimize-access` | pass, 8/8 |
| `npm test` | **fail**: 2 tests, both in `src/test/design-0143-final-audit.test.ts` (blocker below). Every other file passed |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors (138 existing warnings, same count) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

## Blocker: runtime-source-bound audit evidence

This is the same blocker TASK-006, TASK-007 and TASK-011 hit. The one-line runtime fix in
`set-logger.tsx` changes the runtime-source hash (`hashTree(['index.html','src'])`). The TASK-034
format-preview AFTER records and the final audit text must name that hash. Refreshing them means
committing the tree and genuinely re-capturing the mobile format-preview group against a disposable
authenticated backend. This worker cannot do that. No record, hash or audit text was edited, because
that would fabricate evidence.

Reverting the fix would make `npm test` green, but AC-038 ("minimized unsaved input remains
recoverable") would then be false for corrections, so the fix is kept.

## Next safe action

Controller: commit this tree, re-capture the format-preview group the way TASK-011 did, update the
audit from those artifacts, then rerun the full verification set.
