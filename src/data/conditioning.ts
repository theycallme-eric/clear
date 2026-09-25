/**
 * OVR-03 — the conditioning read, and only the read.
 *
 * One call. `conditioning_history(...)` answers the user's scored conditioning
 * blocks, newest first, each carrying its active prescriptions and its session's
 * intensity — and there is nothing to write back, because §3's score is derived
 * rather than stored (`src/state/conditioning.ts` says why at length). So this
 * file is the narrowest client in `src/data`: a token, an RPC, a parse.
 *
 * It is built like `anchors.ts` and for the same reason — the token is read from
 * the live session per call, since `auth.ts` rotates it and a client built once
 * would go on presenting the token it was built with.
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
  conditioningHistorySchema,
  parseBoundary,
  type ConditioningHistoryRow,
} from '../state/schemas'
import type { AuthClient } from './auth'
import {
  createSupabaseClient,
  type SupabaseClient,
  type SupabaseConfig,
} from './supabase'

export interface ConditioningClient {
  /**
   * The user's scored conditioning blocks, newest first.
   *
   * `limit` is the function's own bound left alone by default: the two consumers
   * want different windows — three sections for the density read, as much
   * history as there is for a like-for-like comparison — and one read serves
   * both rather than two requests disagreeing about what "recent" means.
   */
  history(userId: string, limit?: number): Promise<Result<ConditioningHistoryRow[]>>
}

export interface ConditioningClientConfig {
  /** Asked for the access token per call, so a rotated token is never stale. */
  readonly auth: Pick<AuthClient, 'getSession'>
  /** The project, minus the token this module supplies per call. */
  readonly supabase: Omit<SupabaseConfig, 'accessToken'>
}

export function createConditioningClient({
  auth,
  supabase,
}: ConditioningClientConfig): ConditioningClient {
  const client = async (): Promise<Result<SupabaseClient>> => {
    const session = await auth.getSession()
    if (isErr(session)) return session
    if (session.value === null) {
      // Owner-only RLS refuses an anonymous request on every table this reads,
      // so this says so rather than spending a round trip to be told.
      return err(createError(ErrorCode.AUTH_UNAUTHENTICATED))
    }

    return ok(createSupabaseClient({ ...supabase, accessToken: session.value.accessToken }))
  }

  return {
    async history(userId, limit) {
      const supa = await client()
      if (isErr(supa)) return supa

      const rows = await supa.value.rpc('conditioning_history', {
        p_user_id: userId,
        // Omitted rather than sent as null when the caller named no window: the
        // default belongs to the function, which is where it is documented.
        ...(limit === undefined ? {} : { p_limit: limit }),
      })
      if (isErr(rows)) return rows

      return parseBoundary(conditioningHistorySchema, rows.value, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
    },
  }
}
