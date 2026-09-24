import { describe, expect, it } from 'vitest'

import { ErrorCode, ok, type Result } from '../state/errors'
import type { WorkoutSessionRow } from '../state/schemas'
import { makeSessionRow } from '../test/factories'
import { createSessionDouble } from '../test/session-double'
import type { AuthSession } from './auth'
import { createSummaryClient, durationOf } from './summary'

// SUM-01's reads and its one write. What these cover is the contract between
// the screen and the database: which session a debrief is about, what the
// streak query answers for that user, that mood and notes reach the row, and
// that every refusal arrives as a typed error rather than as a screen with no
// state. The rules the double applies are the table's own — owner-only RLS and
// `workout_sessions_mood_range` — transcribed from
// `supabase/migrations/20260921000002_workout_domain.sql`.

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const TOKEN = 'user-token'
const OTHER_TOKEN = 'other-token'
const USER = 'a0000001-0000-4000-8000-000000000000'
const OTHER_USER = 'a0000002-0000-4000-8000-000000000000'
const NEW_YORK = 'America/New_York'

const authDouble = (token: string | null) => ({
  async getSession(): Promise<Result<AuthSession | null>> {
    return ok(
      token === null
        ? null
        : {
            accessToken: token,
            refreshToken: 'refresh',
            expiresAt: Date.parse('2026-09-24T21:00:00.000Z'),
            user: { id: USER, email: 'lifter@example.com' },
          },
    )
  },
})

const setup = (
  sessions: readonly WorkoutSessionRow[],
  options: { token?: string | null } = {},
) => {
  const double = createSessionDouble({
    url: URL_,
    anonKey: ANON_KEY,
    users: { [TOKEN]: USER, [OTHER_TOKEN]: OTHER_USER },
    sessions,
  })

  const client = createSummaryClient({
    auth: authDouble(options.token === undefined ? TOKEN : options.token),
    supabase: { url: URL_, anonKey: ANON_KEY, fetch: double.fetch },
    timeZone: NEW_YORK,
  })

  return { client, double }
}

/** A completed session, finished at the given instant, with a distinct id. */
const session = (
  index: number,
  completedAt: string,
  overrides: Partial<WorkoutSessionRow> = {},
): WorkoutSessionRow =>
  makeSessionRow({
    id: `b${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`,
    user_id: USER,
    started_at: completedAt,
    completed_at: completedAt,
    date: completedAt.slice(0, 10),
    ...overrides,
  })

function expectOk<T>(result: Result<T>): T {
  expect(result.ok, JSON.stringify(result.ok ? null : result.error)).toBe(true)
  if (!result.ok) throw new Error('unreachable')

  return result.value
}

function expectErr<T>(result: Result<T>) {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('unreachable')

  return result.error
}

describe('the session a debrief is about (SUM-01)', () => {
  it('answers the most recently completed session', async () => {
    const { client } = setup([
      session(1, '2026-09-22T18:00:00.000Z'),
      session(2, '2026-09-24T18:00:00.000Z'),
      session(3, '2026-09-23T18:00:00.000Z'),
    ])

    const latest = expectOk(await client.latest(USER))

    expect(latest?.session.id).toBe('b0000002-0000-4000-8000-000000000000')
  })

  it('never answers a session that has not been completed', async () => {
    // The whole of "only completed sessions reach this screen", at the layer
    // that can enforce it: an unfinished session is not a row this read
    // returns, so the screen is never handed one to debrief.
    const { client } = setup([
      session(1, '2026-09-22T18:00:00.000Z'),
      makeSessionRow({
        id: 'b0000009-0000-4000-8000-000000000000',
        user_id: USER,
        started_at: '2026-09-25T18:00:00.000Z',
        completed_at: null,
        actual_duration_mins: null,
      }),
    ])

    const latest = expectOk(await client.latest(USER))

    expect(latest?.session.id).toBe('b0000001-0000-4000-8000-000000000000')
  })

  it('answers null when nothing has been finished yet', async () => {
    const { client } = setup([])

    expect(expectOk(await client.latest(USER))).toBeNull()
  })

  it('returns nothing for somebody else’s sessions', async () => {
    const { client } = setup([session(1, '2026-09-22T18:00:00.000Z')])

    // RLS filters before the read sees the row, so asking for another user's
    // id answers nothing rather than something.
    expect(expectOk(await client.latest(OTHER_USER))).toBeNull()
  })

  it('states the duration the row stores', async () => {
    const { client } = setup([
      session(1, '2026-09-22T18:00:00.000Z', { actual_duration_mins: 47 }),
    ])

    expect(expectOk(await client.latest(USER))?.durationMins).toBe(47)
  })

  it('falls back to the elapsed lifecycle time when the column is null', async () => {
    const { client } = setup([
      session(1, '2026-09-22T18:30:00.000Z', {
        started_at: '2026-09-22T18:00:00.000Z',
        actual_duration_mins: null,
      }),
    ])

    expect(expectOk(await client.latest(USER))?.durationMins).toBe(30)
  })

  it('refuses to read anything without a session', async () => {
    const { client, double } = setup([session(1, '2026-09-22T18:00:00.000Z')], {
      token: null,
    })

    expect(expectErr(await client.latest(USER)).code).toBe(
      ErrorCode.AUTH_UNAUTHENTICATED,
    )
    // Not a round trip to be told what the client already knew.
    expect(double.requests()).toEqual([])
  })
})

