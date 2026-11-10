# TASK-004 — Accepted Overview facts, equipment and summary frames (#631)

Body `clear-refinement-v2-20261109b`, attempt 1, base `1a696ba` (after TASK-039 #679, TASK-001 #680,
TASK-002 #681 and TASK-003 #682). Task-owned progress note: the approved exception to the shared
daily journal for this body. Only TASK-004 writes this file.

## Intended outcome

REQ-004 (C12, C13, C14, C15; AC-R004-01/02/03; G04; R12, R20, R26, R27, R32, R33, R34, R74, R107,
R131; V12) delivered through the shared owners SummaryFacts / EquipmentSummary / summary metrics on
the real `/review`, `/history/:id` and `/summary` routes (JOURNEY-004, completion owner): the
Overview's useful facts wrap with their glyphs and no carousel, intensity reads its value without
`of 10`, Required equipment is one deliberate group of uppercase names (`None — bodyweight only`
only for an all-bodyweight workout), saved detail shares the fact composition with its recorded
values, and Summary's Duration and Streak frames fill their equal-height cells. Accepted gallery
reference `eded158cfd928d382c9a9409e2c372270312741d`, stable state `/gallery/refinements?state=overview`.

What "accepted" means here: R74 accepts the shown Overview ("perfect"), which is the reviewed R7
implementation (`reviewed-versus-main.diff`: SummaryFacts without OverflowRail, `flex-wrap: wrap`,
intensity `String(value)`, a `Log` glyph on Movements, `EquipmentSummary` with a top rule, a
`Dumbbell` label glyph, uppercase bordered names and `None — bodyweight only`, and the metric-grid
card fill). It was integrated onto current main through the existing owners, not merged wholesale.

## Shared owner dispositions

- `SummaryFacts` / `SummaryFact` (`src/ui/composition.tsx`, CSS in `src/styles/shell.css`) —
  **changed in place.** No `OverflowRail`, no focusable track: a plain `dl.clr-summary-facts` named by
  its own `aria-label`. `.clr-summary-facts` wraps (`flex-wrap: wrap`, `width: auto`); each reading
  stays whole (`flex: none`, `max-width: 100%`, term `nowrap`); only a reading wider than the row
  wraps inside itself. The `.clr-summary-facts-rail` focus rule is removed (nothing uses it).
- `OverviewFacts` (new, `src/ui/refinements/overview.tsx`) — **created**: the one fact composition
  Review's Overview and the saved Overview both draw (C14). Per kind of reading (`FactKind`, declared
  by the data owner in `state/review.ts`): glyph (duration Clock, focus Target, intensity Gauge, goal
  Crosshair, movements Log, date Calendar, status none), order (duration, focus, intensity, goal,
  movements, then the record's date, status) and term visibility (duration, focus, date are
  self-describing; their term stays for assistive technology). Values and terms are each view's own.
- `EquipmentSummary` (new, same file; CSS in `src/ui/refinements/presentation.css`) — **created** from
  the R7 owner: rule above, label with the one shipped `Dumbbell` glyph in the facts' data-label face,
  names as uppercase bordered elements that wrap, `None — bodyweight only` only for an empty list.
  Deliberate deviation from R7: label and empty state are `span`s, not `p`s, because REQ-010 (no
  paragraph in the Overview; `Review.test.tsx` and the backend-lane `core-loop.spec.ts` count `p`)
  stays binding.
- summary metrics — `SummaryMetric` (new, same file) is Summary's former private `Stat` moved
  unchanged in markup and inline token styles; `MetricGrid` / `MetricFrame` unchanged. The C15 fix is
  in the shared grid layer: `.clr-metric-grid > .clr-bleed--block { display: grid }` (shell.css) and
  its echoed-cell pass-through `.clr-metric-grid > .clr-echo > .clr-bleed--block` (foreground-echo.css).
  The cell's bleed lays its one card out as a stretched grid item, so the card fills the cell.
  Deliberate deviation from R7 and the gallery recipe (which restyled `.clr-card`): VIBE-D's guard
  `design-system-097-deprecations.test.ts` forbids any `.clr-card` selector in app CSS, and app CSS
  already lays out `.clr-bleed` wrappers elsewhere. No card is restyled; content keeps its wrapping.
