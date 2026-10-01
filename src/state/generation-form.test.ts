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
  GENERATE_PATH,
  generatePath,
  GENERATION_GOALS,
  INTENSITY_BY_GOAL,
  initialDraft,
  inputFrom,
  intensityRange,
  NOTES_MAX_LENGTH,
  POWER_REFUSAL,
  prefillFrom,
  refusalFrom,
  REFUSAL_SUMMARY,
  requestFrom,
  resolveGeneration,
  standingGoalFrom,
  withAnchor,
  withDuration,
  withIntensity,
  withLocation,
  withNotes,
  withRecovery,
  type FocusHistory,
  type GenerationContext,
  type GenerationDraft,
  type StandingGoal,
} from './generation-form'
import { generationRequestSchema, type SchemaIssue } from './schemas'
import { suggestionEligibility } from './session-suggestion'

const LOCATION = '00000000-0000-4000-8000-000000000010'
const REQUEST_ID = 'req_test_generate'

const STANDING_GOALS: readonly StandingGoal[] = [
  'strength',
  'hypertrophy',
  'conditioning',
  'balanced',
]

const REASON = 'No hinge in 11 days.'

/** History that recommends lower body at the given intensity. */
function recommended(intensity = 7): FocusHistory {
  return { status: 'recommended', focus: 'lower_body', intensity, reason: REASON }
}

/** The three states with nothing to recommend, each asking for a manual Focus. */
const MANUAL_HISTORIES: readonly FocusHistory[] = [
  { status: 'no-completed-history' },
  { status: 'stale-history' },
  { status: 'history-error' },
]

function contextFor(
  goalPreset: GenerationContext['goalPreset'],
  history: FocusHistory = { status: 'no-completed-history' },
): GenerationContext {
  return { goalPreset, history }
}

/** A strength profile with nothing completed: the athlete chooses the Focus. */
const STRENGTH = contextFor('strength')

/** A draft a person has finished filling in: anchor, place, 45 minutes. */
function completeDraft(overrides: Partial<GenerationDraft> = {}): GenerationDraft {
  return { ...withAnchor(initialDraft(LOCATION), 'upper_body'), ...overrides }
}

/** The field paths a refused request named. */
function refusedPaths(draft: GenerationDraft, context: GenerationContext): string[] {
  const request = requestFrom(draft, context, REQUEST_ID)
  if (!isErr(request)) return []
  return (request.error.details?.issues as readonly SchemaIssue[]).map((issue) => issue.path)
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
  it('prefills the default place and a 45 minute target, and holds no goal of its own', () => {
    const draft = initialDraft(LOCATION)

    expect(draft).not.toHaveProperty('goal')
    expect(draft.recovery).toBe(false)
    expect(draft.anchor).toBeNull()
    expect(draft.intensity).toBeNull()
    expect(draft.locationId).toBe(LOCATION)
    expect(draft.durationMins).toBe(String(DEFAULT_DURATION_MINS))
    expect(draft.notes).toBe('')
  })

  it('holds no place when the profile has no default one', () => {
    expect(initialDraft(null).locationId).toBeNull()
  })

  it('offers the full range until a goal is resolved', () => {
    expect(intensityRange(null)).toEqual(FULL_INTENSITY_RANGE)
    expect(intensityRange('conditioning')).toEqual(INTENSITY_BY_GOAL.conditioning)
  })
})

describe('the standing Goal (REQ-001)', () => {
  it('accepts onboarding’s four and nothing else', () => {
    for (const goal of STANDING_GOALS) expect(standingGoalFrom(goal)).toBe(goal)

    expect(standingGoalFrom(null)).toBeNull()
    expect(standingGoalFrom(undefined)).toBeNull()
    expect(standingGoalFrom('active_recovery')).toBeNull()
  })
})

