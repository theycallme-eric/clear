/**
 * EXE-03's EMOM arithmetic — "timer type and seconds read from
 * `workout_blocks`", "the minute boundary visibly flips active work, remainder
 * reads as rest", and "`minutes_completed` for EMOM", asserted where they are
 * decided rather than through the card.
 *
 * Every reading below is taken at an *elapsed second*, never after a tick,
 * because that is the property the module exists to have: a phone that was
 * locked for four minutes and a phone that was watched for four minutes are the
 * same reading. A test that advanced a counter would pass on an implementation
 * that drifts.
 */
import { describe, expect, it } from 'vitest'

import {
  clampEmomState,
  emomShape,
  emomView,
  EMOM_START,
  isEmomTimed,
  markMinuteDone,
  minuteAssignment,
  positionForMinute,
  startEmom,
  type EmomShape,
  type EmomState,
} from './emom'
import { sessionProgress, type BlockProgress } from './workout-progress'
import { snapshotFixture, type BlockFixture } from '../test/workout-double'

const STARTED_AT = '2026-09-24T09:00:00.000Z'
const RUNNING: EmomState = { startedAt: STARTED_AT, workDoneMinute: null }

/** One EMOM block, as `sessionProgress` derives it from the rows. */
function emomBlock(fixture: BlockFixture = {}): BlockProgress {
  const snapshot = snapshotFixture({
    sections: [
      {
        sectionType: 'conditioning',
        blocks: [
          {
            structureType: 'emom',
            timerType: 'per_minute',
            timerSeconds: 600,
            exercises: [
              { prescription: { exercise_id: 'hollow-body-hold', order_index: 0 } },
              { prescription: { exercise_id: 'v-up', order_index: 1 } },
            ],
            ...fixture,
          },
        ],
      },
    ],
  })

  return sessionProgress(snapshot).sections[0].blocks[0]
}

/** A shape stated directly, for the arithmetic that has no block to read. */
function shapeOf(overrides: Partial<EmomShape> = {}): EmomShape {
  return {
    timerType: 'per_minute',
    minutes: 10,
    restSeconds: 0,
    size: 2,
    ...overrides,
  }
}

describe('the shape comes from the block’s own columns', () => {
  it('reads the timer type and the window from workout_blocks', () => {
    expect(emomShape(emomBlock())).toEqual({
      timerType: 'per_minute',
      minutes: 10,
      restSeconds: 0,
      size: 2,
    })
  })

  it('reads the shared rest from the block, not from the prescriptions', () => {
    // Both movements carry their own `rest_seconds` in the fixture; the EMOM's
    // rest is the block's, once per minute.
    expect(emomShape(emomBlock({ roundRestSeconds: 15 })).restSeconds).toBe(15)
  })

  it('floors a window that is not whole minutes rather than rounding it up', () => {
    // 9½ minutes prescribes nine minutes of work; the remainder is not a minute
    // the block is asking for.
    expect(emomShape(emomBlock({ timerSeconds: 570 })).minutes).toBe(9)
  })

  it('carries no window when the block carries no seconds', () => {
    expect(emomShape(emomBlock({ timerSeconds: null })).minutes).toBeNull()
    expect(emomShape(emomBlock({ timerSeconds: 30 })).minutes).toBeNull()
  })

  it('ignores a rest that would fill the whole minute', () => {
    // A minute of rest leaves no work at the top of the minute, so it is not a
    // rest *inside* one and the grid does not draw it as one.
    expect(emomShape(emomBlock({ roundRestSeconds: 60 })).restSeconds).toBe(0)
    expect(emomShape(emomBlock({ roundRestSeconds: -5 })).restSeconds).toBe(0)
  })

  it('knows a block that prescribes no clock at all', () => {
    expect(isEmomTimed(emomShape(emomBlock({ timerType: 'none' })))).toBe(false)
    expect(isEmomTimed(emomShape(emomBlock()))).toBe(true)
  })
})

