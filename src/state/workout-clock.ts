/**
 * EXE-01 — the global session timer, and the one property it exists to keep:
 * **it is wall-clock based.**
 *
 * The defect this replaces counted its own ticks. A phone that locks, a tab
 * that is backgrounded and a browser that throttles `setInterval` to once a
 * minute all produce fewer ticks than seconds, so a counter that increments on
 * each tick drifts by exactly the time the user was away — which is the time a
 * workout timer is most often asked about.
 *
 * Here the interval is only a *repaint* signal. Every reading is
 * `now - started_at`, computed from the clock at the moment it is read, so the
 * displayed number is correct however many ticks were missed. The tab coming
 * back to the foreground is therefore not a recovery path, it is just an extra
 * opportunity to recompute: `visibilitychange`, `focus` and `pageshow` each
 * re-read the same expression the interval does, so the first paint after a
 * return is already right rather than right one second later.
 *
 * Nothing here persists anything. `started_at` is a column on the session row
 * (SES-01a), so the timer survives a refresh, a second device and a reinstall
 * without this module holding any state at all.
 */
import { useEffect, useRef, useState } from 'react'

/** Fast enough that the displayed second is never visibly stale. */
const TICK_MS = 500

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR

/**
 * Whole seconds between a timestamp and a moment, floored, never negative.
 *
 * A null start is zero rather than an error: a session that has not started
 * has not elapsed, and a screen should not have to special-case the reading.
 * A clock that disagrees with the server by a few seconds can put `startedAt`
 * in the future; clamping at zero is the honest answer, since the alternative
 * is a workout that has been running for minus four seconds.
 */
export function elapsedSeconds(startedAt: string | null, now: number): number {
  if (startedAt === null) return 0

  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return 0

  return Math.max(0, Math.floor((now - started) / 1000))
}

/**
 * `MM:SS`, or `H:MM:SS` once an hour has passed — the readout is glanceable at
 * arm's length (IA.md §4, atmosphere `operational`), and an hour-long session
 * reading `72:15` is a number the user has to do arithmetic on.
 */
export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / SECONDS_PER_HOUR)
  const minutes = Math.floor((safe % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const remainder = safe % SECONDS_PER_MINUTE

  const mm = String(minutes).padStart(2, '0')
  const ss = String(remainder).padStart(2, '0')

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/** What a screen reader hears: "12 minutes 30 seconds", never "12:30". */
export function spokenElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / SECONDS_PER_HOUR)
  const minutes = Math.floor((safe % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const remainder = safe % SECONDS_PER_MINUTE

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`)
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`)
  parts.push(`${remainder} ${remainder === 1 ? 'second' : 'seconds'}`)

  return parts.join(' ')
}

/** Whole minutes elapsed, for `complete_session`'s `actual_duration_mins`. */
export function elapsedMinutes(seconds: number): number {
  return Math.max(0, Math.floor(seconds / SECONDS_PER_MINUTE))
}

/**
 * Seconds elapsed since `startedAt`, recomputed from the clock rather than
 * accumulated. `now` is injectable so a test can move time without moving the
 * machine's clock.
 */
export function useElapsedSeconds(
  startedAt: string | null,
  now: () => number = Date.now,
): number {
  const [seconds, setSeconds] = useState(() => elapsedSeconds(startedAt, now()))

  // Held in a ref so a caller passing an inline clock cannot restart the
  // interval on every render — the same shape `useCountdown` uses.
  const clock = useRef(now)
  useEffect(() => {
    clock.current = now
  })

  useEffect(() => {
    const read = () => {
      setSeconds(elapsedSeconds(startedAt, clock.current()))
    }

    read()
    const id = setInterval(read, TICK_MS)

    // The three ways a throttled or suspended page resumes. Each one recomputes
    // the same expression the interval does — there is no catch-up arithmetic
    // to get wrong, because nothing was being accumulated in the first place.
    globalThis.addEventListener?.('visibilitychange', read)
    globalThis.addEventListener?.('focus', read)
    globalThis.addEventListener?.('pageshow', read)

    return () => {
      clearInterval(id)
      globalThis.removeEventListener?.('visibilitychange', read)
      globalThis.removeEventListener?.('focus', read)
      globalThis.removeEventListener?.('pageshow', read)
    }
  }, [startedAt])

  return seconds
}
