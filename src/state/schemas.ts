/**
 * CORE-03 — boundary schemas.
 *
 * Every payload that crosses a boundary is parsed here, and nowhere else. This
 * is the half of defect D2 that validation never covered: the old app took the
 * model's JSON on trust, discovered the damage at the INSERT — or, worse, at
 * render time — and fell back to a mock workout that made a broken app look
 * like a working one.
 *
 * The rule this file exists to make true: **anything that validates can be
 * persisted.** Each check below mirrors a CHECK constraint in
 * `supabase/migrations/`, so the boundary rejects exactly what the database
 * would have rejected, with a field path instead of a Postgres error string.
 * Where a schema is stricter than its constraint it is stricter in the safe
 * direction — a narrower set of accepted payloads, never a wider one.
 *
 * Three things it deliberately is not:
 *
 *   * Not a second vocabulary. Every closed value set comes from
 *     `Constants.public.Enums`, which `npm run gen:types` writes from the
 *     migrations, so an enum that changes in SQL changes here or fails the
 *     drift check. The three exceptions are named at their definitions.
 *   * Not a second type declaration. Every exported type is `z.infer` of its
 *     schema. A hand-written interface beside a schema is a second answer to
 *     the same question, and the two drift silently.
 *   * Not client-only. It imports nothing from React, the DOM, or the design
 *     system, so an edge function imports this same file rather than restating
 *     the contract in Deno — which is what `src/state/schemas.test.ts` checks
 *     by reading the tree rather than by trusting the convention.
 *
 * Spec: `docs/specs/generation/GENERATION_CONTRACT.md` §5 (output shape 4.1.0),
 * §6 checks 4–7 (the mirrored constraints), §9 (error envelope).
 */
import { z } from 'zod'

import { Constants } from '../data/database.types'
import { ErrorCode, createError, err, ok, type AppError, type Result } from './errors'

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `btrim(x) <> ''`, expressed once. Whitespace is not trimmed away on the way
 * through: the value that validates is the value that is stored, so a schema
 * cannot quietly rewrite a payload into one the caller never sent.
 */
const nonBlank = z.string().regex(/\S/, 'must not be blank')

/** `int ... > 0` — the shape of every positive-integer CHECK in the schema. */
const positiveInt = z.int().positive()

/** `int ... >= 0`, which is a different claim: zero is a real answer. */
const nonNegativeInt = z.int().min(0)

/** A `timestamptz` as PostgREST renders it, offset and all. */
const timestamp = z.iso.datetime({ offset: true })

/**
 * The CORE-01 correlation id, `req_<base36>_<base36>` (`src/state/errors.ts`).
 * Checked rather than assumed, because a request id that does not round-trip
 * is a trace that stops exactly where it was needed.
 */
export const requestIdSchema = z.string().regex(/^req_[0-9a-z]+_[0-9a-z]+$/, 'must be a request id')

// ─────────────────────────────────────────────────────────────────────────────
// Vocabularies
// ─────────────────────────────────────────────────────────────────────────────
//
// Straight from the generated enums. `Constants` is `as const`, so each of
// these infers the same literal union `Enums<'…'>` does — the schema and the
// column cannot disagree about what a legal value is.

export const sessionFocusSchema = z.enum(Constants.public.Enums.session_focus)
export const sectionTypeSchema = z.enum(Constants.public.Enums.section_type)
export const structureTypeSchema = z.enum(Constants.public.Enums.structure_type)
export const timerContractSchema = z.enum(Constants.public.Enums.timer_contract)
export const repSchemeSchema = z.enum(Constants.public.Enums.rep_scheme)
export const targetKindSchema = z.enum(Constants.public.Enums.target_kind)
export const distanceUnitSchema = z.enum(Constants.public.Enums.distance_unit)
export const loadGuidanceSchema = z.enum(Constants.public.Enums.load_guidance)
export const movementPatternSchema = z.enum(Constants.public.Enums.movement_pattern)
export const experienceLevelSchema = z.enum(Constants.public.Enums.experience_level)
export const goalPresetSchema = z.enum(Constants.public.Enums.goal_preset)
export const equipmentTierSchema = z.enum(Constants.public.Enums.equipment_tier)
export const weightUnitSchema = z.enum(Constants.public.Enums.weight_unit)
export const constraintScopeSchema = z.enum(Constants.public.Enums.constraint_scope)
export const prescriptionOriginSchema = z.enum(Constants.public.Enums.prescription_origin)
export const revisionStatusSchema = z.enum(Constants.public.Enums.revision_status)
export const executionStatusSchema = z.enum(Constants.public.Enums.execution_status)
/**
 * `session_state` (SES-01a). No column holds it — it is derived from the three
 * lifecycle timestamps — but the *set* of states is a type in SQL precisely so
 * this schema and `src/state/session-machine.ts` enumerate the database's four
 * rather than a fifth of their own.
 */
export const sessionStateSchema = z.enum(Constants.public.Enums.session_state)
export const constraintActionSchema = z.enum(Constants.public.Enums.constraint_action)
export const constraintPersistenceSchema = z.enum(Constants.public.Enums.constraint_persistence)

/**
 * `reps | time | distance`. `rounds` is not one of them and never was: an
 * exercise inside an AMRAP still prescribes reps or time *per round*, and the
 * block is what repeats (contract §5, `prescription_modality`).
 */
export const modalitySchema = z.enum(Constants.public.Enums.prescription_modality)

/**
 * Contract-only vocabulary, and the first of the three exceptions to "no second
 * vocabulary". `workout_exercises` has no `session_function` column: contract
 * 4.1.0 §5 returns it per exercise and `DATA_MODEL.md` §6 has nowhere to put
 * it, a discrepancy DATA-01c recorded rather than invented a column for
 * (`docs/journal/2026-09-21.md`). It is validated here because the model
 * returns it; where it lands is GEN-01's question.
 */
export const SESSION_FUNCTIONS = [
  'prep',
  'primary',
  'accessory',
  'balance',
  'core',
  'conditioning',
  'recovery',
] as const
export const sessionFunctionSchema = z.enum(SESSION_FUNCTIONS)

/** The second exception, and the same story: contract §5, no column yet. */
export const ANCHOR_RELATIONSHIPS = ['direct', 'complementary', 'neutral'] as const
export const anchorRelationshipSchema = z.enum(ANCHOR_RELATIONSHIPS)

// ─────────────────────────────────────────────────────────────────────────────
// Generation output — contract v4.1
// ─────────────────────────────────────────────────────────────────────────────
//
// Objects here are strict: an unknown key is a rejection, not a silent strip.
// That is deliberate at this one boundary. A `rounds` or `timer_seconds` key
// appearing on an exercise is the exact defect the block level was introduced
// to kill, and a schema that strips it would accept a workout whose members
// disagree about the clock and then persist the half of it the database can
// hold.

/** The prescription contract version this file parses. */
export const CONTRACT_VERSION = '4.1.0'

/**
 * Every field of a prescription except the target, which is discriminated
 * below. Optionality mirrors the contract literally: a key the contract always
 * writes is required here, and writes `null` when it has no value, because a
 * missing key in a model response is a truncated response rather than a
 * defaulted one.
 */
const prescriptionCommon = {
  // Validated against *that section's candidate set* in GEN-02c — check 1 is a
  // question about data this schema cannot see. All it can say is "a
  // non-blank id", which is `workout_exercises.exercise_id NOT NULL`.
  exercise_id: nonBlank,
  // `workout_exercises.equipment_used`, `btrim(...) <> ''`. Membership in the
  // candidate's usable_equipment is check 2, and likewise not visible here.
  equipment: nonBlank,

  session_function: sessionFunctionSchema,
  anchor_relationship: anchorRelationshipSchema,

  modality: modalitySchema,
  // `sets int, CHECK (sets is null or sets > 0)`. Null inside an open-ended
  // block, where "how many sets" has no answer until the clock stops.
  sets: positiveInt.nullable(),
  per_side: z.boolean(),
  distance_unit: distanceUnitSchema.nullable(),
  rest_seconds: nonNegativeInt.nullable(),
  // Display only, never parsed — by the database, and by this schema.
  tempo: z.string().nullable(),

  load_type: loadGuidanceSchema,
  load_value: z.number().nullable(),
  is_interval_exercise: z.boolean(),
}