- `src/dev/gallery-refinement-scenes.tsx` — **created (adopted by name), deliberate consolidation.**
  Holds the reference's `GalleryOverviewSummary` scene, but draws the route consumers instead of the
  reference's hand-built card/paragraph: `ReviewOverview` (exported from `Review.tsx`) over
  `reviewBriefing`, `SessionOverview` (exported from `SessionDetail.tsx`) over `sessionDetail`, and
  `DurationMetric` / `StreakMetric` (exported from `Summary.tsx`) in a `MetricGrid`. Planned/Saved and
  Loaded/Bodyweight-only choices as in the reference. Not composed here: the reference's result card
  (`Upper-body strength, done.` + Save as favorite) — `FavoriteToggle` needs its favorites
  query/writer and it is no REQ-004 criterion. The file's other reference scenes belong to other tasks.
- `src/ui/refinements/tokens.css` — **read; no new variable.** REQ-004's coverage entry lists no
  semantic variables; everything uses existing Foundation tokens.
- `src/ui/refinements/presentation.css` — EquipmentSummary recipe appended (tokens only).
- REUSE.md — followed: shared owner, no route-local look-alike, gallery state names the consumers.
- LOGGING-FIELDS.md — no field, reason or write added. "Workout feedback" (Summary FeelingRow +
  Notes) is untouched; only the Duration/Streak readouts' presentation owner moved.
- TASK-001/002/003 owners (`movement.tsx`, `workout-card.tsx`, `movement-readings.ts`) — not in
  REQ-004's scope; unchanged.

## Changes

- `src/state/review.ts`: `FactKind`; `ReviewFact.kind`; `briefingIntensity()` returns the value alone
  (C12, R32 — Overview only; effort scores elsewhere keep `N of 10`); `requiredEquipment(slugs)` (the
  existing bodyweight/none exclusion, first-needed order, de-duplicated by name) used by
  `reviewBriefing`.
- `src/state/session-detail.ts`: `SessionDetailView.equipment` = `requiredEquipment` over every
  returned row's recorded `equipment_used` (the same value Review reads, as persisted). A swapped-out
  row is only returned when work was logged against it, so it counts.
- `src/app/Review.tsx`: `BriefingOverview` → exported `ReviewOverview` over `OverviewFacts` +
  `EquipmentSummary`; local glyph map, order, styles and `RequiredEquipment` removed;
  `EQUIPMENT_LABEL` / `NO_EQUIPMENT_LABEL` re-exported from the owner (same strings).
- `src/app/SessionDetail.tsx`: exported `SessionOverview`: `OverviewFacts` (recorded day, focus,
  state, measured-or-composed duration, recorded effective intensity via `briefingIntensity`) and
  `EquipmentSummary`, then provenance, Mood, Notes as before. The framed `MetricGrid` readouts and
  `N/10` are gone from this card.
- `src/app/Summary.tsx`: `DurationMetric` / `StreakMetric` over `SummaryMetric`; StreakStat's
  loading/error/empty cards unchanged.
- Gallery: `?state=overview` in `src/dev/gallery-refinements.tsx`; register entries
  `OverviewFacts`, `EquipmentSummary`, `SummaryMetric`; `SummaryFacts` entry summary and specimen
  intensity (`7`, `10`) updated; `MetricGrid` summary notes the fill. `COMPONENTS.md` regenerated
  (64 entries). `PROJECT_MAP.md` refinements row names `overview.tsx` and the scenes file.
- Shared synthetic data `src/dev/gallery-refinement-overview-data.ts` (gallery, check-01, check-02):
  loaded / bodyweight / widest compositions and a completed `session_as_performed` builder.
- Evidence: `evidence/refinement/task-004/required-cases.json` (check-01: 10 vitest cases; check-02:
  5 Playwright mobile cases); receipts written by the guard.

## Decisions recorded (derived from approved sources, not new product decisions)

- Movements glyph `Log` and the equipment label glyph `Dumbbell`: the R7 Overview that R74 accepted;
  R33/R34's pending selection is resolved by R74. No per-equipment glyphs (R27, R122).
