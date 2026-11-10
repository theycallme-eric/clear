/**
 * TASK-011 / JOURNEY-011: one synthetic composition for the EMOM's schedule
 * context and its counter-free end log, shared by the focused check
 * (`src/ui/timed-workout-flow.test.tsx`, the TASK-011 describe block) and the
 * real-route browser proof (`e2e/refinement/task-011.spec.ts`), so both
 * perform identical data.
 *
 * Two sections. The first holds the accepted gallery's EMOM — a loaded
 * kettlebell swing and a bodyweight burpee alternating minutes for ten minutes
 * (`EMOM_BLOCK`, `gallery-refinement-cards-data.ts`) — with a 15-second rest
 * at the end of each minute, so the minute's transition into its rest is part
 * of the journey. Its forward action is the shell's `Next section`, the one
 * action that saves the block's result. The second is a short standard
 * cooldown, the destination.
 *
 * Synthetic and in memory only: no account, no catalog read, no write.
 */
import { EMOM_BLOCK, peerGroupingAcceptance } from '../dev/gallery-refinement-cards-data'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { makePrescription, makeWorkoutBlock } from './factories'
import { peerGroupingSnapshot } from './peer-grouping-fixture'

/** The EMOM's window, from the block's own `timer_seconds`: ten minutes. */
export const EMOM_MINUTES = 10

/** The rest inside every minute, from `round_rest_seconds`. */
export const EMOM_REST_SECONDS = 15

/** The list the EMOM names its work by. */
export const EMOM_WORK_LIST = 'Movements in this EMOM'

/** The two movements' headings, by position: the minute rotation's order. */
export const EMOM_MOVEMENTS = ['1. kb swing', '2. burpee'] as const

/** The sections' headings, as the live shell names them by their section type. */
export const EMOM_SECTION_TITLE = 'Conditioning'
export const COOLDOWN_SECTION_TITLE = 'Cooldown'

/** The end log's one field (accepted reference, LOGGING-FIELDS.md "EMOM"). */
export const EMOM_NOTES_LABEL = 'Notes · optional'

/** The captions R40 crossed out (C32): never drawn in any phase. */
export const RETIRED_CAPTIONS = ['NOT STARTED', 'WORK'] as const

/** The EMOM: the accepted two movements, ten minutes, a 15-second rest each minute. */
const EMOM_WITH_REST = { ...EMOM_BLOCK, round_rest_seconds: EMOM_REST_SECONDS }

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

/** JOURNEY-011's entry: the EMOM ready in the first section, a cooldown after it. */
export function emomEndLogAcceptance({ locationId = null }: { locationId?: string | null } = {}): SessionAcceptance {
  const base = peerGroupingAcceptance({ locationId, blocks: [EMOM_WITH_REST] })
  const [section] = base.workout.sections
  return {
    ...base,
    prompt_version: 'gallery-task-011',
    workout: {
      ...base.workout,
      title: 'Synthetic EMOM end log workout',
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
export function emomEndLogSnapshot(
  acceptance: SessionAcceptance,
  options: { userId?: string; startedAt?: string | null } = {},
): SessionSnapshot {
  return peerGroupingSnapshot(acceptance, options)
}

/** The EMOM as the live shell hands it to its renderer. */
export function emomEndLogBlock(snapshot: SessionSnapshot): BlockProgress {
  return sessionProgress(snapshot).sections[0].blocks[0]
}
