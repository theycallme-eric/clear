/**
 * AUTH-01 — the auth client against a mocked transport and a mocked store.
 *
 * The sequence the requirement names is here end to end (signed out → in →
 * refresh → out), and so is the case D1 got wrong: a refresh that fails for a
 * reason that says nothing about the credential must leave the stored session
 * exactly where it is.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  createAuthClient,
  sessionFromPayload,
  type AuthEvent,
  type AuthSession,
  type AuthStorage,
} from './auth'
import { ErrorCode } from '../state/errors'

const URL_BASE = 'https://project.supabase.co'
const NOW = 1_800_000_000_000

function memoryStorage(initial: string | null = null): AuthStorage & { value: string | null } {
  return {
    value: initial,
    read() {
      return this.value
    },
    write(value: string) {
      this.value = value
    },
    remove() {
      this.value = null
    },
  }
}

function storedSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: NOW + 3_600_000,
    user: { id: 'user-1', email: 'lifter@example.test' },
    ...overrides,
  }
}

function tokenPayload(suffix: string) {
  return {
    access_token: `access-${suffix}`,
    refresh_token: `refresh-${suffix}`,
    expires_in: 3600,
    user: { id: 'user-1', email: 'lifter@example.test' },
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Lets the restore promise settle; the client starts it at construction. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function subscribe(client: ReturnType<typeof createAuthClient>) {
  const events: AuthEvent[] = []
  const subscription = client.onAuthStateChange((event) => events.push(event))
  return { events, subscription }
}

function makeClient(options: {
  storage?: AuthStorage
  fetch?: typeof globalThis.fetch
  now?: () => number
}) {
  return createAuthClient({
    url: URL_BASE,
    anonKey: 'anon-key',
    fetch: options.fetch ?? (vi.fn() as unknown as typeof globalThis.fetch),
    storage: options.storage ?? memoryStorage(),
    now: options.now ?? (() => NOW),
  })
}

describe('createAuthClient — restore', () => {
  it('reports anonymous when nothing is stored, without calling GoTrue', async () => {
    const fetchMock = vi.fn()
    const client = makeClient({ fetch: fetchMock as unknown as typeof globalThis.fetch })
    const { events } = subscribe(client)

    await flush()

    expect(events).toEqual([{ type: 'INITIAL_SESSION', session: null }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('restores a stored session that has not expired, without calling GoTrue', async () => {
    const session = storedSession()
    const fetchMock = vi.fn()
    const client = makeClient({
      storage: memoryStorage(JSON.stringify(session)),
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    const { events } = subscribe(client)

    await flush()

    expect(events).toEqual([{ type: 'INITIAL_SESSION', session }])
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(client.getSession()).resolves.toEqual({ ok: true, value: session })
  })

  it('refreshes a stored session that has expired and stores the new one', async () => {
    const storage = memoryStorage(
      JSON.stringify(storedSession({ expiresAt: NOW - 1_000 })),
    )
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenPayload('2')))
    const client = makeClient({ storage, fetch: fetchMock as unknown as typeof globalThis.fetch })
    const { events } = subscribe(client)

    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      `${URL_BASE}/auth/v1/token?grant_type=refresh_token`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ refresh_token: 'refresh-1' }) }),
    )
    expect(events).toEqual([
      {
        type: 'INITIAL_SESSION',
        session: {
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
          expiresAt: NOW + 3_600_000,
          user: { id: 'user-1', email: 'lifter@example.test' },
        },
      },
    ])
    expect(JSON.parse(storage.value ?? 'null')).toMatchObject({ accessToken: 'access-2' })
  })

  it('keeps the stored session when the refresh never reached GoTrue', async () => {
    const stored = JSON.stringify(storedSession({ expiresAt: NOW - 1_000 }))
    const storage = memoryStorage(stored)
    const client = makeClient({
      storage,
      fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof globalThis.fetch,
    })
    const { events } = subscribe(client)

    await flush()

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'RESTORE_FAILED', error: { code: ErrorCode.NETWORK_OFFLINE } })
    // The D1 regression: an unreachable server never signs anybody out.
    expect(storage.value).toBe(stored)
  })

  it('keeps the stored session when GoTrue answers 500', async () => {
    const stored = JSON.stringify(storedSession({ expiresAt: NOW - 1_000 }))
    const storage = memoryStorage(stored)
    const client = makeClient({
      storage,
      fetch: vi.fn().mockResolvedValue(new Response('', { status: 500 })) as unknown as typeof globalThis.fetch,
    })
    const { events } = subscribe(client)

    await flush()

    expect(events[0]).toMatchObject({
      type: 'RESTORE_FAILED',
      error: { code: ErrorCode.NETWORK_SERVER_ERROR },
    })
    expect(storage.value).toBe(stored)
  })

  it('discards the stored session only when GoTrue refuses the refresh token', async () => {
    const storage = memoryStorage(JSON.stringify(storedSession({ expiresAt: NOW - 1_000 })))
    const client = makeClient({
      storage,
      fetch: vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400)) as unknown as typeof globalThis.fetch,
    })
    const { events } = subscribe(client)

    await flush()

    expect(events).toEqual([{ type: 'INITIAL_SESSION', session: null }])
    expect(storage.value).toBeNull()
  })

  it('treats unreadable stored data as signed out and drops it', async () => {
    const storage = memoryStorage('{ not json')
    const fetchMock = vi.fn()
    const client = makeClient({ storage, fetch: fetchMock as unknown as typeof globalThis.fetch })
    const { events } = subscribe(client)

    await flush()

    expect(events).toEqual([{ type: 'INITIAL_SESSION', session: null }])
    expect(storage.value).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('replays the settled state to a subscriber that arrives later', async () => {
    const session = storedSession()
    const client = makeClient({ storage: memoryStorage(JSON.stringify(session)) })

    await flush()
    const { events } = subscribe(client)

    expect(events).toEqual([{ type: 'INITIAL_SESSION', session }])
  })
})

describe('createAuthClient — signed out → in → refresh → out', () => {
  it('walks the whole sequence and persists across a reload', async () => {
    const storage = memoryStorage()
    const fetchMock = vi.fn()
    let clock = NOW
    const client = makeClient({
      storage,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      now: () => clock,
    })
    const { events } = subscribe(client)
    await flush()
    expect(events).toEqual([{ type: 'INITIAL_SESSION', session: null }])

    // Signed in: AUTH-02 hands over the verified payload.
    const verified = sessionFromPayload(tokenPayload('1'), NOW)
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    client.setSession(verified.value)
    expect(events.at(-1)).toEqual({ type: 'SIGNED_IN', session: verified.value })

    // Reload: a second client over the same store adopts it with no call.
    const reloaded = makeClient({
      storage,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      now: () => clock,
    })
    const reloadedEvents = subscribe(reloaded).events
    await flush()
    expect(reloadedEvents).toEqual([{ type: 'INITIAL_SESSION', session: verified.value }])
    expect(fetchMock).not.toHaveBeenCalled()

    // Refreshed: the hour passes, so the next ask for a token exchanges it —
    // one call, and nothing else follows from it.
    clock = NOW + 3_600_000
    fetchMock.mockResolvedValueOnce(jsonResponse(tokenPayload('3')))
    await expect(reloaded.getSession()).resolves.toMatchObject({
      ok: true,
      value: { accessToken: 'access-3', user: verified.value.user },
    })
    expect(reloadedEvents.at(-1)).toMatchObject({ type: 'TOKEN_REFRESHED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Signed out.
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(reloaded.signOut()).resolves.toEqual({ ok: true, value: undefined })
    expect(reloadedEvents.at(-1)).toEqual({ type: 'SIGNED_OUT' })
    expect(storage.value).toBeNull()
  })

  it('exchanges the rotating refresh token once for concurrent callers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenPayload('4')))
    const client = makeClient({
      storage: memoryStorage(JSON.stringify(storedSession({ expiresAt: NOW - 1 }))),
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    const [first, second] = await Promise.all([client.getSession(), client.getSession()])

    expect(first).toEqual(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('signs out locally and reports the failure when revocation cannot be delivered', async () => {
    const storage = memoryStorage(JSON.stringify(storedSession()))
    const client = makeClient({
      storage,
      fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof globalThis.fetch,
    })
    const { events } = subscribe(client)
    await flush()

    const result = await client.signOut()

    expect(result).toMatchObject({ ok: false, error: { code: ErrorCode.NETWORK_OFFLINE } })
    expect(events.at(-1)).toEqual({ type: 'SIGNED_OUT' })
    expect(storage.value).toBeNull()
    await expect(client.getSession()).resolves.toEqual({ ok: true, value: null })
  })

  it('sends the access token to the logout endpoint and accepts an already dead token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    const client = makeClient({
      storage: memoryStorage(JSON.stringify(storedSession())),
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    await flush()

    await expect(client.signOut()).resolves.toEqual({ ok: true, value: undefined })
    expect(fetchMock).toHaveBeenCalledWith(
      `${URL_BASE}/auth/v1/logout`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-1' }),
      }),
    )
  })

  it('signs the user out when a token refresh is refused mid-session', async () => {
    const storage = memoryStorage(JSON.stringify(storedSession()))
    let clock = NOW
    const client = makeClient({
      storage,
      fetch: vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 401)) as unknown as typeof globalThis.fetch,
      now: () => clock,
    })
    const { events } = subscribe(client)
    await flush()

    // Past the stored expiry, so the next getSession must exchange.
    clock = NOW + 7_200_000
    const result = await client.getSession()

    expect(result).toMatchObject({ ok: false, error: { code: ErrorCode.AUTH_SESSION_EXPIRED } })
    expect(events.at(-1)).toEqual({ type: 'SIGNED_OUT' })
    expect(storage.value).toBeNull()
  })

  it('stops telling a subscriber that has unsubscribed', async () => {
    const client = makeClient({ storage: memoryStorage() })
    const { events, subscription } = subscribe(client)
    await flush()
    subscription.unsubscribe()

    client.setSession(storedSession())

    expect(events).toEqual([{ type: 'INITIAL_SESSION', session: null }])
  })
})

describe('sessionFromPayload', () => {
  it('derives the expiry from expires_in when expires_at is absent', () => {
    const result = sessionFromPayload(tokenPayload('9'), NOW)

    expect(result).toEqual({
      ok: true,
      value: {
        accessToken: 'access-9',
        refreshToken: 'refresh-9',
        expiresAt: NOW + 3_600_000,
        user: { id: 'user-1', email: 'lifter@example.test' },
      },
    })
  })

  it('prefers expires_at, which GoTrue reports in seconds', () => {
    const result = sessionFromPayload(
      { ...tokenPayload('9'), expires_at: (NOW + 60_000) / 1000 },
      NOW,
    )

    expect(result.ok && result.value.expiresAt).toBe(NOW + 60_000)
  })

  it.each([
    ['not an object', 42],
    ['a payload with no tokens', { user: { id: 'user-1' } }],
    ['a payload with no user', tokenPayloadWithoutUser()],
  ])('refuses %s with a typed error', (_label, payload) => {
    const result = sessionFromPayload(payload, NOW)

    expect(result).toMatchObject({ ok: false, error: { code: ErrorCode.NETWORK_SERVER_ERROR } })
  })
})

function tokenPayloadWithoutUser() {
  const payload: Record<string, unknown> = { ...tokenPayload('9') }
  delete payload.user
  return payload
}