- Date gets the public `Calendar` glyph (clear semantic fit, term kept for AT, per R33's method);
  Status gets none (no single glyph is true of completed, abandoned and never started).
- Saved Overview order follows the shared composition: the readings shared with the plan in the
  plan's order, then the record's date and status (Review's existing "unknown after known" rule).
- Saved equipment group: G04 ("share with saved detail using each view's actual values"), R20, R34
  and the accepted gallery's Saved context all show it; values are the record's own `equipment_used`.
- Intensity scale: values are never rescaled; Start persists the same `effective_intensity`.
- Facts gap stays `--spacing-300` (R7, accepted) rather than the gallery-only `.clr-accepted-facts`
  `300/400` recipe.

## Tests added and changed

- New `src/ui/summary-facts.test.tsx` (check-01, 10 cases over the real router for `/review`,
  `/history/:id`, `/summary` and the gallery state; stylesheets applied, cascade read).
- New `e2e/refinement/task-004.spec.ts` (check-02, 5 cases, contained synthetic lane at 320/390,
  reduced motion, axe on every visit; attaches `review-overview-*`, `saved-overview-*`,
  `summary-metrics-*`, bodyweight, streak-failure and gallery captures of the delivered revision,
  comparable to V12 and the accepted `overview` state). Geometry: facts rows >= 2 inside the card,
  every reading whole and visible, no scroller/tab stop; rule above the equipment group spanning the
  card; Duration/Streak card and chamfered body bottoms equal to their cell's and each other's.
- Updated, each citing its criterion in a comment:
  - `src/app/Review.test.tsx` — intensity `7 of 10` → `7` (AC-C12-01, AC-R004-01, R32).
  - `src/state/review.test.ts` — `briefingIntensity` / intensity fact `N of 10` → `N`, scale and
    effective-vs-requested kept (AC-C12-01, AC-R004-01).
  - `src/app/SessionDetail.test.tsx` — framed MetricGrid readouts in Date/Focus/Status/Duration/
    Intensity order → the shared compact composition, shared order, `6` not `6/10` (AC-C14-01, R20,
    AC-R004-03).
  - `e2e/core-loop.spec.ts` (backend lane, not run here; loads under `--list`) — displayed intensity
    `3 of 10` → `3` (AC-C12-01, AC-R004-01). Its REQ-010 paragraph count still holds (spans).
  - `e2e/support/task035-release-case.ts` — the walk's display observation `3 of 10` → `3` (same
    criteria; still the effective 3, not the requested 9) and its unit test
    `src/test/generation-reliability/task035-release-case.test.ts` (fixture `3`; `9` and the old
    `3 of 10` are now rejected).

## Sweep (every spec and test under `e2e/` and `src/`)

Searched `e2e/**/*.ts` and `src/**/*.test.*` for `of 10`, `/10`, `Workout facts`, `summary-fact(s)`,
`summary-facts-rail`, `OverflowRail`/`clr-rail`, `Required equipment`, `bodyweight only`,
`EQUIPMENT_LABEL`, `MOVEMENTS_LABEL`, `metric-grid`/`metric-frame`/`MetricGrid`, `data-metric-value`,
`Streak`, `Through yesterday`, `Overview`, `dl`/`dt`/`dd` reads, and `p` counts in the Overview.

- Fixed: the six files listed above.
- Left as is, deliberately (not superseded): `src/test/generation-reliability/task035-release-binding.test.ts`
  and `scripts/generation-reliability/release-gate.mjs` validate the retained TASK-035 observation
  recorded at runtime `b54287a`, which truthfully says `3 of 10`; rewriting that historical check
  would make the retained proof fail. A future re-binding at a new runtime would need its own task.
- Checked, still valid: `e2e/history-detail.spec.ts` (one Overview card, `Never started` in it, no
  `dl .clr-chamfer`, no nested `.clr-card`), `e2e/design-0143/collections-settings.spec.ts`
  (>= 4 `definition`s), `e2e/design-0143/workout-lifecycle.spec.ts` (Summary: Duration/Streak own
  small cards), `e2e/design-0143/accessibility.spec.ts` (contained routes, U05 margins — every new
  element has zero margin, `/history rows` `/10` is the History list, not the Overview),
  `e2e/ui-polish-home.spec.ts` (`Intensity N/10` is Home's recent row, unrelated per R32),
  `e2e/ui-polish-b05-scroll-boundaries.spec.ts` (TabBar/ladder rails only),
  `src/app/review-screen.test.tsx` (REQ-008 row, AC-019 equipment list and empty state — pass),
  `src/app/Summary.test.tsx` (own small cards, `data-metric-value` inline styles — pass),
  `src/ui/composition.test.tsx`, `src/app/History.test.tsx`, `src/app/Home.test.tsx`,
  `src/state/session-detail.test.ts` (effort `N of 10` is block effort, unrelated).
- Left as is, local-only B05 (cannot load here; it reads an absent `.evidence` reference image at
  module load, so `playwright test --list` fails on it at base and with this candidate):
  `e2e/ui-polish-b05-summary-facts.spec.ts`. Its rail/keyboard-scroll cases, `7 of 10`-era readings
  and "Session detail keeps its record readouts" case are superseded by C12/C14/R26/R20.
  Follow-up where the `.evidence` references exist.

## Failures and corrections

- First C15 rule targeted `.clr-card`; `design-system-097-deprecations.test.ts` ("never restyles the
  card from app CSS") failed. Replaced by the bleed-as-grid rule; the card is not restyled.
- `EquipmentSummary` first used R7's `<p>` label/empty state; `Review.test.tsx` REQ-010 ("no
  paragraph above/in the Overview") failed. Changed to `span`s.
- My focused test contained the token `overflow-x`, which `design-system-0.9.7.test.tsx` scans for
  in `src/` (no app-side horizontal workaround). The check now reads `overflow` only; the browser
  spec measures the computed horizontal overflow.
- In the route the metric cells are `.clr-echo` wrappers (effects on); the focused check reads both
  cell shapes.
- The streak error card's Retry button is itself chamfered; the browser "no nested frame" count now
  excludes control frames (`.clr-btn`).
- Negative control: with the fill rule disabled, check-02's `Summary @phone-390: Duration card fills
  its cell` failed (R107 reproduced); restored.

## Verification (this worktree, uncommitted candidate, 2026-11-09)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-004 --check check-01 -- npx vitest run src/ui/summary-facts.test.tsx --passWithNoTests=false`:
  PASSED, exit 0; 10 total, 10 executed, 10 passed, 0 failed/skipped/todo.
- `node scripts/refinement/run-required-check.mjs --task TASK-004 --check check-02 -- npx playwright test e2e/refinement/task-004.spec.ts --project=mobile`:
  PASSED, exit 0; 5 total, 5 executed, 5 passed, 0 failed/skipped/todo (synthetic origin; no
  credentials; no write attempted).
- `npm run build`: exit 0. `npm run lint:ds`: exit 0. `npm run lint`: exit 0.
  `node scripts/gallery-index.mjs --check`: 64 verified.
- `npm test`: 254 files, 6113 tests passed, 0 failed.
- `npx playwright test e2e/refinement/task-001.spec.ts e2e/refinement/task-002.spec.ts e2e/refinement/task-003.spec.ts --project=mobile`
  (direct, not through the guard): 21/21 passed.
- `npx playwright test e2e/core-loop.spec.ts e2e/refinement/task-004.spec.ts --list --project=mobile`: 6 tests in 2 files.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004`:
  PASSED, exit 0; all four "current passing receipts".
- Earlier-task receipts: none refreshed and none needed. No TASK-001/002/003/039 check target,
  manifest or receipt was edited (`git diff --quiet` on all of them, and on
  `src/test/design-0143-final-audit.test.ts`).
- Visual check of the captures: Review at 320 wraps the five facts onto four rows with glyphs and
  `INTENSITY 7`, the rule, `REQUIRED EQUIPMENT` and three bordered uppercase names; saved at 390
  `42 MIN · UPPER BODY · INTENSITY 6` / `SUN 8 NOV 2026 · STATUS COMPLETED`; Summary Duration and
  Streak frames end at one bottom edge with `Through yesterday` only in Streak.

## Open assumptions / unresolved

- Equipment icon creation/adoption (R122 wanted list) remains separate asset work.
- The TASK-035 retained-proof validator keeps `3 of 10` for its historical runtime (see Sweep).
- `e2e/ui-polish-b05-summary-facts.spec.ts` is superseded and unloadable here (see Sweep).
- `src/app/review-screen.test.tsx`'s comment still names that B05 spec as the browser half of
  REQ-008; the browser half of C12 is now `e2e/refinement/task-004.spec.ts`. Comment not edited.
- `docs/design/library/README.md` still states an older register count (pre-existing).

## Next action

Controller verification and commit. The trusted backend lane should run `e2e/core-loop.spec.ts`
(Review intensity now `3`) and the session-detail / summary specs listed under Sweep.
