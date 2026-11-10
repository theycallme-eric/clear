/**
 * TASK-030 (REQ-030) — an in-memory PostgREST stand-in for the logging tables,
 * so the real writers and the real readers can be rehearsed together without a
 * service.
 *
 * What it is for. The logging field contract (`docs/specs/LOGGING_FIELD_CONTRACT.md`)
 * names, for every logging moment, the writer it saves through and the reader
 * that reads it back. A test hands this `fetch` to the app's own clients —
 * `createWorkoutClients` (sets, block results, movement notes, the session
 * reconstructions, anchor evidence), `createSummaryClient` (the debrief) and
 * `createRestDayClient` (rest days) — and then reads the answer with the app's
 * own readers (`sessionDetail`, `loggedSetFromRow`, `d5MissedReps`). No writer
 * here is the app's; this file only answers requests.
 *
 * Every rule it applies is transcribed from `supabase/migrations/`:
 *
 *   · `block_results` (20260921000004): the columns, the 1–10 effort range and
 *     its smallint type, the non-negative counts, UNIQUE (block_id) answered
 *     as 409 / 23505, and the block foreign key.
 *   · `exercise_set_logs` and `mutate_set_observation` (20260921000004,
 *     20261027000027, 20261027000028): the per-operation keys, value types,
 *     CHECKs, the set_effort enum, ordered revisions, exact replay, clear with
 *     its receipt kept, and active-session-only corrections.
 *   · `workout_sessions.mood` 1–5 (20260921000003), `workout_exercises`
 *     notes, `mark_rest_day`'s upsert and blank-note rule (20260921000015).
 *   · `session_snapshot` / `session_as_performed` (20260921000006,
 *     20260921000010): rows assembled with `to_jsonb`, so a column that exists
 *     reaches every reader.
 *   · `anchor_evidence` (20260921000011): every set log of a completed,
 *     non-deload, non-recovery session on a loaded reps prescription, whatever
 *     its block's structure.
 *
 * A table or column the migrations do not create is answered the way PostgREST
 * answers it (404 PGRST205 / 400 PGRST204), which is how a test shows that a
 * proposed field cannot be written today. It does not prove Postgres agrees,
 * and nothing here should be read as claiming that; the deployed-database proof
 * is the disposable test lane's (TASK-047).
 *
 * Deterministic: ids and timestamps come from counters.
 */
import { Constants } from '../data/database.types'
import type {
  BlockResultRow,
  ExerciseSetLogRow,
  RestDayRow,
  SessionSnapshot,
  WorkoutExerciseRow,
  WorkoutSessionRow,
} from '../state/schemas'

export const LOGGING_DOUBLE_URL = 'https://logging-contract.test'
export const LOGGING_DOUBLE_ANON_KEY = 'anon-key'
export const LOGGING_DOUBLE_TOKEN = 'token-logging-contract'

/** `block_results`' columns, as 20260921000004 creates them. */
export const BLOCK_RESULT_COLUMNS = [
  'id',
  'block_id',
  'elapsed_seconds',
  'completed_under_cap',
  'rounds_completed',
  'partial_round_reps',
  'minutes_completed',
  'highest_rung',
  'perceived_effort',
  'notes',
  'created_at',
] as const

/** `exercise_set_logs`' columns, through 20261027000028. */
export const SET_LOG_COLUMNS = [
  'id',
  'workout_exercise_id',
  'prescription_revision_status',
  'set_number',
  'actual_reps',
  'actual_duration_seconds',
  'actual_distance',
  'actual_distance_unit',
  'weight',
  'weight_unit',
  'rpe',
  'is_warmup_set',
  'created_at',
  'effort',
  'mutation_revision',
  'last_mutation_id',
] as const

/** `rest_days`' columns, as 20260921000015 creates them. */
export const REST_DAY_COLUMNS = ['id', 'user_id', 'day', 'reason', 'note', 'created_at', 'updated_at'] as const

