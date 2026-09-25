/**
 * REV-02 — the swap, on GEN-02's contract.
 *
 * Four claims, and the file is arranged as four:
 *
 *   * a swap draws from the **same candidate query** as generation, scoped to
 *     the slot's section and to this session's constraints;
 *   * a **unit swap** regenerates a whole block, and the block's structure and
 *     timer survive it — in the prompt, in the checks, and in the SQL, which
 *     never writes `workout_blocks` at all;
 *   * the result is **persisted as a revision with lineage**, never a mutation
 *     in place (D6);
 *   * the **envelope guarantees are inherited** rather than restated.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { UserConstraint } from '../data/constraints'
import { ErrorCode, err, ok, type Result } from '../state/errors'
import {
  blockSwapResultSchema,
  sessionSnapshotSchema,
  sessionTransitionSchema,
  swapRequestSchema,
  swapSuccessSchema,
  type GenerationOutput,
  type Prescription,
  type SessionSnapshot,
  type SessionTransition,
  type SwapRequest,
} from '../state/schemas'
import type { CatalogReader } from '../../supabase/functions/_shared/hydrate.ts'
import { factsFromRows } from '../../supabase/functions/_shared/hydrate.ts'
import type { PromptInput } from '../../supabase/functions/_shared/prompt.ts'
import {
  assembleSwapPrompt,
  checkSwapShape,
  performSwap,
  resolveSwapScope,
  swapDirective,
  swapPromptInput,
  swapValidator,
  type BlockRevisionRequest,
  type SwapDatabase,
  type SwapComposerFactory,
  type SwapScope,
} from '../../supabase/functions/_shared/swap.ts'
import { catalogRowFixtures, sectionFixture, TODAY } from './generation-prompt-fixtures'

const repoRoot = resolve(import.meta.dirname, '../..')
const read = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), 'utf-8')

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — one session, one section, one block, two prescriptions
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const SECTION_ID = '22222222-2222-4222-8222-222222222222'
const BLOCK_ID = '33333333-3333-4333-8333-333333333333'
const FIRST_ID = '44444444-4444-4444-8444-444444444444'
const SECOND_ID = '55555555-5555-4555-8555-555555555555'
const USER_ID = '66666666-6666-4666-8666-666666666666'
const LOCATION_ID = '77777777-7777-4777-8777-777777777777'
const SUBSTITUTE_ID = '88888888-8888-4888-8888-888888888888'
const REQUEST_ID = 'req_lxyz123_a1b2c3'

const NOW = '2026-09-25T10:00:00+00:00'

/** The section this session prescribes from, and the candidates it retrieved. */
const CANDIDATES = sectionFixture('primary_lift', ['back-squat', 'deadlift', 'front-squat'])

const prescriptionRow = (id: string, exerciseId: string, order: number) => ({
  id,
  block_id: BLOCK_ID,
  exercise_id: exerciseId,
  order_index: order,
  modality: 'reps',
  sets: 3,
  target_kind: 'fixed',
  target_value: 8,
  target_min: null,
  target_max: null,
  target_sequence: null,
  per_side: false,
  distance_unit: null,
  rest_seconds: 90,
  tempo: null,
  load_type: 'bodyweight',
  load_value: null,
  equipment_used: 'barbell',
  is_interval_exercise: false,
  slot_id: id,
  replaces_id: null,
  origin: 'generated',
  created_at: NOW,
  superseded_at: null,
  revision_status: 'active',
  execution_status: 'not_started',
  exercise_notes: null,
})

