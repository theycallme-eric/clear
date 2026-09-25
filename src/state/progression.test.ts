/**
 * OVR-01b — one test per row of §2's table, and one per band of §5's ladder.
 *
 * The requirement asks for this file by name: *every row of the RPE rule table
 * has a unit test, and the table in the spec and the tests are the same list*.
 * Two mechanisms hold that claim up rather than a reviewer's memory —
 *
 *   · `covers(id)` records which row a test exercised, and the last test in the
 *     rule-table block asserts the recorded set is exactly `RULE_TABLE`'s. A
 *     row added without a test fails here, and so does a test for a row that no
 *     longer exists.
 *   · the parity test reads §2's markdown table out of the spec and compares
 *     its "Last session read" cells to the rows' `read` strings. A row whose
 *     prose drifts from the spec fails, which is the only way "the same list"
 *     can be checked by a machine.
 *
 * Everything else here is arithmetic with no database in it: each function is
 * handed rows, dates and numbers, and the suite never constructs a client.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ACTIVE_RECOVERY_RPE_CAP,
  applyLoadStep,
  clampToRecentMax,
  EQUIPMENT_INCREMENTS,
  incrementFor,
  invertAnchor,
  KETTLEBELL_LADDER,
  progressionStep,
  RULE_TABLE,
  ruleFor,
  SAFETY_CLAMP,
  type LoadSuggestion,
  type ProgressionContext,
  type ProgressionRuleId,
  type SuggestionInput,
  sessionRead,
  snapLoad,
  sparsePolicy,
  stalenessOf,
  suggestLoad,
  weeksBetween,
} from './progression'
import type { AnchorEvidenceRow } from './schemas'

const SESSION = 'c0000001-0000-4000-8000-000000000000'
const TODAY = '2026-09-24'

/** One working set of evidence, as `anchor_evidence` would answer it. */
function set(overrides: Partial<AnchorEvidenceRow> = {}): AnchorEvidenceRow {
  return {
    session_id: SESSION,
    session_date: '2026-09-20',
    logged_at: '2026-09-20T10:00:00.000Z',
    exercise_id: 'back-squat',
    equipment_used: 'barbell',
    set_number: 1,
    actual_reps: 5,
    prescribed_reps: 5,
    weight: 225,
    weight_unit: 'lb',
    rpe: 8,
    ...overrides,
  }
}

/** A session's working sets, numbered in the order they are given. */
function sets(...overrides: readonly Partial<AnchorEvidenceRow>[]): AnchorEvidenceRow[] {
  return overrides.map((override, index) => set({ set_number: index + 1, ...override }))
}

/**
 * The read of a session described as `[rpe, reps done, reps prescribed]`, where
 * `null` in any position is a measurement the set did not record.
 */
function read(...rows: readonly [number | null, (number | null)?, (number | null)?][]) {
  return sessionRead(
    sets(
      ...rows.map(([rpe, done = 5, prescribed = 5]) => ({
        rpe,
        actual_reps: done,
        prescribed_reps: prescribed,
      })),
    ),
  )
}

const STRENGTH: ProgressionContext = { goal: 'strength', region: 'upper', sessionCount: 4 }

/** Which rows the suite has exercised. Asserted against `RULE_TABLE` below. */
const covered = new Set<ProgressionRuleId>()

function covers(id: ProgressionRuleId): ProgressionRuleId {
  covered.add(id)
  return id
}

// ─────────────────────────────────────────────────────────────────────────────
// The read (§2)
// ─────────────────────────────────────────────────────────────────────────────

