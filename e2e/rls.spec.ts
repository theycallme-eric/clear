import { seed } from '../scripts/e2e/lifecycle.mjs'
import {
  USER_TABLES,
  emailForSlot,
  forgedRow,
  rowSelector,
} from '../scripts/e2e/namespace.mjs'

import { expect, test } from './fixtures'
import { backend } from './support/backend'

/**
 * ENV-07 — row-level security as a standing check.
 *
 * DATA-01 proved the policies once, at authoring time, by reading them. This
 * runs on every pull request and proves them by *doing*: user A holds a real
 * access token, user B owns real rows, and for every owner-scoped table in the
 * schema A tries to read them, overwrite them, and forge one of their own.
 *
 * The seed is symmetric on purpose. A policy that denies everybody would pass
 * every "expect zero rows" assertion in this file, so each table is also read
 * by its own owner, who must see exactly one row. Zero-for-A only means
 * something next to one-for-B.
 *
 * Two tables carry `seeded: false`: their rows require a catalog exercise id,
 * and the catalog is applied by its own task. They are still driven here —
 * the writes must still be refused and the reads must still be empty — they
 * simply have no positive control yet.
 */

test.describe('row-level security', () => {
  test.skip(!backend.available, backend.reason)
  // One database, one namespace: parallel workers would seed over each other.
  test.describe.configure({ mode: 'serial' })

  // Built in `beforeAll`, not here: this body runs even when the describe is
  // skipped, and the client refuses to exist without credentials.
  let client: ReturnType<typeof backend.client>

  /** @see scripts/e2e/lifecycle.mjs — seeding resets first, so this is safe. */
  let users: Record<'a' | 'b', { id: string; email: string }>
  let tokens: Record<'a' | 'b', string>

  test.beforeAll(async () => {
    client = backend.client()
    ;({ users } = await seed(client))
    tokens = {
      a: (await client.mintSession(emailForSlot('a'))).accessToken,
      b: (await client.mintSession(emailForSlot('b'))).accessToken,
    }
  })

  for (const { table, seeded } of USER_TABLES) {
    test.describe(table, () => {
      test('its owner can read their own row', async () => {
        test.skip(!seeded, 'needs a catalog exercise id to seed a row')

        const response = await client.selectAs(
          table,
          rowSelector(table, 'b', users.b.id),
          tokens.b,
        )

        expect(response.status, `${table}: owner read`).toBe(200)
        expect(response.body, `${table}: owner sees their own row`).toHaveLength(
          1,
        )
      })

      test("another user reads none of it", async () => {
        const response = await client.selectAs(
          table,
          rowSelector(table, 'b', users.b.id),
          tokens.a,
        )

        // PostgREST answers a policy-filtered select with 200 and nothing in
        // it. A 401/403 is equally acceptable and equally a denial; what is
        // not acceptable is a row.
        if (response.status === 200) {
          expect(response.body, `${table}: A sees B's rows`).toEqual([])
        } else {
          expect([401, 403]).toContain(response.status)
        }
      })

      test("another user cannot overwrite it", async () => {
        const response = await client.updateAs(
          table,
          rowSelector(table, 'b', users.b.id),
          // `created_at` exists on every one of these tables and changing it
          // is harmless if — wrongly — it succeeds.
          { created_at: '2020-01-01T00:00:00Z' },
          tokens.a,
        )

        if (response.status === 200) {
          expect(response.body, `${table}: A updated B's row`).toEqual([])
        } else {
          expect([401, 403]).toContain(response.status)
        }
      })

      test("another user cannot forge a row for them", async () => {
        const response = await client.insertAs(
          table,
          forgedRow(table, 'b', users.b.id),
          tokens.a,
        )

        expect(response.ok, `${table}: A inserted a row owned by B`).toBe(false)
        // 42501 is Postgres' insufficient_privilege, which is what a `with
        // check` refusal surfaces as. A 409 would mean the row was allowed and
        // merely collided, which is the failure this test exists to catch.
        expect([401, 403]).toContain(response.status)
      })
    })
  }
})
