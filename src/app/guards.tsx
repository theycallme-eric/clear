/**
 * AUTH-03 — the three route guards, and the rule that distinguishes them from
 * the thing they replace.
 *
 * IA.md §1 states the semantics: `public-only` redirects an authenticated
 * visitor away, `protected` redirects an unauthenticated one to `/welcome`, and
 * the onboarding gate keeps an authenticated-but-not-onboarded user out of the
 * rest of the app. It then names the rule that matters most, and calls it a
 * guard-level rule rather than a screen-level one: **a failed profile fetch
 * renders an error state, never the onboarding gate.** That is defect D1. A
 * profile that 500s is not a new user, and no amount of "treat missing as
 * not-onboarded" is allowed to make it look like one.
 *
 * The decision is a pure function over three inputs — which guard, what the
 * session says, and what the profile query says — so the acceptance matrix is
 * a table rather than fifteen renders (`guards.test.tsx`). `RouteGuard` renders
 * the decision and owns nothing else.
 *
 * **The onboarding placeholder.** ONB-01 is M2, so `/onboarding` does not
 * exist. Sending a user there would be a redirect to a route that answers
 * `Not Found`, so until it lands, `protected` renders `AccountSetupPending`
 * in place: the requirement's explicit instruction. `ONBOARDING_ROUTE` below is
 * the one line ONB-01 changes.
 */
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuth, type AuthStatus } from '../state/auth-context'
import { createError, ErrorCode, type AppError } from '../state/errors'
import type { QueryState } from '../state/query'
import type { Profile } from '../state/schemas'
import { isOnboarded, useLocationsQuery, useProfileQuery } from '../state/user-queries'
import { ErrorView, LoadingView } from '../ui/view-state'
import { AccountSetupPending } from './AccountSetupPending'
import { Screen } from './Screen'

/** Where a signed-in visitor to a public-only route is sent. */
export const AUTHENTICATED_HOME = '/'

/** Where a signed-out visitor to a protected route is sent. */
export const ANONYMOUS_HOME = '/welcome'

/**
 * ONB-01's route. Declared, not routed: nothing navigates here while the
 * placeholder stands, and the `onboarding` guard exists so that the screen has
 * its gate the day it is written.
 */
export const ONBOARDING_ROUTE = '/onboarding'

export type GuardKind = 'public-only' | 'protected' | 'onboarding'

export type GuardDecision =
  /** Nobody knows yet who this is, or what they have set up. */
  | { readonly kind: 'wait'; readonly label: string }
  | { readonly kind: 'redirect'; readonly to: string }
  /** A stored session that could not be revalidated, on a route that needs one. */
  | { readonly kind: 'session-error'; readonly error: AppError }
  /** The profile read failed. Retry — and never the gate. */
  | { readonly kind: 'profile-error'; readonly error: AppError }
  /** Authenticated, not onboarded, and ONB-01 does not exist yet. */
  | { readonly kind: 'setup-pending' }
  | { readonly kind: 'allow' }

export const CHECKING_SESSION = 'Checking session'
export const CHECKING_ACCOUNT = 'Checking your account'

export interface GuardSession {
  readonly status: AuthStatus
  /** Non-null exactly when `status` is `error`. */
  readonly error: AppError | null
}

/**
 * The whole guard matrix, as a total function.
 *
 * Read it as three questions asked in order, and note that the third is never
 * reached with an unknown answer: is the session settled, is there a session,
 * and only then — did the profile load, and does it say onboarding is done.
 */
