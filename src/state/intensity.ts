/**
 * Requested intensity and what each Goal makes of it (REQ-009, U27).
 *
 * The athlete chooses one number from 1 to 10 whatever the Goal — the bound
 * `requested_intensity between 1 and 10` the database and schema already hold.
 * That number is carried unchanged through the form, the request, the prompt
 * and validation. What a Goal *does* with it is applied downstream, here and
 * only here: the session is composed at the effective intensity, which is the
 * requested number held to §2.2's range for the Goal. Active Recovery's 1–3 is
 * one row of that table, so a recovery workout keeps its gentle ceiling
 * whatever was asked for.
 *
 * Both the browser and the Edge Function import this module, so it imports
 * nothing but types and holds no policy beyond the table it always had.
 * Requested intensity is not an exertion log and not a progression rule.
 */

import type { Enums } from '../data/database.types.ts'

type GoalPreset = Enums<'goal_preset'>

export interface IntensityRange {
  readonly min: number
  readonly max: number
  /** Where the choice lands the first time this goal is chosen. */
  readonly start: number
}

/** The one choice every Goal offers: the schema's own bounds. */
export const REQUESTED_INTENSITY_RANGE: IntensityRange = { min: 1, max: 10, start: 5 }

/**
 * §2.2's table: the effective range each Goal composes at. Every range sits
 * inside the requested 1–10 and none may widen it. `start` is the Goal's
 * opening choice, which is always inside its own range.
 */
export const INTENSITY_BY_GOAL: Record<GoalPreset, IntensityRange> = {
  strength: { min: 3, max: 10, start: 6 },
  hypertrophy: { min: 3, max: 9, start: 6 },
  conditioning: { min: 4, max: 10, start: 7 },
  balanced: { min: 1, max: 10, start: 5 },
  active_recovery: { min: 1, max: 3, start: 2 },
}

/** A requested intensity: a whole number held to 1–10, nothing else. */
export function requestedIntensity(value: number): number {
  const { min, max } = REQUESTED_INTENSITY_RANGE
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * The intensity a session is composed at: the requested number held to the
 * Goal's range, snapping to the nearest bound rather than to either end.
 */
export function effectiveIntensity(goal: GoalPreset, requested: number): number {
  const { min, max } = INTENSITY_BY_GOAL[goal]
  return Math.min(max, Math.max(min, requested))
}
