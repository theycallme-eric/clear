/**
 * GEN-01 — the edge function envelope.
 *
 * Every AI function in this project is the same shell wrapped around a
 * different handler: answer the CORS preflight, settle on a request id, verify
 * the caller's JWT, parse the body with the CORE-03 schema, run the handler,
 * and answer with `{ code, message, requestId }` when any of that fails
 * (`docs/specs/generation/GENERATION_CONTRACT.md` §9). The handler receives a
 * parsed body and an authenticated user, or it does not run at all.
 *
 * Three defects this file exists to keep dead:
 *
 *   * **D3 — bearer tokens in the logs.** The old `generate-workout` copied
 *     every request header into a log line, truncating the authorization value
 *     to fifty characters, which is fifty characters of a valid JWT. Here the
 *     only per-request line is CORE-02's `logEdgeRequest`, whose four fields
 *     are picked by name; no header map, and no request object, is ever handed
 *     to a logger. The access token is passed to the handler and never logged.
 *   * **D2 — untyped failure.** Nothing throws a string and nothing falls back
 *     to a plausible-looking answer. A failure is an `AppError` from CORE-01
 *     serialised to the one wire shape the client already parses.
 *   * **A trace that stops at the network.** Every response — success, refusal,
 *     or crash — carries the client's `X-Request-ID`, in the body and in the
 *     response headers.
 *
 * It is a module rather than a function body so that `generate-section`
 * (REV-02) adopts it unchanged: route, schema, and handler are arguments.
 *
 * Nothing here imports zod. The schema arrives as a parameter and is always one
 * of CORE-03's — a second zod import under `supabase/functions/` is how a
 * second contract starts, and `src/state/schemas.test.ts` reads this directory
 * to make sure one never appears.
 */

import {
  ErrorCode,
  createError,
  err,
  generateRequestId,
  isErr,
  isOk,
  ok,
  toAppError,
  type AppError,
  type Result,
} from '../../../src/state/errors.ts'
import {
  createLogger,
  logEdgeRequest,
  type LogSink,
  type Logger,
} from '../../../src/state/logger.ts'
import {
  parseBoundary,
  requestIdSchema,
  type ErrorResponse,
  type SchemaIssue,
} from '../../../src/state/schemas.ts'

// ─────────────────────────────────────────────────────────────────────────────
// The shapes a caller supplies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A CORE-03 boundary schema, spelled as the parameter `parseBoundary` already
 * takes rather than as `z.ZodType<T>`, so this file needs no zod import of its
 * own.
 */
export type BoundarySchema<T> = Parameters<typeof parseBoundary<T>>[0]

/** Everything the envelope knows about the caller: the subject of RLS. */
export interface EnvelopeUser {
  readonly id: string
}

/**
 * Verifies a bearer token. Injected rather than imported so a test can refuse
 * a token without a network, and so a function that verifies differently is a
 * different argument rather than a different envelope. `_shared/auth.ts` has
 * the GoTrue implementation.
 */
export type VerifyToken = (
  token: string,
  requestId: string,
) => Promise<Result<EnvelopeUser, AppError>>

/** A JSON object body. The envelope adds `requestId`; the handler owns the rest. */
export type JsonObject = { readonly [key: string]: unknown }

/** What a handler is given once auth and parsing have both succeeded. */
export interface EnvelopeContext<TBody> {
  readonly requestId: string
  readonly user: EnvelopeUser
  readonly body: TBody
  /**
   * The caller's access token, for a handler that must reach PostgREST *as the
   * user* so row-level security still decides what it can see. Never logged:
   * its key is on CORE-02's denylist, so even a careless `logger.info` redacts
   * it.
   */
  readonly accessToken: string
  /** Scoped to the route and bound to the request id. */
  readonly logger: Logger
}

/**
 * A handler returns a value, not a `Response`: the envelope owns status codes
 * and the wire shape, which is the only way every function can be trusted to
 * answer the same way.
 */
export type EnvelopeHandler<TBody> = (
  context: EnvelopeContext<TBody>,
) => Promise<Result<JsonObject, AppError>> | Result<JsonObject, AppError>

export interface EnvelopeOptions<TBody> {
  /** Names the function in logs — `generate-workout`, `generate-section`. */
  readonly route: string
  readonly schema: BoundarySchema<TBody>
  readonly verifyToken: VerifyToken
  readonly handle: EnvelopeHandler<TBody>
  /**
   * `*` by default, and that is safe here rather than lax: the credential is a
   * bearer token this function verifies itself, never a cookie, so no browser
   * is being asked to attach ambient authority to a cross-origin call.
   */
  readonly allowOrigin?: string
  /** Injected in tests; CORE-02's runtime sink otherwise. */
  readonly sink?: LogSink
  /** Injected in tests, so a duration is asserted rather than tolerated. */
  readonly now?: () => number
}

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

