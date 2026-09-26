/**
 * GEN-03 — the generation call, as the browser makes it.
 *
 * One method, and everything it refuses. The rule this module exists to keep is
 * the one defect D2 broke: a generation that fails answers with a typed error
 * and **never** with a workout. There is no fallback here, no fixture to reach
 * for, and no branch that invents content when the function could not produce
 * any — `generation-fallback.test.ts` proves the absence across the tree.
 *
 * Three refusals happen before anything is sent, because each of them costs a
 * model call otherwise: a request the `workout_sessions` CHECK constraints
 * would not hold (`generationRequestSchema`, contract §1), a caller with no
 * session (AUTH-03 — every policy behind the function refuses anonymous), and
 * nothing else. Everything after that is the wire's answer being read.
 *
 * The 200 is re-parsed with CORE-03's own schema rather than trusted. The
 * function already validated what the model wrote (GEN-02c) — this is defence
 * in depth, and it is not redundant: the thing on the other side of that fetch
 * is a deployment, which can be older than this bundle, and a workout that does
 * not parse must become an error rather than a half-rendered screen.
 *
 * `requestId` is minted here, travels as `x-request-id` *and* in the body, and
 * comes back on every answer — so the id a person reads off an error screen is
 * the id in the function's log.
 */
import {
  createError,
  ErrorCode,
  err,
  generateRequestId,
  getErrorMessage,
  isErr,
  ok,
  type AppError,
  type Result,
} from '../state/errors'
import {
  generationErrorResponseSchema,
  generationRequestSchema,
  generationSuccessSchema,
  parseBoundary,
  schemaIssues,
  swapRequestSchema,
  swapSuccessSchema,
  type GenerationFailure as GenerationFailureCode,
  type GenerationRequest,
  type GenerationSuccess,
  type SchemaIssue,
  type SwapRequest,
  type SwapSuccess,
} from '../state/schemas'
import type { AuthClient } from './auth'
import type { SupabaseConfig } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Contract §9 failures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `GENERATION_CONTRACT.md` §9's codes under the names this module refers to
 * them by. The strings are `GENERATION_FAILURES` in CORE-03's schema module —
 * this is a reading aid over that list and never a second copy of it, which
 * `generation.test.ts` holds to by comparing the two.
 *
 * They are a second vocabulary beside the `ErrorCode` taxonomy rather than a
 * replacement for it: the taxonomy says what a client should *do* (five
 * `GENERATION_*` codes, one HTTP status each), and these say what actually
 * happened — which check rejected the composition, whether the retry was spent.
 * A screen branches on the taxonomy; a person reads the message these map to,
 * and a log carries both.
 */
export const GenerationFailure = {
  /** A required section yielded nothing eligible. Never retryable as-is. */
  NO_CANDIDATES: 'generation.no_candidates',
  /** An id or equipment value outside the candidate set this request retrieved. */
  INVALID_REFERENCE: 'generation.invalid_reference',
  /** The prescription failed the contract's shape checks 4–7. */
  MALFORMED_PRESCRIPTION: 'generation.malformed_prescription',
  /** Computed work and rest do not fit the requested duration (GEN-06). */
  DURATION_IMPLAUSIBLE: 'generation.duration_implausible',
  /** The Claude API failed, or answered with nothing usable. */
  UPSTREAM: 'generation.upstream',
  /** The one retry failed too. Never retried again. */
  EXHAUSTED: 'generation.exhausted',
} as const satisfies Record<string, GenerationFailureCode>

export type GenerationFailure = GenerationFailureCode

/**
 * One sentence per §9 code, and six different sentences — a failure a person
 * cannot act on differently from another failure did not need its own code.
 * They are written here rather than borrowed from the taxonomy because the
 * taxonomy's line for `GENERATION_FAILED` covers all of them equally badly:
 * "try again" is wrong advice for an over-constrained request and for a spent
 * retry, and both of those arrive as the same taxonomy code.
 */
