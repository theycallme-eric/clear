/**
 * EXE-04c — an AMRAP's score, as a pure function of a window and three numbers.
 *
 * An AMRAP records *as many rounds as possible*, so the one thing it observes is
 * the one thing no row can tell you: how many rounds the user got through, and
 * how far into the round the buzzer caught them. A set log says a movement was
 * performed; it cannot say it was performed as round four of a round that was
 * never finished. So this is genuine shell state, kept the way `circuit.ts`
 * keeps a circuit's position — as data that can be written down, restored and
 * read again after a refresh (`workout-persistence.ts`).
 *
 * Four decisions, each of which the requirement or the logging spec is explicit
 * about:
 *
 *   · **The window is a timestamp, never a tick count.** `startedAt` is stamped
 *     once and the remaining time is `cap - elapsed`, recomputed from the clock
 *     by the caller (`workout-clock.ts`). A phone that locked for four minutes
 *     of an eight-minute AMRAP comes back to four minutes left, not to eight.
 *   · **Expiry is derived, not written.** Nothing has to be running for the
 *     window to close — `amrapView` reads the clock and reports `complete` once
 *     the cap has passed, which is why a session restored after the buzzer
 *     restores into the completion state rather than into a countdown at zero.
 *   · **Finishing early and the buzzer arrive at the same place.** `finishAmrap`
 *     records the seconds that had actually elapsed, so the score is logged the
 *     same way whichever ended the window (`amrap-logging.md` §3).
 *   · **A partial round is typed absence.** `partialRoundReps` is `null` for "no
 *     partial round recorded" and `0` for "the buzzer landed on the boundary" —
 *     different observations, kept different all the way to the column
 *     (DATA-01d, DATA_MODEL §8).
 *
 * Nothing here imports React, touches storage, or knows what a card looks like.
 * `amrap-block.tsx` draws it and `workout-persistence.ts` remembers it.
 */
import type { BlockOutcome } from './block-completion'
import type { BlockProgress } from './workout-progress'

/** What the block prescribes: the window, and what one round is made of. */
export interface AmrapShape {
  /**
   * `workout_blocks.timer_seconds` — the window, in seconds. Null is "the block
   * does not say", and the AMRAP then never expires on its own: the user ends it
   * when they are done, and the rounds they got through are still counted.
   */
  readonly capSeconds: number | null
  /** Movements still prescribed. One round is all of them.  */
  readonly size: number
}

/**
 * The score as it is being built. Every field is something the user did rather
 * than something the screen showed, which is why all four survive a refresh.
 */
export interface AmrapState {
  /** When the window opened, ISO. Null: it has not been started. */
  readonly startedAt: string | null
  /**
   * Seconds on the clock when the user ended the window early. Null means they
   * did not — the cap ended it, or it is still open.
   */
  readonly endedAtSeconds: number | null
  /** Rounds banked. Zero is a real score: the user managed none. */
  readonly roundsCompleted: number
  /** Reps into the unfinished round, or null for no partial round recorded. */
  readonly partialRoundReps: number | null
}

export type AmrapPhase = 'ready' | 'running' | 'complete'

/** Nothing started, nothing counted, no partial round claimed. */
export const AMRAP_START: AmrapState = {
  startedAt: null,
  endedAtSeconds: null,
  roundsCompleted: 0,
  partialRoundReps: null,
}

/**
 * The block's own columns, read once. The cap is clamped above zero rather than
 * trusted: a window of zero seconds is a window that closed before it opened,
 * and it is more honest to treat it as a block that carries no cap at all.
 */
export function amrapShape(block: BlockProgress): AmrapShape {
  const cap = block.timerSeconds === null ? null : Math.trunc(block.timerSeconds)

  return {
    capSeconds: cap === null || cap <= 0 ? null : cap,
    size: block.exercises.length,
  }
}

/** Opens the window. Starting an AMRAP that is already under way is not a move. */
export function startAmrap(state: AmrapState, now: number): AmrapState {
  if (state.startedAt !== null) return state
  return { ...state, startedAt: new Date(now).toISOString() }
}

/**
 * Ends the window where the user actually stopped it.
 *
 * The elapsed reading comes from the caller's clock and is clamped to the cap:
 * a tap that lands in the same second the buzzer does records the cap rather
 * than a second past it, so the logged time can never exceed the prescription.
 */
export function finishAmrap(
  state: AmrapState,
  shape: AmrapShape,
  elapsedSeconds: number,
): AmrapState {
  if (state.startedAt === null || state.endedAtSeconds !== null) return state

  const elapsed = Math.max(0, Math.floor(elapsedSeconds))

  return {
    ...state,
    endedAtSeconds: shape.capSeconds === null ? elapsed : Math.min(elapsed, shape.capSeconds),
  }
}

/**
 * One round, banked or taken back. This is the highest-frequency interaction in
 * the app (EXE-04c), which is the whole reason it is a `+1` on a number and not
 * a form: there is nothing to submit, nothing to open, and nothing to lose by
 * having tapped it once too often — `-1` undoes it.
 */
