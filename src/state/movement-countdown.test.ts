/**
 * REQ-014 — the movement countdown's arithmetic: banked time plus a wall-clock
 * start, so a pause, a resume and a sleeping phone all read right.
 */
import { describe, expect, it } from 'vitest'

import {
  countdownReady,
  countdownRemainingSeconds,
  countdownStatus,
  pauseCountdown,
  resetCountdown,
  startCountdown,
} from './movement-countdown'

const T0 = 1_000_000

describe('movement countdown state', () => {
  it('starts ready at the prescribed seconds and runs from the wall clock', () => {
    const ready = countdownReady(30)
    expect(countdownStatus(ready, T0)).toBe('ready')
    expect(countdownRemainingSeconds(ready, T0)).toBe(30)

    const running = startCountdown(ready, T0)
    expect(countdownStatus(running, T0 + 10_000)).toBe('running')
    expect(countdownRemainingSeconds(running, T0 + 10_000)).toBe(20)
    // Rounded up: 00:01 shows until the hold is over.
    expect(countdownRemainingSeconds(running, T0 + 29_500)).toBe(1)
  })

  it('pauses on the exact remainder and resumes from it', () => {
    const running = startCountdown(countdownReady(30), T0)
    const paused = pauseCountdown(running, T0 + 10_400)
    expect(countdownStatus(paused, T0 + 60_000)).toBe('paused')
    expect(countdownRemainingSeconds(paused, T0 + 60_000)).toBe(20)

    const resumed = startCountdown(paused, T0 + 60_000)
    expect(countdownRemainingSeconds(resumed, T0 + 64_600)).toBe(15)
  })

  it('finishes at zero, never below, and Start does not rerun a finished countdown', () => {
    const running = startCountdown(countdownReady(30), T0)
    expect(countdownStatus(running, T0 + 45_000)).toBe('finished')
    expect(countdownRemainingSeconds(running, T0 + 45_000)).toBe(0)

    const paused = pauseCountdown(running, T0 + 45_000)
    expect(startCountdown(paused, T0 + 50_000)).toBe(paused)
  })

  it('reset returns to the prescribed seconds from any state', () => {
    const running = startCountdown(countdownReady(30), T0)
    expect(resetCountdown(running)).toEqual(countdownReady(30))
    expect(resetCountdown(pauseCountdown(running, T0 + 5_000))).toEqual(countdownReady(30))
  })

  it('never reads more than was banked when the clock runs backwards', () => {
    const running = startCountdown(countdownReady(30), T0)
    expect(countdownRemainingSeconds(running, T0 - 5_000)).toBe(30)
  })
})
