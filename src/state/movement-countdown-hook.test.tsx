import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useMovementCountdown } from './movement-countdown'

afterEach(cleanup)

describe('a movement countdown is armed for its current set', () => {
  it.each(['running', 'paused', 'finished'] as const)(
    'does not resurrect a previous set’s %s state when its arming key is revisited',
    (status) => {
      let at = 0
      const now = () => at
      const { result, rerender } = renderHook(
        ({ seconds, armedFor }) => useMovementCountdown(seconds, now, armedFor),
        { initialProps: { seconds: 30, armedFor: 'set-a' } },
      )

      act(() => result.current.start())
      at = status === 'finished' ? 31_000 : 5_000
      act(() => {
        if (status === 'paused') result.current.pause()
        else globalThis.dispatchEvent(new Event('focus'))
      })
      expect(result.current.status).toBe(status)

      // Logging advances to another set; no timer action is taken on that set.
      rerender({ seconds: 20, armedFor: 'set-b' })
      expect(result.current).toMatchObject({ status: 'ready', totalSeconds: 20, remainingSeconds: 20 })

      // A correction can make the earlier set current again. This is another
      // arming transition, as with the previous keyed-remount ownership.
      rerender({ seconds: 30, armedFor: 'set-a' })
      expect(result.current).toMatchObject({ status: 'ready', totalSeconds: 30, remainingSeconds: 30 })
    },
  )

  it('keeps the running deadline when the same set’s view rerenders', () => {
    let at = 0
    const now = () => at
    const { result, rerender } = renderHook(
      ({ armedFor }) => useMovementCountdown(30, now, armedFor),
      { initialProps: { armedFor: 'set-a' } },
    )

    act(() => result.current.start())
    at = 5_000
    act(() => globalThis.dispatchEvent(new Event('focus')))
    expect(result.current).toMatchObject({ status: 'running', remainingSeconds: 25 })

    rerender({ armedFor: 'set-a' })
    expect(result.current).toMatchObject({ status: 'running', remainingSeconds: 25 })
    at = 10_000
    act(() => globalThis.dispatchEvent(new Event('focus')))
    expect(result.current).toMatchObject({ status: 'running', remainingSeconds: 20 })
  })
})
