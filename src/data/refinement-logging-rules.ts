/**
 * TASK-030's pure rules for the richer timed fields, in a module of their own
 * (TASK-015, REQ-015).
 *
 * `refinement-logging-contract.ts` is the matrix — the 16 moments, every
 * field and every proposed path, as data the TASK-030 check binds to the real
 * code — and it re-exports everything here under the same names, so the
 * contract is still one module to read and to test against. The rules live
 * apart because the shipped graph now runs them: the shell's one completion
 * path (`src/state/block-completion-provider.tsx`, through
 * `src/state/timed-results.ts`) decides each movement's round and row with
 * them, and the timed log draws its fields by them. The matrix's tables are
 * built by function calls, which Rollup keeps whenever the module is reached
 * (TASK-032 measured it), so a shipped import of the contract would carry the
 * whole inventory into the workout bundle for nothing it uses.
 *
 * Nothing here is new behaviour: every function below is TASK-030's, moved
 * verbatim (`partialRoundFor`, `loadApplies`, `movementActualFromDraft`,
 * `draftsAfterProgressChange` and their types), plus three small readers of
 * the same rules for the log's fields (`movementAmountMax`,
 * `isMovementActualDraft`, `movementEntryBlank`).
 */
import type { Enums } from './database.types'
import type { BlockOutcome } from '../state/block-completion'
import { createError, err, ErrorCode, ok, type Result } from '../state/errors'
import type { PrescribedColumns } from '../state/prescription'
import { incrementFor } from '../state/progression'
import type { WorkoutBlockRow } from '../state/schemas'
import { setLogViolation, type SetLogEntry } from '../state/set-logging'

// ─────────────────────────────────────────────────────────────────────────────
// The proposed timed contract, as pure functions
// ─────────────────────────────────────────────────────────────────────────────

/** The four timed-result families of the accepted `TimedResultLog`. */
export type TimedFamily = 'emom' | 'amrap' | 'for_time' | 'ladder'

/**
 * What the round identity of a per-movement partial is read from: the block's
 * own reported outcome (`amrapOutcome`, `forTimeOutcome`, the ladder's
 * outcome), never a planned target. The ladder's rung count and the For Time
 * block's `workout_blocks.rounds` are the block's structure — how many rungs
 * or passes exist — read only to know whether a round is left (and, for For
 * Time, whether the race is a single pass); neither ever supplies the round.
 */
export type PartialRoundInput =
  | { readonly family: 'emom' }
  | { readonly family: 'amrap'; readonly outcome: BlockOutcome }
  | { readonly family: 'for_time'; readonly outcome: BlockOutcome; readonly block: Pick<WorkoutBlockRow, 'rounds'> }
  | { readonly family: 'ladder'; readonly outcome: BlockOutcome; readonly rungCount: number }

/**
 * The round a movement's partial amount belongs to, or `null` when no partial
 * applies.
 *
 *   · EMOM: never (the schedule is assumed; only loads are logged).
 *   · AMRAP: the round after the recorded rounds. Unrecorded rounds give no
 *     identity — a partial cannot be attached to a round nobody counted, and
 *     null is never read as zero. An explicit 0 rounds gives round 1.
 *   · For Time, only when the athlete answered Incomplete (none when Complete
 *     or unanswered). `workout_blocks.rounds` is nullable and unrestricted for
 *     For Time, so a race may have several rounds:
 *       – with a recorded completed-rounds count (`roundsCompleted`, which
 *         `conditioningScore` already reads for a capped For Time), the round
 *         after it, while one is left;
 *       – with none, round 1 only for a single pass (`rounds` null or 1) — the
 *         one round there is. A multi-round race with no recorded count has
 *         no identity: `forTimeOutcome` records no count today, and where the
 *         athlete stopped is never guessed (TASK-015's open decision).
 *   · Ladder: the rung after the last completed one, when one is left; none
 *     when Complete (the top rung) or when no rung was recorded.
 */
