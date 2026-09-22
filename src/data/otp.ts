/**
 * AUTH-02 — the two GoTrue calls AUTH-01 deliberately left out: send a one-time
 * code, and exchange one for a session.
 *
 * `auth.ts` owns the session; this owns getting one. It shares that module's
 * transport decision (`fetch`, not `supabase-js`) and its payload reader
 * (`sessionFromPayload`), so a verified code becomes exactly the session shape
 * the rest of the app already understands and is handed to `setSession`.
 *
 * The rule this module exists to keep is the requirement's second bullet: a
 * wrong or expired code shows a **typed, human error — never a raw Supabase
 * message.** So nothing GoTrue wrote ever reaches `message`. Every failure is
 * an `OtpError`: a closed `failure` union the screen can branch on, an
 * `ErrorCode` from the shared taxonomy, copy written here, and the wire's own
 * status and `error_code` kept in `details` where only a log can see them.
 *
 * Not here: anything about who the user is. A verified session goes to
 * `AuthClient.setSession` and this module forgets it.
 */

import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../state/errors'
import { sessionFromPayload, type AuthSession } from './auth'

// ─────────────────────────────────────────────────────────────────────────────
// Failures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every way the flow can fail, as a closed union. The screen branches on this
 * rather than on a message or a status code: "expired" offers a new code,
 * "invalid" asks for the digits again, and the two are different sentences.
 */
export type OtpFailure =
  | 'invalid-email'
  | 'invalid-code'
  | 'expired-code'
  | 'rate-limited'
  | 'offline'
  | 'server'

/** An `AppError` that also says which OTP failure it is. */
export interface OtpError extends AppError {
  readonly failure: OtpFailure
}

/**
 * The copy a person reads. Factual and imperative, never apologetic, and never
 * borrowed from the wire — "Token has expired or is invalid" is GoTrue talking
 * to a developer.
 */
const FAILURE_MESSAGES: Record<OtpFailure, string> = {
  'invalid-email': 'That is not an email address. Check it and try again.',
  'invalid-code': 'That code is not right. Check the digits and try again.',
  'expired-code': 'That code has expired. Request a new one.',
  'rate-limited': 'Too many attempts. Wait a moment, then try again.',
  offline: 'No connection. Check your network and try again.',
  server: 'Sign-in is unavailable right now. Try again in a moment.',
}

/** Where each failure sits in the shared taxonomy. */
const FAILURE_CODES: Record<OtpFailure, ErrorCode> = {
  'invalid-email': ErrorCode.VALIDATION_INVALID_FORMAT,
  'invalid-code': ErrorCode.AUTH_INVALID_CREDENTIALS,
  'expired-code': ErrorCode.AUTH_INVALID_CREDENTIALS,
  'rate-limited': ErrorCode.NETWORK_RATE_LIMITED,
  offline: ErrorCode.NETWORK_OFFLINE,
  server: ErrorCode.NETWORK_SERVER_ERROR,
}

/**
 * Builds the typed error. `message` is overridden deliberately: the taxonomy's
 * own line for `AUTH_INVALID_CREDENTIALS` is about a password, and this flow
 * has none.
 */
export function otpError(
  failure: OtpFailure,
  details?: Record<string, unknown>,
): OtpError {
  return {
    ...createError(FAILURE_CODES[failure], { details }),
    message: FAILURE_MESSAGES[failure],
    failure,
  }
}

/** The human sentence for a failure, without building an error to read it. */
export function otpFailureMessage(failure: OtpFailure): string {
  return FAILURE_MESSAGES[failure]
}

