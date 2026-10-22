/** TASK-072 — the modules become one generation, not six adjacent features. */
import { describe, expect, it } from 'vitest'

import { deriveAnchors } from '../state/anchors'
import { ErrorCode, createError, err, ok } from '../state/errors'
import type {
  AnchorEvidenceRow,
  ConditioningHistoryRow,
  GenerationRequest,
} from '../state/schemas'
import { makeGenerationOutput } from './factories'
import {
  catalogRowFixture,
  sectionFixture,
} from './generation-prompt-fixtures'
import { factsFromRows, type CatalogReader } from '../../supabase/functions/_shared/hydrate.ts'
import { PROMPT_VERSION, measurePrompt } from '../../supabase/functions/_shared/prompt.ts'
import {
  performGeneration,
  type GenerationComposerFactory,
  type GenerationDatabase,
} from '../../supabase/functions/_shared/generate.ts'
import type { PromptInput } from '../../supabase/functions/_shared/prompt.ts'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const LOCATION_ID = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID = 'req_task072_mount'

const request: GenerationRequest = {
  request_id: REQUEST_ID,
  goal: 'strength',
  date: '2026-09-27',
  focus: 'lower_body',
  requested_intensity: 7,
  requested_duration_mins: 45,
  location_id: LOCATION_ID,
  notes: 'Keep the shoulder comfortable.',
  deload: false,
}

function database(): GenerationDatabase {
  return {
    candidates: async () =>
      ok([
        sectionFixture('warmup', ['air-squat']),
        sectionFixture('primary_lift', ['back-squat']),
      ]),
    constraints: async () => ok([]),
    recentHistory: async () =>
      ok({ focuses: ['full_body'], patterns: [], exerciseIds: [] }),
    anchors: async () => ok([]),
    conditioning: async () => ok([]),
  }
}

const catalog: CatalogReader = async (ids) => {
  const rows = ids.map(catalogRowFixture)
  const names = new Map(rows.map((row) => [row.id, row.name]))
  return ok(factsFromRows(rows, names))
}

const composer: GenerationComposerFactory = ({ validate }) => ({
  async compose(input) {
    const base = makeGenerationOutput()
    const workout = {
      ...base,
      sections: base.sections.map((section) =>
        section.section_type === 'primary_lift'
          ? {
              ...section,
              blocks: section.blocks.map((block) => ({
                ...block,
                exercises: block.exercises.filter(
                  (exercise) => exercise.exercise_id === 'back-squat',
                ),
              })),
            }
          : section,
      ),
    }
    const validation = validate?.(workout, input)
    if (!validation?.ok) {
      return err(createError(ErrorCode.GENERATION_FAILED, { requestId: REQUEST_ID }))
    }

    return ok({
      workout,
      measurement: measurePrompt('fixture', input),
      usage: { inputTokens: 1, outputTokens: 1 },
      attempts: 1,
      retriedAfter: null,
      validation: validation.value,
    })
  },
})

describe('whole-workout generation integration', () => {
  it('carries today’s goal through validation into Review’s acceptance payload', async () => {
    const result = await performGeneration(
      request,
      { userId: USER_ID, requestId: REQUEST_ID },
      { db: database(), catalog, composer },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.acceptance).toMatchObject({
      date: '2026-09-27',
      location_id: LOCATION_ID,
      session_focus: 'lower_body',
      goal_preset: 'strength',
      requested_duration_mins: 45,
      requested_intensity: 7,
      effective_intensity: 7,
      generation_notes: 'Keep the shoulder comfortable.',
      prompt_version: PROMPT_VERSION,
      contract_version: '4.2.0',
      is_deload: false,
    })
    expect(result.value.acceptance.computed_duration_mins).toBeGreaterThan(0)
    expect(result.value.acceptance.workout.title).toBe('Lower-body strength')
  })

  it('returns a typed context-read failure and never composes around it', async () => {
    let composed = false
    const failingDb: GenerationDatabase = {
      ...database(),
      constraints: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
    }
    const observingComposer: GenerationComposerFactory = (options) => {
      composed = true
      return composer(options)
    }

    const result = await performGeneration(
      request,
      { userId: USER_ID, requestId: REQUEST_ID },
      { db: failingDb, catalog, composer: observingComposer },
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: ErrorCode.PERSISTENCE_READ_FAILED, requestId: REQUEST_ID },
    })
    expect(composed).toBe(false)
  })
})

/**
 * REQ-016 / TASK-030 — a returning athlete whose recent history carries no
 * effort generates like anyone else. The readers' own rules are not re-proved
 * here (`anchors.test.ts`, `generation-training-history.test.ts`); what is
 * proved is the seam: their outputs reach composition and the acceptance
 * payload without a refusal, a defaulted effort or a fabricated load.
 */
