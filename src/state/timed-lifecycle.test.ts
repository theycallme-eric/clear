/**
 * TASK-006 (C18) — the shared Pause/Resume arithmetic and the format owners
 * that apply it, as pure functions: the confirmed semantics (Pause freezes the
 * section clock and its cap; Resume keeps the active time and the window left),
 * a paused attempt ending at its pause, and records written before Pause
 * existed still restoring. The route behaviour is `src/ui/timed-workout-flow.test.tsx`.
 */
import { describe, expect, it } from 'vitest'

import { amrapView, clampAmrapState, finishAmrap, startAmrap, AMRAP_START } from './amrap'
import { clampEmomState, emomView, finishEmom, startEmom, EMOM_START, type EmomShape } from './emom'
import { clampForTimeState, finishForTime, forTimeView, startForTime, FOR_TIME_START } from './for-time'
import {
  clockStopMoment,
  finishLabel,
  isClockPaused,
  pauseClock,
  pausedElapsedSeconds,
  resumeClock,
} from './timed-lifecycle'
import {
  readAmrapState,
  readEmomState,
  readForTimeState,
  writeAmrapState,
  writeEmomState,
  writeForTimeState,
  WORKOUT_EMOM_STORAGE_KEY,
  type ShellStorage,
} from './workout-persistence'

const T0 = Date.parse('2026-11-09T09:00:00.000Z')
const at = (seconds: number) => T0 + seconds * 1000

function memory(): ShellStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

describe('the shared pause arithmetic', () => {
  it('freezes at the pause and resumes with the same active time', () => {
    const started = startForTime(FOR_TIME_START, at(0))
    const paused = pauseClock(started, at(30))
    expect(isClockPaused(paused)).toBe(true)
    expect(pausedElapsedSeconds(paused)).toBe(30)
    // Pausing twice keeps the first pause.
    expect(pauseClock(paused, at(90))).toEqual(paused)

    const resumed = resumeClock(paused, at(150))
    expect(isClockPaused(resumed)).toBe(false)
    expect('pausedAt' in resumed).toBe(false)
    // The start moved on by the two paused minutes: 30 s active, as before.
    expect(Date.parse(resumed.startedAt!)).toBe(at(120))
    expect(resumeClock(resumed, at(200))).toEqual(resumed)
  })

  it('ends a paused attempt at its pause, and a running one at the tap', () => {
    const started = startForTime(FOR_TIME_START, at(0))
    expect(clockStopMoment(started, at(40))).toBe(at(40))
    expect(clockStopMoment(pauseClock(started, at(25)), at(40))).toBe(at(25))
  })

  it('does nothing to a clock that never started', () => {
    expect(pauseClock(FOR_TIME_START, at(10))).toEqual(FOR_TIME_START)
    expect(resumeClock(FOR_TIME_START, at(10))).toEqual(FOR_TIME_START)
  })

  it('keeps each format’s own Finish wording', () => {
    expect([finishLabel('emom', true), finishLabel('amrap', true), finishLabel('for_time', true), finishLabel('ladder', false)])
      .toEqual(['Finish early', 'Finish early', 'Finish', 'Finish'])
    expect([finishLabel('emom', false), finishLabel('amrap', false)]).toEqual(['Finish', 'Finish'])
  })
})

