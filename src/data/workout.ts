/**
 * EXE-01's two data needs, built the way AUTH-03's are: a token read from the
 * live session on every call, and nothing held between them.
 *
 * `createSessionsClient` (SES-01a) takes a static config, because a test hands
 * it one token and asserts what it sent. The app cannot — `auth.ts` rotates the
 * access token, and a client built once at sign-in would keep presenting a
 * token that has since expired. So the live client is assembled per call here,
 * exactly as `user-data.ts` does for the profile read, and the shell holds this
 * façade rather than a bound client.
 *
 * `BlockResultsClient` is the second half, and it is one method: the shell
 * writes `block_results` for every structure type (EXE-01), so there is one
 * writer, one row shape and one place a failed write is turned into a typed
 * error. Renderers never reach it.
 *
 * `SetLogsClient` (EXE-02) is the same shape for the other row execution
 * produces. One set, one insert, at the moment it was performed — the
 * requirement's "written at log time, not batched at workout end" is this
 * method being called per set rather than a queue being drained at the end. The
 * durable local queue in front of it is EXE-07's, and it will wrap this client
 * rather than replace it, which is why the row is minted by the caller: an id
 * that exists before the request does is what makes a retry idempotent.
 */
import { isErr, ok, err, createError, ErrorCode, type AppError, type Result } from '../state/errors'
import {
  blockResultCorrection,
  blockResultInsert,
  isPerceivedEffort,
  movementResultViolation,
  PERCEIVED_EFFORT_MAX,
  PERCEIVED_EFFORT_MIN,
  type BlockCompletion,
  type MovementResultWrite,
} from '../state/block-completion'
import { setLogInsert, setLogViolation, type SetLogEntry } from '../state/set-logging'
import { parseSetObservationAck, type SetObservationMutation, type SetObservationAck } from '../state/set-observation-mutation'
import {
  blockMovementResultRowSchema,
  blockResultRowSchema,
  exerciseSetLogRowSchema,
  parseBoundary,
  type BlockMovementResultRow,
  type BlockResultRow,
  type ExerciseSetLogRow,
} from '../state/schemas'
import { createAnchorsClient, type AnchorsClient } from './anchors'
import type { AuthClient } from './auth'
import { createCandidatesClient, type CandidatesClient } from './candidates'
import { createConditioningClient, type ConditioningClient } from './conditioning'
import { createExercisesClient, type ExercisesClient } from './exercises'
import { createFavoritesClient, type FavoritesClient } from './favorites'
import { createHistoryClient, type HistoryClient } from './history'
import { createSessionsClient, type SessionsClient } from './sessions'
import { createSupabaseClient, type SupabaseConfig } from './supabase'

export interface BlockResultsClient {
  /**
   * Writes one `block_results` row and answers it as the database stored it.
   * A supplied effort outside 1–10 is refused before anything is sent; an
   * absent one is written as `null`.
   */
  record(completion: BlockCompletion): Promise<Result<BlockResultRow>>
  /**
   * TASK-031 (`block-result-correction`): corrects the block's saved row by an
   * UPDATE addressed to its `block_id`, restating every outcome column, the
   * notes and the categorical effort, and answers the row as stored. A row
   * that is not there (or not the caller's) is `PERSISTENCE_NOT_FOUND`;
   * nothing is inserted. This is what absorbs a changed retry after a lost
   * answer: the insert's 23505 says the row exists, and the correction makes
   * it say what the athlete last confirmed.
   *
   * Not called by any shipped path yet (TASK-047 wires it). It names
   * `effort`, so it needs MIG-A on the project it is sent to; without it the
   * refusal says so (`details.migration: 'MIG-A'`).
   */
  correct(completion: BlockCompletion): Promise<Result<BlockResultRow>>
  /**
   * TASK-031 (`movement-actuals-writer`): writes the block's per-movement
   * actuals (MIG-B), one movement at a time, in order, and answers the rows
   * as stored. Idempotent: a row is inserted under its client-minted id; a
   * 23505 (the row is already there — a retry after a lost answer, or a
   * correction) restates it by an UPDATE addressed to its movement; a `null`
   * row removes what an earlier attempt saved. Repeating the same writes
   * leaves exactly the same rows and never a second one for a movement.
   * A failure stops at that movement with the earlier ones written, so the
   * retry resumes rather than repeats; the caller keeps its draft.
   *
   * Not called by any shipped path yet (TASK-047 wires it). It needs MIG-B on
   * the project it is sent to; without it the refusal says so
   * (`details.migration: 'MIG-B'`).
   */
  recordMovements(writes: readonly MovementResultWrite[]): Promise<Result<BlockMovementResultRow[]>>
}

