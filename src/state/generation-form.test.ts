import { describe, expect, it } from 'vitest'

import { Constants } from '../data/database.types'
import { isErr, isOk } from './errors'
import {
  ANCHORS,
  anchorAllowed,
  canGenerate,
  clampIntensity,
  DEFAULT_DURATION_MINS,
  FULL_INTENSITY_RANGE,
  GENERATION_GOALS,
  INTENSITY_BY_GOAL,
  initialDraft,
  inputFrom,
  intensityRange,
  NOTES_MAX_LENGTH,
  requestFrom,
  withAnchor,
  withDuration,
  withGoal,
  withIntensity,
  withLocation,
  withNotes,
  type GenerationDraft,
} from './generation-form'

const LOCATION = '00000000-0000-4000-8000-000000000010'
const REQUEST_ID = 'req_test_generate'

/** A draft a person has finished filling in: goal, anchor, place, 45 minutes. */
function completeDraft(overrides: Partial<GenerationDraft> = {}): GenerationDraft {
  return { ...withAnchor(withGoal(initialDraft(LOCATION), 'strength'), 'upper_body'), ...overrides }
}

describe('the vocabularies (v3 delta §2.1, §2.3)', () => {
  it('offers all five goals, the fifth being the one onboarding does not store', () => {
    expect(GENERATION_GOALS.map((goal) => goal.value)).toEqual([
      'strength',
      'hypertrophy',
      'conditioning',
      'balanced',
      'active_recovery',
    ])
    expect(GENERATION_GOALS.every((goal) => goal.label.trim() !== '')).toBe(true)
  })

  it('offers every session focus the database has, and no other', () => {
    expect([...ANCHORS.map((anchor) => anchor.value)].sort()).toEqual(
      [...Constants.public.Enums.session_focus].sort(),
    )
  })

  it('gives every goal a range inside the schema’s own 1–10', () => {
    for (const goal of Constants.public.Enums.goal_preset) {
      const range = INTENSITY_BY_GOAL[goal]
      expect(range.min).toBeGreaterThanOrEqual(FULL_INTENSITY_RANGE.min)
      expect(range.max).toBeLessThanOrEqual(FULL_INTENSITY_RANGE.max)
      expect(range.start).toBeGreaterThanOrEqual(range.min)
      expect(range.start).toBeLessThanOrEqual(range.max)
    }
  })

  it('reads §2.2’s table', () => {
    expect(INTENSITY_BY_GOAL).toEqual({
      strength: { min: 3, max: 10, start: 6 },
      hypertrophy: { min: 3, max: 9, start: 6 },
      conditioning: { min: 4, max: 10, start: 7 },
      balanced: { min: 1, max: 10, start: 5 },
      active_recovery: { min: 1, max: 3, start: 2 },
    })
  })
})

describe('the opening draft', () => {
  it('prefills the default place and a 45 minute target, and chooses no goal', () => {
    const draft = initialDraft(LOCATION)

    expect(draft.goal).toBeNull()
    expect(draft.anchor).toBeNull()
    expect(draft.intensity).toBeNull()
    expect(draft.locationId).toBe(LOCATION)
    expect(draft.durationMins).toBe(String(DEFAULT_DURATION_MINS))
    expect(draft.notes).toBe('')
  })

  it('holds no place when the profile has no default one', () => {
    expect(initialDraft(null).locationId).toBeNull()
  })

  it('offers the full range until a goal says otherwise', () => {
    expect(intensityRange(null)).toEqual(FULL_INTENSITY_RANGE)
    expect(intensityRange('conditioning')).toEqual(INTENSITY_BY_GOAL.conditioning)
  })
})

describe('goal → intensity (v3 delta §2.2)', () => {
  it('lands on the goal’s own start the first time a goal is chosen', () => {
    expect(withGoal(initialDraft(LOCATION), 'conditioning').intensity).toBe(7)
    expect(withGoal(initialDraft(LOCATION), 'active_recovery').intensity).toBe(2)
  })

  it('keeps a chosen intensity that the new goal still allows', () => {
    const draft = withIntensity(withGoal(initialDraft(LOCATION), 'balanced'), 8)

    expect(withGoal(draft, 'strength').intensity).toBe(8)
  })

  it('snaps to the nearest valid value when the new range excludes it', () => {
    const hard = withIntensity(withGoal(initialDraft(LOCATION), 'balanced'), 10)
    const gentle = withIntensity(withGoal(initialDraft(LOCATION), 'balanced'), 1)

    expect(withGoal(hard, 'active_recovery').intensity).toBe(3)
    expect(withGoal(hard, 'hypertrophy').intensity).toBe(9)
    expect(withGoal(gentle, 'conditioning').intensity).toBe(4)
  })

  it('clamps whatever the slider hands it to the current goal’s range', () => {
    const draft = withGoal(initialDraft(LOCATION), 'active_recovery')

    expect(withIntensity(draft, 9).intensity).toBe(3)
    expect(withIntensity(draft, 0).intensity).toBe(1)
    expect(withIntensity(draft, 2).intensity).toBe(2)
  })

  it('clamps to the nearest end, never to one of them', () => {
    expect(clampIntensity('conditioning', 1)).toBe(4)
    expect(clampIntensity('conditioning', 11)).toBe(10)
    expect(clampIntensity('conditioning', 6)).toBe(6)
  })
})

