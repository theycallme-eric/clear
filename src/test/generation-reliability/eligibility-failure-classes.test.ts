import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { GenerationFailure, parseCompletion } from '../../../supabase/functions/_shared/claude.ts'
import { createEdgeFunction } from '../../../supabase/functions/_shared/envelope.ts'
import {
  createGenerationComposer,
  createGenerationDatabase,
  performGeneration,
  type GenerationComposerFactory,
} from '../../../supabase/functions/_shared/generate.ts'
import type { CatalogReader } from '../../../supabase/functions/_shared/hydrate.ts'
import { validateComposition } from '../../../supabase/functions/_shared/validate.ts'
import {
  FAILURE_CLASSES,
  classifySection,
  createCandidatesClient,
  failuresOf,
  type Candidate,
  type FailureClass,
} from '../../data/candidates'
import type { UserConstraintRow } from '../../data/constraints'
import { ErrorCode, createError, err, ok } from '../../state/errors'
import type { LogSink } from '../../state/logger'
import { GENERATION_ERROR_ACCEPT, generationRequestSchema, type GenerationOutput } from '../../state/schemas'
import { createCandidatesDouble } from '../candidates-double'
import { CANDIDATE_LIBRARY, promptInput } from '../generation-prompt-fixtures'
import { VALID_RESPONSE } from '../generation-response-fixtures'
import { seededCatalog } from '../seed-catalog'

// GR-04 — REQ-008, REQ-009, REQ-032.
//
// Three claims, each tested where it is made:
//
//   1. A refusal says whose it is to fix. The four classes are produced from
//      four different inputs against the committed seed, through the reader and
//      the transcribed retrieval (src/test/candidates-double) — not by handing
//      the classifier the answer.
//   2. The model is strictly downstream of eligibility. A refused request goes
//      through the mounted envelope and the real PostgREST reader, and the
//      composer and the provider are counted: zero, both.
//   3. A diagnostic is section names and class names. The same runs put a
//      bearer token, two keys, an email, the athlete's notes and a provider's
//      response body within reach, and none of them is in a log line.

const PROJECT_URL = 'https://project.supabase.co'
const ANON_KEY = 'anon-key-marker-7f3a'
const TOKEN = 'user-token-marker-91c2'
const API_KEY = 'provider-key-marker-55d0'
const EMAIL = 'athlete@example.com'
const NOTES = 'NOTES-MARKER keep the left shoulder out of it'
const PROVIDER_BODY = 'PROVIDER-BODY-MARKER'
const USER = '00000000-0000-4000-8000-0000000000ff'
const OTHER_USER = '00000000-0000-4000-8000-0000000000ee'
const LOCATION_ID = '00000000-0000-4000-8000-00000000000a'
const REQUEST_ID = 'req_task007_refusal'

const DEFAULT_SECTIONS = ['warmup', 'primary_lift', 'accessory', 'core', 'conditioning', 'cooldown']
const HOME_GYM = ['bodyweight', 'barbell', 'dumbbells', 'kettlebells', 'pullup_bar', 'box']

// ─────────────────────────────────────────────────────────────────────────────
// 1. The classes, through the reader
// ─────────────────────────────────────────────────────────────────────────────

interface Setup {
  equipment?: readonly string[]
  constraints?: readonly UserConstraintRow[]
  catalogFilter?: (exercise: ReturnType<typeof seededCatalog>[number]) => boolean
  goalPreset?: string
}

function reader(options: Setup = {}) {
  const double = createCandidatesDouble({
    url: PROJECT_URL,
    anonKey: ANON_KEY,
    users: { [TOKEN]: USER },
    profiles: {
      [USER]: {
        goalPreset: options.goalPreset ?? 'strength',
        enabledSections: DEFAULT_SECTIONS,
        locations: [
          { id: 'location-home', isDefault: true, equipment: options.equipment ?? HOME_GYM },
        ],
      },
    },
    constraints: options.constraints,
    catalog:
      options.catalogFilter === undefined
        ? undefined
        : seededCatalog().filter(options.catalogFilter),
  })
  const client = createCandidatesClient({
    url: PROJECT_URL,
    anonKey: ANON_KEY,
    accessToken: TOKEN,
    fetch: double.fetch,
  })

  return { client, double }
}

const excludeEquipment = (equipment: string): UserConstraintRow => ({
  id: `constraint-equipment-${equipment}`,
  user_id: USER,
  action: 'exclude',
  scope: 'equipment',
  persistence: 'persistent',
  applies_to_session_id: null,
  target_exercise_id: null,
  target_pattern: null,
  target_equipment: equipment,
  note: null,
  created_at: '2026-10-01T00:00:00.000Z',
})

