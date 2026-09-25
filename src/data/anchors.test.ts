/**
 * OVR-01a, the query half: reading the evidence and writing what it supports.
 *
 * What these cover is everything between the rows and the arithmetic — which
 * call is made, that the derivation is what gets written, that recomputation
 * replaces rather than accumulates, that running it twice against unchanged
 * history is a no-op, and that a failed read surfaces as a typed error rather
 * than as an empty set of anchors. The arithmetic itself is
 * `src/state/anchors.test.ts`; the SQL is
 * `src/test/load-anchors-migration.test.ts`.
 */
import { describe, expect, it } from 'vitest'

import { ok, ErrorCode, isErr } from '../state/errors'
import type { AnchorEvidenceRow, LoadAnchorRow } from '../state/schemas'
import { fakeSession } from '../test/auth-double'
import { createAnchorsDouble } from '../test/anchors-double'
import { createAnchorsClient } from './anchors'

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const TOKEN = 'user-token'
const USER = 'a0000001-0000-4000-8000-000000000000'
const OTHER_USER = 'a0000002-0000-4000-8000-000000000000'

function setup(
  evidence: readonly AnchorEvidenceRow[],
  options: {
    anchors?: readonly LoadAnchorRow[]
    signedIn?: boolean
    failWith?: number
  } = {},
) {
  const double = createAnchorsDouble({
    url: URL_,
    anonKey: ANON_KEY,
    users: { [TOKEN]: USER },
    evidence: { [USER]: evidence },
    anchors: options.anchors,
    failWith: options.failWith,
  })

  const client = createAnchorsClient({
    auth: {
      getSession: async () =>
        ok(options.signedIn === false ? null : fakeSession({ accessToken: TOKEN })),
    },
    supabase: { url: URL_, anonKey: ANON_KEY, fetch: double.fetch },
  })

  return { client, double }
}

/** One working set of evidence, as `anchor_evidence` would answer it. */
function set(overrides: Partial<AnchorEvidenceRow> = {}): AnchorEvidenceRow {
  return {
    session_id: 'c0000001-0000-4000-8000-000000000000',
    session_date: '2026-09-01',
    logged_at: '2026-09-01T10:00:00.000Z',
    exercise_id: 'back-squat',
    equipment_used: 'barbell',
    set_number: 1,
    actual_reps: 5,
    prescribed_reps: 5,
    weight: 100,
    weight_unit: 'lb',
    rpe: 8,
    ...overrides,
  }
}

