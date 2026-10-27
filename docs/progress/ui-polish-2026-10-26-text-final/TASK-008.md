# TASK-008 — Optional per-set three-choice effort in the half-sheet

Issue #528 · REQ-008, REQ-009, REQ-011 · role: completion-owner for JOURNEY-006 and JOURNEY-007.
This is the task-owned progress record. It stands in for the shared daily journal for this task.

## Outcome intended

The sheet built by TASK-006 now asks each set's optional effort (too hard / about right / too easy,
drawn as Frown / Meh / Smile). It sits between the measurement row and the action, in new-entry and
edit modes. Effort is stored through the TASK-007 contract. The words are visually hidden, the
selected state is exposed, a compact Clear returns the set to unanswered, and null always stays
null. The five-choice session feeling is untouched. Durable correction and Clear orchestration
remain TASK-011. Browser regression across the surrounding surfaces remains TASK-018.

## Attempt history

Attempt 1 was interrupted when its command session disappeared. Its controller and worker were
confirmed gone; no terminal worker or verification result was recorded, and its usage is unknown.
The existing lease expired at17:29:20.218UTC; one normal targeted run-once reclaimed configured
attempt2 in this fresh a2 workspace at `b38987f`. The a1 partial workspace remains inactive and
was not copied or reset. Attempt2 rebuilt from the unchanged approved body; max2/history retained.

## What changed (local, uncommitted)

- New: `src/ui/set-effort.tsx` and `set-effort.css`.
  - `SetEffortChoice` is the design system's `ChoiceGroup`, the same as `FeelingRow`. Each option
    is a face glyph plus its word in `a11y-hidden`. `aria-checked` shows the selection, alongside
    the chip's tick. A quiet small `Clear` button (type=button, named
    `Clear effort for set N`) appears only when the set is answered and returns focus to the group.
  - `SetEffortReading` draws a saved set's face, named `Effort: …`, in the logged row. It draws
    nothing for an unanswered or older set.
- `src/ui/set-logger.tsx`:
  - The draft now carries `effort` (`null` for every new set) and keeps it through
    collapse/reopen.
  - The edit draft reads back the saved `set.effort`.
  - A new set hands `effort` to `logSet` only when it is answered. Unanswered omits the key, so
    TASK-007 stores NULL.
  - A correction always states `effort`, with `null` for cleared.
  - Removed the TASK-006 placeholder `renderEffort` hook. The logger owns the effort because it
    owns the draft.
- `src/ui/set-logging-sheet.tsx`: removed the now-unused `SetSheetInsertionContext` and updated
  the header comment. Layout is unchanged.
- `src/dev/gallery-registry.tsx`: added `SetEffortChoice` and `SetEffortReading` specimens
  (unanswered and chosen/answered).
- Tests:
  - New `src/ui/set-effort.test.tsx`: 12 tests, AC-039…AC-042.
  - `set-logging-sheet.test.tsx`: added effort-enabled composition coverage for AC-028/029/030.
    The order check now includes effort, and the edit correction states `effort: null`.
  - `set-logger.test.tsx`: the "asks for no effort" assertion became "three choices, never a
    number".
- Nothing changed in GitHub or any external service. The vendored design system was not touched
  (`lint:ds` green, package hash test green).

## Failures and corrections during the session

- My first glyph-order assertion read the chip's own selection-tick `svg`. I fixed the test to
  match each radio's face glyph among its SVGs.
- The small button's class is `clr-chamfer--sm`, not `clr-btn--sm`. I fixed the test assertion.
- `gallery-registry` failed because the two new `src/ui` exports had no gallery entry. I added
  real specimens rather than an exemption.

## Verification (2026-10-27, attempt 2)

| Command | Result |
| --- | --- |
| `npm test -- set-effort` | pass, 12/12 |
| `npm test -- set-logging-sheet` | pass, 29/29 |
| `npm run lint:ds` | pass |
| `npm run lint` | pass, 0 errors (warnings only) |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass |
| `npm test` | **fail**: 2 of 5591, both in `src/test/design-0143-final-audit.test.ts` |

## Blocker: runtime-source-bound audit evidence (same as TASK-006 / TASK-007)

These two tests hash every non-test file under `src/` (outside `design-system`, `test` and `dev`).
They require the format-preview AFTER records and the final audit to name that hash, so any product
UI change fails them until a genuine recapture:

1. *requires the complete actual eight-cell mobile group…*
2. *is bound to the package and runtime source of this tree…*

Refreshing them means three steps:

1. Commit this diff.
2. Re-run `e2e/design-0143/format-preview.spec.ts` on that commit against a disposable local
   authenticated backend.
3. Re-derive the audit and its source lineage, as the TASK-006/007 operator recovery did.

This worker cannot do that. It has no `.env.local` or `.env.runner.local`, the brief does not
permit a commit, and the lineage must name a real run. I did not edit any record hash, audit text
or lineage, because that would fabricate evidence.

## Next safe action

An operator or credentialed lane takes these steps:

1. Commit this diff.
2. Run the TASK-034 mobile format-preview capture on that commit into a new evidence group,
   leaving earlier groups untouched.
3. Re-derive the audit's runtime hash and lineage from those actual records.
4. Re-run `npm test`.

After that, every acceptance criterion and repository check above should be green.

## Operator recovery checkpoint

Native invocation21461 returned exit1: worker succeeded, native12 effort and29 sheet tests passed;
full suite failed only two stale source-bound audit tests. No additional coding attempt is needed.
The operator will commit source and collect genuine mobile records against the owned disposable
local backend, then use the existing native same-attempt recovery to rerun every check and emit
its own receipt. Capture lineage must use this actual attempt2/a2 input and baseb38987f, never the
interrupted a1 or the previous TASK-005 binding. Physical-iPhone and broad surrounding smoke remain
outside this task, as explicitly allocated by the approved handoff.

Independent final source review found no remaining concrete scope/regression concern: nullable
per-set drafts, correct glyph order/accessibility/answered-only Clear, collapse retention and
controlled edit boundaries match the approved task. Numeric RPE, five-choice overall feeling,
persistence and vendored DS remain unchanged. Active format-preview collector needs no selector
adaptation. DS and diff checks passed; genuine recapture/native full recovery remain pending.
