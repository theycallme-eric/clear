/**
 * SUM-01 acceptance — the debrief, through the real route tree.
 *
 * What this file is answerable for:
 *
 *   · mood and notes persist to the session row;
 *   · U43: the feeling is one row of numbers 1–5, its words in the accessible
 *     names, keyboard-operable, optional and clearable, and never an effort;
 *   · the copy is a brief acknowledgment and then the debrief;
 *   · the streak is SES-01's derivation, in its own four states;
 *   · U41: the duration and the streak at one enlarged size, and Home's week
 *     (its derivation, its rest marks, its strip) in four states of its own;
 *   · U42: the session title leads, long or short, and "favorite" is said once;
 *   · nothing on the screen is non-functional — no disabled control, no
 *     "coming soon";
 *   · only a completed session reaches the screen;
 *   · save-as-favorite works, and Done returns Home, where the favorite is.
 *
 * Arriving here from a finished workout is `Workout.test.tsx`'s subject; this
 * file starts at `/summary` with Home behind it.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createError, err, ErrorCode, ok } from '../state/errors'
import { favoritesQueryKey } from '../state/favorite-queries'
import type { QueryClient } from '../state/query'
import type { RestDayRow, SavedWorkoutRow } from '../state/schemas'
import { makeSessionRow } from '../test/factories'
import { AppProviders, createWarmQueryClient, signedIn } from '../test/render'
import { createFakeRestDayClient } from '../test/rest-day-double'
import { FIXTURE_USER_ID } from '../test/user-data-double'
import {
  completedSession,
  createFakeSummaryClient,
  fixtureStreak,
  type FakeSummaryClient,
  type FakeSummaryOptions,
} from '../test/summary-double'
import {
  createWorkoutDouble,
  reconstructionFixture,
  savedWorkoutFixture,
  type WorkoutDouble,
  type WorkoutDoubleOptions,
} from '../test/workout-double'
import {
  REMOVE_FAVORITE_CANCEL,
  REMOVE_FAVORITE_CONFIRM,
  REMOVE_FAVORITE_FAILED,
  REMOVE_FAVORITE_LABEL,
  REMOVE_FAVORITE_TITLE,
} from '../ui/favorite-list'
import { FAVORITES_EMPTY_TITLE } from './Home'
import { routes } from './router'
import { FEELING_CLEAR_LABEL } from '../ui/feeling-row'
import {
  DEBRIEF_HEADING,
  SAVE_FAVORITE_FAILED,
  SAVE_FAVORITE_LABEL,
  SAVED_FAVORITE_LABEL,
} from './Summary'

const COMPLETED = completedSession()
const SESSION_ID = COMPLETED.session.id
const TITLE = COMPLETED.session.title
/** U42: the session title heads its result card, acknowledged in the one line. */
const TITLE_HEADING = `${TITLE}, done.`

/** Home's page heading, which is where Done lands. */
const HOME_HEADING = 'Today'
const SUMMARY_HEADING = 'Nice work'
const DONE = 'Save and close'

interface Mounted {
  summary: FakeSummaryClient
  double: WorkoutDouble
  router: ReturnType<typeof createMemoryRouter>
  queryClient: QueryClient
}

function mountSummary(
  options: {
    summary?: FakeSummaryOptions
    workout?: WorkoutDoubleOptions
    restDays?: readonly RestDayRow[]
  } = {},
): Mounted {
  const summary = createFakeSummaryClient(options.summary)
  const double = createWorkoutDouble({
    session: null,
    ...options.workout,
    sessions: {
      // SES-01b's "intended at start" read of the session being debriefed,
      // which is what a favorite is made from.
      asIntendedAtStart: async (sessionId) =>
        ok(
          reconstructionFixture({
            sessionId,
            title: TITLE,
            state: 'completed',
            reconstruction: 'intended_at_start',
            sections: [{ title: 'Main', blocks: [{ exercises: ['completed'] }] }],
          }),
        ),
      ...options.workout?.sessions,
    },
  })
  const router = createMemoryRouter(routes, {
    initialEntries: ['/', '/summary'],
    initialIndex: 1,
  })
  const queryClient = createWarmQueryClient()

  render(
    <AppProviders
      {...signedIn({
        summary,
        workout: double.clients,
        queryClient,
        restDays: createFakeRestDayClient(options.restDays),
      })}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  )

  return { summary, double, router, queryClient }
}

