/**
 * EXE-02 acceptance — "superset exercises remain ordered and every set persists
 * unit and correct exercise/block attribution", asserted through the renderer
 * the shell actually dispatches to.
 *
 * The two halves of that sentence are tested as two different kinds of thing,
 * on purpose:
 *
 *   · **Ordered** is a claim about the screen, so it is read off the screen —
 *     and the fixture prescribes its movements in one order while the snapshot
 *     lists them in the other, because a renderer that labelled them in arrival
 *     order would pass a test whose fixture agreed with itself.
 *   · **Persists unit and attribution** is a claim about the row, so it is read
 *     off the client: the entry the shell handed the transport, with the
 *     exercise, the block, the weight unit and — for a distance — the
 *     prescription's own unit on it.
 *
 * Completion is not re-asserted here. `block-renderers.test.tsx` already proves
 * every structure, this one included, completes through the shell's seam with
 * an outcome it observed; what this file adds is what a superset does that no
 * other structure does.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
} from '../state/block-completion'
import type { WorkoutExerciseRow } from '../state/schemas'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  snapshotFixture,
  type BlockFixture,
  type ExerciseFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import type { Enums } from '../data/database.types'
import { BlockSlot } from './block-renderers'

/** The id the double mints for the one set these tests log. */
const MINTED = 'a0000001-0000-4000-8000-000000000000'

/**
 * The pair, prescribed in the opposite order to the one it is listed in:
 * `back-squat` carries `order_index` 1 and `romanian-deadlift` carries 0, so
 * the snapshot's array order and the prescription's order disagree. A1 is
 * therefore the second row in the list, and its `workout_exercises.id` is the
 * second the fixture mints — which is what makes the attribution assertion mean
 * something.
 */
function pair(shared: Partial<WorkoutExerciseRow> = {}): ExerciseFixture[] {
  return [
    { prescription: { exercise_id: 'back-squat', order_index: 1, ...shared } },
    { prescription: { exercise_id: 'romanian-deadlift', order_index: 0, ...shared } },
  ]
}

interface Mounted {
  workout: WorkoutDouble
  block: BlockProgress
}

function mount(
  options: {
    block?: BlockFixture
    weightUnit?: Enums<'weight_unit'> | null
  } = {},
): Mounted {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [
          {
            structureType: 'superset',
            roundRestSeconds: 90,
            exercises: pair(),
            ...options.block,
          },
        ],
      },
    ],
  })
  const workout = createWorkoutDouble({ session: snapshot })
  const progress = sessionProgress(snapshot)
  const block = progress.sections[0].blocks[0]

  const completion: BlockCompletionApi = {
    completeBlock: vi.fn(),
    isBlockRecorded: () => false,
  }

  render(
    <AppProviders workout={workout.clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider
          exercises={block.exercises}
          weightUnit={options.weightUnit === undefined ? 'kg' : options.weightUnit}
          onFailure={() => {}}
          newId={() => MINTED}
        >
          {/* Dispatched rather than named: the registry decides the renderer. */}
          <BlockSlot block={block} />
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>,
  )

  return { workout, block }
}

/** Every movement's heading, in the order the document lays them out. */
function movementHeadings(): string[] {
  return screen
    .getAllByRole('heading')
    .map((heading) => heading.textContent ?? '')
}

/** The one movement's form, so two movements' fields never collide. */
function formFor(name: string, setNumber = 1) {
  return within(screen.getByRole('form', { name: `Log set ${setNumber} of ${name}` }))
}

describe('a superset keeps its movements in the order the rows prescribe', () => {
  it('labels them A1 and A2 by order_index, not by the order they arrived in', () => {
    mount()

    expect(movementHeadings()).toEqual(['A1 romanian deadlift', 'A2 back squat'])
  })

  it('states the alternation in words, not only with the connector', () => {
    mount()

    // Colour is never the only cue: the rule down the pair's left edge says
    // "one unit" visually, and this says it in the text.
    expect(
      screen.getByText('Alternate A1 → A2 — no rest between movements'),
    ).toBeInTheDocument()
  })

  it('offers each movement its own set-one form, named for that movement', () => {
    mount()

    expect(formFor('romanian deadlift').getByRole('button', { name: 'Log set 1' })).toBeInTheDocument()
    expect(formFor('back squat').getByRole('button', { name: 'Log set 1' })).toBeInTheDocument()
  })
})

