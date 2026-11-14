# Load guidance contract: prescribed target versus performed weight

TASK-036, REQ-036 (AC-R036-01, AC-R036-02, AC-R036-03), issue #663. Body
`clear-refinement-20261103`. Status: engineering definition with a typed read model, one actual
consumer and deterministic tests. It adds no route, screen, control, column, migration, writer or
live call. It does not claim a load range, a per-hand label or any other undefined feature is
implemented.

Typed half: `src/state/refinement-load-guidance.ts`. Check: `src/state/refinement-load-guidance.test.ts`
(check-01). This file and the typed records must agree: check-01 fails when a source owner, a
dependency id or a traceability id named in code is missing here.

## 1. What the accepted direction asks

G24 (current decision group; notes R04, R31): "Load guidance in normal prescription position, clear
units/per-hand meaning; no redundant Review Change weight for the verified circuit. Preserve
prescribed target versus performed weight." Its status: "Visual direction retained; range/read-model
contract open. Existing loadText/unit/data owners. Synthetic ranges are not approved production load
logic; logging coverage is format-specific."

- R04 asked for "the rough suggested load range in the normal prescription row", with "units and the
  per-hand meaning clear without adding explanatory prose", and retained the data meaning: "a
  suggested range helps choose a load; the logged value records the one actual weight used."
- R31: one shared reading/formatter in both contexts; "Do not substitute logged actual weight for a
  prescribed target, guess a missing unit, or promote synthetic rough-load inputs into a production
  data contract."
- Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, state
  `/gallery/refinements?state=cards`. Its coverage entry for REQ-036 has no user-facing criterion and
  the limit "Load presentation is demonstrated. Approved ranges/per-hand semantics/read model require
  application engineering." The reference cards draw literal strings (`load:'24 lb'`, `'9 lb'`); they
  are presentation samples, not a rule.

## 2. Sources: one owner per reading

| Reading | Stored columns | Owner (module, export) | Meaning |
| --- | --- | --- | --- |
| `target.text` | `workout_exercises.load_type`, `load_value`, `profiles.weight_unit` | `src/state/review.ts` `loadText` | The prescribed target in the guidance's own terms; null when the prescription states no load. |
| `target.unit` | `profiles.weight_unit` | `src/state/set-logging.ts` `useShellWeightUnit` (live), Review's briefing unit | The profile's unit, for an absolute load only; null while unread, never guessed. |
| `target.implement` | `workout_exercises.equipment_used` | `src/state/review.ts` `equipmentName` | The implement, named beside the movement. |
| `target.suggestion` | `load_anchors.anchor_value`, `unit` (+ `anchor_evidence`) | `src/state/load-suggestions.ts` `reviewLoadSuggestions` | Review's one suggested weight with its confidence (OVR-01c). A single number, never a range. |
| `performed.set` | `exercise_set_logs.weight`, `weight_unit` | `src/state/session-detail.ts` `loggedSet` | The one weight actually used for a set, in the unit it was logged in. |
| `performed.movement` | `block_movement_results.weight`, `weight_unit` | `src/state/session-detail.ts` `movementActualReadings` | The weight actually used for one timed movement, in the unit it was logged in. |

The read model is `prescribedLoad(columns, weightUnit)` (a `prescribed-target`) and
`performedLoad(row)` (a `performed` weight). `prescribedLoad` takes only prescription columns, so no
logged weight can reach a target. The live readings consume it: `liveMovementReadings`
(`src/ui/refinements/movement-readings.ts`) reads its load as `prescribedLoad(...).text`, and Review
reads the same `loadText`.

## 3. Meaning and units (AC-R036-01)

`LOAD_MEANINGS`, total over `load_guidance`:

| `load_type` | `load_value` is | Unit | Reading |
| --- | --- | --- | --- |
| `absolute` | a target weight | the profile's `weight_unit`; the number alone while unread | `60 kg`, `60` |
| `percent_1rm` | a share of the one-repetition maximum | none | `75% 1RM` |
| `rir` | repetitions in reserve (an effort, not a weight) | none | `2 RIR` |
| `bodyweight` | nothing | none | `Bodyweight` (said once by the equipment when the equipment is bodyweight) |
| `prior_session` | nothing | none | `Match last session` (no number is invented) |
| `none` | nothing | none | no reading; unloaded is not zero |

- The prescription has no unit column. An `absolute` value is read in the profile's unit; OVR-01c's
  override is written in the unit the screen showed. A performed weight carries its own
  `weight_unit` and is never converted into the profile's for display.
- Prescribed target versus performed weight: the target is the prescription's (`load_type`,
  `load_value`); a performed weight is a logged row's (`weight`, `weight_unit`). The logging rules
  never read `load_value` into an actual (`movementActualFromDraft`), a blank weight is "not
  recorded", not zero, and Review's override revises only this session's prescription, never an
  anchor or a logged set.

### Rough range (read-model meaning, no production rule)

R04's meaning is retained: a range would help choose a load; the logged value is the one weight
used. No current input establishes one:

- a prescription stores one `load_value` (`workout_exercises`); there is no lower/upper column;
- OVR-01c (`reviewLoadSuggestions`, `suggestLoad`) answers one number with a confidence;
- the generation prompt's LOAD GUIDANCE bands ("roughly 40–60%" and so on by intensity) instruct the
  model's composition, are stored nowhere and are not per-movement bounds;
