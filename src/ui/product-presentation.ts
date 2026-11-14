/**
 * What the product mounts at the app root (A3): the owner-approved Round 7 look
 * choices, with no sample data. See `./workout-experience-presentation` for
 * which inputs stay absent until a real source is wired.
 */
import type { WorkoutExperiencePresentation } from './workout-experience-presentation'

export const PRODUCT_PRESENTATION: WorkoutExperiencePresentation = {
  dialogBackdrop: 'balanced',
  equipmentPlacement: 'name',
  loggingOverlay: 'dialog',
  focusAction: 'text',
  timedWorkflows: { logPresentation: 'sheet', counterStyle: 'wide', logHierarchy: 'simple', rungEmphasis: 'reps' },
}
