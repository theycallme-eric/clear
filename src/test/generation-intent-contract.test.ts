import { describe, expect, it } from 'vitest'

import {
  createGenerationComposer,
  createGenerationDatabase,
  performGeneration,
  type GenerationComposerFactory,
  type GenerationDatabase,
} from '../../supabase/functions/_shared/generate.ts'
import { factsFromRows, type CatalogReader } from '../../supabase/functions/_shared/hydrate.ts'
import { assemblePrompt, type PromptInput } from '../../supabase/functions/_shared/prompt.ts'
import type { Candidate } from '../data/candidates'
import { ok } from '../state/errors'
import { createLogger, type LogSink } from '../state/logger'
import type { GenerationRequest, SessionAcceptance } from '../state/schemas'
import { CANDIDATE_LIBRARY, catalogRowFixture } from './generation-prompt-fixtures'
import { claudeResponse } from './generation-response-fixtures'

// REQ-011 and REQ-014. One request's goal and focus are read at four seams —
// the candidate RPC's arguments, the REQUEST block of the user message, the
// `PromptInput.request` the validator is handed, and the acceptance payload
// Review persists — and every one of them has to be the request's own value.
//
// The database and the composer are the real modules over a stubbed `fetch`,
// so what is observed is what actually crosses each boundary: the JSON body
// PostgREST would receive and the message the model would be sent. The
// divergence cases then substitute another focus at one seam at a time and
// assert that the same check which passes above names that seam — a contract
// test that could not fail would prove nothing.

const PROJECT_URL = 'https://project.supabase.co'
const ANON_KEY = 'anon-key-not-a-secret'
const ACCESS_TOKEN = 'caller-access-token'
const API_KEY = 'sk-ant-api03-ThisIsNotARealKeyItIsAFixture'
const NOTES_MARKER = 'SENSITIVE-NOTE-MARKER'
const USER_ID = '00000000-0000-4000-8000-0000000000ff'
const LOCATION_ID = '00000000-0000-4000-8000-00000000000a'
const CANDIDATE_FUNCTION = 'generation_candidate_sets_for_goal'

type Goal = GenerationRequest['goal']
type Focus = GenerationRequest['focus']

interface Intent {
  readonly goal: string | null
  readonly focus: string | null
}

const SEAMS = ['retrieval', 'prompt', 'validation', 'persistence'] as const
type Seam = (typeof SEAMS)[number]

// ─────────────────────────────────────────────────────────────────────────────
// The request, and what the stubbed services answer it with
// ─────────────────────────────────────────────────────────────────────────────

function requestFor(goal: Goal, focus: Focus): GenerationRequest {
  return {
    request_id: 'req_task004_intent',
    goal,
    date: '2026-09-30',
    focus,
    requested_intensity: 6,
    requested_duration_mins: 45,
    location_id: LOCATION_ID,
    notes: NOTES_MARKER,
    deload: false,
  }
}

/** The sections the goal-scoped RPC resolves for each goal under test. */
const GOAL_SECTIONS: Partial<Record<Goal, readonly string[]>> = {
  conditioning: ['warmup', 'conditioning', 'core', 'cooldown'],
  active_recovery: ['warmup', 'mobility', 'cooldown'],
}

const SECTION_CANDIDATES: Record<string, readonly string[]> = {
  warmup: ['cat-cow', 'worlds-greatest-stretch', '90-90-stretch'],
  mobility: ['90-90-stretch', 'worlds-greatest-stretch'],
  core: ['glute-bridge', 'cat-cow'],
  conditioning: ['walking-lunges', 'glute-bridge', 'bulgarian-split-squat'],
  cooldown: ['90-90-stretch', 'cat-cow'],
}

/** A candidate as the RPC's `candidates` jsonb column carries it. */
function candidateJson(candidate: Candidate) {
  return {
    exercise_id: candidate.exerciseId,
    name: candidate.name,
    exercise_role: candidate.role,
    can_be_primary: candidate.canBePrimary,
    movement_patterns: candidate.patterns,
    primary_patterns: candidate.primaryPatterns,
    component_movements: candidate.components,
    usable_equipment: candidate.usableEquipment,
    muscles: candidate.muscles,
  }
}

function candidateRows(goal: Goal) {
  return (GOAL_SECTIONS[goal] ?? []).map((section) => ({
    section,
    relaxed: false,
    candidates: SECTION_CANDIDATES[section].map((id) => candidateJson(CANDIDATE_LIBRARY[id])),
  }))
}

