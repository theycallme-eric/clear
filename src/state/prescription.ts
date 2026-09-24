/**
 * EXE-02 — what a prescription prescribes, read from its columns.
 *
 * The requirement's first acceptance criterion is a negative one: the renderer
 * displays the **structured prescription** and parses no string anywhere. The
 * old app stored `"3x8-10 @ RPE 7"` and re-read it with a regular expression,
 * which is how a rep range became a ladder and a per-side target silently
 * halved. So every question a renderer asks about a prescription is answered
 * here, from `target_kind`, `modality`, `sets`, `per_side` and `distance_unit`
 * — and the only string this module produces is the one the screen shows.
 *
 * The three target kinds are three shapes rather than one nullable row:
 *
 *   · **fixed** — one number, every set. `8`.
 *   · **range** — a band the user picks inside. `8–10`, with an en dash,
 *     because a hyphen there is the ladder's separator.
 *   · **sequence** — ordered rungs, one per set. `15-12-9-6-3` is five sets,
 *     and set 3 is nine reps rather than "somewhere in 9…15".
 *
 * Which *actual* a set records follows from `modality` and from nothing else
 * (DATA-01c §6): reps, seconds, or a distance in its own unit. A block that
 * prescribes a 400 m carry and a log that can only hold reps is defect D6's
 * cousin — the number is stored, its meaning is not.
 *
 * Pure and React-free, like `workout-progress.ts` beside it: every function is
 * total over a row the database could hold.
 */
import type { Enums } from '../data/database.types'
import type { WorkoutExerciseRow } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Targets
// ─────────────────────────────────────────────────────────────────────────────

/** One number, every set. */
export interface FixedTarget {
  readonly kind: 'fixed'
  readonly value: number
}

/** A band: any result inside it satisfies the set. */
export interface RangeTarget {
  readonly kind: 'range'
  readonly min: number
  readonly max: number
}

/** Ordered rungs, one per set, in the order they are performed. */
export interface SequenceTarget {
  readonly kind: 'sequence'
  readonly rungs: readonly number[]
}

export type PrescribedTarget = FixedTarget | RangeTarget | SequenceTarget

/**
 * The target a prescription carries, or `null` when its columns do not satisfy
 * the kind they claim.
 *
 * `CONSTRAINT target_shape` already forbids that combination, so `null` here is
 * a read of a row the database should not hold — and the renderer shows the set
 * without a target rather than inventing one. A thrown error would take the
 * whole session down over one malformed prescription.
 */
export function prescribedTarget(exercise: WorkoutExerciseRow): PrescribedTarget | null {
  switch (exercise.target_kind) {
    case 'fixed':
      return exercise.target_value === null
        ? null
        : { kind: 'fixed', value: exercise.target_value }

    case 'range':
      return exercise.target_min === null || exercise.target_max === null
        ? null
        : { kind: 'range', min: exercise.target_min, max: exercise.target_max }

    case 'sequence':
      return exercise.target_sequence === null || exercise.target_sequence.length === 0
        ? null
        : { kind: 'sequence', rungs: [...exercise.target_sequence] }
  }
}

/**
 * How many sets this prescription is, which is a different question from
 * `sets` alone.
 *
 * A sequence *is* its set count — `15-12-9-6-3` is five sets and always was,
 * whatever `sets` says — so the rungs win where the two disagree. Null `sets`
 * outside a sequence is one set: inside an open-ended block "how many" has no
 * answer until the clock stops (DATA-01c §6), and the renderer offers the set
 * the user is in rather than none.
 */
export function prescribedSetCount(exercise: WorkoutExerciseRow): number {
  const target = prescribedTarget(exercise)
  if (target?.kind === 'sequence') return target.rungs.length
  return exercise.sets ?? 1
}

/**
 * The target for one set, 1-based. A rung for a sequence, the same band or the
 * same number for everything else.
 */
