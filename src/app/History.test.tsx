import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { HISTORY_PAGE_SIZE, type HistoryClient } from '../data/history'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { createError, err, ok, ErrorCode } from '../state/errors'
import type { WorkoutSessionRow } from '../state/schemas'
import { makeSessionRow } from '../test/factories'
import { renderApp, signedIn } from '../test/render'
import {
  createWorkoutDouble,
  reconstructionFixture,
  savedWorkoutFixture,
  type WorkoutDoubleOptions,
} from '../test/workout-double'
import {
  REMOVE_FAVORITE_CANCEL,
  REMOVE_FAVORITE_CONFIRM,
  REMOVE_FAVORITE_FAILED,
  REMOVE_FAVORITE_LABEL,
  REMOVE_FAVORITE_TITLE,
} from '../ui/favorite-list'
import { screenAtmosphere } from './atmosphere'
import { SAVE_FAVORITE_LABEL, SAVED_FAVORITE_LABEL } from './FavoriteToggle'
import { SESSION_DETAIL_BACK_LABEL } from './SessionDetail'
import {
  HISTORY_BACK_LABEL,
  HISTORY_EMPTY_ACTION,
  HISTORY_EMPTY_TITLE,
  HISTORY_ERROR_TITLE,
  HISTORY_FILTER_LABEL,
  HISTORY_LIST_LABEL,
  HISTORY_LOAD_MORE_LABEL,
  HISTORY_LOADING_LABEL,
  HISTORY_NO_MATCH_ACTION,
  HISTORY_NO_MATCH_TITLE,
} from './History'

/**
 * HIST-01 on the real route tree. Every case enters by URL, so each one is also
 * a direct navigation to `/history` through `Protected`.
 */

function sessionRow(index: number, day: string): WorkoutSessionRow {
  const id = `b${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`
  return makeSessionRow({
    id,
    date: day,
    title: `Session ${index}`,
    completed_at: `${day}T18:30:00.000Z`,
    created_at: `${day}T17:00:00.000Z`,
  })
}

/** `count` completed sessions, newest first, one every other day. */
function sessionRows(count: number): WorkoutSessionRow[] {
  const newest = Date.UTC(2026, 8, 24)
  return Array.from({ length: count }, (_, index) =>
    sessionRow(
      index + 1,
      new Date(newest - index * 2 * 86_400_000).toISOString().slice(0, 10),
    ),
  )
}

/** A history client over `rows` that remembers every limit it was asked for. */
function recordingHistory(
  rows: readonly WorkoutSessionRow[],
  first?: () => ReturnType<HistoryClient['page']>,
) {
  const limits: number[] = []
  const page: HistoryClient['page'] = async (_userId, query = {}) => {
    const limit = query.limit ?? HISTORY_PAGE_SIZE
    limits.push(limit)
    if (limits.length === 1 && first !== undefined) return first()
    return ok({ sessions: rows.slice(0, limit), hasMore: rows.length > limit })
  }
  return { limits, history: { page } }
}

function renderHistory(history: Partial<HistoryClient>, historyRows?: WorkoutSessionRow[]) {
  const workout = createWorkoutDouble({ session: null, history, historyRows })
  return renderApp(['/history'], signedIn({ workout: workout.clients }))
}

function historyList() {
  return screen.findByRole('list', { name: HISTORY_LIST_LABEL })
}

/** The one card the collection lives in, found by the heading inside it. */
function historyCard(): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: HISTORY_LIST_LABEL })
  const body = heading.closest<HTMLElement>('.clr-card__body')
  if (body === null) throw new Error('The history heading is not inside a card')
  return body
}

/** One card, one accent bar, and nothing card-shaped inside it. */
function expectOneCard() {
  const main = screen.getByRole('main')
  expect(main.querySelectorAll('.clr-card')).toHaveLength(1)
  expect(main.querySelectorAll('.clr-card__bar')).toHaveLength(1)
  expect(main.querySelectorAll('.clr-card .clr-card')).toHaveLength(0)
}

