# TASK-017 — Contained, scrollable swap selection with existing feedback

Issue #537 · REQ-020 · role: completion-owner for JOURNEY-016.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

On Review, a long list of swap alternatives stays inside the swap dialog and scrolls there. Every
item, including the last one, can be reached and selected. Selecting one closes the dialog and
returns to the same Review with the slot swapped. The pick is confirmed through the existing toast
queue and `ToastHost`, not a bespoke notice.

## Baseline, as found (HEAD `0f967fd`, contains `7f0a367`)

- `src/ui/exercise-swap.tsx` rendered the `ready` alternatives as a plain `<ul>` in the `AppDialog`
  body, with no height bound.
- 0.14.3's `.clr-dialog` sets `max-height: none`, so a long list made the panel taller than the
  viewport. The fixed top-layer dialog does not scroll as a page, so the end of the list was out of
  reach. This is a possible local overflow mechanism inferred from code; it does not identify the
  installed-iPhone cause. **The exact device reproduction is unknown:** the sources give no iOS version, list length
  or gesture, and none is invented here.
- A swap gave no feedback beyond the row changing.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` exit 0. PRE-002: `package.json` declares
  0.14.3, `git log -- src/design-system` shows TASK-002 (#398) as the last change, and this task
  leaves `src/design-system` unchanged. The `node -e` version probe needed approval and was not run.
  The `grep` read gave the same answer.
- `gh issue view` was not used. The approved task body was the contract, and issue comments were
  not read by the worker.

## Initial worker candidate (retained at `97f5117`)

- `src/ui/exercise-swap.tsx`: new internal `SwapOptionList`.
  - The list sits inside the public `ScrollRegion`, the shared vertical scrolling contract in
    ATOMIC §3.3, so there is no local overflow box.
  - Its frame (`data-swap-list-frame`) takes the list's measured height (`ResizeObserver`) and is
    capped at `max(calc(var(--control-height) * 2), calc(100dvh - var(--spacing-600) * 10))`. A
    short list leaves no blank band. A long list clips and scrolls while the title and "Keep …"
    stay on screen. The list keeps its accessible name "Alternatives" and its buttons are unchanged.
- `src/state/swap-provider.tsx`: `choose` now also calls
  `toastQueue.show({ variant: 'positive', message: 'Swapped in <name>.' })`, on the root queue the
  app's `ToastHost` renders. Undo and Keep raise no toast.
- New `src/app/swap-selection.test.tsx`: 5 cases on the real route tree at `/review`, with a
  390×844 window and a synthetic 32-candidate primary-lift pool.
  - Containment (AC-068/076): every option is inside one `ScrollRegion` scroller, with no nested
    scroller. The frame cap uses tokens and `dvh` with no px. The title and Keep are outside the
    scroller.
  - Touch scroll/reachability (AC-076): a touch drag plus scroll on the scroller sets the region's
    `data-scrolling`. The last option is inside the scroller and enabled.
  - Selection return (AC-068): picking the last option closes the dialog. The route stays
    `/review` with the same heading, the swapped slot and its undo are shown, and Start is enabled.
  - Existing feedback (AC-069): one positive message is on the root queue, rendered as the
    host's `status` with no other copy of the text. It is dismissed with the shared Toast's control.
  - Keep: returns with nothing swapped and no toast.
- Nothing changed in GitHub or any external service.

## Decisions and assumptions (for review)

- Toast copy "Swapped in <name>." is the worker's wording. The sources give no copy.
- The toast has no Undo action, because the row's existing "Undo swap" already covers it.
- The cap reserves ten `--spacing-600` steps (240px at 0.14.3 values) for the panel's padding,
  title, gaps and Keep action. The `--control-height * 2` floor keeps the list usable in short
  landscape windows.

## Limits of the initial worker proof

- `npm test` runs in jsdom, which does no layout, so the test sets the scroller's geometry by hand.
  It proves structure, event wiring, enabled semantic choices and the return path. Actual scroll
  reachability, layout and hit testing remain unproved until browser execution.
  No Playwright/Chromium run was made for this task.
- **The installed-iPhone fix is not proven on device.** It stays pending in post-launch manual UAT
  (`POST-LAUNCH-MANUAL-UAT.md`, outside the DAG), on the actual installed iOS build. Neither jsdom
  nor local Chromium is that proof.

## Initial worker verification

| Command | Result |
| --- | --- |
| `npm test -- swap-selection` | pass, 1 file / 5 tests |
| `npm test` | **fail**: 2 of 5755, both in `src/test/design-0143-final-audit.test.ts` (blocker below); 231 of 232 files pass |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors (143 warnings, same as TASK-016) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

## Verification stop: runtime-source-bound audit evidence

This is the same blocker as TASK-006/007/009/011–016. The audit hashes all non-test runtime files
under `src/`, so this change makes two checks fail:

- *proof labels › bound to the package and runtime source of this tree*
- *TASK-034 AFTER evidence (eight-cell mobile group)*

The package-hash assertion that runs first in the same test still passes, so the vendored system
is intact. Fixing these means committing the tree and re-capturing the four-skin mobile
format-preview group against a disposable authenticated backend, which this worker cannot do. No
record, hash or audit text was edited.

Next safe action: the controller reads issue #537's comments, commits the tree, re-captures the
format-preview evidence against it, then runs native verification.

## Controller verification recovery — in progress

Native initial29741 collected terminal exit1: worker succeeded, focused criterion/task commands
each passed5cases, full suite stopped only on two stale source-bound audit checks. Initial
four-file candidate97f5117 remains in history; attempt1/max2 is unchanged. Root read live
issue #537/comments0. No additional model attempt or Runner change is involved.

The source comment and baseline wording now identify overflow only as a possible local mechanism;
the reported installed-iPhone cause remains unknown. The jsdom test records DOM/event behavior,
not actual geometry or touch hit testing. A focused production /review browser spec is being
added with synthetic long-list route fixtures, real Chromium touch/scroll and last-row selection,
safe Keep, Review return and existing toast feedback at normal/narrow/short phone sizes. It will
not forward model/API mutations or claim real-user, backend or physical-device verification.

Source binding names actual TASK-017, run209dc3f3-1046-4dd6-8adc-e8023caf547c, attempt1 and
base0f967fd9ab2196e21ffa41f9bbe6f3783a9030f1. Root will commit before executing proof, then
collect genuine current-source format evidence and use native same-attempt full verification.

The additive browser driver is ready for execution. It checks actual rendered dialog/list/action
bounds, uses Chromium touch gestures to reach the final wrapped alternative, verifies its hit
target and selects it with a touch tap. It also checks Keep and Escape focus return, unchanged
Review ownership and Start availability, the existing toast host and dismissal, and zero forwarded
API writes/model calls at 390×844, 320×568 and 390×320. Independent source review found no concrete
selection or observer-cleanup blocker. Browser results remain pending; synthetic route/API fixtures
do not prove persistence, the deployed backend or the installed-iPhone symptom.
