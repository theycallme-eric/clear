/**
 * TASK-002 / JOURNEY-002: one synthetic composition for context-specific
 * actions with compact equipment, shared by the focused component check
 * (`src/ui/movement-identity.test.tsx`) and the real-route browser proof
 * (`e2e/refinement/task-002.spec.ts`), so both read identical prescribed data.
 *
 * One section: a standard block (a loaded lift with a tempo, a bodyweight
 * movement on bodyweight equipment, a bodyweight movement on a pull-up bar), a
 * superset whose first movement has a long name and long equipment, and a
 * circuit. The timed composition reuses the accepted gallery's EMOM, AMRAP and
 * For Time blocks. Synthetic and in memory only: no account, no catalog read,
 * no write.
 */
import {
  peerGroupingAcceptance,
  TIMED_BLOCKS,
} from '../dev/gallery-refinement-cards-data'
import type { SessionAcceptance } from '../state/schemas'
import { makePrescription, makeWorkoutBlock } from './factories'

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }

/** Long enough to wrap beside Swap or set progress on a phone. */
export const LONG_CONTEXT_MOVEMENT = 'single-arm-dumbbell-overhead-reverse-lunge-to-knee-drive'

export const CONTEXT_STANDARD = makeWorkoutBlock({
  exercises: [
    makePrescription({ exercise_id: 'back-squat', equipment: 'barbell', sets: 3, target_value: 5, load_type: 'absolute', load_value: 100, rest_seconds: 120, tempo: '3-1-1-0' }),
    makePrescription({ exercise_id: 'air-squat', ...bodyweight, sets: 2, target_value: 15, rest_seconds: 45 }),
    makePrescription({ exercise_id: 'pull-up', equipment: 'pull-up-bar', load_type: 'bodyweight', load_value: null, sets: 3, target_value: 6, rest_seconds: 90 }),
  ],
})

export const CONTEXT_SUPERSET = makeWorkoutBlock({
  structure_type: 'superset',
  rounds: 3,
  round_rest_seconds: 90,
  exercises: [
    makePrescription({ exercise_id: LONG_CONTEXT_MOVEMENT, equipment: 'dumbbell-pair', sets: 3, target_value: 10, load_type: 'absolute', load_value: 22, rest_seconds: 0 }),
    makePrescription({ exercise_id: 'push-up', ...bodyweight, sets: 3, target_value: 12, rest_seconds: 0 }),
  ],
})

export const CONTEXT_CIRCUIT = makeWorkoutBlock({
  structure_type: 'circuit',
  rounds: 2,
  round_rest_seconds: 60,
  exercises: [
    makePrescription({ exercise_id: 'kb-swing', equipment: 'kettlebell', sets: 2, target_value: 15, load_type: 'absolute', load_value: 24, rest_seconds: null }),
    makePrescription({ exercise_id: 'mountain-climber', ...bodyweight, sets: 2, target_value: 20, rest_seconds: null }),
  ],
})

/** JOURNEY-002's entry state: standard, superset and circuit in one section. */
export function contextActionsAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  return peerGroupingAcceptance({ locationId, blocks: [CONTEXT_STANDARD, CONTEXT_SUPERSET, CONTEXT_CIRCUIT] })
}

/** JOURNEY-002 for the timed formats: EMOM, AMRAP and For Time in one section. */
export function timedContextAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  return peerGroupingAcceptance({ locationId, blocks: [...TIMED_BLOCKS] })
}

/** The section label both contexts read: the section type's stable label. */
export const CONTEXT_SECTION = 'Accessory'

export const CONTEXT_LISTS = {
  review: { standard: 'Movements in this block', superset: 'superset, 3 rounds', circuit: 'circuit, 2 rounds' },
  workout: { standard: 'Movements in this block', superset: 'Movements in this superset', circuit: 'Movements in this circuit' },
} as const

export type ContextStructure = keyof (typeof CONTEXT_LISTS)['review']
export const CONTEXT_STRUCTURES: readonly ContextStructure[] = ['standard', 'superset', 'circuit']

export interface ContextReading {
  readonly name: string
  readonly equipment: string
  readonly load: string | null
}

/** What every movement reads in both contexts, with the profile in kilograms. */
export const CONTEXT_EXPECTED: Readonly<Record<ContextStructure, readonly ContextReading[]>> = {
  standard: [
    { name: 'back squat', equipment: 'barbell', load: '100 kg' },
    // Bodyweight beside bodyweight equipment is said once, by the equipment.
    { name: 'air squat', equipment: 'bodyweight', load: null },
    // An actual Bodyweight load on other equipment is never hidden.
    { name: 'pull up', equipment: 'pull up bar', load: 'Bodyweight' },
  ],
  superset: [
    { name: 'single arm dumbbell overhead reverse lunge to knee drive', equipment: 'dumbbell pair', load: '22 kg' },
    { name: 'push up', equipment: 'bodyweight', load: null },
  ],
  circuit: [
    { name: 'kb swing', equipment: 'kettlebell', load: '24 kg' },
    { name: 'mountain climber', equipment: 'bodyweight', load: null },
  ],
}

/** The timed lists by context, and the equipment beside each name. */
export const TIMED_LISTS = {
  review: ['emom', 'amrap', 'for time'],
  workout: ['Movements in this EMOM', 'Movements in this AMRAP', 'Movements in this block'],
} as const
export const TIMED_EQUIPMENT: readonly (readonly string[])[] = [
  ['kettlebell', 'bodyweight'],
  ['kettlebell', 'bodyweight'],
  ['medicine ball'],
]
