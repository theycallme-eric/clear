/**
 * AUTH-02 — the OTP calls against a mocked transport.
 *
 * The assertion that matters most is the negative one: whatever GoTrue wrote in
 * its body, none of it reaches the error a person reads.
 */
import { describe, expect, it, vi } from 'vitest'

import { ErrorCode } from '../state/errors'
import {
  createOtpClient,
  failureFromWire,
  isCodeLike,
  isEmailLike,
  otpError,
  otpFailureMessage,
} from './otp'

const URL_BASE = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const NOW = 1_800_000_000_000
const EMAIL = 'lifter@example.test'

/** The exact sentence GoTrue sends for a wrong or stale code. */
const GOTRUE_PROSE = 'Token has expired or is invalid'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sessionPayload() {
  return {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_in: 3600,
    user: { id: 'user-1', email: EMAIL },
  }
}

function makeClient(fetchImpl: unknown) {
  return createOtpClient({
    url: URL_BASE,
    anonKey: ANON_KEY,
    fetch: fetchImpl as typeof globalThis.fetch,
    now: () => NOW,
  })
}

describe('input shapes', () => {
  it('accepts an address with a dotted domain and refuses the near misses', () => {
    expect(isEmailLike('lifter@example.test')).toBe(true)
    expect(isEmailLike('  lifter@example.test  ')).toBe(true)
    expect(isEmailLike('lifter@sub.example.test')).toBe(true)
    expect(isEmailLike('lifter@example')).toBe(false)
    expect(isEmailLike('lifter.example.test')).toBe(false)
    expect(isEmailLike('lifter @example.test')).toBe(false)
    expect(isEmailLike('')).toBe(false)
  })

  it('accepts six to ten digits and nothing else', () => {
    expect(isCodeLike('123456')).toBe(true)
    expect(isCodeLike(' 1234567890 ')).toBe(true)
    expect(isCodeLike('12345')).toBe(false)
    expect(isCodeLike('12345678901')).toBe(false)
    expect(isCodeLike('12345a')).toBe(false)
  })
})

describe('requestCode', () => {
  it('posts to the OTP endpoint with the anon key and creates a first-time user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    const result = await makeClient(fetchMock).requestCode(`  ${EMAIL}  `)

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${URL_BASE}/auth/v1/otp`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).apikey).toBe(ANON_KEY)
    expect(JSON.parse(init.body as string)).toEqual({
      email: EMAIL,
      create_user: true,
    })
  })

  it('refuses a malformed address without spending a request', async () => {
    const fetchMock = vi.fn()
    const result = await makeClient(fetchMock).requestCode('lifter@example')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.failure).toBe('invalid-email')
    expect(result.error.code).toBe(ErrorCode.VALIDATION_INVALID_FORMAT)
  })

  it('reports the send rate limit as its own failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error_code: 'over_email_send_rate_limit', msg: 'For security purposes…' },
        429,
      ),
    )
    const result = await makeClient(fetchMock).requestCode(EMAIL)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.failure).toBe('rate-limited')
    expect(result.error.code).toBe(ErrorCode.NETWORK_RATE_LIMITED)
  })

  it('reports a transport failure as offline, never as a rejected code', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await makeClient(fetchMock).requestCode(EMAIL)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.failure).toBe('offline')
    expect(result.error.code).toBe(ErrorCode.NETWORK_OFFLINE)
  })
})

describe('verifyCode', () => {
  it('exchanges a code for the session shape AUTH-01 stores', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionPayload()))
    const result = await makeClient(fetchMock).verifyCode(EMAIL, ' 123456 ')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: NOW + 3_600_000,
      user: { id: 'user-1', email: EMAIL },
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${URL_BASE}/auth/v1/verify`)
    expect(JSON.parse(init.body as string)).toEqual({
      email: EMAIL,
      token: '123456',
      type: 'email',
    })
  })

  it('refuses a code that cannot be one without spending an attempt', async () => {
    const fetchMock = vi.fn()
    const result = await makeClient(fetchMock).verifyCode(EMAIL, '12')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.failure).toBe('invalid-code')
  })

  it('reports an expired code as expired and never quotes GoTrue', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ code: 403, error_code: 'otp_expired', msg: GOTRUE_PROSE }, 403),
      )
    const result = await makeClient(fetchMock).verifyCode(EMAIL, '123456')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.failure).toBe('expired-code')
    expect(result.error.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS)
    expect(result.error.message).toBe('That code has expired. Request a new one.')
    expect(result.error.message).not.toContain(GOTRUE_PROSE)
    // The wire's own words survive only where a log can read them.
    expect(result.error.details).toEqual({ status: 403, errorCode: 'otp_expired' })
  })

  it('reports a plain rejection as a wrong code', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ msg: GOTRUE_PROSE }, 401))
    const result = await makeClient(fetchMock).verifyCode(EMAIL, '123456')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.failure).toBe('invalid-code')
    expect(result.error.message).toBe(
      'That code is not right. Check the digits and try again.',
    )
  })

  it('reports a 500 as a server failure rather than a bad code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ msg: 'boom' }, 500))
    const result = await makeClient(fetchMock).verifyCode(EMAIL, '123456')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.failure).toBe('server')
    expect(result.error.code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
  })

  it('reports a 200 that is not a session as a server failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hello: 'there' }))
    const result = await makeClient(fetchMock).verifyCode(EMAIL, '123456')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.failure).toBe('server')
    expect(result.error.details).toEqual({ reason: 'unreadable-session' })
  })
})

describe('failure mapping', () => {
  it('reads a 400 as a bad address when requesting and a bad code when verifying', () => {
    expect(failureFromWire('request', { status: 400, errorCode: null })).toBe(
      'invalid-email',
    )
    expect(failureFromWire('verify', { status: 400, errorCode: null })).toBe(
      'invalid-code',
    )
  })

  it('gives every failure a human sentence with no wire vocabulary in it', () => {
    const failures = [
      'invalid-email',
      'invalid-code',
      'expired-code',
      'rate-limited',
      'offline',
      'server',
    ] as const

    for (const failure of failures) {
      const message = otpFailureMessage(failure)
      expect(message).toMatch(/^[A-Z]/)
      expect(message).toMatch(/[.]$/)
      expect(message).not.toMatch(/token|otp|supabase|gotrue|http|\d{3}/i)
      expect(otpError(failure).message).toBe(message)
    }
  })
})
