/**
 * A GoTrue-and-PostgREST stand-in for the privileged harness (ENV-07).
 *
 * The double is small and deliberately unforgiving. It reproduces exactly the
 * three behaviours the lifecycle leans on: a duplicate primary key is refused
 * unless the request asked for `ignore-duplicates`, a second `createUser` for a
 * known address is a 422, and deleting a user takes their rows with it.
 *
 * It lived inside `e2e-lifecycle.test.ts` until GR-05's database lane needed the
 * same users and the same cascade. `routes` is how that suite adds what the
 * lifecycle never asks for — a session, an RPC, a privileged read — without
 * this file learning about any of them: a route answers a request or returns
 * `undefined` to let the behaviour below have it.
 *
 * What a test using it proves is a sequence of requests and the state they
 * leave. It does not prove Postgres agrees, and nothing here should be read as
 * claiming that.
 *
 * It hands back a `fetch` and builds no client. The privileged client lives
 * outside `src/` and only a `*.test.ts` may import it, so each suite wraps this
 * `fetch` in a client of its own.
 */

export interface FakeUser {
  id: string
  email: string
  email_confirm: boolean
  created_at: string
}

export type FakeRow = Record<string, unknown> & { __owner?: string }

export interface SupabaseDoubleRequest {
  url: URL
  method: string
  headers: Headers
  /** The parsed JSON body, or `undefined` when the request had none. */
  body: unknown
  users: Map<string, FakeUser>
  tables: Map<string, FakeRow[]>
  rowsIn(table: string): FakeRow[]
  respond(status: number, body: unknown): Response
}

export type SupabaseDoubleRoute = (
  request: SupabaseDoubleRequest,
) => Response | undefined | Promise<Response | undefined>

export interface SupabaseDoubleOptions {
  /** Asked before the built-in behaviour; `undefined` declines the request. */
  routes?: SupabaseDoubleRoute
}

/** Child table → [parent table, the column pointing at it]. */
const PARENT: Record<string, [string, string]> = {
  location_equipment: ['locations', 'location_id'],
  workout_sections: ['workout_sessions', 'session_id'],
  workout_blocks: ['workout_sections', 'section_id'],
  workout_exercises: ['workout_blocks', 'block_id'],
  exercise_set_logs: ['workout_exercises', 'workout_exercise_id'],
  block_results: ['workout_blocks', 'block_id'],
  saved_workout_completions: ['saved_workouts', 'saved_workout_id'],
}

export function createSupabaseDouble(options: SupabaseDoubleOptions = {}) {
  const users = new Map<string, FakeUser>()
  const tables = new Map<string, FakeRow[]>()
  const requests: string[] = []
  let nextId = 1

  const rowsIn = (table: string) => tables.get(table) ?? []

  const primaryKeyOf = (table: string, row: FakeRow) =>
    table === 'location_equipment'
      ? `${String(row.location_id)}:${String(row.equipment_id)}`
      : table === 'load_anchors'
        ? `${String(row.user_id)}:${String(row.exercise_id)}:${String(row.equipment_used)}`
      : String(row.id)

  /**
   * Who a row belongs to, resolved once at insert time by following the same
   * parent chain the foreign keys declare — which is also what makes the
   * cascade on delete a one-liner below.
   */
  function ownerOf(table: string, row: FakeRow): string | undefined {
    if (table === 'profiles') return String(row.id)
    if (typeof row.user_id === 'string') return row.user_id

    const parent = PARENT[table]
    if (parent === undefined) return undefined

    const [parentTable, column] = parent
    const parentRow = rowsIn(parentTable).find(
      (candidate) => String(candidate.id) === String(row[column]),
    )
    return parentRow?.__owner
  }

  const respond = (status: number, body: unknown) =>
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    requests.push(`${method} ${url.pathname}`)

    if (options.routes !== undefined) {
      const answered = await options.routes({
        url,
        method,
        headers: new Headers(init?.headers),
        body: init?.body == null ? undefined : JSON.parse(String(init.body)),
        users,
        tables,
        rowsIn,
        respond,
      })
      if (answered !== undefined) return answered
    }

    if (url.pathname === '/auth/v1/admin/users' && method === 'GET') {
      return respond(200, { users: [...users.values()] })
    }

    if (url.pathname === '/auth/v1/admin/users' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { email: string }
      if (users.has(body.email)) {
        return respond(422, { msg: 'email address already registered' })
      }
      const user = {
        id: `user-${nextId++}`,
        email: body.email,
        email_confirm: true,
        // GoTrue stamps every user; the stale sweep is the one caller that
        // reads it, so the double has to carry it.
        created_at: new Date().toISOString(),
      }
      users.set(body.email, user)
      return respond(200, user)
    }

    if (url.pathname.startsWith('/auth/v1/admin/users/') && method === 'DELETE') {
      const id = url.pathname.split('/').pop()
      const found = [...users.values()].find((user) => user.id === id)
      if (found === undefined) return respond(404, { msg: 'not found' })

      users.delete(found.email)
      for (const [table, rows] of tables) {
        tables.set(
          table,
          rows.filter((row) => row.__owner !== id),
        )
      }
      return respond(204, null)
    }

    if (url.pathname.startsWith('/rest/v1/') && method === 'POST') {
      const table = url.pathname.replace('/rest/v1/', '')
      const incoming = JSON.parse(String(init?.body)) as FakeRow[]
      const prefer = new Headers(init?.headers).get('Prefer') ?? ''
      const ignoreDuplicates = prefer.includes('ignore-duplicates')
      const rows = rowsIn(table)

      for (const row of incoming) {
        const key = primaryKeyOf(table, row)
        const clashes = rows.some(
          (present) => primaryKeyOf(table, present) === key,
        )

        if (clashes) {
          if (ignoreDuplicates) continue
          return respond(409, { message: 'duplicate key value' })
        }

        rows.push({ ...row, __owner: ownerOf(table, row) })
      }

      tables.set(table, rows)
      return respond(201, null)
    }

    throw new Error(`Unexpected request: ${method} ${url.pathname}`)
  }

  return {
    users,
    tables,
    requests,
    rowsIn,
    fetch: fetchImpl,
  }
}
