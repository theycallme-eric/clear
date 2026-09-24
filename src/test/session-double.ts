/**
 * A PostgREST stand-in for the SES-01a lifecycle functions.
 *
 * The same limit, and the same bargain, as `src/test/postgrest-double.ts`: the
 * migration cannot be executed here — the off-machine-backup gate in
 * `docs/backend/live-inventory.md` forbids mutating the reused project until
 * TASK-072, and ENV-04 keeps Docker out of the loop — so the rules live in the
 * one place a test can run them. Every rule below is transcribed from
 * `supabase/migrations/20260921000005_session_lifecycle.sql`, which is asserted
 * clause by clause in `src/test/session-lifecycle-migration.test.ts`.
 *
 * What a test using this can prove: that the client speaks the functions'
 * contract, that an outcome becomes the right typed error, that acceptance
 * writes the whole structure or none of it, and that a second active session
 * is refused. What it cannot prove is that Postgres agrees. ENV-07's suite is
 * where that is settled against a database.
 *
 * Atomicity is modelled honestly rather than asserted: `persist_session`
 * builds every row in local arrays and commits them to the store in one step
 * at the end, so a failure part-way leaves the store exactly as it was — which
 * is the behaviour a transaction gives and the behaviour the test checks.
 *
 * Deterministic: ids and timestamps come from counters, so an ordering
 * assertion is about the order and not about the clock.
 */

import type {
  ExerciseSetLogRow,
  WorkoutBlockRow,
  WorkoutExerciseRow,
  WorkoutSectionRow,
  WorkoutSessionRow,
} from '../state/schemas'

export interface SessionDoubleOptions {
  /** The project URL the client is configured with. */
  url: string
  /** The anon key the project accepts. Anything else is answered 401. */
  anonKey: string
  /** Access token → the user id it authenticates. */
  users: Record<string, string>
  /** Sessions already stored, with their structure. */
  sessions?: readonly WorkoutSessionRow[]
  /**
   * Exercise ids the catalog holds, for `workout_exercises.exercise_id`'s
   * foreign key. Every id is accepted when this is omitted.
   */
  exerciseIds?: readonly string[]
  /**
   * Answers this call, and only this one, with a 409 carrying a unique
   * violation — the concurrent start the function's own check cannot see.
   */
  conflictOn?: 'start_session'
}

export interface SessionDouble {
  fetch: typeof globalThis.fetch
  /** Everything stored, RLS ignored — the test's view, not a caller's. */
  store(): {
    sessions: WorkoutSessionRow[]
    sections: WorkoutSectionRow[]
    blocks: WorkoutBlockRow[]
    exercises: WorkoutExerciseRow[]
    setLogs: ExerciseSetLogRow[]
  }
  /** Add a logged set to a prescription, as EXE-02 will. */
  logSet(log: Partial<ExerciseSetLogRow> & { workout_exercise_id: string; set_number: number }): void
  /** Set an exercise's execution status, as performing or skipping it does. */
  setExecutionStatus(id: string, status: WorkoutExerciseRow['execution_status']): void
  /** Every RPC the double answered, in order. */
  calls(): { fn: string; args: Record<string, unknown> }[]
}

type Json = Record<string, unknown>

const EPOCH = Date.UTC(2026, 8, 22, 9, 0, 0)

