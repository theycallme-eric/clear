# TASK-024 — Generate hierarchy, focus interaction and exact copy (#651)

Body `clear-refinement-v2-20261109b`, attempt 1, base `5e20d3a` (after TASK-023 #700). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-024 writes this file.

## Intended outcome

REQ-024 (AC-C51-01, AC-R024-01…08; C51, G16; R06, R10, R11, R21, R23, R25; V01/V02), completion
owner of JOURNEY-024 on `/generate`. Goal and Focus get stronger prominence; the Focus value is
the interactive change control (name and expanded state); Recovery is reached inside the focus
interaction without becoming a focus value; MINUTES fits through the shared unit-fit contract; the
title stays Generate; Back stays the shared icon-only control; a first workout is a normal
session; the Place and Notes helper lines are removed. The work reconciles UAT #286 first. Accepted
gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, `/gallery/refinements?state=screens`.

## #286 reconciliation (what the base already did)

The issue text was supplied by the controller; no `gh` was used. Searching the repo found no
`#286` reference in docs, journals or tests. Against #286's criteria, `5e20d3a` already had:

- one closed `Card` with the solid ground and the standard cut;
- the header Back as the framed icon-only `IconButton` named "Home", not the unframed quiet
  arrow-and-label;
- the Goal as the stored label alone, with no description and no "Change in Settings" link;
- first workout: the four explicit, required Anchor choices;
- history: the recommended Focus with its choices behind a toggle, and a different choice for
  this workout only, written to the URL;
- no recommendation reason and no goal-range sentence for in-range values;
- Intensity always 1–10;
- MINUTES fitted by the shared REQ-006 `styles/fields.css` contract;
- the title "Generate".

Still outstanding, and in TASK-024's scope:

- the paired `Recovery session | Change focus` row (B05-02.7), which R06/R10.1/R25 reject;
- the Place and Notes helper lines (#286 and R23).

Kept as they were: the "First workout: choose a starting focus." helper and the out-of-range
intensity note. #286 also lists these for removal, but TASK-024's approved criteria name only the
Place and Notes helpers, so they are recorded below as an open #286 item. Nothing was reimplemented
from scratch, and the other dirty checkout was not touched.

**R10.5 vs #286 Home.** These do not conflict. #286 asks for a framed CLEAR button for Home, not
the quiet arrow-and-label. R10.5 asks for the shared icon-only Back that keeps its destination and
name. The existing framed icon-only `IconButton` named "Home" satisfies both, and is kept
unchanged. It is now the exported `GenerateBack`.

## Changes

- `src/app/Generate.tsx`
  - New exported presentation owners, used by both the route and the gallery: `GenerateBack`,
    `GenerateIntent` (Goal/Focus summary plus the focus interaction) and `GenerateContextFields`
    (Place, Time available, Notes).
  - New constants: `GENERATE_TITLE`, `GENERATE_ACTION_LABEL`, `HOME_BACK_LABEL`, `GOAL_TERM` and
    `FOCUS_TERM`.
  - Removed: `PLACE_HELPER`, `NOTES_HELPER` and `CHANGE_FOCUS_LABEL`, together with the helper
    props (no `aria-describedby` remains on Place or Notes).
  - Goal and Focus sit on one wrapping `.clr-intent-summary` row. The Focus value is a `<button>`
    (`clr-hit`, `aria-expanded`, `aria-controls` while open) whose name comes from its content,
    "Focus: Lower body". Its chevron is the DS `ChevronRight`/`ChevronDown` (aria-hidden), the
    existing CollapsibleSection cue.
  - Recovery is a separate `Chip` row inside the opened choices, outside the "Focus for this
    workout" group. In the manual (first/stale/error) state it sits beside the Anchor field, not
    inside its group, and is unselected unless the URL says `recovery=1`.
  - The Recovery note now sits under the summary, so a collapsed Recovery draft still says it is
    on.
  - No data, request, URL-intent or resolver behaviour changed (`state/generation-form.ts` is
    untouched).
- `src/ui/refinements/presentation.css`: a new `.clr-intent-summary` recipe, tokens only. Facts are
  `--paragraph-lg-size` with bold `--ink` values. The Focus value uses `--interaction-300` with an
  underline and chevron. The scope marker is `--paragraph-sm`. Nothing touches `.clr-field__unit`.
- `src/dev/gallery-refinement-scenes.tsx` and `gallery-refinements.tsx`: a new `?state=screens`
  (`GalleryScreens`). It draws the route's own `GenerateBack` in `AppHeader`, `GenerateIntent`,
  `IntensitySlider` and `GenerateContextFields`, over an in-memory draft resolved by the route's
  pure rules. The contexts are Returning athlete and First workout. Generate workout is inert.
- Tests:
  - `src/app/Generate.test.tsx`
    - New "TASK-024 — …" block: 9 cases.
    - Migrated U28 helper-retention cases (formerly ~1779–1848) to the removals. They keep the
      label, placeholder, unit, validation, payload (`location_id`, notes length) and
      accessible-name checks, and add AC-R024-07.
    - Migrated the B05-02.6/02.7 pair cases to the C51 summary.
    - Recovery clicks in the recommended state now open the Focus choices first (`chooseRecovery`).
  - Consumers updated:
    - `src/test/goal-focus-journeys.test.tsx`
    - `src/app/Home.test.tsx`
    - `e2e/ui-polish-b05-generate.spec.ts`: the pair measure was rewritten as the C51 summary
      measure, and the behaviour case was retitled.
    - `e2e/ui-polish-home.spec.ts`
    - `e2e/design-0143/entry-forms.spec.ts` and `task-040-entry-settings.spec.ts`: the
      `Change focus` selector is now `/^Focus:/`.
  - `e2e/refinement/task-024.spec.ts`: 6 cases.
- `evidence/refinement/task-024/required-cases.json`: check-01 has 16 declared cases and check-02
  has 6.

## Deliberate consolidation vs the gallery reference

The reference scene opened a dialog (`LoggingOverlay`) of five equal choices, with Recovery as the
fifth. R10.1 forbids making Recovery a mutually exclusive focus value, and #286 specifies "Edit
reveals the choices" in place. The route therefore opens the four focuses inline, with Recovery as
its own toggle beside them. The `screens` state draws exactly that.

## Failures and corrections

- `npx tsc` initially failed: the worktree had no `node_modules`. Fixed with `npm ci`.
- The first browser run of the "failed history read" case landed on the boot "System check failed"
  screen. Boot reads the same history first, so a refused history read never reaches `/generate`
  in a fresh browser (entry-forms records the same masking). The case was replaced by a "failed
  generation keeps the draft" journey. REQ-006's history-error and Retry stay proved in
  `Generate.test.tsx`.
- The failure state's text is "Generation failed…" in a status region, and the negative toast
  covers the pinned Cancel at 320. The case now dismisses the toast first.
- `e2e/ui-polish-home.spec.ts` (all 4 cases) fails before reaching Generate: it lands on the
  signed-out Welcome ("CLEAR", not "Today"). This is environment/pre-existing (the summary lists
  ui-polish failures), not this change.
- `ui-polish-b05-generate.spec.ts` needs the out-of-repo B05 `.evidence` reference (pre-existing),
  so it was migrated but not run locally.

## Verification (this worktree)

- `node scripts/refinement/run-required-check.mjs --task TASK-024 --check check-01 -- npx vitest run src/app/Generate.test.tsx --passWithNoTests=false`:
  PASSED. 119 native cases, all executed and passed.
- `node …/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-024 --check check-02 -- npx playwright test e2e/refinement/task-024.spec.ts --project=mobile`:
  PASSED. 6 of 6.
- `npm test`: 268 files and 6306 tests passed. This run was before the final CSS marker tweak; see
  the final run below.
- `npm run build`: passed. `npm run lint:ds`: passed. `npx eslint .`: 0 errors.
- `npx tsc --noEmit -p .`, which includes e2e: clean.

## Open assumptions / UAT

- #286 items outside TASK-024's approved criteria are kept for the owner: removing "First workout:
  choose a starting focus." and the out-of-range intensity sentence.
- The Focus control's accessible name is its visible text, "Focus: Lower body"; the expanded state
  carries the "change" meaning. The owner may prefer a name that also says "change".
- With the summary at `--paragraph-lg`, Goal and Focus wrap onto two lines at 320–390. The row
  shares one line only where the card is wide enough.
- The `screens` state covers Generate only; its Setup and History parts belong to TASK-025 and
  TASK-026.

## Next action

The controller commits and runs its verification list.

## Repair round 1 (2026-11-10): merge integration c0c21c2 (TASK-018)

Merged `origin/build/clear-refinement-2026-11-04` (c0c21c2) after a delivery rebase conflict; no
TASK-024 behaviour changed. Conflicts: `src/dev/gallery-refinements.tsx` (kept TASK-018's
`ladder-long` state, doc and `GalleryLadderLongResults` import plus this task's `screens` state and
`GalleryScreens` import) and `src/ui/refinements/presentation.css` (kept `.clr-intent-summary` and
TASK-018's `.clr-accepted-log` rules). Registry and COMPONENTS.md came only from TASK-018. After
merge: check-01 PASSED (119/119), check-02 PASSED (6/6 executed, 0 skipped), `npm test` 6315 passed,
`npm run build`, `npm run lint:ds`, `gallery-index --check` (76 entries) and the final delivery
evidence verifier all passed.

## Repair round 2 (2026-11-10): merge integration d7e5ccd (TASK-016)

Repair round 2: merged `origin/build/clear-refinement-2026-11-04` (d7e5ccd, TASK-016 LoggingOverlay
backdrop/header/title context) into c68f71c; no TASK-024 behaviour changed. One conflict, in the
`src/dev/gallery-refinements.tsx` header comment: kept TASK-016's extended `ladder-long` paragraph
verbatim and appended this task's `screens` paragraph; `presentation.css` auto-merged with
`.clr-intent-summary`, TASK-018's `.clr-accepted-log` and TASK-016's rules all present. TASK-024's
delta against d7e5ccd equals its delta against c0c21c2; every integration-only file equals d7e5ccd.
After merge: `gallery-index --check` (76 entries), `tsc --noEmit`, check-01 PASSED (119/119),
check-02 PASSED (6/6 executed, 0 skipped), `npm test` 6323 passed, `npm run build` and
`npm run lint:ds` passed; the final delivery evidence verifier was run after the merge commit.
