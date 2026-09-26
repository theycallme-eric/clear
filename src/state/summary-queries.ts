/**
 * SUM-01 — the debrief's two queries, keyed by `user.id`.
 *
 * Two hooks and two cache entries, for the same reason AUTH-03 has two: the
 * session and the streak are independent reads, and a streak that fails must
 * not take the debrief down with it. The screen renders each one's own state.
 *
 * With no signed-in user both keys are `null`: the query is disabled, reports
 * `loading` and asks for nothing. The route's `Protected` guard is what
 * normally settles that question before this screen mounts.
 */
import { createContext, use, useCallback } from 'react'

import type { CompletedSession, SummaryClient } from '../data/summary'
import { useAuth } from './auth-context'
import { createError, err, ErrorCode, type Result } from './errors'
import { useQuery, type QueryResult } from './query'
import { restDayMarks, useRestDaysQuery } from './rest-day-queries'
import { restDayStreakPolicy, type RestDayIndex } from './rest-days'
import type { Streak } from './streak'

export const SummaryContext = createContext<SummaryClient | null>(null)

export function useSummaryClient(): SummaryClient {
  const client = use(SummaryContext)
  if (client === null) {
    throw new Error('useSummaryClient was called outside <SummaryContext>')
  }
  return client
}

/**
 * The session being debriefed. Keyed by the user rather than by the session,
 * because the question the screen asks is "which session am I debriefing" and
 * its answer is a fact about the user — a second entry per session id would be
 * a cache of sessions, which is HIST-01's job and not this one's.
 */
export function completedSessionQueryKey(userId: string): string {
  return `summary:latest:${userId}`
}

/**
 * The streak, keyed by the user *and* by the rules it was derived under.
 *
 * HOME-02's marks are part of the answer, so they are part of the key: marking a
 * rest day produces a different key, which cannot serve the count that was
 * derived before the mark existed. The alternative — one key, invalidated after
 * the write — has an ordering to get right every time, and gets it wrong the
 * first time the two refetches race.
 */
export function streakQueryKey(userId: string, rules = ''): string {
  return rules === '' ? `streak:${userId}` : `streak:${userId}:${rules}`
}

export function useCompletedSessionQuery(): QueryResult<CompletedSession | null> {
  const { user } = useAuth()
  const summary = useSummaryClient()
  const userId = user?.id ?? null

  return useQuery(
    userId === null ? null : completedSessionQueryKey(userId),
    useCallback(
      () =>
        userId === null
          ? signedOut<CompletedSession | null>()
          : summary.latest(userId),
      [summary, userId],
    ),
  )
}

/**
 * The streak, under HOME-02's full rules.
 *
 * The rest-day marks are read here rather than by the screen, so every caller —
 * Home and the debrief — derives the same number from the same rows under the
 * same policy. There is still one derivation (`deriveStreak`) and one place the
 * rules live (`src/state/rest-days.ts`); this hook only carries the second
 * argument to them.
 *
 * Until the marks are in, the streak reports `loading`: a count derived without
 * them would be a *different* count, briefly displayed and then replaced, which
 * is the streak flickering down and back up on every visit to Home. A failed
 * read of the marks is the streak's error, for the same reason — the rules are
 * not optional, so a streak derived without them is not a fallback.
 */
export function useStreakQuery(): QueryResult<Streak> {
  const { user } = useAuth()
  const summary = useSummaryClient()
  const userId = user?.id ?? null

  const restDays = useRestDaysQuery()
  const marks = restDayMarks(restDays)

  const streak = useQuery(
    userId === null || marks === null
      ? null
      : streakQueryKey(userId, restDayRulesKey(marks)),
    useCallback(
      () =>
        userId === null || marks === null
          ? signedOut<Streak>()
          : summary.streak(userId, { policy: restDayStreakPolicy(marks) }),
      [marks, summary, userId],
    ),
  )

  const refetch = useCallback(() => {
    restDays.refetch()
    streak.refetch()
  }, [restDays, streak])

  return restDays.state.status === 'error'
    ? { state: restDays.state, refetch }
    : { state: streak.state, refetch }
}

/**
 * A short, stable name for one set of marks. FNV-1a over the marks in a fixed
 * order: not a security primitive and not trying to be — it has to be the same
 * string for the same marks and a different one for different marks, and a key
 * carrying four years of dates verbatim would do that too, at 3KB a read.
 */
function restDayRulesKey(marks: RestDayIndex): string {
  let hash = 0x811c9dc5
  for (const entry of [...marks].sort(([a], [b]) => a.localeCompare(b))) {
    for (const character of `${entry[0]}:${entry[1]};`) {
      hash ^= character.charCodeAt(0)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
  }

  return `${marks.size}-${hash.toString(16).padStart(8, '0')}`
}

/**
 * The fetcher a disabled query would use if it ran. It cannot — `useQuery`
 * starts nothing for a `null` key — but the fetcher still has to be a total
 * function, and this says what the answer would be rather than asserting.
 */
function signedOut<T>(): Promise<Result<T>> {
  return Promise.resolve(err(createError(ErrorCode.AUTH_UNAUTHENTICATED)))
}
