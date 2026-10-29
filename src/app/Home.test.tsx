import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createError, err, ErrorCode, ok } from '../state/errors'
import { favoriteRunsQueryKey } from '../state/favorite-queries'
import { QueryClient } from '../state/query'
import type { Profile, WorkoutSessionRow } from '../state/schemas'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import {
  fixtureLocation,
  FIXTURE_USER_ID,
  onboardedProfile,
} from '../test/user-data-double'
import {
  FIRST_WORKOUT_GUIDANCE,
  STALE_HISTORY_GUIDANCE,
  suggestionDay,
} from '../state/session-suggestion'
import { makeSessionRow } from '../test/factories'
import { createFakeGenerationClient } from '../test/generation-double'
import { AppProviders, createWarmQueryClient, renderApp, signedIn } from '../test/render'
import { createFakeRestDayClient } from '../test/rest-day-double'
import {
  createWorkoutDouble,
  reconstructionFixture,
  savedWorkoutFixture,
} from '../test/workout-double'
import {
  FAVORITES_EMPTY,
  FAVORITES_EMPTY_TITLE,
  GENERATE_ACTION_LABEL,
  HISTORY_ROUTE,
  LAST_REQUEST_LABEL,
  RECENT_EMPTY_TITLE,
  STREAK_EMPTY,
  SUGGESTION_LABEL,
  VIEW_HISTORY_LABEL,
} from './Home'
import { createTestRouter } from './router'
import { REMOVE_FAVORITE_CONFIRM, REMOVE_FAVORITE_LABEL } from '../ui/favorite-list'

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

  it('renders recent history, and the primary action opens Generate without generating', async () => {
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

    expect(
      await screen.findByRole('link', { name: /Upper-body strength/i }),
    ).toHaveAttribute('href', `/history/${latest.id}`)
    expect(screen.queryByRole('button', { name: 'Quick start' })).not.toBeInTheDocument()
    // Notes were context for that composition; they are not restated here.
    expect(screen.queryByText(/Do not repeat this note/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: GENERATE_ACTION_LABEL }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Generate' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Time available/i)).toHaveValue(35)
    expect(generation.calls).toEqual([])
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
    // The card is the one frame: the list inside it is bare rows, never a
    // second frame of its own.
    expect(favorites).toHaveClass('clr-list')
    expect(favorites).not.toHaveClass('clr-chamfer')
    expect(favorites.querySelectorAll(':scope > .clr-list__row')).toHaveLength(1)
    const card = favorites.closest<HTMLElement>('.clr-card__body')
    expect(card).not.toBeNull()
    expect(within(card!).getByRole('heading', { level: 2, name: 'Favorites' })).toHaveClass('label')

    await user.click(within(favorites).getByRole('button', { name: 'Start' }))

    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Today' })).toBeNull()
  })

  it('drops deleted progression on actual Review Back → Home remove → Forward', async () => {
    const user = userEvent.setup()
    const favorite = savedWorkoutFixture({ times_completed: 3 })
    const performed = reconstructionFixture({ state: 'completed',
      sections: [{ sectionType: 'conditioning', blocks: [{ structureType: 'for_time',
        timerType: 'count_up', timerSeconds: 600, exercises: ['completed'],
        result: { elapsed_seconds: 123, completed_under_cap: true } }] }] })
    const workout = createWorkoutDouble({ session: null, favorites: [favorite],
      historyRows: [performed.session], favoriteAttempts: [{
        id: 'c0000001-0000-4000-8000-000000000000', saved_workout_id: favorite.id,
        session_id: performed.session.id, started_at: '2026-09-24T09:00:00+00:00',
        completed_at: '2026-09-24T09:30:00+00:00',
      }], sessions: { asPerformed: async () => ok(performed) } })
    const attempts = workout.clients.favorites.attempts
    let progressionReads = 0
    workout.clients.favorites.attempts = async id => {
      progressionReads += 1
      // The hosted FK cascade removes these rows with saved_workouts. The
      // existing in-memory double keeps attempt history, so model that boundary.
      return workout.favorites().some(row => row.id === id) ? attempts(id) : ok([])
    }
    const queryClient = createWarmQueryClient()
    const router = createTestRouter(['/?tab=favorites'])
    render(<AppProviders {...signedIn({ workout: workout.clients, queryClient })}>
      <RouterProvider router={router} />
    </AppProviders>)
    await user.click(await screen.findByRole('button', { name: 'Start' }))
    await screen.findByText(/Completed 3 times/)
    expect(await screen.findByText(/Personal best · set/)).toBeInTheDocument()
    expect(progressionReads).toBe(1)

    await act(() => router.navigate(-1))
    await screen.findByRole('heading', { level: 1, name: 'Today' })
    expect(screen.getByRole('tab', { name: 'Favorites' })).toHaveAttribute('aria-selected', 'true')
    await user.click(await screen.findByRole('button', { name: REMOVE_FAVORITE_LABEL }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: REMOVE_FAVORITE_CONFIRM }))
    await screen.findByText(FAVORITES_EMPTY_TITLE)
    expect(workout.favorites()).toEqual([])

    await act(() => router.navigate(1))
    await screen.findByRole('button', { name: 'Start workout' })
    await screen.findByText('Never completed')
    expect(progressionReads).toBe(2)
    expect(queryClient.getState(favoriteRunsQueryKey(favorite.id))).toEqual({ status: 'ready', data: [] })
    expect(screen.queryByText(/Completed 3 times/)).toBeNull()
    expect(screen.queryByText(/Personal best · set/)).toBeNull()
    expect(screen.queryByRole('list', { name: 'Completions' })).toBeNull()
  })

  describe('U21: the existing full favorites list and retained tab', () => {
    function favoriteRows(count: number) {
      return Array.from({ length: count }, (_, index) =>
        savedWorkoutFixture({
          id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          title: `Favorite ${index + 1}`,
          created_at: `2026-09-${String(10 + index).padStart(2, '0')}T10:00:00+00:00`,
        }),
      )
    }

    function renderFavorites(count: number, path = '/') {
      const workout = createWorkoutDouble({ session: null, favorites: favoriteRows(count) })
      const router = createTestRouter([path])
      render(
        <AppProviders {...signedIn({ workout: workout.clients })}>
          <RouterProvider router={router} />
        </AppProviders>,
      )
      return router
    }

    function favoritesTab() {
      return screen.getByRole('tab', { name: 'Favorites' })
    }

    async function favoriteRowCount() {
      const list = await screen.findByRole('list', { name: 'Favorites' })
      return list.querySelectorAll(':scope > .clr-list__row').length
    }

    it.each([0, 1, 7])('lists all %i favorites without inventing a preview cap', async (total) => {
      const user = userEvent.setup()
      const router = renderFavorites(total, '/?keep=1')
      await user.click(favoritesTab())

      expect(favoritesTab()).toHaveAttribute('aria-selected', 'true')
      expect(router.state.location.search).toBe('?keep=1&tab=favorites')
      if (total === 0) {
        expect(await screen.findByText(FAVORITES_EMPTY_TITLE)).toBeInTheDocument()
      } else {
        expect(await favoriteRowCount()).toBe(total)
        for (let index = 1; index <= total; index += 1) {
          expect(screen.getByRole('heading', { name: `Favorite ${index}` })).toBeInTheDocument()
        }
      }
      expect(screen.queryByRole('link', { name: /Show all|Show fewer/ })).not.toBeInTheDocument()
    })

    it('the full-list destination opens directly on Favorites with every saved row', async () => {
      renderFavorites(7, '/?tab=favorites')
      expect(favoritesTab()).toHaveAttribute('aria-selected', 'true')
      expect(await favoriteRowCount()).toBe(7)
    })

    it('returning from Review really restores the selected full-list tab', async () => {
      const user = userEvent.setup()
      const router = renderFavorites(7)
      await user.click(favoritesTab())
      expect(await favoriteRowCount()).toBe(7)
      const list = screen.getByRole('list', { name: 'Favorites' })
      await user.click(within(list).getAllByRole('button', { name: 'Start' })[0])
      expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/review')

      await act(() => router.navigate(-1))
      expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
      expect(router.state.location.search).toBe('?tab=favorites')
      expect(favoritesTab()).toHaveAttribute('aria-selected', 'true')
      expect(await favoriteRowCount()).toBe(7)
    })

    it('switching back to Favorites still shows the complete list', async () => {
      const user = userEvent.setup()
      renderFavorites(7, '/?tab=favorites')
      expect(await favoriteRowCount()).toBe(7)
      await user.click(screen.getByRole('tab', { name: 'Recent workouts' }))
      expect(screen.getByRole('tab', { name: 'Recent workouts' })).toHaveAttribute('aria-selected', 'true')
      await user.click(favoritesTab())
      expect(await favoriteRowCount()).toBe(7)
    })
  })

  // REQ-004 supersedes U44's head group on Home: title alone, then status and
  // date together, then the metrics (with the focus) and both durations.
  it('REQ-004: a recent workout puts its title first, then status and date, then metrics', async () => {
    const workout = createWorkoutDouble({
      session: null,
      historyRows: [
        makeSessionRow({
          id: 'b0000021-0000-4000-8000-000000000000',
          location_id: LOCATION_ID,
          date: '2026-09-24',
          title: 'A deliberately long recent workout name that has to wrap on a phone',
          requested_duration_mins: 40,
          actual_duration_mins: 33,
        }),
      ],
    })
    renderApp(['/'], signedIn({ workout: workout.clients }))

    const list = await screen.findByRole('list', { name: 'Recent workouts' })
    const row = list.querySelector(':scope > li') as HTMLElement
    expect([...row.querySelectorAll('[data-part]')].map((node) => node.getAttribute('data-part')))
      .toEqual(['title', 'status-date', 'status', 'date', 'metrics'])
    expect(row.querySelector('[data-part="status"]')).toHaveTextContent('Completed')
    expect(row.querySelector('[data-part="date"]')).toHaveTextContent(/^Thu 24 Sept? 2026$/)
    expect(row.querySelector('[data-part="metrics"]')).toHaveTextContent(
      /Lower body.*Requested 40 min.*Actual 33 min.*Intensity 7\/10/,
    )
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
    expect(await screen.findByText('Today: Unwell.')).toBeInTheDocument()
    expect(screen.getByText('Rest day saved.')).toBeInTheDocument()
  })

  it('U25: the trigger is a disclosure with short copy, and the picker gets focus', async () => {
    const user = userEvent.setup()
    renderApp(['/'], signedIn({ restDays: createFakeRestDayClient() }))

    const rest = await screen.findByRole('region', { name: 'Rest day' })
    // REQ-003: no prompt above the trigger.
    expect(rest).not.toHaveTextContent('Not training today?')
    expect(rest).not.toHaveTextContent(/keep your streak\..*keep your streak/i)

    const trigger = within(rest).getByRole('button', { name: 'Mark Rest Day' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // The trigger carries a glyph, but its name is still its words.
    expect(trigger.querySelector('svg')).not.toBeNull()

    await user.click(trigger)
    const picker = within(rest).getByRole('combobox', { name: 'Reason' })
    expect(picker).toHaveFocus()
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toContainElement(picker)
    // The chosen reason's effect is the helper, wired to the picker.
    expect(picker).toHaveAccessibleDescription(/Keeps your streak/)
    await user.selectOptions(picker, 'vacation')
    expect(picker).toHaveAccessibleDescription('Pauses your streak for as long as it lasts.')

    // Save and Cancel are equal framed cells in one responsive group.
    const save = within(rest).getByRole('button', { name: 'Save rest day' })
    const cancel = within(rest).getByRole('button', { name: 'Cancel' })
    expect(save.closest('.clr-action-group')).toHaveClass('clr-action-group--paired')
    // Cancel is framed like Save, not a bare quiet label beside a framed button.
    expect(cancel).not.toHaveClass('clr-btn--quiet')
    expect(cancel.closest<HTMLElement>('.clr-bleed')!.style.getPropertyValue('--bleed')).not.toBe(
      'transparent',
    )
  })

  it('U25: Cancel and Escape discard the choice and hand focus back to the trigger', async () => {
    const user = userEvent.setup()
    const restDays = createFakeRestDayClient()
    renderApp(['/'], signedIn({ restDays }))

    await user.click(await screen.findByRole('button', { name: 'Mark Rest Day' }))
    await user.selectOptions(screen.getByLabelText('Reason'), 'sick')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Reason')).toBeNull()
    expect(screen.getByRole('button', { name: 'Mark Rest Day' })).toHaveFocus()
    expect(screen.queryByText('Today:', { exact: false })).toBeNull()

    // Keyboard only: open, Escape, and the reason reopens at its saved value.
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Reason')).toHaveFocus()
    await user.selectOptions(screen.getByLabelText('Reason'), 'injury')
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('Reason')).toBeNull()
    expect(screen.getByRole('button', { name: 'Mark Rest Day' })).toHaveFocus()
    expect(restDays.markCalls).toEqual([])

    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Reason')).toHaveValue('rest')
  })

  it('U25: a keyboard save announces itself and returns focus to Change reason', async () => {
    const user = userEvent.setup()
    const restDays = createFakeRestDayClient()
    renderApp(['/'], signedIn({ restDays }))

    await user.click(await screen.findByRole('button', { name: 'Mark Rest Day' }))
    await user.selectOptions(screen.getByLabelText('Reason'), 'injury')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Save rest day' })).toHaveFocus()
    await user.keyboard('{Enter}')

    const rest = screen.getByRole('region', { name: 'Rest day' })
    expect(await within(rest).findByRole('status')).toHaveTextContent('Rest day saved.')
    expect(await screen.findByText('Today: Injured.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change reason' })).toHaveFocus(),
    )
    expect(restDays.markCalls).toEqual([{ day: suggestionDay(), reason: 'injury', note: null }])
  })

  /** Today's square in the week strip — the one named "(today)". */
  function todayCell(): HTMLElement {
    const strip = screen.getByRole('list', { name: 'This week' })
    return within(strip).getByText(/\(today\)/).closest('li')!
  }

  /** The aria-hidden glyph wrapper, by the colour token it is drawn in. */
  function glyphIn(day: HTMLElement, token: string): SVGElement | null {
    return day.querySelector(`[aria-hidden="true"][style*="${token}"] svg`)
  }

  it('U12: a rest day takes the info role with its Rest mark, distinct from a trained day', async () => {
    const user = userEvent.setup()
    renderApp(['/'], signedIn({ restDays: createFakeRestDayClient() }))

    await user.click(await screen.findByRole('button', { name: 'Mark Rest Day' }))
    await user.click(screen.getByRole('button', { name: 'Save rest day' }))
    await screen.findByText('Rest day saved.')

    const rest = todayCell()
    expect(rest).toHaveAttribute('data-day-state', 'rest')
    expect(rest.style.getPropertyValue('--surface')).toBe('var(--surface-toast-info)')
    expect(rest.style.getPropertyValue('--brd')).toBe('var(--border-toast-info)')
    expect(glyphIn(rest, '--icon-toast-info')).not.toBeNull()
    expect(glyphIn(rest, '--icon-selected')).toBeNull()
  })

  it('U12: a trained day keeps the completed role with its tick', async () => {
    const workout = createWorkoutDouble({
      session: null,
      historyRows: [
        makeSessionRow({
          id: 'b0000009-0000-4000-8000-000000000000',
          location_id: LOCATION_ID,
          date: suggestionDay(),
        }),
      ],
    })
    renderApp(['/'], signedIn({ workout: workout.clients }))

    await waitFor(() => expect(todayCell()).toHaveAttribute('data-day-state', 'workout'))
    const trained = todayCell()
    expect(trained.style.getPropertyValue('--surface')).toBe('var(--surface-selected)')
    expect(glyphIn(trained, '--icon-selected')).not.toBeNull()
    expect(glyphIn(trained, '--icon-toast-info')).toBeNull()
  })
})