/**
 * Check 4, as a discriminated union: exactly the fields `target_kind` names are
 * populated and the rest are `null`. This is `CONSTRAINT target_shape` on
 * `workout_exercises`, and it is what keeps `{8,10}` as a rep range and
 * `{8,10}` as a two-rung ladder from being the same payload read two ways.
 */
const fixedTarget = z.strictObject({
  ...prescriptionCommon,
  target_kind: z.literal('fixed'),
  target_value: positiveInt,
  target_min: z.null(),
  target_max: z.null(),
  target_sequence: z.null(),
})

const rangeTarget = z.strictObject({
  ...prescriptionCommon,
  target_kind: z.literal('range'),
  target_value: z.null(),
  target_min: positiveInt,
  target_max: positiveInt,
  target_sequence: z.null(),
})

const sequenceTarget = z.strictObject({
  ...prescriptionCommon,
  target_kind: z.literal('sequence'),
  target_value: z.null(),
  target_min: z.null(),
  target_max: z.null(),
  // `array_length(target_sequence, 1) > 1`: a one-rung ladder is a fixed
  // target that has been written the expensive way.
  target_sequence: z.array(positiveInt).min(2),
})

/** The load guidance that carries its own answer; `load_value` adds nothing. */
const SELF_DESCRIBING_LOAD = new Set(['bodyweight', 'prior_session', 'none'])

/** The structures defined by a clock rather than by a count. */
const TIMED_STRUCTURES = new Set(['emom', 'amrap', 'for_time'])

export const prescriptionSchema = z
  .discriminatedUnion('target_kind', [fixedTarget, rangeTarget, sequenceTarget])
  // `target_max > target_min`. Equal bounds are a fixed target; inverted ones
  // are a typo the database refuses and so does this.
  .refine((value) => value.target_kind !== 'range' || value.target_max > value.target_min, {
    path: ['target_max'],
    message: 'target_max must be greater than target_min',
  })
  // Check 5 / `CONSTRAINT distance_has_unit`. "400" is not a distance.
  .refine((value) => value.modality !== 'distance' || value.distance_unit !== null, {
    path: ['distance_unit'],
    message: 'distance_unit is required when modality is distance',
  })
  // Check 7 / `CONSTRAINT load_value_matches_type`.
  .refine(
    (value) => SELF_DESCRIBING_LOAD.has(value.load_type) || value.load_value !== null,
    {
      path: ['load_value'],
      message: 'load_value is required unless load_type is bodyweight, prior_session or none',
    },
  )

/**
 * Check 6, both halves of it, and the reason the block level exists at all:
 * the clock is one fact per block rather than one per member.
 */
export const workoutBlockSchema = z
  .strictObject({
    structure_type: structureTypeSchema,
    // `CHECK (rounds is null or rounds > 0)`. Null is open-ended, not zero.
    rounds: positiveInt.nullable(),
    timer_type: timerContractSchema,
    timer_seconds: positiveInt.nullable(),
    round_rest_seconds: nonNegativeInt.nullable(),
    rep_scheme: repSchemeSchema,
    block_notes: z.string().nullable(),
    exercises: z.array(prescriptionSchema).min(1),
  })
  // `CONSTRAINT timed_structures_have_a_clock`. Without it there is nothing to
  // run and nothing to score against.
  .refine(
    (block) => !TIMED_STRUCTURES.has(block.structure_type) || block.timer_seconds !== null,
    {
      path: ['timer_seconds'],
      message: 'emom, amrap and for_time blocks require timer_seconds',
    },
  )
  // `CONSTRAINT fixed_round_structures_have_rounds`. Constrained for `circuit`
  // alone because the constraint is — a superset with null rounds makes GEN-06's
  // formula null, and that gap is a finding against the spec, not a rule to
  // invent here (DATA-01c, `docs/journal/2026-09-21.md`).
  .refine((block) => block.structure_type !== 'circuit' || block.rounds !== null, {
    path: ['rounds'],
    message: 'circuit blocks require rounds',
  })

export const workoutSectionSchema = z.strictObject({
  section_type: sectionTypeSchema,
  // `workout_sections.section_title`, `btrim(...) <> ''`.
  section_title: nonBlank,
  section_notes: z.string().nullable(),
  // A section with no blocks is a heading. Nothing renders it and nothing can
  // be performed in it.
  blocks: z.array(workoutBlockSchema).min(1),
})

export const generationOutputSchema = z.strictObject({
  // `workout_sessions.title`, `btrim(...) <> ''`.
  title: nonBlank,
  overview: z.string().nullable(),
  sections: z.array(workoutSectionSchema).min(1),
  /**
   * Diagnostic only, and the schema says so by parsing it and nothing more.
   * Comparing the model's estimate against GEN-06's computed duration is a
   * free signal about whether it understands the time cost of what it composed
   * (contract §5); treating it as authoritative is defect D5, where the check
   * compared a number Claude was told to a number Claude wrote.
   */
  estimated_duration_mins: positiveInt,
})

// ─────────────────────────────────────────────────────────────────────────────
// Envelopes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the client sends: focus, intensity, duration, location, notes
 * (contract §1). The numeric bounds are `workout_sessions`' own —
 * `requested_intensity between 1 and 10` and `requested_duration_mins > 0` —
 * so a request that cannot become a session is refused before it costs a
 * model call.
 */
export const generationRequestSchema = z.strictObject({
  request_id: requestIdSchema,
  focus: sessionFocusSchema,
  requested_intensity: z.int().min(1).max(10),
  requested_duration_mins: positiveInt,
  location_id: z.uuid(),
  /**
   * Free text the user gives generation. Context for composition only — it is
   * never parsed into a constraint, because a deterministic exclusion is a
   * `user_constraints` row and never prose (DATA_MODEL §5).
   */
  notes: z.string().max(2000).nullable(),
  /**
   * OVR-04: whether the user accepted the deload the Generate screen suggested.
   *
   * On the wire rather than re-derived server-side, because it is a *decision*
   * and not a read: §4's triggers can say a deload is warranted, and only the
   * person training can say it is happening. A function that recomputed the
   * triggers and applied one would be the auto-apply the requirement forbids.
   *
   * Defaulted rather than required: `false` is what every caller that has not
   * been asked means, and a boolean nobody set is not a deload.
   */
  deload: z.boolean().default(false),
})

// ─────────────────────────────────────────────────────────────────────────────
// Swap — REV-02 (the request; its response is below `workout_exercises`)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which slot a swap replaces: one exercise, or one block as a unit
 * (`docs/specs/generation/exercise-swap.md` §"Swap Behavior by Structure Type").
 */
export const SWAP_MODES = ['single', 'unit'] as const
export const swapModeSchema = z.enum(SWAP_MODES)

/**
 * What a swap is asked for: the session it belongs to and the one thing in it
 * being replaced. Deliberately *not* the section, the constraints, the
 * equipment or the exercises that are staying — the function reads all of those
 * back from the session it was given, because a client that supplied them could
 * ask for a replacement the user's own constraints forbid, and the swap draws
 * from the same candidate query as generation or it is not the same contract
 * (REV-02, GENERATION_CONTRACT §11).
 *
 * The target is discriminated rather than two nullable ids: a `single` body
 * carrying a block id is a caller that has not decided which swap it wants, and
 * the boundary is where that is cheapest to say.
 */
