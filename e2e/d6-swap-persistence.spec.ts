import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { reset, seed } from '../scripts/e2e/lifecycle.mjs'
import { emailForSlot } from '../scripts/e2e/namespace.mjs'

import { expect, test } from './fixtures'
import { backend } from './support/backend'

/**
 * SES-01b — the standing D6 regression test.
 *
 * **The defect.** In the app this rebuilds, swapping an exercise mutated the
 * prescription row in place. The set logs a user then wrote pointed at a row
 * that no longer described what they had done, and the exercise that was
 * originally prescribed was gone — not superseded, *gone*. Two questions
 * became unanswerable at once: what did the model compose, and what did I
 * actually lift.
 *
 * **What this file is.** A test that fails against that behaviour. The
 * requirement is explicit that a test which passes both ways proves nothing,
 * so every assertion below is one the old implementation could not satisfy:
 *
 *   * the logs name the **substitute**, never the row it replaced;
 *   * the original is still there, superseded, carrying its own lineage;
 *   * the two rows share a `slot_id`, so "what filled this slot over time" is
 *     a single-column query rather than a guess;
 *   * the three reconstructions disagree with each other in exactly the way
 *     §7 says they must — and a swap made *after* `started_at` does not
 *     rewrite what was intended at it.
 *
 * **Two halves, on purpose.** The first needs no database: it reads the
 * migrations and fails if the schema stops being append-and-supersede at all.
 * That half runs everywhere, including a laptop with no credentials and a
 * fork's pull request, which is what makes this a standing check rather than
 * one that quietly skips itself into always-green. The second half proves it
 * by doing — a real session, a real swap, real logs — and skips, by name, when
 * there is no project to run it against.
 */

const repoRoot = resolve(import.meta.dirname, '..')
const migration = (name: string) =>
  readFileSync(resolve(repoRoot, 'supabase/migrations', name), 'utf-8')

const LIFECYCLE = migration('20260921000005_session_lifecycle.sql')
const RECONSTRUCTION = migration('20260921000009_session_reconstruction.sql')
const EXECUTION = migration('20260921000003_execution_domain.sql')

/**
 * Asserted before the skip, for the same reason `e2e/rls.spec.ts` asserts its
 * coverage before its own: a change that reintroduces the defect must fail the
 * suite on a machine that has no database at all.
 */
test.describe('D6 — the schema cannot express the old behaviour', () => {
  test('a swap appends and supersedes; it never rewrites the prescription', () => {
    const swap = LIFECYCLE.slice(
      LIFECYCLE.indexOf('create or replace function public.swap_session_exercise('),
    )
    const body = swap.slice(0, swap.indexOf('$$;'))

    // The outgoing row is marked, not edited into something else…
    expect(body).toContain("set revision_status = 'superseded'")
    expect(body).toContain('superseded_at   = now()')
    // …and the replacement is a new row carrying the lineage.
    expect(body).toContain('insert_prescription')
    expect(body).toContain("'revised'")

    // The defect, spelled the way it would have to be spelled to come back:
    // an UPDATE that moves a prescription onto a different exercise.
    expect(body).not.toMatch(/set[\s\S]*exercise_id\s*=/i)
  })

  test('a set log names the prescription it was performed against', () => {
    // DATA-01d's composite foreign key. It is what makes "the logs follow the
    // row" a property of the database rather than of the code that writes it.
    expect(EXECUTION).toContain('foreign key (workout_exercise_id, prescription_revision_status)')
    expect(EXECUTION).toContain('references public.workout_exercises (id, revision_status)')
    expect(EXECUTION).toContain('on update cascade')
  })

  test('the three reconstructions exist, and are three functions', () => {
    for (const name of [
      'session_as_generated',
      'session_as_intended_at_start',
      'session_as_performed',
    ]) {
      expect(RECONSTRUCTION, name).toContain(`create or replace function public.${name}(`)
      expect(RECONSTRUCTION, name).toContain(`grant execute on function public.${name}(uuid)`)
    }
  })

  test('intended-at-start is temporal, not "whatever is active now"', () => {
    const builder = RECONSTRUCTION.slice(
      RECONSTRUCTION.indexOf('create or replace function public.session_reconstruction('),
    )
    const arm = builder.slice(
      builder.indexOf("when 'intended_at_start' then"),
      builder.indexOf("when 'performed' then"),
    )

    // §7's predicate, both halves of it, against the session's own start.
    expect(arm).toContain('we.created_at <= s.started_at')
    expect(arm).toContain('we.superseded_at > s.started_at')
    // And not the substitution that makes it wrong the moment somebody swaps
    // mid-session — which is the whole reason this is a function.
    expect(arm).not.toContain('revision_status')
  })
})

