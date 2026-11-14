/**
 * EXE-01 — block completion, which the shell owns and the renderers do not.
 *
 * The requirement is explicit about why this is one path rather than six: the
 * `block_results` write belongs to the shell, and each renderer (EXE-03,
 * EXE-04a…c) reports only the fields its structure actually observed. An EMOM
 * knows `minutes_completed`, an AMRAP knows `rounds_completed` and
 * `partial_round_reps`, a For Time knows `elapsed_seconds` and
 * `completed_under_cap`, a ladder knows `highest_rung`. None of them writes a
 * row, and none of them decides when the block is complete.
 *
 * REQ-013 makes that decision the section's: one forward action saves every
 * block's latest report as its explicit completion, then continues. Effort is
 * no longer asked (E04); `perceived_effort` stays a nullable column, so the
 * same writer could carry it again if collection were ever restored.
 *
 * `BlockOutcome` is deliberately a sparse record rather than a union over
 * structure types. An outcome's *columns* are structure-specific; what the
 * shell does with them is not, and a union would make the shell branch on the
 * structure it exists to be indifferent to. An absent field is `null` — "not
 * observed" — and every field admits zero, because an AMRAP with no completed
 * rounds and an AMRAP nobody recorded are different facts (DATA_MODEL §8).
 */
import { createContext, use } from 'react'

import type { Enums, TablesInsert, TablesUpdate } from '../data/database.types.ts'
import type { MovementActualDraft, TimedFamily } from '../data/refinement-logging-rules'
import type { Result } from './errors'
import type { BlockMovementResultRow, BlockResultRow } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** `block_results_perceived_effort_range`, mirrored. OVR-03's input. */
export const PERCEIVED_EFFORT_MIN = 1
export const PERCEIVED_EFFORT_MAX = 10

/**
 * The outcome a renderer supplies. Every field is optional, and omitting one
 * records `null` rather than a zero the structure never observed.
 */
export interface BlockOutcome {
  /** How long the block took, for every timed structure. */
  readonly elapsedSeconds?: number
  /** For Time: finished before the cap, or stopped at it. */
  readonly completedUnderCap?: boolean
  /** Circuits and AMRAPs. */
  readonly roundsCompleted?: number
  /** AMRAP: reps into the round the clock ended on. */
  readonly partialRoundReps?: number
  /** EMOM. */
  readonly minutesCompleted?: number
  /** Ladders: the rung reached, as a rung number rather than a rep target. */
  readonly highestRung?: number
  /** The user's own words, when a renderer collected any. */
  readonly notes?: string
  /**
   * TASK-031 (MIG-A): the optional categorical effort for the whole block —
   * the set's three categories (`set_effort`), never a number. Absent is
   * unanswered. It is written to `block_results.effort`, never to
   * `perceived_effort`, and nothing converts one into the other.
   */
  readonly effort?: Enums<'set_effort'>
}