describe('the resolver (REQ-001, REQ-004, REQ-005)', () => {
  describe.each(STANDING_GOALS)('a %s profile', (goal) => {
    it('takes the recommended Focus and its reason with no choice made', () => {
      const resolved = resolveGeneration(
        initialDraft(LOCATION),
        contextFor(goal, recommended(7)),
      )

      expect(resolved).toEqual({
        status: 'ready',
        goal,
        focus: 'lower_body',
        focusSource: 'recommended',
        reason: REASON,
        intensity: 7,
      })
    })

    it.each(MANUAL_HISTORIES)('needs a Focus with $status, at the goal’s start', (history) => {
      const resolved = resolveGeneration(initialDraft(LOCATION), contextFor(goal, history))

      expect(resolved).toEqual({
        status: 'needs-focus',
        goal,
        focus: null,
        why: history.status,
        intensity: INTENSITY_BY_GOAL[goal].start,
      })
    })

    it.each(MANUAL_HISTORIES)('takes a manual Focus with $status, and claims no reason', (history) => {
      const draft = withAnchor(initialDraft(LOCATION), 'full_body')

      expect(resolveGeneration(draft, contextFor(goal, history))).toEqual({
        status: 'ready',
        goal,
        focus: 'full_body',
        focusSource: 'manual',
        reason: null,
        intensity: INTENSITY_BY_GOAL[goal].start,
      })
    })
  })

  describe.each([null, 'active_recovery'] as const)('a profile whose goal is %s', (goalPreset) => {
    it.each([recommended(7), ...MANUAL_HISTORIES])(
      'needs Settings with $status, whatever the draft holds',
      (history) => {
        const needsSettings = { status: 'needs-settings', goal: null, focus: null, intensity: null }
        const context = contextFor(goalPreset, history)

        expect(resolveGeneration(initialDraft(LOCATION), context)).toEqual(needsSettings)
        expect(resolveGeneration(completeDraft({ intensity: 6 }), context)).toEqual(needsSettings)
        expect(resolveGeneration(withRecovery(completeDraft(), true), context)).toEqual(
          needsSettings,
        )
        expect(canGenerate(completeDraft(), context)).toBe(false)
      },
    )
  })

  it('reads the shared eligibility rule’s answer as it stands', () => {
    const resolved = resolveGeneration(
      initialDraft(LOCATION),
      contextFor('strength', suggestionEligibility([])),
    )

    expect(resolved.status).toBe('needs-focus')
    expect(resolved.status === 'needs-focus' && resolved.why).toBe('no-completed-history')
  })

  it('lets a manual Focus override the recommendation, without its reason', () => {
    const draft = withAnchor(initialDraft(LOCATION), 'power')
    const resolved = resolveGeneration(draft, contextFor('strength', recommended(7)))

    expect(resolved).toMatchObject({
      status: 'ready',
      focus: 'power',
      focusSource: 'manual',
      reason: null,
      // The history intensity still stands: the override is of the Focus alone.
      intensity: 7,
    })
  })

  it('returns to the recommendation when the manual Focus is cleared', () => {
    const draft = withAnchor(withAnchor(initialDraft(LOCATION), 'power'), 'power')
    const resolved = resolveGeneration(draft, contextFor('strength', recommended(7)))

    expect(resolved).toMatchObject({ focus: 'lower_body', focusSource: 'recommended' })
  })
})

describe('intensity (REQ-004, v3 delta §2.2)', () => {
  it('clamps the history intensity to the standing Goal’s range', () => {
    const draft = initialDraft(LOCATION)

    expect(resolveGeneration(draft, contextFor('hypertrophy', recommended(10))).intensity).toBe(9)
    expect(resolveGeneration(draft, contextFor('hypertrophy', recommended(2))).intensity).toBe(3)
    expect(resolveGeneration(draft, contextFor('conditioning', recommended(1))).intensity).toBe(4)
    expect(resolveGeneration(draft, contextFor('balanced', recommended(10))).intensity).toBe(10)
  })

  it('starts on the Goal’s own start with no recommendation', () => {
    for (const goal of STANDING_GOALS) {
      for (const history of MANUAL_HISTORIES) {
        expect(resolveGeneration(initialDraft(LOCATION), contextFor(goal, history)).intensity).toBe(
          INTENSITY_BY_GOAL[goal].start,
        )
      }
    }
  })

  it('starts Recovery on its own start, and clamps history into its range', () => {
    const recovery = withRecovery(initialDraft(LOCATION), true)

    expect(resolveGeneration(recovery, STRENGTH).intensity).toBe(
      INTENSITY_BY_GOAL.active_recovery.start,
    )
    expect(resolveGeneration(recovery, contextFor('strength', recommended(7))).intensity).toBe(
      INTENSITY_BY_GOAL.active_recovery.max,
    )
  })

  it('keeps the number the athlete set over the history one, clamped to the range', () => {
    const context = contextFor('hypertrophy', recommended(7))

    expect(resolveGeneration(withIntensity(initialDraft(LOCATION), 5), context).intensity).toBe(5)
    expect(resolveGeneration(withIntensity(initialDraft(LOCATION), 10), context).intensity).toBe(9)
    expect(resolveGeneration(withIntensity(initialDraft(LOCATION), 1), context).intensity).toBe(3)
  })

  it('keeps a set number through Recovery and back rather than resetting it', () => {
    const hard = withIntensity(initialDraft(LOCATION), 8)
    const recovering = withRecovery(hard, true)

    expect(resolveGeneration(recovering, STRENGTH).intensity).toBe(3)
    expect(resolveGeneration(withRecovery(recovering, false), STRENGTH).intensity).toBe(8)
  })

  it('holds whatever the slider hands it inside the schema’s bounds, as a whole number', () => {
    expect(withIntensity(initialDraft(LOCATION), 0).intensity).toBe(1)
    expect(withIntensity(initialDraft(LOCATION), 14).intensity).toBe(10)
    expect(withIntensity(initialDraft(LOCATION), 6.6).intensity).toBe(7)
  })

  it('clamps to the nearest end, never to one of them', () => {
    expect(clampIntensity('conditioning', 1)).toBe(4)
    expect(clampIntensity('conditioning', 11)).toBe(10)
    expect(clampIntensity('conditioning', 6)).toBe(6)
  })
})

