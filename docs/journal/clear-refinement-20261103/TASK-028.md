# TASK-028 — Released semantic error treatment remains a regression invariant (#655)

Body `clear-refinement-v2-20261109b`, attempt 1, base `e6c5f89` (after TASK-020, #706). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-028 writes this file.

## Intended outcome

REQ-028 (AC-C55-01, AC-R028-01). I am the completion owner of JOURNEY-028 (existing application
error screens). C55 / R22: keep PR611's released shared error-role correction (accent bar, frame,
emission and icon on one semantic error role across all four skins) as a regression invariant. Do
not reimplement or restart the completed pilot, and do not weaken error/retry meanings.

## What I found at the base (recorded before changing anything)

- **Owner present and unchanged.** `src/ui/view-state.tsx` is byte-identical to the accepted
  reference's copy (`sources/source-06-accepted-gallery-reference/src/ui/view-state.tsx`,
  eded158c…).
  - `ErrorView` carries the pilot correction: the alert root scopes `--border-card` and `--brd` to
    `var(--border-toast-negative)`.
  - The EmptyState body keeps `--surface-toast-negative` / `--brd`.
  - The glyph paints `var(--icon-toast-negative)`.
  - The history is `fe94496` (prototype), then `c0d5782` (corrected prototype), then `55843bd`
    (fix, with `e2e/library-error-role.spec.ts`). That last spec is the pilot's own regression
    proof, and it is still in place.
- **Gallery state missing.** The accepted reference's `/gallery/refinements?state=errors`
  ("Released error semantics") was not in this repo's `REFINEMENT_STATES`. The reference draws
  `<ErrorView error={createError(ErrorCode.NETWORK_TIMEOUT)} onRetry={…} />`.
- **The real account-load error in a fresh browser.** It is the boot check's failure ("System check
  failed", `BootSequence`, an ErrorView inside a Card, with a pinned Retry). The route guard's
  "Your account didn’t load" is not reachable in a fresh browser, because boot reads the profile
  first. The guard's error is still the real route tree in jsdom (`renderApp`). The pilot reached
  it with a fixture that bypasses boot.

## Changes

- `src/dev/gallery-refinement-errors.tsx` (new): `GalleryErrors` is the reference state exactly.
  It is the shared `ErrorView` for a network timeout, with an inert Retry, as in every gallery
  controller.
- `src/dev/gallery-refinements.tsx` (hotspot, append-only):
  - one import;
  - one `errors` entry, last in `REFINEMENT_STATES`;
  - one appended header paragraph.
- No change to `src/ui/view-state.tsx`, any route, CSS, tokens, the registry or COMPONENTS.md. No
  route CSS restates the role.

## Tests

- `src/ui/view-state.test.tsx`: a new `TASK-028 released error role (C55, R22)` describe with five
  cases:
  - standalone DOM contract and Retry;
  - inside a card;
  - the real route guard's account-load error and Try again;
  - the gallery `?state=errors`;
  - owner retention. This covers one `ErrorView` in src, no non-design-system stylesheet naming
    the toast-negative roles, and the pilot spec still present.

  check-01 also requires three existing error/retry meaning cases.
- `e2e/refinement/task-028.spec.ts` (new, 11 cases, mobile project). It uses a synthetic Vite
  origin with an intercepted session, and nothing is written.
  - **4 skins, real app.** The boot account-load failure is checked inside its card: the host
    card's frame, bar and emission share one role, nothing is nested, and the glyph is in the error
    icon role. Retry re-reads only the profile. Then `/summary`'s "That session didn’t load" is
    checked standalone: frame, both bar shadows, emission and icon all match the resolved error
    role, the error role differs from the ordinary card role, and the alert fits the viewport.
    Retry re-reads only the session into the Debrief.
  - **4 skins, gallery `?state=errors`.** The same role reading, with no account traffic.
  - **Meanings.** A held read shows a busy status and no alert. On failure there is an alert, no
    longer busy, offering only Retry. A failed retry is read once more and shows the same failure.
    A recovered retry reaches the Debrief.
  - **phone-320, reduced motion and keyboard.** The glitch animation is `none`, the role and fit
    hold, and Tab then Enter reaches and activates Retry.
  - **Motion.** One-shot `clr-glitch` with no loop, on the route and in the gallery.
- **Mutation check (then restored with `git checkout -- src/ui/view-state.tsx`).** I removed only
  the root `--border-card` / `--brd` hooks:
  - all 5 new vitest cases failed;
  - 10 of 11 browser cases failed. The motion-only case still passed, as expected.

## Failures and corrections during the work

- The worktree had no `node_modules`, so vitest could not load its config. I ran `npm ci`.
- The first browser run had 5 failures. `getByRole('status')` also matched the app's
  always-present announcer outside `main`. Busy checks now use
  `main [role="status"][aria-busy="true"]`. The role readings passed in that first run.

## Verification (this worktree, uncommitted candidate, 2026-11-10)

- `node scripts/refinement/run-required-check.mjs --task TASK-028 --check check-01 -- npx vitest run src/ui/view-state.test.tsx --testNamePattern "error|retry" --passWithNoTests=false`
  passed: 8 of 8 required cases (23 total, 15 skipped by the pattern).
- `node …/agent-runner-v2/bin/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-028 --check check-02 -- npx playwright test e2e/refinement/task-028.spec.ts --project=mobile`
  passed: 11 of 11.
- `npx eslint` on the four changed or new source files: 0 problems.
- `npm run build`: exit 0. `npm run lint:ds`: exit 0.
- `npm test`: 269 files, 6340 tests passed.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-034` (with TASK-028; the controller's list) PASSED: every task has current passing receipts and nothing is stale. No other task's check target was edited (no other manifest names `view-state.test.tsx` or `gallery-refinements.tsx`).

## Open assumptions / UAT

- `?state=errors` mirrors the reference: a standalone default "Request failed" with an inert
  Retry. It does not reproduce a route's own title.
- **Retry and drafts.** The error screens in scope hold no draft. Retry is proven to re-run only
  the failed read and to write nothing. Draft retention across a failed save belongs to the
  logging tasks (TASK-015 / TASK-047).
- **Not observed.** Safari/iOS. The contained boot failure keeps its host card's own ordinary
  role, which is the pilot's released containment rule. R22's orange-bar complaint was about the
  standalone frame.

## Next action

The controller commits and verifies the candidate.

## Repair round 1 (controller rebase)

- 2026-11-10: Rebased the candidate onto integration `fb9b749` (TASK-025). It was rebased linearly, with no merge commit. The only conflict was in `src/dev/gallery-refinements.tsx`. TASK-025's header text and its `screens` title were kept exactly. This task's `errors` header paragraph and `errors` state entry were added after them. The `GalleryErrors` import merged without a conflict. Results after the rebase: gallery-index check passed (76 entries). eslint on the changed files found 0 problems. check-01 passed (8 of 8 required cases). check-02 passed under the host lock (11 of 11). `npm test` passed (269 files, 6346 tests). `npm run build` and `npm run lint:ds` both exited 0. The final delivery-evidence verifier PASSED. The receipts were rewritten with identical bytes. I did not re-run the TASK-024 or TASK-025 guards because `?state=screens` did not change.
