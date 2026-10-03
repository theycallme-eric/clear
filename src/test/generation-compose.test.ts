import { describe, expect, it, vi } from 'vitest'

import {
  API_KEY_VARIABLE,
  ANTHROPIC_MESSAGES_URL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  GenerationFailure,
  MAX_ATTEMPTS,
  ProviderFailureKind,
  ProviderFailureReason,
  apiKeyFromEnv,
  classifyProviderFailure,
  createComposer,
  extractProviderDiagnostic,
  parseCompletion,
  stripCodeFence,
  type ComposerConfig,
} from '../../supabase/functions/_shared/claude.ts'
import { PROMPT_VERSION, buildUserMessage } from '../../supabase/functions/_shared/prompt.ts'
import { ErrorCode } from '../state/errors'
import { createLogger, type LogLevel, type LogSink } from '../state/logger'
import { CONTRACT_VERSION, generationOutputSchema } from '../state/schemas'
import { promptInput } from './generation-prompt-fixtures'
import {
  BLANK_EQUIPMENT_RESPONSE,
  MALFORMED_TARGET_RESPONSE,
  NOT_JSON_RESPONSE,
  VALID_RESPONSE,
  claudeResponse,
} from './generation-response-fixtures'

// GEN-02b's other half: the call, and the one retry. What is under test is a
// counting rule with a user waiting at the end of it — exactly one retry, then
// a typed error — so every test here asserts the *number* of calls as well as
// the outcome. A second retry that happened to succeed would still be a defect.
//
// The recorded fixtures are the point of the retry tests. Each is a response a
// model actually can produce — prose instead of JSON, a target whose fields do
// not match its kind, equipment invented for a candidate — and each has to end
// in the same place: one more attempt, then a typed refusal carrying no
// workout at all (D2).

const API_KEY = 'sk-ant-api03-ThisIsNotARealKeyItIsAFixture'

const REQUEST_ID = 'req_abc123_def456'
const PROVIDER_REQUEST_ID = 'req_018EeWyXxfu5pfWkrYcMdjWG'

/** A fetch that answers each call from the list, and records what it was sent. */
function stubFetch(bodies: readonly string[]) {
  const calls: { url: string; init: RequestInit }[] = []

  const send = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const body = bodies[Math.min(calls.length - 1, bodies.length - 1)]
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof globalThis.fetch

  return { send, calls, get count() { return calls.length } }
}

/** The JSON body of the nth request this stub was sent. */
function sentBody(calls: readonly { init: RequestInit }[], index: number) {
  return JSON.parse(String(calls[index].init.body)) as {
    model: string
    max_tokens: number
    system: string
    messages: { role: string; content: string }[]
  }
}

function collectLogs() {
  const lines: { level: LogLevel; line: string }[] = []
  const sink: LogSink = { write: (level, line) => void lines.push({ level, line }) }

  return { logger: createLogger({ scope: 'generate-workout', sink }), lines }
}

describe('the API key', () => {
  it('is read from the environment by name, never from a literal', () => {
    const read = vi.fn((name: string) => (name === API_KEY_VARIABLE ? API_KEY : undefined))
    const key = apiKeyFromEnv(read)

    expect(read).toHaveBeenCalledWith('ANTHROPIC_API_KEY')
    expect(key.ok && key.value).toBe(API_KEY)
  })

  it('is a typed refusal when the secret is not configured, never a throw', () => {
    const missing = apiKeyFromEnv(() => undefined)
    const blank = apiKeyFromEnv(() => '   ')

    for (const result of [missing, blank]) {
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe(ErrorCode.GENERATION_MODEL_ERROR)
      // The variable's name is the only part of a secret that is safe to say.
      expect(result.error.details).toEqual({ missing: 'ANTHROPIC_API_KEY' })
    }
  })

  it('travels in one request header and reaches no log line', async () => {
    const fetch = stubFetch([claudeResponse(VALID_RESPONSE)])
    const { logger, lines } = collectLogs()

    await createComposer({ apiKey: API_KEY, fetch: fetch.send, logger }).compose(
      promptInput(),
      REQUEST_ID,
    )

    const headers = fetch.calls[0].init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe(API_KEY)
    expect(headers['anthropic-version']).toBe('2023-06-01')

    expect(lines.length).toBeGreaterThan(0)
    const logged = lines.map((entry) => entry.line).join('\n')
    expect(logged).not.toContain(API_KEY)
    expect(logged).not.toContain('sk-ant')
    // Nor the prompt: it carries the user's own notes, which are personal data
    // and have no business in an observability sink (CORE-02).
    expect(logged).not.toContain('cranky')
  })
})

