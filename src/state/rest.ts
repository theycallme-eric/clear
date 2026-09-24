/**
 * EXE-05 — the rest a prescription asks for, counted down against the wall
 * clock.
 *
 * This is `workout-clock.ts`'s posture applied to a countdown, and it is the
 * same defect being refused twice: a timer that counts its own ticks drifts by
 * exactly the time the user was away, and a rest timer is asked about precisely
 * when the phone has been in a pocket. So a rest period is two numbers — the
 * moment it started and how long it runs — and every reading is
 * `total - (now - startedAt)`, computed at the moment it is read. Backgrounding
 * is therefore not a recovery path: there is nothing accumulated to repair.
 *
 * Extending is the same fact restated rather than a second clock. `+30s` moves
 * `totalSeconds`, not `startedAt`, so a rest extended twice while the screen was
 * asleep still reads the truth when it comes back.
 *
 * Nothing here is React and nothing here persists: `rest-provider.tsx` holds the
 * one period a session can be in, and the number itself comes from the rows —
 * `workout_exercises.rest_seconds`, or `workout_blocks.round_rest_seconds` where
 * the block owns it (DATA_MODEL §6).
 */
import { createContext, use, useEffect, useRef, useState } from 'react'

import { spokenElapsed } from './workout-clock'

/** Fast enough that the displayed second is never visibly stale (EXE-01). */
const TICK_MS = 500

/** What `+time` adds, once, per press. */
export const REST_EXTENSION_SECONDS = 30

/**
 * One rest, running.
 *
 * `startedAt` is epoch milliseconds rather than a countdown value, because a
 * value that is decremented is a value that can be decremented the wrong number
 * of times. `totalSeconds` is the prescription plus every extension taken.
 */
export interface RestPeriod {
  /** The prescription whose set raised it — `workout_exercises.id`. */
  readonly exerciseId: string
  /** What the bar says the rest is after: the movement's name. */
  readonly label: string
  /** Epoch milliseconds, from the same clock every reading is taken from. */
  readonly startedAt: number
  /** The prescribed rest plus every extension. Never a remainder. */
  readonly totalSeconds: number
}

/**
 * The rest a set of this prescription is followed by, or null when it prescribes
 * none.
 *
 * Two sources, in the order the requirement names them: the movement's own
 * `rest_seconds`, and the block's `round_rest_seconds` where the block is what
 * carries the number — a superset rests once after the pair, so the members'
 * own column is silent and the block's is not (DATA-01c §5).
 *
 * Zero is null rather than a zero-length rest, for the same reason the screen
 * never says `Rest: 0s` (`superset-circuit-clarity.md` §8): no rest prescribed
 * is no bar at all, not a bar that has already finished.
 */
export function prescribedRestSeconds(
  exerciseRestSeconds: number | null,
  blockRestSeconds: number | null = null,
): number | null {
  for (const candidate of [exerciseRestSeconds, blockRestSeconds]) {
    if (candidate !== null && Number.isFinite(candidate) && candidate > 0) {
      return Math.floor(candidate)
    }
  }
  return null
}

/**
 * Whole seconds left, floored, never negative — and never more than the rest
 * runs for. A clock that disagrees with itself across a refresh can put
 * `startedAt` in the future; the honest answer there is the full rest rather
 * than a number larger than the one prescribed.
 */
export function restRemaining(rest: RestPeriod | null, now: number): number {
  if (rest === null) return 0
  return remainingFrom(rest.startedAt, rest.totalSeconds, now)
}

/** The same reading, from the two numbers it actually needs. */
function remainingFrom(startedAt: number, totalSeconds: number, now: number): number {
  const elapsed = Math.floor((now - startedAt) / 1000)
  return Math.min(totalSeconds, Math.max(0, totalSeconds - elapsed))
}

/** True once the rest has run out. A skipped rest is not complete — it is gone. */
export function isRestComplete(rest: RestPeriod | null, now: number): boolean {
  return rest !== null && restRemaining(rest, now) === 0
}

/**
 * The same rest, running longer. The start is untouched, so this is the one
 * arithmetic an extension performs: a rest extended while the tab was asleep
 * reads correctly on the first paint after it wakes.
 */
