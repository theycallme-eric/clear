/**
 * EXE-02 and EXE-07 acceptance, asserted at the seam the renderers actually use.
 *
 * `set-logging.test.ts` proves the mapping and `set-log-queue.test.ts` proves
 * the queue's own rules; this proves the path. The renderer below is every
 * structure's renderer reduced to the only thing this contract asks of them —
 * hand one performed set to `logSet` — so what is asserted is what the *shell*
 * adds on the way to the row: the id, the unit, the block the set was performed
 * in, the refusal of a set that does not belong to this session at all, and
 * (EXE-07) the fact that the set is durable before the request exists and is
 * never drawn as confirmed until a row does.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Enums } from '../data/database.types'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type ExerciseFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { createError, err, ErrorCode, type AppError } from './errors'
import {
  queuedSetLog,
  readSetLogQueue,
  writeSetLogQueue,
  type QueuedSetLog,
  type QueueStorage,
} from './set-log-queue'
import { SetLoggingProvider } from './set-logging-provider'
import { useSetLogging, type PerformedSet, type SetLogEntry } from './set-logging'
import { sessionProgress, type ExerciseProgress } from './workout-progress'

/** Ids the double mints, so a test can name a set log before it exists. */
const MINTED = [
  'a0000001-0000-4000-8000-000000000000',
  'a0000002-0000-4000-8000-000000000000',
  'a0000003-0000-4000-8000-000000000000',
]

/** Long enough that only an explicit flush runs, except where retry is the subject. */
const NO_AUTOMATIC_RETRY = () => 1_000_000

/** A `localStorage` a test owns outright, and can read back as the disk. */
function memoryStorage(seed: Record<string, string> = {}): QueueStorage {
  const data = new Map(Object.entries(seed))

  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

/**
 * A renderer, reduced to the one thing every renderer must do. It also draws
 * what it has been told, so the assertions about prefill, about sync status and
 * about a failed write can be made on the screen rather than on internal state.
 */
function FakeRenderer({
  exercise,
  performed,
}: {
  exercise: ExerciseProgress
  performed: PerformedSet
}) {
  const { logSet, loggedSets, isSaving, sync, retrySync } = useSetLogging()
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
      {/* Where each of them has actually got to. */}
      <p>{`status ${sets.map((set) => `${set.setNumber}:${set.status}`).join(',')}`}</p>
      <p>{`unsynced ${sync.unsyncedCount}`}</p>
      {sync.sustainedFailure ? <p>sustained failure</p> : null}
      {isSaving(exercise.exerciseId) ? <p>saving</p> : null}
      <button type="button" onClick={retrySync}>
        Retry sync
      </button>
    </div>
  )
}

interface MountOptions {
  exercises?: (Enums<'execution_status'> | ExerciseFixture)[]
  weightUnit?: Enums<'weight_unit'> | null
  performed?: PerformedSet
  double?: WorkoutDouble
  storage?: QueueStorage | null
  retryDelay?: () => number
}

interface Mounted {
  workout: WorkoutDouble
  exercises: readonly ExerciseProgress[]
  failures: string[]
  storage: QueueStorage
  /** Re-mounts the provider over the same storage: a reload, in one call. */
  remount: (next?: MountOptions) => Mounted
}

function mount(options: MountOptions = {}): Mounted {
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
  const storage = options.storage === undefined ? memoryStorage() : options.storage
  const exercises = sessionProgress(snapshot)
    .sections.flatMap((section) => section.blocks)
    .flatMap((block) => block.exercises)
  const failures: string[] = []

  let minted = 0

  render(
    <AppProviders workout={workout.clients}>
      <SetLoggingProvider
        sessionId={FIXTURE_SESSION_ID}
        exercises={exercises}
        weightUnit={options.weightUnit === undefined ? 'kg' : options.weightUnit}
        onFailure={(error) => failures.push(error.code)}
        newId={() => MINTED[minted++] ?? MINTED[0]}
        storage={storage}
        retryDelay={options.retryDelay ?? NO_AUTOMATIC_RETRY}
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

  return {
    workout,
    exercises,
    failures,
    storage: storage ?? memoryStorage(),
    remount: (next = {}) => mount({ ...options, ...next, storage }),
  }
}

async function logSet(setNumber: number): Promise<void> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: `Log set ${setNumber}` }))
}

/**
 * A double whose set-log writes answer whatever the policy says. Returning an
 * error refuses the write; returning null lets the real double record it, so a
 * test can still read back every insert that was actually attempted.
 */
function refusing(
  base: WorkoutDouble,
  policy: (entry: SetLogEntry, attempt: number) => AppError | null,
): { double: WorkoutDouble; attempts: SetLogEntry[] } {
  const attempts: SetLogEntry[] = []

  return {
    attempts,
    double: {
      ...base,
      clients: {
        ...base.clients,
        setLogs: {
          async log(entry) {
            attempts.push(entry)
            const refusal = policy(entry, attempts.length)
            return refusal === null ? base.clients.setLogs.log(entry) : err(refusal)
          },
        },
      },
    },
  }
}

