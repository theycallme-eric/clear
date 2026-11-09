# TASK-002 — Context-specific actions with compact equipment (#629)

Body `clear-refinement-v2-20261109b`, attempt 1, base `e22e36b` (after TASK-039 #679 and TASK-001
#680). Task-owned progress note: the approved exception to the shared daily journal for this body.
Only TASK-002 writes this file.

## Intended outcome

REQ-002 (C03, C06, C07; AC-R002-01/02/03; R30, R37, R97, R121, R122, R132) delivered through the
shared owners on the real `/review` and `/workout` routes (JOURNEY-002, completion owner): compact
equipment beside every movement name in both contexts; Review offers Swap under static, always-open
section headers that share the live cards' header vocabulary; the live workout offers set progress,
Rest and set logging and never Swap. Accepted gallery reference
`eded158cfd928d382c9a9409e2c372270312741d`, stable state `/gallery/refinements?state=cards`.

## Shared owner dispositions

- `src/ui/refinements/movement.tsx` — **adopted and extended in place.** `MovementIdentity` and
  `MovementList` unchanged. `MovementGroupHeader`'s title now wears the shared compact data label
  role (`clr-text-data-xs clr-text-data-xs--upper`) so a Review heading title and the live label
  title read in one face (C07).
- `src/ui/refinements/workout-card.tsx` — **created as a deliberate consolidation** of the
  reference's `RefinementWorkoutCard` over `movement.tsx` (REUSE.md: "Review versus Workout actions …
  and format-card composition"). It owns `WorkoutCard` (one block card, the shared static header:
  section identity left, structure badge right; a semantic heading in Review, a label live) and the
  context slots `ReviewMovement` (Swap only) and `LiveMovement` (set progress only, name as heading).
  Neither slot component accepts the other's slot, so Swap cannot reach the workout and a live
  counter cannot reach Review (C06). Consolidated rather than copied: the reference card hard-coded
  synthetic movements, a timed meta line, inert actions and a Coaching and notes disclosure; here
  consumers supply data and actions. Deliberately **not** composed in this owner (other tasks own
  them): the timed meta line and badge placement (TASK-003, C08/C09), the grouped Coaching and notes
  disclosure (TASK-005, C16), the session header/timer (`RefinementWorkoutHeader`, timer tasks) and
  preparation cards (`RefinementPreparation`).
- `src/ui/refinements/tokens.css` — **read; no new variable.** REQ-002's coverage entry lists no
  semantic variables; the header face and slots use existing Foundation tokens and the shared text
  role.
- `src/ui/refinements/presentation.css` — one rule extended: `.clr-movement-group-header__title`
  inherits the header's weight and line height, so an `h2` title does not take the heading element's
  bold display size.
- `src/ui/refinements/movement-readings.ts` — `prescribedLoadReading(load, equipment)` and
  `liveMovementReadings(prescription, unit)` no longer take `inRounds`: a duplicate `Bodyweight`
  beside `bodyweight` equipment is said once by the equipment in every block (AC-R002-01), widening
  TASK-001's round-only rule. Any other load (a `Bodyweight` load on a pull-up bar, weights,
  percentages) is unchanged.

## Changes

- Review: `ReviewSection` (`src/ui/review-block.tsx`) replaces `Review.tsx`'s collapsible
  `ReviewSectionCard`. Each block is its own `WorkoutCard` (as the live workout draws blocks, R30)
  headed by the static header; the section's name is the `h2` on its first card and repeats as the
  header label on later cards of the same section, as the live cards do. No toggle, chevron, hit area
  or collapsed state (R37). The movement count that sat in the old trigger is not in the shared header
  vocabulary and was dropped from the header; the overview still states the workout's movement count.
  The optional tempo detail moved with it and stays a disclosure after the section's last block.
  `ReviewBlockRows` is now internal; its badge moved into the card header. `ReviewExerciseRow` draws
  `ReviewMovement` with Swap in its slot.
- Workout: `BlockPanel` draws `WorkoutCard` (section label + badge, completion control at the foot);
  `BlockPanel.Movement` is `LiveMovement`. Compact equipment now sits beside the name in the live
  EMOM, For Time and untimed ladder movements, and the AMRAP round's rows adopt `BlockPanel.Movement`
  so they carry it too (C03). The live loggers' load readings use the widened Bodyweight rule.
