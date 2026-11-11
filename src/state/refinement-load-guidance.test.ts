/**
 * TASK-036 (REQ-036; AC-R036-01…03; G24, R04, R31) — the load-guidance
 * source and the actual-versus-target contract.
 *
 * Every reading is held to its existing owner (`loadText`, `equipmentName`,
 * `reviewLoadSuggestions`, the logged rows History reads) and to the contract
 * `docs/specs/LOAD_GUIDANCE_CONTRACT.md`. The repeated circuit criterion is
 * consumed from TASK-003's receipts, not re-implemented. The gallery `cards`
 * state is rendered to prove the live consumer reads this model.
 *
 * Synthetic data only: no account, no network, no write.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { verifyReceipt } from '../../scripts/refinement/lib/required-check.mjs'
import { Constants, type Enums } from '../data/database.types'
import { loadApplies, movementActualFromDraft } from '../data/refinement-logging-rules'
import {
  CIRCUIT_BLOCK,
  STANDARD_BLOCK,
  SUPERSET_BLOCK,
  TEN_STATION_CIRCUIT_BLOCK,
  TIMED_BLOCKS,
} from '../dev/gallery-refinement-cards-data'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { makeGenerationOutput, makePrescription, makeSessionAcceptance, makeWorkoutBlock } from '../test/factories'
import { reconstructionFixture } from '../test/workout-double'
import { liveMovementReadings, prescribedLoadReading } from '../ui/refinements/movement-readings'
import { reviewLoadSuggestions } from './load-suggestions'
import { EQUIPMENT_INCREMENTS, incrementFor } from './progression'
import {
  LOAD_DEFINITION_DEPENDENCIES,
  LOAD_GUIDANCE_SOURCES,
  LOAD_MEANINGS,
  performedLoad,
  prescribedLoad,
} from './refinement-load-guidance'
import { equipmentName, loadText } from './review'
import type { LoadAnchorRow, SessionAcceptance, WorkoutBlock } from './schemas'
import { loggedSet } from './session-detail'

const ROOT = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')
const CONTRACT = 'docs/specs/LOAD_GUIDANCE_CONTRACT.md'

type LoadGuidance = Enums<'load_guidance'>
const LOAD_TYPES = Constants.public.Enums.load_guidance
const UNITS = [...Constants.public.Enums.weight_unit, null] as const

/** Anything that reads as a span, an approximation or a per-hand gloss. */
const RANGE_LIKE = /\d\s*[–—-]\s*\d|~|approx|range|\bto\b/i
const PER_HAND_GLOSS = /hand|each|per\b|pair|×|\bx\s*2/i

function value(type: LoadGuidance): number | null {
  return type === 'absolute' ? 24 : type === 'percent_1rm' ? 75 : type === 'rir' ? 2 : null
}

