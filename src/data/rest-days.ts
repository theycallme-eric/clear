/**
 * HOME-02 — the rest-day read and the rest-day write.
 *
 * The rules are `src/state/rest-days.ts` and the count is still
 * `deriveStreak`; this module is only the transport, and it is the one place in
 * `src/` that touches `rest_days`.
 *
 * Two calls, and each one is shaped by something the schema decided:
 *
 *   * **`recent` is a page, newest first.** The engine walks days backwards from
 *     today and stops at the first day it cannot account for, so the marks that
 *     matter are always the most recent ones. `rest_days_user_day_idx` is
 *     exactly this order, and the bound means a user with four years of marks
 *     does not pay for them on every read.
 *   * **`mark` is an RPC, not an insert.** Marking the same day twice is one row
 *     (`rest_days_one_per_day`), and expressing that through PostgREST would
 *     mean reading first to find out whether the day is already marked — two
 *     round trips with a race between them. `mark_rest_day` is the upsert, and
 *     it takes the owner from `auth.uid()` rather than from the browser.
 */

import {
  ErrorCode,
  createError,
  err,
  isErr,
  ok,
  type Result,
} from '../state/errors'
import {
  parseBoundary,
  restDayPageSchema,
  restDayRowSchema,
  restDayMarkSchema,
  type RestDayMark,
  type RestDayRow,
} from '../state/schemas'
import type { AuthClient } from './auth'
import { createSupabaseClient, type SupabaseClient, type SupabaseConfig } from './supabase'

/**
 * Marks per read. A streak cannot be bridged by a mark older than the oldest
 * session it reaches, so this is far more history than any derivation consumes
 * — and unlike the session page it needs no cursor, because a gap in the marks
 * ends the run rather than continuing it into rows nobody read.
 */
export const REST_DAY_PAGE_SIZE = 200

export interface RestDayClient {
  /** This user's marked days, newest first, bounded. */
  recent(userId: string): Promise<Result<RestDayRow[]>>
  /** Mark one day, or change the reason it is marked for. */
  mark(mark: RestDayMark): Promise<Result<RestDayRow>>
}

export interface RestDayClientConfig {
  /** Read on every request so a refreshed session never leaves a stale token here. */
  readonly auth: Pick<AuthClient, 'getSession'>
  readonly supabase: Omit<SupabaseConfig, 'accessToken'>
}

export function createRestDayClient({
  auth,
  supabase,
}: RestDayClientConfig): RestDayClient {
  const client = async (): Promise<Result<SupabaseClient>> => {
    const session = await auth.getSession()
    if (isErr(session)) return session
    if (session.value === null) {
      return err(createError(ErrorCode.AUTH_UNAUTHENTICATED))
    }

    return ok(
      createSupabaseClient({
        ...supabase,
        accessToken: session.value.accessToken,
      }),
    )
  }

  return {
    async recent(userId) {
      const db = await client()
      return isErr(db) ? db : readRestDays(db.value, userId)
    },

    async mark(mark) {
      // Validated on the way out, against the same bounds the column holds: a
      // note this refuses is a note the database would have refused, and the
      // user hears it before the round trip rather than as a constraint
      // violation after one.
      const parsedMark = restDayMarkSchema.safeParse(mark)
      if (!parsedMark.success) {
        return err(
          createError(ErrorCode.VALIDATION_INVALID_FORMAT, {
            details: { day: mark.day, reason: mark.reason },
          }),
        )
      }

      const db = await client()
      if (isErr(db)) return db

      const result = await db.value.rpc('mark_rest_day', {
        p_day: parsedMark.data.day,
        p_reason: parsedMark.data.reason,
        p_note: parsedMark.data.note,
      })
      if (!result.ok) return result

      return parseBoundary(restDayRowSchema, result.value, {
        code: ErrorCode.PERSISTENCE_WRITE_FAILED,
      })
    },
  }
}

/**
 * The read, over a client somebody else owns. Exported for the same reason the
 * derivation is pure: whoever already holds a transport should not open a
 * second one to ask this question.
 */
export async function readRestDays(
  db: SupabaseClient,
  userId: string,
): Promise<Result<RestDayRow[]>> {
  const result = await db.from('rest_days').select({
    where: { user_id: userId },
    order: [{ column: 'day', ascending: false }],
    limit: REST_DAY_PAGE_SIZE,
  })
  if (!result.ok) return result

  const parsed = parseBoundary(restDayPageSchema, result.value, {
    code: ErrorCode.PERSISTENCE_READ_FAILED,
  })

  return parsed.ok ? ok(parsed.value) : parsed
}
