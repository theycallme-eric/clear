/**
 * CLEAR Error Taxonomy
 *
 * A typed error union that replaces stringly-typed errors. Every AppError
 * carries a code, an optional requestId (for edge function calls), and a
 * user-safe message.
 *
 * Categories:
 * - AUTH_*: Authentication and authorization failures
 * - NETWORK_*: Connectivity and transport failures
 * - VALIDATION_*: Input validation failures
 * - GENERATION_*: Workout generation failures
 * - PERSISTENCE_*: Data storage failures
 */

// ─────────────────────────────────────────────────────────────────────────────
// Error Codes
// ─────────────────────────────────────────────────────────────────────────────

export const ErrorCode = {
  // Auth errors
  AUTH_UNAUTHENTICATED: 'AUTH_UNAUTHENTICATED',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',

  // Network errors
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_SERVER_ERROR: 'NETWORK_SERVER_ERROR',
  NETWORK_RATE_LIMITED: 'NETWORK_RATE_LIMITED',

  // Validation errors
  VALIDATION_REQUIRED_FIELD: 'VALIDATION_REQUIRED_FIELD',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
  VALIDATION_OUT_OF_RANGE: 'VALIDATION_OUT_OF_RANGE',
  VALIDATION_CONSTRAINT: 'VALIDATION_CONSTRAINT',

  // Generation errors
  GENERATION_FAILED: 'GENERATION_FAILED',
  GENERATION_TIMEOUT: 'GENERATION_TIMEOUT',
  GENERATION_INVALID_PARAMS: 'GENERATION_INVALID_PARAMS',
  GENERATION_MODEL_ERROR: 'GENERATION_MODEL_ERROR',

  // Persistence errors
  PERSISTENCE_NOT_FOUND: 'PERSISTENCE_NOT_FOUND',
  PERSISTENCE_CONFLICT: 'PERSISTENCE_CONFLICT',
  PERSISTENCE_WRITE_FAILED: 'PERSISTENCE_WRITE_FAILED',
  PERSISTENCE_READ_FAILED: 'PERSISTENCE_READ_FAILED',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

// ─────────────────────────────────────────────────────────────────────────────
// Request ID
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request ID format: `req_<timestamp-base36>_<random-base36>`
 *
 * Example: `req_lxyz123_a1b2c3`
 *
 * - Prefix `req_` for visual identification in logs
 * - Timestamp portion: milliseconds since epoch, base36 encoded
 * - Random portion: 6 random alphanumeric characters, base36 encoded
 *
 * The same ID is:
 * 1. Generated client-side before calling an edge function
 * 2. Sent to the edge function as a header or parameter
 * 3. Returned by the edge function in the response
 * 4. Attached to any error for correlation
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `req_${timestamp}_${random}`
}

// ─────────────────────────────────────────────────────────────────────────────
// AppError Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The base error structure. All errors carry:
 * - code: A typed error code from the ErrorCode enum
 * - message: A user-safe message suitable for display
 * - requestId: Optional correlation ID for edge function calls
 * - details: Optional machine-readable details for debugging
 */
export interface AppError {
  readonly code: ErrorCode
  readonly message: string
  readonly requestId?: string
  readonly details?: Record<string, unknown>
}

/**
 * Creates a typed AppError. Use this instead of `throw new Error("string")`.
 */
export function createError(
  code: ErrorCode,
  options?: {
    requestId?: string
    details?: Record<string, unknown>
  }
): AppError {
  return {
    code,
    message: getErrorMessage(code),
    requestId: options?.requestId,
    details: options?.details,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Messages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps error codes to user-safe messages. These messages are:
 * - Written in sentence case
 * - Factual and imperative, not apologetic
 * - Never expose internal details
 */
const errorMessages: Record<ErrorCode, string> = {
  // Auth
  [ErrorCode.AUTH_UNAUTHENTICATED]: 'Sign in to continue.',
  [ErrorCode.AUTH_SESSION_EXPIRED]: 'Session expired. Sign in again.',
  [ErrorCode.AUTH_UNAUTHORIZED]: 'Access denied.',
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'Invalid email or password.',

  // Network
  [ErrorCode.NETWORK_OFFLINE]: 'No connection. Check your network.',
  [ErrorCode.NETWORK_TIMEOUT]: 'Request timed out. Try again.',
  [ErrorCode.NETWORK_SERVER_ERROR]: 'Server error. Try again later.',
  [ErrorCode.NETWORK_RATE_LIMITED]: 'Too many requests. Wait a moment.',

  // Validation
  [ErrorCode.VALIDATION_REQUIRED_FIELD]: 'Required field missing.',
  [ErrorCode.VALIDATION_INVALID_FORMAT]: 'Invalid format.',
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: 'Value out of range.',
  [ErrorCode.VALIDATION_CONSTRAINT]: 'Constraint violated.',

  // Generation
  [ErrorCode.GENERATION_FAILED]: 'Could not generate workout. Try again.',
  [ErrorCode.GENERATION_TIMEOUT]:
    'Generation took too long. Try simpler options.',
  [ErrorCode.GENERATION_INVALID_PARAMS]: 'Invalid generation parameters.',
  [ErrorCode.GENERATION_MODEL_ERROR]: 'Generation service error. Try again.',

  // Persistence
  [ErrorCode.PERSISTENCE_NOT_FOUND]: 'Not found.',
  [ErrorCode.PERSISTENCE_CONFLICT]: 'Data conflict. Refresh and try again.',
  [ErrorCode.PERSISTENCE_WRITE_FAILED]: 'Could not save. Try again.',
  [ErrorCode.PERSISTENCE_READ_FAILED]: 'Could not load. Try again.',
}

/**
 * Returns the user-safe message for an error code.
 */
export function getErrorMessage(code: ErrorCode): string {
  return errorMessages[code]
}

// ─────────────────────────────────────────────────────────────────────────────
// Result Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A discriminated union for operation results. Use instead of try/catch
 * for expected failure modes.
 */
export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

/**
 * Creates a successful result.
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

/**
 * Creates a failed result.
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/**
 * Type guard for successful results.
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok
}

/**
 * Type guard for failed results.
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok
}

/**
 * Unwraps a successful result or throws if failed.
 * Use sparingly — prefer pattern matching on the result.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value
  }
  throw result.error
}

/**
 * Unwraps a successful result or returns a default value.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard to check if an unknown value is an AppError.
 */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as AppError).code === 'string' &&
    typeof (value as AppError).message === 'string'
  )
}

/**
 * Converts an unknown caught error to an AppError.
 * Use this at catch boundaries to normalize errors.
 */
export function toAppError(
  error: unknown,
  fallbackCode: ErrorCode = ErrorCode.NETWORK_SERVER_ERROR,
  requestId?: string
): AppError {
  if (isAppError(error)) {
    // Already an AppError, optionally attach requestId
    return requestId ? { ...error, requestId } : error
  }

  // Unknown error — wrap in fallback
  return createError(fallbackCode, {
    requestId,
    details:
      error instanceof Error
        ? { originalMessage: error.message }
        : { original: String(error) },
  })
}
