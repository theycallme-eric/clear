/**
 * DATA-05's read, as a query the app can ask — the fourth of REQ-057's boot
 * checks, and the first time anything in `src/` reaches this table from React.
 *
 * Keyed by `user.id` like every other query in AUTH-03: a rotated token is not
 * a new user, so a refresh re-reads nothing, and sign-out empties it with the
 * rest of the cache.
 *
 * `listInForce` is asked with no session, which is the set that applies before
 * one exists — persistent constraints. A session-scoped read is the generation
 * request's, and it names its session.
 */
import { createContext, use, useCallback } from 'react'

import type { UserConstraint, UserConstraintsClient } from '../data/constraints'
import { useAuth } from './auth-context'
import { createError, err, ErrorCode, type Result } from './errors'
import { useQuery, type QueryResult } from './query'

export const UserConstraintsContext = createContext<UserConstraintsClient | null>(null)

export function useUserConstraints(): UserConstraintsClient {
  const client = use(UserConstraintsContext)
  if (client === null) {
    throw new Error('useUserConstraints was called outside <UserConstraintsContext>')
  }
  return client
}

export function constraintsQueryKey(userId: string): string {
  return `constraints:${userId}`
}

/** The constraints in force for this user, before any session exists. */
export function useConstraintsQuery(enabled = true): QueryResult<UserConstraint[]> {
  const { user } = useAuth()
  const constraints = useUserConstraints()
  const userId = enabled ? (user?.id ?? null) : null

  return useQuery(
    userId === null ? null : constraintsQueryKey(userId),
    useCallback(
      () =>
        userId === null
          ? signedOut<UserConstraint[]>()
          : constraints.listInForce(userId),
      [constraints, userId],
    ),
  )
}

/**
 * The fetcher a disabled query would use if it ran. It cannot — `useQuery`
 * starts nothing for a `null` key — but the fetcher still has to be total.
 */
function signedOut<T>(): Promise<Result<T>> {
  return Promise.resolve(err(createError(ErrorCode.AUTH_UNAUTHENTICATED)))
}
