import { describe, expect, it } from 'vitest'

import {
  MAX_CONSECUTIVE_REST_DAYS,
  PAUSE_REASONS,
  REST_DAY_REASONS,
  REST_DAY_REASON_EFFECTS,
  REST_DAY_REASON_LABELS,
  consecutiveRestDaysThrough,
  isPauseReason,
  pauseInForce,
  restDayIndex,
  restDayStreakPolicy,
  type MarkedDay,
} from './rest-days'
import type { RestDayReason } from './schemas'
import { deriveStreak, type StreakSession } from './streak'

/**
 * HOME-02's rules, as unit tests over the pure functions.
 *
 * Every case here goes through `deriveStreak` rather than through the policy
 * alone, and that is the point the requirement makes: the rest-day rules are a
 * policy passed to SES-01c's derivation, not a second derivation. If they ever
 * became one, these tests would still pass against the wrong function — so the
 * first describe block asserts the arrangement itself.
 */

const ZONE = 'UTC'

/** A session that counts, completed at noon on `day`. */
function trained(day: string): StreakSession {
  return { completed_at: `${day}T12:00:00.000Z`, counts_for_streak: true }
}

/** A session that happened and does not count — a deload logged as one. */
function notCounted(day: string): StreakSession {
  return { completed_at: `${day}T12:00:00.000Z`, counts_for_streak: false }
}

function marked(day: string, reason: RestDayReason): MarkedDay {
  return { day, reason }
}

/** The streak on `today`, given sessions and marks. */
function streakOn(
  today: string,
  sessions: readonly StreakSession[],
  marks: readonly MarkedDay[] = [],
) {
  return deriveStreak(sessions, {
    timeZone: ZONE,
    now: new Date(`${today}T09:00:00.000Z`),
    policy: restDayStreakPolicy(restDayIndex(marks)),
  })
}

describe('the rules extend SES-01c rather than replacing it (HOME-02)', () => {
  it('is a StreakPolicy, so the derivation stays the one function', () => {
    const policy = restDayStreakPolicy(restDayIndex([]))

    expect(typeof policy.countsForStreak).toBe('function')
    expect(typeof policy.bridgesDay).toBe('function')
  })

  it('leaves which sessions count exactly where SES-01a put it', () => {
    const policy = restDayStreakPolicy(restDayIndex([marked('2026-09-24', 'rest')]))

    // The flag, and nothing else. A rest mark does not make a session count,
    // and an abandoned session is not rescued by one.
    expect(policy.countsForStreak(trained('2026-09-24'))).toBe(true)
    expect(policy.countsForStreak(notCounted('2026-09-24'))).toBe(false)
    expect(
      policy.countsForStreak({ completed_at: null, counts_for_streak: true }),
    ).toBe(false)
  })

  it('never turns a rest day into a training day', () => {
    // Marked rest days keep the run alive without lengthening it: the count is
    // days trained, and resting is not training.
    const streak = streakOn(
      '2026-09-24',
      [trained('2026-09-22'), trained('2026-09-24')],
      [marked('2026-09-23', 'rest')],
    )

    expect(streak.days).toBe(2)
    expect(streak.trainingDays).toEqual(['2026-09-24', '2026-09-22'])
  })

  it('still stores nothing: the same rows answer the same way twice', () => {
    const sessions = [trained('2026-09-23'), trained('2026-09-24')]
    const marks = [marked('2026-09-22', 'rest')]

    expect(streakOn('2026-09-24', sessions, marks)).toEqual(
      streakOn('2026-09-24', sessions, marks),
    )
  })
})

describe('continue (HOME-02)', () => {
  it('counts consecutive training days, as M1 did', () => {
    const streak = streakOn('2026-09-24', [
      trained('2026-09-22'),
      trained('2026-09-23'),
      trained('2026-09-24'),
    ])

    expect(streak.days).toBe(3)
    expect(streak.includesToday).toBe(true)
  })

  it('keeps a run that ended yesterday, because today is not over', () => {
    const streak = streakOn('2026-09-24', [trained('2026-09-22'), trained('2026-09-23')])

    expect(streak.days).toBe(2)
    expect(streak.includesToday).toBe(false)
  })
})