describe('the debrief write (SUM-01)', () => {
  it('persists mood and notes to the session row', async () => {
    const { client, double } = setup([session(1, '2026-09-22T18:00:00.000Z')])
    const id = 'b0000001-0000-4000-8000-000000000000'

    const saved = expectOk(
      await client.saveDebrief(id, { mood: 4, session_notes: 'Overhead felt heavy.' }),
    )

    expect(saved.session.mood).toBe(4)
    expect(saved.session.session_notes).toBe('Overhead felt heavy.')
    // The stored row, not the payload that was sent.
    const stored = double.store().sessions.find((row) => row.id === id)
    expect(stored?.mood).toBe(4)
    expect(stored?.session_notes).toBe('Overhead felt heavy.')
  })

  it('clears both back to “not answered” rather than to a default', async () => {
    const { client } = setup([
      session(1, '2026-09-22T18:00:00.000Z', { mood: 5, session_notes: 'Good.' }),
    ])

    const saved = expectOk(
      await client.saveDebrief('b0000001-0000-4000-8000-000000000000', {
        mood: null,
        session_notes: null,
      }),
    )

    expect(saved.session.mood).toBeNull()
    expect(saved.session.session_notes).toBeNull()
  })

  it('refuses a mood outside 1–5 before it costs a round trip', async () => {
    const { client, double } = setup([session(1, '2026-09-22T18:00:00.000Z')])

    const error = expectErr(
      await client.saveDebrief('b0000001-0000-4000-8000-000000000000', {
        mood: 6,
        session_notes: null,
      }),
    )

    expect(error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    expect(double.requests()).toEqual([])
  })

  it('answers not found for a session the caller may not write', async () => {
    const { client } = setup([
      session(1, '2026-09-22T18:00:00.000Z', { user_id: OTHER_USER }),
    ])

    const error = expectErr(
      await client.saveDebrief('b0000001-0000-4000-8000-000000000000', {
        mood: 3,
        session_notes: null,
      }),
    )

    expect(error.code).toBe(ErrorCode.PERSISTENCE_NOT_FOUND)
  })
})

describe('the streak the debrief shows (SUM-01 over SES-01c)', () => {
  it('is the run the stored sessions describe', async () => {
    const { client } = setup([
      session(1, '2026-09-24T18:00:00.000Z'),
      session(2, '2026-09-23T18:00:00.000Z'),
      session(3, '2026-09-22T18:00:00.000Z'),
    ])

    const streak = expectOk(
      await client.streak(USER, { now: new Date('2026-09-24T20:00:00.000Z') }),
    )

    expect(streak.days).toBe(3)
    expect(streak.includesToday).toBe(true)
  })

  it('is zero, not an error, for a user who has never trained', async () => {
    const { client } = setup([])

    const streak = expectOk(
      await client.streak(USER, { now: new Date('2026-09-24T20:00:00.000Z') }),
    )

    expect(streak.days).toBe(0)
    expect(streak.lastTrainingDay).toBeNull()
  })

  it('draws its day boundaries in the zone the client was given', async () => {
    // 01:30 UTC on the 25th is still the 24th in New York, so this is one
    // training day with today in it rather than a run that ended yesterday.
    const { client } = setup([session(1, '2026-09-25T01:30:00.000Z')])

    const streak = expectOk(
      await client.streak(USER, { now: new Date('2026-09-25T02:00:00.000Z') }),
    )

    expect(streak.today).toBe('2026-09-24')
    expect(streak.days).toBe(1)
  })
})

describe('durationOf', () => {
  it('prefers the stored column over the clock', () => {
    expect(
      durationOf(
        makeSessionRow({
          actual_duration_mins: 12,
          started_at: '2026-09-22T18:00:00.000Z',
          completed_at: '2026-09-22T19:00:00.000Z',
        }),
      ),
    ).toBe(12)
  })

  it('rounds the elapsed fallback up, the way complete_session does', () => {
    expect(
      durationOf(
        makeSessionRow({
          actual_duration_mins: null,
          started_at: '2026-09-22T18:00:00.000Z',
          completed_at: '2026-09-22T18:30:30.000Z',
        }),
      ),
    ).toBe(31)
  })

  it('answers null when nothing can measure it', () => {
    expect(
      durationOf(
        makeSessionRow({ actual_duration_mins: null, started_at: null, completed_at: null }),
      ),
    ).toBeNull()
  })
})
