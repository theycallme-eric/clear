/**
 * SET-01's rules, without a screen: which goals are offered, what a goal does
 * to the section set, which toggles the goal refuses, and what the limitations
 * card reads off a constraint set.
 */
import { describe, expect, it } from 'vitest'

import type { UserConstraint } from '../data/constraints'
import { Constants } from '../data/database.types'
import { onboardedProfile } from '../test/user-data-double'
import { GOALS, SECTIONS_BY_GOAL } from './onboarding'
import type { ProfilePreferences } from './schemas'
import {
  goalOptions,
  LAST_SECTION_REASON,
  limitationFor,
  limitationsFrom,
  LOCKED_SECTIONS_REASON,
  noteValue,
  patternLimitations,
  preferencesOf,
  sectionRefusal,
  sectionsLocked,
  withExperience,
  withGoal,
  withPreferences,
  withSection,
} from './settings'

function preferences(
  overrides: Partial<ProfilePreferences> = {},
): ProfilePreferences {
  return {
    experience_level: 'some',
    goal_preset: 'balanced',
    enabled_sections: ['warmup', 'primary_lift', 'cooldown'],
    ...overrides,
  }
}

function patternConstraint(
  overrides: Partial<UserConstraint> = {},
): UserConstraint {
  return {
    id: 'constraint-1',
    userId: 'user-1',
    action: 'exclude',
    target: { scope: 'movement_pattern', pattern: 'press' },
    appliesTo: { persistence: 'persistent' },
    note: null,
    createdAt: '2026-09-22T09:00:00.000Z',
    ...overrides,
  }
}

describe('the preferences a profile hands the hub', () => {
  it('reads exactly the three columns the hub writes', () => {
    const profile = onboardedProfile()

    expect(preferencesOf(profile)).toEqual({
      experience_level: profile.experience_level,
      goal_preset: profile.goal_preset,
      enabled_sections: profile.enabled_sections,
    })
  })

  it('leaves everything else on the profile alone', () => {
    const profile = onboardedProfile()
    const next = withPreferences(profile, preferences({ goal_preset: 'strength' }))

    expect(next.goal_preset).toBe('strength')
    // Re-answering a question is not re-entering onboarding (IA.md §6).
    expect(next.onboarded_at).toBe(profile.onboarded_at)
    expect(next.id).toBe(profile.id)
    expect(next.weight_unit).toBe(profile.weight_unit)
  })
})

describe('the goal picker', () => {
  it('offers every goal onboarding asks for, and invents none', () => {
    expect(goalOptions('balanced')).toEqual(GOALS)
  })

  it('shows a stored goal the four presets do not include', () => {
    const options = goalOptions('active_recovery')

    expect(options).toHaveLength(GOALS.length + 1)
    expect(options.at(-1)?.value).toBe('active_recovery')
    // Every goal the enum has is therefore reachable as a current answer.
    expect(Constants.public.Enums.goal_preset).toContain('active_recovery')
  })

  it('presets the sections a goal runs', () => {
    for (const goal of GOALS) {
      // From "not answered", so every goal is a change rather than the one
      // already stored — the no-op case is its own test below.
      const unanswered = preferences({ goal_preset: null })
      expect(withGoal(unanswered, goal.value).enabled_sections).toEqual([
        ...SECTIONS_BY_GOAL[goal.value],
      ])
    }
  })

  it('re-choosing the goal already stored changes nothing', () => {
    const current = preferences({ goal_preset: 'strength', enabled_sections: ['core'] })

    // Otherwise every return to this card would silently undo the edits below.
    expect(withGoal(current, 'strength')).toBe(current)
  })

  it('changes the experience level and nothing else', () => {
    const current = preferences()
    const next = withExperience(current, 'confident')

    expect(next.experience_level).toBe('confident')
    expect(next.enabled_sections).toEqual(current.enabled_sections)
    expect(next.goal_preset).toBe(current.goal_preset)
  })
})

describe('section toggles respect goal constraints', () => {
  it('refuses every toggle while active recovery is the goal', () => {
    const recovery = preferences({
      goal_preset: 'active_recovery',
      enabled_sections: [...SECTIONS_BY_GOAL.active_recovery],
    })

    for (const section of Constants.public.Enums.section_type) {
      expect(sectionRefusal(recovery, section)).toBe(LOCKED_SECTIONS_REASON)
      expect(withSection(recovery, section)).toBe(recovery)
    }
    expect(sectionsLocked('active_recovery')).toBe(true)
  })

  it('leaves every other goal’s toggles alone', () => {
    for (const goal of GOALS) {
      expect(sectionsLocked(goal.value)).toBe(false)
      expect(sectionRefusal(preferences({ goal_preset: goal.value }), 'core')).toBeNull()
    }
  })

  it('refuses to untick the last section', () => {
    const one = preferences({ enabled_sections: ['core'] })

    expect(sectionRefusal(one, 'core')).toBe(LAST_SECTION_REASON)
    expect(withSection(one, 'core')).toBe(one)
    // Ticking a second one is not refused, and then the first can go.
    const two = withSection(one, 'warmup')
    expect(sectionRefusal(two, 'core')).toBeNull()
    expect(withSection(two, 'core').enabled_sections).toEqual(['warmup'])
  })

  it('keeps the set in the enum’s order however it was ticked', () => {
    const next = withSection(
      withSection(preferences({ enabled_sections: ['cooldown'] }), 'core'),
      'warmup',
    )

    expect(next.enabled_sections).toEqual(
      Constants.public.Enums.section_type.filter((section) =>
        ['warmup', 'core', 'cooldown'].includes(section),
      ),
    )
  })
})

describe('the limitations the card owns', () => {
  it('reads the persistent pattern exclusions, in the enum’s order', () => {
    const constraints = [
      patternConstraint({
        id: 'c-1',
        target: { scope: 'movement_pattern', pattern: 'pull' },
        note: 'Left shoulder',
      }),
      patternConstraint({
        id: 'c-2',
        target: { scope: 'movement_pattern', pattern: 'squat' },
        note: 'Left shoulder',
      }),
    ]

    expect(limitationsFrom(constraints)).toEqual({
      patterns: ['squat', 'pull'],
      note: 'Left shoulder',
    })
    expect(limitationFor(constraints, 'pull')?.id).toBe('c-1')
    expect(limitationFor(constraints, 'press')).toBeNull()
  })

  it('ignores a constraint another control owns', () => {
    const others: UserConstraint[] = [
      patternConstraint({
        id: 'equipment',
        target: { scope: 'equipment', equipmentId: 'barbell' },
      }),
      patternConstraint({
        id: 'session',
        appliesTo: { persistence: 'session', sessionId: 'session-1' },
      }),
      patternConstraint({ id: 'soft', action: 'avoid' }),
    ]

    expect(patternLimitations(others)).toEqual([])
    expect(limitationsFrom(others)).toEqual({ patterns: [], note: '' })
  })

  it('treats blank prose as no note at all', () => {
    expect(noteValue('   ')).toBeNull()
    expect(noteValue('')).toBeNull()
    expect(noteValue(' knee ')).toBe('knee')
    expect(limitationsFrom([patternConstraint()])).toEqual({
      patterns: ['press'],
      note: '',
    })
  })
})