export const singleSwapRequestSchema = z.strictObject({
  request_id: requestIdSchema,
  session_id: z.uuid(),
  mode: z.literal('single'),
  /** The active prescription to replace. Its block and section are read, never sent. */
  workout_exercise_id: z.uuid(),
})

export const unitSwapRequestSchema = z.strictObject({
  request_id: requestIdSchema,
  session_id: z.uuid(),
  mode: z.literal('unit'),
  /** Every active member of this block is replaced together. */
  block_id: z.uuid(),
})

export const swapRequestSchema = z.discriminatedUnion('mode', [
  singleSwapRequestSchema,
  unitSwapRequestSchema,
])

/**
 * One failure the boundary found, flattened to the two things a caller can act
 * on. It is a wire shape as well as a local one: GEN-01's envelope answers a
 * malformed body with this list, which is the difference between "validation
 * failed" and the field that was wrong.
 */
export const schemaIssueSchema = z.strictObject({
  /** Dotted path with array indices — `sections[0].blocks[0].exercises[2].sets`. */
  path: nonBlank,
  message: nonBlank,
})

/**
 * The CORE-01 wire error: `{ code, message, requestId }`, the same shape for
 * every function. `code` is the taxonomy in `src/state/errors.ts` rather than
 * a string, so a client can branch on it; the contract's own §9 code list
 * (`generation.malformed_prescription` and friends) names failures the
 * taxonomy spells `GENERATION_*`, and reconciling the two lists is GEN-01's
 * call to make once it owns the responses.
 *
 * `issues` is optional because most failures have no field to name: a model
 * outage is not a path. When the failure *is* a malformed payload, the paths
 * travel with it (GEN-01), and nothing else from an `AppError`'s `details`
 * does — the rest of it is for the log.
 */
export const errorResponseSchema = z.strictObject({
  code: z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]),
  message: nonBlank,
  requestId: requestIdSchema,
  issues: z.array(schemaIssueSchema).optional(),
})

/**
 * The contract's own §9 code list, in the contract's spelling. It is a second
 * vocabulary beside `ErrorCode` on purpose: the taxonomy says what a client
 * should *do*, and these say which check refused the composition. GEN-03 reads
 * them to choose a sentence a person can act on — "change equipment" and "the
 * retry is spent" are different advice arriving as the same taxonomy code.
 */
export const GENERATION_FAILURES = [
  'generation.no_candidates',
  'generation.invalid_reference',
  'generation.malformed_prescription',
  'generation.duration_implausible',
  'generation.upstream',
  'generation.exhausted',
] as const
export const generationFailureSchema = z.enum(GENERATION_FAILURES)

/**
 * The error response as GEN-03 reads it: CORE-01's wire error, plus the §9 code
 * when the function names one. `errorResponseSchema` is left as it is — what
 * GEN-01 *writes* is its own call, and this only widens what a client will
 * accept. Unknown keys are still refused, and an answer without `failure`
 * parses exactly as it does today.
 */
export const generationErrorResponseSchema = errorResponseSchema.extend({
  failure: generationFailureSchema.optional(),
})

/** A generation that succeeded, echoing the id it was called with (§9). */
export const generationSuccessSchema = z.strictObject({
  requestId: requestIdSchema,
  workout: generationOutputSchema,
})

/**
 * Either half, parsed by one schema, because a caller that has to decide which
 * shape it is holding before parsing it has already trusted the response.
 */
export const generationResponseSchema = z.union([generationSuccessSchema, errorResponseSchema])

/** Narrows a parsed response without re-reading its fields by hand. */
export function isErrorResponse(
  response: GenerationResponse,
): response is z.infer<typeof errorResponseSchema> {
  return 'code' in response
}

// ─────────────────────────────────────────────────────────────────────────────
// Persisted payloads
// ─────────────────────────────────────────────────────────────────────────────
//
// Rows as PostgREST returns them: snake_case, every column present. These are
// not strict, and that is the mirror image of the reasoning above — a column
// added by a later migration should not make an existing screen fail to read
// the row it already understands. Unknown keys are dropped, known ones are
// checked.

/** `profiles` (DATA-01b §3). NULL is "not answered", never a sentinel. */
export const profileSchema = z.object({
  id: z.uuid(),
  created_at: timestamp,
  updated_at: timestamp,
  experience_level: experienceLevelSchema.nullable(),
  goal_preset: goalPresetSchema.nullable(),
  // `CONSTRAINT profiles_enabled_sections_not_empty`: a profile that has
  // answered nothing still has to be able to generate something.
  enabled_sections: z.array(sectionTypeSchema).min(1),
  weight_unit: weightUnitSchema,
  // NULL means onboarding is incomplete. A *failed* profile read is an error
  // state and never this null — that distinction is defect D1.
  onboarded_at: timestamp.nullable(),
})

/**
 * SET-01's edit to `profiles`: the three preferences the settings hub writes,
 * and nothing else.
 *
 * Strict, because a key this does not carry is a column the hub has no business
 * changing — `onboarded_at` in particular, since re-answering a question is not
 * re-entering onboarding (IA.md §6). Nullable exactly where the columns are,
 * and `min(1)` because `profiles_enabled_sections_not_empty` is: an edit that
 * unticks the last section is refused here rather than by the database.
 */
export const profilePreferencesSchema = z.strictObject({
  experience_level: experienceLevelSchema.nullable(),
  goal_preset: goalPresetSchema.nullable(),
  enabled_sections: z.array(sectionTypeSchema).min(1),
})

/** `locations` (DATA-01b §4). Equipment is `location_equipment`, not a column. */
export const locationSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  created_at: timestamp,
  updated_at: timestamp,
  name: nonBlank,
  tier: equipmentTierSchema,
  is_default: z.boolean(),
})

/**
 * What a `locations` read answers (AUTH-03). A user with no locations is a
 * valid answer — an empty array, never a missing one — so the list is the
 * parsed shape rather than something a caller assembles row by row.
 */
export const locationListSchema = z.array(locationSchema)

/**
 * `location_equipment`, as SET-02 reads it: the ids, already ordered by the
 * query. One row per item is the table's shape (DATA-01b §5); the screen and
 * generation both want the list, so the list is what the boundary answers.
 */
export const locationEquipmentRowSchema = z.object({
  location_id: z.uuid(),
  equipment_id: nonBlank,
  created_at: timestamp,
})

export const locationEquipmentListSchema = z.array(locationEquipmentRowSchema)

/**
 * What SET-02 sends `save_location`: one place, and everything in it.
 *
 * Strict, like every other write that becomes a transaction. `id` is `null` for
 * a place being created — the function's own `p_location_id default null` says
 * the same thing — and the equipment array may be empty, because a location
 * with nothing in it is a real answer (it simply makes nothing eligible).
 *
 * The bounds are the database's: `locations_name_not_blank` and
 * `location_equipment_id_not_blank`. A draft that validates is one the
 * transaction can commit, and one that does not never opens it.
 */
export const locationDraftSchema = z.strictObject({
  id: z.uuid().nullable(),
  name: nonBlank,
  tier: equipmentTierSchema,
  equipment: z.array(nonBlank),
})

/**
 * What `save_location` answers: the committed row and the equipment as stored.
 *
 * Both, because both are cache entries the screen holds — the list of places and
 * that place's equipment. A client that had to re-read after saving would show
 * the location it just wrote with the equipment it had before.
 */
