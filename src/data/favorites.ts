/**
 * FAV-01 — favorites, read and written.
 *
 * Four verbs and one rule: everything that changes a favorite's progression
 * goes through SQL (`supabase/migrations/20260921000014_saved_workouts.sql`),
 * and everything that only reads or removes one is a plain typed table call.
 *
 *   * **`save`** is `save_favorite`, because saving a completed workout writes
 *     two rows — the favorite and the attempt that session already is — and a
 *     client that wrote them in two calls could leave a favorite claiming a
 *     completion it has no record of.
 *   * **`list`** is the favorites tab's read, newest first. An empty list is
 *     an answer.
 *   * **`attempt`** is the link a restart writes before the session starts. It
 *     is an insert rather than a function: the row is two ids, and both
 *     policies check the caller owns what the row names.
 *   * **`recordCompletion`** is `record_favorite_completion`, asked of every
 *     completed session rather than only the ones known to have come from a
 *     favorite. `not_a_favorite` is the ordinary answer and not a failure,
 *     which is what lets the completion path stay free of provenance
 *     bookkeeping.
 *   * **`remove`** is a delete. The cascade takes the attempts with it, which
 *     is the hard delete favorites-v2.md §"Removing from Favorites" resolved
 *     on; the sessions themselves stay in history.
 *
 * No state is held here, and no snapshot is interpreted here: what a snapshot
 * means for a given `snapshot_contract_version` is `src/state/favorites.ts`'s,
 * so the transport cannot start reading a document it has no version for.
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
  favoriteResultSchema,
  parseBoundary,
  savedWorkoutDraftSchema,
  savedWorkoutListSchema,
  savedWorkoutRowSchema,
  type FavoriteResult,
  type SavedWorkoutDraft,
  type SavedWorkoutRow,
} from '../state/schemas'
import { createSupabaseClient, type SupabaseConfig } from './supabase'

/** The shared client's configuration; this module adds nothing to it. */
export type FavoritesClientConfig = SupabaseConfig

export interface FavoritesClient {
  /** Every favorite this user keeps, newest first. */
  list(userId: string): Promise<Result<readonly SavedWorkoutRow[]>>
  /**
   * Save a completed workout as a favorite. That session counts as the first
   * completion (favorites-v2 §Resolved Decisions 1), and re-saving one already
   * favorited answers the row that is already there.
   */
  save(userId: string, draft: SavedWorkoutDraft): Promise<Result<SavedWorkoutRow>>
  /** Record that `sessionId` is an attempt at `savedWorkoutId`. */
  attempt(savedWorkoutId: string, sessionId: string): Promise<Result<void>>
  /**
   * Stamp the attempt a completed session belongs to and recompute the
   * favorite's counters. Answers the outcome, which may be `not_a_favorite`.
   */
  recordCompletion(sessionId: string): Promise<Result<FavoriteResult>>
  /** Unfavorite: the row and, by cascade, its progression. */
  remove(savedWorkoutId: string): Promise<Result<void>>
}

export function createFavoritesClient(config: FavoritesClientConfig): FavoritesClient {
  const db = createSupabaseClient(config)

  return {
    async list(userId) {
      const rows = await db.from('saved_workouts').select({
        where: { user_id: userId },
        order: [{ column: 'created_at', ascending: false }],
      })
      if (isErr(rows)) return rows

      return parseBoundary(savedWorkoutListSchema, rows.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
    },

    async save(userId, draft) {
      // Parsed before it is sent, like every other write that becomes a
      // transaction: the bounds here are the table's own CHECK constraints,
      // and a snapshot that does not parse is one nothing could restore.
      const payload = parseBoundary(savedWorkoutDraftSchema, draft)
      if (isErr(payload)) return payload

      const answer = await db.rpc('save_favorite', {
        p_user_id: userId,
        p_favorite: payload.value,
      })
      if (isErr(answer)) return answer

      const parsed = parseBoundary(favoriteResultSchema, answer.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
      if (isErr(parsed)) return parsed

      if (parsed.value.outcome === 'session_not_found') {
        // RLS filters somebody else's session before the function reads it, so
        // "not yours" and "not there" are the same answer and both are this.
        return err(
          createError(ErrorCode.PERSISTENCE_NOT_FOUND, {
            details: { table: 'workout_sessions' },
          }),
        )
      }

      const favorite = parsed.value.favorite
      if (favorite === null || favorite === undefined) {
        return err(
          createError(ErrorCode.PERSISTENCE_WRITE_FAILED, {
            details: { outcome: parsed.value.outcome, favorite: 'missing' },
          }),
        )
      }

      return ok(favorite)
    },

    async attempt(savedWorkoutId, sessionId) {
      const rows = await db.from('saved_workout_completions').insert({
        saved_workout_id: savedWorkoutId,
        session_id: sessionId,
      })
      if (isErr(rows)) {
        // The unique index caught a second start of the same session — the
        // attempt is already recorded, which is what the caller wanted.
        if (rows.error.code === ErrorCode.PERSISTENCE_CONFLICT) return ok(undefined)
        return rows
      }

      return ok(undefined)
    },

    async recordCompletion(sessionId) {
      const answer = await db.rpc('record_favorite_completion', {
        p_session_id: sessionId,
      })
      if (isErr(answer)) return answer

      return parseBoundary(favoriteResultSchema, answer.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
    },

    async remove(savedWorkoutId) {
      return db.from('saved_workouts').delete({ id: savedWorkoutId })
    },
  }
}
