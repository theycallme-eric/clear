/** Shared active-time arithmetic only. Format schedules and scores stay separate. */
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

export function moveTimedAttempt(
  attempt: TimedAttempt, action: 'start' | 'pause' | 'resume' | 'finish', now: number,
): TimedAttempt {
  if (action === 'start') return attempt.startedAt === null ? { ...EMPTY_TIMED_ATTEMPT, startedAt: now } : attempt
  if (attempt.startedAt === null || attempt.finishedAt !== null) return attempt
  if (action === 'pause') return attempt.pausedAt === null ? { ...attempt, pausedAt: now } : attempt
  if (action === 'resume') return attempt.pausedAt === null ? attempt : {
    ...attempt, pausedAt: null, pausedMs: attempt.pausedMs + Math.max(0, now - attempt.pausedAt),
  }
  // Ending a paused attempt freezes at the pause, not at the later tap.
  return { ...attempt, finishedAt: attempt.pausedAt ?? now }
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
