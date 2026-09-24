import { describe, expect, it } from 'vitest'

import { ErrorCode } from '../state/errors'
import type { WorkoutSessionRow } from '../state/schemas'
import { defaultStreakPolicy, type StreakPolicy } from '../state/streak'
import { makeSessionRow } from '../test/factories'
import { createSessionDouble } from '../test/session-double'
import { STREAK_PAGE_SIZE, createStreakClient, resolveTimeZone } from './streak'

// SES-01c, the read half. The derivation is proved in
// `src/state/streak.test.ts`; what these cover is everything between the rows
// and it — the one RPC, the cursor that keeps a long streak from being
// truncated at a page boundary, the zone resolved once, and a failed read
// surfacing as a typed error rather than a streak of zero. The double holds
// the function's own rules, transcribed from
// `supabase/migrations/20260921000006_streak_sessions.sql`.

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const TOKEN = 'user-token'
const OTHER_TOKEN = 'other-token'
const USER = 'a0000001-0000-4000-8000-000000000000'
const OTHER_USER = 'a0000002-0000-4000-8000-000000000000'
const NEW_YORK = 'America/New_York'

const setup = (
  sessions: readonly WorkoutSessionRow[],
  options: { timeZone?: string; token?: string } = {},
) => {
  const double = createSessionDouble({
    url: URL_,
    anonKey: ANON_KEY,
    users: { [TOKEN]: USER, [OTHER_TOKEN]: OTHER_USER },
    sessions,
  })

  const client = createStreakClient({
    url: URL_,
    anonKey: ANON_KEY,
    accessToken: options.token ?? TOKEN,
    fetch: double.fetch,
    timeZone: options.timeZone ?? NEW_YORK,
  })

  return { client, double }
}

/** A completed session on a given instant, with a distinct id. */
const session = (
  index: number,
  completedAt: string,
  overrides: Partial<WorkoutSessionRow> = {},
): WorkoutSessionRow =>
  makeSessionRow({
    id: `b${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`,
    user_id: USER,
    completed_at: completedAt,
    started_at: completedAt,
    date: completedAt.slice(0, 10),
    ...overrides,
  })

/** `n` sessions, one a day, ending on the given day at noon UTC. */
const dailyRun = (count: number, lastDay: string, firstId = 1): WorkoutSessionRow[] => {
  const last = Date.parse(`${lastDay}T12:00:00Z`)

  return Array.from({ length: count }, (_, index) =>
    session(firstId + index, new Date(last - index * 86_400_000).toISOString()),
  )
}

function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  expect(result.ok, JSON.stringify('error' in result ? result.error : null)).toBe(true)
  if (!result.ok) throw new Error('unreachable')

  return result.value
}

describe('the streak query reads sessions and derives (SES-01c)', () => {
  it('answers the run the stored rows describe, in one request', async () => {
    const { client, double } = setup(dailyRun(3, '2026-09-24'))

    const streak = expectOk(
      await client.current(USER, { now: new Date('2026-09-24T20:00:00Z') }),
    )

    expect(streak.days).toBe(3)
    expect(streak.trainingDays).toEqual(['2026-09-24', '2026-09-23', '2026-09-22'])
    expect(double.calls()).toHaveLength(1)
    expect(double.calls()[0]).toEqual({
      fn: 'streak_sessions',
      args: { p_user_id: USER, p_before: null, p_limit: STREAK_PAGE_SIZE },
    })
  })

  it('answers zero for a user with no completed sessions', async () => {
    const { client } = setup([
      session(1, '2026-09-24T12:00:00Z', { completed_at: null, started_at: null }),
    ])

    const streak = expectOk(
      await client.current(USER, { now: new Date('2026-09-24T20:00:00Z') }),
    )

    expect(streak.days).toBe(0)
    expect(streak.lastTrainingDay).toBeNull()
  })

  it('reads nobody else’s rows — RLS answers, and the answer is nothing', async () => {
    const { client } = setup(dailyRun(3, '2026-09-24'), { token: OTHER_TOKEN })

    const streak = expectOk(
      await client.current(OTHER_USER, { now: new Date('2026-09-24T20:00:00Z') }),
    )

    expect(streak.days).toBe(0)
  })

  it('does not store what it derived — a second call re-reads the rows', async () => {
    const { client, double } = setup(dailyRun(2, '2026-09-24'))

    const first = expectOk(
      await client.current(USER, { now: new Date('2026-09-24T20:00:00Z') }),
    )
    const second = expectOk(
      await client.current(USER, { now: new Date('2026-09-24T20:00:00Z') }),
    )

    expect(first.days).toBe(second.days)
    expect(double.calls().filter((call) => call.fn === 'streak_sessions').length)
      .toBeGreaterThanOrEqual(2)
    // And nothing was written anywhere by either of them.
    expect(double.calls().every((call) => call.fn === 'streak_sessions')).toBe(true)
  })
})

