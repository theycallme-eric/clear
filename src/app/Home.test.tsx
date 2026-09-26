import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  SUGGESTION_DISMISSAL_STORAGE_KEY,
  suggestionDay,
} from '../state/session-suggestion'
import { makeSessionRow } from '../test/factories'
import { createFakeGenerationClient } from '../test/generation-double'
import { renderApp, signedIn } from '../test/render'
import { createWorkoutDouble } from '../test/workout-double'
import { PREFILL_NOTICE } from './Generate'
import { SUGGESTION_EMPTY } from './Home'

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
          focus: 'upper_body',
          requested_duration_mins: 35,
          requested_intensity: 6,
          location_id: LOCATION_ID,
          notes: null,
        },
      ])
    })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
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