export function resolveGuard(
  guard: GuardKind,
  session: GuardSession,
  profile: QueryState<Profile | null>,
): GuardDecision {
  // 1. The restore has not settled. Rendering either answer would be a guess,
  //    and showing a screen then yanking it away is the worse guess.
  if (session.status === 'loading') {
    return { kind: 'wait', label: CHECKING_SESSION }
  }

  if (guard === 'public-only') {
    // `error` is not an identity: a visitor whose stored session could not be
    // revalidated asked for the sign-in screen, so they get it. Nothing is
    // cleared on their behalf and the profile is never consulted here.
    return session.status === 'authenticated'
      ? { kind: 'redirect', to: AUTHENTICATED_HOME }
      : { kind: 'allow' }
  }

  // 2. Both remaining guards need a session, and they treat its two failure
  //    modes differently — which is the whole of D1. `anonymous` is a decision
  //    (a sign-out, or no session at all), so it redirects. `error` is an
  //    unanswered question, so it is shown as one.
  if (session.status === 'anonymous') {
    return { kind: 'redirect', to: ANONYMOUS_HOME }
  }
  if (session.status === 'error') {
    // `AuthState` promises a non-null `error` here; the fallback exists so the
    // function stays total without a cast, and so a provider that ever broke
    // that promise still produced an error screen rather than a blank one.
    return {
      kind: 'session-error',
      error: session.error ?? createError(ErrorCode.AUTH_SESSION_EXPIRED),
    }
  }

  // 3. Authenticated. What happens next is a fact about the profile, so the
  //    profile has to have loaded before anything routes on it.
  switch (profile.status) {
    case 'loading':
      return { kind: 'wait', label: CHECKING_ACCOUNT }
    case 'error':
      // The rule. Not the gate, not a redirect, not an empty profile — an
      // error the user can retry, with their identity intact.
      return { kind: 'profile-error', error: profile.error }
    case 'ready': {
      const onboarded = isOnboarded(profile.data)
      if (guard === 'onboarding') {
        // Nothing to set up: ONB-01 is strictly first-run (IA.md §6).
        return onboarded ? { kind: 'redirect', to: AUTHENTICATED_HOME } : { kind: 'allow' }
      }
      return onboarded ? { kind: 'allow' } : { kind: 'setup-pending' }
    }
  }
}

export interface RouteGuardProps {
  readonly guard: GuardKind
  /** The wrapped screen's name, so a waiting or failing guard is still a screen. */
  readonly title: string
  readonly children: ReactNode
}

export function RouteGuard({ guard, title, children }: RouteGuardProps) {
  const { status, error } = useAuth()

  // Both queries are started here, and only one of them is ever waited on.
  // That is the requirement rendered rather than described: locations are
  // warm by the time a screen wants them, a locations failure cannot keep a
  // user out of the app, and a profile failure does not cancel the locations
  // read that was already in flight beside it.
  const needsAccount = guard !== 'public-only'
  const profile = useProfileQuery(needsAccount)
  useLocationsQuery(needsAccount)

  const decision = resolveGuard(guard, { status, error }, profile.state)

  switch (decision.kind) {
    case 'wait':
      return (
        <Screen title={title}>
          <LoadingView label={decision.label} />
        </Screen>
      )
    case 'redirect':
      return <Navigate to={decision.to} replace />
    case 'session-error':
      return (
        <Screen title={title}>
          <SessionError error={decision.error} />
        </Screen>
      )
    case 'profile-error':
      return (
        <Screen title={title}>
          <ErrorView
            error={decision.error}
            title="Your account didn’t load"
            actionLabel="Try again"
            onRetry={profile.refetch}
          />
        </Screen>
      )
    case 'setup-pending':
      return <AccountSetupPending />
    case 'allow':
      return <>{children}</>
  }
}

/**
 * A session that could not be revalidated, on a route that requires one.
 *
 * The action is `Sign in again` rather than `Retry` because there is nothing
 * to retry: `auth.ts` exchanges a token when a caller asks for one, and the
 * ask that failed was the restore. Signing out is the recovery, and it is the
 * user's to take — the guard does not take it for them, because clearing a
 * session on the user's behalf because a request failed is the same mistake as
 * routing them to onboarding for it.
 */
function SessionError({ error }: { error: AppError }) {
  const { signOut } = useAuth()

  return (
    <ErrorView
      error={error}
      title="Your session couldn’t be confirmed"
      actionLabel="Sign in again"
      onRetry={() => {
        void signOut()
      }}
    />
  )
}

/** `/welcome` and `/login`: an authenticated visitor is sent Home. */
export function PublicOnly({ title, children }: Omit<RouteGuardProps, 'guard'>) {
  return (
    <RouteGuard guard="public-only" title={title}>
      {children}
    </RouteGuard>
  )
}

/** Every route in IA.md §1 marked `protected`, onboarding gate included. */
export function Protected({ title, children }: Omit<RouteGuardProps, 'guard'>) {
  return (
    <RouteGuard guard="protected" title={title}>
      {children}
    </RouteGuard>
  )
}

/** ONB-01's gate: authed, and not finished. Unrouted until that screen exists. */
export function OnboardingOnly({ title, children }: Omit<RouteGuardProps, 'guard'>) {
  return (
    <RouteGuard guard="onboarding" title={title}>
      {children}
    </RouteGuard>
  )
}