export function createSessionDouble(options: SessionDoubleOptions): SessionDouble {
  const base = `${options.url.replace(/\/+$/, '')}/rest/v1/rpc/`
  const sessions: WorkoutSessionRow[] = [...(options.sessions ?? [])]
  const sections: WorkoutSectionRow[] = []
  const blocks: WorkoutBlockRow[] = []
  const exercises: WorkoutExerciseRow[] = []
  const setLogs: ExerciseSetLogRow[] = []
  const calls: { fn: string; args: Json }[] = []

  let sequence = 0
  let conflictsLeft = options.conflictOn === undefined ? 0 : 1

  const id = (prefix: string) => {
    sequence += 1
    // A version-4 uuid shape, because every id in these schemas is parsed as
    // one: 8-4-4-4-12, with the prefix making the kind readable in a failure.
    // The prefix is a hex digit for that reason — `z.uuid()` is not fooled by
    // an id that merely has dashes in the right places.
    return `${prefix}${String(sequence).padStart(7, '0')}-0000-4000-8000-000000000000`
  }

  const now = () => {
    sequence += 1
    return new Date(EPOCH + sequence * 1000).toISOString().replace('Z', '+00:00')
  }

  /** The three timestamps → `public.session_state`. */
  const stateOf = (session: WorkoutSessionRow) => {
    if (session.abandoned_at !== null) return 'abandoned' as const
    if (session.completed_at !== null) return 'completed' as const
    if (session.started_at !== null) return 'active' as const
    return 'prescribed' as const
  }

  const snapshot = (sessionId: string, viewer: string): Json | null => {
    const session = sessions.find((row) => row.id === sessionId && row.user_id === viewer)
    if (session === undefined) return null

    return {
      session,
      state: stateOf(session),
      sections: sections
        .filter((section) => section.session_id === session.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((section) => ({
          section,
          blocks: blocks
            .filter((block) => block.section_id === section.id)
            .sort((a, b) => a.order_index - b.order_index)
            .map((block) => ({
              block,
              exercises: exercises
                // Active revisions only: a snapshot is the present tense.
                .filter(
                  (exercise) =>
                    exercise.block_id === block.id && exercise.revision_status === 'active',
                )
                .sort((a, b) => a.order_index - b.order_index)
                .map((exercise) => ({
                  exercise,
                  set_logs: setLogs
                    .filter((log) => log.workout_exercise_id === exercise.id)
                    .sort((a, b) => a.set_number - b.set_number),
                })),
            })),
        })),
    }
  }

  /** One prescription → a `workout_exercises` row, or the CHECK that refused it. */
  const prescriptionRow = (
    prescription: Json,
    lineage: {
      block_id: string
      order_index: number
      slot_id: string
      replaces_id: string | null
      origin: WorkoutExerciseRow['origin']
    },
  ): WorkoutExerciseRow => {
    const exerciseId = prescription.exercise_id
    if (typeof exerciseId !== 'string' || exerciseId === '') {
      throw new CheckViolation('workout_exercises.exercise_id')
    }
    if (options.exerciseIds !== undefined && !options.exerciseIds.includes(exerciseId)) {
      throw new CheckViolation('workout_exercises_exercise_id_fkey')
    }

    const kind = prescription.target_kind
    const value = (key: string) => (prescription[key] ?? null) as number | null
    // `CONSTRAINT target_shape`: exactly the fields the kind names.
    const shaped =
      (kind === 'fixed' &&
        value('target_value') !== null &&
        value('target_min') === null &&
        value('target_max') === null &&
        prescription.target_sequence == null) ||
      (kind === 'range' &&
        value('target_min') !== null &&
        value('target_max') !== null &&
        Number(value('target_max')) > Number(value('target_min')) &&
        value('target_value') === null &&
        prescription.target_sequence == null) ||
      (kind === 'sequence' &&
        Array.isArray(prescription.target_sequence) &&
        prescription.target_sequence.length > 1 &&
        value('target_value') === null &&
        value('target_min') === null &&
        value('target_max') === null)

    if (!shaped) throw new CheckViolation('target_shape')

    const equipment = prescription.equipment
    if (typeof equipment !== 'string' || equipment.trim() === '') {
      throw new CheckViolation('workout_exercises_equipment_not_blank')
    }

    return {
      id: id('e'),
      block_id: lineage.block_id,
      exercise_id: exerciseId,
      order_index: lineage.order_index,
      modality: prescription.modality as WorkoutExerciseRow['modality'],
      sets: (prescription.sets ?? null) as number | null,
      target_kind: kind as WorkoutExerciseRow['target_kind'],
      target_value: value('target_value'),
      target_min: value('target_min'),
      target_max: value('target_max'),
      target_sequence: (prescription.target_sequence ?? null) as number[] | null,
      per_side: prescription.per_side === true,
      distance_unit: (prescription.distance_unit ??
        null) as WorkoutExerciseRow['distance_unit'],
      rest_seconds: (prescription.rest_seconds ?? null) as number | null,
      tempo: (prescription.tempo ?? null) as string | null,
      load_type: (prescription.load_type ?? null) as WorkoutExerciseRow['load_type'],
      load_value: (prescription.load_value ?? null) as number | null,
      equipment_used: equipment,
      is_interval_exercise: prescription.is_interval_exercise === true,
      slot_id: lineage.slot_id,
      replaces_id: lineage.replaces_id,
      origin: lineage.origin,
      created_at: now(),
      superseded_at: null,
      revision_status: 'active',
      execution_status: 'not_started',
      exercise_notes: null,
    }
  }

  const persist = (userId: string, payload: Json, caller: string): Json => {
    // `workout_sessions_insert_own`: the owner is the caller or the row is
    // refused. Passing somebody else's id is not a way past RLS.
    if (userId !== caller) throw new Unauthorized()

    const workout = payload.workout as Json | undefined
    if (workout === undefined || !Array.isArray(workout.sections)) {
      throw new CheckViolation('persist_session: no workout sections')
    }

    // Nothing touches the store until every row has been built. A CHECK that
    // refuses the last exercise leaves no session behind.
    const stagedSections: WorkoutSectionRow[] = []
    const stagedBlocks: WorkoutBlockRow[] = []
    const stagedExercises: WorkoutExerciseRow[] = []

    const created = now()
    const session: WorkoutSessionRow = {
      id: id('9'),
      user_id: userId,
      location_id: (payload.location_id ?? null) as string | null,
      created_at: created,
      updated_at: created,
      date: payload.date as string,
      title: workout.title as string,
      overview: (workout.overview ?? null) as string | null,
      session_focus: payload.session_focus as WorkoutSessionRow['session_focus'],
      goal_preset: (payload.goal_preset ?? null) as WorkoutSessionRow['goal_preset'],
      requested_duration_mins: payload.requested_duration_mins as number,
      effective_duration_target_mins: payload.effective_duration_target_mins as number,
      computed_duration_mins: (payload.computed_duration_mins ?? null) as number | null,
      actual_duration_mins: null,
      requested_intensity: payload.requested_intensity as number,
      effective_intensity: payload.effective_intensity as number,
      adjustment_reason: (payload.adjustment_reason ?? null) as string | null,
      generation_notes: (payload.generation_notes ?? null) as string | null,
      prompt_version: payload.prompt_version as string,
      contract_version: payload.contract_version as string,
      started_at: null,
      completed_at: null,
      abandoned_at: null,
      mood: null,
      session_notes: null,
      counts_for_streak: true,
    }

    workout.sections.forEach((entry, sectionIndex) => {
      const source = entry as Json
      const section: WorkoutSectionRow = {
        id: id('c'),
        session_id: session.id,
        created_at: created,
        updated_at: created,
        section_type: source.section_type as WorkoutSectionRow['section_type'],
        // Position in the payload, never an index the model supplied.
        order_index: sectionIndex,
        section_title: source.section_title as string,
        section_notes: (source.section_notes ?? null) as string | null,
      }
      stagedSections.push(section)

      const sourceBlocks = Array.isArray(source.blocks) ? source.blocks : []
      sourceBlocks.forEach((blockEntry, blockIndex) => {
        const sourceBlock = blockEntry as Json
        const block: WorkoutBlockRow = {
          id: id('b'),
          section_id: section.id,
          created_at: created,
          order_index: blockIndex,
          structure_type: sourceBlock.structure_type as WorkoutBlockRow['structure_type'],
          rounds: (sourceBlock.rounds ?? null) as number | null,
          timer_type: (sourceBlock.timer_type ?? 'none') as WorkoutBlockRow['timer_type'],
          timer_seconds: (sourceBlock.timer_seconds ?? null) as number | null,
          round_rest_seconds: (sourceBlock.round_rest_seconds ?? null) as number | null,
          rep_scheme: (sourceBlock.rep_scheme ?? 'fixed') as WorkoutBlockRow['rep_scheme'],
          block_notes: (sourceBlock.block_notes ?? null) as string | null,
        }
        stagedBlocks.push(block)

        const sourceExercises = Array.isArray(sourceBlock.exercises) ? sourceBlock.exercises : []
        sourceExercises.forEach((exerciseEntry, exerciseIndex) => {
          stagedExercises.push(
            prescriptionRow(exerciseEntry as Json, {
              block_id: block.id,
              order_index: exerciseIndex,
              // A fresh slot per prescription, minted at acceptance.
              slot_id: id('d'),
              replaces_id: null,
              origin: 'generated',
            }),
          )
        })
      })
    })

    sessions.push(session)
    sections.push(...stagedSections)
    blocks.push(...stagedBlocks)
    exercises.push(...stagedExercises)

    return snapshot(session.id, caller) as Json
  }

  const refuse = (outcome: string, extra: Json = {}): Json => ({ outcome, ...extra })

  const transition = (
    sessionId: string,
    caller: string,
    event: 'start' | 'complete' | 'abandon',
    args: Json,
  ): Json => {
    const session = sessions.find((row) => row.id === sessionId && row.user_id === caller)
    if (session === undefined) return refuse('not_found', { session: null })

    const state = stateOf(session)

    if (event === 'start') {
      if (state !== 'prescribed') {
        return refuse('invalid_transition', { event, state, session })
      }

      const active = sessions.find(
        (row) =>
          row.user_id === session.user_id &&
          row.started_at !== null &&
          row.completed_at === null &&
          row.abandoned_at === null,
      )
      if (active !== undefined) {
        return refuse('already_active', { active_session_id: active.id, session })
      }

      session.started_at = now()
      session.updated_at = session.started_at
      return { outcome: 'started', state: stateOf(session), session }
    }

    if (event === 'complete') {
      if (state !== 'active') {
        return refuse('invalid_transition', { event, state, session })
      }

      const supplied = args.p_actual_duration_mins
      session.completed_at = now()
      session.actual_duration_mins =
        typeof supplied === 'number'
          ? supplied
          : Math.max(
              0,
              Math.ceil(
                (Date.parse(session.completed_at) - Date.parse(session.started_at as string)) /
                  60_000,
              ),
            )
      session.updated_at = session.completed_at
      return { outcome: 'completed', state: stateOf(session), session }
    }

    if (state !== 'prescribed' && state !== 'active') {
      return refuse('invalid_transition', { event, state, session })
    }

    // Abandoning is a state: nothing is removed from any of the five arrays.
    session.abandoned_at = now()
    session.updated_at = session.abandoned_at
    return { outcome: 'abandoned', state: stateOf(session), session }
  }

  const swap = (exerciseId: string, prescription: Json, caller: string): Json => {
    const outgoing = exercises.find((row) => row.id === exerciseId)
    if (outgoing === undefined) return refuse('not_found', { exercise: null })

    const block = blocks.find((row) => row.id === outgoing.block_id)
    const section = sections.find((row) => row.id === block?.section_id)
    const session = sessions.find(
      (row) => row.id === section?.session_id && row.user_id === caller,
    )
    if (session === undefined) return refuse('not_found', { exercise: null })

    const state = stateOf(session)
    if (state !== 'prescribed' && state !== 'active') {
      return refuse('invalid_transition', { event: 'swap', state, exercise: outgoing })
    }
    if (outgoing.revision_status !== 'active') {
      return refuse('invalid_transition', { event: 'swap', state, exercise: outgoing })
    }

    // Supersede first: the unique index over active rows in a block is what
    // makes the order of these two writes non-negotiable.
    outgoing.revision_status = 'superseded'
    outgoing.superseded_at = now()
    // …and the logs follow the row, which is the composite foreign key's
    // ON UPDATE CASCADE (DATA-01d).
    for (const log of setLogs) {
      if (log.workout_exercise_id === outgoing.id) log.prescription_revision_status = 'superseded'
    }

    const incoming = prescriptionRow(prescription, {
      block_id: outgoing.block_id,
      order_index: outgoing.order_index,
      // The same slot, which is what makes the history one column away.
      slot_id: outgoing.slot_id,
      replaces_id: outgoing.id,
      origin: 'revised',
    })
    exercises.push(incoming)

    return { outcome: 'swapped', state, exercise: incoming, superseded: outgoing }
  }

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const headers = new Headers(init?.headers)

    if (headers.get('apikey') !== options.anonKey) return json(401, { message: 'invalid key' })

    const token = (headers.get('Authorization') ?? '').replace(/^Bearer /, '')
    const caller = options.users[token]
    if (caller === undefined) return json(401, { message: 'not authenticated' })

    if (!url.startsWith(base)) return json(404, { message: 'no such endpoint' })

    const fn = url.slice(base.length)
    const args = JSON.parse(String(init?.body ?? '{}')) as Json
    calls.push({ fn, args })

    if (options.conflictOn === fn && conflictsLeft > 0) {
      conflictsLeft -= 1
      // What PostgREST answers for a unique violation: the partial index
      // caught a start the function's own check could not see.
      return json(409, { code: '23505', message: 'duplicate key value' })
    }

    try {
      switch (fn) {
        case 'persist_session':
          return json(200, persist(args.p_user_id as string, args.p_session as Json, caller))
        case 'session_snapshot':
          return json(200, snapshot(args.p_session_id as string, caller))
        case 'resume_session': {
          if (args.p_user_id !== caller) return json(200, null)
          const resumable = sessions.find(
            (row) =>
              row.user_id === caller &&
              row.started_at !== null &&
              row.completed_at === null &&
              row.abandoned_at === null,
          )
          return json(200, resumable === undefined ? null : snapshot(resumable.id, caller))
        }
        case 'streak_sessions': {
          // SES-01c's read, transcribed from
          // `supabase/migrations/20260921000006_streak_sessions.sql`: this
          // user's completed sessions, newest first, one exclusive page at a
          // time. It counts nothing — `counts_for_streak` is returned for the
          // client to apply, and RLS makes another user's id return nothing
          // rather than something.
          const before = args.p_before as string | null | undefined
          const limit = Math.min(
            Math.max(Number(args.p_limit ?? 200), 1),
            1000,
          )

          const page = sessions
            .filter(
              (row) =>
                row.user_id === args.p_user_id &&
                row.user_id === caller &&
                row.completed_at !== null &&
                (before === null ||
                  before === undefined ||
                  Date.parse(String(row.completed_at)) < Date.parse(before)),
            )
            .sort(
              (a, b) =>
                Date.parse(String(b.completed_at)) - Date.parse(String(a.completed_at)),
            )
            .slice(0, limit)
            .map((row) => ({
              session_id: row.id,
              completed_at: row.completed_at,
              counts_for_streak: row.counts_for_streak,
            }))

          return json(200, page)
        }
        case 'start_session':
          return json(200, transition(args.p_session_id as string, caller, 'start', args))
        case 'complete_session':
          return json(200, transition(args.p_session_id as string, caller, 'complete', args))
        case 'abandon_session':
          return json(200, transition(args.p_session_id as string, caller, 'abandon', args))
        case 'swap_session_exercise':
          return json(
            200,
            swap(args.p_workout_exercise_id as string, args.p_prescription as Json, caller),
          )
        default:
          return json(404, { message: `no function ${fn}` })
      }
    } catch (error) {
      if (error instanceof Unauthorized) return json(403, { code: '42501', message: 'denied' })
      if (error instanceof CheckViolation) {
        return json(400, { code: '23514', message: error.message })
      }
      throw error
    }
  }

  return {
    fetch: fetchImpl,
    store: () => ({
      sessions: [...sessions],
      sections: [...sections],
      blocks: [...blocks],
      exercises: [...exercises],
      setLogs: [...setLogs],
    }),
    logSet(log) {
      setLogs.push({
        id: id('a'),
        prescription_revision_status: 'active',
        actual_reps: null,
        actual_duration_seconds: null,
        actual_distance: null,
        actual_distance_unit: null,
        weight: null,
        weight_unit: 'lb',
        rpe: null,
        is_warmup_set: false,
        created_at: now(),
        ...log,
      })
    },
    setExecutionStatus(exerciseId, status) {
      const exercise = exercises.find((row) => row.id === exerciseId)
      if (exercise !== undefined) exercise.execution_status = status
    },
    calls: () => [...calls],
  }
}

class CheckViolation extends Error {}
class Unauthorized extends Error {}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
