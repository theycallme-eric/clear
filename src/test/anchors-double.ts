/**
 * A PostgREST stand-in for the OVR-01a anchor queries.
 *
 * The same bargain as `src/test/history-double.ts`: the migration cannot be
 * executed here, so the rules a call depends on live in the one place a test
 * can run them — owner-only RLS, `anchor_evidence` answering only the caller's
 * rows, and `set_load_anchors` *replacing* the stored set rather than adding to
 * it, each transcribed from `20260921000010_load_anchors.sql` and asserted
 * against separately in `src/test/load-anchors-migration.test.ts`. A test using
 * it proves the client speaks PostgREST correctly and derives from what it
 * received; ENV-07's suite is where Postgres agreeing is settled.
 */

import type { AnchorEvidenceRow, LoadAnchorInput, LoadAnchorRow } from '../state/schemas'

export interface AnchorsDoubleOptions {
  /** The project URL the client is configured with. */
  url: string
  /** The anon key the project accepts. Anything else is answered 401. */
  anonKey: string
  /** Access token → the user id it authenticates. */
  users: Record<string, string>
  /** Evidence rows per user id, as `anchor_evidence` would answer them. */
  evidence?: Record<string, readonly AnchorEvidenceRow[]>
  /** Anchors already stored, in any order. */
  anchors?: readonly LoadAnchorRow[]
  /** Answers every call with this status instead, for the error state. */
  failWith?: number
}

export interface AnchorsDouble {
  fetch: typeof globalThis.fetch
  /** Everything stored, RLS ignored — the test's view, not a caller's. */
  rows(): LoadAnchorRow[]
  /** Every request the double answered, in order. */
  requests(): { method: string; path: string; body: unknown }[]
}

/** What the database stamps on a row the recomputation did not supply. */
const UPDATED_AT = '2026-09-24T12:00:00.000Z'

export function createAnchorsDouble(options: AnchorsDoubleOptions): AnchorsDouble {
  const base = new URL(`${options.url.replace(/\/+$/, '')}/rest/v1`)
  const stored: LoadAnchorRow[] = [...(options.anchors ?? [])]
  const seen: { method: string; path: string; body: unknown }[] = []

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.slice(base.pathname.length)
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))

    seen.push({ method, path, body })

    const headers = new Headers(init?.headers)
    if (headers.get('apikey') !== options.anonKey) return problem(401, 'invalid api key')

    const caller = options.users[headers.get('Authorization')?.replace(/^Bearer /, '') ?? '']
    // No policy matches an unauthenticated request; PostgREST answers 401.
    if (caller === undefined) return problem(401, 'invalid claim')

    if (options.failWith !== undefined) return problem(options.failWith, 'call failed')

    if (path === '/rpc/anchor_evidence' && method === 'POST') {
      const { p_user_id: userId } = body as { p_user_id: string }
      // SECURITY INVOKER: the argument narrows a result RLS already narrowed,
      // so asking about somebody else answers nothing rather than their rows.
      return json(userId === caller ? (options.evidence?.[userId] ?? []) : [])
    }

    if (path === '/rpc/set_load_anchors' && method === 'POST') {
      return replace(body as { p_user_id: string; p_anchors: LoadAnchorInput[] }, caller)
    }

    if (path === '/load_anchors' && method === 'GET') {
      return json(stored.filter((row) => row.user_id === caller))
    }

    return problem(404, `no route for ${method} ${path}`)
  }

  /** `set_load_anchors`: the user's set becomes the payload, exactly. */
  function replace(
    args: { p_user_id: string; p_anchors: LoadAnchorInput[] },
    caller: string,
  ): Response {
    if (args.p_user_id !== caller) {
      return problem(403, 'new row violates row-level security policy')
    }

    for (let index = stored.length - 1; index >= 0; index -= 1) {
      if (stored[index].user_id === caller) stored.splice(index, 1)
    }

    const written = args.p_anchors.map((anchor) => ({
      ...anchor,
      user_id: caller,
      updated_at: UPDATED_AT,
    }))
    stored.push(...written)

    return json(written)
  }

  return { fetch: fetchImpl, rows: () => [...stored], requests: () => [...seen] }
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
