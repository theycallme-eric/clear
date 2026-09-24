import { describe, expect, it } from 'vitest'

import { ErrorCode, type Result } from '../state/errors'
import type { Prescription, SessionReconstruction } from '../state/schemas'
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

// ─────────────────────────────────────────────────────────────────────────────
// SES-01b — the three reconstructions
// ─────────────────────────────────────────────────────────────────────────────
//
// The same bargain as above. The reconstructions are SQL, and the double
// transcribes them from 20260921000009_session_reconstruction.sql, which
// src/test/session-reconstruction-migration.test.ts asserts clause by clause.
// The behavioural proof against Postgres — the standing D6 regression — is
// e2e/d6-swap-persistence.spec.ts.

/** Every exercise entry in a reconstruction, flattened; order preserved. */
const flatten = (payload: SessionReconstruction) =>
  payload.sections.flatMap((section) => section.blocks.flatMap((block) => block.exercises))

const ids = (payload: SessionReconstruction) => flatten(payload).map((entry) => entry.exercise.id)

/** Unwrap a reconstruction, failing the test rather than the type system. */
const reconstructed = async (result: Promise<Result<SessionReconstruction>>) => {
  const value = await result
  expect(value.ok, JSON.stringify(value)).toBe(true)
  if (!value.ok) throw new Error('unreachable')
  return value.value
}

describe('as generated (SES-01b)', () => {
  it('answers what the model composed, swap or no swap', async () => {
    const { client } = setup()
    const accepted = await accept(client)
    const outgoing = accepted.sections[1].blocks[0].exercises[0].exercise
    const swapped = await client.swap(outgoing.id, makePrescription({ exercise_id: 'front-squat' }))
    expect(swapped.ok).toBe(true)
    if (!swapped.ok) return

    const generated = await reconstructed(client.asGenerated(accepted.session.id))

    expect(generated.reconstruction).toBe('generated')
    expect(generated.as_of).toBe(accepted.session.created_at)
    // The superseded original is here; the substitute is not, because nothing
    // generated it. A swap does not un-compose what was composed.
    expect(ids(generated)).toContain(outgoing.id)
    expect(ids(generated)).not.toContain(swapped.value.exercise.id)
    expect(flatten(generated).every((entry) => entry.exercise.origin === 'generated')).toBe(true)
  })
})

describe('as intended at start (SES-01b)', () => {
  it('resolves at started_at — a swap before it is what was intended', async () => {
    const { client } = setup()
    const accepted = await accept(client)
    const outgoing = accepted.sections[1].blocks[0].exercises[0].exercise

    const swapped = await client.swap(outgoing.id, makePrescription({ exercise_id: 'front-squat' }))
    const started = await client.start(accepted.session.id)
    expect(swapped.ok && started.ok).toBe(true)
    if (!swapped.ok || !started.ok) return

    const intended = await reconstructed(client.asIntendedAtStart(accepted.session.id))

    expect(intended.as_of).toBe(started.value.session.started_at)
    expect(ids(intended)).toContain(swapped.value.exercise.id)
    expect(ids(intended)).not.toContain(outgoing.id)
  })

  it('does not let a swap made after starting rewrite what was intended', async () => {
    const { client } = setup()
    const accepted = await accept(client)
    const outgoing = accepted.sections[1].blocks[0].exercises[0].exercise

    await client.start(accepted.session.id)
    const swapped = await client.swap(outgoing.id, makePrescription({ exercise_id: 'front-squat' }))
    expect(swapped.ok).toBe(true)
    if (!swapped.ok) return

    const intended = await reconstructed(client.asIntendedAtStart(accepted.session.id))
    const current = await reconstructed(client.asPerformed(accepted.session.id))

    // This is the assertion `revision_status = 'active'` fails: the original
    // is what the user set out to do, and it still is.
    expect(ids(intended)).toContain(outgoing.id)
    expect(ids(intended)).not.toContain(swapped.value.exercise.id)
    // The present tense is a different question with a different answer, which
    // is exactly why intended-at-start cannot be that query.
    expect(ids(current)).toContain(swapped.value.exercise.id)
  })

  it('answers a never-started session with as_of null and nothing intended', async () => {
    const { client } = setup()
    const accepted = await accept(client)

    const intended = await reconstructed(client.asIntendedAtStart(accepted.session.id))

    // Not a gap in the data: nothing was intended at a start that never
    // happened, and `as_of` is what says so rather than leaving a reader to
    // wonder where the exercises went.
    expect(intended.as_of).toBeNull()
    expect(flatten(intended)).toEqual([])
    // The structure is still there — this is a reconstruction of *that*
    // session, and an empty envelope would be a different answer.
    expect(intended.sections).toHaveLength(2)
  })
})

