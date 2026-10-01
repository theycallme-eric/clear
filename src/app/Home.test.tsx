import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createError, err, ErrorCode, ok } from '../state/errors'
import {
  QUICK_START_LEGACY_GOAL,
  QUICK_START_MISSING_GOAL,
  QUICK_START_SETTINGS_LABEL,
} from '../state/home'
import { QueryClient } from '../state/query'
import type { Profile } from '../state/schemas'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import {
  createFakeUserDataClient,
  fixtureLocation,
  FIXTURE_USER_ID,
  onboardedProfile,
} from '../test/user-data-double'
import {
  GENERATION_CANCEL_LABEL,
  GENERATION_FAILED_LABEL,
  GENERATION_LOADING_TITLE,
  GENERATION_RETRY_LABEL,
} from '../state/generation-loading'
import {
  SUGGESTION_DISMISSAL_STORAGE_KEY,
  suggestionDay,
} from '../state/session-suggestion'
import { toastQueue, type ToastMessage } from '../state/toasts'
import { SLOW_THRESHOLD_MS } from '../state/view-state'
import {
  makeGenerationError,
  makeSessionAcceptance,
  makeSessionRow,
} from '../test/factories'
import { createFakeGenerationClient } from '../test/generation-double'
import { renderApp, signedIn } from '../test/render'
import { createFakeRestDayClient } from '../test/rest-day-double'
import {
  createWorkoutDouble,
  reconstructionFixture,
  savedWorkoutFixture,
} from '../test/workout-double'
import { SLOW_LOADING_LABEL } from '../ui/view-state'
import { resolveAtmosphere } from './atmosphere'
import {
  HISTORY_ROUTE,
  HOME_HEADING,
  HOME_ROUTE,
  SETTINGS_ROUTE,
  VIEW_HISTORY_LABEL,
} from './Home'

const LOCATION_ID = 'd0000001-0000-4000-8000-000000000000'

