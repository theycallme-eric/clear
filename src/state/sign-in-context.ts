/**
 * AUTH-02 — what the sign-in screen is allowed to call.
 *
 * Two clients in one context, because the pair has to be consistent: the
 * session a verified code produces must be handed to the *same* `AuthClient`
 * that `AuthProvider` subscribed to, or the app would hold a session nothing is
 * listening to. Composing them into one value makes that structural rather than
 * a thing to remember.
 *
 * `auth` is narrowed to `setSession` on purpose. A screen may hand over a
 * verified session; it may not sign anybody out, read a token, or start a
 * refresh — those belong to the provider and to AUTH-03's guards.
 *
 * No component lives here, mirroring `auth-context.ts`: the value is provided
 * by whoever composes the app (`main.tsx`, the test providers) with
 * `<SignInClientsContext value={…}>`.
 */
import { createContext, use } from 'react'

import type { AuthClient } from '../data/auth'
import type { OtpClient } from '../data/otp'

export interface SignInClients {
  /** Sends and verifies the one-time code. */
  readonly otp: OtpClient
  /** The session sink: exactly one method. */
  readonly auth: Pick<AuthClient, 'setSession'>
}

export const SignInClientsContext = createContext<SignInClients | null>(null)

export function useSignInClients(): SignInClients {
  const value = use(SignInClientsContext)
  if (value === null) {
    throw new Error('useSignInClients was called outside <SignInClientsContext>')
  }
  return value
}
