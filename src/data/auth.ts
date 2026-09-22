/**
 * AUTH-01 — the session half of Supabase, and only that half.
 *
 * DATA-03 declined `supabase-js` and spoke PostgREST over `fetch`; this is the
 * same trade for GoTrue's three session endpoints. What it buys here is not
 * bundle size but control over the one behaviour D1 got wrong: what happens
 * when a stored session cannot be revalidated.
 *
 * The rules this module exists to keep:
 *
 *   1. **A failure is never a sign-out.** A refresh refused by GoTrue means the
 *      token is dead and the stored session goes; a refresh that never reached
 *      GoTrue means nothing about the user, so the stored session stays and the
 *      subscriber is told `RESTORE_FAILED`. D1 reset onboarded users because it
 *      could not tell those two apart.
 *   2. **No clock.** Nothing here schedules anything. A token is refreshed when
 *      somebody asks for one and the one in hand has expired — so a background
 *      timer can never wake an unused tab, and `AuthProvider` needs no guard
 *      against a refresh landing after unmount.
 *   3. **Every failure is an `AppError`.** Nothing throws, and a network
 *      failure does not read as a rejected credential.
 *
 * Not here, deliberately: sending and verifying the one-time code (AUTH-02 adds
 * those calls and hands the verified payload to `setSession`), and anything
 * about a profile — this module knows a user id and an email and nothing else.
 */

import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../state/errors'

// ─────────────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────────────

/** Everything the app may know about who is signed in. */
export interface AuthUser {
  readonly id: string
  /** GoTrue allows a user with no email (never in this app's OTP flow). */
  readonly email: string | null
}

export interface AuthSession {
  readonly accessToken: string
  readonly refreshToken: string
  /** Unix milliseconds. GoTrue reports seconds; `sessionFromPayload` converts. */
  readonly expiresAt: number
  readonly user: AuthUser
}

/**
 * What a subscriber is told, as a discriminated union rather than a name and a
 * nullable session. `SIGNED_OUT` and `RESTORE_FAILED` both leave the app
 * without a user, and the difference between them is the whole requirement:
 * one is a decision, the other is a failure, and only one of them may send an
 * onboarded user back to the start.
 */
export type AuthEvent =
  /** Replayed to every new subscriber: the state restore settled on. */
  | { readonly type: 'INITIAL_SESSION'; readonly session: AuthSession | null }
  | { readonly type: 'SIGNED_IN'; readonly session: AuthSession }
  | { readonly type: 'TOKEN_REFRESHED'; readonly session: AuthSession }
  | { readonly type: 'SIGNED_OUT' }
  /** The stored session survived; it could not be revalidated right now. */
  | { readonly type: 'RESTORE_FAILED'; readonly error: AppError }

export interface AuthSubscription {
  unsubscribe(): void
}

