/**
 * EXE-04b — a For Time block's clock, as a pure function of two timestamps and
 * the block's cap.
 *
 * For Time is the one structure whose *score is the clock*: the user races a
 * prescribed amount of work against `workout_blocks.timer_seconds`, and what is
 * recorded is how long it took and whether they beat the cap
 * (`block_results.elapsed_seconds`, `completed_under_cap`). So the two things
 * this module has to get right are the two the requirement names:
 *
 *   · **Finishing under the cap stops the clock at the finish, not at the cap.**
 *     The finish is a timestamp, and the elapsed reading of a finished block is
 *     `finishedAt - startedAt` — frozen arithmetic over two stamps rather than a
 *     number that keeps being read from the wall clock.
 *   · **Reaching the cap is a different outcome, not a missing one.** It needs
 *     no stamp at all: a running block whose elapsed has reached the cap *is*
 *     capped, derived, so a phone that was locked through the last two minutes
 *     comes back to `CAP REACHED` rather than to a clock still counting.
 *
 * Both are the posture `workout-clock.ts` takes and for the same reason — a
 * counter that accumulated its own ticks would drift by exactly the time the
 * user was away — and the posture `circuit.ts` takes for position: state that
 * can be written down, restored and read again (`workout-persistence.ts`),
 * rather than state that only exists while the tab is open.
 *
 * Nothing here imports React, touches storage, or knows what a card looks like.
 * `for-time-block.tsx` draws it.
 */
import type { BlockOutcome } from './block-completion'
import {
  clockStopMoment,
  isClockPaused,
  pausedElapsedSeconds,
  restoredPause,
  withoutPause,
  type TimedLifecyclePhase,
} from './timed-lifecycle'
import type { BlockProgress } from './workout-progress'

/**
 * The last seconds before the cap, where the urgency treatment applies and
 * nowhere else. Ten, matching the shipped `TimerDisplay`'s own default
 * threshold and IA.md §4's "the final ten seconds may use the urgency pulse" —
 * one number, so the red digits and the words beside them turn together.
 */
export const FOR_TIME_URGENCY_SECONDS = 10

/** What the block prescribes: the clock the state is read against. */
export interface ForTimeShape {
  /**
   * `workout_blocks.timer_seconds` — the cap, in seconds. For Time always
   * carries one (`timed_structures_have_a_clock`), but null is representable
   * and is honoured rather than invented: no cap means a clock that counts up
   * and is never cut off, and an outcome that says nothing about a cap it never
   * had.
   */
  readonly capSeconds: number | null
  /** Movements in the block; zero once every one of them has been swapped out. */
  readonly size: number
}

/**
 * The block's clock as two moments. `startedAt` null is "not started";
 * `finishedAt` is stamped by the one tap that ends the attempt early.
 */
export interface ForTimeState {
  /**
   * When the attempt began, ISO. Null before the user starts it. Moved forward
   * by every Resume, so `now - startedAt` is always the active time
   * (`timed-lifecycle.ts`).
   */
  readonly startedAt: string | null
  /** When the user called it finished, ISO. Null while it is still running. */
  readonly finishedAt: string | null
  /**
   * TASK-006 (C18): when the running attempt was paused, ISO. Absent while it
   * runs, and in every record written before Pause existed.
   */
  readonly pausedAt?: string | null
  /**
   * TASK-010 (C29, AC-R010-01): the athlete's own answer to "Work completed",
   * once the race has ended — `true` Complete, `false` Incomplete. Absent until
   * they answer, and in every record written before the question existed;
   * the clock's ending then supplies the initial answer (`forTimeCompletion`).
   * Kept on the race's own record so a reload never replaces a correction with
   * the clock's default — an Incomplete must not come back as Complete.
   */
  readonly workCompleted?: boolean
}

/** Nothing started, nothing finished. */
export const FOR_TIME_START: ForTimeState = { startedAt: null, finishedAt: null }

/**
 * `ready` — the clock has not been started · `running` — counting, under the
 * cap · `paused` — frozen by the user's Pause, cap and all (TASK-006, C18) ·
 * `finished` — stopped by the user, under the cap · `capped` — the cap was
 * reached first.
 *
 * The last two are the requirement's "both completion paths", and they are two
 * phases rather than one phase and a flag so that a renderer cannot draw them
 * the same way by forgetting to read the flag. Paused is its own phase for the
 * same reason: a frozen clock must not be drawn as one running out.
 */
export type ForTimePhase = 'ready' | 'running' | 'paused' | 'finished' | 'capped'

const MILLISECONDS_PER_SECOND = 1000

/** The block's own columns, read once. A fractional cap is still a deadline. */
export function forTimeShape(block: BlockProgress): ForTimeShape {
  return {
    capSeconds:
      block.timerSeconds === null ? null : Math.max(1, Math.trunc(block.timerSeconds)),
    size: block.exercises.length,
  }
}

