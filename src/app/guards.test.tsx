/**
 * AUTH-03 acceptance — the guard matrix, and the rule it exists to enforce.
 *
 * Two layers, deliberately:
 *
 *   1. **The matrix, as a table.** `resolveGuard` is total over
 *      {loading, anonymous, authenticated ± onboarded, session error} ×
 *      {public-only, protected, onboarding} × {profile loading, error, ready},
 *      so every cell is asserted rather than the handful that were convenient
 *      to render. The table below *is* the acceptance criterion, and a cell
 *      nobody thought about fails `covers every cell` rather than passing by
 *      omission.
 *   2. **The rendered consequences**, through the real route tree, for the four
 *      things that are behaviour and not a lookup: a profile 500, the
 *      placeholder that stands in for ONB-01, the redirects, and sign-out.
 *
 * The one that matters most is `a profile 500 never becomes onboarding`. D1
 * was a failed read being indistinguishable from a new user; if that line ever
 * comes back, this file is where it dies.
 */
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createError, ErrorCode, err, ok, type AppError } from '../state/errors'
import { QueryClient, type QueryState } from '../state/query'
import type { Profile } from '../state/schemas'
import {
  createFakeAuthClient,
  fakeSession,
  signedInEvent,
} from '../test/auth-double'
import { renderApp, signedIn } from '../test/render'
import {
  createFakeUserDataClient,
  notOnboardedProfile,
  onboardedProfile,
  type FakeUserDataClient,
} from '../test/user-data-double'
import {
  CHECKING_ACCOUNT,
  CHECKING_SESSION,
  resolveGuard,
  type GuardDecision,
  type GuardKind,
  type GuardSession,
} from './guards'

// ─────────────────────────────────────────────────────────────────────────────
// The matrix
// ─────────────────────────────────────────────────────────────────────────────

const PROFILE_ERROR = createError(ErrorCode.NETWORK_SERVER_ERROR, {
  details: { status: 500 },
})
const SESSION_ERROR = createError(ErrorCode.NETWORK_OFFLINE)

const SESSIONS = {
  loading: { status: 'loading', error: null },
  anonymous: { status: 'anonymous', error: null },
  authenticated: { status: 'authenticated', error: null },
  'session-error': { status: 'error', error: SESSION_ERROR },
} as const satisfies Record<string, GuardSession>

const PROFILES = {
  loading: { status: 'loading' },
  error: { status: 'error', error: PROFILE_ERROR },
  onboarded: { status: 'ready', data: onboardedProfile() },
  'not-onboarded': { status: 'ready', data: notOnboardedProfile() },
  // A user with no row at all. Not an error, and not onboarded either.
  'no-row': { status: 'ready', data: null },
} as const satisfies Record<string, QueryState<Profile | null>>

type SessionName = keyof typeof SESSIONS
type ProfileName = keyof typeof PROFILES

interface Cell {
  readonly guard: GuardKind
  readonly session: SessionName
  readonly profile: ProfileName
  readonly expected: GuardDecision
}

const WAIT_SESSION = { kind: 'wait', label: CHECKING_SESSION } as const
const WAIT_ACCOUNT = { kind: 'wait', label: CHECKING_ACCOUNT } as const
const TO_HOME = { kind: 'redirect', to: '/' } as const
const TO_WELCOME = { kind: 'redirect', to: '/welcome' } as const
const ALLOW = { kind: 'allow' } as const
const SETUP = { kind: 'setup-pending' } as const
const PROFILE_FAILED = { kind: 'profile-error', error: PROFILE_ERROR } as const
const SESSION_FAILED = { kind: 'session-error', error: SESSION_ERROR } as const

/**
 * Every combination, written out. The profile column is `loading` wherever the
 * guard cannot have reached it — a public-only route never reads a profile, and
 * neither does a route whose session has not settled — which is itself part of
 * what is being asserted.
 */
