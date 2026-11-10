/**
 * TASK-008 (REQ-008; C23, C24, C61; G06; R120, R125, R126, R144; AC-C23-01,
 * AC-C24-01, AC-R008-03; JOURNEY-008) — which clocks warn, and when.
 *
 * Every clock below is its existing owner's, driven through that owner's own
 * functions at exact wall-clock moments. `state/countdown-urgency.ts` reads
 * the deadline from the owner's view and the accepted rule
 * (`ui/refinements/countdown-warning.ts`, gallery `eded158c…`) decides: the
 * timer-low colour once 0 < remaining <= 10 on a live deadline, the breathe
 * and the one screen-edge aura only while it runs with 0 < remaining <= 5,
 * nothing on pause or expiry, and nothing ever for an elapsed-only clock. How
 * the route draws it is `src/ui/countdown-urgency.test.tsx` and
 * `e2e/refinement/task-008.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  COUNTDOWN_WARNING_THRESHOLDS,
  countdownWarningState,
  type CountdownWarning,
} from '../ui/refinements/countdown-warning'
import { amrapView, finishAmrap, startAmrap, AMRAP_START, type AmrapShape } from './amrap'
import { circuitView, finishRound, startRound, CIRCUIT_START, type CircuitShape } from './circuit'
import {
  NO_DEADLINE,
  amrapWindowDeadline,
  circuitRestDeadline,
  emomMinuteDeadline,
  movementCountdownDeadline,
  raceCapDeadline,
  restDeadline,
  scheduleIntervalDeadline,
  type CountdownDeadline,
} from './countdown-urgency'
import { emomView, finishEmom, startEmom, EMOM_START, type EmomShape } from './emom'
import {
  FOR_TIME_START,
  FOR_TIME_URGENCY_SECONDS,
  finishForTime,
  forTimeView,
  startForTime,
  type ForTimeShape,
  type ForTimeState,
} from './for-time'
import {
  countdownReady,
  countdownRemainingSeconds,
  countdownStatus,
  pauseCountdown,
  startCountdown,
  type CountdownState,
} from './movement-countdown'
import { restRemaining, type RestPeriod } from './rest'
import { formatCountdownReading, movementReading, raceReading, restReading, roundReading, sessionReading } from './timed-clock'
import { pauseClock, resumeClock } from './timed-lifecycle'
import { elapsedSeconds } from './workout-clock'

const T0 = Date.parse('2026-11-09T09:00:00.000Z')
const at = (seconds: number) => T0 + seconds * 1000

const FOR_TIME: ForTimeShape = { capSeconds: 900, size: 1 }
const LADDER: ForTimeShape = { capSeconds: 420, size: 2 }
const AMRAP: AmrapShape = { capSeconds: 480, size: 2 }
const EMOM: EmomShape = { timerType: 'per_minute', minutes: 10, restSeconds: 15, size: 2 }
const CIRCUIT: CircuitShape = { rounds: 3, size: 2, restSeconds: 90 }

const NEUTRAL: CountdownWarning = { low: false, urgent: false }
const COLOUR: CountdownWarning = { low: true, urgent: false }
const EDGE: CountdownWarning = { low: true, urgent: true }

function warn(deadline: CountdownDeadline): CountdownWarning {
  return countdownWarningState(deadline.remaining, deadline.running)
}

function hold(state: CountdownState, now: number): CountdownDeadline {
  return movementCountdownDeadline(countdownStatus(state, now), countdownRemainingSeconds(state, now))
}

function race(state: ForTimeState, shape: ForTimeShape, now: number) {
  const running = state.startedAt === null ? 0 : elapsedSeconds(state.startedAt, now)
  return forTimeView(state, shape, running)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TASK-008 countdown warning eligibility', () => {
  it('AC-C23-01 the accepted rule: colour at 10 seconds left, the edge only while running at 5 and under, nothing at 11, at zero or for an unusable reading', () => {
    expect(COUNTDOWN_WARNING_THRESHOLDS).toEqual({ colorSeconds: 10, pulseSeconds: 5 })
    expect(Object.isFrozen(COUNTDOWN_WARNING_THRESHOLDS)).toBe(true)

    const running = [11, 10, 6, 5, 4, 1, 0].map((seconds) => [seconds, countdownWarningState(seconds, true)])
    expect(running).toEqual([
      [11, NEUTRAL],
      [10, COLOUR],
      [6, COLOUR],
      [5, EDGE],
      [4, EDGE],
      [1, EDGE],
      [0, NEUTRAL],
    ])
    // Held (paused) with time left: the colour stays, the edge never shows.
    expect([10, 5, 1].map((seconds) => countdownWarningState(seconds, false))).toEqual([COLOUR, COLOUR, COLOUR])
    // No deadline, or a reading that is not a time left: never a warning.
    for (const remaining of [null, Number.NaN, Number.POSITIVE_INFINITY, -1, -0.5]) {
      expect(countdownWarningState(remaining, true)).toEqual(NEUTRAL)
    }
    // An elapsed-only clock never warns, whatever it reads.
    expect(countdownWarningState(5, true, true)).toEqual(NEUTRAL)
    expect(warn(NO_DEADLINE)).toEqual(NEUTRAL)
  })

  it('AC-R008-03 every countdown family warns on its own owner\'s remaining time: a movement countdown, the rest, an EMOM minute, an AMRAP window, a scheduled interval and a circuit round rest', () => {
    // A 30-second hold, started at T0.
    const counting = startCountdown(countdownReady(30), at(0))
    expect([19, 20, 24, 25, 29].map((second) => warn(hold(counting, at(second))))).toEqual([NEUTRAL, COLOUR, COLOUR, EDGE, EDGE])
    // Before Start it is a prescription, not a running deadline — even a short hold.
    expect(warn(hold(countdownReady(8), at(0)))).toEqual(NEUTRAL)

    // The session's rest: 90 seconds.
    const rest: RestPeriod = { exerciseId: 'ex-1', label: 'Back squat', startedAt: at(0), totalSeconds: 90 }
    expect([79, 80, 85, 89].map((second) => warn(restDeadline(restRemaining(rest, at(second)))))).toEqual([NEUTRAL, COLOUR, EDGE, EDGE])

    // An EMOM's minute: the cue means "wrap up this minute" and resets at each boundary.
    const emom = startEmom(EMOM_START, at(0))
    const minute = (second: number) => emomView(emom, EMOM, elapsedSeconds(emom.startedAt, at(second)))
    expect([49, 50, 55, 59, 60, 115].map((second) => warn(emomMinuteDeadline(minute(second))))).toEqual([
      NEUTRAL, COLOUR, EDGE, EDGE, NEUTRAL, EDGE,
    ])
    // Through the minute's rest window too: the deadline is the minute's.
    expect(minute(52).phase).toBe('rest')
    expect(warn(emomMinuteDeadline(minute(56)))).toEqual(EDGE)

    // An AMRAP's 8-minute window.
    const amrap = startAmrap(AMRAP_START, at(0))
    const window = (second: number) => amrapView(amrap, AMRAP, elapsedSeconds(amrap.startedAt, at(second)))
    expect([469, 470, 475, 479].map((second) => warn(amrapWindowDeadline(window(second))))).toEqual([NEUTRAL, COLOUR, EDGE, EDGE])

    // A scheduled ladder's countdown to its next start, and a circuit's round rest.
    expect(warn(scheduleIntervalDeadline({ phase: 'running', secondsRemaining: 10 }))).toEqual(COLOUR)
    expect(warn(scheduleIntervalDeadline({ phase: 'running', secondsRemaining: 5 }))).toEqual(EDGE)
    const resting = finishRound(startRound(CIRCUIT_START, CIRCUIT, at(0)), CIRCUIT, at(60))
    const circuit = (second: number) => circuitView(resting, CIRCUIT, elapsedSeconds(resting.restStartedAt, at(second)))
    expect([139, 140, 145, 149].map((second) => warn(circuitRestDeadline(circuit(second))))).toEqual([NEUTRAL, COLOUR, EDGE, EDGE])

    // Every deadline is the reading's own remaining time, never a second clock.
    expect(hold(counting, at(25)).remaining).toBe(movementReading(countdownRemainingSeconds(counting, at(25))).remaining)
    expect(restDeadline(restRemaining(rest, at(85))).remaining).toBe(restReading(restRemaining(rest, at(85))).remaining)
    expect(emomMinuteDeadline(minute(55)).remaining).toBe(formatCountdownReading(minute(55).secondsRemaining).remaining)
  })

  it('AC-C23-01 a count-up race warns on its cap minus elapsed, never on the number it shows: For Time and the raced ladder', () => {
    const forTime = startForTime(FOR_TIME_START, at(0))
    const view = (second: number) => race(forTime, FOR_TIME, at(second))
    expect([889, 890, 895, 899].map((second) => warn(raceCapDeadline(view(second))))).toEqual([NEUTRAL, COLOUR, EDGE, EDGE])
    // The digits count up (14:55); the warning reads the 5 seconds left before the cap.
    expect(raceReading(view(895).elapsedSeconds, view(895).remainingSeconds)).toMatchObject({ direction: 'up', text: '14:55', remaining: 5 })
    expect(raceCapDeadline(view(895))).toEqual({ remaining: 5, running: true })
    // A displayed count-up of 00:05 is five seconds in, nowhere near the cap.
    expect(warn(raceCapDeadline(view(5)))).toEqual(NEUTRAL)

    // The raced ladder runs the For Time owner under its own 07:00 cap (TASK-006, R67).
    const ladder = startForTime(FOR_TIME_START, at(0))
    expect(warn(raceCapDeadline(race(ladder, LADDER, at(410))))).toEqual(COLOUR)
    expect(warn(raceCapDeadline(race(ladder, LADDER, at(416))))).toEqual(EDGE)

    // The For Time words ("Cap in … — finish now") and the colour agree on ten.
    expect(FOR_TIME_URGENCY_SECONDS).toBe(COUNTDOWN_WARNING_THRESHOLDS.colorSeconds)
    expect(view(890).urgent).toBe(warn(raceCapDeadline(view(890))).low)
  })

  it('AC-C24-01 pause holds the colour and stops the edge; resume brings it back; expiry, a finish and the cap end it', () => {
    // Movement countdown paused with 4 seconds left, then resumed and run out.
    let counting = startCountdown(countdownReady(30), at(0))
    counting = pauseCountdown(counting, at(26))
    expect(hold(counting, at(60))).toEqual({ remaining: 4, running: false })
    expect(warn(hold(counting, at(60)))).toEqual(COLOUR)
    counting = startCountdown(counting, at(60))
    expect(warn(hold(counting, at(61)))).toEqual(EDGE)
    expect(hold(counting, at(64))).toEqual(NO_DEADLINE)
    expect(warn(hold(counting, at(64)))).toEqual(NEUTRAL)

    // A race paused 3 seconds before its cap: frozen, coloured, no edge.
    let forTime = startForTime(FOR_TIME_START, at(0))
    forTime = pauseClock(forTime, at(897))
    expect(warn(raceCapDeadline(race(forTime, FOR_TIME, at(1200))))).toEqual(COLOUR)
    forTime = resumeClock(forTime, at(1200))
    expect(warn(raceCapDeadline(race(forTime, FOR_TIME, at(1201))))).toEqual(EDGE)
    // The cap reached: the warning is over (the outcome is the block's own words).
    expect(race(forTime, FOR_TIME, at(1300)).phase).toBe('capped')
    expect(warn(raceCapDeadline(race(forTime, FOR_TIME, at(1300))))).toEqual(NEUTRAL)
    // Finished two seconds before the cap: no pressure however close it came.
    const finished = finishForTime(startForTime(FOR_TIME_START, at(0)), at(898))
    expect(warn(raceCapDeadline(race(finished, FOR_TIME, at(899))))).toEqual(NEUTRAL)

    // A paused EMOM minute, an EMOM finished early, and the last minute run out.
    let emom = startEmom(EMOM_START, at(0))
    emom = pauseClock(emom, at(57))
    expect(warn(emomMinuteDeadline(emomView(emom, EMOM, elapsedSeconds(emom.startedAt, at(90)))))).toEqual(COLOUR)
    const early = finishEmom(startEmom(EMOM_START, at(0)), at(57))
    expect(warn(emomMinuteDeadline(emomView(early, EMOM, elapsedSeconds(early.startedAt, at(58)))))).toEqual(NEUTRAL)
    const run = startEmom(EMOM_START, at(0))
    expect(warn(emomMinuteDeadline(emomView(run, EMOM, elapsedSeconds(run.startedAt, at(601)))))).toEqual(NEUTRAL)

    // A paused AMRAP window, and one the cap closed.
    let amrap = startAmrap(AMRAP_START, at(0))
    amrap = pauseClock(amrap, at(476))
    expect(warn(amrapWindowDeadline(amrapView(amrap, AMRAP, elapsedSeconds(amrap.startedAt, at(500)))))).toEqual(COLOUR)
    const closed = finishAmrap(startAmrap(AMRAP_START, at(0)), AMRAP, 480)
    expect(warn(amrapWindowDeadline(amrapView(closed, AMRAP, 480)))).toEqual(NEUTRAL)

    // A rest that has run out is no longer a deadline; neither is a spent circuit rest.
    expect(restDeadline(0)).toEqual(NO_DEADLINE)
    const resting = finishRound(startRound(CIRCUIT_START, CIRCUIT, at(0)), CIRCUIT, at(60))
    expect(warn(circuitRestDeadline(circuitView(resting, CIRCUIT, 90)))).toEqual(NEUTRAL)
    expect(warn(scheduleIntervalDeadline({ phase: 'complete', secondsRemaining: 0 }))).toEqual(NEUTRAL)
  })

  it('AC-R008-03 elapsed-only clocks stay neutral at every reading: the session clock, a round\'s elapsed time and a race with no cap', () => {
    for (const seconds of [0, 1, 5, 10, 60, 3600]) {
      // The session's clock and a round's clock carry no deadline in their readings.
      expect(sessionReading(seconds).remaining).toBeNull()
      expect(roundReading(2, seconds).remaining).toBeNull()
      expect(countdownWarningState(sessionReading(seconds).remaining, true)).toEqual(NEUTRAL)
      expect(countdownWarningState(roundReading(2, seconds).remaining, true)).toEqual(NEUTRAL)
    }
    const uncapped = startForTime(FOR_TIME_START, at(0))
    const view = race(uncapped, { capSeconds: null, size: 1 }, at(5))
    expect(raceCapDeadline(view)).toEqual(NO_DEADLINE)
    expect(warn(raceCapDeadline(view))).toEqual(NEUTRAL)
  })

  it('AC-C24-01 a warning records no work: reading every deadline stores nothing, starts nothing and changes no owner\'s record', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')
    const forTime = startForTime(FOR_TIME_START, at(0))
    const snapshot = JSON.stringify(forTime)
    const ready = FOR_TIME_START

    for (let second = 880; second <= 905; second += 1) {
      warn(raceCapDeadline(race(forTime, FOR_TIME, at(second))))
    }
    // Reading an unstarted race does not start it.
    expect(warn(raceCapDeadline(race(ready, FOR_TIME, at(900))))).toEqual(NEUTRAL)
    expect(ready).toEqual({ startedAt: null, finishedAt: null })
    expect(JSON.stringify(forTime)).toBe(snapshot)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    // The same reading always gives the same answer: a pure projection, not a clock.
    expect(raceCapDeadline(race(forTime, FOR_TIME, at(896)))).toEqual(raceCapDeadline(race(forTime, FOR_TIME, at(896))))
    expect(Object.isFrozen(NO_DEADLINE)).toBe(true)
  })
})
