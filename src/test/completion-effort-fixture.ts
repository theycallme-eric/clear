/**
 * TASK-010 / JOURNEY-010: one synthetic composition for the completion
 * choices and the existing effort faces, shared by the focused check
 * (`src/ui/timed-result-log.test.tsx`, the TASK-010 cases) and the real-route
 * browser proof (`e2e/refinement/task-010.spec.ts`), so both perform identical
 * data.
 *
 * Two sections. The first holds the two families whose full completion is
 * meaningful (R78): the accepted For Time results sample — forty wall balls
 * with a 9 kg medicine ball under a 15:00 cap (`FOR_TIME_BLOCK`) — and the
 * accepted ladder results sample — the push up rising two reps a round with a
 * fixed burpee, four rounds under one 07:00 cap (`timedLadderBlock(4)`). Its
 * forward action is the shell's `Next section`, the one action that saves both
 * blocks' results. The second is a short standard cooldown, the destination.
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import { FOR_TIME_BLOCK, peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import { LADDER_CAP_SECONDS, timedLadderBlock } from '../dev/gallery-refinement-flow-data'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { makePrescription, makeWorkoutBlock } from './factories'
import { formatBadgesSnapshot } from './format-badges-fixture'

/** The For Time's cap, from its own `timer_seconds`: 15:00. */
export const FOR_TIME_CAP_SECONDS = 900

/** The ladder's one cap on the whole ladder: 07:00. */
export const LADDER_CAP = LADDER_CAP_SECONDS

/** The ladder's rounds, and so the rung a Complete records. */
export const LADDER_ROUNDS = 4

/** The lists each card names its work by — the work the log follows. */
export const FOR_TIME_WORK_LIST = 'Movements in this block'
export const LADDER_WORK_LIST = 'Rounds in this ladder'

/** The two sections' headings, as the live shell names them by section type. */
export const RESULTS_SECTION_TITLE = 'Conditioning'
export const COOLDOWN_SECTION_TITLE = 'Cooldown'

/** The accepted question and its two answers, in their one row (C29). */
export const WORK_COMPLETED = 'Work completed'
export const COMPLETION_ANSWERS = ['Complete', 'Incomplete'] as const

/** The existing effort faces' words, left to right (C30; `SET_EFFORT_CHOICES`). */
export const EFFORT_LEGEND = 'Effort · optional'
export const EFFORT_WORDS = ['Too hard', 'About right', 'Too easy'] as const

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

/** JOURNEY-010's entry: the For Time and the ladder ready in the first section, a cooldown after. */
export function completionEffortAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  const base = peerGroupingAcceptance({ locationId, blocks: [FOR_TIME_BLOCK, timedLadderBlock(LADDER_ROUNDS)] })
  const [section] = base.workout.sections
  return {
    ...base,
    prompt_version: 'gallery-task-010',
    workout: {
      ...base.workout,
      title: 'Synthetic completion and effort workout',
      sections: [
        { ...section, section_type: 'conditioning', section_title: 'Finisher' },
        {
          section_type: 'cooldown',
          section_title: COOLDOWN_SECTION_TITLE,
          section_notes: null,
          blocks: [COOLDOWN_BLOCK],
        },
      ],
    },
  }
}

/**
 * The snapshot the session reads answer — prescribed, or running with
 * `startedAt` — with the ladder's explicit timing on its row.
 */
export function completionEffortSnapshot(
  acceptance: SessionAcceptance,
  options: { userId?: string; startedAt?: string | null } = {},
): SessionSnapshot {
  return formatBadgesSnapshot(acceptance, options)
}

/** The For Time and the ladder as the live shell hands them to their renderers. */
export function completionEffortBlocks(snapshot: SessionSnapshot): { forTime: BlockProgress; ladder: BlockProgress } {
  const [forTime, ladder] = sessionProgress(snapshot).sections[0].blocks
  return { forTime, ladder }
}