/**
 * Whole seconds between two ISO stamps, or null when that is not a measurable
 * interval: either stamp unreadable, or the second one before the first. Null
 * rather than a clamped zero, because a finish that precedes its start is not a
 * finish of zero seconds — it is a record that cannot be believed, and the
 * caller treats it as the attempt still running rather than as an instant one.
 */
function secondsBetween(from: string, to: string): number | null {
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null

  return Math.floor((end - start) / MILLISECONDS_PER_SECOND)
}

/**
 * The tap that starts the attempt. Starting an attempt that is already running
 * or already over is not a restart: the elapsed time is the score, and a second
 * `Start` that reset it would discard the one measurement the block exists to
 * make.
 */
export function startForTime(state: ForTimeState, now: number): ForTimeState {
  if (state.startedAt !== null) return state
  return { startedAt: new Date(now).toISOString(), finishedAt: null }
}

/**
 * The start the running reading ticks from, or null when nothing is ticking:
 * not started, finished, or paused (TASK-006). A stopped attempt's time is
 * fixed by its stamps, and repainting it twice a second would change nothing.
 */
export function forTimeTicking(state: ForTimeState): string | null {
  return state.finishedAt === null && !isClockPaused(state) ? state.startedAt : null
}

/** The race's phase, as the shared Start/Pause/Resume/Finish actions read it (C18). */
export function forTimeLifecycle(phase: ForTimePhase): TimedLifecyclePhase {
  switch (phase) {
    case 'ready':
    case 'running':
    case 'paused':
      return phase
    case 'finished':
    case 'capped':
      return 'ended'
  }
}

/**
 * The tap that stops it. Only a running or paused attempt can be finished — a
 * block that was never started has no elapsed time to freeze, and one that has
 * already finished keeps the moment it actually finished at. A paused attempt
 * finishes at its pause, not at the later tap (C18).
 */
export function finishForTime(state: ForTimeState, now: number): ForTimeState {
  if (state.startedAt === null || state.finishedAt !== null) return state
  return { ...withoutPause(state), finishedAt: new Date(clockStopMoment(state, now)).toISOString() }
}

/**
 * A restored record, made safe for the block it is being restored into.
 *
 * Two repairs, and both are honest rather than convenient: a stamp that cannot
 * be parsed is dropped, because a clock that reads `NaN` is worse than one that
 * has not started; and a finish before its start is dropped too, because the
 * elapsed time it would record is negative. Dropping the start drops the finish
 * with it — there is nothing left for it to be measured from.
 */
export function clampForTimeState(state: ForTimeState): ForTimeState {
  const startedAt =
    state.startedAt !== null && !Number.isNaN(Date.parse(state.startedAt))
      ? state.startedAt
      : null

  if (startedAt === null) return FOR_TIME_START

  const finishedAt =
    state.finishedAt !== null && secondsBetween(startedAt, state.finishedAt) !== null
      ? state.finishedAt
      : null

  // A pause belongs to an attempt still under way; a finished one has none.
  // The athlete's answer (TASK-010) is kept only as the boolean it is.
  return {
    startedAt,
    finishedAt,
    ...(finishedAt === null ? restoredPause({ startedAt, pausedAt: state.pausedAt }) : {}),
    ...(typeof state.workCompleted === 'boolean' ? { workCompleted: state.workCompleted } : {}),
  }
}

/**
 * TASK-010 (C29): the athlete's Complete or Incomplete, written onto the race
 * it judges. A race that never started has nothing to judge.
 */
export function answerForTime(state: ForTimeState, workCompleted: boolean): ForTimeState {
  if (state.startedAt === null) return state
  return { ...state, workCompleted }
}

/** Everything the renderer draws, derived rather than stored. */
export interface ForTimeView {
  readonly phase: ForTimePhase
  /**
   * The seconds this attempt took, and what completion supplies as
   * `elapsed_seconds`: counting while it runs, the finish while it is finished,
   * the cap once the cap has been reached. Zero before it starts.
   */
  readonly elapsedSeconds: number
  /**
   * Seconds left of the cap, or null when the block prescribes none. Zero once
   * the cap is reached, and frozen at whatever was left at the finish.
   */
  readonly remainingSeconds: number | null
  /**
   * Inside the last `FOR_TIME_URGENCY_SECONDS` of a *running* cap, and nowhere
   * else. A finished block is not under time pressure however close it came,
   * which is why this is false in every phase but one — the requirement asks for
   * urgency styling near the cap **only**.
   */
  readonly urgent: boolean
  /** The cap, for the line that states it. Null when there is none. */
  readonly capSeconds: number | null
  /**
   * How the clock stopped: true for a finish under the cap, false once the cap
   * is reached, null while it has not stopped — and null for a block with no
   * cap, which cannot be under or over one. TASK-010: this is the starting
   * point of the completion answer, not the answer (`forTimeCompletion`).
   */
  readonly completedUnderCap: boolean | null
}