describe('reading the evidence (OVR-01a)', () => {
  it('asks the function, not the tables — the exclusions live in SQL', async () => {
    const { client, double } = setup([set()])

    const evidence = await client.evidence(USER)

    expect(isErr(evidence)).toBe(false)
    expect(double.requests().map((request) => request.path)).toEqual([
      '/rpc/anchor_evidence',
    ])
    expect(double.requests()[0].body).toEqual({ p_user_id: USER })
  })

  it('answers a typed error when the read fails', async () => {
    const { client } = setup([set()], { failWith: 500 })

    const evidence = await client.evidence(USER)

    expect(isErr(evidence)).toBe(true)
  })

  it('refuses before the round trip when nobody is signed in', async () => {
    const { client, double } = setup([set()], { signedIn: false })

    const evidence = await client.evidence(USER)

    expect(isErr(evidence) && evidence.error.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(double.requests()).toEqual([])
  })
})

describe('recomputation (OVR-01a)', () => {
  const history = [
    set({
      session_id: 'c0000001-0000-4000-8000-000000000000',
      session_date: '2026-09-01',
      weight: 100,
    }),
    set({
      session_id: 'c0000002-0000-4000-8000-000000000000',
      session_date: '2026-09-08',
      weight: 110,
    }),
  ]

  it('writes the anchors the evidence derives, with their unit and confidence', async () => {
    const { client, double } = setup(history)

    const written = await client.recompute(USER)

    expect(isErr(written)).toBe(false)
    expect(double.rows()).toHaveLength(1)
    expect(double.rows()[0]).toMatchObject({
      user_id: USER,
      exercise_id: 'back-squat',
      equipment_used: 'barbell',
      unit: 'lb',
      confidence: 'medium',
      session_count: 2,
      last_session_date: '2026-09-08',
    })
    expect(double.rows()[0].anchor_value).toBeGreaterThan(110)
  })

  it('stores the anchor in the unit of the most recent evidence, converting the rest', async () => {
    // Logged in pounds in September, kilograms in October. The stored row is in
    // kilograms — the unit travels with the evidence, never from the profile —
    // and the pounds session is converted before it is averaged in, so the
    // anchor lands near the kilogram sets rather than near 225.
    const { client, double } = setup([
      set({
        session_id: 'c0000001-0000-4000-8000-000000000000',
        session_date: '2026-09-01',
        weight: 225,
        weight_unit: 'lb',
      }),
      set({
        session_id: 'c0000002-0000-4000-8000-000000000000',
        session_date: '2026-10-01',
        weight: 102.5,
        weight_unit: 'kg',
      }),
    ])

    const written = await client.recompute(USER)

    expect(isErr(written)).toBe(false)
    expect(double.rows()[0]).toMatchObject({ unit: 'kg', session_count: 2 })
    // 102.5 kg and 225 lb (~102.06 kg) are within a kilogram of each other, so
    // whatever the weighting does the anchor stays in the kilogram range. A row
    // that had stored the bare pound number would be far above this.
    expect(double.rows()[0].anchor_value).toBeGreaterThan(102.5)
    expect(double.rows()[0].anchor_value).toBeLessThan(130)
  })

  it('reads before it writes, in that order', async () => {
    const { client, double } = setup(history)

    await client.recompute(USER)

    expect(double.requests().map((request) => request.path)).toEqual([
      '/rpc/anchor_evidence',
      '/rpc/set_load_anchors',
    ])
  })

  it('is idempotent: the second run against the same history changes nothing', async () => {
    const { client, double } = setup(history)

    const first = await client.recompute(USER)
    const second = await client.recompute(USER)

    expect(isErr(first) || isErr(second)).toBe(false)
    expect(!isErr(first) && !isErr(second) && first.value).toEqual(
      !isErr(second) && second.value,
    )
    expect(double.rows()).toHaveLength(1)
  })

  it('removes an anchor the logs no longer support', async () => {
    const { client, double } = setup([], {
      anchors: [
        {
          user_id: USER,
          exercise_id: 'deadlift',
          equipment_used: 'barbell',
          anchor_value: 315,
          unit: 'lb',
          confidence: 'high',
          session_count: 4,
          last_session_date: '2026-08-01',
          updated_at: '2026-08-01T10:00:00.000Z',
        },
      ],
    })

    const written = await client.recompute(USER)

    expect(isErr(written)).toBe(false)
    expect(double.rows()).toEqual([])
  })

  it('writes nothing for another user, whatever it is asked', async () => {
    const { client, double } = setup(history)

    const written = await client.recompute(OTHER_USER)

    expect(isErr(written)).toBe(true)
    expect(double.rows()).toEqual([])
  })

  it('surfaces a failed write rather than reporting anchors it did not store', async () => {
    const { client } = setup(history, { failWith: 500 })

    expect(isErr(await client.recompute(USER))).toBe(true)
  })
})

describe('reading the stored anchors (OVR-01a)', () => {
  it('answers the rows the caller owns, ordered by exercise', async () => {
    const stored: LoadAnchorRow = {
      user_id: USER,
      exercise_id: 'back-squat',
      equipment_used: 'barbell',
      anchor_value: 285,
      unit: 'lb',
      confidence: 'high',
      session_count: 5,
      last_session_date: '2026-09-20',
      updated_at: '2026-09-20T10:00:00.000Z',
    }
    const { client, double } = setup([], { anchors: [stored] })

    const anchors = await client.list(USER)

    expect(!isErr(anchors) && anchors.value).toEqual([stored])
    expect(double.requests()[0].path).toBe('/load_anchors')
  })

  it('is an empty list, not an error, for a user with no history', async () => {
    const { client } = setup([])

    const anchors = await client.list(USER)

    expect(!isErr(anchors) && anchors.value).toEqual([])
  })
})
