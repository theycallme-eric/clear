# TASK-005 — One grouped coaching and notes disclosure (#632)

Body `clear-refinement-v2-20261109b`, attempt 1, base `80bc51d` (after TASK-039 #679 and TASK-001 to
TASK-004 #680 to #683). Task-owned progress note: the approved exception to the shared daily journal
for this body. Only TASK-005 writes this file.

## Intended outcome

REQ-005 (C16; G11, G21; R29, R36, R73; AC-C16-01, AC-R005-01, AC-R005-02) delivered through
`GroupExerciseCoaching` / `BlockPanel` / the movement-note writers on the real `/review` and
`/workout` routes (JOURNEY-005, completion owner). A grouped block ends with one bottom Coaching and
notes disclosure with a labelled section per movement. Each section keeps that movement's own
guidance read and its own note draft, writer, save, status and error. Missing coaching, blank
guidance, a blank note, loading and a failed read stay distinct, and no hide or replacement rule is
adopted. Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, stable state
`/gallery/refinements?state=cards`.

## Shared owner dispositions

- `GroupExerciseCoaching` (new, `src/ui/exercise-coaching.tsx`): **created** as the reviewed R7
  owner, consolidated onto current main. It is one `CollapsibleSection` labelled with the accepted
  words `Coaching and notes`. Each movement section is a `role="group"` named by its heading, the
  movement's name. It holds the same two owners the standalone panel draws: `Guidance` (the
  library read through `useExerciseDefinitionQuery`) and `ExerciseNotesField` (its own
  `useExerciseNotes` writer, text state and `NoteStatus`). Nothing is merged. Guidance is read
  only once the disclosure is first opened, and stays read after that (sticky). Collapse is
  CSS-only, so every draft survives close/reopen. Deliberately **not** adopted from R7: its
  "proposal" rule that returned nothing for a missing library entry, or for blank cues and
  regression. AC-R005-02 and R73/G21 say no hide or replacement rule was selected, so
  `NO_DEFINITION_TEXT`, `NO_CUES_TEXT` and `NO_REGRESSION_TEXT` stay, once per movement.
- `ExerciseCoaching` (standalone, same file): **kept**. It returns nothing inside a grouped
  block's rows (`GroupCoachingContext`), so a grouped block has no per-row disclosures (R29). A
  standard block's movements keep their own panel.
- `src/ui/group-coaching-context.ts` (new): `coachesAsGroup(block)` and `GroupCoachingContext`.
  This follows the project's context-module pattern (`card-context.ts`,
  `section-label-context.ts`) and keeps `exercise-coaching.tsx` free of fast-refresh warnings.
  The context carries placement only: no note value, writer or read.
- `BlockPanel` (`src/ui/block-renderers-frame.tsx`): **host**. For a grouped block it hands
  `GroupExerciseCoaching` to the card's `coaching` slot and wraps its rows in
  `GroupCoachingContext`. This covers superset, circuit, EMOM, For Time and both ladder renderers.
  `AmrapBlock` draws `WorkoutCard` directly, so it passes the same slot.
- `src/ui/refinements/workout-card.tsx`: **extended (deliberate consolidation)**. `WorkoutCard`
  gains a `coaching` slot, drawn last in the card, after the block's work, actions and completion
  line. This is where the reference `RefinementWorkoutCard` draws its Coaching and notes
  disclosure. The card places the slot; the consumer supplies the actual owner. Review passes
  nothing (see Decisions).
- `src/ui/refinements/movement.tsx`: **read; adopted unchanged**. The grouped disclosure composes
  no movement identity. Its sections are labelled by name and do not repeat the row hierarchy.
- `src/ui/refinements/tokens.css`: **read; no new variable**. REQ-005's coverage entry lists no
  semantic variables (`semanticVariables: []`). Spacing and rules are the existing `Card`
  sub-group and `clr-stack` ones.
- `src/ui/refinements/presentation.css`: **unchanged**. No CSS is added and no route CSS is
  duplicated.