export const locationSetupSchema = z.object({
  location: locationSchema,
  equipment: z.array(nonBlank),
})

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding — ONB-01
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What `complete_onboarding` is called with: the five answers, as one payload.
 *
 * Strict, like every other write that becomes a transaction. A key the
 * function does not read is a preference the user believes they set, and this
 * is the requirement's "every preference lands correctly" expressed where it
 * can actually fail — before the round trip rather than after it.
 *
 * Every bound here is one the database already holds: a blank location name is
 * `locations_name_not_blank`, an empty section list is
 * `profiles_enabled_sections_not_empty`, and a blank equipment id is
 * `location_equipment_id_not_blank`. So a payload that validates is one the
 * transaction can commit, and a payload that does not never opens one.
 */
export const onboardingAnswersSchema = z.strictObject({
  location_name: nonBlank,
  location_tier: equipmentTierSchema,
  /** Equipment ids, as the catalog spells them. Unordered, and may be empty. */
  equipment: z.array(nonBlank),
  experience_level: experienceLevelSchema,
  goal_preset: goalPresetSchema,
  enabled_sections: z.array(sectionTypeSchema).min(1),
  /** Patterns to work around. Each becomes one persistent `exclude` row. */
  avoid_patterns: z.array(movementPatternSchema),
  /** Free text kept as context and never parsed into a constraint (DATA-05). */
  note: z.string().nullable(),
})

/**
 * What the commit answers with: the two rows the client's caches must now
 * hold.
 *
 * It is the committed profile rather than an acknowledgement because the
 * AUTH-03 guard routes on `profiles.onboarded_at` — a client that had to
 * refetch before it could navigate would, for the length of that round trip,
 * still look to the guard like a user who has not onboarded.
 */
export const onboardingCommitSchema = z.object({
  profile: profileSchema,
  location: locationSchema,
})

/**
 * `user_constraints` (DATA-05 §2), discriminated on `scope`, which is how the
 * table's two target CHECKs — exactly one target, and it is the one the scope
 * names — become a shape rather than a runtime assertion. There is no
 * `impact` scope: the catalog carries no impact tagging, and a control that
 * silently does nothing is worse than no control.
 *
 * `src/data/constraints.ts` owns the domain type and the row mapping; this is
 * the row on the wire, which is why it is snake_case and why it stops at the
 * database's constraints.
 */
const constraintCommon = {
  id: z.uuid(),
  user_id: z.uuid(),
  action: constraintActionSchema,
  persistence: constraintPersistenceSchema,
  applies_to_session_id: z.uuid().nullable(),
  // Stored, shown back, passed to Claude as context. Never parsed, here least
  // of all.
  note: z.string().nullable(),
  created_at: timestamp,
}

export const userConstraintRowSchema = z
  .discriminatedUnion('scope', [
    z.object({
      ...constraintCommon,
      scope: z.literal('exercise'),
      target_exercise_id: nonBlank,
      target_pattern: z.null(),
      target_equipment: z.null(),
    }),
    z.object({
      ...constraintCommon,
      scope: z.literal('movement_pattern'),
      target_exercise_id: z.null(),
      target_pattern: movementPatternSchema,
      target_equipment: z.null(),
    }),
    z.object({
      ...constraintCommon,
      scope: z.literal('equipment'),
      target_exercise_id: z.null(),
      target_pattern: z.null(),
      // `CONSTRAINT user_constraints_target_equipment_not_blank`.
      target_equipment: nonBlank,
    }),
  ])
  // `CONSTRAINT user_constraints_session_scope_has_session`. The leak this
  // closes is real: without it a one-session exclusion applies forever.
  .refine(
    (row) => row.persistence === 'persistent' || row.applies_to_session_id !== null,
    {
      path: ['applies_to_session_id'],
      message: 'a session-scoped constraint must name its session',
    },
  )

// ─────────────────────────────────────────────────────────────────────────────
// Session lifecycle — SES-01a
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What acceptance sends to `persist_session`: everything `workout_sessions`
 * needs that composition does not supply, plus the composed workout itself.
 *
 * Strict, like the generation contract above and for the same reason — this is
 * the payload that becomes four tables in one transaction, and a key the
 * function does not read is a field the caller believes it persisted. The
 * bounds are `workout_sessions`' own CHECK constraints, so a payload that
 * validates here is one the database can hold.
 */
export const sessionAcceptanceSchema = z.strictObject({
  // The training day, the user's own. Not unique per user: two workouts in one
  // day is a thing people do (DATA-01c).
  date: z.iso.date(),
  // Null when the location was deleted between generating and accepting. What
  // it was composed against is then simply no longer known.
  location_id: z.uuid().nullable(),
  session_focus: sessionFocusSchema,
  // Snapshotted at generation time: the user's current goal is a preference
  // and can change; what this workout was composed for cannot.
  goal_preset: goalPresetSchema.nullable(),
  requested_duration_mins: positiveInt,
  effective_duration_target_mins: positiveInt,
  /** GEN-06's number. Null until GEN-06 exists to compute it. */
  computed_duration_mins: positiveInt.nullable(),
  requested_intensity: z.int().min(1).max(10),
  effective_intensity: z.int().min(1).max(10),
  adjustment_reason: z.string().nullable(),
  generation_notes: z.string().nullable(),
  prompt_version: nonBlank,
  contract_version: nonBlank,
  /**
   * OVR-04 §4: the session is tagged, because a deliberately light day is not
   * evidence you got weaker. `anchor_evidence` and `conditioning_history` both
   * already drop a session carrying this flag, so the tag is what makes that
   * exclusion true of anything. Defaulted: an ordinary session is not a deload.
   */
  is_deload: z.boolean().default(false),
  workout: generationOutputSchema,
})

/** `workout_sessions` (DATA-01c §3, plus SES-01a's `abandoned_at`). */
export const workoutSessionRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  location_id: z.uuid().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  date: z.iso.date(),
  title: nonBlank,
  overview: z.string().nullable(),
  session_focus: sessionFocusSchema,
  goal_preset: goalPresetSchema.nullable(),
  requested_duration_mins: positiveInt,
  effective_duration_target_mins: positiveInt,
  computed_duration_mins: positiveInt.nullable(),
  // Zero is a real elapsed duration — a session completed the moment it
  // started — so this is non-negative rather than positive, exactly as
  // `workout_sessions_durations_sane` has it.
  actual_duration_mins: nonNegativeInt.nullable(),
  requested_intensity: z.int().min(1).max(10),
  effective_intensity: z.int().min(1).max(10),
  adjustment_reason: z.string().nullable(),
  generation_notes: z.string().nullable(),
  prompt_version: nonBlank,
  contract_version: nonBlank,
  // The three lifecycle timestamps. State is derived from them and stored
  // nowhere, which is why all three are parsed rather than just the latest.
  started_at: timestamp.nullable(),
  completed_at: timestamp.nullable(),
  abandoned_at: timestamp.nullable(),
  mood: z.int().min(1).max(5).nullable(),
  session_notes: z.string().nullable(),
  counts_for_streak: z.boolean(),
})

/** A page of sessions, as HIST-01's history read returns them. */
export const workoutSessionListSchema = z.array(workoutSessionRowSchema)

/** `workout_sections` (DATA-01c §4). */
export const workoutSectionRowSchema = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  created_at: timestamp,
  updated_at: timestamp,
  section_type: sectionTypeSchema,
  order_index: nonNegativeInt,
  section_title: nonBlank,
  section_notes: z.string().nullable(),
})

/** `workout_blocks` (DATA-01c §5). The clock, once, for the whole block. */
export const workoutBlockRowSchema = z.object({
  id: z.uuid(),
  section_id: z.uuid(),
  created_at: timestamp,
  order_index: nonNegativeInt,
  structure_type: structureTypeSchema,
  rounds: positiveInt.nullable(),
  timer_type: timerContractSchema,
  timer_seconds: positiveInt.nullable(),
  round_rest_seconds: nonNegativeInt.nullable(),
  rep_scheme: repSchemeSchema,
  block_notes: z.string().nullable(),
})

