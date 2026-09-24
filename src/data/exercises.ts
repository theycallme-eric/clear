/**
 * EXE-05 — the two things the coaching panel needs from the database, and
 * nothing else.
 *
 * They are one client because they are one surface: the panel that shows a
 * movement's cues is the panel the user types a note into, and both are about
 * one prescription of one session.
 *
 *   · **The library definition.** Cues and the regression are authored in
 *     `exercise_definitions` and hydrated by id — the generator is forbidden
 *     from reproducing them (GENERATION_CONTRACT §8) precisely so there is one
 *     copy, and the session snapshot does not join it. So the panel reads the
 *     catalog itself, by the slug `workout_exercises.exercise_id` already
 *     carries, and reads it only when a user opens the panel: a session's worth
 *     of cues nobody expanded is a request nobody needed.
 *   · **The note.** `workout_exercises.exercise_notes` is a column on the
 *     prescription, so a note is an UPDATE of one row and never a row of its
 *     own. It answers with the row as stored, which is what the panel then
 *     shows — a note is saved because the row came back saying so.
 *
 * RLS is the boundary either way: the catalog is `select` to `authenticated`
 * with no write policy at all, and `workout_exercises` is owner-only for both
 * verbs. The id filter on the update narrows a result the policy has already
 * narrowed, and an update that matches nothing is reported rather than treated
 * as a success (`PERSISTENCE_WRITE_FAILED`), because a note that silently went
 * nowhere is the same defect as a set that did.
 */

import { createError, ErrorCode, err, isErr, ok, type Result } from '../state/errors'
import {
  exerciseDefinitionRowSchema,
  parseBoundary,
  workoutExerciseRowSchema,
  type ExerciseDefinitionRow,
  type WorkoutExerciseRow,
} from '../state/schemas'
import { createSupabaseClient, type SupabaseConfig } from './supabase'

/** The columns the panel says. See `exerciseDefinitionRowSchema`. */
const DEFINITION_COLUMNS = [
  'id',
  'name',
  'coaching_cues',
  'regression',
  'progression',
] as const

export interface ExercisesClient {
  /**
   * The library definition behind a prescription, or `null` when the catalog
   * has no row for that slug.
   *
   * `null` is an answer rather than a failure, and the panel needs it to be:
   * "this movement has no definition" and "the definition did not load" are
   * different states, and only one of them is worth a retry button.
   */
  definition(exerciseId: string): Promise<Result<ExerciseDefinitionRow | null>>
  /**
   * Writes `exercise_notes` on one prescription and answers the row as stored.
   * `null` clears the note; the column is nullable and an empty string is not
   * the same observation as no note at all.
   */
  saveNotes(
    workoutExerciseId: string,
    notes: string | null,
  ): Promise<Result<WorkoutExerciseRow>>
}

export function createExercisesClient(config: SupabaseConfig): ExercisesClient {
  const db = createSupabaseClient(config)

  return {
    async definition(exerciseId) {
      const rows = await db.from('exercise_definitions').select({
        columns: DEFINITION_COLUMNS,
        where: { id: exerciseId },
        limit: 1,
      })
      if (isErr(rows)) return rows

      const [row] = rows.value
      if (row === undefined) return ok(null)

      return parseBoundary(exerciseDefinitionRowSchema, row, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
    },

    async saveNotes(workoutExerciseId, notes) {
      const rows = await db
        .from('workout_exercises')
        .update({ exercise_notes: notes }, { id: workoutExerciseId })
      if (isErr(rows)) return rows

      const [row] = rows.value
      if (row === undefined) {
        // Nothing came back: the policy refused the update, or the id names a
        // prescription that is not this user's. Either way the note is not
        // stored, and the panel must not draw it as if it were.
        return err(
          createError(ErrorCode.PERSISTENCE_WRITE_FAILED, {
            details: { table: 'workout_exercises', exerciseId: workoutExerciseId },
          }),
        )
      }

      return parseBoundary(workoutExerciseRowSchema, row, {
        code: ErrorCode.PERSISTENCE_READ_FAILED,
      })
    },
  }
}
