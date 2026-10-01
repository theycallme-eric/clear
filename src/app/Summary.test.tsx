/**
 * SUM-01 acceptance — the debrief, through the real route tree.
 *
 * What this file is answerable for:
 *
 *   · mood and notes persist to the session row;
 *   · the copy is a brief acknowledgment and then the debrief;
 *   · the streak is SES-01's derivation, in its own four states;
 *   · nothing on the screen is non-functional — no disabled control, no
 *     "coming soon";
 *   · only a completed session reaches the screen;
 *   · save-as-favorite works, and Done returns Home, where the favorite is.
 *
 * Arriving here from a finished workout is `Workout.test.tsx`'s subject; this
 * file starts at `/summary` with Home behind it.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { createError, err, ErrorCode, ok } from '../state/errors'
import { AppProviders, signedIn } from '../test/render'
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
  type WorkoutDouble,
  type WorkoutDoubleOptions,
} from '../test/workout-double'
import { routes } from './router'
import { SAVE_FAVORITE_FAILED, SAVE_FAVORITE_LABEL, SAVED_FAVORITE_LABEL } from './Summary'

const COMPLETED = completedSession()
const SESSION_ID = COMPLETED.session.id
const TITLE = COMPLETED.session.title

/** Home's page heading, which is where Done lands. */
const HOME_HEADING = 'Today'
const SUMMARY_HEADING = 'Nice work'
const DONE = 'Save and close'

interface Mounted {
  summary: FakeSummaryClient
  double: WorkoutDouble
  router: ReturnType<typeof createMemoryRouter>
}

function mountSummary(
  options: { summary?: FakeSummaryOptions; workout?: WorkoutDoubleOptions } = {},
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

  render(
    <AppProviders {...signedIn({ summary, workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )

  return { summary, double, router }
}

/** The debrief, once the session has loaded. */
async function debrief(
  options: Parameters<typeof mountSummary>[0] = {},
): Promise<Mounted> {
  const mounted = mountSummary(options)
  await screen.findByText(`${TITLE}, done.`)
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

    expect(await screen.findByText(`${TITLE}, done.`)).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The debrief
// ─────────────────────────────────────────────────────────────────────────────

describe('Summary — the debrief', () => {
  it('acknowledges the session briefly and goes straight to the debrief', async () => {
    await debrief()

    expect(screen.getByRole('heading', { level: 1, name: SUMMARY_HEADING })).toBeInTheDocument()
    expect(screen.getByText(`${TITLE}, done.`)).toBeInTheDocument()
    expect(screen.getByText('42 min')).toBeInTheDocument()

    const moods = within(screen.getByRole('group', { name: 'How do you feel?' }))
    expect(moods.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Spent',
      'Worn',
      'Flat',
      'Ready',
      'Peak',
    ])
    expect(screen.getByRole('textbox', { name: /Notes/ })).toBeInTheDocument()
  })

  it('frames each result and keeps completion associated with the scrolling form', async () => {
    await debrief()

    expect(screen.getByText('Duration').closest('.clr-metric-frame')).toBeInTheDocument()
    expect(screen.getByText('Streak').closest('.clr-metric-frame')).toBeInTheDocument()
    const done = screen.getByRole('button', { name: DONE })
    expect(done).toHaveAttribute('form', 'summary-debrief')
    expect(done.closest('.clr-scroll-region__foot')).toBeInTheDocument()
    expect(document.getElementById('summary-debrief')).toHaveAttribute('novalidate')
  })

  it('persists the mood and notes to the session row, then returns Home', async () => {
    const user = userEvent.setup()
    const { summary, router } = await debrief()

    await user.click(screen.getByRole('radio', { name: 'Ready' }))
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

    expect(screen.getByRole('radio', { name: 'Worn' })).toBeChecked()
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

    await user.click(screen.getByRole('radio', { name: 'Peak' }))
    await user.click(screen.getByRole('button', { name: DONE }))

    expect(await screen.findByText('No connection. Check your network.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/summary')
    // The same node: the booted card was not remounted, so it does not boot again.
    expect(document.querySelector('.clr-boot')).toBe(card)
    expect(screen.getByRole('radio', { name: 'Peak' })).toBeChecked()

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

describe('Summary — the streak', () => {
  it('shows SES-01’s count and marks the trained days of the week', async () => {
    await debrief()

    expect(await screen.findByText('3 days')).toBeInTheDocument()
    for (const day of fixtureStreak().trainingDays) {
      expect(screen.getByText(`${day}: trained`)).toBeInTheDocument()
    }
    expect(screen.getByText('2026-09-21: no session')).toBeInTheDocument()
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

    expect(await screen.findByText('1 day, through yesterday')).toBeInTheDocument()
  })

  it('states an honest empty streak', async () => {
    await debrief({
      summary: { streak: async () => ok(fixtureStreak({ days: 0, trainingDays: [] })) },
    })

    expect(
      await screen.findByText('No streak yet. Sessions on consecutive days build one.'),
    ).toBeInTheDocument()
  })

  it('costs the streak display, not the debrief, when the streak read fails', async () => {
    const user = userEvent.setup()
    const { summary } = await debrief({
      summary: { streak: async () => err(createError(ErrorCode.NETWORK_SERVER_ERROR)) },
    })

    expect(await screen.findByText('Your streak didn’t load')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Flat' }))
    await user.click(screen.getByRole('button', { name: DONE }))

    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(summary.saved).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Save as favorite, and Done
// ─────────────────────────────────────────────────────────────────────────────

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
