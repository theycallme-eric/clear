/**
 * HIST-01's derivation, which is where the two claims the requirement makes
 * about the list actually live: rest days are marked, and the chronology is
 * bounded by the rows rather than by the calendar.
 */
import { describe, expect, it } from 'vitest'

import { makeSessionRow } from '../test/factories'
import {
  filterHistory,
  formatDay,
  formatFocus,
  formatRestRange,
  historyEntries,
  historyFilterOf,
  historyStatus,
  HISTORY_FILTERS,
  type HistoryEntry,
  type HistoryRestEntry,
} from './history'

const TIME_ZONE = 'UTC'
const NOW = new Date('2026-09-24T10:00:00.000Z')

/** A completed session on `date`, with an id that is readable in a failure. */
function session(date: string, overrides: Record<string, unknown> = {}) {
  return makeSessionRow({
    id: `b0000001-0000-4000-8000-${date.replace(/-/g, '')}00`,
    date,
    created_at: `${date}T08:00:00.000Z`,
    started_at: `${date}T09:00:00.000Z`,
    completed_at: `${date}T10:00:00.000Z`,
    ...overrides,
  })
}

function entriesFor(rows: ReturnType<typeof session>[]): HistoryEntry[] {
  return historyEntries(rows, { now: NOW, timeZone: TIME_ZONE })
}

function kinds(entries: HistoryEntry[]): string[] {
  return entries.map((entry) =>
    entry.kind === 'rest' ? `rest:${entry.from}..${entry.to}` : `session:${entry.day}`,
  )
}

describe('historyEntries', () => {
  it('has nothing to show for a user who has never trained', () => {
    expect(entriesFor([])).toEqual([])
  })

  it('orders sessions newest first', () => {
    const entries = entriesFor([session('2026-09-20'), session('2026-09-23')])

    expect(kinds(entries)).toEqual([
      'session:2026-09-23',
      'rest:2026-09-21..2026-09-22',
      'session:2026-09-20',
    ])
  })

  it('reads two sessions on one day as the order they were lived in', () => {
    const morning = session('2026-09-23', { created_at: '2026-09-23T07:00:00.000Z' })
    const evening = session('2026-09-23', {
      id: 'b0000002-0000-4000-8000-000000000000',
      created_at: '2026-09-23T18:00:00.000Z',
    })

    const entries = entriesFor([morning, evening])

    expect(entries.map((entry) => entry.key)).toEqual([
      `session:${evening.id}`,
      `session:${morning.id}`,
    ])
  })

  it('marks a run of untrained days as one rest entry', () => {
    const entries = entriesFor([session('2026-09-23'), session('2026-09-19')])
    const rest = entries.find((entry) => entry.kind === 'rest') as HistoryRestEntry

    expect(rest).toMatchObject({
      kind: 'rest',
      from: '2026-09-20',
      to: '2026-09-22',
      days: 3,
    })
  })

  it('marks the gap between the last session and yesterday', () => {
    // Trained on the 21st; the 22nd and 23rd were rest, and today is the 24th.
    const entries = entriesFor([session('2026-09-21')])

    expect(kinds(entries)).toEqual(['rest:2026-09-22..2026-09-23', 'session:2026-09-21'])
  })

  it('never calls today a rest day — the day is not over', () => {
    const entries = entriesFor([session('2026-09-23')])

    expect(kinds(entries)).toEqual(['session:2026-09-23'])
  })

  it('claims no rest day older than the oldest row it was given', () => {
    const entries = entriesFor([session('2026-09-24'), session('2026-09-22')])

    expect(kinds(entries)).toEqual([
      'session:2026-09-24',
      'rest:2026-09-23..2026-09-23',
      'session:2026-09-22',
    ])
  })

  it('places a session dated ahead of today without inventing rest between', () => {
    const entries = entriesFor([session('2026-09-26'), session('2026-09-24')])

    expect(kinds(entries)).toEqual(['session:2026-09-26', 'session:2026-09-24'])
  })

  it('places a session on the day the row records, not the zone it is read in', () => {
    // 2026-09-23T23:30Z is already the 24th in Sydney; the row says the 23rd,
    // and the row is what the training day is.
    const late = session('2026-09-23', { completed_at: '2026-09-23T23:30:00.000Z' })
    const entries = historyEntries([late], { now: NOW, timeZone: 'Australia/Sydney' })

    expect(entries[entries.length - 1]).toMatchObject({ kind: 'session', day: '2026-09-23' })
  })

  it('carries the summary the list renders', () => {
    const [entry] = entriesFor([
      session('2026-09-23', {
        title: 'Upper-body strength',
        session_focus: 'upper_body',
        actual_duration_mins: 38,
        effective_intensity: 6,
        mood: 4,
      }),
    ])

    expect(entry).toMatchObject({
      kind: 'session',
      title: 'Upper-body strength',
      focus: 'upper_body',
      status: 'completed',
      durationMins: 38,
      intensity: 6,
      mood: 4,
    })
  })
})

