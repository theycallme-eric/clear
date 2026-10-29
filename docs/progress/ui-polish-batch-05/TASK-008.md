# TASK-008 — Review compact summary with icon fact row

Issue #566 · REQ-008 · completion owner for JOURNEY-006.
Attempt 1: branch `agent-runner/task-008-a1-61a099b3`, base `40ffb2f` (TASK-004 merged).
Attempt 2: branch `agent-runner/task-008-a2-61a099b3`, base `b933e92` (TASK-005 merged). Attempt
1's tree was carried over file by file (`git show <a1>:<path>`). Product code is unchanged since
then; the only change is to the focused spec (see "Attempt 2" below).
This is the task's own progress record. For this body it replaces the shared daily journal, under
the owner-selected task-owned exception.

## Intended outcome

B05-03: replace Review's tall, loosely spaced metric-grid overview with the compact hierarchy.

- The workout title, then one aligned row of facts.
- Each fact keeps its real system glyph (03.1 rejects the preview's text-only row).
- Real values only.
- No "Bodyweight movements included" sentence.
- The page title and required equipment stay near the top.
- Other MetricGrid/MetricFrame consumers are classified rather than blanket-restyled.

## Sources read

- DECISIONS, GLOBAL-PATTERNS (row "Compact summary facts — 03"), VISUAL-REFERENCE (§B05-03),
  CODE-REFERENCES (row "Review hierarchy and compact summary"), preview excerpts (only the
  `scene.jsx — Overview` and `scene-v2.jsx — Overview` anchors plus the `.v2 .workout-facts`
  selector), the task-owned progress template and RUN-CONTEXT.
- I opened and viewed `sources/source-06-B05-03-review-summary.jpg`.
  - SHA-256 (computed by the spec from the evidence snapshot):
    `7ade92cac74f9dd915dd451817b66e43856b87eaf4023edd8642339afbf76779`.
- Regions compared:
  - **Left pane:** the current product's tall OVERVIEW grid (Intensity / Anchor / Goal / Duration /
    Movements, each label over a large value, with wide gaps). This is what is being replaced.
  - **Right pane, YOUR WORKOUT card (03.1):** the title over one line, "45 MIN POWER INTENSITY 7".
    Marker 1 says to keep the icons, in a row.
  - **Right pane, EQUIPMENT card:** "Kettlebell · Mat". The struck-through sentence is "Bodyweight
    movements included".
- The struck sentence exists only in the preview demo (`scene.jsx` Overview `<Hint>`). The product
  never rendered it, so the requirement is that it stays absent. That is now asserted in unit and
  browser tests.

## Changes

- `src/ui/composition.tsx`: new explicit compact workout-facts composition, `SummaryFacts` (a
  `dl`, class `clr-summary-facts`) and `SummaryFact`.
  - Each `SummaryFact` has an optional `aria-hidden` glyph, a `dt` (visible, or `a11y-hidden`) and a
    `dd`.
  - It is a sibling of `MetricGrid`/`MetricFrame` in the same module. No Review-only selector is
    added to the shared primitives.
- `src/styles/shell.css`: `.clr-summary-facts` / `.clr-summary-fact` are tokens only.
  - Layout: flex row, wrap, `align-items: center`.
  - Type: `--font-data`, `--label-xs-size`/`--label-xs-line-height`, `--tracking-data`, uppercase,
    `--text-secondary`.
  - Glyph colour: `--text-card-label`.
  - Gaps: `--spacing-200` between lines, `--spacing-300` between readings, `--spacing-100` inside a
    reading.
  - The metric-grid comment no longer claims Review.
- `src/app/Review.tsx`: `BriefingOverview` now renders `SummaryFacts` in place of `MetricGrid`.
  - Order: B05-03's Duration · Anchor · Intensity first, then Goal and Movements.
  - Duration and Anchor hide their term visually, since their glyph and value say what they are.
  - Intensity, Goal and Movements keep a visible term ("INTENSITY 7 OF 10", "GOAL BALANCED",
    "MOVEMENTS 4").
  - Glyphs are the existing system ones: Clock, Target, Gauge, Crosshair. Movements had no glyph
    before and none was invented.
  - Required equipment, the adjustment note, the h1 and everything else are unchanged.
- `src/dev/gallery-registry.tsx`: `SummaryFacts`/`SummaryFact` gallery entries (pictured and widest
  real-shaped specimens). The gallery coverage test requires this.
