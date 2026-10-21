import { describe, expect, it } from 'vitest'

import { sessionRead } from '../state/progression'
import { applyLoadOverrides, prescriptionSiteKey, reviewLoadSuggestions } from '../state/load-suggestions'
import { createSessionsClient } from '../data/sessions'
import { anchorRow, evidenceRows, suggestionAcceptance } from './load-suggestion-fixtures'
import { createSessionDouble } from './session-double'
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

describe('absent effort in the last session (REQ-016)', () => {
  const read = (rpe: number | null, actualReps = 5) =>
    sessionRead(
      [1, 2, 3].map((setNumber) => ({
        session_id: 'c0000001-0000-4000-8000-000000000000',
        session_date: '2026-09-21',
        logged_at: `2026-09-21T10:0${setNumber}:00.000Z`,
        exercise_id: 'back-squat',
        equipment_used: 'barbell',
        set_number: setNumber,
        actual_reps: actualReps,
        prescribed_reps: 5,
        weight: 225,
        weight_unit: 'lb' as const,
        rpe,
      })),
    )

  it('fills the held number, with no rule fired, when the last session recorded no RPE', () => {
    const [unread] = fill([prescription()], [{ ...FACT, lastSession: null }])
    const [noEffort] = fill([prescription()], [{ ...FACT, lastSession: read(null) }])

    expect(noEffort).toEqual(unread)
    expect(noEffort.rule).toBeNull()
    expect(noEffort.reason).toBe('no rule fired → hold load')
  })

  it('steps only where a rule reads what was recorded', () => {
    const [held] = fill([prescription()], [{ ...FACT, lastSession: read(null) }])
    const [measured] = fill([prescription()], [{ ...FACT, lastSession: read(8) }])
    const [missed] = fill([prescription()], [{ ...FACT, lastSession: read(null, 3) }])

    expect(measured.rule).toBe('on-target')
    expect(measured.weight_suggested).toBeGreaterThan(held.weight_suggested ?? 0)
    expect(missed.rule).toBe('overshoot-missed-reps')
    expect(missed.weight_suggested).toBeLessThan(held.weight_suggested ?? 0)
  })

  it('writes the suggestion to the suggestion columns and to no performed field', () => {
    const [load] = fill([prescription()], [{ ...FACT, lastSession: read(null) }])

    expect(Object.keys(suggestedLoadFields(load))).toEqual([
      'weight_suggested',
      'weight_suggested_unit',
    ])
  })
})