/**
 * `workout_exercises` (DATA-01c §6). Both statuses are read, never one: a
 * superseded row that was completed is a fact about what happened, and a
 * reader that collapsed the two would lose it (DATA_MODEL §7).
 */
export const workoutExerciseRowSchema = z.object({
  id: z.uuid(),
  block_id: z.uuid(),
  exercise_id: nonBlank,
  order_index: nonNegativeInt,
  modality: modalitySchema,
  sets: positiveInt.nullable(),
  target_kind: targetKindSchema,
  target_value: positiveInt.nullable(),
  target_min: positiveInt.nullable(),
  target_max: positiveInt.nullable(),
  target_sequence: z.array(positiveInt).nullable(),
  per_side: z.boolean(),
  distance_unit: distanceUnitSchema.nullable(),
  rest_seconds: nonNegativeInt.nullable(),
  tempo: z.string().nullable(),
  load_type: loadGuidanceSchema.nullable(),
  load_value: z.number().nullable(),
  equipment_used: nonBlank,
  is_interval_exercise: z.boolean(),
  slot_id: z.uuid(),
  replaces_id: z.uuid().nullable(),
  origin: prescriptionOriginSchema,
  created_at: timestamp,
  superseded_at: timestamp.nullable(),
  revision_status: revisionStatusSchema,
  execution_status: executionStatusSchema,
  exercise_notes: z.string().nullable(),
})

/**
 * One slot's revision, as REV-02 persisted it: the row that was superseded and
 * the row that replaced it. Both, rather than the new one alone — the lineage
 * is the point of the operation (D6), and a client given only the substitute
 * would have to guess what it replaced.
 */
export const swapRevisionSchema = z.strictObject({
  superseded: workoutExerciseRowSchema,
  exercise: workoutExerciseRowSchema,
  /** §8's hydration, for the card that has to render the substitute immediately. */
  name: nonBlank,
  display_name: nonBlank,
})

/** A swap that succeeded, echoing the id it was called with (§9). */
export const swapSuccessSchema = z.strictObject({
  requestId: requestIdSchema,
  mode: swapModeSchema,
  section_type: sectionTypeSchema,
  block_id: z.uuid(),
  /** One entry for a single swap; one per block member for a unit swap. */
  revisions: z.array(swapRevisionSchema).min(1),
})

export const swapResponseSchema = z.union([swapSuccessSchema, errorResponseSchema])

/**
 * `exercise_set_logs` (DATA-01d §2). Every actual is nullable and every one of
 * them admits zero: null is "not recorded", zero is a real result, and the two
 * are different observations (DATA_MODEL §8).
 */
export const exerciseSetLogRowSchema = z.object({
  id: z.uuid(),
  workout_exercise_id: z.uuid(),
  prescription_revision_status: revisionStatusSchema,
  set_number: positiveInt,
  actual_reps: nonNegativeInt.nullable(),
  actual_duration_seconds: nonNegativeInt.nullable(),
  actual_distance: z.number().min(0).nullable(),
  actual_distance_unit: distanceUnitSchema.nullable(),
  weight: z.number().min(0).nullable(),
  weight_unit: weightUnitSchema,
  rpe: z.number().min(1).max(10).nullable(),
  is_warmup_set: z.boolean(),
  created_at: timestamp,
})

/**
 * `block_results` (DATA-01d §3). One row per block that was performed, written
 * by the EXE-01 shell and by nothing else — every structure type records its
 * outcome through the same path, which is why `perceived_effort` sits here
 * rather than in six renderers.
 *
 * Every outcome column is nullable and every one of them admits zero, for the
 * same reason the set log's do: a structure that has no rounds records `null`
 * rounds, and an AMRAP that managed none records `0`. They are different
 * observations and OVR-03 reads them as different observations.
 */
export const blockResultRowSchema = z.object({
  id: z.uuid(),
  block_id: z.uuid(),
  elapsed_seconds: nonNegativeInt.nullable(),
  completed_under_cap: z.boolean().nullable(),
  rounds_completed: nonNegativeInt.nullable(),
  partial_round_reps: nonNegativeInt.nullable(),
  minutes_completed: nonNegativeInt.nullable(),
  highest_rung: nonNegativeInt.nullable(),
  // OVR-03's input, 1–10, mirroring `block_results_perceived_effort_range`.
  perceived_effort: z.int().min(1).max(10).nullable(),
  notes: z.string().nullable(),
  created_at: timestamp,
})

/**
 * The coaching half of an `exercise_definitions` row (DATA-01a), as EXE-05's
 * panel reads it.
 *
 * Four columns of the catalog's many, because they are the four the panel says:
 * the library is the one place a cue or a regression is authored, and a screen
 * that hydrated the rest of the row would be inviting a second copy of facts
 * that already have an owner (GENERATION_CONTRACT §8).
 *
 * `coaching_cues` is `text[] NOT NULL DEFAULT '{}'`, so an empty array is a real
 * answer — an exercise nobody has written cues for — and never a missing read.
 * `regression` and `progression` are nullable for the same reason: the easier
 * variant of a dead hang is not a thing the library claims to know.
 */
export const exerciseDefinitionRowSchema = z.object({
  id: nonBlank,
  name: nonBlank,
  coaching_cues: z.array(z.string()),
  regression: z.string().nullable(),
  progression: z.string().nullable(),
})

/**
 * `exercise_catalog` (DATA-01a §7) — the same definition plus the two facts
 * only the view assembles, as GEN-02c's hydration reads them.
 *
 * It extends the definition rather than restating it because they are the same
 * row: the panel reads five columns of it and hydration reads seven, and a
 * second declaration of `name` is a second chance for the two to disagree.
 *
 * `equipment_display_names` is `jsonb NOT NULL DEFAULT '{}'` — a map from an
 * equipment slug to what the exercise is *called* with it ("Barbell Strict
 * Press"), not a name for the equipment. An exercise with no entry for the
 * equipment chosen keeps its own name, so the empty map is a complete answer
 * and never a missing one.
 */
export const exerciseCatalogRowSchema = exerciseDefinitionRowSchema.extend({
  equipment_display_names: z.record(z.string(), z.string()),
  muscles: z.array(
    z.object({ muscle: nonBlank, role: z.enum(Constants.public.Enums.muscle_role) }),
  ),
})

/**
 * What `session_snapshot` answers: the session as it currently stands, with
 * the sets already logged against each active prescription. Nested rather than
 * four flat lists because the nesting is the structure — a block's members are
 * the block's, and a screen that had to re-join them could get it wrong.
 */
export const sessionSnapshotSchema = z.object({
  session: workoutSessionRowSchema,
  state: sessionStateSchema,
  sections: z.array(
    z.object({
      section: workoutSectionRowSchema,
      blocks: z.array(
        z.object({
          block: workoutBlockRowSchema,
          exercises: z.array(
            z.object({
              exercise: workoutExerciseRowSchema,
              set_logs: z.array(exerciseSetLogRowSchema),
            }),
          ),
        }),
      ),
    }),
  ),
})

// ─────────────────────────────────────────────────────────────────────────────
// Session reconstruction — SES-01b
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which of DATA_MODEL §7's three questions an answer answers. The vocabulary
 * is the database's `reconstruction_kind` type rather than a list written
 * again here, so a fourth reconstruction cannot be invented on this side.
 */
export const reconstructionKindSchema = z.enum(Constants.public.Enums.reconstruction_kind)

