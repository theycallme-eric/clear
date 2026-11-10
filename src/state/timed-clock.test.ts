/**
 * TASK-007 (C21, AC-C21-01, AC-R007-03; R15, R17, R67, R98) — the session's
 * elapsed time, a movement's countdown, the session's rest and each format's
 * clock stay distinct, keep their existing pause and cap arithmetic, and are
 * read by the timer frame without being created, restarted or reset.
 *
 * Every clock below is its existing owner's, driven through that owner's own
 * functions at one shared wall-clock moment; `timed-clock.ts` only turns each
 * owner's reading into what the frame draws. The route behaviour is
 * `src/ui/timer-frame-layout.test.tsx` and `e2e/refinement/task-007.spec.ts`.
 */
import { describe, expect, it } from 'vitest'

import { amrapView, startAmrap, AMRAP_START, type AmrapShape } from './amrap'
import { emomView, startEmom, EMOM_START, type EmomShape } from './emom'
import { clampForTimeState, forTimeView, startForTime, FOR_TIME_START, type ForTimeShape, type ForTimeState } from './for-time'
import {
  countdownReady,
  countdownRemainingSeconds,
  pauseCountdown,
  startCountdown,
} from './movement-countdown'
import { extendRest, restRemaining, type RestPeriod } from './rest'
import {
  TIMED_CLOCKS,
  formatCountdownReading,
  movementReading,
  raceReading,
  restReading,
  roundReading,
  sessionReading,
  type TimerReading,
} from './timed-clock'
import { pauseClock, resumeClock } from './timed-lifecycle'
import { elapsedSeconds } from './workout-clock'

const T0 = Date.parse('2026-11-09T09:00:00.000Z')
const at = (seconds: number) => T0 + seconds * 1000
const iso = (seconds: number) => new Date(at(seconds)).toISOString()

/** The session began a minute before T0. */
const SESSION_STARTED = iso(-60)
const FOR_TIME: ForTimeShape = { capSeconds: 900, size: 1 }
const LADDER: ForTimeShape = { capSeconds: 420, size: 2 }
const AMRAP: AmrapShape = { capSeconds: 480, size: 2 }
const EMOM: EmomShape = { timerType: 'per_minute', minutes: 10, restSeconds: 15, size: 2 }

/** The race's reading at `now`, through the For Time owner exactly as the block reads it. */
function race(state: ForTimeState, shape: ForTimeShape, now: number): TimerReading {
  const running = state.startedAt === null ? 0 : elapsedSeconds(state.startedAt, now)
  const view = forTimeView(state, shape, running)
  return raceReading(view.elapsedSeconds, view.remainingSeconds)
}

function session(now: number): TimerReading {
  return sessionReading(elapsedSeconds(SESSION_STARTED, now))
}

