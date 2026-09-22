/**
 * AUTH-02 — a countdown a screen can show and a button can read.
 *
 * The requirement is "resend disabled during cooldown with **visible**
 * countdown", so the remaining seconds are state, not a `disabled` flag with a
 * timer hidden behind it. One deadline, recomputed from the clock on each tick:
 * a backgrounded tab that misses ticks comes back with the right number rather
 * than with however many ticks it managed to run.
 *
 * Nothing here knows what it is counting down — the resend interval is the
 * screen's constant and the sign-out timer, if one ever exists, is not this
 * module's business.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** Fast enough that the displayed second is never visibly stale. */
const TICK_MS = 500

export interface Countdown {
  /** Whole seconds left, rounded up; 0 when nothing is running. */
  readonly secondsLeft: number
  /** True while seconds remain. The one thing a disabled action should read. */
  readonly active: boolean
  /** (Re)starts the countdown. Calling it again replaces the deadline. */
  start(seconds: number): void
  /** Ends it immediately — for a flow that abandons what it was waiting on. */
  clear(): void
}

export function useCountdown(now: () => number = Date.now): Countdown {
  const [deadline, setDeadline] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  // Held in a ref so a caller passing an inline clock cannot restart the
  // interval on every render. Written in an effect, never during render.
  const clock = useRef(now)
  useEffect(() => {
    clock.current = now
  })

  useEffect(() => {
    if (deadline === null) return

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - clock.current()) / 1000))
      setSecondsLeft(left)
      if (left === 0) setDeadline(null)
    }

    tick()
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [deadline])

  const start = useCallback(
    (seconds: number) => {
      if (seconds <= 0) {
        setDeadline(null)
        setSecondsLeft(0)
        return
      }
      setSecondsLeft(seconds)
      setDeadline(clock.current() + seconds * 1000)
    },
    [],
  )

  const clear = useCallback(() => {
    setDeadline(null)
    setSecondsLeft(0)
  }, [])

  return { secondsLeft, active: secondsLeft > 0, start, clear }
}
