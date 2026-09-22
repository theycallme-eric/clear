/**
 * AUTH-01 — the session context's vocabulary: what a consumer reads, and the
 * pure function that turns an auth event into it.
 *
 * It is a separate file from the provider for one reason and it is not
 * ceremony: a reducer with no React in it is the part worth testing against the
 * sequence that broke D1 — signed out → in → refresh → out, and the failed
 * restore that must not look like any of them.
 *
 * `status` has four values, and the fourth is the requirement. `error` means
 * "we do not know who this is *right now*", which is not `anonymous`. Nothing
 * downstream may route an `error` to onboarding.
 */
import { createContext, use } from 'react'

import type { AuthEvent, AuthUser } from '../data/auth'
import type { AppError, Result } from './errors'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error'

export interface AuthState {
  readonly status: AuthStatus
  readonly user: AuthUser | null
  /** Non-null exactly when `status` is `error`. */
  readonly error: AppError | null
}

export interface AuthContextValue extends AuthState {
  /** Ends the session and empties the query cache. Never throws. */
  signOut(): Promise<Result<void>>
}

/**
 * What `signOut` empties, as the one method it needs. React Query's
 * `QueryClient` satisfies it structurally, so AUTH-03 passes the real client
 * without this module depending on it.
 */
export interface QueryCache {
  clear(): void
}

export const LOADING_STATE: AuthState = { status: 'loading', user: null, error: null }
const ANONYMOUS_STATE: AuthState = { status: 'anonymous', user: null, error: null }

export const AuthContext = createContext<AuthContextValue | null>(null)

/** Pure, total, and the whole state machine. */
export function nextAuthState(previous: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'SIGNED_OUT':
      return ANONYMOUS_STATE
    case 'RESTORE_FAILED':
      // The session that could not be revalidated is still the user's. Keep
      // whoever was known and say what went wrong; never fall back to signed out.
      return { status: 'error', user: previous.user, error: event.error }
    default: {
      if (event.session === null) return ANONYMOUS_STATE
      // Same person, new token: hand back the identical `user` object so a
      // refresh cannot invalidate a query keyed by it (AUTH-03).
      const user =
        previous.user?.id === event.session.user.id ? previous.user : event.session.user
      return { status: 'authenticated', user, error: null }
    }
  }
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext)
  if (value === null) {
    throw new Error('useAuth was called outside <AuthProvider>')
  }
  return value
}
