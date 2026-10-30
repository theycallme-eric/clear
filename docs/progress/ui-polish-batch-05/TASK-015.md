# TASK-015 — Shared active movement hierarchy

Issue573 · REQ-014 · approved AC-054/055/069 · JOURNEY-013 completion owner. Run
`2f33f4e2-69fe-4187-b9b8-53f9324e1974`, attempt1, branch `agent-runner/task-015-a1-2f33f4e2`,
base `bbe10c51c965076c45a462a1d5c098f724db571d` (after TASK-014 #587). This task-owned record
satisfies the shared-journal requirement under the approved body's exception.

## Intent

Carry B05-04's selected movement hierarchy (heavy name row, then a lighter prescription row, then a
lighter equipment row) into the shared active `BlockPanel.Movement` role drawn by the standard
logger, superset logger and circuit row (closed and with its logger open). Keep counters, saved
results, Rest/Log/correction, the B05-06 countdown placement and the round clock in their own roles.
Add no Review Swap and no inline logging fields.

References opened before implementation: `sources/source-01-DECISIONS.md`,
`sources/source-02-GLOBAL-PATTERNS.md`, `sources/source-03-VISUAL-REFERENCE.md` (B05-04/B05-06),
image `sources/source-07-B05-04-review-grouping.jpg` (SHA256
`c1ddd3384b41d6b3a5d053633df2d779c1a2c3272e183d68ec933bfb1cb948ac`) and image
`sources/source-09-B05-06-movement-timer.jpg` (SHA256
`489dded0b4d90dd6789e23e352d5ec29cc96aa96a1abd6ee4be14d3f606f8aab`).

## Changes

- `src/ui/block-renderers-frame.tsx` — `BlockPanel.Movement` now draws one explicit name role
  (display face, `--heading-h3-size`/line height, bold, uppercase, `--ink`, wraps anywhere) whatever
  heading level the nesting gives it. Before this change, the name's size and colour followed
  `h3`–`h5` defaults, so it varied by consumer. The counter keeps its own non-shrinking column on the
  name row, so a long name wraps beside it rather than under or over it. The prescription is
  `--label-md` data face in `--text-paragraph`. The equipment is `--label-xs` data face in
  `--text-secondary`, capitalised (it was the uppercase card-label face). Tokens only. No vendor
  edit, and `Note`/`Label`/`Group` are unchanged.
- `src/ui/circuit-block.tsx` — the closed circuit row now passes the same `Equipment · …` context
  the open logger already shows, so the circuit consumer has the equipment tier.
- `e2e/ui-polish-b05-active-hierarchy.spec.ts` — new focused proof (below).

## Failures and corrections during the work

