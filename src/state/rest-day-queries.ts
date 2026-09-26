/**
 * HOME-02 — the rest-day read, cached, and the write that invalidates it.
 *
 * Keyed by `user.id` like every other query in the app, and disabled with a
 * `null` key when nobody is signed in. The marks are read once and answer two
 * questions — what the week strip draws, and which rules the streak is derived
 * under (`useStreakQuery`) — so a rest day is not read twice by two features
 * that would then be able to disagree.
 */
import { createContext, use, useCallback, useState } from 'react'

import type { RestDayClient } from '../data/rest-days'
import { useAuth } from './auth-context'
import { createError, err, ErrorCode, isErr, type Result } from './errors'
import { useQuery, type QueryResult } from './query'
import { restDayIndex, type RestDayIndex } from './rest-days'
import type { RestDayMark, RestDayRow } from './schemas'

export const RestDayContext = createContext<RestDayClient | null>(null)

export function useRestDayClient(): RestDayClient {
  const client = use(RestDayContext)
  if (client === null) {
    throw new Error('useRestDayClient was called outside <RestDayContext>')
  }
  return client
}

export function restDaysQueryKey(userId: string): string {
  return `restDays:${userId}`
}

export function useRestDaysQuery(): QueryResult<RestDayRow[]> {
  const { user } = useAuth()
  const restDays = useRestDayClient()
  const userId = user?.id ?? null

  return useQuery(
    userId === null ? null : restDaysQueryKey(userId),
    useCallback(
      () =>
        userId === null
          ? Promise.resolve(err(createError(ErrorCode.AUTH_UNAUTHENTICATED)))
          : restDays.recent(userId),
      [restDays, userId],
    ),
  )
}

/** The marks as the engine reads them, or `null` while the read is unsettled. */
export function restDayMarks(query: QueryResult<RestDayRow[]>): RestDayIndex | null {
  return query.state.status === 'ready' ? restDayIndex(query.state.data) : null
}

export interface MarkRestDay {
  /** Writes the mark, then refreshes what was derived from the old marks. */
  readonly mark: (mark: RestDayMark) => Promise<Result<RestDayRow>>
  /** True while the write is in flight — the button's own loading state. */
  readonly marking: boolean
}

/**
 * The write, and the one thing that has to happen after it: the cached marks
 * are refetched. The streak is *not* invalidated here and does not need to be —
 * `useStreakQuery` keys itself by the marks it derived under, so a new mark is a
 * new key and the stale count cannot be read back (see `summary-queries.ts`).
 */
export function useMarkRestDay(): MarkRestDay {
  const restDays = useRestDayClient()
  const query = useRestDaysQuery()
  const [marking, setMarking] = useState(false)

  const mark = useCallback(
    async (input: RestDayMark) => {
      setMarking(true)
      const result = await restDays.mark(input)
      setMarking(false)

      // A failed write changes nothing, so there is nothing to refetch: the
      // screen still shows the marks that are still true.
      if (!isErr(result)) query.refetch()

      return result
    },
    [query, restDays],
  )

  return { mark, marking }
}
