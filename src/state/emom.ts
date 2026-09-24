/**
 * EXE-03 — where an EMOM is, as a pure function of the block's own clock and
 * one timestamp.
 *
 * "Every minute on the minute" is a contract about the *grid*, not about a
 * counter: fixed work at the top of each minute, and whatever is left of that
 * minute is rest (`structure-types.md` §4). So nothing here counts ticks. The
 * state that is written down is the moment the user started the block, and
 * every reading — which minute it is, how much of it is left, which movement
 * this minute prescribes — is arithmetic on `now - startedAt`. That is the same
 * posture `workout-clock.ts` takes for the session timer, and it buys the same
 * two properties: a phone that locked for four minutes comes back to minute
 * five, and a refresh mid-block resumes the minute it was actually in
 * (SES-01).
 *
 * Three decisions the requirement and the clarity spec are explicit about:
 *
 *   · **The minute boundary flips the work.** `emomView` derives the live
 *     movement from the minute — `((minute - 1) % size) + 1`, which is
 *     `emom-clarity.md` §2's rule — so a 2-movement EMOM alternates odd/even
 *     and a 3-movement one rotates, with no separate state to fall out of step.
 *   · **The remainder of the minute reads as rest.** Two things put the block
 *     in `rest`: the user saying the minute's work is done, and the block's own
 *     `round_rest_seconds` running as a trailing window inside every minute.
 *     Either way the next boundary flips it back to `work` on its own.
 *   · **Rest is the block's, once per minute.** The number comes from
 *     `workout_blocks.round_rest_seconds`, so the movements of an EMOM cannot
 *     each carry a rest the user is not meant to take
 *     (`superset-circuit-clarity.md` §8).
 *
 * Nothing here imports React, touches storage, or knows what a card looks
 * like. `emom-block.tsx` draws it and `workout-persistence.ts` remembers it.
 */
import type { Enums } from '../data/database.types'
import type { BlockProgress } from './workout-progress'

const SECONDS_PER_MINUTE = 60

/** How many of a rotating movement's minutes a label names before it elides. */
const MINUTES_NAMED = 3

/** What the block prescribes: the shape a reading is taken against. */
export interface EmomShape {
  /**
   * `workout_blocks.timer_type`. `none` is a block that prescribes no clock,
   * and an EMOM without a clock is a list rather than a prescription — it is
   * read here rather than assumed from the structure type.
   */
  readonly timerType: Enums<'timer_contract'>
  /**
   * Whole minutes the window runs for, from `timer_seconds`. Null is "the block
   * does not say", and the EMOM then never finishes on its own — the user
   * completes it, and the minutes they got through are still counted. A
   * remainder shorter than a minute is not a minute of work the block
   * prescribes, so the seconds floor rather than round.
   */
  readonly minutes: number | null
  /**
   * The block's rest, as a trailing window inside each minute. Zero when the
   * block prescribes none, and zero when it prescribes a minute or more: a rest
   * that fills the whole minute would leave no work at the top of it, so it is
   * not a rest *inside* a minute and this is not the place to draw it.
   */
  readonly restSeconds: number
  /** Movements in the rotation: the positions are 1…size. */
  readonly size: number
}

/**
 * What is remembered about an EMOM, and it is deliberately two fields.
 *
 * `startedAt` is the block's clock. `workDoneMinute` is the one thing the
 * clock cannot answer: the user finished this minute's work early, so the rest
 * of the minute is rest. Both survive a refresh; neither is a counter.
 */
export interface EmomState {
  /** When the user started the block, ISO. Null before they have. */
  readonly startedAt: string | null
  /** The last minute whose work the user marked done. Null for none. */
  readonly workDoneMinute: number | null
}

/** Not started: no clock running, no minute marked. */
export const EMOM_START: EmomState = { startedAt: null, workDoneMinute: null }

/**
 * `untimed` is a block that prescribes no clock; `ready` is one whose clock the
 * user has not started; `finished` is one whose last prescribed minute has
 * elapsed. The other two are the grid itself.
 */
export type EmomPhase = 'untimed' | 'ready' | 'work' | 'rest' | 'finished'

export interface EmomView {
  readonly phase: EmomPhase
  /** 1-based, and never past the prescribed window. */
  readonly minute: number
  /** The window's minutes, as the shape read them. */
  readonly minutes: number | null
  /** Seconds left of the minute the user is in. */
  readonly secondsRemaining: number
  /** The movement this minute prescribes, 1-based. Null when none is live. */
  readonly activePosition: number | null
  /** The movement the next minute opens with. Null when there is no next. */
  readonly nextPosition: number | null
  /** Minutes of work got through — `block_results.minutes_completed`. */
  readonly minutesCompleted: number
}

/**
 * The block's own columns, read once.
 *
 * Every number is clamped rather than trusted: a fractional window would put
 * the grid half a second out for the rest of the block, and a negative rest
 * would still have to be counted down.
 */
export function emomShape(block: BlockProgress): EmomShape {
  const seconds = block.timerSeconds
  const minutes =
    seconds === null ? null : Math.floor(Math.max(0, seconds) / SECONDS_PER_MINUTE)
  const rest = Math.max(0, Math.trunc(block.roundRestSeconds ?? 0))

  return {
    timerType: block.timerType,
    minutes: minutes === null || minutes < 1 ? null : minutes,
    restSeconds: rest < SECONDS_PER_MINUTE ? rest : 0,
    size: block.exercises.length,
  }
}

/** True when the block carries a clock for the grid to be a grid at all. */
export function isEmomTimed(shape: EmomShape): boolean {
  return shape.timerType !== 'none'
}

/** The movement a given minute prescribes — `emom-clarity.md` §2's rule. */
export function positionForMinute(minute: number, size: number): number | null {
  if (size <= 0) return null
  return ((Math.max(1, Math.trunc(minute)) - 1) % size) + 1
}