describe('a well-formed response', () => {
  it('is returned as a parsed workout with the prompt it was composed from', async () => {
    const fetch = stubFetch([claudeResponse(VALID_RESPONSE, { input: 4210, output: 980 })])
    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(fetch.count).toBe(1)
    expect(composed.ok).toBe(true)
    if (!composed.ok) return

    expect(composed.value.attempts).toBe(1)
    expect(composed.value.retriedAfter).toBeNull()
    expect(composed.value.usage).toEqual({ inputTokens: 4210, outputTokens: 980 })
    expect(composed.value.measurement.promptVersion).toBe(PROMPT_VERSION)
    expect(composed.value.measurement.contractVersion).toBe(CONTRACT_VERSION)
    expect(generationOutputSchema.safeParse(composed.value.workout).success).toBe(true)
  })

  it('sends the assembled prompt — system separate from the user message', async () => {
    const fetch = stubFetch([claudeResponse(VALID_RESPONSE)])
    const input = promptInput()

    await createComposer({ apiKey: API_KEY, fetch: fetch.send }).compose(input, REQUEST_ID)

    const sent = sentBody(fetch.calls, 0)
    expect(fetch.calls[0].url).toBe(ANTHROPIC_MESSAGES_URL)
    expect(sent.model).toBe(DEFAULT_MODEL)
    expect(sent.max_tokens).toBe(DEFAULT_MAX_TOKENS)
    expect(sent.system).toContain('You compose personalized workouts for CLEAR')
    expect(sent.messages).toEqual([{ role: 'user', content: buildUserMessage(input) }])
    // Restores the historically accepted Messages shape without a second,
    // provider-normalized schema. Domain validation still runs after parsing.
    expect(Object.keys(sent).sort()).toEqual(['max_tokens', 'messages', 'model', 'system'])
    expect(sent.max_tokens).toBe(16_384)
    expect(sent.system).toContain('exercise_id')
  })

  it('survives the markdown fence a model wraps JSON in', () => {
    const fenced = '```json\n{"a":1}\n```'

    expect(stripCodeFence(fenced)).toBe('{"a":1}')
    expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}')
  })
})