describe('Home', () => {
  it('shows the empty daily entry point and hides Quick Start entirely', async () => {
    renderApp(['/'], signedIn({ workout: createWorkoutDouble({ session: null }).clients }))

    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate workout' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate workout' }).closest('.clr-footer')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Quick start' })).not.toBeInTheDocument()
    expect(await screen.findByText('No workouts yet')).toBeInTheDocument()
    expect(screen.getByRole('tablist').closest('.clr-band')).not.toBeNull()
    expect(screen.getByRole('list', { name: 'This week' }).children).toHaveLength(7)

    const trainToday = screen.getByRole('heading', { name: 'Train today' }).closest('.clr-card')
    const thisWeek = screen.getByRole('heading', { name: 'This week' }).closest('.clr-card')
    expect(trainToday).not.toBeNull()
    expect(thisWeek).not.toBeNull()
    expect(trainToday!.compareDocumentPosition(thisWeek!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.queryByText('No workout in progress')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.clr-card__bar--lg')).toHaveLength(0)
  })

  it('renders recent history and Quick Start immediately repeats the last request', async () => {
    const user = userEvent.setup()
    const generation = createFakeGenerationClient()
    const latest = makeSessionRow({
      id: 'b0000002-0000-4000-8000-000000000000',
      location_id: LOCATION_ID,
      date: '2026-09-24',
      title: 'Upper-body strength',
      session_focus: 'upper_body',
      requested_duration_mins: 35,
      requested_intensity: 6,
      generation_notes: 'Do not repeat this note',
    })
    const older = makeSessionRow({
      id: 'b0000001-0000-4000-8000-000000000000',
      location_id: LOCATION_ID,
      date: '2026-09-22',
    })
    const workout = createWorkoutDouble({
      session: null,
      historyRows: [older, latest],
    })

    renderApp(['/'], signedIn({ workout: workout.clients, generation }))

    const quickStart = await screen.findByRole('button', { name: 'Quick start' })
    expect(screen.getByRole('link', { name: /Upper-body strength/i })).toHaveAttribute(
      'href',
      `/history/${latest.id}`,
    )

    await user.click(quickStart)

    await waitFor(() => {
      expect(generation.calls).toEqual([
        {
          goal: 'balanced',
          focus: 'upper_body',
          requested_duration_mins: 35,
          requested_intensity: 6,
          location_id: LOCATION_ID,
          notes: null,
          deload: false,
        },
      ])
    })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('opens History from the Recent panel as a client-side navigation', async () => {
    const user = userEvent.setup()
    renderApp(['/'], signedIn({ workout: createWorkoutDouble({ session: null }).clients }))

    const link = await screen.findByRole('link', { name: VIEW_HISTORY_LABEL })
    expect(link).toHaveAttribute('href', HISTORY_ROUTE)

    await user.click(link)

    // Same router, same providers: the Home heading gave way to History's
    // without the app being mounted again.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'History' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('renders Favorites as one list frame and restores one directly into Review', async () => {
    const user = userEvent.setup()
    const workout = createWorkoutDouble({
      session: null,
      favorites: [savedWorkoutFixture()],
    })
    renderApp(['/'], signedIn({ workout: workout.clients }))

    await user.click(screen.getByRole('tab', { name: 'Favorites' }))

    const favorites = await screen.findByRole('list', { name: 'Favorites' })
    expect(favorites).toHaveClass('clr-list', 'clr-chamfer')
    expect(favorites.querySelectorAll(':scope > .clr-list__row')).toHaveLength(1)

    await user.click(within(favorites).getByRole('button', { name: 'Start' }))

    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Today' })).toBeNull()
  })

  it('opens a recent workout into its Session Detail rather than Not Found', async () => {
    const user = userEvent.setup()
    const record = reconstructionFixture({
      sessionId: 'b0000003-0000-4000-8000-000000000000',
      title: 'Hinge and carry',
    })
    const asked: string[] = []
    const workout = createWorkoutDouble({
      session: null,
      historyRows: [record.session],
      sessions: {
        asPerformed: async (sessionId) => {
          asked.push(sessionId)
          return ok(record)
        },
      },
    })

    renderApp(['/'], signedIn({ workout: workout.clients }))

    const link = await screen.findByRole('link', { name: /Hinge and carry/i })
    expect(link).toHaveAttribute('href', `/history/${record.session.id}`)
    await user.click(link)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hinge and carry' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(asked).toEqual([record.session.id])
  })

  it('marks today with a reason and redraws the week from the saved row', async () => {
    const user = userEvent.setup()
    const restDays = createFakeRestDayClient()

    renderApp(['/'], signedIn({ restDays }))

    const restButton = await screen.findByRole('button', { name: 'Mark Rest Day' })
    const weekCard = screen.getByRole('heading', { name: 'This week' }).closest('.clr-card')
    expect(weekCard).toContainElement(restButton)
    await user.click(restButton)
    await user.selectOptions(screen.getByLabelText('Reason'), 'sick')
    await user.click(screen.getByRole('button', { name: 'Save rest day' }))

    await waitFor(() => {
      expect(restDays.markCalls).toEqual([
        { day: suggestionDay(), reason: 'sick', note: null },
      ])
    })
    expect(await screen.findByText('Today is marked: Unwell.')).toBeInTheDocument()
    expect(screen.getByText('Rest day saved.')).toBeInTheDocument()
  })
})

/**
 * REQ-004 through Home's own entry: Quick Start hands its run to the shared
 * generation host, so the Loading screen is the whole screen for the run, cancel
 * puts Home back, a failure is pattern 3, and success lands on Review.
 *
 * Everything is driven on the real route tree over GEN-03's real mutation, with
 * a client double that answers only when a test says so.
 */
describe('Home’s Quick Start (REQ-004)', () => {
  const REPEATED = makeSessionRow({
    id: 'b0000003-0000-4000-8000-000000000000',
    location_id: LOCATION_ID,
    date: '2026-09-24',
    title: 'Upper-body strength',
    session_focus: 'upper_body',
  })

  beforeEach(() => toastQueue.clear())

  // One test drives the slow budget on a fake clock; a clock that leaked would
  // hang every test after it.
  afterEach(() => vi.useRealTimers())

  function renderHome(
    historyRows = [REPEATED],
    user = userEvent.setup(),
  ) {
    const generation = createFakeGenerationClient()
    const workout = createWorkoutDouble({ session: null, historyRows })
    const view = renderApp(['/'], signedIn({ workout: workout.clients, generation }))

    return { user, generation, view }
  }

  async function quickStart(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Quick start' }))
  }

  /** The ScanLoader region — not the router's own hidden announcer. */
  const loader = () =>
    screen.queryAllByRole('status').find((region) => region.classList.contains('clr-scan')) ??
    null
  function scan(): HTMLElement {
    const region = loader()
    if (region === null) throw new Error('the Loading screen is not up')
    return region
  }
  const homeHeading = () => screen.queryByRole('heading', { level: 1, name: HOME_HEADING })
  const atmosphere = () => document.documentElement.dataset.atmosphere

  /** Toasts still showing or waiting to show — a `leaving` one is on its way out. */
  function liveToasts(): ToastMessage[] {
    const { current, phase, queue } = toastQueue.getState()
    return [...(current !== null && phase === 'visible' ? [current] : []), ...queue]
  }

  function acceptance(title: string) {
    const base = makeSessionAcceptance()
    return makeSessionAcceptance({ workout: { ...base.workout, title } })
  }

  it('renders through the shared host rather than an inline pending branch', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'Home.tsx'), 'utf-8')

    expect(source).toMatch(/<GenerationLoadingHost[\s\S]*cancelTo=\{HOME_ROUTE\}/)
    expect(source).not.toMatch(/<GenerationLoading[\s/>]/)
    expect(source).not.toMatch(/status === 'pending'/)
    expect(HOME_ROUTE).toBe('/')
  })

  it('makes the Loading screen the whole screen for the run and lands on Review', async () => {
    const { user, generation } = renderHome()
    expect(atmosphere()).toBe(resolveAtmosphere(HOME_ROUTE))

    await quickStart(user)

    const region = scan()
    expect(region).toHaveTextContent(GENERATION_LOADING_TITLE)
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(GENERATION_LOADING_TITLE)
    expect(homeHeading()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quick start' })).not.toBeInTheDocument()
    expect(atmosphere()).toBe('full')
    expect(document.querySelector('[data-atmosphere="full"]')).toBeInTheDocument()

    // A real stage is what it says — and still no invented progress.
    await act(async () => {
      generation.reachStage('composing')
    })
    expect(scan()).toHaveTextContent('Composing session')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(scan()).not.toHaveAttribute('aria-valuenow')
    expect(screen.getByRole('button', { name: GENERATION_CANCEL_LABEL })).toBeInTheDocument()
    expect(generation.calls).toHaveLength(1)

    await act(async () => {
      generation.succeed({ acceptance: acceptance('Press-led session') })
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Press-led session' }),
    ).toBeInTheDocument()
    expect(loader()).not.toBeInTheDocument()
    expect(homeHeading()).not.toBeInTheDocument()
    expect(atmosphere()).toBe(resolveAtmosphere('/review'))
  })

  it('says a run is slow at the documented threshold, and only then, without apology', async () => {
    // `shouldAdvanceTime` keeps the library's zero-delay waits working while
    // leaving the budget under the test's control.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { user } = renderHome(
      [REPEATED],
      userEvent.setup({ advanceTimers: vi.advanceTimersByTime }),
    )

    await quickStart(user)

    await act(async () => {
      vi.advanceTimersByTime(SLOW_THRESHOLD_MS - 500)
    })
    expect(scan()).not.toHaveTextContent(SLOW_LOADING_LABEL)

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    const region = scan()
    expect(region).toHaveTextContent(SLOW_LOADING_LABEL)
    expect(region).not.toHaveTextContent(GENERATION_FAILED_LABEL)
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(region.textContent).not.toMatch(/sorry|apolog|oops|hang tight|!/i)
  })

  it('fails into pattern 3: one negative toast with one retry, cancel still there', async () => {
    const { user, generation } = renderHome()
    await quickStart(user)

    await act(async () => {
      generation.fail(makeGenerationError({ requestId: 'req_home_quick_start' }))
    })

    const region = scan()
    expect(region).toHaveTextContent(GENERATION_FAILED_LABEL)
    expect(region).not.toHaveAttribute('aria-busy', 'true')
    expect(homeHeading()).not.toBeInTheDocument()

    const toasts = liveToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.variant).toBe('negative')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('req_home_quick_start')
    // One action, and the dismiss control that every toast carries.
    expect(within(alert).getAllByRole('button').map((button) => button.textContent)).toEqual([
      GENERATION_RETRY_LABEL,
      '',
    ])
    expect(screen.getByRole('button', { name: GENERATION_CANCEL_LABEL })).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: GENERATION_RETRY_LABEL }))

    expect(generation.calls).toHaveLength(2)
    expect(generation.calls[1]).toEqual(generation.calls[0])
    expect(liveToasts()).toEqual([])
    expect(scan()).toHaveTextContent(GENERATION_LOADING_TITLE)
  })

  it('puts Home back on cancel, and the abandoned result never replaces it', async () => {
    const { user, generation } = renderHome()
    await quickStart(user)
    expect(atmosphere()).toBe('full')

    await user.click(screen.getByRole('button', { name: GENERATION_CANCEL_LABEL }))

    expect(loader()).not.toBeInTheDocument()
    expect(homeHeading()).toBeInTheDocument()
    expect(atmosphere()).toBe(resolveAtmosphere(HOME_ROUTE))
    expect(
      document.querySelector('.clr-shell')?.getAttribute('data-atmosphere'),
    ).toBe(resolveAtmosphere(HOME_ROUTE))

    await act(async () => {
      generation.succeed({ acceptance: acceptance('Too late') })
    })

    expect(screen.queryByRole('heading', { name: 'Too late' })).not.toBeInTheDocument()
    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
    expect(loader()).not.toBeInTheDocument()
    expect(homeHeading()).toBeInTheDocument()
  })

  it('drops a failure that arrives after cancel without raising a toast', async () => {
    const { user, generation } = renderHome()
    await quickStart(user)
    await user.click(screen.getByRole('button', { name: GENERATION_CANCEL_LABEL }))

    await act(async () => {
      generation.fail(makeGenerationError())
    })

    expect(loader()).not.toBeInTheDocument()
    expect(liveToasts()).toEqual([])
    expect(homeHeading()).toBeInTheDocument()
  })

  it('discards a result that arrives after Home unmounted', async () => {
    const { user, generation, view } = renderHome()
    await quickStart(user)

    view.unmount()
    await act(async () => {
      generation.succeed({ acceptance: acceptance('Too late') })
    })

    expect(view.container).toBeEmptyDOMElement()
    expect(liveToasts()).toEqual([])
  })

  it('stays absent until at least one workout has been completed', async () => {
    const prescribed = makeSessionRow({
      id: 'b0000004-0000-4000-8000-000000000000',
      location_id: LOCATION_ID,
      title: 'Prescribed only',
      started_at: null,
      completed_at: null,
    })
    const abandoned = makeSessionRow({
      id: 'b0000005-0000-4000-8000-000000000000',
      location_id: LOCATION_ID,
      title: 'Abandoned only',
      completed_at: null,
      abandoned_at: '2026-09-22T18:00:00.000Z',
    })
    renderHome([prescribed, abandoned])

    // The history has answered — both sessions are listed — and there is still
    // nothing completed to repeat.
    expect(await screen.findByRole('link', { name: /Prescribed only/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abandoned only/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate workout' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quick start' })).not.toBeInTheDocument()
  })
})

