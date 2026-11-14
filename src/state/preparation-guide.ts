/**
 * TASK-034 (REQ-034; AC-R034-01, AC-R034-02) — where a Warm-up or Cooldown
 * guide's content and approximate duration come from.
 *
 * The accepted guide (G14, C49; R01, R13) is a concise title, an approximate
 * total time and the movement names on separate lines. The owner was explicit
 * that the illustrated "~4 minutes" and three rows are an illustration and not
 * a duration or a count (R01 "Bounds", R13 "Bounds"), and that the duration and
 * counts are data rather than screenshot constants (G14). This module is the
 * definition of that data: pure, React-free and writing nothing. It adds no
 * route, component or clock. TASK-022 draws it on `/review` and `/workout`.
 *
 * Every field has one owner, and the owners are named in
 * `PREPARATION_GUIDE_SOURCES` so a test can resolve each to a real export:
 *
 *   · **Title** — `sectionTypeLabel(section_type)`: `Warm-up` or `Cooldown`,
 *     the stable label Review and the workout already share (REQ-011). The
 *     generated `section_title` ("Prepare for the press") and the
 *     `section_notes` prose are never read (R01).
 *   · **Movements** — the section's own prescriptions, every one, in the order
 *     composed: the composed workout's `blocks[].exercises[]` before
 *     acceptance (Review), and the session's active `workout_exercises` rows
 *     after it (Workout), so a swap shows its replacement in the same place.
 *     Nothing is filtered, merged, curated or added: the guide keeps the
 *     original movement selection (R01 "Retain relevant movement selection").
 *     No per-movement sets, target, load, rest or tempo is carried (R01, C49).
 *   · **Names** — `exerciseName(exercise_id)`, the catalog slug reader every
 *     movement row in Review and the workout uses. When the snapshot carries
 *     the catalog's display name, that function is the one place to change.
 *   · **Count** — the number of movements listed, and nothing else.
 *   · **Approximate time** — GEN-06's own section estimate
 *     (`estimateDuration` in `supabase/functions/_shared/duration.ts`, §7):
 *     the section's blocks and prescriptions, its fixed work-per-set and
 *     transition allowances, rest counted as prescribed. This module adds no
 *     second duration model and no constant of its own. It rounds the seconds
 *     to whole minutes, at least one, and states them as approximate (`~N
 *     minutes`). It never reads the model's `estimated_duration_mins`, the
 *     session's `computed_duration_mins` or the effective target, which stays
 *     Overview's Duration (REV-01).
 *
 * Limitation, recorded rather than hidden: §7's allowance is deliberately
 * crude (a timed hold counts as one fixed working set), so this is an
 * approximation in the owner's own word, not a prediction. Changing the rule
 * is a change to GEN-06's model or to this one reading, never a constant in a
 * consumer. The contract is `docs/specs/PREPARATION_GUIDE_CONTRACT.md`.
 *
 * A reading is one of four states (CORE-04's vocabulary): `loading` and
 * `error` follow the source the consumer already reads; `missing` says why
 * there is no guide (no workout, no such section, no active movement), never
 * an empty guide; `ready` carries the guide.
 */
import { estimateDuration } from '../../supabase/functions/_shared/duration.ts'
import type { Enums } from '../data/database.types'
import { createError, err, ErrorCode, isErr, ok, type AppError, type Result } from './errors'
import { sectionTypeLabel } from './onboarding'
import { exerciseName } from './prescription'
import type { QueryState } from './query'
import type {
  GenerationOutput,
  Prescription,
  SessionSnapshot,
  WorkoutBlock,
  WorkoutSection,
} from './schemas'
import { prescriptionFor } from './swap'

// ─────────────────────────────────────────────────────────────────────────────
// The guide
// ─────────────────────────────────────────────────────────────────────────────