- Tests:
  - `src/app/review-screen.test.tsx`: new REQ-008 block, 3 cases.
  - `src/app/Review.test.tsx`: the overview test that encoded the replaced `.clr-metric-frame`
    composition now asserts the compact row. Same intent: one card, no inner frame, five facts.
  - `e2e/ui-polish-b05-summary-facts.spec.ts`: new.
- No vendor edits, no new tokens, hex or px values, and no data, eligibility or equipment-logic
  changes.

## Consumer classification (AC-025)

| Consumer | Object | Classification | Proof |
| --- | --- | --- | --- |
| Review overview | Pre-start workout facts | **Equivalent workout-facts object → `SummaryFacts`** | Browser: 3 states × 2 widths × 2 skins |
| Completed Summary | Duration + streak result cards (`Stat` = Card + `MetricFrame` in a `MetricGrid`) | **Distinct completed results → retained** | Browser: `.clr-metric-grid` with 2 frames, no `.clr-summary-facts`, inside viewport at 390/320 |
| Session detail | Date / Focus / Status / Duration / Intensity record with provenance (`MetricGrid as dl`) | **Distinct detailed record → retained** | Browser: 5 `.clr-metric-frame` cells, terms in order, no `.clr-summary-facts`, at 390/320 |
| Conditioning score, AMRAP readout | Score / readout | **Distinct score/readout → `MetricFrame` retained** | Source-level check in the spec (they live inside an active workout) |

Why Session detail is classed as distinct:

- It records a performed session: date, outcome status, measured duration and provenance.
- It is not the pre-start briefing B05-03 annotated.
- Restyling it would be the blanket one-row restyle the criterion excludes.

Observation: its `dl` shares the aria-label "Workout facts" with Review's. If the owner wants
Session detail to adopt the compact row too, that is a follow-up decision, not something this task
does silently.

## Unresolved finding: field-set and overflow conflict (surfaced, not resolved by removal)

The B05-03 pictured row carries three demo facts: 45 MIN · POWER · INTENSITY 7. The accepted Review
data carries five real facts: duration, anchor/focus, intensity, goal and movement count. Dropping
goal and movement count would be inventing a removal, so all five are kept.

| Viewport · state | Row result |
| --- | --- |
| 390 × 844, pictured-shape values | The pictured three facts share line 1, as in 03.1. Goal and Movements continue on line 2 from the same left edge. Row height is about 36 CSS px, against the old grid's three tall label/value rows. |
| 390 × 844, widest real values (120 MIN, FULL BODY, INTENSITY 10 OF 10, GOAL ACTIVE RECOVERY) | 3 lines |
| 320 × 568 | Up to 4 short lines |

In every case:

- each reading is whole and on one line;
- readings on a line share a centre;
- continuation lines start at the row edge;
- nothing is clipped, truncated, hidden or dropped.

A literal single line for all five facts cannot fit a phone card width without dropping facts or
shrinking type below the system's label scale. **Owner decision needed only if a strict one-line
row is required:** choose which real fact moves or goes. Movement count, for example, already
appears per section. No owner question is assumed answered here.

## Interpretation: page title

"Keep the Review page title … near the top" is implemented as **keeping the existing h1**:

- The workout's own title remains the page title, in the fixed header.
- The compact fact row is the first content directly under it.

The preview pane shows a separate "REVIEW" header with the workout title inside a "Your workout"
card. Moving the h1 to "Review" would change the page title rather than keep it. It would also
alter the route's heading contract that about 50 Review assertions and five other tasks' browser
proofs depend on (e.g. regenerate detection by h1 name). In the left pane the title→facts hierarchy
is title, then the facts directly beneath it. If the owner wants the literal "REVIEW" header plus an
in-card title, that is a separate, broader heading change.

## Browser verification

`npx playwright test e2e/ui-polish-b05-summary-facts.spec.ts --project=mobile`: **11 passed (9.8 s)**,
final tree.

Setup and scope:

- Mobile project, Chromium emulation.
- Synthetic Vite origin with `.invalid` Supabase placeholders. Every Auth/REST/function request is
  intercepted. Non-GET requests are aborted and counted (0). No function or model calls (0
  generation attempts asserted).
- Review state comes from the ordinary router history handoff (`reviewHandoff`).
- Source identity is head `40ffb2f749bb6930f21a8befa794a7b2c97913b6` plus this task's uncommitted
  diff (`dirty: true` in each record).

Assertions in each Review case:

- The real facts and values, computed from `reviewBriefing` for that acceptance.
- Glyph present (≥ 12 px) and centred on its value (≤ 1.5 px) for the four composed facts.
- Visible versus hidden terms.
- No clipping: `scrollWidth` ≤ `clientWidth`, each reading inside the row and the card's inner box,
  each value on one line.
