/**
 * SUM-01 — the debrief's reads and its one write.
 *
 * The Summary screen asks three questions and this module is where all three
 * are asked. None of them is new machinery: the session a debrief is about is
 * a row in `workout_sessions`, the streak is SES-01c's query over SES-01's
 * derivation, and the write is two columns on the row that is already there.
 *
 *   * **`latest`** answers the session the debrief is about. It is found
 *     through `streak_sessions(...)` rather than by ordering the table,
 *     because "most recently completed" is exactly the question that function
 *     already answers — `completed_at is not null`, newest first, under the
 *     caller's own RLS — and PostgREST's `order` has no way to say
 *     `nulls last`, so a plain `completed_at desc` would hand back a session
 *     that has not finished. Asking for one row is what makes it a different
 *     question from the streak's, not a copy of it.
 *   * **`streak`** is `createStreakClient(...).current(...)`, unchanged. The
 *     count is derived in exactly one place in this app and this is not it.
 *   * **`saveDebrief`** updates `mood` and `session_notes` and returns the
 *     row the database now holds, so the screen renders what was stored
 *     rather than what it sent. `workout_sessions_update_own` is the only
 *     authorization involved: the id is a filter, never a permission.
 *
 * A token is read from the live session per call, like `user-data.ts` and for
 * the same reason — `auth.ts` rotates it, and a client built once would go on
 * presenting the token it was built with.
 */

import {
  createError,
  ErrorCode,
  err,
  isErr,
  ok,
  type Result,
} from '../state/errors'
import {
  parseBoundary,
  sessionDebriefSchema,
  streakSessionPageSchema,
  workoutSessionRowSchema,
  type SessionDebrief,
  type WorkoutSessionRow,
} from '../state/schemas'
import type { Streak } from '../state/streak'
import type { AuthClient } from './auth'
import {
  createStreakClient,
  resolveTimeZone,
  type StreakQueryOptions,
} from './streak'
import {
  createSupabaseClient,
  type SupabaseClient,
  type SupabaseConfig,
} from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A finished session, with the one number the debrief states that no single
 * column reliably holds.
 *
 * `actual_duration_mins` is written by `complete_session` for every completion,
 * but the column is nullable and a screen that trusted it would print nothing
 * for a row written before that function existed. So the elapsed time between
 * the two lifecycle timestamps is the fallback, and `null` — no start, no
 * finish, nothing to measure — is an answer the screen is expected to handle
 * rather than a case it can assume away.
 */
export interface CompletedSession {
  readonly session: WorkoutSessionRow
  /** Whole minutes the session took, or `null` when nothing can say. */
  readonly durationMins: number | null
}

export interface SummaryClient {
  /** The user's most recently completed session, or `null` when they have none. */
  latest(userId: string): Promise<Result<CompletedSession | null>>
  /** SES-01c's streak, derived from the same rows Home will derive it from. */
  streak(userId: string, options?: StreakQueryOptions): Promise<Result<Streak>>
  /** Persist the debrief to the session row and answer the stored result. */
  saveDebrief(
    sessionId: string,
    debrief: SessionDebrief,
  ): Promise<Result<CompletedSession>>
}