/** An outcome plus the one thing the shell adds to every structure type. */
export interface BlockCompletion {
  readonly blockId: string
  readonly outcome: BlockOutcome
  /**
   * 1–10 when the athlete gave one. Effort is optional feedback (E04): absent
   * or `null` records `null` — not answered — and is never defaulted.
   */
  readonly perceivedEffort?: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// The row
// ─────────────────────────────────────────────────────────────────────────────

/** `undefined` is not a value the database can hold; `null` is the observation. */
function recorded<T>(value: T | undefined): T | null {
  return value ?? null
}

/**
 * The `block_results` insert, from a completion. Pure, so the mapping is
 * testable without a transport, and typed by the generated `Insert` shape so a
 * renamed column fails to compile here rather than 400ing at PostgREST.
 */
export function blockResultInsert(
  completion: BlockCompletion,
): TablesInsert<'block_results'> {
  return {
    block_id: completion.blockId,
    ...outcomeColumns(completion),
    // TASK-031 (MIG-A). Written by omission when unanswered, as the set log's
    // effort is (`setLogInsert`): the column defaults to NULL, and a request
    // that never names it is one a project MIG-A has not reached (LIVE-PRE-1)
    // still accepts — so every completion the shipped renderers report today,
    // none of which carries an effort, saves exactly as it did.
    ...(completion.outcome.effort === undefined ? {} : { effort: completion.outcome.effort }),
  }
}

/**
 * TASK-031 (`block-result-correction`): the `block_results` UPDATE that
 * corrects a saved row, from the same completion shape.
 *
 * A correction restates the whole outcome — every outcome column, the notes
 * and the categorical effort — so a value the athlete cleared is cleared
 * (`null`) rather than left over from the first save. `block_id`, `id` and
 * `created_at` are the row's identity and history and are never sent.
 * `perceived_effort` is the legacy 1–10 number and is restated only as the
 * completion carries it (the shell writes `null`).
 *
 * Because it names `effort`, a correction needs MIG-A on the project it is
 * sent to; the writer turns that schema gap into an explicit refusal rather
 * than dropping the field (`src/data/workout.ts`).
 */
export function blockResultCorrection(
  completion: BlockCompletion,
): TablesUpdate<'block_results'> {
  return { ...outcomeColumns(completion), effort: completion.outcome.effort ?? null }
}

/** Every outcome column a completion states; an absent field is `null`. */
function outcomeColumns(completion: BlockCompletion) {
  const { outcome } = completion
  return {
    elapsed_seconds: recorded(outcome.elapsedSeconds),
    completed_under_cap: recorded(outcome.completedUnderCap),
    rounds_completed: recorded(outcome.roundsCompleted),
    partial_round_reps: recorded(outcome.partialRoundReps),
    minutes_completed: recorded(outcome.minutesCompleted),
    highest_rung: recorded(outcome.highestRung),
    perceived_effort: recorded(completion.perceivedEffort),
    notes: recorded(outcome.notes),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-031 — per-movement timed actuals (MIG-B)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One movement's write in a timed block attempt: the row it should hold, or
 * `null` when nothing is recorded for it — in which case a row saved by an
 * earlier attempt of this same save is removed, never zeroed (zero is a
 * measurement). The row is built by `movementActualFromDraft`
 * (`src/data/refinement-logging-contract.ts`) with a client-minted id.
 */
export interface MovementResultWrite {
  /** `workout_exercises.id` — the movement as performed in the block. */
  readonly workoutExerciseId: string
  readonly row: TablesInsert<'block_movement_results'> | null
}

const nonNegativeOrNull = (value: number | null | undefined, integer: boolean) =>
  value === null || value === undefined || (Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value)))

/**
 * The field a movement write would be refused on by MIG-B's CHECKs, or null.
 * Checked by the writer before anything is sent, so a refusal names the field
 * in the caller's vocabulary rather than as a constraint name.
 */
export function movementResultViolation(write: MovementResultWrite): string | null {
  const { row } = write
  if (row === null) return null
  if (row.workout_exercise_id !== write.workoutExerciseId) return 'workout_exercise_id'
  const round = row.round_number ?? null
  if (round !== null && !(Number.isInteger(round) && round > 0)) return 'round_number'
  const amount = [row.actual_reps, row.actual_duration_seconds, row.actual_distance].some(
    (value) => value !== null && value !== undefined,
  )
  if (amount && round === null) return 'round_number'
  if (!nonNegativeOrNull(row.actual_reps, true)) return 'actual_reps'
  if (!nonNegativeOrNull(row.actual_duration_seconds, true)) return 'actual_duration_seconds'
  if (!nonNegativeOrNull(row.actual_distance, false)) return 'actual_distance'
  if (row.actual_distance !== null && row.actual_distance !== undefined && (row.actual_distance_unit ?? null) === null) {
    return 'actual_distance_unit'
  }
  if (!nonNegativeOrNull(row.weight, false)) return 'weight'
  if (!amount && (row.weight === null || row.weight === undefined)) return 'weight'
  return null
}

/** True for an effort the CHECK constraint would accept. */
export function isPerceivedEffort(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= PERCEIVED_EFFORT_MIN &&
    value <= PERCEIVED_EFFORT_MAX
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-015 — the timed log's richer report (REQ-015, C37)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a timed renderer reports beside its outcome: the optional categorical
 * effort and each movement's partial amount and actual load exactly as the
 * athlete typed them, with the unit a load is stated in and, for a ladder, how
 * many rungs it has. The shell turns it into the block's `effort` and its
 * `block_movement_results` rows through TASK-031's save provider
 * (`src/state/timed-results.ts`), deciding every round identity from the
 * reported outcome with TASK-030's rules — never from a planned target. A
 * report with no effort and no typed entry changes nothing: the save is the
 * one every renderer made before the fields existed.
 */
export interface TimedResultReport {
  readonly family: TimedFamily
  /** The existing three categories, or null when unanswered. Never a number. */
  readonly effort: Enums<'set_effort'> | null
  /** Each movement's typed entry by `workout_exercises.id`; blank is not recorded. */
  readonly movements: Readonly<Record<string, MovementActualDraft>>
  /** The unit a typed load is stated in: the athlete's choice, else the profile's. */
  readonly weightUnit: Enums<'weight_unit'>
  /** A ladder's rung count (`ladderRungs(...).length`); its partial's round is bounded by it. */
  readonly rungCount?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// The seam the renderers use
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockCompletionApi {
  /**
   * Tells the shell what the block's structure has observed so far. Reporting
   * saves nothing and completes nothing: the section's one forward action
   * (REQ-013) saves the latest report. A block that never reports saves `{}` —
   * every outcome column `null` — because a tap is not an observation.
   */
  reportOutcome(blockId: string, outcome: BlockOutcome): void
  /**
   * TASK-015 (C37): tells the shell what the block's timed log holds beside
   * the outcome — the categorical effort and each movement's typed partial
   * and load (`TimedResultReport`); null withdraws an earlier report. Saved
   * by the same forward action through the same path, after the block row,
   * and only when the report carries something. The shell's provider always
   * supplies it; a bare test seam may omit it, and then nothing richer is
   * reported.
   */
  reportTimedResult?(blockId: string, report: TimedResultReport | null): void
  /** Blocks the shell has already written a result for, this session. */
  isBlockRecorded(blockId: string): boolean
  /**
   * The session the blocks are performed in — read-only identity, so a
   * renderer that keeps a durable local record (TASK-013: the ladder's
   * attempt, `usePersistedLadder`) files it under the workout it belongs to.
   * The shell's provider always supplies it; a bare test seam may omit it.
   */
  readonly sessionId?: string
  /**
   * TASK-014 (C38, AC-R014-03): calls `listener` once, synchronously, at the
   * moment the shell learns the block's row exists — its insert answered, a
   * row already there (the unique index), or the performed read — before
   * `isBlockRecorded` reports it and before the forward action moves on. The
   * same word as `isBlockRecorded`, only sooner: a renderer that keeps a
   * durable local record of an open attempt (the ladder's, whose accidental
   * Finish can be undone until the result is saved) closes it in the same
   * act, so leaving the section in the same render cannot leave a saved
   * attempt open to Undo after a reload. Returns the unsubscribe. The shell's
   * provider always supplies it; a bare test seam may omit it.
   *
   * TASK-048 (AC-R032-02): the listener is told how the row is known
   * (`BlockRecordedSource`): `saved` when this device's own save of the
   * block's latest report was answered (the row now holds what it sent),
   * `known` when the row was already there (a bare insert's 23505, which
   * leaves the row as it was) or the performed read found it. A listener
   * that takes no argument is told the same moment, as before.
   */
  onBlockRecorded?(blockId: string, listener: (source: BlockRecordedSource) => void): () => void
  /**
   * TASK-048 (AC-R032-03; JOURNEY-032 "Failed save retains the draft"):
   * calls `listener` once each time the forward action's save of this block
   * fails (the error the forward action receives, not a row already there).
   * A renderer keeping a durable record notes the failure on it, so the
   * draft is kept for the retry and the failure stays explicit after a
   * reload. Returns the unsubscribe. A bare test seam may omit it.
   */
  onBlockSaveFailed?(blockId: string, listener: () => void): () => void
  /**
   * TASK-048 (AC-R032-02): the block's row as the shell last wrote or read it
   * this session — this device's answered save, or the performed read — or
   * null when no row is known here (none, or a row known only by a 23505).
   * The saved (or corrected) row is the authority a renderer reads a saved
   * result back from, ahead of its own local echo. A bare seam may omit it.
   */
  recordedResult?(blockId: string): RecordedBlockResult | null
  /**
   * TASK-048 (AC-R032-03): the renderer of a block the shell reports as
   * `known` holds a draft whose own richer save failed and was never
   * confirmed — the block row landed and a later write of the same save did
   * not (a refused movement write), or its answer was lost. Called from the
   * `onBlockRecorded` listener, in the same act, it makes the block
   * outstanding again instead of recorded, so the section's forward action
   * saves it once more through the richer path, which restates the row
   * (23505 → correction) and writes each movement row once. A bare seam may
   * omit it.
   */
  reopenBlock?(blockId: string): void
}

/** TASK-048: how the shell learned a block's row exists (`onBlockRecorded`). */
export type BlockRecordedSource = 'saved' | 'known'

/**
 * TASK-048: a block's saved row and its movements' rows by
 * `workout_exercises.id`, as the shell last wrote or read them. A movement
 * with no row is absent: nothing was recorded for it.
 */
export interface RecordedBlockResult {
  readonly row: BlockResultRow
  readonly movements: Readonly<Record<string, BlockMovementResultRow>>
}

export const BlockCompletionContext = createContext<BlockCompletionApi | null>(null)

/**
 * The renderers' half of the contract. Throwing outside the shell is the
 * point: a renderer that has escaped the shell would otherwise silently drop
 * the one write OVR-03 depends on.
 */
export function useBlockCompletion(): BlockCompletionApi {
  const api = use(BlockCompletionContext)
  if (api === null) {
    throw new Error('useBlockCompletion was called outside the workout shell')
  }
  return api
}

// ─────────────────────────────────────────────────────────────────────────────
// The seam the forward action uses (REQ-013)
// ─────────────────────────────────────────────────────────────────────────────

export interface SectionCompletionApi {
  /**
   * Saves explicit completion of the named blocks: one `block_results` row per
   * block not yet recorded, carrying its latest reported outcome and no effort.
   * Missing counts are `null`, never a reason to refuse. A call while a save is
   * in flight answers that same save, and a retry writes only what an earlier
   * attempt did not, so no block is written twice. `ok` means every named block
   * is recorded and the caller may continue; an error means it may not.
   */
  completeSection(blockIds: readonly string[]): Promise<Result<undefined>>
  /** True while a section save is in flight. */
  readonly saving: boolean
}

export const SectionCompletionContext = createContext<SectionCompletionApi | null>(null)

/** The shell's forward action's half of the contract. */
export function useSectionCompletion(): SectionCompletionApi {
  const api = use(SectionCompletionContext)
  if (api === null) {
    throw new Error('useSectionCompletion was called outside the workout shell')
  }
  return api
}
