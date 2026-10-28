import { randomUUID } from 'node:crypto'

import { auditSchema, readSchema } from '../scripts/e2e/dispositions.mjs'
import { reset, seed } from '../scripts/e2e/lifecycle.mjs'
import {
  NAMESPACE,
  USER_TABLES,
  emailForSlot,
  forgedRow,
  rowSelector,
} from '../scripts/e2e/namespace.mjs'
import { parseSetObservationAck } from '../src/state/set-observation-mutation'

import { expect, test } from './fixtures'
import { backend } from './support/backend'
import { observationProbe } from './support/rls-observation'

/**
 * ENV-07 — row-level security as a standing check.
 *
 * DATA-01 proved the policies once, at authoring time, by reading them. This
 * runs on every pull request and proves them by *doing*: user A holds a real
 * access token, user B owns real rows, and for every owner-scoped table in the
 * schema A tries to read them, overwrite them, delete them, and forge one of
 * their own.
 *
 * Three properties make the result mean something.
 *
 *   * **The matrix is derived, not listed.** It is every `cross-user`
 *     disposition in `scripts/e2e/dispositions.mjs`, and that register is
 *     compared against the migrations by the first test in this file. A table
 *     added without a disposition fails the run rather than quietly leaving
 *     the matrix one table short.
 *   * **The seed is symmetric.** A policy that denied everybody would pass
 *     every "expect zero rows" assertion here, so each table is also read and
 *     written through its supported owner interface. Private receipts remain
 *     read-only; their owner can read them and the observation RPC creates
 *     them. Zero-for-A only means something next to one-for-B.
 *   * **Denial is checked at the row, not only in the response.** After every
 *     refused write, B's row is read back with the service role and compared
 *     against what it was. A 403 over a mutation that happened anyway is the
 *     failure this catches.
 *
 * Two tables carry `seeded: false`: their rows require a catalog exercise id,
 * and the catalog is applied by its own task. They are still driven here —
 * the writes must still be refused and the reads must still be empty — they
 * simply have no positive control yet.
 */

/**
 * Coverage needs no database, so it is asserted before the skip: a pull
 * request that adds a table without disposing of it fails the E2E suite even
 * on a machine with no credentials at all.
 */
test.describe('the standing matrix covers the schema', () => {
  test('every table in the migrations has an explicit disposition', () => {
    const audit = auditSchema(readSchema(process.cwd()))

    expect(
      audit.undisposed,
      'add each to scripts/e2e/dispositions.mjs as cross-user or shared-reference',
    ).toEqual([])
    expect(audit.absentFromSchema, 'a disposition outlived its table').toEqual([])
    expect(
      audit.unprotected,
      'called user-owned but its migration never enabled RLS',
    ).toEqual([])
  })

  test('drives at least the tables a person owns', () => {
    expect(USER_TABLES.length).toBeGreaterThanOrEqual(10)
  })
})