export function countRound(state: AmrapState, delta: number): AmrapState {
  const rounds = Math.max(0, state.roundsCompleted + Math.trunc(delta))
  return rounds === state.roundsCompleted ? state : { ...state, roundsCompleted: rounds }
}

/**
 * Records a partial round, or the absence of one.
 *
 * `null` is not zero and the two are not interchangeable: zero says the buzzer
 * landed on a round boundary, null says nobody recorded how far into the next
 * one the user was. Both are legitimate and OVR-03 reads them differently.
 */
export function setPartialRoundReps(
  state: AmrapState,
  reps: number | null,
): AmrapState {
  return {
    ...state,
    partialRoundReps: reps === null ? null : Math.max(0, Math.trunc(reps)),
  }
}

/**
 * A restored record, made safe for the block it is being restored into.
 *
 * The record outlives the render that wrote it and the block can have changed
 * underneath it — a shortened cap, a movement swapped out. Repairing is the
 * honest response: negative counts, fractional reps and a window that ended
 * after a cap that has since been shortened are all brought back inside what
 * the block now prescribes rather than rendered as they were stored.
 */
export function clampAmrapState(state: AmrapState, shape: AmrapShape): AmrapState {
  const ended =
    state.endedAtSeconds === null
      ? null
      : Math.max(0, Math.floor(state.endedAtSeconds))

  return {
    startedAt: state.startedAt,
    endedAtSeconds:
      ended === null || shape.capSeconds === null
        ? ended
        : Math.min(ended, shape.capSeconds),
    roundsCompleted: Math.max(0, Math.trunc(state.roundsCompleted)),
    partialRoundReps:
      state.partialRoundReps === null
        ? null
        : Math.max(0, Math.trunc(state.partialRoundReps)),
  }
}

/** Everything the renderer draws, derived rather than stored. */
export interface AmrapView {
  readonly phase: AmrapPhase
  /** The prescribed window, or null when the block carries none. */
  readonly capSeconds: number | null
  /** Movements in one round: what `Each round:` introduces. */
  readonly size: number
  /**
   * Seconds left of the window. Zero once it is over, and zero for a block with
   * no cap, which has no deadline to count down to.
   */
  readonly remainingSeconds: number
  /** Seconds the window has been open — the time the score belongs to. */
  readonly elapsedSeconds: number
  /** Rounds banked so far. */
  readonly roundsCompleted: number
  /** The partial round recorded, or null for none. */
  readonly partialRoundReps: number | null
  /** True when the cap ended the window rather than the user. */
  readonly expired: boolean
}

/**
 * The state as the screen reads it. `clockElapsedSeconds` comes from the
 * caller's wall clock — this module never asks what time it is, so the same
 * state renders the same view in a test as it does at 3pm.
 */
export function amrapView(
  state: AmrapState,
  shape: AmrapShape,
  clockElapsedSeconds: number,
): AmrapView {
  const banked = Math.max(0, Math.trunc(state.roundsCompleted))
  const common = {
    capSeconds: shape.capSeconds,
    size: shape.size,
    roundsCompleted: banked,
    partialRoundReps: state.partialRoundReps,
  }

  if (state.startedAt === null) {
    return {
      ...common,
      phase: 'ready',
      remainingSeconds: shape.capSeconds ?? 0,
      elapsedSeconds: 0,
      expired: false,
    }
  }

  // The user's own stop wins over the clock: it happened first, by definition.
  if (state.endedAtSeconds !== null) {
    return {
      ...common,
      phase: 'complete',
      remainingSeconds: 0,
      elapsedSeconds: state.endedAtSeconds,
      expired: false,
    }
  }

  const elapsed = Math.max(0, Math.floor(clockElapsedSeconds))

  // Derived, not written: nothing had to be running for the buzzer to have gone.
  if (shape.capSeconds !== null && elapsed >= shape.capSeconds) {
    return {
      ...common,
      phase: 'complete',
      remainingSeconds: 0,
      elapsedSeconds: shape.capSeconds,
      expired: true,
    }
  }

  return {
    ...common,
    phase: 'running',
    remainingSeconds: shape.capSeconds === null ? 0 : shape.capSeconds - elapsed,
    elapsedSeconds: elapsed,
    expired: false,
  }
}

/**
 * What completion supplies to the shell (EXE-01).
 *
 * Three fields, and each one is present only if it was observed. An AMRAP that
 * was never started measured nothing at all — no rounds, no time — and supplies
 * an empty outcome rather than a row of zeroes nobody performed (DATA_MODEL §8).
 * `partial_round_reps` is omitted when no partial round was recorded, which is
 * exactly how `null` gets into the column instead of a zero that would read as
 * "stopped on the boundary".
 */
export function amrapOutcome(view: AmrapView): BlockOutcome {
  if (view.phase === 'ready') return {}

  return {
    elapsedSeconds: view.elapsedSeconds,
    roundsCompleted: view.roundsCompleted,
    ...(view.partialRoundReps === null
      ? {}
      : { partialRoundReps: view.partialRoundReps }),
  }
}
