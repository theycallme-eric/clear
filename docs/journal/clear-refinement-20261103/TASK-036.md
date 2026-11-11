# TASK-036 — Validate load-guidance source and actual-versus-target contract (#663)

Body `clear-refinement-v2-20261109b`, attempt 1, base `8804d22` (after TASK-027 #713; checked equal
to `origin/build/clear-refinement-2026-11-04` before starting). This is the task-owned progress note,
the approved exception to the shared daily journal for this body. Only TASK-036 writes this file.

## Intended outcome

REQ-036 (AC-R036-01, AC-R036-02, AC-R036-03), role independent; G24, notes R04 and R31; evidence
EVID-8D879C0997E4 and EVID-76CED19E0F10. This is engineering definition work:

- define the authoritative load meaning, units and per-hand reading from current training inputs;
- keep prescribed targets and performed weights apart;
- consume TASK-003's circuit Review weight-change evidence without re-editing that control;
- record what current source cannot establish (range rule, per-hand) as definition dependencies and
  keep the independently supported prescribed-load presentation.

No range, per-hand label, control, column, migration, writer, route or live call is added or claimed.

## Findings (from current source, nothing invented)

- Meanings: `loadText` (`src/state/review.ts`) is total over `load_guidance`. Only `absolute` is a
  weight. Its unit is the profile's (`profiles.weight_unit`), because `workout_exercises` has no unit
  column. With the unit unread it shows the number alone.
- Performed weights carry their own unit (`exercise_set_logs.weight`/`weight_unit`,
  `block_movement_results.weight`/`weight_unit`). History reads them through `loggedSet` and
  `movementActualReadings`. `movementActualFromDraft` never reads `load_value`.
- Range: no production rule exists. Each source gives one number:
  - a prescription stores one `load_value`;
  - OVR-01c `reviewLoadSuggestions`/`suggestLoad` gives one number with a confidence;
  - the prompt's LOAD GUIDANCE percentage bands are composition instructions and are stored nowhere;
  - the OVR-02 `weight-fill.ts` (`weight_suggested`) is unwired and has no column in
    `database.types.ts`;
  - the reference gallery's loads are literal strings.

  This is recorded as `LOAD-RANGE-RULE` (Owner: Eric).
- Per-hand:
  - OVR-01 states the dumbbell increment "per hand" (`EQUIPMENT_INCREMENTS.dumbbells`, 5 lb / 2 kg).
  - Catalog equipment ids (`dumbbells`, `kettlebells`) name inventory, not the number of implements a
    movement uses.
  - The logger has one Weight field.

  This is recorded as `LOAD-PER-HAND` (Owner: Eric). The number is shown as stored beside the
  implement and is never doubled, halved or glossed.
- Circuit: the app has no "Change weight" control. The Review weight change is OVR-01c's override.
  TASK-003 set `adjustable: block.structure_type !== 'circuit'`. TASK-003's receipts for its two
  AC-R003-04 cases are current and passing, and are consumed by check-01. Every other structure keeps
  the override (not extrapolated).
- Note: TASK-003's fixture equipment `dumbbell-pair` is not a catalog id (catalog: `dumbbells`). The
  read model treats both the same way.

## Changes

- New `src/state/refinement-load-guidance.ts`, a pure read model:
  - `LOAD_GUIDANCE_SOURCES`: one existing owner per reading;
  - `LOAD_MEANINGS`: total over the enum;
  - `LOAD_DEFINITION_DEPENDENCIES`;
  - `prescribedLoad(columns, weightUnit)`: a target through `loadText`/`equipmentName`, with
    `range: null` and `perHand.stated: false`;
  - `performedLoad(row)`: the row's own weight and unit, null when not recorded.
- Consumer adoption: `src/ui/refinements/movement-readings.ts` `liveMovementReadings` now reads its
  load as `prescribedLoad(prescription, weightUnit).text`. The output is identical (the same
  `loadText`), so every live renderer and the gallery `cards` state's Workout context read the model.
  Review keeps `loadText` directly; its parity is proven.
- New `docs/specs/LOAD_GUIDANCE_CONTRACT.md`: what was asked, the sources table, meanings and units,
  the range and per-hand findings, the circuit disposition, the dependencies, limitations, the gallery
  disposition and traceability.