const FAILURE_MESSAGES: Record<GenerationFailure, string> = {
  [GenerationFailure.NO_CANDIDATES]:
    'No exercises match these options. Change equipment or exclusions.',
  [GenerationFailure.INVALID_REFERENCE]:
    'Generation picked an exercise that is not available here. Try again.',
  [GenerationFailure.MALFORMED_PRESCRIPTION]:
    'Generation returned a workout that could not be read. Try again.',
  [GenerationFailure.DURATION_IMPLAUSIBLE]:
    'That workout will not fit the time. Try a longer session or lower intensity.',
  [GenerationFailure.UPSTREAM]:
    'The generation service did not answer. Try again in a moment.',
  [GenerationFailure.EXHAUSTED]:
    'Generation failed twice. Change the options and try again.',
}

/** The human sentence for a §9 failure, without building an error to read it. */
export function generationFailureMessage(failure: GenerationFailure): string {
  return FAILURE_MESSAGES[failure]
}

/** §9's retry column, as data. `no_candidates` and `exhausted` are terminal. */
const FAILURE_RETRYABLE: Record<GenerationFailure, boolean> = {
  [GenerationFailure.NO_CANDIDATES]: false,
  [GenerationFailure.INVALID_REFERENCE]: true,
  [GenerationFailure.MALFORMED_PRESCRIPTION]: true,
  [GenerationFailure.DURATION_IMPLAUSIBLE]: true,
  [GenerationFailure.UPSTREAM]: true,
  [GenerationFailure.EXHAUSTED]: false,
}

/**
 * Whether offering "try again" for a taxonomy code is honest. Exhaustive, so a
 * new code in CORE-01's taxonomy is a compile error here until somebody decides
 * whether repeating the same request could ever answer differently.
 */
const CODE_RETRYABLE: Record<ErrorCode, boolean> = {
  [ErrorCode.AUTH_UNAUTHENTICATED]: false,
  [ErrorCode.AUTH_SESSION_EXPIRED]: false,
  [ErrorCode.AUTH_UNAUTHORIZED]: false,
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: false,

  [ErrorCode.NETWORK_OFFLINE]: true,
  [ErrorCode.NETWORK_TIMEOUT]: true,
  [ErrorCode.NETWORK_SERVER_ERROR]: true,
  [ErrorCode.NETWORK_RATE_LIMITED]: true,

  [ErrorCode.VALIDATION_REQUIRED_FIELD]: false,
  [ErrorCode.VALIDATION_INVALID_FORMAT]: false,
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: false,
  [ErrorCode.VALIDATION_CONSTRAINT]: false,

  [ErrorCode.GENERATION_FAILED]: true,
  [ErrorCode.GENERATION_NO_CANDIDATES]: false,
  [ErrorCode.GENERATION_TIMEOUT]: true,
  [ErrorCode.GENERATION_INVALID_PARAMS]: false,
  [ErrorCode.GENERATION_MODEL_ERROR]: true,

  [ErrorCode.SESSION_ALREADY_ACTIVE]: false,
  [ErrorCode.SESSION_INVALID_TRANSITION]: false,

  [ErrorCode.PERSISTENCE_NOT_FOUND]: false,
  [ErrorCode.PERSISTENCE_CONFLICT]: true,
  [ErrorCode.PERSISTENCE_WRITE_FAILED]: true,
  [ErrorCode.PERSISTENCE_READ_FAILED]: true,
}

// ─────────────────────────────────────────────────────────────────────────────
// The error a generation answers with
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An `AppError` a generation screen can render without asking anything else.
 * `requestId` is required rather than optional — CORE-04's error state shows
 * it, and an error minted before the call still carries the id the call would
 * have used.
 */
export interface GenerationError extends AppError {
  readonly requestId: string
  /** The contract §9 code, when the answer named one. Null when it did not. */
  readonly failure: GenerationFailure | null
  /** The field paths a refusal named. Empty when the failure has no field. */
  readonly issues: readonly SchemaIssue[]
  /** Whether repeating this request unchanged could answer differently. */
  readonly retryable: boolean
}

