/**
 * OVR-01a — the anchor arithmetic, one assertion per rule in §1.
 *
 * These are the tests the requirement asks for by name: the derivation is a set
 * of pure functions, so every branch — the clamp, the skipped measurement, the
 * unit conversion, the smoothing, the confidence ladder — is checked here
 * rather than inferred from a screen. What SQL excludes (warmups, deloads,
 * active recovery, bodyweight) is asserted against the migration in
 * `src/test/load-anchors-migration.test.ts`; nothing in this file can see a row
 * that function would not have returned.
 */
import { describe, expect, it } from 'vitest'

import type { AnchorEvidenceRow } from './schemas'
import {
  confidenceOf,
  convertWeight,
  deriveAnchors,
  e1rmCandidate,
  effectiveReps,
  LB_PER_KG,
  repCompletion,
  sessionAnchors,
} from './anchors'

const SESSION = 'c0000001-0000-4000-8000-000000000000'

/** One working set of evidence, as `anchor_evidence` would answer it. */
function set(overrides: Partial<AnchorEvidenceRow> = {}): AnchorEvidenceRow {
  return {
    session_id: SESSION,
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

/** A session's worth of identical sets, at a given date and session id. */
function session(
  id: string,
  date: string,
  sets: readonly Partial<AnchorEvidenceRow>[],
): AnchorEvidenceRow[] {
  return sets.map((overrides, index) =>
    set({
      session_id: id,
      session_date: date,
      logged_at: `${date}T10:0${index}:00.000Z`,
      set_number: index + 1,
      ...overrides,
    }),
  )
}

describe('units (OVR-01a)', () => {
  it('converts kilograms to pounds and back without drifting', () => {
    expect(convertWeight(100, 'kg', 'lb')).toBeCloseTo(220.462, 3)
    expect(convertWeight(220.462, 'lb', 'kg')).toBeCloseTo(100, 3)
    expect(convertWeight(100, 'kg', 'lb')).toBe(100 * LB_PER_KG)
  })

  it('leaves a weight alone when the units already agree', () => {
    expect(convertWeight(142.5, 'lb', 'lb')).toBe(142.5)
    expect(convertWeight(60, 'kg', 'kg')).toBe(60)
  })

  it('expresses the anchor in the unit of the most recent working set', () => {
    // Pounds in July, kilograms in September: the anchor is in kilograms,
    // because that is what the user is logging now.
    const evidence = [
      ...session('s-1', '2026-07-01', [{ weight: 220, weight_unit: 'lb', rpe: 8, actual_reps: 5 }]),
      ...session('s-2', '2026-09-01', [{ weight: 100, weight_unit: 'kg', rpe: 8, actual_reps: 5 }]),
    ]

    const [anchor] = deriveAnchors(evidence)

    expect(anchor.unit).toBe('kg')
    // 100 kg at 5 reps, RPE 8 → 7 effective reps → 123.33 kg, weighted 0.5
    // against July's 220 lb → 99.79 kg, weighted 0.3.
    expect(anchor.anchor_value).toBeCloseTo(
      (0.5 * (100 * (1 + 7 / 30)) + 0.3 * ((220 / LB_PER_KG) * (1 + 7 / 30))) / 0.8,
      2,
    )
  })

  it('never lets the older unit win a comparison', () => {
    // 200 kg in July is far heavier than 150 lb in September. Compared as bare
    // numbers, July loses; converted, it does not.
    const evidence = [
      ...session('s-1', '2026-07-01', [{ weight: 200, weight_unit: 'kg' }]),
      ...session('s-2', '2026-09-01', [{ weight: 150, weight_unit: 'lb' }]),
    ]

    const [july, september] = sessionAnchors(evidence)

    expect(july.unit).toBe('lb')
    expect(september.unit).toBe('lb')
    expect(july.value).toBeGreaterThan(september.value)
  })
})

describe('the e1RM candidate (OVR-01a §1)', () => {
  it('adds reps in reserve to reps performed', () => {
    expect(effectiveReps(5, 8)).toEqual({ value: 7, clamped: false })
    expect(effectiveReps(3, 10)).toEqual({ value: 3, clamped: false })
  })

  it('clamps effective reps at twelve and says that it did', () => {
    expect(effectiveReps(15, 9)).toEqual({ value: 12, clamped: true })
    expect(effectiveReps(12, 10)).toEqual({ value: 12, clamped: false })
  })

  it('is Epley over the effective reps', () => {
    expect(e1rmCandidate({ weight: 100, rpe: 8, actual_reps: 5 })).toEqual({
      value: 100 * (1 + 7 / 30),
      clamped: false,
    })
  })

  it('skips a set with no RPE, no weight or no recorded reps', () => {
    expect(e1rmCandidate({ weight: 100, rpe: null, actual_reps: 5 })).toBeNull()
    expect(e1rmCandidate({ weight: null, rpe: 8, actual_reps: 5 })).toBeNull()
    expect(e1rmCandidate({ weight: 100, rpe: 8, actual_reps: null })).toBeNull()
  })

  it('refuses a zero weight rather than answering zero', () => {
    expect(e1rmCandidate({ weight: 0, rpe: 8, actual_reps: 5 })).toBeNull()
  })

  it('takes the highest candidate in the session, not the last one', () => {
    const [anchor] = sessionAnchors(
      session('s-1', '2026-09-01', [
        { weight: 100, rpe: 8, actual_reps: 5 },
        { weight: 120, rpe: 9, actual_reps: 5 },
        { weight: 110, rpe: 10, actual_reps: 3 },
      ]),
    )

    expect(anchor.value).toBe(120 * (1 + 6 / 30))
  })

  it('still counts a set that needed the clamp', () => {
    const [anchor] = sessionAnchors(
      session('s-1', '2026-09-01', [{ weight: 100, rpe: 6, actual_reps: 20 }]),
    )

    expect(anchor.value).toBe(100 * (1 + 12 / 30))
    expect(anchor.clamped).toBe(true)
  })

  it('produces no session anchor when nothing in it can be measured', () => {
    expect(
      sessionAnchors(session('s-1', '2026-09-01', [{ rpe: null }, { weight: null }])),
    ).toEqual([])
  })
})

describe('rep completion is computed, not parsed (OVR-01a)', () => {
  it('divides reps performed by the target the prescription carried', () => {
    expect(
      repCompletion(
        session('s-1', '2026-09-01', [
          { actual_reps: 8, prescribed_reps: 8 },
          { actual_reps: 8, prescribed_reps: 8 },
          { actual_reps: 6, prescribed_reps: 8 },
        ]),
      ),
    ).toBeCloseTo(22 / 24, 6)
  })

  it('counts a set the anchor math skipped: no RPE is still work performed', () => {
    const sets = session('s-1', '2026-09-01', [
      { actual_reps: 5, prescribed_reps: 5, rpe: 8 },
      { actual_reps: 5, prescribed_reps: 5, rpe: null },
    ])

    expect(repCompletion(sets)).toBe(1)
    expect(sessionAnchors(sets)[0].repCompletion).toBe(1)
  })

  it('leaves a set with nothing recorded out of both halves', () => {
    expect(
      repCompletion(
        session('s-1', '2026-09-01', [
          { actual_reps: 5, prescribed_reps: 5 },
          { actual_reps: null, prescribed_reps: 5 },
        ]),
      ),
    ).toBe(1)
  })

  it('answers null — not zero — when nothing carried a target', () => {
    expect(
      repCompletion(session('s-1', '2026-09-01', [{ prescribed_reps: null }])),
    ).toBeNull()
  })

  it('reads a zero as the failed attempt it is', () => {
    expect(
      repCompletion(
        session('s-1', '2026-09-01', [
          { actual_reps: 0, prescribed_reps: 5 },
          { actual_reps: 5, prescribed_reps: 5 },
        ]),
      ),
    ).toBe(0.5)
  })
})

describe('confidence (OVR-01a, §5 ladder)', () => {
  it('rises with the number of sessions behind the number', () => {
    expect(confidenceOf(1)).toBe('low')
    expect(confidenceOf(2)).toBe('medium')
    expect(confidenceOf(3)).toBe('high')
    expect(confidenceOf(12)).toBe('high')
  })

  it('drops one level when the evidence needed the clamp', () => {
    expect(confidenceOf(3, true)).toBe('medium')
    expect(confidenceOf(2, true)).toBe('low')
    expect(confidenceOf(1, true)).toBe('low')
  })
})

describe('deriving the stored anchors (OVR-01a)', () => {
  const history = [
    ...session('s-1', '2026-09-01', [{ weight: 100 }]),
    ...session('s-2', '2026-09-08', [{ weight: 105 }]),
    ...session('s-3', '2026-09-15', [{ weight: 110 }]),
    ...session('s-4', '2026-09-22', [{ weight: 115 }]),
  ]

  it('weights the last three sessions 0.5 / 0.3 / 0.2, most recent first', () => {
    const [anchor] = deriveAnchors(history)
    const e1rm = (weight: number) => weight * (1 + 7 / 30)

    expect(anchor.anchor_value).toBeCloseTo(
      0.5 * e1rm(115) + 0.3 * e1rm(110) + 0.2 * e1rm(105),
      2,
    )
    // The fourth session is behind the window, but it still happened.
    expect(anchor.session_count).toBe(4)
    expect(anchor.last_session_date).toBe('2026-09-22')
    expect(anchor.confidence).toBe('high')
  })

  it('renormalises the weights when fewer than three sessions exist', () => {
    const [anchor] = deriveAnchors(history.slice(0, 2))
    const e1rm = (weight: number) => weight * (1 + 7 / 30)

    expect(anchor.anchor_value).toBeCloseTo((0.5 * e1rm(105) + 0.3 * e1rm(100)) / 0.8, 2)
    expect(anchor.confidence).toBe('medium')
  })

  it('keeps one anchor per exercise and equipment, never per exercise', () => {
    const anchors = deriveAnchors([
      ...session('s-1', '2026-09-01', [{ equipment_used: 'barbell', weight: 200 }]),
      ...session('s-2', '2026-09-02', [{ equipment_used: 'dumbbell', weight: 70 }]),
    ])

    expect(anchors.map((anchor) => anchor.equipment_used)).toEqual(['barbell', 'dumbbell'])
    expect(anchors.every((anchor) => anchor.exercise_id === 'back-squat')).toBe(true)
  })

  it('writes no anchor for an exercise whose evidence measures nothing', () => {
    expect(
      deriveAnchors(session('s-1', '2026-09-01', [{ weight: null, rpe: null }])),
    ).toEqual([])
  })

  it('is idempotent: the same history derives the same anchors', () => {
    expect(deriveAnchors(history)).toEqual(deriveAnchors(history))
  })

  it('does not depend on the order the evidence arrives in', () => {
    const shuffled = [...history].reverse()

    expect(deriveAnchors(shuffled)).toEqual(deriveAnchors(history))
  })

  it('rounds to two places, so two runs agree in text and not only in value', () => {
    const [anchor] = deriveAnchors(session('s-1', '2026-09-01', [{ weight: 102.3, rpe: 7.5 }]))

    expect(anchor.anchor_value).toBe(
      Math.round(102.3 * (1 + 7.5 / 30) * 100) / 100,
    )
  })
})