describe('a controlled one-attempt acceptance budget', () => {
  it.each([
    ['prose', claudeResponse(NOT_JSON_RESPONSE), GenerationFailure.MALFORMED],
    ['invalid canonical target', claudeResponse(MALFORMED_TARGET_RESPONSE), GenerationFailure.MALFORMED],
    ['truncated JSON', JSON.stringify({ content: [{ type: 'text', text: '{' }], stop_reason: 'max_tokens' }), GenerationFailure.MALFORMED],
    ['no content', JSON.stringify({ content: [] }), GenerationFailure.UPSTREAM],
  ])('refuses %s without a second model request or any workout', async (_name, response, failure) => {
    const fetch = stubFetch([response, claudeResponse(VALID_RESPONSE)])
    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send, attemptLimit: 1 })
      .compose(promptInput(), REQUEST_ID)

    expect(fetch.count).toBe(1)
    expect(composed.ok).toBe(false)
    expect(composed).not.toHaveProperty('value')
    if (composed.ok) return
    expect(composed.error.details).toMatchObject({ attempts: 1, retryable: false, generationCode: failure })
    expect(composed.error.message).not.toContain('twice')
  })

  it.each([429, 500, 529])('does not retry a normally transient HTTP %s', async (status) => {
    const send = vi.fn(async () => new Response('{}', { status })) as unknown as typeof globalThis.fetch
    const composed = await createComposer({ apiKey: API_KEY, fetch: send, attemptLimit: 1 })
      .compose(promptInput(), REQUEST_ID)

    expect(send).toHaveBeenCalledTimes(1)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.details).toMatchObject({ attempts: 1, retryable: false })
  })

  it('does not retry a network exception', async () => {
    const send = vi.fn(async () => { throw new TypeError('offline') }) as unknown as typeof globalThis.fetch
    const composed = await createComposer({ apiKey: API_KEY, fetch: send, attemptLimit: 1 })
      .compose(promptInput(), REQUEST_ID)

    expect(send).toHaveBeenCalledTimes(1)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.details).toMatchObject({ attempts: 1, retryable: false })
  })

  it.each([GenerationFailure.INVALID_REFERENCE, GenerationFailure.DURATION_IMPLAUSIBLE])(
    'keeps domain validation %s mandatory with no fallback', async (failure) => {
      const fetch = stubFetch([claudeResponse(VALID_RESPONSE)])
      const validate = vi.fn(() => ({ ok: false as const, error: { code: failure, detail: 'Domain check failed.' } }))
      const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send, attemptLimit: 1, validate })
        .compose(promptInput(), REQUEST_ID)

      expect(fetch.count).toBe(1)
      expect(validate).toHaveBeenCalledTimes(1)
      expect(composed.ok).toBe(false)
      expect(composed).not.toHaveProperty('value')
      if (composed.ok) return
      expect(composed.error.details).toMatchObject({ generationCode: failure, attempts: 1, retryable: false })
    },
  )

  it('does not alter a valid response, model or output ceiling', async () => {
    const fetch = stubFetch([claudeResponse(VALID_RESPONSE)])
    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send, attemptLimit: 1 })
      .compose(promptInput(), REQUEST_ID)

    expect(fetch.count).toBe(1)
    expect(composed.ok).toBe(true)
    expect(sentBody(fetch.calls, 0)).toMatchObject({ model: DEFAULT_MODEL, max_tokens: 16_384 })
  })

  it.each([0, 2, 3, -1, '1', null, Number.NaN])('cannot raise the ordinary two-call ceiling with %s', async (attemptLimit) => {
    const fetch = stubFetch([claudeResponse(NOT_JSON_RESPONSE)])
    const config = { apiKey: API_KEY, fetch: fetch.send, attemptLimit } as unknown as ComposerConfig
    const composed = await createComposer(config).compose(promptInput(), REQUEST_ID)

    expect(fetch.count).toBe(2)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.details?.generationCode).toBe(GenerationFailure.EXHAUSTED)
    expect(composed.error.details).not.toHaveProperty('retryable')
  })
})

