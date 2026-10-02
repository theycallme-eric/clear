/**
 * REQ-011 — the parts of a refused onboarding commit that are pure.
 *
 * Two properties of `onboarding.ts` carry the requirement without a render:
 * the sentence a refusal is presented as names the incompatible choice in the
 * steps' own words, and the draft is a value nothing about a refusal touches,
 * so "every entered value preserved" is the reducer's contract rather than
 * something the screen has to arrange.
 */
import { describe, expect, it } from 'vitest'

import { Constants } from '../data/database.types'
import { VIABILITY_FAILURE_CLASSES, type ViabilityFailure } from '../data/viability'
import {
  EMPTY_DRAFT,
  EQUIPMENT,
  EQUIPMENT_BY_TIER,
  GOALS,
  MOVEMENT_PATTERNS,
  onboardingReducer,
  SECTIONS,
  SECTIONS_BY_GOAL,
  TIERS,
  toAnswers,
  viabilityRefusalMessage,
  type OnboardingAction,
  type OnboardingDraft,
} from './onboarding'

const ENUMS = Constants.public.Enums
const TRAINING_GOALS = ENUMS.goal_preset.filter((goal) => goal !== 'active_recovery')

function failure(overrides: Partial<ViabilityFailure>): ViabilityFailure {
  return {
    section: 'carries',
    failureClass: 'missing_equipment',
    incompatibleChoice: { kind: 'equipment', equipment: ['bodyweight', 'foam_roller'] },
    goals: TRAINING_GOALS,
    focuses: [...ENUMS.session_focus],
    blocksProposedGoal: true,
    ...overrides,
  }
}

function draftFrom(actions: readonly OnboardingAction[]): OnboardingDraft {
  return actions.reduce(onboardingReducer, EMPTY_DRAFT)
}

describe('viabilityRefusalMessage — the incompatible choice, named', () => {
  it('names the section and the equipment that cannot support it', () => {
    const message = viabilityRefusalMessage([failure({})])

    expect(message).toBe(
      'Nothing in Carries can be done with the equipment you chose (Bodyweight, Foam roller). ' +
        'Add equipment to your setup, or turn off Carries.',
    )
  })

  it('lists every section that fails the same way, in the order the step shows them', () => {
    const message = viabilityRefusalMessage([
      failure({ section: 'core' }),
      failure({ section: 'primary_lift' }),
      failure({ section: 'accessory' }),
    ])

    expect(message).toContain('Nothing in Primary lift, Accessory and Core can be done')
    expect(message).toContain('turn off Primary lift, Accessory and Core.')
  })

  it('says so when no equipment was chosen at all', () => {
    const message = viabilityRefusalMessage([
      failure({ incompatibleChoice: { kind: 'equipment', equipment: [] } }),
    ])

    expect(message).toContain('Nothing in Carries can be done with no equipment chosen.')
  })

  it('names the movements worked around, as the limitations step labels them', () => {
    const message = viabilityRefusalMessage([
      failure({
        section: 'primary_lift',
        failureClass: 'athlete_exclusion',
        incompatibleChoice: {
          kind: 'exclusion',
          exclusions: [
            { scope: 'movement_pattern', target: 'hinge' },
            { scope: 'movement_pattern', target: 'squat' },
          ],
        },
      }),
    ])

    expect(message).toBe(
      'Working around Hinging and Squatting leaves nothing for Primary lift. ' +
        'Work around less, or turn off Primary lift.',
    )
  })

  it('names a section the catalog cannot fill', () => {
    const message = viabilityRefusalMessage([
      failure({
        section: 'skill_power',
        failureClass: 'catalog_gap',
        incompatibleChoice: { kind: 'section', section: 'skill_power' },
      }),
    ])

    expect(message).toBe('CLEAR has no exercises for Skill / power yet. Turn off Skill / power.')
  })

  it('does not offer to turn off a section only recovery sessions asked for', () => {
    const message = viabilityRefusalMessage([
      failure({ section: 'mobility', goals: ['active_recovery'], blocksProposedGoal: false }),
    ])

    expect(message).toContain('Nothing in Mobility can be done with the equipment you chose')
    expect(message).toContain('Recovery sessions always include Mobility')
    expect(message).not.toContain('turn off')
  })

  it('says a workout needs a section when the toggles resolve to none', () => {
    const message = viabilityRefusalMessage([
      failure({
        section: null,
        failureClass: 'no_sections',
        incompatibleChoice: { kind: 'sections', sections: [] },
      }),
    ])

    expect(message).toBe('A workout needs at least one section.')
  })

  it('has a sentence for every failure class, one per class present', () => {
    const choices: Record<string, ViabilityFailure['incompatibleChoice']> = {
      catalog_gap: { kind: 'section', section: 'carries' },
      missing_equipment: { kind: 'equipment', equipment: ['bodyweight'] },
      athlete_exclusion: {
        kind: 'exclusion',
        exclusions: [{ scope: 'movement_pattern', target: 'pull' }],
      },
      no_sections: { kind: 'sections', sections: [] },
    }

    for (const failureClass of VIABILITY_FAILURE_CLASSES) {
      const message = viabilityRefusalMessage([
        failure({
          failureClass,
          section: failureClass === 'no_sections' ? null : 'carries',
          incompatibleChoice: choices[failureClass],
        }),
      ])
      expect(message, failureClass).not.toBe('')
    }

    const every = viabilityRefusalMessage(
      VIABILITY_FAILURE_CLASSES.map((failureClass) =>
        failure({
          failureClass,
          section: failureClass === 'no_sections' ? null : 'carries',
          incompatibleChoice: choices[failureClass],
        }),
      ),
    )
    expect(every).toContain('A workout needs at least one section.')
    expect(every).toContain('CLEAR has no exercises for Carries yet.')
    expect(every).toContain('Nothing in Carries can be done')
    expect(every).toContain('Working around Pulling leaves nothing for Carries.')
  })

  it('uses only labels the steps themselves show', () => {
    for (const section of SECTIONS) {
      const message = viabilityRefusalMessage([failure({ section: section.value })])
      expect(message, section.value).toContain(`Nothing in ${section.label} can be done`)
    }
    for (const item of EQUIPMENT) {
      const message = viabilityRefusalMessage([
        failure({ incompatibleChoice: { kind: 'equipment', equipment: [item.value] } }),
      ])
      expect(message, item.value).toContain(`(${item.label})`)
    }
    for (const pattern of MOVEMENT_PATTERNS) {
      const message = viabilityRefusalMessage([
        failure({
          failureClass: 'athlete_exclusion',
          incompatibleChoice: {
            kind: 'exclusion',
            exclusions: [{ scope: 'movement_pattern', target: pattern.value }],
          },
        }),
      ])
      // The label's own first clause: "Hinging — deadlifts, swings" is "Hinging".
      expect(pattern.label.startsWith(message.slice('Working around '.length).split(' leaves')[0] ?? '?'))
        .toBe(true)
    }
  })
})

