import { describe, expect, it } from 'vitest'

import { makeSessionRow } from '../test/factories'
import {
  defaultStreakPolicy,
  deriveStreak,
  localDayIn,
  previousDay,
  type StreakPolicy,
  type StreakSession,
} from './streak'

// SES-01c. The streak is a pure function of session rows, so these are the
// acceptance criteria themselves rather than a proxy for them: nothing is
// stored, nothing is fetched, and every case below is decided by the rows and
// the zone alone. `src/data/streak.test.ts` covers the read that supplies
// them, and `src/test/streak-migration.test.ts` covers the claim no column
// anywhere holds the answer.

const NEW_YORK = 'America/New_York'
const TOKYO = 'Asia/Tokyo'

/** A completed session, by the instant it finished. */
const completed = (completedAt: string, counts = true): StreakSession => ({
  completed_at: completedAt,
  counts_for_streak: counts,
})

/** `deriveStreak` with the zone and the instant a test is talking about. */
const streakAt = (
  sessions: readonly StreakSession[],
  now: string,
  options: { timeZone?: string; policy?: StreakPolicy } = {},
) =>
  deriveStreak(sessions, {
    timeZone: options.timeZone ?? NEW_YORK,
    now: new Date(now),
    policy: options.policy,
  })

describe('consecutive days, counted from the rows (SES-01c)', () => {
  it('counts a run of days ending today', () => {
    const streak = streakAt(
      [
        completed('2026-09-24T12:00:00Z'),
        completed('2026-09-23T12:00:00Z'),
        completed('2026-09-22T12:00:00Z'),
      ],
      '2026-09-24T20:00:00Z',
    )

    expect(streak.days).toBe(3)
    expect(streak.trainingDays).toEqual(['2026-09-24', '2026-09-23', '2026-09-22'])
    expect(streak.includesToday).toBe(true)
    expect(streak.lastTrainingDay).toBe('2026-09-24')
  })

  it('counts two sessions on one day as one day', () => {
    const streak = streakAt(
      [
        completed('2026-09-24T12:00:00Z'),
        completed('2026-09-24T23:00:00Z'),
        completed('2026-09-23T12:00:00Z'),
      ],
      '2026-09-24T23:30:00Z',
    )

    expect(streak.days).toBe(2)
    expect(streak.trainingDays).toEqual(['2026-09-24', '2026-09-23'])
  })

  it('does not care what order the rows arrive in', () => {
    const rows = [
      completed('2026-09-22T12:00:00Z'),
      completed('2026-09-24T12:00:00Z'),
      completed('2026-09-23T12:00:00Z'),
    ]

    expect(streakAt(rows, '2026-09-24T20:00:00Z').days).toBe(3)
    expect(streakAt([...rows].reverse(), '2026-09-24T20:00:00Z').days).toBe(3)
  })

  it('stops at the first day that was missed', () => {
    const streak = streakAt(
      [
        completed('2026-09-24T12:00:00Z'),
        completed('2026-09-23T12:00:00Z'),
        // The 22nd is missing. Everything before it is history, not streak.
        completed('2026-09-21T12:00:00Z'),
        completed('2026-09-20T12:00:00Z'),
      ],
      '2026-09-24T20:00:00Z',
    )

    expect(streak.days).toBe(2)
    expect(streak.trainingDays).toEqual(['2026-09-24', '2026-09-23'])
  })

  it('is zero, with no run, when nothing was ever completed', () => {
    const streak = streakAt([], '2026-09-24T20:00:00Z')

    expect(streak.days).toBe(0)
    expect(streak.trainingDays).toEqual([])
    expect(streak.includesToday).toBe(false)
    expect(streak.lastTrainingDay).toBeNull()
    expect(streak.continuesBeforeOldest).toBe(false)
  })
})