const offline = () => createError(ErrorCode.NETWORK_OFFLINE)

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
    const storage = memoryStorage()

    render(
      <AppProviders workout={workout.clients}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          exercises={exercises}
          weightUnit="kg"
          onFailure={() => {}}
          storage={storage}
        >
          <FakeRenderer exercise={stranger} performed={{ setNumber: 1, reps: 8 }} />
        </SetLoggingProvider>
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: 'Log set 1' }))

    // No row, no queued row, and nothing attributed to somebody else's block.
    expect(workout.loggedSets()).toEqual([])
    expect(readSetLogQueue(storage)).toEqual([])
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
    const { workout, failures, storage } = mount({ weightUnit: null })

    await logSet(1)

    // A kilogram recorded as a pound is an injury path, not a display bug. And
    // a set that was never accepted is never queued either.
    await waitFor(() => expect(failures).toEqual([ErrorCode.VALIDATION_REQUIRED_FIELD]))
    expect(workout.loggedSets()).toEqual([])
    expect(readSetLogQueue(storage)).toEqual([])
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
    // Both came from rows, so both are confirmed.
    expect(screen.getByText('status 1:logged,2:logged')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// EXE-07 — durable set logging
// ─────────────────────────────────────────────────────────────────────────────

describe('a set is durable before it is sent', () => {
  it('writes the set to the queue before the request answers', async () => {
    const base = createWorkoutDouble({
      session: snapshotFixture({
        sections: [
          {
            sectionType: 'primary_lift',
            blocks: [{ structureType: 'standard', exercises: ['not_started'] }],
          },
        ],
      }),
    })
    let release: (() => void) | null = null
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const double: WorkoutDouble = {
      ...base,
      clients: {
        ...base.clients,
        setLogs: {
          async log(entry) {
            await held
            return base.clients.setLogs.log(entry)
          },
        },
      },
    }
    const { storage } = mount({ double })

    await logSet(1)

    // The request has not answered, and the set is already on disk. This is
    // the whole of D7: a tab killed on this line still has the set.
    const queued = readSetLogQueue(storage)
    expect(queued).toHaveLength(1)
    expect(queued[0].entry.id).toBe(MINTED[0])
    expect(queued[0].entry.performed).toEqual({ setNumber: 1, reps: 8, weight: 60 })
    expect(queued[0].sessionId).toBe(FIXTURE_SESSION_ID)

    await act(async () => {
      release?.()
      await held
    })

    // And once the row comes back, the queue owes nothing.
    await waitFor(() => expect(readSetLogQueue(storage)).toEqual([]))
  })

  it('keeps an unsent set on disk across a reload, and sends it on the next mount', async () => {
    const snapshot = snapshotFixture({
      sections: [
        {
          sectionType: 'primary_lift',
          blocks: [{ structureType: 'standard', exercises: ['not_started'] }],
        },
      ],
    })
    const { double, attempts } = refusing(createWorkoutDouble({ session: snapshot }), offline)
    const first = mount({ double })

    await logSet(1)
    await waitFor(() => expect(attempts).toHaveLength(1))
    expect(readSetLogQueue(first.storage)).toHaveLength(1)

    // The tab goes away mid-session. Nothing else runs; only the disk survives.
    cleanup()

    const second = first.remount({ double: createWorkoutDouble({ session: snapshot }) })

    // A set logged at 6:02 is still there at 6:40 — and it reaches the server
    // without the user being asked for anything.
    await waitFor(() => expect(second.workout.loggedSets()).toHaveLength(1))
    expect(second.workout.loggedSets()[0].id).toBe(MINTED[0])
    expect(second.workout.loggedSets()[0].performed).toEqual({
      setNumber: 1,
      reps: 8,
      weight: 60,
    })
    await waitFor(() => expect(readSetLogQueue(second.storage)).toEqual([]))
  })
})

describe('a pending set is never drawn as confirmed', () => {
  it('shows a queued set as syncing, and a refused one as failed', async () => {
    const snapshot = snapshotFixture({
      sections: [
        {
          sectionType: 'primary_lift',
          blocks: [{ structureType: 'standard', exercises: ['not_started'] }],
        },
      ],
    })
    const { double, attempts } = refusing(createWorkoutDouble({ session: snapshot }), offline)
    mount({ double })

    await logSet(1)

    await waitFor(() => expect(attempts).toHaveLength(1))
    // The set is shown — the user performed it — but not as saved.
    await waitFor(() => expect(screen.getByText('status 1:failed')).toBeInTheDocument())
    expect(screen.getByText('1 logged')).toBeInTheDocument()
    expect(screen.getByText('unsynced 1')).toBeInTheDocument()
  })

  it('draws a set as logged once the row comes back', async () => {
    mount()

    await logSet(1)

    await waitFor(() => expect(screen.getByText('status 1:logged')).toBeInTheDocument())
    expect(screen.getByText('unsynced 0')).toBeInTheDocument()
  })

  it('keeps accepting sets while an earlier one is still unsent', async () => {
    const snapshot = snapshotFixture({
      sections: [
        {
          sectionType: 'primary_lift',
          blocks: [{ structureType: 'standard', exercises: ['not_started', 'not_started'] }],
        },
      ],
    })
    const { double } = refusing(createWorkoutDouble({ session: snapshot }), offline)
    const { storage } = mount({ double, exercises: ['not_started', 'not_started'] })

    await logSet(1)
    await logSet(2)

    // Two sets performed, two sets held, nothing refused at the door.
    await waitFor(() => expect(readSetLogQueue(storage)).toHaveLength(2))
  })
})

describe('a retried write does not create a duplicate set', () => {
  it('sends the same client-generated id on every attempt', async () => {
    const snapshot = snapshotFixture({
      sections: [
        {
          sectionType: 'primary_lift',
          blocks: [{ structureType: 'standard', exercises: ['not_started'] }],
        },
      ],
    })
    const { double, attempts } = refusing(
      createWorkoutDouble({ session: snapshot }),
      (_entry, attempt) => (attempt === 1 ? offline() : null),
    )
    const { workout, storage } = mount({ double })

    await logSet(1)
    await waitFor(() => expect(attempts).toHaveLength(1))

    // The retry the notice offers, rather than waiting out a backoff.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retry sync' }))

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))
    // Two attempts, one id, one set on screen.
    expect(attempts.map((entry) => entry.id)).toEqual([MINTED[0], MINTED[0]])
    expect(screen.getByText('1 logged')).toBeInTheDocument()
    await waitFor(() => expect(readSetLogQueue(storage)).toEqual([]))
  })

  it('treats a conflict on its own id as proof the set is already stored', async () => {
    const snapshot = snapshotFixture({
      sections: [
        {
          sectionType: 'primary_lift',
          blocks: [{ structureType: 'standard', exercises: ['not_started'] }],
        },
      ],
    })
    const { double, attempts } = refusing(createWorkoutDouble({ session: snapshot }), () =>
      createError(ErrorCode.PERSISTENCE_CONFLICT),
    )
    const { storage } = mount({ double })

    await logSet(1)

    // The primary key is this queue's own, so the collision is with the write
    // it already made: the set is stored, and it stops being owed.
    await waitFor(() => expect(screen.getByText('status 1:logged')).toBeInTheDocument())
    await waitFor(() => expect(readSetLogQueue(storage)).toEqual([]))
    expect(attempts).toHaveLength(1)
  })
})