const MATRIX: readonly Cell[] = [
  // public-only — the profile is irrelevant and never consulted.
  { guard: 'public-only', session: 'loading', profile: 'loading', expected: WAIT_SESSION },
  { guard: 'public-only', session: 'anonymous', profile: 'loading', expected: ALLOW },
  { guard: 'public-only', session: 'authenticated', profile: 'loading', expected: TO_HOME },
  { guard: 'public-only', session: 'authenticated', profile: 'onboarded', expected: TO_HOME },
  { guard: 'public-only', session: 'authenticated', profile: 'not-onboarded', expected: TO_HOME },
  // A stored session that could not be revalidated is not an identity: the
  // visitor asked for the sign-in screen and gets it.
  { guard: 'public-only', session: 'session-error', profile: 'loading', expected: ALLOW },

  // protected
  { guard: 'protected', session: 'loading', profile: 'loading', expected: WAIT_SESSION },
  { guard: 'protected', session: 'anonymous', profile: 'loading', expected: TO_WELCOME },
  { guard: 'protected', session: 'session-error', profile: 'loading', expected: SESSION_FAILED },
  { guard: 'protected', session: 'session-error', profile: 'onboarded', expected: SESSION_FAILED },
  { guard: 'protected', session: 'authenticated', profile: 'loading', expected: WAIT_ACCOUNT },
  { guard: 'protected', session: 'authenticated', profile: 'error', expected: PROFILE_FAILED },
  { guard: 'protected', session: 'authenticated', profile: 'onboarded', expected: ALLOW },
  { guard: 'protected', session: 'authenticated', profile: 'not-onboarded', expected: SETUP },
  { guard: 'protected', session: 'authenticated', profile: 'no-row', expected: SETUP },

  // onboarding — ONB-01's own gate. Unrouted until M2, specified now.
  { guard: 'onboarding', session: 'loading', profile: 'loading', expected: WAIT_SESSION },
  { guard: 'onboarding', session: 'anonymous', profile: 'loading', expected: TO_WELCOME },
  { guard: 'onboarding', session: 'session-error', profile: 'loading', expected: SESSION_FAILED },
  { guard: 'onboarding', session: 'authenticated', profile: 'loading', expected: WAIT_ACCOUNT },
  { guard: 'onboarding', session: 'authenticated', profile: 'error', expected: PROFILE_FAILED },
  { guard: 'onboarding', session: 'authenticated', profile: 'onboarded', expected: TO_HOME },
  { guard: 'onboarding', session: 'authenticated', profile: 'not-onboarded', expected: ALLOW },
  { guard: 'onboarding', session: 'authenticated', profile: 'no-row', expected: ALLOW },
]