/**
 * The state as the screen reads it.
 *
 * `runningElapsedSeconds` comes from the caller's wall clock — this module
 * never asks what time it is, so the same state renders the same view in a test
 * as it does at 3pm — and is ignored entirely once the attempt has finished,
 * because a finished attempt's elapsed time is the distance between its two
 * stamps and nothing else.
 */
export function forTimeView(
  state: ForTimeState,
  shape: ForTimeShape,
  runningElapsedSeconds: number,
): ForTimeView {
  const { capSeconds } = shape

  if (state.startedAt === null) {
    return {
      phase: 'ready',
      elapsedSeconds: 0,
      remainingSeconds: capSeconds,
      urgent: false,
      capSeconds,
      completedUnderCap: null,
    }
  }

  const stopped =
    state.finishedAt === null ? null : secondsBetween(state.startedAt, state.finishedAt)
  // TASK-006 (C18): a paused attempt reads the moment it was paused, so the
  // clock and its cap stay frozen however long the pause lasts.
  const paused = stopped === null ? pausedElapsedSeconds(state) : null
  const raw = stopped ?? paused ?? Math.max(0, Math.floor(runningElapsedSeconds))
  const capped = capSeconds !== null && raw >= capSeconds
  const elapsedSeconds = capped ? capSeconds : raw
  const remainingSeconds = capSeconds === null ? null : Math.max(0, capSeconds - elapsedSeconds)

  // The cap wins over the finish. A record restored after the phone was locked
  // through the last two minutes can carry a stamp past the cap; that attempt
  // reached the cap, and reporting it as a finish would record a time the
  // structure does not admit.
  if (capped) {
    return {
      phase: 'capped',
      elapsedSeconds,
      remainingSeconds,
      urgent: false,
      capSeconds,
      completedUnderCap: false,
    }
  }

  if (stopped !== null) {
    return {
      phase: 'finished',
      elapsedSeconds,
      remainingSeconds,
      urgent: false,
      capSeconds,
      // No cap, no claim: a block that prescribed no deadline was neither
      // under one nor over it (DATA_MODEL §8).
      completedUnderCap: capSeconds === null ? null : true,
    }
  }

  return {
    phase: paused === null ? 'running' : 'paused',
    elapsedSeconds,
    remainingSeconds,
    // Nothing is running out while the clock is frozen: no urgency, no pulse.
    urgent:
      paused === null && remainingSeconds !== null && remainingSeconds <= FOR_TIME_URGENCY_SECONDS,
    capSeconds,
    completedUnderCap: null,
  }
}

/**
 * TASK-010 (C29; AC-R010-01; R78, R86, R124) — whether the prescribed work was
 * completed, as the result log offers it and `completed_under_cap` records it.
 *
 * The clock cannot know whether the athlete performed all the work, so this is
 * an answer with a starting point rather than a measurement:
 *
 *   · **Finish under the cap** starts at Complete: in For Time the athlete's
 *     Finish is their own report that the work is done (R78's manual-Finish
 *     default) — and Incomplete is one tap away, because Finish proves nothing.
 *   · **The cap** starts at Incomplete, with Complete still offered for someone
 *     who finished but could not stop the clock in time (R78).
 *   · **Before the race has ended** there is no answer at all: stopping to
 *     record mid-race, pausing or never starting claims nothing.
 *   · **No cap, no claim** (DATA_MODEL §8): a block with no deadline was
 *     neither under one nor over it, so the question is not asked.
 *
 * `answer` is the athlete's own (`ForTimeState.workCompleted`) and wins over
 * either starting point.
 */
export function forTimeCompletion(view: ForTimeView, answer?: boolean): boolean | null {
  if (view.capSeconds === null) return null
  if (view.phase !== 'finished' && view.phase !== 'capped') return null
  return answer ?? view.phase === 'finished'
}

/**
 * What this structure observed, for the shell's one `block_results` write.
 *
 * A block that was never started observed nothing and supplies nothing — an
 * `elapsed_seconds` of zero would be a measurement, and null is the absence
 * (DATA_MODEL §8). Everything else supplies the clock it actually ran, including
 * an attempt recorded while still running: the seconds are real, and stopping
 * to record is stopping.
 *
 * `completed_under_cap` is the completion answer (`forTimeCompletion`), and
 * nothing when there is none. TASK-010 (AC-R010-01): an attempt recorded while
 * still running claims no completion — stopping alone never marks the planned
 * work performed — where it used to be read as a finish under the cap.
 */
export function forTimeOutcome(view: ForTimeView, answer?: boolean): BlockOutcome {
  if (view.phase === 'ready') return {}

  const completed = forTimeCompletion(view, answer)

  return {
    elapsedSeconds: view.elapsedSeconds,
    ...(completed === null ? {} : { completedUnderCap: completed }),
  }
}