describe('an unflushed set reconciles against the server on resume', () => {
  it('drops a queued set the snapshot already carries, without re-sending it', async () => {
    // The set landed; the answer never arrived. The row is in the snapshot and
    // the entry is still on disk under the same id.
    const stored: QueuedSetLog = queuedSetLog(
      {
        id: 'a0000001-0000-4000-8000-000000000000',
        exerciseId: '80000001-0000-4000-8000-000000000000',
        blockId: '70000001-0000-4000-8000-000000000000',
        distanceUnit: null,
        weightUnit: 'kg',
        performed: { setNumber: 1, reps: 8, weight: 60 },
      },
      FIXTURE_SESSION_ID,
      '2026-09-24T09:02:00.000Z',
    )
    const storage = memoryStorage()
    writeSetLogQueue(storage, [stored])

    const { workout } = mount({
      storage,
      exercises: [{ setLogs: [{ set_number: 1, actual_reps: 8, weight: 60 }] }],
    })

    // One set, drawn as stored, and the user is asked for nothing.
    expect(screen.getByText('1 logged')).toBeInTheDocument()
    expect(screen.getByText('status 1:logged')).toBeInTheDocument()
    await waitFor(() => expect(readSetLogQueue(storage)).toEqual([]))
    expect(workout.loggedSets()).toEqual([])
  })
})

describe('sustained failure surfaces once, with a count', () => {
  it('counts the unsynced sets and raises no per-set failure', async () => {
    const snapshot = snapshotFixture({
      sections: [
        {
          sectionType: 'primary_lift',
          blocks: [{ structureType: 'standard', exercises: ['not_started', 'not_started'] }],
        },
      ],
    })
    const { double } = refusing(createWorkoutDouble({ session: snapshot }), offline)
    const { failures } = mount({ double, exercises: ['not_started', 'not_started'] })

    await logSet(1)
    await logSet(2)

    await waitFor(() => expect(screen.getAllByText('unsynced 2').length).toBeGreaterThan(0))
    // Two sets refused, twice each after the retry below — and not one toast.
    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: 'Retry sync' })[0])

    await waitFor(() =>
      expect(screen.getAllByText('sustained failure').length).toBeGreaterThan(0),
    )
    expect(failures).toEqual([])
  })

  it('stays quiet while the first attempt is still ordinary', async () => {
    const snapshot = snapshotFixture({
      sections: [
        {
          sectionType: 'primary_lift',
          blocks: [{ structureType: 'standard', exercises: ['not_started'] }],
        },
      ],
    })
    const { double, attempts } = refusing(createWorkoutDouble({ session: snapshot }), offline)
    mount({ double })

    await logSet(1)

    await waitFor(() => expect(attempts).toHaveLength(1))
    // One refusal is a hiccup: the set says so on its own row, the shell does not.
    expect(screen.queryByText('sustained failure')).not.toBeInTheDocument()
  })
})
