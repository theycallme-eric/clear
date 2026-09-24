/**
 * SET-01 — the settings hub's rules, as pure functions over the two things it
 * edits: the `profiles` preferences, and the persistent pattern limitations.
 *
 * `src/app/Settings.tsx` renders this and owns nothing else about it. The split
 * is what makes the requirement's two behavioural criteria testable without a
 * browser — "section toggles respect goal constraints" is `sectionRefusal`, and
 * "every onboarding choice is editable here" is the fact that every vocabulary
 * below is imported from `./onboarding` rather than restated.
 *
 * **Why the vocabularies are onboarding's.** IA.md §6 resolved that onboarding
 * is strictly first-run: every choice it collects is edited here instead of
 * being asked again. A second list of goals, experience levels or sections
 * would make that a claim rather than a fact — the day one of them changes,
 * the hub would silently offer the old one. So there is one list, it lives with
 * the wizard that first asks the question, and `settings.test.ts` checks that
 * the hub offers all of it.
 *
 * **The one goal constraint that is not a preset.** Choosing a goal presets the
 * section set (the wizard's rule, kept here), but `active_recovery` goes
 * further: the database composes it from a fixed set regardless of what the
 * profile stores — `generation_candidates` overrides `enabled_sections` with
 * warm-up, mobility and cooldown (migration `…_generation_candidates.sql`). A
 * toggle that appeared to work and changed no workout would be a control that
 * lies, so the toggles are refused with the reason while that goal is set.
 */
import type { UserConstraint } from '../data/constraints'
import { Constants, type Enums } from '../data/database.types'
import { GOALS, SECTIONS_BY_GOAL, type Option } from './onboarding'
import type { Profile, ProfilePreferences } from './schemas'

type GoalPreset = Enums<'goal_preset'>
type SectionType = Enums<'section_type'>
type MovementPattern = Enums<'movement_pattern'>

/** Why a section cannot be toggled while `active_recovery` is the goal. */
export const LOCKED_SECTIONS_REASON =
  'Active recovery is composed from warm-up, mobility and cooldown. Choose another goal to change its sections.'

/** Why the last enabled section cannot be turned off (`profiles_enabled_sections_not_empty`). */
export const LAST_SECTION_REASON = 'A workout needs at least one section.'

/** The goal whose sections the generator fixes, whatever the profile says. */
const FIXED_SECTION_GOAL: GoalPreset = 'active_recovery'

// ─────────────────────────────────────────────────────────────────────────────
// Preferences
// ─────────────────────────────────────────────────────────────────────────────

/** The three columns the hub writes, read off a profile it has in hand. */
export function preferencesOf(profile: Profile): ProfilePreferences {
  return {
    experience_level: profile.experience_level,
    goal_preset: profile.goal_preset,
    enabled_sections: profile.enabled_sections,
  }
}

/** The profile as it would be once `preferences` are stored — an optimistic row. */
export function withPreferences(
  profile: Profile,
  preferences: ProfilePreferences,
): Profile {
  return { ...profile, ...preferences }
}

/**
 * The goals offered, plus the one already stored if it is not among them.
 *
 * The four presets are onboarding's (`active_recovery` is a way to train today,
 * not a default to set up), but a profile can hold it — generation writes the
 * day's focus, and an earlier release may have stored it. Showing a picker that
 * omits the current answer would say the user has chosen nothing, so the stored
 * goal is always one of the options, and choosing another is how they leave it.
 */
export function goalOptions(current: GoalPreset | null): readonly Option<GoalPreset>[] {
  if (current === null || GOALS.some((goal) => goal.value === current)) return GOALS

  return [
    ...GOALS,
    {
      value: current,
      label: goalLabel(current),
      description: 'Composed from a fixed set of sections.',
    },
  ]
}

/** A goal's own name, from the enum, with no list of its own to drift. */
function goalLabel(goal: GoalPreset): string {
  return (
    GOALS.find((option) => option.value === goal)?.label ??
    goal.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase())
  )
}

/** True while the goal, not the user, decides which sections run. */
export function sectionsLocked(goal: GoalPreset | null): boolean {
  return goal === FIXED_SECTION_GOAL
}