/** The two preparation sections a guide describes. */
export const PREPARATION_SECTION_TYPES = ['warmup', 'cooldown'] as const
export type PreparationSectionType = (typeof PREPARATION_SECTION_TYPES)[number]

export function isPreparationSection(type: Enums<'section_type'>): type is PreparationSectionType {
  return (PREPARATION_SECTION_TYPES as readonly string[]).includes(type)
}

/**
 * Where the guide was read from: the composed workout Review shows before
 * acceptance, or the persisted session the live workout reads.
 */
export type PreparationOrigin = 'composed' | 'persisted'

/** One movement, by name only (R01: no per-movement weight or time). */
export interface PreparationMovement {
  /** Stable within one guide, for a list key. */
  readonly key: string
  /** The catalog slug, for whatever acts on the movement rather than names it. */
  readonly exerciseId: string
  readonly name: string
}

export interface PreparationGuide {
  readonly type: PreparationSectionType
  readonly origin: PreparationOrigin
  /** `Warm-up` or `Cooldown`: `sectionTypeLabel`, never `section_title`. */
  readonly title: string
  /** Every prescribed movement, in the order composed. */
  readonly movements: readonly PreparationMovement[]
  readonly movementCount: number
  /** GEN-06's section estimate, in seconds, before rounding. */
  readonly approximateSeconds: number
  /** Whole minutes, at least one. */
  readonly approximateMinutes: number
  /** `~N minutes` — the accepted concise reading. */
  readonly durationText: string
}