describe('break (HOME-02)', () => {
  it('breaks on one unmarked day that has finished', () => {
    // The day between is empty and nobody said why. This is the case rule 1
    // exists to distinguish from the next test.
    const streak = streakOn('2026-09-24', [
      trained('2026-09-20'),
      trained('2026-09-21'),
      trained('2026-09-23'),
    ])

    expect(streak.days).toBe(1)
    expect(streak.trainingDays).toEqual(['2026-09-23'])
    expect(streak.lastTrainingDay).toBe('2026-09-23')
  })

  it('breaks on a day whose only session does not count', () => {
    const streak = streakOn('2026-09-24', [
      trained('2026-09-21'),
      notCounted('2026-09-22'),
      trained('2026-09-23'),
    ])

    expect(streak.days).toBe(1)
  })

  it('reports no streak at all, rather than a broken one, with nothing recent', () => {
    const streak = streakOn('2026-09-24', [trained('2026-09-10')])

    expect(streak.days).toBe(0)
    expect(streak.lastTrainingDay).toBe('2026-09-10')
  })
})

describe('the rest-day allowance (HOME-02)', () => {
  it('sustains the streak across a marked rest day', () => {
    // The acceptance criterion, at its narrowest: same rows as the break case
    // above, one mark added, and the run survives.
    const streak = streakOn(
      '2026-09-24',
      [trained('2026-09-20'), trained('2026-09-21'), trained('2026-09-23')],
      [marked('2026-09-22', 'rest')],
    )

    expect(streak.days).toBe(3)
    expect(streak.trainingDays).toEqual(['2026-09-23', '2026-09-21', '2026-09-20'])
  })

  it('bridges a rest day marked today without counting it', () => {
    const streak = streakOn(
      '2026-09-24',
      [trained('2026-09-23')],
      [marked('2026-09-24', 'rest')],
    )

    expect(streak.days).toBe(1)
    expect(streak.includesToday).toBe(false)
  })

  it('survives the longest allowed run of rest days', () => {
    const rested = [
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]
    expect(rested).toHaveLength(MAX_CONSECUTIVE_REST_DAYS)

    const streak = streakOn(
      '2026-09-24',
      [trained('2026-09-16'), trained('2026-09-17')],
      rested.map((day) => marked(day, 'rest')),
    )

    expect(streak.days).toBe(2)
  })

  it('breaks on the day after the allowance runs out', () => {
    const rested = [
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]
    expect(rested.length).toBe(MAX_CONSECUTIVE_REST_DAYS + 1)

    const streak = streakOn(
      '2026-09-24',
      [trained('2026-09-15'), trained('2026-09-16')],
      rested.map((day) => marked(day, 'rest')),
    )

    expect(streak.days).toBe(0)
    // Nothing was lost from the history — the run ended, the sessions remain.
    expect(streak.lastTrainingDay).toBe('2026-09-16')
  })

  it('restarts the allowance after a training day', () => {
    // Five rest days, a session, then five more. Neither run reaches the
    // ceiling, so the streak spans all of it.
    const streak = streakOn(
      '2026-09-24',
      [trained('2026-09-13'), trained('2026-09-19'), trained('2026-09-24')],
      [
        ...['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'],
        ...['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'],
      ].map((day) => marked(day, 'rest')),
    )

    expect(streak.days).toBe(3)
  })

  it('counts a run of rest days from the marks alone', () => {
    const marks = restDayIndex([
      marked('2026-09-21', 'rest'),
      marked('2026-09-22', 'rest'),
      marked('2026-09-23', 'rest'),
    ])

    expect(consecutiveRestDaysThrough(marks, '2026-09-23')).toBe(3)
    expect(consecutiveRestDaysThrough(marks, '2026-09-22')).toBe(2)
    expect(consecutiveRestDaysThrough(marks, '2026-09-20')).toBe(0)
  })

  it('does not let a pause day extend a run of rest days', () => {
    const marks = restDayIndex([
      marked('2026-09-21', 'rest'),
      marked('2026-09-22', 'sick'),
      marked('2026-09-23', 'rest'),
    ])

    // Rule 3's other half: the illness is not one of the six.
    expect(consecutiveRestDaysThrough(marks, '2026-09-23')).toBe(1)
  })
})

