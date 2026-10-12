/**
 * EXE-02's set logger — one prescription, its readout and the form that logs
 * the next set — asserted against a set-logging seam the test holds.
 *
 * The seam is a double here on purpose. What the shell does with a set (the
 * queue, the retry, the row) is `set-logging-provider.test.tsx`'s; what this
 * file pins is the logger's half: which set it offers next, what it hands the
 * shell, what it refuses to hand over, and how it draws a set at each sync
 * status — with the shared frame's parts and no card of its own.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Enums } from '../data/database.types'
import type { WorkoutExerciseRow } from '../state/schemas'
import {
  SetLoggingContext,
  type LoggedSet,
  type PerformedSet,
  type SetLoggingApi,
} from '../state/set-logging'
import { sessionProgress, type ExerciseProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import { createWorkoutDouble, snapshotFixture } from '../test/workout-double'
import { Card } from './card'
import { ExerciseSetLogger, loggedSetText, type ExerciseSetLoggerProps } from './set-logger'

/** One recorded set, as the shell hands it to the logger. */
function loggedSet(overrides: Partial<LoggedSet> & { setNumber: number }): LoggedSet {
  return {
    reps: 8,
    durationSeconds: null,
    distance: null,
    distanceUnit: null,
    weight: 60,
    weightUnit: 'kg',
    rpe: null,
    isWarmup: false,
    status: 'logged',
    ...overrides,
  }
}

interface MountOptions {
  prescription?: Partial<WorkoutExerciseRow>
  logged?: readonly LoggedSet[]
  saving?: boolean
  weightUnit?: Enums<'weight_unit'> | null
  props?: Partial<ExerciseSetLoggerProps>
  /** Draw the logger inside a block's card, as every renderer does. */
  inCard?: boolean
}

function mount(options: MountOptions = {}) {
  const snapshot = snapshotFixture({
    sections: [
      {
        sectionType: 'primary_lift',
        blocks: [
          {
            structureType: 'standard',
            exercises: [{ prescription: options.prescription ?? {} }],
          },
        ],
      },
    ],
  })
  const workout = createWorkoutDouble({ session: snapshot })
  const exercise: ExerciseProgress = sessionProgress(snapshot).sections[0].blocks[0].exercises[0]

  const logSet = vi.fn<(exerciseId: string, performed: PerformedSet) => void>()
  const api: SetLoggingApi = {
    weightUnit: options.weightUnit === undefined ? 'kg' : options.weightUnit,
    logSet,
    loggedSets: (exerciseId) =>
      exerciseId === exercise.exerciseId ? (options.logged ?? []) : [],
    isSaving: () => options.saving ?? false,
    sync: { unsyncedCount: 0, sustainedFailure: false, syncing: false },
    retrySync: () => {},
  }

  const logger = <ExerciseSetLogger exercise={exercise} {...options.props} />
  const view = render(
    <AppProviders workout={workout.clients}>
      <SetLoggingContext value={api}>
        {options.inCard ? <Card>{logger}</Card> : logger}
      </SetLoggingContext>
    </AppProviders>,
  )

  return { ...view, exercise, logSet }
}

function form(setNumber: number) {
  return within(screen.getByRole('form', { name: `Log set ${setNumber} of back squat` }))
}

describe('the logger is drawn with the shared frame, and frames nothing itself', () => {
  it('draws no card of its own around the movement, its readout or its form', () => {
    // Outside a block the coaching panel is still its own card — that frame is
    // `exercise-coaching.tsx`'s — so what is asserted is the logger's own parts.
    mount()

    expect(screen.getByRole('heading', { name: 'back squat' }).closest('.clr-card')).toBeNull()
    expect(screen.getByText('No sets logged yet.').closest('.clr-card')).toBeNull()
    expect(
      screen.getByRole('form', { name: 'Log set 1 of back squat' }).closest('.clr-card'),
    ).toBeNull()
  })

  it('leaves the block’s card the only card, with the coaching panel a ruled group', () => {
    const { container } = mount({ inCard: true })

    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(container.querySelector('.clr-card .clr-card')).toBeNull()
  })

  it('names the movement in a real heading and the prescription from its columns', () => {
    mount()

    expect(screen.getByRole('heading', { name: 'back squat' })).toBeInTheDocument()
    expect(screen.getByText('3 × 8 reps')).toBeInTheDocument()
  })

  it('prefixes the ordinal a structure gives the movement', () => {
    mount({ props: { ordinal: 'A1' } })

    expect(screen.getByRole('heading', { name: 'A1 back squat' })).toBeInTheDocument()
  })

  it('sets its three fields in one wrapping row, each a current element frame', () => {
    mount()

    const weight = form(1).getByLabelText('Weight (kg)')
    const row = weight.closest('.clr-row')
    expect(row).not.toBeNull()

    for (const label of ['Weight (kg)', 'Reps', 'RPE']) {
      const field = form(1).getByLabelText(label)
      expect(field).toHaveClass('clr-input')
      expect(field.closest('.clr-row')).toBe(row)
      expect(field.closest('.clr-field')).not.toBeNull()
    }
    // The row adds no frame: the fields are the only chamfers in it.
    expect(row).not.toHaveClass('clr-chamfer')
  })
})

