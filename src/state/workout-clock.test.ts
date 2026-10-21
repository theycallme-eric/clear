/**
 * EXE-01 acceptance — "the global timer remains correct after backgrounding".
 *
 * The defect being replaced counted ticks, so the tests that matter here are
 * the ones where the number of ticks and the number of elapsed seconds
 * disagree: a throttled interval, a suspended tab, a phone that locked. In
 * each the clock moves and the timer is asked what it reads.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { emomView, type EmomShape } from './emom'
import {
  elapsedMinutes,
  elapsedSeconds,
  formatElapsed,
  spokenElapsed,
  useElapsedSeconds,
} from './workout-clock'

const START = '2026-09-24T09:00:00.000Z'
const START_MS = Date.parse(START)

describe('elapsedSeconds', () => {
  it('is whole seconds between the start and now', () => {
    expect(elapsedSeconds(START, START_MS + 90_500)).toBe(90)
  })

  it('is zero for a session that has not started', () => {
    expect(elapsedSeconds(null, START_MS)).toBe(0)
  })

  it('is zero rather than NaN for an unparsable timestamp', () => {
    expect(elapsedSeconds('not a timestamp', START_MS)).toBe(0)
  })

  it('never runs backwards when the device clock is behind the server', () => {
    // A workout that has been running for minus four seconds is not a reading.
    expect(elapsedSeconds(START, START_MS - 4_000)).toBe(0)
  })
})

describe('formatElapsed', () => {
  it('is MM:SS below an hour', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(65)).toBe('01:05')
    expect(formatElapsed(3_599)).toBe('59:59')
  })

  it('grows an hours field rather than reading 72:15', () => {
    expect(formatElapsed(3_600)).toBe('1:00:00')
    expect(formatElapsed(4_335)).toBe('1:12:15')
  })
})

describe('spokenElapsed', () => {
  it('speaks words, not punctuation, and never says a zero unit it has not reached', () => {
    expect(spokenElapsed(750)).toBe('12 minutes 30 seconds')
    expect(spokenElapsed(45)).toBe('45 seconds')
    expect(spokenElapsed(3_661)).toBe('1 hour 1 minute 1 second')
  })
})

describe('elapsedMinutes', () => {
  it('floors to whole minutes, which is what complete_session stores', () => {
    expect(elapsedMinutes(0)).toBe(0)
    expect(elapsedMinutes(59)).toBe(0)
    expect(elapsedMinutes(2_699)).toBe(44)
  })
})

describe('useElapsedSeconds', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the session start immediately, without waiting for a tick', () => {
    const { result } = renderHook(() => useElapsedSeconds(START, () => START_MS + 20_000))

    expect(result.current).toBe(20)
  })

  it('advances with the clock', () => {
    let now = START_MS
    const { result } = renderHook(() => useElapsedSeconds(START, () => now))

    now += 3_000
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe(3)
  })

  it('is right after a backgrounded tab delivered a single throttled tick', () => {
    let now = START_MS
    const { result } = renderHook(() => useElapsedSeconds(START, () => now))

    // Eleven minutes in the background; the browser throttled the interval to
    // one tick. A tick counter would read 00:00.5 — this reads the clock.
    now += 11 * 60_000
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe(660)
    expect(formatElapsed(result.current)).toBe('11:00')
  })

  it('is right on the first paint after a resume, before any tick fires', () => {
    let now = START_MS
    const { result } = renderHook(() => useElapsedSeconds(START, () => now))

    for (const event of ['visibilitychange', 'focus', 'pageshow']) {
      now += 60_000
      act(() => {
        window.dispatchEvent(new Event(event))
      })
      expect(result.current).toBe(elapsedSeconds(START, now))
    }
  })

  it('stops reading the clock once the shell is gone', () => {
    let reads = 0
    const { unmount } = renderHook(() =>
      useElapsedSeconds(START, () => {
        reads += 1
        return START_MS
      }),
    )

    unmount()
    const after = reads
    act(() => {
      vi.advanceTimersByTime(5_000)
      window.dispatchEvent(new Event('focus'))
    })

    expect(reads).toBe(after)
  })
})

/**
 * REQ-014 drives an EMOM's minutes off this same clock. The session's elapsed
 * time stays its own reading — an EMOM starting, rolling over a minute or
 * expiring changes nothing about it — and the EMOM's grid, read through the
 * same hook, lands on the right minute after a background with no tick.
 */
describe('the session clock beside an EMOM (REQ-014)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const SHAPE: EmomShape = { timerType: 'per_minute', minutes: 4, restSeconds: 0, size: 2 }

  it('keeps the session elapsed time independent of the EMOM’s own start', () => {
    let now = START_MS + 300_000
    // The EMOM is started five minutes into the session.
    const emomStart = new Date(now).toISOString()
    const { result } = renderHook(() => ({
      session: useElapsedSeconds(START, () => now),
      emom: useElapsedSeconds(emomStart, () => now),
    }))

    // Backgrounded across a minute boundary and past the window's expiry.
    for (const [ahead, minute, phase] of [
      [61_000, 2, 'work'],
      [180_000, 4, 'finished'],
    ] as const) {
      now += ahead
      act(() => {
        window.dispatchEvent(new Event('visibilitychange'))
      })

      expect(result.current.session).toBe(elapsedSeconds(START, now))
      const view = emomView({ startedAt: emomStart, workDoneMinute: null }, SHAPE, result.current.emom)
      expect(view.minute).toBe(minute)
      expect(view.phase).toBe(phase)
    }

    // Expiry stops the EMOM's grid, never the session: it reads 9:01 on.
    expect(formatElapsed(result.current.session)).toBe('09:01')
  })

  it('reads an EMOM minute boundary off the wall clock, not off ticks', () => {
    let now = START_MS
    const { result } = renderHook(() => useElapsedSeconds(START, () => now))

    // One throttled tick across the boundary into minute 2.
    now += 60_000
    act(() => {
      vi.advanceTimersByTime(500)
    })

    const view = emomView({ startedAt: START, workDoneMinute: null }, SHAPE, result.current)
    expect(view.minute).toBe(2)
    expect(view.secondsRemaining).toBe(60)
    expect(view.activePosition).toBe(2)
  })
})