- Gallery `/gallery/refinements?state=cards`: Review is the actual `ReviewSection`; Workout uses the
  live frame's `WorkoutCard` and `BlockPanel` parts with the live readings. A Composition choice adds
  the accepted reference's EMOM, AMRAP and For Time movements beside the TASK-001 compositions.
  Registry: new `WorkoutCard`, `ReviewMovement`, `LiveMovement`, `ReviewSection` entries (replacing
  `ReviewBlockRows`), `MovementGroupHeader` heading specimen; `COMPONENTS.md` regenerated (61).
  `PROJECT_MAP.md` refinements row names `workout-card.tsx`.
- Evidence: `evidence/refinement/task-002/required-cases.json` (check-01: 11 vitest cases; check-02:
  7 Playwright mobile cases), receipts in `results/` written by the guard.
- Shared fixture `src/test/context-actions-fixture.ts` gives the focused check and the browser proof
  identical prescribed data.

## Tests added and changed

- New `src/ui/movement-identity.test.tsx` (check-01, 11 cases over the real router, Review and
  Workout routes and the gallery state).
- New `e2e/refinement/task-002.spec.ts` (check-02, 7 cases, synthetic contained lane at 320 and 390;
  attaches `review-*`, `workout-*`, `review-timed-*`, `workout-timed-*` captures of the delivered
  revision, comparable to V03/V04, the Review-card references VISUAL-CONTRACTS ties to C01/C06).
- Updated assertions that encoded superseded decisions, each citing its criterion in a comment:
  - `src/app/Review.test.tsx`: one card per section with a collapsible trigger → one card per block
    under the static header (AC-C07-01); section labels as expanded buttons → `h2` headings
    (AC-R002-02); "keeps a collapsed section in the document" → "keeps every section open, with no
    toggle, chevron or hit area" (AC-R002-02); badge as first child of the group → in the card header
    (AC-C07-01); suggestion inside a collapsible region → inside the static card (AC-R002-02).
  - `src/app/review-screen.test.tsx`: section anchors via expanded buttons → section headings
    (AC-R002-02); badge position → card header (AC-C07-01); "leaves a standard movement's own rest
    and load" → rest stays and Bodyweight is said once (AC-R002-01), plus a new case keeping an actual
    Bodyweight load on a pull-up bar.
  - `e2e/design-0143/task-040-home-review.spec.ts` (REQ-011 case) and `e2e/core-loop.spec.ts`
    (Review section loop): section toggles → static headings (AC-R002-02); superset badge read from
    its card (AC-C07-01). Both need the backend lane; not run here.
- TASK-001's `src/ui/movement-list.test.tsx` and `e2e/refinement/task-001.spec.ts` are unchanged
  and pass, so TASK-001's receipts stay current.

## Failures and corrections

- jsdom resolves `font-weight: inherit` to `normal`; the face check compares Review and live
  declared values and the heading's weight against its header instead of the literal `inherit`.
- Header hit-testing returned false for headers outside the viewport; each header is scrolled into
  view before `elementFromPoint`.
- A tap on the section heading scrolls the page, so the "nothing collapsed" check compares the
  section's size, not its position.
- First tempo/disclosure assertion was too broad (the tempo detail is collapsed by design); narrowed
  to "no block content inside a disclosure".

## Verification (this worktree, uncommitted candidate, 2026-11-09)