describe('rest is stated by whoever owns it', () => {
  it('states the movement’s own rest by default', () => {
    mount()

    expect(screen.getByText('Rest 90s')).toBeInTheDocument()
  })

  it('states none where the block owns the rest', () => {
    mount({ props: { statesRest: false } })

    expect(screen.queryByText(/^Rest \d/)).not.toBeInTheDocument()
  })

  it('never renders a zero rest as a rest', () => {
    mount({ prescription: { rest_seconds: 0 } })

    expect(screen.queryByText(/Rest 0/)).not.toBeInTheDocument()
  })
})

describe('the readout of sets already recorded', () => {
  it('says no sets are logged rather than drawing nothing', () => {
    mount()

    expect(screen.getByText('No sets logged yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Logged sets' })).not.toBeInTheDocument()
  })

  it('lists the sets lowest first, whatever order they arrived in', () => {
    mount({
      logged: [loggedSet({ setNumber: 2, reps: 7 }), loggedSet({ setNumber: 1 })],
    })

    const rows = within(screen.getByRole('list', { name: 'Logged sets' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Set 1 · 8 reps · 60 kgSaved',
      'Set 2 · 7 reps · 60 kgSaved',
    ])
  })

  it.each([
    ['logged', 'Saved'],
    ['syncing', 'Saving'],
    ['failed', 'On this device only'],
  ] as const)('says where a %s set has got to in words, with a glyph', (status, words) => {
    mount({ logged: [loggedSet({ setNumber: 1, status })] })

    const row = within(screen.getByRole('list', { name: 'Logged sets' })).getByRole('listitem')
    expect(within(row).getByText(words)).toBeInTheDocument()
    // Colour is never the only cue: the word above, and a glyph beside it.
    expect(row.querySelector('[aria-hidden="true"] svg')).not.toBeNull()
  })

  it('prints a zero as a result and leaves an unrecorded field unsaid', () => {
    expect(
      loggedSetText(loggedSet({ setNumber: 3, reps: 0, weight: null, rpe: 9, isWarmup: true })),
    ).toBe('Set 3 · 0 reps · RPE 9 · Warmup')
    expect(
      loggedSetText(
        loggedSet({ setNumber: 1, reps: null, distance: 400, distanceUnit: 'm', weight: null }),
      ),
    ).toBe('Set 1 · 400 m')
  })
})

describe('set progression', () => {
  it('offers set one of an untouched movement, with its target', () => {
    mount()

    expect(form(1).getByText('Set 1 of 3 · Target 8 reps')).toBeInTheDocument()
    expect(form(1).getByRole('button', { name: 'Log set 1' })).toBeEnabled()
  })

  it('offers the lowest set not yet recorded', () => {
    mount({ logged: [loggedSet({ setNumber: 1 }), loggedSet({ setNumber: 3 })] })

    expect(form(2).getByText('Set 2 of 3 · Target 8 reps')).toBeInTheDocument()
  })

  it('offers an extra set once every prescribed set is recorded', () => {
    mount({
      logged: [
        loggedSet({ setNumber: 1 }),
        loggedSet({ setNumber: 2 }),
        loggedSet({ setNumber: 3 }),
      ],
    })

    expect(form(4).getByText(/^Extra set 4/)).toBeInTheDocument()
    expect(form(4).getByRole('button', { name: 'Log set 4' })).toBeEnabled()
  })

  it('prefills the next set from the last one performed, and never the RPE', () => {
    mount({ logged: [loggedSet({ setNumber: 1, weight: 62.5, reps: 7, rpe: 8 })] })

    expect(form(2).getByLabelText('Weight (kg)')).toHaveValue(62.5)
    expect(form(2).getByLabelText('Reps')).toHaveValue(7)
    expect(form(2).getByLabelText('RPE')).toHaveValue(null)
  })
})

