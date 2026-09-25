import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseCompletion } from '../../supabase/functions/_shared/claude.ts'
import { factsFromRows, hydrateWorkout } from '../../supabase/functions/_shared/hydrate.ts'
import {
  PERSIST_FUNCTION,
  acceptanceFor,
  adjustmentReasonFor,
  composedWorkout,
  createSessionWriter,
  persist,
  type SessionFacts,
} from '../../supabase/functions/_shared/persist.ts'
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  resolveEffectiveRequest,
  type PromptInput,
} from '../../supabase/functions/_shared/prompt.ts'
import { validateComposition } from '../../supabase/functions/_shared/validate.ts'
import { ErrorCode } from '../state/errors'
import { createLogger, type LogSink } from '../state/logger'
import {
  CONTRACT_VERSION,
  sessionAcceptanceSchema,
  type GenerationOutput,
  type SessionSnapshot,
  type WorkoutSessionRow,
} from '../state/schemas'
import {
  CANDIDATE_LIBRARY,
  catalogRowFixtures,
  promptInput,
  sectionFixture,
} from './generation-prompt-fixtures'
import { VALID_RESPONSE } from './generation-response-fixtures'
import { createSessionDouble } from './session-double'

import type { Enums } from '../data/database.types'

// GEN-02c, the persistence half. Three questions, one per acceptance criterion:
//
//   1. Do the four levels commit together, or leave nothing? The transaction is
//      `persist_session`'s — SES-01a wrote it and
//      `session-lifecycle-migration.test.ts` asserts it clause by clause — so
//      what is asked here is what this module contributes to it: one request,
//      no second attempt, and a refusal that leaves the store exactly as it was.
//   2. Is every session stamped with both versions? Asserted against the row
//      the double stores, and asserted to come from the *workout* rather than
//      from `prompt.ts`'s constants, which is the difference that shows up when
//      a deployment moves between the model call and the write.
//   3. Does a run per goal preset persist a contract-valid workout honouring
//      section scaling? One pipeline run per goal — parse, validate, hydrate,
//      persist — with each goal's section arc read out of the system prompt's
//      own GOAL SHAPES block rather than restated here.
//
// What this file cannot prove is that Postgres agrees: the off-machine-backup
// gate in `docs/backend/live-inventory.md` forbids touching the reused project,
// so `session-double.ts` stands in, and it models atomicity the way a
// transaction gives it — every row is built before any row is stored.

const REPO_ROOT = resolve(import.meta.dirname, '../..')
const LIFECYCLE_MIGRATION = 'supabase/migrations/20260921000005_session_lifecycle.sql'
const read = (relativePath: string) => readFileSync(resolve(REPO_ROOT, relativePath), 'utf-8')

const PROJECT_URL = 'https://project.supabase.co'
const ANON_KEY = 'anon-key-not-a-secret'
const ACCESS_TOKEN = 'caller-access-token'
const USER_ID = '00000000-0000-4000-8000-0000000000ff'
const LOCATION_ID = '00000000-0000-4000-8000-00000000000a'

/** Today, and the four session facts only the caller can know. */
const FACTS: SessionFacts = {
  date: '2026-09-25',
  locationId: LOCATION_ID,
  // Null until GEN-06 computes it, which is what the column says too.
  computedDurationMins: null,
}

// ─────────────────────────────────────────────────────────────────────────────
// The pipeline, as the function will run it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Model text → a hydrated workout, through §6 and §8 in that order. Nothing is
 * constructed by hand: a `HydratedWorkout` built here would be a shape rather
 * than the thing the pipeline produces, and the versions it carries are the
 * ones persistence is required to stamp from.
 */