/**
 * The behavioural half. Everything above is about the artifact; this is about
 * what Postgres actually does with it.
 */
test.describe('D6 — a swap persists to the substitute', () => {
  test.skip(!backend.available, backend.reason)
  // One namespace per run, and the walk below is one story told in order.
  test.describe.configure({ mode: 'serial' })

  let client: ReturnType<typeof backend.client>
  let token: string

  /**
   * Why this can be skipped at runtime: a prescription needs a real
   * `exercise_definitions` id, and the catalog is applied by its own task
   * (TASK-072). Until then there is nothing legal to prescribe, and saying so
   * by name is better than failing on a foreign key and calling it a defect.
   */
  let blocked: string | null = null

  /** The first walk: swap in review, start, log, complete. */
  const before = {
    sessionId: '',
    blockId: '',
    /** The prescription the model composed, and the one that replaced it. */
    originalId: '',
    substituteId: '',
    /** The second exercise in the block — skipped, never logged. */
    skippedId: '',
    startedAt: '',
  }

  /** The second walk: the swap that happens *after* the session started. */
  const after = { sessionId: '', originalId: '', substituteId: '', startedAt: '' }

  /** A response that was supposed to succeed, or a failure that says which call. */
  const must = <T>(response: { ok: boolean; status: number; body: unknown }, what: string): T => {
    expect(response.ok, `${what} (status ${response.status})`).toBe(true)
    return response.body as T
  }

  const prescription = (exercise: { id: string; default_equipment: string }, reps: number) => ({
    exercise_id: exercise.id,
    equipment: exercise.default_equipment,
    modality: 'reps',
    sets: 3,
    target_kind: 'fixed',
    target_value: reps,
    per_side: false,
    rest_seconds: 90,
    load_type: 'bodyweight',
    is_interval_exercise: false,
  })

  /** One session, one section, one block, two prescriptions. */
  const acceptance = (
    title: string,
    first: Record<string, unknown>,
    second: Record<string, unknown>,
  ) => ({
    date: '2026-01-02',
    location_id: null,
    session_focus: 'full_body',
    goal_preset: 'balanced',
    requested_duration_mins: 30,
    effective_duration_target_mins: 30,
    computed_duration_mins: null,
    requested_intensity: 5,
    effective_intensity: 5,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'e2e',
    contract_version: 'e2e',
    workout: {
      title,
      overview: null,
      estimated_duration_mins: 30,
      sections: [
        {
          section_type: 'primary_lift',
          section_title: 'Primary',
          section_notes: null,
          blocks: [
            {
              structure_type: 'standard',
              rounds: null,
              timer_type: 'none',
              timer_seconds: null,
              round_rest_seconds: null,
              rep_scheme: 'fixed',
              block_notes: null,
              exercises: [first, second],
            },
          ],
        },
      ],
    },
  })

  type Snapshot = {
    session: { id: string; started_at: string | null }
    sections: {
      blocks: { block: { id: string }; exercises: { exercise: { id: string } }[] }[]
    }[]
  }

  type Reconstruction = {
    reconstruction: string
    as_of: string | null
    sections: {
      blocks: {
        block_result: { rounds_completed: number | null } | null
        exercises: {
          exercise: {
            id: string
            exercise_id: string
            slot_id: string
            replaces_id: string | null
            origin: string
            revision_status: string
            execution_status: string
          }
          set_logs: { set_number: number; workout_exercise_id: string }[]
        }[]
      }[]
    }[]
  }

  /** Every exercise entry in a reconstruction, flattened — order preserved. */
  const entries = (payload: Reconstruction) =>
    payload.sections.flatMap((section) =>
      section.blocks.flatMap((block) => block.exercises),
    )

  const reconstruct = async (fn: string, sessionId: string) =>
    must<Reconstruction>(
      await client.rpcAs(fn, { p_session_id: sessionId }, token),
      `${fn}(${sessionId})`,
    )

  test.beforeAll(async () => {
    client = backend.client()
    const { users } = await seed(client)
    token = (await client.mintSession(emailForSlot('a'))).accessToken
    expect(users.a.id, 'the seeded actor').toBeTruthy()

    const catalog = must<{ id: string; default_equipment: string }[]>(
      await client.selectAs(
        'exercise_definitions',
        { select: 'id,default_equipment', order: 'id.asc', limit: '3' },
        token,
      ),
      'reading the catalog',
    )

    if (catalog.length < 3) {
      blocked = 'needs three catalog exercises; DATA-02 is applied by its own task'
      return
    }

    const [composed, substitute, spare] = catalog

    // ── Walk one: generate, swap in review, start, log, complete ──
    const persisted = must<Snapshot>(
      await client.rpcAs(
        'persist_session',
        {
          p_user_id: users.a.id,
          p_session: acceptance(
            'D6 — swapped before starting',
            prescription(composed, 8),
            prescription(spare, 10),
          ),
        },
        token,
      ),
      'persist_session',
    )

    before.sessionId = persisted.session.id
    const block = persisted.sections[0].blocks[0]
    before.blockId = block.block.id
    before.originalId = block.exercises[0].exercise.id
    before.skippedId = block.exercises[1].exercise.id

    const swapped = must<{ outcome: string; exercise: { id: string } }>(
      await client.rpcAs(
        'swap_session_exercise',
        {
          p_workout_exercise_id: before.originalId,
          p_prescription: prescription(substitute, 8),
        },
        token,
      ),
      'swap_session_exercise',
    )
    expect(swapped.outcome, 'the swap was refused').toBe('swapped')
    before.substituteId = swapped.exercise.id

    const started = must<{ outcome: string; session: { started_at: string } }>(
      await client.rpcAs('start_session', { p_session_id: before.sessionId }, token),
      'start_session',
    )
    expect(started.outcome).toBe('started')
    before.startedAt = started.session.started_at

    // Two sets, written against whatever the user is now looking at — which is
    // the substitute. Under the defect this same insert would have landed on
    // the row the swap had overwritten.
    for (const setNumber of [1, 2]) {
      must(
        await client.insertAs(
          'exercise_set_logs',
          {
            id: `e2e00d61-0000-4000-8000-00000000000${setNumber}`,
            workout_exercise_id: before.substituteId,
            set_number: setNumber,
            actual_reps: 8,
            weight: 60,
            weight_unit: 'kg',
          },
          token,
        ),
        `logging set ${setNumber}`,
      )
    }

    // The second exercise is skipped: a real observation, and the one a bare
    // join to the set logs cannot see.
    must(
      await client.updateAs(
        'workout_exercises',
        { id: `eq.${before.skippedId}` },
        { execution_status: 'skipped' },
        token,
      ),
      'skipping the second exercise',
    )

    must(
      await client.insertAs(
        'block_results',
        { block_id: before.blockId, rounds_completed: 3, perceived_effort: 7 },
        token,
      ),
      'scoring the block',
    )

    expect(
      must<{ outcome: string }>(
        await client.rpcAs('complete_session', { p_session_id: before.sessionId }, token),
        'complete_session',
      ).outcome,
    ).toBe('completed')

    // ── Walk two: the swap that happens after the session started ──
    const second = must<Snapshot>(
      await client.rpcAs(
        'persist_session',
        {
          p_user_id: users.a.id,
          p_session: acceptance(
            'D6 — swapped after starting',
            prescription(composed, 5),
            prescription(spare, 12),
          ),
        },
        token,
      ),
      'persist_session (second)',
    )

    after.sessionId = second.session.id
    after.originalId = second.sections[0].blocks[0].exercises[0].exercise.id

    const secondStart = must<{ outcome: string; session: { started_at: string } }>(
      await client.rpcAs('start_session', { p_session_id: after.sessionId }, token),
      'start_session (second)',
    )
    expect(secondStart.outcome).toBe('started')
    after.startedAt = secondStart.session.started_at

    const swappedAfter = must<{ outcome: string; exercise: { id: string } }>(
      await client.rpcAs(
        'swap_session_exercise',
        {
          p_workout_exercise_id: after.originalId,
          p_prescription: prescription(substitute, 5),
        },
        token,
      ),
      'swap_session_exercise (after start)',
    )
    expect(swappedAfter.outcome).toBe('swapped')
    after.substituteId = swappedAfter.exercise.id
  })

  test.afterAll(async () => {
    if (client) await reset(client)
  })

  test('the set logs attach to the substitute, not to what it replaced', async () => {
    test.skip(blocked !== null, blocked ?? '')

    // Read past every policy: "the original has no logs" has to mean they are
    // not there, not that the reader could not see them.
    const onOriginal = must<unknown[]>(
      await client.selectAsService('exercise_set_logs', {
        workout_exercise_id: `eq.${before.originalId}`,
      }),
      'logs on the original',
    )
    const onSubstitute = must<{ set_number: number }[]>(
      await client.selectAsService('exercise_set_logs', {
        workout_exercise_id: `eq.${before.substituteId}`,
      }),
      'logs on the substitute',
    )

    // This is the defect, and this is the assertion that fails against it.
    expect(onOriginal, 'a set was logged against the exercise that was replaced').toEqual([])
    expect(onSubstitute.map((log) => log.set_number).sort()).toEqual([1, 2])
  })

  test('the original is still there, superseded, with its lineage intact', async () => {
    test.skip(blocked !== null, blocked ?? '')

    const rows = must<
      {
        id: string
        slot_id: string
        replaces_id: string | null
        origin: string
        revision_status: string
        superseded_at: string | null
      }[]
    >(
      await client.selectAsService('workout_exercises', {
        id: `in.(${before.originalId},${before.substituteId})`,
      }),
      'the two revisions',
    )

    const original = rows.find((row) => row.id === before.originalId)
    const substitute = rows.find((row) => row.id === before.substituteId)

    // Under the defect there was one row here, not two.
    expect(original, 'the replaced prescription was deleted or overwritten').toBeDefined()
    expect(substitute).toBeDefined()

    expect(original?.origin).toBe('generated')
    expect(original?.revision_status).toBe('superseded')
    expect(original?.superseded_at).not.toBeNull()

    expect(substitute?.origin).toBe('revised')
    expect(substitute?.revision_status).toBe('active')
    // The lineage, both ways it is expressed: back a step, and across time.
    expect(substitute?.replaces_id).toBe(before.originalId)
    expect(substitute?.slot_id).toBe(original?.slot_id)
  })

  test('as generated: what the model composed, swap or no swap', async () => {
    test.skip(blocked !== null, blocked ?? '')

    const payload = await reconstruct('session_as_generated', before.sessionId)
    const found = entries(payload)

    expect(payload.reconstruction).toBe('generated')
    expect(found.map((entry) => entry.exercise.id)).toEqual([
      before.originalId,
      before.skippedId,
    ])
    expect(found.every((entry) => entry.exercise.origin === 'generated')).toBe(true)
    // It has no logs, and that is the point: the logs are on the substitute,
    // which was never part of what was generated.
    expect(found[0].set_logs).toEqual([])
  })

  test('as intended at start: the swap happened first, so the substitute is', async () => {
    test.skip(blocked !== null, blocked ?? '')

    const payload = await reconstruct('session_as_intended_at_start', before.sessionId)
    const found = entries(payload)

    expect(payload.as_of).toBe(before.startedAt)
    expect(found.map((entry) => entry.exercise.id)).toEqual([
      before.substituteId,
      before.skippedId,
    ])
  })

  test('as performed: the logs, the skipped exercise, and the block result', async () => {
    test.skip(blocked !== null, blocked ?? '')

    const payload = await reconstruct('session_as_performed', before.sessionId)
    const found = entries(payload)
    const block = payload.sections[0].blocks[0]

    const performed = found.find((entry) => entry.exercise.id === before.substituteId)
    expect(performed?.set_logs.map((log) => log.set_number)).toEqual([1, 2])
    expect(
      performed?.set_logs.every((log) => log.workout_exercise_id === before.substituteId),
    ).toBe(true)

    // Not a bare join to the set logs: the skipped exercise has none and is
    // present anyway, which is the only way "skipped" is distinguishable from
    // "nobody wrote anything down".
    const skipped = found.find((entry) => entry.exercise.id === before.skippedId)
    expect(skipped, 'the skipped exercise vanished from what was performed').toBeDefined()
    expect(skipped?.exercise.execution_status).toBe('skipped')
    expect(skipped?.set_logs).toEqual([])

    // And the block's own outcome, which belongs to no exercise at all.
    expect(block.block_result?.rounds_completed).toBe(3)
  })

  test('a swap made after starting does not rewrite what was intended', async () => {
    test.skip(blocked !== null, blocked ?? '')

    const intended = await reconstruct('session_as_intended_at_start', after.sessionId)
    const performedNow = await reconstruct('session_as_performed', after.sessionId)

    // The user set out to do the original: it was active at `started_at`, and
    // the substitute did not exist yet.
    expect(intended.as_of).toBe(after.startedAt)
    expect(entries(intended).map((entry) => entry.exercise.id)).toContain(after.originalId)
    expect(entries(intended).map((entry) => entry.exercise.id)).not.toContain(
      after.substituteId,
    )

    // "Whatever is active now" is a different question with a different
    // answer, which is exactly why intended-at-start cannot be that query.
    expect(entries(performedNow).map((entry) => entry.exercise.id)).toContain(
      after.substituteId,
    )
  })
})