export function extendRest(
  rest: RestPeriod,
  by: number = REST_EXTENSION_SECONDS,
): RestPeriod {
  const added = Number.isFinite(by) ? Math.max(0, Math.floor(by)) : 0
  return { ...rest, totalSeconds: rest.totalSeconds + added }
}

/**
 * What a screen reader hears: "1 minute 30 seconds left", never "01:30".
 *
 * The words themselves are `workout-clock.ts`'s, so the session timer and the
 * rest bar speak one vocabulary; all this adds is which direction it is going.
 */
export function spokenRest(seconds: number): string {
  return `${spokenElapsed(seconds)} left`
}

// ─────────────────────────────────────────────────────────────────────────────
// The countdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seconds left in a rest, recomputed from the clock rather than accumulated.
 *
 * The interval is a repaint signal and nothing else, and the three ways a
 * throttled page resumes each recompute the same expression it does — so the
 * first paint after a phone unlocks is already right rather than right one
 * second later. This is `useElapsedSeconds` counting the other way, and it is
 * deliberately a second small hook rather than a generalisation of it: the two
 * answer different questions and only one of them can end.
 */
export function useRestRemaining(
  rest: RestPeriod | null,
  now: () => number = Date.now,
): number {
  const [seconds, setSeconds] = useState(() => restRemaining(rest, now()))

  // Held in a ref so a caller passing an inline clock cannot restart the
  // interval on every render — the shape `useElapsedSeconds` uses.
  const clock = useRef(now)
  useEffect(() => {
    clock.current = now
  })

  const startedAt = rest?.startedAt ?? null
  const totalSeconds = rest?.totalSeconds ?? null

  useEffect(() => {
    const read = () => {
      setSeconds(
        startedAt === null || totalSeconds === null
          ? 0
          : remainingFrom(startedAt, totalSeconds, clock.current()),
      )
    }

    read()
    const id = setInterval(read, TICK_MS)

    globalThis.addEventListener?.('visibilitychange', read)
    globalThis.addEventListener?.('focus', read)
    globalThis.addEventListener?.('pageshow', read)

    return () => {
      clearInterval(id)
      globalThis.removeEventListener?.('visibilitychange', read)
      globalThis.removeEventListener?.('focus', read)
      globalThis.removeEventListener?.('pageshow', read)
    }
  }, [startedAt, totalSeconds])

  return seconds
}

// ─────────────────────────────────────────────────────────────────────────────
// The seam the renderers use
// ─────────────────────────────────────────────────────────────────────────────

/** What a renderer asks for when a set is done and rest is prescribed. */
export interface RestRequest {
  /** The prescription the rest follows — its id, so the bar can name it. */
  readonly exerciseId: string
  readonly label: string
  /** The prescribed rest, in seconds. Never zero: see `prescribedRestSeconds`. */
  readonly seconds: number
}

export interface RestTimerApi {
  /** The rest running, or null when the user is working. */
  readonly rest: RestPeriod | null
  /** Seconds left, read from the wall clock on every tick. */
  readonly remainingSeconds: number
  /**
   * Starts (or restarts) the session's one rest. A second set logged during a
   * rest replaces it rather than queueing: the user is resting after the set
   * they just did, not after the one before it.
   */
  start(request: RestRequest): void
  /** `+time`. Moves the end, never the start. */
  extend(by?: number): void
  /** Ends the rest now. The bar goes away; nothing is recorded. */
  skip(): void
}

/**
 * The rest timer for a screen that has none.
 *
 * Unlike `useSetLogging`, `useRestTimer` does not throw outside the shell, and
 * the difference is what each one loses. A set logged outside the write path is
 * work the user performed and the app dropped; a rest raised where there is no
 * bar to show it is a coaching aid nobody sees. A renderer test about rounds, a
 * gallery specimen, a screen that composes a card for reading — none of them
 * should crash for want of chrome they never asked for.
 */
const INERT: RestTimerApi = {
  rest: null,
  remainingSeconds: 0,
  start() {},
  extend() {},
  skip() {},
}

export const RestTimerContext = createContext<RestTimerApi | null>(null)

export function useRestTimer(): RestTimerApi {
  return use(RestTimerContext) ?? INERT
}
