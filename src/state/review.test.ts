/**
 * REV-01, the derivation half. The screen's own test is `app/Review.test.tsx`;
 * what is proved here is what the briefing *says* before anything renders it.
 */
import { describe, expect, it } from 'vitest'

import { Constants } from '../data/database.types'
import {
  makePrescription,
  makeSessionAcceptance,
  makeStructureSpectrumWorkout,
  makeWorkoutBlock,
} from '../test/factories'
import { generationOutputSchema, type SessionAcceptance } from './schemas'
import {
  ANCHOR_LABEL,
  DURATION_LABEL,
  GOAL_LABEL,
  INTENSITY_LABEL,
  NO_GOAL_LABEL,
  briefingDuration,
  briefingIntensity,
  equipmentName,
  loadText,
  reviewBriefing,
  roundRestText,
  type ReviewBriefing,
} from './review'

const SPECTRUM = makeStructureSpectrumWorkout()

function briefingOf(overrides: Partial<SessionAcceptance> = {}): ReviewBriefing {
  return reviewBriefing(makeSessionAcceptance({ workout: SPECTRUM, ...overrides }))
}

/** Every string the briefing carries, at any depth. */
function allText(briefing: ReviewBriefing): string[] {
  const found: string[] = []

  const walk = (value: unknown): void => {
    if (typeof value === 'string') found.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(walk)
    }
  }

  walk(briefing)
  return found
}

function factValue(briefing: ReviewBriefing, label: string): string | undefined {
  return briefing.facts.find((fact) => fact.label === label)?.value
}

describe('the sample the criterion is stated against', () => {
  it('is schema-valid, so what it proves about rendering is about real content', () => {
    expect(generationOutputSchema.safeParse(SPECTRUM).success).toBe(true)
  })

  it('contains every structure type', () => {
    const structures = new Set(
      SPECTRUM.sections.flatMap((section) =>
        section.blocks.map((block) => block.structure_type),
      ),
    )

    expect([...structures].sort()).toEqual([...Constants.public.Enums.structure_type].sort())
  })

  it('contains every rep scheme', () => {
    const schemes = new Set(
      SPECTRUM.sections.flatMap((section) => section.blocks.map((block) => block.rep_scheme)),
    )

    expect([...schemes].sort()).toEqual([...Constants.public.Enums.rep_scheme].sort())
  })

  it('contains every target kind, modality and load guidance', () => {
    const prescriptions = SPECTRUM.sections.flatMap((section) =>
      section.blocks.flatMap((block) => block.exercises),
    )

    expect(new Set(prescriptions.map((one) => one.target_kind)).size).toBe(
      Constants.public.Enums.target_kind.length,
    )
    expect(new Set(prescriptions.map((one) => one.modality)).size).toBe(
      Constants.public.Enums.prescription_modality.length,
    )
    expect(new Set(prescriptions.map((one) => one.load_type)).size).toBe(
      Constants.public.Enums.load_guidance.length,
    )
  })
})

describe('the header IA.md §4 asks for', () => {
  it('states the intensity on the scale it was chosen on', () => {
    expect(factValue(briefingOf({ effective_intensity: 8 }), INTENSITY_LABEL)).toBe('8 of 10')
    expect(briefingIntensity(1)).toBe('1 of 10')
  })

  it('states the effective intensity, not the one that was asked for', () => {
    const clamped = briefingOf({ requested_intensity: 9, effective_intensity: 4 })

    expect(factValue(clamped, INTENSITY_LABEL)).toBe('4 of 10')
    expect(allText(clamped)).not.toContain('9 of 10')
  })

  it('reads the anchor out of the enum rather than reciting it', () => {
    expect(factValue(briefingOf({ session_focus: 'lower_body' }), ANCHOR_LABEL)).toBe(
      'Lower body',
    )
    expect(factValue(briefingOf({ session_focus: 'power' }), ANCHOR_LABEL)).toBe('Power')
  })

  it('names the goal the workout was composed for', () => {
    expect(factValue(briefingOf({ goal_preset: 'strength' }), GOAL_LABEL)).toBe('Strength')
    expect(factValue(briefingOf({ goal_preset: 'active_recovery' }), GOAL_LABEL)).toBe(
      'Active recovery',
    )
  })

  it('has a word for a profile that never answered the goal question', () => {
    expect(factValue(briefingOf({ goal_preset: null }), GOAL_LABEL)).toBe(NO_GOAL_LABEL)
  })

  it('names every goal the database admits', () => {
    for (const goal of Constants.public.Enums.goal_preset) {
      const value = factValue(briefingOf({ goal_preset: goal }), GOAL_LABEL)
      expect(value).toBeTruthy()
      expect(value).not.toBe(goal)
    }
  })

  it('carries an adjustment reason when a clamp moved something', () => {
    expect(briefingOf({ adjustment_reason: 'Intensity clamped to 6.' }).adjustment).toBe(
      'Intensity clamped to 6.',
    )
  })

  it('says nothing about an adjustment that did not happen', () => {
    expect(briefingOf({ adjustment_reason: null }).adjustment).toBeNull()
    expect(briefingOf({ adjustment_reason: '   ' }).adjustment).toBeNull()
  })
})