describe('a recorded invalid response', () => {
  const invalid = [
    ['prose instead of JSON', NOT_JSON_RESPONSE],
    ['a target whose fields do not match its kind', MALFORMED_TARGET_RESPONSE],
    ['a blank equipment value in a block with no clock', BLANK_EQUIPMENT_RESPONSE],
  ] as const

  it.each(invalid)('triggers exactly one retry when it is %s', async (_name, body) => {
    const fetch = stubFetch([claudeResponse(body), claudeResponse(VALID_RESPONSE)])
    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(fetch.count).toBe(2)
    expect(composed.ok).toBe(true)
    if (!composed.ok) return

    expect(composed.value.attempts).toBe(2)
    expect(composed.value.retriedAfter?.code).toBe(GenerationFailure.MALFORMED)
  })

  it('records failed-attempt usage without changing the successful attempt usage', async () => {
    const fetch = stubFetch([
      claudeResponse(NOT_JSON_RESPONSE, { input: 3_900, output: 850 }),
      claudeResponse(VALID_RESPONSE, { input: 4_100, output: 900 }),
    ])
    const { logger, lines } = collectLogs()
    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send, logger }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(fetch.count).toBe(2)
    expect(composed.ok).toBe(true)
    if (!composed.ok) return
    expect(composed.value.usage).toEqual({ inputTokens: 4_100, outputTokens: 900 })
    expect(composed.value.retriedAfter?.usage).toEqual({ inputTokens: 3_900, outputTokens: 850 })
    const warning = lines.find((entry) => entry.level === 'warn')
    expect(warning && JSON.parse(warning.line).usage).toEqual({ input: 3_900, output: 850 })
  })

  it('retains reported usage when candidate validation rejects the response twice', async () => {
    const fetch = stubFetch([claudeResponse(VALID_RESPONSE, { input: 3_900, output: 850 })])
    const { logger, lines } = collectLogs()
    const validate = vi.fn(() => ({
      ok: false as const,
      error: {
        code: GenerationFailure.INVALID_REFERENCE,
        detail: 'An exercise is outside the candidates.',
      },
    }))
    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send, logger, validate })
      .compose(promptInput(), REQUEST_ID)

    expect(fetch.count).toBe(2)
    expect(validate).toHaveBeenCalledTimes(2)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.details?.generationCode).toBe(GenerationFailure.EXHAUSTED)
    expect(composed.error.details?.usage).toEqual({ input: 3_900, output: 850 })
    const warnings = lines.filter((entry) => entry.level === 'warn')
    expect(warnings.map((entry) => JSON.parse(entry.line).usage)).toEqual([
      { input: 3_900, output: 850 },
      { input: 3_900, output: 850 },
    ])
  })

  it.each(invalid)('then a typed generation error when it is %s twice', async (_name, body) => {
    const fetch = stubFetch([claudeResponse(body)])
    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send }).compose(
      promptInput(),
      REQUEST_ID,
    )

    // The whole rule, in one number: attempted twice, never a third time.
    expect(fetch.count).toBe(MAX_ATTEMPTS)
    expect(fetch.count).toBe(2)
    expect(composed.ok).toBe(false)
    if (composed.ok) return

    expect(composed.error.code).toBe(ErrorCode.GENERATION_FAILED)
    expect(composed.error.requestId).toBe(REQUEST_ID)
    expect(composed.error.details?.generationCode).toBe(GenerationFailure.EXHAUSTED)
    expect(composed.error.details?.failures).toEqual([
      GenerationFailure.MALFORMED,
      GenerationFailure.MALFORMED,
    ])
  })

  it('carries no workout, not even the part of it that parsed', async () => {
    const fetch = stubFetch([claudeResponse(MALFORMED_TARGET_RESPONSE)])
    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(composed.ok).toBe(false)
    if (composed.ok) return

    // D2. A result object with no `value` is the whole guarantee: there is no
    // half workout to render and no fixture standing in for one.
    expect('value' in composed).toBe(false)
    expect(JSON.stringify(composed.error)).not.toContain('section_title')
  })

  it('retries with the original prompt plus the correction, and nothing else', async () => {
    const fetch = stubFetch([
      claudeResponse(MALFORMED_TARGET_RESPONSE),
      claudeResponse(VALID_RESPONSE),
    ])
    const input = promptInput()

    await createComposer({ apiKey: API_KEY, fetch: fetch.send }).compose(input, REQUEST_ID)

    const first = sentBody(fetch.calls, 0).messages[0].content
    const second = sentBody(fetch.calls, 1).messages[0].content

    expect(first).toBe(buildUserMessage(input))
    expect(second.startsWith(first)).toBe(true)
    expect(second.slice(first.length)).toContain(
      `RETRY CORRECTION\nThe prior response failed: ${GenerationFailure.MALFORMED}.`,
    )
    // §4: the addendum names the field, and asks for a whole object back.
    expect(second).toContain('target_value')
    expect(second).toContain('Return a complete corrected JSON object.')
    // And the system prompt is the same one — a retry is the same request.
    expect(sentBody(fetch.calls, 1).system).toBe(sentBody(fetch.calls, 0).system)
  })
})