describe('no-feedback and mixed history through one generation (REQ-016)', () => {
  /** One working set as `anchor_evidence` answers it. */
  const evidenceSet = (
    session: string,
    date: string,
    overrides: Partial<AnchorEvidenceRow> = {},
  ): AnchorEvidenceRow => ({
    session_id: session,
    session_date: date,
    logged_at: `${date}T10:00:00.000Z`,
    exercise_id: 'back-squat',
    equipment_used: 'barbell',
    set_number: 1,
    actual_reps: 5,
    prescribed_reps: 5,
    weight: 100,
    weight_unit: 'kg',
    rpe: 8,
    ...overrides,
  })

  /** One scored conditioning section as `conditioning_history` answers it. */
  const conditioningSection = (
    index: number,
    overrides: Partial<ConditioningHistoryRow> = {},
  ): ConditioningHistoryRow => ({
    session_id: `c000000${index}-0000-4000-8000-000000000000`,
    session_date: `2026-09-${`${20 - index}`.padStart(2, '0')}`,
    effective_intensity: 7,
    goal_preset: 'strength',
    section_id: `a000000${index}-0000-4000-8000-000000000000`,
    section_order: 2,
    block_id: `b000000${index}-0000-4000-8000-000000000000`,
    block_order: 0,
    structure_type: 'amrap',
    rep_scheme: 'fixed',
    timer_type: 'countdown',
    timer_seconds: 600,
    rounds: null,
    round_rest_seconds: null,
    elapsed_seconds: null,
    completed_under_cap: null,
    rounds_completed: null,
    partial_round_reps: null,
    minutes_completed: null,
    highest_rung: null,
    perceived_effort: null,
    scored_at: `2026-09-${`${20 - index}`.padStart(2, '0')}T10:30:00.000Z`,
    prescriptions: [{
      exercise_id: 'kb-swing', order_index: 0, modality: 'reps', sets: null,
      target_kind: 'fixed', target_value: 10, target_min: null, target_max: null,
      target_sequence: null, per_side: false, distance_unit: null,
      load_type: 'absolute', load_value: 24, equipment_used: 'kettlebell',
    }],
    ...overrides,
  })

  /** Old sessions logged RPE; the newest, after collection was removed, did not. */
  const mixedEvidence: AnchorEvidenceRow[] = [
    evidenceSet('d0000001-0000-4000-8000-000000000000', '2026-09-01'),
    evidenceSet('d0000002-0000-4000-8000-000000000000', '2026-09-08', { weight: 105 }),
    evidenceSet('d0000003-0000-4000-8000-000000000000', '2026-09-15', { weight: 140, rpe: null }),
  ]

  async function generateWith(
    evidence: readonly AnchorEvidenceRow[],
    conditioning: readonly ConditioningHistoryRow[],
  ) {
    const inputs: PromptInput[] = []
    const observing: GenerationComposerFactory = (options) => {
      const inner = composer(options)
      return {
        compose(input) {
          inputs.push(input)
          return inner.compose(input)
        },
      }
    }
    const result = await performGeneration(
      request,
      { userId: USER_ID, requestId: REQUEST_ID },
      {
        db: {
          ...database(),
          anchors: async () => ok(deriveAnchors(evidence).map((anchor) => ({ anchor }))),
          conditioning: async () => ok(conditioning),
        },
        catalog,
        composer: observing,
      },
    )
    return { result, inputs }
  }

  /** What the composer chose, with nothing added on the way to acceptance. */
  const composedLoads = () =>
    makeGenerationOutput().sections.flatMap((section) => section.blocks.flatMap((block) =>
      block.exercises
        .filter((exercise) => section.section_type !== 'primary_lift' || exercise.exercise_id === 'back-squat')
        .map((exercise) => [exercise.exercise_id, exercise.load_type, exercise.load_value]),
    ))

  it('generates with every optional effort and result absent, and estimates nothing', async () => {
    const unrated = [
      evidenceSet('d0000003-0000-4000-8000-000000000000', '2026-09-15', { weight: null, actual_reps: null, rpe: null }),
    ]
    const { result, inputs } = await generateWith(unrated, [1, 2, 3].map((index) => conditioningSection(index)))

    // Missing feedback alone is never a refusal: one composition, one acceptance.
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(inputs).toHaveLength(1)
    // No estimate from a session that recorded no RPE, and no nudge up from
    // sections nobody rated; the conditioning read holds rather than guesses.
    expect(inputs[0].training.anchors).toEqual([])
    expect(inputs[0].training.conditioningTrend).not.toBe('ready')
    expect(result.value.acceptance.is_deload).toBe(false)
    // The persisted prescription is the composed one: no load was fabricated.
    expect(result.value.acceptance.workout.sections.flatMap((section) => section.blocks.flatMap((block) =>
      block.exercises.map((exercise) => [exercise.exercise_id, exercise.load_type, exercise.load_value]),
    ))).toEqual(composedLoads())
  })

  it('rests a mixed old/new history on the RPE it has and leaves that history unrewritten', async () => {
    const before = structuredClone(mixedEvidence)
    const conditioning = [
      conditioningSection(1),
      conditioningSection(2),
      conditioningSection(3, { perceived_effort: 6, rounds_completed: 8 }),
    ]
    const { result, inputs } = await generateWith(mixedEvidence, conditioning)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The anchor the existing rule computes is exactly the RPE-bearing sessions'
    // own; the newer unrated 140 kg is not turned into evidence of a heavier max.
    const historical = deriveAnchors(mixedEvidence.filter((row) => row.rpe !== null))
    expect(inputs[0].training.anchors.map((anchor) => [anchor.exerciseId, anchor.sessionCount]))
      .toEqual([['back-squat', 2]])
    expect(deriveAnchors(mixedEvidence)).toEqual(historical)
    expect(historical[0]).toMatchObject({ session_count: 2, last_session_date: '2026-09-08' })
    expect(inputs[0].training.conditioningTrend).not.toBe('ready')
    // Historical RPE stays readable, and nothing wrote a default into a null.
    expect(mixedEvidence).toEqual(before)
    expect(mixedEvidence.map((row) => row.rpe)).toEqual([8, 8, null])
    expect(result.value.acceptance.workout.sections.flatMap((section) => section.blocks.flatMap((block) =>
      block.exercises.map((exercise) => [exercise.exercise_id, exercise.load_type, exercise.load_value]),
    ))).toEqual(composedLoads())
  })
})
