import { describe, expect, it } from 'vitest'

import { makeSessionRow } from '../test/factories'
import {
  daysTrained,
  quickStartPlan,
  recentWorkouts,
  sessionDetailPath,
  weekStrip,
} from './home'

const NOW = new Date('2026-09-25T12:00:00.000Z')
const OPTIONS = { now: NOW, timeZone: 'UTC' }
const LOCATION_ID = 'd0000001-0000-4000-8000-000000000000'

function session(day: string, index: number, overrides = {}) {
  return makeSessionRow({
    id: `b${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`,
    date: day,
    created_at: `${day}T08:00:00.000Z`,
    started_at: `${day}T09:00:00.000Z`,
    completed_at: `${day}T10:00:00.000Z`,
    location_id: LOCATION_ID,
    ...overrides,
  })
}

describe('weekStrip', () => {
  it('renders a Monday-first data week with workout, rest, today, and upcoming states', () => {
    const week = weekStrip(
      [
        session('2026-09-22', 1),
        session('2026-09-24', 2, { completed_at: null, abandoned_at: '2026-09-24T09:30:00.000Z' }),
      ],
      OPTIONS,
    )

    expect(week.map(({ day, state, isToday }) => ({ day, state, isToday }))).toEqual([
      { day: '2026-09-21', state: 'rest', isToday: false },
      { day: '2026-09-22', state: 'workout', isToday: false },
      { day: '2026-09-23', state: 'rest', isToday: false },
      { day: '2026-09-24', state: 'workout', isToday: false },
      { day: '2026-09-25', state: 'upcoming', isToday: true },
      { day: '2026-09-26', state: 'upcoming', isToday: false },
      { day: '2026-09-27', state: 'upcoming', isToday: false },
    ])
    expect(daysTrained(week)).toBe(2)
  })
})

describe('recentWorkouts', () => {
  it('returns the newest three sessions and their history-detail destinations', () => {
    const recent = recentWorkouts(
      [
        session('2026-09-20', 1),
        session('2026-09-21', 2),
        session('2026-09-22', 3),
        session('2026-09-23', 4),
      ],
      OPTIONS,
    )

    expect(recent.map((entry) => entry.day)).toEqual([
      '2026-09-23',
      '2026-09-22',
      '2026-09-21',
    ])
    expect(recent.map((entry) => sessionDetailPath(entry.id))).toEqual(
      recent.map((entry) => `/history/${entry.id}`),
    )
  })
})

describe('quickStartPlan', () => {
  it('is absent until a completed workout with a location exists', () => {
    expect(quickStartPlan([], OPTIONS)).toBeNull()
    expect(
      quickStartPlan(
        [session('2026-09-24', 1, { completed_at: null, abandoned_at: '2026-09-24T09:30:00.000Z' })],
        OPTIONS,
      ),
    ).toBeNull()
    expect(
      quickStartPlan([session('2026-09-24', 1, { location_id: null })], OPTIONS),
    ).toBeNull()
  })

  it('reuses the latest completed request, not deload-adjusted results or old notes', () => {
    const plan = quickStartPlan(
      [
        session('2026-09-23', 1, {
          session_focus: 'upper_body',
          goal_preset: 'build_strength',
          requested_duration_mins: 50,
          effective_duration_target_mins: 35,
          requested_intensity: 8,
          effective_intensity: 5,
          generation_notes: 'Old one-off context',
        }),
      ],
      OPTIONS,
    )

    expect(plan).toMatchObject({
      goal: 'build_strength',
      goalLabel: 'Build strength',
      input: {
        focus: 'upper_body',
        requested_duration_mins: 50,
        requested_intensity: 8,
        location_id: LOCATION_ID,
        notes: null,
      },
    })
  })
})
