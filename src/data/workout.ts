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
import { isErr, ok, err, createError, ErrorCode, type Result } from '../state/errors'
import {
  blockResultInsert,
  isPerceivedEffort,
  PERCEIVED_EFFORT_MAX,
  PERCEIVED_EFFORT_MIN,
  type BlockCompletion,
} from '../state/block-completion'
import { setLogInsert, setLogViolation, type SetLogEntry } from '../state/set-logging'
import {
  blockResultRowSchema,
  exerciseSetLogRowSchema,
  parseBoundary,
  type BlockResultRow,
  type ExerciseSetLogRow,
} from '../state/schemas'
import type { AuthClient } from './auth'
import { createSessionsClient, type SessionsClient } from './sessions'
import { createSupabaseClient, type SupabaseConfig } from './supabase'

export interface BlockResultsClient {
  /**
   * Writes one `block_results` row and answers it as the database stored it.
   * An effort outside 1–10 is refused before anything is sent.
   */
  record(completion: BlockCompletion): Promise<Result<BlockResultRow>>
}

export interface SetLogsClient {
  /**
   * Writes one `exercise_set_logs` row and answers it as the database stored
   * it. A measurement the CHECK constraints would refuse — a negative weight,
   * an RPE outside 1–10, a distance with no unit — is refused before anything
   * is sent.
   */
  log(entry: SetLogEntry): Promise<Result<ExerciseSetLogRow>>
}

export interface WorkoutClients {
  /** SES-01a's lifecycle, carrying the live token. */
  readonly sessions: SessionsClient
  readonly blockResults: BlockResultsClient
  readonly setLogs: SetLogsClient
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
      return isErr(client) ? client : client.value.complete(sessionId, actualDurationMins)
    },
    async abandon(sessionId) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.abandon(sessionId)
    },
    async swap(workoutExerciseId, prescription) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.swap(workoutExerciseId, prescription)
    },
    async snapshot(sessionId) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.snapshot(sessionId)
    },
    async resume(userId) {
      const client = await sessionsFor()
      return isErr(client) ? client : client.value.resume(userId)
    },
  }

  const blockResults: BlockResultsClient = {
    async record(completion) {
      // The range is the database's (`block_results_perceived_effort_range`),
      // and it is checked here because this is the one path every structure
      // type writes through: whatever control a renderer grows, an effort
      // outside 1–10 is refused in the caller's own vocabulary rather than as
      // a 400 nobody can act on.
      if (!isPerceivedEffort(completion.perceivedEffort)) {
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
      if (isErr(rows)) return rows

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
  }

  return { sessions, blockResults, setLogs }
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
      snapshot: refusal,
      resume: refusal,
    },
    blockResults: { record: refusal },
    setLogs: { log: refusal },
  }
}
