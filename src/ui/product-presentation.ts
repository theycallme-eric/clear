/**
 * What the product mounts at the app root (A3): the owner-approved Round 7 look
 * choices, with no sample data. See `./workout-experience-presentation` for
 * which inputs stay absent until a real source is wired.
 *
 * A3 TASK-103: the timed save is real. `timedWorkflows.saveResult` is
 * `saveLogThroughShell`, Round 7's Save log bound to the workout shell's one
 * completion path (`BlockCompletionProvider.saveTimedLog`), so the timed
 * blocks are drawn by `TimedWorkoutFlow` and save into `block_results` and
 * `block_movement_results`. No in-memory or sample adapter is mounted here.
 */
import { saveLogThroughShell } from './timed-result-shell'
import type { WorkoutExperiencePresentation } from './workout-experience-presentation'

export const PRODUCT_PRESENTATION: WorkoutExperiencePresentation = {
  dialogBackdrop: 'balanced',
  equipmentPlacement: 'name',
  loggingOverlay: 'dialog',
  focusAction: 'text',
  timedWorkflows: { logPresentation: 'sheet', counterStyle: 'wide', logHierarchy: 'simple', rungEmphasis: 'reps', saveResult: saveLogThroughShell },
}
