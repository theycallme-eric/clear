/**
 * TASK-013 / JOURNEY-013: one synthetic composition for rep-first ordered live
 * ladder progress and its result handoff, shared by the focused check
 * (`src/ui/timed-workout-flow.test.tsx`, the TASK-013 cases) and the
 * real-route browser proof (`e2e/refinement/task-013.spec.ts`), so both
 * perform identical data.
 *
 * Two sections. The first holds two true timed ladders shaped as differently
 * as the data allows, neither the accepted screenshot's (push up 2…24, a fixed
 * burpee, 07:00), so no screenshot constant can pass either:
 *
 *   · `LONG_LADDER` — twelve rungs: a 16 kg kettlebell swing rising three reps
 *     a round, 3 → 36, so its targets have one digit and two, with a fixed
 *     200 m row in every round, inside one 09:00 cap on the whole ladder
 *     (`capped_window`). Counted in reps.
 *   · `SHORT_LADDER` — four rungs: a plank held 5, 10, 15 then 20 seconds, one
 *     digit and two again, alone, raced For Time under the block's 15:00 cap.
 *     Counted in seconds.
 *
 * Its forward action is the shell's `Next section`, the one action that saves
 * both blocks' results. The second section is a short standard cooldown, the
 * destination. (A ladder with no cap at all is a direct mount in the focused
 * check: a For Time block must carry its clock to be accepted.)
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import { peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import type { LadderTiming, SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { makePrescription, makeWorkoutBlock } from './factories'
import { formatBadgesSnapshot } from './format-badges-fixture'

const timed = { sets: null, rest_seconds: null, session_function: 'conditioning' as const }

/** The long ladder's rungs and its one cap on the whole ladder. */
export const LONG_ROUNDS = 12
export const LONG_CAP_SECONDS = 540
/** Kettlebell swing 3, 6, 9 … 36: one-digit and two-digit targets in one ladder. */
export const LONG_TARGETS: readonly number[] = Array.from({ length: LONG_ROUNDS }, (_, index) => (index + 1) * 3)
export const LONG_TIMING: LadderTiming = { mode: 'capped_window', rounds: LONG_ROUNDS, interval_seconds: null, cap_seconds: LONG_CAP_SECONDS }

export const LONG_LADDER = makeWorkoutBlock({
  structure_type: 'for_time',
  timer_type: 'countdown',
  timer_seconds: LONG_CAP_SECONDS,
  rep_scheme: 'ladder_up',
  ladder_timing: LONG_TIMING,
  exercises: [
    makePrescription({
      exercise_id: 'kettlebell-swing', equipment: 'kettlebell', ...timed,
      target_kind: 'sequence', target_value: null, target_sequence: [...LONG_TARGETS],
      load_type: 'absolute', load_value: 16,
    }),
    makePrescription({
      exercise_id: 'row', equipment: 'rower', ...timed,
      modality: 'distance', distance_unit: 'm', target_value: 200,
      load_type: 'none', load_value: null,
    }),
  ],
})

/** The short ladder's rungs and its block cap. */
export const SHORT_ROUNDS = 4
export const SHORT_CAP_SECONDS = 900
/** Plank 5, 10, 15, 20 seconds: one digit and two, in seconds rather than reps. */
export const SHORT_TARGETS: readonly number[] = [5, 10, 15, 20]
export const SHORT_TIMING: LadderTiming = { mode: 'for_time', rounds: SHORT_ROUNDS, interval_seconds: null, cap_seconds: null }

export const SHORT_LADDER = makeWorkoutBlock({
  structure_type: 'for_time',
  timer_type: 'countdown',
  timer_seconds: SHORT_CAP_SECONDS,
  rep_scheme: 'ladder_up',
  ladder_timing: SHORT_TIMING,
  exercises: [
    makePrescription({
      exercise_id: 'plank', equipment: 'bodyweight', ...timed,
      modality: 'time', target_kind: 'sequence', target_value: null, target_sequence: [...SHORT_TARGETS],
      load_type: 'bodyweight', load_value: null,
    }),
  ],
})

/** The two ladders' units, as their rungs are counted (`ladderUnit`). */
export const LONG_UNIT = 'reps'
export const SHORT_UNIT = 'sec'

/** The ladders' round grids, named alike; the cards are told apart by their timing lines. */
export const LADDER_ROUNDS_LIST = 'Rounds in this ladder'
export const LONG_TIMING_LINE = '12 rounds · 09:00 cap on the whole ladder'
export const SHORT_TIMING_LINE = '4 rounds · for time, at your pace · 15:00 cap'

/** The two sections' headings, as the live shell names them by section type. */
export const HANDOFF_SECTION_TITLE = 'Conditioning'
export const HANDOFF_COOLDOWN_TITLE = 'Cooldown'

/** The log's question, its two answers and the rep-first tiles' legend. */
export const WORK_COMPLETED = 'Work completed'
export const ROUNDS_COMPLETED = 'Rounds completed'

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

/** JOURNEY-013's entry: the two ladders ready in the first section, a cooldown after. */
export function ladderHandoffAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  const base = peerGroupingAcceptance({ locationId, blocks: [LONG_LADDER, SHORT_LADDER] })
  const [section] = base.workout.sections
  return {
    ...base,
    prompt_version: 'gallery-task-013',
    workout: {
      ...base.workout,
      title: 'Synthetic ladder progress workout',
      sections: [
        { ...section, section_type: 'conditioning', section_title: 'Ladders' },
        {
          section_type: 'cooldown',
          section_title: HANDOFF_COOLDOWN_TITLE,
          section_notes: null,
          blocks: [COOLDOWN_BLOCK],
        },
      ],
    },
  }
}

/**
 * The snapshot the session reads answer — prescribed, or running with
 * `startedAt` — with each ladder's explicit timing on its row.
 */
export function ladderHandoffSnapshot(
  acceptance: SessionAcceptance,
  options: { userId?: string; startedAt?: string | null } = {},
): SessionSnapshot {
  return formatBadgesSnapshot(acceptance, options)
}

/** The two ladders as the live shell hands them to their renderer. */
export function ladderHandoffBlocks(snapshot: SessionSnapshot): { long: BlockProgress; short: BlockProgress } {
  const [long, short] = sessionProgress(snapshot).sections[0].blocks
  return { long, short }
}
