/**
 * EXE-01 — the `block_results` row, and the seam the renderers use.
 *
 * The requirement's point is that there is one write and one effort capture
 * for every structure type, so these tests are about the mapping being
 * indifferent to the structure: an EMOM's outcome and an AMRAP's produce the
 * same row shape, differing only in which columns were observed.
 */
import { describe, expect, it } from 'vitest'

import {
  blockResultInsert,
  isPerceivedEffort,
  PERCEIVED_EFFORT_MAX,
  PERCEIVED_EFFORT_MIN,
  type BlockCompletion,
} from './block-completion'

const BLOCK_ID = '70000001-0000-4000-8000-000000000000'

function completion(overrides: Partial<BlockCompletion> = {}): BlockCompletion {
  return { blockId: BLOCK_ID, outcome: {}, perceivedEffort: 7, ...overrides }
}

describe('blockResultInsert', () => {
  it('records an unobserved column as null rather than as zero', () => {
    expect(blockResultInsert(completion())).toEqual({
      block_id: BLOCK_ID,
      elapsed_seconds: null,
      completed_under_cap: null,
      rounds_completed: null,
      partial_round_reps: null,
      minutes_completed: null,
      highest_rung: null,
      perceived_effort: 7,
      notes: null,
    })
  })

  it('keeps a zero the structure actually observed', () => {
    // An AMRAP with no completed rounds and an AMRAP nobody recorded are
    // different facts (DATA_MODEL §8).
    const row = blockResultInsert(
      completion({ outcome: { roundsCompleted: 0, partialRoundReps: 0 } }),
    )

    expect(row.rounds_completed).toBe(0)
    expect(row.partial_round_reps).toBe(0)
    expect(row.minutes_completed).toBeNull()
  })

  it('carries each structure’s own fields through the same row', () => {
    expect(blockResultInsert(completion({ outcome: { minutesCompleted: 10 } }))).toMatchObject({
      minutes_completed: 10,
      perceived_effort: 7,
    })
    expect(
      blockResultInsert(completion({ outcome: { roundsCompleted: 6, partialRoundReps: 4 } })),
    ).toMatchObject({ rounds_completed: 6, partial_round_reps: 4 })
    expect(
      blockResultInsert(
        completion({ outcome: { elapsedSeconds: 412, completedUnderCap: true } }),
      ),
    ).toMatchObject({ elapsed_seconds: 412, completed_under_cap: true })
    expect(blockResultInsert(completion({ outcome: { highestRung: 5 } }))).toMatchObject({
      highest_rung: 5,
    })
    expect(
      blockResultInsert(completion({ outcome: { notes: 'shoulder felt tight' } })),
    ).toMatchObject({ notes: 'shoulder felt tight' })
  })

  it('carries a false under-cap rather than losing it to the null coalesce', () => {
    expect(
      blockResultInsert(completion({ outcome: { completedUnderCap: false } })).completed_under_cap,
    ).toBe(false)
  })

  it('always carries the effort the shell captured', () => {
    // OVR-03 reads this column, and it is collected from day one.
    expect(blockResultInsert(completion({ perceivedEffort: 1 })).perceived_effort).toBe(1)
    expect(blockResultInsert(completion({ perceivedEffort: 10 })).perceived_effort).toBe(10)
  })
})

describe('isPerceivedEffort', () => {
  it('mirrors the CHECK constraint, and nothing wider', () => {
    expect(PERCEIVED_EFFORT_MIN).toBe(1)
    expect(PERCEIVED_EFFORT_MAX).toBe(10)

    for (let value = PERCEIVED_EFFORT_MIN; value <= PERCEIVED_EFFORT_MAX; value += 1) {
      expect(isPerceivedEffort(value)).toBe(true)
    }
    expect(isPerceivedEffort(0)).toBe(false)
    expect(isPerceivedEffort(11)).toBe(false)
    expect(isPerceivedEffort(6.5)).toBe(false)
    expect(isPerceivedEffort(Number.NaN)).toBe(false)
  })
})