describe('a day in progress is not a missed day (SES-01c)', () => {
  it('keeps a run that ends yesterday, before today has been trained', () => {
    const streak = streakAt(
      [completed('2026-09-23T12:00:00Z'), completed('2026-09-22T12:00:00Z')],
      '2026-09-24T09:00:00Z',
    )

    expect(streak.days).toBe(2)
    expect(streak.includesToday).toBe(false)
    expect(streak.trainingDays).toEqual(['2026-09-23', '2026-09-22'])
  })

  it('ends a run that stopped the day before yesterday', () => {
    const streak = streakAt(
      [completed('2026-09-22T12:00:00Z'), completed('2026-09-21T12:00:00Z')],
      '2026-09-24T09:00:00Z',
    )

    expect(streak.days).toBe(0)
    // The history is still readable; it is simply not a streak any more.
    expect(streak.lastTrainingDay).toBe('2026-09-22')
  })

  it('counts today alone as one', () => {
    const streak = streakAt([completed('2026-09-24T12:00:00Z')], '2026-09-24T20:00:00Z')

    expect(streak.days).toBe(1)
    expect(streak.includesToday).toBe(true)
  })
})

describe('a session that never finished is never a day (SES-01c)', () => {
  it('ignores prescribed, active and abandoned sessions', () => {
    // All three are `completed_at: null` — the one predicate that covers a
    // workout never started, one still running, and one given up on.
    const streak = streakAt(
      [
        { completed_at: null, counts_for_streak: true },
        completed('2026-09-23T12:00:00Z'),
      ],
      '2026-09-24T09:00:00Z',
    )

    expect(streak.days).toBe(1)
    expect(streak.trainingDays).toEqual(['2026-09-23'])
  })

  it('shortens the streak the moment an abandoned session stops counting', () => {
    const before = [
      completed('2026-09-24T12:00:00Z'),
      completed('2026-09-23T12:00:00Z'),
      completed('2026-09-22T12:00:00Z'),
    ]
    // The 23rd is abandoned rather than completed — the same row, one
    // timestamp different. There is no repair step: the next derivation over
    // the same rows is simply a different number.
    const after = [
      before[0],
      { completed_at: null, counts_for_streak: true },
      before[2],
    ]

    expect(streakAt(before, '2026-09-24T20:00:00Z').days).toBe(3)
    expect(streakAt(after, '2026-09-24T20:00:00Z').days).toBe(1)
  })

  it('shortens the streak the moment a session is deleted', () => {
    const rows = [
      completed('2026-09-24T12:00:00Z'),
      completed('2026-09-23T12:00:00Z'),
      completed('2026-09-22T12:00:00Z'),
    ]

    expect(streakAt(rows, '2026-09-24T20:00:00Z').days).toBe(3)
    // Deleting the middle row is deleting the middle day. Nothing is
    // recomputed, repaired or invalidated — the function just has fewer rows.
    expect(streakAt([rows[0], rows[2]], '2026-09-24T20:00:00Z').days).toBe(1)
  })

  it('treats a session excluded by its own flag as a day not trained', () => {
    const streak = streakAt(
      [
        completed('2026-09-24T12:00:00Z'),
        completed('2026-09-23T12:00:00Z', false),
        completed('2026-09-22T12:00:00Z'),
      ],
      '2026-09-24T20:00:00Z',
    )

    expect(streak.days).toBe(1)
  })
})

describe('deload and active recovery are training days (SES-01c)', () => {
  it('counts them, reading nothing but the session flag', () => {
    // Full rows this time, because the criterion is about what is *not* read:
    // neither `goal_preset` nor `adjustment_reason` is a predicate here.
    const deload = makeSessionRow({
      completed_at: '2026-09-24T12:00:00Z',
      adjustment_reason: 'deload — OVR-04',
      effective_intensity: 4,
    })
    const activeRecovery = makeSessionRow({
      completed_at: '2026-09-23T12:00:00Z',
      goal_preset: 'active_recovery',
      session_focus: 'full_body',
    })

    const streak = streakAt([deload, activeRecovery], '2026-09-24T20:00:00Z')

    expect(streak.days).toBe(2)
    expect(streak.trainingDays).toEqual(['2026-09-24', '2026-09-23'])
  })
})

