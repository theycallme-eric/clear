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
  reach. This is the likely mechanism behind the reported installed-iPhone defect, inferred from
  code. **The exact device reproduction is unknown:** the sources give no iOS version, list length
  or gesture, and none is invented here.
- A swap gave no feedback beyond the row changing.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` exit 0. PRE-002: `package.json` declares
  0.14.3, `git log -- src/design-system` shows TASK-002 (#398) as the last change, and this task
  leaves `src/design-system` unchanged. The `node -e` version probe needed approval and was not run.
  The `grep` read gave the same answer.
- `gh issue view` was not used. The approved task body was the contract, and issue comments were
  not read by the worker.

## What changed (local, uncommitted)

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

## Limits of the proof

- `npm test` runs in jsdom, which does no layout, so the test sets the scroller's geometry by hand.
  It proves structure, scroll wiring, reachability and the return path. It does not prove pixels.
  No Playwright/Chromium run was made for this task.
- **The installed-iPhone fix is not proven on device.** It stays pending in post-launch manual UAT
  (`POST-LAUNCH-MANUAL-UAT.md`, outside the DAG), on the actual installed iOS build. Neither jsdom
  nor local Chromium is that proof.

## Worker verification

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
