/**
 * OVR-01a — the anchor queries: read the evidence, write what it supports.
 *
 * Three calls, and the middle one is the requirement:
 *
 *   * **`evidence`** reads `anchor_evidence(...)` — the working sets that are
 *     allowed to move an anchor, already filtered of warmups, deloads, active
 *     recovery and bodyweight by SQL, each carrying the prescribed target from
 *     the prescription row it was logged against.
 *   * **`recompute`** derives the anchors from that evidence
 *     (`src/state/anchors.ts`) and replaces the user's stored set in one
 *     statement. It is a *recomputation*, not an update: the whole history is
 *     read every time, so running it twice writes the same rows and an anchor
 *     the logs no longer support is removed rather than left behind. That is
 *     what makes it safe to call on every completion, including a retry.
 *   * **`list`** reads the stored rows, for the callers OVR-01b will add.
 *
 * Nothing here decides *when* to recompute. `src/data/workout.ts` calls it once
 * a session has completed, because completion is the only event that can change
 * what the evidence says, and a screen that had to remember to ask is a screen
 * that will one day forget.
 *
 * The token is read from the live session per call, as `summary.ts` and
 * `user-data.ts` do and for the same reason: `auth.ts` rotates it, and a client
 * built once would go on presenting the token it was built with.
 */

import {
  createError,
  ErrorCode,
  err,
  isErr,
  ok,
  type Result,
} from '../state/errors'
import { deriveAnchors } from '../state/anchors'
import {
  anchorEvidenceSchema,
  loadAnchorListSchema,
  loadAnchorPayloadSchema,
  parseBoundary,
  type AnchorEvidenceRow,
  type LoadAnchorRow,
} from '../state/schemas'
import type { AuthClient } from './auth'
import {
  createSupabaseClient,
  type SupabaseClient,
  type SupabaseConfig,
} from './supabase'

export interface AnchorsClient {
  /** Every working set in this user's history that may move an anchor. */
  evidence(userId: string): Promise<Result<AnchorEvidenceRow[]>>
  /** The user's stored anchors, as the database holds them. */
  list(userId: string): Promise<Result<LoadAnchorRow[]>>
  /**
   * Derive the anchors this user's logged history supports and make the table
   * equal to them. Answers the rows the database stored, so a caller reads what
   * was written rather than what was sent.
   */
  recompute(userId: string): Promise<Result<LoadAnchorRow[]>>
}

export interface AnchorsClientConfig {
  /** Asked for the access token per call, so a rotated token is never stale. */
  readonly auth: Pick<AuthClient, 'getSession'>
  /** The project, minus the token this module supplies per call. */
  readonly supabase: Omit<SupabaseConfig, 'accessToken'>
}

export function createAnchorsClient({ auth, supabase }: AnchorsClientConfig): AnchorsClient {
  const client = async (): Promise<Result<SupabaseClient>> => {
    const session = await auth.getSession()
    if (isErr(session)) return session
    if (session.value === null) {
      // Owner-only RLS refuses an anonymous request on every table this
      // touches, so this says so rather than spending a round trip to be told.
      return err(createError(ErrorCode.AUTH_UNAUTHENTICATED))
    }

    return ok(
      createSupabaseClient({ ...supabase, accessToken: session.value.accessToken }),
    )
  }

  const evidenceFor = async (
    supa: SupabaseClient,
    userId: string,
  ): Promise<Result<AnchorEvidenceRow[]>> => {
    const rows = await supa.rpc('anchor_evidence', { p_user_id: userId })
    if (isErr(rows)) return rows

    return parseBoundary(anchorEvidenceSchema, rows.value, {
      code: ErrorCode.PERSISTENCE_READ_FAILED,
    })
  }

  return {
    async evidence(userId) {
      const supa = await client()
      return isErr(supa) ? supa : evidenceFor(supa.value, userId)
    },

    async list(userId) {
      const supa = await client()
      if (isErr(supa)) return supa

      const rows = await supa.value.from('load_anchors').select({
        // RLS has already narrowed this to the caller; the filter states what
        // the read means rather than being what makes it safe.
        where: { user_id: userId },
        order: [
          { column: 'exercise_id' },
          { column: 'equipment_used' },
        ],
      })
      if (isErr(rows)) return rows

      return parseBoundary(loadAnchorListSchema, rows.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
    },

    async recompute(userId) {
      const supa = await client()
      if (isErr(supa)) return supa

      const evidence = await evidenceFor(supa.value, userId)
      if (isErr(evidence)) return evidence

      // Parsed before it is sent: `load_anchors`' CHECK constraints would
      // refuse the same values, and a constraint violation crossing PostgREST
      // is a message no caller can say anything useful about.
      const payload = parseBoundary(loadAnchorPayloadSchema, deriveAnchors(evidence.value))
      if (isErr(payload)) return payload

      const stored = await supa.value.rpc('set_load_anchors', {
        p_user_id: userId,
        p_anchors: payload.value,
      })
      if (isErr(stored)) return stored

      return parseBoundary(loadAnchorListSchema, stored.value, {
        code: ErrorCode.PERSISTENCE_WRITE_FAILED,
      })
    },
  }
}
