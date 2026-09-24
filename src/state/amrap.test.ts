/**
 * EXE-04c's arithmetic, without a screen.
 *
 * The properties asserted here are the ones the renderer cannot be relied on to
 * demonstrate: that expiry is *derived* from the clock rather than written, that
 * the score a refresh restores is repaired against the block as it now is, and
 * that `partial_round_reps` keeps zero and absence apart all the way to the
 * outcome the shell writes.
 */
import { describe, expect, it } from 'vitest'

import {
  amrapOutcome,
  amrapShape,
  amrapView,
  AMRAP_START,
  clampAmrapState,
  countRound,
  finishAmrap,
  setPartialRoundReps,
  startAmrap,
  type AmrapState,
} from './amrap'
import { sessionProgress } from './workout-progress'
import { snapshotFixture, type BlockFixture } from '../test/workout-double'

const OPENED_AT = '2026-09-24T10:00:00.000Z'

function amrapBlock(fixture: BlockFixture = {}) {
  const snapshot = snapshotFixture({
    sections: [
      {
        blocks: [
          {
            structureType: 'amrap',
            timerSeconds: 480,
            exercises: ['not_started', 'not_started'],
            ...fixture,
          },
        ],
      },
    ],
  })

  return sessionProgress(snapshot).sections[0]!.blocks[0]!
}

const shape = amrapShape(amrapBlock())

/** A window that has been open for however long the caller says. */
function running(overrides: Partial<AmrapState> = {}): AmrapState {
  return { ...AMRAP_START, startedAt: OPENED_AT, ...overrides }
}

describe('what the AMRAP reads from the block', () => {
  it('takes the window from timer_seconds and the round from the movements', () => {
    expect(amrapShape(amrapBlock())).toEqual({ capSeconds: 480, size: 2 })
  })

  it('treats a block with no window, and one with none worth having, alike', () => {
    expect(amrapShape(amrapBlock({ timerSeconds: null })).capSeconds).toBeNull()

    // A window of zero seconds closed before it opened. Calling it "no window"
    // is more honest than rendering a countdown that is already over.
    expect(amrapShape(amrapBlock({ timerSeconds: 0 })).capSeconds).toBeNull()
  })

  it('counts only the movements still prescribed', () => {
    expect(amrapShape(amrapBlock({ exercises: [] })).size).toBe(0)
  })
})

describe('the window', () => {
  it('is not open until it is started, and states the whole cap while it waits', () => {
    const view = amrapView(AMRAP_START, shape, 0)

    expect(view.phase).toBe('ready')
    expect(view.remainingSeconds).toBe(480)
    expect(view.elapsedSeconds).toBe(0)
  })

  it('is stamped once — starting an AMRAP already under way is not a move', () => {
    const opened = startAmrap(AMRAP_START, Date.parse(OPENED_AT))
    expect(opened.startedAt).toBe(OPENED_AT)

    // The second tap cannot restart the clock the user is already racing.
    expect(startAmrap(opened, Date.parse('2026-09-24T10:05:00.000Z'))).toBe(opened)
  })

  it('counts down against the clock rather than against its own ticks', () => {
    expect(amrapView(running(), shape, 0).remainingSeconds).toBe(480)
    expect(amrapView(running(), shape, 200).remainingSeconds).toBe(280)
    expect(amrapView(running(), shape, 479).remainingSeconds).toBe(1)
  })

  it('is over when the cap has passed, with nothing having been written', () => {
    // The property a backgrounded tab depends on: no tick ended this window, the
    // reading did. Ten minutes asleep in an eight-minute AMRAP is a closed one.
    const view = amrapView(running(), shape, 600)

    expect(view.phase).toBe('complete')
    expect(view.expired).toBe(true)
    expect(view.elapsedSeconds).toBe(480)
    expect(view.remainingSeconds).toBe(0)
  })

  it('never expires on its own when the block prescribes no window', () => {
    const uncapped = amrapShape(amrapBlock({ timerSeconds: null }))
    const view = amrapView(running(), uncapped, 3600)

    expect(view.phase).toBe('running')
    expect(view.elapsedSeconds).toBe(3600)
    expect(view.remainingSeconds).toBe(0)
  })
})