export interface AuthClient {
  /**
   * Subscribes to session changes. A subscriber that arrives after the restore
   * has settled is told the current state immediately, so mounting order never
   * decides what a provider sees.
   */
  onAuthStateChange(handler: (event: AuthEvent) => void): AuthSubscription
  /**
   * The live session, refreshed first if its access token has expired. The one
   * way anything in `src/` obtains a token for `createSupabaseClient`.
   */
  getSession(): Promise<Result<AuthSession | null>>
  /** AUTH-02's seam: a verified one-time code becomes the live session. */
  setSession(session: AuthSession): void
  /**
   * Ends the session locally and then revokes it. Local first and
   * unconditionally: a user who asks to sign out on a dead connection is
   * signed out, and the returned error is about the revocation alone.
   */
  signOut(): Promise<Result<void>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

/** The session's home across reloads. Injected in tests; `localStorage` in the app. */
export interface AuthStorage {
  read(): string | null
  write(value: string): void
  remove(): void
}

export const SESSION_STORAGE_KEY = 'clear.auth.session'

/**
 * `localStorage`, or nothing at all. Safari in private mode throws on write and
 * an embedded context may deny access outright; a session that cannot be
 * persisted is a session that ends with the tab, which is degraded but correct.
 */
export function browserAuthStorage(key: string = SESSION_STORAGE_KEY): AuthStorage {
  const store = (): Storage | null => {
    try {
      return globalThis.localStorage ?? null
    } catch {
      return null
    }
  }

  return {
    read() {
      try {
        return store()?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    write(value) {
      try {
        store()?.setItem(key, value)
      } catch {
        // Nothing to do and nothing to report: the session still works in memory.
      }
    },
    remove() {
      try {
        store()?.removeItem(key)
      } catch {
        // As above.
      }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthClientConfig {
  /** The project URL — `VITE_SUPABASE_URL`, as `configFromEnv` reads it. */
  readonly url: string
  /** The public anon key — `VITE_SUPABASE_ANON_KEY`. */
  readonly anonKey: string
  /** Injected in tests; the global `fetch` otherwise. */
  readonly fetch?: typeof globalThis.fetch
  /** Injected in tests; `localStorage` otherwise. */
  readonly storage?: AuthStorage
  /**
   * How long before its stated expiry a token is treated as expired, in
   * seconds. Not a timer — a margin, so a token cannot expire in flight.
   */
  readonly expiryMarginSeconds?: number
  /** Injected in tests; `Date.now` otherwise. */
  readonly now?: () => number
}

const DEFAULT_EXPIRY_MARGIN_SECONDS = 60

// ─────────────────────────────────────────────────────────────────────────────
// Wire → session
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function malformed(details: Record<string, unknown>): AppError {
  return createError(ErrorCode.NETWORK_SERVER_ERROR, { details })
}

/**
 * A GoTrue token response becomes a session, or a typed error. Exported because
 * AUTH-02's verify call answers with exactly this payload and must not
 * re-implement reading it.
 */
export function sessionFromPayload(payload: unknown, nowMs: number): Result<AuthSession> {
  if (!isRecord(payload)) return err(malformed({ reason: 'not-an-object' }))

  const accessToken = payload.access_token
  const refreshToken = payload.refresh_token
  const user = payload.user

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    return err(malformed({ reason: 'missing-tokens' }))
  }
  if (!isRecord(user) || typeof user.id !== 'string') {
    return err(malformed({ reason: 'missing-user' }))
  }

  // `expires_at` is authoritative when present; `expires_in` is what a fresh
  // exchange always carries. Neither means the token is already stale.
  const expiresAt =
    typeof payload.expires_at === 'number'
      ? payload.expires_at * 1000
      : typeof payload.expires_in === 'number'
        ? nowMs + payload.expires_in * 1000
        : nowMs

  return ok({
    accessToken,
    refreshToken,
    expiresAt,
    user: { id: user.id, email: typeof user.email === 'string' ? user.email : null },
  })
}

/** The stored form, written by this module and read only by it. */
function sessionFromStorage(raw: string): AuthSession | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null
  const { accessToken, refreshToken, expiresAt, user } = parsed
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null
  if (typeof expiresAt !== 'number') return null
  if (!isRecord(user) || typeof user.id !== 'string') return null

  return {
    accessToken,
    refreshToken,
    expiresAt,
    user: { id: user.id, email: typeof user.email === 'string' ? user.email : null },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export function createAuthClient(config: AuthClientConfig): AuthClient {
  const base = `${config.url.replace(/\/+$/, '')}/auth/v1`
  const fetchImpl = config.fetch ?? globalThis.fetch
  const storage = config.storage ?? browserAuthStorage()
  const now = config.now ?? (() => Date.now())
  const marginMs = (config.expiryMarginSeconds ?? DEFAULT_EXPIRY_MARGIN_SECONDS) * 1000

  let session: AuthSession | null = null
  /**
   * The last event describing the current state, replayed to a late
   * subscriber. Null until the restore settles — which is what keeps
   * `AuthProvider` in `loading` rather than briefly claiming anonymous.
   */
  let settled: AuthEvent | null = null
  /**
   * The single in-flight refresh. GoTrue rotates refresh tokens, so two
   * concurrent exchanges of the same token mean the second one is refused and a
   * live session is thrown away. This is the one place that coordination
   * belongs: one client, one token, one exchange — and it is why the React
   * provider needs no guard of its own.
   */
  let exchanging: Promise<Result<AuthSession>> | null = null

  const listeners = new Set<(event: AuthEvent) => void>()

  function emit(event: AuthEvent): void {
    settled = event
    // A copy: a handler may unsubscribe while being told.
    for (const listener of [...listeners]) listener(event)
  }

  function persist(next: AuthSession): void {
    session = next
    storage.write(JSON.stringify(next))
  }

  function forget(): void {
    session = null
    storage.remove()
  }

  const expired = (candidate: AuthSession): boolean => candidate.expiresAt - marginMs <= now()

  async function exchange(refreshToken: string): Promise<Result<AuthSession>> {
    let response: Response
    try {
      response = await fetchImpl(`${base}/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
    } catch (error) {
      return err(
        createError(ErrorCode.NETWORK_OFFLINE, {
          details: { reason: error instanceof Error ? error.message : String(error) },
        }),
      )
    }

    // The only answer that means the session is over. Everything else — a 500,
    // a proxy's 502, a rate limit — means "ask again", never "sign them out".
    if (response.status === 400 || response.status === 401) {
      return err(createError(ErrorCode.AUTH_SESSION_EXPIRED, { details: { status: response.status } }))
    }
    if (response.status === 429) {
      return err(createError(ErrorCode.NETWORK_RATE_LIMITED, { details: { status: response.status } }))
    }
    if (!response.ok) {
      return err(createError(ErrorCode.NETWORK_SERVER_ERROR, { details: { status: response.status } }))
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return err(malformed({ status: response.status, reason: 'unreadable-body' }))
    }

    const parsed = sessionFromPayload(payload, now())
    if (parsed.ok) persist(parsed.value)
    return parsed
  }

  function refresh(from: AuthSession): Promise<Result<AuthSession>> {
    if (exchanging === null) {
      const pending = exchange(from.refreshToken)
      exchanging = pending
      void pending.then(() => {
        exchanging = null
      })
    }
    return exchanging
  }

  /**
   * Reload lands here. A stored session that is still good is simply adopted —
   * no call, no spinner beyond the first paint.
   */
  async function restore(): Promise<AuthEvent> {
    const raw = storage.read()
    if (raw === null) return { type: 'INITIAL_SESSION', session: null }

    const stored = sessionFromStorage(raw)
    if (stored === null) {
      // Unreadable is not recoverable and not a failure to report: nothing can
      // be done with it, so the app starts signed out and the key goes.
      storage.remove()
      return { type: 'INITIAL_SESSION', session: null }
    }

    if (!expired(stored)) {
      session = stored
      return { type: 'INITIAL_SESSION', session: stored }
    }

    const refreshed = await refresh(stored)
    if (refreshed.ok) return { type: 'INITIAL_SESSION', session: refreshed.value }

    if (refreshed.error.code === ErrorCode.AUTH_SESSION_EXPIRED) {
      forget()
      return { type: 'INITIAL_SESSION', session: null }
    }

    // The D1 fix, in three lines: the session is kept, the app is told the
    // restore failed, and nobody downstream may read this as a new user.
    session = stored
    return { type: 'RESTORE_FAILED', error: refreshed.error }
  }

  const ready = restore().then((event) => {
    emit(event)
    return event
  })

  return {
    onAuthStateChange(handler) {
      listeners.add(handler)
      if (settled !== null) handler(settled)
      return {
        unsubscribe() {
          listeners.delete(handler)
        },
      }
    },

    async getSession() {
      await ready
      if (session === null) return ok(null)
      if (!expired(session)) return ok(session)

      const refreshed = await refresh(session)
      if (refreshed.ok) {
        emit({ type: 'TOKEN_REFRESHED', session: refreshed.value })
        return ok(refreshed.value)
      }
      if (refreshed.error.code === ErrorCode.AUTH_SESSION_EXPIRED) {
        forget()
        emit({ type: 'SIGNED_OUT' })
      }
      return refreshed
    },

    setSession(next) {
      persist(next)
      emit({ type: 'SIGNED_IN', session: next })
    },

    async signOut() {
      const current = session
      forget()
      emit({ type: 'SIGNED_OUT' })
      if (current === null) return ok(undefined)

      let response: Response
      try {
        response = await fetchImpl(`${base}/logout`, {
          method: 'POST',
          headers: { apikey: config.anonKey, Authorization: `Bearer ${current.accessToken}` },
        })
      } catch (error) {
        return err(
          createError(ErrorCode.NETWORK_OFFLINE, {
            details: { reason: error instanceof Error ? error.message : String(error) },
          }),
        )
      }

      // 401/404: the token was already dead, so there was nothing to revoke.
      if (response.ok || response.status === 401 || response.status === 404) return ok(undefined)

      return err(createError(ErrorCode.NETWORK_SERVER_ERROR, { details: { status: response.status } }))
    },
  }
}