export interface SetLogsClient {
  /**
   * Writes one `exercise_set_logs` row and answers it as the database stored
   * it. A measurement the CHECK constraints would refuse — a negative weight,
   * an RPE outside 1–10, a distance with no unit — is refused before anything
   * is sent.
   */
  log(entry: SetLogEntry): Promise<Result<ExerciseSetLogRow>>
  /** Executes one exact durable request; only its validated receipt settles it. */
  mutate(mutation: SetObservationMutation): Promise<Result<SetObservationAck>>
}

export interface WorkoutClients {
  /** SES-01a's lifecycle, carrying the live token. */
  readonly sessions: SessionsClient
  readonly blockResults: BlockResultsClient
  /**
   * HIST-01's history read. It sits here rather than in a façade of its own
   * because it needs exactly what the other two need and nothing else: the
   * access token as it is at the moment of the call. A second context carrying
   * a second copy of that discipline would be two places to get it wrong.
   */
  readonly history: HistoryClient
  readonly setLogs: SetLogsClient
  /**
   * EXE-05's coaching panel: the library definition behind a prescription, and
   * the note the user writes on it. Here for the reason `history` is — it needs
   * the access token as it is at the moment of the call and nothing more.
   */
  readonly exercises: ExercisesClient
  /**
   * OVR-03's conditioning read: the scored conditioning blocks a like-for-like
   * comparison and the density nudge are both drawn from. Here for the reason
   * `history` is — the token as it is at the moment of the call, and nothing
   * more — and read by the shell, which is where a block is completed.
   */
  readonly conditioning: ConditioningClient
  /**
   * GEN-02a's retrieval, read by EXE-06's mid-workout swap. It is generation's
   * own candidate query and not a second one, which is the requirement: the
   * alternatives offered for a slot respect the same equipment and limitation
   * predicates, evaluated against the location the session is being performed
   * at. Here for the reason `history` is — the token as it is at the moment of
   * the call, and nothing more.
   */
  readonly candidates: CandidatesClient
  /**
   * OVR-01a's anchor queries, read by OVR-01c's Review surface: the stored
   * anchors and the working sets behind them. OVR-04's deload triggers use the
   * same evidence instead of recomputing it, so the Review surface, completion
   * writes, and stall detection cannot disagree.
   */
  readonly anchors: AnchorsClient
  /**
   * FAV-01's favorites. Here for the reason `history` is — the token as it is
   * at the moment of the call — and because completion has to reach it: a
   * restarted favorite's counter is bumped by `sessions.complete` below, and a
   * client held somewhere else could not be.
   */
  readonly favorites: FavoritesClient
}

export interface WorkoutClientsConfig {
  /** Asked for the access token per call, so a rotated token is never stale. */
  readonly auth: Pick<AuthClient, 'getSession'>
  /** The project, minus the token this module supplies per call. */
  readonly supabase: Omit<SupabaseConfig, 'accessToken'>
}

