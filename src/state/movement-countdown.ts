/**
 * REQ-014 — a timed prescription's own countdown: a hollow-body hold of 30
 * seconds counts its 30 seconds down beside the movement, so nobody has to do
 * arithmetic against the session clock.
 *
 * It is the movement's and nobody else's. It is not the session's elapsed time
 * (`workout-clock.ts`), which counts up and has no deadline, and it is not the
 * rest between sets (`rest.ts`), which the shell holds once for the whole
 * session. Nothing here writes: the countdown running out is not proof the
 * athlete held the position, so it records no result — only Log set does.
 *
 * The reading is taken from the wall clock, as rest's is. What is banked is the
 * time left when the countdown was last started or paused, and the moment it
 * was started; a value that is decremented is a value that can be decremented
 * the wrong number of times, and a phone that sleeps mid-hold must read right
 * on the first paint after it wakes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { targetForSet, type PrescribedColumns } from './prescription'

/** Timed targets keep the same fixed/range/sequence meaning in every renderer. */
export function movementCountdownSeconds(prescription: PrescribedColumns, setNumber: number): number | null {
  if (prescription.modality !== 'time') return null
  const target = targetForSet(prescription, setNumber)
  if (target === null) return null
  if (target.kind === 'fixed') return target.value
  if (target.kind === 'range') return target.min
  return null
}

/** The final stretch, where the countdown crosses into the timer's low state. */
export const COUNTDOWN_LOW_SECONDS = 5

/** Fast enough that the displayed second is never visibly stale (EXE-01). */
const TICK_MS = 250

export type CountdownStatus = 'ready' | 'running' | 'paused' | 'finished'

export interface CountdownState {
  /** The prescribed seconds. Reset returns here. */
  readonly totalSeconds: number
  /** Milliseconds left as of `startedAt`, or as of the pause. */
  readonly bankedMs: number
  /** Epoch milliseconds the current run began; null while not running. */
  readonly startedAt: number | null
}

export function countdownReady(totalSeconds: number): CountdownState {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  return { totalSeconds: seconds, bankedMs: seconds * 1000, startedAt: null }
}

/** Milliseconds left, never negative and never more than was banked. */
export function countdownRemainingMs(state: CountdownState, now: number): number {
  if (state.startedAt === null) return state.bankedMs
  const elapsed = Math.max(0, now - state.startedAt)
  return Math.max(0, state.bankedMs - elapsed)
}

/** Whole seconds left, rounded up: `00:01` is showing until the hold is over. */
export function countdownRemainingSeconds(state: CountdownState, now: number): number {
  return Math.ceil(countdownRemainingMs(state, now) / 1000)
}

export function countdownStatus(state: CountdownState, now: number): CountdownStatus {
  const remaining = countdownRemainingMs(state, now)
  if (remaining === 0) return 'finished'
  if (state.startedAt !== null) return 'running'
  return remaining === state.totalSeconds * 1000 ? 'ready' : 'paused'
}

/** Runs from what is banked. A finished or running countdown is unchanged. */
export function startCountdown(state: CountdownState, now: number): CountdownState {
  if (state.startedAt !== null || state.bankedMs === 0) return state
  return { ...state, startedAt: now }
}

/** Banks what is left and stops the clock on it. */
export function pauseCountdown(state: CountdownState, now: number): CountdownState {
  if (state.startedAt === null) return state
  return { ...state, bankedMs: countdownRemainingMs(state, now), startedAt: null }
}

export function resetCountdown(state: CountdownState): CountdownState {
  return countdownReady(state.totalSeconds)
}

export interface MovementCountdownApi {
  readonly status: CountdownStatus
  readonly totalSeconds: number
  readonly remainingSeconds: number
  readonly start: () => void
  readonly pause: () => void
  readonly reset: () => void
}

/**
 * The countdown, held by the movement that renders it. The interval only
 * repaints; the three ways a throttled page resumes each take a fresh reading,
 * the same shape `useRestRemaining` uses.
 */
export function useMovementCountdown(
  totalSeconds: number,
  now: () => number = Date.now,
): MovementCountdownApi {
  const clock = useRef(now)
  useEffect(() => {
    clock.current = now
  })

  const [state, setState] = useState(() => countdownReady(totalSeconds))
  const [reading, setReading] = useState(() => now())

  // A countdown that has run out stops repainting; nothing it shows can change.
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

  const act = useCallback((change: (state: CountdownState, at: number) => CountdownState) => {
    const at = clock.current()
    setReading(at)
    setState((current) => change(current, at))
  }, [])

  return {
    status,
    totalSeconds: state.totalSeconds,
    remainingSeconds: countdownRemainingSeconds(state, reading),
    start: useCallback(() => act(startCountdown), [act]),
    pause: useCallback(() => act(pauseCountdown), [act]),
    reset: useCallback(() => act(resetCountdown), [act]),
  }
}
