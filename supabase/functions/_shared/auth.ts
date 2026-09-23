/**
 * GEN-01 — bearer token verification for the edge envelope.
 *
 * The envelope does not trust a JWT because it parses: it asks GoTrue, over the
 * same `fetch`-and-nothing-else transport AUTH-01 chose in `src/data/auth.ts`,
 * and believes the answer. A signature check done locally would need the
 * project's JWT secret inside the function, which is one more secret than this
 * needs — `GET /auth/v1/user` already refuses an expired, revoked, or forged
 * token, and a revoked token is the case a local check silently gets wrong.
 *
 * Two failure kinds, and keeping them apart is the point:
 *
 *   * GoTrue *refused* the token → `AUTH_UNAUTHENTICATED`, a 401, and the
 *     caller is asked to sign in.
 *   * GoTrue could not be *reached*, or answered with something else →
 *     `NETWORK_SERVER_ERROR`, a 500, and nobody is signed out because of an
 *     outage. That confusion is the shape of defect D1, one layer down.
 *
 * The token is never logged and never returned; only the user id leaves here.
 */

import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../../../src/state/errors.ts'
import type { EnvelopeUser, VerifyToken } from './envelope.ts'

export interface TokenVerifierConfig {
  /** The project URL — `SUPABASE_URL`, injected into every edge function. */
  readonly url: string
  /**
   * The public anon key — `SUPABASE_ANON_KEY`, also injected. The gateway wants
   * it on the request; it grants nothing on its own, because row-level security
   * is the boundary. The service-role key is never used here: this call asks
   * who the caller is, and a key that can answer as anyone cannot.
   */
  readonly anonKey: string
  /** Injected in tests; the global `fetch` otherwise. */
  readonly fetch?: typeof globalThis.fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Narrows GoTrue's user payload by hand rather than with a schema: CORE-03's
 * schemas are the contracts *this project* defines, and a second zod schema
 * under `supabase/functions/` is exactly what `src/state/schemas.test.ts`
 * forbids. `src/data/auth.ts` reads the same payload the same way.
 */
function userFromPayload(payload: unknown): EnvelopeUser | null {
  if (!isRecord(payload)) return null
  if (typeof payload.id !== 'string' || payload.id === '') return null

  return { id: payload.id }
}

export function createTokenVerifier(config: TokenVerifierConfig): VerifyToken {
  const endpoint = `${config.url.replace(/\/+$/, '')}/auth/v1/user`
  const fetchImpl = config.fetch ?? globalThis.fetch

  return async function verifyToken(
    token: string,
    requestId: string,
  ): Promise<Result<EnvelopeUser, AppError>> {
    let response: Response
    try {
      response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
      })
    } catch {
      // Deliberately not the thrown error's message: a transport error can
      // quote the request it failed on, headers and all.
      return err(createError(ErrorCode.NETWORK_SERVER_ERROR, { requestId }))
    }

    if (response.status === 401 || response.status === 403) {
      return err(createError(ErrorCode.AUTH_UNAUTHENTICATED, { requestId }))
    }

    if (!response.ok) {
      return err(
        createError(ErrorCode.NETWORK_SERVER_ERROR, {
          requestId,
          details: { status: response.status },
        }),
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return err(createError(ErrorCode.NETWORK_SERVER_ERROR, { requestId }))
    }

    const user = userFromPayload(payload)
    if (user === null) {
      // A 200 that names no user is not an authenticated caller, and treating
      // it as one would hand the handler an undefined owner.
      return err(createError(ErrorCode.AUTH_UNAUTHENTICATED, { requestId }))
    }

    return ok(user)
  }
}