- `src/dev/gallery-refinement-cards.tsx`: a header-comment bullet only (TASK-036 adoption note). No
  markup, CSS or composition change.
- `src/state/README.md`: a new section on the read model.
- New `src/state/refinement-load-guidance.test.ts` (check-01, 8 cases) and
  `evidence/refinement/task-036/required-cases.json`. The guard writes the receipt
  `results/check-01.json`.
- Shared owners `src/ui/refinements/movement.tsx` and `workout-card.tsx` are adopted unchanged: their
  `load` slot is already the prescribed target. `tokens.css` was read; no variable is needed. No
  hotspot file was edited.

## Tests (criterion each justifies)

check-01 `src/state/refinement-load-guidance.test.ts`, describe "TASK-036 load-guidance source and
actual-versus-target contract":

- AC-R036-01:
  - every meaning/unit through `loadText`, with no range or guessed unit, and `liveMovementReadings`
    parity;
  - no per-hand rewrite or gloss for `dumbbells`, `kettlebells`, `dumbbell-pair` and `barbell`;
  - target versus performed: own unit, null is not zero, History parity, and `movementActualFromDraft`
    never fills from `load_value`;
  - every source owner exports what it names, and no dev or fixture import, band or sample load
    appears in production readers.
- AC-R036-02:
  - TASK-003 check-01/check-02 receipts are verified current through the shared `verifyReceipt`,
    and both AC-R003-04 cases passed;
  - `reviewLoadSuggestions` is `adjustable` false for the circuit only, across standard, superset,
    circuit, EMOM, AMRAP and For Time.
- AC-R036-03:
  - both dependencies are recorded with Owner Eric in code and contract, with no option selected and
    no implementation claim, and all traceability ids are present;
  - the gallery `cards` state (all three compositions, Review and Workout) draws every load as the
    read model's target, with no range or per-hand gloss.

## Failures and corrections

- First run: 7 of 8 passed. The contract-quote check failed because the contract wraps prose across
  lines. The test now folds whitespace before matching. The record was not changed to fit the test.
- The test file must be `.ts` (the approved command), so the gallery render uses `createElement`
  instead of JSX.
- Mutation checks, both reverted (byte-identical afterwards, confirmed by `git status`):
  - doubling a `dumbbells` load in `prescribedLoad` failed the per-hand case;
  - appending a line to `src/ui/block-panel.test.tsx` failed the AC-R036-02 receipt case with
    "TASK-003 check-01: stale receipt".

## Verification (this worktree, uncommitted candidate, 2026-11-11)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-036 --check check-01 -- npx vitest run src/state/refinement-load-guidance.test.ts --passWithNoTests=false`:
  PASSED, 8 total, 8 executed, 8 passed, 0 skipped.
- `npm run build`: exit 0. `npm run lint:ds`: exit 0.
- `npx eslint` on the four changed or new TS/TSX files: exit 0, no problems.
- `npm test`: exit 0, 270 files, 6368 tests passed.
- `node scripts/gallery-index.mjs --check`: 76 verified.
- Affected earlier guard (`liveMovementReadings` changed, output identical), re-run genuinely with its
  receipts unchanged:
  - TASK-003 check-01 (`npx vitest run src/ui/block-panel.test.tsx`): PASSED, 12/12.
  - TASK-003 check-02 (`npx playwright test e2e/refinement/task-003.spec.ts --project=mobile`, under
    `v2.mjs with-lock`): PASSED, 5/5.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-003,TASK-036`:
  exit 0. Both tasks have current passing receipts.

## Open assumptions

- The per-hand inference from the OVR-01 increment is marked [inferred] in the contract. Whether
  people log dumbbells per hand is not observable.
- An absolute target is read in the profile's current unit. No app screen writes
  `profiles.weight_unit` today; a future unit setting must handle stored targets.
- Check-01 depends on TASK-003's receipts being current. A later task that edits TASK-003's check
  targets must refresh those receipts (an existing cross-task rule), or this check fails.

## Next action

Controller verification and commit. The owner answers `LOAD-RANGE-RULE` and `LOAD-PER-HAND` when a
range or a per-hand statement is wanted. Until then the single prescribed target stays as it is.
