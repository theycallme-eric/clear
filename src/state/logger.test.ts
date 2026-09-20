import { describe, it, expect } from 'vitest'
import {
  createLogger,
  logEdgeRequest,
  formatEdgeRequestLine,
  redact,
  type LogLevel,
  type LogSink,
} from './logger'

/** Captures every emitted line so tests can inspect exact output. */
function memorySink() {
  const lines: Array<{ level: LogLevel; line: string }> = []
  const sink: LogSink = {
    write(level, line) {
      lines.push({ level, line })
    },
  }
  return { sink, lines, joined: () => lines.map((l) => l.line).join('\n') }
}

// Secret fixtures. If any of these strings ever appears in logger output,
// the redaction contract is broken.
const BEARER_VALUE = 'Bearer sk-live-abc123-super-secret'
const APIKEY_VALUE = 'sb_secret_9f8e7d6c5b4a'
const JWT_VALUE =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
const EMAIL_VALUE = 'jane.doe@example.com'

describe('redaction denylist', () => {
  it('never emits authorization or apikey values, regardless of key casing', () => {
    const { sink, joined } = memorySink()
    const log = createLogger({ sink })

    log.info('request prepared', {
      authorization: BEARER_VALUE,
      Authorization: BEARER_VALUE,
      apikey: APIKEY_VALUE,
      apiKey: APIKEY_VALUE,
      'x-api-key': APIKEY_VALUE,
      'X-API-Key': APIKEY_VALUE,
    })

    const output = joined()
    expect(output).not.toContain(BEARER_VALUE)
    expect(output).not.toContain(APIKEY_VALUE)
    expect(output).not.toContain('sk-live')
    expect(output).not.toContain('sb_secret')
    expect(output).toContain('[redacted]')
  })

  it('redacts denylisted keys nested deep inside field objects', () => {
    const { sink, joined } = memorySink()
    const log = createLogger({ sink })

    log.error('call failed', {
      request: {
        meta: {
          authorization: BEARER_VALUE,
          refresh_token: JWT_VALUE,
          cookie: 'session=abc',
          password: 'hunter2',
        },
        route: '/generate-workout',
      },
    })

    const output = joined()
    expect(output).not.toContain(BEARER_VALUE)
    expect(output).not.toContain(JWT_VALUE)
    expect(output).not.toContain('session=abc')
    expect(output).not.toContain('hunter2')
    expect(output).toContain('/generate-workout')
  })

  it('redacts a Headers instance wholesale — a raw header map cannot be logged', () => {
    const { sink, joined } = memorySink()
    const log = createLogger({ sink })

    const headers = new Headers({
      authorization: BEARER_VALUE,
      apikey: APIKEY_VALUE,
      'content-type': 'application/json',
    })

    log.info('incoming request', { headers })

    const output = joined()
    expect(output).not.toContain(BEARER_VALUE)
    expect(output).not.toContain(APIKEY_VALUE)
    expect(output).not.toContain('application/json')
    expect(output).toContain('[redacted:headers]')
  })

  it('redacts token-shaped and email-shaped values inside arbitrary strings', () => {
    const { sink, joined } = memorySink()
    const log = createLogger({ sink })

    log.warn(`retrying for ${EMAIL_VALUE} with ${BEARER_VALUE}`, {
      note: `token was ${JWT_VALUE}, user ${EMAIL_VALUE}`,
    })

    const output = joined()
    expect(output).not.toContain(EMAIL_VALUE)
    expect(output).not.toContain(BEARER_VALUE)
    expect(output).not.toContain(JWT_VALUE)
  })

  it('redacts email keys and values', () => {
    const { sink, joined } = memorySink()
    const log = createLogger({ sink })

    log.info('profile loaded', { email: EMAIL_VALUE, userEmail: EMAIL_VALUE })

    expect(joined()).not.toContain(EMAIL_VALUE)
  })

  it('survives circular structures without throwing', () => {
    const { sink, lines } = memorySink()
    const log = createLogger({ sink })

    const a: Record<string, unknown> = { name: 'a' }
    a.self = a

    expect(() => log.info('circular', { a })).not.toThrow()
    expect(lines).toHaveLength(1)
    expect(lines[0].line).toContain('[circular]')
  })
})

