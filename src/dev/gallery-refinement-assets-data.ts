/**
 * TASK-029 / JOURNEY-029 — one synthetic composition naming every Setup
 * equipment id once, plus the Wall ball review's medicine ball, used by the
 * accepted gallery state (`/gallery/refinements?state=assets`), the focused
 * check (`src/ui/movement-identity.test.tsx`) and the real-route proof
 * (`e2e/refinement/task-029.spec.ts`), so each reads identical prescribed data.
 *
 * Only `dumbbells` has a shipped equipment glyph; every other kind reaches
 * Review and Workout with no glyph at all, which is the readable-fallback case
 * this composition exists to show. The equipment values are the catalog's ids
 * (`src/state/onboarding.ts` EQUIPMENT) and the review fixture's
 * `medicine-ball`; none is invented here.
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import type { Prescription, SessionAcceptance } from '../state/schemas'

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

const bodyweight = { load_type: 'bodyweight' as const, load_value: null }
const unloaded = { load_type: 'none' as const, load_value: null }
const station = { session_function: 'conditioning' as const, sets: 2, rest_seconds: null }

/** Standard: the loaded lifts and machines. */
export const ASSET_STANDARD_BLOCK = block({
  exercises: [
    prescription({ exercise_id: 'back-squat', equipment: 'barbell', sets: 3, target_value: 5, load_value: 100, rest_seconds: 120 }),
    prescription({ exercise_id: 'dumbbell-bench-press', equipment: 'dumbbells', target_value: 8, load_value: 24 }),
    prescription({ exercise_id: 'cable-row', equipment: 'cable_machine', target_value: 12, load_value: 40 }),
    prescription({ exercise_id: 'leg-press', equipment: 'leg_press', target_value: 10, load_value: 120 }),
    prescription({ exercise_id: 'hack-squat', equipment: 'hack_squat', target_value: 8, load_value: 60 }),
    prescription({ exercise_id: 'leg-extension', equipment: 'leg_curl_extension', target_value: 12, load_value: 35 }),
  ],
})

/** Superset: four movements, three rounds. */
export const ASSET_SUPERSET_BLOCK = block({
  structure_type: 'superset',
  rounds: 3,
  round_rest_seconds: 90,
  exercises: [
    prescription({ exercise_id: 'kettlebell-swing', equipment: 'kettlebells', target_value: 15, load_value: 24, rest_seconds: 0 }),
    prescription({ exercise_id: 'assisted-dip', equipment: 'assisted_pullup_dip', target_value: 8, load_value: 20, rest_seconds: 0 }),
    prescription({ exercise_id: 'pull-up', equipment: 'pullup_bar', ...bodyweight, target_value: 6, rest_seconds: 0 }),
    prescription({ exercise_id: 'band-pull-apart', equipment: 'resistance_bands', ...unloaded, target_value: 15, rest_seconds: 0 }),
  ],
})

/** Circuit: the conditioning stations, the review's wall ball among them. */
export const ASSET_CIRCUIT_BLOCK = block({
  structure_type: 'circuit',
  rounds: 2,
  round_rest_seconds: 60,
  exercises: [
    prescription({ exercise_id: 'wall-ball', equipment: 'medicine-ball', ...station, target_value: 20, load_value: 9 }),
    prescription({ exercise_id: 'box-jump', equipment: 'box', ...station, ...bodyweight, target_value: 10 }),
    prescription({ exercise_id: 'battle-rope-waves', equipment: 'battle_ropes', ...station, ...unloaded, modality: 'time', target_value: 30 }),
    prescription({ exercise_id: 'row', equipment: 'rowing_machine', ...station, ...unloaded, modality: 'distance', distance_unit: 'm', target_value: 250 }),
    prescription({ exercise_id: 'assault-bike-sprint', equipment: 'assault_bike', ...station, ...unloaded, modality: 'time', target_value: 20 }),
    prescription({ exercise_id: 'air-squat', equipment: 'bodyweight', ...station, ...bodyweight, target_value: 20 }),
    prescription({ exercise_id: 'foam-roller-thoracic-extension', equipment: 'foam_roller', ...station, ...unloaded, modality: 'time', target_value: 45 }),
  ],
})

export const ASSET_BLOCKS = [ASSET_STANDARD_BLOCK, ASSET_SUPERSET_BLOCK, ASSET_CIRCUIT_BLOCK] as const

/**
 * The readable label beside each movement name, in order, in both contexts:
 * the composed equipment value read in words, never a glyph.
 */
export const ASSET_EQUIPMENT_LABELS: readonly (readonly string[])[] = [
  ['barbell', 'dumbbells', 'cable machine', 'leg press', 'hack squat', 'leg curl extension'],
  ['kettlebells', 'assisted pullup dip', 'pullup bar', 'resistance bands'],
  ['medicine ball', 'box', 'battle ropes', 'rowing machine', 'assault bike', 'bodyweight', 'foam roller'],
]
