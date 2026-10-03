/** TASK-072 — the modules become one generation, not six adjacent features. */
import { describe, expect, it } from 'vitest'

import { ErrorCode, createError, err, ok } from '../state/errors'
import type { GenerationRequest } from '../state/schemas'
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
      contract_version: '4.1.0',
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
