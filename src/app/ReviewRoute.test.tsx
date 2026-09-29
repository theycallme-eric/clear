/**
 * REQ-004 · JOURNEY-006 — regenerating from Review is a generation run watched
 * on the shared Loading screen, not a trip back to the Generate form.
 *
 * Every test mounts the real route tree at `/review` with a hand-off in its
 * history entry, over GEN-03's real `useGeneration()` and a client double that
 * answers when a test says so. `RootLayout` is in the tree, so the atmosphere
 * the Loading screen restores is the one the route itself resolved.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GENERATE_PATH } from '../state/generation-form'
import {
  GENERATION_FAILED_LABEL,
  GENERATION_LOADING_TITLE,
} from '../state/generation-loading'
import { readReviewHandoff, reviewHandoff } from '../state/review-handoff'
import type { SessionAcceptance } from '../state/schemas'
import { toastQueue, type ToastMessage } from '../state/toasts'
import { SLOW_THRESHOLD_MS } from '../state/view-state'
import { makeGenerationError, makeSessionAcceptance } from '../test/factories'
import {
  createFakeGenerationClient,
  type FakeGenerationClient,
} from '../test/generation-double'
import { AppProviders, signedIn } from '../test/render'
import { ok } from '../state/errors'
import {
  createWorkoutDouble,
  reconstructionFixture,
  snapshotFixture,
} from '../test/workout-double'
import { SLOW_LOADING_LABEL } from '../ui/view-state'
import { REGENERATE_LABEL, START_LABEL } from './Review'
import { NO_REVIEW_TITLE, REVIEW_PATH } from './ReviewRoute'
import { routes } from './router'
import { SESSION_DETAIL_RESTART_LABEL } from './SessionDetail'

const LOCATION_ID = 'd0000001-0000-4000-8000-000000000000'

function acceptanceTitled(
  title: string,
  overrides: Partial<SessionAcceptance> = {},
): SessionAcceptance {
  return makeSessionAcceptance({
    goal_preset: 'strength',
    location_id: LOCATION_ID,
    session_focus: 'lower_body',
    requested_intensity: 8,
    requested_duration_mins: 50,
    is_deload: false,
    workout: { ...makeSessionAcceptance().workout, title },
    ...overrides,
  })
}

const ORIGINAL = acceptanceTitled('Original session')

function mount(
  client: FakeGenerationClient,
  acceptance: SessionAcceptance = ORIGINAL,
) {
  const router = createMemoryRouter(routes, {
    initialEntries: [
      '/',
      { pathname: REVIEW_PATH, state: reviewHandoff(acceptance) },
    ],
    initialIndex: 1,
  })
  const view = render(
    <AppProviders
      {...signedIn({
        workout: createWorkoutDouble({ session: null }).clients,
        generation: client,
      })}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, view }
}

/**
 * The ScanLoader's own region. `AppChrome`'s route announcer is a `status` too,
 * and it goes on naming the last screen it announced, so it is excluded.
 */
function scanLoader(): HTMLElement | null {
  return (
    screen
      .queryAllByRole('status')
      .find((region) => !region.classList.contains('a11y-hidden')) ?? null
  )
}

function loader(): HTMLElement {
  const region = scanLoader()
  if (region === null) throw new Error('the Loading screen is not up')
  return region
}
const atmosphere = () => document.documentElement.dataset.atmosphere

/** Toasts still showing or waiting to show — a `leaving` one is on its way out. */
function liveToasts(): ToastMessage[] {
  const { current, phase, queue } = toastQueue.getState()
  return [...(current !== null && phase === 'visible' ? [current] : []), ...queue]
}

async function briefing(title: string) {
  return screen.findByRole('heading', { level: 1, name: title })
}

async function askToRegenerate(user: ReturnType<typeof userEvent.setup>) {
  await briefing('Original session')
  await user.click(screen.getByRole('button', { name: REGENERATE_LABEL }))
  return screen.findByRole('dialog')
}

async function confirmRegenerate(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await askToRegenerate(user)
  await user.click(within(dialog).getByRole('button', { name: 'Discard and regenerate' }))
}

beforeEach(() => {
  toastQueue.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ReviewRoute · declining the discard confirm', () => {
  it('starts no run and leaves the workout on Review untouched', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const { router } = mount(client)

    const dialog = await askToRegenerate(user)
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))

    expect(client.calls).toEqual([])
    expect(scanLoader()).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Original session' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(REVIEW_PATH)
    expect(readReviewHandoff(router.state.location.state)?.acceptance).toEqual(ORIGINAL)
  })
})

