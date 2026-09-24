/**
 * EXE-02 acceptance — "standard sets persist reps, load/time, unit, order, and
 * exercise/block attribution through the shared execution contract", asserted
 * at the seam the renderers actually use.
 *
 * `set-logging.test.ts` proves the mapping; this proves the path. The renderer
 * below is every structure's renderer reduced to the only thing this contract
 * asks of them — hand one performed set to `logSet` — so what is asserted is
 * what the *shell* adds on the way to the row: the id, the unit, the block the
 * set was performed in, and the refusal of a set that does not belong to this
 * session at all.
 *
 * The live-write requirement is the one a behavioural test can genuinely show:
 * each `logSet` is one write, at the moment it was called, with nothing held
 * until the block or the workout ends.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Enums } from '../data/database.types'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  snapshotFixture,
  type ExerciseFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { createError, err, ErrorCode } from './errors'
import { SetLoggingProvider } from './set-logging-provider'
import { useSetLogging, type PerformedSet } from './set-logging'
import { sessionProgress, type ExerciseProgress } from './workout-progress'

/** Ids the double mints, so a test can name a set log before it exists. */
const MINTED = [
  'a0000001-0000-4000-8000-000000000000',
  'a0000002-0000-4000-8000-000000000000',
  'a0000003-0000-4000-8000-000000000000',
]

/**
 * A renderer, reduced to the one thing every renderer must do. It also draws
 * what it has been told, so the assertions about prefill and about a failed
 * write can be made on the screen rather than on internal state.
 */
function FakeRenderer({
  exercise,
  performed,
}: {
  exercise: ExerciseProgress
  performed: PerformedSet
}) {
  const { logSet, loggedSets, isSaving } = useSetLogging()
  const sets = loggedSets(exercise.exerciseId)

  return (
    <div>
      <button
        type="button"
        onClick={() => logSet(exercise.exerciseId, performed)}
      >
        {`Log set ${performed.setNumber}`}
      </button>
      <p>{`${sets.length} logged`}</p>
      {/* The set numbers in the order the seam answered them. */}
      <p>{`order ${sets.map((set) => set.setNumber).join(',')}`}</p>
      {isSaving(exercise.exerciseId) ? <p>saving</p> : null}
    </div>
  )
}

interface Mounted {
  workout: WorkoutDouble
  exercises: readonly ExerciseProgress[]
  failures: string[]
}

function mount(
  options: {
    exercises?: (Enums<'execution_status'> | ExerciseFixture)[]
    weightUnit?: Enums<'weight_unit'> | null
    performed?: PerformedSet
    double?: WorkoutDouble
  } = {},
): Mounted {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [{ structureType: 'standard', exercises: options.exercises ?? ['not_started'] }],
      },
    ],
  })
  const workout = options.double ?? createWorkoutDouble({ session: snapshot })
  const exercises = sessionProgress(snapshot)
    .sections.flatMap((section) => section.blocks)
    .flatMap((block) => block.exercises)
  const failures: string[] = []

  let minted = 0

  render(
    <AppProviders workout={workout.clients}>
      <SetLoggingProvider
        exercises={exercises}
        weightUnit={options.weightUnit === undefined ? 'kg' : options.weightUnit}
        onFailure={(error) => failures.push(error.code)}
        newId={() => MINTED[minted++] ?? MINTED[0]}
      >
        {exercises.map((exercise, index) => (
          <FakeRenderer
            key={exercise.exerciseId}
            exercise={exercise}
            performed={options.performed ?? { setNumber: index + 1, reps: 8, weight: 60 }}
          />
        ))}
      </SetLoggingProvider>
    </AppProviders>,
  )

  return { workout, exercises, failures }
}

async function logSet(setNumber: number): Promise<void> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: `Log set ${setNumber}` }))
}

