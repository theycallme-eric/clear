import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { HISTORY_PAGE_SIZE, type HistoryClient } from '../data/history'
import { createError, err, ok, ErrorCode } from '../state/errors'
import type { WorkoutSessionRow } from '../state/schemas'
import { makeSessionRow } from '../test/factories'
import { renderApp, signedIn } from '../test/render'
import { createWorkoutDouble, reconstructionFixture } from '../test/workout-double'
import { screenAtmosphere } from './atmosphere'
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
      await screen.findByRole('heading', { level: 1, name: 'Generate workout' }),
    ).toBeInTheDocument()
  })

  it('U08: a filter that matches nothing says so once, and its action restores the list', async () => {
    const user = userEvent.setup()
    renderHistory({}, sessionRows(2))

    await historyList()
    await user.selectOptions(screen.getByLabelText(HISTORY_FILTER_LABEL), 'unstarted')
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

  it('U44: every row groups title and status, then context, then metrics, whatever its status', async () => {
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
      { title: LONG, status: 'Completed', metrics: ['Requested 45 min', 'Actual 38 min', 'Intensity 6/10'] },
      { title: 'Partial upper', status: 'Partial', metrics: ['Requested 30 min', 'Intensity 7/10'] },
      { title: 'Never begun', status: 'Not started', metrics: ['Requested 20 min', 'Intensity 7/10'] },
    ]

    for (const { title, status, metrics } of expectations) {
      const row = rowOf(title)
      const parts = [...row.querySelectorAll('[data-part]')].map((node) =>
        node.getAttribute('data-part'),
      )
      // The same order in every row: head (title + status), context, metrics.
      expect(parts).toEqual(['head', 'status', 'context', 'metrics'])

      const head = row.querySelector('[data-part="head"]') as HTMLElement
      expect(within(head).getByRole('heading', { name: title })).toBeInTheDocument()
      expect(head.querySelector('[data-part="status"]')).toHaveTextContent(status)
      // The status is a word with its glyph, never the glyph alone.
      expect(head.querySelector('[data-part="status"] svg')).not.toBeNull()

      expect(row.querySelector('[data-part="context"]')).toHaveTextContent(/^Thu 24 Sep 2026 · /)
      const shown = [...row.querySelectorAll('[data-part="metrics"] .clr-nowrap')].map(
        (node) => node.textContent,
      )
      expect(shown).toEqual(metrics)
    }

    // A long name wraps inside its row rather than pushing the status away.
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
    await user.selectOptions(screen.getByLabelText(HISTORY_FILTER_LABEL), 'unstarted')

    expect(await screen.findByText(HISTORY_NO_MATCH_TITLE)).toBeInTheDocument()
    expect(screen.queryByText(HISTORY_EMPTY_TITLE)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: HISTORY_NO_MATCH_ACTION }))
    expect(await historyList()).toBeInTheDocument()
    expect(screen.getByLabelText(HISTORY_FILTER_LABEL)).toHaveValue('all')
  })

  it('renders rest days as their own entries, distinct from sessions', async () => {
    const user = userEvent.setup()
    renderHistory({}, sessionRows(2))

    const list = await historyList()
    expect(within(list).getByRole('heading', { name: 'Session 1' })).toBeInTheDocument()
    // The gap between the two sessions is a rest entry: glyph-labelled word,
    // not a session heading, and never a link.
    expect(within(list).getAllByText('Rest').length).toBeGreaterThan(0)
    expect(
      within(list).getAllByRole('heading', { level: 2, name: 'Rest' }).length,
    ).toBeGreaterThan(0)

    await user.selectOptions(screen.getByLabelText(HISTORY_FILTER_LABEL), 'rest')
    const restOnly = await historyList()
    expect(within(restOnly).queryByRole('heading', { name: /^Session/ })).toBeNull()
    expect(within(restOnly).getAllByText('Rest').length).toBeGreaterThan(0)
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
    await user.selectOptions(screen.getByLabelText(HISTORY_FILTER_LABEL), 'unstarted')
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