describe('the day boundary is the user’s (SES-01c)', () => {
  it('reads 11pm and 1am as two days, whatever UTC thinks', () => {
    // 2026-09-23T23:30 and 2026-09-24T01:00 in New York are 03:30Z and 05:00Z
    // on the 24th: one UTC day, two days for the user, and a streak of two.
    const streak = streakAt(
      [completed('2026-09-24T03:30:00Z'), completed('2026-09-24T05:00:00Z')],
      '2026-09-24T18:00:00Z',
    )

    expect(streak.trainingDays).toEqual(['2026-09-24', '2026-09-23'])
    expect(streak.days).toBe(2)
  })

  it('reads the same two rows as one day in a zone where they are one', () => {
    // The same instants in UTC are both the 24th, and one training day.
    const streak = streakAt(
      [completed('2026-09-24T03:30:00Z'), completed('2026-09-24T05:00:00Z')],
      '2026-09-24T18:00:00Z',
      { timeZone: 'UTC' },
    )

    expect(streak.trainingDays).toEqual(['2026-09-24'])
    expect(streak.days).toBe(1)
  })

  it('puts a late-evening session on the user’s day, not on UTC’s next one', () => {
    // 9pm on the 23rd in New York is already the 24th in UTC. A streak that
    // read UTC would call this today and count the user's yesterday twice.
    const streak = streakAt(
      [completed('2026-09-24T01:00:00Z'), completed('2026-09-22T16:00:00Z')],
      '2026-09-24T14:00:00Z',
    )

    expect(streak.today).toBe('2026-09-24')
    expect(streak.trainingDays).toEqual(['2026-09-23', '2026-09-22'])
    expect(streak.includesToday).toBe(false)
  })

  it('draws the boundary east of UTC the same way', () => {
    // Both instants are the 23rd in UTC. In Tokyo, 16:00Z is 1am on the 24th
    // and 13:00Z is 10pm on the 23rd — the same 11pm/1am case from the other
    // side of the meridian, and the same two days.
    const rows = [completed('2026-09-23T16:00:00Z'), completed('2026-09-23T13:00:00Z')]

    const tokyo = streakAt(rows, '2026-09-24T14:00:00Z', { timeZone: TOKYO })
    expect(tokyo.today).toBe('2026-09-24')
    expect(tokyo.trainingDays).toEqual(['2026-09-24', '2026-09-23'])

    const utc = streakAt(rows, '2026-09-24T14:00:00Z', { timeZone: 'UTC' })
    expect(utc.trainingDays).toEqual(['2026-09-23'])
  })

  it('walks calendar days across a DST transition, not 24-hour blocks', () => {
    // US DST ends on 2026-11-01: that local day is 25 hours long. Three
    // consecutive days across it are still three consecutive days.
    const streak = streakAt(
      [
        completed('2026-11-02T17:00:00Z'),
        completed('2026-11-01T17:00:00Z'),
        completed('2026-10-31T16:00:00Z'),
      ],
      '2026-11-02T20:00:00Z',
    )

    expect(streak.trainingDays).toEqual(['2026-11-02', '2026-11-01', '2026-10-31'])
  })

  it('walks across a month and a year boundary', () => {
    const streak = streakAt(
      [
        completed('2027-01-01T17:00:00Z'),
        completed('2026-12-31T17:00:00Z'),
        completed('2026-12-30T17:00:00Z'),
      ],
      '2027-01-01T20:00:00Z',
    )

    expect(streak.trainingDays).toEqual(['2027-01-01', '2026-12-31', '2026-12-30'])
  })
})

