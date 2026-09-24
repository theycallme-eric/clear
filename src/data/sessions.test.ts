import { describe, expect, it } from 'vitest'

import { ErrorCode } from '../state/errors'
import type { Prescription } from '../state/schemas'
import { resumePoint } from '../state/session-machine'
import { makePrescription, makeSessionAcceptance } from '../test/factories'
import { createSessionDouble } from '../test/session-double'
import { createSessionsClient } from './sessions'

// SES-01a. The lifecycle is SQL, so these run the client against a double that
// holds the functions' rules (src/test/session-double.ts), transcribed from
// the migration that src/test/session-lifecycle-migration.test.ts asserts
// clause by clause. What they prove is that acceptance is all-or-nothing as
// the caller sees it, that each transition answers a typed result, and that a
// second active session is refused. What they cannot prove is that Postgres
// agrees; ENV-07 settles that against a database.

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const TOKEN = 'user-token'
const OTHER_TOKEN = 'other-token'
const USER = 'a0000001-0000-4000-8000-000000000000'
const OTHER_USER = 'a0000002-0000-4000-8000-000000000000'

const setup = (options: Parameters<typeof createSessionDouble>[0] extends infer T
  ? Partial<Omit<T, 'url' | 'anonKey' | 'users'>>
  : never = {}) => {
  const double = createSessionDouble({
    url: URL_,
    anonKey: ANON_KEY,
    users: { [TOKEN]: USER, [OTHER_TOKEN]: OTHER_USER },
    ...options,
  })

  const client = createSessionsClient({
    url: URL_,
    anonKey: ANON_KEY,
    accessToken: TOKEN,
    fetch: double.fetch,
  })

  return { client, double }
}

/** Accept a workout and return the session id it was persisted as. */
const accept = async (
  client: ReturnType<typeof setup>['client'],
  acceptance = makeSessionAcceptance(),
) => {
  const result = await client.accept(USER, acceptance)
  expect(result.ok, JSON.stringify(result)).toBe(true)
  if (!result.ok) throw new Error('unreachable')

  return result.value
}

