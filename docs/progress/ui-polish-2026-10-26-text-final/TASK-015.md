# TASK-015 — Paired workout footer navigation with adjacent progress

Issue #535 · REQ-018 · role: completion-owner for JOURNEY-014.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

During the active workout, the session progress sits immediately above the bottom navigation.
Previous is on the left and Next section / Finish workout is on the right, in one compact paired
row. The actions stay readable, aligned and reachable inside device safe areas. The navigation
flow semantics do not change.

## Baseline, as found (HEAD `9c941f8`, contains `7f0a367`)

- The session progress bar was drawn inside the active section's header card, at the top of the
  scroll content, far from the footer.
- `WorkoutNavigation` used the shipped `.clr-actions` row. On phones that row stacks full width
  with the primary action on top, so Next/Finish sat above Previous rather than beside it. Both
  buttons were `size="lg"`.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` passed. PRE-002: the design system
  declares 0.14.3, and `git diff 7f0a367 -- src/design-system` is empty. It is still untouched.
- `gh issue view` was not used, so the approved task body was the contract. Issue comments were
  not read by the worker.

## What changed (local, unpublished)

- `src/ui/workout-chrome.tsx`:
  - `WorkoutNavigation` takes optional `progress` and `currentIndex` props. It renders
    `<nav class="clr-workout-nav">`: the existing `SectionProgressBar` first, then a
    `.clr-workout-nav__pair` row with Previous followed by Next section or Finish workout.
  - The buttons use the standard size (min height `--control-height`) instead of `lg`, which
    keeps the row compact.
  - Handlers, disabled and busy states, and the busy loop claim are unchanged.
  - `SectionHeader` gains an optional `bar` prop (default `true`). The workout passes `false`, so
    the header keeps its count, structure badges and the collapsible jump list but no longer
    draws a second bar.
- New `src/ui/workout-navigation.css`: the pair is a two-equal-column grid at every width, with no
  breakpoint and no `order` swap. Cells use `min-width: 0` and buttons are full-cell, so long labels
  wrap inside their cell. Values are tokens only.
- Safe areas: the contained shell (`src/styles/shell.css`) already applies the
  `env(safe-area-inset-*)` side insets and the bottom padding, and that file was not changed.
- `src/app/Workout.tsx`: passes `progress` and `currentIndex` through `SectionNavigation` to the
  footer, and `bar={false}` to the header.
- Tests:
  - New `src/app/workout-footer-nav.test.tsx`: 9 real-route cases, grouped by AC-064 and AC-065.
    - Adjacency of the bar and the row.
    - Left/right order on middle and last sections.
    - A single bar on screen.
    - The non-stacking CSS contract.
    - Control height and full-cell alignment.
    - Safe-area shell containment.
    - Flow: Previous is disabled on the first section, Previous saves nothing, Next saves then
      moves, and Finish reaches `/summary` through the existing completion.
  - `Workout.test.tsx`: 3 assertions updated. The bar is now found in the footer navigation, not
    the header, and the nav class is `clr-workout-nav`, not `clr-actions`.
- Nothing changed in GitHub or any external service.

## Decisions and assumptions (for review)

- **Above rather than beside:** the bar sits directly above the pair, which leaves both buttons
  full half-width on a 320 px phone.
- **Compact = standard control size:** buttons dropped from `lg` to the default size but keep
  the system control height, so the touch target is the same.
- The jump list stays in the header disclosure. Only the bar moved, so the screen still shows one
  bar.

## Failures and corrections

- First named-test run: 1 of 9 failed. A regex `[^)]*` could not span the nested
  `var(--spacing-500)` inside `max(...)`. It was replaced with an explicit pattern.
- First full run: 5 failures. Three were old `Workout.test.tsx` assertions about the header bar and
  the `clr-actions` class, and they were updated. The other two are the known audit blocker below.

## Worker verification

| Command | Result |
| --- | --- |
| `npm test -- workout-footer-nav` | pass, 1 file / 9 tests |
| `npm test` | **fail**: 2 of 5742, both in `src/test/design-0143-final-audit.test.ts` (blocker below); 229 of 230 files pass |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors (141 warnings, unchanged) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

## Verification stop: runtime-source-bound audit evidence

This is the same blocker as TASK-006/007/009/011/012/013/014. Any runtime change in `src/` changes
the runtime-source hash. The audit now expects
`7676632d027b9e33d2772d68dbc27363c46b81f17b5eb7a81ee1f3c67d6c95a3`, so two checks fail:

- *proof labels › bound to the package and runtime source of this tree*
- *TASK-034 AFTER evidence (eight-cell mobile group)*

Fixing them means committing the tree and re-capturing the four-skin mobile format-preview group
against a disposable authenticated backend. This worker cannot do that. No record, hash or audit
text was edited, because that would fabricate evidence.

## Next safe action

Controller: commit, then do the source-bound mobile capture and record the audit evidence. Run
native verification on the exact head. Physical-iPhone safe-area behavior is not inferred from
jsdom.
