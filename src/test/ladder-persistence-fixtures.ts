/** TASK-039-only catalog selection; TASK-038's shared factory/defaults stay unchanged. */
import type { LadderTiming, WorkoutBlock } from '../state/schemas'
import { makeLadderTimingBlock } from './factories'

/**
 * Keep the accepted sequence, whole-block clock and fixed companion fields,
 * changing only the exercise ids to members of the captured accessory catalog.
 */
export function makeCatalogLadderTimingBlock(
  mode: LadderTiming['mode'],
  options: Parameters<typeof makeLadderTimingBlock>[1] = {},
): WorkoutBlock {
  const block = makeLadderTimingBlock(mode, options)
  const [sequence, companion] = block.exercises

  return {
    ...block,
    exercises: [
      { ...sequence, exercise_id: 'glute-bridge' },
      { ...companion, exercise_id: 'walking-lunges' },
    ],
  }
}