- `node scripts/refinement/run-required-check.mjs --task TASK-002 --check check-01 -- npx vitest run src/ui/movement-identity.test.tsx --passWithNoTests=false` — PASSED, 11/11 executed and passed.
- `node scripts/refinement/run-required-check.mjs --task TASK-002 --check check-02 -- npx playwright test e2e/refinement/task-002.spec.ts --project=mobile` — PASSED, 7/7 (synthetic origin; no credentials).
- `npx playwright test e2e/refinement/task-001.spec.ts --project=mobile` (run directly, not through
  the guard, so TASK-001's receipts were not rewritten) — 9/9 passed.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002` — passed; both tasks have current passing receipts.
- `npm run build` — exit 0. `npm run lint:ds` — exit 0. `node scripts/gallery-index.mjs --check` — 61 verified.
- `npm test` — 252 files, 6090 tests passed, 0 failed.

## Open assumptions / unresolved

- Prescribed load in the live EMOM, AMRAP and For Time movements is not added here: C10 ("show
  prescribed load with existing formatters") is TASK-003's. Only their compact equipment is added.
- Badge placement stays where the shared header puts it (right, wrapping under the title when the
  row is full); below-title placement and format-only content are TASK-003 (C08/C09).
- The grouped bottom Coaching and notes disclosure is TASK-005 (C16). This task keeps the existing
  per-movement Coaching and notes disclosure on the live cards and removes no disclosure but the
  Review section toggle.
- The dropped section movement count in Review's header is a presentation consequence of sharing
  the live header vocabulary (R37: section identity left, badge right); no data is removed.
- Observation, not in scope: at 320 the live section navigator (`SectionHeader`) sets the section
  name and `SECTION 1 / 1 · NOT STARTED` with no visible gap. Untouched by this task (live navigator
  is R35/G22).
- B05 local-only specs (`ui-polish-b05-review-groups`, `-structure-badges`, `-summary-facts`,
  `-active-hierarchy`) still encode pre-R37 Review groups; they read an absent `.evidence` folder and
  are excluded from non-local targets, as TASK-001 recorded. Not run or rewritten.
- `docs/design/library/README.md` still states an older register count; not updated here.

## Repair round 1 (2026-11-09)

Reviewer verdict `TASK-002-a1-pending.json`: all six criteria and JOURNEY-002 met; rejected on one
defect. No product code, check-01/check-02 test or receipt definition changed in this round; only
existing specs that the approved criteria supersede.

### Defect

`e2e/design-0143/workout-lifecycle.spec.ts`, case `review: briefing geometry, load suggestion, …`
(backend lane, default mobile selection, not excluded for 0.14.3). It counted
`main .clr-card [aria-expanded]` and expected 7, then clicked the first one expecting a
`section-collapsed` state. With AC-R002-02's static Review headers that count is 0 for its
fixture (no tempo prescribed), so the case would fail every time the trusted lane runs it.

### Fix (each change cites its criterion in a comment)

- `review` case, `validated-workout` shot: the count is replaced by `expectStaticReviewSections`
  (AC-R002-02, AC-C07-01). The fixture's seven sections are read in order: one
  `[data-workout-card="review"]` card each, inside a `.clr-card`, the section name as the header's
  `h2` by exact name (`Primary lift` ×1, `Accessory` ×1, `Conditioning` ×5), no button named for a
  section, no button/link/tabindex/role=button/aria-expanded/aria-controls/`.clr-hit`/chevron glyph
  in any header, no pointer cursor, the block never inside `.clr-collapsible`/`[data-expanded]`/
  `[hidden]`, and no `[aria-expanded]` anywhere in a section. Badges are read from the card header:
  none on the plain standard block, then `SUPERSET · 2 ROUNDS`, `CIRCUIT · 2 ROUNDS`, `EMOM · 2 MIN`,
  `AMRAP · 2 MIN`, `FOR TIME · 2 MIN CAP`, `FOR TIME · 2 MIN CAP · LADDER UP`, with no badge in a
  block body. Containment (`probe.cards >= 8`), the pinned Start and the skins/short-phone repeats are
  unchanged. The containment note now describes the static headers.
- `review` case, `section-collapsed` variant: replaced by `section-static` (AC-R002-02, R37). A tap
  on the first section's `h2` leaves its block visible, the section's height unchanged and every
  header static, and the screen still contained.
- `review` case, load suggestion locator: `main .clr-text-action` `.first()` now resolves to a Swap
  `TextAction`, because Swap sits in the Review movement's slot before the attached suggestion
  (AC-C06-01). It is now `main [data-movement-identity] > .clr-text-action`, the suggestion itself, so
  its existing button/chevron/40px/`aria-haspopup=dialog`/kg-or-lb/keyboard/Enter assertions stay
  binding. This had already been wrong at base `e22e36b`.
- `review` case, Swap: the `swap-confirmation` disposition ("Review renders no swap control; Swap
  lives on the Workout exercise card") contradicts AC-C06-01. It is now an actual shot: Review's first
  Swap opens its dialog, shows `Alternatives` or `Nothing else fits this slot` (variant
  `swap-options`), Escape closes it, and Swap stays enabled. The `swap-failure` disposition text is
  corrected to point at Review and the existing failure proofs.
- `structures` case: it clicked `Swap` on `/workout` and pictured `swap-options` there. AC-C06-01 and
  AC-R002-03 (and U37 since TASK-028 #501) put Swap only in Review. The case now asserts zero `Swap`
  and zero `Undo swap` buttons on the live workout and notes where the options are pictured.
- Committed 0.14.3 evidence records under `docs/design/evidence-0143/workout-lifecycle/` are
  untouched. The fixture writes a record only when none exists, so the historical record stays as
  taken.

### Sweep (every spec and test under `e2e/` and `src/`)

Searched for `aria-expanded`, `clr-collapsible`/`collapsible__trigger`, chevrons, `data-review-section`/
`data-review-block`, `ReviewSectionCard`/`ReviewBlockRows`, `section-collapsed`, `N movement(s)` and
`movementCount`, `.clr-card` counts, section-label button lookups, `firstElementChild` badge reads and
`data-block-top-row`/`movement-group-header`. All 70 `e2e/**/*.spec.ts` files were scanned. Files that
touch Review or the shared card were read in context:

- Fixed: `e2e/design-0143/workout-lifecycle.spec.ts` (above).
- Fixed: `e2e/ui-polish-b05-swap.spec.ts` (local-only, loads). `groupReadings` read the badge as the
  group's first child and the equipment as a third row child. Both were superseded: the badge is in
  the card header (AC-C07-01) and the equipment sits beside the name (AC-C03-01). The old read threw
  `TypeError … reading 'textContent'` in the grouped case. It now reads the header badge and the
  `[data-movement-ordinal]`/`[data-movement-detail]`/`[data-movement-context]` readings, and new
  assertions keep the before/after equality from being vacuous: badge `SUPERSET · 3 ROUNDS`, ordinals,
  prescription and equipment present.
- Already updated in round 0, re-read and left as is: `e2e/core-loop.spec.ts`,
  `e2e/design-0143/task-040-home-review.spec.ts` (its Tempo `aria-expanded` is the retained optional
  disclosure), `src/app/Review.test.tsx`, `src/app/review-screen.test.tsx`.
- Checked, not superseded:
  - Session Detail disclosures (History, not Review): `e2e/design-0143/collections-settings.spec.ts`,
    `e2e/design-0143/task-040-lifecycle.spec.ts` (historical), `e2e/history-detail.spec.ts`,
    `src/app/SessionDetail.test.tsx`, and `e2e/design-0143/format-preview.spec.ts`, which uses the
    `SessionSectionCard` disclosures.
  - Live section navigator, sheet, menu and coaching disclosures: `e2e/design-0143/accessibility.spec.ts`
    (its outline/heading-in-span probes hold for the `h2` headers), `e2e/design-0143/workout-circuit.spec.ts`,
    `e2e/design-0143/workout-formats.spec.ts`, `e2e/ui-polish-integrated.spec.ts`,
    `e2e/ui-polish-b05-header-back.spec.ts`, `e2e/ui-polish-b05-scroll-boundaries.spec.ts`,
    `e2e/ui-polish-b05-sheet-surface.spec.ts`, `src/app/Workout.test.tsx`, `src/ui/workout-chrome.test.tsx`.
  - Generate, Home and gallery disclosures: `e2e/design-0143/entry-forms.spec.ts`,
    `e2e/design-0143/task-040-entry-settings.spec.ts`, `e2e/ui-polish-b05-generate.spec.ts`,
    `e2e/public-gallery.spec.ts`, `src/app/Generate.test.tsx`, `src/app/Home.test.tsx`.
  - `N movements` in the live `BlockPanel` label: `src/ui/{block-renderers,standard-block,superset-block,circuit-block,emom-block,for-time-block}.test.tsx`.
  - Generic component tests: `src/ui/collapsible-section.test.tsx`.
  - Review entry without section probes: `e2e/d6-swap-persistence.spec.ts`,
    `e2e/ui-polish-swap-selection.spec.ts`, `e2e/ui-polish-pwa-viewport.spec.ts`,
    `e2e/design-0143/optional-feedback.spec.ts`, the `e2e/generation-*.spec.ts` files,
    `e2e/session-continuity.spec.ts`, `e2e/uat-batch-01.spec.ts`, and `e2e/ui-polish-b05-shell.spec.ts`
    (empty Review only).
  - Other src tests that render Review: `src/app/ReviewRoute.test.tsx`, `src/app/swap-selection.test.tsx`,
    `src/test/goal-focus-journeys.test.tsx`, `src/ui/movement-list.test.tsx`, `src/ui/exercise-swap.test.tsx`.
- Left as is, local-only B05 (they cannot load here: each reads an absent `.evidence` reference
  image at module load, so `playwright test --list` fails on them at base and with this candidate):
  - `e2e/ui-polish-b05-review-groups.spec.ts` and `e2e/ui-polish-b05-active-hierarchy.spec.ts`:
    TASK-001's recorded follow-up. Review-groups also reads the badge from the group (line ~357),
    which AC-C07-01 supersedes.
  - `e2e/ui-polish-b05-structure-badges.spec.ts`: the Review case expects Review badges in a
    `column` parent named "ReviewBlockRows group/stack" (lines ~572-580), superseded by AC-C07-01's
    header row.
  - `e2e/ui-polish-b05-summary-facts.spec.ts`: uses `.clr-collapsible__trigger` `.first()` as "the first
    Review section" (line ~623), superseded by AC-R002-02.
  - These were not edited, because an edited spec must load under `--list` and these cannot without the
    reference images. Follow-up: rebase them on R132/C04/C07/R37 where the `.evidence` references exist.

### Pre-existing staleness in workout-lifecycle.spec.ts that TASK-002 does not supersede (not fixed)

These predate this task (present at base `e22e36b`) and come from other requirements, so they are
out of TASK-002's scope:

- Live section tabs are looked up by stored section title (`^Standard, `, `^EMOM, `, `^Ladder, `,
  `^Superset, `, `^${name}, `; lines ~825, 851, 875, 1260-1261, 1438, 1469). Since REQ-011 (#484) the
  navigator names sections by type (`Primary lift, …`, `Conditioning, …`).
- A `Log set 1 of …` form is expected to be visible on landing in `/workout` (lines ~835, 848, 1111,
  1132, 1395, 1441). A standard set's form now opens in the set sheet only from its Rest/Log action
  (`openSheetOnMount` is the circuit's alone).

So the `responsive`, `structures` and `recovery` cases, and the `review` case's last step (`start-workout`),
will still fail in the trusted lane at those points, with or without this candidate. Refreshing them
needs its own approved task.

### Verification (this worktree, uncommitted, 2026-11-09)

- Temporary scratch vitest (created, run, deleted; not part of the candidate): rendered the real
  `Review` with a copy of the lifecycle spectrum fixture and the exact `expectStaticReviewSections`
  evaluation. It passed: seven sections, headings and badges exactly as listed, `.clr-card
  [aria-expanded]` 0, 8 cards. It also confirmed that `main .clr-text-action` first is a Swap and that
  `[data-movement-identity] > .clr-text-action` is the load suggestion (`aria-haspopup=dialog`, kg).
- `npx tsc --noEmit`: exit 0 (tsconfig includes `e2e`). `npx eslint` on both edited specs: exit 0.
- `npx playwright test e2e/design-0143/workout-lifecycle.spec.ts e2e/ui-polish-b05-swap.spec.ts e2e/core-loop.spec.ts e2e/design-0143/task-040-home-review.spec.ts --list --project=mobile`:
  31 tests in 4 files, exit 0. The backend-lane cases are listed but not run (no credentials).
- `npx playwright test e2e/ui-polish-b05-swap.spec.ts --project=mobile --grep "Superset and Circuit selections …"`.
  Before the fix it failed in `groupReadings` (TypeError). After the fix it passes `groupReadings` and the
  new readings assertions, then stops at the absent B05-05 reference image (environment, as at base).
- check-01 (exact brief command): PASSED, 11/11 executed and passed, 0 skipped.
- check-02 (exact brief command): PASSED, 7/7 executed and passed, 0 skipped.
- `npm run build`: exit 0. `npm run lint:ds`: exit 0.
- `npm test`: 252 files, 6090 tests passed, 0 failed.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002`:
  passed. Both tasks have current passing receipts.

## Next action

Controller verification and commit. The trusted backend lane should run the edited workout-lifecycle
`review` case, which passes through its section, suggestion and Swap steps by reading, plus
`core-loop` and `task-040-home-review`. A separate task is needed for the pre-existing
workout-lifecycle staleness and the unloadable B05 specs listed above.