export function createWorkoutClients({
  auth,
  supabase,
}: WorkoutClientsConfig): WorkoutClients {
  /** The current access token, or the typed refusal every policy would give. */
  const token = async (): Promise<Result<string>> => {
    const session = await auth.getSession()
    if (isErr(session)) return session
    if (session.value === null) {
      return err(createError(ErrorCode.AUTH_UNAUTHENTICATED))
    }
    return ok(session.value.accessToken)
  }

  /**
   * A lifecycle client for one call. Building it is closures and a string, so
   * per-call construction costs nothing measurable and removes the whole class
   * of bug where a screen holds a client older than the session it belongs to.
   */
  const sessionsFor = async (): Promise<Result<SessionsClient>> => {
    const accessToken = await token()
    if (isErr(accessToken)) return accessToken
    return ok(createSessionsClient({ ...supabase, accessToken: accessToken.value }))
  }

  /**
   * OVR-01a's anchor queries, built the same way and carrying the same token.
   * It is here rather than on the façade's surface because nothing in `src/`
   * reads an anchor yet — OVR-01b is what adds a reader — and the one thing
   * that has to happen now is the recomputation `complete` triggers.
   */
  const anchors = createAnchorsClient({ auth, supabase })

  /** OVR-03's conditioning read, built the same way and carrying the same token. */
  const conditioning = createConditioningClient({ auth, supabase })

  /** FAV-01's favorites, assembled per call around the live token. */
  const favoritesFor = async (): Promise<Result<FavoritesClient>> => {
    const accessToken = await token()
    if (isErr(accessToken)) return accessToken
    return ok(createFavoritesClient({ ...supabase, accessToken: accessToken.value }))
  }

  const favorites: FavoritesClient = {
    async list(userId) {
      const client = await favoritesFor()
      return isErr(client) ? client : client.value.list(userId)
    },
    async save(userId, draft) {
      const client = await favoritesFor()
      return isErr(client) ? client : client.value.save(userId, draft)
    },
    async attempt(savedWorkoutId, sessionId) {
      const client = await favoritesFor()
      return isErr(client) ? client : client.value.attempt(savedWorkoutId, sessionId)
    },
    async attempts(savedWorkoutId) {
      const client = await favoritesFor()
      return isErr(client) ? client : client.value.attempts(savedWorkoutId)
    },
    async recordCompletion(sessionId) {
      const client = await favoritesFor()
      return isErr(client) ? client : client.value.recordCompletion(sessionId)
    },
    async remove(savedWorkoutId) {
      const client = await favoritesFor()
      return isErr(client) ? client : client.value.remove(savedWorkoutId)
    },
  }

  const sessions: SessionsClient = {
    async accept(userId, acceptance) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.accept(userId, acceptance)
    },
    async start(sessionId) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.start(sessionId)
    },
    async complete(sessionId, actualDurationMins) {
      const client = await sessionsFor()
      if (isErr(client)) return client

      const completed = await client.value.complete(sessionId, actualDurationMins)
      if (isErr(completed)) return completed

      // OVR-01a: completion is the only event that can change what the anchor
      // evidence says, so it is the only place that asks. Here rather than in
      // the shell because a second caller that completed a session — and
      // forgot — would leave the table quietly stale, which is the failure
      // nothing would report.
      //
      // Its failure is deliberately not this call's failure. The workout is
      // finished either way, and refusing the completion because a derived
      // cache could not be rewritten would lose the session over the number.
      // Recomputation reads the whole history, so the next one repairs it.
      await anchors.recompute(completed.value.session.user_id)

      // FAV-01, and the same argument: completion is the event that bumps a
      // favorite's `times_completed`, so it is asked here rather than by the
      // shell — a second caller that completed a session and forgot would
      // leave a favorite quietly under-counted. Most sessions did not come
      // from one, and `not_a_favorite` is the ordinary answer.
      //
      // Its failure is deliberately not this call's failure, for the reason
      // the recomputation's is not: the workout is finished either way, and
      // the attempt row is still there for a later call to stamp.
      await favorites.recordCompletion(sessionId)

      return completed
    },
    async abandon(sessionId) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.abandon(sessionId)
    },
    async swap(workoutExerciseId, prescription) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.swap(workoutExerciseId, prescription)
    },
    async swapBlock(blockId, revisions) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.swapBlock(blockId, revisions)
    },
    async snapshot(sessionId) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.snapshot(sessionId)
    },
    async resume(userId) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.resume(userId)
    },
    async asGenerated(sessionId) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.asGenerated(sessionId)
    },
    async asIntendedAtStart(sessionId) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.asIntendedAtStart(sessionId)
    },
    async asPerformed(sessionId) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.asPerformed(sessionId)
    },
  }

  const dbFor = async (): Promise<Result<ReturnType<typeof createSupabaseClient>>> => {
    const accessToken = await token()
    if (isErr(accessToken)) return accessToken
    return ok(createSupabaseClient({ ...supabase, accessToken: accessToken.value }))
  }

  const blockResults: BlockResultsClient = {
    async record(completion) {
      // The range is the database's (`block_results_perceived_effort_range`),
      // and it is checked here because this is the one path every structure
      // type writes through: whatever control a renderer grows, an effort
      // outside 1–10 is refused in the caller's own vocabulary rather than as
      // a 400 nobody can act on. An absent effort is not out of range: it is
      // optional feedback, and is written as `null` (E04).
      const effort = completion.perceivedEffort
      if (effort !== undefined && effort !== null && !isPerceivedEffort(effort)) {
        return err(
          createError(ErrorCode.VALIDATION_OUT_OF_RANGE, {
            details: {
              field: 'perceived_effort',
              min: PERCEIVED_EFFORT_MIN,
              max: PERCEIVED_EFFORT_MAX,
            },
          }),
        )
      }

      const accessToken = await token()
      if (isErr(accessToken)) return accessToken

      const db = createSupabaseClient({ ...supabase, accessToken: accessToken.value })
      const rows = await db.from('block_results').insert(blockResultInsert(completion))
      if (isErr(rows)) {
        // Only an answered effort names the MIG-A column; an unanswered one is
        // omitted, so every save the shipped renderers make is unaffected.
        return completion.outcome.effort === undefined ? rows : err(schemaGap(rows.error, 'MIG-A'))
      }

      const [row] = rows.value
      if (row === undefined) {
        // An insert that returned no representation. RLS refused it, or the
        // request asked for none — either way nothing was read back, and
        // answering a row the caller cannot have would be a guess.
        return err(
          createError(ErrorCode.PERSISTENCE_WRITE_FAILED, {
            details: { table: 'block_results', blockId: completion.blockId },
          }),
        )
      }

      return parseBoundary(blockResultRowSchema, row, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
    },
    async correct(completion) {
      const effort = completion.perceivedEffort
      if (effort !== undefined && effort !== null && !isPerceivedEffort(effort)) {
        return err(
          createError(ErrorCode.VALIDATION_OUT_OF_RANGE, {
            details: { field: 'perceived_effort', min: PERCEIVED_EFFORT_MIN, max: PERCEIVED_EFFORT_MAX },
          }),
        )
      }

      const db = await dbFor()
      if (isErr(db)) return db

      const rows = await db.value
        .from('block_results')
        .update(blockResultCorrection(completion), { block_id: completion.blockId })
      if (isErr(rows)) return err(schemaGap(rows.error, 'MIG-A'))

      const [row] = rows.value
      if (row === undefined) {
        // Nothing matched: no saved row to correct, or one RLS hides. A
        // correction never becomes an insert.
        return err(
          createError(ErrorCode.PERSISTENCE_NOT_FOUND, {
            details: { table: 'block_results', blockId: completion.blockId },
          }),
        )
      }

      return parseBoundary(blockResultRowSchema, row, { code: ErrorCode.PERSISTENCE_READ_FAILED })
    },
    async recordMovements(writes) {
      for (const write of writes) {
        const field = movementResultViolation(write)
        if (field !== null) {
          return err(
            createError(ErrorCode.VALIDATION_OUT_OF_RANGE, {
              details: { field, workoutExerciseId: write.workoutExerciseId },
            }),
          )
        }
      }

      const db = await dbFor()
      if (isErr(db)) return db
      const table = db.value.from('block_movement_results')

      const stored: BlockMovementResultRow[] = []
      for (const [index, write] of writes.entries()) {
        const where = { workout_exercise_id: write.workoutExerciseId }
        const failed = (error: AppError) =>
          err(
            schemaGap(
              { ...error, details: { ...error.details, workoutExerciseId: write.workoutExerciseId, written: index } },
              'MIG-B',
            ),
          )

        if (write.row === null) {
          const removed = await table.delete(where)
          if (isErr(removed)) return failed(removed.error)
          continue
        }

        let rows = await table.insert(write.row)
        if (isErr(rows) && isUniqueViolation(rows.error)) {
          // Already there: restate it. The movement and the first id stay; the
          // values become what this write says.
          const { id: _id, workout_exercise_id: _movement, ...values } = write.row
          void _id
          void _movement
          rows = await table.update(values, where)
        }
        if (isErr(rows)) return failed(rows.error)

        const [row] = rows.value
        if (row === undefined) {
          return failed(
            createError(ErrorCode.PERSISTENCE_WRITE_FAILED, { details: { table: 'block_movement_results' } }),
          )
        }
        const parsed = parseBoundary(blockMovementResultRowSchema, row, { code: ErrorCode.PERSISTENCE_READ_FAILED })
        if (isErr(parsed)) return parsed
        stored.push(parsed.value)
      }
      return ok(stored)
    },
  }

  const history: HistoryClient = {
    async page(userId, query) {
      const accessToken = await token()
      if (isErr(accessToken)) return accessToken

      return createHistoryClient({ ...supabase, accessToken: accessToken.value }).page(
        userId,
        query,
      )
    },
  }

  const setLogs: SetLogsClient = {
    async log(entry) {
      // The bounds are the table's own, and they are checked here for the same
      // reason the effort range is: this is the one path every structure logs
      // a set through, so an impossible measurement is refused in the caller's
      // vocabulary rather than as a Postgres constraint name.
      const violation = setLogViolation(entry)
      if (violation !== null) {
        return err(
          createError(ErrorCode.VALIDATION_OUT_OF_RANGE, {
            details: { ...violation, exerciseId: entry.exerciseId },
          }),
        )
      }

      const accessToken = await token()
      if (isErr(accessToken)) return accessToken

      const db = createSupabaseClient({ ...supabase, accessToken: accessToken.value })
      const rows = await db.from('exercise_set_logs').insert(setLogInsert(entry))
      if (isErr(rows)) return rows

      const [row] = rows.value
      if (row === undefined) {
        // Nothing was read back: RLS refused the insert, or it asked for no
        // representation. A set the user performed must never be drawn as
        // logged on the strength of a write that answered nothing.
        return err(
          createError(ErrorCode.PERSISTENCE_WRITE_FAILED, {
            details: {
              table: 'exercise_set_logs',
              exerciseId: entry.exerciseId,
              setNumber: entry.performed.setNumber,
            },
          }),
        )
      }

      return parseBoundary(exerciseSetLogRowSchema, row, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
    },
    async mutate(mutation) {
      const accessToken = await token()
      if (isErr(accessToken)) return accessToken
      const db = createSupabaseClient({ ...supabase, accessToken: accessToken.value })
      const result = await db.rpc('mutate_set_observation', {
        p_observation_id: mutation.observation_id,
        p_mutation_id: mutation.mutation_id,
        p_revision: mutation.revision,
        p_expected_revision: mutation.expected_revision,
        p_operation: mutation.operation,
        p_exercise_id: mutation.exercise_id,
        p_set_number: mutation.set_number,
        p_values: mutation.values,
      })
      return isErr(result) ? result : parseSetObservationAck(result.value, mutation)
    },
  }

  const exercises: ExercisesClient = {
    async definition(exerciseId) {
      const accessToken = await token()
      if (isErr(accessToken)) return accessToken

      return createExercisesClient({
        ...supabase,
        accessToken: accessToken.value,
      }).definition(exerciseId)
    },
    async saveNotes(workoutExerciseId, notes) {
      const accessToken = await token()
      if (isErr(accessToken)) return accessToken

      return createExercisesClient({
        ...supabase,
        accessToken: accessToken.value,
      }).saveNotes(workoutExerciseId, notes)
    },
  }

  const candidates: CandidatesClient = {
    async retrieve(request) {
      const accessToken = await token()
      if (isErr(accessToken)) return accessToken

      return createCandidatesClient({
        ...supabase,
        accessToken: accessToken.value,
      }).retrieve(request)
    },
  }

  return {
    sessions,
    blockResults,
    history,
    setLogs,
    exercises,
    conditioning,
    favorites,
    candidates,
    anchors,
  }
}

/** Postgres' unique_violation: the row is already there. */
function isUniqueViolation(error: AppError): boolean {
  return error.code === ErrorCode.PERSISTENCE_CONFLICT && error.details?.pgCode === '23505'
}

/**
 * PostgREST's answer for a column (PGRST204) or table (PGRST205) its schema
 * cache does not hold: the project has not had the migration applied
 * (LIVE-PRE-1). Said explicitly, so a caller keeps its draft and can tell a
 * schema gap from a refused value; nothing is dropped to make the write pass.
 */
const SCHEMA_GAP_CODES = new Set(['PGRST204', 'PGRST205', '42703', '42P01'])

function schemaGap(error: AppError, migration: 'MIG-A' | 'MIG-B'): AppError {
  if (!SCHEMA_GAP_CODES.has(String(error.details?.pgCode))) return error
  return { ...error, details: { ...error.details, reason: 'migration-not-applied', migration } }
}

/**
 * The clients for a build with no Supabase configuration. Every call answers
 * the same typed refusal, so the shell shows its error state rather than the
 * app failing to boot — the precedent `auth-client.ts` set.
 */
export function unconfiguredWorkoutClients(): WorkoutClients {
  const refusal = <T>(): Promise<Result<T>> =>
    Promise.resolve(
      err(
        createError(ErrorCode.VALIDATION_REQUIRED_FIELD, {
          details: { reason: 'missing-configuration' },
        }),
      ),
    )

  return {
    sessions: {
      accept: refusal,
      start: refusal,
      complete: refusal,
      abandon: refusal,
      swap: refusal,
      swapBlock: refusal,
      snapshot: refusal,
      resume: refusal,
      asGenerated: refusal,
      asIntendedAtStart: refusal,
      asPerformed: refusal,
    },
    blockResults: { record: refusal, correct: refusal, recordMovements: refusal },
    history: { page: refusal },
    setLogs: { log: refusal, mutate: refusal },
    exercises: { definition: refusal, saveNotes: refusal },
    conditioning: { history: refusal },
    candidates: { retrieve: refusal },
    anchors: { evidence: refusal, list: refusal, recompute: refusal },
    favorites: {
      list: refusal,
      save: refusal,
      attempt: refusal,
      attempts: refusal,
      recordCompletion: refusal,
      remove: refusal,
    },
  }
}
