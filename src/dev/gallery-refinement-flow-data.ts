/**
 * TASK-006 (C17, C18, G05; R39, R48, R66, R68) — the synthetic timed ladders
 * the accepted `/gallery/refinements?state=ladder-4` and `?state=ladder-12`
 * states draw, and the real-route proof reads (`src/test/timed-actions-fixture.ts`,
 * `e2e/refinement/task-006.spec.ts`), so the gallery and the route perform
 * identical prescribed data.
 *
 * The accepted reference's ladder (`gallery-refinement-flow.tsx` at
 * eded158c…, `sampleBlock('ladder', rounds)`): For Time, ladder up, a push up
 * rising two reps a round and a fixed burpee companion every round, inside one
 * 07:00 cap. Here the cap is the block's explicit `capped_window` timing, so
 * the route's own long-ladder renderer draws every round — the repetitive list
 * the top Start exception exists to skip (R66).
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import type { LadderTiming, Prescription, SessionAcceptance } from '../state/schemas'
import { structureIdentity, type BlockProgress } from '../state/workout-progress'
import { galleryExerciseProgress } from './gallery-refinement-coaching-data'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

/** The reference ladder's one cap on the whole ladder: 07:00. */
export const LADDER_CAP_SECONDS = 420

/** The two accepted round counts (R117): four, and the long twelve. */
export const LADDER_ROUND_COUNTS = [4, 12] as const
export type LadderRoundCount = (typeof LADDER_ROUND_COUNTS)[number]

function movement(overrides: Partial<Prescription> & Pick<Prescription, 'exercise_id'>): Prescription {
  return {
    session_function: 'conditioning',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: null,
    target_kind: 'fixed',
    target_value: 4,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: null,
    tempo: null,
    equipment: 'bodyweight',
    load_type: 'bodyweight',
    load_value: null,
    is_interval_exercise: false,
    ...overrides,
  } as Prescription
}

/** The ladder's explicit timing: one cap on the whole ladder, `rounds` rungs. */
export function ladderTiming(rounds: number): LadderTiming {
  return { mode: 'capped_window', rounds, interval_seconds: null, cap_seconds: LADDER_CAP_SECONDS }
}

/** The push up's rungs: two reps more every round. */
export function pushUpRungs(rounds: number): number[] {
  return Array.from({ length: rounds }, (_, index) => (index + 1) * 2)
}

/** A For Time ladder of `rounds` rungs with its fixed burpee companion, as Review accepts it. */
export function timedLadderBlock(rounds: number): Block {
  return {
    structure_type: 'for_time',
    rounds: null,
    timer_type: 'countdown',
    timer_seconds: LADDER_CAP_SECONDS,
    round_rest_seconds: null,
    rep_scheme: 'ladder_up',
    block_notes: null,
    ladder_timing: ladderTiming(rounds),
    exercises: [
      movement({ exercise_id: 'push-up', target_kind: 'sequence', target_value: null, target_sequence: pushUpRungs(rounds) }),
      movement({ exercise_id: 'burpee', target_value: 4 }),
    ],
  }
}

/**
 * TASK-012 (AC-R012-01): a ladder shaped unlike the accepted one, for the
 * register's compact-prescription specimens — a 24 kg kettlebell swing falling
 * three reps a round from 15, with a fixed 250 m row, five rounds raced For Time
 * under the block's 10:00 cap. Nothing in it is the accepted screenshot's.
 */
export function loadedLadderBlock(): Block {
  return {
    structure_type: 'for_time',
    rounds: null,
    timer_type: 'countdown',
    timer_seconds: 600,
    round_rest_seconds: null,
    rep_scheme: 'ladder_down',
    block_notes: null,
    ladder_timing: { mode: 'for_time', rounds: 5, interval_seconds: null, cap_seconds: null },
    exercises: [
      movement({
        exercise_id: 'kettlebell-swing', equipment: 'kettlebell', load_type: 'absolute', load_value: 24,
        target_kind: 'sequence', target_value: null, target_sequence: [15, 12, 9, 6, 3],
      }),
      movement({ exercise_id: 'row', equipment: 'rower', load_type: 'none', modality: 'distance', distance_unit: 'm', target_value: 250 }),
    ],
  }
}

/** The same ladder as the live shell hands it to its renderer. */
export function galleryLadderProgress(rounds: LadderRoundCount): BlockProgress {
  return galleryBlockProgress(timedLadderBlock(rounds), 40 + rounds)
}

/** Any gallery ladder block as the live shell hands it to its renderer. */
export function galleryBlockProgress(block: Block, seed: number): BlockProgress {
  const exercises = galleryExerciseProgress(block, seed)
  return {
    blockId: exercises[0].blockId,
    structureType: block.structure_type,
    repScheme: block.rep_scheme,
    identity: structureIdentity(block),
    status: 'not_started',
    exerciseCount: exercises.length,
    exercises,
    timerType: block.timer_type,
    rounds: block.rounds,
    roundRestSeconds: block.round_rest_seconds,
    timerSeconds: block.timer_seconds,
    ladderTiming: block.ladder_timing ?? null,
  }
}