describe('a set is attributed to the prescription and block it was performed in', () => {
  it('carries the exercise, the block and the unit the shell stamped', async () => {
    const { workout, exercises } = mount()

    await logSet(1)

    await waitFor(() =>
      expect(workout.loggedSets()).toEqual([
        {
          id: MINTED[0],
          exerciseId: exercises[0].exerciseId,
          // Attribution, not a column: the row reaches its block through the
          // prescription, and the provider is what proves it is a block of
          // *this* session rather than trusting the caller.
          blockId: exercises[0].blockId,
          distanceUnit: null,
          weightUnit: 'kg',
          performed: { setNumber: 1, reps: 8, weight: 60 },
        },
      ]),
    )
  })

  it('attributes each movement’s sets to its own prescription', async () => {
    const { workout, exercises } = mount({ exercises: ['not_started', 'not_started'] })

    await logSet(1)
    await logSet(2)

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(2))
    expect(workout.loggedSets().map((entry) => entry.exerciseId)).toEqual([
      exercises[0].exerciseId,
      exercises[1].exerciseId,
    ])
  })

  it('refuses a set for an exercise that is not in this session', async () => {
    const user = userEvent.setup()
    const snapshot = snapshotFixture({
      sections: [
        {
          sectionType: 'primary_lift',
          blocks: [{ structureType: 'standard', exercises: ['not_started'] }],
        },
      ],
    })
    const workout = createWorkoutDouble({ session: snapshot })
    const exercises = sessionProgress(snapshot)
      .sections.flatMap((section) => section.blocks)
      .flatMap((block) => block.exercises)

    // A prescription id no block of this session carries — what a stale card,
    // or one whose prescription was swapped out, would hand over.
    const stranger: ExerciseProgress = {
      ...exercises[0],
      exerciseId: 'ffffffff-0000-4000-8000-000000000000',
    }

    render(
      <AppProviders workout={workout.clients}>
        <SetLoggingProvider exercises={exercises} weightUnit="kg" onFailure={() => {}}>
          <FakeRenderer exercise={stranger} performed={{ setNumber: 1, reps: 8 }} />
        </SetLoggingProvider>
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: 'Log set 1' }))

    // No row, and no row attributed to somebody else's block either.
    expect(workout.loggedSets()).toEqual([])
  })

  it('takes the distance unit from the prescription rather than the caller', async () => {
    const { workout } = mount({
      exercises: [
        {
          prescription: {
            modality: 'distance',
            target_kind: 'fixed',
            target_value: 400,
            distance_unit: 'm',
          },
        },
      ],
      performed: { setNumber: 1, distance: 400 },
    })

    await logSet(1)

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))
    expect(workout.loggedSets()[0].distanceUnit).toBe('m')
  })
})

describe('the unit is the profile’s, stamped per row at write time', () => {
  it.each(['kg', 'lb'] as Enums<'weight_unit'>[])('stamps %s on the row', async (unit) => {
    const { workout } = mount({ weightUnit: unit })

    await logSet(1)

    await waitFor(() => expect(workout.loggedSets()[0]?.weightUnit).toBe(unit))
  })

  it('refuses the set rather than guessing a unit when the profile is unread', async () => {
    const { workout, failures } = mount({ weightUnit: null })

    await logSet(1)

    // A kilogram recorded as a pound is an injury path, not a display bug.
    await waitFor(() => expect(failures).toEqual([ErrorCode.VALIDATION_REQUIRED_FIELD]))
    expect(workout.loggedSets()).toEqual([])
  })
})

describe('each set is a row written at log time', () => {
  it('writes one row per set, as each is logged', async () => {
    const { workout } = mount({ exercises: ['not_started', 'not_started'] })

    await logSet(1)
    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))

    // The second write happens because a second set was logged — nothing was
    // held back waiting for the block or the workout to end.
    await logSet(2)
    await waitFor(() => expect(workout.loggedSets()).toHaveLength(2))
  })

  it('mints a distinct id per set, so a retry collides instead of duplicating', async () => {
    const { workout } = mount({ exercises: ['not_started', 'not_started'] })

    await logSet(1)
    await logSet(2)

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(2))
    expect(workout.loggedSets().map((entry) => entry.id)).toEqual([MINTED[0], MINTED[1]])
  })

  it('refuses a second set under a number already recorded', async () => {
    const { workout } = mount()

    await logSet(1)
    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))

    // `exercise_set_logs_set_number_unique` would refuse it, and an error in
    // front of a user whose set is already recorded is worse than no write.
    await logSet(1)
    await waitFor(() => expect(screen.getByText('1 logged')).toBeInTheDocument())
    expect(workout.loggedSets()).toHaveLength(1)
  })
})

describe('what the screen shows about a set', () => {
  it('seeds the sets a resumed session already carries, lowest first', () => {
    mount({
      exercises: [
        {
          setLogs: [
            { set_number: 2, actual_reps: 8, weight: 70 },
            { set_number: 1, actual_reps: 10, weight: 60 },
          ],
        },
      ],
    })

    expect(screen.getByText('2 logged')).toBeInTheDocument()
    // Sorted by set number, not by the order the snapshot happened to answer.
    expect(screen.getByText('order 1,2')).toBeInTheDocument()
  })

  it('draws a set as logged only once a row has come back', async () => {
    const snapshot = snapshotFixture({
      sections: [
        {
          sectionType: 'primary_lift',
          blocks: [{ structureType: 'standard', exercises: ['not_started'] }],
        },
      ],
    })
    const double = createWorkoutDouble({
      session: snapshot,
      setLogs: {
        log: async () =>
          err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED, { details: {} })),
      },
    })
    const { failures } = mount({ double })

    await logSet(1)

    await waitFor(() => expect(failures).toEqual([ErrorCode.PERSISTENCE_WRITE_FAILED]))
    // Nothing was added: a set is drawn as logged because a row came back,
    // never because one was attempted.
    expect(screen.getByText('0 logged')).toBeInTheDocument()
  })
})
