/**
 * TASK-015 / JOURNEY-015: one synthetic composition for truthful per-movement
 * partial and actual-load entry, shared by the focused check
 * (`src/ui/timed-result-log.test.tsx`, the TASK-015 cases) and the real-route
 * browser proof (`e2e/refinement/task-015.spec.ts`), so both perform
 * identical data.
 *
 * Three sections, shaped so every rule of the TASK-030 contract has a movement
 * to show it on, and none of them the accepted screenshot's:
 *
 *   · **Conditioning** — the AMRAP: a 24 kg kettlebell swing (loaded, reps),
 *     a bodyweight burpee (unloaded, reps) and a 200 m row on the rowing
 *     machine (unloaded, distance in metres), as one round, eight minutes.
 *     The single-pass For Time: forty wall balls with a 9 kg medicine ball
 *     (loaded, reps) and a 60 s plank (unloaded, seconds), under a 15:00 cap.
 *     The four-rung ladder: a 20 kg goblet squat and a bodyweight push up
 *     rising 2 → 8 together, raced under a 07:00 cap — a loaded and an
 *     unloaded laddered movement, so the rung's target bounds one and only the
 *     other takes no load.
 *   · **Core** — the multi-round For Time: three rounds of ten 40 kg thrusters
 *     and ten burpees under a 10:00 cap (`rounds: 3`), the race the owner
 *     decided takes loads only.
 *   · **Cooldown** — one bodyweight movement, the destination.
 *
 * Each section's forward action is the shell's `Next section`. Synthetic and
 * in memory only: no account, no catalog read, no write.
 */
import { peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import type { LadderTiming, SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { makePrescription, makeWorkoutBlock } from './factories'
import { formatBadgesSnapshot } from './format-badges-fixture'

const timed = { sets: null, rest_seconds: null, session_function: 'conditioning' as const }

/** The AMRAP's window and the lists each card names its work by. */
export const ACTUALS_AMRAP_WINDOW_SECONDS = 480
export const ACTUALS_AMRAP_WORK_LIST = 'Movements in this AMRAP'
export const ACTUALS_FOR_TIME_WORK_LIST = 'Movements in this block'
export const ACTUALS_LADDER_WORK_LIST = 'Rounds in this ladder'

/** The single-pass For Time's cap and the ladder's cap and rungs. */
export const ACTUALS_FOR_TIME_CAP_SECONDS = 900
export const ACTUALS_LADDER_CAP_SECONDS = 420
export const ACTUALS_LADDER_ROUNDS = 4
export const ACTUALS_LADDER_TARGETS: readonly number[] = [2, 4, 6, 8]
/** The multi-round race: three rounds under a 10:00 cap. */
export const ACTUALS_RACE_ROUNDS = 3
export const ACTUALS_RACE_CAP_SECONDS = 600

/** The three sections' headings, as the live shell names them by section type. */
export const ACTUALS_SECTION_TITLE = 'Conditioning'
export const ACTUALS_RACE_SECTION_TITLE = 'Core'
export const ACTUALS_COOLDOWN_TITLE = 'Cooldown'

/** The prescribed loads, in kilograms — targets the log must never fill a field from. */
export const ACTUALS_PLANNED_LOADS = { kettlebellSwing: 24, wallBall: 9, gobletSquat: 20, thruster: 40 } as const

export const ACTUALS_LADDER_TIMING: LadderTiming = {
  mode: 'for_time',
  rounds: ACTUALS_LADDER_ROUNDS,
  interval_seconds: null,
  cap_seconds: null,
}

export const ACTUALS_AMRAP_BLOCK = makeWorkoutBlock({
  structure_type: 'amrap',
  timer_type: 'countdown',
  timer_seconds: ACTUALS_AMRAP_WINDOW_SECONDS,
  exercises: [
    makePrescription({ exercise_id: 'kettlebell-swing', equipment: 'kettlebell', ...timed, target_value: 12, load_type: 'absolute', load_value: ACTUALS_PLANNED_LOADS.kettlebellSwing }),
    makePrescription({ exercise_id: 'burpee', equipment: 'bodyweight', ...timed, target_value: 8, load_type: 'bodyweight', load_value: null }),
    makePrescription({
      exercise_id: 'row', equipment: 'rowing_machine', ...timed,
      modality: 'distance', distance_unit: 'm', target_value: 200, load_type: 'none', load_value: null,
    }),
  ],
})

export const ACTUALS_FOR_TIME_BLOCK = makeWorkoutBlock({
  structure_type: 'for_time',
  timer_type: 'count_up',
  timer_seconds: ACTUALS_FOR_TIME_CAP_SECONDS,
  exercises: [
    makePrescription({ exercise_id: 'wall-ball', equipment: 'medicine_ball', ...timed, target_value: 40, load_type: 'absolute', load_value: ACTUALS_PLANNED_LOADS.wallBall }),
    makePrescription({ exercise_id: 'plank', equipment: 'bodyweight', ...timed, modality: 'time', target_value: 60, load_type: 'bodyweight', load_value: null }),
  ],
})

export const ACTUALS_LADDER_BLOCK = makeWorkoutBlock({
  structure_type: 'for_time',
  timer_type: 'countdown',
  timer_seconds: ACTUALS_LADDER_CAP_SECONDS,
  rep_scheme: 'ladder_up',
  ladder_timing: ACTUALS_LADDER_TIMING,
  exercises: [
    makePrescription({
      exercise_id: 'goblet-squat', equipment: 'kettlebell', ...timed,
      target_kind: 'sequence', target_value: null, target_sequence: [...ACTUALS_LADDER_TARGETS],
      load_type: 'absolute', load_value: ACTUALS_PLANNED_LOADS.gobletSquat,
    }),
    makePrescription({
      exercise_id: 'push-up', equipment: 'bodyweight', ...timed,
      target_kind: 'sequence', target_value: null, target_sequence: [...ACTUALS_LADDER_TARGETS],
      load_type: 'bodyweight', load_value: null,
    }),
  ],
})

export const ACTUALS_RACE_BLOCK = makeWorkoutBlock({
  structure_type: 'for_time',
  timer_type: 'count_up',
  timer_seconds: ACTUALS_RACE_CAP_SECONDS,
  rounds: ACTUALS_RACE_ROUNDS,
  exercises: [
    makePrescription({ exercise_id: 'thruster', equipment: 'barbell', ...timed, target_value: 10, load_type: 'absolute', load_value: ACTUALS_PLANNED_LOADS.thruster }),
    makePrescription({ exercise_id: 'burpee', equipment: 'bodyweight', ...timed, target_value: 10, load_type: 'bodyweight', load_value: null }),
  ],
})

const COOLDOWN_BLOCK = makeWorkoutBlock({
  exercises: [
    makePrescription({
      exercise_id: 'childs-pose',
      equipment: 'bodyweight',
      session_function: 'recovery',
      sets: 1,
      target_value: 1,
      load_type: 'bodyweight',
      load_value: null,
      rest_seconds: null,
    }),
  ],
})

/** JOURNEY-015's entry: the three timed blocks ready in the first section, the race in the second, a cooldown after. */
export function timedActualsAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  const base = peerGroupingAcceptance({ locationId, blocks: [ACTUALS_AMRAP_BLOCK, ACTUALS_FOR_TIME_BLOCK, ACTUALS_LADDER_BLOCK] })
  const [section] = base.workout.sections
  return {
    ...base,
    prompt_version: 'gallery-task-015',
    workout: {
      ...base.workout,
      title: 'Synthetic per-movement actuals workout',
      sections: [
        { ...section, section_type: 'conditioning', section_title: 'Finisher' },
        { section_type: 'core', section_title: 'Three rounds', section_notes: null, blocks: [ACTUALS_RACE_BLOCK] },
        { section_type: 'cooldown', section_title: ACTUALS_COOLDOWN_TITLE, section_notes: null, blocks: [COOLDOWN_BLOCK] },
      ],
    },
  }
}

/** The snapshot the session reads answer — prescribed, or running with `startedAt` — with the ladder's timing on its row. */
export function timedActualsSnapshot(
  acceptance: SessionAcceptance,
  options: { userId?: string; startedAt?: string | null } = {},
): SessionSnapshot {
  return formatBadgesSnapshot(acceptance, options)
}

/** The four timed blocks as the live shell hands them to their renderers. */
export function timedActualsBlocks(snapshot: SessionSnapshot): { amrap: BlockProgress; forTime: BlockProgress; ladder: BlockProgress; race: BlockProgress } {
  const progress = sessionProgress(snapshot)
  const [amrap, forTime, ladder] = progress.sections[0].blocks
  const [race] = progress.sections[1].blocks
  return { amrap, forTime, ladder, race }
}