describe('a prefilled draft (HOME-03)', () => {
  it('takes the anchor and the intensity, and leaves the goal to the profile', () => {
    const draft = initialDraft(LOCATION, { focus: 'lower_body', intensity: 7 })

    expect(draft.anchor).toBe('lower_body')
    expect(draft.intensity).toBe(7)
    expect(draft.recovery).toBe(false)
    expect(draft.durationMins).toBe(String(DEFAULT_DURATION_MINS))
    expect(draft.notes).toBe('')
    // No prefill stands in for a standing Goal the profile does not have.
    expect(canGenerate(draft, contextFor(null))).toBe(false)
    expect(canGenerate(draft, STRENGTH)).toBe(true)
  })

  it('keeps the prefilled intensity, clamped to the effective goal’s range', () => {
    const prefilled = initialDraft(LOCATION, { focus: 'lower_body', intensity: 9 })

    expect(resolveGeneration(prefilled, STRENGTH).intensity).toBe(9)
    // Recovery tops out at 3, so the suggestion snaps rather than overriding it.
    expect(resolveGeneration(withRecovery(prefilled, true), STRENGTH).intensity).toBe(
      INTENSITY_BY_GOAL.active_recovery.max,
    )
  })

  it('builds the destination Home links to, and reads it back', () => {
    const prefill = { focus: 'power', intensity: 8 } as const

    expect(generatePath()).toBe(GENERATE_PATH)
    expect(generatePath(null)).toBe(GENERATE_PATH)
    expect(generatePath(prefill)).toBe('/generate?focus=power&intensity=8')
    expect(prefillFrom('?focus=power&intensity=8')).toEqual(prefill)
    expect(prefillFrom(new URLSearchParams({ focus: 'power', intensity: '8' }))).toEqual(prefill)
  })

  it('refuses a prefill it cannot parse rather than half-filling the form', () => {
    expect(prefillFrom('')).toBeNull()
    expect(prefillFrom('?focus=lower_body')).toBeNull()
    expect(prefillFrom('?intensity=7')).toBeNull()
    expect(prefillFrom('?focus=legs&intensity=7')).toBeNull()
    expect(prefillFrom('?focus=lower_body&intensity=0')).toBeNull()
    expect(prefillFrom('?focus=lower_body&intensity=11')).toBeNull()
    expect(prefillFrom('?focus=lower_body&intensity=7.5')).toBeNull()
    expect(prefillFrom('?focus=lower_body&intensity=seven')).toBeNull()
  })

  it('opens on the defaults when there is no prefill at all', () => {
    expect(initialDraft(LOCATION, prefillFrom(GENERATE_PATH))).toEqual(initialDraft(LOCATION))
  })
})

