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
 *     drift check. The two exceptions are named at their definitions.
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
export const constraintActionSchema = z.enum(Constants.public.Enums.constraint_action)
export const constraintPersistenceSchema = z.enum(Constants.public.Enums.constraint_persistence)

/**
 * `reps | time | distance`. `rounds` is not one of them and never was: an
 * exercise inside an AMRAP still prescribes reps or time *per round*, and the
 * block is what repeats (contract §5, `prescription_modality`).
 */
export const modalitySchema = z.enum(Constants.public.Enums.prescription_modality)

/**
 * Contract-only vocabulary, and the first of the two exceptions to "no second
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
})

/**
 * The CORE-01 wire error: `{ code, message, requestId }`, the same shape for
 * every function. `code` is the taxonomy in `src/state/errors.ts` rather than
 * a string, so a client can branch on it; the contract's own §9 code list
 * (`generation.malformed_prescription` and friends) names failures the
 * taxonomy spells `GENERATION_*`, and reconciling the two lists is GEN-01's
 * call to make once it owns the responses.
 */
export const errorResponseSchema = z.strictObject({
  code: z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]),
  message: nonBlank,
  requestId: requestIdSchema,
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
// Parsing at the boundary
// ─────────────────────────────────────────────────────────────────────────────

/** One failure, flattened to the two things a caller can act on. */
export interface SchemaIssue {
  /** Dotted path with array indices — `sections[0].blocks[0].exercises[2].sets`. */
  readonly path: string
  readonly message: string
}

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
export type GenerationResponse = z.infer<typeof generationResponseSchema>
export type Profile = z.infer<typeof profileSchema>
export type Location = z.infer<typeof locationSchema>
export type UserConstraintRow = z.infer<typeof userConstraintRowSchema>
export type SessionFunction = z.infer<typeof sessionFunctionSchema>
export type AnchorRelationship = z.infer<typeof anchorRelationshipSchema>
