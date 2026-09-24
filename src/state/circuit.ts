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

  return {
    round,
    position,
    // A finished circuit is not resting, and neither is one whose block no
    // longer prescribes any rest to be in the middle of.
    restStartedAt:
      shape.restSeconds === 0 || (shape.rounds !== null && round > shape.rounds)
        ? null
        : state.restStartedAt,
  }
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