describe('acceptance is one transaction (SES-01a)', () => {
  it('persists the full structure — session, sections, blocks, exercises', async () => {
    const { client, double } = setup()

    const snapshot = await accept(client)
    const store = double.store()

    expect(store.sessions).toHaveLength(1)
    expect(store.sections).toHaveLength(2)
    expect(store.blocks).toHaveLength(2)
    expect(store.exercises).toHaveLength(3)

    // And it comes back as the structure, not as an id the caller has to go
    // and fetch the rest of.
    expect(snapshot.session.title).toBe('Lower-body strength')
    expect(snapshot.state).toBe('prescribed')
    expect(snapshot.sections.map((section) => section.section.section_type)).toEqual([
      'warmup',
      'primary_lift',
    ])
    expect(snapshot.sections[1].blocks[0].exercises.map((e) => e.exercise.exercise_id)).toEqual([
      'back-squat',
      'kb-swing',
    ])
  })

  it('orders sections, blocks and exercises by their place in the payload', async () => {
    const { client } = setup()

    const snapshot = await accept(client)

    expect(snapshot.sections.map((section) => section.section.order_index)).toEqual([0, 1])
    expect(
      snapshot.sections[1].blocks[0].exercises.map((e) => e.exercise.order_index),
    ).toEqual([0, 1])
  })

  it('leaves nothing behind when one exercise is refused', async () => {
    const { client, double } = setup()

    // The last exercise of the last section carries a target the
    // `target_shape` CHECK refuses. Everything before it would already have
    // been inserted by a client that wrote row by row.
    const acceptance = makeSessionAcceptance()
    const malformed = {
      ...acceptance,
      workout: {
        ...acceptance.workout,
        sections: acceptance.workout.sections.map((section, index) =>
          index === 1
            ? {
                ...section,
                blocks: [
                  {
                    ...section.blocks[0],
                    exercises: [
                      section.blocks[0].exercises[0],
                      // A fixed target with no value: the shape the CHECK
                      // exists to refuse, which the type system also refuses —
                      // hence the cast, which is the point of the test.
                      { ...makePrescription(), target_value: null } as unknown as Prescription,
                    ],
                  },
                ],
              }
            : section,
        ),
      },
    }

    const result = await client.accept(USER, malformed as typeof acceptance)

    expect(result.ok).toBe(false)
    const store = double.store()
    expect(store.sessions).toEqual([])
    expect(store.sections).toEqual([])
    expect(store.blocks).toEqual([])
    expect(store.exercises).toEqual([])
  })

  it('refuses a malformed payload before it costs a transaction at all', async () => {
    const { client, double } = setup()

    const result = await client.accept(USER, {
      ...makeSessionAcceptance(),
      requested_intensity: 99,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    expect(result.error.details?.issues).toEqual([
      { path: 'requested_intensity', message: expect.any(String) },
    ])
    // CORE-03's rule doing its work: nothing was sent.
    expect(double.calls()).toEqual([])
  })

  it('mints one slot per prescription, all of them generated', async () => {
    const { client, double } = setup()

    await accept(client)
    const { exercises } = double.store()

    expect(new Set(exercises.map((row) => row.slot_id)).size).toBe(exercises.length)
    expect(exercises.every((row) => row.origin === 'generated')).toBe(true)
    expect(exercises.every((row) => row.replaces_id === null)).toBe(true)
  })
})

describe('the transitions (SES-01a)', () => {
  it('starts a prescribed session', async () => {
    const { client } = setup()
    const { session } = await accept(client)

    const started = await client.start(session.id)

    expect(started.ok).toBe(true)
    if (!started.ok) return
    expect(started.value.state).toBe('active')
    expect(started.value.session.started_at).not.toBeNull()
  })

  it('completes, writing completed_at and actual_duration_mins', async () => {
    const { client } = setup()
    const { session } = await accept(client)
    await client.start(session.id)

    const completed = await client.complete(session.id)

    expect(completed.ok).toBe(true)
    if (!completed.ok) return
    expect(completed.value.state).toBe('completed')
    expect(completed.value.session.completed_at).not.toBeNull()
    // Both halves of the criterion. The elapsed default is the clock's; the
    // number matters less than that it is written at all.
    expect(completed.value.session.actual_duration_mins).not.toBeNull()
  })

  it('takes a caller-supplied duration over the clock', async () => {
    const { client } = setup()
    const { session } = await accept(client)
    await client.start(session.id)

    const completed = await client.complete(session.id, 38)

    expect(completed.ok && completed.value.session.actual_duration_mins).toBe(38)
  })

  it('abandons a started session without deleting anything', async () => {
    const { client, double } = setup()
    const { session } = await accept(client)
    await client.start(session.id)

    const abandoned = await client.abandon(session.id)

    expect(abandoned.ok).toBe(true)
    if (!abandoned.ok) return
    expect(abandoned.value.state).toBe('abandoned')
    expect(abandoned.value.session.abandoned_at).not.toBeNull()

    // The criterion, as a fact about the store rather than about the row: a
    // state, not a delete.
    const store = double.store()
    expect(store.sessions).toHaveLength(1)
    expect(store.sections).toHaveLength(2)
    expect(store.exercises).toHaveLength(3)
  })

  it('abandons a session nobody started', async () => {
    const { client } = setup()
    const { session } = await accept(client)

    const abandoned = await client.abandon(session.id)

    expect(abandoned.ok && abandoned.value.state).toBe('abandoned')
  })

  it('refuses an invalid transition with the state it was refused from', async () => {
    const { client } = setup()
    const { session } = await accept(client)

    // Completing a session that was never started.
    const completed = await client.complete(session.id)

    expect(completed.ok).toBe(false)
    if (completed.ok) return
    expect(completed.error.code).toBe(ErrorCode.SESSION_INVALID_TRANSITION)
    expect(completed.error.details).toEqual({ event: 'complete', from: 'prescribed' })
  })

  it('refuses to restart a session that was abandoned', async () => {
    const { client } = setup()
    const { session } = await accept(client)
    await client.abandon(session.id)

    const restarted = await client.start(session.id)

    expect(restarted.ok).toBe(false)
    if (restarted.ok) return
    expect(restarted.error.code).toBe(ErrorCode.SESSION_INVALID_TRANSITION)
    expect(restarted.error.details).toEqual({ event: 'start', from: 'abandoned' })
  })

  it('answers not found for a session that belongs to somebody else', async () => {
    const { client, double } = setup()
    const { session } = await accept(client)

    const other = createSessionsClient({
      url: URL_,
      anonKey: ANON_KEY,
      accessToken: OTHER_TOKEN,
      fetch: double.fetch,
    })

    const started = await other.start(session.id)

    expect(started.ok).toBe(false)
    // RLS filtered the row before the function saw it, so "somebody else's"
    // and "no such session" are the same answer — which is the one that leaks
    // nothing.
    if (!started.ok) expect(started.error.code).toBe(ErrorCode.PERSISTENCE_NOT_FOUND)
  })
})

describe('exactly one active session per user (SES-01a)', () => {
  it('refuses a second start with a typed error naming the running session', async () => {
    const { client } = setup()
    const first = await accept(client)
    const second = await accept(client)
    await client.start(first.session.id)

    const started = await client.start(second.session.id)

    expect(started.ok).toBe(false)
    if (started.ok) return
    expect(started.error.code).toBe(ErrorCode.SESSION_ALREADY_ACTIVE)
    expect(started.error.details).toEqual({
      event: 'start',
      activeSessionId: first.session.id,
    })
  })

  it('reads a lost race as the same error, not as a conflict to retry', async () => {
    // The concurrent case the function's own check cannot see: the partial
    // unique index refuses the second write and PostgREST answers 409. A
    // caller must not be able to tell the two paths apart, or "not a race"
    // would only mean "usually not a race".
    const { client } = setup({ conflictOn: 'start_session' })
    const { session } = await accept(client)

    const started = await client.start(session.id)

    expect(started.ok).toBe(false)
    if (started.ok) return
    expect(started.error.code).toBe(ErrorCode.SESSION_ALREADY_ACTIVE)
  })

  it('frees the slot when the running session is abandoned', async () => {
    const { client } = setup()
    const first = await accept(client)
    const second = await accept(client)
    await client.start(first.session.id)
    await client.abandon(first.session.id)

    const started = await client.start(second.session.id)

    expect(started.ok && started.value.state).toBe('active')
  })
})

describe('swapping a prescription (SES-01a, defect D6)', () => {
  it('appends a revision in the same slot and supersedes its predecessor', async () => {
    const { client } = setup()
    const snapshot = await accept(client)
    const outgoing = snapshot.sections[1].blocks[0].exercises[0].exercise

    const swapped = await client.swap(
      outgoing.id,
      makePrescription({ exercise_id: 'front-squat', equipment: 'barbell' }),
    )

    expect(swapped.ok).toBe(true)
    if (!swapped.ok) return

    expect(swapped.value.exercise.slot_id).toBe(outgoing.slot_id)
    expect(swapped.value.exercise.replaces_id).toBe(outgoing.id)
    expect(swapped.value.exercise.origin).toBe('revised')
    expect(swapped.value.exercise.revision_status).toBe('active')
    // The position in the block is the slot's, not the row's.
    expect(swapped.value.exercise.order_index).toBe(outgoing.order_index)

    expect(swapped.value.superseded.revision_status).toBe('superseded')
    expect(swapped.value.superseded.superseded_at).not.toBeNull()
  })

  it('leaves the superseded row its own execution_status', async () => {
    const { client, double } = setup()
    const snapshot = await accept(client)
    const outgoing = snapshot.sections[1].blocks[0].exercises[0].exercise

    // The user performed it, then replaced it. Collapsing the two statuses
    // would overwrite "completed" with "replaced" — the information loss
    // DATA_MODEL §7 split them to prevent.
    double.setExecutionStatus(outgoing.id, 'completed')

    const swapped = await client.swap(outgoing.id, makePrescription())

    expect(swapped.ok && swapped.value.superseded.execution_status).toBe('completed')
    expect(swapped.ok && swapped.value.exercise.execution_status).toBe('not_started')
  })

  it('shows only the active revision in the next snapshot', async () => {
    const { client } = setup()
    const accepted = await accept(client)
    const outgoing = accepted.sections[1].blocks[0].exercises[0].exercise

    await client.swap(outgoing.id, makePrescription({ exercise_id: 'front-squat' }))
    const after = await client.snapshot(accepted.session.id)

    expect(after.ok).toBe(true)
    if (!after.ok) return
    const shown = after.value.sections[1].blocks[0].exercises.map((e) => e.exercise.exercise_id)
    expect(shown).toEqual(['front-squat', 'kb-swing'])
  })

  it('refuses a swap on a completed session', async () => {
    const { client } = setup()
    const accepted = await accept(client)
    await client.start(accepted.session.id)
    await client.complete(accepted.session.id)

    const swapped = await client.swap(
      accepted.sections[1].blocks[0].exercises[0].exercise.id,
      makePrescription(),
    )

    expect(swapped.ok).toBe(false)
    if (!swapped.ok) expect(swapped.error.code).toBe(ErrorCode.SESSION_INVALID_TRANSITION)
  })
})

describe('resuming after a hard refresh (SES-01a)', () => {
  it('answers the running session, with its logged sets intact', async () => {
    const { client, double } = setup()
    const accepted = await accept(client)
    await client.start(accepted.session.id)

    // Mid-workout: the warmup is done, two sets are logged against the first
    // primary lift, and then the tab is closed.
    const warmup = accepted.sections[0].blocks[0].exercises[0].exercise
    const lift = accepted.sections[1].blocks[0].exercises[0].exercise
    double.setExecutionStatus(warmup.id, 'completed')
    double.logSet({ workout_exercise_id: lift.id, set_number: 1, actual_reps: 8, weight: 60 })
    double.logSet({ workout_exercise_id: lift.id, set_number: 2, actual_reps: 8, weight: 60 })

    // A new client, with nothing remembered from the last one — which is what
    // a refresh is.
    const reloaded = createSessionsClient({
      url: URL_,
      anonKey: ANON_KEY,
      accessToken: TOKEN,
      fetch: double.fetch,
    })
    const resumed = await reloaded.resume(USER)

    expect(resumed.ok).toBe(true)
    if (!resumed.ok || resumed.value === null) throw new Error('nothing to resume')

    expect(resumed.value.session.id).toBe(accepted.session.id)
    expect(resumed.value.state).toBe('active')

    const logs = resumed.value.sections[1].blocks[0].exercises[0].set_logs
    expect(logs.map((log) => log.set_number)).toEqual([1, 2])
    expect(logs[0].actual_reps).toBe(8)

    // And the position: the correct section, the correct exercise, the
    // correct next set.
    const point = resumePoint(resumed.value)
    expect(point?.sectionId).toBe(accepted.sections[1].section.id)
    expect(point?.workoutExerciseId).toBe(lift.id)
    expect(point?.nextSetNumber).toBe(3)
  })

  it('answers null when nobody is mid-workout', async () => {
    const { client } = setup()
    await accept(client)

    const resumed = await client.resume(USER)

    // Not an error: most of the time there is nothing to resume, and Home has
    // to be able to say so quietly.
    expect(resumed).toEqual({ ok: true, value: null })
  })

  it('does not resume an abandoned session', async () => {
    const { client } = setup()
    const accepted = await accept(client)
    await client.start(accepted.session.id)
    await client.abandon(accepted.session.id)

    expect(await client.resume(USER)).toEqual({ ok: true, value: null })
  })

  it('does not resume a completed session', async () => {
    const { client } = setup()
    const accepted = await accept(client)
    await client.start(accepted.session.id)
    await client.complete(accepted.session.id)

    expect(await client.resume(USER)).toEqual({ ok: true, value: null })
  })

  it('reads a missing session as not found rather than as an empty one', async () => {
    const { client } = setup()

    const missing = await client.snapshot('f0000001-0000-4000-8000-000000000000')

    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe(ErrorCode.PERSISTENCE_NOT_FOUND)
  })
})