describe('as performed (SES-01b)', () => {
  it('is not a bare join to the set logs', async () => {
    const { client, double } = setup()
    const accepted = await accept(client)
    await client.start(accepted.session.id)

    const block = accepted.sections[1].blocks[0]
    const lift = block.exercises[0].exercise
    const skipped = block.exercises[1].exercise

    double.logSet({ workout_exercise_id: lift.id, set_number: 1, actual_reps: 8, weight: 60 })
    double.setExecutionStatus(skipped.id, 'skipped')
    double.recordBlockResult({ block_id: block.block.id, rounds_completed: 3, perceived_effort: 7 })

    const performed = await reconstructed(client.asPerformed(accepted.session.id))
    const entries = flatten(performed)

    // The skipped exercise has no logs and appears anyway: a real observation,
    // distinct from silence (DATA_MODEL §8).
    const skippedEntry = entries.find((entry) => entry.exercise.id === skipped.id)
    expect(skippedEntry?.exercise.execution_status).toBe('skipped')
    expect(skippedEntry?.set_logs).toEqual([])

    // The partially-logged one: one set of three, present with what it has.
    const liftEntry = entries.find((entry) => entry.exercise.id === lift.id)
    expect(liftEntry?.set_logs.map((log) => log.set_number)).toEqual([1])

    // And the block's own outcome, which belongs to no exercise at all.
    expect(performed.sections[1].blocks[0].block_result?.rounds_completed).toBe(3)
    // An unscored block says so with null rather than with a zeroed result.
    expect(performed.sections[0].blocks[0].block_result).toBeNull()
  })

  it('keeps each set on the prescription it was performed against', async () => {
    const { client, double } = setup()
    const accepted = await accept(client)
    await client.start(accepted.session.id)

    const outgoing = accepted.sections[1].blocks[0].exercises[0].exercise
    // Two sets performed, and only then does the user replace the exercise.
    double.logSet({ workout_exercise_id: outgoing.id, set_number: 1, actual_reps: 8 })
    double.logSet({ workout_exercise_id: outgoing.id, set_number: 2, actual_reps: 8 })
    const swapped = await client.swap(outgoing.id, makePrescription({ exercise_id: 'front-squat' }))
    expect(swapped.ok).toBe(true)
    if (!swapped.ok) return

    double.logSet({
      workout_exercise_id: swapped.value.exercise.id,
      set_number: 1,
      actual_reps: 10,
    })

    const performed = await reconstructed(client.asPerformed(accepted.session.id))
    const entries = flatten(performed)

    // D6 as this client can see it: each set stays with the prescription it
    // was performed against, and neither row absorbs the other's work.
    const before = entries.find((entry) => entry.exercise.id === outgoing.id)
    const after = entries.find((entry) => entry.exercise.id === swapped.value.exercise.id)

    expect(before?.set_logs.map((log) => log.set_number)).toEqual([1, 2])
    expect(after?.set_logs.map((log) => log.set_number)).toEqual([1])
    // The superseded row is in "as performed" because it *was* performed.
    // Dropping it is the same information loss under a different name.
    expect(before?.exercise.revision_status).toBe('superseded')
  })

  it('omits a superseded prescription nobody touched', async () => {
    const { client } = setup()
    const accepted = await accept(client)
    const outgoing = accepted.sections[1].blocks[0].exercises[0].exercise

    await client.swap(outgoing.id, makePrescription({ exercise_id: 'front-squat' }))

    const performed = await reconstructed(client.asPerformed(accepted.session.id))

    // Replaced in review, never started, never logged: it was prescribed and
    // then it was not. "As generated" is where it lives.
    expect(ids(performed)).not.toContain(outgoing.id)
  })
})

describe('a reconstruction of a session that is not there (SES-01b)', () => {
  it('is not found rather than an empty history', async () => {
    const { client } = setup()
    const missing = 'f0000002-0000-4000-8000-000000000000'

    for (const result of [
      await client.asGenerated(missing),
      await client.asIntendedAtStart(missing),
      await client.asPerformed(missing),
    ]) {
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe(ErrorCode.PERSISTENCE_NOT_FOUND)
    }
  })
})