/** The debrief, once the session has loaded. */
async function debrief(
  options: Parameters<typeof mountSummary>[0] = {},
): Promise<Mounted> {
  const mounted = mountSummary(options)
  await screen.findByRole('heading', { name: TITLE_HEADING })
  return mounted
}

// ─────────────────────────────────────────────────────────────────────────────
// Reaching the screen
// ─────────────────────────────────────────────────────────────────────────────

describe('Summary — only a completed session reaches it', () => {
  it('waits for the session rather than rendering an empty debrief', () => {
    mountSummary({ summary: { latest: () => new Promise(() => {}) } })

    expect(screen.getByText('Reading your session')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('sends a visitor with nothing to debrief Home rather than showing an empty shell', async () => {
    const { router } = mountSummary({ summary: { latest: async () => ok(null) } })

    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('offers a retry when the session read fails', async () => {
    let attempts = 0
    const user = userEvent.setup()
    mountSummary({
      summary: {
        latest: async () => {
          attempts += 1
          return attempts === 1
            ? err(createError(ErrorCode.NETWORK_SERVER_ERROR))
            : ok(COMPLETED)
        },
      },
    })

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('That session didn’t load')).toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: TITLE_HEADING })).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The debrief
// ─────────────────────────────────────────────────────────────────────────────

describe('Summary — the debrief', () => {
  it('acknowledges the session briefly and goes straight to the debrief', async () => {
    await debrief()

    expect(screen.getByRole('heading', { level: 1, name: SUMMARY_HEADING })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: TITLE_HEADING })).toBeInTheDocument()
    expect(screen.getByText('42 min')).toBeInTheDocument()

    const moods = within(screen.getByRole('group', { name: 'How do you feel?' }))
    expect(moods.getAllByRole('radio').map((radio) => radio.getAttribute('aria-checked'))).toEqual(
      ['false', 'false', 'false', 'false', 'false'],
    )
    expect(screen.getByRole('textbox', { name: /Notes/ })).toBeInTheDocument()
  })

  it('puts each key number in its own small card, its label the heading inside', async () => {
    await debrief()

    const duration = screen.getByRole('heading', { name: 'Duration' }).closest('.clr-card')
    const streak = (await screen.findByRole('heading', { name: 'Streak' })).closest('.clr-card')
    expect(duration).toBeInTheDocument()
    expect(streak).toBeInTheDocument()
    expect(duration).not.toBe(streak)
    expect(within(duration as HTMLElement).getByText('42 min')).toBeInTheDocument()
    // Inside a card the readout drops its own frame: never a frame in a frame.
    expect(duration?.querySelector('.clr-metric-frame.clr-chamfer')).toBeNull()
    expect(streak?.querySelector('.clr-card .clr-card')).toBeNull()
    // Only the screen title sits on the atmosphere; the session title is carded.
    expect(screen.getByRole('heading', { name: TITLE_HEADING }).closest('.clr-card')).toBeInTheDocument()
  })

  it('U41: draws the duration and the streak side by side at one enlarged size', async () => {
    await debrief()
    await screen.findByText('3 days')

    const grid = document.querySelector('.clr-metric-grid') as HTMLElement
    const values = Array.from(grid.querySelectorAll<HTMLElement>('[data-metric-value]'))
    expect(values.map((value) => value.textContent)).toEqual(['42 min', '3 days'])
    // One size for both, and larger than body copy: a display-face heading step.
    for (const value of values) {
      expect(value.style.fontFamily).toBe('var(--font-display)')
      expect(value.style.fontSize).toBe('var(--heading-h4-size)')
    }
    // The week is not squeezed into half of the grid: it is its own card.
    expect(within(grid).queryByRole('list')).toBeNull()
    const week = screen.getByRole('list', { name: 'This week' })
    expect(week.closest('.clr-card')).not.toBe(grid.closest('.clr-card'))
  })

  it('U41: a duration nothing could measure keeps its card, as a dash with words', async () => {
    await debrief({
      summary: {
        latest: async () => ok({ ...completedSession(), durationMins: null }),
      },
    })

    const duration = screen.getByRole('heading', { name: 'Duration' }).closest('.clr-card')!
    const value = duration.querySelector('[data-metric-value]') as HTMLElement
    expect(value).toHaveTextContent('Not recorded')
    expect(value.querySelector('[aria-hidden="true"]')).toHaveTextContent('–')
  })

  it('keeps the debrief fields in one card, labels inside, and the action pinned', async () => {
    await debrief()

    const form = document.getElementById('summary-debrief') as HTMLElement
    const cards = form.querySelectorAll('.clr-card')
    expect(cards).toHaveLength(1)
    const card = within(cards[0] as HTMLElement)
    expect(card.getByRole('heading', { name: DEBRIEF_HEADING })).toBeInTheDocument()
    expect(card.getByRole('group', { name: 'How do you feel?' })).toBeInTheDocument()
    expect(card.getByRole('textbox', { name: /Notes/ })).toBeInTheDocument()
    expect(card.getByText(/Notes · optional/)).toBeInTheDocument()
    expect(card.queryByRole('button', { name: DONE })).not.toBeInTheDocument()
  })

  it('U43: the feeling is one row of five numbers, its words in the accessible names only', async () => {
    await debrief()
    const group = screen.getByRole('group', { name: 'How do you feel?' })
    const radios = within(group).getAllByRole('radio')

    // The existing meaning, kept for anyone who hears rather than sees it.
    const names = ['1, Spent', '2, Worn', '3, Flat', '4, Ready', '5, Peak']
    expect(radios).toHaveLength(5)
    for (const [index, name] of names.entries()) {
      expect(within(group).getByRole('radio', { name })).toBe(radios[index])
    }
    // What is drawn is the number and nothing else: no face, no repeated word.
    for (const [index, radio] of radios.entries()) {
      const shown = Array.from(radio.querySelectorAll('[aria-hidden="true"]'))
        .map((node) => node.textContent)
        .join('')
      expect(shown).toBe(String(index + 1))
      expect(radio.querySelector('svg:not([aria-hidden="true"])')).toBeNull()
      expect(radio.querySelector('.clr-row > svg')).toBeNull()
      for (const word of ['Spent', 'Worn', 'Flat', 'Ready', 'Peak']) {
        const visible = Array.from(radio.querySelectorAll('*'))
          .filter((node) => !node.closest('.a11y-hidden'))
          .some((node) => node.childNodes.length === 1 && node.textContent === word)
        expect(visible).toBe(false)
      }
    }
    // One row: the strip the five share is the non-wrapping feeling row.
    expect(group).toHaveClass('clr-feeling-row')
    expect(group.querySelectorAll('[role="radiogroup"]')).toHaveLength(1)
  })

  it('U43: the feeling works from the keyboard as one radio group', async () => {
    const user = userEvent.setup()
    const { summary } = await debrief()

    const first = screen.getByRole('radio', { name: '1, Spent' })
    first.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('radio', { name: '3, Flat' })).toBeChecked()
    await user.keyboard('{End}')
    expect(screen.getByRole('radio', { name: '5, Peak' })).toBeChecked()
    // One tab stop: only the chosen option is reachable by Tab.
    const reachable = screen
      .getAllByRole('radio')
      .filter((radio) => radio.getAttribute('tabindex') === '0')
    expect(reachable).toEqual([screen.getByRole('radio', { name: '5, Peak' })])

    await user.click(screen.getByRole('button', { name: DONE }))
    await waitFor(() => expect(summary.saved.map((entry) => entry.debrief.mood)).toEqual([5]))
  })

  it('U43: no answer is allowed, and a chosen or restored feeling can be cleared back to none', async () => {
    const user = userEvent.setup()
    const { summary } = await debrief({
      summary: { latest: async () => ok(completedSession({ mood: 4 })) },
    })

    expect(screen.getByRole('radio', { name: '4, Ready' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: FEELING_CLEAR_LABEL }))

    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
    // The question keeps the caret once the control that cleared it is gone.
    expect(screen.queryByRole('button', { name: FEELING_CLEAR_LABEL })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '1, Spent' }))

    await user.click(screen.getByRole('button', { name: DONE }))
    await waitFor(() =>
      expect(summary.saved).toEqual([
        { sessionId: SESSION_ID, debrief: { mood: null, session_notes: null } },
      ]),
    )
  })

  it('U43: the feeling is saved as the session’s mood and never as an effort value', async () => {
    const user = userEvent.setup()
    const { summary } = await debrief()

    // No effort question sits beside it to be confused with it.
    expect(screen.queryByText(/effort|RPE|exertion/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '2, Worn' }))
    await user.click(screen.getByRole('button', { name: DONE }))

    await waitFor(() => expect(summary.saved).toHaveLength(1))
    const [saved] = summary.saved
    expect(Object.keys(saved?.debrief ?? {}).sort()).toEqual(['mood', 'session_notes'])
    expect(saved?.debrief.mood).toBe(2)
  })

  it('keeps completion associated with the scrolling form', async () => {
    await debrief()

    const done = screen.getByRole('button', { name: DONE })
    expect(done).toHaveAttribute('form', 'summary-debrief')
    expect(done.closest('.clr-scroll-region__foot')).toBeInTheDocument()
    expect(document.getElementById('summary-debrief')).toHaveAttribute('novalidate')
  })

  it('persists the mood and notes to the session row, then returns Home', async () => {
    const user = userEvent.setup()
    const { summary, router } = await debrief()

    await user.click(screen.getByRole('radio', { name: '4, Ready' }))
    await user.type(screen.getByRole('textbox', { name: /Notes/ }), '  Squats moved well.  ')
    await user.click(screen.getByRole('button', { name: DONE }))

    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(summary.saved).toEqual([
      { sessionId: SESSION_ID, debrief: { mood: 4, session_notes: 'Squats moved well.' } },
    ])
  })

  it('writes an unwritten note as null rather than as an empty string', async () => {
    const user = userEvent.setup()
    const { summary } = await debrief()

    await user.click(screen.getByRole('button', { name: DONE }))

    await waitFor(() =>
      expect(summary.saved).toEqual([
        { sessionId: SESSION_ID, debrief: { mood: null, session_notes: null } },
      ]),
    )
  })

  it('opens on what was already saved', async () => {
    await debrief({
      summary: {
        latest: async () => ok(completedSession({ mood: 2, session_notes: 'Heavy day.' })),
      },
    })

    expect(screen.getByRole('radio', { name: '2, Worn' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: /Notes/ })).toHaveValue('Heavy day.')
  })

  it('re-renders a failed save in place, with the retry, and replays no entrance', async () => {
    let attempts = 0
    const user = userEvent.setup()
    const { summary, router } = await debrief({
      summary: {
        saveDebrief: async (sessionId, written) => {
          attempts += 1
          return attempts === 1
            ? err(createError(ErrorCode.NETWORK_OFFLINE))
            : ok(completedSession({ id: sessionId, ...written }))
        },
      },
    })
    const card = document.querySelector('.clr-boot')

    await user.click(screen.getByRole('radio', { name: '5, Peak' }))
    await user.click(screen.getByRole('button', { name: DONE }))

    expect(await screen.findByText('No connection. Check your network.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/summary')
    // The same node: the booted card was not remounted, so it does not boot again.
    expect(document.querySelector('.clr-boot')).toBe(card)
    expect(screen.getByRole('radio', { name: '5, Peak' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: DONE }))
    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(summary.saved.map((entry) => entry.debrief.mood)).toEqual([5, 5])
  })

  it('has nothing on it that does not work — no disabled control, no “coming soon”', async () => {
    await debrief()
    await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: SAVE_FAVORITE_LABEL })).not.toHaveAttribute(
        'aria-busy',
        'true',
      ),
    )

    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('radio')]) {
      expect(control).toBeEnabled()
    }
    expect(screen.getByRole('textbox', { name: /Notes/ })).toBeEnabled()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The streak
