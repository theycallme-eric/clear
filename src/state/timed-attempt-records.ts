/**
 * A3 TASK-103 (TASK-AC-6B9598D96180) — Round 7's timed attempt
 * (`timed-attempt.ts`) kept in the records the shipped timed renderers already
 * keep (`workout-persistence.ts`), so switching a format to `TimedWorkoutFlow`
 * loses nothing those renderers had on the base:
 *
 *   · the clock's start and end survive a walk to another section and back, a
 *     refresh and a closed tab (SES-01) — under the same per-block key the
 *     format's renderer used (`clear.workout-amraps`, `clear.workout-emom`,
 *     `clear.workout-for-time`);
 *   · an AMRAP's recorded rounds and partial-round reps survive the same way.
 *
 * A3 TASK-104 (F2; TASK-006, C18, R98; TASK-AC-591C4D5CE263) adds the pause.
 * A record carries one start stamp read against the wall clock, moved on by
 * every Resume, and — while the clock is paused — the pause stamp beside it
 * (`timed-lifecycle.ts`'s posture; `pausedAt`, optional in every record, so
 * records written before it parse unchanged). So a reload while paused
 * restores the paused clock with the same active time and the same time left,
 * and Finish on a paused clock ends it at the pause.
 *
 * A raced ladder is not kept here. A3 TASK-104 first moved its clock into its
 * durable attempt (TASK-032's `clear.workout-ladders`, `ladder-recovery.ts`)
 * from this module; A3 TASK-105 (F3) gives that whole attempt — the clock, the
 * live progress, the draft, the Undo checkpoint and the save authority — one
 * owner, `usePersistedLadder` (`workout-persistence.ts`), which the route's
 * `TimedWorkoutFlow` holds for a ladder. One writer: the record is never moved
 * from here behind that owner's back. TASK-104's rule for an older ladder
 * clock under the For Time key is kept by that owner (`adoptLegacyClock:
 * 'on-first-change'`): adopted by the first action, the For Time record left
 * as it was. The richer per-format entries (`movements`, `workCompleted`) are
 * TASK-116's. Anything such a record already holds is kept on every write.
 *
 * No React here, and the storage is injected: outside the workout shell (the
 * gallery, a bare mount) the caller passes `null` and nothing is stored.
 */
import {
  amrapShape,
  clampAmrapState,
  AMRAP_START,
  type AmrapState,
} from './amrap'
import { clampEmomState, type EmomState } from './emom'
import { clampForTimeState, type ForTimeState } from './for-time'
import {
  activeSeconds,
  timedAttemptClock,
  timedAttemptFromClock,
  type TimedAttempt,
} from './timed-attempt'
import {
  readAmrapState,
  readEmomState,
  readForTimeState,
  writeAmrapState,
  writeEmomState,
  writeForTimeState,
  type ShellStorage,
} from './workout-persistence'
import type { BlockProgress } from './workout-progress'

/** The formats kept here; a ladder's attempt is `usePersistedLadder`'s (A3 TASK-105). */
export type TimedRecordFormat = 'emom' | 'amrap' | 'for_time'

/** What moves an attempt's clock. */
export type TimedRecordAction = 'start' | 'pause' | 'resume' | 'finish'

/** An AMRAP's two counts as the athlete recorded them; `null` is not recorded. */
export interface TimedCounts {
  readonly roundsCompleted: number | null
  readonly partialRoundReps: number | null
}

export interface RestoredTimedAttempt {
  readonly attempt: TimedAttempt
  /** The AMRAP's counts; null for every other format. */
  readonly counts: TimedCounts | null
}

/**
 * Where a block's attempt is kept: the shell's storage, and the workout's
 * session the block is performed in. These records are per block, as their
 * renderers kept them.
 */
export interface TimedRecordScope {
  readonly storage: ShellStorage | null
  readonly sessionId: string | null
}

const iso = (at: number) => new Date(at).toISOString()

/** The stamps a record keeps for an attempt: its (moved) start and, while paused, its pause. */
function clockStamps(attempt: TimedAttempt): { startedAt: string | null; pausedAt?: string } {
  const clock = timedAttemptClock(attempt)
  return {
    startedAt: clock.startedAt,
    ...(attempt.finishedAt === null && typeof clock.pausedAt === 'string' ? { pausedAt: clock.pausedAt } : {}),
  }
}

/**
 * The block's stored attempt, or null when it has none (never started here, a
 * record that cannot be read, or no storage).
 */