describe('the run may reach past the rows it was given (SES-01c)', () => {
  it('says so when the oldest row is still part of the run', () => {
    const streak = streakAt(
      [completed('2026-09-24T12:00:00Z'), completed('2026-09-23T12:00:00Z')],
      '2026-09-24T20:00:00Z',
    )

    expect(streak.days).toBe(2)
    expect(streak.continuesBeforeOldest).toBe(true)
  })

  it('says otherwise when the run stopped inside them', () => {
    const streak = streakAt(
      [completed('2026-09-24T12:00:00Z'), completed('2026-09-21T12:00:00Z')],
      '2026-09-24T20:00:00Z',
    )

    expect(streak.days).toBe(1)
    expect(streak.continuesBeforeOldest).toBe(false)
  })

  it('does not claim a run of nothing continues anywhere', () => {
    const streak = streakAt([completed('2026-09-20T12:00:00Z')], '2026-09-24T20:00:00Z')

    expect(streak.days).toBe(0)
    expect(streak.continuesBeforeOldest).toBe(false)
  })
})

describe('HOME-02 extends this function rather than replacing it (SES-01c)', () => {
  it('bridges a day a policy vouches for, without counting it', () => {
    // The shape a rest-day allowance takes: the 23rd was not trained, and a
    // policy that knows it was a marked rest day keeps the run intact.
    const restDays = new Set(['2026-09-23'])
    const policy: StreakPolicy = {
      ...defaultStreakPolicy,
      bridgesDay: (day, context) =>
        defaultStreakPolicy.bridgesDay(day, context) || restDays.has(day),
    }

    const rows = [
      completed('2026-09-24T12:00:00Z'),
      completed('2026-09-22T12:00:00Z'),
      completed('2026-09-21T12:00:00Z'),
    ]

    expect(streakAt(rows, '2026-09-24T20:00:00Z').days).toBe(1)

    const extended = streakAt(rows, '2026-09-24T20:00:00Z', { policy })
    expect(extended.days).toBe(3)
    // Bridged, not counted: a rest day is not a training day.
    expect(extended.trainingDays).toEqual(['2026-09-24', '2026-09-22', '2026-09-21'])
  })

  it('passes the run so far to the policy, so an allowance can be limited', () => {
    const seen: { day: string; counted: readonly string[] }[] = []
    const policy: StreakPolicy = {
      ...defaultStreakPolicy,
      bridgesDay: (day, context) => {
        seen.push({ day, counted: [...context.counted] })
        return defaultStreakPolicy.bridgesDay(day, context)
      },
    }

    streakAt(
      [completed('2026-09-24T12:00:00Z'), completed('2026-09-22T12:00:00Z')],
      '2026-09-24T20:00:00Z',
      { policy },
    )

    // Today was trained, so the first empty day the policy is asked about is
    // the 23rd, by which point the run already holds one day.
    expect(seen).toEqual([{ day: '2026-09-23', counted: ['2026-09-24'] }])
  })

  it('lets a policy decide what counts, without touching the walk', () => {
    // A pause state is the other half: sessions logged while paused do not
    // extend a streak, and that is one predicate, not a second derivation.
    const policy: StreakPolicy = {
      ...defaultStreakPolicy,
      countsForStreak: () => false,
    }

    const streak = streakAt(
      [completed('2026-09-24T12:00:00Z'), completed('2026-09-23T12:00:00Z')],
      '2026-09-24T20:00:00Z',
      { policy },
    )

    expect(streak.days).toBe(0)
    expect(streak.lastTrainingDay).toBeNull()
  })
})

describe('the day helpers (SES-01c)', () => {
  it('renders a local day as YYYY-MM-DD', () => {
    const day = localDayIn(NEW_YORK)

    expect(day(new Date('2026-09-24T03:30:00Z'))).toBe('2026-09-23')
    expect(day(new Date('2026-01-05T17:00:00Z'))).toBe('2026-01-05')
  })

  it('steps back one calendar day, including over the awkward ones', () => {
    expect(previousDay('2026-09-24')).toBe('2026-09-23')
    expect(previousDay('2026-09-01')).toBe('2026-08-31')
    expect(previousDay('2026-01-01')).toBe('2025-12-31')
    expect(previousDay('2026-03-01')).toBe('2026-02-28')
    expect(previousDay('2028-03-01')).toBe('2028-02-29')
  })

  it('refuses a zone the platform does not know, as Intl does', () => {
    expect(() => localDayIn('Mars/Olympus_Mons')).toThrow(RangeError)
  })
})