describe('redact helper', () => {
  it('masks denylisted keys and preserves safe ones', () => {
    const result = redact({
      authorization: BEARER_VALUE,
      requestId: 'req_abc_123',
    }) as Record<string, unknown>

    expect(result.authorization).toBe('[redacted]')
    expect(result.requestId).toBe('req_abc_123')
  })
})

describe('leveled logging', () => {
  it('suppresses entries below the configured level', () => {
    const { sink, lines } = memorySink()
    const log = createLogger({ sink, level: 'warn' })

    log.debug('quiet')
    log.info('quiet')
    log.warn('loud')
    log.error('loud')

    expect(lines.map((l) => l.level)).toEqual(['warn', 'error'])
  })

  it('emits structured JSON lines with level, msg, and time', () => {
    const { sink, lines } = memorySink()
    const log = createLogger({ sink })

    log.info('hello', { requestId: 'req_x_y' })

    const entry = JSON.parse(lines[0].line)
    expect(entry.level).toBe('info')
    expect(entry.msg).toBe('hello')
    expect(entry.requestId).toBe('req_x_y')
    expect(typeof entry.time).toBe('string')
  })

  it('does not let caller fields spoof the fixed entry keys', () => {
    const { sink, lines } = memorySink()
    const log = createLogger({ sink })

    log.info('real message', { level: 'error', msg: 'spoofed' })

    const entry = JSON.parse(lines[0].line)
    expect(entry.level).toBe('info')
    expect(entry.msg).toBe('real message')
  })
})

describe('scoped children', () => {
  it('joins scopes and carries bound fields into every entry', () => {
    const { sink, lines } = memorySink()
    const root = createLogger({ sink, scope: 'data' })
    const child = root.child('supabase', { requestId: 'req_1_a' })

    child.info('query ok', { rows: 3 })

    const entry = JSON.parse(lines[0].line)
    expect(entry.scope).toBe('data.supabase')
    expect(entry.requestId).toBe('req_1_a')
    expect(entry.rows).toBe(3)
  })

  it('redacts bound fields the same as call-site fields', () => {
    const { sink, joined } = memorySink()
    const child = createLogger({ sink }).child('auth', {
      authorization: BEARER_VALUE,
    })

    child.info('bound secret must not leak')

    expect(joined()).not.toContain(BEARER_VALUE)
  })
})

describe('edge request logging', () => {
  it('emits exactly one line per request with only the contract fields', () => {
    const { sink, lines } = memorySink()

    logEdgeRequest(
      {
        requestId: 'req_lxyz_a1b2c3',
        route: '/generate-workout',
        status: 200,
        durationMs: 412,
      },
      sink
    )

    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0].line)
    expect(entry.requestId).toBe('req_lxyz_a1b2c3')
    expect(entry.route).toBe('/generate-workout')
    expect(entry.status).toBe(200)
    expect(entry.durationMs).toBe(412)
    expect(Object.keys(entry).sort()).toEqual(
      ['durationMs', 'event', 'level', 'requestId', 'route', 'status', 'time'].sort()
    )
  })

  it('drops everything not in the contract — header values cannot reach the line', () => {
    const summary = {
      requestId: 'req_1_z',
      route: '/generate-workout',
      status: 401,
      durationMs: 9,
      // simulates careless spreading of request context into the summary
      authorization: BEARER_VALUE,
      apikey: APIKEY_VALUE,
      headers: { authorization: BEARER_VALUE },
      email: EMAIL_VALUE,
    }

    const line = formatEdgeRequestLine(summary)

    expect(line).not.toContain(BEARER_VALUE)
    expect(line).not.toContain(APIKEY_VALUE)
    expect(line).not.toContain(EMAIL_VALUE)
    expect(line).not.toContain('authorization')
    expect(line).not.toContain('headers')
  })
})
