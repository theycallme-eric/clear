/**
 * A3 TASK-103 (TASK-AC-6B9598D96180) — Round 7's timed attempt
 * (`timed-attempt.ts`) kept in the records the shipped timed renderers already
 * keep (`workout-persistence.ts`), so switching a format to `TimedWorkoutFlow`
 * loses nothing those renderers had on the base:
 *
 *   · the clock's start and end survive a walk to another section and back, a
 *     refresh and a closed tab (SES-01) — under the same per-block key the
 *     format's renderer used (`clear.workout-amraps`, `clear.workout-emom`,
 *     `clear.workout-for-time`; a timed ladder's clock is the For Time race's
 *     shape, as `LadderBlock` kept it);
 *   · an AMRAP's recorded rounds and partial-round reps survive the same way.
 *
 * A record carries one start stamp read against the wall clock. Resume moves
 * that stamp on by the time spent paused (`timed-lifecycle.ts`'s posture), so
 * the reading restored is the active time. The pause itself is not stored
 * here: persisted Pause and Resume stamps are TASK-104's, the durable ladder
 * attempt (`clear.workout-ladders`) TASK-105's, and the richer per-format
 * entries (`movements`, `workCompleted`) TASK-116's. Anything such a record
 * already holds is kept as it is on every write.
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
import { EMPTY_TIMED_ATTEMPT, activeSeconds, type TimedAttempt } from './timed-attempt'
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

export type TimedRecordFormat = 'emom' | 'amrap' | 'for_time' | 'ladder'

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

function stamp(iso: string | null | undefined): number | null {
  if (iso === null || iso === undefined) return null
  const at = Date.parse(iso)
  return Number.isNaN(at) ? null : at
}

const iso = (at: number) => new Date(at).toISOString()

/** The stored start: the real start moved on by every completed pause. */
function storedStart(attempt: TimedAttempt): string | null {
  return attempt.startedAt === null ? null : iso(attempt.startedAt + attempt.pausedMs)
}

function attemptFrom(startedAt: number | null, finishedAt: number | null): TimedAttempt {
  if (startedAt === null) return EMPTY_TIMED_ATTEMPT
  return { ...EMPTY_TIMED_ATTEMPT, startedAt, finishedAt: finishedAt !== null && finishedAt >= startedAt ? finishedAt : null }
}

/**
 * The block's stored attempt, or null when it has none (never started here, a
 * record that cannot be read, or no storage).
 */
export function readTimedAttempt(
  storage: ShellStorage | null,
  format: TimedRecordFormat,
  block: BlockProgress,
): RestoredTimedAttempt | null {
  switch (format) {
    case 'amrap': {
      const stored = readAmrapState(storage, block.blockId)
      if (stored === null) return null
      const state = clampAmrapState(stored, amrapShape(block))
      const startedAt = stamp(state.startedAt)
      const finishedAt = startedAt === null || state.endedAtSeconds === null ? null : startedAt + state.endedAtSeconds * 1000
      return {
        attempt: attemptFrom(startedAt, finishedAt),
        counts: { roundsCompleted: state.roundsCompleted, partialRoundReps: state.partialRoundReps },
      }
    }
    case 'emom': {
      const stored = readEmomState(storage, block.blockId)
      if (stored === null) return null
      const state = clampEmomState(stored)
      return { attempt: attemptFrom(stamp(state.startedAt), stamp(state.finishedAt)), counts: null }
    }
    case 'for_time':
    case 'ladder': {
      const stored = readForTimeState(storage, block.blockId)
      if (stored === null) return null
      const state = clampForTimeState(stored)
      return { attempt: attemptFrom(stamp(state.startedAt), stamp(state.finishedAt)), counts: null }
    }
  }
}

/**
 * Writes the block's attempt (and, for an AMRAP, its counts) into its
 * format's record, keeping every other field the record already holds. A
 * paused attempt is written as the clock it was before the pause.
 */
export function writeTimedAttempt(
  storage: ShellStorage | null,
  format: TimedRecordFormat,
  block: BlockProgress,
  attempt: TimedAttempt,
  counts: TimedCounts | null = null,
): void {
  if (storage === null) return
  const startedAt = storedStart(attempt)
  const finishedAt = attempt.finishedAt === null ? null : iso(attempt.finishedAt)
  switch (format) {
    case 'amrap': {
      const previous: AmrapState = readAmrapState(storage, block.blockId) ?? AMRAP_START
      const cap = amrapShape(block).capSeconds
      const ended = attempt.finishedAt === null ? null : activeSeconds(attempt, attempt.finishedAt)
      const kept = counts ?? { roundsCompleted: previous.roundsCompleted, partialRoundReps: previous.partialRoundReps }
      const next: AmrapState = {
        startedAt,
        endedAtSeconds: ended === null ? null : cap === null ? ended : Math.min(ended, cap),
        roundsCompleted: kept.roundsCompleted,
        partialRoundReps: kept.partialRoundReps,
        ...(previous.movements === undefined ? {} : { movements: previous.movements }),
      }
      writeAmrapState(storage, block.blockId, next)
      return
    }
    case 'emom': {
      const next: EmomState = { startedAt, workDoneMinute: null, ...(finishedAt === null ? {} : { finishedAt }) }
      writeEmomState(storage, block.blockId, next)
      return
    }
    case 'for_time':
    case 'ladder': {
      const previous = readForTimeState(storage, block.blockId)
      const next: ForTimeState = {
        startedAt,
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