/**
 * The clock starts once. Starting an EMOM that is already running would move
 * the grid under a user who is inside it, so a second start is ignored rather
 * than treated as a restart.
 */
export function startEmom(state: EmomState, nowMs: number): EmomState {
  if (state.startedAt !== null) return state
  return { startedAt: new Date(nowMs).toISOString(), workDoneMinute: null }
}

/**
 * "This minute's work is done" — the rest of the minute is rest, and the next
 * boundary flips it back on its own. Only meaningful while working: marking a
 * minute done twice, or during its rest, is the same fact.
 */
export function markMinuteDone(state: EmomState, view: EmomView): EmomState {
  if (view.phase !== 'work') return state
  return { ...state, workDoneMinute: view.minute }
}

/**
 * A restored record, repaired against the block it is being restored into.
 *
 * A `startedAt` no clock can read is worse than no clock: elapsed time would
 * be zero forever and the block would sit at minute one. A marked minute past
 * the window, or one that is not a minute, is dropped — the user is still
 * inside a block whose clock is the truth.
 */
export function clampEmomState(stored: EmomState, shape: EmomShape): EmomState {
  const startedAt =
    stored.startedAt !== null && !Number.isNaN(Date.parse(stored.startedAt))
      ? stored.startedAt
      : null

  const marked = stored.workDoneMinute
  const usable =
    startedAt !== null &&
    marked !== null &&
    Number.isInteger(marked) &&
    marked >= 1 &&
    (shape.minutes === null || marked <= shape.minutes)

  return { startedAt, workDoneMinute: usable ? marked : null }
}

/**
 * Where the EMOM is, given the seconds its clock has run for.
 *
 * `elapsedSeconds` is the caller's reading of `now - startedAt` rather than
 * anything accumulated here, which is what makes every value below correct
 * after a background, a lock or a refresh.
 */
export function emomView(
  state: EmomState,
  shape: EmomShape,
  elapsedSeconds: number,
): EmomView {
  if (!isEmomTimed(shape)) {
    return {
      phase: 'untimed',
      minute: 1,
      minutes: shape.minutes,
      secondsRemaining: 0,
      activePosition: null,
      nextPosition: null,
      minutesCompleted: 0,
    }
  }

  if (state.startedAt === null) {
    return {
      phase: 'ready',
      minute: 1,
      minutes: shape.minutes,
      secondsRemaining: SECONDS_PER_MINUTE,
      // Minute one's movement, so the card can say what the block opens with
      // before the clock is running. Nothing is live yet, which is the marker's
      // problem rather than this one's.
      activePosition: positionForMinute(1, shape.size),
      nextPosition: positionForMinute(2, shape.size),
      minutesCompleted: 0,
    }
  }

  const elapsed = Math.max(0, Math.floor(elapsedSeconds))
  const elapsedMinutes = Math.floor(elapsed / SECONDS_PER_MINUTE)

  if (shape.minutes !== null && elapsedMinutes >= shape.minutes) {
    return {
      phase: 'finished',
      minute: shape.minutes,
      minutes: shape.minutes,
      secondsRemaining: 0,
      activePosition: null,
      nextPosition: null,
      minutesCompleted: shape.minutes,
    }
  }

  const minute = elapsedMinutes + 1
  const secondsRemaining = SECONDS_PER_MINUTE - (elapsed % SECONDS_PER_MINUTE)

  // Two ways into the remainder: the user said the work was done, or the
  // block's own trailing rest window has opened. Both are "the work at the top
  // of this minute is behind you", which is why both count the minute below.
  const markedDone = state.workDoneMinute !== null && state.workDoneMinute >= minute
  const resting =
    markedDone || (shape.restSeconds > 0 && secondsRemaining <= shape.restSeconds)

  const completed = elapsedMinutes + (resting ? 1 : 0)
  const lastMinute = shape.minutes !== null && minute >= shape.minutes

  return {
    phase: resting ? 'rest' : 'work',
    minute,
    minutes: shape.minutes,
    secondsRemaining,
    activePosition: positionForMinute(minute, shape.size),
    nextPosition: lastMinute ? null : positionForMinute(minute + 1, shape.size),
    minutesCompleted: shape.minutes === null ? completed : Math.min(completed, shape.minutes),
  }
}

/**
 * Which minutes a movement covers, in words — `emom-clarity.md` §3.
 *
 * A single-movement EMOM gets none: every minute is the same movement, and a
 * label saying so on the only row would say nothing. Two movements alternate,
 * which the app states as `ODD MIN` / `EVEN MIN` rather than as a list,
 * because that is the pattern the user is holding in their head. Three or more
 * rotate, and the label names the minutes this movement actually gets —
 * elided once there are more than three, and truncated to the window, so a
 * 5-minute EMOM of three movements does not promise a minute seven.
 */
export function minuteAssignment(
  position: number,
  shape: EmomShape,
): string | null {
  if (shape.size <= 1) return null
  if (shape.size === 2) return position === 1 ? 'ODD MIN' : 'EVEN MIN'

  const covered: number[] = []
  for (
    let minute = position;
    shape.minutes === null || minute <= shape.minutes;
    minute += shape.size
  ) {
    covered.push(minute)
    // One past what is shown, which is how the label knows it is eliding.
    if (covered.length > MINUTES_NAMED) break
  }

  // A movement whose first turn falls outside the window: the prescription and
  // its clock disagree, and the honest label says the movement has no minute
  // rather than inventing one.
  if (covered.length === 0) return 'NOT IN WINDOW'

  const named = covered.slice(0, MINUTES_NAMED)
  return `MIN ${named.join(', ')}${covered.length > named.length ? '…' : ''}`
}
