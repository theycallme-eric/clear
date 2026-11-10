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
 *   · `anchor_evidence` as currently defined (20260921000011, redefined by
 *     20260921000014 to read only the active prescription, EXE-06): every
 *     working set log of a completed, non-deload, non-recovery session on an
 *     active, loaded reps prescription, whatever its block's structure. Its
 *     row order is not modelled: no rehearsal here reads more than one row.
 *
 * TASK-031 extends it with what MIG-A and MIG-B declare
 * (20261110000029, 20261110000030):
 *
 *   · `block_results.effort` (the `set_effort` enum) and an owner-scoped
 *     PATCH of a saved row (`block_results_update_own`, the table-level grant).
 *   · `block_movement_results`: its columns, the insert and update column
 *     grants (a column outside them is 42501), the owner-only policies through
 *     exercise → block → section → session, the composite foreign key to an
 *     active prescription, every CHECK, NOT NULL `weight_unit`, the primary
 *     key and UNIQUE (workout_exercise_id) answered as 409 / 23505, delete,
 *     and `updated_at` stamped on update.
 *   · `session_as_performed` carrying each exercise's `movement_result`.
 *
 * `schema: 'hosted-before-timed-actuals'` answers as the hosted project does
 * until the owner applies MIG-A and MIG-B (LIVE-PRE-1): no `effort` column, no
 * `block_movement_results` table, and reconstructions without
 * `movement_result`. That is how a test shows the shipped saves still work on
 * the current hosted schema and the new writers refuse explicitly there.
 *
 * A table or column the schema does not have is answered the way PostgREST
 * answers it (404 PGRST205 / 400 PGRST204). It does not prove Postgres agrees,
 * and nothing here should be read as claiming that; the deployed-database proof
 * is the disposable test lane's (TASK-047).
 *
 * Failures a test can ask for: `refuseNext` (the request is refused and
 * nothing is applied) and `loseNextAnswer` (the request is applied and then the
 * answer is lost in transit, as a dropped connection does).
 *
 * Deterministic: ids and timestamps come from counters.
 */
import { Constants } from '../data/database.types'
import type {
  BlockMovementResultRow,
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
  'effort',
] as const

/** `block_movement_results`' columns, as 20261110000030 (MIG-B) creates them. */
export const BLOCK_MOVEMENT_RESULT_COLUMNS = [
  'id',
  'workout_exercise_id',
  'prescription_revision_status',
  'round_number',
  'actual_reps',
  'actual_duration_seconds',
  'actual_distance',
  'actual_distance_unit',
  'weight',
  'weight_unit',
  'created_at',
  'updated_at',
] as const

/** MIG-B's column grants to `authenticated`. */
const MOVEMENT_INSERT_GRANT = [
  'id', 'workout_exercise_id', 'round_number', 'actual_reps', 'actual_duration_seconds',
  'actual_distance', 'actual_distance_unit', 'weight', 'weight_unit',
]
const MOVEMENT_UPDATE_GRANT = MOVEMENT_INSERT_GRANT.slice(2)

/** Which schema the double answers as. */
export type LoggingDoubleSchema = 'repository' | 'hosted-before-timed-actuals'

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
  /** TASK-031: the stored `block_movement_results` rows. */
  movementResults(): BlockMovementResultRow[]
  setLogs(): ExerciseSetLogRow[]
  restDays(): RestDayRow[]
  session(): WorkoutSessionRow
  /**
   * Answer the next request to this path (and method, when given) with this
   * status: a refused save, nothing applied.
   */
  refuseNext(path: string, status: number, method?: string): void
  /**
   * Apply the next request to this path (and method, when given), then lose
   * its answer: the fetch rejects as a dropped connection does, after the
   * write landed.
   */
  loseNextAnswer(path: string, method?: string): void
}

export interface LoggingDoubleOptions {
  readonly snapshot: SessionSnapshot
  /** The authenticated user; the session's owner by default. */
  readonly userId?: string
  /**
   * `repository` (the default): every migration in `supabase/migrations/`,
   * MIG-A and MIG-B included. `hosted-before-timed-actuals`: the hosted
   * project as it stands until LIVE-PRE-1 — without MIG-A and MIG-B.
   */
  readonly schema?: LoggingDoubleSchema
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
  const migrated = (options.schema ?? 'repository') === 'repository'
  const blockResultColumns: readonly string[] = migrated
    ? BLOCK_RESULT_COLUMNS
    : BLOCK_RESULT_COLUMNS.filter((column) => column !== 'effort')
  let session: WorkoutSessionRow = snapshot.session

