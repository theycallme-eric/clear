/**
 * TASK-005 (C16, R29): which blocks draw their coaching as one grouped
 * disclosure, and the signal a grouped block's host gives its rows.
 *
 * A block performed as a group — any structure but straight sets — draws its
 * movements' Coaching and notes once, at the foot of its card
 * (`GroupExerciseCoaching`); a standard block's movements keep their own
 * panel. The host (`BlockPanel`) provides `GroupCoachingContext` around its
 * rows so a row's own panel (`ExerciseCoaching`) steps aside. The context
 * decides where the disclosure is drawn and nothing else: no note value,
 * writer or library read passes through it.
 */
import { createContext } from 'react'

import type { BlockProgress } from '../state/workout-progress'

/** Whether a block's coaching is one grouped disclosure. An emptied block has nothing to coach. */
export function coachesAsGroup(block: Pick<BlockProgress, 'structureType' | 'exercises'>): boolean {
  return block.structureType !== 'standard' && block.exercises.length > 0
}

/** True inside a grouped block's rows: their own panels give way to the one disclosure. */
export const GroupCoachingContext = createContext(false)
