/**
 * AUTH-01 — the session provider. It subscribes, it reduces, it renders.
 *
 * What is *absent* here is the requirement: no `useRef` guard, no timer, no
 * lock, and no fetch of any kind. A token refresh reaches this file as one more
 * event and causes exactly one `setState`; it cannot start an application
 * request, because this file cannot make one. Profile and locations are
 * AUTH-03's queries, keyed by `user.id`, and they live outside this tree.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import type { AuthClient } from '../data/auth'
import {
  AuthContext,
  LOADING_STATE,
  nextAuthState,
  type QueryCache,
} from './auth-context'

export interface AuthProviderProps {
  readonly client: AuthClient
  /**
   * Emptied on sign-out so the next user never reads the last one's data.
   * Optional only until AUTH-03 creates the app's `QueryClient`.
   */
  readonly queryCache?: QueryCache
  readonly children: ReactNode
}

export function AuthProvider({ client, queryCache, children }: AuthProviderProps) {
  const [state, setState] = useState(LOADING_STATE)

  useEffect(() => {
    const subscription = client.onAuthStateChange((event) => {
      setState((previous) => nextAuthState(previous, event))
    })
    return () => subscription.unsubscribe()
  }, [client])

  const signOut = useCallback(async () => {
    // The cache is emptied whether or not the revocation call succeeded: the
    // session is already gone locally, so its data must be too.
    const result = await client.signOut()
    queryCache?.clear()
    return result
  }, [client, queryCache])

  return <AuthContext value={{ ...state, signOut }}>{children}</AuthContext>
}
