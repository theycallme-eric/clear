# TASK-029 — Equipment asset inventory and readable fallback (#656)

Body `clear-refinement-v2-20261109b`, attempt 1, base `95f1d95` (after TASK-026 #709). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-029 writes this file.

## Intended outcome

REQ-029 (AC-C56-01, AC-R029-01, AC-R029-02; C56; R122, R132), completion owner of JOURNEY-029 on
the real `/review`, `/workout` and Setup equipment. The outcome has three parts:

- Preserve the verified equipment inventory and the 75 existing icons, with the approved round
  effort-face exception. Invent no taxonomy and no medicine-ball setup ID.
- Equipment without a glyph keeps a readable label in the selected compact placement beside the
  movement name. It is never silently icon-only.
- New equipment artwork and its adoption are an explicit, recorded follow-up.

Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`,
`/gallery/refinements?state=assets`.

## Before (verified against current source)

- `src/design-system/assets/icons.tsx` has 75 named icons. It is byte-identical to the accepted
  reference (sha256 `8368e49b…224d`), and the public entry re-exports all of them. The only round
  icons are `Frown`, `Meh`, `Smile` and `SmilePlus`. `SetEffortChoice` uses Frown, Meh and Smile.
- Equipment taxonomy is `EQUIPMENT` in `src/state/onboarding.ts`: 16 IDs, shared with Locations.
  There is no medicine-ball ID. The Wall ball fixture's `medicine-ball` is composed equipment.
- TASK-002 already draws movement-row equipment as text beside the name: `MovementIdentity`
  `data-movement-context`, from `equipmentName`. `EquipmentSummary` (TASK-004) draws the one
  shipped `Dumbbell` category glyph beside "Required equipment", followed by the names in words.
  Setup and Locations name each choice in words.
- Absent before this task:
  - the wanted-list authority file;
  - any in-source record of the inventory;
  - the gallery `assets` state;
  - any proof that a missing glyph still gives a readable label for every kind.

## Changes

- **Shared owner (new).** `src/ui/refinements/equipment-assets.ts` is the inventory in source:
  - `SHIPPED_ICON_COUNT` (75), `ROUND_FACE_EXCEPTION` and `EFFORT_FACES`;
  - `SHIPPED_EQUIPMENT_ICONS` (Dumbbell, and WeightPlate as plates only);
  - `EQUIPMENT_ASSETS`, derived from `EQUIPMENT`, so no ID is added. Each entry has its glyph
    (`dumbbells` → Dumbbell; all others null), status and proposed next step;
  - `WANTED_REVIEW_LABELS`: Medicine ball, with `setupId: null`;
  - `equipmentGlyph(id)`.

  It is presentation-record only: no field, write or derivation.
- **Authority record (new).**
  `docs/design/library/refinements-2026-11-04/authority/EQUIPMENT-ICON-WANTED-LIST.md` adopts the
  reference wanted list with its table unchanged. It adds three things:
  - the verified 75-icon and face facts;
  - the status in this build: placement in use, no glyph adopted in rows, no taxonomy change;
  - an explicit follow-up list covering artwork batch, the Bodyweight decision, adoption beside the
    label, and Medicine ball catalog coverage.

  A focused check keeps the table and the module in step.
- **Gallery `?state=assets` (new; append-only).** `GalleryEquipmentAssets` in
  `gallery-refinement-scenes.tsx` is registered last in `REFINEMENT_STATES`. It draws:
  - the inventory from the shared owner: shipped glyphs, and every Setup ID's status;
  - the medicine-ball note;
  - the routes' own consumers over one composition: Review's `EquipmentSummary` and `ReviewSection`
    cards (`ReviewContextCards`), Workout's live cards (`WorkoutContextCards`), and `/onboarding`'s
    `SetupStepView` equipment step.

  The composition is `src/dev/gallery-refinement-assets-data.ts`: every Setup equipment ID once,
  plus Wall ball with `medicine-ball`, across standard, superset and circuit. This deliberately
  consolidates the reference's `GalleryEquipmentInventory`, which hand-listed `EQUIPMENT` with an
  inline `dumbbells` test. Nothing is read or written. There is no route CSS and no new styling.
- **No product UI change.** The real routes already had the readable fallback, and this task
  proves it. Movement rows deliberately get no Dumbbell glyph. R132 selects the compact label, and
  glyph adoption is the follow-up; adding a glyph would also break TASK-002's protected "no svg
  beside the name" assertion. No route, owner, CSS, token, `icons.tsx` or taxonomy change.

## Tests

- **check-01, `src/ui/movement-identity.test.tsx` (shared with TASK-002).** New describe:
  "TASK-029 equipment asset inventory and readable fallback". Eight cases:
  - AC-C56-01 inventory: icons sha256 pin, 75 names, public entry, only two equipment glyphs,
    16 Setup IDs read rather than redefined, WeightPlate never a stand-in.
  - AC-C56-01 wanted list in step with the module.
  - AC-R029-01 round faces exception and Effort faces.
  - AC-R029-01 medicine ball on /review and /workout without a setup ID.
  - AC-R029-01 Setup's 16 worded choices, with no medicine ball (real `/onboarding` route).
  - AC-R029-02 / JOURNEY-029: every kind as a readable label on real /review and /workout, plus
    Required equipment in words.
  - JOURNEY-029 recovery after a failed Start.
  - The gallery `assets` state.

  Pattern `equipment` also matches TASK-002's describe, so 19 cases run and the 8 are required.
- **check-02, `e2e/refinement/task-029.spec.ts` (new).** Five cases:
  - JOURNEY-029 at phone-320 and at phone-390, Review then Workout. Browser geometry: label visible,
    ≥ 12px and quieter than the name, untruncated, not inside the name, one line unit beside or
    under the name, no glyph, no overflow. Required equipment in words beside one category glyph.
  - AC-R029-01 Setup at phone-320: 16 worded choices, no medicine ball, touch and keyboard.
  - JOURNEY-029 recovery at phone-320: failed Start in the error dialog, keyboard retry (same draft
    sent again, fails again), Escape back to an unchanged Review, Start focusable.
  - Gallery `assets` at phone-320, with nothing read or written.

  Synthetic, contained harness. The only writes are Start's intercepted session calls.
- `evidence/refinement/task-029/required-cases.json`: 8 + 5 required cases.

## Failures and corrections

- The Setup case first failed because `renderApp` defaults to a warm, onboarded query cache. The
  fix passes a cold `QueryClient`, as `Onboarding.test.tsx` does.
- The test first imported `../design-system/assets/icons`, which ESLint `no-restricted-imports`
  forbids. It now uses the public entry only, and asserts that `index.js` re-exports
  `./assets/icons`.
- The e2e Setup tap on the label text timed out. The checkbox input lies over its row (U09), so the
  case taps the checkbox.
- The e2e recovery case found "Start workout" twice. A failed Start opens the modal `ErrorDialog`,
  whose retry is also "Start workout". The case was rewritten around the dialog (keyboard retry,
  then Escape).
- One run of the Setup e2e case reported axe `region` on the skip link `a` after the
  touch/keyboard steps. It did not reproduce in 9 later runs (3 + 6 repeats) or in the guard run.
  It is recorded as a flake watch, not changed.

## Consumer sweep

- `movement-identity.test.tsx` is TASK-002 check-01's target. TASK-002 cases are unchanged, and its
  guard was re-run: PASSED, 11/11 required.
- Gallery hotspots are append-only: one import line extended, new imports, a scene appended, one
  state appended and a header paragraph. Existing states are untouched.
- No registry or COMPONENTS.md change. The scene is a gallery state, not a new shared component.
  `node scripts/gallery-index.mjs --check` verified 76 entries.

## Verification (final tree)

- `node scripts/refinement/run-required-check.mjs --task TASK-029 --check check-01 -- npx vitest run src/ui/movement-identity.test.tsx --testNamePattern equipment --passWithNoTests=false`:
  PASSED (19 executed, 19 passed; 8 required passed).
- `node …/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-029 --check check-02 -- npx playwright test e2e/refinement/task-029.spec.ts --project=mobile`:
  PASSED (5/5).
- `node scripts/refinement/run-required-check.mjs --task TASK-002 --check check-01 -- npx vitest run src/ui/movement-identity.test.tsx --passWithNoTests=false`:
  PASSED (re-run because its target changed).
- `npm run build`: exit 0. `npm run lint:ds`: exit 0. `npm test`: 269 files, 6356 tests passed.
- `npx eslint` on every changed source and spec file: 0 errors, 0 warnings.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-034`
  (the 31 listed, including TASK-029): PASSED, all current passing receipts.

## Open assumptions / UAT

- Movement-row labels are the composed equipment value in words (`equipmentName`), such as
  `pullup bar`, `assisted pullup dip` and `leg curl extension`. Setup's display labels (`Pull-up
  bar`) are not used there. Changing that wording is outside this task: no taxonomy or label
  change.
- The inventory list in `?state=assets` is plain worded list items in the gallery's default text
  styling. It is a reference record, not a product surface.
- Bodyweight still shows `bodyweight` beside bodyweight movements (TASK-012 UAT item). The wanted
  list keeps "text vs glyph" as an owner decision.
- Follow-up, explicit and unscheduled: artwork batch (Kettlebell, Medicine ball, Barbell), the
  Bodyweight decision, adoption beside the label, and Medicine ball catalog coverage.

## Next action

Controller verification and review. No owner decision is needed to merge this task.
