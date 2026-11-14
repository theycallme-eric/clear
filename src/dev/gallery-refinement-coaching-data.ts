/**
 * TASK-005 (C16) — the synthetic library answers and prescription rows the
 * gallery's grouped Coaching and notes disclosure reads
 * (`gallery-refinement-coaching.tsx`). Synthetic and in memory only: no
 * account, no catalog read, no write.
 */
import type { ExerciseDefinitionRow, SessionAcceptance, WorkoutExerciseRow } from '../state/schemas'
import type { ExerciseProgress } from '../state/workout-progress'
import { LONG_MOVEMENT_ID } from './gallery-refinement-cards-data'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

/** What the in-memory library answers for one slug. Absent: no entry. */
export type CatalogAnswer = ExerciseDefinitionRow | 'read fails'

function definition(id: string, cues: readonly string[], regression: string | null): ExerciseDefinitionRow {
  return { id, name: id.replaceAll('-', ' '), coaching_cues: [...cues], regression, progression: null }
}

/**
 * The cards state's library: written guidance for most movements, blank cues
 * and regression for the plank, and no entry at all for the mountain climber
 * and the ten long-named stations — so the four states read apart, and the
 * library's repeated "no entry" answer stays visible rather than hidden (R73).
 */
export const GALLERY_CATALOG: Readonly<Record<string, CatalogAnswer>> = {
  'kb-swing': definition('kb-swing', ['Hinge at the hips, not the knees', 'Snap the hips to float the bell'], 'Kettlebell deadlift'),
  plank: definition('plank', [], null),
  [LONG_MOVEMENT_ID]: definition(LONG_MOVEMENT_ID, ['Brace before you step back'], 'Split squat'),
  'push-up': definition('push-up', ['Body in one line from head to heel'], 'Incline push up'),
  burpee: definition('burpee', ['Land softly, then jump'], 'Step-back burpee'),
  'wall-ball': definition('wall-ball', ['Squat to depth before you throw'], 'Air squat to press'),
}

/**
 * The register's states specimen: written guidance (kb swing), blank cues and
 * regression (mountain climber) and a failed read (plank).
 */
export const STATES_CATALOG: Readonly<Record<string, CatalogAnswer>> = {
  ...GALLERY_CATALOG,
  plank: 'read fails',
  'mountain-climber': definition('mountain-climber', [], null),
}

const AT = '2026-11-09T09:00:00+00:00'

/** The rows the specimens hand out, by id: what a note write answers with. */
const ROWS = new Map<string, WorkoutExerciseRow>()

export function galleryRow(id: string): WorkoutExerciseRow | undefined {
  return ROWS.get(id)
}

function galleryId(n: number): string {
  return `00000000-0000-4000-8000-${String(5000 + n).padStart(12, '0')}`
}

/** The synthetic block's movements, as the live block hands them to the owner. */
export function galleryExerciseProgress(block: Block, blockIndex: number): ExerciseProgress[] {
  const blockId = galleryId(100 + blockIndex)
  return block.exercises.map((exercise, index) => {
    const id = galleryId(200 + blockIndex * 20 + index)
    const row: WorkoutExerciseRow = {
      id,
      block_id: blockId,
      exercise_id: exercise.exercise_id,
      order_index: index,
      modality: exercise.modality,
      sets: exercise.sets,
      target_kind: exercise.target_kind,
      target_value: exercise.target_value,
      target_min: exercise.target_min,
      target_max: exercise.target_max,
      target_sequence: exercise.target_sequence,
      per_side: exercise.per_side,
      distance_unit: exercise.distance_unit,
      rest_seconds: exercise.rest_seconds,
      tempo: exercise.tempo,
      load_type: exercise.load_type,
      load_value: exercise.load_value,
      equipment_used: exercise.equipment,
      is_interval_exercise: exercise.is_interval_exercise,
      slot_id: galleryId(400 + blockIndex * 20 + index),
      replaces_id: null,
      origin: 'generated',
      created_at: AT,
      superseded_at: null,
      revision_status: 'active',
      execution_status: 'not_started',
      exercise_notes: null,
    }
    ROWS.set(id, row)
    return { exerciseId: id, blockId, position: index + 1, status: 'not_started', prescription: row, setLogs: [] }
  })
}
