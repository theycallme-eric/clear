import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { createWorkoutDouble } from '../test/workout-double'
import { SLOW_LOADING_LABEL } from '../ui/view-state'
import { resolveAtmosphere } from './atmosphere'
import { PREFILL_NOTICE } from './Generate'
import {
  HISTORY_ROUTE,
  HOME_HEADING,
  HOME_ROUTE,
  SUGGESTION_EMPTY,
  VIEW_HISTORY_LABEL,
} from './Home'

const LOCATION_ID = 'd0000001-0000-4000-8000-000000000000'

describe('Home', () => {
  it('shows the empty daily entry point and hides Quick Start entirely', async () => {
    renderApp(['/'], signedIn({ workout: createWorkoutDouble({ session: null }).clients }))

    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate workout' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quick start' })).not.toBeInTheDocument()
    expect(await screen.findByText('No workouts yet')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'This week' }).children).toHaveLength(7)
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

  it('marks today with a reason and redraws the week from the saved row', async () => {
    const user = userEvent.setup()
    const restDays = createFakeRestDayClient()

    renderApp(['/'], signedIn({ restDays }))

    await user.click(await screen.findByRole('button', { name: 'Mark Rest Day' }))
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
 * HOME-03 on the real route tree: the suggestion is read off the same history,
 * taking it opens Generate prefilled, dismissing it leaves Generate on its
 * defaults, and thin history produces an empty state instead of a focus.
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

  async function suggestionCard(): Promise<HTMLElement> {
    const heading = await screen.findByRole('heading', { name: 'Suggested next' })
    return heading.closest<HTMLElement>('.clr-card') ?? heading
  }

  it('names the least-recently-trained focus, says which pattern is stale, and prefills generation', async () => {
    const user = renderHome(lowerBodyBlock())
    const card = within(await suggestionCard())

    expect(card.getByText('Upper body · intensity 7')).toBeInTheDocument()
    // Pattern-level, not "no upper body": the sentence names a movement pattern.
    expect(
      card.getByText('No press in 20 days. Your last 3 sessions averaged intensity 7.'),
    ).toBeInTheDocument()

    await user.click(card.getByRole('button', { name: 'Use this' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Generate workout' }),
    ).toBeInTheDocument()
    expect(screen.getByText(PREFILL_NOTICE)).toBeInTheDocument()

    const anchor = within(screen.getByRole('group', { name: 'Anchor' }))
    expect(anchor.getByRole('button', { name: 'Upper body' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('slider')).toHaveValue('7')

    // The goal is still unanswered, so a prefilled form still cannot generate.
    expect(screen.getByRole('button', { name: /generate workout/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Strength' }))
    expect(screen.getByRole('slider')).toHaveValue('7')
    expect(screen.getByRole('button', { name: /generate workout/i })).toBeEnabled()
  })

  it('dismisses for the day and leaves Generate on its defaults', async () => {
    const user = renderHome(lowerBodyBlock())
    const card = within(await suggestionCard())

    await user.click(card.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('heading', { name: 'Suggested next' })).not.toBeInTheDocument()
    expect(localStorage.getItem(SUGGESTION_DISMISSAL_STORAGE_KEY)).toBe(suggestionDay())

    await user.click(screen.getByRole('button', { name: 'Generate workout' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Generate workout' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(PREFILL_NOTICE)).not.toBeInTheDocument()
    for (const chip of within(screen.getByRole('group', { name: 'Anchor' })).getAllByRole(
      'button',
    )) {
      expect(chip).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('stays dismissed when Home is opened again the same day', async () => {
    localStorage.setItem(SUGGESTION_DISMISSAL_STORAGE_KEY, suggestionDay())
    renderHome(lowerBodyBlock())

    expect(await screen.findByRole('button', { name: 'Quick start' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Suggested next' })).not.toBeInTheDocument()
  })

  it('shows an empty state rather than a guess when the history is too thin', async () => {
    renderHome([
      completed(1, 1, { session_focus: 'lower_body' }),
      completed(2, 4, { session_focus: 'lower_body' }),
    ])

    const card = within(await suggestionCard())
    expect(card.getByText(SUGGESTION_EMPTY)).toBeInTheDocument()
    expect(card.queryByRole('button', { name: 'Use this' })).not.toBeInTheDocument()
  })
})
