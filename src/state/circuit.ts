/**
 * EXE-03 — where the user is inside a circuit, as a pure function of three
 * numbers and a timestamp.
 *
 * A circuit is the one structure whose position cannot be derived from the
 * rows. A set log says a movement was performed; it does not say the user is
 * standing in front of the second movement of round three with the shared rest
 * still to come, and two rounds of the same movement are two logs whichever
 * order they happened in. So this is genuine shell state — and it is kept the
 * way `workout-clock.ts` keeps the session timer: as data that can be written
 * down, restored, and read again after a refresh (`workout-persistence.ts`),
 * rather than as a counter that only exists while the tab is open.
 *
 * Three decisions are worth stating, because the requirement is explicit about
 * each of them:
 *
 *   · **Round advance is one tap.** The tap that leaves the last movement of a
 *     round *is* the tap that starts the next one — `advanceCircuit` increments
 *     the round and resets the position in the same step. There is no separate
 *     "end round" control to find with sweaty hands.
 *   · **Shared rest is honored once per round, not once per exercise.** Rest
 *     belongs to `workout_blocks.round_rest_seconds` and is entered only at a
 *     round boundary, which is why it is stamped as `restStartedAt` on the
 *     round the user is entering rather than counted down per movement.
 *   · **Rest is a timestamp, never a tick count.** Remaining time is
 *     `restSeconds - elapsed`, recomputed from the clock by the caller, so a
 *     backgrounded phone comes back to the right number and a refresh mid-rest
 *     resumes the rest it was actually in.
 *
 * Nothing here imports React, touches storage, or knows what a card looks like.
 * `circuit-block.tsx` draws it and `workout-persistence.ts` remembers it.
 */
import type { BlockProgress } from './workout-progress'

/** What the block prescribes: the shape the state is advanced against. */
export interface CircuitShape {
  /**
   * `workout_blocks.rounds`. Null is "the block does not say", and the circuit
   * then never finishes on its own — the user completes it when they are done,
   * and the rounds they got through are still counted.
   */
  readonly rounds: number | null
  /** Movements in the circuit: the positions are 1…size. */
  readonly size: number
  /** `workout_blocks.round_rest_seconds`, zero when the block prescribes none. */
  readonly restSeconds: number
}

/**
 * Where the user is. `round` may be one past the prescribed count, which is
 * how "every round done" is represented without a second flag that could
 * disagree with it.
 */
export interface CircuitState {
  /** 1-based. `rounds + 1` means the last round has been finished. */
  readonly round: number
  /** 1-based position within the round: the `1.` of the movement's label. */
  readonly position: number
  /** When this round's shared rest began, ISO. Null when it is not resting. */
  readonly restStartedAt: string | null
  /**
   * When the current round's elapsed clock started, ISO (REQ-017). Null or
   * absent when it has not been started. While a shared rest runs this is the
   * moment the rest ends, so the next round's clock starts after the rest
   * without a tap — and from the tap, if the rest is ended early.
   */
  readonly roundStartedAt?: string | null
  /**
   * Every finished round's own timing, in order. Kept whole: the screen shows
   * only each round's elapsed duration, never the wall-clock times stored here.
   */
  readonly history?: readonly RoundTiming[]
}

/** One finished round: when its clock started and when it was finished, ISO. */
export interface RoundTiming {
  readonly round: number
  readonly startedAt: string
  readonly endedAt: string
}

export type CircuitPhase = 'work' | 'rest' | 'finished'

/** Round one, movement one, nothing resting. */
export const CIRCUIT_START: CircuitState = {
  round: 1,
  position: 1,
  restStartedAt: null,
}

/**
 * The block's own columns, read once. Rest is clamped at zero rather than
 * trusted: a negative or fractional rest would still have to be counted down.
 */
export function circuitShape(block: BlockProgress): CircuitShape {
  return {
    rounds: block.rounds === null ? null : Math.max(1, Math.trunc(block.rounds)),
    size: block.exercises.length,
    restSeconds: Math.max(0, Math.trunc(block.roundRestSeconds ?? 0)),
  }
}

/** True once the last prescribed round has been finished. */
export function isCircuitFinished(state: CircuitState, shape: CircuitShape): boolean {
  return shape.rounds !== null && state.round > shape.rounds
}

