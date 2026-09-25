import { describe, expect, it, vi } from 'vitest'

import {
  API_KEY_VARIABLE,
  ANTHROPIC_MESSAGES_URL,
  DEFAULT_MODEL,
  GenerationFailure,
  MAX_ATTEMPTS,
  apiKeyFromEnv,
  createComposer,
  parseCompletion,
  stripCodeFence,
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
    expect(sent.system).toContain('You compose personalized workouts for CLEAR')
    expect(sent.messages).toEqual([{ role: 'user', content: buildUserMessage(input) }])
  })

  it('survives the markdown fence a model wraps JSON in', () => {
    const fenced = '```json\n{"a":1}\n```'

    expect(stripCodeFence(fenced)).toBe('{"a":1}')
    expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}')
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
      new Response('overloaded', { status: 529 }),
    ) as unknown as typeof globalThis.fetch

    const composed = await createComposer({ apiKey: API_KEY, fetch: send }).compose(
      promptInput(),
      REQUEST_ID,
    )

    expect(send).toHaveBeenCalledTimes(2)
    expect(composed.ok).toBe(false)
    if (composed.ok) return

    expect(composed.error.code).toBe(ErrorCode.GENERATION_MODEL_ERROR)
    expect(composed.error.details?.generationCode).toBe(GenerationFailure.EXHAUSTED)
    expect(composed.error.details?.detail).toBe('The API answered 529.')
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