describe('finishing early', () => {
  it('records the seconds that had actually passed, not the cap', () => {
    const stopped = finishAmrap(running(), shape, 323)

    const view = amrapView(stopped, shape, 480)
    expect(view.phase).toBe('complete')
    expect(view.elapsedSeconds).toBe(323)

    // It was the user who ended it, and the card is entitled to say so.
    expect(view.expired).toBe(false)
  })

  it('cannot log a longer window than the block prescribed', () => {
    expect(finishAmrap(running(), shape, 900).endedAtSeconds).toBe(480)
  })

  it('is refused for a window that never opened, and for one already ended', () => {
    expect(finishAmrap(AMRAP_START, shape, 100)).toBe(AMRAP_START)

    const stopped = finishAmrap(running(), shape, 100)
    expect(finishAmrap(stopped, shape, 200)).toBe(stopped)
  })
})

describe('counting rounds', () => {
  it('banks one round per tap and takes one back the same way', () => {
    let state = running()
    state = countRound(state, 1)
    state = countRound(state, 1)
    state = countRound(state, 1)
    expect(state.roundsCompleted).toBe(3)

    expect(countRound(state, -1).roundsCompleted).toBe(2)
  })

  it('never counts below zero: there is no round before the first', () => {
    const open = running()

    expect(countRound(open, -1).roundsCompleted).toBe(0)
    // Unchanged, and the same object: a tap that changes nothing writes nothing.
    expect(countRound(open, -5)).toBe(open)
  })
})

describe('the partial round', () => {
  it('starts as absent, which is not the same as zero', () => {
    expect(AMRAP_START.partialRoundReps).toBeNull()

    const boundary = setPartialRoundReps(running(), 0)
    expect(boundary.partialRoundReps).toBe(0)

    // And it can be given up again, which puts absence back rather than a zero.
    expect(setPartialRoundReps(boundary, null).partialRoundReps).toBeNull()
  })

  it('is a whole, non-negative count', () => {
    expect(setPartialRoundReps(running(), 8.7).partialRoundReps).toBe(8)
    expect(setPartialRoundReps(running(), -3).partialRoundReps).toBe(0)
  })
})

describe('what it supplies to the shell', () => {
  it('supplies nothing at all for an AMRAP that was never started', () => {
    // No rounds, no time, no partial round: zeroes here would be measurements
    // of a block nobody performed (DATA_MODEL §8).
    expect(amrapOutcome(amrapView(AMRAP_START, shape, 0))).toEqual({})
  })

  it('supplies the score the clock ended on, partial round included', () => {
    const state = setPartialRoundReps(countRound(countRound(running(), 1), 1), 8)

    expect(amrapOutcome(amrapView(state, shape, 480))).toEqual({
      elapsedSeconds: 480,
      roundsCompleted: 2,
      partialRoundReps: 8,
    })
  })

  it('omits the partial round when none was recorded, and sends zero when one was', () => {
    const none = countRound(running(), 1)
    expect(amrapOutcome(amrapView(none, shape, 480))).toEqual({
      elapsedSeconds: 480,
      roundsCompleted: 1,
    })

    // The whole of DATA-01d's distinction, in two assertions: absent omits the
    // field so the column holds null, and a recorded zero is sent as a zero.
    expect('partialRoundReps' in amrapOutcome(amrapView(none, shape, 480))).toBe(false)
    expect(
      amrapOutcome(amrapView(setPartialRoundReps(none, 0), shape, 480)),
    ).toEqual({ elapsedSeconds: 480, roundsCompleted: 1, partialRoundReps: 0 })
  })

  it('supplies zero rounds rather than nothing for an AMRAP that managed none', () => {
    expect(amrapOutcome(amrapView(running(), shape, 480))).toEqual({
      elapsedSeconds: 480,
      roundsCompleted: 0,
    })
  })
})

describe('restoring a record into the block it belongs to', () => {
  it('keeps a score the block still agrees with', () => {
    const stored = finishAmrap(
      setPartialRoundReps(countRound(running(), 1), 4),
      shape,
      300,
    )

    expect(clampAmrapState(stored, shape)).toEqual(stored)
  })

  it('brings a window that outlived a shortened cap back inside it', () => {
    const stored = finishAmrap(running(), shape, 400)
    const shortened = amrapShape(amrapBlock({ timerSeconds: 240 }))

    expect(clampAmrapState(stored, shortened).endedAtSeconds).toBe(240)
  })

  it('repairs counts it cannot use, and keeps absence absent', () => {
    const stored: AmrapState = {
      startedAt: OPENED_AT,
      endedAtSeconds: -5,
      roundsCompleted: -2,
      partialRoundReps: 3.9,
    }

    expect(clampAmrapState(stored, shape)).toEqual({
      startedAt: OPENED_AT,
      endedAtSeconds: 0,
      roundsCompleted: 0,
      partialRoundReps: 3,
    })

    expect(clampAmrapState(AMRAP_START, shape).partialRoundReps).toBeNull()
  })
})
