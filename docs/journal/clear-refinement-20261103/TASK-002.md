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

## Next action

Controller verification and commit.