describe('ReviewRoute · confirming runs the Loading-to-Review transition', () => {
  it('replaces Review with the Loading screen rather than going to the Generate form', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const { router } = mount(client)

    await confirmRegenerate(user)

    const region = loader()
    expect(region).toHaveTextContent(GENERATION_LOADING_TITLE)
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(GENERATION_LOADING_TITLE)
    expect(screen.queryByText('Original session')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe(REVIEW_PATH)
    expect(router.state.location.pathname).not.toBe(GENERATE_PATH)
  })

  it('sends the request the discarded workout was composed from, once', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await confirmRegenerate(user)

    expect(client.calls).toEqual([
      {
        goal: 'strength',
        focus: 'lower_body',
        requested_intensity: 8,
        requested_duration_mins: 50,
        location_id: LOCATION_ID,
        notes: null,
        deload: false,
      },
    ])
  })

  it('stays up for the whole run, with no progress it does not know', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await confirmRegenerate(user)
    await act(async () => {
      client.reachStage('validating')
    })
    await act(async () => {
      client.reachStage('composing')
    })

    const region = loader()
    expect(region).toHaveTextContent('Composing session')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(region.querySelector('[aria-valuenow], [aria-valuemax], progress')).toBeNull()
    expect(client.outstanding).toBe(1)
  })

  it('lands back on Review with the new workout when the run succeeds', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const { router } = mount(client)
    const regenerated = acceptanceTitled('Regenerated session')

    await confirmRegenerate(user)
    await act(async () => {
      client.succeed({ acceptance: regenerated })
    })

    expect(await briefing('Regenerated session')).toBeInTheDocument()
    expect(scanLoader()).toBeNull()
    expect(screen.queryByText('Original session')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe(REVIEW_PATH)
    expect(readReviewHandoff(router.state.location.state)).toEqual(reviewHandoff(regenerated))
  })

  it('sends a composition whose request cannot be restated to Generate instead', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const { router } = mount(
      client,
      acceptanceTitled('Original session', { location_id: null }),
    )

    await confirmRegenerate(user)

    expect(client.calls).toEqual([])
    expect(router.state.location.pathname).toBe(GENERATE_PATH)
  })
})

describe('ReviewRoute · status reflects reality', () => {
  it('turns slow at the documented threshold and states the fact without apology', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const client = createFakeGenerationClient()
    mount(client)

    await confirmRegenerate(user)

    await act(async () => {
      vi.advanceTimersByTime(SLOW_THRESHOLD_MS - 1000)
    })
    expect(loader()).not.toHaveTextContent(SLOW_LOADING_LABEL)

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    const region = loader()
    expect(region).toHaveTextContent(SLOW_LOADING_LABEL)
    expect(region.textContent).not.toMatch(/sorry|apolog|oops|hang tight|!/i)
    expect(client.outstanding).toBe(1)
  })

  it('shows failed on error, with one negative toast carrying one retry', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await confirmRegenerate(user)
    await act(async () => {
      client.fail(makeGenerationError({ requestId: 'req_regen_1' }))
    })

    expect(loader()).toHaveTextContent(GENERATION_FAILED_LABEL)
    const toasts = liveToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.variant).toBe('negative')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('req_regen_1')
    const actions = within(alert)
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((label) => label !== '')
    expect(actions).toEqual(['Retry'])
    // Never a dead end: cancel is still there beside the failure.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(client.calls).toHaveLength(2)
    expect(client.calls[1]).toEqual(client.calls[0])
    expect(loader()).toHaveTextContent(GENERATION_LOADING_TITLE)
    expect(liveToasts()).toEqual([])
  })
})

describe('ReviewRoute · cancel returns to Review and discards the abandoned run', () => {
  it('returns to Review with the previous workout still discarded', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const { router } = mount(client)

    await confirmRegenerate(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(scanLoader()).toBeNull()
    expect(router.state.location.pathname).toBe(REVIEW_PATH)
    expect(
      screen.getByRole('heading', { level: 1, name: NO_REVIEW_TITLE }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Original session')).not.toBeInTheDocument()
    expect(readReviewHandoff(router.state.location.state)).toBeNull()
  })

  it('never lets the abandoned run’s workout replace the screen afterwards', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const { router } = mount(client)

    await confirmRegenerate(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {
      client.succeed({ acceptance: acceptanceTitled('Too late') })
    })

    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
    expect(scanLoader()).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: NO_REVIEW_TITLE }),
    ).toBeInTheDocument()
    expect(readReviewHandoff(router.state.location.state)).toBeNull()
  })

  it('ignores a failure that arrives after cancel', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await confirmRegenerate(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {
      client.fail(makeGenerationError())
    })

    expect(scanLoader()).toBeNull()
    expect(screen.queryByText(GENERATION_FAILED_LABEL)).not.toBeInTheDocument()
    expect(liveToasts()).toEqual([])
  })

  it('ignores a workout that arrives after the route unmounted', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const { view } = mount(client)

    await confirmRegenerate(user)
    view.unmount()
    await act(async () => {
      client.succeed({ acceptance: acceptanceTitled('Too late') })
    })

    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
    expect(liveToasts()).toEqual([])
  })
})

