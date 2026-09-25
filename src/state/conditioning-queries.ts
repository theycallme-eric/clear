/**
 * OVR-03 — the conditioning history as a query, keyed by `user.id`.
 *
 * One cache entry, as `useHistoryQuery` is one: the comparison at block
 * completion and the density directive generation reads are the same read, and
 * two hooks asking separately would be two windows that can disagree about what
 * "recent" means.
 *
 * `enabled` is how a screen with no business asking declines to — the lever
 * `useActiveSessionQuery` and `useHistoryQuery` both offer. The workout shell
 * asks while a session is running; nothing else needs to yet.
 */
import { useCallback } from 'react'

import { useAuth } from './auth-context'
import { createError, err, ErrorCode, type Result } from './errors'
import { useQuery, type QueryResult } from './query'
import type { ConditioningHistoryRow } from './schemas'
import { useWorkoutClients } from './workout-queries'

export function conditioningHistoryQueryKey(userId: string): string {
  return `conditioning:${userId}`
}

export type ConditioningHistoryQuery = QueryResult<ConditioningHistoryRow[]>

/** The user's scored conditioning blocks, newest first. */
export function useConditioningHistoryQuery(enabled = true): ConditioningHistoryQuery {
  const { user } = useAuth()
  const { conditioning } = useWorkoutClients()

  const userId = enabled ? (user?.id ?? null) : null
  const key = userId === null ? null : conditioningHistoryQueryKey(userId)

  return useQuery(
    key,
    useCallback(
      () =>
        userId === null
          ? Promise.resolve(
              err(createError(ErrorCode.AUTH_UNAUTHENTICATED)) as Result<
                ConditioningHistoryRow[]
              >,
            )
          : conditioning.history(userId),
      [conditioning, userId],
    ),
  )
}

/**
 * The rows a screen can act on, and an empty list for every other state.
 *
 * Loading, error and signed-out all mean the same thing to a comparison: there
 * is no previous attempt in hand, so none is claimed. §3(a) — a false
 * comparison is worse than none — makes that the only safe reading, and it
 * keeps every caller from writing the same three-way check.
 */
export function conditioningRowsOf(query: ConditioningHistoryQuery): ConditioningHistoryRow[] {
  return query.state.status === 'ready' ? query.state.data : []
}