describe('a streak longer than a page (SES-01c)', () => {
  it('asks for the page before, using the oldest row as the cursor', async () => {
    const { client, double } = setup(dailyRun(STREAK_PAGE_SIZE + 5, '2026-09-24'))

    const streak = expectOk(
      await client.current(USER, { now: new Date('2026-09-24T20:00:00Z') }),
    )

    expect(streak.days).toBe(STREAK_PAGE_SIZE + 5)
    expect(double.calls()).toHaveLength(2)

    // The cursor is the oldest row of the first page, and the filter is
    // exclusive, so that row is not read twice.
    const [, second] = double.calls()
    expect(second.args.p_before).toBe(
      new Date(Date.parse('2026-09-24T12:00:00Z') - (STREAK_PAGE_SIZE - 1) * 86_400_000)
        .toISOString(),
    )
  })

  it('stops after one page when the run ends inside it', async () => {
    const rows = [
      ...dailyRun(3, '2026-09-24'),
      // A gap, then plenty of older history no reader needs to see.
      ...dailyRun(10, '2026-08-01', 100),
    ]
    const { client, double } = setup(rows)

    const streak = expectOk(
      await client.current(USER, { now: new Date('2026-09-24T20:00:00Z') }),
    )

    expect(streak.days).toBe(3)
    expect(double.calls()).toHaveLength(1)
  })
})

describe('the time zone is the user’s, resolved once (SES-01c)', () => {
  it('draws the day boundary in the zone the client was made with', async () => {
    const rows = [
      // 11pm on the 23rd and 1am on the 24th in New York; one day in UTC.
      session(1, '2026-09-24T03:30:00Z'),
      session(2, '2026-09-24T05:00:00Z'),
    ]

    const newYork = expectOk(
      await setup(rows).client.current(USER, { now: new Date('2026-09-24T18:00:00Z') }),
    )
    expect(newYork.days).toBe(2)

    const utc = expectOk(
      await setup(rows, { timeZone: 'UTC' }).client.current(USER, {
        now: new Date('2026-09-24T18:00:00Z'),
      }),
    )
    expect(utc.days).toBe(1)
  })

  it('exposes the resolved zone, and resolves the platform’s when none is given', () => {
    const { client } = setup([])
    expect(client.timeZone).toBe(NEW_YORK)

    const resolved = createStreakClient({ url: URL_, anonKey: ANON_KEY }).timeZone
    expect(resolved).toBe(resolveTimeZone())
    expect(resolved.length).toBeGreaterThan(0)
  })

  it('turns a zone the platform does not know into a typed error', async () => {
    const { client, double } = setup([], { timeZone: 'Mars/Olympus_Mons' })

    const result = await client.current(USER)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe(ErrorCode.VALIDATION_INVALID_FORMAT)
    // And it failed before asking the database anything.
    expect(double.calls()).toHaveLength(0)
  })
})

describe('what the query refuses to answer with (SES-01c)', () => {
  it('reports an unauthenticated caller as an error, not as a streak of zero', async () => {
    // Zero is a real streak — the answer for somebody who has not trained —
    // so a read that did not happen must never render as one.
    const anonymous = createStreakClient({
      url: URL_,
      anonKey: ANON_KEY,
      timeZone: NEW_YORK,
    })

    const result = await anonymous.current(USER)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
  })

  it('reports a failed read as an error, not as a streak of zero', async () => {
    const client = createStreakClient({
      url: URL_,
      anonKey: ANON_KEY,
      accessToken: TOKEN,
      timeZone: NEW_YORK,
      fetch: async () =>
        new Response(JSON.stringify({ message: 'unavailable' }), { status: 500 }),
    })

    const result = await client.current(USER)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
  })

  it('reports a payload that is not a page of sessions as a read failure', async () => {
    const client = createStreakClient({
      url: URL_,
      anonKey: ANON_KEY,
      accessToken: TOKEN,
      timeZone: NEW_YORK,
      // A streak-shaped answer is exactly what this function must never
      // return: the count is the client's, and a number arriving from the
      // database is a contract that changed underneath it.
      fetch: async () => new Response(JSON.stringify({ days: 7 }), { status: 200 }),
    })

    const result = await client.current(USER)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
  })
})

describe('HOME-02 passes its rules to this same query (SES-01c)', () => {
  it('derives with the supplied policy over the rows it already reads', async () => {
    const { client, double } = setup([
      session(1, '2026-09-24T12:00:00Z'),
      // The 23rd is missing; a rest-day allowance would bridge it.
      session(2, '2026-09-22T12:00:00Z'),
      session(3, '2026-09-21T12:00:00Z'),
    ])

    const plain = expectOk(
      await client.current(USER, { now: new Date('2026-09-24T20:00:00Z') }),
    )
    expect(plain.days).toBe(1)

    const restDays = new Set(['2026-09-23'])
    const policy: StreakPolicy = {
      ...defaultStreakPolicy,
      bridgesDay: (day, context) =>
        defaultStreakPolicy.bridgesDay(day, context) || restDays.has(day),
    }

    const extended = expectOk(
      await client.current(USER, { now: new Date('2026-09-24T20:00:00Z'), policy }),
    )
    expect(extended.days).toBe(3)

    // Same query, same rows, different rules: no second read and no second
    // derivation anywhere.
    expect(double.calls().every((call) => call.fn === 'streak_sessions')).toBe(true)
  })
})
