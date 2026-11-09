/**
 * TASK-003 / JOURNEY-003: one synthetic composition for consistent format
 * badges and truthful prescribed load, shared by the focused check
 * (`src/ui/block-panel.test.tsx`) and the real-route browser proof
 * (`e2e/refinement/task-003.spec.ts`), so both read identical prescribed data.
 *
 * One section holds the formats the journey names — standard, grouped
 * (superset and circuit), EMOM, AMRAP, plain For Time and a true timed ladder
 * (an explicit `capped_window` timing, as R38's matched sample) — with the same
 * source prescriptions in Review and Workout. Every load meaning `loadText`
 * knows is present: an absolute weight, a percentage of one-rep max, reps in
 * reserve, last session and bodyweight. Each timed movement carries a generic
 * `rest_seconds` (the annotated `Rest 60s`) and the EMOM carries the block's
 * own rest window, so the check can tell the two apart (C11).
 *
 * The circuit is the verified circuit (R04): a loaded kettlebell movement whose
 * actual weight is entered in the live circuit's optional logger. Its loaded
 * movement is an accessory-function lift, so it can carry an OVR-01c anchor;
 * `circuitAnchors()` provides one, beside the standard block's back squat, for
 * the Change-weight check (AC-R003-04).
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import { peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import type {
  AnchorEvidenceRow,
  LadderTiming,
  LoadAnchorRow,
  SessionAcceptance,
  SessionSnapshot,
} from '../state/schemas'
import { makePrescription, makeWorkoutBlock } from './factories'
import { peerGroupingSnapshot } from './peer-grouping-fixture'

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }
/** The generic per-movement rest the owner crossed out in timed Review (R41, R47, R60). */
const GENERIC_REST = 60
const timed = { sets: null, rest_seconds: GENERIC_REST, session_function: 'conditioning' as const }

/** Standard: one lift per load meaning, each with its own planned rest. */
export const FORMAT_STANDARD = makeWorkoutBlock({
  exercises: [
    makePrescription({ exercise_id: 'back-squat', equipment: 'barbell', session_function: 'primary', sets: 3, target_value: 5, load_type: 'absolute', load_value: 100, rest_seconds: 120 }),
    makePrescription({ exercise_id: 'front-squat', equipment: 'barbell', session_function: 'accessory', sets: 3, target_value: 6, load_type: 'percent_1rm', load_value: 75, rest_seconds: 90 }),
    makePrescription({ exercise_id: 'romanian-deadlift', equipment: 'barbell', session_function: 'accessory', sets: 3, target_value: 8, load_type: 'rir', load_value: 2, rest_seconds: 90 }),
    makePrescription({ exercise_id: 'bench-press', equipment: 'barbell', session_function: 'accessory', sets: 3, target_value: 8, load_type: 'prior_session', load_value: null, rest_seconds: 90 }),
  ],
})

/** Superset: a dumbbell pair, whose per-hand reading is its equipment's, and a bodyweight partner. */
export const FORMAT_SUPERSET = makeWorkoutBlock({
  structure_type: 'superset',
  rounds: 3,
  round_rest_seconds: 90,
  exercises: [
    makePrescription({ exercise_id: 'dumbbell-row', equipment: 'dumbbell-pair', session_function: 'accessory', sets: 3, target_value: 10, load_type: 'absolute', load_value: 22, rest_seconds: 0 }),
    makePrescription({ exercise_id: 'push-up', ...bodyweight, session_function: 'accessory', sets: 3, target_value: 12, rest_seconds: 0 }),
  ],
})

/** The verified circuit (R04): a loaded kettlebell and a bodyweight movement, two rounds. */
export const FORMAT_CIRCUIT = makeWorkoutBlock({
  structure_type: 'circuit',
  rounds: 2,
  round_rest_seconds: 60,
  exercises: [
    makePrescription({ exercise_id: 'kb-swing', equipment: 'kettlebell', session_function: 'accessory', sets: 2, target_value: 15, load_type: 'absolute', load_value: 24, rest_seconds: null }),
    makePrescription({ exercise_id: 'mountain-climber', ...bodyweight, session_function: 'conditioning', sets: 2, target_value: 20, rest_seconds: null }),
  ],
})

