/**
 * TASK-003 (REQ-003, REQ-004) on the real route tree at `/`: Home's actions
 * and copy, the streak and week-strip semantics they must not disturb, and the
 * recent workout row's hierarchy.
 *
 * jsdom runs no stylesheet, so the row's order, its type steps and the absent
 * link rule are proved from the DOM and inline token styles; what they look
 * like rendered is the browser lane's to prove.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ok } from '../state/errors'
import { REST_DAY_REASON_EFFECTS } from '../state/rest-days'
import type { WorkoutSessionRow } from '../state/schemas'
import { FIRST_WORKOUT_GUIDANCE, suggestionDay } from '../state/session-suggestion'
import { makeSessionRow } from '../test/factories'
import { createFakeGenerationClient } from '../test/generation-double'
import { renderApp, signedIn } from '../test/render'
import { createFakeRestDayClient } from '../test/rest-day-double'
import { createFakeSummaryClient, fixtureStreak } from '../test/summary-double'
import { createWorkoutDouble } from '../test/workout-double'
import {
  GENERATE_ACTION_LABEL,
  LAST_REQUEST_LABEL,
  RECENT_WORKOUTS_LABEL,
  SUGGESTION_LABEL,
} from './Home'

const LOCATION_ID = 'd0000001-0000-4000-8000-000000000000'
const REMOVED_PROMPT = 'Not training today?'

function daysAgo(days: number): string {
  const [year, month, date] = suggestionDay().split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10)
}

function completed(index: number, daysBack: number, overrides: Partial<WorkoutSessionRow> = {}) {
  const day = daysAgo(daysBack)
  return makeSessionRow({
    id: `c000000${index}-0000-4000-8000-000000000000`,
    location_id: LOCATION_ID,
    date: day,
    created_at: `${day}T08:00:00.000Z`,
    started_at: `${day}T09:00:00.000Z`,
    completed_at: `${day}T10:00:00.000Z`,
    ...overrides,
  })
}

/** Given up on after some work: History's `partial`. */
function abandonedPartway(index: number, daysBack: number, overrides: Partial<WorkoutSessionRow> = {}) {
  const day = daysAgo(daysBack)
  return completed(index, daysBack, {
    completed_at: null,
    abandoned_at: `${day}T09:30:00.000Z`,
    actual_duration_mins: null,
    ...overrides,
  })
}

/** Given up on before the first set: History's `unstarted`. */
function abandonedUnstarted(index: number, daysBack: number, overrides: Partial<WorkoutSessionRow> = {}) {
  return abandonedPartway(index, daysBack, { started_at: null, ...overrides })
}

function renderHome(
  historyRows: readonly WorkoutSessionRow[],
  options: { streak?: ReturnType<typeof fixtureStreak> } = {},
) {
  const generation = createFakeGenerationClient()
  const restDays = createFakeRestDayClient()
  const workout = createWorkoutDouble({ session: null, historyRows })
  const summary =
    options.streak === undefined
      ? undefined
      : createFakeSummaryClient({ streak: async () => ok(options.streak!) })
  renderApp(
    ['/'],
    signedIn({ workout: workout.clients, generation, restDays, summary }),
  )
  return { user: userEvent.setup(), generation, restDays }
}

function cardOf(heading: string): HTMLElement {
  const title = screen.getByRole('heading', { level: 2, name: heading })
  return title.closest<HTMLElement>('.clr-card')!
}

function todayCell(): HTMLElement {
  const strip = screen.getByRole('list', { name: 'This week' })
  return within(strip).getByText(/\(today\)/).closest('li')!
}

