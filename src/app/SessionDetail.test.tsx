import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { SessionsClient } from '../data/sessions'
import { createError, err, ok, ErrorCode } from '../state/errors'
import type { SessionReconstruction } from '../state/schemas'
import { renderApp, signedIn } from '../test/render'
import { createWorkoutDouble, reconstructionFixture } from '../test/workout-double'
import { screenAtmosphere } from './atmosphere'
import { HISTORY_LIST_LABEL } from './History'
import {
  SESSION_DETAIL_ERROR_TITLE,
  SESSION_DETAIL_LOADING_LABEL,
  SESSION_DETAIL_NOT_FOUND_ACTION,
  SESSION_DETAIL_NOT_FOUND_TITLE,
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
  it('mounts /history/:id behind Protected at the quiet atmosphere', async () => {
    const { container } = renderDetail(recordingSessions(async () => ok(fullRecord())).sessions)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Full-body conditioning' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull()

    expect(screenAtmosphere('Session Detail')).toBe('quiet')
    expect(container.querySelector('.clr-shell')).toHaveAttribute('data-atmosphere', 'quiet')
    expect(document.documentElement.dataset.atmosphere).toBe('quiet')
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
