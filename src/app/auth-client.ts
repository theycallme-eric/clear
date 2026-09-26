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
import {
  createLiveUserConstraintsClient,
  type UserConstraintsClient,
} from '../data/constraints'
import {
  createGenerationClient,
  unconfiguredGenerationClient,
  type GenerationClient,
} from '../data/generation'
import { createOtpClient, otpError, type OtpClient } from '../data/otp'
import { createRestDayClient, type RestDayClient } from '../data/rest-days'
import { configFromEnv } from '../data/supabase'
import { createSummaryClient, type SummaryClient } from '../data/summary'
import { createUserDataClient, type UserDataClient } from '../data/user-data'
import {
  createWorkoutClients,
  unconfiguredWorkoutClients,
  type WorkoutClients,
} from '../data/workout'
import {
  createError,
  err,
  ErrorCode,
  ok,
  type Result,
} from '../state/errors'
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

/** AUTH-03's reads and ONB-01's write, for a build that cannot reach the project. */
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
    async completeOnboarding() {
      return failure()
    },
    async updatePreferences() {
      return failure()
    },
    async locationEquipment() {
      return failure()
    },
    async saveLocation() {
      return failure()
    },
    async setDefaultLocation() {
      return failure()
    },
    async deleteLocation() {
      return failure()
    },
  }
}

/** SUM-01's two reads and its one write, for a build with no configuration. */
function unconfiguredSummaryClient(): SummaryClient {
  const failure = () =>
    err(
      createError(ErrorCode.VALIDATION_REQUIRED_FIELD, {
        details: { reason: 'missing-configuration' },
      }),
    )

  return {
    async latest() {
      return failure()
    },
    async streak() {
      return failure()
    },
    async saveDebrief() {
      return failure()
    },
  }
}

/** HOME-02's read and write, for a build with no project configuration. */
function unconfiguredRestDayClient(): RestDayClient {
  const failure = () =>
    err(
      createError(ErrorCode.VALIDATION_REQUIRED_FIELD, {
        details: { reason: 'missing-configuration' },
      }),
    )

  return {
    async recent() {
      return failure()
    },
    async mark() {
      return failure()
    },
  }
}

/** DATA-05's reads and writes, for a build that cannot reach the project. */
function unconfiguredUserConstraintsClient(): UserConstraintsClient {
  const failure = () =>
    err(
      createError(ErrorCode.VALIDATION_REQUIRED_FIELD, {
        details: { reason: 'missing-configuration' },
      }),
    )

  return {
    async add() {
      return failure()
    },
    async list() {
      return failure()
    },
    async listInForce() {
      return failure()
    },
    async remove() {
      return failure()
    },
    async setPatternNote() {
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
  /**
   * SUM-01's debrief. Built here for the same reason `userData` is: the token
   * it presents has to be the live one, and `auth` is what knows when it
   * rotated.
   */
  readonly summary: SummaryClient
  /** HOME-02's marked days, using the same rotating session token. */
  readonly restDays: RestDayClient
  /**
   * EXE-01's lifecycle and `block_results` writes. Built from the same `auth`
   * object for the same reason `userData` is: the token it presents has to be
   * the live one, and a workout outlives several of them.
   */
  readonly workout: WorkoutClients
  /**
   * DATA-05's constraints, and REQ-057's fourth boot check. Built here for the
   * same reason the others are: the token it presents has to be the live one.
   */
  readonly constraints: UserConstraintsClient
  /**
   * GEN-03's generation call, which HOME-01's Quick Start and GEN-04's screen
   * make. Built from the same `auth` object as the rest: it asks for the access
   * token per call, so a generation started after a refresh presents the live
   * one.
   */
  readonly generation: GenerationClient
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
      summary: unconfiguredSummaryClient(),
      restDays: unconfiguredRestDayClient(),
      workout: unconfiguredWorkoutClients(),
      constraints: unconfiguredUserConstraintsClient(),
      generation: unconfiguredGenerationClient(),
    }
    return clients
  }

  const auth = createAuthClient(config.value)

  clients = {
    auth,
    otp: createOtpClient(config.value),
    userData: createUserDataClient({ auth, supabase: config.value }),
    summary: createSummaryClient({ auth, supabase: config.value }),
    restDays: createRestDayClient({ auth, supabase: config.value }),
    workout: createWorkoutClients({ auth, supabase: config.value }),
    constraints: createLiveUserConstraintsClient({ auth, supabase: config.value }),
    generation: createGenerationClient({ auth, supabase: config.value }),
  }
  return clients
}

/** Test-only: forgets the built clients so the next call reads the env again. */
export function resetAppAuthClients(): void {
  clients = null
}