/** EMOM: ten minutes, two movements alternating, a 15-second rest window in each minute. */
export const FORMAT_EMOM = makeWorkoutBlock({
  structure_type: 'emom',
  timer_type: 'per_minute',
  timer_seconds: 600,
  round_rest_seconds: 15,
  exercises: [
    makePrescription({ exercise_id: 'kb-clean', equipment: 'kettlebell', ...timed, target_value: 8, load_type: 'absolute', load_value: 20, is_interval_exercise: true }),
    makePrescription({ exercise_id: 'burpee', ...bodyweight, ...timed, target_value: 10, is_interval_exercise: true }),
  ],
})

/** AMRAP: eight minutes, two movements per round. */
export const FORMAT_AMRAP = makeWorkoutBlock({
  structure_type: 'amrap',
  timer_type: 'countdown',
  timer_seconds: 480,
  exercises: [
    makePrescription({ exercise_id: 'goblet-squat', equipment: 'kettlebell', ...timed, target_value: 12, load_type: 'absolute', load_value: 16 }),
    makePrescription({ exercise_id: 'sit-up', ...bodyweight, ...timed, target_value: 15 }),
  ],
})

/** Plain For Time: one loaded medicine-ball movement under a fifteen-minute cap. */
export const FORMAT_FOR_TIME = makeWorkoutBlock({
  structure_type: 'for_time',
  timer_type: 'count_up',
  timer_seconds: 900,
  exercises: [
    makePrescription({ exercise_id: 'wall-ball', equipment: 'medicine-ball', ...timed, target_value: 40, load_type: 'absolute', load_value: 9 }),
  ],
})

/** The ladder's explicit timing: four rungs inside a ten-minute cap. */
export const FORMAT_LADDER_TIMING: LadderTiming = { mode: 'capped_window', rounds: 4, interval_seconds: null, cap_seconds: 600 }

/** True timed ladder (R38): For Time, ladder up, explicit capped-window timing, a loaded movement. */
export const FORMAT_LADDER = makeWorkoutBlock({
  structure_type: 'for_time',
  timer_type: 'countdown',
  timer_seconds: 600,
  rep_scheme: 'ladder_up',
  ladder_timing: FORMAT_LADDER_TIMING,
  exercises: [
    makePrescription({ exercise_id: 'dumbbell-thruster', equipment: 'dumbbell-pair', ...timed, target_kind: 'sequence', target_value: null, target_sequence: [2, 4, 6, 8], load_type: 'absolute', load_value: 15 }),
  ],
})

/** In the order the section performs them. */
export const FORMAT_BLOCKS = [
  FORMAT_STANDARD,
  FORMAT_SUPERSET,
  FORMAT_CIRCUIT,
  FORMAT_EMOM,
  FORMAT_AMRAP,
  FORMAT_FOR_TIME,
  FORMAT_LADDER,
] as const

export type FormatKey = 'standard' | 'superset' | 'circuit' | 'emom' | 'amrap' | 'for_time' | 'ladder'
export const FORMAT_KEYS: readonly FormatKey[] = ['standard', 'superset', 'circuit', 'emom', 'amrap', 'for_time', 'ladder']

/** JOURNEY-003's entry state: every format in one section, the profile in kilograms. */
export function formatBadgesAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  return peerGroupingAcceptance({ locationId, blocks: [...FORMAT_BLOCKS] })
}

/**
 * The snapshot `persist_session` answers for the acceptance, carrying the
 * ladder's explicit timing on its block row as the database stores it.
 */
export function formatBadgesSnapshot(
  acceptance: SessionAcceptance,
  options: { userId?: string; startedAt?: string | null } = {},
): SessionSnapshot {
  const snapshot = peerGroupingSnapshot(acceptance, options)
  return {
    ...snapshot,
    sections: snapshot.sections.map((section, sectionIndex) => ({
      ...section,
      blocks: section.blocks.map((entry, blockIndex) => {
        const timing = acceptance.workout.sections[sectionIndex]?.blocks[blockIndex]?.ladder_timing ?? null
        return timing === null ? entry : { ...entry, block: { ...entry.block, ladder_timing: timing } }
      }),
    })),
  }
}

/** The section label both contexts read: the section type's stable label. */
export const FORMAT_SECTION = 'Accessory'

/**
 * C08: the badge's words, block by block. Review draws no badge on a plain
 * standard block (a `STANDARD` badge on every lift says nothing); the live
 * card names every block.
 */