function snapshotFixture(
  overrides: { state?: string; structure?: Record<string, unknown> } = {},
): SessionSnapshot {
  return sessionSnapshotSchema.parse({
    state: overrides.state ?? 'prescribed',
    session: {
      id: SESSION_ID,
      user_id: USER_ID,
      location_id: LOCATION_ID,
      created_at: NOW,
      updated_at: NOW,
      date: '2026-09-25',
      title: 'Lower body',
      overview: null,
      session_focus: 'lower_body',
      goal_preset: 'strength',
      requested_duration_mins: 45,
      effective_duration_target_mins: 45,
      computed_duration_mins: null,
      actual_duration_mins: null,
      requested_intensity: 8,
      effective_intensity: 7,
      adjustment_reason: null,
      generation_notes: 'left shoulder has been cranky',
      prompt_version: '5.1.0',
      contract_version: '4.1.0',
      started_at: null,
      completed_at: null,
      abandoned_at: null,
      mood: null,
      session_notes: null,
      counts_for_streak: true,
    },
    sections: [
      {
        section: {
          id: SECTION_ID,
          session_id: SESSION_ID,
          created_at: NOW,
          updated_at: NOW,
          section_type: 'primary_lift',
          order_index: 0,
          section_title: 'Primary',
          section_notes: null,
        },
        blocks: [
          {
            block: {
              id: BLOCK_ID,
              section_id: SECTION_ID,
              created_at: NOW,
              order_index: 0,
              structure_type: 'superset',
              rounds: 3,
              timer_type: 'none',
              timer_seconds: null,
              round_rest_seconds: 120,
              rep_scheme: 'fixed',
              block_notes: null,
              ...overrides.structure,
            },
            exercises: [
              { exercise: prescriptionRow(FIRST_ID, 'back-squat', 0), set_logs: [] },
              { exercise: prescriptionRow(SECOND_ID, 'deadlift', 1), set_logs: [] },
            ],
          },
        ],
      },
    ],
  })
}

const singleRequest: SwapRequest = {
  request_id: REQUEST_ID,
  session_id: SESSION_ID,
  mode: 'single',
  workout_exercise_id: FIRST_ID,
}

const unitRequest: SwapRequest = {
  request_id: REQUEST_ID,
  session_id: SESSION_ID,
  mode: 'unit',
  block_id: BLOCK_ID,
}

/** One of each half of DATA-05's answer, as `constraints_in_force` returns them. */
const constraintFixture = (
  action: UserConstraint['action'],
  target: UserConstraint['target'],
): UserConstraint => ({
  id: '99999999-9999-4999-8999-999999999999',
  userId: USER_ID,
  action,
  target,
  appliesTo: { persistence: 'persistent' },
  note: null,
  createdAt: NOW,
})

const SOFT_CONSTRAINT = constraintFixture('avoid', {
  scope: 'movement_pattern',
  pattern: 'hinge',
})

const HARD_CONSTRAINT = constraintFixture('exclude', {
  scope: 'exercise',
  exerciseId: 'deadlift',
})

const scopeFor = (request: SwapRequest, snapshot = snapshotFixture()): SwapScope => {
  const scope = resolveSwapScope(snapshot, request)
  if (!scope.ok) throw new Error(`the fixture did not resolve: ${scope.error.code}`)
  return scope.value
}

const prescription = (exerciseId: string): Prescription => ({
  exercise_id: exerciseId,
  equipment: 'barbell',
  session_function: 'primary',
  anchor_relationship: 'direct',
  modality: 'reps',
  sets: 3,
  target_kind: 'fixed',
  target_value: 8,
  target_min: null,
  target_max: null,
  target_sequence: null,
  per_side: false,
  distance_unit: null,
  rest_seconds: 90,
  tempo: null,
  load_type: 'bodyweight',
  load_value: null,
  is_interval_exercise: false,
})