describe('the duration is the effective target and only that', () => {
  it('shows the number generation was asked to hit', () => {
    expect(
      factValue(briefingOf({ effective_duration_target_mins: 30 }), DURATION_LABEL),
    ).toBe('30 min')
    expect(briefingDuration(45)).toBe('45 min')
  })

  it('never surfaces the computed plausibility estimate or Claude’s own', () => {
    // Four numbers, all different, so each one can be looked for on its own.
    const briefing = briefingOf({
      requested_duration_mins: 60,
      effective_duration_target_mins: 45,
      computed_duration_mins: 52,
      workout: makeStructureSpectrumWorkout({ estimated_duration_mins: 71 }),
    })
    const text = allText(briefing).join(' | ')

    expect(text).toContain('45 min')
    expect(text).not.toContain('52')
    expect(text).not.toContain('71')
  })

  it('shows the effective target rather than the requested one when they differ', () => {
    const briefing = briefingOf({
      requested_duration_mins: 60,
      effective_duration_target_mins: 45,
    })

    expect(factValue(briefing, DURATION_LABEL)).toBe('45 min')
    expect(allText(briefing)).not.toContain('60 min')
  })
})

describe('the workout, as the briefing reads it', () => {
  const briefing = briefingOf()

  it('keeps every section, in the order it will be performed', () => {
    expect(briefing.sections.map((section) => section.title)).toEqual([
      'Prepare',
      'Primary',
      'Accessory',
      'Conditioning',
      'Cool down',
    ])
  })

  it('counts the movements it holds, per section and in total', () => {
    expect(briefing.sections.map((section) => section.movementCount)).toEqual([1, 3, 2, 4, 1])
    expect(briefing.movementCount).toBe(11)
  })

  it('names each structure with the vocabulary the workout screen performs it in', () => {
    const labels = briefing.sections.flatMap((section) =>
      section.blocks.map((block) => block.identity.label),
    )

    expect(labels).toEqual([
      'STANDARD',
      'STANDARD',
      'SUPERSET',
      'CIRCUIT',
      'STANDARD',
      'EMOM',
      'AMRAP',
      'FOR TIME',
      'FOR TIME',
      'STANDARD',
    ])
  })

  it('carries the one number that changes what the user is about to do', () => {
    const details = briefing.sections.flatMap((section) =>
      section.blocks.map((block) => block.identity.detail),
    )

    expect(details).toEqual([
      null,
      null,
      null,
      '3 ROUNDS',
      null,
      '10 MIN',
      '8 MIN',
      '15 MIN CAP',
      '10 MIN CAP',
      null,
    ])
  })

  it('names a rep scheme that carries information and stays quiet about `fixed`', () => {
    const schemes = briefing.sections.flatMap((section) =>
      section.blocks.map((block) => block.identity.repScheme),
    )

    expect(schemes).toEqual([
      null,
      null,
      null,
      'PYRAMID',
      'LADDER UP',
      'N+1',
      'INVERSE',
      'LADDER DOWN',
      'LADDER · FIXED INTERVAL',
      null,
    ])
  })

  it('states a sequence as its rungs rather than as a set count times a number', () => {
    const ladder = briefing.sections[3].blocks[2].exercises[0]

    expect(ladder.prescription).toBe('5 rungs · 15-12-9-6-3 reps')
  })

  it('states a range with an en dash, so it cannot be read as a ladder', () => {
    expect(briefing.sections[0].blocks[0].exercises[0].prescription).toBe('3 × 8–12 reps')
  })

  it('states a per-side target as a suffix rather than a doubled number', () => {
    expect(briefing.sections[4].blocks[0].exercises[0].prescription).toBe(
      '2 × 45 sec each side',
    )
  })

  it('states a distance in the unit the prescription named', () => {
    expect(briefing.sections[3].blocks[3].exercises[0].prescription).toBe('4 × 400 m')
  })

  it('humanises the slug the payload carries for a movement and its equipment', () => {
    const rower = briefing.sections[3].blocks[3].exercises[0]

    expect(rower.name).toBe('row erg')
    expect(rower.equipment).toBe('rower')
    expect(equipmentName('dumbbell-pair')).toBe('dumbbell pair')
  })

  it('carries block and section notes, and tempo, exactly as written', () => {
    expect(briefing.sections[0].notes).toBe('Move before you load.')
    expect(briefing.sections[2].blocks[0].notes).toBe('Build then come back down.')
    expect(briefing.sections[1].blocks[0].exercises[0].tempo).toBe('3-1-1-0')
  })

  it('reads the overview, and treats whitespace as no overview at all', () => {
    expect(briefing.overview).toBe('Every structure this app can prescribe, in one session.')
    expect(
      briefingOf({ workout: makeStructureSpectrumWorkout({ overview: '  ' }) }).overview,
    ).toBeNull()
  })
})

