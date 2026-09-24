/**
 * SES-01c — the streak query.
 *
 * The count itself is `deriveStreak` in `src/state/streak.ts`, which is pure
 * and knows nothing about a database. This module is the other half: it reads
 * the rows that derivation is a function of, and it is the only place in
 * `src/` that asks for them.
 *
 * What it owns, and why each part is here rather than in SQL or in the screen:
 *
 *   * **The time zone, resolved once.** It is read from the platform when the
 *     client is created — not per call, and not per row — so every day
 *     boundary in one session of use is drawn in the same place. Postgres
 *     could have bucketed the days itself, but only the browser knows which
 *     zone to bucket them into, and passing it down per query is the version
 *     of this that ends up with two answers.
 *   * **The page, and the cursor.** A streak has no maximum length, so
 *     `streak_sessions(...)` answers a page and this asks again — but only
 *     when the derived run actually reached the oldest row it was given.
 *     A user who trained yesterday and not before costs one round trip.
 *   * **Nothing else.** No count is cached, no total is written back, and
 *     there is no streak column to write it to. Two tabs agree because they
 *     derive from the same rows, not because something invalidated something.
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
  streakSessionPageSchema,
  type StreakSessionRow,
} from '../state/schemas'
import { deriveStreak, type Streak, type StreakPolicy } from '../state/streak'
import { createSupabaseClient, type SupabaseConfig } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Bounds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rows per read. Comfortably more than a year of daily training, so the second
 * round trip is the rare case rather than the normal one.
 */
export const STREAK_PAGE_SIZE = 200

/**
 * How many pages one derivation will read. A bound rather than a limit on the
 * answer: at five and a half years of unbroken daily sessions the streak
 * returned is the one those rows support, which is not a number anybody is
 * going to dispute, and an unbounded loop against a paginated read is how a
 * screen hangs on a query that should have been one request.
 */
const MAX_PAGES = 10

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export interface StreakClientConfig extends SupabaseConfig {
  /**
   * The user's IANA zone. Omitted means the platform's, read once here — the
   * "resolved once" half of the requirement. A test supplies it; so would a
   * future profile setting, and that is the only change it would need.
   */
  readonly timeZone?: string
}

export interface StreakQueryOptions {
  /** The instant the day boundary is judged against. Defaults to now. */
  readonly now?: Date
  /**
   * HOME-02's rules, when they exist. Passing a policy here is how the pause
   * states and rest-day allowances extend this query rather than replace it:
   * the rows read are the same rows, and the derivation is the same function.
   */
  readonly policy?: StreakPolicy
}

export interface StreakClient {
  /** The user's streak as the stored sessions currently describe it. */
  current(userId: string, options?: StreakQueryOptions): Promise<Result<Streak>>
  /** The zone this client draws day boundaries in, resolved at creation. */
  readonly timeZone: string
}

export function createStreakClient(config: StreakClientConfig): StreakClient {
  const db = createSupabaseClient(config)
  const timeZone = config.timeZone ?? resolveTimeZone()

  return {
    timeZone,

    async current(userId, options = {}) {
      const supported = checkTimeZone(timeZone)
      if (!supported.ok) return supported

      const derivation = { timeZone, now: options.now, policy: options.policy }
      const rows: StreakSessionRow[] = []
      let streak = deriveStreak(rows, derivation)
      let before: string | null = null

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await db.rpc('streak_sessions', {
          p_user_id: userId,
          p_before: before,
          p_limit: STREAK_PAGE_SIZE,
        })
        if (!result.ok) return result

        const parsed = parseBoundary(streakSessionPageSchema, result.value, {
          code: ErrorCode.PERSISTENCE_READ_FAILED,
        })
        if (!parsed.ok) return parsed

        rows.push(...parsed.value)
        streak = deriveStreak(rows, derivation)

        // A short page is the end of the history, and a run that stops before
        // the oldest row read is a run an older row cannot extend. Either way
        // the next request would answer a question already settled.
        if (parsed.value.length < STREAK_PAGE_SIZE || !streak.continuesBeforeOldest) break

        // Rows arrive newest first, so the last one read is the cursor. The
        // function's filter is exclusive, which is what stops a row that sits
        // exactly on the boundary from being read twice.
        before = rows[rows.length - 1].completed_at
      }

      return ok(streak)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The zone
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The platform's zone, or UTC where there is none to read. UTC is the honest
 * fallback rather than a guess at the user's: it is what the timestamps are
 * already stored in, so the days it draws are at least reproducible.
 */
export function resolveTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/**
 * A zone this platform knows, or a typed error. `Intl` throws a `RangeError`
 * for one it does not, and a streak query is not a place for an exception to
 * leave a screen with no state at all — the four-state contract needs an
 * error, not a crash.
 */
function checkTimeZone(timeZone: string): Result<string, AppError> {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return ok(timeZone)
  } catch {
    return err(
      createError(ErrorCode.VALIDATION_INVALID_FORMAT, {
        details: { timeZone, expected: 'an IANA time zone' },
      }),
    )
  }
}