- Line alignment: shared centre within 0.75 px; continuation lines start at the left edge.
- Order: the reference three lead. At 390 pictured they share line 1 and the row has exactly 2
  lines.
- Never one reading per line.
- No metric frames; row height ≤ its line boxes.
- The h1 sits above the card.
- Equipment follows the row, lies within the first screen and comes before the first section.
- The equipment list equals the real equipment, with no "bodyweight" item.
- No "Bodyweight movements included".

Each Review case ran in both Clear and Vapour skins.

| Case (consumer · state · viewport · skin) | Result | Captures (card / first screen, SHA-256 prefix) and review against B05-03 |
| --- | --- | --- |
| Review · pictured · 390 · clear | pass | `6191d8a16e6c` / `65a852c84a64`. Matches 03.1: glyph + 45 MIN, POWER, INTENSITY 7 OF 10 in one aligned line under the title. Goal and Movements on line 2. Required equipment "Kettlebell Mat" directly after. Far shorter than the left-pane grid. |
| Review · pictured · 390 · vapour | pass | `5aaad69dd5e3` / `837a3e62a1e6`. Same hierarchy, with the Vapour palette. |
| Review · pictured · 320 · clear | pass | `8736730d4692` / `8955f06c5e59`. Wraps to 4 lines, all whole and aligned (see finding). |
| Review · widest · 390 · clear | pass | `3599c5f1a9a0` / `473ede16a27d`. 3 lines, nothing clipped. |
| Review · widest · 320 · vapour | pass | `ae8a3dd4fedc` / `8b9018a699f2`. Viewed: 120 MIN · FULL BODY / INTENSITY 10 OF 10 / GOAL ACTIVE RECOVERY / MOVEMENTS 4. All whole. |
| Review · bodyweight (no goal) · 390 · clear | pass | `2de45cf18466` / `02ab02dac40c`. Viewed: "GOAL NOT SET" and "None — bodyweight only". No struck sentence. |
| Remaining Review skin/width cells (6) | pass | Recorded in their JSON attachments. |
| Completed Summary results · 390 / 320 | pass | 390: `8a0515cae00b`. Retained MetricGrid. |
| Session detail record · 390 / 320 | pass | 390: `46bf4de3a4ed`. Viewed: the labelled 2-column record grid, unchanged. |
| Score/readout source classification | pass | Source-level check only, not a render. |

Full hashes, geometry and the reference identity/regions are in each case's JSON attachment under
`test-results/`. Later reruns overwrite `test-results/`, so the controller's own run is the
authoritative capture identity.

Physical-iPhone UAT remains **pending** until observed. This proof is Chromium emulation only.

## Command results (worker tree, `40ffb2f` + uncommitted diff)

- `npx playwright test e2e/ui-polish-b05-summary-facts.spec.ts --project=mobile`: 11 passed.
- `npx vitest run src/app/review-screen.test.tsx`: 25 passed.
- `npm test`: **2 failed**, all others passed. Both failures are in
  `src/test/design-0143-final-audit.test.ts` (see the blocker below).
- `npm run lint:ds`: exit 0.
- `npm run build`: exit 0 (existing chunk-size warning only).
- `npm run lint`: 0 errors, 145 warnings.
  - The two above TASK-004's 143 are the new gallery specimen functions.
  - They hit the same `react-refresh/only-export-components` warning every specimen in that file
    produces.
- `npm run typecheck`: exit 0.
- `npm run gen:types -- --check`: current.
- `python3 scripts/gen-issues.py --check`: exit 0.

## Verification stop: runtime-source-bound audit evidence

This is the same blocker TASK-002 and TASK-004 recorded. The 0.14.3 final audit hashes the runtime
source, so any product change fails two checks:

- *proof labels › bound to the package and runtime source of this tree*: current runtime hash
  `0cd386dfb1915e8c18e7b0deb9ab03225ad1b77b4666be3a9d8fffcbc4ca40a6`;
- *TASK-034 AFTER evidence (eight-cell mobile group)*.

The worker did not edit any audit text, evidence record or hash, and did not weaken the test.

## Failures and corrections during the work

- Initial fixture paired exercises with the wrong equipment (e.g. "Air Squat · Kettlebell").
  Corrected to explicit, consistent movement/equipment pairs.
- The first Session detail reply used the snapshot shape. The route parses a reconstruction, so it
  showed its error state. Corrected to `reconstructionFixture`.