/**
 * REQ-018 and REQ-009 on the real route tree: Home's groups are 0.14.3 cards
 * with their headings inside, they arrive once as one staggered set, and the
 * quiet ways out are the public TextAction — with nothing from the package's
 * worked example standing in for a product feature.
 *
 * jsdom runs no stylesheet, so this proves structure, classes and semantics;
 * what the frames look like is the rendered audit's to prove.
 */
describe('Home on the 0.14.3 hierarchy (REQ-018, REQ-009)', () => {
  function reduceMotion(reduced: boolean) {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: reduced,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    )
  }

  function populatedHome() {
    const workout = createWorkoutDouble({
      session: null,
      historyRows: [
        makeSessionRow({
          id: 'b0000004-0000-4000-8000-000000000000',
          location_id: LOCATION_ID,
          date: '2026-09-24',
        }),
      ],
    })
    renderApp(
      ['/'],
      signedIn({
        workout: workout.clients,
        generation: createFakeGenerationClient(),
        restDays: createFakeRestDayClient(),
      }),
    )
    return screen.findByText(new RegExp(`^${LAST_REQUEST_LABEL}:`))
  }

  function cardOf(heading: string): HTMLElement {
    const title = screen.getByRole('heading', { level: 2, name: heading })
    expect(title).toHaveClass('label')
    const body = title.closest<HTMLElement>('.clr-card__body')
    if (body === null) throw new Error(`"${heading}" is not headed inside a card`)
    return body.closest<HTMLElement>('.clr-card')!
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('heads every group inside its own barred card, and never nests a card', async () => {
    await populatedHome()

    for (const heading of ['Train today', 'This week', 'Recent workouts']) {
      const card = cardOf(heading)
      expect(card.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    }
    expect(document.querySelectorAll('.clr-card .clr-card')).toHaveLength(0)
    expect(document.querySelectorAll('.clr-card__bar--lg')).toHaveLength(0)

    // The list is the card's content: bare rows, no second frame.
    const recents = screen.getByRole('list', { name: 'Recent workouts' })
    expect(cardOf('Recent workouts')).toContainElement(recents)
    expect(recents).not.toHaveClass('clr-chamfer')
  })

  it('keeps the streak, the week and the rest-day sub-group contained in the week card', async () => {
    await populatedHome()

    const week = cardOf('This week')
    expect(within(week).getByText(/^Current streak: \d+ days?/)).toBeInTheDocument()

    const strip = within(week).getByRole('list', { name: 'This week' })
    expect(strip.children).toHaveLength(7)
    for (const day of Array.from(strip.children)) {
      expect(day).toHaveClass('clr-chamfer', 'clr-chamfer--sm')
    }

    // A sub-group is a ruled heading one level under the card's, not a card.
    const rest = await within(week).findByRole('region', { name: 'Rest day' })
    expect(within(rest).getByRole('heading', { level: 3, name: 'Rest day' })).toHaveClass('label')
    expect(rest.querySelector('.clr-card__bar')).toBeNull()
    expect(within(rest).getByRole('button', { name: 'Mark Rest Day' })).toHaveClass('clr-btn')
  })

  it('U06: keeps the streak count with its unit', async () => {
    await populatedHome()

    // A non-breaking space binds the count to its unit; the rest may wrap.
    // (The fixture's session falls outside this week; the browser lane
    // checks the week's "n of 7 days" on a populated week.)
    const text = cardOf('This week').textContent ?? ''
    expect(text).toMatch(/Current streak: \d+\xa0days?/)
  })

  it('U19: first use is one clear piece of guidance, and the week repeats no count', async () => {
    renderApp(['/'], signedIn({ workout: createWorkoutDouble({ session: null }).clients }))

    // First use: Train Today says what to do; the week and streak state facts.
    expect(
      await within(cardOf('Train today')).findByText(FIRST_WORKOUT_GUIDANCE),
    ).toBeInTheDocument()
    const week = cardOf('This week')
    expect(await within(week).findByText('No sessions this week yet.')).toBeInTheDocument()
    expect(week.textContent).not.toMatch(/consecutive days build/)
    expect(STREAK_EMPTY).toBe('No streak yet.')
    expect(screen.getAllByText(FIRST_WORKOUT_GUIDANCE)).toHaveLength(1)
  })

  it('U19: a populated week keeps the streak and the strip, with no second count', async () => {
    const workout = createWorkoutDouble({
      session: null,
      historyRows: [
        makeSessionRow({
          id: 'b0000009-0000-4000-8000-000000000000',
          location_id: LOCATION_ID,
          date: suggestionDay(),
        }),
      ],
    })
    renderApp(['/'], signedIn({ workout: workout.clients, restDays: createFakeRestDayClient() }))

    const week = cardOf('This week')
    expect(await within(week).findByText(/^Current streak: \d+ days?/)).toBeInTheDocument()
    await waitFor(() =>
      expect(within(week).getByRole('list', { name: 'This week' }).children).toHaveLength(7),
    )
    expect(week.textContent).not.toMatch(/of\s7\sdays|days trained/)
  })

  it('U07: in-card actions share the card width as one compact group', async () => {
    const user = userEvent.setup()
    await populatedHome()

    const rest = await within(cardOf('This week')).findByRole('region', { name: 'Rest day' })
    const mark = within(rest).getByRole('button', { name: 'Mark Rest Day' })
    expect(mark.closest('.clr-action-group')).not.toBeNull()
    await user.click(mark)

    const save = within(rest).getByRole('button', { name: 'Save rest day' })
    const cancel = within(rest).getByRole('button', { name: 'Cancel' })
    const group = save.closest('.clr-action-group')
    expect(group).not.toBeNull()
    expect(group).toContainElement(cancel)
    // The reason and its actions are one label/control group.
    expect(group!.parentElement).toHaveClass('clr-stack', 'clr-stack--tight')
    expect(group!.parentElement).toContainElement(within(rest).getByLabelText('Reason'))
  })

  it('U08: each Home empty state is one statement, with no standing explanation', async () => {
    const user = userEvent.setup()
    renderApp(['/'], signedIn({ workout: createWorkoutDouble({ session: null }).clients }))

    const recents = await screen.findByText(RECENT_EMPTY_TITLE)
    expect(recents.parentElement!.children).toHaveLength(1)
    expect(within(cardOf('Train today')).queryByText(/Compose a session/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Favorites' }))
    const favorites = await screen.findByText(FAVORITES_EMPTY_TITLE)
    // The message says what to do, without restating the title.
    expect(favorites.parentElement).toHaveTextContent(FAVORITES_EMPTY)
    expect(FAVORITES_EMPTY).not.toMatch(/no favorites/i)
  })

  it('arrives as one staggered set, once, and not again for an inline update', async () => {
    const user = userEvent.setup()
    reduceMotion(false)
    await populatedHome()

    const sets = document.querySelectorAll('.clr-boot')
    expect(sets).toHaveLength(1)
    const set = sets[0] as HTMLElement
    expect(set).toHaveClass('clr-stack')
    // Train today, This week, and the tabs: the groups are the set's children.
    expect(set.children).toHaveLength(3)
    expect(set.children[0]).toContainElement(cardOf('Train today'))
    expect(set.children[1]).toContainElement(cardOf('This week'))
    expect(set.children[2]).toContainElement(screen.getByRole('tablist'))

    // jsdom lacks AnimationEvent; React detects its prefixed fallback at import.
    for (const type of ['animationend', 'webkitAnimationEnd']) {
      const landed = new Event(type, { bubbles: true })
      Object.assign(landed, { animationName: 'clr-boot-in' })
      fireEvent(set.lastElementChild!, landed)
    }
    expect(document.querySelectorAll('.clr-boot')).toHaveLength(0)

    await user.click(screen.getByRole('tab', { name: 'Favorites' }))
    expect(await screen.findByText('No favorites yet')).toBeInTheDocument()
    expect(document.querySelectorAll('.clr-boot')).toHaveLength(0)
  })

  it('is in its final state at once under reduced motion', async () => {
    reduceMotion(true)
    await populatedHome()

    expect(document.querySelectorAll('.clr-boot')).toHaveLength(0)
    expect(cardOf('Train today')).toBeVisible()
  })

  it('uses the public TextAction for the quiet way into History, and frames the rest', async () => {
    await populatedHome()

    const history = screen.getByRole('link', { name: VIEW_HISTORY_LABEL })
    expect(history.tagName).toBe('A')
    expect(history).toHaveClass('clr-text-action')
    expect(history).toHaveAttribute('href', HISTORY_ROUTE)
    expect(cardOf('Recent workouts')).toContainElement(history)

    // Primary and secondary actions keep their frames; neither became a link.
    const generate = screen.getByRole('button', { name: 'Generate workout' })
    expect(generate).toHaveClass('clr-btn')
    expect(generate).not.toHaveClass('clr-text-action')
    expect(generate.closest('.clr-footer')).not.toBeNull()
    // U20: one next-workout entry, so Train Today holds no competing action.
    expect(within(cardOf('Train today')).queryAllByRole('button')).toHaveLength(0)
  })

  it('keeps the tabs, and adds nothing from the package’s worked example', async () => {
    await populatedHome()

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Recent workouts',
      'Favorites',
    ])
    expect(screen.getByRole('tablist').closest('.clr-band')).not.toBeNull()
    expect(screen.getByRole('tablist').closest('.clr-card')).toBeNull()

    for (const placeholder of [
      /view all/i,
      /on pace/i,
      /week \d/i,
      /no workout scheduled/i,
      /\d+ \/ 7 complete/i,
      /paused \d+ minutes ago/i,
    ]) {
      expect(screen.queryByText(placeholder)).not.toBeInTheDocument()
    }
  })
})

/**
 * REQ-007 U20 on the real route tree: one next-workout entry. Train Today
 * states the last request once and a plain suggested focus; the one primary
 * action opens Generate with useful values filled in and never generates —
 * for first-workout, sparse, stale, recovery, changed-goal and missing-place
 * history alike, and while the history read is loading or failed.
 *
 * Days are counted back from today rather than pinned to a date, because the
 * suggestion is only made for recent history — a fixture dated in 2026 would
 * stop being recent while the suite kept passing.
 */
describe('Home’s one next-workout entry (REQ-007, U20)', () => {
  const GYM_ID = '00000000-0000-4000-8000-000000000011'

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

  /** A returning athlete standing on Strength, with a default place and the gym. */
  function renderHome(
    historyRows: readonly WorkoutSessionRow[],
    { goal = 'strength' as Profile['goal_preset'] } = {},
  ) {
    const cache = new QueryClient()
    cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile({ goal_preset: goal }))
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [
      fixtureLocation(),
      fixtureLocation({ id: GYM_ID, name: 'The gym', is_default: false }),
    ])
    const generation = createFakeGenerationClient()
    const workout = createWorkoutDouble({ session: null, historyRows })
    renderApp(['/'], signedIn({ workout: workout.clients, generation, queryClient: cache }))

    return { user: userEvent.setup(), generation }
  }

  const trainToday = () => cardOf('Train today')
  const primary = () => screen.getByRole('button', { name: GENERATE_ACTION_LABEL })
  const place = () => screen.getByRole('combobox', { name: /Place/ })
  const minutes = () => screen.getByLabelText(/Time available/i)

  async function openGenerate(user: ReturnType<typeof userEvent.setup>) {
    await user.click(primary())
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Generate' }),
    ).toBeInTheDocument()
  }

  function cardOf(heading: string): HTMLElement {
    return screen.getByRole('heading', { level: 2, name: heading }).closest<HTMLElement>('.clr-card')!
  }

  it('states the last request once, a plain suggested focus, and one primary action', async () => {
    const { user, generation } = renderHome([
      completed(1, 1, {
        session_focus: 'lower_body',
        requested_duration_mins: 35,
        requested_intensity: 6,
        location_id: GYM_ID,
      }),
      completed(2, 5, { session_focus: 'lower_body' }),
      completed(3, 9, { session_focus: 'lower_body' }),
      completed(4, 20, { session_focus: 'upper_body' }),
    ])

    const card = within(trainToday())
    expect(
      await card.findByText(`${LAST_REQUEST_LABEL}: Lower body · 35 minutes · intensity 6.`),
    ).toBeInTheDocument()
    expect(
      card.getByText(`${SUGGESTION_LABEL}: Upper body. Last trained 20 days ago.`),
    ).toBeInTheDocument()

    // Once: the request's details appear nowhere else on Home.
    expect(screen.getAllByText(/35 minutes/)).toHaveLength(1)
    // U06: each part keeps its number with its unit.
    expect(trainToday().textContent).toContain('35\xa0minutes · intensity\xa06')
    // One entry: the card holds no action of its own, and nothing else offers one.
    expect(card.queryAllByRole('button')).toHaveLength(0)
    for (const retired of ['Quick start', 'Use this', 'Dismiss']) {
      expect(screen.queryByRole('button', { name: retired })).not.toBeInTheDocument()
    }
    expect(primary()).toHaveClass('clr-btn')
    expect(primary().closest('.clr-footer')).not.toBeNull()

    await openGenerate(user)

    // Prefilled: the request's minutes and place, the recommended focus and
    // history's intensity — and nothing has been sent.
    expect(minutes()).toHaveValue(35)
    expect(place()).toHaveValue(GYM_ID)
    expect(screen.getByText('Upper body')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Anchor' })).not.toBeInTheDocument()
    expect(screen.getByRole('slider')).toHaveValue('7')
    expect(generation.calls).toEqual([])

    // The athlete's own press is what sends, with the carried values.
    await user.click(screen.getByRole('button', { name: /generate workout/i }))
    await waitFor(() => expect(generation.calls).toHaveLength(1))
    expect(generation.calls[0]).toMatchObject({
      goal: 'strength',
      focus: 'upper_body',
      requested_duration_mins: 35,
      requested_intensity: 7,
      location_id: GYM_ID,
    })
  })

  it('first workout: clear guidance, and Generate opens on its own defaults', async () => {
    const { user, generation } = renderHome([])

    await screen.findByText(RECENT_EMPTY_TITLE)
    const card = within(trainToday())
    expect(card.getByText(FIRST_WORKOUT_GUIDANCE)).toBeInTheDocument()
    expect(card.queryByText(new RegExp(`^${LAST_REQUEST_LABEL}:`))).not.toBeInTheDocument()

    await openGenerate(user)
    expect(minutes()).toHaveValue(45)
    expect(place()).toHaveValue(fixtureLocation().id)
    expect(screen.getByRole('group', { name: 'Anchor' })).toBeInTheDocument()
    expect(generation.calls).toEqual([])
  })

  it('sparse: one completed session today is enough to suggest from', async () => {
    renderHome([completed(1, 0, { session_focus: 'lower_body' })])

    const card = within(trainToday())
    expect(
      await card.findByText(`${SUGGESTION_LABEL}: Upper body. Not in your recent workouts.`),
    ).toBeInTheDocument()
    expect(card.getByText(new RegExp(`^${LAST_REQUEST_LABEL}: Lower body`))).toBeInTheDocument()
  })

  it('stale: keeps the last request, asks for a focus, and carries its minutes', async () => {
    const { user, generation } = renderHome([
      completed(1, 22, { session_focus: 'lower_body', requested_duration_mins: 50 }),
      completed(2, 30, { session_focus: 'upper_body' }),
    ])

    const card = within(trainToday())
    expect(await card.findByText(STALE_HISTORY_GUIDANCE)).toBeInTheDocument()
    expect(card.queryByText(new RegExp(`^${SUGGESTION_LABEL}:`))).not.toBeInTheDocument()

    await openGenerate(user)
    expect(minutes()).toHaveValue(50)
    expect(screen.getByRole('group', { name: 'Anchor' })).toBeInTheDocument()
    expect(generation.calls).toEqual([])
  })

  it('recovery: says the last one was Recovery, and the next opens as an ordinary day', async () => {
    const { user, generation } = renderHome([
      completed(1, 1, {
        goal_preset: 'active_recovery',
        session_focus: 'full_body',
        requested_duration_mins: 20,
        requested_intensity: 2,
        effective_intensity: 2,
      }),
    ])

    expect(
      await within(trainToday()).findByText(
        `${LAST_REQUEST_LABEL}: Full body · 20 minutes · intensity 2 · Recovery.`,
      ),
    ).toBeInTheDocument()

    await openGenerate(user)
    expect(minutes()).toHaveValue(20)
    expect(screen.getByRole('button', { name: 'Recovery session' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(generation.calls).toEqual([])
  })

  it('changed goal: names no stored Goal, and Generate uses the standing one', async () => {
    const { user, generation } = renderHome(
      [completed(1, 1, { goal_preset: 'hypertrophy', session_focus: 'lower_body' })],
      { goal: 'conditioning' },
    )

    const card = within(trainToday())
    await card.findByText(new RegExp(`^${LAST_REQUEST_LABEL}:`))
    expect(trainToday().textContent).not.toMatch(/hypertrophy|goal/i)

    await openGenerate(user)
    await user.click(screen.getByRole('button', { name: /generate workout/i }))
    await waitFor(() => expect(generation.calls).toHaveLength(1))
    expect(generation.calls[0]).toMatchObject({ goal: 'conditioning' })
  })

  it('missing place: the request opens Generate on the default place', async () => {
    const { user } = renderHome([
      completed(1, 1, { location_id: null, requested_duration_mins: 30 }),
    ])

    await within(trainToday()).findByText(new RegExp(`^${LAST_REQUEST_LABEL}:`))
    await openGenerate(user)
    expect(minutes()).toHaveValue(30)
    expect(place()).toHaveValue(fixtureLocation().id)
  })

  it.each([
    ['still loading', () => new Promise<never>(() => {})],
    ['failed', async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED))],
  ] as const)('opens Generate on its defaults while the history read is %s', async (state, read) => {
    const user = userEvent.setup()
    const generation = createFakeGenerationClient()
    const workout = createWorkoutDouble({ session: null, history: { page: read } })
    renderApp(['/'], signedIn({ workout: workout.clients, generation }))

    const card = within(trainToday())
    if (state === 'failed') {
      expect(await card.findByText('Your last workout didn’t load')).toBeInTheDocument()
      expect(card.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    } else {
      expect(await card.findByText('Reading your last workout')).toBeInTheDocument()
    }

    await openGenerate(user)
    expect(minutes()).toHaveValue(45)
    expect(generation.calls).toEqual([])
  })
})
