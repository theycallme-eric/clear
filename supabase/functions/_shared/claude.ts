/**
 * GEN-02b — the model call, and the one retry it is allowed.
 *
 * `prompt.ts` assembles; this sends, parses and decides whether to ask again.
 * The whole of that decision is in one place on purpose, because the two ways
 * generation has failed before both live here:
 *
 *   * **D2 — the silent fallback.** The old function answered with a mock
 *     workout when it could not produce a real one. There is no fallback in
 *     this module and no shape it can return except a workout the CORE-03
 *     schema accepted, or a typed `AppError`. Half a workout is not a smaller
 *     success; it is the failure the user cannot see.
 *   * **the unbounded re-roll.** Retry is exactly once, counted rather than
 *     hoped for, and the second failure is `generation.exhausted`
 *     (GENERATION_CONTRACT §9). A retry runs the entire generation again and is
 *     the single largest latency cost in the pipeline (§2) — two of them is a
 *     minute of a user's life spent on a model that is not going to converge.
 *
 * `ANTHROPIC_API_KEY` reaches this module as an argument and leaves it in one
 * request header. It is never logged: the logger's denylist redacts `apikey`
 * and `authorization` structurally, and nothing here puts a header map, a
 * config object or a prompt body into a log line in the first place (CORE-02,
 * defect D3).
 *
 * What validation *is* — checks 1–3 against that section's candidate set — is
 * `validate.ts`'s, and reaches this module as an optional function rather than
 * an import. That direction is the point: this file knows that something may
 * reject a parsed workout and that a rejection is worth exactly one more call,
 * and it knows nothing about candidates, equipment or quality records. A
 * composer configured without a validator returns `validation: null`, which is
 * "nobody checked" and never "nothing was wrong".
 */

import {
  ErrorCode,
  createError,
  err,
  ok,
  type AppError,
  type Result,
} from '../../../src/state/errors.ts'
import type { Logger } from '../../../src/state/logger.ts'
import {
  generationOutputSchema,
  schemaIssues,
  type GenerationOutput,
  type SchemaIssue,
} from '../../../src/state/schemas.ts'
import {
  assemblePrompt,
  withRetryCorrection,
  type PromptInput,
  type PromptMeasurement,
  type RetryFailure,
} from './prompt.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** The one secret this function needs, named once. */
export const API_KEY_VARIABLE = 'ANTHROPIC_API_KEY'

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Claude composes the workout; nothing else in the app calls a model. Sonnet 5
 * rather than the old function's Sonnet 4: composition is a judgment task under
 * a user waiting on a loading screen, and this is the current model that is
 * strong at structured output without the latency of the largest one.
 */
export const DEFAULT_MODEL = 'claude-sonnet-5'

/**
 * A contract-4.1.0 workout is a few thousand tokens of nested JSON; the old
 * function's 4096 truncated long sessions, and a truncated response is a parse
 * failure that costs a retry to discover.
 */
export const DEFAULT_MAX_TOKENS = 8192

/**
 * GEN-02c's validation, as this module needs to see it: a parsed workout and
 * the input it was composed from in, a verdict out. It is a function rather
 * than an import so the retry counter stays in one place — `validate.ts`
 * rejects, and this loop is the only thing in generation that decides whether a
 * rejection is worth another call.
 */
export type CompositionValidator<V> = (
  workout: GenerationOutput,
  input: PromptInput,
) => Result<V, AttemptFailure>

export interface ComposerConfig<V = unknown> {
  /**
   * Read from the Supabase Edge Function secret store by the function that
   * mounts this, and passed in rather than read here so nothing in this module
   * depends on a runtime global — which is what lets Vitest drive it.
   */
  readonly apiKey: string
  readonly model?: string
  readonly maxTokens?: number
  /** Injected in tests; the global `fetch` otherwise. */
  readonly fetch?: typeof globalThis.fetch
  /** The envelope's per-request logger, where there is one. */
  readonly logger?: Logger
  /**
   * `validateComposition` from `validate.ts`, where the caller wants a workout
   * checked against its own candidate set before it is returned. Optional
   * because this module's own contract does not depend on it; a caller that
   * omits it gets a parsed workout nobody checked, which is why the function
   * handler supplies it.
   */
  readonly validate?: CompositionValidator<V>
}