function hydratedFrom(
  responseText: string,
  input: PromptInput,
  versions?: { promptVersion: string; contractVersion: string },
) {
  const parsed = parseCompletion(responseText)
  if (!parsed.ok) throw new Error(`the fixture no longer parses: ${parsed.error.code}`)

  const verdict = validateComposition(parsed.value, input)
  if (!verdict.ok) throw new Error(`the fixture no longer validates: ${verdict.error.code}`)

  const ids = prescribedIds(parsed.value)
  const rows = catalogRowFixtures(ids)
  const referenced = rows.map((row) => row.regression).filter((id): id is string => id !== null)
  const names = new Map(
    catalogRowFixtures([...new Set([...ids, ...referenced])]).map((row) => [row.id, row.name]),
  )

  const hydrated = hydrateWorkout(verdict.value, factsFromRows(rows, names), { versions })
  if (!hydrated.ok) throw new Error(`hydration failed: ${hydrated.error.code}`)

  return hydrated.value
}

function prescribedIds(workout: GenerationOutput): string[] {
  return [
    ...new Set(
      workout.sections.flatMap((section) =>
        section.blocks.flatMap((block) => block.exercises.map((exercise) => exercise.exercise_id)),
      ),
    ),
  ]
}

/** The fixture request: a 45-minute strength session at 8, as GEN-02b measures. */
const INPUT = promptInput()

function double(options: Partial<Parameters<typeof createSessionDouble>[0]> = {}) {
  return createSessionDouble({
    url: PROJECT_URL,
    anonKey: ANON_KEY,
    users: { [ACCESS_TOKEN]: USER_ID },
    ...options,
  })
}

function writerFor(store: ReturnType<typeof createSessionDouble>) {
  return createSessionWriter({
    url: PROJECT_URL,
    anonKey: ANON_KEY,
    accessToken: ACCESS_TOKEN,
    fetch: store.fetch,
  })
}

/** The whole write path, from model text to what the database now holds. */
async function persisted(
  store: ReturnType<typeof createSessionDouble>,
  responseText = VALID_RESPONSE,
  input: PromptInput = INPUT,
  facts: SessionFacts = FACTS,
  versions?: { promptVersion: string; contractVersion: string },
) {
  return persist(
    hydratedFrom(responseText, input, versions),
    { userId: USER_ID, input, facts },
    writerFor(store),
  )
}

const countedExercises = (snapshot: SessionSnapshot) =>
  snapshot.sections.reduce(
    (total, section) =>
      total + section.blocks.reduce((blocks, block) => blocks + block.exercises.length, 0),
    0,
  )

// ─────────────────────────────────────────────────────────────────────────────
// 1. One transaction, or nothing
// ─────────────────────────────────────────────────────────────────────────────