- `src/ui/refinements/movement-readings.ts`, `overview.tsx`: not relevant to C16; unchanged.
- Movement-note writers (`useExerciseNotes`, `ExercisesClient.saveNotes`, `exercise_notes`):
  **unchanged**. There is still one UPDATE of one prescription row per save, and "saved" is
  claimed only from the stored row. LOGGING-FIELDS.md ("Note belongs to that movement;
  independent save/error ownership") is followed. No field, reason or write was added.
- REUSE.md: followed. There is one owner, no route-local look-alike, and the gallery state draws
  the actual consumer.

## Decisions recorded (derived from the approved sources; not product decisions)

- **Which blocks are grouped.** Every structure but `standard`, with at least one movement:
  superset, circuit, EMOM, AMRAP, For Time, ladder.
  - R29 asks for "one coaching-notes disclosure per grouped block" for "supersets, circuits and
    related grouped blocks". The accepted gallery card draws it on every EMOM, AMRAP and For Time
    card, including the single-movement For Time card.
  - Consequences: a single-movement superset, circuit or EMOM now draws its one disclosure at the
    card's foot rather than in its row. AMRAP, For Time and ladder blocks, which had no coaching
    panel on main, now have the grouped disclosure, through the same reads and writers. A standard
    block's movements keep their own panels (R7's rule, and straight sets are not a group).
- **Review draws no disclosure.** Review.tsx documents that nothing is persisted before Start.
  There is no `workout_exercises` row for a note, and the accept payload carries no
  `exercise_notes`. Offering a note field there would need a new pre-session writer or data
  contract, which is out of scope ("Preserve current data/controller and context-field
  ownership"; no synthetic production writer). A guidance-only disclosure would be an unselected
  replacement. The current main and reviewed R7 Review have none.
  - JOURNEY-005 is therefore proved as Review → Start → Workout, matching how TASK-001 to TASK-004
    read "/review and /workout".
  - The Review step asserts the planned grouped blocks and that no note field is offered.
  - Flagged under Open assumptions as a possible owner question.
- **Accessible name.** The visible label is exactly `Coaching and notes` (R36). An `a11y-hidden`
  qualifier `— <FORMAT>: <movement names>` names each block's disclosure apart from another's.
  axe `landmark-unique` failed on TASK-002's timed spec when the EMOM and AMRAP (both kb swing and
  burpee) had identical names.
- **Order in the card.** The block's work, then its actions (C17: actions before coaching), then
  the "Block saved" completion line once recorded, then the disclosure, last.

## Changes

- `src/ui/exercise-coaching.tsx`: `GROUP_COACHING_LABEL`, `GroupExerciseCoaching`,
  `GroupCoachingPanel`, `CoachingMovementSection`. `ExerciseCoaching` steps aside inside a group.
  The file header now documents C16.
- `src/ui/group-coaching-context.ts` (new): `coachesAsGroup`, `GroupCoachingContext`.
- `src/ui/refinements/workout-card.tsx`: `coaching` slot, documented.
- `src/ui/block-renderers-frame.tsx`: `BlockPanel` hosts the disclosure.
- `src/ui/amrap-block.tsx`: AMRAP card passes the same slot.
- Gallery, cards state (`src/dev/gallery-refinement-cards.tsx`): every grouped live card draws the
  actual `GroupExerciseCoaching` in the `coaching` slot. Memory-only controllers come from
  `src/dev/gallery-refinement-coaching.tsx` (`GalleryCoachingClients`: an in-memory library and
  note writer through `WorkoutClientsContext`/`QueryClientContext`, with every other client
  refusing; nothing reaches the network) and `src/dev/gallery-refinement-coaching-data.ts`
  (synthetic catalog answers and rows). Review draws none.
- Register (`src/dev/gallery-registry.tsx`): new `GroupExerciseCoaching` entry with two specimens
  (a superset; a circuit with written guidance, blank guidance, a failed read and a refused save).
  The `WorkoutCard` summary mentions the slot. `docs/design/library/COMPONENTS.md` was regenerated
  (65 entries).
- Fixture `src/test/grouped-coaching-fixture.ts` (shared by check-01 and check-02): a standard
  lift, a superset and a circuit, with per-slug library answers (written, blank, absent,
  fails-once, held).
- Evidence: `evidence/refinement/task-005/required-cases.json` (check-01: 9 vitest cases; check-02:
  5 Playwright mobile cases); receipts in `results/` were written by the guard.

## Tests added and changed

- New `src/ui/group-exercise-coaching.test.tsx` (check-01, 9 cases over the real router, Review
  and Workout routes, the real reads/writer seams and the gallery state). Criteria are in the
  manifest.
  - A mutation check made every section's writer point at the first movement. The two AC-R005-01
    cases failed, and the file was restored.
