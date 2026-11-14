/**
 * TASK-009 / JOURNEY-009: one synthetic composition for the AMRAP's
 * prescription and its concise scoring controls, shared by the focused check
 * (`src/ui/timed-result-log.test.tsx`) and the real-route browser proof
 * (`e2e/refinement/task-009.spec.ts`), so both perform identical data.
 *
 * Two sections. The first holds the accepted gallery's AMRAP (the same two
 * movements as one round, eight minutes: a loaded kettlebell swing and a
 * bodyweight burpee, `gallery-refinement-cards-data.ts`), so its forward
 * action is the shell's `Next section` — the one action that saves the
 * block's result. The second is a short standard cooldown, the destination.
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import { AMRAP_BLOCK, peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { makePrescription, makeWorkoutBlock } from './factories'
import { peerGroupingSnapshot } from './peer-grouping-fixture'

/** The AMRAP's window, from the block's own `timer_seconds`: 08:00. */
export const AMRAP_WINDOW_SECONDS = 480

/** The list the AMRAP names its work by — the work the scoring follows. */
export const AMRAP_WORK_LIST = 'Movements in this AMRAP'

/**
 * The two sections' headings, as the live shell names them by their section
 * type (`sectionTypeLabel`): the AMRAP's conditioning, then the cooldown.
 */
export const AMRAP_SECTION_TITLE = 'Conditioning'
export const COOLDOWN_SECTION_TITLE = 'Cooldown'

/** The accepted labels of the two counts (C26, C27), in the order they are read. */
export const AMRAP_COUNTS = ['Rounds completed', 'Reps into the next round'] as const

/** The cooldown: one bodyweight movement, so the journey has somewhere to go. */
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

/** JOURNEY-009's entry: the AMRAP ready in the first section, a cooldown after it. */
export function amrapResultAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  const base = peerGroupingAcceptance({ locationId, blocks: [AMRAP_BLOCK] })
  const [section] = base.workout.sections
  return {
    ...base,
    prompt_version: 'gallery-task-009',
    workout: {
      ...base.workout,
      title: 'Synthetic AMRAP scoring workout',
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

/** The snapshot the session reads answer: prescribed, or running with `startedAt`. */
export function amrapResultSnapshot(
  acceptance: SessionAcceptance,
  options: { userId?: string; startedAt?: string | null } = {},
): SessionSnapshot {
  return peerGroupingSnapshot(acceptance, options)
}

/** The AMRAP as the live shell hands it to its renderer. */
export function amrapResultBlock(snapshot: SessionSnapshot): BlockProgress {
  return sessionProgress(snapshot).sections[0].blocks[0]
}
