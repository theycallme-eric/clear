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

## Initial worker verification

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

## Controller verification recovery — in progress

- Native initial command reached terminal verification-failed after the worker succeeded. The
  initial six-file candidate is retained in commit `d805717`; this remains attempt 1 of 2. No new
  model invocation, attempt reset, or Runner change is involved.
- Controller read the live issue #535 and its comments (zero), completing the issue-context step
  the worker could not perform. Independent runtime review found no concrete acceptance blocker.
- The existing circuit browser spec now includes actual 320×568 and 390×844 footer geometry
  coverage, including shared rest, expanded load-entry sheet, and last-section Finish label. The
  original two substantive circuit journeys are unchanged. These cases are pending execution.
- Current-source format-preview binding names actual task TASK-015, native run
  `c7bb59aa-9d02-481d-8610-e02189508e65`, attempt 1, and tested base
  `9c941f8c3ca0ca3e8f45b6e04e9a264afc4fa05e`; evidence will be genuinely collected after commit.
- The owned disposable local backend started/reset successfully with the actual migrations. A
  transient desktop disconnect preserved all saved work; connectivity and backend status were
  rechecked successfully, with no coding-worker restart. No hosted schema was changed.

Next: commit the proof-ready tree, execute the circuit and footer cases, collect actual format
proof, then use native same-attempt verification and protected build-branch delivery. Physical
iPhone safe-area behavior is not inferred from jsdom or local Chromium.

## Actual mobile verification — first execution

Foreground47736 exited1: both original circuit journeys passed, both new viewport cases stopped
on an incorrect assertion expecting the circuit countdown inside the set-rest sheet. Actual
DOM and source confirm circuit rest is owned by the block independently of set rest. The new
assertion now checks the single active circuit countdown without changing its owner or any
product behavior. Failure traces/screenshots/log are preserved externally. Footer geometry in
the expanded-sheet state remains pending actual execution.

## Browser-discovered reachability correction

The corrected mobile run52700 exited1: the original two circuit journeys passed, while both
new phone cases proved the expanded sheet put navigation below the viewport (button bottom
872.703 at height568, and914.5 at height844). The public pinned foot is capped at45% and
scrolls all of its contents; its sheet plus navigation exceeded that internal fold. At320px,
the unshrinkable timer/action header cluster also squeezed the title into one letter per line.

The workout now composes that foot as a shrinkable column, keeps progress/navigation outside
the independently scrollable entry/rest area, and preserves the public45% cap. The public
AppHeader className prop is forwarded by Screen so only the workout header can wrap its
existing slots to another line. No vendored styles or components changed. Browser cases also
scroll the entry to its submit action and recheck that the pager remains in the viewport.
Actual verification of this correction is pending; previous failures remain preserved.

## Actual corrected mobile proof

Foreground39463 exited0: all four actual circuit/footer browser cases passed (12.4 s), including
both320×568 and390×844 with rest/shared-sheet entry, entry scroll to final action, and last
section. Both original circuit journeys remain passing. Independent final source review found
no further blocker. Nine focused footer tests and lint:ds passed after the correction.

Capture27431 exited0: four skin cases/eight PNGs (24.1 s) from the SAME clean committed source
`d66240cd88e66493fd01795869f32fd647b56cb6`. Runtime `a60849329519c38b695b1a3f12fb1354a9680a66684fd9cc583b91af87230ad6`;
driver `015a69418c6a639de81d8195f03d2bbef70b90b999951acd08fd4b13e1af12b3`; actual payload
`db2b0570830230531a25967edd7117ee75028579423ae4ecbd1f0d7f871c1451`. Real input provenance uses the actual run/a1/base.
Every skin recorded zero generations/attempted writes/forwarded writes. Owned backend stop80277
collected exit0. Existing evidence groups are retained unchanged; native verification and
protected delivery have not yet run on the final evidence commit.

Existing actual audit consumer32999 exited0: all38 checks passed. Diff checks confirm byte-identical
vendor/workflows/migrations and all prior tracked evidence groups. Next is native same-attempt
full verification against the final committed candidate, followed by protected delivery.
