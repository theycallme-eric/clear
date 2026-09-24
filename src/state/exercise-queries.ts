/**
 * EXE-05 — the library definition behind a prescription, as a query.
 *
 * `history-queries.ts`'s shape, with one difference that matters: the key is the
 * catalog slug rather than the user id. A definition is not the user's data —
 * `exercise_definitions` is one authored library everybody reads — so two
 * prescriptions of the same movement in one session share one cache entry and
 * one request, and the second card's panel opens on data already in hand.
 *
 * `enabled` is how the panel declines to ask until it is opened: a session with
 * twelve movements would otherwise spend twelve requests on cues nobody looked
 * at. A disabled query reports `loading` and touches neither cache nor network,
 * which is exactly what a collapsed panel should cost.
 */
import { useCallback } from 'react'

import { useQuery, type QueryResult } from './query'
import type { ExerciseDefinitionRow } from './schemas'
import { useWorkoutClients } from './workout-queries'

export function exerciseDefinitionQueryKey(exerciseId: string): string {
  return `exercise-definition:${exerciseId}`
}

/**
 * The catalog row for one movement. `null` inside a ready state is the catalog
 * answering that it has no definition for that slug — a real answer, and a
 * different one from a read that failed.
 */
export function useExerciseDefinitionQuery(
  exerciseId: string,
  enabled = true,
): QueryResult<ExerciseDefinitionRow | null> {
  const { exercises } = useWorkoutClients()
  const key = enabled ? exerciseDefinitionQueryKey(exerciseId) : null

  return useQuery(
    key,
    useCallback(() => exercises.definition(exerciseId), [exercises, exerciseId]),
  )
}
