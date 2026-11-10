/**
 * TASK-022 (REQ-022; C49, AC-R022-02; G06, G14; R14, R15) — the separate
 * preparation clock a Warm-up or Cooldown guide offers.
 *
 * It is a fifth functional clock beside the session's elapsed time, a
 * movement's own countdown, the session's one rest and each format's clock,
 * and it is kept distinct from all four (C21, G06): starting, pausing or
 * extending it touches no other clock, and none of theirs touches it.
 *
 *   · **Its arithmetic is the countdown's.** What is banked is the time left
 *     when it was last started or paused, and the moment it started — the
 *     wall-clock posture `movement-countdown.ts` already owns, so a phone that
 *     sleeps through a warm-up reads right on the first paint after it wakes.
 *     This module reuses those pure functions rather than restating them.
 *   · **Its controls are Start, Pause and Add 30s (R15).** Start runs it from
 *     what is banked; Pause banks what is left; Add 30s adds the rest timer's
 *     own extension (`REST_EXTENSION_SECONDS`) to what is left, running or not.
 *     A clock that has run out takes the 30 seconds as time to start again.
 *     There is no Dismiss and no other way to hide it (R14).
 *   · **Its length is the guide's own approximate time.** The consumer passes
 *     the guide's `approximateMinutes` (TASK-034), never a fixed four minutes.
 *   · **It records nothing.** Running out is not proof anyone warmed up: no
 *     set, block result or session field is written, and nothing persists. A
 *     reload loses the countdown and nothing the session recorded, as with
 *     the rest (`rest-provider.tsx`).
 *
 * The shell holds every preparation clock of the session in one store
 * (`PreparationClockProvider`), keyed by its section, so moving to another
 * section and back finds the same clock — running, paused or finished —
 * rather than a new one. Without a provider (a gallery specimen), the clock is
 * the component's own.
 */
import { createContext, use, useCallback, useEffect, useRef, useState } from 'react'

import {
  countdownReady,
  countdownRemainingMs,
  countdownRemainingSeconds,
  countdownStatus,
  pauseCountdown,
  startCountdown,
  type CountdownState,
  type CountdownStatus,
} from './movement-countdown'
import { REST_EXTENSION_SECONDS } from './rest'

/** Fast enough that the displayed second is never visibly stale (EXE-01). */
const TICK_MS = 250

export type PreparationClockStatus = CountdownStatus

/** A preparation clock, ready, on the guide's approximate time. */
export function preparationClockReady(minutes: number): CountdownState {
  const whole = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0
  return countdownReady(whole * 60)
}

export const startPreparation = startCountdown
export const pausePreparation = pauseCountdown

/**
 * Add 30s: the rest timer's own extension, added to what is left. A running
 * clock keeps running from a fresh bank; a ready or paused one holds the
 * longer reading; a finished one holds the 30 seconds, ready to start again.
 * The total grows by the same amount, so the fill and the ready reading stay
 * truthful.
 */
export function extendPreparation(
  state: CountdownState,
  now: number,
  by: number = REST_EXTENSION_SECONDS,
): CountdownState {
  const added = Number.isFinite(by) ? Math.max(0, Math.floor(by)) : 0
  if (added === 0) return state
  const left = countdownRemainingMs(state, now)
  const running = state.startedAt !== null && left > 0
  return {
    totalSeconds: state.totalSeconds + added,
    bankedMs: left + added * 1000,
    startedAt: running ? now : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The session's store
// ─────────────────────────────────────────────────────────────────────────────

export interface PreparationClockStore {
  /** Every preparation clock touched this session, by its key. */
  readonly clocks: ReadonlyMap<string, CountdownState>
  /** Applies a change to one clock, starting from `initial` when it is new. */
  readonly update: (
    key: string,
    initial: CountdownState,
    change: (state: CountdownState) => CountdownState,
  ) => void
}

export const PreparationClockContext = createContext<PreparationClockStore | null>(null)

export interface PreparationClockApi {
  readonly status: PreparationClockStatus
  readonly totalSeconds: number
  readonly remainingSeconds: number
  readonly start: () => void
  readonly pause: () => void
  /** Add 30s. */
  readonly extend: () => void
}

/**
 * One preparation clock: the session's when the shell provides the store, the
 * component's own otherwise. The interval only repaints; the three ways a
 * throttled page resumes each take a fresh reading.
 */
export function usePreparationClock(
  key: string,
  minutes: number,
  now: () => number = Date.now,
): PreparationClockApi {
  const store = use(PreparationClockContext)
  const clock = useRef(now)
  useEffect(() => {
    clock.current = now
  })

  const initial = preparationClockReady(minutes)
  const [own, setOwn] = useState<CountdownState | null>(null)
  const state = (store === null ? own : store.clocks.get(key)) ?? initial

  const [reading, setReading] = useState(() => now())
  const status = countdownStatus(state, reading)
  const running = status === 'running'
  useEffect(() => {
    if (!running) return
    const read = () => setReading(clock.current())

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
  }, [running])

  const update = store?.update
  const act = useCallback(
    (change: (state: CountdownState, at: number) => CountdownState) => {
      const at = clock.current()
      setReading(at)
      const ready = preparationClockReady(minutes)
      if (update === undefined) setOwn((current) => change(current ?? ready, at))
      else update(key, ready, (current) => change(current, at))
    },
    [key, minutes, update],
  )

  return {
    status,
    totalSeconds: state.totalSeconds,
    remainingSeconds: countdownRemainingSeconds(state, reading),
    start: useCallback(() => act(startPreparation), [act]),
    pause: useCallback(() => act(pausePreparation), [act]),
    extend: useCallback(() => act((state, at) => extendPreparation(state, at)), [act]),
  }
}
