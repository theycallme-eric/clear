/**
 * GEN-03 — what the generation call sends, and every way it refuses.
 *
 * The claim under test is one sentence: a failed generation answers with a
 * typed error carrying a request id, and never with a workout. So most of these
 * are refusals, and each asserts the *code* a caller branches on rather than
 * the message a person reads.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { createError, ErrorCode, isErr, ok, type Result } from '../state/errors'
import { GENERATION_FAILURES } from '../state/schemas'
import { makeGenerationOutput } from '../test/factories'
import type { AuthSession } from './auth'
import {
  codeForStatus,
  createGenerationClient,
  GenerationFailure,
  generationFailureMessage,
  type GenerationClient,
  type GenerationInput,
} from './generation'

const REQUEST_ID = 'req_test_generation'
const FUNCTION_URL = 'https://project.supabase.co/functions/v1/generate-workout'

const INPUT: GenerationInput = {
  focus: 'lower_body',
  requested_intensity: 7,
  requested_duration_mins: 45,
  location_id: '11111111-2222-4333-8444-555555555555',
  notes: null,
  deload: false,
}

const SESSION: AuthSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: Date.now() + 3_600_000,
  user: { id: '99999999-8888-7777-6666-555555555555', email: 'lifter@example.test' },
}

/** A client whose session is live and whose transport is the given double. */
function clientWith(
  fetchImpl: typeof globalThis.fetch,
  session: Result<AuthSession | null> = ok(SESSION),
): GenerationClient {
  return createGenerationClient({
    auth: { getSession: () => Promise.resolve(session) },
    supabase: { url: 'https://project.supabase.co', anonKey: 'anon-key', fetch: fetchImpl },
    requestId: () => REQUEST_ID,
  })
}

/** A `fetch` double answering one body with one status. */
function answering(body: unknown, status = 200): typeof globalThis.fetch {
  return vi.fn(() =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  ) as unknown as typeof globalThis.fetch
}

