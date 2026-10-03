import { GENERATION_SINGLE_ATTEMPT_ACCEPT } from '../../src/state/schemas'

/** Intercept all model-backed routes, not only the expected project's origin. */
export const MODEL_ROUTE = /\/functions\/v1\/generate-(?:workout|section)(?:[/?#]|$)/

/**
 * Fail closed before spending. Reservation happens synchronously before the
 * caller forwards a request, so two concurrent POSTs cannot both be allowed.
 * A mismatched endpoint also spends the sole local attempt and stops the run.
 * These are browser dispatch counts, never claimed to be provider usage.
 */
export function createGenerationBudget(endpoint: string) {
  let attempted = 0
  let forwarded = 0
  let blocked = 0

  return {
    allow(url: string): boolean {
      attempted += 1
      if (attempted !== 1 || url !== endpoint) {
        blocked += 1
        return false
      }
      forwarded += 1
      return true
    },
    snapshot: () => ({ attempted, forwarded, blocked }),
  }
}

/** Zero-model, credential-free acknowledgement before a user is provisioned. */
export async function assertSingleAttemptDeployment(
  endpoint: string,
  send: typeof globalThis.fetch = globalThis.fetch,
) {
  const response = await send(endpoint, {
    method: 'OPTIONS',
    headers: { Accept: GENERATION_SINGLE_ATTEMPT_ACCEPT },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status !== 204 || response.headers.get('x-generation-attempt-limit') !== '1') {
    throw new Error('The deployed function has not acknowledged the one-provider-attempt budget. No generation is allowed.')
  }
}