export interface SummaryConfig {
  /** Asked for the access token per call, so a rotated token is never stale. */
  readonly auth: Pick<AuthClient, 'getSession'>
  /** The project, minus the token this module supplies per call. */
  readonly supabase: Omit<SupabaseConfig, 'accessToken'>
  /** The user's IANA zone. Resolved once here when omitted, as SES-01c has it. */
  readonly timeZone?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export function createSummaryClient({
  auth,
  supabase,
  timeZone,
}: SummaryConfig): SummaryClient {
  // Resolved once per client rather than once per call: every day boundary in
  // one session of use has to be drawn in the same place (SES-01c).
  const zone = timeZone ?? resolveTimeZone()

  const token = async (): Promise<Result<string>> => {
    const session = await auth.getSession()
    if (isErr(session)) return session
    if (session.value === null) {
      // Every policy on `workout_sessions` refuses an anonymous request, so
      // this says so rather than spending a round trip to be told.
      return err(createError(ErrorCode.AUTH_UNAUTHENTICATED))
    }
    return ok(session.value.accessToken)
  }

  const client = async (): Promise<Result<SupabaseClient>> => {
    const accessToken = await token()
    if (isErr(accessToken)) return accessToken
    return ok(createSupabaseClient({ ...supabase, accessToken: accessToken.value }))
  }

  /** The row for an id the caller may read, or `not found`. */
  const sessionById = async (
    supa: SupabaseClient,
    sessionId: string,
  ): Promise<Result<WorkoutSessionRow>> => {
    const rows = await supa.from('workout_sessions').select({
      where: { id: sessionId },
      limit: 1,
    })
    if (isErr(rows)) return rows

    const [row] = rows.value
    if (row === undefined) {
      // RLS filters the row before this read sees it, so somebody else's
      // session and a session that does not exist answer identically.
      return err(createError(ErrorCode.PERSISTENCE_NOT_FOUND, {
        details: { table: 'workout_sessions' },
      }))
    }

    return parseBoundary(workoutSessionRowSchema, row, {
      code: ErrorCode.PERSISTENCE_READ_FAILED,
    })
  }

  return {
    async latest(userId) {
      const supa = await client()
      if (isErr(supa)) return supa

      const page = await supa.value.rpc('streak_sessions', {
        p_user_id: userId,
        p_before: null,
        p_limit: 1,
      })
      if (isErr(page)) return page

      const parsed = parseBoundary(streakSessionPageSchema, page.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
      if (isErr(parsed)) return parsed

      const [newest] = parsed.value
      // Nobody has finished a workout yet. An answer, not a failure — the
      // screen reads it as "there is nothing to debrief" and leaves.
      if (newest === undefined) return ok(null)

      const session = await sessionById(supa.value, newest.session_id)
      if (isErr(session)) return session

      return ok(completed(session.value))
    },

    async streak(userId, options) {
      const accessToken = await token()
      if (isErr(accessToken)) return accessToken

      // SES-01c's client, built per call around the live token and the zone
      // this client resolved. Its paging, its cursor and its derivation — a
      // second implementation of a streak is the thing that requirement
      // exists to prevent.
      return createStreakClient({
        ...supabase,
        accessToken: accessToken.value,
        timeZone: zone,
      }).current(userId, options)
    },

    async saveDebrief(sessionId, debrief) {
      // Parsed before it is sent: `workout_sessions_mood_range` would refuse
      // the same value, and a CHECK violation crossing PostgREST is a message
      // no screen can say anything useful about.
      const payload = parseBoundary(sessionDebriefSchema, debrief)
      if (isErr(payload)) return payload

      const supa = await client()
      if (isErr(supa)) return supa

      const rows = await supa.value
        .from('workout_sessions')
        .update(payload.value, { id: sessionId })
      if (isErr(rows)) return rows

      const [row] = rows.value
      if (row === undefined) {
        return err(createError(ErrorCode.PERSISTENCE_NOT_FOUND, {
          details: { table: 'workout_sessions' },
        }))
      }

      const session = parseBoundary(workoutSessionRowSchema, row, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
      if (isErr(session)) return session

      return ok(completed(session.value))
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration
// ─────────────────────────────────────────────────────────────────────────────

/** The row, plus the duration the debrief states. */
function completed(session: WorkoutSessionRow): CompletedSession {
  return { session, durationMins: durationOf(session) }
}

/**
 * Whole minutes, rounded up the way `complete_session` rounds them, so the
 * fallback and the stored column never disagree by a minute for the same
 * session. A workout that finished in the same minute it started is `0`, which
 * is a duration; `null` is the absence of one.
 */
export function durationOf(session: WorkoutSessionRow): number | null {
  if (session.actual_duration_mins !== null) return session.actual_duration_mins
  if (session.started_at === null || session.completed_at === null) return null

  const elapsedMs =
    Date.parse(session.completed_at) - Date.parse(session.started_at)
  if (Number.isNaN(elapsedMs)) return null

  return Math.max(0, Math.ceil(elapsedMs / 60_000))
}
