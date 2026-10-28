import { exerciseSetLogRowSchema } from '../../src/state/schemas'
import type { SetObservationMutation, SetObservationOperation } from '../../src/state/set-observation-mutation'

/** A real fixture row, without coercing or fabricating any recorded measurement. */
export function observationProbe(
  input: unknown,
  mutationId: string,
  operation: SetObservationOperation = 'insert',
) {
  const row = exerciseSetLogRowSchema.parse(input)
  const mutation: SetObservationMutation = {
    observation_id: row.id,
    mutation_id: mutationId,
    expected_revision: row.mutation_revision,
    revision: row.mutation_revision + 1,
    operation,
    exercise_id: row.workout_exercise_id,
    set_number: row.set_number,
    values: operation === 'clear' ? {} : {
      actual_reps: row.actual_reps,
      actual_duration_seconds: row.actual_duration_seconds,
      actual_distance: row.actual_distance,
      actual_distance_unit: row.actual_distance_unit,
      weight: row.weight,
      weight_unit: row.weight_unit,
      effort: row.effort,
      ...(operation === 'insert' ? {
        is_warmup_set: row.is_warmup_set,
        rpe: row.rpe,
      } : {}),
    },
  }
  return {
    mutation,
    args: {
      p_observation_id: mutation.observation_id,
      p_mutation_id: mutation.mutation_id,
      p_expected_revision: mutation.expected_revision,
      p_revision: mutation.revision,
      p_operation: mutation.operation,
      p_exercise_id: mutation.exercise_id,
      p_set_number: mutation.set_number,
      p_values: mutation.values,
    },
  }
}
