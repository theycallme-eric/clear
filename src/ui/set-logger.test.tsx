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
import { fireEvent, render, screen, within } from '@testing-library/react'
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
    isWarmup: false,
    effort: null,
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
  const tree = (unit = api.weightUnit) => (
    <AppProviders workout={workout.clients}>
      <SetLoggingContext value={{ ...api, weightUnit: unit }}>
        {options.inCard ? <Card>{logger}</Card> : logger}
      </SetLoggingContext>
    </AppProviders>
  )
  const view = render(tree())

  return { ...view, exercise, logSet,
    rerenderUnit: (unit: Enums<'weight_unit'> | null) => view.rerender(tree(unit)) }
}

/**
 * The entry form, in the half-sheet. With no shell host mounted the sheet is
 * drawn in place, so the card's Log set opens it here.
 */
function form(setNumber: number) {
  if (screen.queryByRole('form', { name: /^Log set \d+ of back squat$/ }) === null) {
    fireEvent.click(screen.getByRole('button', { name: 'Log set' }))
  }
  return within(screen.getByRole('form', { name: `Log set ${setNumber} of back squat` }))
}

describe('the logger is drawn with the shared frame, and frames nothing itself', () => {
  it('draws no card of its own around the movement, its readout or its form', () => {
    // Outside a block the coaching panel is still its own card — that frame is
    // `exercise-coaching.tsx`'s — so what is asserted is the logger's own parts.
    mount()

    expect(screen.getByRole('heading', { name: 'back squat' }).closest('.clr-card')).toBeNull()
    expect(screen.getByText('Set 1/3').closest('.clr-card')).toBeNull()
    form(1)
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

  it('sets its two numeric fields and unit choice in one compact row, each a current element frame', () => {
    mount()

    const weight = form(1).getByLabelText('Weight')
    const row = weight.closest('.clr-set-sheet__measures')
    expect(row).not.toBeNull()

    // Two optional numbers plus their unit; no effort (REQ-015, U36).
    expect(form(1).getAllByRole('spinbutton')).toHaveLength(2)
    for (const label of ['Weight', 'Reps']) {
      const field = form(1).getByLabelText(label)
      expect(field).toHaveClass('clr-input')
      expect(field.closest('.clr-set-sheet__measures')).toBe(row)
      expect(field.closest('.clr-field')).not.toBeNull()
    }
    const unit = form(1).getByRole('combobox', { name: 'Unit' })
    expect(unit).toHaveClass('clr-input')
    expect(unit.closest('.clr-set-sheet__measures')).toBe(row)
    expect(unit.closest('.clr-field')).not.toBeNull()
    // The row adds no frame: the fields are the only chamfers in it.
    expect(row).not.toHaveClass('clr-chamfer')
  })

  it('asks for no effort and offers no warmup checkbox', () => {
    mount()

    expect(screen.queryByLabelText(/RPE/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/exertion|effort/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
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
  it('draws no list and no placeholder sentence before a set is logged; the counter says it', () => {
    mount()

    expect(screen.queryByText(/No sets logged/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Logged sets' })).not.toBeInTheDocument()
    expect(screen.getByText('Set 1/3')).toBeInTheDocument()
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
    // The warmup classification is still a word, never a tint.
    expect(
      loggedSetText(loggedSet({ setNumber: 3, reps: 0, weight: null, isWarmup: true })),
    ).toBe('Set 3 · 0 reps · Warmup')
    expect(
      loggedSetText(loggedSet({ setNumber: 2, reps: null, weight: 0 })),
    ).toBe('Set 2 · 0 kg')
    expect(
      loggedSetText(
        loggedSet({ setNumber: 1, reps: null, distance: 400, distanceUnit: 'm', weight: null }),
      ),
    ).toBe('Set 1 · 400 m')
  })
})

describe('set progression', () => {
  it('offers set one of an untouched movement, counted beside its heading', () => {
    mount()

    expect(screen.getByText('Set 1/3')).toBeInTheDocument()
    expect(form(1).getByRole('button', { name: 'Log set 1' })).toBeEnabled()
  })

  it('offers the lowest set not yet recorded', () => {
    mount({ logged: [loggedSet({ setNumber: 1 }), loggedSet({ setNumber: 3 })] })

    expect(screen.getByText('Set 2/3')).toBeInTheDocument()
    expect(form(2).getByRole('button', { name: 'Log set 2' })).toBeEnabled()
  })

  it('offers an extra set once every prescribed set is recorded', () => {
    mount({
      logged: [
        loggedSet({ setNumber: 1 }),
        loggedSet({ setNumber: 2 }),
        loggedSet({ setNumber: 3 }),
      ],
    })

    expect(screen.getByText('Extra set 4')).toBeInTheDocument()
    expect(form(4).getByRole('button', { name: 'Log set 4' })).toBeEnabled()
  })

  it('prefills the next set’s weight from the last one performed, and its reps from the prescription', () => {
    mount({ logged: [loggedSet({ setNumber: 1, weight: 62.5, reps: 7 })] })

    expect(form(2).getByLabelText('Weight')).toHaveValue(62.5)
    expect(form(2).getByLabelText('Reps')).toHaveValue(8)
  })

  it('falls back to the last set performed where the prescription states no number', () => {
    mount({
      prescription: { target_kind: 'fixed', target_value: null },
      logged: [loggedSet({ setNumber: 1, reps: 7 })],
    })

    expect(form(2).getByLabelText('Reps')).toHaveValue(7)
  })

  it('suggests the prescribed reps as an editable value, never as a recorded one', () => {
    // The suggestion is the field's starting value; nothing is handed over.
    const { logSet } = mount()

    expect(form(1).getByLabelText('Reps')).toHaveValue(8)
    expect(form(1).getByLabelText('Weight')).toHaveValue(null)
    expect(logSet).not.toHaveBeenCalled()
  })

  it('keeps a prefilled blank blank rather than turning it into a zero', () => {
    mount({ logged: [loggedSet({ setNumber: 1, weight: null, reps: 0 })] })

    expect(form(2).getByLabelText('Weight')).toHaveValue(null)
  })
})

describe('what the logger hands the shell', () => {
  it('freezes the displayed unit after typing when the profile refreshes', async () => {
    const user = userEvent.setup()
    const { exercise, logSet, rerenderUnit } = mount()
    await user.type(form(1).getByLabelText('Weight'), '60')
    rerenderUnit('lb')
    expect(form(1).getByLabelText('Weight')).toHaveValue(60)
    expect(form(1).getByRole('combobox', { name: 'Unit' })).toHaveValue('kg')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 1, reps: 8, weight: 60, weightUnit: 'kg',
    })
  })

  it('can follow a loaded profile unit while the form is still untouched', () => {
    const { rerenderUnit } = mount({ weightUnit: null })
    form(1)
    rerenderUnit('lb')
    expect(form(1).getByLabelText('Weight')).toHaveValue(null)
    expect(form(1).getByRole('combobox', { name: 'Unit' })).toHaveValue('lb')
  })

  it.each([
    ['kg', 'lb', 135],
    ['lb', 'kg', 60],
    ['kg', 'lb', 0],
  ] as const)('keeps a %s profile from relabelling an observed %s weight', async (profile, unit, weight) => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount({
      weightUnit: profile,
      logged: [loggedSet({ setNumber: 1, weight, weightUnit: unit, reps: 5 })],
    })

    expect(form(2).getByLabelText('Weight')).toHaveValue(weight)
    expect(form(2).getByRole('combobox', { name: 'Unit' })).toHaveValue(unit)
    await user.click(form(2).getByRole('button', { name: 'Log set 2' }))
    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 2, weight, reps: 8, weightUnit: unit,
    })
  })

  it('uses the profile unit for a reference with no observed weight', () => {
    mount({ logged: [loggedSet({ setNumber: 1, weight: null, weightUnit: 'lb' })] })
    expect(form(2).getByLabelText('Weight')).toHaveValue(null)
    expect(form(2).getByRole('combobox', { name: 'Unit' })).toHaveValue('kg')
  })

  it('explicitly relabels rather than converting entered weight, including clears', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount()
    await user.type(form(1).getByLabelText('Weight'), '135.5')
    await user.selectOptions(form(1).getByRole('combobox', { name: 'Unit' }), 'lb')
    expect(form(1).getByLabelText('Weight')).toHaveValue(135.5)
    // The unit sits beside the number; no repeated helper sentence explains it.
    expect(screen.queryByText(/Changing units keeps the number/)).not.toBeInTheDocument()
    await user.clear(form(1).getByLabelText('Weight'))
    await user.clear(form(1).getByLabelText('Reps'))
    await user.type(form(1).getByLabelText('Reps'), '0')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 1, reps: 0, weightUnit: 'lb',
    })
  })

  it('logs the set against this prescription, with only what was entered', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount()

    await user.type(form(1).getByLabelText('Weight'), '60')
    await user.clear(form(1).getByLabelText('Reps'))
    await user.type(form(1).getByLabelText('Reps'), '8')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    // No effort and no warmup flag are ever handed over (REQ-015).
    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 1,
      reps: 8,
      weight: 60,
    })
  })

  it('logs a cleared set without blocking, recording nothing it was not told', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount()

    await user.clear(form(1).getByLabelText('Reps'))
    const submit = form(1).getByRole('button', { name: 'Log set 1' })
    expect(submit).toBeEnabled()
    await user.click(submit)

    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, { setNumber: 1 })
  })

  it('logs a partial set with only the field that was entered', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount()

    await user.clear(form(1).getByLabelText('Reps'))
    await user.type(form(1).getByLabelText('Weight'), '40')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 1,
      weight: 40,
    })
  })

  it('takes an edited prefill, and a cleared one as not recorded', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount({
      logged: [loggedSet({ setNumber: 1, weight: 60, reps: 8 })],
    })

    await user.clear(form(2).getByLabelText('Weight'))
    await user.clear(form(2).getByLabelText('Reps'))
    await user.type(form(2).getByLabelText('Reps'), '6')
    await user.click(form(2).getByRole('button', { name: 'Log set 2' }))

    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 2,
      reps: 6,
    })
  })

  it('writes a timed prescription’s measure to its own column, asked for in Seconds', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount({
      prescription: { modality: 'time', target_kind: 'fixed', target_value: 30 },
    })

    expect(form(1).queryByLabelText('Reps')).not.toBeInTheDocument()
    const seconds = form(1).getByLabelText('Seconds')
    expect(seconds).toHaveValue(30)
    await user.clear(seconds)
    await user.type(seconds, '25')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 1,
      durationSeconds: 25,
    })
  })

  it('keeps every field as typed after the set is handed over', async () => {
    // The logger clears nothing: the entry is replaced only when the shell's
    // set list moves the set number on, so a write that never lands loses nothing.
    const user = userEvent.setup()
    mount()

    await user.type(form(1).getByLabelText('Weight'), '60')
    await user.clear(form(1).getByLabelText('Reps'))
    await user.type(form(1).getByLabelText('Reps'), '7')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    expect(form(1).getByLabelText('Weight')).toHaveValue(60)
    expect(form(1).getByLabelText('Reps')).toHaveValue(7)
  })

  it('asks for a unit rather than assuming one when the profile’s is unread', () => {
    mount({ weightUnit: null })

    expect(form(1).getByLabelText('Weight')).toBeInTheDocument()
    expect(form(1).getByRole('combobox', { name: 'Unit' })).toHaveValue('')
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

    const weight = form(1).getByLabelText('Weight')
    await user.type(weight, '-5')

    expect(weight).toHaveAttribute('aria-invalid', 'true')
    expect(form(1).getByText('Enter a weight of zero or more')).toBeInTheDocument()
    expect(form(1).getByRole('button', { name: 'Log set 1' })).toBeDisabled()

    await user.type(form(1).getByLabelText('Reps'), '{Enter}')
    expect(logSet).not.toHaveBeenCalled()
  })

  it('accepts a zero, because a failed attempt is a result', async () => {
    const user = userEvent.setup()
    const { exercise, logSet } = mount()

    await user.clear(form(1).getByLabelText('Reps'))
    await user.type(form(1).getByLabelText('Reps'), '0')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    expect(logSet).toHaveBeenCalledExactlyOnceWith(exercise.exerciseId, {
      setNumber: 1,
      reps: 0,
    })
  })
})