describe('session read (OVR-01b §2)', () => {
  it('takes the median RPE, not the mean — one grinder does not drag the read', () => {
    // Mean is 8.0; median is 7. The fifth set is the grinder §2 names.
    expect(read([7], [7], [7], [7], [10]).medianRpe).toBe(7)
  })

  it('averages the middle two when the set count is even', () => {
    expect(read([7], [8]).medianRpe).toBe(7.5)
  })

  it('ignores a set that recorded no RPE without dropping it from the session', () => {
    const answer = read([null], [8], [8])

    expect(answer.medianRpe).toBe(8)
    expect(answer.workingSets).toBe(3)
  })

  it('answers null for a session that recorded no RPE at all', () => {
    expect(read([null], [null]).medianRpe).toBeNull()
  })

  it('reads the first set from the lowest set number, not the array order', () => {
    const answer = sessionRead([
      set({ set_number: 3, rpe: 10 }),
      set({ set_number: 1, rpe: 6 }),
      set({ set_number: 2, rpe: 8 }),
    ])

    expect(answer.firstSetRpe).toBe(6)
  })

  it('counts rep completion over the sets that recorded both halves', () => {
    const answer = read([8, 5, 5], [8, 4, 5], [8, 5, null])

    expect(answer.repCompletion).toBeCloseTo(9 / 10, 10)
    expect(answer.setsWithTarget).toBe(2)
    expect(answer.setsUnderTarget).toBe(1)
  })

  it('answers null rep completion when nothing recorded a target — absence is not zero', () => {
    const answer = read([8, 5, null], [8, 5, null])

    expect(answer.repCompletion).toBeNull()
    expect(answer.allRepsCompleted).toBe(false)
  })

  it('judges completion per set, so a surplus cannot pay for a miss', () => {
    // 12 of 12 in aggregate, and a set that came in under target anyway.
    const answer = read([8, 8, 6], [8, 4, 6])

    expect(answer.repCompletion).toBe(1)
    expect(answer.allRepsCompleted).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The table (§2) — one test per row
// ─────────────────────────────────────────────────────────────────────────────

describe('RPE rule table (OVR-01b §2)', () => {
  it('row: RPE ≤ 6, all reps completed → too light, +5–10%', () => {
    const rule = ruleFor(read([6], [6], [5.5]))

    expect(rule?.id).toBe(covers('too-light'))
    expect(rule?.load).toEqual({ kind: 'percent', direction: 'up', upper: 0.05, lower: 0.1 })
    expect(rule?.repDelta).toBe(2)
  })

  it('row: RPE 6.5–7, all reps completed → slightly light, +one increment', () => {
    expect(ruleFor(read([6.5], [6.5], [7]))?.id).toBe(covers('slightly-light'))
    expect(ruleFor(read([7], [7]))?.load).toEqual({
      kind: 'increment',
      direction: 'up',
      count: 1,
    })
    expect(ruleFor(read([7], [7]))?.repDelta).toBe(1)
  })

  it('row: RPE 7.5–8.5, all reps completed → on target, +one increment', () => {
    expect(ruleFor(read([7.5], [7.5]))?.id).toBe(covers('on-target'))
    expect(ruleFor(read([8.5], [8.5], [8.5]))?.id).toBe('on-target')
    expect(ruleFor(read([8], [8]))?.load).toEqual({ kind: 'increment', direction: 'up', count: 1 })
  })

  it('row: RPE 9–9.5, all reps completed → on target for heavy work, hold load', () => {
    // Ramping RPE: the first set is under 9, so the overshoot row above does
    // not claim this read.
    const rule = ruleFor(read([8.5], [9], [9.5]))

    expect(rule?.id).toBe(covers('on-target-heavy'))
    expect(rule?.load).toEqual({ kind: 'hold' })
    expect(rule?.repDelta).toBe(1)
  })

  it('row: RPE 10, all reps completed → at the ceiling, repeat exact load', () => {
    const rule = ruleFor(read([8], [10], [10], [10]))

    expect(rule?.id).toBe(covers('ceiling'))
    expect(rule?.load).toEqual({ kind: 'hold' })
    expect(rule?.repDelta).toBe(0)
  })

  it('row: RPE 10, reps missed → overshoot, −5–10%', () => {
    const rule = ruleFor(read([10, 5, 5], [10, 3, 5]))

    expect(rule?.id).toBe(covers('overshoot-ceiling'))
    expect(rule?.load).toEqual({ kind: 'percent', direction: 'down', upper: 0.05, lower: 0.1 })
  })

  it('row: any RPE, ≥1 rep missed on ≥half the sets → overshoot, −5%', () => {
    const rule = ruleFor(read([7, 5, 5], [7, 4, 5], [8, 4, 5], [8, 5, 5]))

    expect(rule?.id).toBe(covers('overshoot-missed-reps'))
    expect(rule?.load).toEqual({ kind: 'percent', direction: 'down', upper: 0.05, lower: 0.05 })
  })

  it('row: first set already RPE ≥ 9 → load wrong for set count, −5%, hold reps', () => {
    // Median is 8 and every rep was completed: only the first set says so.
    const rule = ruleFor(read([9], [7], [8]))

    expect(rule?.id).toBe(covers('overshoot-first-set'))
    expect(rule?.load).toEqual({ kind: 'percent', direction: 'down', upper: 0.05, lower: 0.05 })
    expect(rule?.holdsRepTarget).toBe(true)
  })

  it('has a test for every row, and no test for a row that is not there', () => {
    expect([...covered].sort()).toEqual(RULE_TABLE.map((rule) => rule.id).sort())
  })
})

describe('rule table precedence (OVR-01b §2)', () => {
  it('reads a missed rep at RPE 10 as the harsher row, not as the first-set row', () => {
    // Both rows match — the first set is a 10 — and the harsher one wins.
    expect(ruleFor(read([10, 5, 5], [10, 2, 5]))?.id).toBe('overshoot-ceiling')
  })

  it('treats a first set at RPE 9 as overshoot regardless of the median', () => {
    // Median 7.5, every rep completed: without §2's first-set clause this would
    // read as "slightly light" and add load to a session that started maximal.
    expect(ruleFor(read([9], [6], [7], [8]))?.id).toBe('overshoot-first-set')
  })

  it('fires no row when the session says nothing about the load', () => {
    expect(ruleFor(read([null], [null]))).toBeNull()
  })

  it('fires no row for a median that lands between two bands', () => {
    // 7.25 is in neither 6.5–7 nor 7.5–8.5. Holding is the honest answer.
    expect(read([7], [7.5]).medianRpe).toBe(7.25)
    expect(ruleFor(read([7], [7.5]))).toBeNull()
  })

  it('fires no upward row while a rep is missing, however light it felt', () => {
    // One miss in four sets: below §2's half-the-sets threshold, and still not
    // "all reps completed".
    expect(ruleFor(read([6, 5, 5], [6, 4, 5], [6, 5, 5], [6, 5, 5]))).toBeNull()
  })
})

describe('rule table parity with the spec (OVR-01b §2)', () => {
  it('lists exactly the reads §2 lists, in the spec’s words', () => {
    const spec = readFileSync(
      resolve(import.meta.dirname, '../../docs/specs/OVR-01_progressive-overload.md'),
      'utf-8',
    )
    const table = spec.slice(spec.indexOf('| Last session read |'))
    const rows = table
      .slice(0, table.indexOf('\n\n'))
      .split('\n')
      .slice(2)
      .map((row) => row.split('|')[1].trim())

    expect(rows).toHaveLength(RULE_TABLE.length)
    expect([...rows].sort()).toEqual(RULE_TABLE.map((rule) => rule.read).sort())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Goal modulation (§2)
// ─────────────────────────────────────────────────────────────────────────────

describe('goal modulation (OVR-01b §2)', () => {
  const onTarget = read([8], [8], [8])

  it('progresses strength by load', () => {
    const step = progressionStep(onTarget, STRENGTH)

    expect(step.load).toEqual({ kind: 'increment', direction: 'up', count: 1 })
    expect(step.repDelta).toBe(0)
    expect(step.reason).toBe('RPE 7.5–8.5, all reps completed → +1 increment')
  })

  it('progresses hypertrophy by reps, holding the load', () => {
    const step = progressionStep(onTarget, { ...STRENGTH, goal: 'hypertrophy' })

    expect(step.load).toEqual({ kind: 'hold' })
    expect(step.repDelta).toBe(1)
    expect(step.reason).toBe('RPE 7.5–8.5, all reps completed → +1 rep')
  })

  it('progresses a balanced session by load on the primary and reps on accessories', () => {
    const balanced: ProgressionContext = { ...STRENGTH, goal: 'balanced' }

    expect(progressionStep(onTarget, { ...balanced, role: 'primary' }).repDelta).toBe(0)
    expect(progressionStep(onTarget, { ...balanced, role: 'accessory' }).repDelta).toBe(1)
  })

  it('leaves conditioning to density rather than load', () => {
    const step = progressionStep(onTarget, { ...STRENGTH, goal: 'conditioning' })

    expect(step.load).toEqual({ kind: 'hold' })
    expect(step.repDelta).toBe(0)
  })

  it('does not progress active recovery at all', () => {
    const step = progressionStep(onTarget, { ...STRENGTH, goal: 'active_recovery' })

    expect(step).toMatchObject({ rule: null, load: { kind: 'hold' }, repDelta: 0 })
  })

  it('uses the rep lever for a strength session when the row offers no load step', () => {
    // RPE 9–9.5 holds the load for every goal; a rep is the only move left.
    const step = progressionStep(read([8.5], [9], [9.5]), STRENGTH)

    expect(step.load).toEqual({ kind: 'hold' })
    expect(step.repDelta).toBe(1)
  })

  it('backs off by load whatever the goal prefers', () => {
    const step = progressionStep(read([9], [7], [8]), { ...STRENGTH, goal: 'hypertrophy' })

    expect(step.load).toEqual({ kind: 'percent', direction: 'down', upper: 0.05, lower: 0.05 })
    expect(step.repDelta).toBe(0)
  })

  it('sizes the percentage by region: upper body 5%, lower body 10%', () => {
    const tooLight = read([6], [6])

    expect(applyLoadStep(200, progressionStep(tooLight, STRENGTH).load, 'upper', 5)).toBeCloseTo(
      210,
      10,
    )
    const lower = progressionStep(tooLight, { ...STRENGTH, region: 'lower' })

    expect(applyLoadStep(200, lower.load, 'lower', 5)).toBeCloseTo(220, 10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Sparse history (§5)
// ─────────────────────────────────────────────────────────────────────────────

describe('session-count ladder (OVR-01b §5)', () => {
  it('names the four tiers: 0 answers nothing, 1 low, 2 medium, 3+ high', () => {
    expect(sparsePolicy(0)).toEqual({ confidence: 'none', stepScale: 0, progresses: false })
    expect(sparsePolicy(1)).toEqual({ confidence: 'low', stepScale: 0, progresses: false })
    expect(sparsePolicy(2)).toEqual({ confidence: 'medium', stepScale: 0.5, progresses: true })
    expect(sparsePolicy(3).confidence).toBe('high')
    expect(sparsePolicy(9)).toEqual(sparsePolicy(3))
  })

  it('holds the load after one session — a point cannot tell a good day from a bad one', () => {
    const step = progressionStep(read([8], [8]), { ...STRENGTH, sessionCount: 1 })

    expect(step.load).toEqual({ kind: 'hold' })
    expect(step.reason).toBe('RPE 7.5–8.5, all reps completed, 1 session → hold load')
  })

  it('allows one increment after one session when the read was RPE ≤ 6 with all reps', () => {
    const step = progressionStep(read([6], [6]), { ...STRENGTH, sessionCount: 1 })

    expect(step.load).toEqual({ kind: 'increment', direction: 'up', count: 1 })
  })

  it('halves the percentage after two sessions', () => {
    const step = progressionStep(read([6], [6]), { ...STRENGTH, sessionCount: 2 })

    expect(step.load).toEqual({ kind: 'percent', direction: 'up', upper: 0.025, lower: 0.05 })
  })

  it('leaves an increment whole after two sessions — a plate does not halve', () => {
    const step = progressionStep(read([8], [8]), { ...STRENGTH, sessionCount: 2 })

    expect(step.load).toEqual({ kind: 'increment', direction: 'up', count: 1 })
  })

  it('backs off in full after one session — an overshoot needs no second opinion', () => {
    const step = progressionStep(read([9], [7], [8]), { ...STRENGTH, sessionCount: 1 })

    expect(step.load).toEqual({ kind: 'percent', direction: 'down', upper: 0.05, lower: 0.05 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Stale history (§5)
// ─────────────────────────────────────────────────────────────────────────────

describe('staleness decay (OVR-01b §5)', () => {
  it('does not decay inside three weeks', () => {
    expect(stalenessOf(0)).toMatchObject({ tier: 'fresh', factor: 1, rpeCap: null })
    expect(stalenessOf(2.9).tier).toBe('fresh')
  })

  it('decays to 95% and caps RPE at 8 from three weeks', () => {
    expect(stalenessOf(3)).toMatchObject({ tier: 're_entry', factor: 0.95, rpeCap: 8 })
    expect(stalenessOf(5.9).tier).toBe('re_entry')
  })

  it('decays to 90%, caps RPE at 7 and rewrites the anchor from six weeks', () => {
    expect(stalenessOf(6)).toMatchObject({
      tier: 'recalibration',
      factor: 0.9,
      rpeCap: 7,
      rewrites: true,
    })
    expect(stalenessOf(12).tier).toBe('recalibration')
  })

  it('discards the anchor past twelve weeks rather than trusting it quietly', () => {
    expect(stalenessOf(12.1)).toMatchObject({ tier: 'discarded', factor: 0 })
    expect(stalenessOf(52).tier).toBe('discarded')
  })

  it('counts weeks between two calendar dates', () => {
    expect(weeksBetween('2026-09-10', '2026-09-24')).toBe(2)
    expect(weeksBetween('2026-06-24', '2026-09-24')).toBeCloseTo(13.14, 2)
    // A session dated after today is not decay; it is a clock.
    expect(stalenessOf(weeksBetween('2026-09-25', TODAY)).tier).toBe('fresh')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Equipment increments and the inverted anchor (§1, §"Data needed")
// ─────────────────────────────────────────────────────────────────────────────

describe('equipment increments (OVR-01b)', () => {
  it('names the increments the spec names', () => {
    expect(EQUIPMENT_INCREMENTS.barbell).toEqual({ lb: 5, kg: 2.5 })
    expect(EQUIPMENT_INCREMENTS.dumbbells).toEqual({ lb: 5, kg: 2 })
    expect(incrementFor('cable_machine', 'lb')).toBe(10)
    expect(incrementFor('cable_machine', 'kg')).toBe(5)
  })

  it('answers null for an implement that carries no external load', () => {
    expect(incrementFor('bodyweight', 'lb')).toBeNull()
    expect(incrementFor('pullup_bar', 'kg')).toBeNull()
  })

  it('falls back to the barbell step for an implement it does not know', () => {
    expect(incrementFor('trap-bar', 'lb')).toBe(5)
    expect(incrementFor('trap-bar', 'kg')).toBe(2.5)
  })

  it('rounds a load to the increment', () => {
    expect(snapLoad(243.2, 'barbell', 'lb')).toBe(245)
    expect(snapLoad(61.4, 'barbell', 'kg')).toBe(62.5)
    expect(snapLoad(-10, 'barbell', 'lb')).toBe(0)
  })

  it('snaps a kettlebell to a bell that exists, not to an increment', () => {
    expect(snapLoad(23, 'kettlebells', 'kg')).toBe(24)
    expect(snapLoad(23, 'kettlebells', 'kg', 'down')).toBe(20)
    expect(snapLoad(3, 'kettlebells', 'kg', 'down')).toBe(KETTLEBELL_LADDER.kg[0])
    expect(snapLoad(50, 'kettlebells', 'lb')).toBe(53)
  })

  it('leaves an unloaded implement untouched', () => {
    expect(snapLoad(142.4, 'bodyweight', 'lb')).toBe(142.4)
  })

  it('inverts the anchor at the prescribed reps and RIR', () => {
    expect(invertAnchor(300, 5, 2)).toBeCloseTo(300 / (1 + 7 / 30), 10)
    expect(invertAnchor(300, 1, 0)).toBeCloseTo(300 / (1 + 1 / 30), 10)
  })
})

describe('the 110% safety clamp (OVR-01b §1)', () => {
  it('caps a suggestion at 110% of the heaviest logged set in the window', () => {
    expect(clampToRecentMax(300, 200, 'barbell', 'lb')).toEqual({ weight: 220, clamped: true })
    expect(SAFETY_CLAMP).toBe(1.1)
  })

  it('snaps the ceiling down, so making it liftable cannot raise it', () => {
    // 110% of 205 is 225.5; the nearest plate above is 225, and never 227.5.
    expect(clampToRecentMax(400, 205, 'barbell', 'lb').weight).toBe(225)
  })

  it('leaves a suggestion under the ceiling alone', () => {
    expect(clampToRecentMax(200, 205, 'barbell', 'lb')).toEqual({ weight: 200, clamped: false })
  })

  it('does not clamp when nothing has been logged in the window', () => {
    expect(clampToRecentMax(200, null, 'barbell', 'lb')).toEqual({ weight: 200, clamped: false })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The suggestion end to end
// ─────────────────────────────────────────────────────────────────────────────

/** A suggestion input with a four-session barbell anchor behind it. */
function input(overrides: Partial<SuggestionInput> = {}): SuggestionInput {
  return {
    anchor: { value: 300, unit: 'lb', sessionCount: 4, lastSessionDate: '2026-09-20' },
    today: TODAY,
    equipment: 'barbell',
    targetReps: 5,
    targetRir: 2,
    goal: 'strength',
    region: 'lower',
    lastSession: read([8], [8], [8]),
    ...overrides,
  }
}

/** Every suggestion, whatever else it says, says how much history it rests on. */
function qualified(suggestion: LoadSuggestion): boolean {
  return (
    ['none', 'low', 'medium', 'high'].includes(suggestion.confidence) &&
    typeof suggestion.sessionCount === 'number' &&
    typeof suggestion.reason === 'string' &&
    suggestion.reason.length > 0
  )
}

describe('suggested weight (OVR-01b §1, §2, §5)', () => {
  it('inverts the anchor, steps it, rounds to the increment and clamps', () => {
    const suggestion = suggestLoad(input({ recentMax: { value: 250, unit: 'lb' } }))

    // 300 ÷ (1 + 7/30) = 243.24 → +5 lb → 248.24 → 250 lb, under the 275 ceiling.
    expect(suggestion.weight).toBe(250)
    expect(suggestion.rule).toBe('on-target')
    expect(suggestion.confidence).toBe('high')
    expect(suggestion.sessionCount).toBe(4)
    expect(suggestion.clamped).toBe(false)
  })

  it('clamps to 110% of the eight-week logged max and says it did', () => {
    const suggestion = suggestLoad(input({ recentMax: { value: 185, unit: 'lb' } }))

    expect(suggestion.weight).toBe(200)
    expect(suggestion.clamped).toBe(true)
    expect(suggestion.reason).toContain('clamped to 110% of the 8-week max')
  })

  it('converts the logged max into the anchor’s unit before clamping', () => {
    const suggestion = suggestLoad(
      input({
        anchor: { value: 140, unit: 'kg', sessionCount: 4, lastSessionDate: '2026-09-20' },
        recentMax: { value: 185, unit: 'lb' },
      }),
    )

    // 185 lb is 83.9 kg; 110% of that is 92.3 kg, floored to the plate below.
    expect(suggestion.weight).toBe(90)
    expect(suggestion.clamped).toBe(true)
    expect(suggestion.unit).toBe('kg')
  })

  it('forces one increment when rounding would erase an upward step', () => {
    // 60 ÷ (1 + 7/30) = 48.65, and 5% of that is less than half a plate: both
    // the base and the stepped weight round to 50, so §2 forces the increment.
    const suggestion = suggestLoad(
      input({
        anchor: { value: 60, unit: 'lb', sessionCount: 4, lastSessionDate: '2026-09-20' },
        lastSession: read([6], [6], [6]),
        region: 'upper',
      }),
    )

    expect(suggestion.rule).toBe('too-light')
    expect(suggestion.weight).toBe(55)
  })

  it('backs a suggestion off when the last session overshot', () => {
    const suggestion = suggestLoad(input({ lastSession: read([10, 5, 5], [10, 3, 5]) }))

    // 243.24 − 10% = 218.9 → 220 lb.
    expect(suggestion.rule).toBe('overshoot-ceiling')
    expect(suggestion.weight).toBe(220)
  })

  it('suggests nothing at all with no history, and says so', () => {
    const suggestion = suggestLoad(input({ anchor: null, lastSession: null }))

    expect(suggestion.weight).toBeNull()
    expect(suggestion.confidence).toBe('none')
    expect(suggestion.sessionCount).toBe(0)
    expect(suggestion.reason).toBe('no logged history → no weight suggested')
  })

  it('discards an anchor older than twelve weeks instead of decaying it', () => {
    const suggestion = suggestLoad(
      input({
        anchor: { value: 300, unit: 'lb', sessionCount: 6, lastSessionDate: '2026-06-01' },
      }),
    )

    expect(suggestion.staleness).toBe('discarded')
    expect(suggestion.weight).toBeNull()
    expect(suggestion.confidence).toBe('none')
  })

  it('decays a three-to-six-week anchor by 5% and caps the session at RPE 8', () => {
    const suggestion = suggestLoad(
      input({
        anchor: { value: 300, unit: 'lb', sessionCount: 6, lastSessionDate: '2026-08-27' },
        lastSession: null,
      }),
    )

    // 300 × 0.95 = 285 → ÷ 1.2333 = 231.1 → 230 lb, with no rule to step it.
    expect(suggestion.staleness).toBe('re_entry')
    expect(suggestion.weight).toBe(230)
    expect(suggestion.rpeCap).toBe(8)
  })

  it('decays a six-to-twelve-week anchor by 10% and caps the session at RPE 7', () => {
    const suggestion = suggestLoad(
      input({
        anchor: { value: 300, unit: 'lb', sessionCount: 6, lastSessionDate: '2026-08-01' },
        lastSession: null,
      }),
    )

    // 300 × 0.90 = 270 → ÷ 1.2333 = 218.9 → 220 lb.
    expect(suggestion.staleness).toBe('recalibration')
    expect(suggestion.weight).toBe(220)
    expect(suggestion.rpeCap).toBe(7)
  })

  it('caps an active-recovery suggestion at 60% of the anchor, RPE 5', () => {
    const suggestion = suggestLoad(input({ goal: 'active_recovery' }))

    expect(suggestion.weight).toBe(180)
    expect(suggestion.rpeCap).toBe(ACTIVE_RECOVERY_RPE_CAP)
    expect(suggestion.rule).toBeNull()
  })

  it('suggests reps rather than a load for a bodyweight movement', () => {
    const suggestion = suggestLoad(input({ equipment: 'bodyweight' }))

    expect(suggestion.weight).toBeNull()
    expect(suggestion.confidence).toBe('high')
    expect(suggestion.reason).toBe('bodyweight movement → progress by reps, not load')
  })

  it('carries a rep delta instead of a load step for a hypertrophy session', () => {
    const suggestion = suggestLoad(input({ goal: 'hypertrophy' }))

    expect(suggestion.repDelta).toBe(1)
    // The load holds at the inverted anchor: 243.24 → 245 lb.
    expect(suggestion.weight).toBe(245)
  })

  it('never returns a number without the confidence that qualifies it', () => {
    const cases: SuggestionInput[] = [
      input(),
      input({ anchor: null, lastSession: null }),
      input({ equipment: 'bodyweight' }),
      input({ anchor: { value: 300, unit: 'lb', sessionCount: 1, lastSessionDate: '2026-09-20' } }),
      input({ anchor: { value: 300, unit: 'lb', sessionCount: 2, lastSessionDate: '2026-09-20' } }),
      input({ anchor: { value: 300, unit: 'lb', sessionCount: 6, lastSessionDate: '2026-01-01' } }),
    ]

    for (const each of cases) expect(qualified(suggestLoad(each))).toBe(true)
  })

  it('is pure: the same history twice is the same suggestion', () => {
    expect(suggestLoad(input())).toEqual(suggestLoad(input()))
  })
})
