/**
 * In-memory stand-ins for the two sign-in clients, for tests that need a
 * session without a network.
 *
 * `createFakeAuthClient` keeps the one behaviour the real client's subscribers
 * depend on: the settled event is replayed to whoever subscribes late, so a
 * provider mounted after the restore sees the same thing as one mounted before.
 */
import type {
  AuthClient,
  AuthEvent,
  AuthSession,
  AuthUser,
} from '../data/auth'
import type { OtpClient, OtpError } from '../data/otp'
import { otpError } from '../data/otp'
import { err, ok, type Result } from '../state/errors'

export interface FakeAuthClient extends AuthClient {
  /** Pushes an event to every subscriber, as GoTrue would. */
  emit(event: AuthEvent): void
  /** Whatever `setSession` was last handed. */
  readonly sessions: AuthSession[]
}

export function fakeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3_600_000,
    user: { id: 'user-1', email: 'lifter@example.test' },
    ...overrides,
  }
}

export interface FakeAuthOptions {
  /**
   * The event the restore settles on. Defaults to an anonymous initial
   * session; pass `null` to leave the client unsettled, which is what a
   * provider renders as `loading`.
   */
  readonly settled?: AuthEvent | null
}

export function createFakeAuthClient(options: FakeAuthOptions = {}): FakeAuthClient {
  const listeners = new Set<(event: AuthEvent) => void>()
  const sessions: AuthSession[] = []

  let settled: AuthEvent | null =
    options.settled === undefined
      ? { type: 'INITIAL_SESSION', session: null }
      : options.settled
  let current: AuthSession | null =
    settled !== null && 'session' in settled ? settled.session : null

  function emit(event: AuthEvent) {
    settled = event
    for (const listener of [...listeners]) listener(event)
  }

  return {
    sessions,
    emit,
    onAuthStateChange(handler) {
      listeners.add(handler)
      if (settled !== null) handler(settled)
      return {
        unsubscribe() {
          listeners.delete(handler)
        },
      }
    },
    async getSession(): Promise<Result<AuthSession | null>> {
      return ok(current)
    },
    setSession(session) {
      sessions.push(session)
      current = session
      emit({ type: 'SIGNED_IN', session })
    },
    async signOut(): Promise<Result<void>> {
      current = null
      emit({ type: 'SIGNED_OUT' })
      return ok(undefined)
    },
  }
}

/** An authenticated user, for a test about what a signed-in visitor sees. */
export function signedInEvent(user?: Partial<AuthUser>): AuthEvent {
  const session = fakeSession(
    user === undefined
      ? {}
      : { user: { id: 'user-1', email: 'lifter@example.test', ...user } },
  )
  return { type: 'INITIAL_SESSION', session }
}

export interface FakeOtpOptions {
  readonly requestCode?: (email: string) => Promise<Result<void, OtpError>>
  readonly verifyCode?: (
    email: string,
    code: string,
  ) => Promise<Result<AuthSession, OtpError>>
}

export interface FakeOtpClient extends OtpClient {
  readonly requests: string[]
  readonly verifications: { email: string; code: string }[]
}

/**
 * Defaults to refusing everything, so a test that reaches the network without
 * meaning to fails loudly rather than passing on a stub success.
 */
export function createFakeOtpClient(options: FakeOtpOptions = {}): FakeOtpClient {
  const requests: string[] = []
  const verifications: { email: string; code: string }[] = []

  return {
    requests,
    verifications,
    async requestCode(email) {
      requests.push(email)
      if (options.requestCode) return options.requestCode(email)
      return ok(undefined)
    },
    async verifyCode(email, code) {
      verifications.push({ email, code })
      if (options.verifyCode) return options.verifyCode(email, code)
      return err(otpError('invalid-code'))
    },
  }
}