/**
 * The secret, from whatever the runtime's environment reader is —
 * `Deno.env.get` in a deployed function. A missing key is a typed refusal and
 * never a throw, and the message names the *variable*, which is the only part
 * of a secret that is safe to say out loud.
 */
export function apiKeyFromEnv(read: (name: string) => string | undefined): Result<string> {
  const key = read(API_KEY_VARIABLE)?.trim()

  if (!key) {
    return err(
      createError(ErrorCode.GENERATION_MODEL_ERROR, {
        details: { missing: API_KEY_VARIABLE },
      }),
    )
  }

  return ok(key)
}

// ─────────────────────────────────────────────────────────────────────────────
// Failure vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GENERATION_CONTRACT §9's codes, as the retry addendum names them. They are
 * the contract's own spelling rather than the `ErrorCode` taxonomy's because
 * this is what goes *into the prompt* — the model is told what it did, and §4
 * puts that string in the message.
 */
export const GenerationFailure = {
  /** The Claude API did not answer, or did not answer with usable content. */
  UPSTREAM: 'generation.upstream',
  /** Content arrived and was not a contract-4.1.0 workout. */
  MALFORMED: 'generation.malformed_prescription',
  /**
   * An id, an equipment value or a section outside what this request retrieved
   * — GEN-02c's checks 1–3 (`validate.ts`). It is here rather than there so the
   * contract's §9 vocabulary is one list: the addendum that tells the model what
   * it did reads from this object whichever half of the pipeline rejected it.
   */
  INVALID_REFERENCE: 'generation.invalid_reference',
  /** Both attempts failed. Never retried again. */
  EXHAUSTED: 'generation.exhausted',
} as const

export type GenerationFailure = (typeof GenerationFailure)[keyof typeof GenerationFailure]

/** One attempt's outcome, recorded whether or not a second one followed. */
export interface AttemptFailure {
  readonly code: GenerationFailure
  /** The specific invalid field or the upstream status. Never a raw response. */
  readonly detail: string | null
  /** Present when the response parsed as JSON and failed the schema. */
  readonly issues?: readonly SchemaIssue[]
}

/** Tokens as the API reported them — §5 records the API's answer, not a guess. */
export interface TokenUsage {
  readonly inputTokens: number | null
  readonly outputTokens: number | null
}

/** A composition that succeeded, and everything §5 asks to be recorded about it. */
export interface Composition<V = unknown> {
  readonly workout: GenerationOutput
  readonly measurement: PromptMeasurement
  readonly usage: TokenUsage
  /** 1 or 2. Never more, and never 0. */
  readonly attempts: number
  /** The failure that caused the retry, when there was one. */
  readonly retriedAfter: AttemptFailure | null
  /**
   * What the validator returned, or `null` when no validator was configured.
   * Null is therefore "nobody checked" rather than "nothing was wrong", and the
   * two must not be read as the same thing.
   */
  readonly validation: V | null
}

export interface Composer<V = unknown> {
  /**
   * Assemble, call, validate — and on a typed failure, exactly one corrected
   * retry. Resolves to the workout or to a typed error, never to a partial one.
   */
  compose(input: PromptInput, requestId?: string): Promise<Result<Composition<V>>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Models fence JSON in markdown when they are being helpful. Stripping it is
 * not leniency about the contract — everything inside still has to parse — it
 * is refusing to spend a whole retry on three backticks.
 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed

