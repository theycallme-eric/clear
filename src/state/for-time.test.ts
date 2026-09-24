/**
 * EXE-04b — the For Time clock, as arithmetic.
 *
 * The two properties the requirement names are properties of this module rather
 * than of the card that draws it, so they are asserted here first: finishing
 * under the cap stops the clock **at the finish**, and reaching the cap is a
 * different outcome rather than a missing one. The urgency window is the third —
 * it exists near the cap and in no other phase, which is what makes "urgency
 * styling appears only near the cap" checkable rather than a matter of taste.
 */
import { describe, expect, it } from 'vitest'

import {
  clampForTimeState,
  finishForTime,
  forTimeOutcome,
  forTimeShape,
  forTimeView,
  startForTime,
  FOR_TIME_START,
  FOR_TIME_URGENCY_SECONDS,
  type ForTimeShape,
  type ForTimeState,
} from './for-time'
import { sessionProgress } from './workout-progress'
import { snapshotFixture, type BlockFixture } from '../test/workout-double'

const START_MS = Date.parse('2026-09-24T10:00:00.000Z')
const STARTED_AT = new Date(START_MS).toISOString()

/** An eight-minute cap: the spec's own example (`ladder-for-time.md`). */
const CAP: ForTimeShape = { capSeconds: 480, size: 2 }

function stampedAt(offsetSeconds: number): string {
  return new Date(START_MS + offsetSeconds * 1000).toISOString()
}

function running(): ForTimeState {
  return { startedAt: STARTED_AT, finishedAt: null }
}