/** What the model is asked to return: one section, one block, N replacements. */
const composed = (exerciseIds: readonly string[]): GenerationOutput => ({
  title: 'Front squat',
  overview: null,
  estimated_duration_mins: 45,
  sections: [
    {
      section_type: 'primary_lift',
      section_title: 'Primary',
      section_notes: null,
      blocks: [
        {
          structure_type: 'superset',
          rounds: 3,
          timer_type: 'none',
          timer_seconds: null,
          round_rest_seconds: 120,
          rep_scheme: 'fixed',
          block_notes: null,
          exercises: exerciseIds.map(prescription),
        },
      ],
    },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
// Scope
// ─────────────────────────────────────────────────────────────────────────────

describe('a swap is resolved against the session, not against the request', () => {
  it('locates a single slot, its block, and what is staying', () => {
    const scope = scopeFor(singleRequest)

    expect(scope.mode).toBe('single')
    expect(scope.outgoing.map((row) => row.id)).toEqual([FIRST_ID])
    expect(scope.keptInBlock.map((row) => row.exercise_id)).toEqual(['deadlift'])
    expect(scope.block.structure_type).toBe('superset')
    expect(scope.section.section_type).toBe('primary_lift')
  })

  it('takes every member of the block for a unit swap, in order', () => {
    const scope = scopeFor(unitRequest)

    expect(scope.outgoing.map((row) => row.id)).toEqual([FIRST_ID, SECOND_ID])
    // Nothing is staying, which is what "as a unit" means.
    expect(scope.keptInBlock).toEqual([])
  })

  it('refuses a slot that is not in this session', () => {
    const scope = resolveSwapScope(snapshotFixture(), {
      ...singleRequest,
      workout_exercise_id: SUBSTITUTE_ID,
    })

    expect(scope.ok).toBe(false)
    if (!scope.ok) expect(scope.error.code).toBe(ErrorCode.PERSISTENCE_NOT_FOUND)
  })

  it('refuses a session that has already been completed', () => {
    const scope = resolveSwapScope(snapshotFixture({ state: 'completed' }), singleRequest)

    expect(scope.ok).toBe(false)
    if (!scope.ok) expect(scope.error.code).toBe(ErrorCode.SESSION_INVALID_TRANSITION)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The prompt — the same one, scoped
// ─────────────────────────────────────────────────────────────────────────────

describe('the swap prompt is generation’s, with one directive', () => {
  const input = (request: SwapRequest): PromptInput =>
    swapPromptInput(scopeFor(request), CANDIDATES, [], TODAY, REQUEST_ID)

  it('retrieves and offers the slot’s section alone', () => {
    const promptInput = input(singleRequest)

    expect(promptInput.request.effectiveSections).toEqual(['primary_lift'])
    expect(promptInput.sections).toEqual([CANDIDATES])
    // The session's stored effective values, not a second clamp.
    expect(promptInput.request.effectiveIntensity).toBe(7)
    expect(promptInput.request.requestedIntensity).toBe(8)
  })

  it('names what is staying as what must not be duplicated', () => {
    expect(input(singleRequest).history.exerciseIds).toEqual(['deadlift'])
  })

  it('tells the model which slot, and what the block’s clock is', () => {
    const directive = swapDirective(scopeFor(singleRequest))

    expect(directive).toContain('SWAP MODE: single')
    expect(directive).toContain('Replace ONLY back-squat')
    expect(directive).toContain('Staying in this block (do not duplicate): deadlift')
    expect(directive).toContain('structure_type: superset')
    expect(directive).toContain('round_rest_seconds: 120')
    expect(directive).toContain('exactly 1 exercise')
  })

  it('asks for the whole block, as a unit, when that is the swap', () => {
    const directive = swapDirective(scopeFor(unitRequest))

    expect(directive).toContain('SWAP MODE: unit')
    expect(directive).toContain('Replace the entire superset block as a unit: back-squat, deadlift')
    expect(directive).toContain('exactly 2 exercises')
  })

  it('appends the directive to the generation prompt rather than replacing it', () => {
    const scope = scopeFor(singleRequest)
    const assembled = assembleSwapPrompt(input(singleRequest), scope)

    expect(assembled.system).toContain('You compose personalized workouts for CLEAR')
    expect(assembled.user).toContain('CANDIDATES — primary_lift')
    expect(assembled.user).toContain('OUTPUT CONTRACT')
    // Last, so the one instruction this call does not share is read last.
    expect(assembled.user.endsWith(swapDirective(scope))).toBe(true)
    expect(assembled.measurement.contractVersion).toBe('4.1.0')
    // §9's echo: the id the envelope is answering with, not the session's.
    expect(assembled.user).toContain(`request_id: ${REQUEST_ID}`)
    expect(assembled.user).not.toContain(`request_id: ${SESSION_ID}`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The narrower checks
// ─────────────────────────────────────────────────────────────────────────────

describe('a response wider than the slot is rejected', () => {
  const scope = scopeFor(singleRequest)

  it('accepts one section, one block, one replacement', () => {
    expect(checkSwapShape(composed(['front-squat']), scope)).toEqual([])
  })

  it('rejects a second section — that is a regeneration, not a swap', () => {
    const workout = composed(['front-squat'])
    const wide = { ...workout, sections: [...workout.sections, workout.sections[0]] }

    expect(checkSwapShape(wide, scope)[0].path).toBe('sections')
  })

  it('rejects a second block', () => {
    const workout = composed(['front-squat'])
    const section = workout.sections[0]
    const wide = {
      ...workout,
      sections: [{ ...section, blocks: [...section.blocks, section.blocks[0]] }],
    }

    expect(checkSwapShape(wide, scope)[0].path).toBe('sections[0].blocks')
  })

  it('rejects a block whose structure or clock changed', () => {
    const workout = composed(['front-squat'])
    const section = workout.sections[0]
    const retimed = {
      ...workout,
      sections: [
        {
          ...section,
          blocks: [
            { ...section.blocks[0], structure_type: 'amrap' as const, timer_seconds: 600 },
          ],
        },
      ],
    }

    const paths = checkSwapShape(retimed, scope).map((violation) => violation.path)

    expect(paths).toContain('sections[0].blocks[0].structure_type')
    expect(paths).toContain('sections[0].blocks[0].timer_seconds')
  })

  it('rejects a replacement count that does not match the slots', () => {
    const violations = checkSwapShape(composed(['front-squat', 'deadlift']), scope)

    expect(violations.map((violation) => violation.path)).toContain(
      'sections[0].blocks[0].exercises',
    )
  })

  it('rejects a replacement that is already in the block', () => {
    const violations = checkSwapShape(composed(['deadlift']), scope)

    expect(violations[0].message).toContain('is staying in this block')
  })

  it('costs one corrected retry rather than a typed failure', () => {
    const validate = swapValidator(scope)
    const rejected = validate(composed(['front-squat', 'deadlift']), {
      ...swapPromptInput(scope, CANDIDATES, [], TODAY, REQUEST_ID),
    })

    expect(rejected.ok).toBe(false)
    // `claude.ts` retries exactly this code once, with the detail as the
    // correction — the swap does not count its own attempts.
    if (!rejected.ok) expect(rejected.error.code).toBe('generation.malformed_prescription')
  })

  it('still applies GEN-02c’s check 1 — the candidate set is the section’s', () => {
    const validate = swapValidator(scope)
    const input = swapPromptInput(
      scope,
      sectionFixture('primary_lift', ['deadlift']),
      [],
      TODAY,
      REQUEST_ID,
    )
    const rejected = validate(composed(['front-squat']), input)

    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected.error.code).toBe('generation.invalid_reference')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The pipeline
// ─────────────────────────────────────────────────────────────────────────────

/** The catalog, as §8 reads it — the captured library, by id. */
const catalog: CatalogReader = async (ids) => {
  const rows = catalogRowFixtures([...ids])
  return ok(factsFromRows(rows, new Map(rows.map((row) => [row.id, row.name]))))
}

/** The revision the database answers with: a new row, and the one it superseded. */
const swappedRow = (outgoingId: string, exerciseId: string): SessionTransition =>
  sessionTransitionSchema.parse({
    outcome: 'swapped',
    state: 'prescribed',
    exercise: {
      ...prescriptionRow(SUBSTITUTE_ID, exerciseId, 0),
      slot_id: outgoingId,
      replaces_id: outgoingId,
      origin: 'revised',
    },
    superseded: {
      ...prescriptionRow(outgoingId, 'back-squat', 0),
      revision_status: 'superseded',
      superseded_at: NOW,
    },
  })

interface Recorder {
  readonly db: SwapDatabase
  readonly calls: {
    candidates: unknown[]
    exercise: { id: string; prescription: Prescription }[]
    block: { blockId: string; revisions: readonly BlockRevisionRequest[] }[]
  }
}

function recordingDatabase(
  overrides: Partial<SwapDatabase> = {},
  snapshot: SessionSnapshot | null = snapshotFixture(),
): Recorder {
  const calls: Recorder['calls'] = { candidates: [], exercise: [], block: [] }

  const db: SwapDatabase = {
    snapshot: async () => ok(snapshot),
    constraints: async () => ok([]),
    candidates: async (request) => {
      calls.candidates.push(request)
      return ok([CANDIDATES, sectionFixture('accessory', ['glute-bridge'])])
    },
    swapExercise: async (id, presc) => {
      calls.exercise.push({ id, prescription: presc })
      return ok(swappedRow(id, presc.exercise_id))
    },
    swapBlock: async (blockId, revisions) => {
      calls.block.push({ blockId, revisions })
      return ok(
        blockSwapResultSchema.parse({
          outcome: 'swapped',
          state: 'prescribed',
          block_id: blockId,
          revisions: revisions.map((revision) =>
            swappedRow(revision.workout_exercise_id, revision.prescription.exercise_id),
          ),
        }),
      )
    },
    ...overrides,
  }

  return { db, calls }
}

/**
 * A composer that answers with one prepared workout, having run the swap's own
 * validator over it — so the pipeline is exercised through the same gate the
 * real one is, without a model call.
 */
function composerReturning(workout: GenerationOutput): {
  readonly composer: SwapComposerFactory
  readonly prompts: string[]
} {
  const prompts: string[] = []

  return {
    prompts,
    composer: (options) => ({
      async compose(input) {
        const prompt = options.assemble(input)
        prompts.push(prompt.user)

        const validated = options.validate(workout, input)
        if (!validated.ok) return err({ code: ErrorCode.GENERATION_FAILED, message: 'rejected' })

        return ok({
          workout,
          measurement: prompt.measurement,
          usage: { inputTokens: 100, outputTokens: 50 },
          attempts: 1,
          retriedAfter: null,
          validation: validated.value,
        })
      },
    }),
  }
}

const run = async (
  request: SwapRequest,
  recorder: Recorder,
  workout: GenerationOutput,
): Promise<Result<Record<string, unknown>, { code: ErrorCode }>> => {
  const { composer } = composerReturning(workout)

  return (await performSwap(
    request,
    { userId: USER_ID, requestId: REQUEST_ID },
    { db: recorder.db, catalog, composer, today: () => TODAY },
  )) as Result<Record<string, unknown>, { code: ErrorCode }>
}

describe('a swap draws from the same candidate query as generation', () => {
  it('retrieves with this session’s focus, location and constraints', async () => {
    const recorder = recordingDatabase()
    await run(singleRequest, recorder, composed(['front-squat']))

    expect(recorder.calls.candidates).toEqual([
      {
        userId: USER_ID,
        focus: 'lower_body',
        locationId: LOCATION_ID,
        // The session id is what makes a session-scoped exclusion apply to this
        // swap — the same argument generation passes (DATA-05).
        sessionId: SESSION_ID,
      },
    ])
  })

  it('offers only the slot’s section, from the set the query returned', async () => {
    const recorder = recordingDatabase()
    const { composer, prompts } = composerReturning(composed(['front-squat']))

    const result = await performSwap(
      singleRequest,
      { userId: USER_ID, requestId: REQUEST_ID },
      { db: recorder.db, catalog, composer, today: () => TODAY },
    )

    expect(result.ok).toBe(true)
    // `candidates` answered with two sections; the slot lives in one of them,
    // and the other is not something this call may compose from.
    expect(prompts[0]).toContain('CANDIDATES — primary_lift')
    expect(prompts[0]).not.toContain('CANDIDATES — accessory')
    expect(prompts[0]).toContain('front-squat')
  })

  it('carries the session’s soft constraints, and not the hard ones', async () => {
    const recorder = recordingDatabase({
      // What `constraints_in_force` returns: both halves, because the function
      // that filtered the candidates and the prompt that reads them are
      // different consumers of one answer (DATA-05).
      constraints: async () => ok([SOFT_CONSTRAINT, HARD_CONSTRAINT]),
    })
    const { composer, prompts } = composerReturning(composed(['front-squat']))

    const result = await performSwap(
      singleRequest,
      { userId: USER_ID, requestId: REQUEST_ID },
      { db: recorder.db, catalog, composer, today: () => TODAY },
    )

    expect(result.ok).toBe(true)
    expect(prompts[0]).toContain('avoid: movement_pattern:hinge')
    // A hard exclusion is the candidate query's job and was applied there. Asking
    // the model to also honor it would make the query's answer a suggestion.
    expect(prompts[0]).not.toContain('exclude:')
  })

  it('refuses when the slot’s section has nothing eligible left', async () => {
    const recorder = recordingDatabase({
      candidates: async () => ok([sectionFixture('accessory', ['glute-bridge'])]),
    })

    const result = await run(singleRequest, recorder, composed(['front-squat']))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
  })
})

describe('the result is persisted as a revision, never a mutation in place', () => {
  it('appends one revision for a single swap and answers with the lineage', async () => {
    const recorder = recordingDatabase()
    const result = await run(singleRequest, recorder, composed(['front-squat']))

    expect(recorder.calls.exercise).toEqual([
      { id: FIRST_ID, prescription: prescription('front-squat') },
    ])
    expect(recorder.calls.block).toEqual([])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const payload = swapSuccessSchema.parse({ ...result.value, requestId: REQUEST_ID })
    expect(payload.mode).toBe('single')
    expect(payload.section_type).toBe('primary_lift')
    expect(payload.block_id).toBe(BLOCK_ID)
    expect(payload.revisions).toHaveLength(1)

    const [revision] = payload.revisions
    // The lineage, both ways §7 expresses it, as the database returned it.
    expect(revision.exercise.origin).toBe('revised')
    expect(revision.exercise.replaces_id).toBe(FIRST_ID)
    expect(revision.exercise.slot_id).toBe(revision.superseded.slot_id)
    expect(revision.superseded.revision_status).toBe('superseded')
    // §8's hydration, so the card can render the substitute without a refetch.
    expect(revision.name).toBe('Front Squat')
    expect(revision.display_name).toBeTruthy()
  })

  it('revises every member of a block together, in order, in one call', async () => {
    const recorder = recordingDatabase()
    const result = await run(unitRequest, recorder, composed(['front-squat', 'back-squat']))

    expect(recorder.calls.exercise).toEqual([])
    expect(recorder.calls.block).toEqual([
      {
        blockId: BLOCK_ID,
        revisions: [
          { workout_exercise_id: FIRST_ID, prescription: prescription('front-squat') },
          { workout_exercise_id: SECOND_ID, prescription: prescription('back-squat') },
        ],
      },
    ])

    expect(result.ok).toBe(true)
    if (result.ok) expect((result.value.revisions as unknown[]).length).toBe(2)
  })

  it('reports the database’s refusal as the code it means', async () => {
    const recorder = recordingDatabase({
      swapExercise: async () =>
        ok(sessionTransitionSchema.parse({ outcome: 'invalid_transition', state: 'completed' })),
    })

    const result = await run(singleRequest, recorder, composed(['front-squat']))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.SESSION_INVALID_TRANSITION)
  })

  it('answers not-found for a session that is not there, or not yours', async () => {
    const recorder = recordingDatabase({}, null)

    const result = await run(singleRequest, recorder, composed(['front-squat']))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.PERSISTENCE_NOT_FOUND)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The SQL, and the envelope
// ─────────────────────────────────────────────────────────────────────────────

describe('swap_session_block is append-and-supersede, or none of it', () => {
  const migration = read('supabase/migrations/20260921000012_swap_session_block.sql')
  const body = migration.slice(
    migration.indexOf('create or replace function public.swap_session_block('),
    migration.indexOf('comment on function public.swap_session_block'),
  )

  it('delegates every slot to the function that carries the lineage', () => {
    expect(body).toContain('public.swap_session_exercise(')
    // The defect, spelled the way it would have to be spelled to come back.
    expect(body).not.toMatch(/update\s+public\.workout_exercises/i)
  })

  it('never writes the block, because the structure and the timer are what stays', () => {
    expect(body).not.toMatch(/update\s+public\.workout_blocks/i)
  })

  it('checks the payload names exactly the block’s active members, before writing', () => {
    // Everything above the loop: the refusals happen before the first write.
    const checks = body.slice(0, body.indexOf('for v_entry in'))

    expect(checks).toContain("revision_status = 'active'")
    expect(checks).toContain('slot_mismatch')
    expect(checks).toContain('cardinality(v_active) = cardinality(v_targets)')
    // The terminal-session gate, asked once for the block rather than per slot.
    expect(checks).toContain("v_state not in ('prescribed', 'active')")
  })

  it('is callable by the user whose session it is, and by nobody else', () => {
    expect(migration).toContain(
      'revoke all on function public.swap_session_block(uuid, jsonb) from public, anon;',
    )
    expect(migration).toContain(
      'grant execute on function public.swap_session_block(uuid, jsonb)\n  to authenticated, service_role;',
    )
  })
})

describe('generate-section mounts the shared envelope', () => {
  const entry = read('supabase/functions/generate-section/index.ts')
  const config = read('supabase/config.toml')

  it('is the envelope plus a handler, and declares no contract of its own', () => {
    expect(entry).toContain("from '../_shared/envelope.ts'")
    expect(entry).toContain("from '../../../src/state/schemas.ts'")
    expect(entry).toContain('Deno.serve')
    expect(entry).not.toContain("from 'zod'")
    expect(entry).not.toContain('z.object(')
  })

  it('verifies the token itself, so the 401 is typed and carries the id', () => {
    expect(config).toContain('[functions.generate-section]')
    const section = config.slice(config.indexOf('[functions.generate-section]'))
    expect(section).toContain('verify_jwt = false')
    expect(section).toContain('import_map = "./functions/deno.json"')
  })

  it('takes the request the boundary schema describes, and no other', () => {
    expect(swapRequestSchema.safeParse(singleRequest).success).toBe(true)
    expect(swapRequestSchema.safeParse(unitRequest).success).toBe(true)
    // A body that has not decided which swap it wants.
    expect(
      swapRequestSchema.safeParse({ ...singleRequest, block_id: BLOCK_ID }).success,
    ).toBe(false)
    expect(swapRequestSchema.safeParse({ ...singleRequest, mode: 'section' }).success).toBe(false)
  })
})
