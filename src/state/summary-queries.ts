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

export function streakQueryKey(userId: string): string {
  return `streak:${userId}`
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

export function useStreakQuery(): QueryResult<Streak> {
  const { user } = useAuth()
  const summary = useSummaryClient()
  const userId = user?.id ?? null

  return useQuery(
    userId === null ? null : streakQueryKey(userId),
    useCallback(
      () => (userId === null ? signedOut<Streak>() : summary.streak(userId)),
      [summary, userId],
    ),
  )
}

/**
 * The fetcher a disabled query would use if it ran. It cannot — `useQuery`
 * starts nothing for a `null` key — but the fetcher still has to be a total
 * function, and this says what the answer would be rather than asserting.
 */
function signedOut<T>(): Promise<Result<T>> {
  return Promise.resolve(err(createError(ErrorCode.AUTH_UNAUTHENTICATED)))
}