const INSERT_KEYS = [
  'actual_reps',
  'actual_duration_seconds',
  'actual_distance',
  'actual_distance_unit',
  'weight',
  'weight_unit',
  'effort',
  'is_warmup_set',
  'rpe',
]
const CORRECT_KEYS = INSERT_KEYS.slice(0, 7)

interface Receipt {
  readonly mutation_id: string
  readonly observation_id: string
  readonly revision: number
  readonly expected_revision: number
  readonly operation: 'insert' | 'correct' | 'clear'
  readonly exercise_id: string
  readonly set_number: number
  readonly request_values: Record<string, unknown>
}

export interface LoggingDoubleRequest {
  readonly method: string
  readonly path: string
  readonly body: unknown
}

export interface LoggingDouble {
  readonly fetch: typeof globalThis.fetch
  /** Every request answered, in order — the test's view of what was sent. */
  readonly requests: LoggingDoubleRequest[]
  blockResults(): BlockResultRow[]
  setLogs(): ExerciseSetLogRow[]
  restDays(): RestDayRow[]
  session(): WorkoutSessionRow
  /** Answer the next request to this path with this status: a refused save. */
  refuseNext(path: string, status: number): void
}

export interface LoggingDoubleOptions {
  readonly snapshot: SessionSnapshot
  /** The authenticated user; the session's owner by default. */
  readonly userId?: string
}

type Json = Record<string, unknown>

const isInt = (value: unknown) => typeof value === 'number' && Number.isInteger(value)
const isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const nonNegativeIntOrNull = (value: unknown) => value === null || value === undefined || (isInt(value) && (value as number) >= 0)
const nonNegativeOrNull = (value: unknown) => value === null || value === undefined || (isNumber(value) && (value as number) >= 0)
const inEnum = (values: readonly string[], value: unknown) => typeof value === 'string' && values.includes(value)