describe('Home actions and copy (REQ-003)', () => {
  it('AC-009: drops "Not training today?" and keeps Mark Rest Day and its save', async () => {
    const { user, restDays } = renderHome([completed(1, 1)])

    const rest = await screen.findByRole('region', { name: 'Rest day' })
    const trigger = await within(rest).findByRole('button', { name: 'Mark Rest Day' })
    expect(screen.queryByText(REMOVED_PROMPT)).toBeNull()
    expect(document.body).not.toHaveTextContent(REMOVED_PROMPT)

    // The existing disclosure, reason and write are unchanged.
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    await user.selectOptions(within(rest).getByLabelText('Reason'), 'sick')
    await user.click(within(rest).getByRole('button', { name: 'Save rest day' }))

    await waitFor(() =>
      expect(restDays.markCalls).toEqual([{ day: suggestionDay(), reason: 'sick', note: null }]),
    )
    expect(await within(rest).findByText('Today: Unwell.')).toBeInTheDocument()
    expect(within(rest).getByRole('status')).toHaveTextContent('Rest day saved.')
    expect(within(rest).getByRole('button', { name: 'Change reason' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(REMOVED_PROMPT)
    await waitFor(() => expect(todayCell()).toHaveAttribute('data-day-state', 'rest'))
  })

  it('AC-010: history but nothing today shows the returning-user action and Mark Rest Day', async () => {
    renderHome([completed(1, 1, { session_focus: 'lower_body' })])

    const train = cardOf('Train today')
    expect(await within(train).findByText(new RegExp(`^${LAST_REQUEST_LABEL}:`))).toBeInTheDocument()
    expect(within(train).getByText(new RegExp(`^${SUGGESTION_LABEL}:`))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: GENERATE_ACTION_LABEL })).toBeEnabled()
    expect(
      await within(cardOf('This week')).findByRole('button', { name: 'Mark Rest Day' }),
    ).toBeInTheDocument()
    expect(todayCell()).not.toHaveAttribute('data-day-state', 'workout')
  })

  for (const { label, row } of [
    { label: 'abandoned partway', row: abandonedPartway },
    { label: 'abandoned before starting', row: abandonedUnstarted },
  ]) {
    it(`AC-010: ${label} history returns to Generate without inventing a completed request`, async () => {
      const stored = row(1, 1, { title: 'Earlier attempt', requested_duration_mins: 20 })
      const { user, generation } = renderHome([stored])
      await screen.findByRole('link', { name: stored.title })

      const train = within(cardOf('Train today'))
      expect(await train.findByText('Choose a focus and the rest is filled in.')).toBeInTheDocument()
      expect(train.queryByText(FIRST_WORKOUT_GUIDANCE)).toBeNull()
      expect(train.queryByText(new RegExp(`^${LAST_REQUEST_LABEL}:`))).toBeNull()
      expect(train.queryByText(new RegExp(`^${SUGGESTION_LABEL}:`))).toBeNull()
      expect(train.queryAllByRole('button')).toHaveLength(0)
      expect(train.queryAllByRole('link')).toHaveLength(0)
      expect(screen.getByRole('button', { name: GENERATE_ACTION_LABEL })).toBeEnabled()
      expect(await screen.findByRole('button', { name: 'Mark Rest Day' })).toBeEnabled()
      expect(todayCell()).not.toHaveAttribute('data-day-state', 'workout')
      expect(generation.calls).toEqual([])

      await user.click(screen.getByRole('button', { name: GENERATE_ACTION_LABEL }))
      await screen.findByRole('heading', { level: 1, name: 'Generate workout' })
      const minutes = screen.getByLabelText(/Time available/i)
      // An unfinished request is history, but not a completed prior to prefill.
      expect(minutes).toHaveValue(45)
      expect(screen.getByRole('group', { name: 'Anchor' })).toBeInTheDocument()
      await user.clear(minutes)
      await user.type(minutes, '30')
      expect(minutes).toHaveValue(30)
      expect(generation.calls).toEqual([])
    })
  }

  it('AC-010: genuinely empty history retains first-workout guidance', async () => {
    const { generation } = renderHome([])
    const train = within(cardOf('Train today'))
    expect(await train.findByText(FIRST_WORKOUT_GUIDANCE)).toBeInTheDocument()
    expect(train.queryByText('Choose a focus and the rest is filled in.')).toBeNull()
    expect(train.queryByText(new RegExp(`^${LAST_REQUEST_LABEL}:`))).toBeNull()
    expect(train.queryByText(new RegExp(`^${SUGGESTION_LABEL}:`))).toBeNull()
    expect(screen.getByRole('button', { name: GENERATE_ACTION_LABEL })).toBeEnabled()
    expect(generation.calls).toEqual([])
  })

  it('AC-010: trained today keeps the existing rule — no rest-day affordance, same action', async () => {
    renderHome([completed(1, 0)])

    await waitFor(() => expect(todayCell()).toHaveAttribute('data-day-state', 'workout'))
    const week = cardOf('This week')
    expect(within(week).queryByRole('region', { name: 'Rest day' })).toBeNull()
    expect(within(week).queryByRole('button', { name: 'Mark Rest Day' })).toBeNull()
    expect(document.body).not.toHaveTextContent(REMOVED_PROMPT)
    expect(screen.getByRole('button', { name: GENERATE_ACTION_LABEL })).toBeEnabled()
    expect(
      within(cardOf('Train today')).getByText(new RegExp(`^${LAST_REQUEST_LABEL}:`)),
    ).toBeInTheDocument()
  })

  it('AC-011: the streak is the current run across weeks, and the strip is not a session count', async () => {
    // Twelve qualifying days reach back past this week; only today is in the strip.
    const streak = fixtureStreak({
      days: 12,
      today: suggestionDay(),
      includesToday: true,
      lastTrainingDay: suggestionDay(),
      trainingDays: Array.from({ length: 12 }, (_, index) => daysAgo(index)),
    })
    renderHome(
      [completed(1, 0), completed(2, 0, { id: 'c0000009-0000-4000-8000-000000000000' })],
      { streak },
    )

    const week = cardOf('This week')
    expect(await within(week).findByText(/^Current streak: 12 days$/)).toBeInTheDocument()
    await waitFor(() => expect(todayCell()).toHaveAttribute('data-day-state', 'workout'))

    // Two sessions today are still one trained day, and the week states no total.
    const strip = within(week).getByRole('list', { name: 'This week' })
    expect(strip.children).toHaveLength(7)
    expect(strip.querySelectorAll('[data-day-state="workout"]')).toHaveLength(1)
    expect(week.textContent).not.toMatch(/\b\d+\s*(sessions?|workouts?)\b|of\s7|days trained|best|total/i)
  })

  it('AC-011: the rest/pause policy is the picker’s existing helper, unchanged', async () => {
    const { user } = renderHome([])
    await user.click(await screen.findByRole('button', { name: 'Mark Rest Day' }))
    const picker = screen.getByRole('combobox', { name: 'Reason' })
    expect(picker).toHaveAccessibleDescription(REST_DAY_REASON_EFFECTS.rest)
    await user.selectOptions(picker, 'vacation')
    expect(picker).toHaveAccessibleDescription(REST_DAY_REASON_EFFECTS.vacation)
    expect(REST_DAY_REASON_EFFECTS.vacation).toBe('Pauses your streak for as long as it lasts.')
    expect(REST_DAY_REASON_EFFECTS.rest).toMatch(/Keeps your streak/)
  })

  it('AC-012: Generate stays the explicit, editable entry and the empty-week copy is kept', async () => {
    const { user, generation } = renderHome([completed(1, 1, { requested_duration_mins: 35 })])

    const train = cardOf('Train today')
    await within(train).findByText(new RegExp(`^${SUGGESTION_LABEL}:`))
    // No direct entry: the suggestion card holds no action of its own.
    expect(within(train).queryAllByRole('button')).toHaveLength(0)
    expect(within(train).queryAllByRole('link')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: GENERATE_ACTION_LABEL }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Generate workout' }),
    ).toBeInTheDocument()
    const minutes = screen.getByLabelText(/Time available/i)
    expect(minutes).toHaveValue(35)
    await user.clear(minutes)
    await user.type(minutes, '50')
    expect(minutes).toHaveValue(50)
    expect(generation.calls).toEqual([])
  })

  it('AC-012: the deferred empty-week secondary copy is unchanged', async () => {
    renderHome([])

    expect(
      await within(cardOf('This week')).findByText('No sessions this week yet.'),
    ).toBeInTheDocument()
  })
})

