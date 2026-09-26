import type { RestDayClient } from '../data/rest-days'
import { ok } from '../state/errors'
import type { RestDayMark, RestDayRow } from '../state/schemas'
import { FIXTURE_USER_ID } from './user-data-double'

const REST_DAY_ID = 'a0000001-0000-4000-8000-000000000000'
const NOW = '2026-09-26T12:00:00.000Z'

export interface FakeRestDayClient extends RestDayClient {
  readonly recentCalls: string[]
  readonly markCalls: RestDayMark[]
  readonly rows: RestDayRow[]
}

/** HOME-02's in-memory transport: one row per day, matching the database upsert. */
export function createFakeRestDayClient(
  initial: readonly RestDayRow[] = [],
): FakeRestDayClient {
  const rows = [...initial]
  const recentCalls: string[] = []
  const markCalls: RestDayMark[] = []

  return {
    rows,
    recentCalls,
    markCalls,

    async recent(userId) {
      recentCalls.push(userId)
      return ok([...rows].sort((left, right) => right.day.localeCompare(left.day)))
    },

    async mark(mark) {
      markCalls.push(mark)
      const existing = rows.find((row) => row.day === mark.day)
      const row: RestDayRow = {
        id: existing?.id ?? REST_DAY_ID,
        user_id: existing?.user_id ?? FIXTURE_USER_ID,
        day: mark.day,
        reason: mark.reason,
        note: mark.note,
        created_at: existing?.created_at ?? NOW,
        updated_at: NOW,
      }

      if (existing === undefined) rows.push(row)
      else rows.splice(rows.indexOf(existing), 1, row)

      return ok(row)
    },
  }
}
