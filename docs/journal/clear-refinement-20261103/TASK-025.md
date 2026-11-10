# TASK-025 — Pinned Setup title, step and progress (#652)

Body `clear-refinement-v2-20261109b`, attempt 1, base `71692c2` (after TASK-033 #705), rebased onto
`e6c5f89` (after TASK-020 #706) before final verification. This is the task-owned progress note,
the approved exception to the shared daily journal for this body. Only TASK-025 writes this file.

## Intended outcome

REQ-025 (AC-C52-01, AC-R025-01; C52, G17; R24), completion owner of JOURNEY-025 on the real Setup /
onboarding equipment screen (`/onboarding`). Set up CLEAR, the step label and its progress are
pinned together above one shared divider while the equipment content scrolls, through the existing
Screen / AppHeader / ScrollRegion slots: no bespoke sticky overlay, no duplicate divider, no hidden
progress, and keyboard/touch focus stays reachable. Accepted gallery reference
`eded158cfd928d382c9a9409e2c372270312741d`, `/gallery/refinements?state=screens`.

## Before

`Onboarding` used `Screen` with no `header`, so the h1 and the `Progress` were the first items of
the scrolling content and scrolled away with the equipment list. Screen already had a `pinnedHead`
slot, but with `header` set as well the header kept its own closing rule and the region drew a
second one under the pinned layer (two dividers). No route used both together.

## Changes

- `src/app/Screen.tsx`: with both `header` and `pinnedHead`, the pinned layer is wrapped in
  `.clr-screen__pinned` under the `AppHeader` in the one region head. Docs updated. No other
  consumer changes (none used both slots).
- `src/styles/shell.css` (shared Screen CSS, not route CSS): `header:has(+ .clr-screen__pinned)`
  drops the header's own rule, so the head's single region rule (or the layer's own with
  `pinnedHeadRule={false}`) is the one divider; `.clr-screen__pinned` takes the header's side
  insets and closing gap. Tokens only.
- `src/app/Onboarding.tsx`:
  - `header={{}}` (a stable `SETUP_HEADER`): the title is the AppHeader title, as on Generate/Home,
    in the step view and the committing state alike.
  - New exported `SetupProgress({ step })`: the shared `Progress` with its existing label
    `Step N of 5`, passed as `pinnedHead`. It is no longer inside the keyed step-enter wrapper,
    so it no longer replays with each step's entry.
  - `StepView` exported as `SetupStepView` (unchanged behaviour) for the gallery.
  - No data, reducer, commit, guard or copy change.
- Gallery `?state=screens` (`src/dev/gallery-refinement-scenes.tsx`, `gallery-refinements.tsx`):
  new `SetupScene` after the Generate part. It draws the route's own `SetupProgress` and
  `SetupStepView` (equipment step, Home gym chosen, in-memory reducer) with the shared `AppHeader`,
  public `ScrollRegion` and the shared Screen classes in a `.clr-screen` frame four `spacing-1400`
  tall (inline sizing only; no route CSS). Title of the state extended, comment appended.
- Tests:
  - `src/app/Screen.test.tsx`: 2 cases (header + pinned layer as one head with one rule; a layer
    with its own rule closes the head instead).
  - `src/app/Onboarding.test.tsx`: new "TASK-025 pinned Setup title, step and progress" block,
    4 cases (pinned title/step/progress above the scrolling equipment; current through Next/Back;
    no sticky overlay / second divider / hidden progress; title and progress kept after a failed
    commit).
  - `e2e/refinement/task-025.spec.ts`: 5 cases (journey at 320 and 390; keyboard, reduced motion
    and reopen at 320; failed commit and retry at 320; gallery Setup part at 320).
- `evidence/refinement/task-025/required-cases.json`: check-01 declares all 5 browser cases.

## Deliberate consolidation vs the gallery reference

The reference drew a hand-made `<header>` (`Setup` label, `Step 1 of N · Equipment`) over a capped
`.clr-accepted-setup` scroll box inside a Card. R24 asks for the existing Screen/header slots and
scrolling contract, so the route uses `Screen`'s header + pinned layer + ScrollRegion, and the
gallery draws those same owners; `.clr-accepted-setup` is not adopted. The pinned step label stays
the existing `Step N of 5`; the step name stays the card's h2 (not duplicated into the head).

## Failures and corrections

- Worktree had no `node_modules`; `npm ci`.
- `npm run build` (tsc) failed once on a `querySelector` element type in the new Screen test; typed
  it `HTMLElement`.
- Negative control: with the header-rule handover disabled, all 5 browser cases failed on "one
  divider — the head's — and no second rule" (rules `['head', 'header']`); restored.
- `e2e/uat-batch-01.spec.ts` "onboarding holds each step…" fails locally before onboarding: it
  lands on the signed-out Welcome (no backend env on the default dev server), the same
  environmental cause TASK-024 recorded for ui-polish-home. Its assertions (one `.clr-card`, h2 in
  the card, footer action) still hold for the new markup. Not edited.

## Consumer sweep

- `e2e/ui-polish-b05-shell.spec.ts` onboarding guard case: passed locally (header now present; its
  clear-head checks are the ones every header screen meets).
- `e2e/design-0143/entry-forms.spec.ts` / `accessibility.spec.ts` (backend lane, not runnable
  locally): one progressbar, `Step N of 5` visible, h1 "Set up CLEAR", step h2 in the one card —
  all still true. Not edited. `contained-shell.spec.ts` checks `.clr-shell__content > header`, not
  the Screen header. core-loop, task-040, B05: only the title/route, unchanged.
- TASK-024's `?state=screens` cases (vitest in `Generate.test.tsx`, browser check-02): still pass.

## Verification (this worktree, after the rebase onto `e6c5f89`)

- `node …/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-025 --check check-01 -- npx playwright test e2e/refinement/task-025.spec.ts --project=mobile`:
  PASSED. 5 native cases, 5 executed, 5 passed, 0 skipped.
- `node …/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-024 --check check-02 -- npx playwright test e2e/refinement/task-024.spec.ts --project=mobile`
  (this task changed `?state=screens`): PASSED, 6 of 6; receipt byte-identical.
- `npm ci`, `npm run build`, `npm run lint:ds`: passed. `npx eslint` on every changed file: 0 errors.
- `node scripts/gallery-index.mjs --check`: 76 entries verified (no registry change).
- `npm test`: 269 files, 6341 tests passed.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-025,TASK-030,…,TASK-034`:
  exit 0, every listed task "current passing receipts", nothing stale.
- Consumer: `ui-polish-b05-shell.spec.ts` onboarding guard case passed; `uat-batch-01` onboarding
  case lands on Welcome locally (environmental, above).

## Open assumptions / UAT

- The pinned step label is `Step N of 5` (existing copy); the reference also showed the step name
  (`· Equipment`) in the head. Kept in the card heading to avoid duplicating it — owner may prefer
  it in the head.
- Screen readers read the scrolling content before the head (ScrollRegion's DOM order puts the
  scroller first); this is pre-existing for every header screen, not changed here.
- iOS Safari and a real phone keyboard are unobserved; the browser proof is Chromium mobile
  emulation at 320×568 and 390×844.

## Next action

The controller commits and runs its verification list.
