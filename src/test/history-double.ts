/**
 * A PostgREST stand-in for reading `workout_sessions` (HIST-01).
 *
 * The same bargain as `src/test/postgrest-double.ts` and
 * `src/test/session-double.ts`: the migrations cannot be executed here, so the
 * rules a read depends on live in the one place a test can run them — owner-only
 * RLS from `20260921000002_workout_domain.sql`, and PostgREST's own `order`,
 * `limit` and `offset` handling. A test using it proves the client speaks
 * PostgREST correctly; ENV-07's suite is where Postgres agreeing is settled.
 */

import type { WorkoutSessionRow } from '../state/schemas'

export interface HistoryDoubleOptions {
  /** The project URL the client is configured with. */
  url: string
  /** The anon key the project accepts. Anything else is answered 401. */
  anonKey: string
  /** Access token → the user id it authenticates. */
  users: Record<string, string>
  /** Rows in the table, in any order — the double sorts as PostgREST would. */
  sessions?: readonly WorkoutSessionRow[]
  /** Answers every read with this status instead, for the error state. */
  failWith?: number
}

export interface HistoryDouble {
  fetch: typeof globalThis.fetch
  /** Every request the double answered, in order. */
  requests(): { method: string; path: string; query: URLSearchParams }[]
}

export function createHistoryDouble(options: HistoryDoubleOptions): HistoryDouble {
  const base = new URL(`${options.url.replace(/\/+$/, '')}/rest/v1`)
  const rows: WorkoutSessionRow[] = [...(options.sessions ?? [])]
  const seen: { method: string; path: string; query: URLSearchParams }[] = []

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.slice(base.pathname.length)

    seen.push({ method, path, query: url.searchParams })

    const headers = new Headers(init?.headers)
    if (headers.get('apikey') !== options.anonKey) {
      return problem(401, 'invalid api key')
    }

    const token = headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    const caller = options.users[token]
    // No policy matches an unauthenticated request; PostgREST answers 401.
    if (caller === undefined) return problem(401, 'invalid claim')

    if (options.failWith !== undefined) return problem(options.failWith, 'read failed')
    if (path !== '/workout_sessions' || method !== 'GET') return problem(404, 'no route')

    return new Response(JSON.stringify(select(url.searchParams, caller)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /** `workout_sessions_select_own`, then the caller's own filter and page. */
  const select = (params: URLSearchParams, caller: string): WorkoutSessionRow[] => {
    let visible = rows.filter((row) => row.user_id === caller)

    const owner = params.get('user_id')
    if (owner !== null) {
      const wanted = owner.replace(/^eq\./, '')
      visible = visible.filter((row) => row.user_id === wanted)
    }

    const order = params.get('order')
    if (order !== null) {
      const keys = order.split(',').map((term) => {
        const [column, direction] = term.split('.')
        return { column: column as keyof WorkoutSessionRow, descending: direction === 'desc' }
      })

      visible = [...visible].sort((left, right) => {
        for (const { column, descending } of keys) {
          const a = String(left[column])
          const b = String(right[column])
          if (a === b) continue
          return (a < b ? -1 : 1) * (descending ? -1 : 1)
        }
        return 0
      })
    }

    const offset = Number(params.get('offset') ?? 0)
    const limit = params.get('limit')

    return visible.slice(offset, limit === null ? undefined : offset + Number(limit))
  }

  return { fetch: fetchImpl, requests: () => seen }
}

function problem(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