describe('the generation call', () => {
  it('posts the request to the function, carrying the session and the request id', async () => {
    const workout = makeGenerationOutput()
    const fetchImpl = answering({ requestId: REQUEST_ID, workout })

    const result = await clientWith(fetchImpl).generate(INPUT)

    expect(result.ok).toBe(true)
    expect(result.ok && result.value.workout).toEqual(workout)

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(FUNCTION_URL)
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer access-token')
    expect(headers.apikey).toBe('anon-key')
    // The trace begins in the browser: the id on the wire is the id an error
    // screen shows, and the id the function logs.
    expect(headers['x-request-id']).toBe(REQUEST_ID)

    expect(JSON.parse(String(init.body))).toEqual({ ...INPUT, request_id: REQUEST_ID })
  })

  it('refuses a request the session row could not hold, before any call', async () => {
    const fetchImpl = answering({ requestId: REQUEST_ID, workout: makeGenerationOutput() })

    // `requested_intensity between 1 and 10` is a CHECK constraint, so 11 is a
    // request that cannot become a session however good the model is.
    const result = await clientWith(fetchImpl).generate({ ...INPUT, requested_intensity: 11 })

    expect(isErr(result)).toBe(true)
    expect(!result.ok && result.error.code).toBe(ErrorCode.GENERATION_INVALID_PARAMS)
    expect(!result.ok && result.error.requestId).toBe(REQUEST_ID)
    expect(!result.ok && result.error.retryable).toBe(false)
    expect(!result.ok && result.error.issues.map((issue) => issue.path)).toEqual([
      'requested_intensity',
    ])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses to call the function with no session', async () => {
    const fetchImpl = answering({ requestId: REQUEST_ID, workout: makeGenerationOutput() })

    const result = await clientWith(fetchImpl, ok(null)).generate(INPUT)

    expect(!result.ok && result.error.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(!result.ok && result.error.requestId).toBe(REQUEST_ID)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps the reason the session itself could not be read', async () => {
    const fetchImpl = answering({})
    const expired = { ok: false as const, error: createError(ErrorCode.AUTH_SESSION_EXPIRED) }

    const result = await clientWith(fetchImpl, expired).generate(INPUT)

    expect(!result.ok && result.error.code).toBe(ErrorCode.AUTH_SESSION_EXPIRED)
    expect(!result.ok && result.error.requestId).toBe(REQUEST_ID)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('answers a network killed mid-generate with a typed error carrying the request id', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    ) as unknown as typeof globalThis.fetch

    const result = await clientWith(fetchImpl).generate(INPUT)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe(ErrorCode.NETWORK_OFFLINE)
    expect(!result.ok && result.error.message).toBe('No connection. Check your network.')
    expect(!result.ok && result.error.requestId).toBe(REQUEST_ID)
    expect(!result.ok && result.error.retryable).toBe(true)
  })

  it('re-parses the response and refuses a workout the contract would not accept', async () => {
    // A 200 the function should never have sent: an empty section list is a
    // workout with nothing in it, which is the D2 failure wearing a status code.
    const fetchImpl = answering({
      requestId: REQUEST_ID,
      workout: { ...makeGenerationOutput(), sections: [] },
    })

    const result = await clientWith(fetchImpl).generate(INPUT)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe(ErrorCode.GENERATION_FAILED)
    expect(!result.ok && result.error.failure).toBe(GenerationFailure.MALFORMED_PRESCRIPTION)
    expect(!result.ok && result.error.issues.map((issue) => issue.path)).toEqual([
      'workout.sections',
    ])
  })

  it('refuses a 200 that is not a response shape at all', async () => {
    const fetchImpl = answering({ surprise: true })

    const result = await clientWith(fetchImpl).generate(INPUT)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe(ErrorCode.GENERATION_FAILED)
    expect(!result.ok && result.error.requestId).toBe(REQUEST_ID)
  })

  it('refuses a body that will not read, keeping the status as the only fact', async () => {
    const fetchImpl = answering('<html>gateway</html>', 502)

    const result = await clientWith(fetchImpl).generate(INPUT)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
    expect(!result.ok && result.error.requestId).toBe(REQUEST_ID)
  })

  it('carries the contract §9 code up beside the taxonomy code', async () => {
    const fetchImpl = answering(
      {
        code: ErrorCode.GENERATION_NO_CANDIDATES,
        message: 'No exercises match these options. Change equipment or exclusions.',
        requestId: REQUEST_ID,
        failure: GenerationFailure.NO_CANDIDATES,
      },
      422,
    )

    const result = await clientWith(fetchImpl).generate(INPUT)

    expect(!result.ok && result.error.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
    expect(!result.ok && result.error.failure).toBe(GenerationFailure.NO_CANDIDATES)
    // §9 says an over-constrained request is not retryable as it stands.
    expect(!result.ok && result.error.retryable).toBe(false)
  })

  it('carries the issue paths of a refusal that named fields', async () => {
    const fetchImpl = answering(
      {
        code: ErrorCode.GENERATION_FAILED,
        message: 'Could not generate workout. Try again.',
        requestId: REQUEST_ID,
        issues: [{ path: 'sections[0].blocks[0].exercises[1].sets', message: 'expected int' }],
        failure: GenerationFailure.EXHAUSTED,
      },
      500,
    )

    const result = await clientWith(fetchImpl).generate(INPUT)

    expect(!result.ok && result.error.issues).toEqual([
      { path: 'sections[0].blocks[0].exercises[1].sets', message: 'expected int' },
    ])
    expect(!result.ok && result.error.failure).toBe(GenerationFailure.EXHAUSTED)
    expect(!result.ok && result.error.retryable).toBe(false)
    // The §9 sentence, not the taxonomy's general one.
    expect(!result.ok && result.error.message).toBe(
      generationFailureMessage(GenerationFailure.EXHAUSTED),
    )
  })

  it('never answers with a workout when the function refused', async () => {
    // Both halves in one body. The refusal wins; there is no branch that reads
    // the workout out of a failed answer.
    const fetchImpl = answering(
      {
        code: ErrorCode.GENERATION_MODEL_ERROR,
        message: 'Generation service error. Try again.',
        requestId: REQUEST_ID,
        workout: makeGenerationOutput(),
      },
      502,
    )

    const result = await clientWith(fetchImpl).generate(INPUT)

    expect(result.ok).toBe(false)
    expect('value' in result).toBe(false)
  })

  it('refuses a workout that arrived under a failing status', async () => {
    const fetchImpl = answering(
      { requestId: REQUEST_ID, workout: makeGenerationOutput() },
      500,
    )

    const result = await clientWith(fetchImpl).generate(INPUT)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
  })

  it('mints a fresh request id per call when nobody injected one', async () => {
    const fetchImpl = answering({ surprise: true })
    const client = createGenerationClient({
      auth: { getSession: () => Promise.resolve(ok(SESSION)) },
      supabase: { url: 'https://project.supabase.co/', anonKey: 'anon-key', fetch: fetchImpl },
    })

    const first = await client.generate(INPUT)
    const second = await client.generate(INPUT)

    expect(!first.ok && first.error.requestId).toMatch(/^req_[0-9a-z]+_[0-9a-z]+$/)
    expect(!first.ok && !second.ok && first.error.requestId).not.toBe(
      !second.ok ? second.error.requestId : '',
    )
    // The trailing slash in the configured url does not double up.
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe(FUNCTION_URL)
  })
})

describe('the contract §9 codes', () => {
  /** §9's table, read from the contract itself rather than restated here. */
  const documented = [
    ...readFileSync(
      resolve(import.meta.dirname, '../../docs/specs/generation/GENERATION_CONTRACT.md'),
      'utf8',
    ).matchAll(/`(generation\.[a-z_]+)`\s*\|/g),
  ].map((match) => match[1])

  it('are the list the contract publishes, and no other', () => {
    expect(documented.length).toBeGreaterThan(0)
    expect([...GENERATION_FAILURES].sort()).toEqual([...new Set(documented)].sort())
    // The names this module reads them by are that same list, not a copy of it.
    expect(Object.values(GenerationFailure).sort()).toEqual([...GENERATION_FAILURES].sort())
  })

  it('map to a distinct message each', () => {
    const messages = GENERATION_FAILURES.map(generationFailureMessage)

    for (const message of messages) {
      expect(message).not.toBe('')
    }
    // The acceptance criterion, literally: two codes sharing a sentence is a
    // code that did not need to exist, or a sentence that says too little.
    expect(new Set(messages).size).toBe(GENERATION_FAILURES.length)
  })

  it('carry §9 retryability into the error a screen renders', async () => {
    const retryability = await Promise.all(
      GENERATION_FAILURES.map(async (failure) => {
        const fetchImpl = answering(
          {
            code: ErrorCode.GENERATION_FAILED,
            message: 'Could not generate workout. Try again.',
            requestId: REQUEST_ID,
            failure,
          },
          500,
        )
        const result = await clientWith(fetchImpl).generate(INPUT)

        expect(!result.ok && result.error.message).toBe(generationFailureMessage(failure))
        return [failure, !result.ok && result.error.retryable] as const
      }),
    )

    expect(Object.fromEntries(retryability)).toEqual({
      'generation.no_candidates': false,
      'generation.invalid_reference': true,
      'generation.malformed_prescription': true,
      'generation.duration_implausible': true,
      'generation.upstream': true,
      'generation.exhausted': false,
    })
  })
})

describe('a bare status', () => {
  it.each([
    [401, ErrorCode.AUTH_SESSION_EXPIRED],
    [403, ErrorCode.AUTH_SESSION_EXPIRED],
    [422, ErrorCode.GENERATION_INVALID_PARAMS],
    [429, ErrorCode.NETWORK_RATE_LIMITED],
    [504, ErrorCode.GENERATION_TIMEOUT],
    [500, ErrorCode.NETWORK_SERVER_ERROR],
    [502, ErrorCode.NETWORK_SERVER_ERROR],
    [418, ErrorCode.GENERATION_FAILED],
  ])('reads %i as %s', (status, code) => {
    expect(codeForStatus(status)).toBe(code)
  })
})