describe('Recovery for one workout (v3 delta §2.3)', () => {
  it('offers every anchor to every goal but recovery', () => {
    for (const goal of Constants.public.Enums.goal_preset) {
      for (const anchor of ANCHORS) {
        expect(anchorAllowed(goal, anchor.value)).toBe(
          !(goal === 'active_recovery' && anchor.value === 'power'),
        )
      }
    }
  })

  it('resolves the goal to Recovery without touching the standing one', () => {
    const resolved = resolveGeneration(withRecovery(completeDraft(), true), STRENGTH)

    expect(resolved).toMatchObject({ status: 'ready', goal: 'active_recovery' })
    expect(resolveGeneration(completeDraft(), STRENGTH).goal).toBe('strength')
  })

  it('leaves the anchor blank rather than substituting one when Power is dropped', () => {
    const draft = withAnchor(initialDraft(LOCATION), 'power')

    expect(withRecovery(draft, true).anchor).toBeNull()
  })

  it('keeps an anchor Recovery still offers', () => {
    const draft = withAnchor(initialDraft(LOCATION), 'full_body')

    expect(withRecovery(draft, true).anchor).toBe('full_body')
  })

  it('refuses to select an anchor Recovery does not offer', () => {
    const draft = withRecovery(initialDraft(LOCATION), true)

    expect(withAnchor(draft, 'power')).toBe(draft)
  })

  it('asks for a Focus rather than sending a recommended Power', () => {
    const power: FocusHistory = {
      status: 'recommended',
      focus: 'power',
      intensity: 7,
      reason: REASON,
    }
    const resolved = resolveGeneration(
      withRecovery(initialDraft(LOCATION), true),
      contextFor('strength', power),
    )

    expect(resolved).toMatchObject({ status: 'needs-focus', focus: null, why: 'power-refused' })
    expect(POWER_REFUSAL).toMatch(/Power/)
  })

  it('deselects the anchor when it is chosen again', () => {
    const draft = withAnchor(initialDraft(LOCATION), 'power')

    expect(withAnchor(draft, 'power').anchor).toBeNull()
  })
})

describe('the CTA', () => {
  it('needs no interaction when the Goal stands and history recommends', () => {
    expect(canGenerate(initialDraft(LOCATION), contextFor('strength', recommended(7)))).toBe(true)
  })

  it('stays disabled until a Focus is chosen when history recommends none', () => {
    for (const history of MANUAL_HISTORIES) {
      const context = contextFor('strength', history)

      expect(canGenerate(initialDraft(LOCATION), context)).toBe(false)
      expect(canGenerate(withAnchor(initialDraft(LOCATION), 'upper_body'), context)).toBe(true)
    }
  })

  it('is not what a blank time target or a missing place disables', () => {
    // Those refuse with a sentence at submit instead — a button disabled for an
    // unexplained reason is the failure mode the screen avoids.
    expect(canGenerate(completeDraft({ durationMins: '' }), STRENGTH)).toBe(true)
    expect(canGenerate(completeDraft({ locationId: null }), STRENGTH)).toBe(true)
  })
})

