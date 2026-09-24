import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  createEdgeFunction,
  statusForCode,
  type EnvelopeContext,
  type JsonObject,
  type VerifyToken,
} from '../../supabase/functions/_shared/envelope.ts'
import { createTokenVerifier } from '../../supabase/functions/_shared/auth.ts'
import { ErrorCode, err, ok, type AppError } from '../state/errors'
import type { LogLevel, LogSink } from '../state/logger'
import {
  errorResponseSchema,
  generationRequestSchema,
  requestIdSchema,
  type GenerationRequest,
} from '../state/schemas'

// GEN-01. The envelope is the shell every AI function wears, so these tests
// drive it the way the network will: a `Request` in, a `Response` out, and the
// log lines it wrote on the way. Nothing here mocks the envelope's own parts —
// the schema is CORE-03's real one and the logger is CORE-02's real one — so a
// redaction that stops working fails here rather than in a Supabase log.
//
// The three things the requirement asks to be proven: an unauthenticated call
// is a typed 401, a malformed body is a 400 naming the paths that were wrong,
// and neither `authorization` nor `apikey` ever reaches a log line (defect D3).

const repoRoot = resolve(import.meta.dirname, '../..')

const read = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), 'utf-8')

// Shaped like the credentials this function meets, because a test that redacts
// the string `'token'` proves nothing about a JWT.
const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlLXZhbHVl'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.YW5vbi1zaWduYXR1cmU'
const USER = { id: '11111111-1111-4111-8111-111111111111' }

const CLIENT_REQUEST_ID = 'req_lxyz123_a1b2c3'

const validBody: GenerationRequest = {
  request_id: CLIENT_REQUEST_ID,
  focus: 'full_body',
  requested_intensity: 6,
  requested_duration_mins: 45,
  location_id: '22222222-2222-4222-8222-222222222222',
  notes: null,
}

// ─────────────────────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────────────────────

interface MemorySink extends LogSink {
  readonly lines: string[]
  /** Every line written, as one string — what a log search would see. */
  output(): string
}

function memorySink(): MemorySink {
  const lines: string[] = []

  return {
    lines,
    write(_level: LogLevel, line: string) {
      lines.push(line)
    },
    output: () => lines.join('\n'),
  }
}

const acceptToken: VerifyToken = async () => ok(USER)

const echoHandler = async ({ body, user }: EnvelopeContext<GenerationRequest>) =>
  ok({ focus: body.focus, ownerId: user.id } satisfies JsonObject)

interface HarnessOptions {
  verifyToken?: VerifyToken
  handle?: (context: EnvelopeContext<GenerationRequest>) => Promise<Result> | Result
  allowOrigin?: string
  sink?: MemorySink
}

type Result = ReturnType<typeof ok<JsonObject>> | ReturnType<typeof err<AppError>>

function harness(options: HarnessOptions = {}) {
  const sink = options.sink ?? memorySink()
  let clock = 1_000

  const handleRequest = createEdgeFunction<GenerationRequest>({
    route: 'generate-workout',
    schema: generationRequestSchema,
    verifyToken: options.verifyToken ?? acceptToken,
    handle: options.handle ?? echoHandler,
    allowOrigin: options.allowOrigin,
    sink,
    // Deterministic, so a duration is asserted rather than tolerated.
    now: () => (clock += 3),
  })

  return { handleRequest, sink }
}

interface RequestOptions {
  method?: string
  token?: string | null
  authorization?: string
  requestId?: string | null
  body?: unknown
  rawBody?: string
}

