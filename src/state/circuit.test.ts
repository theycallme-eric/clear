/**
 * EXE-03 acceptance, at the level the arithmetic lives: a circuit's round and
 * position advance one tap at a time, its shared rest is taken once per round
 * rather than once per exercise, and what it supplies at completion is the
 * rounds the user actually got through.
 */
import { describe, expect, it } from 'vitest'

import {
  advanceCircuit,
  circuitShape,
  circuitView,
  clampCircuitState,
  completedRounds,
  isCircuitFinished,
  CIRCUIT_START,
  type CircuitShape,
  type CircuitState,
} from './circuit'
import { sessionProgress } from './workout-progress'
import { snapshotFixture } from '../test/workout-double'

const REST_AT = 1_800_000_000_000
const REST_AT_ISO = new Date(REST_AT).toISOString()

function shape(overrides: Partial<CircuitShape> = {}): CircuitShape {
  return { rounds: 3, size: 3, restSeconds: 60, ...overrides }
}

/**
 * Taps `times` times from the start, with the clock parked.
 *
 * A round of three movements costs three taps, and a rest the user skips
 * rather than sits through costs one more — which is why the counts below are
 * written out rather than multiplied.
 */
function tap(times: number, circuit: CircuitShape): CircuitState {
  let state = CIRCUIT_START
  for (let index = 0; index < times; index += 1) {
    state = advanceCircuit(state, circuit, REST_AT)
  }
  return state
}

/** Every rest stamp `times` taps produce, in order. */
function restStamps(times: number, circuit: CircuitShape): (string | null)[] {
  const stamps: (string | null)[] = []
  let state = CIRCUIT_START
  for (let index = 0; index < times; index += 1) {
    state = advanceCircuit(state, circuit, REST_AT)
    stamps.push(state.restStartedAt)
  }
  return stamps
}

describe('reading the block', () => {
  it('takes rounds, size and shared rest from workout_blocks', () => {
    const snapshot = snapshotFixture({
      sections: [
        {
          blocks: [
            {
              structureType: 'circuit',
              rounds: 4,
              roundRestSeconds: 90,
              exercises: ['not_started', 'not_started', 'not_started'],
            },
          ],
        },
      ],
    })
    const block = sessionProgress(snapshot).sections[0]!.blocks[0]!

    expect(circuitShape(block)).toEqual({ rounds: 4, size: 3, restSeconds: 90 })
  })

  it('counts no rest when the block prescribes none', () => {
    const snapshot = snapshotFixture({
      sections: [{ blocks: [{ structureType: 'circuit', rounds: 2 }] }],
    })
    const block = sessionProgress(snapshot).sections[0]!.blocks[0]!

    expect(circuitShape(block)).toEqual({ rounds: 2, size: 1, restSeconds: 0 })
  })

  it('leaves a block that carries no round count saying so', () => {
    expect(circuitShape({ ...blockShapeSource(), rounds: null }).rounds).toBeNull()
  })
})

/** The two fields `circuitShape` reads, as the smallest thing that has them. */
function blockShapeSource() {
  const snapshot = snapshotFixture({
    sections: [{ blocks: [{ structureType: 'circuit', rounds: 3 }] }],
  })
  return sessionProgress(snapshot).sections[0]!.blocks[0]!
}

describe('advancing', () => {
  it('moves one position per tap inside a round', () => {
    const circuit = shape()

    expect(tap(1, circuit)).toEqual({ round: 1, position: 2, restStartedAt: null })
    expect(tap(2, circuit)).toEqual({ round: 1, position: 3, restStartedAt: null })
  })

  it('advances the round in one tap from the last movement', () => {
    const circuit = shape()

    // Three taps: 1→2, 2→3, and the one that ends the round. No separate
    // "end round" control, which is the acceptance criterion.
    expect(tap(3, circuit)).toEqual({
      round: 2,
      position: 1,
      restStartedAt: REST_AT_ISO,
    })
  })

  it('enters the shared rest once per round, not once per exercise', () => {
    const circuit = shape()

    // Eight taps over two rounds of three movements: three to work through a
    // round, one to leave its rest, and rest is stamped on the two round
    // boundaries and on nothing in between.
    expect(restStamps(8, circuit)).toEqual([
      null,
      null,
      REST_AT_ISO,
      null,
      null,
      null,
      REST_AT_ISO,
      null,
    ])
  })

  it('starts the round when the rest is skipped', () => {
    const circuit = shape()
    const resting = tap(3, circuit)

    expect(advanceCircuit(resting, circuit, REST_AT).restStartedAt).toBeNull()
    expect(advanceCircuit(resting, circuit, REST_AT).round).toBe(2)
  })

  it('takes no rest when the block prescribes none', () => {
    const circuit = shape({ restSeconds: 0 })

    expect(tap(3, circuit)).toEqual({ round: 2, position: 1, restStartedAt: null })
  })

  it('takes no rest after the final round — rest is between rounds', () => {
    const circuit = shape({ rounds: 2 })

    // Seven taps is both rounds: 3 · rest · 3. The last one ends the circuit,
    // and there is no rest to enter on the way out of it.
    expect(tap(7, circuit)).toEqual({ round: 3, position: 1, restStartedAt: null })
    expect(isCircuitFinished(tap(7, circuit), circuit)).toBe(true)
  })

  it('stays put once every round is done', () => {
    const circuit = shape({ rounds: 2 })
    const finished = tap(7, circuit)

    expect(advanceCircuit(finished, circuit, REST_AT)).toBe(finished)
  })

  it('keeps counting rounds for a block that prescribes no number', () => {
    const circuit = shape({ rounds: null })

    expect(tap(7, circuit).round).toBe(3)
    expect(isCircuitFinished(tap(7, circuit), circuit)).toBe(false)
  })

  it('cannot advance a circuit with nothing left to perform', () => {
    const circuit = shape({ size: 0 })

    expect(advanceCircuit(CIRCUIT_START, circuit, REST_AT)).toBe(CIRCUIT_START)
  })
})

