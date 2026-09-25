/**
 * OVR-03 — §3's four formats, scored, gated and nudged.
 *
 * The requirement asks for one thing by name — **per-format suggestions
 * tested** — and that is read here as the whole of §3 per format, because a
 * suggestion is only as good as the number it rests on:
 *
 *   · the normalized score for each row of §3's table, including the two For
 *     Time cases the table splits (finished, and capped);
 *   · the comparison gate, asserted from the negative side — a differently
 *     generated piece, a swapped exercise, a different cap and a different unit
 *     each produce *no* comparison;
 *   · the density read over every combination the window can hold, and then the
 *     per-format suggestion for all five formats × all three trends, with a
 *     coverage assertion so a format added later cannot arrive untested.
 *
 * No database and no React: every function is handed rows and numbers.
 */
import { describe, expect, it } from 'vitest'

import {
  blockCompletionRead,
  blockPrescription,
  CAP_LENGTHEN_FRACTION,
  CAP_SHORTEN_FRACTION,
  conditioningDirective,
  conditioningFingerprint,
  conditioningFormat,
  conditioningScore,
  conditioningSection,
  conditioningSections,
  conditioningTrend,
  densitySuggestion,
  densityWindow,
  DENSITY_INTENSITY_FLOOR,
  outcomeOf,
  prescribedRepsPerRound,
  previousBest,
  READY_EFFORT_CEILING,
  TREND_WINDOW,
  timedOutcome,
  timedPrescription,
  type ConditioningFormat,
  type ConditioningSectionRead,
  type ConditioningTrend,
  type TimedOutcome,
  type TimedPrescription,
} from './conditioning'
import type { ConditioningHistoryRow, ConditioningPrescription } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SESSION = 'c0000001-0000-4000-8000-000000000000'
const BLOCK = 'b0000001-0000-4000-8000-000000000000'
const SECTION = 'a0000001-0000-4000-8000-000000000000'

function movement(
  overrides: Partial<ConditioningPrescription> = {},
): ConditioningPrescription {
  return {
    exercise_id: 'kettlebell-swing',
    order_index: 0,
    modality: 'reps',
    sets: null,
    target_kind: 'fixed',
    target_value: 10,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    load_type: 'absolute',
    load_value: 24,
    equipment_used: 'kettlebell',
    ...overrides,
  }
}

function block(overrides: Partial<TimedPrescription> = {}): TimedPrescription {
  return {
    structureType: 'amrap',
    repScheme: 'fixed',
    timerType: 'countdown',
    timerSeconds: 600,
    rounds: null,
    roundRestSeconds: null,
    exercises: [movement()],
    ...overrides,
  }
}

function outcome(overrides: Partial<TimedOutcome> = {}): TimedOutcome {
  return {
    elapsedSeconds: null,
    completedUnderCap: null,
    roundsCompleted: null,
    partialRoundReps: null,
    minutesCompleted: null,
    highestRung: null,
    perceivedEffort: null,
    ...overrides,
  }
}

/** A `conditioning_history` row, as the function answers it. */
function row(overrides: Partial<ConditioningHistoryRow> = {}): ConditioningHistoryRow {
  return {
    session_id: SESSION,
    session_date: '2026-09-20',
    effective_intensity: 7,
    goal_preset: 'conditioning',
    section_id: SECTION,
    section_order: 3,
    block_id: BLOCK,
    block_order: 0,
    structure_type: 'amrap',
    rep_scheme: 'fixed',
    timer_type: 'countdown',
    timer_seconds: 600,
    rounds: null,
    round_rest_seconds: null,
    elapsed_seconds: null,
    completed_under_cap: null,
    rounds_completed: 8,
    partial_round_reps: null,
    minutes_completed: null,
    highest_rung: null,
    perceived_effort: 6,
    scored_at: '2026-09-20T10:30:00.000Z',
    prescriptions: [movement()],
    ...overrides,
  }
}

/** A section read, built from the row above so the two never disagree. */
function section(overrides: Partial<ConditioningHistoryRow> = {}): ConditioningSectionRead {
  return conditioningSection(row(overrides))
}

// ─────────────────────────────────────────────────────────────────────────────
// Which format a block is scored as
// ─────────────────────────────────────────────────────────────────────────────