- At 14 px the pictured three facts missed one line at 390 by about 2 px. Switched to the system
  `label-xs` size with `spacing-300` gaps. This matches the reference's small fact type, and the
  first line now holds the three.
- Initial guessed line-count caps (2 at 390, 3 at 320) were wrong for the widest real values. They
  were replaced by alignment and containment assertions plus a recorded line layout. Pictured at 390
  stays strict at exactly 2 lines.
- A unit assertion that the h1 precedes the row in DOM order failed: the header is the scroller's
  pinned head. That check moved to browser geometry.

## Attempt 2 — controller verification failure and correction

Controller result for attempt 1: the focused spec ran 11 tests and 1 failed, "B05 summary facts @
narrow-320 › Review (pictured)". The error text was cut off in the report. When I reran it locally,
the spec passed on the first run and then failed intermittently. I found two causes, both in the
spec's harness rather than in the product:

1. **Fixed port range shared with other checkouts.**
   - The cause: the synthetic Vite origin used `5490 + parallelIndex`. That is the same range as
     `ui-polish-b05-header-back.spec.ts`, and as the concurrently running TASK-008 runner workspace.
   - Why it fails: `--strictPort` makes our server exit when the port is taken, but `waitForOrigin`
     still accepted whatever server answered. The test could then measure a different tree.
   - The fix: the worker allocates a free loopback port.
     - It fails fast if the Vite child exits.
     - It treats the origin as ready only when `/@fs/<this checkout>/package.json` is served. A
       server rooted in another checkout refuses that path.
2. **The asserted axe scan intermittently reported Review's section triggers as nameless.**
   - What was seen: `button-name` on the two `.clr-collapsible__trigger` buttons, plus
     `landmark-unique` on the regions they label.
   - Observed failure rate: 1–3 of 6 Review cases in about half the runs. The rate was unchanged
     whether the scan came on first paint, after the region measured, or after every font face loaded
     plus two frames.
   - Instrumented failures:
     - each trigger's text ("Warm-up", "1 movement") was in the DOM;
     - every ancestor was visible, with no `aria-hidden` or `inert`;
     - an immediate second axe pass over the same DOM was clean every time (3/3 dumps).
   - Reading: this is axe's text-as-icon-ligature heuristic on the bold uppercase data face, not
     missing names. The trigger component and its labels are untouched by this task.
   - The fix (`openReview` in the spec):
     - `visit('/')`, which still runs the fixture's asserted scan on Home;
     - route to `/review` in the same document with the ordinary handoff history state;
     - wait for the title, the measured region and loaded fonts;
     - run one unasserted axe priming pass, then the asserted `checkA11y()`.
   - A real violation still survives into the asserted scan.
3. Every measurement also now follows `settleFonts`: all declared faces loaded, then two frames.
   `fonts.ready` alone resolves before a newly applied skin's faces start loading.

No product source, assertion, tolerance or case was weakened or removed. The temporary debug
instrumentation and its dump files were deleted.

Attempt 2 results on the final tree (`b933e92` + uncommitted diff):

| Command | Result |
| --- | --- |
| `npx playwright test e2e/ui-polish-b05-summary-facts.spec.ts --project=mobile` | **11 passed** on 4 consecutive runs after the fix (7.3–12.6 s). Before the fix, 4 of 7 runs had 1–3 failures. |
| `npx vitest run src/app/review-screen.test.tsx` | 25 passed |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0; 0 errors, 145 warnings (existing `react-refresh` pattern) |
| `npm run lint:ds` | exit 0 |
| `npm run build` | exit 0; existing chunk-size advisory |
| `npm run gen:types -- --check` | current, nothing written |
| `python3 scripts/gen-issues.py --check` | exit 0 ("71 requirements, 136 edges") |
| `npm test` | **exit 1: 2 failed / 5,828 passed** (236/237 files). Both failures are the runtime-source-bound audit checks in `src/test/design-0143-final-audit.test.ts` described above (current runtime hash `317ccf17…de85`). |

The `npm test` failure is the same blocker TASK-002/004/005 recorded. It cannot be cleared from this
worker without a genuine TASK-034 format-preview recapture:

- that needs an owned backend and disposable auth, outside this task's synthetic no-write boundary;
- it needs a frozen committed source.

Writing the new hash without that capture would certify evidence that does not exist, so it was not
done.

## Next safe action

1. The controller commits this tree, genuinely recaptures the TASK-034 format-preview group against
   a disposable local backend, and rebinds the audit. This is the existing procedure.
2. It then runs the independent verification.
3. The owner may decide on the surfaced field-set conflict and the title interpretation above. No
   further worker action is pending.
