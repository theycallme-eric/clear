/**
 * EXE-05 acceptance — the coaching panel, on its own.
 *
 *   · cues and regression are the library definition's, read by the slug the
 *     prescription carries;
 *   · an empty `coaching_cues` array and a null `regression` are said as
 *     answers — this movement has none — and never drawn as an empty panel;
 *   · a failed library read is an error inside the panel, with a retry;
 *   · a note is written to the prescription's own row, and a failed write says
 *     so and keeps what was typed.
 *
 * `Workout.test.tsx` repeats the three that matter most through the real shell,
 * beside a set being logged.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createError, err, ErrorCode } from '../state/errors'
import { sessionProgress, type ExerciseProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  definitionFixture,
  snapshotFixture,
  type WorkoutDouble,
  type WorkoutDoubleOptions,
} from '../test/workout-double'
import {
  ExerciseCoaching,
  NO_CUES_TEXT,
  NO_DEFINITION_TEXT,
  NO_REGRESSION_TEXT,
  NOTE_FAILED_TEXT,
  NOTE_SAVED_TEXT,
} from './exercise-coaching'

const PANEL = 'Coaching and notes — back squat'

function mount(options: WorkoutDoubleOptions = {}): {
  double: WorkoutDouble
  exercise: ExerciseProgress
} {
  const snapshot = snapshotFixture({
    sections: [{ title: 'Primary lift', blocks: [{ exercises: ['not_started'] }] }],
  })
  const double = createWorkoutDouble({ session: snapshot, ...options })
  const exercise = sessionProgress(snapshot).sections[0].blocks[0].exercises[0]

  render(
    <AppProviders workout={double.clients}>
      <ExerciseCoaching exercise={exercise} />
    </AppProviders>,
  )

  return { double, exercise }
}

async function open() {
  await userEvent.click(screen.getByRole('button', { name: PANEL }))
  return screen.getByRole('region', { name: PANEL })
}

describe('the coaching panel', () => {
  it('draws nothing outside the workout clients', () => {
    const snapshot = snapshotFixture()
    const exercise = sessionProgress(snapshot).sections[0].blocks[0].exercises[0]
    const { container } = render(<ExerciseCoaching exercise={exercise} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does not read the library until it is opened', async () => {
    const definition = vi.fn(async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)))
    mount({ exercises: { definition } })

    expect(screen.getByRole('button', { name: PANEL })).toHaveAttribute('aria-expanded', 'false')
    expect(definition).not.toHaveBeenCalled()

    await open()
    await waitFor(() => expect(definition).toHaveBeenCalledWith('back-squat'))
  })

  it('shows the cues and regression the library authored for this movement', async () => {
    mount({ definitions: { 'back-squat': definitionFixture() } })
    const panel = await open()

    const cues = await within(panel).findByRole('list', { name: 'Coaching cues' })
    expect(within(cues).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Brace before you descend',
      'Knees track over the toes',
    ])
    expect(within(panel).getByText('Goblet squat')).toBeInTheDocument()
  })

  it('states an empty cues array and a null regression as answers', async () => {
    mount({
      definitions: {
        'back-squat': definitionFixture({ coaching_cues: [], regression: null }),
      },
    })
    const panel = await open()

    expect(await within(panel).findByText(NO_CUES_TEXT)).toBeInTheDocument()
    expect(within(panel).getByText(NO_REGRESSION_TEXT)).toBeInTheDocument()
    expect(within(panel).queryByRole('list', { name: 'Coaching cues' })).toBeNull()
  })

  it('states a movement the library has no entry for', async () => {
    mount({ definitions: {} })
    const panel = await open()

    expect(await within(panel).findByText(NO_DEFINITION_TEXT)).toBeInTheDocument()
  })

  it('shows a failed library read as an error in the panel, and retries it', async () => {
    let fail = true
    const definition = vi.fn(async () =>
      fail ? err(createError(ErrorCode.PERSISTENCE_READ_FAILED)) : { ok: true as const, value: definitionFixture() },
    )
    mount({ exercises: { definition } })
    const panel = await open()

    const alert = await within(panel).findByRole('alert')
    expect(alert).toHaveTextContent('Coaching for back squat didn’t load')
    // The note beside it is still usable: a failed read costs the guidance only.
    expect(within(panel).getByRole('textbox', { name: /Notes — back squat/ })).toBeEnabled()

    fail = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await within(panel).findByText('Goblet squat')).toBeInTheDocument()
  })

  it('writes the typed note to the prescription row and says it is saved', async () => {
    const { double, exercise } = mount()
    const panel = await open()

    await userEvent.type(
      within(panel).getByRole('textbox', { name: /Notes — back squat/ }),
      'Left knee felt tight',
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Save note — back squat' }))

    expect(await within(panel).findByText(NOTE_SAVED_TEXT)).toBeInTheDocument()
    expect(double.savedNotes()).toEqual([
      { exerciseId: exercise.exerciseId, notes: 'Left knee felt tight' },
    ])
  })

  it('clears the note when the field is emptied', async () => {
    const { double, exercise } = mount()
    const panel = await open()

    await userEvent.click(within(panel).getByRole('button', { name: 'Save note — back squat' }))

    await within(panel).findByText(NOTE_SAVED_TEXT)
    expect(double.savedNotes()).toEqual([{ exerciseId: exercise.exerciseId, notes: null }])
  })

  it('reports a failed note write and keeps the typed text', async () => {
    const saveNotes = vi.fn(async () =>
      err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED)),
    )
    mount({ exercises: { saveNotes } })
    const panel = await open()
    const field = within(panel).getByRole('textbox', { name: /Notes — back squat/ })

    await userEvent.type(field, 'Grip slipped on set 3')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save note — back squat' }))

    expect(await within(panel).findByText(NOTE_FAILED_TEXT)).toBeInTheDocument()
    expect(within(panel).queryByText(NOTE_SAVED_TEXT)).toBeNull()
    expect(field).toHaveValue('Grip slipped on set 3')
    expect(saveNotes).toHaveBeenCalledTimes(1)
  })
})