describe('what the logger hands the shell', () => {
  it('logs the set against this prescription, with only what was entered', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount()

    await user.type(form(1).getByLabelText('Weight (kg)'), '60')
    await user.type(form(1).getByLabelText('Reps'), '8')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    // No RPE and no warmup flag: an unentered field is absent, not a zero.
    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 1,
      reps: 8,
      weight: 60,
    })
  })

  it('carries RPE and the warmup flag when they are given', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount()

    await user.type(form(1).getByLabelText('Reps'), '5')
    await user.type(form(1).getByLabelText('RPE'), '7.5')
    await user.click(form(1).getByRole('checkbox', { name: 'Warmup set' }))
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 1,
      reps: 5,
      rpe: 7.5,
      isWarmup: true,
    })
  })

  it('writes a timed prescription’s measure to its own column', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount({
      prescription: { modality: 'time', target_kind: 'fixed', target_value: 30 },
    })

    const fields = within(screen.getByRole('form', { name: 'Log set 1 of back squat' }))
    expect(fields.queryByLabelText('Reps')).not.toBeInTheDocument()
    await user.type(fields.getAllByRole('spinbutton')[1], '30')
    await user.click(fields.getByRole('button', { name: 'Log set 1' }))

    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 1,
      durationSeconds: 30,
    })
  })

  it('keeps every field as typed after the set is handed over', async () => {
    // The logger clears nothing: the form remounts only when the shell's set
    // list moves the set number on, so a write that never lands loses nothing.
    const user = userEvent.setup()
    mount()

    await user.type(form(1).getByLabelText('Weight (kg)'), '60')
    await user.type(form(1).getByLabelText('Reps'), '8')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    expect(form(1).getByLabelText('Weight (kg)')).toHaveValue(60)
    expect(form(1).getByLabelText('Reps')).toHaveValue(8)
  })

  it('labels the weight without a unit when the profile’s is unread', () => {
    mount({ weightUnit: null })

    expect(form(1).getByLabelText('Weight')).toBeInTheDocument()
  })
})

describe('what the logger refuses to hand over', () => {
  it('holds the control busy and disabled while a set is in flight', async () => {
    const user = userEvent.setup()
    const { logSet } = mount({ saving: true })

    const submit = form(1).getByRole('button', { name: 'Log set 1' })
    expect(submit).toBeDisabled()
    expect(submit).toHaveAttribute('aria-busy', 'true')

    await user.type(form(1).getByLabelText('Reps'), '8{Enter}')
    expect(logSet).not.toHaveBeenCalled()
  })

  it('refuses a negative weight, and says why at the field', async () => {
    const user = userEvent.setup()
    const { logSet } = mount()

    const weight = form(1).getByLabelText('Weight (kg)')
    await user.type(weight, '-5')

    expect(weight).toHaveAttribute('aria-invalid', 'true')
    expect(form(1).getByText('Enter a weight of zero or more')).toBeInTheDocument()
    expect(form(1).getByRole('button', { name: 'Log set 1' })).toBeDisabled()

    await user.type(form(1).getByLabelText('Reps'), '8{Enter}')
    expect(logSet).not.toHaveBeenCalled()
  })

  it('refuses an RPE outside the scale', async () => {
    const user = userEvent.setup()
    const { logSet } = mount()

    await user.type(form(1).getByLabelText('RPE'), '11{Enter}')

    expect(form(1).getByText('RPE runs 1 to 10')).toBeInTheDocument()
    expect(form(1).getByRole('button', { name: 'Log set 1' })).toBeDisabled()
    expect(logSet).not.toHaveBeenCalled()
  })

  it('accepts a zero, because a failed attempt is a result', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount()

    await user.type(form(1).getByLabelText('Reps'), '0')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 1,
      reps: 0,
    })
  })
})