export function createLoggingDouble(options: LoggingDoubleOptions): LoggingDouble {
  const snapshot = structuredClone(options.snapshot)
  const userId = options.userId ?? snapshot.session.user_id
  let session: WorkoutSessionRow = snapshot.session

  const blocks = new Map(snapshot.sections.flatMap((section) => section.blocks.map((entry) => [entry.block.id, entry.block] as const)))
  const exercises = new Map<string, WorkoutExerciseRow>(
    snapshot.sections.flatMap((section) =>
      section.blocks.flatMap((entry) => entry.exercises.map(({ exercise }) => [exercise.id, exercise] as const)),
    ),
  )

  const blockResults = new Map<string, BlockResultRow>()
  const setLogs = new Map<string, ExerciseSetLogRow>(
    snapshot.sections.flatMap((section) =>
      section.blocks.flatMap((entry) => entry.exercises.flatMap(({ set_logs }) => set_logs.map((row) => [row.id, row] as const))),
    ),
  )
  const receipts: Receipt[] = []
  const restDays = new Map<string, RestDayRow>()
  const requests: LoggingDoubleRequest[] = []
  const refusals = new Map<string, number>()

  let sequence = 0
  const nextId = (prefix: string) => {
    sequence += 1
    return `${prefix}${String(sequence).padStart(7, '0')}-0000-4000-8000-000000000000`
  }
  const nextInstant = () => {
    sequence += 1
    return `2026-09-24T10:${String(Math.floor(sequence / 60) % 60).padStart(2, '0')}:${String(sequence % 60).padStart(2, '0')}+00:00`
  }

  const respond = (status: number, body: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  const problem = (status: number, code: string, message: string) => respond(status, { code, message })

  const sessionState = (): SessionSnapshot['state'] =>
    session.abandoned_at !== null
      ? 'abandoned'
      : session.completed_at !== null
        ? 'completed'
        : session.started_at !== null
          ? 'active'
          : 'prescribed'

  const logsFor = (exerciseId: string) =>
    [...setLogs.values()]
      .filter((row) => row.workout_exercise_id === exerciseId)
      .sort((left, right) => left.set_number - right.set_number)

  // ── block_results ─────────────────────────────────────────────────────────

  function insertBlockResults(rows: Json[]): Response {
    const stored: BlockResultRow[] = []
    for (const row of rows) {
      const unknown = Object.keys(row).find((key) => !(BLOCK_RESULT_COLUMNS as readonly string[]).includes(key))
      if (unknown !== undefined) {
        return problem(400, 'PGRST204', `Could not find the '${unknown}' column of 'block_results' in the schema cache`)
      }
      const blockId = String(row.block_id)
      if (!blocks.has(blockId)) return problem(409, '23503', 'block_results_block_id_fkey')
      const effort = row.perceived_effort
      if (effort !== null && effort !== undefined && !isInt(effort)) {
        return problem(400, '22P02', 'invalid input syntax for type smallint')
      }
      if (isInt(effort) && ((effort as number) < 1 || (effort as number) > 10)) {
        return problem(400, '23514', 'block_results_perceived_effort_range')
      }
      for (const column of ['elapsed_seconds', 'rounds_completed', 'partial_round_reps', 'minutes_completed', 'highest_rung']) {
        if (!nonNegativeIntOrNull(row[column])) return problem(400, '23514', `block_results_${column}_non_negative`)
      }
      if (blockResults.has(blockId) || stored.some((candidate) => candidate.block_id === blockId)) {
        return problem(409, '23505', 'duplicate key value violates unique constraint "block_results_block_id_key"')
      }
      const value = (key: string) => (row[key] === undefined ? null : row[key])
      stored.push({
        id: nextId('b'),
        block_id: blockId,
        elapsed_seconds: value('elapsed_seconds') as number | null,
        completed_under_cap: value('completed_under_cap') as boolean | null,
        rounds_completed: value('rounds_completed') as number | null,
        partial_round_reps: value('partial_round_reps') as number | null,
        minutes_completed: value('minutes_completed') as number | null,
        highest_rung: value('highest_rung') as number | null,
        perceived_effort: value('perceived_effort') as number | null,
        notes: value('notes') as string | null,
        created_at: nextInstant(),
      })
    }
    for (const row of stored) blockResults.set(row.block_id, row)
    return respond(201, stored)
  }

  // ── mutate_set_observation ────────────────────────────────────────────────

  function ack(outcome: 'applied' | 'replayed', receipt: Receipt): Json {
    const head = [...receipts].filter((entry) => entry.observation_id === receipt.observation_id).at(-1) as Receipt
    return {
      outcome,
      mutation: {
        observation_id: receipt.observation_id,
        mutation_id: receipt.mutation_id,
        revision: receipt.revision,
        expected_revision: receipt.expected_revision,
        operation: receipt.operation,
        exercise_id: receipt.exercise_id,
        set_number: receipt.set_number,
        values: receipt.request_values,
      },
      head: {
        revision: head.revision,
        mutation_id: head.mutation_id,
        cleared: head.operation === 'clear',
        row: head.operation === 'clear' ? null : (setLogs.get(receipt.observation_id) ?? null),
      },
    }
  }

  function violatesSetChecks(values: Json): boolean {
    if (!nonNegativeIntOrNull(values.actual_reps) || !nonNegativeIntOrNull(values.actual_duration_seconds)) return true
    if (!nonNegativeOrNull(values.actual_distance) || !nonNegativeOrNull(values.weight)) return true
    if (values.actual_distance !== null && values.actual_distance_unit === null) return true
    if (values.actual_distance_unit !== null && !inEnum(Constants.public.Enums.distance_unit, values.actual_distance_unit)) return true
    if (!inEnum(Constants.public.Enums.weight_unit, values.weight_unit)) return true
    if (values.effort !== null && !inEnum(Constants.public.Enums.set_effort, values.effort)) return true
    if ('rpe' in values && values.rpe !== null && !(isNumber(values.rpe) && (values.rpe as number) >= 1 && (values.rpe as number) <= 10)) return true
    return false
  }

  function mutateSetObservation(args: Json): Response {
    const operation = args.p_operation
    const values = args.p_values
    const revision = args.p_revision
    const expected = args.p_expected_revision
    if (
      typeof args.p_observation_id !== 'string' || typeof args.p_mutation_id !== 'string' ||
      typeof args.p_exercise_id !== 'string' || !isInt(revision) || !isInt(expected) ||
      (expected as number) < 0 || revision !== (expected as number) + 1 ||
      !isInt(args.p_set_number) || (args.p_set_number as number) < 1 ||
      (operation !== 'insert' && operation !== 'correct' && operation !== 'clear') ||
      typeof values !== 'object' || values === null || Array.isArray(values)
    ) {
      return respond(200, { outcome: 'invalid' })
    }
    const request = values as Json
    const keys = operation === 'insert' ? INSERT_KEYS : operation === 'correct' ? CORRECT_KEYS : []
    const sent = Object.keys(request)
    if (!keys.every((key) => key in request) || sent.some((key) => !keys.includes(key))) {
      return respond(200, { outcome: 'invalid' })
    }
    if (operation !== 'clear') {
      const typed = Object.entries(request).every(([key, value]) =>
        ['actual_reps', 'actual_duration_seconds', 'actual_distance', 'weight', 'rpe'].includes(key)
          ? value === null || typeof value === 'number'
          : ['actual_distance_unit', 'effort'].includes(key)
            ? value === null || typeof value === 'string'
            : key === 'weight_unit'
              ? typeof value === 'string'
              : typeof value === 'boolean',
      )
      if (!typed) return respond(200, { outcome: 'invalid' })
    }

    const observationId = args.p_observation_id
    const exerciseId = args.p_exercise_id
    const setNumber = args.p_set_number as number
    const exercise = exercises.get(exerciseId)
    if (exercise === undefined) return respond(200, { outcome: 'not_found' })

    const history = receipts.filter((entry) => entry.observation_id === observationId)
    const head = history.at(-1)
    if (head !== undefined && (head.exercise_id !== exerciseId || head.set_number !== setNumber)) {
      return respond(200, { outcome: 'conflict' })
    }

    const existing = receipts.find((entry) => entry.mutation_id === args.p_mutation_id)
    if (existing !== undefined) {
      const same =
        existing.observation_id === observationId && existing.revision === revision &&
        existing.expected_revision === expected && existing.operation === operation &&
        existing.exercise_id === exerciseId && existing.set_number === setNumber &&
        JSON.stringify(existing.request_values) === JSON.stringify(request)
      return same ? respond(200, ack('replayed', existing)) : respond(200, { outcome: 'conflict' })
    }

    if (exercise.revision_status !== 'active') return respond(200, { outcome: 'not_found' })
    if (operation !== 'insert' && sessionState() !== 'active') return respond(200, { outcome: 'invalid_transition' })
    const current = head?.revision ?? 0
    if (expected !== current) return respond(200, { outcome: 'conflict' })
    if (operation === 'insert' && head !== undefined) return respond(200, { outcome: 'conflict' })

    const row = setLogs.get(observationId)
    if (row !== undefined && (row.workout_exercise_id !== exerciseId || row.set_number !== setNumber)) {
      return respond(200, { outcome: 'conflict' })
    }
    if (operation === 'correct' && (row === undefined || head?.operation === 'clear')) {
      return respond(200, { outcome: 'not_found' })
    }
    if (row !== undefined && row.mutation_revision !== current) return respond(200, { outcome: 'conflict' })
    if (operation !== 'clear' && violatesSetChecks(request)) return respond(200, { outcome: 'invalid' })
    if (
      operation === 'insert' && row === undefined &&
      logsFor(exerciseId).some((other) => other.set_number === setNumber)
    ) {
      // exercise_set_logs_set_number_unique
      return respond(200, { outcome: 'conflict' })
    }

    const receipt: Receipt = {
      mutation_id: args.p_mutation_id as string,
      observation_id: observationId,
      revision: revision as number,
      expected_revision: expected as number,
      operation,
      exercise_id: exerciseId,
      set_number: setNumber,
      request_values: request,
    }
    receipts.push(receipt)

    if (operation === 'clear') {
      setLogs.delete(observationId)
    } else if (operation === 'insert') {
      setLogs.set(observationId, {
        id: observationId,
        workout_exercise_id: exerciseId,
        prescription_revision_status: 'active',
        set_number: setNumber,
        actual_reps: request.actual_reps as number | null,
        actual_duration_seconds: request.actual_duration_seconds as number | null,
        actual_distance: request.actual_distance as number | null,
        actual_distance_unit: request.actual_distance_unit as ExerciseSetLogRow['actual_distance_unit'],
        weight: request.weight as number | null,
        weight_unit: request.weight_unit as ExerciseSetLogRow['weight_unit'],
        rpe: request.rpe as number | null,
        is_warmup_set: request.is_warmup_set as boolean,
        created_at: nextInstant(),
        effort: request.effort as ExerciseSetLogRow['effort'],
        mutation_revision: receipt.revision,
        last_mutation_id: receipt.mutation_id,
      })
    } else if (row !== undefined) {
      setLogs.set(observationId, {
        ...row,
        actual_reps: request.actual_reps as number | null,
        actual_duration_seconds: request.actual_duration_seconds as number | null,
        actual_distance: request.actual_distance as number | null,
        actual_distance_unit: request.actual_distance_unit as ExerciseSetLogRow['actual_distance_unit'],
        weight: request.weight as number | null,
        weight_unit: request.weight_unit as ExerciseSetLogRow['weight_unit'],
        effort: request.effort as ExerciseSetLogRow['effort'],
        mutation_revision: receipt.revision,
        last_mutation_id: receipt.mutation_id,
      })
    }
    return respond(200, ack('applied', receipt))
  }

  // ── the reconstructions ──────────────────────────────────────────────────

  function assembled(withResults: boolean): Json {
    return {
      session,
      state: sessionState(),
      sections: snapshot.sections.map((section) => ({
        section: section.section,
        blocks: section.blocks.map((entry) => ({
          block: entry.block,
          ...(withResults ? { block_result: blockResults.get(entry.block.id) ?? null } : {}),
          exercises: entry.exercises.map(({ exercise }) => ({
            exercise: exercises.get(exercise.id),
            set_logs: logsFor(exercise.id),
          })),
        })),
      })),
    }
  }

  // ── anchor_evidence ─────────────────────────────────────────────────────

  function anchorEvidence(): unknown[] {
    const qualifies =
      session.user_id === userId && session.completed_at !== null && session.abandoned_at === null &&
      (session as WorkoutSessionRow & { is_deload?: boolean }).is_deload !== true &&
      session.goal_preset !== 'active_recovery'
    if (!qualifies) return []
    return [...setLogs.values()]
      .filter((row) => !row.is_warmup_set)
      .flatMap((row) => {
        const exercise = exercises.get(row.workout_exercise_id)
        if (exercise === undefined) return []
        if (exercise.modality !== 'reps' || exercise.load_type === 'bodyweight' || exercise.equipment_used === 'bodyweight') return []
        const prescribed =
          exercise.target_kind === 'fixed'
            ? exercise.target_value
            : exercise.target_kind === 'range'
              ? exercise.target_min
              : (exercise.target_sequence?.[row.set_number - 1] ?? null)
        return [{
          session_id: session.id,
          session_date: session.date,
          logged_at: row.created_at,
          exercise_id: exercise.exercise_id,
          equipment_used: exercise.equipment_used,
          set_number: row.set_number,
          actual_reps: row.actual_reps,
          prescribed_reps: prescribed,
          weight: row.weight,
          weight_unit: row.weight_unit,
          rpe: row.rpe,
        }]
      })
  }

  // ── rest days ───────────────────────────────────────────────────────────

  function markRestDay(args: Json): Response {
    if (!inEnum(Constants.public.Enums.rest_day_reason, args.p_reason)) {
      return problem(400, '22P02', 'invalid input value for enum rest_day_reason')
    }
    const day = String(args.p_day)
    const note = typeof args.p_note === 'string' && args.p_note.trim() !== '' ? args.p_note : null
    const previous = restDays.get(day)
    const stamp = nextInstant()
    const row: RestDayRow = {
      id: previous?.id ?? nextId('d'),
      user_id: userId,
      day,
      reason: args.p_reason as RestDayRow['reason'],
      note,
      created_at: previous?.created_at ?? stamp,
      updated_at: stamp,
    }
    restDays.set(day, row)
    return respond(200, row)
  }

  // ── transport ───────────────────────────────────────────────────────────

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const body: unknown = init?.body == null ? undefined : JSON.parse(String(init.body))
    const path = url.pathname.replace(/^\/rest\/v1/, '')
    requests.push({ method, path, body })

    const headers = new Headers(init?.headers)
    if (headers.get('apikey') !== LOGGING_DOUBLE_ANON_KEY || headers.get('Authorization') !== `Bearer ${LOGGING_DOUBLE_TOKEN}`) {
      return problem(401, '42501', 'not authenticated')
    }

    const refusal = refusals.get(path)
    if (refusal !== undefined) {
      refusals.delete(path)
      return problem(refusal, 'PGRST000', 'refused by the double')
    }

    const filterId = (url.searchParams.get('id') ?? '').replace(/^eq\./, '')
    const args = (body ?? {}) as Json

    if (method === 'POST' && path === '/block_results') return insertBlockResults(body as Json[])
    if (method === 'POST' && path === '/rpc/mutate_set_observation') return mutateSetObservation(args)
    if (method === 'POST' && path === '/rpc/session_snapshot') {
      return respond(200, args.p_session_id === session.id ? assembled(false) : null)
    }
    if (method === 'POST' && path === '/rpc/session_as_performed') {
      return respond(
        200,
        args.p_session_id === session.id
          ? { reconstruction: 'performed', as_of: session.completed_at ?? session.started_at, ...assembled(true) }
          : null,
      )
    }
    if (method === 'POST' && path === '/rpc/anchor_evidence') return respond(200, anchorEvidence())
    if (method === 'POST' && path === '/rpc/mark_rest_day') return markRestDay(args)
    if (method === 'GET' && path === '/rest_days') {
      return respond(200, [...restDays.values()].sort((left, right) => right.day.localeCompare(left.day)))
    }
    if (method === 'PATCH' && path === '/workout_sessions') {
      if (filterId !== session.id) return respond(200, [])
      const patch = args
      const unknown = Object.keys(patch).find((key) => !(key in session))
      if (unknown !== undefined) return problem(400, 'PGRST204', `Could not find the '${unknown}' column of 'workout_sessions'`)
      const mood = patch.mood
      if (mood !== undefined && mood !== null && !(isInt(mood) && (mood as number) >= 1 && (mood as number) <= 5)) {
        return problem(400, '23514', 'workout_sessions_mood_range')
      }
      session = { ...session, ...(patch as Partial<WorkoutSessionRow>), updated_at: nextInstant() }
      return respond(200, [session])
    }
    if (method === 'PATCH' && path === '/workout_exercises') {
      const exercise = exercises.get(filterId)
      if (exercise === undefined) return respond(200, [])
      const unknown = Object.keys(args).find((key) => !(key in exercise))
      if (unknown !== undefined) return problem(400, 'PGRST204', `Could not find the '${unknown}' column of 'workout_exercises'`)
      const updated = { ...exercise, ...(args as Partial<WorkoutExerciseRow>) }
      exercises.set(filterId, updated)
      return respond(200, [updated])
    }

    const table = path.replace(/^\//, '')
    if (!table.startsWith('rpc/')) {
      return problem(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`)
    }
    throw new Error(`logging-contract-double: unexpected request ${method} ${url.pathname}`)
  }

  return {
    fetch: fetchImpl,
    requests,
    blockResults: () => [...blockResults.values()],
    setLogs: () => [...setLogs.values()],
    restDays: () => [...restDays.values()],
    session: () => session,
    refuseNext(path, status) {
      refusals.set(path, status)
    },
  }
}