  return trimmed
    .replace(/^```(?:json|jsonc)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim()
}

/**
 * Text → a contract-4.1.0 workout, or the typed failure a retry is told about.
 *
 * Unparseable text and a well-formed object that breaks the contract are one
 * code rather than two, because they are one instruction to the model: the
 * response was not the object that was asked for. What differs is the detail,
 * and the detail is where the actionable part lives.
 */
export function parseCompletion(
  text: string,
): Result<GenerationOutput, AttemptFailure> {
  let payload: unknown

  try {
    payload = JSON.parse(stripCodeFence(text))
  } catch {
    return err({
      code: GenerationFailure.MALFORMED,
      detail: 'The response was not valid JSON.',
    })
  }

  const parsed = generationOutputSchema.safeParse(payload)
  if (!parsed.success) {
    const issues = schemaIssues(parsed.error)

    return err({
      code: GenerationFailure.MALFORMED,
      // The paths, not the payload. `sections[0].blocks[0].exercises[1].sets`
      // is the correction; echoing the object back is the model's own mistake
      // read to it as instruction.
      detail: issues
        .slice(0, MAX_REPORTED_ISSUES)
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('\n'),
      issues,
    })
  }

  return ok(parsed.data)
}

/** Enough to correct, few enough that the addendum stays an addendum. */
const MAX_REPORTED_ISSUES = 10

// ─────────────────────────────────────────────────────────────────────────────
// The call
// ─────────────────────────────────────────────────────────────────────────────

interface Completion {
  readonly text: string
  readonly usage: TokenUsage
}

function usageFrom(value: unknown): TokenUsage {
  const usage = (value as { usage?: Record<string, unknown> } | null)?.usage

  const read = (key: string) => {
    const number = usage?.[key]
    return typeof number === 'number' ? number : null
  }

  return { inputTokens: read('input_tokens'), outputTokens: read('output_tokens') }
}

/** The first text block of a `messages` response, or nothing usable. */
function textFrom(value: unknown): string | null {
  const content = (value as { content?: unknown } | null)?.content
  if (!Array.isArray(content)) return null

  const text = content
    .filter(
      (block): block is { type: string; text: string } =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string',
    )
    .map((block) => block.text)
    .join('')

  return text.trim() === '' ? null : text
}

async function callClaude(
  config: ComposerConfig,
  system: string,
  user: string,
): Promise<Result<Completion, AttemptFailure>> {
  const send = config.fetch ?? globalThis.fetch
  let response: Response

  try {
    response = await send(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The only place the secret appears. The logger redacts this key by
        // name, and no code path here logs a header map at all.
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: config.model ?? DEFAULT_MODEL,
        max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
  } catch (cause) {
    return err({
      code: GenerationFailure.UPSTREAM,
      // The reason, not the request: a thrown fetch carries the URL it was
      // called with, and nothing about this one is worth a log line.
      detail: cause instanceof Error ? cause.name : 'The request did not complete.',
    })
  }

  if (!response.ok) {
    return err({
      code: GenerationFailure.UPSTREAM,
      detail: `The API answered ${response.status}.`,
    })
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return err({
      code: GenerationFailure.UPSTREAM,
      detail: 'The API answered with a body that was not JSON.',
    })
  }

  const text = textFrom(body)
  if (text === null) {
    return err({ code: GenerationFailure.UPSTREAM, detail: 'The API answered with no content.' })
  }

  return ok({ text, usage: usageFrom(body) })
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────────────────────

/** How many times a prompt may be sent. One attempt, one retry (§4). */
export const MAX_ATTEMPTS = 2

/**
 * An attempt's failure becomes the retry's addendum only when there was a
 * response to correct. Telling a model that the *network* failed would be an
 * instruction it cannot act on, and it would change the prompt on a path where
 * an unchanged one is what should be sent again.
 */
function correctionFor(failure: AttemptFailure): RetryFailure | null {
  return failure.code === GenerationFailure.MALFORMED ||
    failure.code === GenerationFailure.INVALID_REFERENCE
    ? { code: failure.code, detail: failure.detail }
    : null
}

/**
 * Two attempts' worth of failure, as the one error a caller sees. The taxonomy
 * splits where the user's next move differs: a model that answered twice with
 * something unusable is `GENERATION_FAILED` ("try again"), and an API that did
 * not answer at all is `GENERATION_MODEL_ERROR` ("the service").
 */
function exhausted(failures: readonly AttemptFailure[], requestId?: string): AppError {
  const last = failures[failures.length - 1]

  return createError(
    last.code === GenerationFailure.UPSTREAM
      ? ErrorCode.GENERATION_MODEL_ERROR
      : ErrorCode.GENERATION_FAILED,
    {
      requestId,
      details: {
        // The contract's own code for the state this reached, beside the
        // taxonomy's. Both, because §9 names this failure and the client
        // branches on the other one.
        generationCode: GenerationFailure.EXHAUSTED,
        attempts: failures.length,
        failures: failures.map((failure) => failure.code),
        detail: last.detail,
        ...(last.issues ? { issues: last.issues } : {}),
      },
    },
  )
}

/** One attempt's whole answer: call, parse, and — where configured — validate. */
interface Attempt<V> {
  readonly workout: GenerationOutput
  readonly usage: TokenUsage
  readonly validation: V | null
}

/**
 * Call, parse, validate. The three are one step rather than three because the
 * retry budget is one for all of them: parsing is a statement about the shape
 * and validation is a statement about *this* request's candidate set, and
 * GENERATION_CONTRACT §6 gives the hard checks one retry between them rather
 * than one each.
 */
async function attempt<V>(
  config: ComposerConfig<V>,
  system: string,
  message: string,
  input: PromptInput,
): Promise<Result<Attempt<V>, AttemptFailure>> {
  const completion = await callClaude(config, system, message)
  if (!completion.ok) return err(completion.error)

  const parsed = parseCompletion(completion.value.text)
  if (!parsed.ok) return err(parsed.error)

  const usage = completion.value.usage
  if (!config.validate) return ok({ workout: parsed.value, usage, validation: null })

  const validated = config.validate(parsed.value, input)

  return validated.ok
    ? ok({ workout: parsed.value, usage, validation: validated.value })
    : err(validated.error)
}

export function createComposer<V>(config: ComposerConfig<V>): Composer<V> {
  return {
    async compose(input, requestId) {
      const prompt = assemblePrompt(input)
      const logger = config.logger

      logger?.info('composing workout', {
        requestId,
        promptVersion: prompt.measurement.promptVersion,
        contractVersion: prompt.measurement.contractVersion,
        promptBytes: prompt.measurement.totalBytes,
        candidates: prompt.measurement.candidateCount,
      })

      const failures: AttemptFailure[] = []
      let message = prompt.user

      for (let count = 1; count <= MAX_ATTEMPTS; count += 1) {
        const outcome = await attempt(config, prompt.system, message, input)

        if (outcome.ok) {
          logger?.info('composed workout', {
            requestId,
            attempt: count,
            inputTokens: outcome.value.usage.inputTokens,
            outputTokens: outcome.value.usage.outputTokens,
          })

          return ok({
            workout: outcome.value.workout,
            measurement: prompt.measurement,
            usage: outcome.value.usage,
            attempts: count,
            retriedAfter: failures[0] ?? null,
            validation: outcome.value.validation,
          })
        }

        failures.push(outcome.error)
        logger?.warn('composition attempt failed', {
          requestId,
          attempt: count,
          code: outcome.error.code,
        })

        const correction = correctionFor(outcome.error)
        if (correction) message = withRetryCorrection(prompt.user, correction)
      }

      // Two failures, and the loop ends. There is no third call, no partial
      // object assembled from what did parse, and no fixture standing in for a
      // workout — the caller gets a typed error and the user is told (D2).
      return err(exhausted(failures, requestId))
    },
  }
}
