/**
 * SUM-01's client, in memory.
 *
 * The screen's tests are about what a debrief does with an answer — a session
 * to debrief, no session, a failed read, a refused write — so each of the
 * three calls has its own resolver and its own log. A double that only
 * returned rows could not express "the streak failed and the debrief did not",
 * which is the independence the screen is built on.
 */
import type { CompletedSession, SummaryClient } from '../data/summary'
import { ok, type Result } from '../state/errors'
import type { SessionDebrief, WorkoutSessionRow } from '../state/schemas'
import type { Streak } from '../state/streak'
import { makeSessionRow } from './factories'

/** A completed session with a duration the debrief can state. */
export function completedSession(
  overrides: Partial<WorkoutSessionRow> = {},
): CompletedSession {
  const session = makeSessionRow({
    id: 'b0000001-0000-4000-8000-000000000000',
    title: 'Lower-body strength',
    actual_duration_mins: 42,
    ...overrides,
  })

  return { session, durationMins: session.actual_duration_mins }
}

/** A three-day run ending today, as SES-01's derivation would answer it. */
export function fixtureStreak(overrides: Partial<Streak> = {}): Streak {
  return {
    days: 3,
    trainingDays: ['2026-09-24', '2026-09-23', '2026-09-22'],
    today: '2026-09-24',
    includesToday: true,
    lastTrainingDay: '2026-09-24',
    continuesBeforeOldest: false,
    ...overrides,
  }
}

export interface FakeSummaryOptions {
  readonly latest?: (userId: string) => Promise<Result<CompletedSession | null>>
  readonly streak?: (userId: string) => Promise<Result<Streak>>
  readonly saveDebrief?: (
    sessionId: string,
    debrief: SessionDebrief,
  ) => Promise<Result<CompletedSession>>
}

export interface FakeSummaryClient extends SummaryClient {
  /** Every user id `latest` was asked for, in order. */
  readonly latestCalls: string[]
  readonly streakCalls: string[]
  /** Every debrief written, with the session it was written to. */
  readonly saved: { sessionId: string; debrief: SessionDebrief }[]
}

export function createFakeSummaryClient(
  options: FakeSummaryOptions = {},
): FakeSummaryClient {
  const latestCalls: string[] = []
  const streakCalls: string[] = []
  const saved: { sessionId: string; debrief: SessionDebrief }[] = []

  return {
    latestCalls,
    streakCalls,
    saved,

    async latest(userId) {
      latestCalls.push(userId)
      return options.latest?.(userId) ?? ok(completedSession())
    },

    async streak(userId) {
      streakCalls.push(userId)
      return options.streak?.(userId) ?? ok(fixtureStreak())
    },

    async saveDebrief(sessionId, debrief) {
      saved.push({ sessionId, debrief })
      return (
        options.saveDebrief?.(sessionId, debrief) ??
        // What the database would answer: the row as it now stands.
        ok(
          completedSession({
            id: sessionId,
            mood: debrief.mood,
            session_notes: debrief.session_notes,
          }),
        )
      )
    },
  }
}
