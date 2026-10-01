import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { SessionsClient } from '../data/sessions'
import { createError, err, ok, ErrorCode } from '../state/errors'
import { readReviewHandoff } from '../state/review-handoff'
import type { SessionReconstruction } from '../state/schemas'
import {
  RESTART_FAILED_MESSAGE,
  RESTART_NOT_COMPLETED_MESSAGE,
  RESTART_UNSUPPORTED_MESSAGE,
} from '../state/session-restart'
import { createFakeGenerationClient } from '../test/generation-double'
import { AppProviders, renderApp, signedIn } from '../test/render'
import {
  createWorkoutDouble,
  reconstructionFixture,
  savedWorkoutFixture,
  snapshotFixture,
  type WorkoutDoubleOptions,
} from '../test/workout-double'
import { screenAtmosphere } from './atmosphere'
import {
  SAVE_FAVORITE_FAILED,
  SAVE_FAVORITE_LABEL,
  SAVED_FAVORITE_LABEL,
} from './FavoriteToggle'
import { HISTORY_LIST_LABEL } from './History'
import { REVIEW_PATH } from './ReviewRoute'
import { routes } from './router'
import {
  SESSION_DETAIL_ERROR_TITLE,
  SESSION_DETAIL_LOADING_LABEL,
  SESSION_DETAIL_NOT_FOUND_ACTION,
  SESSION_DETAIL_NOT_FOUND_TITLE,
  SESSION_DETAIL_RESTART_LABEL,
} from './SessionDetail'

/**
 * HIST-01's detail on the real route tree. Every case enters by URL, so each
 * one is also a direct navigation to `/history/:id` through `Protected`, and the
 * payload is always what `asPerformed` answers — the screen has no other door.
 */

const SESSION_ID = 'c0000001-0000-4000-8000-000000000000'
const DETAIL_PATH = `/history/${SESSION_ID}`

/** One session with a block of every structure type, all but one scored. */
function fullRecord(): SessionReconstruction {
  return reconstructionFixture({
    sessionId: SESSION_ID,
    title: 'Full-body conditioning',
    state: 'completed',
    asOf: '2026-09-24T09:00:00+00:00',
    session: {
      mood: 4,
      session_notes: 'Legs heavy, moved well after set two.',
      actual_duration_mins: 47,
    },
    sections: [
      {
        title: 'Strength',
        sectionType: 'primary_lift',
        blocks: [
          {
            structureType: 'standard',
            result: { perceived_effort: 8 },
            exercises: [
              {
                setLogs: [
                  { set_number: 1, actual_reps: 8, weight: 60, weight_unit: 'kg', rpe: 7 },
                  { set_number: 2, actual_reps: 6, weight: 67.5, weight_unit: 'kg', rpe: 8.5 },
                ],
              },
            ],
          },
          {
            structureType: 'superset',
            result: { perceived_effort: 6, notes: 'Second pair was the hard one.' },
            exercises: ['completed', 'completed'],
          },
        ],
      },
      {
        title: 'Conditioning',
        sectionType: 'conditioning',
        blocks: [
          {
            structureType: 'circuit',
            rounds: 6,
            result: { rounds_completed: 4, elapsed_seconds: 432 },
          },
          {
            structureType: 'emom',
            timerSeconds: 600,
            result: { minutes_completed: 9 },
          },
          {
            structureType: 'amrap',
            timerSeconds: 720,
            result: { rounds_completed: 6, partial_round_reps: 4 },
          },
          {
            structureType: 'for_time',
            timerSeconds: 600,
            result: { elapsed_seconds: 512, completed_under_cap: true },
          },
          // Nobody scored this one: it must say so rather than show zeroes.
          { structureType: 'circuit', rounds: 3 },
        ],
      },
    ],
  })
}

/** A sessions client whose `asPerformed` answers `answer` and records every id. */
function recordingSessions(
  answer: (call: number) => ReturnType<SessionsClient['asPerformed']>,
) {
  const asked: string[] = []
  const sessions: Partial<SessionsClient> = {
    asPerformed: (sessionId) => {
      asked.push(sessionId)
      return answer(asked.length)
    },
  }
  return { asked, sessions }
}

function renderDetail(sessions: Partial<SessionsClient>, path = DETAIL_PATH) {
  const workout = createWorkoutDouble({ session: null, sessions })
  return renderApp([path], signedIn({ workout: workout.clients }))
}

