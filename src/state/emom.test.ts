/**
 * EXE-03's EMOM arithmetic — "timer type and seconds read from
 * `workout_blocks`", "the minute boundary visibly flips active work, remainder
 * reads as rest", and REQ-014's hands-off contract — targets that follow the
 * scheduled minute, and a schedule that is never counted as performed work —
 * asserted where they are decided rather than through the card.
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
  minuteAssignment,
  positionForMinute,
  scheduledMinuteFor,
  startEmom,
  targetForMinute,
  turnForMinute,
  type EmomShape,
  type EmomState,
} from './emom'
import type { PrescribedColumns } from './prescription'
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

  it('is never put into rest by a mark: the schedule alone decides the phase (REQ-014)', () => {
    // A record an earlier build wrote with "Minute done" pressed in minute one.
    const marked: EmomState = { startedAt: STARTED_AT, workDoneMinute: 1 }

    expect(emomView(marked, shapeOf(), 20).phase).toBe('work')
    expect(emomView(marked, shapeOf(), 59).phase).toBe('work')
  })
})

describe('the phases either side of the grid', () => {
  it('is untimed when the block prescribes no clock', () => {
    const view = emomView(RUNNING, shapeOf({ timerType: 'none' }), 120)

    expect(view.phase).toBe('untimed')
    expect(view.activePosition).toBeNull()
  })

  it('is ready before the user starts the clock', () => {
    const view = emomView(EMOM_START, shapeOf(), 0)

    expect(view.phase).toBe('ready')
    expect(view.minute).toBe(1)
    // Minute one's movement, so the card can say what the block opens with.
    expect(view.activePosition).toBe(1)
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

describe('the schedule is never a result (E01)', () => {
  it('carries no count of completed minutes in any phase', () => {
    const shape = shapeOf({ minutes: 4, restSeconds: 15 })

    for (const view of [
      emomView(RUNNING, shapeOf({ timerType: 'none' }), 120),
      emomView(EMOM_START, shape, 0),
      emomView(RUNNING, shape, 30),
      emomView(RUNNING, shape, 50),
      emomView(RUNNING, shape, 9000),
    ]) {
      expect(view).not.toHaveProperty('minutesCompleted')
    }
  })
})

describe('a restored record is repaired', () => {
  it('keeps a clock that can still be read', () => {
    expect(clampEmomState({ startedAt: STARTED_AT, workDoneMinute: null })).toEqual(RUNNING)
  })

  it('drops a timestamp no clock can read, rather than freezing at minute one', () => {
    expect(clampEmomState({ startedAt: 'yesterday', workDoneMinute: 2 })).toEqual(EMOM_START)
  })

  it('drops any minute an earlier build marked done', () => {
    for (const workDoneMinute of [3, 11, 0, 40]) {
      expect(clampEmomState({ startedAt: STARTED_AT, workDoneMinute })).toEqual(RUNNING)
    }
    expect(clampEmomState({ startedAt: null, workDoneMinute: 3 })).toEqual(EMOM_START)
  })
})

describe('targets follow the scheduled minute (REQ-014)', () => {
  /** Columns a target reads; everything else about the row is irrelevant here. */
  function columns(overrides: Partial<PrescribedColumns> = {}): PrescribedColumns {
    return {
      exercise_id: 'hollow-body-hold',
      modality: 'reps',
      sets: 3,
      target_kind: 'fixed',
      target_value: 8,
      target_min: null,
      target_max: null,
      target_sequence: null,
      per_side: false,
      distance_unit: null,
      ...overrides,
    }
  }
  const rising = columns({
    sets: null,
    target_kind: 'sequence',
    target_value: null,
    target_sequence: [6, 8, 10],
  })

  it('counts a movement’s own turns across a rotation', () => {
    // Two movements: minute 5 is the first movement's third turn.
    expect(turnForMinute(1, 2)).toBe(1)
    expect(turnForMinute(3, 2)).toBe(2)
    expect(turnForMinute(5, 2)).toBe(3)
    // Three movements: minute 6 is the third movement's second turn.
    expect(turnForMinute(6, 3)).toBe(2)
    expect(turnForMinute(1, 0)).toBeNull()
  })

  it('holds a fixed or ranged target on every turn', () => {
    expect(targetForMinute(columns(), 1, 2)).toEqual({ kind: 'fixed', value: 8 })
    expect(targetForMinute(columns(), 9, 2)).toEqual({ kind: 'fixed', value: 8 })
    const range = columns({ target_kind: 'range', target_value: null, target_min: 8, target_max: 10 })
    expect(targetForMinute(range, 7, 3)).toEqual({ kind: 'range', min: 8, max: 10 })
  })

  it('takes one rung of a rising sequence per turn, read off the minute', () => {
    expect(targetForMinute(rising, 1, 2)).toEqual({ kind: 'fixed', value: 6 })
    expect(targetForMinute(rising, 3, 2)).toEqual({ kind: 'fixed', value: 8 })
    expect(targetForMinute(rising, 5, 2)).toEqual({ kind: 'fixed', value: 10 })
    // Single-movement EMOM: every minute is the next rung.
    expect(targetForMinute(rising, 2, 1)).toEqual({ kind: 'fixed', value: 8 })
  })

  it('invents no rung past the end of the sequence', () => {
    expect(targetForMinute(rising, 7, 2)).toBeNull()
  })

  it('reads the same target at the same elapsed second after a background or refresh', () => {
    // The view is a function of elapsed seconds, so a reading taken after four
    // locked minutes is the reading taken after four watched ones.
    const shape = shapeOf({ size: 2, minutes: 6 })
    const watched = emomView(RUNNING, shape, 250)
    const restored = emomView(clampEmomState(RUNNING), shape, 250)

    expect(restored).toEqual(watched)
    const minute = scheduledMinuteFor(1, restored, shape)
    expect(minute).toBe(5)
    expect(targetForMinute(rising, minute ?? 0, shape.size)).toEqual({ kind: 'fixed', value: 10 })
  })

  it('schedules each movement at its current or next turn', () => {
    const shape = shapeOf({ size: 3, minutes: 6, restSeconds: 15 })

    // Ready: the opening minutes.
    const ready = emomView(EMOM_START, shape, 0)
    expect([1, 2, 3].map((p) => scheduledMinuteFor(p, ready, shape))).toEqual([1, 2, 3])

    // Working minute 3: the third movement is now; the others come next.
    const working = emomView(RUNNING, shape, 130)
    expect([1, 2, 3].map((p) => scheduledMinuteFor(p, working, shape))).toEqual([4, 5, 3])

    // Resting at the end of minute 3: its work is behind the schedule.
    const resting = emomView(RUNNING, shape, 170)
    expect(resting.phase).toBe('rest')
    expect([1, 2, 3].map((p) => scheduledMinuteFor(p, resting, shape))).toEqual([4, 5, 6])

    // Minute 5: the third movement's next turn is 6, the first has none left.
    const late = emomView(RUNNING, shape, 250)
    expect([1, 2, 3].map((p) => scheduledMinuteFor(p, late, shape))).toEqual([null, 5, 6])
  })

  it('schedules nothing once the clock has expired or when there is no clock', () => {
    const shape = shapeOf({ size: 2, minutes: 4 })

    expect(scheduledMinuteFor(1, emomView(RUNNING, shape, 240), shape)).toBeNull()
    const untimed = shapeOf({ timerType: 'none' })
    expect(scheduledMinuteFor(1, emomView(RUNNING, untimed, 30), untimed)).toBeNull()
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