async function refusal(client: ReturnType<typeof reader>['client'], userId = USER) {
  const result = await client.retrieve({ userId, focus: 'full_body' })
  if (result.ok) throw new Error('the request resolved; this test needs a refusal')

  return result.error
}

describe('each failure class, from its own input (REQ-009)', () => {
  it('is a closed set holding the four the requirement names', () => {
    expect(FAILURE_CLASSES).toEqual(
      expect.arrayContaining([
        'catalog_defect',
        'athlete_constraint',
        'missing_equipment',
        'empty_profile',
      ]),
    )
  })

  it('catalog_defect: the catalog carries the section for no equipment at all', async () => {
    // A well-equipped location and no exclusions. The only thing wrong is the
    // catalog: nothing in it is tagged conditioning.
    const { client } = reader({
      catalogFilter: (exercise) => !exercise.sections.includes('conditioning'),
    })

    const error = await refusal(client)

    expect(error.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
    expect(error.details?.sections).toEqual(['conditioning'])
    expect(failuresOf(error)).toEqual([
      { section: 'conditioning', failureClass: 'catalog_defect' },
    ])
  })

  it('athlete_constraint: the location could perform it, and exclusions removed it', async () => {
    // A bodyweight-only location resolves every section on the seed. Excluding
    // bodyweight is the athlete's own instruction, and it empties all six.
    const { client } = reader({
      equipment: ['bodyweight'],
      constraints: [excludeEquipment('bodyweight')],
    })

    const error = await refusal(client)

    expect(failuresOf(error)).toEqual(
      DEFAULT_SECTIONS.map((section) => ({ section, failureClass: 'athlete_constraint' })),
    )
  })

  it('missing_equipment: the catalog has it, and nothing here can be performed', async () => {
    // The same sections, no exclusions, and a location holding one item no
    // exercise names.
    const { client } = reader({ equipment: ['skipping_rope'] })

    const error = await refusal(client)

    expect(failuresOf(error)).toEqual(
      DEFAULT_SECTIONS.map((section) => ({ section, failureClass: 'missing_equipment' })),
    )
  })

  it('empty_profile: no profile resolves, so no section does', async () => {
    const { client, double } = reader()

    // Owner-only RLS: another user's id reads as no profile at all.
    const error = await refusal(client, OTHER_USER)

    expect(error.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
    expect(error.details?.sections).toBe('none resolved')
    expect(failuresOf(error)).toEqual([{ section: null, failureClass: 'empty_profile' }])
    // Nothing to classify per section, so nothing more is asked.
    expect(double.requests()).toHaveLength(1)
  })

  it('gives each failed section its own class in one refusal', async () => {
    const { client } = reader({
      equipment: ['skipping_rope'],
      catalogFilter: (exercise) => !exercise.sections.includes('conditioning'),
    })

    const classes = Object.fromEntries(
      failuresOf(await refusal(client)).map((failure) => [failure.section, failure.failureClass]),
    )

    expect(classes).toEqual({
      warmup: 'missing_equipment',
      primary_lift: 'missing_equipment',
      accessory: 'missing_equipment',
      core: 'missing_equipment',
      conditioning: 'catalog_defect',
      cooldown: 'missing_equipment',
    })
  })

  it('a catalog defect outranks an exclusion that is also in force', () => {
    // No catalog rows is nobody's exclusion to lift.
    expect(
      classifySection({ section: 'carries', catalogExercises: 0, equippedExercises: 0 }),
    ).toBe<FailureClass>('catalog_defect')
  })

  it('keeps the refusal typed when the class cannot be read', async () => {
    const { double } = reader({ equipment: ['skipping_rope'] })
    const client = createCandidatesClient({
      url: PROJECT_URL,
      anonKey: ANON_KEY,
      accessToken: TOKEN,
      fetch: (input, init) =>
        String(input).endsWith('/rpc/generation_refusal_diagnostics')
          ? Promise.resolve(new Response('{}', { status: 404 }))
          : double.fetch(input, init),
    })

    const error = await refusal(client)

    expect(error.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
    expect(error.details?.sections).toEqual(DEFAULT_SECTIONS)
    expect(new Set(failuresOf(error).map((failure) => failure.failureClass))).toEqual(
      new Set(['undetermined']),
    )
  })

  it('still resolves active recovery to warmup, mobility and cooldown only', async () => {
    const { client, double } = reader({ goalPreset: 'active_recovery' })

    const result = await client.retrieve({ userId: USER, focus: 'full_body' })

    expect(result.ok && result.value.map((section) => section.section)).toEqual([
      'warmup',
      'mobility',
      'cooldown',
    ])
    // A request that resolves never asks for diagnostics.
    expect(double.requests()).toEqual([
      { method: 'POST', path: '/rpc/generation_candidate_sets' },
    ])
  })
})

describe('the diagnostic query (REQ-009)', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../supabase/migrations/20261001000020_generation_refusal_diagnostics.sql',
    ),
    'utf-8',
  )
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  it('counts the catalog, then the resolved location, and reads no exclusion', () => {
    expect(sql).toContain('create or replace function public.generation_refusal_diagnostics(')
    expect(sql).toMatch(/public\.generation_equipment\(p_user_id, p_location_id\)/)
    expect(sql).toMatch(/ec\.sections @> array\[s\.section\]/)
    expect(sql).toMatch(/filter \(where ec\.equipment_options && r\.equipment\)/)
    expect(sql).not.toMatch(/constraints_in_force|user_constraints/)
  })

  it('is additive, invoker-security, and not callable anonymously', () => {
    expect(sql).not.toMatch(/create table|alter table|drop |create policy/i)
    expect(sql).toMatch(/security invoker/)
    expect(sql).toMatch(/revoke all on function public\.generation_refusal_diagnostics/)
    expect(sql).toMatch(/to authenticated, service_role/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2 & 3. The mounted function: no composition, and a safe log line
// ─────────────────────────────────────────────────────────────────────────────

const candidateJson = (candidate: Candidate) => ({
  exercise_id: candidate.exerciseId,
  name: candidate.name,
  exercise_role: candidate.role,
  can_be_primary: candidate.canBePrimary,
  movement_patterns: candidate.patterns,
  primary_patterns: candidate.primaryPatterns,
  component_movements: candidate.components,
  usable_equipment: candidate.usableEquipment,
  muscles: candidate.muscles,
})

const row = (section: string, exerciseIds: readonly string[]) => ({
  section,
  relaxed: exerciseIds.length === 0,
  candidates: exerciseIds.map((id) => candidateJson(CANDIDATE_LIBRARY[id])),
})

interface Mounted {
  /** What `generation_candidate_sets_for_goal` answers. */
  readonly candidateRows: readonly ReturnType<typeof row>[]
  /** What `generation_refusal_diagnostics` answers. */
  readonly diagnostics?: readonly Record<string, unknown>[]
}

async function mounted(options: Mounted) {
  const lines: string[] = []
  const sink: LogSink = { write: (_level, line) => void lines.push(line) }
  const calls = { composerFactory: 0, compose: 0, provider: 0, postgrest: [] as string[] }

  const postgrest = (async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname.replace('/rest/v1', '')
    calls.postgrest.push(path)
    if (path === '/rpc/generation_candidate_sets_for_goal') {
      return Response.json(options.candidateRows)
    }
    if (path === '/rpc/generation_refusal_diagnostics') {
      return Response.json(options.diagnostics ?? [])
    }
    // Constraints, recent history, anchors and conditioning: none on record.
    return Response.json([])
  }) as typeof globalThis.fetch

  const provider = (async () => {
    calls.provider += 1
    return new Response(
      JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: PROVIDER_BODY } }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof globalThis.fetch

  const catalog: CatalogReader = async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED))

  const handle = createEdgeFunction({
    route: 'generate-workout',
    schema: generationRequestSchema,
    sink,
    verifyToken: async (token) =>
      token === TOKEN ? ok({ id: USER }) : err(createError(ErrorCode.AUTH_UNAUTHENTICATED)),
    handle: ({ requestId, user, body, accessToken, logger }) => {
      const real = createGenerationComposer({ apiKey: API_KEY, fetch: provider, logger })
      const composer: GenerationComposerFactory = (composerOptions) => {
        calls.composerFactory += 1
        const built = real(composerOptions)

        return {
          compose: (input, id) => {
            calls.compose += 1
            return built.compose(input, id)
          },
        }
      }

      return performGeneration(
        body,
        { userId: user.id, requestId, logger },
        {
          db: createGenerationDatabase({
            url: PROJECT_URL,
            anonKey: ANON_KEY,
            accessToken,
            fetch: postgrest,
          }),
          catalog,
          composer,
        },
      )
    },
  })

  const response = await handle(
    new Request('https://project.supabase.co/functions/v1/generate-workout', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        apikey: ANON_KEY,
        'content-type': 'application/json',
        accept: GENERATION_ERROR_ACCEPT,
        'x-request-id': REQUEST_ID,
        'x-client-info': EMAIL,
      },
      body: JSON.stringify({
        request_id: REQUEST_ID,
        goal: 'strength',
        date: '2026-10-01',
        focus: 'lower_body',
        requested_intensity: 7,
        requested_duration_mins: 45,
        location_id: LOCATION_ID,
        notes: `${NOTES} ${EMAIL}`,
        deload: false,
      }),
    }),
  )

  return {
    response,
    body: (await response.json()) as Record<string, unknown>,
    calls,
    lines,
    entries: lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    log: lines.join('\n'),
  }
}

/** Everything a log line must never hold, as the runs above put it in reach. */
const SENSITIVE = [
  TOKEN,
  'Bearer',
  ANON_KEY,
  API_KEY,
  EMAIL,
  'NOTES-MARKER',
  PROVIDER_BODY,
  // The prompt: its system text opens with the role, its user message with the
  // request block, and a candidate name appears only inside it.
  'goal: strength',
  CANDIDATE_LIBRARY['air-squat'].name,
]

const refusedRows = [
  row('warmup', ['air-squat']),
  row('primary_lift', []),
  row('accessory', []),
  row('cooldown', ['air-squat']),
]

const refusedDiagnostics = [
  { section: 'primary_lift', catalog_exercises: 21, equipped_exercises: 0 },
  { section: 'accessory', catalog_exercises: 40, equipped_exercises: 6 },
]

describe('an eligibility refusal at the mounted function (REQ-008, REQ-009)', () => {
  it('makes zero composer invocations and zero provider calls', async () => {
    const run = await mounted({ candidateRows: refusedRows, diagnostics: refusedDiagnostics })

    expect(run.response.status).toBe(422)
    expect(run.calls.composerFactory).toBe(0)
    expect(run.calls.compose).toBe(0)
    expect(run.calls.provider).toBe(0)
  })

  it('answers with the existing envelope and the existing code, and no workout', async () => {
    const run = await mounted({ candidateRows: refusedRows, diagnostics: refusedDiagnostics })

    expect(run.body).toEqual({
      code: ErrorCode.GENERATION_NO_CANDIDATES,
      // REQ-014: the same three keys; the sentence is now the classes' own.
      message:
        'Accessory: your exclusions remove every exercise. Remove one under Work around in Settings. ' +
        'Primary lift: nothing can be done with the equipment at this place. Add equipment in Places and equipment, or choose another place.',
      requestId: REQUEST_ID,
    })
    expect(run.response.headers.get('x-request-id')).toBe(REQUEST_ID)
  })

  it('asks for diagnostics only about the sections that came back empty', async () => {
    const run = await mounted({ candidateRows: refusedRows, diagnostics: refusedDiagnostics })

    expect(
      run.calls.postgrest.filter((path) => path === '/rpc/generation_refusal_diagnostics'),
    ).toHaveLength(1)
  })

  it('logs the request id, every failed section, and the class of each', async () => {
    const run = await mounted({ candidateRows: refusedRows, diagnostics: refusedDiagnostics })

    const line = run.entries.find((entry) => entry.msg === 'generation refused: eligibility')
    expect(line).toBeDefined()
    expect(line).toMatchObject({
      requestId: REQUEST_ID,
      code: ErrorCode.GENERATION_NO_CANDIDATES,
      failures: [
        { section: 'primary_lift', failureClass: 'missing_equipment' },
        { section: 'accessory', failureClass: 'athlete_constraint' },
      ],
    })
  })

  it('carries the same sections and classes, with the request id, on the typed error', async () => {
    const db = createGenerationDatabase({
      url: PROJECT_URL,
      anonKey: ANON_KEY,
      accessToken: TOKEN,
      fetch: (async (url: string | URL | Request) =>
        Response.json(
          String(url).endsWith('/rpc/generation_candidate_sets_for_goal')
            ? refusedRows
            : String(url).endsWith('/rpc/generation_refusal_diagnostics')
              ? refusedDiagnostics
              : [],
        )) as typeof globalThis.fetch,
    })
    let composed = 0

    const result = await performGeneration(
      generationRequestSchema.parse({
        request_id: REQUEST_ID,
        goal: 'strength',
        date: '2026-10-01',
        focus: 'lower_body',
        requested_intensity: 7,
        requested_duration_mins: 45,
        location_id: LOCATION_ID,
        notes: NOTES,
        deload: false,
      }),
      { userId: USER, requestId: REQUEST_ID },
      {
        db,
        catalog: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
        composer: () => {
          composed += 1
          throw new Error('the composer was built for a refused request')
        },
      },
    )

    expect(composed).toBe(0)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
    expect(result.error.requestId).toBe(REQUEST_ID)
    expect(result.error.details?.sections).toEqual(['primary_lift', 'accessory'])
    expect(failuresOf(result.error)).toEqual([
      { section: 'primary_lift', failureClass: 'missing_equipment' },
      { section: 'accessory', failureClass: 'athlete_constraint' },
    ])
  })

  it('classifies a profile that resolves no sections as empty_profile', async () => {
    const run = await mounted({ candidateRows: [] })

    expect(run.response.status).toBe(422)
    expect(run.calls.compose).toBe(0)
    const line = run.entries.find((entry) => entry.msg === 'generation refused: eligibility')
    expect(line).toMatchObject({
      requestId: REQUEST_ID,
      failures: [{ section: null, failureClass: 'empty_profile' }],
    })
  })
})

describe('diagnostics leak nothing (REQ-032)', () => {
  it('a refused generation logs no header, key, email, note or prompt', async () => {
    const run = await mounted({ candidateRows: refusedRows, diagnostics: refusedDiagnostics })

    expect(run.lines.length).toBeGreaterThan(0)
    for (const secret of SENSITIVE) expect(run.log).not.toContain(secret)
  })

  it('a refusal log line holds only the id, the code, sections and classes', async () => {
    const run = await mounted({ candidateRows: refusedRows, diagnostics: refusedDiagnostics })

    const line = run.entries.find((entry) => entry.msg === 'generation refused: eligibility')
    // The three it was given, and the four the logger stamps on every line.
    expect(Object.keys(line ?? {}).sort()).toEqual([
      'code',
      'failures',
      'level',
      'msg',
      'requestId',
      'scope',
      'time',
    ])
    for (const failure of (line as { failures: object[] }).failures) {
      expect(Object.keys(failure).sort()).toEqual(['failureClass', 'section'])
    }
  })

  it('a failed generation logs no provider response body, key, email, note or prompt', async () => {
    // Every section resolves, so the composer runs — and the provider refuses
    // with a body that must stay out of the log.
    const run = await mounted({
      candidateRows: [row('warmup', ['air-squat']), row('primary_lift', ['back-squat'])],
    })

    expect(run.calls.provider).toBeGreaterThan(0)
    expect(run.response.status).toBeGreaterThanOrEqual(500)
    expect(Object.keys(run.body).sort()).toEqual(['code', 'failure', 'message', 'requestId', 'retryable'])
    expect(run.body.failure).toBe('generation.upstream')
    expect(run.body.retryable).toBe(false)
    expect(run.calls.provider).toBe(1)
    expect(run.lines.length).toBeGreaterThan(0)
    for (const secret of SENSITIVE) expect(run.log).not.toContain(secret)
    expect(JSON.stringify(run.body)).not.toContain(PROVIDER_BODY)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. The composed workout uses only available sections, not necessarily all
// ─────────────────────────────────────────────────────────────────────────────

function composed(): GenerationOutput {
  const parsed = parseCompletion(VALID_RESPONSE)
  if (!parsed.ok) throw new Error('the valid fixture no longer parses')

  return structuredClone(parsed.value)
}

describe('a composed workout may select useful available sections without inventing one', () => {
  const input = promptInput()
  const resolved = input.sections.map((section) => section.section)

  it('accepts the workout that has every resolved section, in the resolved order', () => {
    const workout = composed()

    expect(workout.sections.map((section) => section.section_type)).toEqual(resolved)
    expect(validateComposition(workout, input).ok).toBe(true)
  })

  it.each(resolved)('permits omitting the available %s section', (omitted) => {
    const workout = composed()
    workout.sections = workout.sections.filter((section) => section.section_type !== omitted)

    const result = validateComposition(workout, input)

    expect(result.ok).toBe(true)
  })

  it('rejects a workout that adds a section nothing resolved', () => {
    const workout = composed()
    workout.sections.push({ ...workout.sections[0], section_type: 'conditioning' })

    const result = validateComposition(workout, input)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(GenerationFailure.INVALID_REFERENCE)
    expect(result.error.detail).toContain("'conditioning' is not an enabled section")
  })
})
