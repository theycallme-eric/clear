/**
 * EXE-01 — the one `block_results` writer, at the wire.
 *
 * `block-completion.ts` is tested as a mapping and the provider is tested as a
 * path; this is the third question and the only one either of those leaves
 * open: what this client actually sends, and what it refuses to send. The
 * effort range is the database's (`block_results_perceived_effort_range`), and
 * because every structure type writes through here, checking it here is
 * checking it for all of them.
 */
import { describe, expect, it } from 'vitest'

import { ErrorCode, ok, type Result } from '../state/errors'
import type { AuthSession } from './auth'
import { createWorkoutClients, unconfiguredWorkoutClients } from './workout'

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const BLOCK_ID = '70000001-0000-4000-8000-000000000000'

const session = (accessToken: string): AuthSession => ({
  accessToken,
  refreshToken: 'refresh',
  expiresAt: Date.now() + 60_000,
  user: { id: 'a0000001-0000-4000-8000-000000000000', email: null },
})

interface Sent {
  url: string
  method: string
  authorization: string
  body: unknown
}

function setup(options: { tokens?: string[]; rows?: unknown[] } = {}) {
  const tokens = [...(options.tokens ?? ['token-1'])]
  const sent: Sent[] = []

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    sent.push({
      url: String(input),
      method: init?.method ?? 'GET',
      authorization: headers.Authorization ?? '',
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    })

    return new Response(JSON.stringify(options.rows ?? [storedRow()]), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const clients = createWorkoutClients({
    auth: {
      getSession: (): Promise<Result<AuthSession | null>> =>
        // Shifted per call, so a rotated token is observable.
        Promise.resolve(ok(session(tokens.length > 1 ? (tokens.shift() ?? '') : tokens[0]))),
    },
    supabase: { url: URL_, anonKey: ANON_KEY, fetch: fetchImpl },
  })

  return { clients, sent }
}

function storedRow() {
  return {
    id: '90000001-0000-4000-8000-000000000000',
    block_id: BLOCK_ID,
    elapsed_seconds: null,
    completed_under_cap: null,
    rounds_completed: 6,
    partial_round_reps: 4,
    minutes_completed: null,
    highest_rung: null,
    perceived_effort: 7,
    notes: null,
    created_at: '2026-09-24T09:30:00+00:00',
  }
}

describe('the block_results write (EXE-01)', () => {
  it('sends the row the completion maps to, once, as the user', async () => {
    const { clients, sent } = setup()

    const result = await clients.blockResults.record({
      blockId: BLOCK_ID,
      outcome: { roundsCompleted: 6, partialRoundReps: 4 },
      perceivedEffort: 7,
    })

    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('POST')
    expect(sent[0].url).toBe(`${URL_}/rest/v1/block_results`)
    expect(sent[0].authorization).toBe('Bearer token-1')
    expect(sent[0].body).toEqual([
      {
        block_id: BLOCK_ID,
        elapsed_seconds: null,
        completed_under_cap: null,
        rounds_completed: 6,
        partial_round_reps: 4,
        minutes_completed: null,
        highest_rung: null,
        perceived_effort: 7,
        notes: null,
      },
    ])
  })

  it('answers the row as the database stored it', async () => {
    const { clients } = setup()

    const result = await clients.blockResults.record({
      blockId: BLOCK_ID,
      outcome: { roundsCompleted: 6, partialRoundReps: 4 },
      perceivedEffort: 7,
    })

    expect(result.ok && result.value).toEqual(storedRow())
  })

  it('presents the token the session holds now, not the one it started with', async () => {
    const { clients, sent } = setup({ tokens: ['token-1', 'token-2'] })

    await clients.blockResults.record({ blockId: BLOCK_ID, outcome: {}, perceivedEffort: 5 })
    await clients.blockResults.record({ blockId: BLOCK_ID, outcome: {}, perceivedEffort: 5 })

    expect(sent.map((request) => request.authorization)).toEqual([
      'Bearer token-1',
      'Bearer token-2',
    ])
  })

  it.each([0, 11, 6.5, Number.NaN])(
    'refuses an effort of %s without sending anything',
    async (perceivedEffort) => {
      const { clients, sent } = setup()

      const result = await clients.blockResults.record({
        blockId: BLOCK_ID,
        outcome: {},
        perceivedEffort,
      })

      expect(result.ok).toBe(false)
      expect(!result.ok && result.error.code).toBe(ErrorCode.VALIDATION_OUT_OF_RANGE)
      expect(sent).toEqual([])
    },
  )

  it('treats an insert that read nothing back as a failed write', async () => {
    // RLS refused it, or no representation came back. Answering a row the
    // caller cannot have would be a guess.
    const { clients } = setup({ rows: [] })

    const result = await clients.blockResults.record({
      blockId: BLOCK_ID,
      outcome: {},
      perceivedEffort: 5,
    })

    expect(!result.ok && result.error.code).toBe(ErrorCode.PERSISTENCE_WRITE_FAILED)
  })

  it('refuses in the same vocabulary when the app has no configuration', async () => {
    const result = await unconfiguredWorkoutClients().blockResults.record({
      blockId: BLOCK_ID,
      outcome: {},
      perceivedEffort: 5,
    })

    expect(!result.ok && result.error.code).toBe(ErrorCode.VALIDATION_REQUIRED_FIELD)
  })
})
