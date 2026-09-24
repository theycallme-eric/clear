/**
 * `generate-workout` — GEN-01's envelope, mounted.
 *
 * This file is deliberately almost nothing. Everything that decides how the
 * function behaves at its edges — CORS, the request id, auth, parsing, the
 * error shape, the one log line — lives in `_shared/envelope.ts`, so
 * `generate-section` (REV-02) mounts the identical shell with a different
 * schema and a different handler.
 *
 * The handler is GEN-02b's. Until it lands this function refuses, typed, and
 * that is the point rather than a placeholder: defect D2 was a `generate-workout`
 * that answered with a mock workout when it could not produce a real one, and
 * an app that looks like it works is worse than one that says it cannot.
 *
 * `SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected into every Supabase edge
 * function by the platform; neither is a secret, and no other credential is
 * read here. `verify_jwt` is off for this function in `supabase/config.toml`
 * precisely so the 401 is *this* envelope's typed one, carrying the request id,
 * rather than the gateway's untyped refusal.
 */

import { createTokenVerifier } from '../_shared/auth.ts'
import { createEdgeFunction } from '../_shared/envelope.ts'
import { ErrorCode, createError, err } from '../../../src/state/errors.ts'
import { generationRequestSchema } from '../../../src/state/schemas.ts'

export const handleRequest = createEdgeFunction({
  route: 'generate-workout',
  schema: generationRequestSchema,
  verifyToken: createTokenVerifier({
    url: Deno.env.get('SUPABASE_URL') ?? '',
    anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  }),
  handle: ({ requestId }) => err(createError(ErrorCode.GENERATION_FAILED, { requestId })),
})

Deno.serve(handleRequest)