describe('historyStatus', () => {
  it('is completed when the session finished', () => {
    expect(historyStatus(session('2026-09-23'))).toBe('completed')
  })

  it('is partial for a session abandoned after it had begun', () => {
    const abandoned = session('2026-09-23', {
      completed_at: null,
      abandoned_at: '2026-09-23T09:40:00.000Z',
    })

    expect(historyStatus(abandoned)).toBe('partial')
  })

  it('is partial for a session still running', () => {
    expect(historyStatus(session('2026-09-23', { completed_at: null }))).toBe('partial')
  })

  it('is not started when nothing was ever performed', () => {
    const prescribed = session('2026-09-23', { started_at: null, completed_at: null })
    const abandonedBeforeStart = session('2026-09-23', {
      started_at: null,
      completed_at: null,
      abandoned_at: '2026-09-23T09:00:00.000Z',
    })

    expect(historyStatus(prescribed)).toBe('unstarted')
    expect(historyStatus(abandonedBeforeStart)).toBe('unstarted')
  })

  it('does not substitute a target for a duration nobody performed', () => {
    const [entry] = entriesFor([
      session('2026-09-23', { completed_at: null, actual_duration_mins: null }),
    ])

    expect(entry).toMatchObject({ status: 'partial', durationMins: null })
  })
})

describe('filterHistory', () => {
  const entries = entriesFor([
    session('2026-09-23'),
    session('2026-09-21', { completed_at: null, abandoned_at: '2026-09-21T09:30:00.000Z' }),
    session('2026-09-19', { started_at: null, completed_at: null }),
  ])

  it('offers every status the list can hold, plus rest days', () => {
    expect(HISTORY_FILTERS.map((filter) => filter.value)).toEqual([
      'all',
      'completed',
      'partial',
      'unstarted',
      'rest',
    ])
  })

  it('keeps everything under all', () => {
    expect(filterHistory(entries, 'all')).toEqual(entries)
  })

  it.each([
    ['completed', '2026-09-23'],
    ['partial', '2026-09-21'],
    ['unstarted', '2026-09-19'],
  ] as const)('narrows to %s sessions', (filter, day) => {
    const filtered = filterHistory(entries, filter)

    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toMatchObject({ kind: 'session', day, status: filter })
  })

  it('narrows to rest days', () => {
    const filtered = filterHistory(entries, 'rest')

    expect(filtered).toHaveLength(2)
    expect(filtered.every((entry) => entry.kind === 'rest')).toBe(true)
  })

  it('can produce nothing without that meaning the history is empty', () => {
    const completedOnly = entriesFor([session('2026-09-23')])

    expect(completedOnly).not.toHaveLength(0)
    expect(filterHistory(completedOnly, 'partial')).toEqual([])
  })

  it('reads an unknown filter value as all', () => {
    expect(historyFilterOf('completed')).toBe('completed')
    expect(historyFilterOf('whatever-was-stored')).toBe('all')
  })
})

describe('formatting', () => {
  it('reads a day from its calendar parts', () => {
    expect(formatDay('2026-09-22')).toBe('Tue 22 Sep 2026')
  })

  it('reads a single rest day without a range', () => {
    expect(
      formatRestRange({ kind: 'rest', key: 'rest:2026-09-22', from: '2026-09-22', to: '2026-09-22', days: 1 }),
    ).toBe('Tue 22 Sep 2026 · 1 rest day')
  })

  it('reads a run of rest days as its span', () => {
    expect(
      formatRestRange({ kind: 'rest', key: 'rest:2026-09-20', from: '2026-09-20', to: '2026-09-22', days: 3 }),
    ).toBe('Sun 20 Sep 2026 – Tue 22 Sep 2026 · 3 rest days')
  })

  it('reads a focus enum as words', () => {
    expect(formatFocus('lower_body')).toBe('Lower body')
    expect(formatFocus('full_body')).toBe('Full body')
  })
})