/**
 * Choosing a goal, including the section set it presets.
 *
 * Re-choosing the goal already stored changes nothing — the same rule the
 * wizard's reducer has, and for the same reason: otherwise every visit to this
 * card would silently undo the section edits the card exists for.
 */
export function withGoal(
  preferences: ProfilePreferences,
  goal: GoalPreset,
): ProfilePreferences {
  if (preferences.goal_preset === goal) return preferences

  return {
    ...preferences,
    goal_preset: goal,
    enabled_sections: [...SECTIONS_BY_GOAL[goal]],
  }
}

export function withExperience(
  preferences: ProfilePreferences,
  experience: Enums<'experience_level'>,
): ProfilePreferences {
  return { ...preferences, experience_level: experience }
}

/**
 * Why toggling `section` is refused, or null when it is allowed.
 *
 * A sentence rather than a boolean, and never a silently ignored tap: the card
 * shows this text where the control is, so a refusal is something the user can
 * read and act on.
 */
export function sectionRefusal(
  preferences: ProfilePreferences,
  section: SectionType,
): string | null {
  if (sectionsLocked(preferences.goal_preset)) return LOCKED_SECTIONS_REASON

  const enabled = preferences.enabled_sections
  const lastOne = enabled.length === 1 && enabled[0] === section

  return lastOne ? LAST_SECTION_REASON : null
}

/**
 * Toggling one section, in the enum's order so the set reads the same twice.
 * A refused toggle returns the preferences unchanged — the caller asks
 * `sectionRefusal` for the reason, and this cannot produce a set the database
 * would reject even if it does not.
 */
export function withSection(
  preferences: ProfilePreferences,
  section: SectionType,
): ProfilePreferences {
  if (sectionRefusal(preferences, section) !== null) return preferences

  const enabled = new Set(preferences.enabled_sections)
  if (enabled.has(section)) enabled.delete(section)
  else enabled.add(section)

  return {
    ...preferences,
    enabled_sections: Constants.public.Enums.section_type.filter((type) =>
      enabled.has(type),
    ),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Limitations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the limitations card edits: the persistent movement-pattern exclusions,
 * and the one note written across them.
 */
export interface Limitations {
  readonly patterns: readonly MovementPattern[]
  readonly note: string
}

/**
 * The rows this card owns. Narrow on purpose: a session-scoped exclusion
 * belongs to the workout that added it, and an equipment or exercise exclusion
 * is a different control's (SET-02, REV-03), so neither is shown here and
 * neither can be removed by anything here.
 */
export function patternLimitations(
  constraints: readonly UserConstraint[],
): readonly UserConstraint[] {
  return constraints.filter(
    (constraint) =>
      constraint.action === 'exclude' &&
      constraint.target.scope === 'movement_pattern' &&
      constraint.appliesTo.persistence === 'persistent',
  )
}

/** The one this pattern is excluded by, or null when it is not excluded. */
export function limitationFor(
  constraints: readonly UserConstraint[],
  pattern: MovementPattern,
): UserConstraint | null {
  return (
    patternLimitations(constraints).find(
      (constraint) =>
        constraint.target.scope === 'movement_pattern' &&
        constraint.target.pattern === pattern,
    ) ?? null
  )
}

/**
 * The card's value, read off the constraint set.
 *
 * The note is the first one found rather than a join: `complete_onboarding`
 * writes one note across every pattern row, and this control rewrites all of
 * them together, so they agree by construction. If an older row disagreed,
 * showing the first is still honest — the next save makes it true of all.
 */
export function limitationsFrom(constraints: readonly UserConstraint[]): Limitations {
  const owned = patternLimitations(constraints)
  const patterns = owned.flatMap((constraint) =>
    constraint.target.scope === 'movement_pattern' ? [constraint.target.pattern] : [],
  )

  return {
    patterns: Constants.public.Enums.movement_pattern.filter((pattern) =>
      patterns.includes(pattern),
    ),
    note: owned.find((constraint) => constraint.note !== null)?.note ?? '',
  }
}

/** Blank is not a note — the column's null means nothing was written. */
export function noteValue(note: string): string | null {
  const written = note.trim()
  return written === '' ? null : written
}