describe('AUTH-03 guard matrix', () => {
  it.each(MATRIX)(
    '$guard · session=$session · profile=$profile → $expected.kind',
    ({ guard, session, profile, expected }) => {
      expect(resolveGuard(guard, SESSIONS[session], PROFILES[profile])).toEqual(expected)
    },
  )

  it('covers every cell that can be reached', () => {
    const reachable: string[] = []
    for (const guard of ['public-only', 'protected', 'onboarding'] as const) {
      for (const session of Object.keys(SESSIONS) as SessionName[]) {
        for (const profile of Object.keys(PROFILES) as ProfileName[]) {
          // A guard only reads the profile once it has an authenticated
          // session, so the other rows collapse onto their `loading` cell —
          // asserted below rather than assumed.
          const reads = session === 'authenticated' && guard !== 'public-only'
          if (!reads && profile !== 'loading') continue
          reachable.push(`${guard}/${session}/${profile}`)
        }
      }
    }

    const asserted = MATRIX.map((cell) => `${cell.guard}/${cell.session}/${cell.profile}`)
    expect([...new Set(asserted)].sort()).toEqual(
      expect.arrayContaining(reachable.sort()),
    )
    expect(asserted).toHaveLength(new Set(asserted).size)
  })

  it('ignores the profile entirely on every route that has no session to read it with', () => {
    for (const guard of ['public-only', 'protected', 'onboarding'] as const) {
      for (const session of ['loading', 'anonymous', 'session-error'] as const) {
        const answers = (Object.keys(PROFILES) as ProfileName[]).map((profile) =>
          resolveGuard(guard, SESSIONS[session], PROFILES[profile]),
        )
        // Same answer for every profile state: the profile did not participate.
        for (const answer of answers) expect(answer).toEqual(answers[0])
      }
    }
    // And a public-only route ignores it even when there *is* a session.
    const withProfile = (Object.keys(PROFILES) as ProfileName[]).map((profile) =>
      resolveGuard('public-only', SESSIONS.authenticated, PROFILES[profile]),
    )
    for (const answer of withProfile) expect(answer).toEqual(TO_HOME)
  })

  it('never answers a failed profile with the onboarding gate — D1', () => {
    for (const guard of ['protected', 'onboarding'] as const) {
      const decision = resolveGuard(guard, SESSIONS.authenticated, PROFILES.error)

      expect(decision.kind).toBe('profile-error')
      expect(decision).not.toEqual(SETUP)
      expect(decision).not.toEqual(TO_HOME)
      expect(decision).not.toEqual(TO_WELCOME)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rendered
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A signed-in visitor with an *empty* cache, so the render really runs both
 * queries. The default harness warms them, which is right for a test about a
 * screen and wrong for every test below, which is about the loading, error and
 * gate states on the way to one.
 */
function coldProviders(userData: FakeUserDataClient) {
  return signedIn({ userData, queryClient: new QueryClient() })
}

describe('AUTH-03 guards, rendered', () => {
  it('sends a signed-out visitor from a protected route to Welcome', async () => {
    renderApp(['/'])

    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Workout generation is being rebuilt.')).toBeNull()
  })

  it('waits for the session rather than guessing which screen to show', () => {
    renderApp(['/'], { auth: createFakeAuthClient({ settled: null }) })

    const waiting = within(screen.getByRole('main')).getByRole('status')
    expect(waiting).toHaveAttribute('aria-busy', 'true')
    expect(waiting).toHaveTextContent(CHECKING_SESSION)
  })

  it('waits for the profile before deciding anything about onboarding', async () => {
    // A profile read that never settles: the guard has a session and no answer,
    // which is exactly when guessing would be tempting.
    const userData = createFakeUserDataClient({ profile: () => new Promise(() => {}) })
    renderApp(['/'], coldProviders(userData))

    const waiting = await within(screen.getByRole('main')).findByRole('status')
    expect(waiting).toHaveTextContent(CHECKING_ACCOUNT)
    expect(screen.queryByText(/isn’t built yet/)).toBeNull()
  })

  it('renders a retryable error for a profile 500, and never routes to onboarding', async () => {
    const user = userEvent.setup()
    let attempt = 0
    const userData = createFakeUserDataClient({
      profile: async () => {
        attempt += 1
        return attempt === 1
          ? err(createError(ErrorCode.NETWORK_SERVER_ERROR, { details: { status: 500 } }))
          : ok(onboardedProfile())
      },
    })

    renderApp(['/'], coldProviders(userData))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Your account didn’t load')).toBeInTheDocument()
    // The screen the user must never see instead of this one.
    expect(screen.queryByText(/isn’t built yet/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByText('Workout generation is being rebuilt.'),
    ).toBeInTheDocument()
    expect(userData.profileCalls).toEqual(['user-1', 'user-1'])
  })

  it('shows the ONB-01 placeholder — not a redirect — to a user who has not onboarded', async () => {
    const userData = createFakeUserDataClient({
      profile: async () => ok(notOnboardedProfile()),
    })

    renderApp(['/'], coldProviders(userData))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Account setup' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Account setup isn’t built yet')).toBeInTheDocument()
    // The redirect the requirement forbids would have landed here instead.
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
  })

  it('offers sign-out from the placeholder, and the guard takes it from there', async () => {
    const user = userEvent.setup()
    const auth = createFakeAuthClient({ settled: signedInEvent() })
    const userData = createFakeUserDataClient({
      profile: async () => ok(notOnboardedProfile()),
    })

    renderApp(['/'], { auth, userData, queryClient: new QueryClient() })

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    // No navigation of its own: the session went anonymous and the protected
    // guard above it resolved to `/welcome`.
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument()
  })

  it('shows a session that could not be revalidated as an error, not as a sign-out', async () => {
    const restoreFailed: AppError = createError(ErrorCode.NETWORK_OFFLINE)
    renderApp(['/'], {
      auth: createFakeAuthClient({
        settled: { type: 'RESTORE_FAILED', error: restoreFailed },
      }),
    })

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Your session couldn’t be confirmed')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Sign in again' })).toBeInTheDocument()
    // Not silently bounced to Welcome, and not shown the app either.
    expect(screen.queryByText('Workout generation is being rebuilt.')).toBeNull()
  })

  it('keeps an authenticated visitor off the public-only routes', async () => {
    renderApp(['/login'], signedIn())

    await waitFor(() => {
      expect(screen.queryByLabelText(/email/i)).toBeNull()
    })
    expect(screen.getByText('Workout generation is being rebuilt.')).toBeInTheDocument()
  })

  it('never reads the profile for a visitor on a public-only route', async () => {
    const userData = createFakeUserDataClient()
    renderApp(['/welcome'], { userData, queryClient: new QueryClient() })

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(userData.profileCalls).toEqual([])
    expect(userData.locationCalls).toEqual([])
  })

  it('starts the locations read beside the profile, and is not held up by it', async () => {
    const userData = createFakeUserDataClient({
      locations: async () =>
        err(createError(ErrorCode.NETWORK_SERVER_ERROR, { details: { status: 500 } })),
    })

    renderApp(['/'], coldProviders(userData))

    // Locations failed; the profile is what the gate reads, so the user is in.
    expect(
      await screen.findByText('Workout generation is being rebuilt.'),
    ).toBeInTheDocument()
    expect(userData.locationCalls).toEqual(['user-1'])
  })

  it('does not re-read anything when the token rotates', async () => {
    const auth = createFakeAuthClient({ settled: signedInEvent() })
    const userData = createFakeUserDataClient()

    renderApp(['/'], { auth, userData, queryClient: new QueryClient() })
    await screen.findByText('Workout generation is being rebuilt.')

    // Same user, new access token — four times, as a refresh loop would.
    // `act` so each one is really flushed: an emit that changed nothing would
    // make this test pass for the wrong reason.
    for (const token of ['t2', 't3', 't4', 't5']) {
      act(() => {
        auth.emit({
          type: 'TOKEN_REFRESHED',
          session: fakeSession({ accessToken: token }),
        })
      })
    }

    await waitFor(() => {
      expect(screen.getByText('Workout generation is being rebuilt.')).toBeInTheDocument()
    })
    expect(userData.profileCalls).toEqual(['user-1'])
    expect(userData.locationCalls).toEqual(['user-1'])
  })
})