/**
 * REQ-010: the Goal Quick Start sends is the profile's standing one, read now.
 * The last session's snapshot — an older preference, or a one-workout Recovery
 * — supplies the focus, minutes, intensity and place, and never the Goal.
 */
describe('Home’s Quick Start uses the standing Goal (REQ-010)', () => {
  const SESSION_ID = 'b0000006-0000-4000-8000-000000000000'

  function renderHome(
    goal: Profile['goal_preset'],
    last: Parameters<typeof makeSessionRow>[0],
  ) {
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile({ goal_preset: goal }))
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])

    const generation = createFakeGenerationClient()
    const workout = createWorkoutDouble({
      session: null,
      historyRows: [
        makeSessionRow({
          id: SESSION_ID,
          location_id: LOCATION_ID,
          date: '2026-09-24',
          title: 'Last session',
          session_focus: 'upper_body',
          requested_duration_mins: 35,
          ...last,
        }),
      ],
    })
    renderApp(['/'], signedIn({ workout: workout.clients, generation, queryClient: cache }))

    return { user: userEvent.setup(), generation }
  }

  it('sends the standing Goal, not the one the last session was stored with', async () => {
    const { user, generation } = renderHome('strength', {
      goal_preset: 'hypertrophy',
      requested_intensity: 7,
    })

    const quickStart = await screen.findByRole('button', { name: 'Quick start' })
    // The label names the Goal that will be used before anything is sent.
    expect(
      screen.getByText('Repeats Last session: Upper body · 35 min · intensity 7 · Strength goal.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Hypertrophy goal/)).not.toBeInTheDocument()

    await user.click(quickStart)

    await waitFor(() => {
      expect(generation.calls).toEqual([
        {
          goal: 'strength',
          focus: 'upper_body',
          requested_duration_mins: 35,
          requested_intensity: 7,
          location_id: LOCATION_ID,
          notes: null,
          deload: false,
        },
      ])
    })
  })

  it('clamps a Recovery session’s intensity into the standing Goal’s range', async () => {
    const { user, generation } = renderHome('strength', {
      goal_preset: 'active_recovery',
      requested_intensity: 2,
      effective_intensity: 2,
    })

    const quickStart = await screen.findByRole('button', { name: 'Quick start' })
    expect(
      screen.getByText('Repeats Last session: Upper body · 35 min · intensity 3 · Strength goal.'),
    ).toBeInTheDocument()

    await user.click(quickStart)

    await waitFor(() => expect(generation.calls).toHaveLength(1))
    expect(generation.calls[0]).toMatchObject({ goal: 'strength', requested_intensity: 3 })
  })

  it.each([
    ['a missing Goal', null, QUICK_START_MISSING_GOAL],
    ['the legacy active_recovery Goal', 'active_recovery', QUICK_START_LEGACY_GOAL],
  ] as const)('sends nothing for %s and offers a route to Settings', async (_, goal, reason) => {
    const { user, generation } = renderHome(goal, { goal_preset: 'hypertrophy' })

    const quickStart = await screen.findByRole('button', { name: 'Quick start' })
    // No Goal is named, because none will be used.
    expect(screen.queryByText(/ goal\.$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(quickStart)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(reason)
    const link = within(alert).getByRole('link', { name: QUICK_START_SETTINGS_LABEL })
    expect(link).toHaveAttribute('href', SETTINGS_ROUTE)
    expect(generation.calls).toEqual([])
    expect(screen.getByRole('heading', { level: 1, name: HOME_HEADING })).toBeInTheDocument()

    await user.click(link)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeInTheDocument()
    expect(generation.calls).toEqual([])
  })

  it.each([
    ['still loading', () => new Promise<never>(() => {})],
    ['failed', async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED))],
  ] as const)('offers no Quick Start while the profile read is %s', async (_, profile) => {
    const generation = createFakeGenerationClient()
    const workout = createWorkoutDouble({
      session: null,
      historyRows: [
        makeSessionRow({ id: SESSION_ID, location_id: LOCATION_ID, goal_preset: 'hypertrophy' }),
      ],
    })
    // A cold cache: the profile is whatever this read answers, and it never
    // answers with a Goal.
    const cache = new QueryClient()
    const userData = createFakeUserDataClient({ profile })
    renderApp(
      ['/'],
      signedIn({ workout: workout.clients, generation, queryClient: cache, userData }),
    )

    await waitFor(() => expect(userData.profileCalls.length).toBeGreaterThan(0))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByRole('button', { name: 'Quick start' })).not.toBeInTheDocument()
    expect(generation.calls).toEqual([])
  })
})

