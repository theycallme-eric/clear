import { describe, expect, it } from 'vitest'

import { exerciseSetLogRowSchema } from './schemas'

const legacy = {
  id: '10101010-1010-4010-8010-101010101010',
  workout_exercise_id: '20202020-2020-4020-8020-202020202020',
  prescription_revision_status: 'active',
  set_number: 1,
  actual_reps: 8,
  actual_duration_seconds: null,
  actual_distance: null,
  actual_distance_unit: null,
  weight: 60,
  weight_unit: 'kg',
  rpe: 7.5,
  is_warmup_set: true,
  created_at: '2026-10-27T12:00:00Z',
}

describe('ordered observation snapshot boundary', () => {
  it('reads an older saved row losslessly without inventing effort or mutation history', () => {
    expect(exerciseSetLogRowSchema.parse(legacy)).toEqual({
      ...legacy, effort: null, mutation_revision: 0, last_mutation_id: null,
    })
  })

  it('keeps exact server mutation metadata with nullable categorical effort beside historical RPE', () => {
    const recorded = {
      ...legacy, effort: 'too_easy', mutation_revision: 3,
      last_mutation_id: '30303030-3030-4030-8030-303030303030',
    }
    expect(exerciseSetLogRowSchema.parse(recorded)).toEqual(recorded)
  })

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('refuses an unusable revision %s', revision => {
    expect(exerciseSetLogRowSchema.safeParse({ ...legacy, mutation_revision: revision }).success).toBe(false)
  })
})
