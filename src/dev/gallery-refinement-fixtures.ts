/**
 * Plain data for /gallery/refinements, matching the fixtures the owner-approved
 * Round 7 captures were taken from. No test factories: gallery code must not
 * reach into src/test.
 */
import type { LoggedSet } from '../state/set-logging'
import type { LadderTiming } from '../state/schemas'
import { structureIdentity, type BlockProgress, type ExerciseProgress } from '../state/workout-progress'
import { SAMPLE } from './gallery-refinement-data'

type Row = ExerciseProgress['prescription']
type Movement = readonly [exerciseId: string, equipment: string, extra?: Partial<Row>]

/** The capture harness's `exercise()` defaults: 3 × 8–12, 25 lb unless bodyweight. */
function prescription(blockId: string, index: number, [exerciseId, equipment, extra = {}]: Movement): ExerciseProgress {
  const bodyweight = equipment === 'bodyweight'
  const id = `${blockId}-${index + 1}`
  return {
    exerciseId: id, blockId, position: index + 1, status: 'not_started', setLogs: [],
    prescription: {
      ...SAMPLE.exercises[0].prescription,
      id, block_id: blockId, exercise_id: exerciseId, order_index: index, slot_id: `${id}-slot`,
      equipment_used: equipment as Row['equipment_used'],
      load_type: bodyweight ? 'bodyweight' : 'absolute', load_value: bodyweight ? null : 25,
      sets: 3, target_kind: 'range', target_min: 8, target_max: 12, target_value: null, rest_seconds: 60,
      ...extra,
    },
  }
}

interface BlockShape {
  readonly id: string
  readonly structureType?: BlockProgress['structureType']
  readonly repScheme?: BlockProgress['repScheme']
  readonly rounds?: number | null
  readonly roundRestSeconds?: number | null
  readonly timerType?: BlockProgress['timerType']
  readonly timerSeconds?: number | null
  readonly ladderTiming?: LadderTiming | null
  readonly movements: readonly Movement[]
}

function block({ id, structureType = 'standard', repScheme = 'fixed', rounds = null, roundRestSeconds = null,
  timerType = 'none', timerSeconds = null, ladderTiming = null, movements }: BlockShape): BlockProgress {
  const exercises = movements.map((movement, index) => prescription(id, index, movement))
  return {
    blockId: id, structureType, repScheme, rounds, roundRestSeconds, timerType, timerSeconds, ladderTiming,
    identity: structureIdentity({ structure_type: structureType, rounds, timer_seconds: timerSeconds, rep_scheme: repScheme }),
    status: 'not_started', exerciseCount: exercises.length, exercises,
  }
}

const FIXED = (value: number): Partial<Row> => ({ target_kind: 'fixed', target_value: value, target_min: null, target_max: null })

export const PRIMARY_LIFT = block({ id: 'gallery-primary', movements: [
  ['bench-press', 'barbell', { ...FIXED(5), load_value: 95, rest_seconds: 180 }],
] })
export const OTHER_LIFT = block({ id: 'gallery-other', movements: [['bicep-curl', 'dumbbell', FIXED(10)]] })
export const TIMED_MOVEMENT = block({ id: 'gallery-time', movements: [['plank', 'bodyweight', { ...FIXED(30), modality: 'time' }]] })
export const DISTANCE_MOVEMENT = block({ id: 'gallery-distance', movements: [
  ['farmers-carry', 'dumbbell', { ...FIXED(20), modality: 'distance', distance_unit: 'm' }],
] })
export const SUPERSET = block({ id: 'gallery-superset', structureType: 'superset', rounds: 3, roundRestSeconds: 90,
  movements: [['one-arm-row', 'dumbbell'], ['bicep-curl', 'dumbbell']] })
export const CIRCUIT = block({ id: 'gallery-circuit', structureType: 'circuit', rounds: 3, roundRestSeconds: 45, movements: [
  ['goblet-squat', 'kettlebell', { ...FIXED(8), sets: 1 }],
  ['push-up', 'bodyweight', { ...FIXED(8), sets: 1 }],
] })

const PRIMARY_ID = PRIMARY_LIFT.exercises[0].exerciseId

function savedSet(setNumber: number, effort: LoggedSet['effort']): LoggedSet {
  return { id: `${PRIMARY_ID}-saved-${setNumber}`, setNumber, reps: 5, durationSeconds: null, distance: null,
    distanceUnit: null, weight: 95, weightUnit: 'lb', isWarmup: false, effort, status: 'logged' }
}

/** Set correction: one saved set. Extra set: all three prescribed sets saved. */
export const ONE_SAVED_SET = { [PRIMARY_ID]: [savedSet(1, 'about_right')] }
export const ALL_SETS_SAVED = { [PRIMARY_ID]: [savedSet(1, 'about_right'), savedSet(2, null), savedSet(3, null)] }

export type TimedKind = 'emom' | 'amrap' | 'for_time' | 'ladder'

/** The structure-spectrum blocks; `multi` adds the second movement used for the results captures. */
export function timedBlock(kind: TimedKind, { multi = false, rounds = 4 }: { multi?: boolean; rounds?: number } = {}): BlockProgress {
  const id = `gallery-${kind}${multi ? '-multi' : ''}-${rounds}`
  if (kind === 'ladder') return block({ id, structureType: 'for_time', repScheme: 'ladder_up', timerType: 'countdown', timerSeconds: 420,
    ladderTiming: { mode: 'capped_window', rounds, interval_seconds: null, cap_seconds: 420 },
    movements: [
      ['push-up', 'bodyweight', { sets: null, rest_seconds: null, target_kind: 'sequence', target_value: null, target_min: null,
        target_max: null, target_sequence: Array.from({ length: rounds }, (_, i) => (i + 1) * 2) }],
      ['burpee', 'bodyweight', { ...FIXED(4), sets: null, rest_seconds: null }],
    ] })
  if (kind === 'emom') return block({ id, structureType: 'emom', repScheme: 'n_plus_one', timerType: 'per_minute', timerSeconds: 600,
    movements: [['kb-swing', 'kettlebell', { ...FIXED(12), load_value: 24, is_interval_exercise: true }]] })
  if (kind === 'amrap') return block({ id, structureType: 'amrap', repScheme: 'inverse', timerType: 'countdown', timerSeconds: 480,
    movements: [
      ['burpee', 'bodyweight', { ...FIXED(10), sets: null }],
      ...(multi ? [['kb-swing', 'kettlebell', { ...FIXED(12), sets: 1, load_value: 24 }] as const] : []),
    ] })
  return block({ id, structureType: 'for_time', repScheme: 'fixed', timerType: 'count_up', timerSeconds: 900,
    movements: [
      ['wall-ball', 'medicine-ball', { ...FIXED(40), sets: 1, load_value: 9 }],
      ...(multi ? [['burpee', 'bodyweight', { ...FIXED(40), sets: 1 }] as const] : []),
    ] })
}
