/**
 * HIST-01 — history as a query any screen can ask, keyed by `user.id`.
 *
 * "Queries exported from a shared module, not screen-local" is the acceptance
 * criterion this file answers on the React side: the History screen calls
 * `useHistoryQuery`, and HOME-01's recent workouts will call the same hook for
 * the same reason — one cache entry, one request, one answer about what the
 * user has done.
 *
 * **Paging is a growing window, not a merge.** Asking for more re-reads the
 * whole list one page longer rather than appending a page to a cached array.
 * The reason is the cache: `QueryClient` holds one value per key and has no
 * merge, so appending would mean a second place that knows how the list is
 * ordered — and a page appended after a session was completed elsewhere would
 * silently double a row or skip one. A window keyed by its own size is always
 * a consistent read of the same ordering, and the cost is a bounded number of
 * rows, not an unbounded one.
 *
 * As everywhere in AUTH-03, the key is the user id: a rotated token is not a
 * new user, so a refresh re-reads nothing.
 */
import { useCallback, useState } from 'react'

import { HISTORY_PAGE_SIZE, type HistoryPage } from '../data/history'
import { useAuth } from './auth-context'
import { createError, err, ErrorCode, type Result } from './errors'
import { useQuery, type QueryResult } from './query'
import { useWorkoutClients } from './workout-queries'

/**
 * How many pages a screen may ask for. Ten pages of twenty is two hundred
 * sessions — years of training — and a bound is what keeps "load more" from
 * becoming a way to ask for a table.
 */
export const HISTORY_MAX_PAGES = 10

export function historyQueryKey(userId: string, pages: number): string {
  return `history:${userId}:${pages}`
}

export interface HistoryQuery extends QueryResult<HistoryPage> {
  /** Pages currently in the window. Starts at one. */
  readonly pages: number
  /** Whether asking for more would answer anything. */
  readonly canLoadMore: boolean
  /** Widens the window by one page. A no-op when there is no more to read. */
  loadMore(): void
}

/**
 * The user's history, newest first. `enabled` is how a screen with no business
 * asking declines to — the same lever `useActiveSessionQuery` offers.
 */
export function useHistoryQuery(enabled = true): HistoryQuery {
  const { user } = useAuth()
  const { history } = useWorkoutClients()
  const [pages, setPages] = useState(1)

  const userId = enabled ? (user?.id ?? null) : null
  const key = userId === null ? null : historyQueryKey(userId, pages)

  const query = useQuery(
    key,
    useCallback(
      () =>
        userId === null
          ? signedOut<HistoryPage>()
          : history.page(userId, { limit: HISTORY_PAGE_SIZE * pages }),
      [history, pages, userId],
    ),
  )

  const hasMore = query.state.status === 'ready' && query.state.data.hasMore
  const canLoadMore = hasMore && pages < HISTORY_MAX_PAGES

  const loadMore = useCallback(() => {
    setPages((current) =>
      current < HISTORY_MAX_PAGES && hasMore ? current + 1 : current,
    )
  }, [hasMore])

  return { ...query, pages, canLoadMore, loadMore }
}

/**
 * The fetcher a disabled query would use if it ran. It cannot — `useQuery`
 * starts nothing for a `null` key — but the fetcher still has to be total.
 */
function signedOut<T>(): Promise<Result<T>> {
  return Promise.resolve(err(createError(ErrorCode.AUTH_UNAUTHENTICATED)))
}