describe('pause and resume (HOME-02)', () => {
  it.each(PAUSE_REASONS)('holds the streak through a long %s pause', (reason) => {
    const paused = [
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]
    // Fourteen days — twice the ceiling an ordinary rest run has, because a
    // pause has none.
    expect(paused.length).toBeGreaterThan(MAX_CONSECUTIVE_REST_DAYS)

    const streak = streakOn(
      '2026-09-24',
      [trained('2026-09-08'), trained('2026-09-09'), trained('2026-09-24')],
      paused.map((day) => marked(day, reason)),
    )

    expect(streak.days).toBe(3)
    expect(streak.trainingDays).toEqual(['2026-09-24', '2026-09-09', '2026-09-08'])
  })

  it('resumes into the next session with nothing recording that it did', () => {
    const marks = [marked('2026-09-22', 'injury'), marked('2026-09-23', 'injury')]

    const duringPause = streakOn('2026-09-23', [trained('2026-09-21')], marks)
    expect(duringPause.days).toBe(1)
    expect(pauseInForce(duringPause, restDayIndex(marks))).toBe('injury')

    // The next counting session is the resume. No transition was written.
    const afterPause = streakOn(
      '2026-09-24',
      [trained('2026-09-21'), trained('2026-09-24')],
      marks,
    )
    expect(afterPause.days).toBe(2)
    expect(pauseInForce(afterPause, restDayIndex(marks))).toBeNull()
  })

  it('breaks when a pause stops being marked', () => {
    // Sick on the 21st and 22nd, and then two days nobody accounted for.
    const streak = streakOn(
      '2026-09-25',
      [trained('2026-09-20')],
      [marked('2026-09-21', 'sick'), marked('2026-09-22', 'sick')],
    )

    expect(streak.days).toBe(0)
  })

  it('reports the pause in force, and only while it is in force', () => {
    const marks = restDayIndex([marked('2026-09-23', 'vacation')])
    const paused = streakOn('2026-09-24', [trained('2026-09-22')], [
      marked('2026-09-23', 'vacation'),
    ])

    expect(pauseInForce(paused, marks)).toBe('vacation')

    // Trained today: the pause is over, whatever yesterday said.
    const resumed = streakOn(
      '2026-09-24',
      [trained('2026-09-22'), trained('2026-09-24')],
      [marked('2026-09-23', 'vacation')],
    )
    expect(pauseInForce(resumed, marks)).toBeNull()
  })

  it('does not call an ordinary rest day a pause', () => {
    const marks = restDayIndex([marked('2026-09-24', 'rest')])
    const streak = streakOn('2026-09-24', [trained('2026-09-23')], [
      marked('2026-09-24', 'rest'),
    ])

    expect(pauseInForce(streak, marks)).toBeNull()
  })

  it('reads today over yesterday, because today is the later statement', () => {
    const marks = restDayIndex([
      marked('2026-09-23', 'sick'),
      marked('2026-09-24', 'rest'),
    ])
    const streak = streakOn('2026-09-24', [trained('2026-09-22')], [
      marked('2026-09-23', 'sick'),
      marked('2026-09-24', 'rest'),
    ])

    expect(pauseInForce(streak, marks)).toBeNull()
  })

  it('calls a stale pause no pause at all', () => {
    // Injured a fortnight ago and nothing since. The streak ended; it is not
    // being held open by a mark that old.
    const marks = restDayIndex([marked('2026-09-10', 'injury')])
    const streak = streakOn('2026-09-24', [trained('2026-09-09')], [
      marked('2026-09-10', 'injury'),
    ])

    expect(streak.days).toBe(0)
    expect(pauseInForce(streak, marks)).toBeNull()
  })
})