function prescription(exerciseId: string, overrides: Record<string, unknown> = {}) {
  const equipment = CANDIDATE_LIBRARY[exerciseId].usableEquipment[0]
  const loaded = equipment !== 'bodyweight'

  return {
    exercise_id: exerciseId,
    equipment,
    session_function: 'prep',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: 2,
    target_kind: 'fixed',
    target_value: 8,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: 60,
    tempo: null,
    load_type: loaded ? 'rir' : 'bodyweight',
    load_value: loaded ? 2 : null,
    is_interval_exercise: false,
    ...overrides,
  }
}

/** One synthesized section: a circuit for conditioning, a standard block otherwise. */
function section(sectionType: string) {
  const candidates = SECTION_CANDIDATES[sectionType]
  const circuit = sectionType === 'conditioning'

  return {
    section_type: sectionType,
    section_title: circuit ? 'Engine' : 'Work',
    section_notes: null,
    blocks: [
      {
        structure_type: circuit ? 'circuit' : 'standard',
        rounds: circuit ? 3 : null,
        timer_type: 'none',
        timer_seconds: null,
        round_rest_seconds: circuit ? 60 : null,
        rep_scheme: 'fixed',
        block_notes: null,
        exercises: circuit
          ? candidates.map((id) =>
              prescription(id, {
                session_function: 'conditioning',
                sets: null,
                rest_seconds: null,
                target_value: 10,
              }),
            )
          : candidates.slice(0, 2).map((id) => prescription(id)),
      },
    ],
  }
}

/** What the stubbed model answers: a contract-valid workout over the goal's arc. */
function responseFor(goal: Goal): string {
  return JSON.stringify({
    title: 'Composed Session',
    overview: null,
    sections: (GOAL_SECTIONS[goal] ?? []).map(section),
    estimated_duration_mins: 44,
  })
}

const catalog: CatalogReader = async (ids) => {
  const rows = ids.map(catalogRowFixture)
  return ok(factsFromRows(rows, new Map(rows.map((row) => [row.id, row.name]))))
}

// ─────────────────────────────────────────────────────────────────────────────
// One generation, observed at every seam
// ─────────────────────────────────────────────────────────────────────────────

type LogEntry = Record<string, unknown>

/** Substitutions a divergence case makes; an ordinary run makes none. */
interface Tamper {
  readonly db?: (db: GenerationDatabase) => GenerationDatabase
  readonly assemble?: (input: PromptInput) => PromptInput
  readonly validated?: (input: PromptInput) => PromptInput
  readonly acceptance?: (acceptance: SessionAcceptance) => SessionAcceptance
  /** Leave `performGeneration` on its own clock rather than the stepped one. */
  readonly realClock?: boolean
}