test.describe('row-level security', () => {
  test.skip(!backend.available, backend.reason)
  // One namespace per run, and the seed rewrites all of it: parallel workers
  // would seed over each other.
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

  // The suite leaves nothing behind even when it fails part-way: `afterAll`
  // runs whether the serial describe finished or aborted at the first failure.
  test.afterAll(async () => {
    if (client) await reset(client)
  })

  /** B's row exactly as the database holds it — past every policy. */
  const ownedRow = async (table: string) => {
    const response = await client.selectAsService(
      table,
      rowSelector(table, 'b', users.b.id),
    )
    expect(response.ok, `${table}: privileged read`).toBe(true)
    return response.body as Record<string, unknown>[]
  }

  /**
   * What a denial is allowed to look like.
   *
   * PostgREST answers a policy-*filtered* write with 200 and an empty
   * representation, or 204 when it returns none at all; a policy-*refused* one
   * with 401 or 403. All three are denials. A row in the response is not — and
   * the caller checks the row itself afterwards, which is what makes the 204
   * case provable rather than assumed.
   */
  const expectDenied = (
    response: { status: number; body: unknown },
    what: string,
  ) => {
    if (response.status === 200 || response.status === 201) {
      expect(response.body, what).toEqual([])
    } else if (response.status !== 204) {
      expect([401, 403], `${what} (status ${response.status})`).toContain(
        response.status,
      )
    }
  }

  const timestampPatch = (table: string, value: unknown) => {
    if (table === 'exercise_set_logs') return { actual_reps: value }
    if (table === 'load_anchors') return { updated_at: value }
    if (table === 'saved_workout_completions') return { started_at: value }
    return { created_at: value }
  }

  const expectDirectOwnerWritesDenied = async (
    table: string,
    before: Record<string, unknown>,
  ) => {
    const query = rowSelector(table, 'b', users.b.id)
    const patch = timestampPatch(table,
      table === 'exercise_set_logs' ? before.actual_reps : before.created_at)
    expectDenied(await client.updateAs(table, query, patch, tokens.b),
      `${table}: owner bypassed the supported write interface`)
    expect(await ownedRow(table), `${table}: denied owner PATCH changed the row`).toEqual([before])
    expectDenied(await client.deleteAs(table, query, tokens.b),
      `${table}: owner bypassed the supported clear interface`)
    expect(await ownedRow(table), `${table}: denied owner DELETE changed the row`).toEqual([before])
  }

  for (const { table, seeded, ownerWrite } of USER_TABLES) {
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

      test(ownerWrite === 'read-only'
        ? 'its owner can read but cannot directly rewrite or delete its receipt'
        : 'its owner can write through the supported interface', async () => {
        test.skip(!seeded, 'needs a catalog exercise id to seed a row')

        const [before] = await ownedRow(table)

        if (ownerWrite === 'read-only') {
          await expectDirectOwnerWritesDenied(table, before)
          return
        }

        if (ownerWrite === 'observation-rpc') {
          // The fixture is a pending workout's legacy observation. Exact
          // insert/bootstrap is supported without pretending it is active.
          const { mutation, args } = observationProbe(before, randomUUID())
          expect(mutation.expected_revision).toBe(0)
          const response = await client.rpcAs('mutate_set_observation', args, tokens.b)
          expect(response.status, 'owner observation RPC').toBe(200)
          const applied = parseSetObservationAck(response.body, mutation)
          expect(applied.ok, 'owner RPC returned an exact applied acknowledgement').toBe(true)
          if (!applied.ok) throw new Error('Owner observation acknowledgement was invalid')
          expect(applied.value.outcome).toBe('applied')
          const after = { ...before, mutation_revision: 1, last_mutation_id: mutation.mutation_id }
          expect(await ownedRow(table), 'bootstrap preserves every observed value').toEqual([after])

          const replay = await client.rpcAs('mutate_set_observation', args, tokens.b)
          expect(replay.status, 'owner lost-response replay').toBe(200)
          const replayed = parseSetObservationAck(replay.body, mutation)
          expect(replayed.ok, 'replay acknowledges the same identity and current head').toBe(true)
          if (!replayed.ok) throw new Error('Owner observation replay acknowledgement was invalid')
          expect(replayed.value.outcome).toBe('replayed')
          expect(replayed.value.head).toEqual(applied.value.head)
          expect(await ownedRow(table), 'replay cannot change or duplicate the observation').toEqual([after])

          const receipt = await client.selectAs('set_observation_mutations',
            { mutation_id: `eq.${mutation.mutation_id}` }, tokens.b)
          expect(receipt.status, 'owner reads its RPC-created private receipt').toBe(200)
          expect(receipt.body).toEqual([expect.objectContaining({
            mutation_id: mutation.mutation_id, observation_id: mutation.observation_id,
            revision: 1, expected_revision: 0, operation: 'insert', user_id: users.b.id,
            request_values: mutation.values,
          })])
          await expectDirectOwnerWritesDenied(table, after)
          return
        }

        // A patch that sets `created_at` to the value it already holds. It is
        // a real UPDATE — the policy is evaluated exactly as it would be for a
        // meaningful edit — while leaving the fixture byte-identical for the
        // assertions that follow.
        const response = await client.updateAs(
          table,
          rowSelector(table, 'b', users.b.id),
          timestampPatch(
            table,
            table === 'exercise_set_logs'
              ? before.actual_reps
              : table === 'load_anchors'
              ? before.updated_at
              : table === 'saved_workout_completions'
                ? before.started_at
                : before.created_at,
          ),
          tokens.b,
        )

        expect(response.status, `${table}: owner write`).toBe(200)
        expect(
          response.body,
          `${table}: the owner was denied their own row`,
        ).toHaveLength(1)
      })

      if (ownerWrite === 'observation-rpc') {
        test('another user cannot insert, correct or clear through the observation RPC', async () => {
          const [before] = await ownedRow(table)
          const receiptQuery = { observation_id: `eq.${before.id}` }
          const receipts = await client.selectAsService('set_observation_mutations', receiptQuery)
          expect(receipts.ok, 'privileged receipt baseline').toBe(true)
          for (const operation of ['insert', 'correct', 'clear'] as const) {
            const { args } = observationProbe(before, randomUUID(), operation)
            const response = await client.rpcAs('mutate_set_observation', args, tokens.a)
            expect(response.status, `${operation}: RPC refused foreign ownership`).toBe(200)
            expect(response.body).toEqual({ outcome: 'not_found' })
            expect(await ownedRow(table), `${operation}: foreign RPC changed B's row`).toEqual([before])
            const after = await client.selectAsService('set_observation_mutations', receiptQuery)
            expect(after.ok, 'privileged receipt verification').toBe(true)
            expect(after.body, `${operation}: foreign RPC wrote a receipt`).toEqual(receipts.body)
          }
        })
      }

      test('another user reads none of it', async () => {
        const response = await client.selectAs(
          table,
          rowSelector(table, 'b', users.b.id),
          tokens.a,
        )

        // A policy-filtered select is a 200 with nothing in it. A 401/403 is
        // equally acceptable and equally a denial; what is not acceptable is
        // a row.
        if (response.status === 200) {
          expect(response.body, `${table}: A sees B's rows`).toEqual([])
        } else {
          expect([401, 403]).toContain(response.status)
        }
      })

      test('another user cannot overwrite it', async () => {
        const before = seeded ? await ownedRow(table) : []

        const response = await client.updateAs(
          table,
          rowSelector(table, 'b', users.b.id),
          // `created_at` exists on every one of these tables and changing it
          // is harmless if — wrongly — it succeeds.
          timestampPatch(
            table,
            table === 'exercise_set_logs' ? 99 : '2020-01-01T00:00:00Z',
          ),
          tokens.a,
        )

        expectDenied(response, `${table}: A updated B's row`)

        if (seeded) {
          expect(
            await ownedRow(table),
            `${table}: B's row changed despite the refusal`,
          ).toEqual(before)
        }
      })

      test('another user cannot delete it', async () => {
        const before = seeded ? await ownedRow(table) : []

        const response = await client.deleteAs(
          table,
          rowSelector(table, 'b', users.b.id),
          tokens.a,
        )

        expectDenied(response, `${table}: A deleted B's row`)

        if (seeded) {
          expect(
            await ownedRow(table),
            `${table}: B's row is gone despite the refusal`,
          ).toEqual(before)
        }
      })

      test('another user cannot forge a row for them', async () => {
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

  /**
   * Last in the serial describe, which is where the suite's own promise gets
   * kept: the run that just proved the policies is also the run that removes
   * everything it wrote. Asserted with the service role, because asking a test
   * user whether their rows are gone is a question RLS answers "no" to either
   * way.
   */
  test('leaves no persistent test data behind', async () => {
    const { deleted } = await reset(client)
    expect(deleted, `namespace '${NAMESPACE}' had users to remove`).toHaveLength(
      2,
    )

    for (const { table, seeded } of USER_TABLES) {
      if (!seeded) continue
      const survivors = await client.selectAsService(
        table,
        rowSelector(table, 'b', users.b.id),
      )
      expect(survivors.body, `${table}: rows outlived the run`).toEqual([])
    }

    for (const slot of ['a', 'b'] as const) {
      expect(
        await client.findUserByEmail(emailForSlot(slot)),
        `${emailForSlot(slot)} outlived the run`,
      ).toBeNull()
    }
  })
})