describe('ReviewRoute · the atmosphere swap', () => {
  it('renders the Loading screen at full and restores Review’s level when it leaves', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await briefing('Original session')
    expect(atmosphere()).toBe('quiet')

    await confirmRegenerate(user)
    expect(atmosphere()).toBe('full')
    expect(document.querySelector('[data-atmosphere="full"]')).not.toBeNull()

    await act(async () => {
      client.succeed({ acceptance: acceptanceTitled('Regenerated session') })
    })
    await briefing('Regenerated session')
    expect(atmosphere()).toBe('quiet')
  })

  it('restores Review’s level on cancel', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await confirmRegenerate(user)
    expect(atmosphere()).toBe('full')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(atmosphere()).toBe('quiet')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-003 · JOURNEY-004 — arriving from a session-detail restart
// ─────────────────────────────────────────────────────────────────────────────

describe('ReviewRoute · a restart from session detail', () => {
  const SESSION_ID = 'c0000001-0000-4000-8000-000000000000'
  const TITLE = 'Tuesday pull'

  function record(reconstruction: 'performed' | 'intended_at_start') {
    return reconstructionFixture({
      sessionId: SESSION_ID,
      title: TITLE,
      state: 'completed',
      reconstruction,
      sections: [{ title: 'Main', blocks: [{ exercises: ['completed'] }] }],
    })
  }

  function mountFromDetail() {
    const client = createFakeGenerationClient()
    const accepted: SessionAcceptance[] = []
    const double = createWorkoutDouble({
      session: null,
      sessions: {
        asPerformed: async () => ok(record('performed')),
        asIntendedAtStart: async () => ok(record('intended_at_start')),
        async accept(_userId, acceptance) {
          accepted.push(acceptance)
          return ok(snapshotFixture({ sessionId: SESSION_ID, title: TITLE, state: 'prescribed' }))
        },
        async start() {
          const running = snapshotFixture({ sessionId: SESSION_ID, title: TITLE, state: 'active' })
          return ok({ session: running.session, state: 'active' as const })
        },
      },
    })
    const router = createMemoryRouter(routes, {
      initialEntries: ['/history', `/history/${SESSION_ID}`],
      initialIndex: 1,
    })
    render(
      <AppProviders {...signedIn({ workout: double.clients, generation: client })}>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    return { client, double, router, accepted }
  }

  it('shows the reproduced workout ready to start, with no generation call', async () => {
    const user = userEvent.setup()
    const { client, double, router } = mountFromDetail()

    await briefing(TITLE)
    await user.click(screen.getByRole('button', { name: SESSION_DETAIL_RESTART_LABEL }))

    await waitFor(() => expect(router.state.location.pathname).toBe(REVIEW_PATH))
    expect(await briefing(TITLE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled()
    expect(readReviewHandoff(router.state.location.state)?.savedWorkoutId).toBeNull()
    expect(client.calls).toEqual([])
    expect(double.favorites()).toEqual([])
  })

  it('starts it as a plain session: accepted as reproduced, and attributed to no favorite', async () => {
    const user = userEvent.setup()
    const { client, double, router, accepted } = mountFromDetail()

    await briefing(TITLE)
    await user.click(screen.getByRole('button', { name: SESSION_DETAIL_RESTART_LABEL }))
    await waitFor(() => expect(router.state.location.pathname).toBe(REVIEW_PATH))

    await user.click(await screen.findByRole('button', { name: START_LABEL }))

    await waitFor(() => expect(accepted).toHaveLength(1))
    expect(accepted[0].workout.title).toBe(TITLE)
    expect(accepted[0].workout.sections).toHaveLength(1)
    expect(double.attempts()).toEqual([])
    expect(double.favorites()).toEqual([])
    expect(client.calls).toEqual([])
  })
})