/**
 * Rounds the user actually got through — what `block_results.rounds_completed`
 * records. A round in progress is not a completed round, and a circuit
 * abandoned in round one supplies zero rather than one.
 */
export function completedRounds(state: CircuitState, shape: CircuitShape): number {
  const finished = Math.max(0, state.round - 1)
  return shape.rounds === null ? finished : Math.min(finished, shape.rounds)
}

/** Seconds left of this round's shared rest, given the seconds already spent. */
function restRemaining(
  state: CircuitState,
  shape: CircuitShape,
  restElapsedSeconds: number,
): number {
  if (state.restStartedAt === null) return 0
  return Math.max(0, shape.restSeconds - Math.max(0, Math.floor(restElapsedSeconds)))
}

/**
 * One tap forward.
 *
 * Resting → the rest is over, start the round's first movement. Mid-round →
 * the next movement. Last movement → the next round, with its shared rest
 * stamped if the block prescribes any, or the end of the circuit if there is
 * no next round. A circuit with no movements left to perform cannot advance:
 * everything in it was swapped out, and there is nothing to be one tap away
 * from.
 */
export function advanceCircuit(
  state: CircuitState,
  shape: CircuitShape,
  now: number,
): CircuitState {
  if (shape.size === 0 || isCircuitFinished(state, shape)) return state

  // Skipping the rest and letting it run out reach the same place: the rest is
  // over. It is cleared rather than left to expire so the next tap is Next
  // movement again, not a second Start round on a countdown already at zero.
  if (state.restStartedAt !== null) return { ...state, restStartedAt: null }

  if (state.position < shape.size) {
    return { ...state, position: state.position + 1 }
  }

  const round = state.round + 1
  const finished = shape.rounds !== null && round > shape.rounds

  return {
    round,
    position: 1,
    // Rest is entered here and nowhere else: once at the boundary of a round,
    // never between two movements of one. No rest after the final round —
    // the block is over, and the shell's own rest is the next section.
    restStartedAt:
      finished || shape.restSeconds === 0 ? null : new Date(now).toISOString(),
  }
}

/**
 * A restored record, made safe for the block it is being restored into.
 *
 * The record outlives the render that wrote it, and the block can have changed
 * underneath it — a movement swapped out shortens the circuit. Clamping is the
 * honest repair: the user is put at the nearest position that exists rather
 * than at a movement that does not.
 */