export function partialRoundFor(input: PartialRoundInput): number | null {
  switch (input.family) {
    case 'emom':
      return null
    case 'amrap': {
      const rounds = input.outcome.roundsCompleted
      return rounds === undefined ? null : rounds + 1
    }
    case 'for_time': {
      if (input.outcome.completedUnderCap !== false) return null
      const passes = input.block.rounds ?? 1
      const through = input.outcome.roundsCompleted
      if (through === undefined) return passes === 1 ? 1 : null
      const next = through + 1
      return next <= passes ? next : null
    }
    case 'ladder': {
      const through = input.outcome.highestRung
      if (through === undefined) return null
      const next = through + 1
      return next <= input.rungCount ? next : null
    }
  }
}

/**
 * Whether an actual load can attach to this movement: the set logger's base
 * rule for load fields (`incrementFor(equipment_used)` not null — loaded
 * equipment), so a timed movement and a set of the same movement agree. The
 * accepted gallery's predicate was an approximation of it; this one is the
 * application's.
 *
 * The set logger's `showLoad` also shows load fields on unloaded equipment when
 * a weight is carried forward from that movement's earlier set or the set being
 * corrected already has one, so a recorded weight stays visible and correctable.
 * That exception has no counterpart here: a timed attempt has no earlier
 * movement row to carry a weight from, and because this rule refuses a weight
 * on unloaded equipment, no saved movement row can hold one to correct.
 */
export function loadApplies(prescription: Pick<PrescribedColumnsWithEquipment, 'equipment_used'>): boolean {
  return incrementFor(prescription.equipment_used, 'kg') !== null
}

/** The prescription columns a movement actual is read against. */
export type PrescribedColumnsWithEquipment = PrescribedColumns & { readonly equipment_used: string }

/** One movement's entry as the accepted log holds it: text, as typed. */
export interface MovementActualDraft {
  readonly amount: string
  readonly weight: string
}

/** MIG-B's draft row, before TASK-031 generates its types. */
export interface ProposedMovementActualRow {
  readonly id: string
  readonly workout_exercise_id: string
  readonly round_number: number | null
  readonly actual_reps: number | null
  readonly actual_duration_seconds: number | null
  readonly actual_distance: number | null
  readonly actual_distance_unit: Enums<'distance_unit'> | null
  readonly weight: number | null
  readonly weight_unit: Enums<'weight_unit'>
}

export interface MovementActualInput {
  /** Client-minted, so a retried write collides instead of duplicating. */
  readonly id: string
  /** `workout_exercises.id` — the movement as performed in this block. */
  readonly workoutExerciseId: string
  readonly prescription: PrescribedColumnsWithEquipment
  /** From `partialRoundFor`; null means no partial applies. */
  readonly partialRound: number | null
  /** Stamped at write time: the athlete's choice, else the profile's unit. */
  readonly weightUnit: Enums<'weight_unit'>
  readonly draft: MovementActualDraft
}

/** Blank is not recorded; anything else must be a number, which may be zero. */
function typed(text: string): number | undefined {
  const trimmed = text.trim()
  return trimmed === '' ? undefined : Number(trimmed)
}

function refused(field: string, extra: Record<string, unknown> = {}): Result<never> {
  return err(createError(ErrorCode.VALIDATION_OUT_OF_RANGE, { details: { field, ...extra } }))
}

/**
 * The movement's ladder target at a rung — the accepted log's input `max` —
 * or null where no source bounds the amount (AMRAP, For Time).
 */
function rungTarget(prescription: PrescribedColumns, round: number): number | null {
  if (prescription.target_kind === 'sequence') return prescription.target_sequence?.[round - 1] ?? null
  return prescription.target_kind === 'fixed' ? prescription.target_value : null
}

/**
 * One movement's entry → MIG-B's row, `ok(null)` when nothing was observed (no
 * row is written), or the field it is refused on.
 *
 * Every rule here is an existing one, applied to the new identity:
 *
 *   · the amount goes to the column of the prescription's modality, with the
 *     prescription's own distance unit, and is bounded exactly as a set's
 *     measurement is (`setLogViolation`): whole non-negative reps and seconds,
 *     a non-negative distance, a non-negative weight;
 *   · blank is not recorded and zero is a measurement;
 *   · an amount needs a round (`partialRoundFor`): a partial with no round
 *     identity is refused rather than attached to a guessed one;
 *   · a load attaches only where `loadApplies`, and is never the prescribed
 *     load — nothing here reads `load_value`;
 *   · a ladder amount is bounded by that movement's target at that rung.
 */