describe('backdating and deleting need no repair step (HOME-02)', () => {
  it('mends a broken streak when the missing session is backdated in', () => {
    const before = streakOn('2026-09-24', [trained('2026-09-22'), trained('2026-09-24')])
    expect(before.days).toBe(1)

    const after = streakOn('2026-09-24', [
      trained('2026-09-22'),
      // Entered after the fact, for a day that had already passed.
      trained('2026-09-23'),
      trained('2026-09-24'),
    ])

    expect(after.days).toBe(3)
  })

  it('shortens the streak when a session is deleted', () => {
    const before = streakOn('2026-09-24', [
      trained('2026-09-22'),
      trained('2026-09-23'),
      trained('2026-09-24'),
    ])
    expect(before.days).toBe(3)

    // The row is simply gone. Nothing was decremented, and no stored count had
    // to be noticed and fixed.
    const after = streakOn('2026-09-24', [trained('2026-09-22'), trained('2026-09-24')])

    expect(after.days).toBe(1)
  })

  it('shortens the streak when a rest mark is removed', () => {
    const marks = [marked('2026-09-23', 'rest')]
    const sessions = [trained('2026-09-22'), trained('2026-09-24')]

    expect(streakOn('2026-09-24', sessions, marks).days).toBe(2)
    expect(streakOn('2026-09-24', sessions, []).days).toBe(1)
  })

  it('counts two sessions on one day once', () => {
    const streak = streakOn('2026-09-24', [
      trained('2026-09-24'),
      { completed_at: '2026-09-24T19:00:00.000Z', counts_for_streak: true },
    ])

    expect(streak.days).toBe(1)
  })
})

describe('the reason vocabulary (HOME-02)', () => {
  it('is the enum, not a second list', () => {
    expect(REST_DAY_REASONS).toEqual(['rest', 'injury', 'sick', 'vacation'])
  })

  it('classifies every reason as a pause or an allowance, with no default', () => {
    expect(PAUSE_REASONS).toEqual(['injury', 'sick', 'vacation'])
    expect(REST_DAY_REASONS.filter((reason) => !isPauseReason(reason))).toEqual(['rest'])
  })

  it('gives every reason a label and a stated effect', () => {
    for (const reason of REST_DAY_REASONS) {
      expect(REST_DAY_REASON_LABELS[reason], reason).toBeTruthy()
      expect(REST_DAY_REASON_EFFECTS[reason], reason).toBeTruthy()
    }
  })

  it('states the ceiling in the copy by reading it from the rule', () => {
    expect(REST_DAY_REASON_EFFECTS.rest).toContain(String(MAX_CONSECUTIVE_REST_DAYS))
  })

  it('indexes marks by day, and a later mark for a day wins', () => {
    const marks = restDayIndex([
      marked('2026-09-23', 'rest'),
      marked('2026-09-23', 'injury'),
    ])

    expect(marks.get('2026-09-23')).toBe('injury')
    expect(marks.size).toBe(1)
  })
})

describe('the day boundary is the user’s (HOME-02)', () => {
  it('marks a day in the user’s zone, not in UTC', () => {
    // 2026-09-24T02:00Z is still the 23rd in New York, so a rest day marked
    // for the 23rd is the day the user is standing in.
    const streak = deriveStreak([trained('2026-09-22')], {
      timeZone: 'America/New_York',
      now: new Date('2026-09-24T02:00:00.000Z'),
      policy: restDayStreakPolicy(restDayIndex([marked('2026-09-22', 'rest')])),
    })

    expect(streak.today).toBe('2026-09-23')
    // The 22nd is both trained and marked: the session wins, because counting
    // is asked before bridging.
    expect(streak.days).toBe(1)
    expect(streak.trainingDays).toEqual(['2026-09-22'])
  })

  it('walks calendar days across a month boundary', () => {
    const streak = streakOn(
      '2026-10-02',
      [trained('2026-09-29'), trained('2026-10-02')],
      [marked('2026-09-30', 'rest'), marked('2026-10-01', 'rest')],
    )

    expect(streak.days).toBe(2)
  })
})