describe('the minute boundary flips the active work', () => {
  const shape = shapeOf()

  it('is minute one from the first second to the fifty-ninth', () => {
    expect(emomView(RUNNING, shape, 0).minute).toBe(1)
    expect(emomView(RUNNING, shape, 59).minute).toBe(1)
  })

  it('is minute two on the boundary itself', () => {
    expect(emomView(RUNNING, shape, 60).minute).toBe(2)
  })

  it('counts down the seconds left of the minute, not of the block', () => {
    expect(emomView(RUNNING, shape, 0).secondsRemaining).toBe(60)
    expect(emomView(RUNNING, shape, 50).secondsRemaining).toBe(10)
    expect(emomView(RUNNING, shape, 60).secondsRemaining).toBe(60)
  })

  it('alternates the movement by minute for a two-movement EMOM', () => {
    // `emom-clarity.md` §2: odd minutes are movement one, even minutes are two.
    expect(emomView(RUNNING, shape, 0).activePosition).toBe(1)
    expect(emomView(RUNNING, shape, 60).activePosition).toBe(2)
    expect(emomView(RUNNING, shape, 120).activePosition).toBe(1)
    expect(emomView(RUNNING, shape, 180).activePosition).toBe(2)
  })

  it('rotates the movement by minute for three or more', () => {
    const rotating = shapeOf({ size: 3 })

    expect([0, 60, 120, 180].map((at) => emomView(RUNNING, rotating, at).activePosition))
      .toEqual([1, 2, 3, 1])
  })

  it('names the movement the next minute opens with', () => {
    expect(emomView(RUNNING, shape, 0).nextPosition).toBe(2)
    expect(emomView(RUNNING, shape, 60).nextPosition).toBe(1)
  })

  it('has no next movement in the last prescribed minute', () => {
    expect(emomView(RUNNING, shapeOf({ minutes: 2 }), 60).nextPosition).toBeNull()
  })

  it('keeps working through the minute when the block prescribes no rest', () => {
    expect(emomView(RUNNING, shape, 0).phase).toBe('work')
    expect(emomView(RUNNING, shape, 59).phase).toBe('work')
  })

  it('assigns no movement when every one of them was swapped out', () => {
    expect(emomView(RUNNING, shapeOf({ size: 0 }), 0).activePosition).toBeNull()
    expect(positionForMinute(4, 0)).toBeNull()
  })
})

describe('the remainder of the minute reads as rest', () => {
  it('opens the block’s trailing rest window inside every minute', () => {
    const shape = shapeOf({ restSeconds: 15 })

    // Work for the first 45 seconds, rest for the last 15, and the boundary
    // puts the work back on its own.
    expect(emomView(RUNNING, shape, 44).phase).toBe('work')
    expect(emomView(RUNNING, shape, 45).phase).toBe('rest')
    expect(emomView(RUNNING, shape, 59).phase).toBe('rest')
    expect(emomView(RUNNING, shape, 60).phase).toBe('work')
    expect(emomView(RUNNING, shape, 105).phase).toBe('rest')
  })

  it('rests for what is left of the minute once the user says the work is done', () => {
    const shape = shapeOf()
    const working = emomView(RUNNING, shape, 20)
    const state = markMinuteDone(RUNNING, working)

    expect(state.workDoneMinute).toBe(1)
    expect(emomView(state, shape, 20).phase).toBe('rest')
    expect(emomView(state, shape, 59).phase).toBe('rest')
    // The next minute is work again without anything being pressed.
    expect(emomView(state, shape, 60).phase).toBe('work')
  })

  it('marks the minute the user is actually in, not the first one', () => {
    const shape = shapeOf()
    const state = markMinuteDone(RUNNING, emomView(RUNNING, shape, 200))

    expect(state.workDoneMinute).toBe(4)
    expect(emomView(state, shape, 200).phase).toBe('rest')
  })

  it('does not mark a minute from a phase that has no work in it', () => {
    const shape = shapeOf()
    const resting = emomView(RUNNING, shapeOf({ restSeconds: 20 }), 50)

    expect(markMinuteDone(RUNNING, resting)).toEqual(RUNNING)
    expect(markMinuteDone(EMOM_START, emomView(EMOM_START, shape, 0))).toEqual(EMOM_START)
  })
})

describe('the phases either side of the grid', () => {
  it('is untimed when the block prescribes no clock', () => {
    const view = emomView(RUNNING, shapeOf({ timerType: 'none' }), 120)

    expect(view.phase).toBe('untimed')
    expect(view.activePosition).toBeNull()
    expect(view.minutesCompleted).toBe(0)
  })

  it('is ready before the user starts the clock', () => {
    const view = emomView(EMOM_START, shapeOf(), 0)

    expect(view.phase).toBe('ready')
    expect(view.minute).toBe(1)
    // Minute one's movement, so the card can say what the block opens with.
    expect(view.activePosition).toBe(1)
    expect(view.minutesCompleted).toBe(0)
  })

  it('starts the clock once, at the moment it is pressed', () => {
    const started = startEmom(EMOM_START, Date.parse(STARTED_AT))

    expect(started).toEqual(RUNNING)
    // A second start would move the grid under a user already inside it.
    expect(startEmom(started, Date.parse('2026-09-24T09:05:00.000Z'))).toBe(started)
  })

  it('is finished once the last prescribed minute has elapsed', () => {
    const shape = shapeOf({ minutes: 10 })

    expect(emomView(RUNNING, shape, 599).phase).toBe('work')
    expect(emomView(RUNNING, shape, 600).phase).toBe('finished')
    expect(emomView(RUNNING, shape, 600).minute).toBe(10)
    expect(emomView(RUNNING, shape, 4000).minute).toBe(10)
    expect(emomView(RUNNING, shape, 600).activePosition).toBeNull()
  })

  it('never finishes on its own when the block carries no window', () => {
    const view = emomView(RUNNING, shapeOf({ minutes: null }), 1800)

    expect(view.phase).toBe('work')
    expect(view.minute).toBe(31)
    expect(view.minutes).toBeNull()
  })
})