// ─────────────────────────────────────────────────────────────────────────────
// Input shapes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deliberately permissive: one `@`, something either side, a dot in the domain
 * and no spaces. The authority on whether an address exists is the mail that
 * either arrives or does not — a stricter pattern only rejects real addresses.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export function isEmailLike(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

/**
 * GoTrue emails a numeric code; its length is project configuration (six by
 * default, up to ten). Anything outside that cannot be a code, so it is refused
 * here rather than spent as an attempt against the rate limit.
 */
const CODE_PATTERN = /^\d{6,10}$/

export function isCodeLike(value: string): boolean {
  return CODE_PATTERN.test(value.trim())
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export interface OtpClientConfig {
  /** The project URL — `VITE_SUPABASE_URL`. */
  readonly url: string
  /** The public anon key — `VITE_SUPABASE_ANON_KEY`. */
  readonly anonKey: string
  /** Injected in tests; the global `fetch` otherwise. */
  readonly fetch?: typeof globalThis.fetch
  /** Injected in tests; `Date.now` otherwise. */
  readonly now?: () => number
}

export interface OtpClient {
  /** Asks GoTrue to email a code. Succeeds with nothing — the code is in the mail. */
  requestCode(email: string): Promise<Result<void, OtpError>>
  /** Exchanges a code for a session. The caller hands it to `AuthClient.setSession`. */
  verifyCode(email: string, code: string): Promise<Result<AuthSession, OtpError>>
}

/** Which call is being made — 400 means different things to each. */
type Call = 'request' | 'verify'

interface WireError {
  readonly status: number
  /** GoTrue's machine-readable reason, when it sent one. */
  readonly errorCode: string | null
}

const RATE_LIMIT_CODES = new Set([
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'over_sms_send_rate_limit',
])

/**
 * The wire's answer becomes one of the six failures. GoTrue says
 * `otp_expired` for a code that is wrong *or* stale — it will not distinguish
 * them — so that maps to `expired-code`, whose copy offers a new code and
 * covers both. A plain rejection with no `error_code` is treated as a wrong
 * code, which is what a 4xx on this endpoint means.
 */
export function failureFromWire(call: Call, { status, errorCode }: WireError): OtpFailure {
  if (status === 429 || (errorCode !== null && RATE_LIMIT_CODES.has(errorCode))) {
    return 'rate-limited'
  }
  if (errorCode === 'otp_expired') return 'expired-code'
  if (errorCode === 'validation_failed' || errorCode === 'email_address_invalid') {
    return call === 'request' ? 'invalid-email' : 'invalid-code'
  }
  if (status >= 500) return 'server'
  if (status === 400 || status === 401 || status === 403 || status === 422) {
    return call === 'request' ? 'invalid-email' : 'invalid-code'
  }
  return 'server'
}

function readErrorCode(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const record = payload as Record<string, unknown>
  // `error_code` is current; `error` is what older GoTrue versions send.
  for (const key of ['error_code', 'error']) {
    const value = record[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return null
}

export function createOtpClient(config: OtpClientConfig): OtpClient {
  const base = `${config.url.replace(/\/+$/, '')}/auth/v1`
  const fetchImpl = config.fetch ?? globalThis.fetch
  const now = config.now ?? (() => Date.now())

  async function post(
    call: Call,
    path: string,
    body: Record<string, unknown>,
  ): Promise<Result<unknown, OtpError>> {
    let response: Response
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (error) {
      // The request never landed, so nothing is known about the code.
      return err(
        otpError('offline', {
          reason: error instanceof Error ? error.message : String(error),
        }),
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      // An empty or unreadable body is only a problem when the call failed.
      payload = null
    }

    if (!response.ok) {
      const errorCode = readErrorCode(payload)
      return err(
        otpError(failureFromWire(call, { status: response.status, errorCode }), {
          status: response.status,
          // Kept for the log, never for the screen.
          errorCode,
        }),
      )
    }

    return ok(payload)
  }

  return {
    async requestCode(email) {
      const address = email.trim()
      if (!isEmailLike(address)) return err(otpError('invalid-email'))

      // `create_user` is the whole sign-up story: this app has one door, and a
      // first-time address walks through the same one.
      const sent = await post('request', '/otp', {
        email: address,
        create_user: true,
      })
      return sent.ok ? ok(undefined) : sent
    },

    async verifyCode(email, code) {
      const address = email.trim()
      const digits = code.trim()
      if (!isEmailLike(address)) return err(otpError('invalid-email'))
      if (!isCodeLike(digits)) return err(otpError('invalid-code'))

      const verified = await post('verify', '/verify', {
        email: address,
        token: digits,
        type: 'email',
      })
      if (!verified.ok) return verified

      const session = sessionFromPayload(verified.value, now())
      if (!session.ok) {
        // A 200 that is not a session is the server misbehaving, not a bad code.
        return err(otpError('server', { reason: 'unreadable-session' }))
      }
      return ok(session.value)
    },
  }
}