/**
 * HOME-03 on the real route tree: the suggestion is read off the same history,
 * taking it opens Generate prefilled, dismissing it leaves Generate on its
 * defaults, and history with nothing completed or nothing recent produces no
 * prompt instead of a focus.
 *
 * Days are counted back from today rather than pinned to a date, because the
 * suggestion is only made for recent history — a fixture dated in 2026 would
 * stop being recent while the suite kept passing.
 */
describe('Home’s suggestion (HOME-03)', () => {
  beforeEach(() => localStorage.clear())

  function daysAgo(days: number): string {
    const [year, month, date] = suggestionDay().split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10)
  }

  function completed(index: number, daysBack: number, overrides = {}) {
    const day = daysAgo(daysBack)

    return makeSessionRow({
      id: `c000000${index}-0000-4000-8000-000000000000`,
      location_id: LOCATION_ID,
      date: day,
      created_at: `${day}T08:00:00.000Z`,
      started_at: `${day}T09:00:00.000Z`,
      completed_at: `${day}T10:00:00.000Z`,
      effective_intensity: 7,
      requested_intensity: 7,
      ...overrides,
    })
  }

  /** Three lower-body sessions and one upper-body session nearly three weeks old. */
  function lowerBodyBlock() {
    return [
      completed(1, 1, { session_focus: 'lower_body' }),
      completed(2, 5, { session_focus: 'lower_body' }),
      completed(3, 9, { session_focus: 'lower_body' }),
      completed(4, 20, { session_focus: 'upper_body' }),
    ]
  }

  function renderHome(historyRows: ReturnType<typeof lowerBodyBlock>) {
    const workout = createWorkoutDouble({ session: null, historyRows })
    renderApp(['/'], signedIn({ workout: workout.clients }))

    return userEvent.setup()
  }

  async function suggestionPrompt(): Promise<HTMLElement> {
    return screen.findByLabelText('Suggested next')
  }

  it('names the least-recently-trained focus, says which pattern is stale, and prefills generation', async () => {
    const user = renderHome(lowerBodyBlock())
    const prompt = await suggestionPrompt()
    const card = within(prompt)
    expect(prompt.closest('.clr-card')).toBe(
      screen.getByRole('heading', { name: 'Train today' }).closest('.clr-card'),
    )

    expect(card.getByText('Upper body · intensity 7')).toBeInTheDocument()
    // Pattern-level, not "no upper body": the sentence names a movement pattern.
    expect(
      card.getByText('No press in 20 days. Your last 3 sessions averaged intensity 7.'),
    ).toBeInTheDocument()

    await user.click(card.getByRole('button', { name: 'Use this' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Generate workout' }),
    ).toBeInTheDocument()
    // Generate recommends from the same history rather than claiming a prefill:
    // the compact Anchor is stated, its explanation stays on Home, and no
    // Anchor is asked for until Edit is opened.
    expect(screen.queryByText(/prefilled/i)).not.toBeInTheDocument()
    expect(screen.getByText('Upper body')).toBeInTheDocument()
    expect(screen.queryByText('No press in 20 days.')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveValue('7')

    // The Goal is the profile's standing one, so the form can generate as it opens.
    expect(screen.getByRole('button', { name: /generate workout/i })).toBeEnabled()
  })

  it('dismisses for the day and leaves Generate on its defaults', async () => {
    const user = renderHome(lowerBodyBlock())
    const card = within(await suggestionPrompt())

    await user.click(card.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByLabelText('Suggested next')).not.toBeInTheDocument()
    expect(localStorage.getItem(SUGGESTION_DISMISSAL_STORAGE_KEY)).toBe(suggestionDay())

    await user.click(screen.getByRole('button', { name: 'Generate workout' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Generate workout' }),
    ).toBeInTheDocument()
    // Dismissing is Home's prompt only. Generate derives today's recommendation
    // from history itself, whichever way it was opened.
    expect(screen.queryByText(/prefilled/i)).not.toBeInTheDocument()
    expect(screen.getByText('Upper body')).toBeInTheDocument()
    expect(screen.queryByText('No press in 20 days.')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument()
  })

  it('stays dismissed when Home is opened again the same day', async () => {
    localStorage.setItem(SUGGESTION_DISMISSAL_STORAGE_KEY, suggestionDay())
    renderHome(lowerBodyBlock())

    expect(await screen.findByRole('button', { name: 'Quick start' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Suggested next')).not.toBeInTheDocument()
  })

  it('suggests from a single completed session dated today', async () => {
    renderHome([completed(1, 0, { session_focus: 'lower_body' })])
    const card = within(await suggestionPrompt())

    expect(card.getByText('Upper body · intensity 7')).toBeInTheDocument()
    expect(
      card.getByText(
        'No press in the sessions you’ve logged. Your last 1 session averaged intensity 7.',
      ),
    ).toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Use this' })).toBeInTheDocument()
  })

  it('omits the smart prompt when nothing has been completed', async () => {
    renderHome([
      completed(1, 0, { title: 'Prescribed only', started_at: null, completed_at: null }),
      completed(2, 1, {
        title: 'Abandoned only',
        completed_at: null,
        abandoned_at: `${daysAgo(1)}T09:30:00.000Z`,
      }),
    ])

    await screen.findByRole('link', { name: /Abandoned only/i })
    expect(screen.queryByLabelText('Suggested next')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use this' })).not.toBeInTheDocument()
  })

  it('omits the smart prompt rather than guessing when the completed history is stale', async () => {
    renderHome([
      completed(1, 22, { session_focus: 'lower_body' }),
      completed(2, 30, { session_focus: 'upper_body' }),
    ])

    await screen.findByRole('button', { name: 'Quick start' })
    expect(screen.queryByLabelText('Suggested next')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use this' })).not.toBeInTheDocument()
  })
})