describe('Session Detail route', () => {
  it('mounts /history/:id behind Protected at the Full atmosphere', async () => {
    const { container } = renderDetail(recordingSessions(async () => ok(fullRecord())).sessions)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Full-body conditioning' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()

    expect(screenAtmosphere('Session Detail')).toBe('full')
    expect(container.querySelector('.clr-shell')).toHaveAttribute('data-atmosphere', 'full')
    expect(document.documentElement.dataset.atmosphere).toBe('full')
  })

  it('does not render for a signed-out visitor', async () => {
    const recording = recordingSessions(async () => ok(fullRecord()))
    renderApp([DETAIL_PATH])

    await waitFor(() => expect(document.documentElement.dataset.atmosphere).toBe('full'))
    expect(screen.queryByText('Full-body conditioning')).not.toBeInTheDocument()
    expect(recording.asked).toEqual([])
  })

  it('shows the loading state while the reconstruction is in flight', async () => {
    renderDetail({ asPerformed: () => new Promise(() => {}) })

    expect(await screen.findByText(SESSION_DETAIL_LOADING_LABEL)).toBeInTheDocument()
  })

  it('reads the route’s session through asPerformed and nothing else', async () => {
    const recording = recordingSessions(async () => ok(fullRecord()))
    // The double answers the other reconstructions and the snapshot with an
    // "unsupported" failure, so reaching for any of them would error the screen.
    renderDetail(recording.sessions)

    expect(await screen.findByText(/As performed/)).toBeInTheDocument()
    expect(recording.asked).toEqual([SESSION_ID])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Session Detail error state', () => {
  it('says not found — not an empty shell — for a missing or not-yours session', async () => {
    const user = userEvent.setup()
    const recording = recordingSessions(async () =>
      err(createError(ErrorCode.PERSISTENCE_NOT_FOUND)),
    )
    renderDetail(recording.sessions)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(SESSION_DETAIL_NOT_FOUND_TITLE)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()

    // Retrying cannot change "not yours", so the way out is History.
    await user.click(screen.getByRole('button', { name: SESSION_DETAIL_NOT_FOUND_ACTION }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'History' }),
    ).toBeInTheDocument()
  })

  it('offers a retry for a failed read, and the retry re-runs it', async () => {
    const user = userEvent.setup()
    const recording = recordingSessions(async (call) =>
      call === 1 ? err(createError(ErrorCode.NETWORK_OFFLINE)) : ok(fullRecord()),
    )
    renderDetail(recording.sessions)

    expect(await screen.findByText(SESSION_DETAIL_ERROR_TITLE)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Full-body conditioning' }),
    ).toBeInTheDocument()
    expect(recording.asked).toEqual([SESSION_ID, SESSION_ID])
  })
})

describe('Session Detail populated state', () => {
  async function renderFull() {
    renderDetail(recordingSessions(async () => ok(fullRecord())).sessions)
    await screen.findByRole('heading', { level: 1, name: 'Full-body conditioning' })
  }

  it('discloses each section, and collapsing one keeps its blocks readable', async () => {
    const user = userEvent.setup()
    await renderFull()

    const strength = screen.getByRole('button', { name: /Strength/ })
    const conditioning = screen.getByRole('button', { name: /Conditioning/ })
    expect(strength).toHaveAttribute('aria-expanded', 'true')
    expect(conditioning).toHaveAttribute('aria-expanded', 'true')

    await user.click(strength)
    expect(strength).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders all six structure types with their logged outcomes', async () => {
    await renderFull()

    for (const label of ['STANDARD', 'SUPERSET', 'CIRCUIT', 'EMOM', 'AMRAP', 'FOR TIME']) {
      expect(screen.getAllByText(new RegExp(`^${label}`)).length, label).toBeGreaterThan(0)
    }

    // Standard and superset report through effort; the timed four through
    // what their structure measures.
    expect(screen.getByText('8 of 10')).toBeInTheDocument()
    expect(screen.getByText('6 of 10')).toBeInTheDocument()
    expect(screen.getByText('Second pair was the hard one.')).toBeInTheDocument()
    expect(screen.getByText('4 of 6')).toBeInTheDocument()
    expect(screen.getByText('07:12')).toBeInTheDocument()
    expect(screen.getByText('9 of 10')).toBeInTheDocument()
    expect(screen.getByText('4 reps')).toBeInTheDocument()
    expect(screen.getByText('08:32')).toBeInTheDocument()
    expect(screen.getByText('Finished under the cap')).toBeInTheDocument()
  })

  it('says a block nobody scored is not scored instead of showing zeroes', async () => {
    await renderFull()

    expect(screen.getByText('Not scored')).toBeInTheDocument()
    expect(screen.queryByText('0 of 3')).not.toBeInTheDocument()
  })

  it('displays weight, reps and RPE per logged set', async () => {
    await renderFull()

    const table = screen.getAllByRole('table')[0]
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent)
    expect(headers).toEqual(['Set', 'Weight', 'Reps', 'RPE'])

    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['60 kg', '8 reps', 'RPE 7'],
      ['67.5 kg', '6 reps', 'RPE 8.5'],
    ])
  })

  it('discloses the session’s provenance, mood and notes', async () => {
    await renderFull()

    expect(screen.getByText(/As performed · read at .*2026/)).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('4 of 5')).toBeInTheDocument()
    expect(screen.getByText('Legs heavy, moved well after set two.')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('47 min')).toBeInTheDocument()
  })

  it('says an unanswered debrief was not recorded rather than leaving it blank', async () => {
    renderDetail(
      recordingSessions(async () =>
        ok(reconstructionFixture({ sessionId: SESSION_ID, title: 'Quiet day' })),
      ).sessions,
    )

    await screen.findByRole('heading', { level: 1, name: 'Quiet day' })
    expect(screen.getByText('Not recorded')).toBeInTheDocument()
    expect(screen.getByText('No notes')).toBeInTheDocument()
  })
})

