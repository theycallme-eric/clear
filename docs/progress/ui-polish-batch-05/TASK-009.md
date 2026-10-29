# TASK-009 — Content-hugging structure badges at the shared owner

Issue #567 · REQ-009 · AC-026 / AC-070 · JOURNEY-012 (completion owner).
Run `0b38aab8-cb02-4380-9ae1-6a65c8c85d69`, attempt 1, branch `agent-runner/task-009-a1-0b38aab8`,
base `f9ecf04744aef72603e8ac8dd7955f7f24e354c2` (TASK-008 merge).
This task-owned record replaces the shared daily journal under the approved body exception.

## Intended outcome and reference

B05-04 (`sources/source-07-B05-04-review-grouping.jpg`, SHA-256
`c1ddd3384b41d6b3a5d053633df2d779c1a2c3272e183d68ec933bfb1cb948ac`) was opened. Regions compared:

- **Left pane (current, defect):** the `CIRCUIT · 2 ROUNDS` inner frame hugs its label, but the
  emitted outline continues to the group's right edge.
- **Right pane (selected):** the outline ends with the label (compact structure-label framing).

Read DECISIONS, GLOBAL-PATTERNS ("Content-hugging structure badges — 04"), VISUAL-REFERENCE
B05-04, the DESIGN-SYSTEM-REFRESHER "Compact labels" row, and vendor `css/foundation.css:675–707`.
No owner conflict was found. This task's scope is the badge's frame and emission only. The B05-04
movement/prescription/Swap hierarchy and group rest belong to REQ-009's other criteria, which are
not assigned to this task, so they were not changed.

## Cause

`.clr-bleed` is `inline-flex`, and its `::before` (the emission) is `inset: 0`, so the outline is
exactly as wide as the wrapper. In a flex-column parent (Review's group and stack, format preview's
`clr-stack`), `align-items: normal` stretches the auto-width wrapper across the line. Measured
before the fix at 390 px: wrapper/emission 310 px around a 196 px frame (`SUPERSET · 4 ROUNDS`).

There was a second, older defect in row parents that the new collision check found. The vendor
sets `:where(.clr-scroll-region__scroller *) { min-width: 0 }`, so in BlockPanel's top row a long
badge took the shrink in proportion to its width and squeezed the section label under itself
(`CONDITIONIN…`, `Accessory` overflowed). A capture with the fix reverted showed the same thing,
so this predates the task. It is still inside JOURNEY-012's recovery condition ("row/column parent
layouts remain contained"), so it was fixed at the same owner.

## Change (owner only: `src/ui/workout-chrome.tsx` `STRUCTURE_BLEED_STYLE`)

- `width: fit-content` — not an auto size, so column/grid stretch no longer applies. Row
  cross-axis alignment is untouched.
- `max-width: 100%` — a label longer than its parent wraps inside the parent.
- `min-width: min-content` — never narrower than its longest word, so text stays in its frame.
- `flex-shrink: 1000` — in a row, the badge gives up width first and wraps its own label. The
  label beside it keeps its words.

Vendor CSS, TimerFrame, the public timer composition (TASK-014), and every consumer's markup are
unchanged. Cards, fields and action frames are untouched. The spec asserts they still fill their
containers.

## Verification

Spec `e2e/ui-polish-b05-structure-badges.spec.ts` (new). It renders the production routes on a
synthetic local Vite origin with intercepted reads. No writes, no edge-function or model calls,
no account. It checks **every** StructureBadge on each route.

| Consumer (entry) | Parent | Cases | Labels incl. long |
| --- | --- | --- | --- |
| Review grouped superset/circuit + badged standard (ENTRY-BADGE-01) | column | 390/320 × CLEAR/Vapour, 8 badges each | `CIRCUIT · 2 ROUNDS`, `… · LADDER · FIXED INTERVAL` (2 lines) |
| Workout SectionHeader, BlockPanel, AmrapBlock (ENTRY-BADGE-02) | row | 390/320, both sections, 8 badges each | up to 3 lines at 320 |
| Session detail StructureResultBadge (ENTRY-BADGE-03) | wrapping row | 390/320, 4 badges each | `CIRCUIT · 3 ROUNDS · PYRAMID` |
| Settings format preview ladders + other badges (ENTRY-BADGE-04) | column | 390/320, 9 badges each | `EMOM · 15 MIN · LADDER DOWN` |

