import { describe, expect, it } from 'vitest'

import { createAdminClient } from '../../scripts/e2e/client.mjs'
import { reset, seed } from '../../scripts/e2e/lifecycle.mjs'
import {
  SLOTS,
  USER_TABLES,
  emailForSlot,
  forgedRow,
  rowSelector,
} from '../../scripts/e2e/namespace.mjs'

/**
 * ENV-07 — the lifecycle's two promises, proved without a database.
 *
 *   *Seed and reset are one command each and are idempotent; a failed run never
 *   leaves the next one poisoned.*
 *
 * Idempotence is a property of a sequence of requests, so it is provable
 * against a double that answers them the way GoTrue and PostgREST do — which
 * is the only place it can be proved at all in a repository whose CI has no
 * Supabase project of its own. The live half of the suite is `e2e/`, and it
 * runs against the preview deployment.
 *
 * The double is small and deliberately unforgiving. It reproduces exactly the
 * three behaviours the lifecycle leans on: a duplicate primary key is refused
 * unless the request asked for `ignore-duplicates`, a second `createUser` for a
 * known address is a 422, and deleting a user takes their rows with it.
 */

interface FakeUser {
  id: string
  email: string
  email_confirm: boolean
}

type FakeRow = Record<string, unknown> & { __owner?: string }

/** Child table → [parent table, the column pointing at it]. */
const PARENT: Record<string, [string, string]> = {
  location_equipment: ['locations', 'location_id'],
  workout_sections: ['workout_sessions', 'session_id'],
  workout_blocks: ['workout_sections', 'section_id'],
  block_results: ['workout_blocks', 'block_id'],
}

function createSupabaseDouble() {
  const users = new Map<string, FakeUser>()
  const tables = new Map<string, FakeRow[]>()
  const requests: string[] = []
  let nextId = 1

  const rowsIn = (table: string) => tables.get(table) ?? []

  const primaryKeyOf = (table: string, row: FakeRow) =>
    table === 'location_equipment'
      ? `${String(row.location_id)}:${String(row.equipment_id)}`
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
    client: (
      overrides: Partial<{
        url: string
        serviceRoleKey: string
        anonKey: string
      }> = {},
    ) =>
      createAdminClient({
        url: 'https://project.supabase.co',
        serviceRoleKey: 'service-role',
        anonKey: 'anon',
        fetch: fetchImpl,
        ...overrides,
      }),
  }
}

describe('E2E test-data lifecycle (ENV-07)', () => {
  it('seeds both slots as confirmed users, with no inbox involved', async () => {
    const double = createSupabaseDouble()
    const { users } = await seed(double.client())

    for (const slot of SLOTS) {
      const email = emailForSlot(slot)
      expect(users[slot].email).toBe(email)
      expect(double.users.get(email)?.email_confirm).toBe(true)
    }

    // Nothing asked for a code to be mailed to anybody.
    const mailing = double.requests.filter(
      (request) =>
        request.includes('/auth/v1/magiclink') || request.includes('/auth/v1/otp'),
    )
    expect(mailing).toEqual([])
  })

  it('gives every seedable user table exactly one row per slot', async () => {
    const double = createSupabaseDouble()
    await seed(double.client())

    for (const { table, seeded } of USER_TABLES) {
      if (!seeded) continue
      expect(double.rowsIn(table), table).toHaveLength(SLOTS.length)
    }
  })

  it('is idempotent: seeding twice leaves the same state, not twice as much', async () => {
    const double = createSupabaseDouble()
    const client = double.client()

    await seed(client)
    const afterFirst = new Map(
      [...double.tables].map(([table, rows]) => [table, rows.length]),
    )

    await seed(client)

    for (const [table, count] of afterFirst) {
      expect(double.rowsIn(table), table).toHaveLength(count)
    }
    expect(double.users.size).toBe(SLOTS.length)
  })

  it('cannot be poisoned by a run that died halfway', async () => {
    const double = createSupabaseDouble()
    const client = double.client()

    // A previous run that got as far as creating a user and one row, and then
    // stopped — the state a cancelled CI job or a lost connection leaves.
    const partial = await client.ensureConfirmedUser(emailForSlot('a'))
    await client.insertRows('locations', [
      { id: 'left-behind', user_id: partial.id, name: 'Half-written' },
    ])

    await seed(client)

    // Seeding resets first, so the orphan is gone and the state is the state.
    const locations = double.rowsIn('locations')
    expect(locations.some((row) => row.id === 'left-behind')).toBe(false)
    expect(locations).toHaveLength(SLOTS.length)
  })

  it('resets to nothing, and resetting an already-clean project is a no-op', async () => {
    const double = createSupabaseDouble()
    const client = double.client()

    await seed(client)

    const first = await reset(client)
    expect(first.deleted).toHaveLength(SLOTS.length)
    expect(double.users.size).toBe(0)
    for (const { table, seeded } of USER_TABLES) {
      if (!seeded) continue
      expect(double.rowsIn(table), table).toHaveLength(0)
    }

    const second = await reset(client)
    expect(second.deleted).toEqual([])
  })

  it('refuses to exist without every credential it needs', () => {
    const double = createSupabaseDouble()

    expect(() => double.client({ serviceRoleKey: '' })).toThrow(
      /service-role key/,
    )
    expect(() => double.client({ anonKey: '' })).toThrow(/anon key/)
    expect(() => double.client({ url: '' })).toThrow(/Supabase URL/)
  })
})

describe('the RLS namespace covers the owner-scoped schema (ENV-07)', () => {
  it('names every user table the migrations protect', () => {
    expect(USER_TABLES.map((entry) => entry.table)).toEqual([
      'profiles',
      'locations',
      'location_equipment',
      'user_constraints',
      'workout_sessions',
      'workout_sections',
      'workout_blocks',
      'block_results',
      'workout_exercises',
      'exercise_set_logs',
    ])
  })

  it('can address and forge a row for every one of them', () => {
    for (const { table } of USER_TABLES) {
      expect(Object.keys(rowSelector(table, 'b', 'user-b')), table).toHaveLength(
        1,
      )
      expect(forgedRow(table, 'b', 'user-b'), table).toBeTruthy()
    }
  })

  it('forges rows that claim the other user, which is what makes a refusal mean something', () => {
    expect(forgedRow('profiles', 'b', 'user-b')).toMatchObject({ id: 'user-b' })
    expect(forgedRow('locations', 'b', 'user-b')).toMatchObject({
      user_id: 'user-b',
    })
    expect(forgedRow('workout_sessions', 'b', 'user-b')).toMatchObject({
      user_id: 'user-b',
    })
  })
})