  const blocks = new Map(snapshot.sections.flatMap((section) => section.blocks.map((entry) => [entry.block.id, entry.block] as const)))
  const exercises = new Map<string, WorkoutExerciseRow>(
    snapshot.sections.flatMap((section) =>
      section.blocks.flatMap((entry) => entry.exercises.map(({ exercise }) => [exercise.id, exercise] as const)),
    ),
  )

  const blockResults = new Map<string, BlockResultRow>()
  const movementResults = new Map<string, BlockMovementResultRow>()
  const setLogs = new Map<string, ExerciseSetLogRow>(
    snapshot.sections.flatMap((section) =>
      section.blocks.flatMap((entry) => entry.exercises.flatMap(({ set_logs }) => set_logs.map((row) => [row.id, row] as const))),
    ),
  )
  const receipts: Receipt[] = []
  const restDays = new Map<string, RestDayRow>()
  const requests: LoggingDoubleRequest[] = []
  const refusals = new Map<string, number>()
  const losses = new Set<string>()

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
      const unknown = Object.keys(row).find((key) => !blockResultColumns.includes(key))
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
      if (row.effort !== undefined && row.effort !== null && !inEnum(Constants.public.Enums.set_effort, row.effort)) {
        return problem(400, '22P02', 'invalid input value for enum set_effort')
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
        effort: value('effort') as BlockResultRow['effort'],
      })
    }
    for (const row of stored) blockResults.set(row.block_id, row)
    return respond(201, stored)
  }

  /** `block_results_*_own`: the block's session belongs to the caller. */
  const ownsSession = () => session.user_id === userId

  /** PATCH /block_results?block_id=eq.… — the correction (table-level update grant). */
  function updateBlockResults(blockId: string, patch: Json): Response {
    const unknown = Object.keys(patch).find((key) => !blockResultColumns.includes(key))
    if (unknown !== undefined) {
      return problem(400, 'PGRST204', `Could not find the '${unknown}' column of 'block_results' in the schema cache`)
    }
    const existing = blockResults.get(blockId)
    // RLS USING: a row the caller does not own is not there to update.
    if (existing === undefined || !ownsSession()) return respond(200, [])
    const next = { ...existing, ...(patch as Partial<BlockResultRow>) }
    const effort = next.perceived_effort
    if (effort !== null && !isInt(effort)) return problem(400, '22P02', 'invalid input syntax for type smallint')
    if (effort !== null && (effort < 1 || effort > 10)) return problem(400, '23514', 'block_results_perceived_effort_range')
    for (const column of ['elapsed_seconds', 'rounds_completed', 'partial_round_reps', 'minutes_completed', 'highest_rung'] as const) {
      if (!nonNegativeIntOrNull(next[column])) return problem(400, '23514', `block_results_${column}_non_negative`)
    }
    if (next.effort !== null && !inEnum(Constants.public.Enums.set_effort, next.effort)) {
      return problem(400, '22P02', 'invalid input value for enum set_effort')
    }
    if (next.block_id !== blockId || next.id !== existing.id) return problem(409, '23505', 'block_results identity changed')
    blockResults.set(blockId, next)
    return respond(200, [next])
  }

  // ── block_movement_results (MIG-B) ─────────────────────────────────────────

  /** `block_movement_results_*_own`: exercise → block → section → session → owner. */
  const ownsExercise = (exerciseId: string) => exercises.has(exerciseId) && ownsSession()

  /** MIG-B's CHECKs and types on a whole row, or the refusal. */
  function movementRowProblem(row: BlockMovementResultRow): Response | null {
    if (!(row.round_number === null || (isInt(row.round_number) && row.round_number > 0))) {
      return problem(400, '23514', 'block_movement_results_round_positive')
    }
    for (const column of ['actual_reps', 'actual_duration_seconds'] as const) {
      if (row[column] !== null && !isInt(row[column])) return problem(400, '22P02', 'invalid input syntax for type integer')
    }
    if (!nonNegativeIntOrNull(row.actual_reps)) return problem(400, '23514', 'block_movement_results_reps_non_negative')
    if (!nonNegativeIntOrNull(row.actual_duration_seconds)) return problem(400, '23514', 'block_movement_results_duration_non_negative')
    if (!nonNegativeOrNull(row.actual_distance)) return problem(400, '23514', 'block_movement_results_distance_non_negative')
    if (!nonNegativeOrNull(row.weight)) return problem(400, '23514', 'block_movement_results_weight_non_negative')
    if (row.weight_unit === null || row.weight_unit === undefined) return problem(400, '23502', 'null value in column "weight_unit"')
    if (!inEnum(Constants.public.Enums.weight_unit, row.weight_unit)) return problem(400, '22P02', 'invalid input value for enum weight_unit')
    if (row.actual_distance_unit !== null && !inEnum(Constants.public.Enums.distance_unit, row.actual_distance_unit)) {
      return problem(400, '22P02', 'invalid input value for enum distance_unit')
    }
    const amount = row.actual_reps !== null || row.actual_duration_seconds !== null || row.actual_distance !== null
    if (amount && row.round_number === null) return problem(400, '23514', 'block_movement_results_amount_needs_round')
    if (!amount && row.weight === null) return problem(400, '23514', 'block_movement_results_observed')
    if (row.actual_distance !== null && row.actual_distance_unit === null) {
      return problem(400, '23514', 'block_movement_results_distance_has_unit')
    }
    return null
  }

  function insertMovementResults(rows: Json[]): Response {
    const stored: BlockMovementResultRow[] = []
    for (const row of rows) {
      const unknown = Object.keys(row).find((key) => !(BLOCK_MOVEMENT_RESULT_COLUMNS as readonly string[]).includes(key))
      if (unknown !== undefined) {
        return problem(400, 'PGRST204', `Could not find the '${unknown}' column of 'block_movement_results' in the schema cache`)
      }
      const ungranted = Object.keys(row).find((key) => !MOVEMENT_INSERT_GRANT.includes(key))
      if (ungranted !== undefined) return problem(403, '42501', 'permission denied for table block_movement_results')
      const exerciseId = String(row.workout_exercise_id)
      if (!exercises.has(exerciseId)) return problem(409, '23503', 'block_movement_results_prescription_fkey')
      // RLS WITH CHECK before the row's own constraints.
      if (!ownsExercise(exerciseId)) return problem(403, '42501', 'new row violates row-level security policy for table "block_movement_results"')
      if ((exercises.get(exerciseId) as WorkoutExerciseRow).revision_status !== 'active') {
        return problem(409, '23503', 'block_movement_results_prescription_fkey')
      }
      const value = (key: string) => (row[key] === undefined ? null : row[key])
      const stamp = nextInstant()
      const candidate: BlockMovementResultRow = {
        id: String(row.id),
        workout_exercise_id: exerciseId,
        prescription_revision_status: 'active',
        round_number: value('round_number') as number | null,
        actual_reps: value('actual_reps') as number | null,
        actual_duration_seconds: value('actual_duration_seconds') as number | null,
        actual_distance: value('actual_distance') as number | null,
        actual_distance_unit: value('actual_distance_unit') as BlockMovementResultRow['actual_distance_unit'],
        weight: value('weight') as number | null,
        weight_unit: value('weight_unit') as BlockMovementResultRow['weight_unit'],
        created_at: stamp,
        updated_at: stamp,
      }
      const refused = movementRowProblem(candidate)
      if (refused !== null) return refused
      const taken = [...movementResults.values(), ...stored]
      if (taken.some((other) => other.id === candidate.id)) {
        return problem(409, '23505', 'duplicate key value violates unique constraint "block_movement_results_pkey"')
      }
      if (taken.some((other) => other.workout_exercise_id === exerciseId)) {
        return problem(409, '23505', 'duplicate key value violates unique constraint "block_movement_results_one_per_movement"')
      }
      stored.push(candidate)
    }
    for (const row of stored) movementResults.set(row.id, row)
    return respond(201, stored)
  }

  const movementMatches = (url: URL) => {
    const by = (column: string) => (url.searchParams.get(column) ?? '').replace(/^eq\./, '')
    return [...movementResults.values()].filter(
      (row) =>
        (url.searchParams.has('id') ? row.id === by('id') : true) &&
        (url.searchParams.has('workout_exercise_id') ? row.workout_exercise_id === by('workout_exercise_id') : true) &&
        ownsExercise(row.workout_exercise_id),
    )
  }

  function updateMovementResults(url: URL, patch: Json): Response {
    const unknown = Object.keys(patch).find((key) => !(BLOCK_MOVEMENT_RESULT_COLUMNS as readonly string[]).includes(key))
    if (unknown !== undefined) {
      return problem(400, 'PGRST204', `Could not find the '${unknown}' column of 'block_movement_results' in the schema cache`)
    }
    const ungranted = Object.keys(patch).find((key) => !MOVEMENT_UPDATE_GRANT.includes(key))
    if (ungranted !== undefined) return problem(403, '42501', 'permission denied for table block_movement_results')
    const updated: BlockMovementResultRow[] = []
    for (const row of movementMatches(url)) {
      const next: BlockMovementResultRow = { ...row, ...(patch as Partial<BlockMovementResultRow>), updated_at: nextInstant() }
      const refused = movementRowProblem(next)
      if (refused !== null) return refused
      updated.push(next)
    }
    for (const row of updated) movementResults.set(row.id, row)
    return respond(200, updated)
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
          ...(withResults ? { block_result: blockResultAsStored(entry.block.id) } : {}),
          exercises: entry.exercises.map(({ exercise }) => ({
            exercise: exercises.get(exercise.id),
            set_logs: logsFor(exercise.id),
            // MIG-B's reconstruction; the hosted function has no such key yet.
            ...(withResults && migrated
              ? { movement_result: [...movementResults.values()].find((row) => row.workout_exercise_id === exercise.id) ?? null }
              : {}),
          })),
        })),
      })),
    }
  }

  /** `to_jsonb(br)`: only the columns the schema has. */
  function blockResultAsStored(blockId: string): Json | null {
    const row = blockResults.get(blockId)
    if (row === undefined) return null
    return Object.fromEntries(Object.entries(row).filter(([key]) => blockResultColumns.includes(key)))
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
        // 20260921000014 (EXE-06): the prescription that still stands, and no other.
        if (exercise.revision_status !== 'active') return []
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

    for (const key of [`${method} ${path}`, path]) {
      const refusal = refusals.get(key)
      if (refusal !== undefined) {
        refusals.delete(key)
        return problem(refusal, 'PGRST000', 'refused by the double')
      }
    }
    const lose = [`${method} ${path}`, path].find((key) => losses.has(key))
    if (lose !== undefined) {
      losses.delete(lose)
      route(method, path, url, body)
      throw new TypeError('Failed to fetch (the double lost the answer after applying the request)')
    }
    return route(method, path, url, body)
  }

  function route(method: string, path: string, url: URL, body: unknown): Response {
    const filterId = (url.searchParams.get('id') ?? '').replace(/^eq\./, '')
    const args = (body ?? {}) as Json

    if (method === 'POST' && path === '/block_results') return insertBlockResults(body as Json[])
    if (method === 'PATCH' && path === '/block_results') {
      return updateBlockResults((url.searchParams.get('block_id') ?? '').replace(/^eq\./, ''), args)
    }
    if (migrated && path === '/block_movement_results') {
      if (method === 'POST') return insertMovementResults(body as Json[])
      if (method === 'PATCH') return updateMovementResults(url, args)
      if (method === 'DELETE') {
        for (const row of movementMatches(url)) movementResults.delete(row.id)
        return respond(204, undefined)
      }
      if (method === 'GET') return respond(200, movementMatches(url))
    }
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
    movementResults: () => [...movementResults.values()],
    setLogs: () => [...setLogs.values()],
    restDays: () => [...restDays.values()],
    session: () => session,
    refuseNext(path, status, method) {
      refusals.set(method === undefined ? path : `${method} ${path}`, status)
    },
    loseNextAnswer(path, method) {
      losses.add(method === undefined ? path : `${method} ${path}`)
    },
  }
}
