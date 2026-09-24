/**
 * Factory functions for domain fixtures. A test that hand-builds a domain
 * object is a bug in this harness: add or extend a factory here instead, so
 * a schema change is one edit, not a hunt through the suite.
 *
 * Every factory returns a valid object and accepts partial overrides.
 */
import { createError, ErrorCode, type AppError } from '../state/errors'
import {
  CONTRACT_VERSION,
  type GenerationOutput,
  type Prescription,
  type SessionAcceptance,
  type WorkoutBlock,
  type WorkoutSessionRow,
} from '../state/schemas'

export function makeAppError(overrides: Partial<AppError> = {}): AppError {
  return {
    ...createError(ErrorCode.NETWORK_SERVER_ERROR, {
      requestId: 'req_test_fixture',
    }),
    ...overrides,
  }
}

/** One prescription, valid, with every field of contract §5 present. */
export function makePrescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    exercise_id: 'kb-swing',
    equipment: 'kettlebell',
    session_function: 'conditioning',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: 3,
    target_kind: 'fixed',
    target_value: 15,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: 60,
    tempo: null,
    load_type: 'absolute',
    load_value: 24,
    is_interval_exercise: false,
    ...overrides,
  } as Prescription
}

export function makeWorkoutBlock(overrides: Partial<WorkoutBlock> = {}): WorkoutBlock {
  return {
    structure_type: 'standard',
    rounds: null,
    timer_type: 'none',
    timer_seconds: null,
    round_rest_seconds: null,
    rep_scheme: 'fixed',
    block_notes: null,
    exercises: [makePrescription()],
    ...overrides,
  }
}

/**
 * A composed workout: two sections, so a test about ordering or about
 * resuming at "the correct section" has more than one answer available.
 */
export function makeGenerationOutput(
  overrides: Partial<GenerationOutput> = {},
): GenerationOutput {
  return {
    title: 'Lower-body strength',
    overview: null,
    sections: [
      {
        section_type: 'warmup',
        section_title: 'Prepare',
        section_notes: null,
        blocks: [
          makeWorkoutBlock({
            exercises: [makePrescription({ exercise_id: 'air-squat', equipment: 'bodyweight', load_type: 'bodyweight', load_value: null })],
          }),
        ],
      },
      {
        section_type: 'primary_lift',
        section_title: 'Primary',
        section_notes: null,
        blocks: [
          makeWorkoutBlock({
            exercises: [
              makePrescription({ exercise_id: 'back-squat', equipment: 'barbell', load_type: 'rir', load_value: 2 }),
              makePrescription({ exercise_id: 'kb-swing' }),
            ],
          }),
        ],
      },
    ],
    estimated_duration_mins: 45,
    ...overrides,
  }
}

/**
 * A persisted `workout_sessions` row, completed. The defaults describe the
 * ordinary case a streak is derived from (SES-01c); a test that needs a
 * prescribed, active or abandoned session overrides the timestamps, which is
 * the only thing that decides a session's state (SES-01a).
 */
export function makeSessionRow(
  overrides: Partial<WorkoutSessionRow> = {},
): WorkoutSessionRow {
  const completedAt = overrides.completed_at ?? '2026-09-22T18:30:00.000Z'

  return {
    id: 'b0000001-0000-4000-8000-000000000000',
    user_id: 'a0000001-0000-4000-8000-000000000000',
    location_id: null,
    created_at: '2026-09-22T17:00:00.000Z',
    updated_at: '2026-09-22T17:00:00.000Z',
    date: '2026-09-22',
    title: 'Lower-body strength',
    overview: null,
    session_focus: 'lower_body',
    goal_preset: null,
    requested_duration_mins: 45,
    effective_duration_target_mins: 45,
    computed_duration_mins: null,
    actual_duration_mins: 42,
    requested_intensity: 7,
    effective_intensity: 7,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'p-1.0.0',
    contract_version: CONTRACT_VERSION,
    started_at: completedAt,
    completed_at: completedAt,
    abandoned_at: null,
    mood: null,
    session_notes: null,
    counts_for_streak: true,
    ...overrides,
  }
}

/** What acceptance sends: the session's own fields, plus the workout. */
export function makeSessionAcceptance(
  overrides: Partial<SessionAcceptance> = {},
): SessionAcceptance {
  return {
    date: '2026-09-22',
    location_id: 'd0000001-0000-4000-8000-000000000000',
    session_focus: 'lower_body',
    goal_preset: null,
    requested_duration_mins: 45,
    effective_duration_target_mins: 45,
    computed_duration_mins: null,
    requested_intensity: 7,
    effective_intensity: 7,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'p-1.0.0',
    contract_version: CONTRACT_VERSION,
    workout: makeGenerationOutput(),
    ...overrides,
  }
}