export function readTimedAttempt(
  scope: TimedRecordScope,
  format: TimedRecordFormat,
  block: BlockProgress,
): RestoredTimedAttempt | null {
  const { storage } = scope
  switch (format) {
    case 'amrap': {
      const stored = readAmrapState(storage, block.blockId)
      if (stored === null) return null
      const state = clampAmrapState(stored, amrapShape(block))
      const started = state.startedAt === null ? Number.NaN : Date.parse(state.startedAt)
      const finishedAt = Number.isNaN(started) || state.endedAtSeconds === null ? null : iso(started + state.endedAtSeconds * 1000)
      return {
        attempt: timedAttemptFromClock({ startedAt: state.startedAt, pausedAt: state.pausedAt, finishedAt }),
        counts: { roundsCompleted: state.roundsCompleted, partialRoundReps: state.partialRoundReps },
      }
    }
    case 'emom': {
      const stored = readEmomState(storage, block.blockId)
      if (stored === null) return null
      return { attempt: timedAttemptFromClock(clampEmomState(stored)), counts: null }
    }
    case 'for_time': {
      const stored = readForTimeState(storage, block.blockId)
      if (stored === null) return null
      return { attempt: timedAttemptFromClock(clampForTimeState(stored)), counts: null }
    }
  }
}

/**
 * Keeps the block's attempt after an action (`TimedRecordAction`) moved it to
 * `attempt`: the format's record is written with its clock (and, for an
 * AMRAP, its counts), keeping every other field it already holds.
 */
export function recordTimedAction(
  scope: TimedRecordScope,
  format: TimedRecordFormat,
  block: BlockProgress,
  attempt: TimedAttempt,
): void {
  if (scope.storage === null) return
  writeTimedAttempt(scope.storage, format, block, attempt)
}

/**
 * Writes an EMOM's, AMRAP's or For Time's attempt (and, for an AMRAP, its
 * counts) into its format's record, keeping every other field the record
 * already holds. A paused attempt keeps its pause stamp; an ended one has none.
 */
export function writeTimedAttempt(
  storage: ShellStorage | null,
  format: TimedRecordFormat,
  block: BlockProgress,
  attempt: TimedAttempt,
  counts: TimedCounts | null = null,
): void {
  if (storage === null) return
  const stamps = clockStamps(attempt)
  const finishedAt = attempt.finishedAt === null ? null : iso(attempt.finishedAt)
  switch (format) {
    case 'amrap': {
      const previous: AmrapState = readAmrapState(storage, block.blockId) ?? AMRAP_START
      const cap = amrapShape(block).capSeconds
      const ended = attempt.finishedAt === null ? null : activeSeconds(attempt, attempt.finishedAt)
      const kept = counts ?? { roundsCompleted: previous.roundsCompleted, partialRoundReps: previous.partialRoundReps }
      const next: AmrapState = {
        ...stamps,
        endedAtSeconds: ended === null ? null : cap === null ? ended : Math.min(ended, cap),
        roundsCompleted: kept.roundsCompleted,
        partialRoundReps: kept.partialRoundReps,
        ...(previous.movements === undefined ? {} : { movements: previous.movements }),
      }
      writeAmrapState(storage, block.blockId, next)
      return
    }
    case 'emom': {
      const next: EmomState = { ...stamps, workDoneMinute: null, ...(finishedAt === null ? {} : { finishedAt }) }
      writeEmomState(storage, block.blockId, next)
      return
    }
    case 'for_time': {
      const previous = readForTimeState(storage, block.blockId)
      const next: ForTimeState = {
        ...stamps,
        finishedAt,
        ...(typeof previous?.workCompleted === 'boolean' ? { workCompleted: previous.workCompleted } : {}),
        ...(previous?.movements === undefined ? {} : { movements: previous.movements }),
      }
      writeForTimeState(storage, block.blockId, next)
      return
    }
  }
}

/** An AMRAP's counts, written without touching its clock. */
export function writeTimedCounts(storage: ShellStorage | null, block: BlockProgress, counts: TimedCounts): void {
  if (storage === null) return
  const previous = readAmrapState(storage, block.blockId)
  if (previous === null || previous.startedAt === null) return
  writeAmrapState(storage, block.blockId, {
    ...previous,
    roundsCompleted: counts.roundsCompleted,
    partialRoundReps: counts.partialRoundReps,
  })
}