/** The accepted approximate reading: `~1 minute`, `~6 minutes`. */
export function approximateDurationText(minutes: number): string {
  return `~${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

/** Seconds to whole minutes, at least one, as GEN-06 rounds a session. */
function approximateMinutesOf(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60))
}

/**
 * GEN-06's estimate of one section, through its own `estimateDuration`. The
 * section is handed over alone, so the reading is that section's cost —
 * its blocks plus a transition per movement — with no session-level
 * transition. `estimateDuration` reads only `sections`; the title and model
 * estimate beside it are never consulted (D5).
 */
function sectionSeconds(section: WorkoutSection): number {
  const [estimate] = estimateDuration({
    title: section.section_title,
    overview: null,
    sections: [section],
    estimated_duration_mins: 1,
  }).sections
  return estimate.seconds
}

function guideOf(
  type: PreparationSectionType,
  origin: PreparationOrigin,
  section: WorkoutSection,
  keys: readonly string[],
): PreparationGuide {
  const prescriptions = section.blocks.flatMap((block) => block.exercises)
  const movements = prescriptions.map((prescription, index): PreparationMovement => ({
    key: keys[index] ?? `movement-${index}`,
    exerciseId: prescription.exercise_id,
    name: exerciseName(prescription.exercise_id),
  }))
  const approximateSeconds = sectionSeconds(section)
  const approximateMinutes = approximateMinutesOf(approximateSeconds)

  return {
    type,
    origin,
    title: sectionTypeLabel(type),
    movements,
    movementCount: movements.length,
    approximateSeconds,
    approximateMinutes,
    durationText: approximateDurationText(approximateMinutes),
  }
}

/**
 * The guide for one composed section (Review), or null for a section that is
 * not a Warm-up or Cooldown. The composed schema requires at least one block
 * and one movement, so a composed preparation section always has a guide.
 */
export function composedPreparationGuide(section: WorkoutSection): PreparationGuide | null {
  const type = section.section_type
  if (!isPreparationSection(type)) return null

  const keys = section.blocks.flatMap((block, blockIndex) =>
    block.exercises.map((_, index) => `block-${blockIndex}-movement-${index}`),
  )
  return guideOf(type, 'composed', section, keys)
}

type SnapshotSection = SessionSnapshot['sections'][number]

/**
 * The persisted section as the composed shape GEN-06 reads, from its active
 * rows only (a superseded row is not work), each converted by the same
 * `prescriptionFor` a swap and a favorite use. A row whose target columns
 * contradict its kind cannot be read without guessing, so it is an error.
 */
function composedShapeOf(
  entry: SnapshotSection,
): Result<{ section: WorkoutSection | null; keys: readonly string[] }> {
  const keys: string[] = []
  const blocks: WorkoutBlock[] = []

  for (const held of entry.blocks) {
    const exercises: Prescription[] = []
    const active = held.exercises
      .filter(({ exercise }) => exercise.revision_status === 'active')
      .sort((left, right) => left.exercise.order_index - right.exercise.order_index)

    for (const { exercise } of active) {
      const prescription = prescriptionFor(
        exercise,
        { exerciseId: exercise.exercise_id, equipment: exercise.equipment_used },
        entry.section.section_type,
      )
      if (prescription === null) {
        return err(
          createError(ErrorCode.PERSISTENCE_READ_FAILED, {
            details: { workout_exercise_id: exercise.id, reason: 'target_shape' },
          }),
        )
      }
      exercises.push(prescription)
      keys.push(exercise.slot_id)
    }

    if (exercises.length === 0) continue
    blocks.push({
      structure_type: held.block.structure_type,
      rounds: held.block.rounds,
      timer_type: held.block.timer_type,
      timer_seconds: held.block.timer_seconds,
      round_rest_seconds: held.block.round_rest_seconds,
      rep_scheme: held.block.rep_scheme,
      block_notes: held.block.block_notes,
      exercises,
      ladder_timing: held.block.ladder_timing ?? null,
    })
  }

  if (blocks.length === 0) return ok({ section: null, keys })
  return ok({
    section: {
      section_type: entry.section.section_type,
      section_title: entry.section.section_title,
      section_notes: entry.section.section_notes,
      blocks,
    },
    keys,
  })
}

/**
 * The guide for one persisted section (Workout): `ok(null)` for a section that
 * is not a Warm-up or Cooldown, or one with no active movement left.
 */
export function persistedPreparationGuide(entry: SnapshotSection): Result<PreparationGuide | null> {
  const type = entry.section.section_type
  if (!isPreparationSection(type)) return ok(null)

  const shape = composedShapeOf(entry)
  if (isErr(shape)) return shape
  if (shape.value.section === null) return ok(null)
  return ok(guideOf(type, 'persisted', shape.value.section, shape.value.keys))
}

// ─────────────────────────────────────────────────────────────────────────────
// The reading: loading, error, missing, ready
// ─────────────────────────────────────────────────────────────────────────────

/** What a consumer already holds: the composed workout, or the session. */
export type PreparationSource =
  | { readonly origin: 'composed'; readonly workout: GenerationOutput }
  | { readonly origin: 'persisted'; readonly snapshot: SessionSnapshot }

/**
 * Why there is no guide:
 *
 *   · `no-workout` — the source answered with nothing (no handoff, no session);
 *   · `not-composed` — the workout has no section of this type (switched off,
 *     or a goal that does not compose it);
 *   · `no-movements` — the section is there with no active movement.
 */
export type PreparationMissingReason = 'no-workout' | 'not-composed' | 'no-movements'

export type PreparationGuideReading =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: AppError }
  | { readonly status: 'missing'; readonly type: PreparationSectionType; readonly reason: PreparationMissingReason }
  | { readonly status: 'ready'; readonly guide: PreparationGuide }

/**
 * The Warm-up or the Cooldown of a workout, following the source's own state.
 * The first section of the type is the one read: each enabled section is
 * composed once. A consumer drawing every section calls
 * `composedPreparationGuide` / `persistedPreparationGuide` per section.
 */
export function preparationGuideReading(
  source: QueryState<PreparationSource | null>,
  type: PreparationSectionType,
): PreparationGuideReading {
  if (source.status === 'loading') return { status: 'loading' }
  if (source.status === 'error') return { status: 'error', error: source.error }

  const data = source.data
  const missing = (reason: PreparationMissingReason): PreparationGuideReading => ({
    status: 'missing',
    type,
    reason,
  })
  if (data === null) return missing('no-workout')

  if (data.origin === 'composed') {
    const section = data.workout.sections.find((candidate) => candidate.section_type === type)
    if (section === undefined) return missing('not-composed')
    const guide = composedPreparationGuide(section)
    return guide === null || guide.movementCount === 0 ? missing('no-movements') : { status: 'ready', guide }
  }

  const entry = data.snapshot.sections.find((candidate) => candidate.section.section_type === type)
  if (entry === undefined) return missing('not-composed')
  const guide = persistedPreparationGuide(entry)
  if (isErr(guide)) return { status: 'error', error: guide.error }
  return guide.value === null ? missing('no-movements') : { status: 'ready', guide: guide.value }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source ownership
// ─────────────────────────────────────────────────────────────────────────────

/** A field of the guide, and the one owner it is read from. */
export interface PreparationGuideSource {
  readonly field: 'title' | 'movements' | 'name' | 'movementCount' | 'approximateTime'
  /** Both origins, or the one this owner serves. */
  readonly origin: PreparationOrigin | 'both'
  /** Repository path of the owning module. */
  readonly module: string
  /** The owning export. */
  readonly exportName: string
  /** What the owner reads. */
  readonly reads: readonly string[]
  /** What the reading must never be built from. */
  readonly neverReads: readonly string[]
}

/** Per-movement prescription columns a guide never states (R01, C49). */
const PRESCRIPTION_DETAIL = [
  'sets',
  'target_value',
  'target_min',
  'target_max',
  'target_sequence',
  'per_side',
  'rest_seconds',
  'tempo',
  'load_type',
  'load_value',
] as const

export const PREPARATION_GUIDE_SOURCES: readonly PreparationGuideSource[] = [
  {
    field: 'title',
    origin: 'both',
    module: 'src/state/onboarding.ts',
    exportName: 'sectionTypeLabel',
    reads: ['section_type'],
    neverReads: ['section_title', 'section_notes'],
  },
  {
    field: 'movements',
    origin: 'composed',
    module: 'src/state/schemas.ts',
    exportName: 'sessionAcceptanceSchema',
    reads: ['workout.sections[].blocks[].exercises[].exercise_id'],
    neverReads: [...PRESCRIPTION_DETAIL],
  },
  {
    field: 'movements',
    origin: 'persisted',
    module: 'src/state/schemas.ts',
    exportName: 'sessionSnapshotSchema',
    reads: ['workout_exercises.exercise_id (revision_status active, by order_index)'],
    neverReads: [...PRESCRIPTION_DETAIL, 'exercise_notes'],
  },
  {
    field: 'movements',
    origin: 'persisted',
    module: 'src/state/swap.ts',
    exportName: 'prescriptionFor',
    reads: ['workout_exercises row → composed prescription'],
    neverReads: [],
  },
  {
    field: 'name',
    origin: 'both',
    module: 'src/state/prescription.ts',
    exportName: 'exerciseName',
    reads: ['exercise_id (catalog slug)'],
    neverReads: ['equipment', 'session_function'],
  },
  {
    field: 'movementCount',
    origin: 'both',
    module: 'src/state/preparation-guide.ts',
    exportName: 'composedPreparationGuide',
    reads: ['movements'],
    neverReads: [],
  },
  {
    field: 'approximateTime',
    origin: 'both',
    module: 'supabase/functions/_shared/duration.ts',
    exportName: 'estimateDuration',
    reads: ['blocks', 'prescriptions', 'WORK_PER_SET_SECONDS', 'TRANSITION_SECONDS'],
    neverReads: [
      'estimated_duration_mins',
      'computed_duration_mins',
      'effective_duration_target_mins',
      'requested_duration_mins',
    ],
  },
]
