/**
 * SES-01a — the session lifecycle, read and written.
 *
 * The lifecycle itself is SQL, in
 * `supabase/migrations/20260921000005_session_lifecycle.sql`: acceptance is one
 * transaction, the transitions are functions that answer with an outcome, and
 * the one-active-session invariant is a partial unique index. This module is
 * the only way `src/` asks for any of it, and what it owns is the translation
 * in both directions.
 *
 *   * **Out:** the acceptance payload is parsed by `sessionAcceptanceSchema`
 *     before it is sent. CORE-03's rule is that anything which validates can be
 *     persisted, so a workout that fails here never reaches a transaction it
 *     would have aborted halfway through.
 *   * **Back:** an outcome becomes a typed `AppError`. `already_active` is
 *     `SESSION_ALREADY_ACTIVE` and names the session that is running;
 *     `invalid_transition` is `SESSION_INVALID_TRANSITION` and names the state
 *     it was refused from. Neither is a 400 with a Postgres message in it,
 *     which is the entire reason the functions return rather than raise.
 *
 * The race, explicitly. Two starts can pass the function's own check at the
 * same instant; only one can pass the unique index. The loser is caught inside
 * the function and answered `already_active`, and if it somehow reaches the
 * transport instead, a 409 on this one call is read as the same typed error.
 * A caller cannot tell the two paths apart, which is what "a typed error, not
 * a race" has to mean.
 *
 * No state is held here. Every answer is derived from the row that came back,
 * so a second tab, a refresh and a reinstall agree by construction rather than
 * by invalidation.
 */

import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../state/errors'
import {
  parseBoundary,
  sessionAcceptanceSchema,
  sessionSnapshotSchema,
  sessionTransitionSchema,
  workoutExerciseRowSchema,
  type Prescription,
  type SessionAcceptance,
  type SessionSnapshot,
  type SessionTransition,
  type WorkoutExerciseRow,
  type WorkoutSessionRow,
} from '../state/schemas'
import { sessionStateOf, type SessionEvent, type SessionState } from '../state/session-machine'
import { createSupabaseClient, type SupabaseConfig } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A session after a transition: the row, and the state it now derives to.
 *
 * The row is kept as the database's own shape rather than transcribed into
 * camelCase. `src/data/constraints.ts` maps, because its domain type is a
 * genuinely different shape — a discriminated target where the table has three
 * nullable columns. Here the shapes are the same shape, and a second
 * declaration of twenty-six columns is two things to keep in step for no
 * reader's benefit. What this module adds is the state, which the row does not
 * carry because no column stores it.
 */
export interface SessionResult {
  readonly session: WorkoutSessionRow
  readonly state: SessionState
}

/** A swap's two rows: what is prescribed now, and what it replaced. */
export interface SwapResult {
  readonly exercise: WorkoutExerciseRow
  readonly superseded: WorkoutExerciseRow
}

/** The shared client's configuration; this module adds nothing to it. */
export type SessionsClientConfig = SupabaseConfig