// ─────────────────────────────────────────────────────────────────────────────

/** A performed session on one local day, as HIST-01's page answers it. */
function trainedOn(day: string, index: number) {
  return makeSessionRow({
    id: `b00000${String(10 + index)}-0000-4000-8000-000000000000`,
    date: day,
    started_at: `${day}T11:00:00.000Z`,
    completed_at: `${day}T12:00:00.000Z`,
  })
}

/** Thursday 24 September 2026: the week is Monday 21 to Sunday 27. */
const TODAY = '2026-09-24'

/** Trained Monday, missed Tuesday, trained Wednesday and today. */
const WEEK_ROWS = [trainedOn('2026-09-24', 0), trainedOn('2026-09-23', 1), trainedOn('2026-09-21', 2)]

/** The two-day run those rows make, as SES-01 derives it. */
const RUN = fixtureStreak({ days: 2, trainingDays: ['2026-09-24', '2026-09-23'], today: TODAY })

describe('Summary — the streak and the week', () => {
  beforeEach(() => {
    // Only the clock: the week is drawn around today, and nothing here waits.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${TODAY}T15:00:00`))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** The week strip's seven days, Monday first. */
  async function weekDays(): Promise<HTMLElement[]> {
    const strip = await screen.findByRole('list', { name: 'This week' })
    await waitFor(() =>
      expect(strip.querySelector('[data-day-state="workout"]')).not.toBeNull(),
    )
    return Array.from(strip.children) as HTMLElement[]
  }

  it('shows SES-01’s count and Home’s week, ticks before a broken run included', async () => {
    await debrief({
      summary: { streak: async () => ok(RUN) },
      workout: { historyRows: WEEK_ROWS },
    })

    expect(await screen.findByText('2 days')).toBeInTheDocument()
    const days = await weekDays()
    // Monday was trained even though the run it began was broken on Tuesday:
    // the week is what happened, not what the streak still counts.
    expect(days.map((day) => day.getAttribute('data-day-state'))).toEqual([
      'workout', 'rest', 'workout', 'workout', 'upcoming', 'upcoming', 'upcoming',
    ])
    expect(days[1]).toHaveTextContent(/: Rest$/)
    expect(days[3]).toHaveTextContent(/\(today\): Workout$/)
  })

  it('U41: a marked rest day keeps its reason, as it does on Home', async () => {
    await debrief({
      summary: { streak: async () => ok(RUN) },
      workout: { historyRows: WEEK_ROWS },
      restDays: [{
        id: 'a0000002-0000-4000-8000-000000000000',
        user_id: FIXTURE_USER_ID,
        day: '2026-09-22',
        reason: 'injury',
        note: null,
        created_at: '2026-09-22T12:00:00.000Z',
        updated_at: '2026-09-22T12:00:00.000Z',
      }],
    })

    const days = await weekDays()
    await waitFor(() => expect(days[1]).toHaveTextContent(/: Rest — Injured$/))
    expect(days[1]).toHaveAttribute('data-day-state', 'rest')
  })

  it('U12: rest days take the info role and trained days the completed role, each with its own glyph', async () => {
    await debrief({
      summary: { streak: async () => ok(RUN) },
      workout: { historyRows: WEEK_ROWS },
    })

    const days = await weekDays()
    const trained = days[3]
    const rest = days[1]

    expect(trained).toHaveAttribute('data-day-state', 'workout')
    expect(trained.style.getPropertyValue('--surface')).toBe('var(--surface-selected)')
    expect(trained.querySelector('[aria-hidden="true"][style*="--icon-selected"] svg')).not.toBeNull()

    expect(rest).toHaveAttribute('data-day-state', 'rest')
    expect(rest.style.getPropertyValue('--surface')).toBe('var(--surface-toast-info)')
    expect(rest.style.getPropertyValue('--brd')).toBe('var(--border-toast-info)')
    expect(rest.querySelector('[aria-hidden="true"][style*="--icon-toast-info"] svg')).not.toBeNull()

    // The non-colour cue: the two glyphs are different drawings.
    const glyph = (day: HTMLElement) => day.querySelector('svg')!.innerHTML
    expect(glyph(rest)).not.toBe(glyph(trained))
  })

  it('says a streak that has not reached today runs through yesterday', async () => {
    await debrief({
      summary: {
        streak: async () =>
          ok(
            fixtureStreak({
              days: 1,
              trainingDays: ['2026-09-23'],
              includesToday: false,
              lastTrainingDay: '2026-09-23',
            }),
          ),
      },
    })

    const streak = screen.getByRole('heading', { name: 'Streak' }).closest('.clr-card')!
    expect(await within(streak as HTMLElement).findByText('1 day')).toBeInTheDocument()
    expect(within(streak as HTMLElement).getByText('Through yesterday')).toBeInTheDocument()
  })

  it('waits for the streak inside its own card, beside the duration', async () => {
    await debrief({ summary: { streak: () => new Promise(() => {}) } })

    const streak = screen.getByRole('heading', { name: 'Streak' }).closest('.clr-card')!
    expect(within(streak as HTMLElement).getByText('Reading your streak')).toBeInTheDocument()
    expect(streak.closest('.clr-metric-grid')).toBeInTheDocument()
    expect(screen.getByText('42 min')).toBeInTheDocument()
  })

  it('states an honest empty streak and an empty week, still drawn', async () => {
    await debrief({
      summary: { streak: async () => ok(fixtureStreak({ days: 0, trainingDays: [] })) },
    })

    const streak = screen.getByRole('heading', { name: 'Streak' }).closest('.clr-card')!
    // No number to enlarge: the empty streak is a sentence in the same card.
    expect(
      await within(streak as HTMLElement).findByText(
        'No streak yet. Sessions on consecutive days build one.',
      ),
    ).not.toHaveAttribute('data-metric-value')
    expect(streak.closest('.clr-metric-grid')).toBeInTheDocument()
    expect(await screen.findByText('No sessions this week yet.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'This week' }).children).toHaveLength(7)
  })

  it('offers the week’s own retry when its read fails, and keeps the streak', async () => {
    const user = userEvent.setup()
    let attempts = 0
    await debrief({
      summary: { streak: async () => ok(RUN) },
      workout: {
        historyRows: WEEK_ROWS,
        history: {
          page: async () => {
            attempts += 1
            return attempts === 1
              ? err(createError(ErrorCode.NETWORK_SERVER_ERROR))
              : ok({ sessions: WEEK_ROWS, hasMore: false })
          },
        },
      },
    })

    const week = screen.getByRole('heading', { name: 'This week' }).closest('.clr-card')!
    const alert = await within(week as HTMLElement).findByRole('alert')
    expect(alert).toHaveTextContent('This week didn’t load')
    expect(await screen.findByText('2 days')).toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect((await weekDays())[3]).toHaveAttribute('data-day-state', 'workout')
  })

  it('costs the streak display, not the debrief, when the streak read fails', async () => {
    const user = userEvent.setup()
    const { summary } = await debrief({
      summary: { streak: async () => err(createError(ErrorCode.NETWORK_SERVER_ERROR)) },
    })

    expect(await screen.findByText('Your streak didn’t load')).toBeInTheDocument()
    // The failure keeps its small card in the pair, retry included.
    const streak = screen.getByRole('heading', { name: 'Streak' }).closest('.clr-card')!
    expect(streak.closest('.clr-metric-grid')).toBeInTheDocument()
    expect(within(streak as HTMLElement).getByRole('button', { name: 'Retry' })).toBeEnabled()

    await user.click(screen.getByRole('radio', { name: '3, Flat' }))
    await user.click(screen.getByRole('button', { name: DONE }))

    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(summary.saved).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Save as favorite, and Done
// ─────────────────────────────────────────────────────────────────────────────

describe('Summary — the title and its one favorite label (U42)', () => {
  /** Every visible mention of "favorite" in the session's result card. */
  function favoriteMentions(): string[] {
    const card = screen.getByRole('heading', { name: TITLE_HEADING }).closest('.clr-card') as HTMLElement
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
    const found: string[] = []
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      // The closed confirm is an overlay that is not on screen until asked.
      if (node.parentElement?.closest('dialog, [role="dialog"]')) continue
      if (/favorite/i.test(node.textContent ?? '')) found.push(node.textContent!.trim())
    }
    return found
  }

  it('heads the result card with the session title, above every card label', async () => {
    await debrief()

    const title = screen.getByRole('heading', { level: 2, name: TITLE_HEADING })
    expect(title.style.fontFamily).toBe('var(--font-display)')
    expect(title.style.fontSize).toBe('var(--heading-h2-size)')
    expect(title).not.toHaveClass('label')
    // The readouts are named by labels, which the title is not.
    expect(screen.getByRole('heading', { name: 'Duration' })).toHaveClass('label')
  })

  it('wraps a long title inside its card rather than truncating it', async () => {
    const long =
      'Full-body strength ladder with conditioning finisher and accessory superset work'
    mountSummary({ summary: { latest: async () => ok(completedSession({ title: long })) } })

    const title = await screen.findByRole('heading', { name: `${long}, done.` })
    expect(title).toHaveTextContent(long)
    expect(title.style.overflowWrap).toBe('anywhere')
  })

  it('says “favorite” once before saving and once after', async () => {
    const user = userEvent.setup()
    await debrief()

    const save = await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })
    await waitFor(() => expect(save).not.toHaveAttribute('aria-busy', 'true'))
    expect(favoriteMentions()).toEqual([SAVE_FAVORITE_LABEL])

    await user.click(save)
    await screen.findByText(SAVED_FAVORITE_LABEL)
    // The status and its way back — no field label repeating either one.
    expect(favoriteMentions()).toEqual([SAVED_FAVORITE_LABEL, REMOVE_FAVORITE_LABEL])
  })
})

describe('Summary — save as favorite, then Done', () => {
  it('saves the session as a favorite in one tap, and Home’s favorites tab has it', async () => {
    const user = userEvent.setup()
    const { double, router } = await debrief()

    await user.click(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL }))

    expect(await screen.findByText(SAVED_FAVORITE_LABEL)).toBeInTheDocument()
    expect(double.favorites().map((row) => row.original_session_id)).toEqual([SESSION_ID])

    await user.click(screen.getByRole('button', { name: DONE }))
    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')

    await user.click(screen.getByRole('tab', { name: 'Favorites' }))
    expect(await screen.findByText(TITLE)).toBeInTheDocument()
  })

  it('reports a failed favorite save on Summary, and does not block Done', async () => {
    const user = userEvent.setup()
    const { summary, double } = await debrief({
      workout: {
        favoritesClient: {
          save: async () => err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)),
        },
      },
    })

    await user.click(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL }))

    expect(await screen.findByText(SAVE_FAVORITE_FAILED)).toBeInTheDocument()
    // Still offered, so the retry is the same tap.
    expect(screen.getByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeEnabled()
    expect(double.favorites()).toEqual([])

    await user.click(screen.getByRole('button', { name: DONE }))
    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(summary.saved).toHaveLength(1)
  })
})

