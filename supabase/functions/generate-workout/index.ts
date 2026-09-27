/**
 * `generate-workout` — GEN-01's envelope, mounted.
 *
 * This file is deliberately almost nothing. Everything that decides how the
 * function behaves at its edges — CORS, the request id, auth, parsing, the
 * error shape, the one log line — lives in `_shared/envelope.ts`, so
 * `generate-section` (REV-02) mounts the identical shell with a different
 * schema and a different handler.
 *
 * The handler mounts the complete generation pipeline. A failure remains typed
 * and never falls back to plausible-looking content: defect D2 was a function
 * that looked successful when generation had actually failed.
 *
 * `SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected into every Supabase edge
 * function by the platform; neither is a secret, and no other credential is
 * read here. `verify_jwt` is off for this function in `supabase/config.toml`
 * precisely so the 401 is *this* envelope's typed one, carrying the request id,
 * rather than the gateway's untyped refusal.
 */

import { createTokenVerifier } from '../_shared/auth.ts'
import { apiKeyFromEnv } from '../_shared/claude.ts'
import { createEdgeFunction } from '../_shared/envelope.ts'
import {
  createGenerationComposer,
  createGenerationDatabase,
  performGeneration,
} from '../_shared/generate.ts'
import { createCatalogReader } from '../_shared/hydrate.ts'
import { err } from '../../../src/state/errors.ts'
import { generationRequestSchema } from '../../../src/state/schemas.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

export const handleRequest = createEdgeFunction({
  route: 'generate-workout',
  schema: generationRequestSchema,
  verifyToken: createTokenVerifier({ url, anonKey }),
  handle: async ({ requestId, user, body, accessToken, logger }) => {
    const apiKey = apiKeyFromEnv((name) => Deno.env.get(name))
    if (!apiKey.ok) return err({ ...apiKey.error, requestId })

    const credentials = { url, anonKey, accessToken }
    return performGeneration(
      body,
      { userId: user.id, requestId, logger },
      {
        db: createGenerationDatabase(credentials),
        catalog: createCatalogReader(credentials),
        composer: createGenerationComposer({ apiKey: apiKey.value, logger }),
      },
    )
  },
})

Deno.serve(handleRequest)
