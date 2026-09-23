/**
 * AUTH-03 — the two queries as a consumer sees them.
 *
 * Everything here is about the relationship between the session and the two
 * reads, which is where D1 lived: what the key is, what a token refresh does to
 * it, what sign-out does to both, and whether either read can hold the other
 * one up.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createFakeAuthClient, fakeSession, signedInEvent } from '../test/auth-double'
import { AppProviders } from '../test/render'
import {
  createFakeUserDataClient,
  onboardedProfile,
  type FakeUserDataClient,
} from '../test/user-data-double'
import { useAuth } from './auth-context'
import { createError, ErrorCode, err, ok } from './errors'
import { QueryClient } from './query'
import {
  isOnboarded,
  locationsQueryKey,
  profileQueryKey,
  useLocationsQuery,
  useProfileQuery,
} from './user-queries'

const BOOM = createError(ErrorCode.NETWORK_SERVER_ERROR, { details: { status: 500 } })

/** Renders both queries' states side by side, plus the one action. */
function Probe() {
  const profile = useProfileQuery()
  const locations = useLocationsQuery()
  const { signOut } = useAuth()

  return (
    <div>
      <p data-testid="profile">{profile.state.status}</p>
      <p data-testid="locations">
        {locations.state.status === 'ready'
          ? `ready:${locations.state.data.length}`
          : locations.state.status}
      </p>
      <button
        type="button"
        onClick={() => {
          void signOut()
        }}
      >
        Sign out
      </button>
      <button type="button" onClick={profile.refetch}>
        Retry profile
      </button>
    </div>
  )
}

function mount(
  userData: FakeUserDataClient,
  auth = createFakeAuthClient({ settled: signedInEvent() }),
) {
  const queryClient = new QueryClient()
  render(
    <AppProviders auth={auth} userData={userData} queryClient={queryClient}>
      <Probe />
    </AppProviders>,
  )
  return { auth, queryClient, userData }
}

const profileStatus = () => screen.getByTestId('profile').textContent
const locationsStatus = () => screen.getByTestId('locations').textContent

describe('profile and locations queries', () => {
  it('keys each query by the user id', () => {
    expect(profileQueryKey('abc')).toBe('profile:abc')
    expect(locationsQueryKey('abc')).toBe('locations:abc')
    expect(profileQueryKey('abc')).not.toBe(locationsQueryKey('abc'))
  })

  it('asks for the signed-in user, once each', async () => {
    const userData = createFakeUserDataClient()
    mount(userData)

    await screen.findByText('ready:1')

    expect(userData.profileCalls).toEqual(['user-1'])
    expect(userData.locationCalls).toEqual(['user-1'])
  })

  it('asks for nothing at all with no signed-in user', async () => {
    const userData = createFakeUserDataClient()
    mount(userData, createFakeAuthClient())

    // Settled anonymous: the queries are disabled, and a disabled query reports
    // loading rather than inventing an empty answer.
    await act(async () => {})
    expect(profileStatus()).toBe('loading')
    expect(userData.profileCalls).toEqual([])
    expect(userData.locationCalls).toEqual([])
  })

  it('loads independently — a failed profile leaves locations alone', async () => {
    const userData = createFakeUserDataClient({ profile: async () => err(BOOM) })
    mount(userData)

    await screen.findByText('error')

    expect(profileStatus()).toBe('error')
    expect(locationsStatus()).toBe('ready:1')
  })

  it('loads independently — a failed locations read leaves the profile alone', async () => {
    const userData = createFakeUserDataClient({ locations: async () => err(BOOM) })
    mount(userData)

    await screen.findByText('error')

    expect(profileStatus()).toBe('ready')
    expect(locationsStatus()).toBe('error')
  })

  it('retries only the query that was retried', async () => {
    const user = userEvent.setup()
    let attempt = 0
    const userData = createFakeUserDataClient({
      profile: async () => {
        attempt += 1
        return attempt === 1 ? err(BOOM) : ok(onboardedProfile())
      },
    })
    mount(userData)
    await screen.findByText('error')

    await user.click(screen.getByRole('button', { name: 'Retry profile' }))

    await act(async () => {})
    expect(profileStatus()).toBe('ready')
    expect(userData.profileCalls).toEqual(['user-1', 'user-1'])
    // The locations read was never touched by the profile's retry.
    expect(userData.locationCalls).toEqual(['user-1'])
  })

  it('does not refetch when the token rotates, because the key is the user id', async () => {
    const userData = createFakeUserDataClient()
    const { auth } = mount(userData)
    await screen.findByText('ready:1')

    for (const accessToken of ['t2', 't3', 't4']) {
      act(() => {
        auth.emit({ type: 'TOKEN_REFRESHED', session: fakeSession({ accessToken }) })
      })
    }

    await act(async () => {})
    expect(userData.profileCalls).toEqual(['user-1'])
    expect(userData.locationCalls).toEqual(['user-1'])
  })

  it('invalidates both queries on sign-out', async () => {
    const user = userEvent.setup()
    const userData = createFakeUserDataClient()
    const { queryClient } = mount(userData)
    await screen.findByText('ready:1')

    expect(queryClient.getState(profileQueryKey('user-1')).status).toBe('ready')
    expect(queryClient.getState(locationsQueryKey('user-1')).status).toBe('ready')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    // Both, not one: the next user must not read either of these.
    expect(queryClient.getState(profileQueryKey('user-1'))).toEqual({ status: 'loading' })
    expect(queryClient.getState(locationsQueryKey('user-1'))).toEqual({ status: 'loading' })
    expect(profileStatus()).toBe('loading')
    expect(locationsStatus()).toBe('loading')
  })

  it('does not refetch the signed-out user’s data after sign-out', async () => {
    const user = userEvent.setup()
    const userData = createFakeUserDataClient()
    mount(userData)
    await screen.findByText('ready:1')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await act(async () => {})

    expect(userData.profileCalls).toEqual(['user-1'])
    expect(userData.locationCalls).toEqual(['user-1'])
  })

  it('reads the new user’s own keys when someone else signs in', async () => {
    const userData = createFakeUserDataClient()
    const { auth, queryClient } = mount(userData)
    await screen.findByText('ready:1')

    act(() => {
      auth.emit({
        type: 'SIGNED_IN',
        session: fakeSession({ user: { id: 'user-2', email: 'other@example.test' } }),
      })
    })
    await act(async () => {})

    expect(userData.profileCalls).toEqual(['user-1', 'user-2'])
    expect(queryClient.getState(profileQueryKey('user-2')).status).toBe('ready')
  })
})

describe('isOnboarded', () => {
  it('is true only for a profile that exists and finished', () => {
    expect(isOnboarded(onboardedProfile())).toBe(true)
    expect(isOnboarded(onboardedProfile({ onboarded_at: null }))).toBe(false)
    // No row is not onboarded — but it is also not an error, and only the
    // guard is allowed to act on the difference.
    expect(isOnboarded(null)).toBe(false)
  })
})
