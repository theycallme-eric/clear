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
 * A raced ladder's clock is kept inside its durable attempt (TASK-032's
 * `clear.workout-ladders`, `ladder-recovery.ts`), not as a For Time race beside
 * it: Start, Pause, Resume, Finish and Undo finish move it through
 * `startLadderAttempt`, `pauseLadderAttempt`, `resumeLadderAttempt`,
 * `finishLadderAttempt` and `undoLadderFinish`, under the workout's session.
 * A ladder clock an earlier build kept under the For Time key is adopted on
 * the first action (`restoreLadderAttempt`), and the For Time record is left
 * as it was. The rest of the durable attempt — live progress, the draft, the
 * Undo checkpoint's progress, save authority — is TASK-105's; nothing here
 * writes it. The richer per-format entries (`movements`, `workCompleted`) are
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
import { ladderRungs } from './ladder'
import {
  finishLadderAttempt,
  ladderRaceCapSeconds,
  pauseLadderAttempt,
  resumeLadderAttempt,
  startLadderAttempt,
  undoLadderFinish,
  type LadderAttempt,
} from './ladder-recovery'
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
  restoreLadderAttempt,
  writeAmrapState,
  writeEmomState,
  writeForTimeState,
  writeLadderAttempt,
  type ShellStorage,
} from './workout-persistence'
import type { BlockProgress } from './workout-progress'

export type TimedRecordFormat = 'emom' | 'amrap' | 'for_time' | 'ladder'

/** What moves an attempt's clock; `undo` is a ladder's Undo finish. */
export type TimedRecordAction = 'start' | 'pause' | 'resume' | 'finish' | 'undo'

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
 * Where a block's attempt is kept: the shell's storage and the workout's
 * session. The session identifies a ladder's durable attempt; the other
 * records are per block, as their renderers kept them.
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

/** A ladder's durable attempt as the route finds it: stored, adopted from an older For Time clock, or new. */
function ladderAttemptOf(scope: TimedRecordScope, block: BlockProgress): LadderAttempt | null {
  if (scope.storage === null || scope.sessionId === null) return null
  return restoreLadderAttempt(scope.storage, {
    sessionId: scope.sessionId,
    blockId: block.blockId,
    capSeconds: ladderRaceCapSeconds(block),
    rungCount: ladderRungs(block.exercises).length,
    mintId: () => crypto.randomUUID(),
  }).attempt
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
    case 'ladder': {
      const attempt = ladderAttemptOf(scope, block)
      if (attempt === null || attempt.clock.startedAt === null) return null
      return { attempt: timedAttemptFromClock(attempt.clock), counts: null }
    }
  }
}

/** A ladder's durable attempt, moved by the action at `at` through `ladder-recovery.ts`. */
function moveLadderAttempt(scope: TimedRecordScope, block: BlockProgress, action: TimedRecordAction, at: number): void {
  const attempt = ladderAttemptOf(scope, block)
  if (attempt === null) return
  const rungs = ladderRungs(block.exercises).length
  const next = action === 'start' ? startLadderAttempt(attempt, at)
    : action === 'pause' ? pauseLadderAttempt(attempt, at)
    : action === 'resume' ? resumeLadderAttempt(attempt, at)
    : action === 'finish' ? finishLadderAttempt(attempt, rungs, at)
    : undoLadderFinish(attempt, rungs, at)
  if (next !== attempt) writeLadderAttempt(scope.storage, next)
}

/**
 * Keeps the block's attempt after `action`, taken at `at`, moved it to
 * `attempt`: the format's record is written with its clock (and, for an
 * AMRAP, its counts), keeping every other field it already holds; a ladder's
 * durable attempt is moved by the same action.
 */
export function recordTimedAction(
  scope: TimedRecordScope,
  format: TimedRecordFormat,
  block: BlockProgress,
  action: TimedRecordAction,
  attempt: TimedAttempt,
  at: number,
): void {
  if (scope.storage === null) return
  if (format === 'ladder') {
    moveLadderAttempt(scope, block, action, at)
    return
  }
  writeTimedAttempt(scope.storage, format, block, attempt)
}

/**
 * Writes an EMOM's, AMRAP's or For Time's attempt (and, for an AMRAP, its
 * counts) into its format's record, keeping every other field the record
 * already holds. A paused attempt keeps its pause stamp; an ended one has none.
 */
export function writeTimedAttempt(
  storage: ShellStorage | null,
  format: Exclude<TimedRecordFormat, 'ladder'>,
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
