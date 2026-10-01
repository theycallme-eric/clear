import type { Enums } from '../data/database.types.ts'

/**
 * `focus_pattern_map`, as the catalog migration seeds it. Mirrored rather than
 * fetched because it is a vocabulary rather than data: eleven rows that change
 * only when the taxonomy does, and `session-suggestion.test.ts` fails if this
 * and the migration ever disagree.
 *
 * `conditioning` is deliberately not reachable from any focus — it derives from
 * `cardio-output` and maps to no session focus, recorded as open question 5 in
 * DATA_MODEL §13 — so it is absent from `SUGGESTIBLE_PATTERNS` too rather than
 * appearing as a pattern the user has permanently neglected.
 *
 * It lives in a module of its own, importing nothing at runtime, so the edge
 * function's validator reads the same map the suggestion does instead of
 * keeping a second copy of it.
 */
export const FOCUS_PATTERNS: Readonly<
  Record<Enums<'session_focus'>, readonly Enums<'movement_pattern'>[]>
> = {
  upper_body: ['press', 'pull'],
  lower_body: ['squat', 'hinge', 'unilateral'],
  full_body: ['squat', 'hinge', 'press', 'pull', 'unilateral'],
  power: ['power'],
}