describe('rest', () => {
  const briefing = briefingOf()

  it('states the rest between sets when there is any', () => {
    expect(briefing.sections[1].blocks[0].exercises[0].rest).toBe('Rest 180s')
  })

  it('never renders an absent or zero rest as a rest', () => {
    expect(briefing.sections[0].blocks[0].exercises[0].rest).toBeNull()
    expect(briefing.sections[4].blocks[0].exercises[0].rest).toBeNull()
  })

  it('states the rest between rounds separately, because it is a different rest', () => {
    expect(briefing.sections[1].blocks[1].roundRest).toBe('90s between rounds')
    expect(briefing.sections[1].blocks[0].roundRest).toBeNull()
    expect(roundRestText(0)).toBeNull()
    expect(roundRestText(null)).toBeNull()
  })
})

describe('load guidance', () => {
  it('answers in the guidance’s own terms', () => {
    expect(loadText('percent_1rm', 75, 'kg')).toBe('75% 1RM')
    expect(loadText('rir', 2, 'kg')).toBe('2 RIR')
    expect(loadText('bodyweight', null, 'kg')).toBe('Bodyweight')
    expect(loadText('prior_session', null, 'kg')).toBe('Match last session')
  })

  it('says nothing where the guidance says nothing', () => {
    expect(loadText('none', null, 'kg')).toBeNull()
  })

  it('states an absolute load in the profile’s unit', () => {
    expect(loadText('absolute', 24, 'kg')).toBe('24 kg')
    expect(loadText('absolute', 50, 'lb')).toBe('50 lb')
  })

  it('states an absolute load without a unit rather than in a guessed one', () => {
    expect(loadText('absolute', 24, null)).toBe('24')
  })

  it('has an answer for every guidance the database admits', () => {
    for (const guidance of Constants.public.Enums.load_guidance) {
      expect(() => loadText(guidance, 10, 'kg')).not.toThrow()
    }
  })

  it('reaches the briefing with the unit it was given', () => {
    const acceptance = makeSessionAcceptance({
      workout: makeStructureSpectrumWorkout(),
    })

    expect(reviewBriefing(acceptance, 'lb').sections[2].blocks[0].exercises[0].load).toBe(
      '24 lb',
    )
    expect(reviewBriefing(acceptance, null).sections[2].blocks[0].exercises[0].load).toBe('24')
  })
})

describe('keys', () => {
  it('are unique across the whole briefing, because composed rows have no ids', () => {
    const briefing = briefingOf()
    const keys = briefing.sections.flatMap((section) => [
      section.key,
      ...section.blocks.flatMap((block) => [
        block.key,
        ...block.exercises.map((exercise) => exercise.key),
      ]),
    ])

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('survive two blocks in one section holding the same movement', () => {
    const repeated = makeStructureSpectrumWorkout({
      sections: [
        {
          section_type: 'accessory',
          section_title: 'Twice',
          section_notes: null,
          blocks: [
            makeWorkoutBlock({ exercises: [makePrescription()] }),
            makeWorkoutBlock({ exercises: [makePrescription()] }),
          ],
        },
      ],
    })
    const briefing = briefingOf({ workout: repeated })
    const keys = briefing.sections[0].blocks.map((block) => block.exercises[0].key)

    expect(keys[0]).not.toBe(keys[1])
  })
})