describe('the format a block scores as (OVR-03 §3)', () => {
  it('reads the four timed structures and the circuit', () => {
    expect(conditioningFormat({ structureType: 'amrap', repScheme: 'fixed' })).toBe('amrap')
    expect(conditioningFormat({ structureType: 'for_time', repScheme: 'fixed' })).toBe(
      'for_time',
    )
    expect(conditioningFormat({ structureType: 'emom', repScheme: 'fixed' })).toBe('emom')
    expect(conditioningFormat({ structureType: 'circuit', repScheme: 'fixed' })).toBe(
      'circuit',
    )
  })

  it('scores nothing for the structures §2 already covers', () => {
    expect(conditioningFormat({ structureType: 'standard', repScheme: 'fixed' })).toBeNull()
    expect(conditioningFormat({ structureType: 'superset', repScheme: 'fixed' })).toBeNull()
  })

  it('reads a ladder as a ladder whatever structure carries it', () => {
    // A For Time performed as a ladder records a rung, not a round.
    expect(conditioningFormat({ structureType: 'for_time', repScheme: 'ladder_down' })).toBe(
      'ladder',
    )
    expect(conditioningFormat({ structureType: 'amrap', repScheme: 'pyramid' })).toBe('ladder')
  })

  it('counts N+1 as a ladder, as §3 does, though no renderer draws its rungs', () => {
    expect(conditioningFormat({ structureType: 'for_time', repScheme: 'n_plus_one' })).toBe(
      'ladder',
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The reps a round asks for
// ─────────────────────────────────────────────────────────────────────────────

describe('the reps a round prescribes', () => {
  it('sums the movements of the round', () => {
    expect(
      prescribedRepsPerRound([
        movement({ target_value: 10 }),
        movement({ exercise_id: 'burpee', order_index: 1, target_value: 5 }),
      ]),
    ).toBe(15)
  })

  it('takes a range at its floor, as anchor_evidence does', () => {
    expect(
      prescribedRepsPerRound([
        movement({ target_kind: 'range', target_value: null, target_min: 8, target_max: 12 }),
      ]),
    ).toBe(8)
  })

  it('doubles a per-side target: ten per side is twenty reps of work', () => {
    expect(prescribedRepsPerRound([movement({ per_side: true, target_value: 10 })])).toBe(20)
  })

  it('multiplies by the sets a movement prescribes inside the round', () => {
    expect(prescribedRepsPerRound([movement({ sets: 2, target_value: 10 })])).toBe(20)
  })

  it('sums a sequence: the round is not finished until its last rung is', () => {
    expect(
      prescribedRepsPerRound([
        movement({
          target_kind: 'sequence',
          target_value: null,
          target_sequence: [5, 4, 3],
        }),
      ]),
    ).toBe(12)
  })

  it('counts no reps for a piece measured in time or distance', () => {
    expect(
      prescribedRepsPerRound([
        movement({ modality: 'distance', target_value: 400, distance_unit: 'm' }),
        movement({ exercise_id: 'plank', order_index: 1, modality: 'time', target_value: 60 }),
      ]),
    ).toBeNull()
  })

  it('counts only the reps when a piece mixes reps with a run', () => {
    expect(
      prescribedRepsPerRound([
        movement({ target_value: 10 }),
        movement({
          exercise_id: 'run',
          order_index: 1,
          modality: 'distance',
          target_value: 400,
          distance_unit: 'm',
        }),
      ]),
    ).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3's normalized scores, one per row of the table
// ─────────────────────────────────────────────────────────────────────────────

describe("§3's normalized score, per format", () => {
  it('AMRAP: total reps over the window, partial round included', () => {
    // 8 rounds of 10, plus 4 reps into the ninth, in 10 minutes.
    const score = conditioningScore(
      block({ timerSeconds: 600 }),
      outcome({ roundsCompleted: 8, partialRoundReps: 4 }),
    )

    expect(score).toEqual({
      format: 'amrap',
      unit: 'reps_per_minute',
      value: 8.4,
      completedUnderCap: null,
      label: '8.4 reps/min',
    })
  })

  it('AMRAP: normalizes across durations, which is the whole point', () => {
    const eight = conditioningScore(
      block({ timerSeconds: 480 }),
      outcome({ roundsCompleted: 8 }),
    )
    const twelve = conditioningScore(
      block({ timerSeconds: 720 }),
      outcome({ roundsCompleted: 12 }),
    )

    // Different pieces of work, the same density: 10 reps a minute either way.
    expect(eight?.value).toBe(10)
    expect(twelve?.value).toBe(10)
  })

  it('AMRAP: a zero-round AMRAP scores zero, which is a result', () => {
    const score = conditioningScore(block(), outcome({ roundsCompleted: 0 }))

    expect(score?.value).toBe(0)
  })

  it('AMRAP: an unrecorded round count scores nothing at all', () => {
    expect(conditioningScore(block(), outcome())).toBeNull()
  })

  it('For Time, finished: the prescribed work over the time it took', () => {
    // 3 rounds of 10 reps in 5 minutes = 30 reps ÷ 5 = 6 reps/min.
    const score = conditioningScore(
      block({ structureType: 'for_time', rounds: 3, timerSeconds: 600 }),
      outcome({ elapsedSeconds: 300, completedUnderCap: true }),
    )

    expect(score).toEqual({
      format: 'for_time',
      unit: 'reps_per_minute',
      value: 6,
      completedUnderCap: true,
      label: '6 reps/min',
    })
  })

  it('For Time, finished: faster is a higher rate, so higher is better', () => {
    const forTime = block({ structureType: 'for_time', rounds: 3, timerSeconds: 600 })
    const faster = conditioningScore(
      forTime,
      outcome({ elapsedSeconds: 240, completedUnderCap: true }),
    )
    const slower = conditioningScore(
      forTime,
      outcome({ elapsedSeconds: 360, completedUnderCap: true }),
    )

    expect(faster?.value).toBeGreaterThan(slower?.value ?? 0)
  })

  it('For Time, capped: reps at the cap over the cap, and it says so', () => {
    // 2 rounds of 10 plus 5 reps, stopped at a 10-minute cap.
    const score = conditioningScore(
      block({ structureType: 'for_time', rounds: 5, timerSeconds: 600 }),
      outcome({
        roundsCompleted: 2,
        partialRoundReps: 5,
        elapsedSeconds: 600,
        completedUnderCap: false,
      }),
    )

    expect(score).toEqual({
      format: 'for_time',
      unit: 'reps_per_minute',
      value: 2.5,
      completedUnderCap: false,
      label: '2.5 reps/min',
    })
  })

  it('EMOM: the completion ratio, stated as the two counts', () => {
    const score = conditioningScore(
      block({ structureType: 'emom', timerSeconds: 600 }),
      outcome({ minutesCompleted: 8 }),
    )

    expect(score).toEqual({
      format: 'emom',
      unit: 'completion_ratio',
      value: 0.8,
      completedUnderCap: null,
      label: '8 of 10 min',
    })
  })

  it('EMOM: surviving every minute is a full ratio', () => {
    const score = conditioningScore(
      block({ structureType: 'emom', timerSeconds: 720 }),
      outcome({ minutesCompleted: 12 }),
    )

    expect(score?.value).toBe(1)
  })

  it('EMOM: no clock is no denominator, so no score', () => {
    expect(
      conditioningScore(
        block({ structureType: 'emom', timerSeconds: null }),
        outcome({ minutesCompleted: 8 }),
      ),
    ).toBeNull()
  })

  it('Ladder: the rung reached, with no rate in it', () => {
    const score = conditioningScore(
      block({
        structureType: 'for_time',
        repScheme: 'ladder_down',
        exercises: [
          movement({
            target_kind: 'sequence',
            target_value: null,
            target_sequence: [10, 9, 8, 7, 6],
          }),
        ],
      }),
      outcome({ highestRung: 4, elapsedSeconds: 300 }),
    )

    expect(score).toEqual({
      format: 'ladder',
      unit: 'rung',
      value: 4,
      completedUnderCap: null,
      label: 'Rung 4',
    })
  })

  it('Ladder: an unrecorded rung scores nothing', () => {
    expect(
      conditioningScore(
        block({ repScheme: 'ladder_up' }),
        outcome({ roundsCompleted: 5, elapsedSeconds: 300 }),
      ),
    ).toBeNull()
  })

  it('circuit: scores as an AMRAP does when it carries a clock', () => {
    const score = conditioningScore(
      block({ structureType: 'circuit', rounds: 5, timerSeconds: 600 }),
      outcome({ roundsCompleted: 4 }),
    )

    expect(score?.unit).toBe('reps_per_minute')
    expect(score?.value).toBe(4)
  })

  it('circuit: an untimed circuit has no rate at all', () => {
    expect(
      conditioningScore(
        block({ structureType: 'circuit', rounds: 5, timerSeconds: null, timerType: 'none' }),
        outcome({ roundsCompleted: 4 }),
      ),
    ).toBeNull()
  })

  it('scores nothing for a standard block, whatever it recorded', () => {
    expect(
      conditioningScore(
        block({ structureType: 'standard' }),
        outcome({ roundsCompleted: 3, elapsedSeconds: 120 }),
      ),
    ).toBeNull()
  })

  it('scores nothing for a piece that prescribes no reps to count', () => {
    expect(
      conditioningScore(
        block({
          exercises: [movement({ modality: 'distance', target_value: 400, distance_unit: 'm' })],
        }),
        outcome({ roundsCompleted: 4 }),
      ),
    ).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Finished as prescribed?
// ─────────────────────────────────────────────────────────────────────────────

describe('whether the work was finished as prescribed', () => {
  it('For Time: under the cap is complete, at it is capped', () => {
    const forTime = block({ structureType: 'for_time', timerSeconds: 600 })

    expect(blockCompletionRead(forTime, outcome({ completedUnderCap: true }))).toBe('complete')
    expect(blockCompletionRead(forTime, outcome({ completedUnderCap: false }))).toBe('capped')
    expect(blockCompletionRead(forTime, outcome({ elapsedSeconds: 300 }))).toBe('unknown')
  })

  it('EMOM: every minute is complete, a dropped one is not', () => {
    const emom = block({ structureType: 'emom', timerSeconds: 600 })

    expect(blockCompletionRead(emom, outcome({ minutesCompleted: 10 }))).toBe('complete')
    expect(blockCompletionRead(emom, outcome({ minutesCompleted: 9 }))).toBe('incomplete')
    expect(blockCompletionRead(emom, outcome())).toBe('unknown')
  })

  it('AMRAP: the window is the work, so a recorded AMRAP is a complete one', () => {
    expect(blockCompletionRead(block(), outcome({ roundsCompleted: 0 }))).toBe('complete')
    expect(blockCompletionRead(block(), outcome())).toBe('unknown')
  })

  it('Ladder: the top rung is complete, short of it is not', () => {
    const ladder = block({
      structureType: 'for_time',
      repScheme: 'ladder_down',
      exercises: [
        movement({ target_kind: 'sequence', target_value: null, target_sequence: [10, 8, 6, 4] }),
      ],
    })

    expect(blockCompletionRead(ladder, outcome({ highestRung: 4 }))).toBe('complete')
    expect(blockCompletionRead(ladder, outcome({ highestRung: 3 }))).toBe('incomplete')
  })

  it('Ladder: an open-ended N+1 finishes where it finishes', () => {
    const openEnded = block({ structureType: 'for_time', repScheme: 'n_plus_one' })

    expect(blockCompletionRead(openEnded, outcome({ highestRung: 9 }))).toBe('complete')
  })

  it('circuit: the prescribed rounds, or fewer', () => {
    const circuit = block({ structureType: 'circuit', rounds: 5, timerSeconds: null })

    expect(blockCompletionRead(circuit, outcome({ roundsCompleted: 5 }))).toBe('complete')
    expect(blockCompletionRead(circuit, outcome({ roundsCompleted: 3 }))).toBe('incomplete')
  })

  it('says nothing about a structure §3 does not read', () => {
    expect(
      blockCompletionRead(block({ structureType: 'standard' }), outcome({ roundsCompleted: 3 })),
    ).toBe('unknown')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3(a) — identical work, and only identical work
// ─────────────────────────────────────────────────────────────────────────────

describe("§3(a)'s like-for-like gate", () => {
  it('fingerprints the same piece the same way', () => {
    expect(conditioningFingerprint(block())).toBe(conditioningFingerprint(block()))
  })

  it('separates two pieces that differ only by their clock', () => {
    expect(conditioningFingerprint(block({ timerSeconds: 480 }))).not.toBe(
      conditioningFingerprint(block({ timerSeconds: 720 })),
    )
  })

  it('separates two pieces that differ only by an exercise', () => {
    expect(
      conditioningFingerprint(block({ exercises: [movement({ exercise_id: 'burpee' })] })),
    ).not.toBe(conditioningFingerprint(block()))
  })

  it('separates two pieces that differ only by a load', () => {
    expect(
      conditioningFingerprint(block({ exercises: [movement({ load_value: 32 })] })),
    ).not.toBe(conditioningFingerprint(block()))
  })

  it('separates two pieces that differ only by a rep target', () => {
    expect(
      conditioningFingerprint(block({ exercises: [movement({ target_value: 15 })] })),
    ).not.toBe(conditioningFingerprint(block()))
  })

  it('separates the same movements performed in a different order', () => {
    const swing = movement({ order_index: 0 })
    const burpee = movement({ exercise_id: 'burpee', order_index: 1 })

    expect(conditioningFingerprint(block({ exercises: [swing, burpee] }))).not.toBe(
      conditioningFingerprint(
        block({
          exercises: [
            { ...burpee, order_index: 0 },
            { ...swing, order_index: 1 },
          ],
        }),
      ),
    )
  })

  it('reads the prescribed order rather than the order the rows arrived in', () => {
    const swing = movement({ order_index: 0 })
    const burpee = movement({ exercise_id: 'burpee', order_index: 1 })

    expect(conditioningFingerprint(block({ exercises: [burpee, swing] }))).toBe(
      conditioningFingerprint(block({ exercises: [swing, burpee] })),
    )
  })
})

describe('the comparison, which appears only on an identical repeat', () => {
  const REPEAT = { session_id: 'c0000002-0000-4000-8000-000000000000' }

  it('compares two attempts at the same piece', () => {
    const current = section({ rounds_completed: 9 })
    const earlier = section({
      ...REPEAT,
      block_id: 'b0000002-0000-4000-8000-000000000000',
      session_date: '2026-09-10',
      rounds_completed: 8,
    })

    const comparison = previousBest(current, [earlier])

    expect(comparison).not.toBeNull()
    expect(comparison?.best.label).toBe('8 reps/min')
    expect(comparison?.direction).toBe('ahead')
    expect(comparison?.delta).toBeCloseTo(1)
    expect(comparison?.isBest).toBe(true)
    expect(comparison?.attempts).toBe(1)
    expect(comparison?.bestDate).toBe('2026-09-10')
    expect(comparison?.label).toBe('Previous best 8 reps/min')
  })

  it('reads behind and level as what they are', () => {
    const earlier = section({
      ...REPEAT,
      block_id: 'b0000002-0000-4000-8000-000000000000',
      rounds_completed: 9,
    })

    expect(previousBest(section({ rounds_completed: 7 }), [earlier])?.direction).toBe('behind')
    expect(previousBest(section({ rounds_completed: 9 }), [earlier])?.direction).toBe('level')
    expect(previousBest(section({ rounds_completed: 9 }), [earlier])?.isBest).toBe(false)
  })

  it('takes the best of several identical attempts, not the latest', () => {
    const best = section({
      ...REPEAT,
      block_id: 'b0000002-0000-4000-8000-000000000000',
      session_date: '2026-08-01',
      rounds_completed: 11,
    })
    const recent = section({
      ...REPEAT,
      block_id: 'b0000003-0000-4000-8000-000000000000',
      session_date: '2026-09-01',
      rounds_completed: 9,
    })

    const comparison = previousBest(section({ rounds_completed: 10 }), [recent, best])

    expect(comparison?.bestDate).toBe('2026-08-01')
    expect(comparison?.attempts).toBe(2)
    expect(comparison?.direction).toBe('behind')
  })

  it('shows nothing on a first attempt', () => {
    expect(previousBest(section({ rounds_completed: 8 }), [])).toBeNull()
  })

  it('shows nothing against a differently generated piece', () => {
    // Same structure, same clock, one different movement: not the same test.
    const other = section({
      ...REPEAT,
      block_id: 'b0000002-0000-4000-8000-000000000000',
      prescriptions: [movement({ exercise_id: 'burpee' })],
      rounds_completed: 20,
    })

    expect(previousBest(section({ rounds_completed: 8 }), [other])).toBeNull()
  })

  it('shows nothing against the same movements at a different duration', () => {
    const other = section({
      ...REPEAT,
      block_id: 'b0000002-0000-4000-8000-000000000000',
      timer_seconds: 480,
      rounds_completed: 8,
    })

    expect(previousBest(section({ rounds_completed: 8 }), [other])).toBeNull()
  })

  it('shows nothing against the same piece performed at a heavier load', () => {
    const other = section({
      ...REPEAT,
      block_id: 'b0000002-0000-4000-8000-000000000000',
      prescriptions: [movement({ load_value: 32 })],
      rounds_completed: 8,
    })

    expect(previousBest(section({ rounds_completed: 8 }), [other])).toBeNull()
  })

  it('never compares itself to itself', () => {
    const current = section({ rounds_completed: 8 })

    // The history read is taken after the block was written, so it contains it.
    expect(previousBest(current, [current])).toBeNull()
  })

  it('shows nothing when this attempt cannot be scored', () => {
    const earlier = section({
      ...REPEAT,
      block_id: 'b0000002-0000-4000-8000-000000000000',
      rounds_completed: 8,
    })

    expect(previousBest(section({ rounds_completed: null }), [earlier])).toBeNull()
  })

  it('refuses to subtract a rung from a rate', () => {
    const current = section({
      rep_scheme: 'ladder_down',
      highest_rung: 5,
      prescriptions: [
        movement({ target_kind: 'sequence', target_value: null, target_sequence: [10, 8, 6] }),
      ],
    })
    // Same block, read as an AMRAP: an impossible history, and exactly the
    // mismatch that must never produce a number.
    const mismatched: ConditioningSectionRead = {
      ...section({
        block_id: 'b0000002-0000-4000-8000-000000000000',
        rounds_completed: 8,
      }),
      fingerprint: current.fingerprint,
    }

    expect(previousBest(current, [mismatched])).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3(b) — the density nudge
// ─────────────────────────────────────────────────────────────────────────────

describe("§3(b)'s window", () => {
  const easy = (date: string, overrides: Partial<ConditioningHistoryRow> = {}) =>
    section({ session_date: date, perceived_effort: 6, rounds_completed: 8, ...overrides })

  it('reads the last three, oldest first, so "consecutive" means what it says', () => {
    const window = densityWindow([
      easy('2026-09-20'),
      easy('2026-09-15'),
      easy('2026-09-10'),
      easy('2026-09-05'),
    ])

    expect(window).toHaveLength(TREND_WINDOW)
    expect(window.map((entry) => entry.date)).toEqual([
      '2026-09-10',
      '2026-09-15',
      '2026-09-20',
    ])
  })

  it('drops a section below the intensity floor', () => {
    const window = densityWindow([
      easy('2026-09-20', { effective_intensity: DENSITY_INTENSITY_FLOOR - 1 }),
      easy('2026-09-15'),
    ])

    expect(window.map((entry) => entry.date)).toEqual(['2026-09-15'])
  })

  it('keeps a section exactly at the floor', () => {
    const window = densityWindow([
      easy('2026-09-20', { effective_intensity: DENSITY_INTENSITY_FLOOR }),
    ])

    expect(window).toHaveLength(1)
  })

  it('drops a structure §3 does not read', () => {
    expect(densityWindow([easy('2026-09-20', { structure_type: 'standard' })])).toHaveLength(0)
  })
})

describe("§3(b)'s trend", () => {
  const easy = (date: string) =>
    section({ session_date: date, perceived_effort: READY_EFFORT_CEILING, rounds_completed: 8 })
  const hard = (date: string) =>
    section({ session_date: date, perceived_effort: 9, rounds_completed: 8 })
  const capped = (date: string) =>
    section({
      session_date: date,
      structure_type: 'for_time',
      rounds: 5,
      completed_under_cap: false,
      rounds_completed: 2,
      perceived_effort: 9,
    })
  const dropped = (date: string) =>
    section({
      session_date: date,
      structure_type: 'emom',
      minutes_completed: 8,
      rounds_completed: null,
      perceived_effort: 8,
    })

  it('is ready after two consecutive sections finished as prescribed at RPE ≤ 7', () => {
    expect(conditioningTrend([easy('2026-09-20'), easy('2026-09-15')])).toBe('ready')
  })

  it('is not ready on one easy section', () => {
    expect(conditioningTrend([easy('2026-09-20'), hard('2026-09-15')])).toBe('hold')
  })

  it('is not ready when the two easy sections are not consecutive', () => {
    expect(
      conditioningTrend([easy('2026-09-20'), hard('2026-09-15'), easy('2026-09-10')]),
    ).toBe('hold')
  })

  it('backs off after two consecutive sections at the cap', () => {
    expect(conditioningTrend([capped('2026-09-20'), capped('2026-09-15')])).toBe('backing_off')
  })

  it('backs off on a dropped minute as readily as on a cap', () => {
    expect(conditioningTrend([dropped('2026-09-20'), capped('2026-09-15')])).toBe('backing_off')
  })

  it('backs off rather than averaging when the window holds both patterns', () => {
    // Two capped, then two easy: a correction is not averaged against a nudge.
    expect(
      conditioningTrend([easy('2026-09-20'), capped('2026-09-15'), capped('2026-09-10')]),
    ).toBe('backing_off')
  })

  it('holds on one section, and on none', () => {
    expect(conditioningTrend([easy('2026-09-20')])).toBe('hold')
    expect(conditioningTrend([])).toBe('hold')
  })

  it('will not read an unrecorded effort as a low one', () => {
    const unrated = section({ perceived_effort: null, rounds_completed: 8 })

    expect(conditioningTrend([unrated, unrated])).toBe('hold')
  })

  it('reads effort at the ceiling as ready, and one above it as not', () => {
    const atCeiling = section({ perceived_effort: READY_EFFORT_CEILING, rounds_completed: 8 })
    const overCeiling = section({
      perceived_effort: READY_EFFORT_CEILING + 1,
      rounds_completed: 8,
    })

    expect(conditioningTrend([atCeiling, atCeiling])).toBe('ready')
    expect(conditioningTrend([overCeiling, overCeiling])).toBe('hold')
  })

  it('ignores sections below the intensity floor when counting a run', () => {
    const light = conditioningSection(
      row({
        session_date: '2026-09-18',
        effective_intensity: DENSITY_INTENSITY_FLOOR - 1,
        perceived_effort: 9,
        rounds_completed: 8,
      }),
    )

    // The light section sits between two easy ones and is not part of the read,
    // so the two easy sections are still consecutive.
    expect(conditioningTrend([easy('2026-09-20'), light, easy('2026-09-15')])).toBe('ready')
  })
})

describe('the directive generation reads', () => {
  const easy = (date: string) =>
    section({ session_date: date, perceived_effort: 6, rounds_completed: 8 })

  it('carries the trend under the name §3 gives it', () => {
    const directive = conditioningDirective([easy('2026-09-20'), easy('2026-09-15')])

    expect(directive.conditioning_trend).toBe('ready')
    expect(directive.sections_read).toBe(2)
    expect(directive.reason).toContain('two consecutive')
  })

  it('says how thin the evidence was when it holds for want of data', () => {
    expect(conditioningDirective([]).reason).toBe(
      `only 0 conditioning sections at intensity ${DENSITY_INTENSITY_FLOOR} or above`,
    )
    expect(conditioningDirective([easy('2026-09-20')]).reason).toBe(
      `only 1 conditioning section at intensity ${DENSITY_INTENSITY_FLOOR} or above`,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Per-format suggestions — the acceptance criterion
// ─────────────────────────────────────────────────────────────────────────────

describe('the per-format suggestion', () => {
  const FORMATS: readonly ConditioningFormat[] = [
    'amrap',
    'for_time',
    'emom',
    'ladder',
    'circuit',
  ]
  const TRENDS: readonly ConditioningTrend[] = ['ready', 'hold', 'backing_off']

  it('answers every format, for every trend', () => {
    for (const format of FORMATS) {
      for (const trend of TRENDS) {
        const suggestion = densitySuggestion(format, trend)

        expect(suggestion.format).toBe(format)
        expect(suggestion.trend).toBe(trend)
        expect(suggestion.levers.length).toBeGreaterThan(0)
        expect(suggestion.summary).not.toBe('')
      }
    }
  })

  it('holds by name rather than by an empty list', () => {
    for (const format of FORMATS) {
      expect(densitySuggestion(format, 'hold').levers.map((step) => step.lever)).toEqual([
        'hold',
      ])
    }
  })

  it('AMRAP: moves the work in the round, never the rounds — they are the score', () => {
    expect(densitySuggestion('amrap', 'ready').levers.map((step) => step.lever)).toEqual([
      'add_reps_per_round',
      'shorten_window',
    ])
    expect(densitySuggestion('amrap', 'backing_off').levers.map((step) => step.lever)).toEqual([
      'reduce_reps_per_round',
      'lengthen_window',
    ])
  })

  it('For Time: the three levers §3 offers the generator, and the two it backs off with', () => {
    expect(densitySuggestion('for_time', 'ready').levers.map((step) => step.lever)).toEqual([
      'add_round',
      'add_reps_per_round',
      'shorten_cap',
    ])
    expect(
      densitySuggestion('for_time', 'backing_off').levers.map((step) => step.lever),
    ).toEqual(['drop_round', 'lengthen_cap'])
  })

  it('For Time: states §3’s own step sizes', () => {
    expect(densitySuggestion('for_time', 'ready').summary).toBe(
      `+1 round · +2 reps per round · −${Math.round(CAP_SHORTEN_FRACTION * 100)}% time cap`,
    )
    expect(densitySuggestion('for_time', 'backing_off').summary).toBe(
      `−1 round · +${Math.round(CAP_LENGTHEN_FRACTION * 100)}% time cap`,
    )
  })

  it('EMOM: progresses by surviving more, so the minute comes first', () => {
    expect(densitySuggestion('emom', 'ready').levers[0]?.lever).toBe('add_minute')
    expect(densitySuggestion('emom', 'backing_off').levers[0]?.lever).toBe('drop_minute')
  })

  it('Ladder: moves by a rung, in either direction', () => {
    expect(densitySuggestion('ladder', 'ready').levers.map((step) => step.lever)).toEqual([
      'add_rung',
    ])
    expect(densitySuggestion('ladder', 'backing_off').levers.map((step) => step.lever)).toEqual([
      'drop_rung',
    ])
  })

  it('circuit: has rounds to add, unlike an AMRAP', () => {
    expect(densitySuggestion('circuit', 'ready').levers.map((step) => step.lever)).toEqual([
      'add_round',
      'add_reps_per_round',
    ])
  })

  it('never suggests a cap change for a format with no cap', () => {
    for (const trend of TRENDS) {
      const levers = densitySuggestion('emom', trend).levers.map((step) => step.lever)

      expect(levers).not.toContain('shorten_cap')
      expect(levers).not.toContain('lengthen_cap')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Reading the row, and reading the block being performed
// ─────────────────────────────────────────────────────────────────────────────

describe('what a history row is read as', () => {
  it('carries the section RPE EXE-01 captured, which is §3’s input', () => {
    expect(section({ perceived_effort: 8 }).perceivedEffort).toBe(8)
  })

  it('splits a row into the prescription and the outcome the score reads', () => {
    const source = row({ rounds_completed: 8, partial_round_reps: 4 })

    expect(timedPrescription(source)).toEqual({
      structureType: 'amrap',
      repScheme: 'fixed',
      timerType: 'countdown',
      timerSeconds: 600,
      rounds: null,
      roundRestSeconds: null,
      exercises: source.prescriptions,
    })
    expect(timedOutcome(source)).toEqual({
      elapsedSeconds: null,
      completedUnderCap: null,
      roundsCompleted: 8,
      partialRoundReps: 4,
      minutesCompleted: null,
      highestRung: null,
      perceivedEffort: 6,
    })
  })

  it('reads a list newest first, as the function answers it', () => {
    const read = conditioningSections([
      row({ session_date: '2026-09-20' }),
      row({ session_date: '2026-09-10' }),
    ])

    expect(read.map((entry) => entry.date)).toEqual(['2026-09-20', '2026-09-10'])
  })
})

describe('the block being performed right now', () => {
  it('scores at completion exactly as it will score when read back', () => {
    const source = row({ rounds_completed: 8, partial_round_reps: 4 })
    const stored = conditioningScore(timedPrescription(source), timedOutcome(source))

    const live = conditioningScore(
      blockPrescription({
        blockId: BLOCK,
        structureType: 'amrap',
        repScheme: 'fixed',
        identity: { label: 'AMRAP', glyph: 'Stopwatch', detail: null, repScheme: null },
        status: 'in_progress',
        exerciseCount: 1,
        exercises: [
          {
            exerciseId: 'e0000001-0000-4000-8000-000000000000',
            blockId: BLOCK,
            position: 1,
            status: 'completed',
            prescription: {
              ...movement(),
              id: 'e0000001-0000-4000-8000-000000000000',
              block_id: BLOCK,
              rest_seconds: null,
              tempo: null,
              is_interval_exercise: false,
              slot_id: 's0000001-0000-4000-8000-000000000000',
              replaces_id: null,
              origin: 'generated',
              created_at: '2026-09-20T09:00:00.000Z',
              superseded_at: null,
              revision_status: 'active',
              execution_status: 'completed',
              exercise_notes: null,
            },
            setLogs: [],
          },
        ],
        timerType: 'countdown',
        rounds: null,
        roundRestSeconds: null,
        timerSeconds: 600,
      }),
      outcomeOf({ roundsCompleted: 8, partialRoundReps: 4 }, 6),
    )

    expect(live).toEqual(stored)
  })

  it('reads an omitted field as the null the row will hold, not as a zero', () => {
    expect(outcomeOf({ roundsCompleted: 8 }, null)).toEqual({
      elapsedSeconds: null,
      completedUnderCap: null,
      roundsCompleted: 8,
      partialRoundReps: null,
      minutesCompleted: null,
      highestRung: null,
      perceivedEffort: null,
    })
  })
})
