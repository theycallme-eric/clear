/**
 * OVR-04 — §4's trigger table, one row at a time, plus the consent around it.
 *
 * The requirement asks for D1–D6 as *pure tested functions*, so every row is
 * exercised here against a history built in the test rather than inferred from a
 * screen: the positive case, and the near miss that must not fire. The consent
 * half — the three-session snooze, the applied deload's window, the confirmation
 * a hard intensity costs — is tested in the same file because it is the same
 * decision: whether the banner says anything at all.
 */
import { describe, expect, it } from 'vitest'

import {
  BACKSTOP_WEEKS,
  clampedIntensity,
  confirmsHardIntensity,
  d1Stall,
  d2Regression,
  d3EffortInflation,
  d4AccumulatedLoad,
  d5MissedReps,
  d6CalendarBackstop,
  decisionFor,
  DELOAD_DAYS,
  DELOAD_INTENSITY_MAX,
  deloadSessionReads,
  deloadSuggestion,
  deloadTriggers,
  exerciseLabel,
  headlineTrigger,
  median,
  suggestionKey,
  suppression,
  type DeloadDecision,
  type DeloadSessionRead,
} from './deload'
import type { AnchorEvidenceRow, WorkoutSessionRow } from './schemas'

const TODAY = '2026-09-25'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** One working set, as `anchor_evidence` answers it. */
function set(overrides: Partial<AnchorEvidenceRow> = {}): AnchorEvidenceRow {
  return {
    session_id: 's1',
    session_date: '2026-09-01',
    logged_at: '2026-09-01T10:00:00.000Z',
    exercise_id: 'back-squat',
    equipment_used: 'barbell',
    set_number: 1,
    actual_reps: 5,
    prescribed_reps: 5,
    weight: 100,
    weight_unit: 'lb',
    rpe: 8,
    ...overrides,
  }
}

/** A session's worth of sets, at one date, under one session id. */
function sets(
  id: string,
  date: string,
  rows: readonly Partial<AnchorEvidenceRow>[],
): AnchorEvidenceRow[] {
  return rows.map((overrides, index) =>
    set({
      session_id: id,
      session_date: date,
      logged_at: `${date}T10:0${index}:00.000Z`,
      set_number: index + 1,
      ...overrides,
    }),
  )
}

/** `days` before `TODAY`, as `YYYY-MM-DD`. */
function daysAgo(days: number): string {
  return new Date(Date.parse(TODAY) - days * 86_400_000).toISOString().slice(0, 10)
}

function session(overrides: Partial<DeloadSessionRead> = {}): DeloadSessionRead {
  return { id: 'x', date: TODAY, intensity: 8, completed: true, ...overrides }
}