describe('TASK-036 load-guidance source and actual-versus-target contract', () => {
  it('AC-R036-01 reads every load meaning and unit from the prescription’s own columns through loadText, and never a range', () => {
    // Total over the enum, in the same terms as the formatter.
    expect(Object.keys(LOAD_MEANINGS).sort()).toEqual([...LOAD_TYPES].sort())

    for (const type of LOAD_TYPES) {
      for (const unit of UNITS) {
        const columns = { load_type: type, load_value: value(type), equipment_used: 'barbell' }
        const reading = prescribedLoad(columns, unit)
        const meaning = LOAD_MEANINGS[type]
        expect(reading.role).toBe('prescribed-target')
        expect(reading.text, `${type} ${unit}`).toBe(loadText(type, value(type), unit))
        expect(reading.value).toBe(meaning.value)
        // A unit only for a weight, and only the profile's: none is guessed.
        expect(reading.unit).toBe(meaning.weightUnit ? unit : null)
        expect(reading.amount).toBe(meaning.value === 'none' ? null : value(type))
        // No production range rule exists (LOAD-RANGE-RULE).
        expect(reading.range).toBeNull()
        expect(reading.rangeDependency).toBe('LOAD-RANGE-RULE')
        expect(reading.text ?? '').not.toMatch(RANGE_LIKE)
      }
    }

    expect(prescribedLoad({ load_type: 'absolute', load_value: 60, equipment_used: 'barbell' }, 'kg').text).toBe('60 kg')
    expect(prescribedLoad({ load_type: 'absolute', load_value: 60, equipment_used: 'barbell' }, 'lb').text).toBe('60 lb')
    // An unread unit states the number alone.
    expect(prescribedLoad({ load_type: 'absolute', load_value: 60, equipment_used: 'barbell' }, null)).toMatchObject({ text: '60', unit: null })
    // Unloaded is not zero, and a value-less kind invents no number.
    expect(prescribedLoad({ load_type: 'none', load_value: null, equipment_used: 'bodyweight' }, 'kg')).toMatchObject({ text: null, amount: null })
    expect(prescribedLoad({ load_type: 'prior_session', load_value: 80, equipment_used: 'barbell' }, 'kg')).toMatchObject({ text: 'Match last session', amount: null })
    expect(prescribedLoad({ load_type: null, load_value: null, equipment_used: 'barbell' }, 'kg')).toMatchObject({ text: null, loadType: null })

    // The live consumer reads this model: the same text, for every kind.
    for (const type of LOAD_TYPES) {
      const prescription = { exercise_id: 'kb-swing', equipment_used: 'kettlebell', load_type: type, load_value: value(type) }
      expect(liveMovementReadings(prescription, 'kg').load).toBe(
        prescribedLoadReading(prescribedLoad(prescription, 'kg').text, 'kettlebell'),
      )
    }
    expect(read('src/ui/refinements/movement-readings.ts')).toMatch(/prescribedLoad\(prescription, weightUnit\)\.text/)
  })

  it('AC-R036-01 states no per-hand reading: the stored number is shown unchanged beside its implement, never doubled, halved or explained', () => {
    // OVR-01 states the dumbbell step per hand; progression implements it.
    expect(EQUIPMENT_INCREMENTS.dumbbells).toEqual({ lb: 5, kg: 2 })
    expect(incrementFor('dumbbells', 'kg')).toBe(2)
    expect(read('docs/specs/OVR-01_progressive-overload.md')).toContain('Dumbbell 5 lb / 2 kg per hand')

    for (const equipment of ['dumbbells', 'kettlebells', 'dumbbell-pair', 'barbell']) {
      for (const unit of ['kg', 'lb'] as const) {
        const reading = prescribedLoad({ load_type: 'absolute', load_value: 22, equipment_used: equipment }, unit)
        expect(reading.text).toBe(`22 ${unit}`)
        expect(reading.text).not.toMatch(PER_HAND_GLOSS)
        expect(reading.implement).toBe(equipmentName(equipment))
        expect(reading.perHand).toEqual({ stated: false, dependency: 'LOAD-PER-HAND' })
      }
    }
    // The implement carries the sense, beside the name, not in the load.
    const pair = liveMovementReadings({ exercise_id: 'dumbbell-row', equipment_used: 'dumbbell-pair', load_type: 'absolute', load_value: 22 }, 'kg')
    expect(pair).toEqual({ name: 'dumbbell row', equipment: 'dumbbell pair', load: '22 kg' })
  })

  it('AC-R036-01 keeps the prescribed target apart from the weight performed, each in its own unit', () => {
    // A performed weight is the logged row's, in the unit it was logged in.
    expect(performedLoad({ weight: 50, weight_unit: 'lb' })).toEqual({ role: 'performed', weight: 50, unit: 'lb' })
    // Not recorded is not zero, and is never filled from the prescription.
    expect(performedLoad({ weight: null, weight_unit: 'kg' })).toBeNull()
    expect(performedLoad({ weight: 0, weight_unit: 'kg' })).toEqual({ role: 'performed', weight: 0, unit: 'kg' })

    // History's own reader states the same weight and unit, unconverted.
    const [row] = reconstructionFixture({
      sections: [{ blocks: [{ exercises: [{ setLogs: [{ weight: 50, weight_unit: 'lb' }] }] }] }],
    }).sections[0].blocks[0].exercises[0].set_logs
    const performed = performedLoad(row)!
    expect(loggedSet(row).weight).toBe(`${performed.weight} ${performed.unit}`)
    // The target is read in the profile's unit and is unchanged by any log.
    const target = prescribedLoad({ load_type: 'absolute', load_value: 24, equipment_used: 'kettlebell' }, 'kg')
    expect(target).toMatchObject({ role: 'prescribed-target', amount: 24, unit: 'kg', text: '24 kg' })

    // The logging rules never carry the target into an actual.
    const prescription = {
      exercise_id: 'kb-swing', modality: 'reps' as const, sets: null, target_kind: 'fixed' as const, target_value: 12,
      target_min: null, target_max: null, target_sequence: null, per_side: false, distance_unit: null,
      equipment_used: 'kettlebell', load_type: 'absolute' as const, load_value: 24,
    }
    const blank = movementActualFromDraft(
      { id: 'm-1', workoutExerciseId: 'e-1', prescription, partialRound: 2, weightUnit: 'kg', draft: { amount: '5', weight: '' } },
      'amrap',
    )
    expect(blank.ok && blank.value).toMatchObject({ actual_reps: 5, weight: null })
    const typed = movementActualFromDraft(
      { id: 'm-2', workoutExerciseId: 'e-1', prescription, partialRound: null, weightUnit: 'lb', draft: { amount: '', weight: '20' } },
      'amrap',
    )
    expect(typed.ok && typed.value).toMatchObject({ weight: 20, weight_unit: 'lb' })

    // The read model reads only prescription columns.
    const source = read('src/state/refinement-load-guidance.ts')
    expect(source).toMatch(/export function prescribedLoad\(\s*columns: PrescribedLoadColumns,/)
    expect(source).toMatch(/export interface PrescribedLoadColumns \{\s*readonly load_type[^}]*readonly load_value[^}]*readonly equipment_used: string\s*\}/)
  })

  it('AC-R036-01 names one existing owner per reading and promotes no synthetic preview range into production code', () => {
    for (const { field, owner } of LOAD_GUIDANCE_SOURCES) {
      expect(existsSync(resolve(ROOT, owner.module)), field).toBe(true)
      expect(read(owner.module), `${field}: ${owner.module} exports ${owner.name}`).toMatch(
        new RegExp(`export (function|const) ${owner.name}\\b`),
      )
    }
    const contract = read(CONTRACT)
    for (const { field, owner } of LOAD_GUIDANCE_SOURCES) {
      expect(contract, field).toContain(`\`${field}\``)
      expect(contract, owner.name).toContain(`\`${owner.name}\``)
    }

    // The read model and its consumer import nothing from the gallery or a
    // fixture, and carry no band, range or sample load of their own.
    for (const file of ['src/state/refinement-load-guidance.ts', 'src/ui/refinements/movement-readings.ts']) {
      const source = read(file)
      expect(source, file).not.toMatch(/from '[^']*\/(dev|test)\//)
      expect(source, file).not.toMatch(/\d+\s*[–-]\s*\d+\s*%|\d+\s*(lb|kg)\b['`]/)
    }
    // The prompt's LOAD GUIDANCE bands stay composition instructions.
    expect(read('supabase/functions/_shared/prompt.ts')).toMatch(/LOAD GUIDANCE\n- 1–2: bodyweight or very light, roughly 0–40%/)
    // A prescription holds one value; no range column exists.
    const types = read('src/data/database.types.ts')
    expect(types).toMatch(/load_value: number \| null/)
    expect(types).not.toMatch(/load_(min|max|low|high|range)\b|weight_suggested/)
  })

  it('AC-R036-02 consumes TASK-003’s current passing evidence that the verified circuit has no Review weight change and keeps its optional logger', () => {
    const manifestPath = resolve(ROOT, 'evidence/refinement/task-003/required-cases.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      checks: Record<string, { runner: string; files: string[]; cases: { name: string; criterion: string }[] }>
    }
    const expected: Record<string, string> = {
      'check-01': 'TASK-003 consistent format badges and truthful prescribed load > AC-R003-04 offers no Review Change weight control on the verified circuit and keeps its actual weight entry in the optional logger',
      'check-02': 'TASK-003 consistent format badges and truthful prescribed load > AC-R003-04 keyboard and touch: the verified circuit explains its suggestion without a Review weight change, and its optional logger takes the actual weight',
    }
    for (const [checkId, name] of Object.entries(expected)) {
      const check = manifest.checks[checkId]
      expect(check.cases.map((testCase) => testCase.name), checkId).toContain(name)
      const problems = verifyReceipt({
        cwd: ROOT,
        evidenceRoot: resolve(ROOT, 'evidence/refinement'),
        task: 'TASK-003',
        checkId,
        check,
        manifestPath,
      })
      expect(problems, checkId).toEqual([])
      const receipt = JSON.parse(read(`evidence/refinement/task-003/results/${checkId}.json`)) as {
        verdict: string
        requiredCases: { name: string; status: string }[]
      }
      expect(receipt.verdict).toBe('passed')
      expect(receipt.requiredCases.find((testCase) => testCase.name === name)?.status, checkId).toBe('passed')
    }
    // The contract names both consumed cases (prose is wrapped, so spaces are folded).
    const contract = read(CONTRACT).replace(/\s+/g, ' ')
    expect(contract).toContain(expected['check-01'].split(' > ')[1])
    expect(contract).toContain(expected['check-02'].split(' > ')[1])
  })

  it('AC-R036-02 removes the Review weight change for the circuit only and does not extrapolate that storage proof to other formats', () => {
    const anchored = makePrescription({ exercise_id: 'kb-swing', equipment: 'kettlebell', session_function: 'accessory', load_type: 'absolute', load_value: 24 })
    const structures: readonly WorkoutBlock['structure_type'][] = ['standard', 'superset', 'circuit', 'emom', 'amrap', 'for_time']
    const blocks = structures.map((structure_type) =>
      makeWorkoutBlock({
        structure_type,
        rounds: structure_type === 'circuit' || structure_type === 'superset' ? 2 : null,
        timer_type: structure_type === 'emom' ? 'per_minute' : structure_type === 'amrap' || structure_type === 'for_time' ? 'countdown' : 'none',
        timer_seconds: structure_type === 'emom' || structure_type === 'amrap' || structure_type === 'for_time' ? 600 : null,
        exercises: [anchored],
      }),
    )
    const acceptance: SessionAcceptance = makeSessionAcceptance({
      workout: makeGenerationOutput({ sections: [{ section_type: 'conditioning', section_title: 'Conditioning', section_notes: null, blocks }] }),
    })
    const anchor: LoadAnchorRow = {
      user_id: 'a0000001-0000-4000-8000-000000000000', exercise_id: 'kb-swing', equipment_used: 'kettlebell',
      anchor_value: 28, unit: 'kg', confidence: 'high', session_count: 4, last_session_date: '2026-09-20',
      updated_at: '2026-09-20T18:00:00.000Z',
    }
    const suggestions = reviewLoadSuggestions({ acceptance, anchors: [anchor], evidence: [], weightUnit: 'kg' })
    const adjustable = structures.map((_, blockIndex) =>
      suggestions.get(`section-0-block-${blockIndex}-exercise-0`)?.adjustable)
    expect(adjustable).toEqual([true, true, false, true, true, true])
    // The circuit still explains its suggestion, and its movement still takes
    // an actual weight in the optional logger (a loaded implement).
    expect(suggestions.get('section-0-block-2-exercise-0')?.weight).not.toBeUndefined()
    expect(loadApplies({ equipment_used: 'kettlebell' })).toBe(true)
    // The decision is TASK-003's, in one place; this task did not re-edit it.
    expect(read('src/state/load-suggestions.ts')).toMatch(/adjustable: block\.structure_type !== 'circuit'/)
  })

  it('AC-R036-03 records each definition dependency the source cannot establish, with its owner and what continues meanwhile', () => {
    expect(LOAD_DEFINITION_DEPENDENCIES.map((dependency) => dependency.id)).toEqual(['LOAD-RANGE-RULE', 'LOAD-PER-HAND'])
    const contract = read(CONTRACT)
    for (const dependency of LOAD_DEFINITION_DEPENDENCIES) {
      expect(dependency.owner).toBe('Eric')
      for (const text of [dependency.blocks, dependency.reason, dependency.continues]) expect(text.length).toBeGreaterThan(20)
      expect(contract).toMatch(new RegExp(`\`${dependency.id}\` — Owner: Eric\\. Blocks:`))
    }
    // Recorded as open, with no option chosen and no implementation claimed.
    expect(contract).toContain('no option is pre-selected')
    expect(contract).not.toMatch(/\b(recommended|selected) option\b/i)
    expect(contract).toMatch(/does not claim a load range, a per-hand label or any other undefined feature is\s+implemented/)
    for (const id of ['REQ-036', '#663', 'TASK-036', 'G24', 'R04', 'R31', 'AC-R036-01', 'AC-R036-02', 'AC-R036-03',
      'EVID-8D879C0997E4', 'EVID-76CED19E0F10', 'eded158cfd928d382c9a9409e2c372270312741d', '/gallery/refinements?state=cards',
      'src/ui/refinements/movement.tsx', 'src/ui/refinements/workout-card.tsx']) {
      expect(contract, id).toContain(id)
    }
  })

  it('AC-R036-03 continues the prescribed-load presentation on the gallery cards state through the read model, with no range', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    render(createElement(MemoryRouter, { initialEntries: ['/gallery/refinements?state=cards'] }, createElement(GalleryRefinements)))
    const state = document.querySelector<HTMLElement>('[data-refinement-state="cards"]')!
    const loads = (context: string) =>
      [...state.querySelectorAll<HTMLElement>(`[data-gallery-context="${context}"] [data-movement-identity]`)].map(
        (identity) => identity.querySelector('[data-movement-load]')?.textContent ?? null,
      )
    // What the read model says each prescription's target is, in the gallery's unit.
    const expected = (blocks: readonly WorkoutBlock[]) =>
      blocks.flatMap((block) => block.exercises.map((exercise) =>
        prescribedLoadReading(
          prescribedLoad({ ...exercise, equipment_used: exercise.equipment }, 'kg').text,
          equipmentName(exercise.equipment),
        )))

    const compositions: readonly [RegExp | null, readonly WorkoutBlock[]][] = [
      [null, [STANDARD_BLOCK, SUPERSET_BLOCK, CIRCUIT_BLOCK]],
      [/EMOM, AMRAP and For Time/, TIMED_BLOCKS],
      [/Ten long-named stations/, [TEN_STATION_CIRCUIT_BLOCK]],
    ]
    for (const [label, blocks] of compositions) {
      if (label !== null) await user.click(within(state).getByRole('radio', { name: label }))
      const want = expected(blocks)
      expect(want.some((load) => load !== null)).toBe(true)
      expect(loads('review'), String(label)).toEqual(want)
      expect(loads('workout'), String(label)).toEqual(want)
      for (const load of [...loads('review'), ...loads('workout')]) {
        expect(load ?? '').not.toMatch(RANGE_LIKE)
        expect(load ?? '').not.toMatch(PER_HAND_GLOSS)
      }
    }
  })
})
