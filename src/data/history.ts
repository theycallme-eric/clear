/**
 * HIST-01 — the history read, in one place.
 *
 * "Queries exported from a shared module, not screen-local" is an acceptance
 * criterion rather than a preference, and this is the module it names: the
 * History screen reads through it, HOME-01's recent workouts will read through
 * it, and neither of them builds a query of its own. The React half is
 * `src/state/history-queries.ts`; what a row *means* is `src/state/history.ts`.
 *
 * What it owns:
 *
 *   * **The order.** `date` descending, then `created_at` descending, so two
 *     workouts on one day come back in the order they were lived in and a page
 *     boundary lands in the same place every time. An offset into an unordered
 *     read is an offset into a different answer.
 *   * **The bound.** Every read is a page. `hasMore` is answered by asking for
 *     one row more than the page and throwing it away — a count header would be
 *     a second round trip to learn something the rows already said.
 *   * **Nothing else.** Rest days are not read because they are not rows
 *     (`workout_sessions` cannot hold one), and status is not filtered in SQL
 *     because no column stores it — both are derivations, and they live in
 *     `src/state/history.ts` where a screen and a test can see them.
 *
 * RLS is the boundary, as everywhere else: the policy on `workout_sessions` is
 * owner-only, so the `user_id` filter here narrows a result the database has
 * already narrowed. It is stated anyway, because a read that depends on a
 * policy for its *meaning* rather than for its safety is one migration away
 * from being wrong quietly.
 */

import { ErrorCode, isErr, ok, type Result } from '../state/errors'
import {
  parseBoundary,
  workoutSessionListSchema,
  type WorkoutSessionRow,
} from '../state/schemas'
import { createSupabaseClient, type SupabaseConfig } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Bounds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sessions per page. Enough that a regular trainer sees a month of history
 * without asking for more, small enough that the first screen is one small
 * request rather than a year of rows nobody scrolled to.
 */
export const HISTORY_PAGE_SIZE = 20

// ─────────────────────────────────────────────────────────────────────────────
// Domain
// ─────────────────────────────────────────────────────────────────────────────

export interface HistoryPage {
  /** Newest first. The rows themselves, as the database stores them. */
  readonly sessions: readonly WorkoutSessionRow[]
  /** Whether at least one older session exists beyond this page. */
  readonly hasMore: boolean
}

export interface HistoryPageQuery {
  /** Rows to return. Defaults to `HISTORY_PAGE_SIZE`. */
  readonly limit?: number
  /** Rows to skip. Defaults to none. */
  readonly offset?: number
}

export interface HistoryClient {
  /** A page of the user's sessions, newest first. */
  page(userId: string, query?: HistoryPageQuery): Promise<Result<HistoryPage>>
}

/** The shared client's configuration; this module adds nothing to it. */
export type HistoryClientConfig = SupabaseConfig

export function createHistoryClient(config: HistoryClientConfig): HistoryClient {
  const db = createSupabaseClient(config)

  return {
    async page(userId, query = {}) {
      const limit = query.limit ?? HISTORY_PAGE_SIZE
      const offset = query.offset ?? 0

      const rows = await db.from('workout_sessions').select({
        where: { user_id: userId },
        order: [
          { column: 'date', ascending: false },
          { column: 'created_at', ascending: false },
        ],
        // One row past the page: its presence is the whole of `hasMore`, and
        // it is never shown.
        limit: limit + 1,
        offset,
      })
      if (isErr(rows)) return rows

      const parsed = parseBoundary(workoutSessionListSchema, rows.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
      if (isErr(parsed)) return parsed

      return ok({
        sessions: parsed.value.slice(0, limit),
        hasMore: parsed.value.length > limit,
      })
    },
  }
}
