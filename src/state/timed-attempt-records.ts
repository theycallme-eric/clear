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
 * as it was. Anything such a record already holds is kept on every write.
 *
 * A3 TASK-116 (F3; TASK-010, TASK-048) keeps two more facts here, each on the
 * record it belongs to:
 *
 *   · a For Time race's **answer** to "Work completed" (`workCompleted`,
 *     TASK-010's field, `answerForTime`): written only when the athlete
 *     answers, so the clock's starting point — Finish under the cap at
 *     Complete, the cap at Incomplete — is drawn and never stored, and a
 *     reload brings back a correction rather than the starting point;
 *   · an AMRAP's or For Time's **failed save** (`saveFailed`): set when a save
 *     of the attempt's log is refused, cleared once one lands, so the log says
 *     `Your log didn’t save. Try again.` after a reload too (TASK-048's save
 *     authority, as the ladder's durable attempt keeps it).
 *
 * The per-movement entries (`movements`) are kept on every write and are
 * TASK-117's to fill.
 *
 * A3 TASK-117 (F3; TASK-015, TASK-047, TASK-048; TASK-AC-339D1096F660,
 * TASK-AC-D58939F8E091) fills them: each movement's typed next-round amount
 * and actual load, exactly as typed (`MovementActualDraft`), is written onto
 * the attempt's own record as the athlete types (`writeTimedMovements`) — the
 * AMRAP's and For Time's, and the EMOM's, whose entries are loads only — and
 * read back with the attempt (`RestoredTimedAttempt.movements`), so a reload
 * brings them back. A changed round count or answer clears the amounts and
 * keeps the loads before they are written (the log's rule,
 * `draftsAfterProgressChange`). The EMOM's record also keeps a failed save of
 * its end log (`saveFailed`), as the AMRAP's and For Time's do.
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
import { answerForTime, clampForTimeState, type ForTimeState } from './for-time'
import type { MovementActualDraft } from '../data/refinement-logging-rules'
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
  /** A3 TASK-116: a For Time race's answer to "Work completed" once given; null before, and for every other format. */
  readonly answer: boolean | null
  /** A3 TASK-116: a save of this attempt's log failed and none has landed since (AMRAP and For Time; A3 TASK-117: and EMOM). */
  readonly saveFailed: boolean
  /** A3 TASK-117: each movement's typed entry as the attempt's record keeps it; empty when none was typed. */
  readonly movements: Readonly<Record<string, MovementActualDraft>>
}