describe('the payload (CORE-03 §1)', () => {
  it('builds a request the schema accepts', () => {
    const draft = withNotes(
      withDuration(withIntensity(completeDraft(), 7), '50'),
      '  Left shoulder is tight.  ',
    )

    const request = requestFrom(draft, STRENGTH, REQUEST_ID)

    expect(isOk(request)).toBe(true)
    if (!isOk(request)) return
    expect(request.value).toEqual({
      request_id: REQUEST_ID,
      goal: 'strength',
      date: new Date().toISOString().slice(0, 10),
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

  it('sends the standing Goal, the recommended Focus and the clamped history intensity untouched', () => {
    const request = requestFrom(
      initialDraft(LOCATION),
      contextFor('hypertrophy', recommended(10)),
      REQUEST_ID,
    )

    expect(isOk(request)).toBe(true)
    if (!isOk(request)) return
    expect(generationRequestSchema.safeParse(request.value).success).toBe(true)
    expect(request.value).toMatchObject({
      goal: 'hypertrophy',
      focus: 'lower_body',
      requested_intensity: 9,
    })
  })

  it('takes goal and focus from the resolver in every state it is ready', () => {
    for (const goal of STANDING_GOALS) {
      for (const history of [recommended(7), ...MANUAL_HISTORIES]) {
        const draft = history.status === 'recommended' ? initialDraft(LOCATION) : completeDraft()
        const context = contextFor(goal, history)
        const resolved = resolveGeneration(draft, context)
        const request = requestFrom(draft, context, REQUEST_ID)

        expect(resolved.status).toBe('ready')
        expect(isOk(request)).toBe(true)
        if (!isOk(request)) continue
        expect(request.value.goal).toBe(resolved.goal)
        expect(request.value.focus).toBe(resolved.focus)
        expect(request.value.requested_intensity).toBe(resolved.intensity)
      }
    }
  })

  it('sends no note rather than an empty one', () => {
    const request = requestFrom(withNotes(completeDraft(), '   '), STRENGTH, REQUEST_ID)

    expect(isOk(request) && request.value.notes).toBeNull()
  })

  it('refuses a draft that needs a Focus, naming the field', () => {
    for (const history of MANUAL_HISTORIES) {
      const context = contextFor('strength', history)
      const request = requestFrom(initialDraft(LOCATION), context, REQUEST_ID)

      expect(isErr(request)).toBe(true)
      if (!isErr(request)) continue
      expect(request.error.requestId).toBe(REQUEST_ID)
      expect(refusedPaths(initialDraft(LOCATION), context)).toEqual(['focus'])
    }
  })

  it('refuses a profile that needs Settings, naming goal and focus', () => {
    for (const goalPreset of [null, 'active_recovery'] as const) {
      for (const history of [recommended(7), ...MANUAL_HISTORIES]) {
        const paths = refusedPaths(completeDraft(), contextFor(goalPreset, history))

        expect(paths).toContain('goal')
        expect(paths).toContain('focus')
      }
    }
  })

  it('says a missing Goal is Settings’ to fix', () => {
    const request = requestFrom(completeDraft(), contextFor(null), REQUEST_ID)

    expect(isErr(request)).toBe(true)
    if (!isErr(request)) return
    const refusal = refusalFrom(request.error)
    expect(refusal.message).toBe(REFUSAL_SUMMARY)
    expect(refusal.fields.goal).toMatch(/Settings/)
  })

  it('refuses a time target that is not a whole number of minutes', () => {
    for (const minutes of ['', '   ', '0', '-30', '45.5', 'forty five', '4o']) {
      const request = requestFrom(completeDraft({ durationMins: minutes }), STRENGTH, REQUEST_ID)

      expect(isErr(request), `“${minutes}” should be refused`).toBe(true)
    }
  })

  it('refuses a draft with no place, because the request carries one', () => {
    expect(isErr(requestFrom(completeDraft({ locationId: null }), STRENGTH, REQUEST_ID))).toBe(true)
    expect(isErr(requestFrom(completeDraft({ locationId: 'home' }), STRENGTH, REQUEST_ID))).toBe(
      true,
    )
  })

  it('refuses a note past the ceiling the contract holds', () => {
    const ok = requestFrom(
      completeDraft({ notes: 'a'.repeat(NOTES_MAX_LENGTH) }),
      STRENGTH,
      REQUEST_ID,
    )
    const over = requestFrom(
      completeDraft({ notes: 'a'.repeat(NOTES_MAX_LENGTH + 1) }),
      STRENGTH,
      REQUEST_ID,
    )

    expect(isOk(ok)).toBe(true)
    expect(isErr(over)).toBe(true)
  })

  it('never sends an intensity outside the goal’s range, whatever the draft holds', () => {
    // Not reachable through the slider — the point is that the resolver, not
    // the control, is what the payload's intensity is held to.
    const request = requestFrom(completeDraft({ intensity: 0 }), STRENGTH, REQUEST_ID)

    expect(isOk(request) && request.value.requested_intensity).toBe(INTENSITY_BY_GOAL.strength.min)
  })

  it('hands the client the request minus the id it mints for itself', () => {
    const request = requestFrom(completeDraft(), STRENGTH, REQUEST_ID)

    expect(isOk(request)).toBe(true)
    if (!isOk(request)) return
    expect(inputFrom(request.value)).toEqual({
      goal: 'strength',
      focus: 'upper_body',
      requested_intensity: INTENSITY_BY_GOAL.strength.start,
      requested_duration_mins: DEFAULT_DURATION_MINS,
      location_id: LOCATION,
      notes: null,
      deload: false,
    })
  })

  it('carries the deload the user applied, and nothing it inferred (OVR-04)', () => {
    const asked = requestFrom(completeDraft(), STRENGTH, REQUEST_ID, true)
    const unasked = requestFrom(completeDraft(), STRENGTH, REQUEST_ID)

    expect(isOk(asked) && asked.value.deload).toBe(true)
    expect(isOk(unasked) && unasked.value.deload).toBe(false)
    expect(isOk(asked) && inputFrom(asked.value).deload).toBe(true)
  })

  it('carries the place the user overrode to, not the default', () => {
    const other = '00000000-0000-4000-8000-000000000011'
    const request = requestFrom(withLocation(completeDraft(), other), STRENGTH, REQUEST_ID)

    expect(isOk(request) && request.value.location_id).toBe(other)
  })
})
