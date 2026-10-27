/** Existing observations retain their values and units when opened through Edit. */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BlockCompletionContext, type BlockCompletionApi } from '../state/block-completion'
import { RestTimerProvider } from '../state/rest-provider'
import type { ExerciseSetLogRow, WorkoutExerciseRow } from '../state/schemas'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { sessionProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import { createWorkoutDouble, FIXTURE_SESSION_ID, snapshotFixture } from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { SectionLabelContext } from './section-label-context'
import { SetLoggingSheetHost, SetLoggingSheetSlot } from './set-logging-sheet'

function mountSaved(prescription: Partial<WorkoutExerciseRow>, observation: Partial<ExerciseSetLogRow>) {
  const snapshot = snapshotFixture({ sections: [{
    title: 'Strength', sectionType: 'primary_lift', blocks: [{ exercises: [{
      prescription: { exercise_id: 'back-squat', ...prescription },
      setLogs: [{ actual_reps: null, actual_duration_seconds: null,
        actual_distance: null, actual_distance_unit: null, ...observation }],
    }] }],
  }] })
  const double = createWorkoutDouble({ session: snapshot })
  const section = sessionProgress(snapshot).sections[0]
  const block = section.blocks[0]
  const completion: BlockCompletionApi = { reportOutcome: vi.fn(), isBlockRecorded: () => false }
  render(
    <AppProviders workout={double.clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider sessionId={FIXTURE_SESSION_ID} storage={null} exercises={block.exercises}
          weightUnit="kg" onFailure={() => {}} corrections>
          <RestTimerProvider>
            <SetLoggingSheetHost>
              <main><SectionLabelContext value={section.title}><BlockSlot block={block} /></SectionLabelContext></main>
              <footer><SetLoggingSheetSlot /></footer>
            </SetLoggingSheetHost>
          </RestTimerProvider>
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>,
  )
  return double
}

async function openEdit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Edit set 1' }))
  return within(screen.getByRole('form', { name: 'Edit set 1 of back squat' }))
}

describe('AC-046 / AC-047: edit the selected actual values', () => {
  it.each([
    { modality: 'distance', distance_unit: 'm', newLabel: 'Distance (m)' },
    { modality: 'reps', distance_unit: null, newLabel: 'Reps' },
  ] as const)('keeps saved distance in its own unit with a $modality prescription, leaving new-entry unchanged', async ({ newLabel, ...prescription }) => {
    const user = userEvent.setup()
    const double = mountSaved(prescription, {
      actual_distance: 2, actual_distance_unit: 'km', weight: 11, weight_unit: 'lb', effort: 'too_easy',
    })
    const edit = await openEdit(user)
    expect(edit.getByLabelText('Distance (km)')).toHaveValue(2)
    expect(edit.queryByLabelText('Distance (m)')).toBeNull()
    expect(edit.getByLabelText('Weight')).toHaveValue(11)
    expect(edit.getByRole('combobox', { name: 'Unit' })).toHaveValue('lb')
    await user.click(edit.getByRole('button', { name: 'Save correction' }))
    await waitFor(() => expect(double.correctedSets()).toHaveLength(1))
    expect(double.correctedSets()[0]).toMatchObject({ distanceUnit: 'km', weightUnit: 'lb',
      performed: { setNumber: 1, distance: 2, weight: 11, effort: 'too_easy' } })
    const rows = within(screen.getByRole('list', { name: 'Logged sets' }))
    await rows.findByText('Saved')
    expect(rows.getByText(/2 km/)).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Log set 2 of back squat' })).toBeInTheDocument()
    expect(screen.getByLabelText(newLabel)).toBeInTheDocument()
  })

  it('opens a stored duration instead of blank prescribed reps and retains it on no-op Save', async () => {
    const user = userEvent.setup()
    const double = mountSaved({ modality: 'reps' }, { actual_duration_seconds: 45 })
    const edit = await openEdit(user)
    expect(edit.getByLabelText('Seconds')).toHaveValue(45)
    expect(edit.queryByLabelText('Reps')).toBeNull()
    await user.click(edit.getByRole('button', { name: 'Save correction' }))
    await waitFor(() => expect(double.correctedSets()).toHaveLength(1))
    expect(double.correctedSets()[0].performed).toMatchObject({ durationSeconds: 45 })
    expect(double.correctedSets()[0].performed.reps).toBeUndefined()
  })

  it('changes the visible actual reps without dropping other recorded measurements', async () => {
    const user = userEvent.setup()
    const double = mountSaved({ modality: 'reps', distance_unit: null }, {
      actual_reps: 8, actual_duration_seconds: 45, actual_distance: 2, actual_distance_unit: 'km',
    })
    const edit = await openEdit(user)
    expect(edit.getByLabelText('Reps')).toHaveValue(8)
    await user.clear(edit.getByLabelText('Reps'))
    await user.type(edit.getByLabelText('Reps'), '6')
    await user.click(edit.getByRole('button', { name: 'Save correction' }))
    await waitFor(() => expect(double.correctedSets()).toHaveLength(1))
    expect(double.correctedSets()[0]).toMatchObject({ distanceUnit: 'km',
      performed: { reps: 6, durationSeconds: 45, distance: 2 } })
  })

  it('allows clearing the visible measurement while retaining the other actual values', async () => {
    const user = userEvent.setup()
    const double = mountSaved({ modality: 'reps' }, {
      actual_reps: 0, actual_duration_seconds: 45, actual_distance: 2, actual_distance_unit: 'km',
    })
    const edit = await openEdit(user)
    expect(edit.getByLabelText('Reps')).toHaveValue(0)
    await user.clear(edit.getByLabelText('Reps'))
    await user.click(edit.getByRole('button', { name: 'Save correction' }))
    await waitFor(() => expect(double.correctedSets()).toHaveLength(1))
    expect(double.correctedSets()[0].performed).toMatchObject({ durationSeconds: 45, distance: 2 })
    expect(double.correctedSets()[0].performed.reps).toBeUndefined()
    const rows = within(screen.getByRole('list', { name: 'Logged sets' }))
    await rows.findByText('Saved')
    expect(rows.queryByText(/0 reps/)).toBeNull()
    expect(rows.getByText(/45 sec · 2 km/)).toBeInTheDocument()
  })
})
