/**
 * Shared active-time arithmetic only. Format schedules and scores stay separate.
 *
 * A3 TASK-104 (F2; TASK-006, C18, R98): Pause, Resume and Finish move the
 * attempt through the carried lifecycle helpers (`timed-lifecycle.ts`:
 * `pauseClock`, `resumeClock`, `clockStopMoment`), so Round 7's attempt and
 * every timed record the route keeps read one clock: a start stamp moved on by
 * every Resume, and a pause stamp while paused (`timedAttemptClock`). That is
 * the shape a record is written in and read back from
 * (`timedAttemptFromClock`), so a reload while paused restores the paused
 * clock with the same active time and the same time left.
 */
import { clockStopMoment, pauseClock, resumeClock, type PausableClock } from './timed-lifecycle'

export interface TimedAttempt {
  startedAt: number | null
  pausedAt: number | null
  pausedMs: number
  finishedAt: number | null
}

export const EMPTY_TIMED_ATTEMPT: TimedAttempt = {
  startedAt: null, pausedAt: null, pausedMs: 0, finishedAt: null,
}

export function activeSeconds(attempt: TimedAttempt, now: number): number {
  if (attempt.startedAt === null) return 0
  const end = attempt.finishedAt ?? attempt.pausedAt ?? now
  return Math.max(0, Math.floor((end - attempt.startedAt - attempt.pausedMs) / 1000))
}

const iso = (at: number) => new Date(at).toISOString()

function stamp(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : at
}

/**
 * The attempt as the stored clock reads it: its start moved on by every
 * completed pause, and its pause stamp while paused. Nothing for an attempt
 * that has not started.
 */
export function timedAttemptClock(attempt: TimedAttempt): PausableClock {
  if (attempt.startedAt === null) return { startedAt: null }
  return {
    startedAt: iso(attempt.startedAt + attempt.pausedMs),
    ...(attempt.pausedAt === null ? {} : { pausedAt: iso(attempt.pausedAt) }),
  }
}

/** The attempt after its clock moved: the time spent paused is what moved the start. */
function withClock(attempt: TimedAttempt, clock: PausableClock): TimedAttempt {
  const started = stamp(clock.startedAt)
  if (attempt.startedAt === null || started === null) return attempt
  return { ...attempt, pausedMs: started - attempt.startedAt, pausedAt: stamp(clock.pausedAt) }
}

/**
 * The attempt a stored clock describes: started at its (moved) start, paused
 * at its pause stamp, ended at its end stamp. An end before the start is not
 * an end; a pause belongs only to a clock that has not ended.
 */
export function timedAttemptFromClock(clock: PausableClock & { readonly finishedAt?: string | null }): TimedAttempt {
  const startedAt = stamp(clock.startedAt)
  if (startedAt === null) return EMPTY_TIMED_ATTEMPT
  const ended = stamp(clock.finishedAt)
  const finishedAt = ended !== null && ended >= startedAt ? ended : null
  const paused = finishedAt === null ? stamp(clock.pausedAt) : null
  return { ...EMPTY_TIMED_ATTEMPT, startedAt, finishedAt, pausedAt: paused !== null && paused >= startedAt ? paused : null }
}

export function moveTimedAttempt(
  attempt: TimedAttempt, action: 'start' | 'pause' | 'resume' | 'finish', now: number,
): TimedAttempt {
  if (action === 'start') return attempt.startedAt === null ? { ...EMPTY_TIMED_ATTEMPT, startedAt: now } : attempt
  if (attempt.startedAt === null || attempt.finishedAt !== null) return attempt
  const clock = timedAttemptClock(attempt)
  if (action === 'pause') return attempt.pausedAt === null ? withClock(attempt, pauseClock(clock, now)) : attempt
  if (action === 'resume') return attempt.pausedAt === null ? attempt : withClock(attempt, resumeClock(clock, now))
  // Ending a paused attempt freezes at the pause, not at the later tap.
  return { ...attempt, finishedAt: clockStopMoment(clock, now) }
}

export function timedAttemptView(attempt: TimedAttempt, now: number, cap: number | null) {
  const elapsed = activeSeconds(attempt, now)
  const capped = attempt.startedAt !== null && cap !== null && elapsed >= cap
  const phase = attempt.startedAt === null ? 'ready' : capped ? 'capped'
    : attempt.finishedAt !== null ? 'finished' : attempt.pausedAt !== null ? 'paused' : 'running'
  return {
    phase,
    elapsed: cap === null ? elapsed : Math.min(elapsed, cap),
    remaining: cap === null ? null : Math.max(0, cap - elapsed),
  } as const
}
