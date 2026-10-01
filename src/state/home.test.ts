import { describe, expect, it } from 'vitest'

import { makeSessionRow } from '../test/factories'
import {
  daysTrained,
  QUICK_START_LEGACY_GOAL,
  QUICK_START_MISSING_GOAL,
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

  it('carries explicit reasons and lets a marked today become rest', () => {
    const week = weekStrip([], {
      ...OPTIONS,
      restDays: new Map([
        ['2026-09-23', 'injury'],
        ['2026-09-25', 'rest'],
      ]),
    })

    expect(week.find((day) => day.day === '2026-09-23')).toMatchObject({
      state: 'rest',
      reason: 'injury',
    })
    expect(week.find((day) => day.day === '2026-09-25')).toMatchObject({
      state: 'rest',
      reason: 'rest',
      isToday: true,
    })
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
    expect(quickStartPlan([], 'strength', OPTIONS)).toBeNull()
    expect(
      quickStartPlan(
        [session('2026-09-24', 1, { completed_at: null, abandoned_at: '2026-09-24T09:30:00.000Z' })],
        'strength',
        OPTIONS,
      ),
    ).toBeNull()
    expect(
      quickStartPlan([session('2026-09-24', 1, { location_id: null })], 'strength', OPTIONS),
    ).toBeNull()
    // Nothing to repeat is still nothing, whatever the standing Goal says.
    expect(quickStartPlan([], null, OPTIONS)).toBeNull()
  })

  it('sends the standing Goal and clamps the reused intensity into its range', () => {
    const stale = quickStartPlan(
      [session('2026-09-23', 1, { goal_preset: 'hypertrophy', requested_intensity: 7 })],
      'strength',
      OPTIONS,
    )
    expect(stale).toMatchObject({
      goal: 'strength',
      goalLabel: 'Strength',
      refusal: null,
      input: { goal: 'strength', requested_intensity: 7 },
    })

    const recovery = quickStartPlan(
      [
        session('2026-09-23', 1, {
          goal_preset: 'active_recovery',
          session_focus: 'full_body',
          requested_duration_mins: 30,
          requested_intensity: 2,
        }),
      ],
      'strength',
      OPTIONS,
    )
    expect(recovery).toMatchObject({
      goalLabel: 'Strength',
      summary: 'Full body · 30 min · intensity 3',
      input: { goal: 'strength', requested_intensity: 3 },
    })

    // The upper bound too: hypertrophy stops at 9.
    expect(
      quickStartPlan(
        [session('2026-09-23', 1, { goal_preset: 'strength', requested_intensity: 10 })],
        'hypertrophy',
        OPTIONS,
      )?.input,
    ).toMatchObject({ goal: 'hypertrophy', requested_intensity: 9 })
  })

  it('answers a plan with no request when the standing Goal is missing or legacy', () => {
    const rows = [session('2026-09-23', 1, { goal_preset: 'hypertrophy' })]

    expect(quickStartPlan(rows, null, OPTIONS)).toMatchObject({
      input: null,
      goal: null,
      goalLabel: null,
      refusal: QUICK_START_MISSING_GOAL,
    })
    expect(quickStartPlan(rows, 'active_recovery', OPTIONS)).toMatchObject({
      input: null,
      goal: null,
      goalLabel: null,
      refusal: QUICK_START_LEGACY_GOAL,
    })
  })

  it('reuses the latest completed request, not deload-adjusted results or old notes', () => {
    const plan = quickStartPlan(
      [
        session('2026-09-23', 1, {
          session_focus: 'upper_body',
          goal_preset: 'strength',
          requested_duration_mins: 50,
          effective_duration_target_mins: 35,
          requested_intensity: 8,
          effective_intensity: 5,
          generation_notes: 'Old one-off context',
        }),
      ],
      'strength',
      OPTIONS,
    )

    expect(plan).toMatchObject({
      goal: 'strength',
      goalLabel: 'Strength',
      input: {
        goal: 'strength',
        focus: 'upper_body',
        requested_duration_mins: 50,
        requested_intensity: 8,
        location_id: LOCATION_ID,
        notes: null,
        deload: false,
      },
    })
  })
})
