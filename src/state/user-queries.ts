/**
 * AUTH-03 — the profile and locations queries, keyed by `user.id`.
 *
 * Two hooks, two keys, two cache entries, and deliberately no third hook that
 * returns both. Anything that combined them would have to decide what a
 * half-loaded pair means, and the requirement's answer is that there is no
 * pair: each is independent, and one failing leaves the other exactly as it
 * was.
 *
 * **Why the key is the user id and nothing else.** `nextAuthState` hands back
 * the identical `user` object when a token refresh brings the same id, so the
 * key these hooks build is character-for-character the same string across a
 * refresh, and `QueryClient.ensure` refuses the second fetch. The defect this
 * replaces keyed its fetching off the session — which changes on every refresh
 * — and re-read everything each time a token rotated.
 *
 * With no signed-in user the key is `null`: the query is disabled, reports
 * `loading`, and asks for nothing. Signing out therefore stops these queries by
 * construction, on top of the cache `signOut` clears.
 */
import { createContext, use, useCallback } from 'react'

import type { UserDataClient } from '../data/user-data'
import { useAuth } from './auth-context'
import { createError, err, ErrorCode, type Result } from './errors'
import { useQuery, type QueryResult } from './query'
import type { Location, Profile } from './schemas'

export const UserDataContext = createContext<UserDataClient | null>(null)

export function useUserData(): UserDataClient {
  const client = use(UserDataContext)
  if (client === null) {
    throw new Error('useUserData was called outside <UserDataContext>')
  }
  return client
}

export function profileQueryKey(userId: string): string {
  return `profile:${userId}`
}

export function locationsQueryKey(userId: string): string {
  return `locations:${userId}`
}

/**
 * `enabled` is how a guard that has no business reading this data declines to.
 * The public-only guard passes `false`: a visitor on their way off `/login`
 * is authenticated for one render, and firing two requests they will never
 * see is a request too many.
 */
export function useProfileQuery(enabled = true): QueryResult<Profile | null> {
  const { user } = useAuth()
  const userData = useUserData()
  const userId = enabled ? (user?.id ?? null) : null

  return useQuery(
    userId === null ? null : profileQueryKey(userId),
    // `userId` is the identity that matters; `userData` is built once per app,
    // so this stays the same function across a token refresh and the cached
    // entry is never invalidated by one.
    useCallback(
      () => (userId === null ? signedOut<Profile | null>() : userData.profile(userId)),
      [userData, userId],
    ),
  )
}

export function useLocationsQuery(enabled = true): QueryResult<Location[]> {
  const { user } = useAuth()
  const userData = useUserData()
  const userId = enabled ? (user?.id ?? null) : null

  return useQuery(
    userId === null ? null : locationsQueryKey(userId),
    useCallback(
      () => (userId === null ? signedOut<Location[]>() : userData.locations(userId)),
      [userData, userId],
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

/** True only for a profile that exists *and* finished onboarding. */
export function isOnboarded(profile: Profile | null): boolean {
  return profile !== null && profile.onboarded_at !== null
}