describe('an upstream failure', () => {
  it('identifies output-limit truncation without trying to parse the partial body', async () => {
    const truncated = JSON.stringify({
      type: 'message',
      content: [{ type: 'text', text: '{"title":"unfinished"' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 4_200, output_tokens: DEFAULT_MAX_TOKENS },
    })
    const fetch = stubFetch([truncated])
    const { logger, lines } = collectLogs()

    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send, logger }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(fetch.count).toBe(2)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.code).toBe(ErrorCode.GENERATION_FAILED)
    expect(composed.error.details?.detail).toBe(
      `The response reached the ${DEFAULT_MAX_TOKENS} token output limit.`,
    )
    expect(composed.error.details?.generationCode).toBe(GenerationFailure.EXHAUSTED)
    expect(composed.error.details?.usage).toEqual({ input: 4_200, output: DEFAULT_MAX_TOKENS })
    const warnings = lines.filter((entry) => entry.level === 'warn')
    expect(warnings.map((entry) => JSON.parse(entry.line).usage)).toEqual([
      { input: 4_200, output: DEFAULT_MAX_TOKENS },
      { input: 4_200, output: DEFAULT_MAX_TOKENS },
    ])
  })

  it('classifies a structured-output refusal without retrying or retaining its text', async () => {
    const refusedText = 'provider refusal detail must remain private'
    const refused = JSON.stringify({
      type: 'message',
      content: [{ type: 'text', text: refusedText }],
      stop_reason: 'refusal',
      usage: { input_tokens: 4_200, output_tokens: 12 },
    })
    const send = vi.fn(async () =>
      new Response(refused, { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as unknown as typeof globalThis.fetch
    const { logger, lines } = collectLogs()

    const composed = await createComposer({ apiKey: API_KEY, fetch: send, logger }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(send).toHaveBeenCalledTimes(1)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.code).toBe(ErrorCode.GENERATION_MODEL_ERROR)
    expect(composed.error.details?.attempts).toBe(1)
    expect(composed.error.details?.generationCode).toBe(GenerationFailure.UPSTREAM)
    expect(composed.error.details?.retryable).toBe(false)
    expect(composed.error.details?.detail).toBe('The API refused the request.')
    expect(composed.error.details?.usage).toEqual({ input: 4_200, output: 12 })
    expect(composed.error.message).not.toContain('twice')
    const warning = lines.find((entry) => entry.level === 'warn')
    expect(warning && JSON.parse(warning.line).usage).toEqual({ input: 4_200, output: 12 })
    expect(lines.map((entry) => entry.line).join('\n')).not.toContain(refusedText)
  })

  it('classifies provider failures without retaining their response body', () => {
    expect(
      classifyProviderFailure(400, {
        error: { message: 'Your credit balance is too low. Secret note: cranky shoulder.' },
      }),
    ).toEqual({ kind: ProviderFailureKind.CREDIT, retryable: false })
    expect(classifyProviderFailure(401, { error: { message: 'invalid x-api-key' } })).toEqual({
      kind: ProviderFailureKind.AUTHENTICATION,
      retryable: false,
    })
    expect(classifyProviderFailure(429, null)).toEqual({
      kind: ProviderFailureKind.RATE_LIMIT,
      retryable: true,
    })
    expect(classifyProviderFailure(529, null)).toEqual({
      kind: ProviderFailureKind.OVERLOADED,
      retryable: true,
    })
  })

  it('does not retry a deterministic 400 response or log its body', async () => {
    const providerBody = JSON.stringify({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'Your credit balance is too low. Secret note: cranky shoulder.',
      },
    })
    const send = vi.fn(async () =>
      new Response(providerBody, {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof globalThis.fetch
    const { logger, lines } = collectLogs()

    const composed = await createComposer({ apiKey: API_KEY, fetch: send, logger }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(send).toHaveBeenCalledTimes(1)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.details?.attempts).toBe(1)
    expect(composed.error.details?.generationCode).toBe(GenerationFailure.UPSTREAM)
    expect(composed.error.details?.retryable).toBe(false)
    expect(composed.error.details?.detail).toBe('The API answered 400 (credit).')
    expect(composed.error.details?.provider).toEqual({
      status: 400,
      reason: ProviderFailureReason.REQUEST_OTHER,
      errorType: 'invalid_request_error',
      requestId: null,
    })

    const logged = lines.map((entry) => entry.line).join('\n')
    expect(logged).toContain('The API answered 400 (credit).')
    expect(logged).not.toContain('cranky shoulder')
    expect(logged).not.toContain('credit balance is too low')
    expect(logged).not.toContain(API_KEY)
  })

  it('retains only an allowlisted compilation diagnostic and provider request ID', async () => {
    const privateValue = 'private prompt cranky shoulder must never be logged'
    const providerBody = JSON.stringify({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'Schema is too complex for compilation.',
        private: privateValue,
      },
      request_id: 'req_bodyValueIsNotTheHeader',
    })
    const send = vi.fn(async () =>
      new Response(providerBody, {
        status: 400,
        headers: {
          'content-type': 'application/json',
          'request-id': PROVIDER_REQUEST_ID,
          'x-private': privateValue,
        },
      }),
    ) as unknown as typeof globalThis.fetch
    const { logger, lines } = collectLogs()
    const composed = await createComposer({ apiKey: API_KEY, fetch: send, logger }).compose(
      promptInput(),
      REQUEST_ID,
    )
    const provider = {
      status: 400,
      reason: ProviderFailureReason.SCHEMA_COMPLEXITY,
      errorType: 'invalid_request_error',
      requestId: PROVIDER_REQUEST_ID,
    }

    expect(send).toHaveBeenCalledTimes(1)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.details?.provider).toEqual(provider)
    expect(composed.error.details?.generationCode).toBe(GenerationFailure.UPSTREAM)
    expect(composed.error.details?.retryable).toBe(false)
    expect(composed.error.message).not.toContain('twice')
    const warnings = lines
      .filter((entry) => entry.level === 'warn')
      .map((entry) => JSON.parse(entry.line))
    expect(warnings).toHaveLength(1)
    expect(warnings[0].provider).toEqual(provider)
    const retained = JSON.stringify({ error: composed.error, logs: lines })
    expect(retained).not.toContain(privateValue)
    expect(retained).not.toContain('Schema is too complex for compilation.')
    expect(retained).not.toContain('req_bodyValueIsNotTheHeader')
    expect(retained).not.toContain('x-private')
  })

  it('does not retain malformed reported usage from a refused response', async () => {
    const fetch = stubFetch([JSON.stringify({
      stop_reason: 'refusal',
      usage: { input_tokens: -1, output_tokens: 'private token-looking data' },
    })])
    const { logger, lines } = collectLogs()
    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send, logger }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(fetch.count).toBe(1)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.details?.usage).toEqual({ input: null, output: null })
    expect(JSON.stringify({ error: composed.error, logs: lines }))
      .not.toContain('private token-looking data')
  })

  it('keeps a terminal retry restriction when the second call is a deterministic rejection', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response('overloaded', { status: 529 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { type: 'invalid_request_error', message: 'Schema is too complex for compilation.' },
      }), { status: 400 })) as unknown as typeof globalThis.fetch
    const composed = await createComposer({ apiKey: API_KEY, fetch: send }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(send).toHaveBeenCalledTimes(2)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.details?.attempts).toBe(2)
    expect(composed.error.details?.generationCode).toBe(GenerationFailure.EXHAUSTED)
    expect(composed.error.details?.retryable).toBe(false)
    expect(composed.error.details?.provider).toEqual({
      status: 400,
      reason: ProviderFailureReason.SCHEMA_COMPLEXITY,
      errorType: 'invalid_request_error',
      requestId: null,
    })
  })

  it('is retried once, without a correction there is nothing to correct', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response('overloaded', { status: 529 }))
      .mockResolvedValueOnce(
        new Response(claudeResponse(VALID_RESPONSE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ) as unknown as typeof globalThis.fetch

    const input = promptInput()
    const composed = await createComposer({ apiKey: API_KEY, fetch: send }).compose(
      input,
      REQUEST_ID,
    )

    expect(send).toHaveBeenCalledTimes(2)
    expect(composed.ok).toBe(true)
    if (!composed.ok) return

    expect(composed.value.retriedAfter?.code).toBe(GenerationFailure.UPSTREAM)

    // The second call is the first one again. Telling a model that the network
    // failed would be an instruction it cannot act on.
    const second = JSON.parse(
      String((send as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].body),
    ) as { messages: { content: string }[] }
    expect(second.messages[0].content).toBe(buildUserMessage(input))
  })

  it('twice is the service error, not a composition failure', async () => {
    const send = vi.fn(async () =>
      new Response('raw-provider-payload-do-not-log', { status: 529 }),
    ) as unknown as typeof globalThis.fetch
    const { logger, lines } = collectLogs()

    const composed = await createComposer({ apiKey: API_KEY, fetch: send, logger }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(send).toHaveBeenCalledTimes(2)
    expect(composed.ok).toBe(false)
    if (composed.ok) return

    expect(composed.error.code).toBe(ErrorCode.GENERATION_MODEL_ERROR)
    expect(composed.error.details?.generationCode).toBe(GenerationFailure.EXHAUSTED)
    expect(composed.error.details?.detail).toBe('The API answered 529 (overloaded).')

    const warnings = lines
      .filter((entry) => entry.level === 'warn')
      .map((entry) => JSON.parse(entry.line) as Record<string, unknown>)
    expect(warnings).toHaveLength(2)
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attempt: 1,
          code: GenerationFailure.UPSTREAM,
          detail: 'The API answered 529 (overloaded).',
        }),
        expect.objectContaining({
          attempt: 2,
          code: GenerationFailure.UPSTREAM,
          detail: 'The API answered 529 (overloaded).',
        }),
      ]),
    )
    const logged = lines.map((entry) => entry.line).join('\n')
    expect(logged).not.toContain('raw-provider-payload-do-not-log')
    expect(logged).not.toContain(API_KEY)
  })

  it('is what a thrown fetch becomes — never an exception out of compose', async () => {
    const send = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof globalThis.fetch

    const composed = await createComposer({ apiKey: API_KEY, fetch: send }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.code).toBe(ErrorCode.GENERATION_MODEL_ERROR)
  })

  it('is an answer with no text content', async () => {
    const empty = JSON.stringify({ content: [], usage: {} })
    const fetch = stubFetch([empty])

    const composed = await createComposer({ apiKey: API_KEY, fetch: fetch.send }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(fetch.count).toBe(2)
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.error.code).toBe(ErrorCode.GENERATION_MODEL_ERROR)
  })
})

