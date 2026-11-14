/**
 * TASK-005 / JOURNEY-005: one synthetic composition for the grouped Coaching and
 * notes disclosure, shared by the focused check
 * (`src/ui/group-exercise-coaching.test.tsx`) and the real-route browser proof
 * (`e2e/refinement/task-005.spec.ts`), so both read identical prescribed data
 * and identical library answers.
 *
 * One section: a standard block (one lift, which keeps its own panel), a
 * superset and a circuit, each a grouped block with several movements whose
 * guidance answers differ — written cues and regression, blank cues and
 * regression, no library entry at all, a read that fails until retried, and a
 * read that stays loading. Synthetic and in memory only: no account, no real
 * catalog, no real row.
 */
import { peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import type { ExerciseDefinitionRow, SessionAcceptance } from '../state/schemas'
import { makePrescription, makeWorkoutBlock } from './factories'

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }

export const COACHING_STANDARD = makeWorkoutBlock({
  exercises: [
    makePrescription({ exercise_id: 'back-squat', equipment: 'barbell', sets: 3, target_value: 5, load_type: 'absolute', load_value: 100, rest_seconds: 120 }),
  ],
})

export const COACHING_SUPERSET = makeWorkoutBlock({
  structure_type: 'superset',
  rounds: 3,
  round_rest_seconds: 90,
  exercises: [
    makePrescription({ exercise_id: 'dumbbell-bench-press', equipment: 'dumbbell-pair', sets: 3, target_value: 10, load_type: 'absolute', load_value: 22, rest_seconds: 0 }),
    makePrescription({ exercise_id: 'chest-supported-row', equipment: 'dumbbell-pair', sets: 3, target_value: 12, load_type: 'absolute', load_value: 18, rest_seconds: 0 }),
  ],
})

export const COACHING_CIRCUIT = makeWorkoutBlock({
  structure_type: 'circuit',
  rounds: 2,
  round_rest_seconds: 60,
  exercises: [
    makePrescription({ exercise_id: 'kb-swing', equipment: 'kettlebell', sets: 2, target_value: 15, load_type: 'absolute', load_value: 24, rest_seconds: null }),
    makePrescription({ exercise_id: 'mountain-climber', ...bodyweight, sets: 2, target_value: 20, rest_seconds: null }),
    makePrescription({ exercise_id: 'goblet-squat', equipment: 'kettlebell', sets: 2, target_value: 12, load_type: 'absolute', load_value: 16, rest_seconds: null }),
  ],
})

/** JOURNEY-005's entry state: a standard lift, a superset and a circuit in one section. */
export function groupedCoachingAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  return peerGroupingAcceptance({ locationId, blocks: [COACHING_STANDARD, COACHING_SUPERSET, COACHING_CIRCUIT] })
}

/** The list names each context reads, by block. */
export const COACHING_LISTS = {
  review: { standard: 'Movements in this block', superset: 'superset, 3 rounds', circuit: 'circuit, 2 rounds' },
  workout: { standard: 'Movements in this block', superset: 'Movements in this superset', circuit: 'Movements in this circuit' },
} as const

/** Each grouped block's movements, in order: the sections its disclosure labels. */
export const GROUPED_MOVEMENTS = {
  superset: ['dumbbell bench press', 'chest supported row'],
  circuit: ['kb swing', 'mountain climber', 'goblet squat'],
} as const

/**
 * The accessible name of a grouped block's disclosure: its visible label (the
 * accepted words), then the block's format and movements for assistive
 * technology.
 */
export function groupDisclosureName(format: string, names: readonly string[]): string {
  return `Coaching and notes — ${format}: ${names.join(', ')}`
}

/** Each grouped block's format, in its badge's words. */
export const GROUPED_FORMATS = { superset: 'SUPERSET', circuit: 'CIRCUIT' } as const

/**
 * How the library answers each slug. `written`: cues and a regression.
 * `blank`: an entry with no cues and no regression. `absent`: no entry.
 * `fails-once`: the read fails, and a retry answers `written`. `held`: the
 * read has not answered yet.
 */
export type GuidanceAnswer = 'written' | 'blank' | 'absent' | 'fails-once' | 'held'

export const COACHING_GUIDANCE: Readonly<Record<string, GuidanceAnswer>> = {
  'back-squat': 'written',
  'dumbbell-bench-press': 'written',
  'chest-supported-row': 'absent',
  'kb-swing': 'written',
  'mountain-climber': 'blank',
  'goblet-squat': 'fails-once',
}

/** The cues a written entry carries, so each section's own words are checkable. */
export function writtenDefinition(slug: string): ExerciseDefinitionRow {
  return {
    id: slug,
    name: slug.replaceAll('-', ' '),
    coaching_cues: [`Cue for ${slug.replaceAll('-', ' ')}`, 'Breathe out on the effort'],
    regression: `Easier ${slug.replaceAll('-', ' ')}`,
    progression: null,
  }
}

export function blankDefinition(slug: string): ExerciseDefinitionRow {
  return { id: slug, name: slug.replaceAll('-', ' '), coaching_cues: [], regression: null, progression: null }
}
