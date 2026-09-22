/**
 * DATA-05 — reading a constraint set.
 *
 * Deterministic filtering happens in SQL, before Claude composes: the
 * eligibility query calls `constraints_in_force()` and `usable_equipment()`
 * (migration `20260921000002_user_constraints.sql` §4). These selectors are the
 * client-side reading of the *same* set — what a screen shows the user about
 * what they have excluded, and what a caller hands Claude as context.
 *
 * The rule that keeps the two from drifting: nothing here decides eligibility.
 * `usableEquipment` narrows a list the server already returned so a candidate
 * can be rendered the way it was filtered; it is not a second filter, and a
 * disagreement between it and the database is always the database being right.
 */

import type { ConstraintAction, MovementPattern, UserConstraint } from './constraints'

/** Everything `exclude` removes, by scope. Deterministic order, always. */
export interface Exclusions {
  readonly exerciseIds: readonly string[]
  readonly patterns: readonly MovementPattern[]
  readonly equipment: readonly string[]
}

/**
 * The hard set. Only `exclude` appears here — `avoid` and `prefer_not` persist
 * and travel as context, and nothing filters on them until a ranking layer
 * consumes them.
 */
export function exclusions(constraints: readonly UserConstraint[]): Exclusions {
  const exerciseIds = new Set<string>()
  const patterns = new Set<MovementPattern>()
  const equipment = new Set<string>()

  for (const constraint of constraints) {
    if (constraint.action !== 'exclude') continue

    switch (constraint.target.scope) {
      case 'exercise':
        exerciseIds.add(constraint.target.exerciseId)
        break
      case 'movement_pattern':
        patterns.add(constraint.target.pattern)
        break
      case 'equipment':
        equipment.add(constraint.target.equipmentId)
        break
    }
  }

  return {
    exerciseIds: sorted(exerciseIds),
    patterns: sorted(patterns),
    equipment: sorted(equipment),
  }
}

/**
 * The soft set, in the order Claude receives it: the constraints that persist
 * and reach the prompt as "deprioritize these" without removing anything.
 */
export function deprioritized(
  constraints: readonly UserConstraint[],
): readonly UserConstraint[] {
  const soft: ConstraintAction[] = ['avoid', 'prefer_not']

  return constraints.filter((constraint) => soft.includes(constraint.action))
}

/**
 * The options that survive: available, and not excluded. A narrowing, not a
 * rejection — an exercise usable with a barbell or dumbbells survives a barbell
 * exclusion offering dumbbells only. Empty means nothing usable is left, which
 * is what makes the exercise ineligible rather than under-equipped.
 *
 * Mirrors `public.usable_equipment(...)`, sort included, so a candidate rendered
 * here and the candidate sent to Claude read identically.
 */
export function usableEquipment(
  options: readonly string[],
  available: readonly string[],
  constraints: readonly UserConstraint[],
): readonly string[] {
  const excluded = new Set(exclusions(constraints).equipment)
  const owned = new Set(available)

  return sorted(
    new Set(
      options.filter((option) => owned.has(option) && !excluded.has(option)),
    ),
  )
}

/**
 * Whether a note exists, which is all anything is ever allowed to ask about
 * one. There is no parse, no keyword match, no inference — a note is shown
 * back to the user and passed along, and that is the whole contract.
 */
export function hasNote(constraint: UserConstraint): boolean {
  return constraint.note !== null && constraint.note.trim() !== ''
}

function sorted<T extends string>(values: Set<T>): readonly T[] {
  return [...values].sort()
}