describe('goal → anchor (v3 delta §2.3)', () => {
  it('offers every anchor to every goal but recovery', () => {
    for (const goal of Constants.public.Enums.goal_preset) {
      for (const anchor of ANCHORS) {
        expect(anchorAllowed(goal, anchor.value)).toBe(
          !(goal === 'active_recovery' && anchor.value === 'power'),
        )
      }
    }
  })

  it('leaves the anchor blank rather than substituting one when Power is dropped', () => {
    const draft = withAnchor(withGoal(initialDraft(LOCATION), 'strength'), 'power')

    expect(withGoal(draft, 'active_recovery').anchor).toBeNull()
  })

  it('keeps an anchor the new goal still offers', () => {
    const draft = withAnchor(withGoal(initialDraft(LOCATION), 'strength'), 'full_body')

    expect(withGoal(draft, 'active_recovery').anchor).toBe('full_body')
  })

  it('refuses to select an anchor the goal does not offer', () => {
    const draft = withGoal(initialDraft(LOCATION), 'active_recovery')

    expect(withAnchor(draft, 'power')).toBe(draft)
  })

  it('deselects the anchor when it is chosen again', () => {
    const draft = withAnchor(withGoal(initialDraft(LOCATION), 'strength'), 'power')

    expect(withAnchor(draft, 'power').anchor).toBeNull()
  })
})

describe('the CTA', () => {
  it('stays disabled until both a goal and an anchor are chosen', () => {
    const empty = initialDraft(LOCATION)
    const goalOnly = withGoal(empty, 'strength')

    expect(canGenerate(empty)).toBe(false)
    expect(canGenerate(goalOnly)).toBe(false)
    expect(canGenerate(withAnchor(goalOnly, 'upper_body'))).toBe(true)
  })

  it('is not what a blank time target or a missing place disables', () => {
    // Those refuse with a sentence at submit instead — a button disabled for an
    // unexplained reason is the failure mode the screen avoids.
    expect(canGenerate(completeDraft({ durationMins: '' }))).toBe(true)
    expect(canGenerate(completeDraft({ locationId: null }))).toBe(true)
  })
})

describe('the payload (CORE-03 §1)', () => {
  it('builds a request the schema accepts', () => {
    const draft = withNotes(
      withDuration(withIntensity(completeDraft(), 7), '50'),
      '  Left shoulder is tight.  ',
    )

    const request = requestFrom(draft, REQUEST_ID)

    expect(isOk(request)).toBe(true)
    if (!isOk(request)) return
    expect(request.value).toEqual({
      request_id: REQUEST_ID,
      focus: 'upper_body',
      requested_intensity: 7,
      requested_duration_mins: 50,
      location_id: LOCATION,
      notes: 'Left shoulder is tight.',
      // OVR-04: a caller that was never asked is not deloading. The default is
      // the requirement — a deload is only ever applied by someone pressing it.
      deload: false,
    })
  })

  it('sends no note rather than an empty one', () => {
    const request = requestFrom(withNotes(completeDraft(), '   '), REQUEST_ID)

    expect(isOk(request) && request.value.notes).toBeNull()
  })

  it('refuses a draft with no anchor, naming the field', () => {
    const request = requestFrom(withGoal(initialDraft(LOCATION), 'strength'), REQUEST_ID)

    expect(isErr(request)).toBe(true)
    if (!isErr(request)) return
    expect(request.error.requestId).toBe(REQUEST_ID)
    expect(JSON.stringify(request.error.details?.issues)).toContain('focus')
  })

  it('refuses a time target that is not a whole number of minutes', () => {
    for (const minutes of ['', '   ', '0', '-30', '45.5', 'forty five', '4o']) {
      const request = requestFrom(completeDraft({ durationMins: minutes }), REQUEST_ID)

      expect(isErr(request), `“${minutes}” should be refused`).toBe(true)
    }
  })

  it('refuses a draft with no place, because the request carries one', () => {
    expect(isErr(requestFrom(completeDraft({ locationId: null }), REQUEST_ID))).toBe(true)
    expect(isErr(requestFrom(completeDraft({ locationId: 'home' }), REQUEST_ID))).toBe(true)
  })

  it('refuses a note past the ceiling the contract holds', () => {
    const ok = requestFrom(completeDraft({ notes: 'a'.repeat(NOTES_MAX_LENGTH) }), REQUEST_ID)
    const over = requestFrom(
      completeDraft({ notes: 'a'.repeat(NOTES_MAX_LENGTH + 1) }),
      REQUEST_ID,
    )

    expect(isOk(ok)).toBe(true)
    expect(isErr(over)).toBe(true)
  })

  it('refuses an intensity the goal’s range would have clamped', () => {
    // Not reachable through the slider — the point is that the schema, not the
    // control, is what the payload is held to.
    const request = requestFrom(completeDraft({ intensity: 0 }), REQUEST_ID)

    expect(isErr(request)).toBe(true)
  })

  it('hands the client the request minus the id it mints for itself', () => {
    const request = requestFrom(completeDraft(), REQUEST_ID)

    expect(isOk(request)).toBe(true)
    if (!isOk(request)) return
    expect(inputFrom(request.value)).toEqual({
      focus: 'upper_body',
      requested_intensity: INTENSITY_BY_GOAL.strength.start,
      requested_duration_mins: DEFAULT_DURATION_MINS,
      location_id: LOCATION,
      notes: null,
      deload: false,
    })
  })

  it('carries the deload the user applied, and nothing it inferred (OVR-04)', () => {
    const asked = requestFrom(completeDraft(), REQUEST_ID, true)
    const unasked = requestFrom(completeDraft(), REQUEST_ID)

    expect(isOk(asked) && asked.value.deload).toBe(true)
    expect(isOk(unasked) && unasked.value.deload).toBe(false)
    expect(isOk(asked) && inputFrom(asked.value).deload).toBe(true)
  })

  it('carries the place the user overrode to, not the default', () => {
    const other = '00000000-0000-4000-8000-000000000011'
    const request = requestFrom(withLocation(completeDraft(), other), REQUEST_ID)

    expect(isOk(request) && request.value.location_id).toBe(other)
  })
})
