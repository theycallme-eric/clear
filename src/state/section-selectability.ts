/**
 * GR-03 — which `section_type` values a person is never offered.
 *
 * A section the enum has and the catalog cannot fill is a choice that fails at
 * Generate. `npm run seed` refuses such a value unless it is listed here, and
 * `SECTIONS` in `onboarding.ts` — the one list onboarding and Settings both
 * render — leaves out everything that is. So adding an enum value is a choice
 * between two things that are both visible: tag exercises for it, or name it
 * below.
 *
 * Its own module so the seed and the screens read the same constant and a test
 * can stand in a different one.
 */
import type { Enums } from '../data/database.types'

export const NON_SELECTABLE_SECTIONS: readonly Enums<'section_type'>[] = []