export interface SessionsClient {
  /**
   * Accept a composed workout: session, sections, blocks and exercises in one
   * transaction. Answers the persisted structure, so the caller renders what
   * the database holds rather than what it hoped was written.
   */
  accept(userId: string, acceptance: SessionAcceptance): Promise<Result<SessionSnapshot>>
  /** `prescribed → active`, for the one session a user may have running. */
  start(sessionId: string): Promise<Result<SessionResult>>
  /**
   * `active → completed`, writing `completed_at` and `actual_duration_mins`.
   * The duration is optional: the database measures elapsed time from
   * `started_at`, and only a caller that tracked pauses knows better.
   */
  complete(sessionId: string, actualDurationMins?: number): Promise<Result<SessionResult>>
  /** `prescribed | active → abandoned`. Nothing is deleted. */
  abandon(sessionId: string): Promise<Result<SessionResult>>
  /**
   * Replace one prescription with another in the same slot. The outgoing row
   * is superseded, not mutated, and keeps its own `execution_status`.
   */
  swap(workoutExerciseId: string, prescription: Prescription): Promise<Result<SwapResult>>
  /** A session as it currently stands, with the sets already logged. */
  snapshot(sessionId: string): Promise<Result<SessionSnapshot>>
  /**
   * The user's resumable session, or `null` when there is none. `null` is an
   * answer, not a failure: most of the time nobody is mid-workout.
   */
  resume(userId: string): Promise<Result<SessionSnapshot | null>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export function createSessionsClient(config: SessionsClientConfig): SessionsClient {
  const db = createSupabaseClient(config)

  /** A transition call, from the RPC through to a typed result. */
  const transitionCall = async (
    payload: Result<unknown>,
    event: SessionEvent,
  ): Promise<Result<SessionResult>> => {
    if (!payload.ok) return payload

    const parsed = parseBoundary(sessionTransitionSchema, payload.value, {
      code: ErrorCode.PERSISTENCE_READ_FAILED,
    })
    if (!parsed.ok) return parsed

    const refused = refusal(parsed.value, event)
    if (refused !== null) return err(refused)

    // Every non-refusal outcome carries its session. A payload that does not
    // is a function that changed shape without this module hearing about it.
    const session = parsed.value.session
    if (session === null || session === undefined) {
      return err(malformed({ outcome: parsed.value.outcome, session: 'missing' }))
    }

    return ok({ session, state: sessionStateOf(session) })
  }

  return {
    async accept(userId, acceptance) {
      // Parsed here rather than trusted: the alternative is a CHECK constraint
      // aborting a transaction that has already written half a workout, which
      // is correct but says nothing a user or a log can act on.
      const payload = parseBoundary(sessionAcceptanceSchema, acceptance)
      if (!payload.ok) return payload

      const result = await db.rpc('persist_session', {
        p_user_id: userId,
        p_session: payload.value,
      })
      if (!result.ok) return result

      return parseSnapshot(result.value)
    },

    async start(sessionId) {
      const result = await db.rpc('start_session', { p_session_id: sessionId })

      // The index caught what the function's own check could not: a start that
      // lost a race arrives as a conflict, and it means the same thing.
      if (!result.ok && result.error.code === ErrorCode.PERSISTENCE_CONFLICT) {
        return err(
          createError(ErrorCode.SESSION_ALREADY_ACTIVE, {
            details: { sessionId, ...result.error.details },
          }),
        )
      }

      return transitionCall(result, 'start')
    },

    async complete(sessionId, actualDurationMins) {
      return transitionCall(
        await db.rpc('complete_session', {
          p_session_id: sessionId,
          // Omitted is not zero: the database measures the elapsed time
          // itself, and zero would record a workout that took no time at all.
          p_actual_duration_mins: actualDurationMins ?? null,
        }),
        'complete',
      )
    },

    async abandon(sessionId) {
      return transitionCall(
        await db.rpc('abandon_session', { p_session_id: sessionId }),
        'abandon',
      )
    },

    async swap(workoutExerciseId, prescription) {
      const result = await db.rpc('swap_session_exercise', {
        p_workout_exercise_id: workoutExerciseId,
        p_prescription: prescription,
      })
      if (!result.ok) return result

      const parsed = parseBoundary(sessionTransitionSchema, result.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
      if (!parsed.ok) return parsed

      const refused = refusal(parsed.value, 'swap')
      if (refused !== null) return err(refused)

      const exercise = workoutExerciseRowSchema.safeParse(parsed.value.exercise)
      const superseded = workoutExerciseRowSchema.safeParse(parsed.value.superseded)
      if (!exercise.success || !superseded.success) {
        return err(malformed({ outcome: parsed.value.outcome, exercise: 'missing' }))
      }

      return ok({ exercise: exercise.data, superseded: superseded.data })
    },

    async snapshot(sessionId) {
      const result = await db.rpc('session_snapshot', { p_session_id: sessionId })
      if (!result.ok) return result

      return parseSnapshot(result.value)
    },

    async resume(userId) {
      const result = await db.rpc('resume_session', { p_user_id: userId })
      if (!result.ok) return result

      // Nobody mid-workout. A SQL NULL arrives as JSON null, and reading it as
      // "no session" rather than as a failed read is what keeps Home quiet.
      if (result.value === null) return ok(null)

      return parseSnapshot(result.value)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Outcomes → the error taxonomy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The refusal an outcome names, or `null` when the call succeeded. A swap is
 * an event here even though it is not one the state machine has: it is refused
 * by the same three outcomes, and `details.event` is what tells a log which
 * call was turned down.
 */
function refusal(
  payload: SessionTransition,
  event: SessionEvent | 'swap',
): AppError | null {
  switch (payload.outcome) {
    case 'not_found':
      // Somebody else's session and a session that does not exist answer
      // identically, because RLS filtered the row before the function saw it.
      // That is the honest answer to both, and the one that leaks nothing.
      return createError(ErrorCode.PERSISTENCE_NOT_FOUND, { details: { event } })

    case 'already_active':
      return createError(ErrorCode.SESSION_ALREADY_ACTIVE, {
        details: { event, activeSessionId: payload.active_session_id ?? null },
      })

    case 'invalid_transition':
      return createError(ErrorCode.SESSION_INVALID_TRANSITION, {
        details: { event: payload.event ?? event, from: payload.state ?? null },
      })

    default:
      return null
  }
}

function parseSnapshot(payload: unknown): Result<SessionSnapshot> {
  if (payload === null) {
    // `session_snapshot` answers SQL NULL for a session that is not there and
    // for one the caller may not read. Both are "not found".
    return err(createError(ErrorCode.PERSISTENCE_NOT_FOUND))
  }

  return parseBoundary(sessionSnapshotSchema, payload, {
    code: ErrorCode.PERSISTENCE_READ_FAILED,
  })
}

function malformed(details: Record<string, unknown>): AppError {
  return createError(ErrorCode.PERSISTENCE_READ_FAILED, { details })
}