function request(options: RequestOptions = {}): Request {
  const { token = ACCESS_TOKEN, requestId = CLIENT_REQUEST_ID } = options
  const headers = new Headers({ 'Content-Type': 'application/json', apikey: ANON_KEY })

  if (options.authorization !== undefined) headers.set('Authorization', options.authorization)
  else if (token !== null) headers.set('Authorization', `Bearer ${token}`)

  if (requestId !== null) headers.set('X-Request-ID', requestId)

  const method = options.method ?? 'POST'
  const body =
    method === 'GET' || method === 'OPTIONS'
      ? undefined
      : (options.rawBody ?? JSON.stringify(options.body ?? validBody))

  return new Request('https://project.supabase.co/functions/v1/generate-workout', {
    method,
    headers,
    body,
  })
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

/** Every failure the envelope writes is one the client can parse (CORE-03). */
function parsedError(payload: unknown) {
  return errorResponseSchema.parse(payload)
}

// ─────────────────────────────────────────────────────────────────────────────
// Unauthenticated → 401, typed
// ─────────────────────────────────────────────────────────────────────────────

describe('an unauthenticated call is refused in CLEAR‘s own words', () => {
  it('answers 401 with a typed body when no token is presented', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(request({ token: null }))
    const body = parsedError(await bodyOf(response))

    expect(response.status).toBe(401)
    expect(body.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(body.message).toBe('Sign in to continue.')
    expect(body.requestId).toBe(CLIENT_REQUEST_ID)
  })

  it('refuses an authorization header that is not a bearer token', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(request({ authorization: `Basic ${ACCESS_TOKEN}` }))

    expect(response.status).toBe(401)
    expect(parsedError(await bodyOf(response)).code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
  })

  it('never reaches the verifier or the handler without a token', async () => {
    const verifyToken = vi.fn(acceptToken)
    const handle = vi.fn(echoHandler)
    const { handleRequest } = harness({ verifyToken, handle })

    await handleRequest(request({ token: null }))

    expect(verifyToken).not.toHaveBeenCalled()
    expect(handle).not.toHaveBeenCalled()
  })

  it('refuses a token the verifier rejects, and runs no handler', async () => {
    const handle = vi.fn(echoHandler)
    const { handleRequest } = harness({
      verifyToken: async (_token, requestId) =>
        err(createAuthFailure(ErrorCode.AUTH_SESSION_EXPIRED, requestId)),
      handle,
    })

    const response = await handleRequest(request())
    const body = parsedError(await bodyOf(response))

    expect(response.status).toBe(401)
    expect(body.code).toBe(ErrorCode.AUTH_SESSION_EXPIRED)
    expect(body.requestId).toBe(CLIENT_REQUEST_ID)
    expect(handle).not.toHaveBeenCalled()
  })

  it('does not read an unreachable auth service as an unauthenticated caller', async () => {
    // The D1 confusion, one layer down: an outage must not sign anyone out.
    const { handleRequest } = harness({
      verifyToken: async (_token, requestId) =>
        err(createAuthFailure(ErrorCode.NETWORK_SERVER_ERROR, requestId)),
    })

    const response = await handleRequest(request())

    expect(response.status).toBe(500)
    expect(parsedError(await bodyOf(response)).code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
  })

  it('hands the handler the caller GoTrue named, and the token to act as them', async () => {
    const seen: EnvelopeContext<GenerationRequest>[] = []
    const { handleRequest } = harness({
      handle: async (context) => {
        seen.push(context)
        return ok({})
      },
    })

    await handleRequest(request())

    expect(seen).toHaveLength(1)
    expect(seen[0].user).toEqual(USER)
    expect(seen[0].accessToken).toBe(ACCESS_TOKEN)
    expect(seen[0].body).toEqual(validBody)
    expect(seen[0].requestId).toBe(CLIENT_REQUEST_ID)
  })
})

function createAuthFailure(code: ErrorCode, requestId: string): AppError {
  return { code, message: 'refused', requestId }
}

// ─────────────────────────────────────────────────────────────────────────────
// Malformed body → 400, with the paths
// ─────────────────────────────────────────────────────────────────────────────

describe('a malformed body is a 400 that names the fields', () => {
  it('reports every zod issue path rather than "validation failed"', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(
      request({
        body: { ...validBody, focus: 'cardio', requested_intensity: 42 },
      }),
    )
    const body = parsedError(await bodyOf(response))

    expect(response.status).toBe(400)
    expect(body.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    expect(body.issues?.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['focus', 'requested_intensity']),
    )
  })

  it('names a missing field by its path', async () => {
    const { handleRequest } = harness()
    const withoutLocation: Record<string, unknown> = { ...validBody }
    delete withoutLocation.location_id

    const response = await handleRequest(request({ body: withoutLocation }))
    const body = parsedError(await bodyOf(response))

    expect(response.status).toBe(400)
    expect(body.issues?.map((issue) => issue.path)).toContain('location_id')
  })

  it('names a key the contract does not have, instead of ignoring it', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(request({ body: { ...validBody, equipment: ['barbell'] } }))

    expect(response.status).toBe(400)
    expect(JSON.stringify(parsedError(await bodyOf(response)).issues)).toContain('equipment')
  })

  it('answers unparseable input with a root-path issue and no echo of it', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(request({ rawBody: '{"focus": "full_bo' }))
    const body = parsedError(await bodyOf(response))

    expect(response.status).toBe(400)
    expect(body.code).toBe(ErrorCode.VALIDATION_INVALID_FORMAT)
    expect(body.issues).toEqual([{ path: '(root)', message: 'must be valid JSON' }])
    expect(JSON.stringify(body)).not.toContain('full_bo')
  })

  it('answers an empty body the same actionable way', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(request({ rawBody: '' }))
    const body = parsedError(await bodyOf(response))

    expect(response.status).toBe(400)
    expect(body.issues).toEqual([{ path: '(root)', message: 'a JSON body is required' }])
  })

  it('never runs the handler on a body that did not parse', async () => {
    const handle = vi.fn(echoHandler)
    const { handleRequest } = harness({ handle })

    await handleRequest(request({ body: { focus: 'full_body' } }))

    expect(handle).not.toHaveBeenCalled()
  })

  it('refuses a method this function does not answer', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(request({ method: 'GET' }))
    const body = parsedError(await bodyOf(response))

    expect(response.status).toBe(400)
    expect(body.issues).toEqual([{ path: '(root)', message: 'this function accepts POST' }])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The request id, on every response
// ─────────────────────────────────────────────────────────────────────────────

describe('every response echoes the client‘s request id', () => {
  it('echoes it on success, in the body and in the headers', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(request())
    const body = await bodyOf(response)

    expect(response.status).toBe(200)
    expect(body).toEqual({ focus: 'full_body', ownerId: USER.id, requestId: CLIENT_REQUEST_ID })
    expect(response.headers.get('x-request-id')).toBe(CLIENT_REQUEST_ID)
  })

  it('echoes it on a refusal the handler never saw', async () => {
    const { handleRequest } = harness()

    for (const bad of [request({ token: null }), request({ rawBody: 'nope' })]) {
      const response = await handleRequest(bad)
      expect(response.headers.get('x-request-id')).toBe(CLIENT_REQUEST_ID)
      expect(parsedError(await bodyOf(response)).requestId).toBe(CLIENT_REQUEST_ID)
    }
  })

  it('echoes it when the handler throws', async () => {
    const { handleRequest } = harness({
      handle: () => {
        throw new Error('the model client exploded')
      },
    })

    const response = await handleRequest(request())
    const body = parsedError(await bodyOf(response))

    expect(response.status).toBe(500)
    expect(body.code).toBe(ErrorCode.GENERATION_FAILED)
    expect(body.requestId).toBe(CLIENT_REQUEST_ID)
    // A thrown message can quote anything it was handling.
    expect(JSON.stringify(body)).not.toContain('exploded')
  })

  it('echoes the id a handler‘s own typed failure carries', async () => {
    const { handleRequest } = harness({
      handle: ({ requestId }) =>
        err({
          code: ErrorCode.GENERATION_NO_CANDIDATES,
          message: 'No exercises match these options. Change equipment or exclusions.',
          requestId,
        }),
    })

    const response = await handleRequest(request())

    expect(response.status).toBe(422)
    expect(parsedError(await bodyOf(response)).requestId).toBe(CLIENT_REQUEST_ID)
  })

  it('mints one when the client sent none', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(request({ requestId: null }))
    const body = await bodyOf(response)

    expect(requestIdSchema.safeParse(body.requestId).success).toBe(true)
    expect(response.headers.get('x-request-id')).toBe(body.requestId)
  })

  it('replaces an id that would not round-trip rather than echoing it', async () => {
    // Echoing `'; DROP'` back produces a response the client cannot parse —
    // the trace breaking exactly where it was needed.
    const { handleRequest } = harness()

    const response = await handleRequest(request({ requestId: 'not-a-request-id' }))
    const body = await bodyOf(response)

    expect(body.requestId).not.toBe('not-a-request-id')
    expect(requestIdSchema.safeParse(body.requestId).success).toBe(true)
    expect(response.headers.get('x-request-id')).toBe(body.requestId)
  })

  it('maps every code in the taxonomy to a status a client can act on', () => {
    for (const code of Object.values(ErrorCode)) {
      const status = statusForCode(code)
      expect(status).toBeGreaterThanOrEqual(400)
      expect(status).toBeLessThan(600)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The logs (defect D3)
// ─────────────────────────────────────────────────────────────────────────────

describe('no credential reaches a log line (D3)', () => {
  async function exerciseEveryPath(sink: MemorySink) {
    const { handleRequest } = harness({ sink })

    await handleRequest(request({ method: 'OPTIONS' }))
    await handleRequest(request())
    await handleRequest(request({ token: null }))
    await handleRequest(request({ rawBody: '{' }))
    await handleRequest(request({ body: { ...validBody, focus: 'cardio' } }))
    await handleRequest(request({ method: 'GET' }))

    const thrower = harness({
      sink,
      handle: () => {
        throw new Error(`upstream rejected Bearer ${ACCESS_TOKEN} for lifter@example.com`)
      },
    })
    await thrower.handleRequest(request())

    return sink.output()
  }

  it('never writes the words authorization or apikey', async () => {
    const sink = memorySink()

    const output = (await exerciseEveryPath(sink)).toLowerCase()

    expect(output).not.toContain('authorization')
    expect(output).not.toContain('apikey')
    expect(output).not.toContain('api-key')
  })

  it('never writes the token, the anon key, or an address, in any form', async () => {
    const sink = memorySink()

    const output = await exerciseEveryPath(sink)

    expect(output).not.toContain(ACCESS_TOKEN)
    expect(output).not.toContain(ACCESS_TOKEN.slice(0, 24))
    expect(output).not.toContain(ANON_KEY)
    expect(output).not.toContain('bearer')
    expect(output).not.toContain('lifter@example.com')
    expect(sink.lines.length).toBeGreaterThan(0)
  })

  it('writes one request line per response, with the four fields it is allowed', async () => {
    const sink = memorySink()
    const { handleRequest } = harness({ sink })

    await handleRequest(request())

    const summaries = sink.lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry.event === 'edge_request')

    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      event: 'edge_request',
      requestId: CLIENT_REQUEST_ID,
      route: 'generate-workout',
      status: 200,
      durationMs: 3,
    })
  })

  it('records a refusal by code, so a 401 is findable without its body', async () => {
    const sink = memorySink()
    const { handleRequest } = harness({ sink })

    await handleRequest(request({ token: null }))

    const entries = sink.lines.map((line) => JSON.parse(line) as Record<string, unknown>)

    expect(entries).toContainEqual(
      expect.objectContaining({
        scope: 'generate-workout',
        level: 'warn',
        code: ErrorCode.AUTH_UNAUTHENTICATED,
        status: 401,
        requestId: CLIENT_REQUEST_ID,
      }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

describe('CORS is answered by the envelope, not by each function', () => {
  it('answers the preflight with no body and the headers a browser needs', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(request({ method: 'OPTIONS' }))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS')
    expect(response.headers.get('Access-Control-Max-Age')).toBe('86400')

    const allowed = response.headers.get('Access-Control-Allow-Headers') ?? ''
    for (const header of ['authorization', 'apikey', 'content-type', 'x-request-id']) {
      expect(allowed).toContain(header)
    }
  })

  it('carries the origin header on a refusal too, or the browser hides the 401', async () => {
    const { handleRequest } = harness()

    const response = await handleRequest(request({ token: null }))

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('takes a narrower origin when a caller supplies one', async () => {
    const { handleRequest } = harness({ allowOrigin: 'https://clear.example' })

    const response = await handleRequest(request())

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://clear.example')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Reuse (REV-02 adopts it unchanged)
// ─────────────────────────────────────────────────────────────────────────────

describe('the envelope is a module, not this function‘s shape', () => {
  // REV-02's `generate-section` is a different route, a different schema and a
  // different handler — and no different shell.
  const sectionSchema = z.strictObject({ section_id: z.uuid() })

  function sectionFunction(sink: MemorySink) {
    return createEdgeFunction({
      route: 'generate-section',
      schema: sectionSchema,
      verifyToken: acceptToken,
      handle: ({ body }) => ok({ section: body.section_id }),
      sink,
    })
  }

  const sectionRequest = (body: unknown) =>
    new Request('https://project.supabase.co/functions/v1/generate-section', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'X-Request-ID': CLIENT_REQUEST_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

  it('gives a second function the same success and refusal shapes', async () => {
    const sink = memorySink()
    const handleRequest = sectionFunction(sink)

    const success = await handleRequest(
      sectionRequest({ section_id: '33333333-3333-4333-8333-333333333333' }),
    )
    const failure = await handleRequest(sectionRequest({ section_id: 'not-a-uuid' }))

    expect(await bodyOf(success)).toEqual({
      section: '33333333-3333-4333-8333-333333333333',
      requestId: CLIENT_REQUEST_ID,
    })
    expect(failure.status).toBe(400)
    expect(parsedError(await bodyOf(failure)).issues?.[0].path).toBe('section_id')
    expect(sink.output()).toContain('generate-section')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The GoTrue verifier
// ─────────────────────────────────────────────────────────────────────────────

describe('the token is verified by asking GoTrue', () => {
  const config = {
    url: 'https://project.supabase.co/',
    anonKey: ANON_KEY,
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  it('calls /auth/v1/user with the caller‘s token and the anon key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: USER.id, email: 'a@b.test' }))
    const verify = createTokenVerifier({ ...config, fetch: fetchMock as typeof globalThis.fetch })

    const result = await verify(ACCESS_TOKEN, CLIENT_REQUEST_ID)

    expect(result).toEqual(ok(USER))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://project.supabase.co/auth/v1/user')
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({
      apikey: ANON_KEY,
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    })
  })

  it('returns the user id and nothing else about them', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: USER.id, email: 'lifter@example.com', role: 'admin' }))
    const verify = createTokenVerifier({ ...config, fetch: fetchMock as typeof globalThis.fetch })

    const result = await verify(ACCESS_TOKEN, CLIENT_REQUEST_ID)

    expect(result).toEqual(ok({ id: USER.id }))
  })

  it('reads a refusal as unauthenticated and an outage as a server error', async () => {
    const refusing = createTokenVerifier({
      ...config,
      fetch: vi.fn().mockResolvedValue(jsonResponse({ msg: 'invalid JWT' }, 401)) as never,
    })
    const broken = createTokenVerifier({
      ...config,
      fetch: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) as never,
    })
    const confused = createTokenVerifier({
      ...config,
      fetch: vi.fn().mockResolvedValue(jsonResponse({ nothing: true })) as never,
    })

    expect(await refusing(ACCESS_TOKEN, CLIENT_REQUEST_ID)).toEqual(
      err({
        code: ErrorCode.AUTH_UNAUTHENTICATED,
        message: 'Sign in to continue.',
        requestId: CLIENT_REQUEST_ID,
        details: undefined,
      }),
    )
    expect((await broken(ACCESS_TOKEN, CLIENT_REQUEST_ID)).ok).toBe(false)
    expect(await unwrapCode(broken)).toBe(ErrorCode.NETWORK_SERVER_ERROR)
    expect(await unwrapCode(confused)).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
  })

  async function unwrapCode(verify: VerifyToken): Promise<ErrorCode | undefined> {
    const result = await verify(ACCESS_TOKEN, CLIENT_REQUEST_ID)
    return result.ok ? undefined : result.error.code
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// The mounted function, as shipped
// ─────────────────────────────────────────────────────────────────────────────

describe('generate-workout mounts the shared envelope', () => {
  const entry = read('supabase/functions/generate-workout/index.ts')
  const envelope = read('supabase/functions/_shared/envelope.ts')
  const verifier = read('supabase/functions/_shared/auth.ts')
  const config = read('supabase/config.toml')

  it('is the envelope plus a handler, and declares no contract of its own', () => {
    expect(entry).toContain("from '../_shared/envelope.ts'")
    expect(entry).toContain("from '../../../src/state/schemas.ts'")
    expect(entry).toContain('Deno.serve')
    // CORE-03: one schema source. The guard in src/state/schemas.test.ts reads
    // this directory too; this is the same claim, stated where it is mounted.
    expect(entry).not.toContain("from 'zod'")
    expect(entry).not.toContain('z.object(')
  })

  it('reads no credential beyond the two the platform injects', () => {
    const secrets = entry.match(/Deno\.env\.get\('([A-Z_]+)'\)/g) ?? []

    expect(secrets).toEqual(["Deno.env.get('SUPABASE_URL')", "Deno.env.get('SUPABASE_ANON_KEY')"])
    expect(entry).not.toContain('SERVICE_ROLE')
    expect(verifier).not.toContain('SERVICE_ROLE')
  })

  it('verifies the JWT itself, so the 401 is the typed one', () => {
    expect(config).toContain('[functions.generate-workout]')
    expect(config).toContain('verify_jwt = false')
  })

  it('reaches no logger with a request, a header map, or a console', () => {
    for (const source of [entry, envelope, verifier]) {
      expect(source).not.toMatch(/console\.[A-Za-z_$]+\s*\(/)
      expect(source).not.toMatch(/logger\.\w+\([^)]*headers/)
    }
  })

  it('pins the zod the browser ships for the function that imports the same file', () => {
    const denoConfig = JSON.parse(read('supabase/functions/deno.json')) as {
      imports: Record<string, string>
    }
    const packageJson = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>
    }

    expect(denoConfig.imports.zod).toBe(`npm:zod@${packageJson.dependencies.zod}`)
  })
})
