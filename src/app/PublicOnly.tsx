/**
 * AUTH-02 — the public-only rule for the two screens that carry it.
 *
 * "Authenticated users are redirected away" is one of this requirement's
 * acceptance criteria, so it is implemented here for `/welcome` and `/login`
 * and nowhere else. AUTH-03 owns the general guard layer — protected routes,
 * the onboarding gate, and the rule that a *failed* profile fetch is an error
 * screen and never the gate. When it lands, these two screens adopt it.
 *
 * Where an authenticated visitor goes is deliberately `/`: whether they still
 * need onboarding is a profile question, and this screen does not read
 * profiles. Home's gate answers it.
 */
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuth } from '../state/auth-context'
import { LoadingView } from '../ui/view-state'
import { Screen } from './Screen'

/** Where a signed-in visitor to a public-only route is sent. */
export const AUTHENTICATED_HOME = '/'

export interface PublicOnlyProps {
  /** The wrapped screen's name, so the waiting state is still a real screen. */
  title: string
  children: ReactNode
}

export function PublicOnly({ title, children }: PublicOnlyProps) {
  const { status } = useAuth()

  if (status === 'authenticated') {
    return <Navigate to={AUTHENTICATED_HOME} replace />
  }

  // The restore has not settled, so nobody knows yet whether this visitor
  // belongs here. Showing the screen first and yanking it away is worse.
  if (status === 'loading') {
    return (
      <Screen title={title}>
        <LoadingView label="Checking session" />
      </Screen>
    )
  }

  // `error` — a stored session that could not be revalidated (D1). It is not a
  // sign-out and it is not an identity, so the visitor gets the screen they
  // asked for and may sign in again. Nothing is cleared on their behalf.
  return <>{children}</>
}