/**
 * What `session_as_generated`, `session_as_intended_at_start` and
 * `session_as_performed` all answer. One shape for the three, because the
 * three differ by a predicate and a caller holding two of them is entitled to
 * compare them field for field.
 *
 * Two fields the present-tense snapshot has no use for:
 *
 *   * `reconstruction` — which question this answers, so a payload that has
 *     been passed around still says what it is.
 *   * `as_of` — the instant it resolves at. Null only for
 *     `intended_at_start` on a session that was never started, where it is the
 *     reason the exercises are empty rather than a gap in the data.
 *
 * `block_result` is null until the block is scored, and `set_logs` are the
 * ones attached to *that* prescription — which is the whole of D6: after a
 * swap they hang off the substitute, and the original comes back beside it
 * carrying its lineage and an empty array.
 */
export const sessionReconstructionSchema = z.object({
  reconstruction: reconstructionKindSchema,
  as_of: timestamp.nullable(),
  session: workoutSessionRowSchema,
  state: sessionStateSchema,
  sections: z.array(
    z.object({
      section: workoutSectionRowSchema,
      blocks: z.array(
        z.object({
          block: workoutBlockRowSchema,
          block_result: blockResultRowSchema.nullable(),
          exercises: z.array(
            z.object({
              exercise: workoutExerciseRowSchema,
              set_logs: z.array(exerciseSetLogRowSchema),
            }),
          ),
        }),
      ),
    }),
  ),
})

/**
 * A page of `streak_sessions(...)` (SES-01c): one completed session each, in
 * the three columns a streak is derived from. `completed_at` is not nullable
 * here where the row schema has it nullable, because the function's own
 * `completed_at is not null` means a row that arrives without one is a
 * malformed read rather than an unfinished session.
 *
 * No day, no count, no total: the shape says as plainly as a type can that
 * the database was asked for sessions and not for a streak.
 */
export const streakSessionRowSchema = z.object({
  session_id: z.uuid(),
  completed_at: timestamp,
  counts_for_streak: z.boolean(),
})

export const streakSessionPageSchema = z.array(streakSessionRowSchema)

/**
 * HOME-02's marked rest day: why a day the user took off was taken off.
 *
 * `day` is a date and not a timestamp, exactly as the column is — the row
 * records a decision about a calendar day in the user's own zone, and an
 * instant would make the reader decide again which day was meant.
 */
export const restDayReasonSchema = z.enum(Constants.public.Enums.rest_day_reason)

export const restDayRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  day: z.iso.date(),
  reason: restDayReasonSchema,
  note: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const restDayPageSchema = z.array(restDayRowSchema)

/**
 * The write, validated before it is sent. The note's ceiling is the one every
 * other piece of user prose in this file uses; the column is unbounded `text`,
 * and an app that accepts any length has no answer for a pasted novel.
 */
export const restDayMarkSchema = z.object({
  day: z.iso.date(),
  reason: restDayReasonSchema,
  note: z.string().max(2000).nullable(),
})

/**
 * SUM-01's write: the two columns the debrief owns on `workout_sessions`.
 *
 * Both are nullable and both mean the same thing when they are null — not
 * answered. `workout_sessions_mood_range` is the same 1–5 in SQL, so a mood
 * this refuses is a mood the database would have refused too, and the screen
 * hears it before a round trip rather than as a constraint violation after
 * one. The note's ceiling is the one `generationRequestSchema` already uses
 * for user prose: the column is unbounded `text`, and an app that will accept
 * any length is an app with no answer for a paste of a novel.
 */
