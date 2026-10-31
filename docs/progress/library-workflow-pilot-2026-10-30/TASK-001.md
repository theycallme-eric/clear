# TASK-001 library workflow pilot — ErrorView semantic error role

Issue #601 · REQ-001..003 · branch `agent-runner/task-001-a2-3c910f9e` (attempt 2).
This is the task-owned record; no shared daily journal or combined index is appended.

## Outcome

Manual completion in progress: the candidate is implemented but **not ready for handoff**. `npm test`
fails two 0.14.3 final-audit binding cases (see Failures). Every other required command passes.
No PR, merge, deployment or production release is claimed.

## Source identities

- Canonical owner: `src/ui/view-state.tsx#ErrorView`; registry entry: `src/dev/gallery-registry.tsx` · ErrorView
  (`/gallery/app?component=ErrorView`).
- Released base: `65522e93d60d439ad82a545833812a58095f2216`.
- Corrected prototype: `c0d5782bf9bec8065b5e224c9d3b4f35a9dded17` (`codex/lib-003-error-role-pilot`).
- Attempt-1 preserved candidate: `49bf036a59b2ecb416901ff5d84e342cddbcb195` (reused unchanged for the source).
- Candidate source: this branch's working tree. The regression serves it from its own fresh Vite server.

## Changes

- `src/ui/view-state.tsx`: the alert root scopes both existing hooks, `--border-card` and `--brd`, to
  `var(--border-toast-negative)`, as in the prototype. There is no literal colour, new token or component, or
  global card override.
- `src/dev/gallery-registry.tsx`: the existing ErrorView entry gains `inside a card` and `inside an AppDialog`.
  Both reuse the existing Card, AppDialog and DialogTrigger. `COMPONENTS.md` lists entries, not specimens, so
  `gallery-index --check` is unchanged.
- `e2e/fixtures/error-role-context.{html,tsx}`: local-only consumer fixture. It mounts the real Generate
  (guard precondition held) for the profile and places failures, and the real protected `/generate` route for
  the separate guard state. It uses the existing synthetic clients, with no account/database writes or
  generation.
- `e2e/library-error-role.spec.ts`: `error-role-consistency`, with eight cases.
- `playwright.config.ts` + `src/test/e2e-harness.test.ts`: the new spec is excluded before module import
  on external targets, alongside the existing local-only proofs (see Corrections).
- `docs/design/library/PLAN.md`: pilot outcome and limits under delivery 3.

## Initial findings preserved as history

- The intake patch scoped only `--brd` on the body. The bar and emission are siblings of the body, so in
  AppDialog the bar still read the dialog's inherited, already resolved `--brd`. The prototype scopes both
  hooks at the alert root, and that is what ships here.
- The first gallery skin-switch proof read computed styles before `data-skin` settled. The spec now waits
  for the applied `data-skin` and finished transitions before every reading.

## Failures and corrections

- Attempt 1 was interrupted before a normalized report. Native Runner reclaimed the lease into attempt 2,
  which reused the same-task candidate `49bf036`.
- Parent review finding (resolved): this source-only spec imports a released git object, starts Vite and
  serves `e2e/fixtures/`, none of which a deployed origin has. Correction: `browserTestIgnoreForTarget`
  excludes `**/library-error-role.spec.ts` for non-local targets, and the existing harness test asserts
  this. The exact local command still runs all eight cases. This is local candidate-source proof, not
  deployed proof. Protected CI is unchanged.
- **Open:** `src/test/design-0143-final-audit.test.ts` binds the 0.14.3 audit to the runtime-source hash
  (`index.html` + `src`, excluding design-system/test/dev). Any owner change makes the audit stale until a
  genuine authenticated Format Preview recapture records the new hash. The prior precedent is commit
  `12d0e11`. This worker has no credentials, and the task forbids account writes, so the recapture was not
  performed. No hash or record was fabricated.

## Verification (final tree, 2026-10-30)

| Command | Result |
|---|---|
| `npx playwright test e2e/library-error-role.spec.ts --project=mobile` | 8 passed, 0 skipped (1.5 min) |
| `npx vitest run src/app/Generate.test.tsx src/ui/view-state.test.tsx` | 2 files, 128 tests passed |
| `npm run lint:ds` | exit 0 |
| `git diff --quiet 65522e9… -- src/design-system exports/clear-design-system-0.14.3` | exit 0 (identical) |
| `node scripts/gallery-index.mjs --check` | 52 entries verified |
| `npm run lint` | 0 errors (151 pre-existing warnings) |
| `npm run build` | passed |
| `npm test` | **FAILED**: 5907 passed, 2 failed (both final-audit runtime-hash binding cases above) |
| Headless Chromium launch (PRE-001) | passed (worker ran all browser cases) |

Named cases: (1) the released owner mismatches in the isolated baseline. That server swaps only the owner
module for the base's git object, and the candidate file hash is asserted unchanged. The baseline is red in
the gallery standalone, AppDialog and Generate contexts. (2) Gallery specimens plus the AppDialog match in
4 skins × 320/390 with narrow fit, axe and direct reload. (3) Semantics, glyph, copy, request id and Retry.
(4) Containment, plus LoadingView/Card/ViewStateSwitch (EmptyState) paint equal to the baseline. (5, 6)
Generate profile and places failures: titles, roles, pinned-footer Retry refetching the failed read, and
Home. (7) The route-guard account error, verified separately. (8) The clr-glitch one-shot motion, and the
same content under reduced motion. JSON evidence records the skin, width and server origin for each context.
It is written to `test-results/` and is not committed.

## Unresolved / next action

1. Run the authenticated Format Preview collector against this candidate and record the new runtime hash
   in `docs/design/CLEAR-0.14.3-FINAL-AUDIT.md` (owner/credentialed step). Then rerun `npm test`.
2. Integrate current `origin/main`, rerun every check on the combined tree, and open the ordinary PR with
   the source-labelled evidence. Merge and release remain separate owner decisions.

## Owner-authorized manual completion

Eric explicitly authorized the authenticated capture exception, conditional on **not invoking Runner again**. The established operator setup has the required credentials; no new secret is requested or recorded. The disposable fixture may create/onboard/delete only its namespaced test account. The ErrorView regression itself retains zero account/database writes and zero generation.

The native attempt remains failed at `criterion-evidence-failed`; its independent eight-case browser pass is retained. All further capture, verification, commit, PR and CI work is performed directly by the operator. No new Runner call, task handoff, native recovery, receipt or completed-run credit will be created. Source-bound capture output is isolated in `task034-format-preview-library-601`; all historical groups remain unchanged.