describe('Summary — undoing a favorite (U22)', () => {
  /** A debrief whose favorites client records every delete it is asked for. */
  async function favorited(options: Parameters<typeof mountSummary>[0] = {}) {
    const mounted = await debrief(options)
    const removed: string[] = []
    const remove = mounted.double.clients.favorites.remove
    mounted.double.clients.favorites.remove = (savedWorkoutId) => {
      removed.push(savedWorkoutId)
      return remove(savedWorkoutId)
    }
    return { ...mounted, removed }
  }

  async function confirmRemove(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: REMOVE_FAVORITE_LABEL }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(REMOVE_FAVORITE_TITLE)
    await user.click(within(dialog).getByRole('button', { name: REMOVE_FAVORITE_CONFIRM }))
  }

  it('undoes a favorite just saved, behind the Favorites tab’s confirm', async () => {
    const user = userEvent.setup()
    const { double, removed, summary } = await favorited()

    await user.click(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL }))
    await screen.findByText(SAVED_FAVORITE_LABEL)
    const favoriteId = double.favorites()[0].id

    await confirmRemove(user)

    expect(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeEnabled()
    expect(screen.queryByText(SAVED_FAVORITE_LABEL)).toBeNull()
    expect(removed).toEqual([favoriteId])
    expect(double.favorites()).toEqual([])
    // Same screen, and the workout being debriefed is still the one on it.
    expect(screen.getByRole('heading', { name: TITLE_HEADING })).toBeInTheDocument()

    // Done still saves the session, and Home's favorites tab no longer has it.
    await user.click(screen.getByRole('button', { name: DONE }))
    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(summary.saved).toHaveLength(1)
    await user.click(screen.getByRole('tab', { name: 'Favorites' }))
    expect(await screen.findByText(FAVORITES_EMPTY_TITLE)).toBeInTheDocument()
  })

  it('removes a favorite saved earlier, and cancelling keeps it', async () => {
    const user = userEvent.setup()
    const { double, removed } = await favorited({
      workout: {
        favorites: [savedWorkoutFixture({ original_session_id: SESSION_ID, title: TITLE })],
      },
    })

    await user.click(await screen.findByRole('button', { name: REMOVE_FAVORITE_LABEL }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: REMOVE_FAVORITE_CANCEL,
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText(SAVED_FAVORITE_LABEL)).toBeInTheDocument()
    expect(removed).toEqual([])

    await confirmRemove(user)
    expect(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeEnabled()
    expect(removed).toHaveLength(1)
    expect(double.favorites()).toEqual([])
  })

  it('sends one delete while one is in flight, and reports a failure in place', async () => {
    const user = userEvent.setup()
    let settle: () => void = () => {}
    const { removed } = await favorited({
      workout: {
        favorites: [savedWorkoutFixture({ original_session_id: SESSION_ID, title: TITLE })],
        favoritesClient: {
          remove: () =>
            new Promise((resolve) => {
              settle = () => resolve(err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)))
            }),
        },
      },
    })

    await confirmRemove(user)
    expect(screen.getByRole('button', { name: REMOVE_FAVORITE_LABEL })).toBeDisabled()

    settle()
    expect(await screen.findByText(REMOVE_FAVORITE_FAILED)).toBeInTheDocument()
    expect(removed).toHaveLength(1)
    // Still saved, and the retry is the same action.
    expect(screen.getByText(SAVED_FAVORITE_LABEL)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REMOVE_FAVORITE_LABEL })).toBeEnabled()
  })

  it('settles a deferred Summary delete against newer Home removal and Session Detail save', async () => {
    const user = userEvent.setup()
    const first = savedWorkoutFixture({ id: '70000009-0000-4000-8000-000000000000',
      original_session_id: SESSION_ID, title: TITLE })
    const sibling = savedWorkoutFixture({ id: '70000008-0000-4000-8000-000000000000',
      original_session_id: '50000008-0000-4000-8000-000000000000', title: 'Sibling favorite' })
    const newlySaved = reconstructionFixture({ sessionId: '50000003-0000-4000-8000-000000000000',
      state: 'completed', title: 'New sibling favorite',
      sections: [{ title: 'Main', blocks: [{ exercises: ['completed'] }] }] })
    const { double, router, queryClient } = await favorited({ workout: {
      favorites: [first, sibling],
      sessions: {
        asPerformed: async () => ok(newlySaved),
        asIntendedAtStart: async () => ok({ ...newlySaved, reconstruction: 'intended_at_start' }),
      },
    } })
    const remove = double.clients.favorites.remove
    let finishFirst: () => Promise<void> = async () => { throw new Error('The first delete has not started') }
    double.clients.favorites.remove = (id) => id !== first.id ? remove(id) : new Promise((resolve) => {
      finishFirst = async () => { resolve(await remove(id)) }
    })

    await confirmRemove(user)
    await user.click(screen.getByRole('button', { name: DONE }))
    await screen.findByRole('heading', { name: HOME_HEADING })
    await user.click(screen.getByRole('tab', { name: 'Favorites' }))
    const siblingRow = (await screen.findByRole('heading', { name: sibling.title })).closest('li')!
    await user.click(within(siblingRow).getByRole('button', { name: REMOVE_FAVORITE_LABEL }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: REMOVE_FAVORITE_CONFIRM }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: sibling.title })).toBeNull())

    await act(() => router.navigate(`/history/${newlySaved.session.id}`))
    const save = await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })
    await waitFor(() => expect(save).toBeEnabled())
    await user.click(save)
    await screen.findByText(SAVED_FAVORITE_LABEL)
    await act(() => router.navigate(-1))
    await screen.findByRole('heading', { name: 'New sibling favorite' })

    // Summary's handler is still pending even though its control unmounted.
    await act(async () => finishFirst())
    const cached = queryClient.getState<readonly SavedWorkoutRow[]>(favoritesQueryKey(FIXTURE_USER_ID))
    expect(cached).toEqual({ status: 'ready', data: double.favorites() })
    expect(double.favorites().map(row => row.original_session_id)).toEqual([newlySaved.session.id])
    expect(screen.getByRole('heading', { name: 'New sibling favorite' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: sibling.title })).toBeNull()
    expect(screen.queryByRole('heading', { name: TITLE })).toBeNull()
  })

  it('settles a deferred save without resurrecting a favorite removed on Home', async () => {
    const user = userEvent.setup()
    const sibling = savedWorkoutFixture({ id: '70000008-0000-4000-8000-000000000000',
      original_session_id: '50000008-0000-4000-8000-000000000000', title: 'Sibling favorite' })
    const { double, queryClient } = await favorited({ workout: { favorites: [sibling] } })
    const save = double.clients.favorites.save
    let finishSave: () => Promise<void> = async () => { throw new Error('The save has not started') }
    double.clients.favorites.save = (...args) => new Promise((resolve) => {
      finishSave = async () => { resolve(await save(...args)) }
    })
    const button = await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    await user.click(screen.getByRole('button', { name: DONE }))
    await screen.findByRole('heading', { name: HOME_HEADING })
    await user.click(screen.getByRole('tab', { name: 'Favorites' }))
    await user.click(await screen.findByRole('button', { name: REMOVE_FAVORITE_LABEL }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: REMOVE_FAVORITE_CONFIRM }))
    await screen.findByText(FAVORITES_EMPTY_TITLE)

    await act(async () => finishSave())
    await screen.findByRole('heading', { name: TITLE })
    expect(queryClient.getState<readonly SavedWorkoutRow[]>(favoritesQueryKey(FIXTURE_USER_ID)))
      .toEqual({ status: 'ready', data: double.favorites() })
    expect(double.favorites().map(row => row.original_session_id)).toEqual([SESSION_ID])
    expect(screen.queryByRole('heading', { name: sibling.title })).toBeNull()
  })
})
