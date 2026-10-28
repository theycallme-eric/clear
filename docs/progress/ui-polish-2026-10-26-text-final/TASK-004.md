# TASK-004 — Generate glow on applicable actionable controls

Issue #524 · REQ-005 · role: completion-owner for JOURNEY-004.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

Mark Rest Day and Settings on Home carry the Generate button's glow: the vendored `.clr-glow`,
`--glow-spread: 6px` in `--glow-color: var(--interaction-a300)`. Every skin re-tints it through its
interaction role. No stronger preview halo comes back, no card acquires a glow, and focus, disabled
and loading states stay the existing components'.

## Baseline, as found (HEAD `cdc6e64`, contains `7f0a367`)

- `Button variant="primary"` wraps its `.clr-bleed` in `.clr-glow`; other variants get only the
  bleed. Home's Generate was the only glowing control. Settings was a bare `IconButton` in the header,
  and Mark Rest Day / Change reason was a secondary `Button` in an `ActionGroup`.
- The package rule `.clr-glow:has(> :disabled) { filter: none; }` only reaches a direct child.
  It cannot see a Button that sits inside its own bleed wrapper.
- `skins.css` does not restate `--glow-spread` or `--glow-color`.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` exit 0. PRE-002: the `node -e` version
  probe needed approval and was not run. This task does not touch `src/design-system`.
- Issue comments were not read; the approved task body was the contract.

## Change

- `src/ui/action-glow.tsx` (new): `ActionGlow` wraps one control in
  `<span class="clr-glow clr-action-glow">`. The glow is the package's own rule; nothing is restated.
- `src/ui/action-glow.css` (new), with three app-owned rules and no shadow or token value:
  - `.clr-action-glow:has(> .clr-bleed > :disabled)` turns the glow off. A loading Button is
    disabled, so loading also loses it, as the primary's does.
  - The bleed fills a stretched wrapper.
  - The wrapper fills its `.clr-action-group` cell.
- `src/app/Home.tsx`: the Settings `IconButton` and the Mark Rest Day / Change reason trigger are
  wrapped in `ActionGlow`. Both stay their existing variants, labels, handlers and focus behaviour.
- `src/dev/gallery-registry.tsx`: an `ActionGlow` entry with resting, loading and disabled specimens.
  The gallery coverage test requires every `src/ui` export to be framed.
- `src/app/action-glow.test.tsx` (new, 7 cases): AC-016 to AC-018 on the real route tree in all four
  skins, plus source checks of the package and local rules.

## Decisions and assumptions (for review)

- **Scope of "applicable".** The glow goes on the two named controls and on Change reason, which is
  the same trigger once a day is marked. These were left alone:
  - the rest-day editor's Cancel, which sits beside the already-glowing primary Save;
  - Retry in error states;
  - text links and tabs;
  - controls on other screens.

  Widening the scope later only needs more `ActionGlow` wrappers.
- Disabled and loading controls drop the glow, matching the primary's shipped behaviour. The
  component's own disabled and busy styling is unchanged.

## Verification (worker, uncommitted tree)

| Command | Result |
| --- | --- |
| `npm test -- action-glow` | pass, 1 file / 7 tests |
| `npm run lint:ds` | pass |
| `npm test` | **fail**: 2 of 5788, both in `src/test/design-0143-final-audit.test.ts` (blocker below); 234 of 235 files pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors, 146 warnings. The new files have none. `Home.tsx` and `gallery-registry.tsx` already had react-refresh export warnings, and this change adds no exports to them. A per-file baseline comparison was not run. |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

There were two failures along the way:

- The first `action-glow` run failed one case: the halo check matched words in the stylesheet's
  comment. The test now strips comments before matching rules.
- The first full run also failed the gallery coverage test, because the new `src/ui` export was not
  framed. The gallery entry above fixed it.

## Verification stop: runtime-source-bound audit evidence

This is the same blocker earlier tasks in this body recorded. The audit hashes the runtime source
under `src/`, so any runtime change fails two checks:

- *proof labels › bound to the package and runtime source of this tree*
- *TASK-034 AFTER evidence (eight-cell mobile group)*

No record, hash or audit text was edited. jsdom proves structure and rules only. No browser or e2e
run was made, so the rendered glow in each skin is unproven visually.

Next safe action: the controller commits this tree and re-captures the format-preview evidence
against it. It then checks the Home glow rendered in each of the four skins.

## Controller review and verification recovery

Native initial27564 collected terminalexit1: worker succeeded; focused criterion/task each7passed,
full verification failed only the two source-bound audits. Original six-file candidateb13703b is
retained. Actual runa1d9e8c6-2aaa-404c-90c2-15f103a04841, a1/max2, basecdc6e641; no new attempt,
reset, Runner change or publication. Live issue524/comments0 was unchanged before claim.

Root independently confirmed declared vendor0.14.3 and byte identity against approved7f0a367,
and empty vendor/workflow/schema diffs against actual build base. Independent final product
review found no concrete blocker: unclipped shipped glow owner, correct deeper disabled/loading
off-selector, existing native labels/refs/handlers/focus and sizing chain preserved. Existing
Generate/Save remain primary; no extra blanket action-glow requirement is introduced.

Actual lint API comparison found Home warnings1→1 and gallery121→124, with three added specimen
helpers causing the warning increase. Root retained the exact same three specimens as inline
Render functions using the registry's existing pattern; no behavior/style/API or lint-rule change.
Afterward focused39980 passed22cases/3files (action-glow and gallery); typecheck29740 passed with
four-skin browser draft integrated. The original146-warning result remains recorded above.

New production Home browser cases cover four skins, normal390×844 then narrow320×568 within each,
computed filter/tokens equal to Generate, exactly one unclipped action owner, actual card/day/metric
non-glow, action/hit/scroll-owner/focus bounds, keyboard Settings/Back and rest Cancel/Escape, and
one declared held synthetic Save response before Change reason. All API traffic is intercepted,
no backend write/model request forwarded. Generic ActionGlow disabled/loading specimens remain
unit/gallery coverage; no Home state or custom browser UI is manufactured. Actual execution is
pending; no geometry is inferred from jsdom. TASK004 actual run/base binding now names a new
format-preview group for genuine capture; all earlier groups remain unchanged.

Lint after cleanup confirms Home1 and gallery121 warnings, both back to actual baseline; no errors.
Owned backend start2471/reset35676/status completed exit0, READY on API55431;29 SQL migrations
(30 files including README) byte-match actual source. Other stacks and hosted schema untouched.

First actual browser4964 on4017947 completed exit1:10 unchanged Home/PWA cases passed; all4 new
skin cases passed rendered glow/token/card/focus/navigation/narrow bounds through the held Save
response and disabled/busy checks, then failed immediate computed Save filter expectation. Actual
filter was one shipped6px glow. Vendor Button and both direct disabled CSS selectors, Save branch,
shell/focus styles are unchanged from build base; new ActionGlow off-rule cannot select Save.
Trace confirms actual disabled/busy/disabled bleed. The finally release explains saved-state
failure screenshots and is not evidence of premature success. Original log/trace/PNGs are retained.
Root will preserve the exact none assertion and await computed-state convergence with bounded
expect.poll before deciding whether this expectation is supported in the actual browser. No product,
vendor, loading-state or global-glow change is made. Only the four affected cases need rerun;
existing10 cases are already actual passes on the unchanged runtime.

## Controller actual browser and capture results

Computed-state rerun37741 on clean1d778c29641b8f8ae2a004a3df617e5c47130040 completed exit0:
all4 skin cases passed11.3s. The exact pending Save filter:none requirement remains and now passes
with bounded polling. Thus no vendor/baseline defect, requirement removal or product correction was
needed. Native disabled/busy, no premature success, acknowledgement/Change reason/focus, card
non-glow, all normal+narrow geometry/navigation and synthetic-only assertions also completed.
The earlier10 unchanged Home/PWA cases passed on4017947 with the identical product runtime; only
browser timing/notes changed afterward. Original failures remain retained.

Same clean1d778c2 then passed genuine capture48677,4skin cases/8images25.0s. Actual records name
source1d778c2, runtime960f168022f583ed74d09d273ca0617d71c8515215c9a71d067c289b5124cb3d,
driver47384a211c8dc64f0103b7ab7d8cdf84d19598b6eb0981ea67b597e1b7e5f36d,
payloadbf6bb644149fff3c4f4b45d6d83f3303e82f1f1cc2e48f1a6abd5a0ece79b441.
First capture clean, all network counters0. Genuine v1 provenance names actual Task004/run/a1/base/
retained branch; no capture fact rewritten. Owned stop74134 collected exit0; other stacks/hosted
schema untouched. Existing consumer and native same-attempt verification follow. No device,
paid/skipped/hosted or protected delivery success is inferred.

Existing audit consumer79792 collected exit0: all38 checks passed. Diff check passed, vendor/
workflow/schema/earlier tracked evidence groups remain unchanged. Native same-attempt verification next.
