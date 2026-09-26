/**
 * Factory functions for domain fixtures. A test that hand-builds a domain
 * object is a bug in this harness: add or extend a factory here instead, so
 * a schema change is one edit, not a hunt through the suite.
 *
 * Every factory returns a valid object and accepts partial overrides.
 */
import type { GenerationError } from '../data/generation'
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

/**
 * The error a generation answers with (GEN-03). It defaults to the offline
 * failure because that is the one the requirement names: a network killed
 * mid-generate, shown with its message, its request id and a retry.
 */
export function makeGenerationError(
  overrides: Partial<GenerationError> = {},
): GenerationError {
  return {
    ...createError(ErrorCode.NETWORK_OFFLINE, { requestId: 'req_test_generation' }),
    requestId: 'req_test_generation',
    failure: null,
    issues: [],
    retryable: true,
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

/**
 * A composed workout that exercises **every** structure type and **every** rep
 * scheme, plus all three target kinds, all three modalities and all six load
 * guidances — REV-01's first acceptance criterion, as a fixture.
 *
 * One sample rather than a block per test, because the criterion is about the
 * whole: "renders every structure type and rep scheme correctly" is a claim
 * about a screen given one workout, and a suite that fed it six workouts of one
 * block each would never catch a briefing that renders two structures the same
 * way. `review.test.ts` parses it with `generationOutputSchema` so the sample
 * stays schema-valid rather than merely well-intentioned — a fixture the
 * contract would refuse proves nothing about a screen the contract feeds.
 */
export function makeStructureSpectrumWorkout(
  overrides: Partial<GenerationOutput> = {},
): GenerationOutput {
  return {
    title: 'Full spectrum',
    overview: 'Every structure this app can prescribe, in one session.',
    sections: [
      {
        section_type: 'warmup',
        section_title: 'Prepare',
        section_notes: 'Move before you load.',
        blocks: [
          makeWorkoutBlock({
            structure_type: 'standard',
            rep_scheme: 'fixed',
            exercises: [
              makePrescription({
                exercise_id: 'air-squat',
                equipment: 'bodyweight',
                load_type: 'bodyweight',
                load_value: null,
                target_kind: 'range',
                target_value: null,
                target_min: 8,
                target_max: 12,
                rest_seconds: null,
              }),
            ],
          }),
        ],
      },
      {
        section_type: 'primary_lift',
        section_title: 'Primary',
        section_notes: null,
        blocks: [
          makeWorkoutBlock({
            structure_type: 'standard',
            rep_scheme: 'fixed',
            exercises: [
              makePrescription({
                exercise_id: 'back-squat',
                equipment: 'barbell',
                load_type: 'percent_1rm',
                load_value: 75,
                sets: 5,
                target_value: 5,
                tempo: '3-1-1-0',
                rest_seconds: 180,
              }),
            ],
          }),
          makeWorkoutBlock({
            structure_type: 'superset',
            rep_scheme: 'fixed',
            round_rest_seconds: 90,
            exercises: [
              makePrescription({
                exercise_id: 'bench-press',
                equipment: 'barbell',
                load_type: 'rir',
                load_value: 2,
                sets: 4,
                target_value: 8,
              }),
              makePrescription({
                exercise_id: 'bent-over-row',
                equipment: 'barbell',
                load_type: 'prior_session',
                load_value: null,
                sets: 4,
                target_value: 8,
              }),
            ],
          }),
        ],
      },
      {
        section_type: 'accessory',
        section_title: 'Accessory',
        section_notes: null,
        blocks: [
          makeWorkoutBlock({
            structure_type: 'circuit',
            rep_scheme: 'pyramid',
            rounds: 3,
            round_rest_seconds: 60,
            block_notes: 'Build then come back down.',
            exercises: [
              makePrescription({
                exercise_id: 'goblet-squat',
                equipment: 'dumbbell',
                load_type: 'absolute',
                load_value: 24,
                target_kind: 'sequence',
                target_value: null,
                target_sequence: [8, 10, 8],
                sets: null,
              }),
            ],
          }),
          makeWorkoutBlock({
            structure_type: 'standard',
            rep_scheme: 'ladder_up',
            exercises: [
              makePrescription({
                exercise_id: 'pull-up',
                equipment: 'pull-up-bar',
                load_type: 'bodyweight',
                load_value: null,
                target_kind: 'sequence',
                target_value: null,
                target_sequence: [3, 5, 7, 9],
                sets: null,
              }),
            ],
          }),
        ],
      },
      {
        section_type: 'conditioning',
        section_title: 'Conditioning',
        section_notes: null,
        blocks: [
          makeWorkoutBlock({
            structure_type: 'emom',
            rep_scheme: 'n_plus_one',
            timer_type: 'per_minute',
            timer_seconds: 600,
            exercises: [
              makePrescription({
                exercise_id: 'kb-swing',
                equipment: 'kettlebell',
                load_type: 'absolute',
                load_value: 24,
                is_interval_exercise: true,
                target_value: 12,
              }),
            ],
          }),
          makeWorkoutBlock({
            structure_type: 'amrap',
            rep_scheme: 'inverse',
            timer_type: 'countdown',
            timer_seconds: 480,
            exercises: [
              makePrescription({
                exercise_id: 'burpee',
                equipment: 'bodyweight',
                load_type: 'bodyweight',
                load_value: null,
                sets: null,
                target_value: 10,
              }),
            ],
          }),
          makeWorkoutBlock({
            structure_type: 'for_time',
            rep_scheme: 'ladder_down',
            timer_type: 'count_up',
            timer_seconds: 900,
            exercises: [
              makePrescription({
                exercise_id: 'wall-ball',
                equipment: 'medicine-ball',
                load_type: 'absolute',
                load_value: 9,
                target_kind: 'sequence',
                target_value: null,
                target_sequence: [15, 12, 9, 6, 3],
                sets: null,
              }),
            ],
          }),
          makeWorkoutBlock({
            structure_type: 'for_time',
            rep_scheme: 'ladder_fixed_interval',
            timer_type: 'interval',
            timer_seconds: 600,
            exercises: [
              makePrescription({
                exercise_id: 'row-erg',
                equipment: 'rower',
                load_type: 'none',
                load_value: null,
                modality: 'distance',
                distance_unit: 'm',
                target_kind: 'fixed',
                target_value: 400,
                target_sequence: null,
                sets: 4,
              }),
            ],
          }),
        ],
      },
      {
        section_type: 'cooldown',
        section_title: 'Cool down',
        section_notes: null,
        blocks: [
          makeWorkoutBlock({
            structure_type: 'standard',
            rep_scheme: 'fixed',
            exercises: [
              makePrescription({
                exercise_id: 'couch-stretch',
                equipment: 'bodyweight',
                load_type: 'bodyweight',
                load_value: null,
                modality: 'time',
                per_side: true,
                sets: 2,
                target_value: 45,
                rest_seconds: 0,
              }),
            ],
          }),
        ],
      },
    ],
    // Deliberately nothing like the effective target the briefing shows: this
    // is Claude's diagnostic estimate, and REV-01 says it never reaches a user.
    estimated_duration_mins: 71,
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
    // OVR-04: an ordinary session, which is what a factory without an opinion
    // should build. A test about a deload says so by overriding it.
    is_deload: false,
    workout: makeGenerationOutput(),
    ...overrides,
  }
}