function generationError(options: {
  code: ErrorCode
  requestId: string
  failure?: GenerationFailure | null
  message?: string
  issues?: readonly SchemaIssue[]
  details?: Record<string, unknown>
}): GenerationError {
  const failure = options.failure ?? null

  return {
    ...createError(options.code, { requestId: options.requestId, details: options.details }),
    // The §9 sentence wins when there is one: it is the specific account of
    // what happened, and the taxonomy's is the general one.
    message:
      options.message ??
      (failure === null ? getErrorMessage(options.code) : FAILURE_MESSAGES[failure]),
    requestId: options.requestId,
    failure,
    issues: options.issues ?? [],
    retryable: failure === null ? CODE_RETRYABLE[options.code] : FAILURE_RETRYABLE[failure],
  }
}

/**
 * An `AppError` minted elsewhere — a boundary parse, a token read — made into
 * one of these. Its own code and message are kept: they are more specific than
 * anything this module would put in their place, and the issue paths
 * `parseBoundary` stored in `details` are lifted to where a screen can see them.
 */
function fromAppError(error: AppError, requestId: string): GenerationError {
  const issues = error.details?.issues

  return {
    ...generationError({ code: error.code, requestId, details: error.details }),
    message: error.message,
    issues: Array.isArray(issues) ? (issues as SchemaIssue[]) : [],
  }
}

/**
 * The code a bare status means, for an answer whose body could not be read as
 * the contract's error. The status is then the only fact there is, so this maps
 * exactly what `envelope.ts` writes and treats everything else as a generation
 * that failed for a reason nobody stated.
 */