export const sessionDebriefSchema = z.object({
  mood: z.int().min(1).max(5).nullable(),
  session_notes: z.string().max(2000).nullable(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Favorites — FAV-01
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a favorite stores: an acceptance payload without its date.
 *
 * A snapshot is the composed workout plus the facts it was composed under —
 * exactly what Review renders and exactly what `persist_session` takes — so it
 * is `sessionAcceptanceSchema` rather than a second description of the same
 * thing, and a restart is a parse followed by a normal acceptance. The one
 * field that is dropped is `date`: a favorite is performed on the day it is
 * restarted, and storing the original day would restart a workout into the
 * past.
 *
 * Strict, like the payload it is taken from: a key nothing reads is a fact the
 * user believes was kept.
 */
export const workoutSnapshotSchema = sessionAcceptanceSchema.omit({ date: true })

/**
 * The snapshot schemas this build can read, keyed by the version a row states
 * (DATA_MODEL §11).
 *
 * The registry is the whole of "validated against the schema for **that**
 * version". A favorite carries `snapshot_contract_version` because the shape
 * of a workout changes — structured prescriptions already changed it once —
 * and restoring against whatever the app currently parses would either fail
 * deep inside a screen or, worse, succeed with fields silently missing.
 *
 * One entry today. When contract 5 lands, its schema joins this map and 4.1.0
 * either stays (still restorable) or leaves (restorable no longer, and every
 * favorite saved under it says so in one clear sentence instead of failing
 * obscurely). That is a decision made in this file, visibly, rather than a
 * behaviour that emerges from a parse error.
 */
export const SNAPSHOT_SCHEMAS: Readonly<Record<string, typeof workoutSnapshotSchema>> = {
  [CONTRACT_VERSION]: workoutSnapshotSchema,
}

/** The schema for a stated version, or `null` when this build cannot read it. */
export function snapshotSchemaFor(version: string): typeof workoutSnapshotSchema | null {
  return SNAPSHOT_SCHEMAS[version] ?? null
}

/**
 * `saved_workouts` (favorites-v2 §Schema).
 *
 * `workout_snapshot` is `unknown` here and that is deliberate: this schema
 * parses the *row*, and the document inside it is parsed separately against
 * the schema its own `snapshot_contract_version` names. Parsing both together
 * would make an unreadable snapshot into an unreadable favorite — the list
 * could not draw the row, and the user would be told nothing about why.
 *
 * The four metadata columns mirror the table's CHECK constraints, so a row
 * that parses is one the database can hold.
 */
export const savedWorkoutRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  original_session_id: z.uuid().nullable(),
  workout_snapshot: z.unknown(),
  snapshot_contract_version: nonBlank,
  title: nonBlank,
  session_focus: sessionFocusSchema,
  intensity: z.int().min(1).max(10),
  duration_mins: positiveInt,
  times_completed: nonNegativeInt,
  last_completed_at: timestamp.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
})

/** The favorites tab's read: newest first, and an empty list is an answer. */
export const savedWorkoutListSchema = z.array(savedWorkoutRowSchema)

/**
 * `saved_workout_completions` (favorites-v2 §Schema) — one attempt at a
 * favorite, as FAV-02's progression read walks them.
 *
 * `completed_at` is nullable and the null is load-bearing: an attempt that was
 * started and abandoned is a row without one, which is what keeps
 * `times_completed` to full completions (favorites-v2 §Incomplete Attempt) and
 * what tells a progression read which sessions it is entitled to compare.
 */
export const savedWorkoutAttemptRowSchema = z.object({
  id: z.uuid(),
  saved_workout_id: z.uuid(),
  session_id: z.uuid(),
  started_at: timestamp,
  completed_at: timestamp.nullable(),
})

/** Every attempt at one favorite. An empty list is a favorite never started. */
export const savedWorkoutAttemptListSchema = z.array(savedWorkoutAttemptRowSchema)

/**
 * What `save_favorite` is called with: the snapshot, the version it was
 * written under, and the metadata the list states.
 *
 * Strict, like every other write that becomes a transaction. The title, focus,
 * intensity and duration are also inside the snapshot; they are sent
 * separately because the list reads them as columns, and because they must go
 * on meaning what they meant the day the favorite was saved.
 */
export const savedWorkoutDraftSchema = z.strictObject({
  original_session_id: z.uuid(),
  workout_snapshot: workoutSnapshotSchema,
  snapshot_contract_version: nonBlank,
  title: nonBlank,
  session_focus: sessionFocusSchema,
  intensity: z.int().min(1).max(10),
  duration_mins: positiveInt,
})

/**
 * What the two favorite functions answer with, in the same vocabulary the
 * lifecycle functions use and for the same reason: an outcome is an event, and
 * a function that raised would cross PostgREST as a Postgres message.
 *
 * `not_a_favorite` is the ordinary answer rather than a refusal — completion
 * asks about every session, because nothing should have to remember where a
 * session came from.
 */
export const FAVORITE_OUTCOMES = [
  'saved',
  'already_saved',
  'recorded',
  'not_completed',
  'not_a_favorite',
  'session_not_found',
] as const
export const favoriteOutcomeSchema = z.enum(FAVORITE_OUTCOMES)

export const favoriteResultSchema = z.object({
  outcome: favoriteOutcomeSchema,
  favorite: savedWorkoutRowSchema.nullish(),
})

/**
 * What `/review` is handed, as route state (FAV-01).
 *
 * A contract rather than an internal value, and it lives here for the reason
 * every other contract does: React Router's history state is written by
 * `history.pushState`, which is a public API — a user can edit an entry, and a
 * back/forward entry outlives the render that created it and can outlive the
 * deploy that understood it. So an arriving `/review` payload is parsed on read
 * like any other boundary, and `src/state/review-handoff.ts` is the two
 * functions that do it.
 *
 * Not strict, deliberately: a later requirement adding a key to its own
 * hand-off into this screen must not make this one refuse to render.
 * `savedWorkoutId` is the favorite the composition was restored from, and its
 * absence is the honest description of a workout that belongs to no favorite.
 */
export const reviewHandoffSchema = z.object({
  acceptance: sessionAcceptanceSchema,
  savedWorkoutId: z.uuid().nullable().default(null),
})

/**
 * Contract-only vocabulary, and the third exception to "no second vocabulary".
 * These are what the lifecycle functions answer with, and no column holds one:
 * a transition's outcome is an event, not a stored fact. They are text in the
 * returned `jsonb` rather than an enum type because an enum inside `jsonb` is
 * not enforced by Postgres anyway, and a vocabulary that looks enforced but is
 * not is worse than one that is honestly parsed here.
 *
 * The three refusals are the reason these functions do not raise: an exception
 * crosses PostgREST as a 400 carrying a Postgres message, and CORE-01's
 * envelope cannot turn that back into a typed code (the same reasoning GEN-02a
 * settled for retrieval).
 */
export const SESSION_OUTCOMES = [
  'started',
  'completed',
  'abandoned',
  'swapped',
  'not_found',
  'already_active',
  'invalid_transition',
] as const
export const sessionOutcomeSchema = z.enum(SESSION_OUTCOMES)

/**
 * A lifecycle call's answer. `session` is present on everything except
 * `not_found`, `active_session_id` names the session that is already running,
 * and `event` and `state` say which transition was refused and from where —
 * which is what turns "invalid transition" into a message a screen can write.
 */
export const sessionTransitionSchema = z.object({
  outcome: sessionOutcomeSchema,
  event: z.string().optional(),
  state: sessionStateSchema.nullish(),
  active_session_id: z.uuid().nullish(),
  session: workoutSessionRowSchema.nullish(),
  exercise: workoutExerciseRowSchema.nullish(),
  superseded: workoutExerciseRowSchema.nullish(),
})

/**
 * `swap_session_block`'s answer (REV-02): one unit swap, and one transition per
 * member of the block it revised.
 *
 * `slot_mismatch` is the fourth refusal and belongs to this function alone —
 * the payload did not name exactly the block's active members, which is a
 * caller defect rather than a session state. It refuses rather than raising for
 * the reason the lifecycle functions do, and it refuses *before* writing
 * anything, because a unit swap that had already revised half the block is the
 * state the function exists to make unreachable.
 */
export const BLOCK_SWAP_OUTCOMES = [
  'swapped',
  'not_found',
  'invalid_transition',
  'slot_mismatch',
] as const
export const blockSwapOutcomeSchema = z.enum(BLOCK_SWAP_OUTCOMES)

export const blockSwapResultSchema = z.object({
  outcome: blockSwapOutcomeSchema,
  event: z.string().optional(),
  state: sessionStateSchema.nullish(),
  block_id: z.uuid().nullish(),
  /** In the order the block holds its members, one entry each. */
  revisions: z.array(sessionTransitionSchema).nullish(),
})

/**
 * A row of `anchor_evidence(...)` (OVR-01a): one working set that is allowed to
 * move a load anchor, with the target read from the prescription it was logged
 * against.
 *
 * Every measurement is nullable and stays nullable here. The function
 * deliberately does not drop a set that recorded no RPE or no weight — §1 skips
 * those for the e1RM candidate, while rep completion still counts them — so a
 * schema that demanded them would reject exactly the rows the second answer
 * needs. `prescribed_reps` is null when the prescription had no target for that
 * set number, which is one set past the end of a ladder.
 */
export const anchorEvidenceRowSchema = z.object({
  session_id: z.uuid(),
  session_date: z.iso.date(),
  logged_at: timestamp,
  exercise_id: nonBlank,
  equipment_used: nonBlank,
  set_number: positiveInt,
  actual_reps: nonNegativeInt.nullable(),
  prescribed_reps: nonNegativeInt.nullable(),
  weight: z.number().min(0).nullable(),
  weight_unit: weightUnitSchema,
  rpe: z.number().min(1).max(10).nullable(),
})

export const anchorEvidenceSchema = z.array(anchorEvidenceRowSchema)

/** How much history an anchor rests on (§5), as the enum SQL stores. */
export const anchorConfidenceSchema = z.enum(Constants.public.Enums.anchor_confidence)

/**
 * One derived anchor, in the shape `set_load_anchors(...)` reads out of its
 * `jsonb` argument. Parsed on the way *out* rather than on the way in, because
 * this is the one payload in the file that `src/` composes for the database
 * rather than receives from it — and `load_anchors`' CHECK constraints are
 * exactly these bounds, so an anchor that validates is an anchor the table can
 * hold.
 */
export const loadAnchorInputSchema = z.object({
  exercise_id: nonBlank,
  equipment_used: nonBlank,
  anchor_value: z.number().positive(),
  unit: weightUnitSchema,
  confidence: anchorConfidenceSchema,
  session_count: positiveInt,
  last_session_date: z.iso.date(),
})

export const loadAnchorPayloadSchema = z.array(loadAnchorInputSchema)

/** A stored `load_anchors` row: the input, plus what the database added. */
export const loadAnchorRowSchema = loadAnchorInputSchema.extend({
  user_id: z.uuid(),
  updated_at: timestamp,
})

export const loadAnchorListSchema = z.array(loadAnchorRowSchema)

// ─────────────────────────────────────────────────────────────────────────────
// Conditioning history — OVR-03
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One active prescription of a conditioning block, as `conditioning_history`
 * aggregates it (OVR-03 §3).
 *
 * The columns are the ones a *score* and a *fingerprint* need and no others: a
 * reps-per-minute rate is reps ÷ minutes, so the target shape has to travel, and
 * "identical work" means the same exercises, the same targets, the same sides
 * and the same loads. `rest_seconds`, `tempo` and the rest are left out
 * deliberately — a caller that received them could start comparing two pieces
 * on a field §3(a) does not define identity by.
 */
export const conditioningPrescriptionSchema = z.object({
  exercise_id: nonBlank,
  order_index: nonNegativeInt,
  modality: modalitySchema,
  sets: positiveInt.nullable(),
  target_kind: targetKindSchema,
  target_value: positiveInt.nullable(),
  target_min: positiveInt.nullable(),
  target_max: positiveInt.nullable(),
  target_sequence: z.array(positiveInt).nullable(),
  per_side: z.boolean(),
  distance_unit: distanceUnitSchema.nullable(),
  load_type: loadGuidanceSchema.nullable(),
  load_value: z.number().nullable(),
  equipment_used: nonBlank,
})

/**
 * A row of `conditioning_history(...)`: one scored conditioning block, its
 * clock, its outcome and the prescription that outcome answers.
 *
 * Every measurement stays nullable, for the reason `anchor_evidence` gives: the
 * function returns the block that recorded no partial reps rather than dropping
 * it, and refusing to score what was not observed is
 * `src/state/conditioning.ts`'s job, per measurement rather than per row.
 */
export const conditioningHistoryRowSchema = z.object({
  session_id: z.uuid(),
  session_date: z.iso.date(),
  effective_intensity: z.int().min(1).max(10),
  goal_preset: goalPresetSchema.nullable(),
  section_id: z.uuid(),
  section_order: nonNegativeInt,
  block_id: z.uuid(),
  block_order: nonNegativeInt,
  structure_type: structureTypeSchema,
  rep_scheme: repSchemeSchema,
  timer_type: timerContractSchema,
  timer_seconds: positiveInt.nullable(),
  rounds: positiveInt.nullable(),
  round_rest_seconds: nonNegativeInt.nullable(),
  elapsed_seconds: nonNegativeInt.nullable(),
  completed_under_cap: z.boolean().nullable(),
  rounds_completed: nonNegativeInt.nullable(),
  partial_round_reps: nonNegativeInt.nullable(),
  minutes_completed: nonNegativeInt.nullable(),
  highest_rung: nonNegativeInt.nullable(),
  perceived_effort: z.int().min(1).max(10).nullable(),
  scored_at: timestamp,
  prescriptions: z.array(conditioningPrescriptionSchema),
})

export const conditioningHistorySchema = z.array(conditioningHistoryRowSchema)

// ─────────────────────────────────────────────────────────────────────────────
// Parsing at the boundary
// ─────────────────────────────────────────────────────────────────────────────

/** The root of the payload, for an issue that belongs to no single field. */
const ROOT_PATH = '(root)'

/**
 * Turns zod's issues into the list an error response carries. The path is the
 * point: "malformed prescription" is not an actionable message, and
 * `sections[2].blocks[0].exercises[1].distance_unit` is.
 */
export function schemaIssues(error: z.ZodError): SchemaIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }))
}

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return ROOT_PATH

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') return `${formatted}[${segment}]`
    return formatted === '' ? String(segment) : `${formatted}.${String(segment)}`
  }, '')
}

