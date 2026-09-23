/**
 * AUTH-02 — the app's one auth client, and the OTP client beside it.
 *
 * Why a singleton when `supabase.ts` deliberately refused one: `auth.ts` keeps
 * the stored session, the settled restore event and the single in-flight token
 * exchange *inside the client*. Two clients would mean two restores and two
 * refresh exchanges of the same rotating token, which is the one thing that
 * module coordinates against. The sign-in screen and `AuthProvider` therefore
 * have to be holding the same object, and this is where that object is made.
 *
 * A build with no configuration does not crash the app. `configFromEnv` already
 * answers a typed error, so the clients it cannot build are replaced by ones
 * that fail every call the same typed way — the screen shows its error state,
 * the deploy-config gate and `npm run dev`'s preflight catch the actual cause.
 */
import {
  createAuthClient,
  type AuthClient,
  type AuthEvent,
  type AuthSession,
} from '../data/auth'
import { createOtpClient, otpError, type OtpClient } from '../data/otp'
import { configFromEnv } from '../data/supabase'
import { createUserDataClient, type UserDataClient } from '../data/user-data'
import { createError, err, ErrorCode, ok, type Result } from '../state/errors'
import { createLogger } from '../state/logger'

const logger = createLogger({ scope: 'app.auth-client' })

/**
 * A client for a build that has no Supabase configuration. It settles the
 * restore as anonymous so nothing waits forever, and refuses everything else.
 */
function unconfiguredAuthClient(): AuthClient {
  const initial: AuthEvent = { type: 'INITIAL_SESSION', session: null }

  return {
    onAuthStateChange(handler) {
      handler(initial)
      return { unsubscribe() {} }
    },
    async getSession(): Promise<Result<AuthSession | null>> {
      return ok(null)
    },
    setSession() {},
    async signOut(): Promise<Result<void>> {
      return ok(undefined)
    },
  }
}

function unconfiguredOtpClient(): OtpClient {
  const failure = () =>
    err(otpError('server', { reason: 'missing-configuration' }))

  return {
    async requestCode() {
      return failure()
    },
    async verifyCode() {
      return failure()
    },
  }
}

/** AUTH-03's reads, for a build that cannot reach the project at all. */
function unconfiguredUserDataClient(): UserDataClient {
  const failure = () =>
    err(
      createError(ErrorCode.VALIDATION_REQUIRED_FIELD, {
        details: { reason: 'missing-configuration' },
      }),
    )

  return {
    async profile() {
      return failure()
    },
    async locations() {
      return failure()
    },
  }
}

interface Clients {
  readonly auth: AuthClient
  readonly otp: OtpClient
  /**
   * AUTH-03's profile and locations reads. Built here rather than beside the
   * query cache because it needs the same `auth` object the provider
   * subscribed to — the access token it presents has to be the live one, and
   * `auth.ts` is the only thing that knows when that token rotated.
   */
  readonly userData: UserDataClient
}

let clients: Clients | null = null

/**
 * Both clients, built once from the environment. Exported as a function rather
 * than a constant so importing this module opens nothing and reads nothing —
 * a test that never signs in never touches the environment.
 */
export function appAuthClients(env: Record<string, unknown> = import.meta.env): Clients {
  if (clients !== null) return clients

  const config = configFromEnv(env)

  if (!config.ok) {
    logger.error('Supabase configuration is missing; sign-in is unavailable', {
      code: config.error.code,
      details: config.error.details,
    })
    clients = {
      auth: unconfiguredAuthClient(),
      otp: unconfiguredOtpClient(),
      userData: unconfiguredUserDataClient(),
    }
    return clients
  }

  const auth = createAuthClient(config.value)

  clients = {
    auth,
    otp: createOtpClient(config.value),
    userData: createUserDataClient({ auth, supabase: config.value }),
  }
  return clients
}

/** Test-only: forgets the built clients so the next call reads the env again. */
export function resetAppAuthClients(): void {
  clients = null
}
