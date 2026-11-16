/**
 * A3 TASK-103 (F1; REQ-031; TASK-015, TASK-047, TASK-048) — Round 7's timed
 * log said to the shell's one completion path, and read back from it.
 *
 * `TimedWorkoutFlow` and `TimedResultLog` hold the athlete's draft in Round 7's
 * own shape (`TimedResultDraft`). The shell saves a block from two things: the
 * outcome its structure observed (`BlockOutcome`) and, beside it, the timed
 * report of effort and typed movement entries (`TimedResultReport`), which it
 * turns into `block_results` and `block_movement_results` rows through
 * TASK-031's provider. This module is the translation both ways, and nothing
 * else:
 *
 *   · `timedShellOutcome` keeps each format's existing data contract — the
 *     outcome its shipped renderer reported on the base. An EMOM reports no
 *     measured outcome (the clock is the schedule, E01); an AMRAP its elapsed
 *     time and, once the window has closed, the counts recorded; For Time its
 *     elapsed time and, once ended, whether the work was completed under the
 *     cap; a ladder only its highest rung (Complete is the top rung). Notes
 *     travel as the block's notes. Blank is never a zero and nothing is read
 *     from the plan.
 *   · `timedShellReport` is the effort as its category (never a number) and
 *     each movement's typed partial and load, exactly as typed. A blank entry
 *     is not recorded; a cleared entry for a movement that already has a row
 *     is sent blank so the row is removed, never zeroed. The unit is the one
 *     the route knows — a saved row's, else the profile's — and `null` while
 *     the profile is unread: no unit is ever guessed, and the shell refuses
 *     that save (`profile-unread`) as it refuses a set, so the log keeps its
 *     draft and its dialog and says it did not save.
 *   · `receiptFromRecorded` reads a saved row and its movement rows back into
 *     the log's shape (TASK-048: the saved result is the authority).
 *   · `saveLogThroughShell` is the product's `timedWorkflows.saveResult`
 *     (`./product-presentation.ts`): Round 7's "Save log", bound to the
 *     provider's `saveTimedLog`. A refusal rejects, so the log keeps the draft
 *     and the dialog and says it did not save.
 *
 * Every round identity is decided by the shell from the outcome sent here
 * (TASK-030's `partialRoundFor`), never from a planned target.
 */
import type { Enums } from '../data/database.types'
import type {
  BlockCompletionApi,
  BlockOutcome,
  RecordedBlockResult,
  TimedResultReport,
} from '../state/block-completion'
import { isErr } from '../state/errors'
import { ladderRungs } from '../state/ladder'
import type { BlockProgress } from '../state/workout-progress'
import type { TimedFormat, TimedResultDraft, TimedResultReceipt } from './timed-result-log'

/** Where the attempt's own clock is. */
export interface TimedClockReading {
  readonly started: boolean
  readonly ended: boolean
  /** Active seconds, pauses excluded, bounded by the cap. */
  readonly elapsedSeconds: number
  readonly capReached: boolean
}

/** What a block's timed save is handed: the block, and the shell it is performed in. */
export interface TimedSaveContext {
  readonly block: BlockProgress
  readonly shell: BlockCompletionApi | null
}

/**
 * The draft a log starts from, before anything is entered — Round 7's own
 * starting point, shared by the log and by what its block reports.
 */
export function initialTimedResultDraft(format: TimedFormat, finished: boolean, rungCount: number): TimedResultDraft {
  return {
    completed: format === 'emom' ? true : format === 'ladder' || format === 'for_time' ? finished : null,
    count: null, highestRung: format === 'ladder' && finished ? rungCount : null,
    effort: null, notes: '', measurements: {},
  }
}

/** The outcome the block's row holds, in its format's existing contract. */
export function timedShellOutcome(
  format: TimedFormat,
  block: BlockProgress,
  draft: TimedResultDraft,
  clock: TimedClockReading,
): BlockOutcome {
  if (!clock.started) return {}
  const notes = clock.ended && draft.notes.trim() !== '' ? { notes: draft.notes } : {}
  switch (format) {
    case 'emom':
      return notes
    case 'amrap':
      return {
        elapsedSeconds: clock.elapsedSeconds,
        ...(clock.ended && draft.count !== null ? { roundsCompleted: draft.count } : {}),
        ...(clock.ended && draft.partialReps !== undefined && draft.partialReps !== null
          ? { partialRoundReps: draft.partialReps }
          : {}),
        ...notes,
      }
    case 'for_time':
      return {
        elapsedSeconds: clock.elapsedSeconds,
        ...(clock.ended && draft.completed !== null
          ? { completedUnderCap: draft.completed && !clock.capReached }
          : {}),
        ...notes,
      }
    case 'ladder': {
      const rungCount = ladderRungs(block.exercises).length
      if (!clock.ended || rungCount === 0 || draft.completed === null) return notes
      if (draft.completed) return { highestRung: rungCount, ...notes }
      return draft.highestRung === null ? notes : { highestRung: draft.highestRung, ...notes }
    }
  }
}