async function generate(request: GenerationRequest, tamper: Tamper = {}) {
  const rpcBodies: Record<string, unknown>[] = []
  const messages: string[] = []
  const validated: PromptInput[] = []
  const lines: string[] = []

  const sink: LogSink = { write: (_level, line) => void lines.push(line) }
  const logger = createLogger({ scope: 'generate-workout', sink })

  const postgrest = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith(`/rpc/${CANDIDATE_FUNCTION}`)) {
      rpcBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json(candidateRows(request.goal))
    }
    // Constraints, recent history, anchors and conditioning: none on record.
    return Response.json([])
  }) as typeof globalThis.fetch

  const anthropic = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] }
    messages.push(body.messages[0].content)
    return new Response(claudeResponse(responseFor(request.goal), { input: 4210, output: 980 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof globalThis.fetch

  const db = createGenerationDatabase({
    url: PROJECT_URL,
    anonKey: ANON_KEY,
    accessToken: ACCESS_TOKEN,
    fetch: postgrest,
  })

  const compose = createGenerationComposer({
    apiKey: API_KEY,
    fetch: anthropic,
    logger,
    assemble: (input) => assemblePrompt(tamper.assemble?.(input) ?? input),
  })
  const composer: GenerationComposerFactory = ({ validate }) =>
    compose({
      validate:
        validate &&
        ((workout, input) => {
          const seen = tamper.validated?.(input) ?? input
          validated.push(seen)
          return validate(workout, seen)
        }),
    })

  // A clock that advances 7ms per reading, so elapsed time is a known number.
  let clock = 1_000
  const result = await performGeneration(
    request,
    {
      userId: USER_ID,
      requestId: request.request_id,
      logger,
      ...(tamper.realClock ? {} : { now: () => (clock += 7) }),
    },
    { db: tamper.db?.(db) ?? db, catalog, composer },
  )

  const acceptance = result.ok
    ? (tamper.acceptance?.(result.value.acceptance) ?? result.value.acceptance)
    : null
  const message = messages[0] ?? ''
  const rpc = rpcBodies[0]
  const checked = validated[0]?.request

  const seams: Record<Seam, Intent> = {
    retrieval: { goal: text(rpc?.p_goal), focus: text(rpc?.p_focus) },
    prompt: {
      goal: message.match(/^goal: (.+)$/m)?.[1] ?? null,
      focus: message.match(/^focus: (.+)$/m)?.[1] ?? null,
    },
    validation: { goal: checked?.goal ?? null, focus: checked?.focus ?? null },
    persistence: {
      goal: acceptance?.goal_preset ?? null,
      focus: acceptance?.session_focus ?? null,
    },
  }

  return {
    result,
    acceptance,
    message,
    rpcBodies,
    seams,
    lines,
    entries: lines.map((line) => JSON.parse(line) as LogEntry),
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : null)

/** The seams whose goal or focus is not the request's own. Empty is the contract. */
function divergentSeams(request: GenerationRequest, seams: Record<Seam, Intent>): Seam[] {
  return SEAMS.filter(
    (seam) => seams[seam].goal !== request.goal || seams[seam].focus !== request.focus,
  )
}

/** The one assertion every case in this file stands on. */
function expectIntentContract(request: GenerationRequest, seams: Record<Seam, Intent>) {
  expect(divergentSeams(request, seams)).toEqual([])
}

const withFocus = (input: PromptInput, focus: Focus): PromptInput => ({
  ...input,
  request: { ...input.request, focus },
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. The contract
// ─────────────────────────────────────────────────────────────────────────────

describe('one request’s goal and focus reach every backend seam unchanged', () => {
  it('holds for a conditioning, lower_body request', async () => {
    const request = requestFor('conditioning', 'lower_body')
    const run = await generate(request)

    expect(run.result.ok).toBe(true)

    expect(run.rpcBodies).toHaveLength(1)
    expect(run.rpcBodies[0]).toMatchObject({
      p_user_id: USER_ID,
      p_goal: 'conditioning',
      p_focus: 'lower_body',
      p_location_id: LOCATION_ID,
    })

    expect(run.message).toContain('goal: conditioning')
    expect(run.message).toContain('focus: lower_body')

    expect(run.seams.validation).toEqual({ goal: 'conditioning', focus: 'lower_body' })

    expect(run.acceptance).toMatchObject({
      goal_preset: 'conditioning',
      session_focus: 'lower_body',
    })
    expect(run.acceptance?.workout.sections.map((entry) => entry.section_type)).toEqual([
      'warmup',
      'conditioning',
      'core',
      'cooldown',
    ])

    expectIntentContract(request, run.seams)
  })

  it('holds for an active_recovery, full_body request over warmup, mobility and cooldown', async () => {
    const request = requestFor('active_recovery', 'full_body')
    const run = await generate(request)

    expect(run.result.ok).toBe(true)

    expect(run.rpcBodies[0]).toMatchObject({ p_goal: 'active_recovery', p_focus: 'full_body' })
    expect(run.message).toContain('goal: active_recovery')
    expect(run.message).toContain('focus: full_body')
    expect(run.seams.validation).toEqual({ goal: 'active_recovery', focus: 'full_body' })
    expect(run.acceptance).toMatchObject({
      goal_preset: 'active_recovery',
      session_focus: 'full_body',
    })
    expect(run.acceptance?.workout.sections.map((entry) => entry.section_type)).toEqual([
      'warmup',
      'mobility',
      'cooldown',
    ])

    expectIntentContract(request, run.seams)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Divergence is detected
// ─────────────────────────────────────────────────────────────────────────────

describe('a seam that substitutes another focus fails the contract', () => {
  const request = requestFor('conditioning', 'lower_body')
  const OTHER: Focus = 'upper_body'

  const substitutions: readonly { seam: Seam; tamper: Tamper }[] = [
    {
      // Filtered as upper_body, prompted and persisted as lower_body.
      seam: 'retrieval',
      tamper: {
        db: (db) => ({
          ...db,
          candidates: (asked, userId) => db.candidates({ ...asked, focus: OTHER }, userId),
        }),
      },
    },
    {
      // Filtered as lower_body, prompted as upper_body.
      seam: 'prompt',
      tamper: { assemble: (input) => withFocus(input, OTHER) },
    },
    {
      seam: 'validation',
      tamper: { validated: (input) => withFocus(input, OTHER) },
    },
    {
      // Filtered and prompted as lower_body, stored as upper_body.
      seam: 'persistence',
      tamper: { acceptance: (acceptance) => ({ ...acceptance, session_focus: OTHER }) },
    },
  ]

  for (const { seam, tamper } of substitutions) {
    it(`names the ${seam} seam and no other`, async () => {
      const run = await generate(request, tamper)

      expect(run.result.ok).toBe(true)
      expect(run.seams[seam].focus).toBe(OTHER)
      expect(divergentSeams(request, run.seams)).toEqual([seam])
      // The assertion the ordinary cases pass is the one that fails here.
      expect(() => expectIntentContract(request, run.seams)).toThrow()
    })
  }

  it('detects a substituted goal as well as a substituted focus', async () => {
    const run = await generate(request, {
      acceptance: (acceptance) => ({ ...acceptance, goal_preset: 'strength' }),
    })

    expect(divergentSeams(request, run.seams)).toEqual(['persistence'])
    expect(() => expectIntentContract(request, run.seams)).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Logs name the intent, and nothing sensitive (REQ-014)
// ─────────────────────────────────────────────────────────────────────────────

describe('generation logs name the resolved intent without sensitive data', () => {
  const request = requestFor('conditioning', 'lower_body')
  const entry = (entries: readonly LogEntry[], msg: string) =>
    entries.find((candidate) => candidate.msg === msg)

  it('logs goal, focus and candidate count once the context is resolved', async () => {
    const { entries } = await generate(request)
    const resolved = entry(entries, 'generation context resolved')

    expect(resolved).toMatchObject({
      requestId: request.request_id,
      goal: 'conditioning',
      focus: 'lower_body',
      sections: 4,
      // Three warmup, three conditioning, two core and two cooldown candidates.
      candidates: 10,
    })
  })

  it('logs promptBytes, token usage and the attempt number from the composer', async () => {
    const { entries } = await generate(request)

    const composing = entry(entries, 'composing workout')
    expect(composing?.promptBytes).toEqual(expect.any(Number))
    expect(composing?.promptBytes).toBeGreaterThan(0)

    const composed = entry(entries, 'composed workout')
    expect(composed).toMatchObject({ attempt: 1 })
    expect(composed).toHaveProperty('inputTokens')
    expect(composed).toHaveProperty('outputTokens')

    // The logger masks any key containing `token`, so the composer's own two
    // fields are present and unreadable. The completion line carries the same
    // usage under keys the denylist leaves alone.
    expect(entry(entries, 'generation complete')).toMatchObject({
      usage: { input: 4210, output: 980 },
    })
  })

  it('logs elapsed milliseconds for the context reads and for the whole generation', async () => {
    const { entries } = await generate(request)

    // The injected clock advances 7ms per reading: one reading to start, one
    // when the context is resolved, one on completion.
    expect(entry(entries, 'generation context resolved')).toMatchObject({ elapsedMs: 7 })
    expect(entry(entries, 'generation complete')).toMatchObject({
      requestId: request.request_id,
      goal: 'conditioning',
      focus: 'lower_body',
      attempts: 1,
      elapsedMs: 14,
    })
    expect(entry(entries, 'generation complete')?.promptBytes).toBeGreaterThan(0)
  })

  it('measures real elapsed time when no clock is injected', async () => {
    const { entries } = await generate(request, { realClock: true })
    const complete = entry(entries, 'generation complete')

    expect(complete?.elapsedMs).toEqual(expect.any(Number))
    expect(complete?.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('never records the notes text or the API key', async () => {
    const run = await generate(request)

    // The request really did carry both: the notes reached the prompt and the
    // acceptance payload, which is what makes their absence from the log a
    // statement about the log rather than about the fixture.
    expect(run.result.ok).toBe(true)
    expect(run.message).toContain(NOTES_MARKER)
    expect(run.acceptance?.generation_notes).toBe(NOTES_MARKER)

    expect(run.lines.length).toBeGreaterThan(0)
    const logged = run.lines.join('\n')
    expect(logged).not.toContain(NOTES_MARKER)
    expect(logged).not.toContain(API_KEY)
    expect(logged).not.toContain('sk-ant')
    expect(logged).not.toContain(ACCESS_TOKEN)
  })
})
