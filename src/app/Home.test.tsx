import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { makeSessionRow } from '../test/factories'
import { createFakeGenerationClient } from '../test/generation-double'
import { renderApp, signedIn } from '../test/render'
import { createWorkoutDouble } from '../test/workout-double'

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
