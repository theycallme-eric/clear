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
 */
import { isErr, ok, err, createError, ErrorCode, type Result } from '../state/errors'
import {
  blockResultInsert,
  type BlockCompletion,
} from '../state/block-completion'
import { blockResultRowSchema, parseBoundary, type BlockResultRow } from '../state/schemas'
import type { AuthClient } from './auth'
import { createHistoryClient, type HistoryClient } from './history'
import { createSessionsClient, type SessionsClient } from './sessions'
import { createSupabaseClient, type SupabaseConfig } from './supabase'

export interface BlockResultsClient {
  /** Writes one `block_results` row and answers it as the database stored it. */
  record(completion: BlockCompletion): Promise<Result<BlockResultRow>>
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

  return { sessions, blockResults, history }
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
    history: { page: refusal },
  }
}