/** `count` completed sessions, one per day back from `from` days ago. */
function sessionRun(
  count: number,
  from: number,
  overrides: Partial<DeloadSessionRead> = {},
): DeloadSessionRead[] {
  return Array.from({ length: count }, (_unused, index) =>
    session({ id: `run-${from}-${index}`, date: daysAgo(from + index), ...overrides }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The reads
// ─────────────────────────────────────────────────────────────────────────────

describe('reads', () => {
  it('takes the median of an odd and an even list, and null of nothing', () => {
    expect(median([9, 7, 10])).toBe(9)
    expect(median([7, 8, 9, 10])).toBe(8.5)
    expect(median([])).toBeNull()
  })

  it('reads a session row as completed only when it finished and was not abandoned', () => {
    const row = (
      overrides: Partial<WorkoutSessionRow>,
    ): WorkoutSessionRow =>
      ({
        id: 'a',
        date: '2026-09-20',
        effective_intensity: 7,
        completed_at: '2026-09-20T11:00:00.000Z',
        abandoned_at: null,
        ...overrides,
      }) as WorkoutSessionRow

    expect(deloadSessionReads([row({})])[0]).toEqual({
      id: 'a',
      date: '2026-09-20',
      intensity: 7,
      completed: true,
    })
    expect(deloadSessionReads([row({ completed_at: null })])[0].completed).toBe(false)
    expect(
      deloadSessionReads([row({ abandoned_at: '2026-09-20T11:30:00.000Z' })])[0].completed,
    ).toBe(false)
  })

  it('humanises an exercise id for the banner', () => {
    expect(exerciseLabel('back-squat')).toBe('back squat')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D1 — performance stall
// ─────────────────────────────────────────────────────────────────────────────

describe('D1 — performance stall', () => {
  /** Three sessions of the same lift, at the weights and RPEs given. */
  const stall = (weights: readonly number[], rpes: readonly number[]) =>
    weights.flatMap((weight, index) =>
      sets(`s${index}`, daysAgo(12 - index * 4), [
        { weight, rpe: rpes[index] },
        { weight, rpe: rpes[index] },
      ]),
    )

  it('fires on three flat sessions at RPE 9 or more', () => {
    const triggers = d1Stall(stall([100, 100, 100], [9, 9.5, 10]))

    expect(triggers).toHaveLength(1)
    expect(triggers[0]).toMatchObject({ id: 'D1', scope: 'movement', exerciseId: 'back-squat' })
    expect(triggers[0].reason).toBe('Your last 3 back squat sessions stalled at RPE 9+.')
  })

  it('fires when the anchor wobbles but never exceeds where it started', () => {
    expect(d1Stall(stall([100, 99, 100], [9, 9, 9]))).toHaveLength(1)
  })

  it('does not fire when the anchor increased', () => {
    expect(d1Stall(stall([100, 100, 105], [9, 9, 9]))).toHaveLength(0)
  })

  it('does not fire when the work was not maximal — a light stretch is not a stall', () => {
    expect(d1Stall(stall([100, 100, 100], [9, 7, 9]))).toHaveLength(0)
  })

  it('does not fire when an RPE was never recorded', () => {
    const evidence = stall([100, 100, 100], [9, 9, 9]).map((row) =>
      row.session_id === 's1' ? { ...row, rpe: null } : row,
    )
    expect(d1Stall(evidence)).toHaveLength(0)
  })

  it('needs three sessions', () => {
    expect(d1Stall(stall([100, 100], [9, 9]))).toHaveLength(0)
  })

  it('scopes to the lift that stalled, leaving one that did not alone', () => {
    const evidence = [
      ...d1Fixture('back-squat', [100, 100, 100], 9),
      ...d1Fixture('barbell-bench', [100, 105, 110], 9),
    ]

    const triggers = d1Stall(evidence)
    expect(triggers.map((trigger) => trigger.exerciseId)).toEqual(['back-squat'])
  })
})

function d1Fixture(
  exerciseId: string,
  weights: readonly number[],
  rpe: number,
): AnchorEvidenceRow[] {
  return weights.flatMap((weight, index) =>
    sets(`${exerciseId}-${index}`, daysAgo(12 - index * 4), [{ weight, rpe, exercise_id: exerciseId }]),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// D2 — regression
// ─────────────────────────────────────────────────────────────────────────────

describe('D2 — regression', () => {
  /** A best, then two sessions at `fraction` of it, all inside four weeks. */
  const regression = (fraction: number) => [
    ...sets('best', daysAgo(20), [{ weight: 100 }]),
    ...sets('down1', daysAgo(10), [{ weight: 100 * fraction }]),
    ...sets('down2', daysAgo(3), [{ weight: 100 * fraction }]),
  ]

  it('fires when two consecutive sessions sit 5% or more below the 4-week best', () => {
    const triggers = d2Regression(regression(0.9))

    expect(triggers).toHaveLength(1)
    expect(triggers[0]).toMatchObject({ id: 'D2', scope: 'movement', exerciseId: 'back-squat' })
    expect(triggers[0].reason).toBe(
      'Your back squat has been 5% or more below its best for 2 sessions.',
    )
  })

  it('does not fire on a drop shallower than 5%', () => {
    expect(d2Regression(regression(0.97))).toHaveLength(0)
  })

  it('does not fire when only the latest session is down', () => {
    const evidence = [
      ...sets('best', daysAgo(20), [{ weight: 100 }]),
      ...sets('level', daysAgo(10), [{ weight: 100 }]),
      ...sets('down', daysAgo(3), [{ weight: 85 }]),
    ]
    expect(d2Regression(evidence)).toHaveLength(0)
  })

  it('forgets a best older than four weeks', () => {
    const evidence = [
      ...sets('ancient', daysAgo(60), [{ weight: 100 }]),
      ...sets('now1', daysAgo(10), [{ weight: 85 }]),
      ...sets('now2', daysAgo(3), [{ weight: 85 }]),
    ]
    expect(d2Regression(evidence)).toHaveLength(0)
  })

  it('is restricted to the primary lifts when a caller names them', () => {
    expect(d2Regression(regression(0.9), new Set(['deadlift']))).toHaveLength(0)
    expect(d2Regression(regression(0.9), new Set(['back-squat']))).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D3 — effort inflation
// ─────────────────────────────────────────────────────────────────────────────

describe('D3 — effort inflation', () => {
  const week = (rpes: readonly number[]) =>
    rpes.flatMap((rpe, index) => sets(`w${index}`, daysAgo(index + 1), [{ rpe }, { rpe }]))

  it('fires on a 7-day median of 9 across three sessions', () => {
    const trigger = d3EffortInflation(week([9, 9.5, 10]), TODAY)

    expect(trigger).toMatchObject({ id: 'D3', scope: 'session', exerciseId: null })
    expect(trigger?.reason).toBe('Everything has felt like an RPE 9 this week — 3 sessions running.')
  })

  it('does not fire below the median', () => {
    expect(d3EffortInflation(week([9, 8, 8.5]), TODAY)).toBeNull()
  })

  it('does not fire on fewer than three sessions', () => {
    expect(d3EffortInflation(week([10, 10]), TODAY)).toBeNull()
  })

  it('reads only the last seven days', () => {
    const stale = [9, 9, 9].flatMap((rpe, index) =>
      sets(`old${index}`, daysAgo(10 + index), [{ rpe }]),
    )
    expect(d3EffortInflation(stale, TODAY)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D4 — accumulated load
// ─────────────────────────────────────────────────────────────────────────────

describe('D4 — accumulated load', () => {
  it('fires on six hard sessions in a fortnight with nothing easy', () => {
    const trigger = d4AccumulatedLoad(sessionRun(6, 1, { intensity: 8 }), TODAY)

    expect(trigger).toMatchObject({ id: 'D4', scope: 'session' })
    expect(trigger?.reason).toBe('6 hard sessions in 14 days and no easy ones.')
  })

  it('does not fire when one easy session sits in the window', () => {
    const history = [...sessionRun(6, 1, { intensity: 8 }), session({ id: 'easy', date: daysAgo(9), intensity: 4 })]
    expect(d4AccumulatedLoad(history, TODAY)).toBeNull()
  })

  it('does not fire on five hard sessions', () => {
    expect(d4AccumulatedLoad(sessionRun(5, 1, { intensity: 8 }), TODAY)).toBeNull()
  })

  it('ignores sessions outside the fortnight, and sessions never completed', () => {
    expect(d4AccumulatedLoad(sessionRun(6, 15, { intensity: 9 }), TODAY)).toBeNull()
    expect(
      d4AccumulatedLoad(sessionRun(6, 1, { intensity: 9, completed: false }), TODAY),
    ).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D5 — missed reps
// ─────────────────────────────────────────────────────────────────────────────

describe('D5 — missed reps', () => {
  it('fires when 30% or more of the last two sessions’ sets came up short', () => {
    const evidence = [
      ...sets('a', daysAgo(4), [{ actual_reps: 5 }, { actual_reps: 3 }]),
      ...sets('b', daysAgo(1), [{ actual_reps: 5 }, { actual_reps: 4 }]),
    ]

    const trigger = d5MissedReps(evidence)
    expect(trigger).toMatchObject({ id: 'D5', scope: 'session' })
    expect(trigger?.reason).toBe(
      '50% of your sets came up short of their reps in the last 2 sessions.',
    )
  })

  it('does not fire below 30%', () => {
    const evidence = sets('a', daysAgo(1), [
      { actual_reps: 5 },
      { actual_reps: 5 },
      { actual_reps: 5 },
      { actual_reps: 4 },
    ])
    expect(d5MissedReps(evidence)).toBeNull()
  })

  it('reads only the two most recent sessions', () => {
    const evidence = [
      ...sets('old', daysAgo(20), [{ actual_reps: 1 }, { actual_reps: 1 }]),
      ...sets('a', daysAgo(4), [{ actual_reps: 5 }, { actual_reps: 5 }]),
      ...sets('b', daysAgo(1), [{ actual_reps: 5 }, { actual_reps: 5 }]),
    ]
    expect(d5MissedReps(evidence)).toBeNull()
  })

  it('ignores a set with nothing to compare — no target, or nothing recorded', () => {
    const evidence = sets('a', daysAgo(1), [
      { actual_reps: null },
      { prescribed_reps: null, actual_reps: 1 },
    ])
    expect(d5MissedReps(evidence)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D6 — calendar backstop
// ─────────────────────────────────────────────────────────────────────────────

describe('D6 — calendar backstop', () => {
  /** One session a week for six weeks, all at `intensity`. */
  const weeks = (intensity: number, count = BACKSTOP_WEEKS) =>
    Array.from({ length: count }, (_unused, index) =>
      session({ id: `w${index}`, date: daysAgo(index * 7 + 1), intensity }),
    )

  it('fires after six weeks with no easy week', () => {
    const trigger = d6CalendarBackstop(weeks(7), TODAY)

    expect(trigger).toMatchObject({ id: 'D6', scope: 'session' })
    expect(trigger?.reason).toBe('6 weeks without an easy one.')
  })

  it('is reset by a week that averaged 5 or below', () => {
    const history = weeks(7)
    history[2] = { ...history[2], intensity: 4 }
    expect(d6CalendarBackstop(history, TODAY)).toBeNull()
  })

  it('is reset by a week with no training at all', () => {
    expect(d6CalendarBackstop(weeks(7).filter((_unused, index) => index !== 3), TODAY)).toBeNull()
  })

  it('needs six weeks of history', () => {
    expect(d6CalendarBackstop(weeks(9, 4), TODAY)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The headline
// ─────────────────────────────────────────────────────────────────────────────

describe('the suggestion', () => {
  const stalled = [100, 100, 100].flatMap((weight, index) =>
    sets(`stall${index}`, daysAgo(12 - index * 4), [{ weight, rpe: 9 }]),
  )

  const hardFortnight = sessionRun(6, 1, { intensity: 8 })

  it('says nothing when nothing fired', () => {
    expect(
      deloadSuggestion({ evidence: sets('a', daysAgo(2), [{ rpe: 7 }]), sessions: [], today: TODAY }),
    ).toBeNull()
  })

  it('suggests a movement deload for a single stalled lift', () => {
    const suggestion = deloadSuggestion({ evidence: stalled, sessions: [], today: TODAY })

    expect(suggestion?.scope).toBe('movement')
    expect(suggestion?.exerciseId).toBe('back-squat')
    expect(suggestion?.key).toBe('movement:back-squat')
    expect(suggestion?.dismissedSessionsAgo).toBeNull()
  })

  it('lets a whole-session signal outrank a single lift, and still lists both', () => {
    const suggestion = deloadSuggestion({
      evidence: stalled,
      sessions: hardFortnight,
      today: TODAY,
    })

    expect(suggestion?.scope).toBe('session')
    expect(suggestion?.trigger.id).toBe('D4')
    expect(suggestion?.triggers.map((trigger) => trigger.id)).toEqual(['D1', 'D4'])
    expect(suggestion?.key).toBe('session')
  })

  it('takes the table’s order inside one scope', () => {
    expect(
      headlineTrigger([
        { id: 'D6', scope: 'session', exerciseId: null, reason: 'x' },
        { id: 'D3', scope: 'session', exerciseId: null, reason: 'y' },
      ])?.id,
    ).toBe('D6')
  })

  it('keys a decision by scope and lift', () => {
    expect(suggestionKey({ scope: 'session', exerciseId: null })).toBe('session')
    expect(suggestionKey({ scope: 'movement', exerciseId: 'deadlift' })).toBe('movement:deadlift')
  })

  it('never fires on evidence alone without a trigger — the rules are the trigger', () => {
    expect(deloadTriggers({ evidence: [], sessions: [], today: TODAY })).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Consent
// ─────────────────────────────────────────────────────────────────────────────

describe('override and snooze', () => {
  const stalled = [100, 100, 100].flatMap((weight, index) =>
    sets(`stall${index}`, daysAgo(12 - index * 4), [{ weight, rpe: 9 }]),
  )

  const dismissal = (date: string, key = 'movement:back-squat'): DeloadDecision => ({
    key,
    trigger: 'D1',
    decision: 'dismissed',
    date,
  })

  it('records what the user answered', () => {
    const suggestion = deloadSuggestion({ evidence: stalled, sessions: [], today: TODAY })
    expect(suggestion).not.toBeNull()

    expect(decisionFor(suggestion!, 'dismissed', TODAY)).toEqual({
      key: 'movement:back-squat',
      trigger: 'D1',
      decision: 'dismissed',
      date: TODAY,
    })
  })

  it('stays quiet for three sessions after Not today', () => {
    const decisions = [dismissal(daysAgo(10))]
    const twoSince = sessionRun(2, 1)

    expect(
      deloadSuggestion({ evidence: stalled, sessions: twoSince, today: TODAY, decisions }),
    ).toBeNull()
  })

  it('comes back after the third session, saying how long ago it was raised', () => {
    const decisions = [dismissal(daysAgo(10))]
    const threeSince = sessionRun(3, 1)

    const suggestion = deloadSuggestion({
      evidence: stalled,
      sessions: threeSince,
      today: TODAY,
      decisions,
    })

    expect(suggestion?.dismissedSessionsAgo).toBe(3)
  })

  it('does not count a session completed on the day of the dismissal', () => {
    const decisions = [dismissal(daysAgo(3))]
    const sameDay = [
      session({ id: 'same', date: daysAgo(3) }),
      ...sessionRun(2, 1),
    ]

    expect(
      deloadSuggestion({ evidence: stalled, sessions: sameDay, today: TODAY, decisions }),
    ).toBeNull()
  })

  it('lets a whole-session signal through a movement dismissal', () => {
    const suggestion = deloadSuggestion({
      evidence: stalled,
      sessions: sessionRun(6, 1, { intensity: 8 }),
      today: TODAY,
      decisions: [dismissal(TODAY)],
    })

    expect(suggestion?.scope).toBe('session')
  })

  it('suppresses everything while an applied deload is running', () => {
    const applied: DeloadDecision = {
      key: 'session',
      trigger: 'D4',
      decision: 'applied',
      date: daysAgo(2),
    }

    expect(
      deloadSuggestion({
        evidence: stalled,
        sessions: [],
        today: TODAY,
        decisions: [applied],
      }),
    ).toBeNull()
  })

  it('ends an applied deload at three sessions or seven days, whichever comes first', () => {
    const applied = (date: string): DeloadDecision => ({
      key: 'session',
      trigger: 'D4',
      decision: 'applied',
      date,
    })

    // Three sessions since, on the second day of a deload: spent by sessions.
    expect(
      suppression('movement:back-squat', [applied(daysAgo(4))], sessionRun(3, 1), TODAY),
    ).toBeNull()
    // Seven days, and not one session logged: spent by the calendar.
    expect(
      suppression('movement:back-squat', [applied(daysAgo(DELOAD_DAYS))], [], TODAY),
    ).toBeNull()
    // Neither yet.
    expect(
      suppression('movement:back-squat', [applied(daysAgo(4))], sessionRun(2, 1), TODAY),
    ).not.toBeNull()
  })
})

describe('what Apply does', () => {
  it('clamps the intensity to the deload ceiling and never raises it', () => {
    expect(clampedIntensity(9)).toBe(DELOAD_INTENSITY_MAX)
    expect(clampedIntensity(3)).toBe(3)
  })

  it('asks once before a hard intensity on a flagged day, and never otherwise', () => {
    expect(confirmsHardIntensity(8, true)).toBe(true)
    expect(confirmsHardIntensity(7, true)).toBe(false)
    expect(confirmsHardIntensity(10, false)).toBe(false)
  })
})