- The first name role used `--heading-h5-size` (Review's row size). The actual phone capture read
  prescription/name 0.533 and equipment/name 0.288, against the reference's 0.380/0.188. The name
  was not dominant enough, and the equipment step failed. Switching to `--heading-h3-size` (24px on
  phones) gave 0.355–0.401 and 0.206–0.215 across consumers.
- Spec-harness corrections, none of them in product code:
  - Block-label token probe: it resolved the token at `<body>` instead of the label's own scope.
  - Inline-field probe: it counted the existing coaching Notes box.
  - Capture clip: a 4px pad under the equipment tier pulled in the next frame's stroke.
  - Countdown selector: it did not match the region's markup.
  - Combined superset entry: the reps value equalled the prefill, so nothing ticked "Performed". The
    spec now enters a changed value and ticks Performed explicitly.
  - Narrow/short capture: at 320×568 and 390×480 the visible Workout scroller is only about
    105–170px tall (header, pinned rest/session areas, footer). A four-line long name plus its tiers
    cannot be captured whole there. The DOM tier assertions and a full-viewport screenshot still run
    at the real phone size. The pixel clip is taken in a 1600px-tall window of the same width, after
    asserting identical wrapping, as `ui-polish-b05-review-groups.spec.ts` does.

## Verification (exact results, this checkout, dirty base `bbe10c51…`)

- `npx playwright test e2e/ui-polish-b05-active-hierarchy.spec.ts --project=mobile` — **10 passed
  (14.5s)** on the final source. Matrix: reference calibration, plus 3 viewports (390×844, 320×568, 390×480) × 3
  consumers (standard, superset, circuit). Records carry reference file/hash/regions, capture PNG
  SHA-256, viewport, state, consumer, source HEAD/dirty/frame hash and criterion verdicts. Measured
  examples:
  - phone standard long name: 0.380 / 0.206
  - narrow superset long name: 0.401 / 0.214
  - short circuit closed long name: 0.355 / 0.215
  - reference mean: 0.380 / 0.188
  - Every comparison verdict passed: name dominant, two subordinate tiers, prescription over
    equipment, and both steps within ×1.5 of the reference.
- Behaviour exercised in the same spec, at every viewport:
  - Rest opens the sheet and starts rest without a write. Log set 1 inserts exactly one observation,
    and rest keeps running.
  - The saved row shows `8 reps`/`Saved`, and the counter advances to Set 2/2.
  - A refused save is held as "On this device only" and then saves on `online`.
  - Edit set 1 sends one `correct` (rev 1→2).
  - Countdown expiry writes nothing.
  - The countdown sits below the tiers and above Rest in the standard, superset and circuit cards.
  - Superset: one block Rest, and an explicit Log round inserts exactly two observations.
  - Circuit: opening the shared logger and minimising writes nothing, and the round clock stays the
    block's.
  - No Swap control and no inline logging field appears in any card. The screen `h1` and block label
    keep their token sizes.
  - Captures opened and reviewed: phone standard logged card, narrow superset card, narrow standard
    timed viewport.
- `npm run lint:ds` passed. `npm run typecheck` passed (after typing one helper array). `npm run lint`
  had 0 errors and 149 warnings, the pre-existing count. `npm run build` passed.
  `npm run gen:types -- --check` reported types current. `python3 scripts/gen-issues.py --check`
  reported 71 requirements / 136 edges.
- `npm test` **failed: 2 of 38 tests in `src/test/design-0143-final-audit.test.ts`**.
  1. "requires the complete actual eight-cell mobile group…": stale source/package/origin identity.
  2. "is bound to the package and runtime source…": the audit lacks the new runtime hash
     `38ace239…`.

  These assertions bind the 0.14.3 audit to the runtime source hash, so any `src` change makes them
  stale. Totals: 1 failed and 237 passed test files; 2 failed and 5871 passed tests. As recorded for TASK-013/014, the authenticated format recapture
  and audit refresh are root-owned after source freeze. They need a clean committed source and the
  local authenticated backend, and fall outside this task's write scope. They were not attempted here.
- Not run (not permitted in this worker boundary): the neighbouring
  `ui-polish-b05-movement-countdown.spec.ts` and `ui-polish-b05-rest-log.spec.ts`. The style change
  affects text tiers above their measured regions. Their countdown arrangement and sheet regions
  are not restyled, but they need a controller run.

## Unresolved and next action

- Root: freeze this source, run the authenticated format collector for a TASK-015 group, and update
  the 0.14.3 audit so `npm test` is green. Then run the neighbouring countdown and Rest/Log specs on
  the combined tree, followed by the full gates and CI.
- Physical-iPhone UAT for JOURNEY-013 is pending and has not been observed. Local Chromium emulation
  is not an installed-device result.
- Observation, not reassigned: on short phones the pinned rest/session areas leave a ~105–170px
  Workout scroller. This is the already tracked viewport finding, not a hierarchy change.


## Controller review and proof refresh

The initial native command ended `verification-failed` after a successful worker and real three-criterion report. Both independent native browser phases passed 10 cases (14.570 / 14.369 seconds). Full unit verification ran 54.087 seconds; the results cache confirms only the existing final-audit file failed, on its two stale source bindings. Original four changed paths plus 307 artifacts / 270 PNGs were preserved externally before checkpoint `bfab788`. No native state, attempt or result was reset.

Read-only component review found the shared runtime changes scoped to the existing movement role, with no new hook, effect, fetch or logging/timer state change. Actual selected B05-04 and a genuine candidate card image were opened. Final source uses the public heading-h3 token for the movement name; the accepted heading-h1 movement countdown remains unchanged.

The controller corrected capture methodology without changing product styling or removing any assertion: original phone and taller supplemental-window metadata are separate; the counter exclusion is measured in the actual tier PNG's scroll epoch; each actual phone-size tier is genuinely scrolled into view and captured. When a wrapped name itself exceeds the short scroller, measured DOM Range lines prove every non-space character is retained and each line is reachable. Phone probes retain actual viewport, scroller, scroll position, header/footer boundaries and hit-test readings. A same-width taller image is explicitly supplemental typography comparison only and cannot claim short-phone reachability. All original ten cases, reference comparisons, mutation/correction/refusal and zero-write behavior remain.

The unique Task15 format group and exact run/a1/base/revision lineage metadata are prepared; all previous evidence remains untouched. Combined-source browser verification, actual new authenticated captures, unchanged audit consumption and native same-attempt recovery are pending at this source freeze. No native acceptance, GitHub delivery or installed-iPhone outcome is claimed here.