describe('rest is the block’s, prescribed after both movements', () => {
  it('states the block’s rest once, below the pair', () => {
    mount()

    expect(screen.getByText('Rest 90s after both movements')).toBeInTheDocument()
  })

  it('states no per-movement rest, however much the prescriptions carry', () => {
    // Both prescriptions carry `rest_seconds: 90`; a superset rests once, after
    // A2, so neither movement states a rest of its own.
    mount()

    expect(screen.queryByText('Rest 90s')).not.toBeInTheDocument()
  })

  it('renders no rest line at all when the block prescribes none', () => {
    mount({ block: { roundRestSeconds: null } })

    // The pairing line's "no rest between movements" is the opposite claim, and
    // is not what is looked for: a *statement of rest* is `Rest 90s …`.
    expect(screen.queryByText(/^Rest \d/)).not.toBeInTheDocument()
  })

  it('never renders a zero rest as a rest', () => {
    mount({ block: { roundRestSeconds: 0 } })

    expect(screen.queryByText(/^Rest \d/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Rest 0/)).not.toBeInTheDocument()
  })
})

describe('every set persists its unit and its exercise and block attribution', () => {
  it('writes the set against the movement performed, in the block it was performed in', async () => {
    const user = userEvent.setup()
    const { workout, block } = mount()

    // A2 — the movement whose row is *first* in the snapshot and second on the
    // screen. Logging against it is what a positional bug would get wrong.
    const form = formFor('back squat')
    await user.type(form.getByLabelText('Weight (kg)'), '60')
    await user.type(form.getByLabelText('Reps'), '8')
    await user.click(form.getByRole('button', { name: 'Log set 1' }))

    const a2 = block.exercises[1]
    await waitFor(() =>
      expect(workout.loggedSets()).toEqual([
        {
          id: MINTED,
          exerciseId: a2.exerciseId,
          blockId: block.blockId,
          distanceUnit: null,
          weightUnit: 'kg',
          performed: { setNumber: 1, reps: 8, weight: 60 },
        },
      ]),
    )
    expect(a2.prescription.exercise_id).toBe('back-squat')
  })

  it('stamps the profile’s unit on the row rather than a guessed one', async () => {
    const user = userEvent.setup()
    const { workout } = mount({ weightUnit: 'lb' })

    const form = formFor('romanian deadlift')
    await user.type(form.getByLabelText('Weight (lb)'), '135')
    await user.type(form.getByLabelText('Reps'), '10')
    await user.click(form.getByRole('button', { name: 'Log set 1' }))

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))
    expect(workout.loggedSets()[0].weightUnit).toBe('lb')
  })

  it('logs the modality prescribed, in the prescription’s own unit', async () => {
    const user = userEvent.setup()
    const { workout, block } = mount({
      block: {
        structureType: 'superset',
        roundRestSeconds: 90,
        exercises: pair({
          modality: 'distance',
          distance_unit: 'm',
          target_kind: 'fixed',
          target_value: 400,
        }),
      },
    })

    const form = formFor('romanian deadlift')
    await user.type(form.getByLabelText('Distance (m)'), '400')
    await user.click(form.getByRole('button', { name: 'Log set 1' }))

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))
    // Distance in its own column and its own unit: a carry logged as reps is
    // the quiet data loss the requirement forbids.
    expect(workout.loggedSets()[0]).toMatchObject({
      exerciseId: block.exercises[0].exerciseId,
      blockId: block.blockId,
      distanceUnit: 'm',
      performed: { setNumber: 1, distance: 400 },
    })
  })

  it('shows each target kind from the structured prescription, never a parsed string', () => {
    mount({
      block: {
        structureType: 'superset',
        exercises: [
          {
            prescription: {
              exercise_id: 'back-squat',
              order_index: 0,
              target_kind: 'range',
              target_value: null,
              target_min: 8,
              target_max: 10,
            },
          },
          {
            prescription: {
              exercise_id: 'romanian-deadlift',
              order_index: 1,
              target_kind: 'sequence',
              target_value: null,
              target_sequence: [15, 12, 9, 6, 3],
            },
          },
        ],
      },
    })

    expect(screen.getByText('3 × 8–10 reps')).toBeInTheDocument()
    expect(screen.getByText('5 rungs · 15-12-9-6-3 reps')).toBeInTheDocument()
  })
})

describe('a superset whose movements were swapped out', () => {
  it('says the block has nothing left to perform rather than drawing an empty card', () => {
    mount({
      block: {
        structureType: 'superset',
        exercises: pair({ revision_status: 'superseded' }),
      },
    })

    expect(
      screen.getByText(/every movement in it was swapped\s+out/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('still states the block’s rest and its remaining movement when one survives', () => {
    mount({
      block: {
        structureType: 'superset',
        roundRestSeconds: 60,
        exercises: [
          {
            prescription: {
              exercise_id: 'back-squat',
              order_index: 0,
              revision_status: 'superseded',
            },
          },
          { prescription: { exercise_id: 'romanian-deadlift', order_index: 1 } },
        ],
      },
    })

    expect(movementHeadings()).toEqual(['A1 romanian deadlift'])
    // One movement is not an alternation, so the pairing line is not drawn —
    // but the block's rest is still the block's.
    expect(screen.queryByText(/Alternate/)).not.toBeInTheDocument()
    expect(screen.getByText('Rest 60s after the movement')).toBeInTheDocument()
  })
})