export function movementActualFromDraft(
  input: MovementActualInput,
  family: TimedFamily,
): Result<ProposedMovementActualRow | null> {
  const amount = typed(input.draft.amount)
  const weight = typed(input.draft.weight)
  const { prescription } = input

  if (amount !== undefined && input.partialRound === null) return refused('round_number')
  if (weight !== undefined && !loadApplies(prescription)) return refused('weight', { reason: 'unloaded' })

  const measured = {
    reps: prescription.modality === 'reps' ? amount : undefined,
    durationSeconds: prescription.modality === 'time' ? amount : undefined,
    distance: prescription.modality === 'distance' ? amount : undefined,
  }
  const entry: SetLogEntry = {
    id: input.id,
    exerciseId: input.workoutExerciseId,
    blockId: '',
    distanceUnit: prescription.distance_unit,
    weightUnit: input.weightUnit,
    // The round takes set_number's positive-integer rule. A load-only row has
    // no round; 1 stands in for the check and is never written.
    performed: {
      setNumber: input.partialRound ?? 1,
      ...(measured.reps === undefined ? {} : { reps: measured.reps }),
      ...(measured.durationSeconds === undefined ? {} : { durationSeconds: measured.durationSeconds }),
      ...(measured.distance === undefined ? {} : { distance: measured.distance }),
      ...(weight === undefined ? {} : { weight }),
    },
  }
  const violation = setLogViolation(entry)
  if (violation !== null) {
    return refused(violation.field === 'set_number' ? 'round_number' : violation.field, {
      ...(violation.min === undefined ? {} : { min: violation.min }),
    })
  }

  if (family === 'ladder' && amount !== undefined && input.partialRound !== null) {
    const max = rungTarget(prescription, input.partialRound)
    if (max !== null && amount > max) return refused(fieldFor(prescription.modality), { max })
  }

  if (amount === undefined && weight === undefined) return ok(null)

  return ok({
    id: input.id,
    workout_exercise_id: input.workoutExerciseId,
    round_number: amount === undefined ? null : input.partialRound,
    actual_reps: measured.reps ?? null,
    actual_duration_seconds: measured.durationSeconds ?? null,
    actual_distance: measured.distance ?? null,
    actual_distance_unit: measured.distance === undefined ? null : prescription.distance_unit,
    weight: weight ?? null,
    weight_unit: input.weightUnit,
  })
}

function fieldFor(modality: Enums<'prescription_modality'>): string {
  return modality === 'reps' ? 'actual_reps' : modality === 'time' ? 'actual_duration_seconds' : 'actual_distance'
}

/**
 * The accepted owner's rule for a change of recorded progress: an amount
 * belongs to one round, so when the round identity changes every amount is
 * cleared — never carried to the new round — and every load is kept.
 */
export function draftsAfterProgressChange(
  drafts: Readonly<Record<string, MovementActualDraft>>,
  fromRound: number | null,
  toRound: number | null,
): Readonly<Record<string, MovementActualDraft>> {
  if (fromRound === toRound) return drafts
  return Object.fromEntries(
    Object.entries(drafts).map(([id, draft]) => [id, { amount: '', weight: draft.weight }]),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-015: the same rules, read for the log's fields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The upper bound the log states on a movement's amount field — the accepted
 * input `max` — or null where the contract bounds nothing: a ladder amount is
 * bounded by that movement's target at the round it belongs to
 * (`movementActualFromDraft` refuses more); AMRAP and For Time amounts have no
 * source-defined upper bound. A bound is a limit on the entry, never a value
 * put into it.
 */
export function movementAmountMax(prescription: PrescribedColumns, family: TimedFamily, partialRound: number | null): number | null {
  if (family !== 'ladder' || partialRound === null) return null
  return rungTarget(prescription, partialRound)
}

/** A stored movement entry is two strings and nothing else. */
export function isMovementActualDraft(value: unknown): value is MovementActualDraft {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.amount === 'string' && typeof record.weight === 'string'
}

/** Nothing typed for the movement: no amount and no load, so no row and no claim. */
export function movementEntryBlank(entry: MovementActualDraft): boolean {
  return entry.amount.trim() === '' && entry.weight.trim() === ''
}