describe('what completion supplies', () => {
  it('counts a round only once it is finished', () => {
    const circuit = shape()

    expect(completedRounds(CIRCUIT_START, circuit)).toBe(0)
    expect(completedRounds(tap(2, circuit), circuit)).toBe(0)
    expect(completedRounds(tap(3, circuit), circuit)).toBe(1)
    // Three rounds of three movements, each rest skipped: 3 · rest · 3 · rest · 3.
    expect(completedRounds(tap(11, circuit), circuit)).toBe(3)
  })

  it('never reports more rounds than the block prescribed', () => {
    const circuit = shape({ rounds: 2 })

    expect(completedRounds({ round: 9, position: 1, restStartedAt: null }, circuit)).toBe(2)
  })
})

describe('the view the renderer draws', () => {
  it('reads as work until the rest is entered', () => {
    const circuit = shape()
    const view = circuitView(tap(1, circuit), circuit, 0)

    expect(view.phase).toBe('work')
    expect(view.position).toBe(2)
    expect(view.restRemaining).toBe(0)
  })

  it('counts the shared rest down from the block’s own number', () => {
    const circuit = shape()
    const resting = tap(3, circuit)

    expect(circuitView(resting, circuit, 0).restRemaining).toBe(60)
    expect(circuitView(resting, circuit, 15).restRemaining).toBe(45)
    expect(circuitView(resting, circuit, 15).phase).toBe('rest')
  })

  it('returns to work when the rest runs out, with no tap at all', () => {
    const circuit = shape()
    const resting = tap(3, circuit)
    const view = circuitView(resting, circuit, 60)

    expect(view.phase).toBe('work')
    expect(view.round).toBe(2)
    expect(view.restRemaining).toBe(0)
  })

  it('says every round is done rather than naming a round that is not there', () => {
    const circuit = shape({ rounds: 2 })
    const view = circuitView(tap(7, circuit), circuit, 0)

    expect(view.phase).toBe('finished')
    expect(view.round).toBe(2)
    expect(view.roundsCompleted).toBe(2)
  })
})

describe('restoring a record', () => {
  it('keeps a record the block can still hold', () => {
    const circuit = shape()
    const stored: CircuitState = { round: 2, position: 3, restStartedAt: null }

    expect(clampCircuitState(stored, circuit)).toEqual(stored)
  })

  it('puts the user at a position that still exists', () => {
    // Two movements were swapped out since the record was written.
    const circuit = shape({ size: 1 })

    expect(clampCircuitState({ round: 2, position: 3, restStartedAt: null }, circuit)).toEqual({
      round: 2,
      position: 1,
      restStartedAt: null,
    })
  })

  it('refuses a round the block no longer prescribes', () => {
    const circuit = shape({ rounds: 2 })

    expect(clampCircuitState({ round: 7, position: 1, restStartedAt: null }, circuit).round).toBe(3)
  })

  it('does not restore a rest the block no longer prescribes', () => {
    const circuit = shape({ restSeconds: 0 })

    expect(
      clampCircuitState({ round: 2, position: 1, restStartedAt: REST_AT_ISO }, circuit)
        .restStartedAt,
    ).toBeNull()
  })

  it('restores the rest the user was actually in', () => {
    const circuit = shape()
    const restored = clampCircuitState(
      { round: 2, position: 1, restStartedAt: REST_AT_ISO },
      circuit,
    )

    // Twenty seconds of it had already passed before the refresh.
    expect(circuitView(restored, circuit, 20).restRemaining).toBe(40)
  })
})
