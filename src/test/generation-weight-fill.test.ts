import { describe, expect, it } from 'vitest'

import type { GenerationOutput, Prescription } from '../state/schemas'
import {
  DELOAD_ANCHOR_FACTOR,
  fillFields,
  fillSuggestedLoads,
  resolveTargetRir,
  suggestedLoadFields,
  targetRepsOf,
  targetRirFor,
  type AnchorFact,
} from '../../supabase/functions/_shared/weight-fill.ts'
import { promptInput, TODAY } from './generation-prompt-fixtures'

// OVR-02's other half. The arithmetic itself is `progression.ts`'s and is tested
// there row by row; what is tested here is the wiring — which prescriptions get a
// number, which rep target the number is inverted at, and what the directive does
// to it before `suggestLoad` ever sees the anchor.

const prescription = (overrides: Partial<Prescription> = {}): Prescription =>
  ({
    exercise_id: 'back-squat',
    equipment: 'barbell',
    session_function: 'primary',
    anchor_relationship: 'direct',
    modality: 'reps',
    sets: 4,
    target_kind: 'fixed',
    target_value: 5,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: 150,
    tempo: null,
    load_type: 'rir',
    load_value: 2,
    is_interval_exercise: false,
    ...overrides,
  }) as Prescription

const workout = (...exercises: Prescription[]): GenerationOutput =>
  ({
    title: 'Lower body strength',
    overview: null,
    sections: [
      {
        section_type: 'primary_lift',
        section_title: 'Primary',
        section_notes: null,
        blocks: [
          {
            structure_type: 'standard',
            rounds: null,
            timer_type: 'none',
            timer_seconds: null,
            round_rest_seconds: null,
            rep_scheme: 'fixed',
            block_notes: null,
            exercises,
          },
        ],
      },
    ],
    estimated_duration_mins: 45,
  }) as GenerationOutput

const FACT: AnchorFact = {
  exerciseId: 'back-squat',
  equipmentUsed: 'barbell',
  value: 285,
  unit: 'lb',
  sessionCount: 5,
  lastSessionDate: '2026-09-21',
}

const fill = (
  exercises: Prescription[],
  anchors: readonly AnchorFact[] = [FACT],
  input = promptInput(),
) => fillSuggestedLoads(workout(...exercises), input, { anchors, today: TODAY })

describe('which rep target a load is inverted at', () => {
  it('takes a fixed target as it stands', () => {
    expect(targetRepsOf(prescription())).toBe(5)
  })

  it('takes the top of a range and the longest rung of a ladder — the lighter answer', () => {
    expect(
      targetRepsOf(
        prescription({ target_kind: 'range', target_value: null, target_min: 8, target_max: 12 }),
      ),
    ).toBe(12)
    expect(
      targetRepsOf(
        prescription({ target_kind: 'sequence', target_value: null, target_sequence: [5, 7, 9] }),
      ),
    ).toBe(9)
  })

  it('has no answer for a piece measured in time or distance', () => {
    expect(targetRepsOf(prescription({ modality: 'time' }))).toBeNull()
  })
})

describe('the target RIR', () => {
  it('follows the system prompt’s own intensity bands', () => {
    expect(targetRirFor(1)).toBe(5)
    expect(targetRirFor(5)).toBe(3)
    expect(targetRirFor(8)).toBe(2)
    expect(targetRirFor(10)).toBe(1)
  })

  it('honours an RIR the model stated, which is a prescription and not a weight', () => {
    expect(resolveTargetRir(prescription({ load_type: 'rir', load_value: 4 }), 8, 'normal')).toEqual(
      { rir: 4, rpeCap: null },
    )
  })

  it('falls back to the intensity when the model gave a percentage instead', () => {
    expect(
      resolveTargetRir(prescription({ load_type: 'percent_1rm', load_value: 75 }), 8, 'normal'),
    ).toEqual({ rir: 2, rpeCap: null })
  })

  it('raises the floor under a directive’s cap and never lowers it', () => {
    expect(resolveTargetRir(prescription({ load_value: 2 }), 8, 'deload')).toEqual({
      rir: 3,
      rpeCap: 7,
    })
    expect(resolveTargetRir(prescription({ load_value: 2 }), 8, 're_entry')).toEqual({
      rir: 2,
      rpeCap: 8,
    })
    expect(resolveTargetRir(prescription({ load_value: 5 }), 8, 'deload').rir).toBe(5)
  })
})

describe('the fill', () => {
  it('writes a weight for an anchored working set, with what qualifies it', () => {
    const [load] = fill([prescription()])

    expect(load.site).toEqual({
      sectionIndex: 0,
      blockIndex: 0,
      exerciseIndex: 0,
      sectionType: 'primary_lift',
    })
    expect(load.weight_suggested).toBeGreaterThan(0)
    expect(load.weight_suggested_unit).toBe('lb')
    expect(load.confidence).toBe('high')
    expect(load.sessionCount).toBe(5)
    expect(load.targetReps).toBe(5)
    expect(suggestedLoadFields(load)).toEqual({
      weight_suggested: load.weight_suggested,
      weight_suggested_unit: 'lb',
    })
  })

  it('fills nothing for an exercise with no anchor for that implement', () => {
    expect(fill([prescription({ equipment: 'dumbbells' })])).toEqual([])
    expect(fill([prescription({ exercise_id: 'front-squat' })])).toEqual([])
  })

  it('fills nothing for prep, conditioning or recovery work', () => {
    expect(fill([prescription({ session_function: 'prep' })])).toEqual([])
    expect(fill([prescription({ session_function: 'conditioning' })])).toEqual([])
    expect(fill([prescription({ session_function: 'recovery' })])).toEqual([])
  })

  it('fills nothing for a piece with no rep target to invert', () => {
    expect(fill([prescription({ modality: 'time' })])).toEqual([])
  })

  it('answers null rather than a plausible number when the anchor is contaminated', () => {
    const [load] = fill([prescription()], [{ ...FACT, lastSessionDate: '2026-05-01' }])

    expect(load.weight_suggested).toBeNull()
    expect(load.weight_suggested_unit).toBeNull()
    expect(load.confidence).toBe('none')
    expect(load.reason).toContain('12 weeks')
  })

  it('deloads the anchor before the rules see it, and carries the RPE ceiling', () => {
    const input = promptInput()
    const normal = fillSuggestedLoads(workout(prescription()), input, {
      anchors: [FACT],
      today: TODAY,
      directive: 'normal',
    })
    const deloaded = fillSuggestedLoads(workout(prescription()), input, {
      anchors: [FACT],
      today: TODAY,
      directive: 'deload',
    })

    expect(deloaded[0].weight_suggested).toBeLessThan(normal[0].weight_suggested ?? 0)
    expect(deloaded[0].rpeCap).toBe(7)
    expect(deloaded[0].targetRir).toBe(3)
    expect(deloaded[0].reason).toContain(`anchor × ${DELOAD_ANCHOR_FACTOR}`)
  })

  it('takes the directive the prompt carried when the caller names none', () => {
    const [load] = fill([prescription()])
    expect(load.rpeCap).toBeNull()
  })

  it('logs counts and never a weight or an exercise id', () => {
    const fields = fillFields(fill([prescription()]), 'normal')

    expect(fields).toEqual({
      directive: 'normal',
      anchored: 1,
      suggested: 1,
      clamped: 0,
      lowConfidence: 0,
    })
    expect(JSON.stringify(fields)).not.toContain('back-squat')
  })
})
