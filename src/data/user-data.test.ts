/**
 * AUTH-03 — the two reads, against a recorded `fetch`.
 *
 * Deliberately not the `user_constraints` double: what is under test here is
 * not a table's rules but the four decisions this module makes — which rows it
 * asks for, which token it presents, what "no row" means, and what happens to a
 * row the schema refuses. The last two are the ones the guards depend on.
 */
import { describe, expect, it, vi } from 'vitest'

import { ErrorCode, ok, type Result } from '../state/errors'
import type { AuthSession } from './auth'
import { createUserDataClient } from './user-data'

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const USER_ID = '00000000-0000-4000-8000-000000000001'
const TIMESTAMP = '2026-09-22T09:00:00.000Z'

const PROFILE_ROW = {
  id: USER_ID,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  experience_level: 'some',
  goal_preset: 'balanced',
  enabled_sections: ['warmup', 'primary_lift'],
  weight_unit: 'kg',
  onboarded_at: TIMESTAMP,
}

const LOCATION_ROW = {
  id: '00000000-0000-4000-8000-000000000010',
  user_id: USER_ID,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  name: 'Home',
  tier: 'minimal',
  is_default: true,
}

function session(accessToken = 'access-token'): AuthSession {
  return {
    accessToken,
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3_600_000,
    user: { id: USER_ID, email: 'lifter@example.test' },
  }
}

interface Responder {
  (url: string): { status: number; body: unknown }
}

function harness(
  respond: Responder,
  getSession: () => Promise<Result<AuthSession | null>> = async () => ok(session()),
) {
  const calls: { url: string; authorization: string | undefined }[] = []

  const fetchImpl = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, authorization: headers.Authorization })
    const { status, body } = respond(url)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  const client = createUserDataClient({
    auth: { getSession },
    supabase: { url: URL_, anonKey: ANON_KEY, fetch: fetchImpl },
  })

  return { client, calls }
}

describe('profile', () => {
  it('reads the caller’s own row and parses it', async () => {
    const { client, calls } = harness(() => ({ status: 200, body: [PROFILE_ROW] }))

    const result = await client.profile(USER_ID)

    expect(result).toEqual(ok(PROFILE_ROW))
    // `profiles.id` is the auth user id — there is no `user_id` column.
    expect(calls[0]?.url).toContain('/rest/v1/profiles?')
    expect(calls[0]?.url).toContain(`id=eq.${USER_ID}`)
    expect(calls[0]?.url).toContain('limit=1')
  })

  it('answers null for a user who has no row, and it is not an error', async () => {
    const { client } = harness(() => ({ status: 200, body: [] }))

    expect(await client.profile(USER_ID)).toEqual(ok(null))
  })

  it('answers a typed error for a 500 — never an absent profile', async () => {
    const { client } = harness(() => ({ status: 500, body: { message: 'boom' } }))

    const result = await client.profile(USER_ID)

    expect(result.ok).toBe(false)
    // The distinction the guards route on: this is not `ok(null)`.
    expect(result).not.toEqual(ok(null))
  })

  it('answers a typed error for a row the schema refuses', async () => {
    const { client } = harness(() => ({
      status: 200,
      // `enabled_sections` may not be empty (the table's own CHECK).
      body: [{ ...PROFILE_ROW, enabled_sections: [] }],
    }))

    const result = await client.profile(USER_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
  })

  it('refuses before the network when there is no session', async () => {
    const { client, calls } = harness(
      () => ({ status: 200, body: [PROFILE_ROW] }),
      async () => ok(null),
    )

    const result = await client.profile(USER_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(calls).toEqual([])
  })

  it('presents the token the session holds now, not the one it held before', async () => {
    let current = 'first-token'
    const { client, calls } = harness(
      () => ({ status: 200, body: [PROFILE_ROW] }),
      async () => ok(session(current)),
    )

    await client.profile(USER_ID)
    current = 'rotated-token'
    await client.profile(USER_ID)

    expect(calls.map((call) => call.authorization)).toEqual([
      'Bearer first-token',
      'Bearer rotated-token',
    ])
  })
})

describe('locations', () => {
  it('reads the user’s locations, default first', async () => {
    const { client, calls } = harness(() => ({ status: 200, body: [LOCATION_ROW] }))

    expect(await client.locations(USER_ID)).toEqual(ok([LOCATION_ROW]))
    expect(calls[0]?.url).toContain('/rest/v1/locations?')
    expect(calls[0]?.url).toContain(`user_id=eq.${USER_ID}`)
    expect(decodeURIComponent(calls[0]?.url ?? '')).toContain('is_default.desc,name.asc')
  })

  it('answers an empty list, not an error, for a user with none', async () => {
    const { client } = harness(() => ({ status: 200, body: [] }))

    expect(await client.locations(USER_ID)).toEqual(ok([]))
  })

  it('answers a typed error for a 500', async () => {
    const { client } = harness(() => ({ status: 500, body: { message: 'boom' } }))

    expect((await client.locations(USER_ID)).ok).toBe(false)
  })

  it('does not share a request with the profile read', async () => {
    const { client, calls } = harness((url) => ({
      status: 200,
      body: url.includes('profiles') ? [PROFILE_ROW] : [LOCATION_ROW],
    }))

    const [profile, locations] = await Promise.all([
      client.profile(USER_ID),
      client.locations(USER_ID),
    ])

    expect(profile.ok).toBe(true)
    expect(locations.ok).toBe(true)
    // Two reads, two requests: neither is a projection of one combined call,
    // so neither can fail because the other did.
    expect(calls).toHaveLength(2)
  })
})