// TASK037: the live Review reader must carry an existing rule through the real
// acceptance client, not only describe it in reason text. This uses the existing
// local persistence double; it makes no backend or generation request.
describe('existing rep progression reaches the next prescription', () => {
  const key = prescriptionSiteKey(0, 0, 0)
  const shapes = [
    { name: 'fixed', target: { target_kind: 'fixed', target_value: 8, target_min: null, target_max: null, target_sequence: null } },
    { name: 'range', target: { target_kind: 'range', target_value: null, target_min: 6, target_max: 8, target_sequence: null } },
    { name: 'ladder', target: { target_kind: 'sequence', target_value: null, target_min: null, target_max: null, target_sequence: [2, 4, 6] } },
  ] as const
  function source(target = shapes[0].target as Partial<Prescription>) {
    const acceptance = suggestionAcceptance()
    acceptance.goal_preset = 'hypertrophy'
    const block = acceptance.workout.sections[0].blocks[0]
    block.exercises[0] = { ...block.exercises[0], ...target } as Prescription
    // The companion has no eligible anchor. Timed/round fields are preserved.
    block.structure_type = 'superset'
    block.rep_scheme = target.target_kind === 'sequence' ? 'ladder_fixed_interval' : 'fixed'
    block.rounds = 3
    block.timer_type = 'interval'
    block.timer_seconds = 60
    return acceptance
  }
  for (const shape of shapes) {
    for (const [rpe, delta] of [[7.5, 1], [6, 2]] as const) {
      it(`${shape.name} carries the existing +${delta} through accept and reload once`, async () => {
        const acceptance = source(shape.target as Partial<Prescription>)
        const evidence = evidenceRows().map(row => ({ ...row, rpe }))
        const original = structuredClone(acceptance)
        const suggestions = reviewLoadSuggestions({ acceptance, anchors: [anchorRow()], evidence })
        expect(suggestions.get(key)?.repDelta).toBe(delta)
        const editedWeight = new Map([[key, { weight: 72.5, unit: 'kg' as const }]])
        const next = applyLoadOverrides(acceptance, editedWeight, suggestions)
        const proposed = next.workout.sections[0].blocks[0].exercises[0]
        if (shape.name === 'fixed') expect(proposed.target_value).toBe(8 + delta)
        if (shape.name === 'range') expect([proposed.target_min, proposed.target_max]).toEqual([6 + delta, 8 + delta])
        if (shape.name === 'ladder') expect(proposed.target_sequence).toEqual([2 + delta, 4 + delta, 6 + delta])
        expect(proposed.target_kind).toBe(shape.target.target_kind)
        expect(proposed.load_value).toBe(72.5)
        expect(next.workout.sections[0].blocks[0].exercises[1]).toEqual(original.workout.sections[0].blocks[0].exercises[1])
        expect({ ...next.workout.sections[0].blocks[0], exercises: [] }).toEqual({ ...original.workout.sections[0].blocks[0], exercises: [] })
        expect(applyLoadOverrides(next, editedWeight, suggestions)).toEqual(next)
        expect(acceptance).toEqual(original)

        const user = 'a0000001-0000-4000-8000-000000000000'
        const double = createSessionDouble({ url: 'https://project.supabase.co', anonKey: 'anon', users: { token: user } })
        const client = createSessionsClient({ url: 'https://project.supabase.co', anonKey: 'anon', accessToken: 'token', fetch: double.fetch })
        const saved = await client.accept(user, next)
        expect(saved.ok).toBe(true)
        if (!saved.ok) throw new Error('acceptance failed')
        const loaded = await client.asGenerated(saved.value.session.id)
        expect(loaded.ok).toBe(true)
        if (!loaded.ok) throw new Error('reload failed')
        const stored = loaded.value.sections[0].blocks[0].exercises[0].exercise
        expect(stored.target_kind).toBe(proposed.target_kind)
        expect(stored.target_value).toBe(proposed.target_value)
        expect(stored.target_min).toBe(proposed.target_min)
        expect(stored.target_max).toBe(proposed.target_max)
        expect(stored.target_sequence).toEqual(proposed.target_sequence)
        expect(stored.load_value).toBe(72.5)
        expect(double.store().setLogs).toEqual([])
        expect(double.store().blockResults).toEqual([])
      })
    }
  }

  it('keeps null, insufficient and discarded history from inventing a rep increase', () => {
    const acceptance = source()
    for (const [anchor, evidence] of [
      [anchorRow(), []],
      [anchorRow(), evidenceRows().map(row => ({ ...row, rpe: null }))],
      [anchorRow({ session_count: 1 }), evidenceRows()],
      [anchorRow({ last_session_date: '2026-01-01' }), evidenceRows()],
    ] as const) {
      const suggestions = reviewLoadSuggestions({ acceptance, anchors: [anchor], evidence })
      expect(applyLoadOverrides(acceptance, new Map(), suggestions)).toEqual(acceptance)
    }
  })

  it('respects a changed rep target and unrelated edits instead of reapplying an old recommendation', () => {
    const acceptance = source()
    const suggestions = reviewLoadSuggestions({ acceptance, anchors: [anchorRow()], evidence: evidenceRows() })
    const edited = structuredClone(acceptance)
    edited.workout.sections[0].blocks[0].exercises[0] = prescription({ target_value: 12, sets: 2, rest_seconds: 40 })
    const next = applyLoadOverrides(edited, new Map(), suggestions)
    expect(next).toEqual(edited)
  })

  it('holds the rep targets already prescribed for deload and active recovery', () => {
    for (const acceptance of [{ ...source(), is_deload: true }, { ...source(), goal_preset: 'active_recovery' as const }]) {
      const suggestions = reviewLoadSuggestions({ acceptance, anchors: [anchorRow()], evidence: evidenceRows() })
      expect(suggestions.get(key)?.repDelta).toBe(0)
      expect(applyLoadOverrides(acceptance, new Map(), suggestions)).toEqual(acceptance)
    }
  })
})