/**
 * The effort and typed entries beside the outcome, once the attempt has
 * ended; null withdraws any earlier report. `weightUnit` is passed through as
 * known — `null` while the profile is unread, which the shell refuses.
 */
export function timedShellReport(
  format: TimedFormat,
  block: BlockProgress,
  draft: TimedResultDraft,
  weightUnit: Enums<'weight_unit'> | null,
  ended: boolean,
  recorded: RecordedBlockResult | null = null,
): TimedResultReport | null {
  if (!ended) return null
  const movements: Record<string, { amount: string; weight: string }> = {}
  for (const exercise of block.exercises) {
    const entry = draft.measurements[exercise.exerciseId]
    if (entry === undefined) continue
    const blank = entry.amount.trim() === '' && entry.weight.trim() === ''
    // Blank is not recorded; blank over a saved row removes that row.
    if (blank && recorded?.movements[exercise.exerciseId] === undefined) continue
    movements[exercise.exerciseId] = { amount: entry.amount, weight: entry.weight }
  }
  return {
    family: format,
    effort: draft.effort,
    movements,
    weightUnit,
    ...(format === 'ladder' ? { rungCount: ladderRungs(block.exercises).length } : {}),
  }
}

const typed = (value: number | null) => (value === null ? '' : String(value))

/** A saved row and its movements, read back into the log's shape. */
export function receiptFromRecorded(
  recorded: RecordedBlockResult,
  block: BlockProgress,
  format: TimedFormat,
  clock: TimedClockReading,
  weightUnit: Enums<'weight_unit'> | null,
): TimedResultReceipt {
  const { row } = recorded
  const rungCount = ladderRungs(block.exercises).length
  const measurements: Record<string, { amount: string; weight: string }> = {}
  let unit = weightUnit
  for (const exercise of block.exercises) {
    const saved = recorded.movements[exercise.exerciseId]
    if (saved === undefined) continue
    measurements[exercise.exerciseId] = {
      amount: typed(saved.actual_reps ?? saved.actual_duration_seconds ?? saved.actual_distance),
      weight: typed(saved.weight),
    }
    if (saved.weight !== null) unit = saved.weight_unit
  }
  return {
    blockId: block.blockId,
    format,
    elapsedSeconds: row.elapsed_seconds ?? clock.elapsedSeconds,
    capReached: clock.capReached,
    weightUnit: unit,
    result: {
      completed:
        format === 'emom' ? true
          : format === 'for_time' ? row.completed_under_cap
            : format === 'ladder' ? (row.highest_rung === null ? null : row.highest_rung === rungCount)
              : null,
      count: format === 'amrap' ? row.rounds_completed : null,
      ...(format === 'amrap' ? { partialReps: row.partial_round_reps } : {}),
      highestRung: format === 'ladder' ? row.highest_rung : null,
      effort: row.effort,
      notes: row.notes ?? '',
      measurements,
    },
  }
}

/**
 * The product's `timedWorkflows.saveResult`: Round 7's Save log, saved now
 * through the shell's one completion path. Rejects when the shell refuses, so
 * the log keeps its draft and its dialog and says it did not save.
 */
export async function saveLogThroughShell(receipt: TimedResultReceipt, { block, shell }: TimedSaveContext): Promise<void> {
  if (shell === null || shell.saveTimedLog === undefined) {
    throw new Error('This timed block is not inside a workout that can save it')
  }
  const clock: TimedClockReading = {
    started: true,
    ended: true,
    elapsedSeconds: receipt.elapsedSeconds,
    capReached: receipt.capReached,
  }
  const outcome = timedShellOutcome(receipt.format, block, receipt.result, clock)
  const report = timedShellReport(
    receipt.format, block, receipt.result, receipt.weightUnit, true, shell.recordedResult?.(block.blockId) ?? null,
  )
  if (report === null) throw new Error('An attempt that has not ended has no log to save')
  const saved = await shell.saveTimedLog(block.blockId, outcome, report)
  if (isErr(saved)) throw new Error(`Your log didn’t save (${saved.error.code})`)
}
