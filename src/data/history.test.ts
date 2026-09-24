/**
 * HIST-01, the read half: the one query the History screen and HOME-01 share.
 *
 * What these cover is everything between the rows and the derivation — the
 * order a page comes back in, the bound on it, how "there is more" is answered
 * without a second request, and a failed read surfacing as a typed error rather
 * than as an empty history.
 */
import { describe, expect, it } from 'vitest'

import { ErrorCode, isErr } from '../state/errors'
import type { WorkoutSessionRow } from '../state/schemas'
import { makeSessionRow } from '../test/factories'
import { createHistoryDouble } from '../test/history-double'
import { createHistoryClient, HISTORY_PAGE_SIZE } from './history'

const URL_ = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const TOKEN = 'user-token'
const OTHER_TOKEN = 'other-token'
const USER = 'a0000001-0000-4000-8000-000000000000'
const OTHER_USER = 'a0000002-0000-4000-8000-000000000000'

function setup(
  sessions: readonly WorkoutSessionRow[],
  options: { token?: string | null; failWith?: number } = {},
) {
  const double = createHistoryDouble({
    url: URL_,
    anonKey: ANON_KEY,
    users: { [TOKEN]: USER, [OTHER_TOKEN]: OTHER_USER },
    sessions,
    failWith: options.failWith,
  })

  const client = createHistoryClient({
    url: URL_,
    anonKey: ANON_KEY,
    accessToken: options.token === undefined ? TOKEN : options.token,
    fetch: double.fetch,
  })

  return { client, double }
}

/** A completed session on `date`, owned by the fixture user. */
function session(
  index: number,
  date: string,
  overrides: Partial<WorkoutSessionRow> = {},
): WorkoutSessionRow {
  return makeSessionRow({
    id: `b${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`,
    user_id: USER,
    date,
    created_at: `${date}T08:00:00.000Z`,
    started_at: `${date}T09:00:00.000Z`,
    completed_at: `${date}T10:00:00.000Z`,
    ...overrides,
  })
}

/** `count` sessions, one a day, counting back from `lastDay`. */
function dailyRun(count: number, lastDay: string): WorkoutSessionRow[] {
  const last = Date.parse(`${lastDay}T00:00:00Z`)

  return Array.from({ length: count }, (_, index) =>
    session(index + 1, new Date(last - index * 86_400_000).toISOString().slice(0, 10)),
  )
}

function expectOk<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  expect(result.ok, JSON.stringify('error' in result ? result.error : null)).toBe(true)
  if (!result.ok) throw new Error('unreachable')

  return result.value
}

describe('createHistoryClient', () => {
  it('answers a page newest first', async () => {
    const { client } = setup([
      session(1, '2026-09-18'),
      session(2, '2026-09-24'),
      session(3, '2026-09-21'),
    ])

    const page = expectOk(await client.page(USER))

    expect(page.sessions.map((row) => row.date)).toEqual([
      '2026-09-24',
      '2026-09-21',
      '2026-09-18',
    ])
  })

  it('breaks a day tie by when the session was created', async () => {
    const morning = session(1, '2026-09-24', { created_at: '2026-09-24T07:00:00.000Z' })
    const evening = session(2, '2026-09-24', { created_at: '2026-09-24T18:00:00.000Z' })

    const { client } = setup([morning, evening])
    const page = expectOk(await client.page(USER))

    expect(page.sessions.map((row) => row.id)).toEqual([evening.id, morning.id])
  })

  it('bounds the page and says whether more exists', async () => {
    const { client } = setup(dailyRun(HISTORY_PAGE_SIZE + 5, '2026-09-24'))

    const page = expectOk(await client.page(USER))

    expect(page.sessions).toHaveLength(HISTORY_PAGE_SIZE)
    expect(page.hasMore).toBe(true)
  })

  it('learns there is more without a second request', async () => {
    const { client, double } = setup(dailyRun(HISTORY_PAGE_SIZE + 5, '2026-09-24'))

    await client.page(USER)

    expect(double.requests()).toHaveLength(1)
    // One row past the page: its presence is the whole of `hasMore`.
    expect(double.requests()[0].query.get('limit')).toBe(String(HISTORY_PAGE_SIZE + 1))
  })

  it('says there is no more when the page is the whole history', async () => {
    const { client } = setup(dailyRun(3, '2026-09-24'))

    const page = expectOk(await client.page(USER))

    expect(page.sessions).toHaveLength(3)
    expect(page.hasMore).toBe(false)
  })

  it('reads a later page from the same ordering', async () => {
    const { client } = setup(dailyRun(6, '2026-09-24'))

    const first = expectOk(await client.page(USER, { limit: 2 }))
    const second = expectOk(await client.page(USER, { limit: 2, offset: 2 }))

    expect(first.sessions.map((row) => row.date)).toEqual(['2026-09-24', '2026-09-23'])
    expect(second.sessions.map((row) => row.date)).toEqual(['2026-09-22', '2026-09-21'])
    expect(second.hasMore).toBe(true)
  })

  it('has nothing to show for a user who has never trained', async () => {
    const { client } = setup([])

    const page = expectOk(await client.page(USER))

    expect(page).toEqual({ sessions: [], hasMore: false })
  })

  it('never reads another user’s sessions', async () => {
    const { client } = setup([
      session(1, '2026-09-24'),
      session(2, '2026-09-23', { user_id: OTHER_USER }),
    ])

    const page = expectOk(await client.page(USER))

    expect(page.sessions).toHaveLength(1)
    expect(page.sessions[0].user_id).toBe(USER)
  })

  it('asks for nothing without a session', async () => {
    const { client, double } = setup([session(1, '2026-09-24')], { token: null })

    const result = await client.page(USER)

    expect(isErr(result) && result.error.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED)
    expect(double.requests()).toHaveLength(0)
  })

  it('surfaces a failed read as a typed error, not an empty history', async () => {
    const { client } = setup([session(1, '2026-09-24')], { failWith: 500 })

    const result = await client.page(USER)

    expect(isErr(result) && result.error.code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
  })

  it('refuses a row that does not parse rather than rendering half of it', async () => {
    const broken = { ...session(1, '2026-09-24'), effective_intensity: 99 }
    const { client } = setup([broken as WorkoutSessionRow])

    const result = await client.page(USER)

    expect(isErr(result) && result.error.code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
  })
})