- the unwired OVR-02 fill (`weight-fill.ts`, `weight_suggested`) also produces one number, and has no
  column in `database.types.ts`;
- the reference cards' load strings are synthetic.

So `prescribedLoad(...).range` is always `null`, with `rangeDependency: 'LOAD-RANGE-RULE'` (§5).

### Per-hand reading

- Equipment ids are catalog ids (`dumbbells`, `kettlebells`, …; `src/state/onboarding.ts`), names of
  the inventory, not of how many implements a movement uses.
- OVR-01 §"Data needed" states the dumbbell increment "5 lb / 2 kg per hand", implemented as
  `EQUIPMENT_INCREMENTS.dumbbells` (`src/state/progression.ts`). The progression rules therefore step a
  dumbbell number as one hand's [inferred from the increment].
- Nothing records whether a given movement uses one implement or two, and the set logger has one
  Weight field with no per-hand label. The per-hand sense of a logged or prescribed number is the
  user's own convention.

Reading: the stored number is shown exactly as stored, beside the implement's name (TASK-003:
`dumbbell pair` beside the name in the test fixture). It is never doubled, halved or explained in
prose (R04). `prescribedLoad(...).perHand` is `{ stated: false, dependency: 'LOAD-PER-HAND' }`.

## 4. The verified circuit's Review weight change (AC-R036-02)

Consumed from TASK-003 (AC-R003-04); not re-implemented or re-edited here.

- The app has no control labelled "Change weight" (that was the F08 preview proposal). The Review
  weight change that exists is OVR-01c's per-prescription override ("Your weight", "Use this
  weight"). TASK-003 made `LoadSuggestionView.adjustable` false for a movement in a `circuit` block:
  the suggestion is still explained, without the override.
- The circuit's actual weight stays in its existing optional logger (`Rest for <movement>` → the
  shared set logger with Weight), stored in `exercise_set_logs.weight` / `weight_unit`.
- Not extrapolated: every other structure (standard, superset, EMOM, AMRAP, For Time) keeps the
  override. Timed formats record movement loads through their own TASK-015 path; that is not this
  circuit's storage proof.
- Evidence consumed: TASK-003 check-01 case "AC-R003-04 offers no Review Change weight control on the
  verified circuit and keeps its actual weight entry in the optional logger" and check-02 case
  "AC-R003-04 keyboard and touch: the verified circuit explains its suggestion without a Review weight
  change, and its optional logger takes the actual weight". Check-01 here requires both receipts to
  be current and passing.

## 5. Definition dependencies (AC-R036-03)

`LOAD_DEFINITION_DEPENDENCIES`. Each is an open definition for the owner; no option is pre-selected.

- `LOAD-RANGE-RULE` — Owner: Eric. Blocks: a rough suggested load range in the prescription row
  (R04). Why open: §3 "Rough range". Needs a decision on where bounds come from (for example the
  suggestion, the anchor and the intensity band, or the equipment's available steps), whether they are
  stored or derived, and how they read. Continues meanwhile: the single prescribed target through
  `loadText` in both contexts (TASK-003).
- `LOAD-PER-HAND` — Owner: Eric. Blocks: an explicit per-hand statement, or a doubled or halved
  number, for paired implements. Why open: §3 "Per-hand reading". Needs a source for the implement
  count per movement (a prescription or catalog attribute) and the convention for logged weights.
  Continues meanwhile: the stored number, unchanged, beside the implement's name.

## 6. Limitations

- An `absolute` target is read in the profile's current unit because the prescription has no unit
  column. No screen in the app writes `profiles.weight_unit` at this revision [observed by search], so
  a re-read in a changed unit cannot happen today; a future unit setting must account for it.
- The check is unit level plus the gallery state in jsdom. Real-route presentation and browser
  geometry stay TASK-003's (check-01 and check-02).
- Whether people log dumbbell weights per hand is not observable from the data.

## 7. Gallery disposition

`/gallery/refinements?state=cards` already draws Review through `reviewBriefing` (`loadText`) and the
live cards through `liveMovementReadings`, which now reads `prescribedLoad`. This task changes no
markup, CSS or composition there; check-01 renders the state and requires every load it draws to be
the read model's target for its prescription, with no range. No synthetic writer is added.

## 8. Traceability

- REQ-036, issue #663, TASK-036; G24; notes R04, R31; evidence EVID-8D879C0997E4 (G24) and
  EVID-76CED19E0F10 (product-definition and data work stays visible).
- AC-R036-01: §2, §3; check-01 cases prefixed `AC-R036-01`.
- AC-R036-02: §4; check-01 cases prefixed `AC-R036-02`.
- AC-R036-03: §5, §7; check-01 cases prefixed `AC-R036-03`.
- Sources: `CURRENT-REQUIREMENTS-AUTHORITY.md` (G24, C10, "Product-definition and data work must
  remain visible"), `INDIVIDUAL-CORRECTION-REGISTER-2026-11-03.md` (R04, R31),
  `GALLERY-REFERENCE-UPDATE.md`, gallery `PINNED-SOURCE.json`, `REUSE.md` (open definition work: load
  read model/ranges), `LOGGING-FIELDS.md`, `gallery-refinement-coverage.json` (REQ-036), and the
  shared owners `src/ui/refinements/movement.tsx` and `src/ui/refinements/workout-card.tsx` (adopted
  unchanged: their `load` slot is the prescribed target, never a performed weight).