const REQUEST_ID_HEADER = 'x-request-id'

/**
 * The preflight answer. `apikey` and `x-client-info` are named because the
 * Supabase gateway expects them; `x-request-id` because the trace begins in the
 * browser and a header a preflight does not allow is a header the browser
 * strips.
 */
const ALLOWED_HEADERS = [
  'authorization',
  'apikey',
  'content-type',
  'x-client-info',
  REQUEST_ID_HEADER,
].join(', ')

const PREFLIGHT_MAX_AGE_SECONDS = 86_400

function corsHeaders(allowOrigin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status codes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One status per error code, written out rather than derived from the code's
 * prefix. The record is exhaustive, so a new code in CORE-01's taxonomy is a
 * compile error here until somebody decides what it means over HTTP.
 */
const statusByCode: Record<ErrorCode, number> = {
  [ErrorCode.AUTH_UNAUTHENTICATED]: 401,
  [ErrorCode.AUTH_SESSION_EXPIRED]: 401,
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 401,
  [ErrorCode.AUTH_UNAUTHORIZED]: 403,

  [ErrorCode.NETWORK_OFFLINE]: 502,
  [ErrorCode.NETWORK_TIMEOUT]: 504,
  [ErrorCode.NETWORK_SERVER_ERROR]: 500,
  [ErrorCode.NETWORK_RATE_LIMITED]: 429,

  [ErrorCode.VALIDATION_REQUIRED_FIELD]: 400,
  [ErrorCode.VALIDATION_INVALID_FORMAT]: 400,
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: 400,
  [ErrorCode.VALIDATION_CONSTRAINT]: 400,

  // Not 400: the request was well-formed and the options were the problem, and
  // a client that retries the same body unchanged will fail the same way.
  [ErrorCode.GENERATION_NO_CANDIDATES]: 422,
  [ErrorCode.GENERATION_INVALID_PARAMS]: 422,
  [ErrorCode.GENERATION_TIMEOUT]: 504,
  [ErrorCode.GENERATION_MODEL_ERROR]: 502,
  [ErrorCode.GENERATION_FAILED]: 500,

  // The request is valid, but the current session state conflicts with it.
  [ErrorCode.SESSION_ALREADY_ACTIVE]: 409,
  [ErrorCode.SESSION_INVALID_TRANSITION]: 409,

  [ErrorCode.PERSISTENCE_NOT_FOUND]: 404,
  [ErrorCode.PERSISTENCE_CONFLICT]: 409,
  [ErrorCode.PERSISTENCE_WRITE_FAILED]: 500,
  [ErrorCode.PERSISTENCE_READ_FAILED]: 500,
}

/** The HTTP status a typed error answers with. */
export function statusForCode(code: ErrorCode): number {
  return statusByCode[code] ?? 500
}

// ─────────────────────────────────────────────────────────────────────────────
// Bodies
// ─────────────────────────────────────────────────────────────────────────────

/** The root of the payload, for an issue that belongs to no single field. */
const ROOT_PATH = '(root)'

/**
 * `{ code, message, requestId }` and, when the failure has field paths to
 * report, the issues CORE-03 found. The request id is the envelope's, never the
 * error's: an error created before the id was known still answers with it.
 */
export function errorBody(error: AppError, requestId: string): ErrorResponse {
  const issues = issuesOf(error)

  return {
    code: error.code,
    message: error.message,
    requestId,
    ...(issues.length > 0 ? { issues } : {}),
  }
}

/**
 * Reads the issue list `parseBoundary` stored in `details`, and nothing else
 * from `details` — the rest of it is for the log, not for the wire.
 */
function issuesOf(error: AppError): SchemaIssue[] {
  const issues = error.details?.issues

  if (!Array.isArray(issues)) return []

  return issues.filter(
    (issue): issue is SchemaIssue =>
      typeof issue === 'object' &&
      issue !== null &&
      typeof (issue as SchemaIssue).path === 'string' &&
      typeof (issue as SchemaIssue).message === 'string',
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The envelope
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps a handler in the shell every AI function shares. The returned function
 * is a plain `(Request) => Promise<Response>` — `Deno.serve` takes it, and so
 * does a test, because nothing in here reaches for a runtime global.
 */
export function createEdgeFunction<TBody>(
  options: EnvelopeOptions<TBody>,
): (request: Request) => Promise<Response> {
  const allowOrigin = options.allowOrigin ?? '*'
  const now = options.now ?? (() => Date.now())
  const logger = createLogger({ scope: options.route, sink: options.sink })

  return async function handleRequest(request: Request): Promise<Response> {
    const startedAt = now()
    const requestId = resolveRequestId(request)

    const respond = (body: JsonObject | null, status: number): Response => {
      logEdgeRequest(
        { requestId, route: options.route, status, durationMs: now() - startedAt },
        options.sink,
      )

      return new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: {
          // A 204 carries no body, so it carries no content type either.
          ...(body === null ? {} : { 'Content-Type': 'application/json' }),
          [REQUEST_ID_HEADER]: requestId,
          ...corsHeaders(allowOrigin),
        },
      })
    }

    const refuse = (error: AppError): Response => {
      const status = statusForCode(error.code)
      // The code and the id, and deliberately not the message or the details:
      // a log line is for correlating, and everything a human needs to find
      // this request is already in the response the caller is holding.
      logger.warn('request refused', { requestId, code: error.code, status })

      return respond(errorBody(error, requestId), status)
    }

    // A preflight carries no credential and reaches no handler, so it is
    // answered before anything else and logged like any other response.
    if (request.method === 'OPTIONS') {
      return respond(null, 204)
    }

    if (request.method !== 'POST') {
      return refuse(
        createError(ErrorCode.VALIDATION_CONSTRAINT, {
          requestId,
          details: {
            issues: [{ path: ROOT_PATH, message: 'this function accepts POST' }],
          },
        }),
      )
    }

    const token = bearerToken(request)
    if (token === null) {
      return refuse(createError(ErrorCode.AUTH_UNAUTHENTICATED, { requestId }))
    }

    const verified = await options.verifyToken(token, requestId)
    if (isErr(verified)) {
      return refuse({ ...verified.error, requestId })
    }

    const payload = await readJsonBody(request)
    if (isErr(payload)) {
      return refuse({ ...payload.error, requestId })
    }

    const parsed = parseBoundary(options.schema, payload.value, {
      code: ErrorCode.VALIDATION_CONSTRAINT,
      requestId,
    })
    if (isErr(parsed)) {
      return refuse(parsed.error)
    }

    // From here the request is the handler's. A throw is still the envelope's:
    // an unhandled rejection in a function is a 502 from the gateway with no
    // request id in it, which is the trace ending exactly where it was needed.
    let result: Result<JsonObject, AppError>
    try {
      result = await options.handle({
        requestId,
        user: verified.value,
        body: parsed.value,
        accessToken: token,
        logger: logger.child('handler', { requestId }),
      })
    } catch (thrown) {
      return refuse(toAppError(thrown, ErrorCode.GENERATION_FAILED, requestId))
    }

    if (isErr(result)) {
      return refuse({ ...result.error, requestId })
    }

    // Last, so a handler's payload can never spoof the id it is answering.
    return respond({ ...result.value, requestId }, 200)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The client's id when it sent one that round-trips, and a fresh one otherwise.
 * A malformed id is replaced rather than echoed: `errorResponseSchema` checks
 * the format, so echoing `'; DROP'` back would produce a response the client
 * cannot parse — the trace would break at precisely the moment it mattered.
 */
function resolveRequestId(request: Request): string {
  const supplied = request.headers.get(REQUEST_ID_HEADER)
  if (supplied === null) return generateRequestId()

  const parsed = parseBoundary(requestIdSchema, supplied)
  return isOk(parsed) ? parsed.value : generateRequestId()
}

/** The token from `Authorization: Bearer <jwt>`, or null if there is not one. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header === null) return null

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match === null ? null : match[1]
}

/**
 * The body as JSON, or a typed 400. Unparseable input is a `VALIDATION_INVALID_FORMAT`
 * with a root-path issue, so a client that sent no body and one that sent a
 * truncated one both learn the same actionable thing without the envelope
 * echoing what it could not read.
 */
async function readJsonBody(request: Request): Promise<Result<unknown, AppError>> {
  const text = await request.text()

  if (text.trim() === '') {
    return err(
      createError(ErrorCode.VALIDATION_INVALID_FORMAT, {
        details: { issues: [{ path: ROOT_PATH, message: 'a JSON body is required' }] },
      }),
    )
  }

  try {
    return ok(JSON.parse(text) as unknown)
  } catch {
    return err(
      createError(ErrorCode.VALIDATION_INVALID_FORMAT, {
        // Deliberately not the parser's message and never the text itself: a
        // body that failed to parse is still a body, and it may hold anything.
        details: { issues: [{ path: ROOT_PATH, message: 'must be valid JSON' }] },
      }),
    )
  }
}