- New `e2e/refinement/task-005.spec.ts` (check-02, 5 cases): a contained synthetic lane at 320 and
  390, by touch, keyboard and reduced motion, with axe scans. Note PATCHes are answered per row,
  and a refused first write is used for recovery. Captures attached: `review-*`, `workout-closed-*`,
  `workout-open-*`, `superset-open-*`, `circuit-failed-save-*`,
  `circuit-guidance-states-phone-390` and `gallery-cards-circuit-open-phone-320`. They are
  comparable to V03/V04, which VISUAL-CONTRACTS ties to C16.
- Updated, each superseded by AC-C16-01 and citing it in a comment:
  - `src/app/Workout.test.tsx`: "opens one movement's coaching on demand, inside that movement"
    (per-movement disclosures in a superset) becomes "opens a superset's one coaching disclosure
    on demand, each movement's cues under its own name, and closes it (U38, C16)". U38's on-demand
    and per-movement attribution is kept. The `NO_DEFINITION_TEXT` import was added.
  - `src/app/circuit-rounds.test.tsx`: "each [row] with logging and a coaching disclosure" becomes
    "each with logging, and one coaching disclosure for the circuit". The rows carry none, and the
    circuit has one closed disclosure with a labelled section per movement.
  - `src/ui/superset-block.test.tsx`: `movementHeadings()` excludes headings inside
    `[data-coaching-group]` (the disclosure's labelled sections are not the rows' headings).
  - `src/app/movement-countdown-circuit.test.tsx`: `row()`/`card()` find the movement's own
    heading, not its labelled section in the circuit's disclosure.

## Sweep (every spec and test under `e2e/` and `src/`)

Searched for: `Coaching and notes`, `Notes — `, `Save note`, `Cues`, `Reading coaching`,
`library has no entry`, `exercise_definitions`, `exercise_notes`, `savedNotes`/`saveNotes`,
`ExerciseCoaching`; heading lookups by movement name (strict-mode duplicates); `textbox`/`textarea`
counts; `region` names; `lastElementChild` on cards; control/tab-order counts in live
grouped-block specs.

- Fixed (src, run): the four files above.
- Not edited, run directly and passing: `e2e/refinement/task-001` to `task-004.spec.ts`
  (26 cases), all mobile. An intermediate candidate failed TASK-002's timed cases on axe
  `landmark-unique` (identical names); fixed in the product by the format qualifier.
