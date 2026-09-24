/**
 * REQ-057 acceptance, rendered: the boot sequence over real init.
 *
 * Two behaviours are the criteria, and both are about *when* rather than what:
 * the app appears the moment the reads answer — nothing is waited on
 * afterwards — and a failed read is a named failure with one retry that runs
 * the read again rather than a dead end.
 *
 * Every test here mounts `BootGate` over a **cold** cache, because a warm one
 * is a booted app: the four checks are the app's own queries, so a cache that
 * already holds them is exactly the returning user pattern 7 says must not be
 * shown the sequence twice.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { UserConstraint } from '../data/constraints'
import { constraintsQueryKey } from '../state/constraint-queries'
import { err, ok, type Result } from '../state/errors'
import { historyQueryKey } from '../state/history-queries'
import { QueryClient } from '../state/query'
import type { Location } from '../state/schemas'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { createFakeAuthClient } from '../test/auth-double'
import { createFakeConstraintsClient } from '../test/constraints-double'
import { makeAppError, makeSessionRow } from '../test/factories'
import { renderWithProviders, signedIn } from '../test/render'
import {
  createFakeUserDataClient,
  FIXTURE_USER_ID,
  fixtureLocation,
  onboardedProfile,
} from '../test/user-data-double'
import { createWorkoutDouble } from '../test/workout-double'
import { BootGate } from './BootSequence'

const APP = 'The app, booted'

/** A history client that answers one page, so the row can be asserted on. */
function historyOf(count: number) {
  return createWorkoutDouble({
    session: null,
    history: {
      page: async () =>
        ok({
          sessions: Array.from({ length: count }, (_, index) =>
            makeSessionRow({ id: `session-${String(index)}` }),
          ),
          hasMore: false,
        }),
    },
  }).clients
}

function bootProviders(overrides: Parameters<typeof signedIn>[0] = {}) {
  return signedIn({
    // Cold: the boot screen is what a first load actually shows.
    queryClient: new QueryClient(),
    workout: historyOf(2),
    ...overrides,
  })
}

function renderBoot(providers = bootProviders()) {
  return renderWithProviders(
    <BootGate>
      <p>{APP}</p>
    </BootGate>,
    providers,
  )
}

describe('REQ-057 · auto-continue on real completion', () => {
  it('shows the system check while the real reads are in flight, then the app', async () => {
    renderBoot()

    expect(screen.getByRole('status')).toHaveTextContent('System check')
    expect(screen.queryByText(APP)).not.toBeInTheDocument()

    // Nothing is clicked, no clock is advanced, and no animation ends: the app
    // arrives because the work did.
    expect(await screen.findByText(APP)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('offers nothing to press — a ready app is never behind a keypress', async () => {
    renderBoot()

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    await screen.findByText(APP)
  })

  it('logs each check as its own read answers, naming what actually arrived', async () => {
    const userData = createFakeUserDataClient({
      locations: async () => ok([fixtureLocation({ name: 'Garage' })]),
    })
    // One read still outstanding, so the log can be read at all: when every
    // check answers together there is no intermediate frame, which is the
    // requirement working rather than a test that needs a pause.
    const constraints = createFakeConstraintsClient({
      listInForce: () => new Promise<Result<UserConstraint[]>>(() => {}),
    })

    renderBoot(bootProviders({ userData, constraints }))

    // The rows are ScanLoader's decorative boot log — present in the DOM,
    // aria-hidden, and never announced line by line.
    await waitFor(() => {
      expect(screen.getByText('Equipment · Garage')).toBeInTheDocument()
    })
    expect(screen.getByText('Profile · loaded')).toBeInTheDocument()
    expect(screen.getByText('Session history · 2 entries')).toBeInTheDocument()
    expect(screen.queryByText(/^Constraints/)).not.toBeInTheDocument()

    // Progress is real — three of the four reads have answered — so it is
    // shown as a value rather than as an indeterminate sweep.
    const progress = screen.getByRole('progressbar')
    expect(progress).toHaveAttribute('aria-valuenow', '3')
    expect(progress).toHaveAttribute('aria-valuemax', '4')
    expect(screen.queryByText(APP)).not.toBeInTheDocument()
  })

  it('initializes nothing for a visitor with no session, and never holds the router', () => {
    renderWithProviders(
      <BootGate>
        <p>{APP}</p>
      </BootGate>,
      { queryClient: new QueryClient(), auth: createFakeAuthClient() },
    )

    expect(screen.getByText(APP)).toBeInTheDocument()
  })

  it('boots a user who has no history, no equipment and no constraints yet', async () => {
    const userData = createFakeUserDataClient({
      profile: async () => ok(null),
      locations: async () => ok([]),
    })

    renderBoot(bootProviders({ userData, workout: historyOf(0) }))

    expect(await screen.findByText(APP)).toBeInTheDocument()
  })
})

describe('REQ-057 · a failed check retries', () => {
  it('names what could not be read, promises the data is intact, and retries it', async () => {
    let attempt = 0
    const workout = createWorkoutDouble({
      session: null,
      history: {
        page: async () => {
          attempt += 1
          return attempt === 1
            ? err(makeAppError())
            : ok({ sessions: [makeSessionRow()], hasMore: false })
        },
      },
    }).clients

    renderBoot(bootProviders({ workout }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('System check failed')
    expect(alert).toHaveTextContent('Could not read session history.')
    expect(alert).toHaveTextContent('Your data is intact.')
    expect(screen.queryByText(APP)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    // The retry ran the read that failed, and boot continued on its own.
    expect(await screen.findByText(APP)).toBeInTheDocument()
    expect(attempt).toBe(2)
  })

  it('does not re-read the checks that succeeded', async () => {
    const userData = createFakeUserDataClient({
      profile: async () => ok(onboardedProfile()),
    })
    let attempt = 0
    const constraints = createFakeConstraintsClient({
      listInForce: async () => {
        attempt += 1
        return attempt === 1 ? err(makeAppError()) : ok([])
      },
    })

    renderBoot(bootProviders({ userData, constraints }))

    await screen.findByRole('alert')
    expect(userData.profileCalls).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText(APP)).toBeInTheDocument()
    expect(userData.profileCalls).toHaveLength(1)
  })

  it('reports a failure rather than progress while other checks are still running', async () => {
    const userData = createFakeUserDataClient({
      profile: async () => err(makeAppError()),
      // Never answers: the boot screen must not wait for it to say what it
      // already knows.
      locations: () => new Promise<Result<Location[]>>(() => {}),
    })

    renderBoot(bootProviders({ userData }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not read your profile.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('REQ-057 · the sequence is the brand moment, once', () => {
  it('renders the wordmark and the full atmosphere while it checks', () => {
    renderBoot()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('CLEAR')
    expect(document.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      'full',
    )
  })

  it('is not shown to a returning user whose data is already in hand', () => {
    // Boot has no memory of its own: the checks *are* the app's queries, so a
    // cache that already holds them is a booted app. That is "brand once, then
    // get out of the way" — re-entry from a cached screen replays nothing.
    const warm = new QueryClient()
    warm.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
    warm.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
    warm.setData(historyQueryKey(FIXTURE_USER_ID, 1), {
      sessions: [makeSessionRow()],
      hasMore: false,
    })
    warm.setData(constraintsQueryKey(FIXTURE_USER_ID), [])

    renderBoot(bootProviders({ queryClient: warm }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText(APP)).toBeInTheDocument()
  })
})
