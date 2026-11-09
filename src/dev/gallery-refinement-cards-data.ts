/**
 * TASK-001 / JOURNEY-001 — one synthetic composition with standard, superset
 * and circuit peers, used by the accepted gallery state
 * (`/gallery/refinements?state=cards`), the focused component check
 * (`src/ui/movement-list.test.tsx`) and the real-route proof
 * (`e2e/refinement/task-001.spec.ts`). Every movement carries the same
 * prescribed data in Review and in Workout.
 *
 * Synthetic and in memory only: no account, no catalog read, no write. The
 * names are this task's own, and the long ones exist to prove wrapping.
 */
import { CONTRACT_VERSION, type Prescription, type SessionAcceptance } from '../state/schemas'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

function prescription(overrides: Partial<Prescription> & Pick<Prescription, 'exercise_id' | 'equipment'>): Prescription {
  return {
    session_function: 'accessory',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: 3,
    target_kind: 'fixed',
    target_value: 10,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: 90,
    tempo: null,
    load_type: 'absolute',
    load_value: 20,
    is_interval_exercise: false,
    ...overrides,
  } as Prescription
}

function block(overrides: Partial<Block> & Pick<Block, 'exercises'>): Block {
  return {
    structure_type: 'standard',
    rounds: null,
    timer_type: 'none',
    timer_seconds: null,
    round_rest_seconds: null,
    rep_scheme: 'fixed',
    block_notes: null,
    ...overrides,
  }
}

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }

/** The long name the wrapping proof reads; deliberately longer than a phone line. */
export const LONG_MOVEMENT_ID = 'single-arm-kettlebell-overhead-reverse-lunge-to-knee-drive'

/** Standard: two straight-set lifts, each with its own prescribed load and rest. */
export const STANDARD_BLOCK = block({
  exercises: [
    prescription({ exercise_id: 'back-squat', equipment: 'barbell', session_function: 'primary', sets: 3, target_value: 5, load_value: 100, rest_seconds: 120 }),
    prescription({ exercise_id: 'romanian-deadlift', equipment: 'barbell', sets: 3, target_value: 8, load_value: 70, rest_seconds: 90 }),
  ],
})

/** Superset: a loaded long-named movement and a bodyweight partner, 3 rounds. */
export const SUPERSET_BLOCK = block({
  structure_type: 'superset',
  rounds: 3,
  round_rest_seconds: 90,
  exercises: [
    prescription({ exercise_id: LONG_MOVEMENT_ID, equipment: 'kettlebell', sets: 3, target_value: 10, load_value: 16, rest_seconds: 0 }),
    prescription({ exercise_id: 'push-up', ...bodyweight, sets: 3, target_value: 12, rest_seconds: 0 }),
  ],
})

/** Circuit: three stations, one loaded, two rounds and one shared rest. */
export const CIRCUIT_BLOCK = block({
  structure_type: 'circuit',
  rounds: 2,
  round_rest_seconds: 60,
  exercises: [
    prescription({ exercise_id: 'kb-swing', equipment: 'kettlebell', session_function: 'conditioning', sets: 2, target_value: 15, load_value: 24, rest_seconds: null }),
    prescription({ exercise_id: 'mountain-climber', ...bodyweight, session_function: 'conditioning', sets: 2, target_value: 20, rest_seconds: null }),
    prescription({ exercise_id: 'plank', ...bodyweight, session_function: 'conditioning', modality: 'time', sets: 2, target_value: 30, rest_seconds: null }),
  ],
})

/** Ten long-named stations: a multi-digit ordinal (`10`) beside a wrapping name. */
export const TEN_STATION_CIRCUIT_BLOCK = block({
  structure_type: 'circuit',
  rounds: 2,
  round_rest_seconds: 60,
  exercises: Array.from({ length: 10 }, (_, index) => prescription({
    exercise_id: index === 9 ? 'alternating-dumbbell-renegade-row-to-push-up-and-reach' : `station-${index + 1}-${LONG_MOVEMENT_ID}`,
    equipment: index % 2 === 0 ? 'dumbbell' : 'kettlebell',
    session_function: 'conditioning',
    sets: 2,
    target_value: 10 + index,
    load_value: 12 + index,
    rest_seconds: null,
  })),
})

export const JOURNEY_TITLE = 'Synthetic peer grouping workout'
export const JOURNEY_SECTION_TITLE = 'Strength and conditioning'

/** The JOURNEY-001 entry state: one section holding standard, superset and circuit peers. */
export function peerGroupingAcceptance({
  date = '2026-11-09',
  locationId = null,
  blocks = [STANDARD_BLOCK, SUPERSET_BLOCK, CIRCUIT_BLOCK],
}: { date?: string; locationId?: string | null; blocks?: readonly Block[] } = {}): SessionAcceptance {
  return {
    date,
    location_id: locationId,
    session_focus: 'full_body',
    goal_preset: 'balanced',
    requested_duration_mins: 45,
    effective_duration_target_mins: 45,
    computed_duration_mins: null,
    requested_intensity: 7,
    effective_intensity: 7,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'gallery-task-001',
    contract_version: CONTRACT_VERSION,
    is_deload: false,
    workout: {
      title: JOURNEY_TITLE,
      overview: null,
      estimated_duration_mins: 45,
      sections: [{
        section_type: 'accessory',
        section_title: JOURNEY_SECTION_TITLE,
        section_notes: null,
        blocks: [...blocks],
      }],
    },
  }
}
