/**
 * TASK-006 (C18, G05; R39, R48, R66, R68, R98) — the shared Pause and Resume
 * arithmetic of a section's own clock: an EMOM's minute grid, an AMRAP's
 * window, a For Time race and a timed ladder.
 *
 * The confirmed pause semantics (owner decision, 2 November 2026, retained by
 * R98): **Pause freezes the section clock and its cap; the overall workout
 * elapsed time continues. Resume preserves the elapsed active time and the
 * remaining work window.** So nothing here touches the session's
 * `started_at`, and nothing here is a result: pausing and resuming record no
 * work (E01, DATA_MODEL §8).
 *
 * Each format keeps its own clock as one stored start stamp read against the
 * wall clock (`workout-clock.ts`'s posture). A pause is one more stamp beside
 * it, and Resume moves the start forward by exactly the time spent paused —
 * so the running reading is still `now - startedAt`, every format's existing
 * schedule, cap and score arithmetic is unchanged, and a refresh, a lock or a
 * background reads the same answer back from storage. While paused, the
 * reading is frozen at the pause.
 *
 * `pausedAt` is optional in every record: storage written before it parses
 * unchanged, and a clock that has never been paused carries no key at all.
 *
 * Nothing here imports React, touches storage, or knows what a card looks like.
 */

/** Where a timed attempt is, as its actions read it (`TimedWorkoutActions`). */
export type TimedLifecyclePhase = 'ready' | 'running' | 'paused' | 'ended'

/** The formats whose Start/Pause/Resume/Finish lifecycle is shared. */
export type TimedActionFormat = 'emom' | 'amrap' | 'for_time' | 'ladder'

/**
 * The format's primary end words (C18, R48, R68; G05: "Retain format-specific
 * Finish/Finish early wording within the shared lifecycle"). A window that
 * would otherwise keep running — an EMOM's minutes, an AMRAP's time — is ended
 * *early*; a race or a ladder is finished. A window the block does not
 * prescribe has nothing to end early, so it says Finish, as the AMRAP did.
 */
export function finishLabel(format: TimedActionFormat, hasWindow: boolean): 'Finish' | 'Finish early' {
  return (format === 'emom' || format === 'amrap') && hasWindow ? 'Finish early' : 'Finish'
}

/** The part of a format's stored clock this module reads. */
export interface PausableClock {
  /** When the section's clock was started, ISO; moved forward by every Resume. */
  readonly startedAt: string | null
  /** When the running clock was paused, ISO. Absent or null while it runs. */
  readonly pausedAt?: string | null
}

const MILLISECONDS_PER_SECOND = 1000

function parsed(stamp: string | null | undefined): number | null {
  if (stamp === null || stamp === undefined) return null
  const value = Date.parse(stamp)
  return Number.isNaN(value) ? null : value
}

/**
 * The pause stamp, when the clock is actually paused: started, and paused at a
 * readable moment no earlier than its start. Anything else is a running clock.
 */
export function pausedMoment(clock: PausableClock): number | null {
  const started = parsed(clock.startedAt)
  const paused = parsed(clock.pausedAt)
  return started === null || paused === null || paused < started ? null : paused
}

export function isClockPaused(clock: PausableClock): boolean {
  return pausedMoment(clock) !== null
}

/**
 * Whole seconds the clock had run when it was paused, or null when it is not
 * paused. The section's reading while paused: frozen, however long the pause.
 */
export function pausedElapsedSeconds(clock: PausableClock): number | null {
  const paused = pausedMoment(clock)
  const started = parsed(clock.startedAt)
  if (paused === null || started === null) return null
  return Math.floor((paused - started) / MILLISECONDS_PER_SECOND)
}

/**
 * The moment the attempt ends at when it is finished now: the pause, for a
 * paused clock — ending a paused attempt freezes it where it was paused, not at
 * the later tap — and `now` otherwise.
 */
export function clockStopMoment(clock: PausableClock, now: number): number {
  return pausedMoment(clock) ?? now
}

/** The record without its pause stamp: what a running or ended clock stores. */
export function withoutPause<T extends PausableClock>(clock: T): T {
  if (!('pausedAt' in clock)) return clock
  const { pausedAt: _pause, ...rest } = clock
  void _pause
  return rest as T
}

/**
 * Pauses a running clock. A clock that has not started, or is already paused,
 * is unchanged: there is nothing to freeze, or it is frozen already.
 */
export function pauseClock<T extends PausableClock>(clock: T, now: number): T {
  const started = parsed(clock.startedAt)
  if (started === null || isClockPaused(clock)) return clock
  return { ...clock, pausedAt: new Date(Math.max(now, started)).toISOString() }
}

/**
 * Resumes a paused clock: the start moves forward by the time spent paused, so
 * the active time and the window left are exactly what they were at the pause.
 * A clock that is not paused is unchanged.
 */
export function resumeClock<T extends PausableClock>(clock: T, now: number): T {
  const paused = pausedMoment(clock)
  const started = parsed(clock.startedAt)
  if (paused === null || started === null) return withoutPause(clock)
  const spent = Math.max(0, now - paused)
  return { ...withoutPause(clock), startedAt: new Date(started + spent).toISOString() }
}

/**
 * A restored pause stamp, repaired: kept only when the clock it belongs to is
 * started and the stamp is readable and not before the start. Anything else is
 * dropped, and the clock reads as running from its start.
 */
export function restoredPause(clock: PausableClock): { pausedAt?: string } {
  return pausedMoment(clock) === null ? {} : { pausedAt: clock.pausedAt as string }
}