describe('the minutes the EMOM observed', () => {
  it('counts a minute once its work is behind the user', () => {
    const shape = shapeOf()

    // Mid-work in minute one: no minute is complete yet.
    expect(emomView(RUNNING, shape, 30).minutesCompleted).toBe(0)
    // Minute one elapsed.
    expect(emomView(RUNNING, shape, 60).minutesCompleted).toBe(1)
    expect(emomView(RUNNING, shape, 185).minutesCompleted).toBe(3)
  })

  it('counts the minute the user finished early, before it has elapsed', () => {
    const shape = shapeOf()
    const state = markMinuteDone(RUNNING, emomView(RUNNING, shape, 30))

    expect(emomView(state, shape, 30).minutesCompleted).toBe(1)
    // And it does not count twice once that same minute elapses.
    expect(emomView(state, shape, 60).minutesCompleted).toBe(1)
  })

  it('counts the minute whose prescribed rest window is running', () => {
    const shape = shapeOf({ restSeconds: 15 })

    expect(emomView(RUNNING, shape, 44).minutesCompleted).toBe(0)
    expect(emomView(RUNNING, shape, 50).minutesCompleted).toBe(1)
  })

  it('never reports more minutes than the block prescribed', () => {
    const shape = shapeOf({ minutes: 4 })

    expect(emomView(RUNNING, shape, 240).minutesCompleted).toBe(4)
    expect(emomView(RUNNING, shape, 9000).minutesCompleted).toBe(4)
  })

  it('keeps counting for a block that prescribes no window', () => {
    expect(emomView(RUNNING, shapeOf({ minutes: null }), 900).minutesCompleted).toBe(15)
  })
})

describe('a restored record is repaired against the block', () => {
  const shape = shapeOf({ minutes: 10 })

  it('keeps a clock the block can still be read against', () => {
    expect(clampEmomState({ startedAt: STARTED_AT, workDoneMinute: 3 }, shape)).toEqual({
      startedAt: STARTED_AT,
      workDoneMinute: 3,
    })
  })

  it('drops a timestamp no clock can read, rather than freezing at minute one', () => {
    expect(
      clampEmomState({ startedAt: 'yesterday', workDoneMinute: 2 }, shape),
    ).toEqual(EMOM_START)
  })

  it('drops a marked minute the window cannot contain', () => {
    expect(
      clampEmomState({ startedAt: STARTED_AT, workDoneMinute: 11 }, shape).workDoneMinute,
    ).toBeNull()
    expect(
      clampEmomState({ startedAt: STARTED_AT, workDoneMinute: 0 }, shape).workDoneMinute,
    ).toBeNull()
    expect(
      clampEmomState({ startedAt: STARTED_AT, workDoneMinute: 2.5 }, shape).workDoneMinute,
    ).toBeNull()
  })

  it('keeps a marked minute for a block whose window is open-ended', () => {
    expect(
      clampEmomState(
        { startedAt: STARTED_AT, workDoneMinute: 40 },
        shapeOf({ minutes: null }),
      ).workDoneMinute,
    ).toBe(40)
  })

  it('cannot mark a minute of a clock that was never started', () => {
    expect(clampEmomState({ startedAt: null, workDoneMinute: 3 }, shape)).toEqual(
      EMOM_START,
    )
  })
})

describe('the minutes a movement covers, in words', () => {
  it('labels a two-movement EMOM odd and even', () => {
    const shape = shapeOf({ size: 2 })

    expect(minuteAssignment(1, shape)).toBe('ODD MIN')
    expect(minuteAssignment(2, shape)).toBe('EVEN MIN')
  })

  it('says nothing on a single-movement EMOM', () => {
    // Every minute is the same movement; a label would say nothing.
    expect(minuteAssignment(1, shapeOf({ size: 1 }))).toBeNull()
  })

  it('names the minutes each movement of a rotation gets', () => {
    const shape = shapeOf({ size: 3, minutes: 12 })

    expect(minuteAssignment(1, shape)).toBe('MIN 1, 4, 7…')
    expect(minuteAssignment(2, shape)).toBe('MIN 2, 5, 8…')
    expect(minuteAssignment(3, shape)).toBe('MIN 3, 6, 9…')
  })

  it('does not promise minutes the window does not have', () => {
    const shape = shapeOf({ size: 3, minutes: 5 })

    expect(minuteAssignment(1, shape)).toBe('MIN 1, 4')
    expect(minuteAssignment(3, shape)).toBe('MIN 3')
  })

  it('elides a rotation the block gives no window for', () => {
    expect(minuteAssignment(2, shapeOf({ size: 4, minutes: null }))).toBe('MIN 2, 6, 10…')
  })

  it('says so when a movement’s first turn falls outside the window', () => {
    // A defective prescription: four movements, three minutes. The fourth never
    // comes up, and the label says that rather than inventing a minute.
    expect(minuteAssignment(4, shapeOf({ size: 4, minutes: 3 }))).toBe('NOT IN WINDOW')
  })
})