Per badge, the spec asserts:

- the wrapper, the `::before` emission and the frame are one box (±1 px);
- a one-line frame equals the label's max-content width and its glyph+label+padding run;
- a wrapped frame is narrower than max-content and contained in its parent;
- no text overflow and no squeezed or overlapping sibling on its line;
- **actual pixels** in each CSS-scale capture: structure-stroke columns along the frame's top edge
  are >80 % (observed 100 %), and in the unused span to its right they are **0**;
- the enclosing card fills its host, and every rendered `.clr-actions` child fills its row.

The record JSON for each case binds the reference file/hash/regions, the source head plus dirty
flag, route, skin, viewport, and the PNG SHA-256 for each badge.

**Negative control** (owner style reverted, same spec): 7 of 10 failed for the real reasons. In
Review the unused span had stroke in 105/105 columns at 390 and 35/35 at 320. Format preview had
53/53 columns. The BlockPanel collision was flagged (`Accessory … squeezed:true`). Session detail
passed both ways, because its wrapping row never stretched the badge.

Captures viewed alongside B05-04:

- Review `CIRCUIT · 2 ROUNDS`: the outline ends at the label and the 123 px beside it is dark,
  matching the right pane.
- Workout conditioning at 390: `CONDITIONING` whole beside a wrapped badge.
- Session detail at 320: a contained wrapped badge.

Known limit: once a label wraps, CSS sizes the box to the width available, not to its widest
line. A ragged last line therefore leaves some slack *inside* the frame (seen in BlockPanel at
320). The outline never runs past the frame into unused parent width.

| Command | Result |
| --- | --- |
| `npx playwright test e2e/ui-polish-b05-structure-badges.spec.ts --project=mobile` | **10 passed** (8.2 s) |
| `npm run typecheck` | exit 0 |
| `npm run lint:ds` | exit 0 |
| `npm run lint` | exit 0; 0 errors, 143 baseline warnings |
| `npm run build` | exit 0; existing chunk-size advisory |
| `npm run gen:types -- --check` | exit 0; current |
| `python3 scripts/gen-issues.py --check` | exit 0 (71 requirements, 136 edges) |
| `npm test` | **exit 1: 2 failed / 5,829 passed** — both in `src/test/design-0143-final-audit.test.ts` |

The new unit assertion in `src/ui/workout-chrome.test.tsx` (wrapper sizing contract) passes in
that suite.

Corrections made to the spec along the way:

- the computed `color(srgb …)` stroke is now resolved through a canvas;
- a "frame = content run" assumption was replaced by max-content for wrapped labels;
- zero-size hidden action children are skipped;
- two arbitrary unused-width thresholds were narrowed to the B05-04 reference label;
- a sibling-collision check was added after the BlockPanel finding.

## Unresolved — source-bound 0.14.3 audit (blocks `npm test`)

This is the same failure TASK-002/003/005/008 hit. A runtime `src/` change stales the audit's
runtime-source hash and the TASK-034 format-preview evidence group. Clearing it needs the existing
authenticated collector `e2e/design-0143/format-preview.spec.ts` on an owned disposable backend.
This workspace has no `.env` backend configuration and no Supabase CLI. The collector also creates
an auth user, which is outside this task's synthetic no-write boundary. Writing a new hash without
a genuine recapture would certify evidence that does not exist, so it was not done.

The worker's local commit needed a permission that was not granted, so the four task files are
left uncommitted in the workspace. Next safe action: freeze this source as a commit. The controller then runs the existing collector
recovery as before: a new group `task034-format-preview-batch05-task009`, the
`format-preview-evidence.ts` pointer, lineage TASK-009 / run `0b38aab8-…` / attempt 1 / tested base
`f9ecf04`, and the audit hash. Then rerun `npm test`. `origin/main` was not fetched (the local ref is
behind HEAD), so integration remains with the controller.

This is Chromium phone emulation. Physical-iPhone UAT remains pending.