function block(fixture: BlockFixture = {}) {
  const snapshot = snapshotFixture({
    sections: [
      {
        blocks: [
          {
            structureType: 'for_time',
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

describe('the shape a For Time block prescribes', () => {
  it('reads the cap and the movement count from the block', () => {
    expect(forTimeShape(block())).toEqual({ capSeconds: 480, size: 2 })
  })

  it('carries no cap when the block carries none', () => {
    expect(forTimeShape(block({ timerSeconds: null })).capSeconds).toBeNull()
  })

  it('counts no movements once every one of them has been swapped out', () => {
    expect(forTimeShape(block({ exercises: [] })).size).toBe(0)
  })
})

describe('starting and finishing', () => {
  it('stamps the start', () => {
    expect(startForTime(FOR_TIME_START, START_MS)).toEqual({
      startedAt: STARTED_AT,
      finishedAt: null,
    })
  })

  it('refuses to restart a running attempt — the elapsed time is the score', () => {
    const state = running()
    expect(startForTime(state, START_MS + 90_000)).toBe(state)
  })

  it('stamps the finish while it is running', () => {
    expect(finishForTime(running(), START_MS + 383_000)).toEqual({
      startedAt: STARTED_AT,
      finishedAt: stampedAt(383),
    })
  })

  it('cannot finish an attempt that was never started', () => {
    expect(finishForTime(FOR_TIME_START, START_MS)).toBe(FOR_TIME_START)
  })

  it('keeps the moment a finished attempt actually finished at', () => {
    const finished = { startedAt: STARTED_AT, finishedAt: stampedAt(120) }
    expect(finishForTime(finished, START_MS + 300_000)).toBe(finished)
  })
})

describe('the view, before the clock starts', () => {
  it('has run for nothing, has the whole cap left, and claims nothing', () => {
    const view = forTimeView(FOR_TIME_START, CAP, 0)

    expect(view.phase).toBe('ready')
    expect(view.elapsedSeconds).toBe(0)
    expect(view.remainingSeconds).toBe(480)
    expect(view.urgent).toBe(false)
    expect(view.completedUnderCap).toBeNull()
  })
})

describe('the view, while the clock runs', () => {
  it('counts from the wall clock the caller read', () => {
    const view = forTimeView(running(), CAP, 125)

    expect(view.phase).toBe('running')
    expect(view.elapsedSeconds).toBe(125)
    expect(view.remainingSeconds).toBe(355)
    expect(view.completedUnderCap).toBeNull()
  })

  it('is not urgent with more than the urgency window left', () => {
    const view = forTimeView(running(), CAP, 480 - FOR_TIME_URGENCY_SECONDS - 1)
    expect(view.urgent).toBe(false)
  })

  it('is urgent for the last seconds of the cap, and only there', () => {
    const view = forTimeView(running(), CAP, 480 - FOR_TIME_URGENCY_SECONDS)

    expect(view.urgent).toBe(true)
    expect(view.remainingSeconds).toBe(FOR_TIME_URGENCY_SECONDS)
  })

  it('is never urgent without a cap to be near', () => {
    const uncapped = forTimeView(running(), { capSeconds: null, size: 2 }, 9_999)

    expect(uncapped.phase).toBe('running')
    expect(uncapped.urgent).toBe(false)
    expect(uncapped.remainingSeconds).toBeNull()
  })

  it('treats a clock that has run backwards as no time at all', () => {
    expect(forTimeView(running(), CAP, -30).elapsedSeconds).toBe(0)
  })
})

describe('the view, finished under the cap', () => {
  const finished: ForTimeState = { startedAt: STARTED_AT, finishedAt: stampedAt(383) }

  it('stops the clock at the finish rather than at the cap', () => {
    // The requirement's own sentence: the wall clock has run on to 470s, and
    // the recorded time is still the 383s the attempt took.
    const view = forTimeView(finished, CAP, 470)

    expect(view.phase).toBe('finished')
    expect(view.elapsedSeconds).toBe(383)
    expect(view.completedUnderCap).toBe(true)
  })

  it('is not urgent, however close to the cap it came', () => {
    const view = forTimeView({ startedAt: STARTED_AT, finishedAt: stampedAt(479) }, CAP, 479)

    expect(view.phase).toBe('finished')
    expect(view.urgent).toBe(false)
    expect(view.remainingSeconds).toBe(1)
  })

  it('claims nothing about a cap the block never prescribed', () => {
    const view = forTimeView(finished, { capSeconds: null, size: 2 }, 383)

    expect(view.phase).toBe('finished')
    expect(view.elapsedSeconds).toBe(383)
    expect(view.completedUnderCap).toBeNull()
  })
})

describe('the view, once the cap is reached', () => {
  it('reaches the cap with no stamp of its own, from the clock alone', () => {
    const view = forTimeView(running(), CAP, 480)

    expect(view.phase).toBe('capped')
    expect(view.elapsedSeconds).toBe(480)
    expect(view.remainingSeconds).toBe(0)
    expect(view.completedUnderCap).toBe(false)
  })

  it('stops at the cap however long the phone was locked for', () => {
    const view = forTimeView(running(), CAP, 3_600)

    expect(view.phase).toBe('capped')
    expect(view.elapsedSeconds).toBe(480)
  })

  it('is not urgent once the cap has arrived — nothing is counting any more', () => {
    expect(forTimeView(running(), CAP, 480).urgent).toBe(false)
  })

  it('reports a finish stamped past the cap as the cap it reached', () => {
    // A record restored after the phone was locked through the last minutes can
    // carry a stamp beyond the cap. That attempt did not beat it.
    const view = forTimeView({ startedAt: STARTED_AT, finishedAt: stampedAt(600) }, CAP, 600)

    expect(view.phase).toBe('capped')
    expect(view.elapsedSeconds).toBe(480)
    expect(view.completedUnderCap).toBe(false)
  })
})

describe('a restored record, repaired against the block', () => {
  it('keeps a clock it can read', () => {
    const state = { startedAt: STARTED_AT, finishedAt: stampedAt(200) }
    expect(clampForTimeState(state)).toEqual(state)
  })

  it('drops a start it cannot parse, and the finish with it', () => {
    expect(
      clampForTimeState({ startedAt: 'not a timestamp', finishedAt: stampedAt(200) }),
    ).toEqual(FOR_TIME_START)
  })

  it('drops a finish it cannot parse, leaving the attempt running', () => {
    expect(clampForTimeState({ startedAt: STARTED_AT, finishedAt: 'nonsense' })).toEqual({
      startedAt: STARTED_AT,
      finishedAt: null,
    })
  })

  it('drops a finish before its start — a negative time is not a result', () => {
    expect(
      clampForTimeState({ startedAt: STARTED_AT, finishedAt: stampedAt(-60) }),
    ).toEqual({ startedAt: STARTED_AT, finishedAt: null })
  })
})

describe('what the block completion is given', () => {
  it('supplies nothing for a block nobody started', () => {
    expect(forTimeOutcome(forTimeView(FOR_TIME_START, CAP, 0))).toEqual({})
  })

  it('supplies the elapsed seconds and the under-cap finish', () => {
    const view = forTimeView({ startedAt: STARTED_AT, finishedAt: stampedAt(383) }, CAP, 383)

    expect(forTimeOutcome(view)).toEqual({ elapsedSeconds: 383, completedUnderCap: true })
  })

  it('supplies the cap and the cap-expiry outcome', () => {
    expect(forTimeOutcome(forTimeView(running(), CAP, 999))).toEqual({
      elapsedSeconds: 480,
      completedUnderCap: false,
    })
  })

  it('supplies the seconds so far when recorded mid-attempt', () => {
    expect(forTimeOutcome(forTimeView(running(), CAP, 200))).toEqual({
      elapsedSeconds: 200,
      completedUnderCap: true,
    })
  })

  it('says nothing about a cap the block never had', () => {
    const view = forTimeView(
      { startedAt: STARTED_AT, finishedAt: stampedAt(200) },
      { capSeconds: null, size: 2 },
      200,
    )

    expect(forTimeOutcome(view)).toEqual({ elapsedSeconds: 200 })
    expect('completedUnderCap' in forTimeOutcome(view)).toBe(false)
  })
})