export function targetForSet(
  exercise: WorkoutExerciseRow,
  setNumber: number,
): PrescribedTarget | null {
  const target = prescribedTarget(exercise)
  if (target === null || target.kind !== 'sequence') return target

  const rung = target.rungs[setNumber - 1]
  return rung === undefined ? null : { kind: 'fixed', value: rung }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modality
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a set of this exercise records. `time` and `distance` are not reps
 * wearing a different label: a 40-second plank and a 400 m carry each have
 * their own column in `exercise_set_logs`, and logging either as reps is the
 * quiet data loss the requirement forbids.
 */
export type PrescribedModality = Enums<'prescription_modality'>

/** The unit word for a target's number: `reps`, `sec`, or the distance unit. */
export function modalityUnit(exercise: WorkoutExerciseRow): string {
  switch (exercise.modality) {
    case 'reps':
      return 'reps'
    case 'time':
      return 'sec'
    case 'distance':
      // A distance with no unit is a number, not a measurement
      // (`CONSTRAINT distance_has_unit`). The row should not exist; if it
      // does, the number is shown without a unit it cannot vouch for.
      return exercise.distance_unit ?? ''
  }
}

/** What the log field for this modality is called, in the user's words. */
export function modalityLabel(exercise: WorkoutExerciseRow): string {
  switch (exercise.modality) {
    case 'reps':
      return 'Reps'
    case 'time':
      return 'Seconds'
    case 'distance':
      return exercise.distance_unit === null
        ? 'Distance'
        : `Distance (${exercise.distance_unit})`
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Display
// ─────────────────────────────────────────────────────────────────────────────

/** An en dash, because the hyphen is the ladder's separator. */
const RANGE_DASH = '–'

/** The numbers of a target, with no unit: `8`, `8–10`, `15-12-9-6-3`. */
export function targetNumbers(target: PrescribedTarget): string {
  switch (target.kind) {
    case 'fixed':
      return String(target.value)
    case 'range':
      return `${target.min}${RANGE_DASH}${target.max}`
    case 'sequence':
      return target.rungs.join('-')
  }
}

/**
 * The target as the screen states it: the numbers, the unit the modality
 * names, and `each side` when the prescription is per side.
 *
 * Per side is a suffix rather than a doubled number. "8 each side" and "16" are
 * different prescriptions, and the old app's habit of showing the total is how
 * a user ended up doing half the work on one leg.
 */
export function targetText(
  exercise: WorkoutExerciseRow,
  target: PrescribedTarget | null = prescribedTarget(exercise),
): string {
  if (target === null) return 'No target'

  const unit = modalityUnit(exercise)
  const numbers = targetNumbers(target)
  const measured = unit === '' ? numbers : `${numbers} ${unit}`

  return exercise.per_side ? `${measured} each side` : measured
}

/**
 * The whole prescription in one line: `3 × 8 reps`, `5 rungs · 15-12-9-6-3
 * reps`, `1 × 400 m`.
 *
 * A sequence states its rungs rather than a set count multiplied by a number,
 * because the two are not the same shape — `5 × 15-12-9-6-3` would read as
 * twenty-five sets.
 */
export function prescriptionText(exercise: WorkoutExerciseRow): string {
  const target = prescribedTarget(exercise)
  const sets = prescribedSetCount(exercise)

  if (target?.kind === 'sequence') {
    return `${target.rungs.length} rungs · ${targetText(exercise, target)}`
  }

  return `${sets} × ${targetText(exercise, target)}`
}

/**
 * The movement's name, from the only thing the session snapshot carries about
 * it: `workout_exercises.exercise_id`, the catalog's slug.
 *
 * The catalog's own `display_name` is one table away and the snapshot does not
 * join it — reading `exercise_catalog` from the shell is a data flow this
 * requirement does not open. So the slug is humanised rather than interpreted:
 * nothing here reads meaning out of the string, and the day the snapshot
 * carries the display name this function is the one place that changes.
 */
export function exerciseName(exerciseId: string): string {
  return exerciseId.replaceAll('-', ' ').replaceAll('_', ' ')
}

/** Rest after this prescription, or null. Zero is never shown as `Rest: 0s`. */
export function restText(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null
  return `Rest ${seconds}s`
}