describe('History route', () => {
  it('mounts /history behind Protected at the atmosphere the table records', async () => {
    const { container } = renderHistory({}, sessionRows(2))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'History' }),
    ).toBeInTheDocument()
    expect(await historyList()).toBeInTheDocument()
    expect((await historyList()).closest('.clr-list')).toBe(await historyList())
    expect((await historyList()).querySelectorAll(':scope > .clr-list__row').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Session 1' }),
    ).toBeInTheDocument()

    expect(screenAtmosphere('History')).toBe('full')
    expect(container.querySelector('.clr-shell')).toHaveAttribute(
      'data-atmosphere',
      screenAtmosphere('History'),
    )
    expect(document.documentElement.dataset.atmosphere).toBe('full')
  })

  it('survives a refresh: a fresh router on the same URL renders History again', async () => {
    const workout = createWorkoutDouble({ session: null, historyRows: sessionRows(2) })
    const first = renderApp(['/history'], signedIn({ workout: workout.clients }))
    expect(await historyList()).toBeInTheDocument()
    first.unmount()

    renderApp(['/history'], signedIn({ workout: workout.clients }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'History' }),
    ).toBeInTheDocument()
    expect(await historyList()).toBeInTheDocument()
  })

  it('does not render for a signed-out visitor', async () => {
    renderApp(['/history'])

    await waitFor(() => expect(document.documentElement.dataset.atmosphere).toBe('full'))
    expect(screen.queryByRole('heading', { name: 'History' })).not.toBeInTheDocument()
  })

  it('shows the loading state while the read is in flight', async () => {
    renderHistory({ page: () => new Promise(() => {}) })

    expect(await screen.findByText(HISTORY_LOADING_LABEL)).toBeInTheDocument()
  })

  it('shows an error whose retry re-runs the read', async () => {
    const user = userEvent.setup()
    const recording = recordingHistory(sessionRows(2), async () =>
      err(createError(ErrorCode.NETWORK_OFFLINE)),
    )
    renderHistory(recording.history)

    expect(await screen.findByText(HISTORY_ERROR_TITLE)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await historyList()).toBeInTheDocument()
    expect(recording.limits).toHaveLength(2)
  })

  it('says no workouts yet, with no filter, for a user who has not trained', async () => {
    renderHistory({}, [])

    expect(await screen.findByText(HISTORY_EMPTY_TITLE)).toBeInTheDocument()
    expect(screen.queryByText(HISTORY_NO_MATCH_TITLE)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(HISTORY_FILTER_LABEL)).not.toBeInTheDocument()
  })

  it('U08: an empty history is one statement with the first workout as its pinned next action', async () => {
    const user = userEvent.setup()
    renderHistory({}, [])

    const statement = await screen.findByText(HISTORY_EMPTY_TITLE)
    // One statement: the empty message carries no second explanatory line.
    expect(statement.parentElement!.children).toHaveLength(1)
    const action = screen.getByRole('button', { name: HISTORY_EMPTY_ACTION })
    expect(action.closest('.clr-footer')).not.toBeNull()

    await user.click(action)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Generate' }),
    ).toBeInTheDocument()
  })

  it('U08: a filter that matches nothing says so once, and its action restores the list', async () => {
    const user = userEvent.setup()
    renderHistory({}, sessionRows(2))

    await historyList()
    await user.selectOptions(screen.getByLabelText(HISTORY_FILTER_LABEL), 'partial')
    const statement = await screen.findByText(HISTORY_NO_MATCH_TITLE)
    expect(statement.parentElement!.children).toHaveLength(1)
    expect(screen.queryByRole('button', { name: HISTORY_EMPTY_ACTION })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: HISTORY_NO_MATCH_ACTION }).closest('.clr-footer')).not.toBeNull()
  })

  it('U06: keeps each row count with its unit', async () => {
    renderHistory({}, sessionRows(1))

    const list = await historyList()
    const kept = [...list.querySelectorAll('.clr-nowrap')].map((node) => node.textContent)
    expect(kept).toContainEqual(expect.stringMatching(/^Requested \d+ min$/))
    expect(kept).toContainEqual(expect.stringMatching(/^Actual \d+ min$/))
    expect(kept).toContainEqual(expect.stringMatching(/^Intensity \d+\/10$/))
  })

  it('U44, AC-C53-01: every row has its title on its own row, its status and date beneath, then its metrics, whatever its status', async () => {
    const LONG =
      'Posterior-chain strength with unilateral accessories and a loaded-carry finisher'
    const day = '2026-09-24'
    const rows = [
      makeSessionRow({
        id: 'b0000011-0000-4000-8000-000000000000',
        date: day,
        title: LONG,
        session_focus: 'lower_body',
        requested_duration_mins: 45,
        actual_duration_mins: 38,
        effective_intensity: 6,
        created_at: `${day}T15:00:00.000Z`,
        completed_at: `${day}T15:40:00.000Z`,
      }),
      makeSessionRow({
        id: 'b0000012-0000-4000-8000-000000000000',
        date: day,
        title: 'Partial upper',
        session_focus: 'upper_body',
        requested_duration_mins: 30,
        actual_duration_mins: null,
        created_at: `${day}T16:00:00.000Z`,
        started_at: `${day}T16:05:00.000Z`,
        completed_at: null,
        abandoned_at: `${day}T16:15:00.000Z`,
      }),
      makeSessionRow({
        id: 'b0000013-0000-4000-8000-000000000000',
        date: day,
        title: 'Never begun',
        requested_duration_mins: 20,
        actual_duration_mins: null,
        created_at: `${day}T17:00:00.000Z`,
        started_at: null,
        completed_at: null,
      }),
    ]
    renderHistory({}, rows)

    const list = await historyList()
    const rowOf = (title: string) =>
      within(list).getByRole('heading', { level: 2, name: title }).closest('li') as HTMLElement

    const expectations = [
      { title: LONG, status: 'Completed', metrics: ['Lower body', 'Requested 45 min', 'Actual 38 min', 'Intensity 6/10'] },
      { title: 'Partial upper', status: 'Partial', metrics: ['Upper body', 'Requested 30 min', 'Intensity 7/10'] },
      { title: 'Never begun', status: 'Not started', metrics: ['Lower body', 'Requested 20 min', 'Intensity 7/10'] },
    ]

    for (const { title, status, metrics } of expectations) {
      const row = rowOf(title)
      const parts = [...row.querySelectorAll('[data-part]')].map((node) =>
        node.getAttribute('data-part'),
      )
      // The same order in every row: the title alone, then status and date
      // together beneath it, then the metrics.
      expect(parts).toEqual(['title', 'status-date', 'status', 'date', 'metrics'])

      const heading = row.querySelector('[data-part="title"]') as HTMLElement
      expect(heading).toBe(within(row).getByRole('heading', { name: title }))
      // Nothing shares the title's row: the status is not inside the heading's line.
      expect(heading.querySelector('[data-part="status"]')).toBeNull()
      expect(heading.parentElement).toBe(row)

      const statusDate = row.querySelector('[data-part="status-date"]') as HTMLElement
      expect(statusDate.querySelector('[data-part="status"]')).toHaveTextContent(status)
      // The status is a word with its glyph, never the glyph alone.
      expect(statusDate.querySelector('[data-part="status"] svg')).not.toBeNull()
      // The stored training day, beside the status.
      expect(statusDate.querySelector('[data-part="date"]')).toHaveTextContent(/^Thu 24 Sep 2026$/)
      expect(row).toHaveAttribute('data-status', expect.stringMatching(/^(completed|partial|unstarted)$/))

      const shown = [...row.querySelectorAll('[data-part="metrics"] .clr-nowrap')].map(
        (node) => node.textContent,
      )
      expect(shown).toEqual(metrics)
    }

    // A long name wraps inside its own row.
    const longTitle = within(rowOf(LONG)).getByRole('heading', { name: LONG })
    expect(longTitle.style.overflowWrap).toBe('anywhere')
    expect(longTitle.style.minWidth).toBe('0px')
  })

  it('REQ-010: lists a legacy session by its label and facts, never its generated overview', async () => {
    const OVERVIEW = 'Squat-led session with unilateral accessory work.'
    const legacy = { ...sessionRow(1, '2026-09-24'), overview: OVERVIEW }
    renderHistory({}, [legacy])

    const list = await historyList()
    expect(within(list).getByRole('heading', { level: 2, name: 'Session 1' })).toBeInTheDocument()
    expect(within(list).getByText(/^Intensity \d+\/10$/)).toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(OVERVIEW)
  })

  it('tells a filter that matches nothing apart from having no workouts', async () => {
    const user = userEvent.setup()
    renderHistory({}, sessionRows(2))

    await historyList()
    await user.selectOptions(screen.getByLabelText(HISTORY_FILTER_LABEL), 'partial')

    expect(await screen.findByText(HISTORY_NO_MATCH_TITLE)).toBeInTheDocument()
    expect(screen.queryByText(HISTORY_EMPTY_TITLE)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: HISTORY_NO_MATCH_ACTION }))
    expect(await historyList()).toBeInTheDocument()
    expect(screen.getByLabelText(HISTORY_FILTER_LABEL)).toHaveValue('all')
  })

  it('renders rest days as their own entries, distinct from sessions', async () => {
    renderHistory({}, sessionRows(2))

    const list = await historyList()
    expect(within(list).getByRole('heading', { name: 'Session 1' })).toBeInTheDocument()
    // The gap between the two sessions is a rest entry: glyph-labelled word,
    // not a session heading, and never a link.
    expect(within(list).getAllByText('Rest').length).toBeGreaterThan(0)
    expect(
      within(list).getAllByRole('heading', { level: 2, name: 'Rest' }).length,
    ).toBeGreaterThan(0)
  })

  it('AC-C53-01 the filter offers All entries, Completed and Partial, and All entries still lists rest runs and never-started workouts', async () => {
    const user = userEvent.setup()
    const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`
    const rows = [
      makeSessionRow({
        id: 'b0000021-0000-4000-8000-000000000000', date: day(24), title: 'Finished lower',
        created_at: `${day(24)}T15:00:00.000Z`, completed_at: `${day(24)}T15:40:00.000Z`,
      }),
      makeSessionRow({
        id: 'b0000022-0000-4000-8000-000000000000', date: day(21), title: 'Stopped upper',
        created_at: `${day(21)}T16:00:00.000Z`, started_at: `${day(21)}T16:05:00.000Z`,
        completed_at: null, abandoned_at: `${day(21)}T16:15:00.000Z`, actual_duration_mins: 9,
      }),
      makeSessionRow({
        id: 'b0000023-0000-4000-8000-000000000000', date: day(19), title: 'Never begun',
        created_at: `${day(19)}T17:00:00.000Z`, started_at: null, completed_at: null,
        actual_duration_mins: null,
      }),
    ]
    renderHistory({}, rows)

    const list = await historyList()
    const filter = screen.getByLabelText(HISTORY_FILTER_LABEL)
    const offered = [...(filter as HTMLSelectElement).options].map((option) => [option.value, option.textContent])
    expect(offered).toEqual([['all', 'All entries'], ['completed', 'Completed'], ['partial', 'Partial']])
    expect(within(filter).queryByRole('option', { name: 'Rest days' })).toBeNull()
    expect(within(filter).queryByRole('option', { name: 'Not started' })).toBeNull()

    // All entries keeps every record: both rest runs and the never-started
    // workout, which keeps its stored status.
    const heading = (title: string) => within(list).getByRole('heading', { level: 2, name: title })
    expect(heading('Finished lower')).toBeInTheDocument()
    expect(heading('Stopped upper')).toBeInTheDocument()
    const unstarted = heading('Never begun').closest('li') as HTMLElement
    expect(unstarted).toHaveAttribute('data-status', 'unstarted')
    expect(unstarted.querySelector('[data-part="status"]')).toHaveTextContent('Not started')
    // The gaps between the three workouts (and any since the newest) are rest runs.
    expect(within(list).getAllByRole('heading', { level: 2, name: 'Rest' }).length).toBeGreaterThanOrEqual(2)
    const everything = within(list).getAllByRole('listitem').length

    // Partial narrows to the stopped workout, with its recorded actual minutes.
    await user.selectOptions(filter, 'partial')
    const partial = await historyList()
    expect(within(partial).getAllByRole('listitem')).toHaveLength(1)
    expect(within(partial).getByRole('heading', { name: 'Stopped upper' })).toBeInTheDocument()
    expect(within(partial).getByText('Actual 9 min')).toBeInTheDocument()

    // Back to All entries: nothing was dropped by narrowing.
    await user.selectOptions(filter, 'all')
    expect(within(await historyList()).getAllByRole('listitem')).toHaveLength(everything)
  })

  it('AC-C53-01 the accepted gallery state ?state=screens draws History’s own card, filter and rows over stored rows in memory', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=screens']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const part = document.querySelector<HTMLElement>('[data-gallery-history]')!
    expect(part).not.toBeNull()
    const scene = within(part)
    expect(scene.getByRole('heading', { name: 'History' })).toBeInTheDocument()
    expect(scene.getByRole('heading', { name: HISTORY_LIST_LABEL })).toBeInTheDocument()

    const filter = scene.getByLabelText(HISTORY_FILTER_LABEL) as HTMLSelectElement
    expect([...filter.options].map((option) => option.textContent)).toEqual(['All entries', 'Completed', 'Partial'])

    const list = scene.getByRole('list', { name: HISTORY_LIST_LABEL })
    const statuses = [...list.querySelectorAll('[data-layout="chronology"]')].map((row) =>
      row.getAttribute('data-status'))
    expect(statuses).toEqual(['completed', 'completed', 'partial', 'unstarted'])
    expect(within(list).getAllByRole('heading', { name: 'Rest' }).length).toBeGreaterThan(0)
    for (const row of list.querySelectorAll('[data-layout="chronology"]')) {
      expect([...row.querySelectorAll('[data-part]')].map((node) => node.getAttribute('data-part')))
        .toEqual(['title', 'status-date', 'status', 'date', 'metrics'])
    }

    await user.selectOptions(filter, 'partial')
    expect(within(scene.getByRole('list', { name: HISTORY_LIST_LABEL })).getAllByRole('listitem')).toHaveLength(1)
    await user.selectOptions(filter, 'all')
    expect(scene.getByRole('list', { name: HISTORY_LIST_LABEL }).querySelectorAll('[data-status="unstarted"]')).toHaveLength(1)
  })

  it('is bounded to a page and load-more widens the window, not the filter', async () => {
    const user = userEvent.setup()
    const rows = sessionRows(HISTORY_PAGE_SIZE + 1)
    const recording = recordingHistory(rows)
    renderHistory(recording.history)

    const list = await historyList()
    expect(within(list).getByRole('heading', { name: 'Session 1' })).toBeInTheDocument()
    expect(
      within(list).queryByRole('heading', { name: `Session ${HISTORY_PAGE_SIZE + 1}` }),
    ).toBeNull()
    expect(recording.limits).toEqual([HISTORY_PAGE_SIZE])

    await user.selectOptions(screen.getByLabelText(HISTORY_FILTER_LABEL), 'completed')
    await user.click(screen.getByRole('button', { name: HISTORY_LOAD_MORE_LABEL }))

    expect(
      await screen.findByRole('heading', { name: `Session ${HISTORY_PAGE_SIZE + 1}` }),
    ).toBeInTheDocument()
    expect(recording.limits).toEqual([HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE * 2])
    expect(screen.getByLabelText(HISTORY_FILTER_LABEL)).toHaveValue('completed')
    // Everything read is now in the window, so there is nothing more to ask for.
    expect(
      screen.queryByRole('button', { name: HISTORY_LOAD_MORE_LABEL }),
    ).not.toBeInTheDocument()
  })

  it('keeps the filter, the list and every other state inside one card', async () => {
    const user = userEvent.setup()
    const recording = recordingHistory(sessionRows(2), async () =>
      err(createError(ErrorCode.NETWORK_OFFLINE)),
    )
    renderHistory(recording.history)

    // Error: the failure is the card's content, not a second frame.
    const failure = await screen.findByText(HISTORY_ERROR_TITLE)
    expect(historyCard()).toContainElement(failure)
    expectOneCard()

    // Populated: bare rows under the card's frame, ruled by the list itself.
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    const list = await historyList()
    expect(historyCard()).toContainElement(list)
    expect(historyCard()).toContainElement(screen.getByLabelText(HISTORY_FILTER_LABEL))
    expect(list).not.toHaveClass('clr-chamfer')
    const rows = list.querySelectorAll(':scope > .clr-list__row')
    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows) {
      expect(row).not.toHaveClass('clr-card')
      expect(row).not.toHaveClass('clr-chamfer')
      expect(row.querySelector('.clr-card')).toBeNull()
    }
    expectOneCard()

    // Filtered to nothing: the same card, still holding the filter.
    await user.selectOptions(screen.getByLabelText(HISTORY_FILTER_LABEL), 'partial')
    expect(historyCard()).toContainElement(await screen.findByText(HISTORY_NO_MATCH_TITLE))
    expect(historyCard()).toContainElement(screen.getByLabelText(HISTORY_FILTER_LABEL))
    expectOneCard()
  })

  it('keeps loading and the first-run empty inside the same card', async () => {
    const pending = renderHistory({ page: () => new Promise(() => {}) })
    const loading = await screen.findByText(HISTORY_LOADING_LABEL)
    expect(historyCard()).toContainElement(loading)
    expect(loading.closest('[role="status"]')).toHaveAttribute('aria-busy', 'true')
    expectOneCard()
    pending.unmount()

    renderHistory({}, [])
    expect(historyCard()).toContainElement(await screen.findByText(HISTORY_EMPTY_TITLE))
    expectOneCard()
  })

  it('offers a way back to Home', async () => {
    const user = userEvent.setup()
    renderHistory({}, sessionRows(1))

    await historyList()
    await user.click(screen.getByRole('button', { name: HISTORY_BACK_LABEL }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Today' }),
    ).toBeInTheDocument()
  })

  it('opens a compatible completed session directly in Review without generating', async () => {
    const user = userEvent.setup()
    const intended = reconstructionFixture({
      sessionId: 'b0000001-0000-4000-8000-000000000000',
      title: 'Session 1',
      state: 'completed',
      reconstruction: 'intended_at_start',
      session: { completed_at: '2026-09-24T09:45:00.000Z' },
      sections: [{ title: 'Main', blocks: [{ exercises: ['completed'] }] }],
    })
    const workout = createWorkoutDouble({
      session: null,
      historyRows: [intended.session],
      sessions: { asIntendedAtStart: async () => ok(intended) },
    })
    renderApp(['/history'], signedIn({ workout: workout.clients }))

    await user.click(await screen.findByRole('link', { name: 'Session 1' }))

    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'History' })).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// U22 · JOURNEY-014 — undoing a favorite from /history/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('History detail — removing a favorite (U22)', () => {
  const row = sessionRow(1, '2026-09-24')
  const detailPath = `/history/${row.id}`

  /** A favorited, completed session opened from the History list. */
  function renderFavorited(favoritesClient: WorkoutDoubleOptions['favoritesClient'] = {}) {
    const removed: string[] = []
    const double = createWorkoutDouble({
      session: null,
      historyRows: [row],
      favorites: [savedWorkoutFixture({ original_session_id: row.id, title: row.title })],
      sessions: {
        asPerformed: async (sessionId) =>
          ok(reconstructionFixture({ sessionId, title: row.title, state: 'completed' })),
      },
      favoritesClient,
    })
    const remove = double.clients.favorites.remove
    double.clients.favorites.remove = (savedWorkoutId) => {
      removed.push(savedWorkoutId)
      return remove(savedWorkoutId)
    }
    renderApp(['/history', detailPath], signedIn({ workout: double.clients }))
    return { double, removed }
  }

  it('asks first, and keeping it changes nothing', async () => {
    const user = userEvent.setup()
    const { double, removed } = renderFavorited()

    await user.click(await screen.findByRole('button', { name: REMOVE_FAVORITE_LABEL }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(REMOVE_FAVORITE_TITLE)
    expect(dialog).toHaveTextContent('The workout itself stays in your history.')
    await user.click(within(dialog).getByRole('button', { name: REMOVE_FAVORITE_CANCEL }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText(SAVED_FAVORITE_LABEL)).toBeInTheDocument()
    expect(removed).toEqual([])
    expect(double.favorites()).toHaveLength(1)
  })

  it('removes the favorite in place and keeps the workout in history', async () => {
    const user = userEvent.setup()
    const { double, removed } = renderFavorited()
    const favoriteId = double.favorites()[0].id

    await user.click(await screen.findByRole('button', { name: REMOVE_FAVORITE_LABEL }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: REMOVE_FAVORITE_CONFIRM }))

    // Same screen, now offering to save again: the cache answered at once.
    expect(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeEnabled()
    expect(screen.queryByText(SAVED_FAVORITE_LABEL)).toBeNull()
    expect(screen.queryByRole('button', { name: REMOVE_FAVORITE_LABEL })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: row.title })).toBeInTheDocument()
    expect(removed).toEqual([favoriteId])
    expect(double.favorites()).toEqual([])

    // The session is still in the record it came from.
    await user.click(screen.getByRole('button', { name: SESSION_DETAIL_BACK_LABEL }))
    const list = await historyList()
    expect(within(list).getByRole('link', { name: row.title })).toBeInTheDocument()
  })

  it('sends one delete however often it is pressed while one is in flight', async () => {
    const user = userEvent.setup()
    let settle: () => void = () => {}
    const { double, removed } = renderFavorited({
      remove: () =>
        new Promise((resolve) => {
          settle = () => resolve(ok(undefined))
        }),
    })

    await user.click(await screen.findByRole('button', { name: REMOVE_FAVORITE_LABEL }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: REMOVE_FAVORITE_CONFIRM,
      }),
    )

    const pending = screen.getByRole('button', { name: REMOVE_FAVORITE_LABEL })
    expect(pending).toBeDisabled()
    expect(pending).toHaveAttribute('aria-busy', 'true')

    settle()
    expect(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeEnabled()
    expect(removed).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(double.favorites()).toHaveLength(1)
  })

  it('reports a failed removal in place and leaves the favorite saved', async () => {
    const user = userEvent.setup()
    renderFavorited({
      remove: async () => err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)),
    })

    await user.click(await screen.findByRole('button', { name: REMOVE_FAVORITE_LABEL }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: REMOVE_FAVORITE_CONFIRM,
      }),
    )

    expect(await screen.findByText(REMOVE_FAVORITE_FAILED)).toBeInTheDocument()
    expect(screen.getByText(SAVED_FAVORITE_LABEL)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REMOVE_FAVORITE_LABEL })).toBeEnabled()
  })
})