export function clampCircuitState(
  state: CircuitState,
  shape: CircuitShape,
): CircuitState {
  const lastRound = shape.rounds === null ? state.round : shape.rounds + 1
  const round = Math.min(Math.max(1, Math.trunc(state.round)), Math.max(1, lastRound))
  const position = Math.min(
    Math.max(1, Math.trunc(state.position)),
    Math.max(1, shape.size),
  )

  const finished = shape.rounds !== null && round > shape.rounds
  const restStartedAt = shape.restSeconds === 0 || finished ? null : state.restStartedAt
  // An older cache has no round clock, but its rest stamp gives the exact
  // next-round deadline. Restore that clock without inventing past timings.
  const legacyRestDeadline = state.roundStartedAt === undefined && restStartedAt !== null
    ? new Date(Date.parse(restStartedAt) + shape.restSeconds * 1000)
    : null
  const roundStartedAt = legacyRestDeadline !== null && Number.isFinite(legacyRestDeadline.getTime())
    ? legacyRestDeadline.toISOString()
    : state.roundStartedAt

  return {
    round,
    position,
    // A finished circuit is not resting, and neither is one whose block no
    // longer prescribes any rest to be in the middle of.
    restStartedAt,
    // A finished circuit has no round running. The history is carried whole:
    // a shortened block changes what is left to do, not what was done.
    ...(roundStartedAt === undefined
      ? {}
      : { roundStartedAt: finished ? null : roundStartedAt }),
    ...(state.history === undefined ? {} : { history: state.history }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The round clock (REQ-017)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts the current round's elapsed clock: the circuit's initial Start, and
 * the start of a round whose clock was never running. A clock already running
 * is left alone, and so is a finished circuit.
 */
export function startRound(
  state: CircuitState,
  shape: CircuitShape,
  now: number,
): CircuitState {
  if (shape.size === 0 || isCircuitFinished(state, shape)) return state
  if ((state.roundStartedAt ?? null) !== null) return state
  // Only offered once any rest is over; a spent rest is cleared with it.
  return { ...state, restStartedAt: null, roundStartedAt: new Date(now).toISOString() }
}

/**
 * Finishes the round the athlete is in, from wherever they are in it: the
 * round is counted, its timing is kept in the history, and the shared rest is
 * stamped if the block prescribes any. The next round's clock is set to start
 * when that rest ends — at once when there is none, never after the last round.
 */
export function finishRound(
  state: CircuitState,
  shape: CircuitShape,
  now: number,
): CircuitState {
  if (shape.size === 0 || isCircuitFinished(state, shape)) return state

  const next = advanceCircuit(
    { round: state.round, position: shape.size, restStartedAt: null },
    shape,
    now,
  )
  const startedAt = state.roundStartedAt ?? null
  const history = state.history ?? []
  const nextStart = isCircuitFinished(next, shape)
    ? null
    : new Date(now + (next.restStartedAt === null ? 0 : shape.restSeconds * 1000)).toISOString()

  return {
    ...next,
    roundStartedAt: nextStart,
    // A round whose clock never ran has no duration to keep, only its count.
    history:
      startedAt === null
        ? history
        : [...history, { round: state.round, startedAt, endedAt: new Date(now).toISOString() }],
  }
}

/**
 * Ends the shared rest early. The next round's clock starts from this tap
 * rather than from the moment the rest would have run out.
 */
export function endRest(state: CircuitState, shape: CircuitShape, now: number): CircuitState {
  if (state.restStartedAt === null || isCircuitFinished(state, shape)) return state
  return { ...state, restStartedAt: null, roundStartedAt: new Date(now).toISOString() }
}

/**
 * The last recorded round, un-recorded: a mistaken tap is corrected back to
 * what was actually observed, and the rest it started goes with it. The round
 * it re-opens resumes the clock it was finished on.
 */
export function takeBackRound(state: CircuitState, shape: CircuitShape): CircuitState {
  const last = shape.rounds === null ? state.round : Math.min(state.round, shape.rounds + 1)
  const round = Math.max(1, last - 1)
  const history = state.history ?? []
  const reopened = history.at(-1)
  const resumed = reopened !== undefined && reopened.round === round ? reopened : null

  return {
    round,
    position: 1,
    restStartedAt: null,
    roundStartedAt: resumed === null ? null : resumed.startedAt,
    history: resumed === null ? history : history.slice(0, -1),
  }
}

/** A finished round's elapsed duration, in whole seconds, never negative. */
export function roundDuration(timing: RoundTiming): number {
  const started = Date.parse(timing.startedAt)
  const ended = Date.parse(timing.endedAt)
  if (Number.isNaN(started) || Number.isNaN(ended)) return 0
  return Math.max(0, Math.floor((ended - started) / 1000))
}

/** Everything the renderer draws, derived rather than stored. */
export interface CircuitView {
  readonly phase: CircuitPhase
  /** The round being performed, clamped to the last one once it is finished. */
  readonly round: number
  /** The prescribed count, or null when the block does not carry one. */
  readonly rounds: number | null
  /** The movement the user is on. Position one while resting: it is next. */
  readonly position: number
  readonly size: number
  /** Seconds of shared rest left, zero whenever the phase is not `rest`. */
  readonly restRemaining: number
  /** What completion supplies as `rounds_completed`. */
  readonly roundsCompleted: number
}

/**
 * The state as the screen reads it. `restElapsedSeconds` comes from the
 * caller's wall clock — this module never asks what time it is, so the same
 * state renders the same view in a test as it does at 3pm.
 */
export function circuitView(
  state: CircuitState,
  shape: CircuitShape,
  restElapsedSeconds: number,
): CircuitView {
  const finished = isCircuitFinished(state, shape)
  const remaining = finished ? 0 : restRemaining(state, shape, restElapsedSeconds)

  return {
    phase: finished ? 'finished' : remaining > 0 ? 'rest' : 'work',
    round: finished && shape.rounds !== null ? shape.rounds : state.round,
    rounds: shape.rounds,
    position: state.position,
    size: shape.size,
    restRemaining: remaining,
    roundsCompleted: completedRounds(state, shape),
  }
}