describe('TASK-007 distinct functional clocks', () => {
  it('AC-C21-01 session elapsed, a movement countdown, the session rest and a format clock each read only their own owner at the same moment', () => {
    // At T0: the race starts, the hold starts, and a 90-second rest begins.
    const forTime = startForTime(FOR_TIME_START, at(0))
    const hold = startCountdown(countdownReady(30), at(0))
    const rest: RestPeriod = { exerciseId: 'ex-1', label: 'Back squat', startedAt: at(0), totalSeconds: 90 }

    const now = at(20)
    const readings = [
      session(now),
      movementReading(countdownRemainingSeconds(hold, now)),
      restReading(restRemaining(rest, now)),
      race(forTime, FOR_TIME, now),
    ]

    expect(readings.map(({ clock, seconds, direction }) => [clock, seconds, direction])).toEqual([
      ['session', 80, 'up'],
      ['movement', 10, 'down'],
      ['rest', 70, 'down'],
      ['format', 20, 'up'],
    ])
    // Four clocks, four identities: none of them is another's reading.
    expect(new Set(readings.map(({ clock }) => clock)).size).toBe(4)
    expect([...TIMED_CLOCKS]).toEqual(['session', 'movement', 'rest', 'format'])
  })

  it('AC-C21-01 a section Pause freezes only its format clock and its cap; the session clock, the rest and a running countdown run on', () => {
    let forTime = startForTime(FOR_TIME_START, at(0))
    let amrap = startAmrap(AMRAP_START, at(0))
    let emom = startEmom(EMOM_START, at(0))
    const hold = startCountdown(countdownReady(45), at(0))
    const rest: RestPeriod = { exerciseId: 'ex-1', label: 'Back squat', startedAt: at(0), totalSeconds: 120 }

    // Thirty seconds in, every section clock is paused for two minutes.
    forTime = pauseClock(forTime, at(30))
    amrap = pauseClock(amrap, at(30))
    emom = pauseClock(emom, at(30))

    const now = at(150)
    expect(race(forTime, FOR_TIME, now)).toMatchObject({ seconds: 30, remaining: 870 })
    const amrapWindow = amrapView(amrap, AMRAP, elapsedSeconds(amrap.startedAt, now))
    expect(formatCountdownReading(amrapWindow.remainingSeconds).seconds).toBe(450)
    const minute = emomView(emom, EMOM, elapsedSeconds(emom.startedAt, now))
    expect(minute.paused).toBe(true)
    expect(formatCountdownReading(minute.secondsRemaining).seconds).toBe(30)

    // The other clocks were never the section's to pause.
    expect(session(now).seconds).toBe(210)
    expect(restReading(restRemaining(rest, now)).seconds).toBe(0)
    expect(movementReading(countdownRemainingSeconds(hold, now)).seconds).toBe(0)
    expect(movementReading(countdownRemainingSeconds(hold, at(30))).seconds).toBe(15)

    // Resume keeps the active time and the window left (TASK-006's semantics).
    const resumedAt = at(150)
    forTime = resumeClock(forTime, resumedAt)
    amrap = resumeClock(amrap, resumedAt)
    emom = resumeClock(emom, resumedAt)
    const later = at(160)
    expect(race(forTime, FOR_TIME, later)).toMatchObject({ seconds: 40, remaining: 860 })
    expect(amrapView(amrap, AMRAP, elapsedSeconds(amrap.startedAt, later)).remainingSeconds).toBe(440)
    expect(emomView(emom, EMOM, elapsedSeconds(emom.startedAt, later)).secondsRemaining).toBe(20)
    expect(session(later).seconds).toBe(220)
  })

  it('AC-C21-01 cap arithmetic is the race\'s own: cap minus elapsed while running, frozen while paused, zero once the cap is reached, none without a cap', () => {
    // The timed ladder runs the For Time owner's clock under its own 07:00 cap (TASK-006, R67).
    let ladder = startForTime(FOR_TIME_START, at(0))
    expect(race(ladder, LADDER, at(100))).toMatchObject({ clock: 'format', direction: 'up', seconds: 100, remaining: 320 })

    ladder = pauseClock(ladder, at(100))
    expect(race(ladder, LADDER, at(400))).toMatchObject({ seconds: 100, remaining: 320 })
    ladder = resumeClock(ladder, at(400))
    expect(race(ladder, LADDER, at(710))).toMatchObject({ seconds: 410, remaining: 10 })

    // The cap wins: the reading stops at the cap and has nothing left.
    expect(race(ladder, LADDER, at(900))).toMatchObject({ seconds: 420, remaining: 0 })

    // A race with no cap has no deadline to read.
    expect(race(startForTime(FOR_TIME_START, at(0)), { capSeconds: null, size: 1 }, at(5000))).toMatchObject({
      seconds: 5000,
      remaining: null,
    })
  })

  it('AC-C21-01 a movement countdown banks its own time on Pause, and a rest extension moves only the rest', () => {
    let hold = startCountdown(countdownReady(30), at(0))
    hold = pauseCountdown(hold, at(12))
    // Paused for a minute: the hold still has its 18 seconds; the session ran on.
    expect(movementReading(countdownRemainingSeconds(hold, at(72))).seconds).toBe(18)
    expect(session(at(72)).seconds).toBe(132)

    const rest: RestPeriod = { exerciseId: 'ex-1', label: 'Back squat', startedAt: at(0), totalSeconds: 60 }
    const extended = extendRest(rest)
    expect(restReading(restRemaining(extended, at(50))).seconds).toBe(40)
    expect(movementReading(countdownRemainingSeconds(hold, at(50))).seconds).toBe(18)
    expect(session(at(50)).seconds).toBe(110)
  })

  it('AC-C21-01 the session clock is elapsed only: it counts up, carries no deadline, and past an hour still reads as one clock', () => {
    const reading = session(at(3600))
    expect(reading).toEqual({
      clock: 'session',
      label: 'Session time',
      direction: 'up',
      seconds: 3660,
      remaining: null,
      text: '1:01:00',
      spoken: '1 hour 1 minute 0 seconds',
    })
    // A circuit round's own time is elapsed only too, and is not the session's.
    expect(roundReading(2, 45)).toMatchObject({ clock: 'format', label: 'Round 2 time', remaining: null, text: '00:45' })
  })

  it('AC-C21-01 each clock keeps its own name, direction and words', () => {
    expect(sessionReading(750)).toMatchObject({ label: 'Session time', text: '12:30', spoken: '12 minutes 30 seconds' })
    expect(restReading(90)).toMatchObject({ label: 'Time remaining', text: '01:30', spoken: '1 minute 30 seconds left' })
    expect(movementReading(30)).toMatchObject({ label: 'Countdown', text: '00:30', spoken: '30 seconds left' })
    expect(formatCountdownReading(59)).toMatchObject({ label: 'Time remaining', direction: 'down', remaining: 59 })
    expect(raceReading(383, 517)).toMatchObject({ label: 'Block time', text: '06:23', spoken: '6 minutes 23 seconds' })
    // A countdown never shows a negative or fractional second.
    expect(restReading(-4)).toMatchObject({ seconds: 0, remaining: 0, text: '00:00' })
    expect(movementReading(9.7)).toMatchObject({ seconds: 9, text: '00:09' })
  })

  it('AC-R007-03 a reading is a pure function of its owner\'s reading: re-read after a reload or in another place it is identical, and reading starts nothing', () => {
    const paused = pauseClock(startForTime(FOR_TIME_START, at(0)), at(40))
    // A reload restores the stored record through the owner's own repair.
    const restored = clampForTimeState(JSON.parse(JSON.stringify(paused)) as ForTimeState)
    expect(restored).toEqual(paused)
    expect(race(restored, FOR_TIME, at(400))).toEqual(race(paused, FOR_TIME, at(400)))

    // Reading the same owner twice — the footer and the open log — is one clock.
    const rest: RestPeriod = { exerciseId: 'ex-1', label: 'Back squat', startedAt: at(0), totalSeconds: 120 }
    const footer = restReading(restRemaining(rest, at(30)))
    const log = restReading(restRemaining(rest, at(30)))
    expect(log).toEqual(footer)
    expect(rest).toEqual({ exerciseId: 'ex-1', label: 'Back squat', startedAt: at(0), totalSeconds: 120 })

    // An unstarted race is read without being started.
    const ready = FOR_TIME_START
    expect(race(ready, FOR_TIME, at(500))).toMatchObject({ seconds: 0, remaining: 900 })
    expect(ready).toEqual({ startedAt: null, finishedAt: null })
  })
})