/**
 * Parse a boundary payload into a `Result`. Failure is a typed `AppError`
 * carrying every issue in `details.issues`, so an edge function answers a
 * malformed body with the paths that were wrong (GEN-01) and the client logs
 * the same list instead of "validation failed".
 *
 * Nothing throws: a payload from off-machine is expected to be wrong
 * sometimes, and an expected failure is a value rather than an exception.
 */
export function parseBoundary<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  options?: { code?: ErrorCode; requestId?: string },
): Result<T, AppError> {
  const parsed = schema.safeParse(payload)

  if (parsed.success) return ok(parsed.data)

  return err(
    createError(options?.code ?? ErrorCode.VALIDATION_CONSTRAINT, {
      requestId: options?.requestId,
      details: { issues: schemaIssues(parsed.error) },
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────────────────────────────────────
//
// Inferred, never written twice. A hand-written interface beside a schema is
// two declarations of one contract, and the one the compiler checks is not the
// one the runtime enforces.

export type Prescription = z.infer<typeof prescriptionSchema>
export type WorkoutBlock = z.infer<typeof workoutBlockSchema>
export type WorkoutSection = z.infer<typeof workoutSectionSchema>
export type GenerationOutput = z.infer<typeof generationOutputSchema>
export type GenerationRequest = z.infer<typeof generationRequestSchema>
export type GenerationSuccess = z.infer<typeof generationSuccessSchema>
export type ErrorResponse = z.infer<typeof errorResponseSchema>
export type GenerationFailure = z.infer<typeof generationFailureSchema>
export type GenerationErrorResponse = z.infer<typeof generationErrorResponseSchema>
export type SchemaIssue = z.infer<typeof schemaIssueSchema>
export type GenerationResponse = z.infer<typeof generationResponseSchema>
export type SwapMode = z.infer<typeof swapModeSchema>
export type SwapRequest = z.infer<typeof swapRequestSchema>
export type SwapRevision = z.infer<typeof swapRevisionSchema>
export type SwapSuccess = z.infer<typeof swapSuccessSchema>
export type SwapResponse = z.infer<typeof swapResponseSchema>
export type Profile = z.infer<typeof profileSchema>
export type ProfilePreferences = z.infer<typeof profilePreferencesSchema>
export type Location = z.infer<typeof locationSchema>
export type LocationDraft = z.infer<typeof locationDraftSchema>
export type LocationSetup = z.infer<typeof locationSetupSchema>
export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>
export type OnboardingCommit = z.infer<typeof onboardingCommitSchema>
export type UserConstraintRow = z.infer<typeof userConstraintRowSchema>
export type SessionAcceptance = z.infer<typeof sessionAcceptanceSchema>
export type WorkoutSessionRow = z.infer<typeof workoutSessionRowSchema>
export type WorkoutSectionRow = z.infer<typeof workoutSectionRowSchema>
export type WorkoutBlockRow = z.infer<typeof workoutBlockRowSchema>
export type WorkoutExerciseRow = z.infer<typeof workoutExerciseRowSchema>
export type ExerciseSetLogRow = z.infer<typeof exerciseSetLogRowSchema>
export type BlockResultRow = z.infer<typeof blockResultRowSchema>
export type ExerciseDefinitionRow = z.infer<typeof exerciseDefinitionRowSchema>
export type ExerciseCatalogRow = z.infer<typeof exerciseCatalogRowSchema>
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>
export type StreakSessionRow = z.infer<typeof streakSessionRowSchema>
export type RestDayReason = z.infer<typeof restDayReasonSchema>
export type RestDayRow = z.infer<typeof restDayRowSchema>
export type RestDayMark = z.infer<typeof restDayMarkSchema>
export type AnchorEvidenceRow = z.infer<typeof anchorEvidenceRowSchema>
export type AnchorConfidence = z.infer<typeof anchorConfidenceSchema>
export type LoadAnchorInput = z.infer<typeof loadAnchorInputSchema>
export type LoadAnchorRow = z.infer<typeof loadAnchorRowSchema>
export type ConditioningPrescription = z.infer<typeof conditioningPrescriptionSchema>
export type ConditioningHistoryRow = z.infer<typeof conditioningHistoryRowSchema>
export type SessionDebrief = z.infer<typeof sessionDebriefSchema>
export type WorkoutSnapshot = z.infer<typeof workoutSnapshotSchema>
export type SavedWorkoutRow = z.infer<typeof savedWorkoutRowSchema>
export type SavedWorkoutDraft = z.infer<typeof savedWorkoutDraftSchema>
export type SavedWorkoutAttemptRow = z.infer<typeof savedWorkoutAttemptRowSchema>
export type FavoriteOutcome = z.infer<typeof favoriteOutcomeSchema>
export type FavoriteResult = z.infer<typeof favoriteResultSchema>
export type ReviewHandoff = z.infer<typeof reviewHandoffSchema>
export type ReconstructionKind = z.infer<typeof reconstructionKindSchema>
export type SessionReconstruction = z.infer<typeof sessionReconstructionSchema>
export type SessionOutcome = z.infer<typeof sessionOutcomeSchema>
export type SessionTransition = z.infer<typeof sessionTransitionSchema>
export type BlockSwapOutcome = z.infer<typeof blockSwapOutcomeSchema>
export type BlockSwapResult = z.infer<typeof blockSwapResultSchema>
export type SessionFunction = z.infer<typeof sessionFunctionSchema>
export type AnchorRelationship = z.infer<typeof anchorRelationshipSchema>
