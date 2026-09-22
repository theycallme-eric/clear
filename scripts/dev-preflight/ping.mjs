/**
 * ENV-04 — the database half of the dev preflight.
 *
 * Development runs against the hosted Supabase project, and a free-tier project
 * pauses when it is idle. Paused looks like a connection error thrown from
 * somewhere deep in a client library, minutes after the dev server appeared to
 * start fine. So ask first, once, with a timeout, and classify the answer:
 * three different failures deserve three different sentences.
 */

/** Long enough for a cold hosted project, short enough not to feel hung. */
export const PING_TIMEOUT_MS = 8000

/**
 * @typedef {{ ok: true, status: number }} PingSuccess
 * @typedef {{ ok: false, reason: 'unreachable' | 'rejected', detail: string }} PingFailure
 */

/**
 * PostgREST's root answers any authenticated request, so it is the cheapest
 * proof that the project is awake *and* that the anon key is the one it holds.
 * No table is read: this is a pulse, not a query, and it must keep working
 * before any schema exists.
 *
 * @param {object} options
 * @param {string} options.url
 * @param {string} options.anonKey
 * @param {typeof globalThis.fetch} [options.fetch]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<PingSuccess | PingFailure>}
 */
export async function pingSupabase({
  url,
  anonKey,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = PING_TIMEOUT_MS,
}) {
  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/`

  let response
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    // The message, never the stack: a DNS failure's call stack describes
    // Node's internals and says nothing about the project being asleep.
    return { ok: false, reason: 'unreachable', detail: describe(error, timeoutMs) }
  }

  // A paused project is answered by Supabase's edge, not by the database, and
  // that is a 5xx (540 for paused). Anything else that answers at all proves
  // the project is awake — a 404 from a URL that exists is still a reply.
  if (response.status >= 500) {
    return {
      ok: false,
      reason: 'unreachable',
      detail: `the project answered HTTP ${response.status}`,
    }
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      reason: 'rejected',
      detail: `the project answered HTTP ${response.status}`,
    }
  }

  return { ok: true, status: response.status }
}

/**
 * @param {unknown} error
 * @param {number} timeoutMs
 * @returns {string}
 */
function describe(error, timeoutMs) {
  if (error instanceof Error && error.name === 'TimeoutError') {
    const waited = timeoutMs >= 1000 ? `${timeoutMs / 1000}s` : `${timeoutMs}ms`
    return `no answer within ${waited}`
  }

  const cause = error instanceof Error && error.cause
  if (cause instanceof Error && cause.message) return cause.message
  if (error instanceof Error && error.message) return error.message

  return String(error)
}