export function codeForStatus(status: number): ErrorCode {
  if (status === 401 || status === 403) return ErrorCode.AUTH_SESSION_EXPIRED
  if (status === 429) return ErrorCode.NETWORK_RATE_LIMITED
  if (status === 400 || status === 422) return ErrorCode.GENERATION_INVALID_PARAMS
  if (status === 504 || status === 408) return ErrorCode.GENERATION_TIMEOUT
  if (status >= 500) return ErrorCode.NETWORK_SERVER_ERROR
  return ErrorCode.GENERATION_FAILED
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire shapes
// ─────────────────────────────────────────────────────────────────────────────

/** The route the function is mounted at. */
const FUNCTION_PATH = '/functions/v1/generate-workout'

/**
 * REV-02's route. A second path rather than a second module, because a swap is
 * the same call with a narrower scope: the same envelope, the same §9 codes,
 * the same request id travelling in the header and the body, and the same rule
 * that a failure is never content. What differs is the schema on each end, and
 * that is a parameter rather than a parallel pipeline.
 */
const SWAP_FUNCTION_PATH = '/functions/v1/generate-section'

const REQUEST_ID_HEADER = 'x-request-id'

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

/** What a caller chooses. The request id is not theirs to pick — it is minted here. */
export type GenerationInput = Omit<GenerationRequest, 'request_id'>

/**
 * The four things `generate` does, in the order it does them.
 *
 * They are the awaits this module already had rather than a script playing
 * beside them: a stage is reported when its own work *starts*, so every stage
 * before the current one is work that genuinely finished. A stage the call
 * never reaches is never reported — a request refused by §1's bounds stops at
 * `validating`.
 *
 * GEN-05's loading screen is why they are observable at all: "the loader
 * reflects real stages" cannot be true of a caller that can only see `pending`.
 * What they deliberately do not give is a *fraction*. `composing` holds
 * essentially all of the latency, so three stages of four finishing is nothing
 * like three quarters of the wait, and pattern 2's rule about a fake percentage
 * being "a lie a screen reader repeats" applies to a stage count just as much.
 */
export const GENERATION_STAGES = [
  'validating',
  'authorizing',
  'composing',
  'reading',
] as const

export type GenerationStage = (typeof GENERATION_STAGES)[number]

export interface GenerationCallOptions {
  /**
   * Called as each stage begins, on the call's own thread. Observation only —
   * nothing it does can change what the call answers.
   */
  readonly onStage?: (stage: GenerationStage) => void
}

export interface GenerationClientConfig {
  /** Asked for the access token per call, so a rotated token is never stale. */
  readonly auth: Pick<AuthClient, 'getSession'>
  /** The project, minus the token this module supplies per call. */
  readonly supabase: Omit<SupabaseConfig, 'accessToken'>
  /** Injected in tests; `generateRequestId` otherwise. */
  readonly requestId?: () => string
}

/**
 * What a swap's caller chooses: the session and the one thing in it being
 * replaced. Everything else — the section, the equipment, the exercises that
 * are staying, the user's constraints — is read back from the session by the
 * function, so a client cannot widen its own request (REV-02).
 */
export type SectionSwapInput = Omit<SwapRequest, 'request_id'>

export interface GenerationClient {
  /**
   * Composes one workout. Resolves to the validated workout or to a typed
   * error — never to both, and never to a workout nobody generated.
   */
  generate(
    input: GenerationInput,
    options?: GenerationCallOptions,
  ): Promise<Result<GenerationSuccess, GenerationError>>
  /**
   * Replaces one slot, or one block as a unit, in a session that already
   * exists. Answers the revisions the database wrote — the substitute *and*
   * the row it superseded — because the lineage is what the operation is (D6),
   * and a caller given only the substitute would have to guess what it
   * replaced. A failure answers a typed error and revises nothing.
   */
  swapSection(input: SectionSwapInput): Promise<Result<SwapSuccess, GenerationError>>
}

export function createGenerationClient(config: GenerationClientConfig): GenerationClient {
  const base = config.supabase.url.replace(/\/+$/, '')
  const fetchImpl = config.supabase.fetch ?? globalThis.fetch
  const mintRequestId = config.requestId ?? generateRequestId

  /**
   * One authenticated POST to an AI function, and the answer read back with the
   * caller's own success schema.
   *
   * Shared by both calls rather than written twice: the token read, the two
   * places the request id travels, the unreadable-body case and the
   * refusal-or-success discrimination are envelope behaviour, and an envelope
   * whose two callers disagreed about any of it would not be one.
   */
  const call = async <T>(
    path: string,
    body: unknown,
    requestId: string,
    success: Parser<T>,
    // Observation only, and only three of GEN-05's four stages happen here —
    // `validating` belongs to the caller, whose schema it is.
    reachedStage: (stage: GenerationStage) => void = () => undefined,
  ): Promise<Result<T, GenerationError>> => {
    reachedStage('authorizing')
    const session = await config.auth.getSession()
    if (isErr(session)) {
      return err(fromAppError(session.error, requestId))
    }
    if (session.value === null) {
      return err(generationError({ code: ErrorCode.AUTH_UNAUTHENTICATED, requestId }))
    }

    let response: Response
    try {
      reachedStage('composing')
      response = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: {
          apikey: config.supabase.anonKey,
          authorization: `Bearer ${session.value.accessToken}`,
          'content-type': 'application/json',
          [REQUEST_ID_HEADER]: requestId,
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      // The request never landed — killed mid-call, or never started. Whether
      // the function did anything is unknowable from here, and an unknown
      // answer is not content.
      return err(
        generationError({
          code: ErrorCode.NETWORK_OFFLINE,
          requestId,
          details: { reason: error instanceof Error ? error.message : String(error) },
        }),
      )
    }

    let payload: unknown
    try {
      reachedStage('reading')
      payload = await response.json()
    } catch {
      // A body that will not read leaves the status as the only fact there is.
      return err(
        generationError({
          code: codeForStatus(response.status),
          requestId,
          details: { status: response.status, reason: 'unreadable-body' },
        }),
      )
    }

    return readAnswer(success, payload, response.status, requestId)
  }

  return {
    async swapSection(input) {
      const requestId = mintRequestId()

      // The discriminated target, refused here rather than by the function: a
      // `single` body carrying a block id is a caller that has not decided
      // which swap it wants, and that costs a round trip to be told.
      const request = parseBoundary<SwapRequest>(
        swapRequestSchema,
        { ...input, request_id: requestId },
        { code: ErrorCode.GENERATION_INVALID_PARAMS, requestId },
      )
      if (isErr(request)) {
        return err(fromAppError(request.error, requestId))
      }

      return call(SWAP_FUNCTION_PATH, request.value, requestId, swapSuccessSchema)
    },

    async generate(input, options = {}) {
      const requestId = mintRequestId()
      const reachedStage = options.onStage ?? (() => undefined)

      // §1's own bounds: an intensity outside 1–10 or a duration of zero is a
      // row `workout_sessions` would refuse, so it is refused here rather than
      // after a model call has been paid for.
      reachedStage('validating')
      const request = parseBoundary<GenerationRequest>(
        generationRequestSchema,
        { ...input, request_id: requestId },
        { code: ErrorCode.GENERATION_INVALID_PARAMS, requestId },
      )
      if (isErr(request)) {
        return err(fromAppError(request.error, requestId))
      }

      return call(
        FUNCTION_PATH,
        request.value,
        requestId,
        generationSuccessSchema,
        reachedStage,
      )
    },
  }
}

/**
 * The client for a build with no Supabase configuration, so a screen that
 * composes this one still mounts and says what is wrong when it is used. It
 * refuses the same typed way `unconfiguredWorkoutClients` does: the request id
 * is real, because a refusal with no id is one a log cannot be matched to.
 */
export function unconfiguredGenerationClient(): GenerationClient {
  const refuse = <T>(): Result<T, GenerationError> =>
    err(
      generationError({
        code: ErrorCode.GENERATION_INVALID_PARAMS,
        requestId: generateRequestId(),
        details: { reason: 'missing-configuration' },
      }),
    )

  return {
    async generate() {
      return refuse<GenerationSuccess>()
    },
    async swapSection() {
      return refuse<SwapSuccess>()
    },
  }
}

/**
 * The success half of whichever call is being read, as CORE-03 declares it.
 * Structural rather than the schema type itself, so this module states what it
 * needs of a schema — one parse — and declares none of its own.
 */
interface Parser<T> {
  safeParse(value: unknown):
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: Parameters<typeof schemaIssues>[0] }
}

/**
 * The answer, parsed. Which half of the response it is comes from the payload
 * carrying a `code` and not from the status, because a refusal is a refusal
 * whatever status it arrived with — but *both* halves are then parsed in full
 * by CORE-03's schemas. Nothing is read off an unparsed body except that one
 * discriminator.
 */
function readAnswer<T>(
  success: Parser<T>,
  payload: unknown,
  status: number,
  requestId: string,
): Result<T, GenerationError> {
  if (looksLikeRefusal(payload)) {
    const refusal = generationErrorResponseSchema.safeParse(payload)

    if (!refusal.success) {
      // It said it was an error and then was not one. It is still an error.
      return err(
        generationError({
          code: codeForStatus(status),
          requestId,
          issues: schemaIssues(refusal.error),
          details: { status, reason: 'malformed-error-body' },
        }),
      )
    }

    // The function's own sentence is kept unless it named a §9 failure, in
    // which case the specific sentence replaces the general one: the wire
    // message for every one of those codes today is the taxonomy's line, which
    // tells a person to try again even when trying again cannot work.
    const failure = refusal.data.failure ?? null

    return err(
      generationError({
        code: refusal.data.code,
        requestId: refusal.data.requestId,
        failure,
        message: failure === null ? refusal.data.message : undefined,
        issues: refusal.data.issues ?? [],
        details: { status },
      }),
    )
  }

  const parsed = success.safeParse(payload)

  if (!parsed.success) {
    return err(
      generationError({
        code: status >= 200 && status < 300 ? ErrorCode.GENERATION_FAILED : codeForStatus(status),
        requestId,
        failure: status >= 200 && status < 300 ? GenerationFailure.MALFORMED_PRESCRIPTION : null,
        issues: schemaIssues(parsed.error),
        details: { status, reason: 'unreadable-response' },
      }),
    )
  }

  if (status < 200 || status >= 300) {
    // A workout shape under a failing status is a response nobody can trust
    // twice: one of the two is wrong, and guessing which would be the fallback
    // this requirement exists to delete.
    return err(
      generationError({
        code: codeForStatus(status),
        requestId,
        details: { status, reason: 'workout-with-failing-status' },
      }),
    )
  }

  return ok(parsed.data)
}

/** The one thing read off an unparsed payload: does it claim to be a refusal. */
function looksLikeRefusal(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { code?: unknown }).code === 'string'
  )
}