describe('the draft a refusal leaves behind', () => {
  const ANSWERED = draftFrom([
    { type: 'tier', value: 'minimal' },
    { type: 'equipment', value: 'resistance_bands' },
    { type: 'experience', value: 'some' },
    { type: 'goal', value: 'strength' },
    { type: 'section', value: 'carries' },
    { type: 'pattern', value: 'pull' },
    { type: 'note', value: 'Left shoulder' },
  ])

  it('is the same payload on a second attempt: nothing about a refusal edits it', () => {
    expect(toAnswers(ANSWERED)).toEqual({
      location_name: 'Minimal',
      location_tier: 'minimal',
      equipment: ['bodyweight', 'foam_roller'],
      experience_level: 'some',
      goal_preset: 'strength',
      enabled_sections: ['warmup', 'primary_lift', 'accessory', 'carries', 'core', 'cooldown'],
      avoid_patterns: ['pull'],
      note: 'Left shoulder',
    })
    expect(toAnswers(ANSWERED)).toEqual(toAnswers(ANSWERED))
  })

  it('keeps every other answer when the named choice is corrected', () => {
    const corrected = onboardingReducer(ANSWERED, { type: 'section', value: 'carries' })

    expect(corrected).toEqual({
      ...ANSWERED,
      sections: ANSWERED.sections.filter((section) => section !== 'carries'),
    })
    expect(corrected).not.toBe(ANSWERED)
  })

  it('answers the same draft for a choice that changes nothing', () => {
    // The screen shows a refusal for as long as the refused draft is the draft.
    expect(onboardingReducer(ANSWERED, { type: 'tier', value: 'minimal' })).toBe(ANSWERED)
    expect(onboardingReducer(ANSWERED, { type: 'goal', value: 'strength' })).toBe(ANSWERED)
  })
})

describe('the presets onboarding offers', () => {
  it('produce a payload for every tier and every Goal, unedited', () => {
    for (const tier of TIERS) {
      for (const goal of GOALS) {
        const answers = toAnswers(
          draftFrom([
            { type: 'tier', value: tier.value },
            { type: 'experience', value: 'new' },
            { type: 'goal', value: goal.value },
          ]),
        )

        expect(answers, `${tier.value} × ${goal.value}`).toMatchObject({
          location_tier: tier.value,
          equipment: EQUIPMENT_BY_TIER[tier.value],
          goal_preset: goal.value,
          enabled_sections: SECTIONS_BY_GOAL[goal.value],
          avoid_patterns: [],
        })
      }
    }
  })

  it('offer every tier the schema has and every Goal but active recovery', () => {
    expect(TIERS.map((tier) => tier.value)).toEqual(ENUMS.equipment_tier)
    expect(GOALS.map((goal) => goal.value).sort()).toEqual([...TRAINING_GOALS].sort())
  })
})