describe('Recent workout rows (REQ-004)', () => {
  function rows(): HTMLElement[] {
    const list = screen.getByRole('list', { name: RECENT_WORKOUTS_LABEL })
    return Array.from(list.children) as HTMLElement[]
  }

  function part(row: HTMLElement, name: string): HTMLElement {
    const found = row.querySelector<HTMLElement>(`[data-part="${name}"]`)
    if (found === null) throw new Error(`row has no ${name}`)
    return found
  }

  const history = () => [
    completed(1, 1, { title: 'Upper-body strength session', session_focus: 'upper_body' }),
    abandonedPartway(2, 2, { title: 'Lower-body power Session' }),
    abandonedUnstarted(3, 3, { title: 'Full-body circuit' }),
  ]

  it('AC-013: title first and smaller, then status and date together, then readable metrics', async () => {
    renderHome(history())

    await screen.findByRole('link', { name: 'Upper-body strength' })
    const [row] = rows()
    const title = part(row, 'title')
    const statusDate = part(row, 'status-date')
    const metrics = part(row, 'metrics')

    // Order: title, then status+date, then metrics, and nothing between.
    const children = Array.from(row.children)
    expect(children).toEqual([title, statusDate, metrics])
    expect(title.tagName).toMatch(/^H[2-6]$/)

    // Smaller than History's h5 title.
    expect(title.style.fontSize).toBe('var(--label-md-size)')
    expect(title.style.fontSize).not.toBe('var(--heading-h5-size)')

    // Status and date share one line. B05-01.5: centred, not baseline-aligned,
    // so the text-less glyph cannot hang the date below the status word.
    expect(statusDate.style.alignItems).toBe('center')
    expect(part(statusDate, 'status')).toHaveTextContent('Completed')
    expect(part(statusDate, 'date')).toHaveTextContent(/^\w{3} \d{1,2} \w{3} \d{4}$/)

    // Metrics are a step up from the data labels, in paragraph colour.
    expect(metrics.style.fontSize).toBe('var(--label-sm-size)')
    expect(metrics.style.color).toBe('var(--text-paragraph)')
    expect(metrics).toHaveTextContent(/Upper body/)
    expect(metrics).toHaveTextContent(/Requested 45\xa0?min|Requested 45 min/)
    expect(metrics).toHaveTextContent(/Intensity 7\/10/)
  })

  it('AC-014: no "session" word and no link underline in recent rows', async () => {
    renderHome(history())

    const link = await screen.findByRole('link', { name: 'Upper-body strength' })
    expect(link).toHaveAttribute('href', '/history/c0000001-0000-4000-8000-000000000000')
    expect(link.style.borderBottom).toMatch(/^0(px)?/)
    expect(link.style.textDecoration === '' || link.style.textDecoration === 'none').toBe(true)

    for (const row of rows()) {
      expect(row.textContent).not.toMatch(/\bsession\b/i)
    }
    expect(screen.getByRole('link', { name: 'Lower-body power' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Full-body circuit' })).toBeInTheDocument()
  })

  it('AC-015: completed and abandoned rows stay distinct by word, glyph and tone', async () => {
    renderHome(history())

    await screen.findByRole('link', { name: 'Upper-body strength' })
    const [done, partway, unstarted] = rows()
    expect(done).toHaveAttribute('data-status', 'completed')
    expect(partway).toHaveAttribute('data-status', 'partial')
    expect(unstarted).toHaveAttribute('data-status', 'unstarted')

    const status = (row: HTMLElement) => part(row, 'status')
    expect(status(done)).toHaveTextContent('Completed')
    expect(status(partway)).toHaveTextContent('Partial')
    expect(status(unstarted)).toHaveTextContent('Not started')

    // Each carries its own glyph, so colour is never the only cue.
    const glyph = (row: HTMLElement) => status(row).querySelector('[aria-hidden="true"] svg')!.outerHTML
    expect(new Set([glyph(done), glyph(partway), glyph(unstarted)]).size).toBe(3)

    // And the completed tone differs from an abandoned one.
    expect(status(done).style.color).toBe('var(--text-selected)')
    expect(status(partway).style.color).not.toBe(status(done).style.color)
    expect(status(unstarted).style.color).not.toBe(status(done).style.color)
  })

  it('leaves History\'s own chronology row unchanged', async () => {
    renderApp(
      ['/history'],
      signedIn({ workout: createWorkoutDouble({ session: null, historyRows: history() }).clients }),
    )

    const link = await screen.findByRole('link', { name: 'Upper-body strength session' })
    const row = link.closest('li')!
    expect(row.querySelector('[data-part="head"]')).not.toBeNull()
    expect(row.querySelector('[data-part="status-date"]')).toBeNull()
  })
})