- Checked, not superseded:
  - `e2e/design-0143/workout-lifecycle.spec.ts` (backend lane): its `/^Coaching and notes — /`
    `.first()` is the first section's single standard lift, which keeps its own panel. Its one
    `Cues` heading and containment probe are unchanged.
  - `e2e/refinement/task-002.spec.ts` and `src/ui/movement-identity.test.tsx`
    (`Coaching and notes — back squat` is a standard block's).
  - `e2e/design-0143/workout-{amrap,circuit,emom,ladder}.spec.ts`: movement lookups are by
    `N. name` exact or scoped to the movement list. `expectHandsOff` checks forms, spinbuttons,
    sliders and named buttons, none of which the disclosure adds.
  - `e2e/design-0143/accessibility.spec.ts`: the ladder gains a closed disclosure. The outline
    probe still sees no skipped level (sections head at the movement level, Cues one below). The
    rail probe's scroll owner is unaffected (`.clr-collapsible__content` is `overflow: hidden`).
  - `e2e/design-0143/workout-formats.spec.ts`, `e2e/contained-shell.spec.ts`,
    `e2e/core-loop.spec.ts`, `e2e/session-continuity.spec.ts`, `e2e/d6-swap-persistence.spec.ts`,
    `e2e/uat-batch-01.spec.ts`, `e2e/reduced-motion.spec.ts`, `e2e/focus-ownership.spec.ts`
    (no coaching or movement-heading reads in grouped live blocks).
  - `src/ui/exercise-coaching.test.tsx` (standalone panel, outside any group).
  - `src/dev/gallery-registry.test.tsx` (now frames `GroupExerciseCoaching`).
  - `src/ui/block-panel.test.tsx`: TASK-003's check reads the gallery source for
    `structure={structureIdentity(block)}`, so the gallery keeps that expression rather than
    TASK-003's check being edited.
- Left as is, pre-existing and not TASK-005 scope:
  - `e2e/ui-polish-b05-active-hierarchy.spec.ts` loads, but every case stops at the absent B05
    `.evidence` reference image (recorded by TASK-001/002/003). Its only coaching reference already
    excludes `Notes` fields.
  - `e2e/ui-polish-integrated.spec.ts` (local synthetic): 5 failures at `/workout` landing (h1
    `CLEAR`, no session timer digits). The same 5 fail on the base tree with this candidate
    stashed, so they are pre-existing.

## Failures and corrections

- The grouped name lost its separator space (`notes— bench`) in dom-accessibility-api, which trims
  the hidden span's own leading space. The space is now a text node before the span.
- `getByRole('status')` was ambiguous in a loading section (the guidance wait and the note
  status). The test helper now reads the note's status line beside its Save button.
- `landmark-unique` on TASK-002's timed spec (EMOM and AMRAP with the same movements). The format
  was added to the hidden qualifier.
- TASK-003's gallery source assertion: the gallery keeps the literal
  `structure={structureIdentity(block)}`.
- Fast-refresh warnings: the context and predicate moved to `group-coaching-context.ts`, and the
  gallery data moved to `gallery-refinement-coaching-data.ts`. There are no new lint warnings in
  any touched file.
- Reduced-motion assertion: the app's guarantee (`a11y.css`) leaves `0.01ms`, not `0s`. The spec
  asserts at most 0.01ms.
- Card captures were clipped to the 568px viewport. Captures now use a 4000px-tall viewport at the
  same width, scrolled to the top, then restored.

## Verification (this worktree, uncommitted candidate, 2026-11-09)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-005 --check check-01 -- npx vitest run src/ui/group-exercise-coaching.test.tsx --passWithNoTests=false`:
  PASSED. Native 9 total, 9 executed, 9 passed, 0 failed/skipped/todo.
- `node scripts/refinement/run-required-check.mjs --task TASK-005 --check check-02 -- npx playwright test e2e/refinement/task-005.spec.ts --project=mobile`:
  PASSED. Native 5 total, 5 executed, 5 passed, 0 failed/skipped/todo (synthetic origin; no
  credentials used).
- `npm run build`: exit 0 (includes `tsc --noEmit` over `src` and `e2e`).
- `npm run lint:ds`: exit 0.
- `node scripts/gallery-index.mjs --check`: 65 verified.
- `npx eslint` on every touched file: 0 errors, and no warning added (warning counts compared
  against `HEAD` per file).
- `npm test`: 255 files, 6122 tests passed, 0 failed.
- `npx playwright test e2e/refinement/ --project=mobile`, run directly (not through the guard, so
  no earlier receipt was rewritten): 31/31 passed.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005`:
  PASSED, exit 0. TASK-001 to TASK-005 each have "current passing receipts".

## Earlier-task receipts

None refreshed. No file named in another task's `required-cases.json` was edited (TASK-001
`src/ui/movement-list.test.tsx`, `e2e/refinement/task-001.spec.ts`; TASK-002
`src/ui/movement-identity.test.tsx`, `e2e/refinement/task-002.spec.ts`; TASK-003
`src/ui/block-panel.test.tsx`, `e2e/refinement/task-003.spec.ts`; TASK-004
`src/ui/summary-facts.test.tsx`, `e2e/refinement/task-004.spec.ts`). `git diff -- evidence/` shows
no change to any earlier task's manifest or receipt. The final verifier above confirms all four
earlier tasks' receipts are current.

## Open assumptions / unresolved

- Review offers no Coaching and notes disclosure (no prescription row before Start). If the owner
  wants notes or guidance before Start, that is a new data contract and a product decision.
- The single-movement grouped blocks moved their one disclosure to the card foot. AMRAP, For Time
  and ladder blocks gained the disclosure (their movements had no coaching panel on main). This
  follows R29 and the accepted gallery cards; flagged in case the owner reads "grouped" as
  multi-movement only.
- Two blocks with the same format and the same movements in one section would share an accessible
  name. A standalone per-movement panel has the same pre-existing limit for a repeated movement.
- A typed but unsaved draft is lost when the shell remounts the section (moving between sections).
  This is pre-existing: saved notes come back through the notes cache. Within a section, close and
  reopen keeps drafts.
- Missing-coaching wording and rules (G21/R73) remain open definition work (REQ-038). Nothing was
  hidden or reworded here.

## Next action

Controller verification and commit.