describe('safe provider diagnostics', () => {
  it('reconstructs the documented compilation reason rather than returning its message', () => {
    expect(extractProviderDiagnostic(
      400,
      { error: { type: 'invalid_request_error', message: 'Schema is too complex for compilation.' } },
      PROVIDER_REQUEST_ID,
    )).toEqual({
      status: 400,
      reason: ProviderFailureReason.SCHEMA_COMPLEXITY,
      errorType: 'invalid_request_error',
      requestId: PROVIDER_REQUEST_ID,
    })
  })

  it.each([
    null,
    'a raw provider body',
    [],
    {},
    { error: 'invalid_request_error' },
    { error: [] },
    { error: { type: 'secret-type', message: 'unknown private provider message' } },
  ])('maps malformed or unknown bodies to closed unknown fields: %j', (body) => {
    expect(extractProviderDiagnostic(400, body, undefined)).toEqual({
      status: 400,
      reason: ProviderFailureReason.REQUEST_OTHER,
      errorType: null,
      requestId: null,
    })
  })

  it.each([
    null,
    undefined,
    123,
    'req_a',
    `req_${'a'.repeat(129)}`,
    'req_abc123_def456',
    ` ${PROVIDER_REQUEST_ID}`,
    `${PROVIDER_REQUEST_ID}\n`,
    'msg_018EeWyXxfu5pfWkrYcMdjWG',
    API_KEY,
  ])('rejects non-provider or unbounded request IDs: %j', (requestId) => {
    expect(extractProviderDiagnostic(400, null, requestId).requestId).toBeNull()
  })

  it('accepts only bounded alphanumeric provider IDs', () => {
    const largest = `req_${'a'.repeat(128)}`
    expect(extractProviderDiagnostic(400, null, largest).requestId).toBe(largest)
  })

  it.each([
    [400, 'Schema is too complex for compilation. private prompt'],
    [400, 'nested schemas have some unknown complexity error'],
    [400, 'private message '.repeat(10_000)],
    [500, 'Schema is too complex for compilation.'],
  ])('does not infer a compilation failure from other diagnostics', (status, message) => {
    const diagnostic = extractProviderDiagnostic(status, {
      error: { type: 'invalid_request_error', message },
    }, null)

    expect(diagnostic.reason).toBe(ProviderFailureReason.REQUEST_OTHER)
    expect(Object.keys(diagnostic)).toEqual(['status', 'reason', 'errorType', 'requestId'])
    expect(JSON.stringify(diagnostic)).not.toContain(message)
  })
})

describe('parsing a completion', () => {
  it('names the paths that were wrong, and quotes none of the payload back', () => {
    const parsed = parseCompletion(MALFORMED_TARGET_RESPONSE)

    expect(parsed.ok).toBe(false)
    if (parsed.ok) return

    expect(parsed.error.code).toBe(GenerationFailure.MALFORMED)
    expect(parsed.error.issues?.length).toBeGreaterThan(0)
    expect(parsed.error.detail).toContain('sections[0].blocks[0].exercises[0]')
    expect(parsed.error.detail).not.toContain('Reverse Lunge')
  })

  it('calls prose what it is rather than guessing at a field', () => {
    const parsed = parseCompletion(NOT_JSON_RESPONSE)

    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error.detail).toBe('The response was not valid JSON.')
    expect(parsed.error.issues).toBeUndefined()
  })
})
