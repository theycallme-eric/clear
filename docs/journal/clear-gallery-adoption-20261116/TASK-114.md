# TASK-114 — every logging dialog's frame, header, rhythm and scrolling on real routes (A3 task 14a, #737)

Task-owned progress note (body `clear-gallery-adoption-v2-20261120`, attempt 1, base `cc65efd5`). Only TASK-114 writes it.

## Intended outcome

Sweep the look of all 16 logging contexts (and ladder-long) on their real routes against their accepted gallery
states (bec4454): the dialog frame and accessible header, the label/group/count rhythm and contained scrolling.
Fix only what the sweep finds, in the shared Round 7 owners, with the gallery states (which render the same owners)
updated in the same commit. Prove the inherited task-041 suite and the build's TASK-017 and TASK-018 blocks of
`src/ui/logging-overlay.test.tsx` (this task owns the whole file, owner decisions of 2026-11-18, decision 3).

## What the sweep found (base `cc65efd5`, task-041 run whole and as a soft-assertion copy)

1. C41/R105: on every moment the X frame's visible top sat 4 px above the title's visible top (the title's line box
   was not trimmed to its capitals).
2. C44/C57/P01: the dialog's box was not the frame (20 px block padding); the scroller sat 12 px inside the frame's
   16 px padding (4 px scroll padding, −4 px margin), so long forms stopped 12 px short of the inner lower border; no
   inner-chamfer clip.
3. C59/P03: the scroller's scrollbar was not hidden.
4. C58/P02: no rule kept the containers free of the browser's focus outline or the frame free of Foundation's
   fallback focus ring.
5. AC-R018-04: nothing followed the visual viewport (an on-screen keyboard).
6. C05/R111 (shared rhythm): a superset round's complete movement groups sit the movement gap (12 px) further apart
   than its other parts; a timed log's (EMOM, AMRAP, For Time, ladder) did not.

Everything else matched: route and gallery draw the same Round 7 `LoggingOverlay`, the Balanced backdrop, the X-only
"Close log", the legend gap (8 px), the ladder's heading (8 px) and count (16 px) gaps, AA contrast in all four skins.

## Changes

- `src/styles/logging-overlay.css` (shared owner): title `text-box: trim-start cap alphabetic`; the selected dialog's
  box is the frame (`padding-block: 0`), centred in the visible viewport (`--logging-visible-top/-height`), max height
  the viewport less `--logging-viewport-gap` and the safe areas; frame padding = border width; scroller padding
  `16 px − border` top/inline and 0 below, `min-width: 0`, `scrollbar-width: none`, `::-webkit-scrollbar` hidden, the
  inner-chamfer `clip-path`; body end gap `16 px − border`; no outline on dialog/frame/scroller/body and the frame keeps
  its border under focus; timed-log movement groups `+ var(--logging-movement-gap)`; imports `refinements/tokens.css`.
  The form keeps Round 7's 16 px inset, so at rest nothing moves except the title (4 px up).
- `src/ui/logging-overlay.tsx` (shared owner): while open, sets `--logging-visible-top/-height` from
  `window.visualViewport` (resize and scroll), cleared on close. Geometry only.
- AppDialog: no change needed.
- Gallery: no `src/dev/**` change; the 16 states and ladder-long render the same owners, so they change with them.
- Tests: `src/ui/logging-overlay.test.tsx` (TASK-016 block kept; the header case restores the build's `text-box`
  read; the build's TASK-018 (9) and TASK-017 (7) blocks added on Round 7; `HEAVY` 30 s); `e2e/refinement/task-041.spec.ts`
  (owner-decision rewrites and Round 7 readers, listed in the ledger); new `e2e/refinement/task-114-parity.spec.ts`.
- Evidence: `evidence/refinement/task-114/` (required-cases, receipts, parity receipts, test-ledger). Captures in
  `evidence-store/clear-gallery-adoption-v2-20261120/task-114/captures/`.

## Failures, misleading signals and corrections

- After the trim fix, header readings in the non-reduced-motion cases scattered (−11 to +8 px): paint was read during
  the shared Dialog's 200 ms phosphor arrival. task-041's `inspect` now waits for finite animations first.
- Ladder clock read 12 s behind a 10 s wait: the read was taken before opening the note; it is now taken with the
  note open.
- TASK-041 guard runs 1 and 2 each failed one non-reduced-motion case (JOURNEY-018 keyboard, then JOURNEY-016
  every moment) at the same step: the movement note's "Add note" tap opened no dialog. Cause: the coaching disclosure
  animates open and the tap landed where the button had been. `expandCoaching` now waits for that motion to settle
  (test-only; amended into the implementation commit), then task-041 was run again.
- A unit gallery case found three closed logging dialogs in the gallery scene; it now reads the open one.
- Round 7's coverage register quotes C47's criterion with the removed sentence; only that exact criterion line is
  allowed (any drawing or expectation elsewhere still fails).

## Verification (2026-11-23, on 8bf21304 plus evidence)

| Command (through the guard; browsers under `v2.mjs with-lock`, one at a time) | Result |
| --- | --- |
| base `cc65efd5`: `npx playwright test e2e/refinement/task-041.spec.ts --project=mobile` | 10 failed (the sweep's findings) |
| TASK-114 check-01 (`vitest run src/ui/logging-overlay.test.tsx`) | PASSED, 24/24 |
| TASK-016 check-01 (`header|focus|close|backdrop`) | PASSED, 8 required |
| TASK-017 check-01 (`group|spacing|helper`) | PASSED, 7 required |
| TASK-018 check-01 (`scroll|outline|viewport`) | PASSED, 9 required |
| TASK-106 check-01 (its 11 files; receipt refreshed for the changed target) | PASSED, 186/186 |
| TASK-114 parity, run 1 (direct) and run 2 (guard) | 34/34 passed both times; 34 receipts byte-identical; 68 capture hashes match the store files |
| TASK-041 check-01, guard runs 1 and 2 (before the disclosure wait) | 9/10 each; one movement-note tap missed (see above) |
| TASK-041 check-01, guard run 3 (final) | PASSED, 10/10 |
| CI chain (`typecheck && lint && lint:ds && gen-issues --check && gen:types --check && npm test && build && console check`) | exit 0: lint 0 errors, 175 warnings (changed files 0 at base and HEAD); 279 files, 6516 tests passed; build ok (run before the test-only disclosure wait; tsc and eslint clean on it after) |
| `verify-delivery-evidence --mode final --body clear-refinement-20261103 --tasks TASK-016,TASK-017,TASK-018,TASK-106` | current passing receipts |
| lint on changed files, base vs HEAD | 0 warnings, 0 errors both |

Self-check (TypeScript compiler API, every test/spec touched since the base): 3 files; 15 base titles, 32 at HEAD;
0 base titles absent or renamed; 22 changed or ported bodies; 0 bodies with fewer `expect` reads than the base;
4 with fewer than the build, every lost matcher accounted for in the ledger (`rules.selfCheck`,
`rules.readsDroppedOrRelaxed`). `matchersWeakened: false` (no matcher replaced by a weaker one on the same read).

## Open assumptions

- Keyboard following (visual-viewport listener) is treated as frame geometry under AC-R018-04, not behaviour.
- Round 7's anchor set log fits 320 × 568 and the twelve-round log with no rounds stated fits 390 × 844; the long-form
  checks run on the superset round, the twelve-round ladder and ladder-long Incomplete through round 7.
- Base-vs-tree gallery comparison is by measurement of the shared owners (ledger `galleryChanges`), not by a base
  capture run.

## Next action

Controller verification; TASK-120 then reruns task-041.
