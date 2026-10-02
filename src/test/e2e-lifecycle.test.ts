import { describe, expect, it } from 'vitest'

import { createAdminClient } from '../../scripts/e2e/client.mjs'
import { reset, seed, sweepStale } from '../../scripts/e2e/lifecycle.mjs'
import {
  SLOTS,
  USER_TABLES,
  emailForSlot,
  fixtureIds,
  forgedRow,
  isHarnessEmail,
  namespaceId,
  rowSelector,
} from '../../scripts/e2e/namespace.mjs'
import { createSupabaseDouble as createDouble } from './supabase-double'

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
 * The double is `src/test/supabase-double.ts`, shared with GR-05's database
 * lane, which needs the same users and the same cascade.
 */

function createSupabaseDouble() {
  const double = createDouble()

  return {
    ...double,
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
        fetch: double.fetch,
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

describe('the cross-user matrix asks the database the right questions (ENV-07)', () => {
  /**
   * The live answers come from `e2e/rls.spec.ts` against a real project. What
   * is provable here is the half a database cannot tell us apart from a bug:
   * that a "denied" result was obtained *as user A*, with the anon key and A's
   * bearer token, rather than as the service role — which would be refused by
   * nothing and would pass every assertion in the matrix.
   */
  function recordingClient() {
    const seen: {
      method: string
      path: string
      query: string
      apikey: string | null
      authorization: string | null
    }[] = []

    const fetchImpl: typeof globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      const headers = new Headers(init?.headers)
      seen.push({
        method: init?.method ?? 'GET',
        path: url.pathname,
        query: url.search,
        apikey: headers.get('apikey'),
        authorization: headers.get('Authorization'),
      })
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return {
      seen,
      client: createAdminClient({
        url: 'https://project.supabase.co',
        serviceRoleKey: 'service-role',
        anonKey: 'anon',
        fetch: fetchImpl,
      }),
    }
  }

  it('reads, updates and deletes as the other user, never as the service role', async () => {
    const { client, seen } = recordingClient()
    const query = { id: 'eq.row-b' }

    await client.selectAs('locations', query, 'token-a')
    await client.updateAs('locations', query, { created_at: 'x' }, 'token-a')
    await client.deleteAs('locations', query, 'token-a')

    expect(seen.map((request) => request.method)).toEqual([
      'GET',
      'PATCH',
      'DELETE',
    ])

    for (const request of seen) {
      expect(request.path).toBe('/rest/v1/locations')
      expect(request.query).toContain('id=eq.row-b')
      // The browser's key and the other user's token. A service-role call here
      // bypasses RLS entirely and would make the whole matrix meaningless.
      expect(request.apikey).toBe('anon')
      expect(request.authorization).toBe('Bearer token-a')
    }
  })

  it('asks the privileged reader whether a row survived, not the user', async () => {
    const { client, seen } = recordingClient()

    await client.selectAsService('locations', { id: 'eq.row-b' })

    // RLS would hide a surviving row from either test user, so teardown has to
    // be checked past the policy rather than through it.
    expect(seen[0].authorization).toBe('Bearer service-role')
  })
})

describe('one namespace per run (ENV-07)', () => {
  it('keeps two concurrent runs off one another', () => {
    const [a, b] = ['pr-101', 'pr-102']

    expect(emailForSlot('a', a)).not.toBe(emailForSlot('a', b))
    expect(fixtureIds(a).location.a).not.toBe(fixtureIds(b).location.a)
    // Within a namespace it is still fixed, which is what idempotence needs.
    expect(fixtureIds(a)).toEqual(fixtureIds(a))
  })

  it('mints uuid-shaped keys that are obvious on sight', () => {
    for (const id of Object.values(fixtureIds('pr-9999'))) {
      expect(id.a).toMatch(
        /^e2e0000\d-[0-9a-f]{4}-4000-8000-[0-9a-f]{12}$/,
      )
      expect(id.b).not.toBe(id.a)
    }
  })

  it('folds a branch name into something an address and a uuid both accept', () => {
    expect(namespaceId({ E2E_NAMESPACE: 'agent-runner/TASK-007b' })).toBe(
      'agent-runner-task-007b',
    )
    expect(namespaceId({ E2E_NAMESPACE: '   ' })).toBe('local')
    expect(namespaceId({})).toBe('local')
    expect(namespaceId({ E2E_NAMESPACE: 'x'.repeat(80) })).toHaveLength(32)
  })

  it('claims every address it owns, in any namespace, and no others', () => {
    expect(isHarnessEmail(emailForSlot('a', 'pr-3'))).toBe(true)
    expect(isHarnessEmail(emailForSlot('b'))).toBe(true)
    expect(isHarnessEmail('eric@example.com')).toBe(false)
    expect(isHarnessEmail('clear-e2e-pr-3-a@gmail.com')).toBe(false)
  })
})

describe('an abandoned run leaves nothing permanent (ENV-07)', () => {
  const hoursAgo = (hours: number) =>
    new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  it('sweeps harness users no namespace will ever address again', async () => {
    const double = createSupabaseDouble()
    const client = double.client()

    // A cancelled job from yesterday: its namespace is a pull request number
    // that will not come round again, so `reset` cannot find these.
    const abandoned = await client.ensureConfirmedUser(
      emailForSlot('a', 'pr-4141'),
    )
    double.users.get(abandoned.email)!.created_at = hoursAgo(26)

    // ...and this run, mid-flight.
    await seed(client)

    const { swept } = await sweepStale(client)

    expect(swept).toEqual([emailForSlot('a', 'pr-4141')])
    expect([...double.users.keys()].sort()).toEqual(
      SLOTS.map((slot) => emailForSlot(slot)).sort(),
    )
  })

  it('never touches a live run, or an address it did not create', async () => {
    const double = createSupabaseDouble()
    const client = double.client()

    await client.ensureConfirmedUser('eric@example.com')
    double.users.get('eric@example.com')!.created_at = hoursAgo(500)
    await client.ensureConfirmedUser(emailForSlot('a', 'pr-77'))

    const { swept } = await sweepStale(client)

    expect(swept).toEqual([])
    expect(double.users.size).toBe(2)
  })

  it('leaves a user whose age it cannot read rather than guessing', async () => {
    const double = createSupabaseDouble()
    const client = double.client()

    const user = await client.ensureConfirmedUser(emailForSlot('b', 'pr-5'))
    // @ts-expect-error — the double reproduces a response missing the stamp.
    delete double.users.get(user.email)!.created_at

    expect((await sweepStale(client)).swept).toEqual([])
    expect(double.users.size).toBe(1)
  })
})

describe('the RLS namespace covers the owner-scoped schema (ENV-07)', () => {
  it('names every user table the migrations protect', () => {
    expect(USER_TABLES.map((entry) => entry.table)).toEqual([
      'profiles',
      'locations',
      'location_equipment',
      'user_constraints',
      'rest_days',
      'workout_sessions',
      'workout_sections',
      'workout_blocks',
      'block_results',
      'workout_exercises',
      'exercise_set_logs',
      'load_anchors',
      'saved_workouts',
      'saved_workout_completions',
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
