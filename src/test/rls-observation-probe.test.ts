import { describe, expect, it } from 'vitest'

import { observationProbe } from '../../e2e/support/rls-observation'

const legacy = {
  id: '10101010-1010-4010-8010-101010101010',
  workout_exercise_id: '20202020-2020-4020-8020-202020202020',
  prescription_revision_status: 'active',
  set_number: 1,
  actual_reps: 0,
  actual_duration_seconds: null,
  actual_distance: 25,
  actual_distance_unit: 'm',
  weight: 0,
  weight_unit: 'kg',
  rpe: 7.5,
  is_warmup_set: true,
  created_at: '2026-10-27T12:00:00Z',
}
const mutationId = '30303030-3030-4030-8030-303030303030'

describe('Standing RLS observation probe', () => {
  it('bootstraps an exact legacy observation without fabricating or dropping performed values', () => {
    const { mutation, args } = observationProbe(legacy, mutationId)
    expect(mutation).toEqual({
      observation_id: legacy.id, mutation_id: mutationId,
      expected_revision: 0, revision: 1, operation: 'insert',
      exercise_id: legacy.workout_exercise_id, set_number: 1,
      values: {
        actual_reps: 0, actual_duration_seconds: null,
        actual_distance: 25, actual_distance_unit: 'm',
        weight: 0, weight_unit: 'kg', effort: null, rpe: 7.5, is_warmup_set: true,
      },
    })
    expect(args).toEqual({
      p_observation_id: legacy.id, p_mutation_id: mutationId,
      p_expected_revision: 0, p_revision: 1, p_operation: 'insert',
      p_exercise_id: legacy.workout_exercise_id, p_set_number: 1,
      p_values: mutation.values,
    })
    expect(legacy).not.toHaveProperty('mutation_revision')
  })

  it('uses the actual current revision and excludes immutable history from correction requests', () => {
    const { mutation } = observationProbe({ ...legacy,
      mutation_revision: 3, last_mutation_id: mutationId, effort: 'too_easy',
    }, mutationId, 'correct')
    expect(mutation.expected_revision).toBe(3)
    expect(mutation.revision).toBe(4)
    expect(mutation.values).toEqual({
      actual_reps: 0, actual_duration_seconds: null,
      actual_distance: 25, actual_distance_unit: 'm',
      weight: 0, weight_unit: 'kg', effort: 'too_easy',
    })
  })

  it('uses an empty clear payload rather than sending observed history as new work', () => {
    expect(observationProbe(legacy, mutationId, 'clear').args).toMatchObject({
      p_operation: 'clear', p_values: {}, p_observation_id: legacy.id,
      p_expected_revision: 0, p_revision: 1,
    })
  })

  it('refuses malformed fixture identity and revision before constructing a probe', () => {
    expect(() => observationProbe({ ...legacy, id: 'not-a-row-id' }, mutationId)).toThrow()
    expect(() => observationProbe({ ...legacy, mutation_revision: -1 }, mutationId)).toThrow()
  })
})
