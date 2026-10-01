import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { HISTORY_PAGE_SIZE, type HistoryClient } from '../data/history'
import { createError, err, ok, ErrorCode } from '../state/errors'
import type { WorkoutSessionRow } from '../state/schemas'
import { makeSessionRow } from '../test/factories'
import { renderApp, signedIn } from '../test/render'
import { createWorkoutDouble } from '../test/workout-double'
import { screenAtmosphere } from './atmosphere'
import {
  HISTORY_BACK_LABEL,
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

describe('History route', () => {
  it('mounts /history behind Protected at the atmosphere the table records', async () => {
    const { container } = renderHistory({}, sessionRows(2))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'History' }),
    ).toBeInTheDocument()
    expect(await historyList()).toBeInTheDocument()
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

  it('offers a way back to Home', async () => {
    const user = userEvent.setup()
    renderHistory({}, sessionRows(1))

    await historyList()
    await user.click(screen.getByRole('button', { name: HISTORY_BACK_LABEL }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Today' }),
    ).toBeInTheDocument()
  })
})