describe('the formats apply it to their own clocks', () => {
  it('For Time: paused, the clock and its cap hold; finished while paused, the race ends at the pause', () => {
    const shape = { capSeconds: 600, size: 1 }
    const paused = pauseClock(startForTime(FOR_TIME_START, at(0)), at(40))
    // However much later the screen reads it.
    expect(forTimeView(paused, shape, 500)).toMatchObject({ phase: 'paused', elapsedSeconds: 40, remainingSeconds: 560, urgent: false })
    const finished = finishForTime(paused, at(400))
    expect(finished).toEqual({ startedAt: new Date(at(0)).toISOString(), finishedAt: new Date(at(40)).toISOString() })
    expect(forTimeView(finished, shape, 0)).toMatchObject({ phase: 'finished', elapsedSeconds: 40, completedUnderCap: true })
  })

  it('For Time: paused near the cap is not urgent, and resumed it is again', () => {
    const shape = { capSeconds: 60, size: 1 }
    const paused = pauseClock(startForTime(FOR_TIME_START, at(0)), at(55))
    expect(forTimeView(paused, shape, 0).urgent).toBe(false)
    expect(forTimeView(resumeClock(paused, at(100)), shape, 55).urgent).toBe(true)
  })

  it('AMRAP: a paused window holds what is left and ends at its pause', () => {
    const shape = { capSeconds: 480, size: 2 }
    const paused = pauseClock(startAmrap(AMRAP_START, at(0)), at(60))
    expect(amrapView(paused, shape, 999)).toMatchObject({ phase: 'paused', remainingSeconds: 420, elapsedSeconds: 60 })
    const ended = finishAmrap(paused, shape, 999)
    expect(ended.endedAtSeconds).toBe(60)
    expect('pausedAt' in ended).toBe(false)
    expect(amrapView(ended, shape, 999).phase).toBe('complete')
  })

  it('EMOM: a paused grid keeps its minute and phase; Finish early ends it in that minute and counts nothing', () => {
    const shape: EmomShape = { timerType: 'per_minute', minutes: 10, restSeconds: 15, size: 2 }
    const paused = pauseClock(startEmom(EMOM_START, at(0)), at(50))
    expect(emomView(paused, shape, 500)).toMatchObject({ phase: 'rest', paused: true, minute: 1, secondsRemaining: 10 })
    const finished = finishEmom(paused, at(300))
    expect(finished.finishedAt).toBe(new Date(at(50)).toISOString())
    expect(emomView(finished, shape, 900)).toMatchObject({ phase: 'finished', endedEarly: true, minute: 1, activePosition: null })
    // The natural end is still the natural end.
    expect(emomView(startEmom(EMOM_START, at(0)), shape, 600)).toMatchObject({ phase: 'finished', endedEarly: false, minute: 10 })
  })
})

describe('restoring a record', () => {
  it('round-trips a paused clock and an early finish through storage', () => {
    const storage = memory()
    const forTime = pauseClock(startForTime(FOR_TIME_START, at(0)), at(30))
    const amrap = pauseClock(startAmrap(AMRAP_START, at(0)), at(30))
    const emom = finishEmom(startEmom(EMOM_START, at(0)), at(130))
    writeForTimeState(storage, 'block-a', forTime)
    writeAmrapState(storage, 'block-b', amrap)
    writeEmomState(storage, 'block-c', emom)
    expect(clampForTimeState(readForTimeState(storage, 'block-a')!)).toEqual(forTime)
    expect(clampAmrapState(readAmrapState(storage, 'block-b')!, { capSeconds: 480, size: 2 })).toEqual(amrap)
    expect(clampEmomState(readEmomState(storage, 'block-c')!)).toEqual(emom)
  })

  it('restores records written before Pause existed, and drops a stamp no clock can use', () => {
    const storage = memory()
    storage.setItem(WORKOUT_EMOM_STORAGE_KEY, JSON.stringify({
      old: { startedAt: new Date(at(0)).toISOString(), workDoneMinute: null },
      bogus: { startedAt: new Date(at(0)).toISOString(), workDoneMinute: null, pausedAt: 12 },
    }))
    expect(readEmomState(storage, 'old')).toEqual({ startedAt: new Date(at(0)).toISOString(), workDoneMinute: null })
    // Not a stamp at all: the record is not one this build wrote.
    expect(readEmomState(storage, 'bogus')).toBeNull()

    // A pause before its start, or an unreadable one, is dropped: the clock runs.
    const started = new Date(at(100)).toISOString()
    expect(clampForTimeState({ startedAt: started, finishedAt: null, pausedAt: new Date(at(50)).toISOString() }))
      .toEqual({ startedAt: started, finishedAt: null })
    expect(clampEmomState({ startedAt: started, workDoneMinute: null, pausedAt: 'not a date' }))
      .toEqual({ startedAt: started, workDoneMinute: null })
    // A finished attempt carries no pause.
    expect(clampForTimeState({ startedAt: started, finishedAt: new Date(at(130)).toISOString(), pausedAt: new Date(at(120)).toISOString() }))
      .toEqual({ startedAt: started, finishedAt: new Date(at(130)).toISOString() })
  })
})