export const FORMAT_BADGES: Readonly<Record<'review' | 'workout', readonly (string | null)[]>> = {
  review: [null, 'SUPERSET', 'CIRCUIT', 'EMOM', 'AMRAP', 'FOR TIME', 'LADDER'],
  workout: ['STANDARD', 'SUPERSET', 'CIRCUIT', 'EMOM', 'AMRAP', 'FOR TIME', 'LADDER'],
}

/**
 * C08, AC-R003-01: what the badge leaves out, read beside it — duration, cap,
 * rounds and scheme. The words the badge carried before, moved: Review states a
 * superset's shared set count as its rounds; the live superset states it as
 * each movement's `Set 1/3` and `3 × 10 reps`, as it already did.
 */
export const FORMAT_DETAILS: Readonly<Record<'review' | 'workout', readonly (string | null)[]>> = {
  review: [null, '3 ROUNDS', '2 ROUNDS', '10 MIN', '8 MIN', '15 MIN CAP', '10 MIN CAP · LADDER UP'],
  workout: [null, null, '2 ROUNDS', '10 MIN', '8 MIN', '15 MIN CAP', '10 MIN CAP · LADDER UP'],
}

export interface FormatReading {
  readonly name: string
  readonly load: string | null
}

/**
 * C10, AC-R003-02: each movement's prescribed load through the existing
 * `loadText` formatter and the profile's unit, identical in Review and in the
 * live workout. A `Bodyweight` beside bodyweight equipment is said once, by
 * the equipment (AC-R002-01).
 */
export const FORMAT_LOADS: Readonly<Record<FormatKey, readonly FormatReading[]>> = {
  standard: [
    { name: 'back squat', load: '100 kg' },
    { name: 'front squat', load: '75% 1RM' },
    { name: 'romanian deadlift', load: '2 RIR' },
    { name: 'bench press', load: 'Match last session' },
  ],
  superset: [
    { name: 'dumbbell row', load: '22 kg' },
    { name: 'push up', load: null },
  ],
  circuit: [
    { name: 'kb swing', load: '24 kg' },
    { name: 'mountain climber', load: null },
  ],
  emom: [
    { name: 'kb clean', load: '20 kg' },
    { name: 'burpee', load: null },
  ],
  amrap: [
    { name: 'goblet squat', load: '16 kg' },
    { name: 'sit up', load: null },
  ],
  for_time: [{ name: 'wall ball', load: '9 kg' }],
  ladder: [{ name: 'dumbbell thruster', load: '15 kg' }],
}

/** The lists each context names its movements by, block by block. */
export const FORMAT_LISTS = {
  review: ['Movements in this block', 'superset, 3 rounds', 'circuit, 2 rounds', 'emom', 'amrap', 'for time', 'for time'],
  workout: [
    'Movements in this block', 'Movements in this superset', 'Movements in this circuit',
    'Movements in this EMOM', 'Movements in this AMRAP', 'Movements in this block', 'Rounds in this ladder',
  ],
} as const

const USER_ID = 'a0000001-0000-4000-8000-000000000000'

/**
 * OVR-01c anchors for the verified circuit's kettlebell swing and the standard
 * block's back squat, so both carry a suggestion in Review (AC-R003-04).
 */
export function circuitAnchors(): LoadAnchorRow[] {
  const anchor = (exerciseId: string, equipment: string, value: number): LoadAnchorRow => ({
    user_id: USER_ID,
    exercise_id: exerciseId,
    equipment_used: equipment,
    anchor_value: value,
    unit: 'kg',
    confidence: 'high',
    session_count: 4,
    last_session_date: '2026-11-02',
    updated_at: '2026-11-02T18:00:00.000Z',
  })
  return [anchor('back-squat', 'barbell', 120), anchor('kb-swing', 'kettlebell', 28)]
}

/** The working sets behind those anchors, all on target. */
export function circuitAnchorEvidence(): AnchorEvidenceRow[] {
  const sets = (exerciseId: string, equipment: string, weight: number, reps: number) =>
    [1, 2, 3].map((setNumber) => ({
      session_id: 'b0000001-0000-4000-8000-000000000000',
      session_date: '2026-11-02',
      logged_at: `2026-11-02T17:0${setNumber}:00.000Z`,
      exercise_id: exerciseId,
      equipment_used: equipment,
      set_number: setNumber,
      actual_reps: reps,
      prescribed_reps: reps,
      weight,
      weight_unit: 'kg' as const,
      rpe: 7.5,
    }))
  return [...sets('back-squat', 'barbell', 95, 5), ...sets('kb-swing', 'kettlebell', 24, 15)]
}
