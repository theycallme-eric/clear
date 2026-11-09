/**
 * TASK-001 / JOURNEY-001: the persisted shape of the synthetic peer-grouping
 * composition (`src/dev/gallery-refinement-cards-data.ts`), so Review's
 * acceptance and Workout's snapshot carry identical prescribed data. Shared by
 * the focused component check and the real-route browser proof.
 */
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { snapshotFixture, type SectionFixture } from './workout-double'

/** One acceptance section's blocks, as the rows `persist_session` writes. */
function sectionFixture(section: SessionAcceptance['workout']['sections'][number]): SectionFixture {
  return {
    title: section.section_title,
    sectionType: section.section_type,
    blocks: section.blocks.map((block) => ({
      structureType: block.structure_type,
      rounds: block.rounds,
      timerType: block.timer_type,
      timerSeconds: block.timer_seconds,
      repScheme: block.rep_scheme,
      roundRestSeconds: block.round_rest_seconds,
      exercises: block.exercises.map((exercise, index) => ({
        prescription: {
          exercise_id: exercise.exercise_id,
          order_index: index,
          equipment_used: exercise.equipment,
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
          is_interval_exercise: exercise.is_interval_exercise,
        },
      })),
    })),
  }
}

/**
 * The snapshot `persist_session` answers for this acceptance (`prescribed`,
 * never started) or, with `startedAt`, the running one `start_session` and
 * `resume_session` answer.
 */
export function peerGroupingSnapshot(
  acceptance: SessionAcceptance,
  { userId, startedAt = null }: { userId?: string; startedAt?: string | null } = {},
): SessionSnapshot {
  return snapshotFixture({
    userId,
    title: acceptance.workout.title,
    state: startedAt === null ? 'prescribed' : 'active',
    startedAt,
    session: {
      date: acceptance.date,
      location_id: acceptance.location_id,
      session_focus: acceptance.session_focus,
      goal_preset: acceptance.goal_preset,
    },
    sections: acceptance.workout.sections.map(sectionFixture),
  })
}
