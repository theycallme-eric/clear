/**
 * FAV-01's favorites read, keyed by `user.id`, and FAV-02's progression read,
 * keyed by the favorite.
 *
 * Two cache entries rather than one for the reason the first is separate from
 * HIST-01's: a progression that failed to read costs the user the comparison on
 * one card, not their favorites list. The repeat surface is an independent read
 * of an independent question.
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
import { createError, err, ErrorCode, isErr, ok, type Result } from './errors'
import type { FavoriteRun } from './favorite-progression'
import { useQuery, type QueryResult } from './query'
import { useWorkoutClients } from './workout-queries'

export function favoritesQueryKey(userId: string): string {
  return `favorites:${userId}`
}

export function favoriteRunsQueryKey(savedWorkoutId: string): string {
  return `favorite-runs:${savedWorkoutId}`
}

/**
 * How many recent completions a progression is drawn over.
 *
 * Each one is a `session_as_performed` read, so the window is what keeps a
 * favorite with a year of history from being a year of round trips. Ten covers
 * every comparison FAV-02 draws — the bests, the last two runs, and a
 * completion list nobody scrolls past — and the true completion count is not
 * read from this window at all: `saved_workouts.times_completed` states it.
 *
 * Collapsing these reads into one function is deliberately deferred rather
 * than half-done: it is a SQL read with no other caller, and FAV-01's migration
 * already records that the previous-best and last-weight queries land with a
 * reader. This is that reader, built from the reconstruction SES-01b already
 * guarantees, so nothing here re-derives what a session performed.
 */
export const PROGRESSION_WINDOW = 10

/**
 * The completed runs of one favorite, newest first, each as what it performed.
 *
 * Two reads deep, and the depth is the point: the attempt rows say which
 * sessions belong to this favorite, and `session_as_performed` says what each
 * of those sessions actually was. An abandoned attempt is skipped here — it has
 * a row and no `completed_at`, which is favorites-v2's own definition of an
 * attempt that does not count.
 *
 * A reconstruction that fails to read fails the whole query. A progression
 * assembled out of the sessions that happened to answer would be a comparison
 * against a history with holes in it, silently — so the surface says it could
 * not read the history and offers the retry instead.
 */
export function useFavoriteRunsQuery(
  savedWorkoutId: string | null,
): QueryResult<readonly FavoriteRun[]> {
  const { favorites, sessions } = useWorkoutClients()

  return useQuery(
    savedWorkoutId === null ? null : favoriteRunsQueryKey(savedWorkoutId),
    useCallback(async () => {
      if (savedWorkoutId === null) {
        return err(createError(ErrorCode.VALIDATION_CONSTRAINT)) as Result<
          readonly FavoriteRun[]
        >
      }

      const attempts = await favorites.attempts(savedWorkoutId)
      if (isErr(attempts)) return attempts

      const completed = attempts.value
        .flatMap((row) =>
          row.completed_at === null
            ? []
            : [{ sessionId: row.session_id, completedAt: row.completed_at }],
        )
        .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
        .slice(0, PROGRESSION_WINDOW)

      const performed = await Promise.all(
        completed.map((attempt) => sessions.asPerformed(attempt.sessionId)),
      )

      const runs: FavoriteRun[] = []
      for (const [index, answer] of performed.entries()) {
        if (isErr(answer)) return answer
        runs.push({ ...completed[index], performed: answer.value })
      }

      return ok(runs)
    }, [favorites, sessions, savedWorkoutId]),
  )
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
