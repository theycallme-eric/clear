/**
 * AUTH-02 — the resend cooldown, against a controlled clock.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCountdown } from './cooldown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is idle until it is started', () => {
    const { result } = renderHook(() => useCountdown(() => Date.now()))

    expect(result.current.secondsLeft).toBe(0)
    expect(result.current.active).toBe(false)
  })

  it('counts down whole seconds and ends by itself', () => {
    const { result } = renderHook(() => useCountdown(() => Date.now()))

    act(() => result.current.start(3))
    expect(result.current.secondsLeft).toBe(3)
    expect(result.current.active).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.secondsLeft).toBe(2)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.secondsLeft).toBe(0)
    expect(result.current.active).toBe(false)
  })

  it('reads the clock rather than counting ticks, so a slept tab lands right', () => {
    let current = 0
    const { result } = renderHook(() => useCountdown(() => current))

    act(() => result.current.start(60))
    expect(result.current.secondsLeft).toBe(60)

    // The tab was backgrounded: one tick fires, 45 seconds have passed.
    current += 45_000
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.secondsLeft).toBe(15)
  })

  it('restarting replaces the deadline rather than extending it', () => {
    let current = 0
    const { result } = renderHook(() => useCountdown(() => current))

    act(() => result.current.start(60))
    current += 30_000
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.secondsLeft).toBe(30)

    act(() => result.current.start(10))
    expect(result.current.secondsLeft).toBe(10)
  })

  it('clears on demand', () => {
    const { result } = renderHook(() => useCountdown(() => Date.now()))

    act(() => result.current.start(30))
    act(() => result.current.clear())

    expect(result.current.secondsLeft).toBe(0)
    expect(result.current.active).toBe(false)
  })

  it('stops ticking when the component unmounts', () => {
    const { result, unmount } = renderHook(() => useCountdown(() => Date.now()))

    act(() => result.current.start(30))
    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
