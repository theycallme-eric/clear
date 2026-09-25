/**
 * `generate-section` — REV-02's swap, in GEN-01's envelope.
 *
 * This file is the same twenty lines `generate-workout` is, and that is the
 * point rather than a coincidence: the shell — CORS, the request id, the JWT,
 * the parse, the error shape, the one log line — is `_shared/envelope.ts`, and
 * a second AI function adopts it with a different route, a different schema and
 * a different handler. The swap itself is `_shared/swap.ts`.
 *
 * `SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected into every Supabase edge
 * function by the platform; neither is a secret. `ANTHROPIC_API_KEY` is a
 * function secret and is read once, here, by name — a missing key is the typed
 * refusal `apiKeyFromEnv` returns and never a throw. `verify_jwt` is off for
 * this function in `supabase/config.toml` precisely so the 401 is *this*
 * envelope's typed one, carrying the request id, rather than the gateway's.
 */

import { createTokenVerifier } from '../_shared/auth.ts'
import { apiKeyFromEnv } from '../_shared/claude.ts'
import { createEdgeFunction } from '../_shared/envelope.ts'
import { createCatalogReader } from '../_shared/hydrate.ts'
import { createSwapComposer, createSwapDatabase, performSwap } from '../_shared/swap.ts'
import { err } from '../../../src/state/errors.ts'
import { swapRequestSchema } from '../../../src/state/schemas.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

export const handleRequest = createEdgeFunction({
  route: 'generate-section',
  schema: swapRequestSchema,
  verifyToken: createTokenVerifier({ url, anonKey }),
  handle: async ({ requestId, user, body, accessToken, logger }) => {
    const apiKey = apiKeyFromEnv((name) => Deno.env.get(name))
    if (!apiKey.ok) return err({ ...apiKey.error, requestId })

    // Every read and the write happen as the caller: `security invoker` all the
    // way down, so somebody else's session is "not found" by RLS rather than by
    // a check this function had to remember to make.
    const credentials = { url, anonKey, accessToken }

    return performSwap(
      body,
      { userId: user.id, requestId, logger },
      {
        db: createSwapDatabase(credentials),
        catalog: createCatalogReader(credentials),
        composer: createSwapComposer({ apiKey: apiKey.value, logger }),
      },
    )
  },
})

Deno.serve(handleRequest)