/** No movement typed: one frozen object, so a restored attempt with none is the same draft. */
const NO_MOVEMENTS: Readonly<Record<string, MovementActualDraft>> = Object.freeze({})

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
        answer: null,
        saveFailed: state.saveFailed === true,
        movements: state.movements ?? NO_MOVEMENTS,
      }
    }
    case 'emom': {
      const stored = readEmomState(storage, block.blockId)
      if (stored === null) return null
      const state = clampEmomState(stored)
      return {
        attempt: timedAttemptFromClock(state),
        counts: null,
        answer: null,
        saveFailed: state.saveFailed === true,
        movements: state.movements ?? NO_MOVEMENTS,
      }
    }
    case 'for_time': {
      const stored = readForTimeState(storage, block.blockId)
      if (stored === null) return null
      const state = clampForTimeState(stored)
      return {
        attempt: timedAttemptFromClock(state),
        counts: null,
        answer: typeof state.workCompleted === 'boolean' ? state.workCompleted : null,
        saveFailed: state.saveFailed === true,
        movements: state.movements ?? NO_MOVEMENTS,
      }
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
        ...(previous.saveFailed === true ? { saveFailed: true } : {}),
      }
      writeAmrapState(storage, block.blockId, next)
      return
    }
    case 'emom': {
      const previous = readEmomState(storage, block.blockId)
      const next: EmomState = {
        ...stamps,
        workDoneMinute: null,
        ...(finishedAt === null ? {} : { finishedAt }),
        ...(previous?.movements === undefined ? {} : { movements: previous.movements }),
        ...(previous?.saveFailed === true ? { saveFailed: true } : {}),
      }
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
        ...(previous?.saveFailed === true ? { saveFailed: true } : {}),
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

/**
 * A3 TASK-116 (TASK-010, C29, AC-R010-01): the athlete's answer to "Work
 * completed", written onto the For Time race it judges (`answerForTime`), so
 * a reload brings back the answer given — never the clock's starting point
 * over a correction. A race that never started has nothing to answer.
 */
export function writeForTimeAnswer(storage: ShellStorage | null, block: BlockProgress, workCompleted: boolean): void {
  if (storage === null) return
  const previous = readForTimeState(storage, block.blockId)
  if (previous === null || previous.startedAt === null || previous.workCompleted === workCompleted) return
  writeForTimeState(storage, block.blockId, answerForTime(previous, workCompleted))
}

/** A record with the flag set, or without it at all (absent, never `false`). */
function withSaveFailed<T extends { readonly saveFailed?: boolean }>(record: T, failed: boolean): T {
  const next = { ...record }
  if (failed) return { ...next, saveFailed: true }
  delete (next as { saveFailed?: boolean }).saveFailed
  return next
}

/**
 * The formats whose log keeps a failed save and its typed entries on its
 * record (A3 TASK-116; the EMOM since A3 TASK-117); a ladder's are its durable
 * attempt's.
 */
export type TimedSaveFormat = 'emom' | 'amrap' | 'for_time'

/**
 * A3 TASK-116 (TASK-AC-8FF68F3F5241): notes on the attempt's own record that a
 * save of its log failed (`true`) or that one has since landed (`false`),
 * keeping every other field. Written only when it changes, so a record whose
 * save never failed is never rewritten; an attempt that never started has
 * nothing to note.
 */
export function writeTimedSaveFailed(
  storage: ShellStorage | null,
  format: TimedSaveFormat,
  block: BlockProgress,
  failed: boolean,
): void {
  if (storage === null) return
  if (format === 'amrap') {
    const previous = readAmrapState(storage, block.blockId)
    if (previous === null || previous.startedAt === null || (previous.saveFailed === true) === failed) return
    writeAmrapState(storage, block.blockId, withSaveFailed(previous, failed))
    return
  }
  if (format === 'emom') {
    const previous = readEmomState(storage, block.blockId)
    if (previous === null || previous.startedAt === null || (previous.saveFailed === true) === failed) return
    writeEmomState(storage, block.blockId, withSaveFailed(previous, failed))
    return
  }
  const previous = readForTimeState(storage, block.blockId)
  if (previous === null || previous.startedAt === null || (previous.saveFailed === true) === failed) return
  writeForTimeState(storage, block.blockId, withSaveFailed(previous, failed))
}

/** The same entries, typed alike: no record is rewritten for a draft it already holds. */
function sameEntries(
  a: Readonly<Record<string, MovementActualDraft>> | undefined,
  b: Readonly<Record<string, MovementActualDraft>>,
): boolean {
  const kept = a ?? NO_MOVEMENTS
  const ids = Object.keys(b)
  if (Object.keys(kept).length !== ids.length) return false
  return ids.every((id) => kept[id]?.amount === b[id].amount && kept[id]?.weight === b[id].weight)
}

/**
 * A3 TASK-117 (TASK-015, TASK-047; TASK-AC-339D1096F660): the attempt's typed
 * per-movement entries — each movement's next-round amount and actual load,
 * exactly as typed — written onto its own record, keeping every other field,
 * so a reload brings them back. The caller has already cleared any amount a
 * changed round count or answer no longer belongs to. Written only when the
 * entries change; an attempt that never started has nothing to keep them on.
 */
export function writeTimedMovements(
  storage: ShellStorage | null,
  format: TimedSaveFormat,
  block: BlockProgress,
  movements: Readonly<Record<string, MovementActualDraft>>,
): void {
  if (storage === null) return
  if (format === 'amrap') {
    const previous = readAmrapState(storage, block.blockId)
    if (previous === null || previous.startedAt === null || sameEntries(previous.movements, movements)) return
    writeAmrapState(storage, block.blockId, { ...previous, movements })
    return
  }
  if (format === 'emom') {
    const previous = readEmomState(storage, block.blockId)
    if (previous === null || previous.startedAt === null || sameEntries(previous.movements, movements)) return
    writeEmomState(storage, block.blockId, { ...previous, movements })
    return
  }
  const previous = readForTimeState(storage, block.blockId)
  if (previous === null || previous.startedAt === null || sameEntries(previous.movements, movements)) return
  writeForTimeState(storage, block.blockId, { ...previous, movements })
}