describe('Session Detail entries', () => {
  it('opens from a History row for the session that row names', async () => {
    const user = userEvent.setup()
    const record = fullRecord()
    const recording = recordingSessions(async () => ok(record))
    const workout = createWorkoutDouble({
      session: null,
      sessions: recording.sessions,
      historyRows: [record.session],
    })
    renderApp(['/history'], signedIn({ workout: workout.clients }))

    const list = await screen.findByRole('list', { name: HISTORY_LIST_LABEL })
    const link = within(list).getByRole('link', { name: 'Full-body conditioning' })
    expect(link).toHaveAttribute('href', DETAIL_PATH)

    await user.click(link)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Full-body conditioning' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()
    expect(recording.asked).toEqual([SESSION_ID])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-003 · JOURNEY-004 — save as favorite and restart, independently
// ─────────────────────────────────────────────────────────────────────────────

const ONE_EXERCISE = [{ title: 'Main', blocks: [{ exercises: ['completed' as const] }] }]

/** The intended-at-start reading a restart and a favorite are both built from. */
function intendedRecord(
  overrides: Partial<SessionReconstruction['session']> = {},
  sections: typeof ONE_EXERCISE = ONE_EXERCISE,
): SessionReconstruction {
  return reconstructionFixture({
    sessionId: SESSION_ID,
    title: 'Full-body conditioning',
    state: 'completed',
    reconstruction: 'intended_at_start',
    sections,
    session: overrides,
  })
}

/** A legacy record: readable, but recorded under a contract this build cannot validate. */
function withContract(record: SessionReconstruction, version: string): SessionReconstruction {
  return { ...record, session: { ...record.session, contract_version: version } }
}

/**
 * The detail on the real route tree, entered from History, over a sessions
 * client that answers the record and its intended-at-start reading and records
 * every time the second one is asked.
 */
function mountDetail(
  options: { record?: SessionReconstruction; workout?: WorkoutDoubleOptions } = {},
) {
  const generation = createFakeGenerationClient()
  const intendedAsked: string[] = []
  const double = createWorkoutDouble({
    session: null,
    ...options.workout,
    sessions: {
      asPerformed: async () => ok(options.record ?? fullRecord()),
      asIntendedAtStart: async (sessionId) => {
        intendedAsked.push(sessionId)
        return ok(intendedRecord())
      },
      ...options.workout?.sessions,
    },
  })
  const router = createMemoryRouter(routes, {
    initialEntries: ['/history', DETAIL_PATH],
    initialIndex: 1,
  })
  render(
    <AppProviders {...signedIn({ workout: double.clients, generation })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { router, double, generation, intendedAsked }
}

async function detailShown() {
  await screen.findByRole('heading', { level: 1, name: 'Full-body conditioning' })
}

function restartButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: SESSION_DETAIL_RESTART_LABEL })
}

async function tapRestart(user: ReturnType<typeof userEvent.setup>) {
  const button = restartButton()
  if (button === null) throw new Error('Restart is not offered')
  await user.click(button)
}

describe('Session Detail · save as favorite', () => {
  it('saves in one tap, the way Summary does, and reports saved without leaving', async () => {
    const user = userEvent.setup()
    const { router, double, generation } = mountDetail()
    await detailShown()

    await user.click(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL }))

    expect(await screen.findByText(SAVED_FAVORITE_LABEL)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeNull()
    expect(double.favorites().map((row) => row.original_session_id)).toEqual([SESSION_ID])
    expect(router.state.location.pathname).toBe(DETAIL_PATH)
    expect(generation.calls).toEqual([])
    // Saving is not restarting: Restart is still on offer, unchanged.
    expect(restartButton()).toBeEnabled()
  })

  it('reports a failed save in place and leaves Restart as it was', async () => {
    const user = userEvent.setup()
    const { router, double } = mountDetail({
      workout: {
        favoritesClient: {
          save: async () => err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)),
        },
      },
    })
    await detailShown()

    await user.click(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL }))

    expect(await screen.findByText(SAVE_FAVORITE_FAILED)).toBeInTheDocument()
    // The retry is the same tap, and the failure is the favorite's alone.
    expect(screen.getByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeEnabled()
    expect(restartButton()).toBeEnabled()
    expect(double.favorites()).toEqual([])
    expect(router.state.location.pathname).toBe(DETAIL_PATH)
  })

  it('reads the favorites list to know this session is already saved', async () => {
    const { intendedAsked } = mountDetail({
      workout: { favorites: [savedWorkoutFixture({ original_session_id: SESSION_ID })] },
    })
    await detailShown()

    expect(await screen.findByText(SAVED_FAVORITE_LABEL)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeNull()
    // Known from the list, not from a reconstruction or a flag of its own.
    expect(intendedAsked).toEqual([])
  })

  it('offers to save when the list holds only other sessions’ favorites', async () => {
    mountDetail({
      workout: {
        favorites: [
          savedWorkoutFixture({ original_session_id: 'c0000009-0000-4000-8000-000000000000' }),
        ],
      },
    })
    await detailShown()

    expect(await screen.findByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeEnabled()
    expect(screen.queryByText(SAVED_FAVORITE_LABEL)).toBeNull()
  })
})

describe('Session Detail · restart', () => {
  it('hands the reconstructed workout to /review without generation or a favorite', async () => {
    const user = userEvent.setup()
    const { router, double, generation, intendedAsked } = mountDetail()
    await detailShown()

    await tapRestart(user)

    await waitFor(() => expect(router.state.location.pathname).toBe(REVIEW_PATH))
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Full-body conditioning' }),
    ).toBeInTheDocument()

    const handoff = readReviewHandoff(router.state.location.state)
    expect(handoff?.savedWorkoutId).toBeNull()
    expect(handoff?.acceptance.workout.title).toBe('Full-body conditioning')
    expect(handoff?.acceptance.contract_version).toBe('4.1.0')

    expect(intendedAsked).toEqual([SESSION_ID])
    expect(generation.calls).toEqual([])
    expect(double.favorites()).toEqual([])
  })

  it('keeps a legacy contract viewable, with Restart unavailable and explained', async () => {
    const { intendedAsked } = mountDetail({ record: withContract(fullRecord(), '3.0.0') })
    await detailShown()

    expect(screen.getByRole('button', { name: /Strength/ })).toBeInTheDocument()
    expect(screen.getByText(RESTART_UNSUPPORTED_MESSAGE)).toBeInTheDocument()
    expect(restartButton()).toBeNull()
    expect(intendedAsked).toEqual([])
  })

  it('names an unvalidatable contract version on the tap rather than failing obscurely', async () => {
    const user = userEvent.setup()
    const { router, generation } = mountDetail({
      workout: {
        sessions: {
          asIntendedAtStart: async () => ok(intendedRecord({ contract_version: '3.0.0' })),
        },
      },
    })
    await detailShown()

    await tapRestart(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(RESTART_UNSUPPORTED_MESSAGE)
    expect(router.state.location.pathname).toBe(DETAIL_PATH)
    expect(generation.calls).toEqual([])
  })

  it('reports a rebuild that fails validation on the detail and stays put', async () => {
    const user = userEvent.setup()
    const { router, generation } = mountDetail({
      workout: {
        // Nothing to rebuild: a workout with no exercises is not a prescription.
        sessions: { asIntendedAtStart: async () => ok(intendedRecord({}, [])) },
      },
    })
    await detailShown()

    await tapRestart(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(RESTART_FAILED_MESSAGE)
    expect(router.state.location.pathname).toBe(DETAIL_PATH)
    expect(restartButton()).toBeEnabled()
    expect(screen.getByText('Legs heavy, moved well after set two.')).toBeInTheDocument()
    expect(generation.calls).toEqual([])
  })

  it('reports a failed read of the stored prescription the same way', async () => {
    const user = userEvent.setup()
    const { router } = mountDetail({
      workout: {
        sessions: {
          asIntendedAtStart: async () => err(createError(ErrorCode.NETWORK_OFFLINE)),
        },
      },
    })
    await detailShown()

    await tapRestart(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(RESTART_FAILED_MESSAGE)
    expect(router.state.location.pathname).toBe(DETAIL_PATH)
  })

  it('offers neither action for a session that was not completed, and says why', async () => {
    mountDetail({ record: { ...fullRecord(), state: 'abandoned' } })
    await detailShown()

    expect(screen.getByText(RESTART_NOT_COMPLETED_MESSAGE)).toBeInTheDocument()
    expect(restartButton()).toBeNull()
    expect(screen.queryByRole('button', { name: SAVE_FAVORITE_LABEL })).toBeNull()
  })

  it('asks about a running session before a restart can replace it', async () => {
    mountDetail({ workout: { session: snapshotFixture({ state: 'active' }) } })

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /Resume/ })).toBeInTheDocument()
  })
})
