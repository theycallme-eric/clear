/**
 * FAV-01 — the favorites read, keyed by `user.id`.
 *
 * One hook and one cache entry, beside SUM-01's two and HIST-01's one: the
 * favorites tab is an independent read, so a favorites list that failed costs
 * the user their favorites and not their history. The client itself rides on
 * the EXE-01 façade (`src/data/workout.ts`), because it needs exactly what the
 * other clients there need — the access token as it is at the moment of the
 * call — and a second context carrying a second copy of that discipline would
 * be two places to get it wrong.
 */
import { useCallback } from 'react'

import type { SavedWorkoutRow } from '../state/schemas'
import { useAuth } from './auth-context'
import { createError, err, ErrorCode, type Result } from './errors'
import { useQuery, type QueryResult } from './query'
import { useWorkoutClients } from './workout-queries'

export function favoritesQueryKey(userId: string): string {
  return `favorites:${userId}`
}

export function useFavoritesQuery(): QueryResult<readonly SavedWorkoutRow[]> {
  const { user } = useAuth()
  const { favorites } = useWorkoutClients()
  const userId = user?.id ?? null

  return useQuery(
    userId === null ? null : favoritesQueryKey(userId),
    useCallback(
      () =>
        userId === null
          ? Promise.resolve(
              err(createError(ErrorCode.AUTH_UNAUTHENTICATED)) as Result<
                readonly SavedWorkoutRow[]
              >,
            )
          : favorites.list(userId),
      [favorites, userId],
    ),
  )
}