describe('sessions, sections, blocks and exercises commit together', () => {
  it('writes all four levels through one call to one function', async () => {
    const store = double()
    const result = await persisted(store)

    expect(result.ok).toBe(true)
    // One request is the whole of this module's contribution to atomicity:
    // PostgREST runs one request in one transaction, and four inserts issued
    // from here could not be made atomic by any amount of care.
    expect(store.requests()).toEqual([
      { method: 'POST', path: `/rpc/${PERSIST_FUNCTION}`, query: '' },
    ])

    const stored = store.store()
    expect(stored.sessions).toHaveLength(1)
    expect(stored.sections).toHaveLength(3)
    expect(stored.blocks).toHaveLength(3)
    expect(stored.exercises).toHaveLength(5)
  })

  it('names the function the migration declares as the atomic one', () => {
    // The correspondence, as data rather than as trust: the one function this
    // module calls is the one SES-01a wrote to write four levels at once.
    const migration = read(LIFECYCLE_MIGRATION)
    expect(migration).toContain(`create or replace function public.${PERSIST_FUNCTION}(`)
    expect(migration).toMatch(
      /insert into public\.workout_sessions[\s\S]+insert into public\.workout_sections[\s\S]+insert into public\.workout_blocks[\s\S]+insert_prescription\(/,
    )
  })

  it('leaves no session, section, block or exercise behind when a row is refused', async () => {
    // The last prescription names an exercise the catalog does not hold, so the
    // foreign key refuses it after three sections, three blocks and four
    // exercises have been built. A partial workout would be four levels of
    // orphan; what the transaction gives instead is nothing.
    const store = double({
      exerciseIds: ['cat-cow', 'worlds-greatest-stretch', 'back-squat', 'bulgarian-split-squat'],
    })

    const result = await persisted(store)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    expect(result.error.details).toMatchObject({ fn: PERSIST_FUNCTION, status: 400 })

    const stored = store.store()
    expect(stored.sessions).toEqual([])
    expect(stored.sections).toEqual([])
    expect(stored.blocks).toEqual([])
    expect(stored.exercises).toEqual([])
  })

  it('does not retry a write, because a retried acceptance is a second workout', async () => {
    const store = double({ exerciseIds: ['cat-cow'] })

    const result = await persisted(store)

    expect(result.ok).toBe(false)
    // The session id is minted by the database, so a second attempt cannot
    // tell "not written" from "written and the answer was lost". One attempt is
    // the only answer that cannot double a user's workout.
    expect(store.calls()).toHaveLength(1)
  })

  it('answers the persisted structure rather than the payload it sent', async () => {
    const store = double()
    const result = await persisted(store)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // `session_snapshot`'s shape, parsed: the rows as the database now holds
    // them, with the ids it minted and the order it stored them in.
    expect(result.value.state).toBe('prescribed')
    expect(result.value.sections.map((section) => section.section.order_index)).toEqual([0, 1, 2])
    expect(result.value.sections[2].blocks[0].exercises.map((e) => e.exercise.order_index)).toEqual([
      0, 1,
    ])
    expect(countedExercises(result.value)).toBe(5)
    expect(result.value.sections[0].blocks[0].exercises[0].set_logs).toEqual([])
  })

  it('writes as the caller, so somebody else ownership fails the write', async () => {
    const store = double()
    const other = '00000000-0000-4000-8000-0000000000ee'

    const result = await persist(
      hydratedFrom(VALID_RESPONSE, INPUT),
      { userId: other, input: INPUT, facts: FACTS },
      writerFor(store),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    // `workout_sessions_insert_own` refused the row: `p_user_id` is a symmetry
    // with GEN-02a and never a way around RLS.
    expect(result.error.code).toBe(ErrorCode.AUTH_UNAUTHORIZED)
    expect(store.store().sessions).toEqual([])
  })

  it('refuses an unpersistable payload before it opens a transaction', async () => {
    const store = double()
    // A session with no focus of the day is a legitimate request to compose and
    // not one that can be stored: `workout_sessions.session_focus` is NOT NULL.
    const input = promptInput({
      request: resolveEffectiveRequest({
        requestId: 'req_abc123_def456',
        goal: 'strength',
        focus: null,
        requestedIntensity: 8,
        durationTargetMins: 45,
        enabledSections: ['warmup', 'primary_lift', 'accessory', 'core', 'cooldown'],
      }),
    })

    const result = await persisted(store, VALID_RESPONSE, input)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.VALIDATION_CONSTRAINT)
    expect(result.error.details?.issues).toMatchObject([{ path: 'session_focus' }])
    // Nothing was asked of the database at all.
    expect(store.requests()).toEqual([])
  })

  it('cannot be called with a workout nobody validated or hydrated', async () => {
    const parsed = parseCompletion(VALID_RESPONSE)
    if (!parsed.ok) throw new Error('the valid fixture no longer parses')

    // The ordering rule is the compiler's: only `hydrateWorkout` produces a
    // `HydratedWorkout` and only `validateComposition` produces what that
    // takes, so `npx tsc --noEmit` is what enforces the chain. At runtime the
    // same call has no `diagnostics` to read, which is the shape of the bug the
    // type error prevents.
    await expect(
      persist(
        // @ts-expect-error a GenerationOutput is not a HydratedWorkout
        parsed.value,
        { userId: USER_ID, input: INPUT, facts: FACTS },
        writerFor(double()),
      ),
    ).rejects.toThrow(/modelEstimateMins/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Provenance
// ─────────────────────────────────────────────────────────────────────────────

describe('every session records prompt_version and contract_version', () => {
  it('stamps both columns on the row it writes', async () => {
    const store = double()
    const result = await persisted(store)

    expect(result.ok).toBe(true)
    const [session] = store.store().sessions
    expect(session.prompt_version).toBe(PROMPT_VERSION)
    expect(session.contract_version).toBe(CONTRACT_VERSION)
  })

  it('reads them from the workout, not from this deployment constants', () => {
    // §10's two versions are independent and both are properties of the
    // composition. A deployment that bumped the prompt between the model call
    // and the write must not stamp the new number on the old workout.
    const composed = hydratedFrom(VALID_RESPONSE, INPUT, {
      promptVersion: '4.9.9',
      contractVersion: '4.0.0',
    })

    const payload = acceptanceFor(composed, INPUT, FACTS)
    expect(payload.ok).toBe(true)
    if (!payload.ok) return
    expect(payload.value.prompt_version).toBe('4.9.9')
    expect(payload.value.contract_version).toBe('4.0.0')
    expect(payload.value.prompt_version).not.toBe(PROMPT_VERSION)
  })

  it('cannot build a payload with a blank version', () => {
    const composed = hydratedFrom(VALID_RESPONSE, INPUT, {
      promptVersion: '  ',
      contractVersion: CONTRACT_VERSION,
    })

    const payload = acceptanceFor(composed, INPUT, FACTS)
    expect(payload.ok).toBe(false)
    if (payload.ok) return
    expect(payload.error.details?.issues).toMatchObject([{ path: 'prompt_version' }])
  })

  it('records both columns as NOT NULL in the schema they are written to', () => {
    const domain = read('supabase/migrations/20260921000002_workout_domain.sql')
    expect(domain).toMatch(/prompt_version\s+text not null/i)
    expect(domain).toMatch(/contract_version text not null/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. What else the row records, and what it must not
// ─────────────────────────────────────────────────────────────────────────────

describe('the session records what it was composed against', () => {
  it('carries the request, the goal and the facts only the caller knows', async () => {
    const store = double()
    await persisted(store)

    const [session] = store.store().sessions
    expect(session).toMatchObject<Partial<WorkoutSessionRow>>({
      user_id: USER_ID,
      location_id: LOCATION_ID,
      date: FACTS.date,
      session_focus: 'lower_body',
      goal_preset: 'strength',
      requested_duration_mins: 45,
      effective_duration_target_mins: 45,
      computed_duration_mins: null,
      requested_intensity: 8,
      effective_intensity: 8,
      adjustment_reason: null,
      generation_notes: 'left shoulder has been a bit cranky',
      title: 'Lower Body Strength',
    })
  })

  it('records why a clamped intensity differs from the requested one', () => {
    const input = activeRecoveryInput(8)
    expect(input.request.effectiveIntensity).toBe(3)

    const reason = adjustmentReasonFor(input.request)
    expect(reason).toBe('Intensity clamped from 8 to 3 for the active_recovery preset.')
  })

  it('records nothing when nothing was adjusted', () => {
    expect(adjustmentReasonFor(INPUT.request)).toBeNull()
  })

  it('lets a caller state the reason, including that there is none', () => {
    const composed = hydratedFrom(VALID_RESPONSE, INPUT)

    const stated = acceptanceFor(composed, INPUT, { ...FACTS, adjustmentReason: 'GEN-04 cascade' })
    expect(stated.ok && stated.value.adjustment_reason).toBe('GEN-04 cascade')

    const silent = acceptanceFor(composed, activeRecoveryInput(8), {
      ...FACTS,
      adjustmentReason: null,
    })
    expect(silent.ok && silent.value.adjustment_reason).toBeNull()
  })

  it('aims at the clamped duration target when a caller supplies one', () => {
    const composed = hydratedFrom(VALID_RESPONSE, INPUT)
    const payload = acceptanceFor(composed, INPUT, { ...FACTS, effectiveDurationTargetMins: 30 })

    expect(payload.ok).toBe(true)
    if (!payload.ok) return
    // Requested and effective are two columns because they answer two
    // questions; GEN-04 owns the cascade that makes them differ.
    expect(payload.value.requested_duration_mins).toBe(45)
    expect(payload.value.effective_duration_target_mins).toBe(30)
  })

  it('never lets the model estimate become a duration the session records (D5)', async () => {
    const store = double()
    await persisted(store)

    const [session] = store.store().sessions
    // `VALID_RESPONSE` estimates 46 minutes against a 45-minute request. No
    // column holds 46, and the three that hold minutes are the request's, the
    // request's after clamps, and GEN-06's.
    expect(session.requested_duration_mins).toBe(45)
    expect(session.effective_duration_target_mins).toBe(45)
    expect(session.computed_duration_mins).toBeNull()
    expect(session.actual_duration_mins).toBeNull()
    expect(Object.values(session)).not.toContain(46)
  })

  it('carries the estimate only where the boundary schema requires it', () => {
    const composed = hydratedFrom(VALID_RESPONSE, INPUT)
    const payload = acceptanceFor(composed, INPUT, FACTS)

    expect(payload.ok).toBe(true)
    if (!payload.ok) return
    // Present, because `generationOutputSchema` requires it and sending a
    // number the model did not write would be worse than sending the one it
    // did; and read by nothing, because the function never mentions the field.
    expect(payload.value.workout.estimated_duration_mins).toBe(46)

    const persistFunction = read(LIFECYCLE_MIGRATION).split(
      `create or replace function public.${PERSIST_FUNCTION}(`,
    )[1]
    expect(persistFunction).not.toContain('estimated_duration_mins')
  })

  it('writes the prescription and leaves the catalog facts in the catalog', async () => {
    const store = double()
    await persisted(store)

    const squat = store.store().exercises.find((row) => row.exercise_id === 'back-squat')
    expect(squat).toBeDefined()
    // Hydration's facts are for the answer the caller receives. A name or a cue
    // copied into this row would be the drift §8 exists to prevent.
    expect(Object.keys(squat ?? {})).not.toContain('name')
    expect(squat).toMatchObject({
      equipment_used: 'barbell',
      sets: 5,
      target_kind: 'fixed',
      target_value: 5,
      load_type: 'percent_1rm',
      load_value: 78,
      origin: 'generated',
      revision_status: 'active',
      execution_status: 'not_started',
    })
    expect(squat?.slot_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/)
    expect(squat?.replaces_id).toBeNull()
  })

  it('logs counts and versions, and never what the user was prescribed', async () => {
    const lines: string[] = []
    const sink: LogSink = {
      write(_level, line) {
        lines.push(line)
      },
    }
    const store = double()

    const result = await persist(
      hydratedFrom(VALID_RESPONSE, INPUT),
      { userId: USER_ID, input: INPUT, facts: FACTS },
      writerFor(store),
      { logger: createLogger({ sink, level: 'debug' }), requestId: 'req_abc123_def456' },
    )

    expect(result.ok).toBe(true)
    const entry = JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>
    expect(entry).toMatchObject({
      msg: 'session persisted',
      sections: 3,
      blocks: 3,
      exercises: 5,
      promptVersion: PROMPT_VERSION,
      contractVersion: CONTRACT_VERSION,
    })
    expect(lines.join('\n')).not.toContain('back-squat')
    expect(lines.join('\n')).not.toContain('Lower Body Strength')
    expect(lines.join('\n')).not.toContain(ACCESS_TOKEN)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. The transport failures, each read as one thing
// ─────────────────────────────────────────────────────────────────────────────

describe('a write that fails says which kind of failure it was', () => {
  const writerWith = (fetchImpl: typeof globalThis.fetch) =>
    createSessionWriter({
      url: PROJECT_URL,
      anonKey: ANON_KEY,
      accessToken: ACCESS_TOKEN,
      fetch: fetchImpl,
    })

  const acceptance = () => {
    const payload = acceptanceFor(hydratedFrom(VALID_RESPONSE, INPUT), INPUT, FACTS)
    if (!payload.ok) throw new Error('the fixture payload no longer parses')
    return payload.value
  }

  it('posts one JSON body to the rpc endpoint, with the caller token', async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = []
    const writer = writerWith(async (input, init) => {
      seen.push({ url: String(input), init })
      return new Response('null', { status: 200 })
    })

    await writer(USER_ID, acceptance())

    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe(`${PROJECT_URL}/rest/v1/rpc/${PERSIST_FUNCTION}`)
    expect(seen[0].init?.method).toBe('POST')
    const headers = new Headers(seen[0].init?.headers)
    expect(headers.get('apikey')).toBe(ANON_KEY)
    expect(headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    const body = JSON.parse(String(seen[0].init?.body)) as Record<string, unknown>
    expect(Object.keys(body)).toEqual(['p_user_id', 'p_session'])
    expect(sessionAcceptanceSchema.safeParse(body.p_session).success).toBe(true)
  })

  it('reads a status as the taxonomy reads it everywhere else', async () => {
    const cases: readonly [number, ErrorCode][] = [
      [401, ErrorCode.AUTH_UNAUTHORIZED],
      [403, ErrorCode.AUTH_UNAUTHORIZED],
      [409, ErrorCode.PERSISTENCE_CONFLICT],
      [429, ErrorCode.NETWORK_RATE_LIMITED],
      [400, ErrorCode.VALIDATION_CONSTRAINT],
      [422, ErrorCode.VALIDATION_CONSTRAINT],
      [404, ErrorCode.PERSISTENCE_WRITE_FAILED],
      [500, ErrorCode.NETWORK_SERVER_ERROR],
    ]

    for (const [status, code] of cases) {
      const writer = writerWith(async () =>
        new Response(JSON.stringify({ code: '23514' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const result = await writer(USER_ID, acceptance())
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.error.code).toBe(code)
      expect(result.error.details).toMatchObject({ status, pgCode: '23514' })
    }
  })

  it('reads a transport failure without quoting the request that failed', async () => {
    const writer = writerWith(async () => {
      throw new Error(`POST ${PROJECT_URL} apikey=${ANON_KEY} Bearer ${ACCESS_TOKEN}`)
    })

    const result = await writer(USER_ID, acceptance())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.NETWORK_SERVER_ERROR)
    // D3: a thrown message can carry the headers it failed on.
    expect(JSON.stringify(result.error)).not.toContain(ACCESS_TOKEN)
  })

  it('reads a committed write it cannot read back as a read failure', async () => {
    // SQL NULL from `persist_session` means the row it just wrote is not
    // readable. The workout is whole; only the answer is missing.
    const writer = writerWith(async () => new Response('null', { status: 200 }))

    const result = await writer(USER_ID, acceptance())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
    expect(result.error.details).toMatchObject({ fn: PERSIST_FUNCTION, reason: 'null' })
  })

  it('refuses a snapshot that is not the shape the contract declares', async () => {
    const writer = writerWith(
      async () => new Response(JSON.stringify({ session: {}, state: 'prescribed' }), { status: 200 }),
    )

    const result = await writer(USER_ID, acceptance())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(ErrorCode.PERSISTENCE_READ_FAILED)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. One run per goal preset
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each goal's section arc, read out of the system prompt's own GOAL SHAPES
 * block. The arc is what "honouring section scaling" is measured against, and
 * reading it from the prompt rather than restating it here is what makes the
 * assertion falsifiable: a goal shape edited in `prompt.ts` changes what these
 * runs are required to persist.
 */
function goalShapes(): Map<Enums<'goal_preset'>, Enums<'section_type'>[]> {
  const block = SYSTEM_PROMPT.split('GOAL SHAPES')[1]?.split('STRUCTURES')[0] ?? ''
  const shapes = new Map<Enums<'goal_preset'>, Enums<'section_type'>[]>()

  for (const match of block.matchAll(/^- ([a-z_]+): ([^.;]+)/gm)) {
    const arc = match[2]
      .split('→')
      .map((token) => token.trim().match(/^[a-z_]+/)?.[0] ?? '')
      .filter((token): token is Enums<'section_type'> => SECTION_TYPES.includes(token))

    shapes.set(match[1] as Enums<'goal_preset'>, arc)
  }

  return shapes
}

const SECTION_TYPES: string[] = [
  'warmup',
  'mobility',
  'primary_lift',
  'accessory',
  'skill_power',
  'carries',
  'core',
  'stability_balance',
  'conditioning',
  'cooldown',
]

/**
 * Which of the captured candidates belong in each section. The library is nine
 * real exercises from `docs/backend/snapshot/`, so a cooldown offers stretches
 * and a primary offers compounds — a candidate set GEN-02a could plausibly have
 * returned, rather than one invented to make a workout parse.
 */
const SECTION_CANDIDATES: Record<string, readonly string[]> = {
  warmup: ['cat-cow', 'worlds-greatest-stretch', '90-90-stretch'],
  mobility: ['90-90-stretch', 'worlds-greatest-stretch'],
  primary_lift: ['back-squat', 'deadlift', 'front-squat'],
  accessory: ['bulgarian-split-squat', 'walking-lunges', 'glute-bridge'],
  core: ['glute-bridge', 'cat-cow'],
  conditioning: ['walking-lunges', 'glute-bridge', 'bulgarian-split-squat'],
  cooldown: ['90-90-stretch', 'cat-cow'],
}

/** The first equipment the candidate can actually be performed with (check 2). */
const equipmentFor = (exerciseId: string) => CANDIDATE_LIBRARY[exerciseId].usableEquipment[0]

function prescription(exerciseId: string, overrides: Record<string, unknown> = {}) {
  const equipment = equipmentFor(exerciseId)
  const loaded = equipment !== 'bodyweight'

  return {
    exercise_id: exerciseId,
    equipment,
    session_function: 'accessory',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: 3,
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

/**
 * One section of a synthesized response. Synthesized and said so: unlike
 * `VALID_RESPONSE` these are not recorded model output, because no model has
 * been called from this workspace. What they are is five contract-valid
 * compositions, one per goal arc, serialized to text and re-entered through
 * `parseCompletion` so the run starts where a real one does — at a string.
 */
function section(sectionType: string) {
  const candidates = SECTION_CANDIDATES[sectionType]
  if (candidates === undefined) throw new Error(`no candidate set for ${sectionType}`)

  if (sectionType === 'conditioning') {
    return {
      section_type: sectionType,
      section_title: 'Engine',
      section_notes: null,
      blocks: [
        {
          structure_type: 'circuit',
          rounds: 3,
          timer_type: 'none',
          timer_seconds: null,
          round_rest_seconds: 60,
          rep_scheme: 'fixed',
          block_notes: null,
          exercises: candidates.map((id) =>
            prescription(id, {
              session_function: 'conditioning',
              // Rounds belong to the block, so a member has no set count of
              // its own and no rest of its own.
              sets: null,
              rest_seconds: null,
              target_value: 10,
            }),
          ),
        },
      ],
    }
  }

  return {
    section_type: sectionType,
    section_title: sectionType === 'primary_lift' ? 'Main Lift' : 'Work',
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
        exercises:
          sectionType === 'primary_lift'
            ? [
                prescription(candidates[0], {
                  session_function: 'primary',
                  anchor_relationship: 'direct',
                  sets: 5,
                  target_value: 5,
                  rest_seconds: 150,
                }),
              ]
            : candidates
                .slice(0, 2)
                .map((id) => prescription(id, { session_function: 'prep', sets: 2 })),
      },
    ],
  }
}

function responseFor(arc: readonly string[]): string {
  return JSON.stringify({
    title: 'Composed Session',
    overview: null,
    sections: arc.map(section),
    estimated_duration_mins: 44,
  })
}

function inputFor(goal: Enums<'goal_preset'>, arc: readonly Enums<'section_type'>[]): PromptInput {
  return promptInput({
    request: resolveEffectiveRequest({
      requestId: 'req_abc123_def456',
      goal,
      focus: 'full_body',
      requestedIntensity: 6,
      durationTargetMins: 45,
      // Everything the arc asks for is enabled; active recovery's own override
      // is `resolveEffectiveRequest`'s and is asserted below.
      enabledSections: arc,
    }),
    sections: arc.map((sectionType) =>
      sectionFixture(sectionType, SECTION_CANDIDATES[sectionType] ?? []),
    ),
  })
}

describe('one run per goal preset persists a contract-valid workout', () => {
  const shapes = goalShapes()

  it('reads a section arc for every goal preset the database knows', () => {
    expect([...shapes.keys()].sort()).toEqual([
      'active_recovery',
      'balanced',
      'conditioning',
      'hypertrophy',
      'strength',
    ])
    expect(shapes.get('active_recovery')).toEqual(['warmup', 'mobility', 'cooldown'])
    expect(shapes.get('balanced')).toEqual([
      'warmup',
      'primary_lift',
      'accessory',
      'core',
      'conditioning',
      'cooldown',
    ])
  })

  for (const [goal, arc] of goalShapes()) {
    it(`persists a ${goal} session honouring its section arc`, async () => {
      const input = inputFor(goal, arc)
      const store = double()

      const result = await persist(
        hydratedFrom(responseFor(arc), input),
        { userId: USER_ID, input, facts: FACTS },
        writerFor(store),
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return

      // Section scaling, as the row order records it: the arc the goal asks
      // for, in that order, each section carrying the block it was composed of.
      const stored = store.store()
      expect(stored.sections.map((row) => row.section_type)).toEqual(arc)
      expect(stored.sections.map((row) => row.order_index)).toEqual(arc.map((_, index) => index))
      expect(stored.blocks).toHaveLength(arc.length)
      expect(stored.exercises.length).toBeGreaterThanOrEqual(arc.length)

      const [session] = stored.sessions
      expect(session.goal_preset).toBe(goal)
      expect(session.prompt_version).toBe(PROMPT_VERSION)
      expect(session.contract_version).toBe(CONTRACT_VERSION)
      expect(session.effective_intensity).toBe(input.request.effectiveIntensity)

      // Contract-valid all the way down: every prescription the database holds
      // is one the boundary schema would accept back.
      const payload = acceptanceFor(hydratedFrom(responseFor(arc), input), input, FACTS)
      expect(payload.ok).toBe(true)
    })
  }

  it('honours active recovery own section override rather than the profile toggles', async () => {
    // GEN-02a fixes active recovery's sections in SQL whatever the profile
    // stores, so a session composed for it must persist those three and not the
    // five somebody left enabled.
    const arc = shapes.get('active_recovery') ?? []
    const input = promptInput({
      request: resolveEffectiveRequest({
        requestId: 'req_abc123_def456',
        goal: 'active_recovery',
        focus: 'full_body',
        requestedIntensity: 9,
        durationTargetMins: 30,
        enabledSections: ['warmup', 'primary_lift', 'accessory', 'core', 'cooldown'],
      }),
      sections: arc.map((sectionType) =>
        sectionFixture(sectionType, SECTION_CANDIDATES[sectionType] ?? []),
      ),
    })

    const store = double()
    const result = await persist(
      hydratedFrom(responseFor(arc), input),
      { userId: USER_ID, input, facts: FACTS },
      writerFor(store),
    )

    expect(result.ok).toBe(true)
    const [session] = store.store().sessions
    expect(store.store().sections.map((row) => row.section_type)).toEqual([
      'warmup',
      'mobility',
      'cooldown',
    ])
    expect(session.requested_intensity).toBe(9)
    expect(session.effective_intensity).toBe(3)
    expect(session.adjustment_reason).toBe(
      'Intensity clamped from 9 to 3 for the active_recovery preset.',
    )
  })

  it('projects a hydrated workout back to the contract shape without editing it', () => {
    const composed = hydratedFrom(VALID_RESPONSE, INPUT)
    const parsed = parseCompletion(VALID_RESPONSE)
    if (!parsed.ok) throw new Error('the valid fixture no longer parses')

    // Hydration adds facts beside a prescription and changes nothing inside
    // one, so the projection is the model's own object back again.
    expect(composedWorkout(composed)).toEqual(parsed.value)
  })
})

function activeRecoveryInput(requestedIntensity: number): PromptInput {
  return promptInput({
    request: resolveEffectiveRequest({
      requestId: 'req_abc123_def456',
      goal: 'active_recovery',
      focus: 'full_body',
      requestedIntensity,
      durationTargetMins: 30,
      enabledSections: ['warmup', 'mobility', 'cooldown'],
    }),
  })
}
