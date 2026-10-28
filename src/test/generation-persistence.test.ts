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
  resolveEffectiveRequest,
  type PromptInput,
} from '../../supabase/functions/_shared/prompt.ts'
import { validateComposition } from '../../supabase/functions/_shared/validate.ts'
import { migrationFiles, readSchema } from '../../scripts/gen-types/schema.mjs'
import { createSessionsClient } from '../data/sessions'
import { ErrorCode } from '../state/errors'
import { createLogger, type LogSink } from '../state/logger'
import {
  CONTRACT_VERSION,
  generationOutputSchema,
  sessionAcceptanceSchema,
  sessionSnapshotSchema,
  type GenerationOutput,
  type SessionSnapshot,
  type WorkoutBlock,
  type WorkoutSessionRow,
} from '../state/schemas'
import { makeCatalogLadderTimingBlock } from './ladder-persistence-fixtures'
import {
  CANDIDATE_LIBRARY,
  catalogRowFixtures,
  promptInput,
  sectionFixture,
} from './generation-prompt-fixtures'
import {
  INTRODUCTION_PROSE,
  NULL_PROSE_RESPONSE,
  VALID_RESPONSE,
} from './generation-response-fixtures'
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
//      persist — with independent synthetic selections, not mandatory arcs
//      read from prompt prose or evidence of live model quality.
//
// What this file cannot prove is that Postgres agrees: the off-machine-backup
// gate in `docs/backend/live-inventory.md` forbids touching the reused project,
// so `session-double.ts` stands in, and it models atomicity the way a
// transaction gives it — every row is built before any row is stored.

const REPO_ROOT = resolve(import.meta.dirname, '../..')
const LIFECYCLE_MIGRATION = 'supabase/migrations/20260921000006_session_lifecycle.sql'
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
    const domain = read('supabase/migrations/20260921000003_workout_domain.sql')
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

/** Independent synthetic selections, not mandatory arcs parsed from the prompt.
 * These check persistence for each goal; they do not prove live coaching quality.
 * Available parts may be omitted under the owner's October 2 disposition.
 */
function goalShapes(): Map<Enums<'goal_preset'>, Enums<'section_type'>[]> {
  return new Map([
    ['strength', ['warmup', 'primary_lift', 'accessory', 'cooldown']],
    ['hypertrophy', ['warmup', 'primary_lift', 'accessory', 'core', 'cooldown']],
    ['conditioning', ['warmup', 'conditioning', 'cooldown']],
    ['balanced', ['warmup', 'primary_lift', 'conditioning', 'cooldown']],
    ['active_recovery', ['mobility', 'cooldown']],
  ])
}

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

  it('covers every goal with independently selected useful parts, not every available part', () => {
    expect([...shapes.keys()].sort()).toEqual([
      'active_recovery',
      'balanced',
      'conditioning',
      'hypertrophy',
      'strength',
    ])
    expect(shapes.get('active_recovery')).toEqual(['mobility', 'cooldown'])
    expect(shapes.get('balanced')).toEqual([
      'warmup',
      'primary_lift',
      'conditioning',
      'cooldown',
    ])
  })

  for (const [goal, arc] of goalShapes()) {
    it(`persists the ${goal} session's composed selection`, async () => {
      const input = inputFor(goal, arc)
      const store = double()

      const result = await persist(
        hydratedFrom(responseFor(arc), input),
        { userId: USER_ID, input, facts: FACTS },
        writerFor(store),
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return

      // The model's selected order persists; the test does not require all
      // available headings or prescribe a universal goal arc.
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
    // GEN-02a fixes active recovery's allowed pool whatever the profile stores;
    // composition may choose a useful subset, not the profile's heavy lifts.
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
    expect(input.request.effectiveSections).toEqual(['warmup', 'mobility', 'cooldown'])
    expect(store.store().sections.map((row) => row.section_type)).toEqual(arc)
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
    // one, so the projection is the model's own object back again — less the
    // introductions REQ-010 suppresses, which are the only edit.
    expect(composedWorkout(composed)).toEqual({
      ...parsed.value,
      overview: null,
      sections: parsed.value.sections.map((section) => ({ ...section, section_notes: null })),
    })
  })
})

describe('introductions never reach the stored session (REQ-010)', () => {
  it('stores null overview and section notes when the model wrote introductions anyway', async () => {
    const store = double()
    const result = await persisted(store, VALID_RESPONSE)

    expect(result.ok).toBe(true)
    const { sessions, sections, blocks, exercises } = store.store()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].overview).toBeNull()
    expect(sections.length).toBeGreaterThan(0)
    expect(sections.every((section) => section.section_notes === null)).toBe(true)
    // Every structured row is still written: nothing was discarded with the prose.
    expect(blocks).toHaveLength(3)
    expect(exercises).toHaveLength(5)
  })

  it('persists the null-prose response exactly as it persists the legacy one', async () => {
    const legacy = double()
    const asked = double()
    await persisted(legacy, VALID_RESPONSE)
    await persisted(asked, NULL_PROSE_RESPONSE)

    const shape = (store: ReturnType<typeof double>) =>
      store.store().exercises.map((row) => [row.exercise_id, row.sets, row.target_kind])

    expect(asked.store().sessions[0].overview).toBeNull()
    expect(shape(asked)).toEqual(shape(legacy))
  })

  it('sends the write path an acceptance whose prose keys are present and null', () => {
    const payload = acceptanceFor(hydratedFrom(VALID_RESPONSE, INPUT), INPUT, FACTS)
    if (!payload.ok) throw new Error('acceptance refused')

    expect(payload.value.workout).toHaveProperty('overview', null)
    for (const section of payload.value.workout.sections) {
      expect(section).toHaveProperty('section_notes', null)
    }
    expect(JSON.stringify(payload.value)).not.toContain(INTRODUCTION_PROSE.overview)
    expect(JSON.stringify(payload.value)).not.toContain(INTRODUCTION_PROSE.sectionNotes)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Explicit ladder timing survives acceptance, insert and load (REQ-018)
// ─────────────────────────────────────────────────────────────────────────────
//
// TASK-039. The chain is the production one from §6 onwards: a verdict,
// hydration, `acceptanceFor`'s strict parse, one `persist_session` request,
// the snapshot it answers, and a fresh client loading the session again. The
// one step that is not production is how the timed block enters the verdict:
// the edge gate keeps generated output legacy-shaped until TASK-032, so the
// block is added to the legacy fixture's verdict and re-read through
// TASK-038's `generationOutputSchema`.

const LADDER_MIGRATION = 'supabase/migrations/20261021000025_ladder_timing_persistence.sql'

/** Varied, so no fixture can lean on one round count or interval. */
const LADDER_CASES = [
  ['scheduled_starts', { rounds: 3, intervalSeconds: 75 }],
  ['scheduled_starts', { rounds: 8, intervalSeconds: 200 }],
  ['for_time', { rounds: 2 }],
  ['for_time', { rounds: 10 }],
  ['capped_window', { rounds: 4, capSeconds: 420 }],
  ['capped_window', { rounds: 7, capSeconds: 900 }],
] as const

/** The legacy fixture's hydrated workout, with `blocks` added to its accessory section. */
function hydratedWithLadders(...blocks: WorkoutBlock[]) {
  const parsed = parseCompletion(VALID_RESPONSE)
  if (!parsed.ok) throw new Error('the fixture no longer parses')
  const verdict = validateComposition(parsed.value, INPUT)
  if (!verdict.ok) throw new Error('the fixture no longer validates')

  const workout = structuredClone(verdict.value.workout)
  workout.sections[2].blocks.push(...structuredClone(blocks))

  const ids = [...prescribedIds(workout)]
  const rows = catalogRowFixtures(ids)
  const referenced = rows.map((row) => row.regression).filter((id): id is string => id !== null)
  const names = new Map(
    catalogRowFixtures([...new Set([...ids, ...referenced])]).map((row) => [row.id, row.name]),
  )

  const hydrated = hydrateWorkout(
    { ...verdict.value, workout: generationOutputSchema.parse(workout) },
    factsFromRows(rows, names),
  )
  if (!hydrated.ok) throw new Error(`hydration failed: ${hydrated.error.code}`)

  return hydrated.value
}

async function persistedLadders(store: ReturnType<typeof createSessionDouble>, ...blocks: WorkoutBlock[]) {
  const result = await persist(
    hydratedWithLadders(...blocks),
    { userId: USER_ID, input: INPUT, facts: FACTS },
    writerFor(store),
  )
  if (!result.ok) throw new Error(`persist failed: ${result.error.code}`)

  return result.value
}

/** A second client, remembering nothing: the load a refresh performs. */
async function reloaded(store: ReturnType<typeof createSessionDouble>, sessionId: string) {
  const client = createSessionsClient({
    url: PROJECT_URL,
    anonKey: ANON_KEY,
    accessToken: ACCESS_TOKEN,
    fetch: store.fetch,
  })
  const result = await client.snapshot(sessionId)
  if (!result.ok) throw new Error(`load failed: ${result.error.code}`)

  return result.value
}

describe('explicit ladder timing survives acceptance, insert and load (REQ-018)', () => {
  it.each(LADDER_CASES)('round-trips a %s timing (%o) unchanged', async (mode, options) => {
    const block = makeCatalogLadderTimingBlock(mode, options)

    const payload = acceptanceFor(hydratedWithLadders(block), INPUT, FACTS)
    if (!payload.ok) throw new Error(`acceptance refused: ${payload.error.code}`)
    expect(payload.value.workout.sections[2].blocks[1].ladder_timing).toEqual(block.ladder_timing)

    const store = double()
    const written = await persistedLadders(store, block)
    const stored = written.sections[2].blocks[1].block

    expect(stored.ladder_timing).toEqual(block.ladder_timing)
    // Beside it, the columns it agrees with, as composed rather than re-derived.
    expect(stored).toMatchObject({
      structure_type: block.structure_type,
      timer_type: block.timer_type,
      timer_seconds: block.timer_seconds,
      rounds: null,
      round_rest_seconds: null,
      rep_scheme: block.rep_scheme,
    })

    const loaded = await reloaded(store, written.session.id)
    expect(loaded.sections[2].blocks[1].block).toEqual(stored)
  })

  it.each(LADDER_CASES)('keeps every rung and the fixed companion of a %s ladder (%o)', async (mode, options) => {
    const block = makeCatalogLadderTimingBlock(mode, options)
    const store = double()
    const written = await persistedLadders(store, block)
    const loaded = await reloaded(store, written.session.id)

    const [sequence, companion] = loaded.sections[2].blocks[1].exercises.map((entry) => entry.exercise)
    expect(sequence).toMatchObject({
      exercise_id: block.exercises[0].exercise_id,
      target_kind: 'sequence',
      target_sequence: block.exercises[0].target_sequence,
    })
    expect(sequence.target_sequence).toHaveLength(options.rounds)
    // Companion work is the same every round, and stays a member of the block.
    expect(companion).toMatchObject({
      exercise_id: block.exercises[1].exercise_id,
      target_kind: 'fixed',
      target_value: 4,
      target_sequence: null,
      is_interval_exercise: true,
    })
  })

  it('stores no timing for a legacy payload, absent or null, and invents none on load', async () => {
    const absent = makeCatalogLadderTimingBlock('scheduled_starts', { rounds: 5, intervalSeconds: 60 })
    delete absent.ladder_timing
    const explicitNull = makeCatalogLadderTimingBlock('for_time', { rounds: 3 })
    explicitNull.ladder_timing = null

    // The payload says what the workout said: no key is added where none was.
    const payload = acceptanceFor(hydratedWithLadders(absent, explicitNull), INPUT, FACTS)
    if (!payload.ok) throw new Error('acceptance refused')
    const sent = payload.value.workout.sections[2].blocks
    expect(Object.hasOwn(sent[0], 'ladder_timing')).toBe(false)
    expect(Object.hasOwn(sent[1], 'ladder_timing')).toBe(false)
    expect(sent[2].ladder_timing).toBeNull()

    const store = double()
    const written = await persistedLadders(store, absent, explicitNull)
    const loaded = await reloaded(store, written.session.id)

    // SQL NULL for all three, never a schedule read out of a ladder's sequence.
    for (const section of loaded.sections) {
      for (const { block } of section.blocks) expect(block.ladder_timing).toBeNull()
    }
    expect(loaded.sections[2].blocks[1].exercises[0].exercise.target_sequence).toHaveLength(5)
  })

  it('loads a session saved before the column existed as the legacy session it was', async () => {
    const store = double()
    const written = await persisted(store)
    if (!written.ok) throw new Error('persist failed')

    // A database the migration has not reached answers without the key.
    const before = structuredClone(written.value) as unknown as {
      sections: { blocks: { block: Record<string, unknown> }[] }[]
    }
    for (const section of before.sections) {
      for (const entry of section.blocks) delete entry.block.ladder_timing
    }

    const parsed = sessionSnapshotSchema.parse(before)
    for (const section of parsed.sections) {
      for (const { block } of section.blocks) expect(Object.hasOwn(block, 'ladder_timing')).toBe(false)
    }
  })

  it('refuses a stored timing no reader could run, rather than dropping it', () => {
    const block = makeCatalogLadderTimingBlock('capped_window', { rounds: 4, capSeconds: 300 })

    // The block row on its own, as `to_jsonb(b)` would answer it.
    const row = (timing: unknown) => ({
      id: '00000000-0000-4000-8000-000000000001',
      section_id: '00000000-0000-4000-8000-000000000002',
      created_at: '2026-10-21T00:00:00+00:00',
      order_index: 0,
      structure_type: block.structure_type,
      rounds: null,
      timer_type: block.timer_type,
      timer_seconds: block.timer_seconds,
      round_rest_seconds: null,
      rep_scheme: block.rep_scheme,
      block_notes: null,
      ladder_timing: timing,
    })
    const blockRow = sessionSnapshotSchema.shape.sections.element.shape.blocks.element.shape.block

    expect(blockRow.parse(row(block.ladder_timing)).ladder_timing).toEqual(block.ladder_timing)
    expect(blockRow.parse(row(null)).ladder_timing).toBeNull()
    for (const malformed of [
      { mode: 'capped_window', rounds: 4, interval_seconds: null, cap_seconds: null },
      { mode: 'every_minute', rounds: 4, interval_seconds: 60, cap_seconds: null },
      { mode: 'for_time', rounds: 1, interval_seconds: null, cap_seconds: null },
      { mode: 'for_time', rounds: 4, interval_seconds: null, cap_seconds: null, extra: 1 },
      'scheduled_starts',
    ]) {
      expect(blockRow.safeParse(row(malformed)).success).toBe(false)
    }
  })
})

describe('the migration that carries it is additive', () => {
  const migration = read(LADDER_MIGRATION)

  it('is appended after every migration that was already there', () => {
    const files = migrationFiles()
    expect(files.slice(files.indexOf(LADDER_MIGRATION.split('/').at(-1)!))).toEqual([
      '20261021000025_ladder_timing_persistence.sql',
      '20261024000026_v3_hinge_warmup.sql',
      '20261027000027_set_effort.sql',
      '20261027000028_set_observation_mutations.sql',
    ])
  })

  it('adds one nullable column with no default and rewrites no row', () => {
    expect(migration).toMatch(/alter table public\.workout_blocks\s+add column if not exists ladder_timing jsonb;/)
    expect(migration).not.toMatch(/ladder_timing jsonb (not null|default)/i)
    // History stays as written: no UPDATE, DELETE or backfill of any table.
    expect(migration).not.toMatch(/^\s*(update|delete from|truncate)\b/im)
    expect(migration).not.toMatch(/drop (table|column)/i)
  })

  it('is typed by the existing generator as nullable JSON', () => {
    const table = readSchema().tables.find((candidate) => candidate.name === 'workout_blocks')
    expect(table?.columns.find((column) => column.name === 'ladder_timing')).toMatchObject({
      pgType: 'jsonb',
      nullable: true,
      hasDefault: false,
    })
  })

  it('makes it the newest persist_session, which writes the timing as sent', () => {
    const definers = migrationFiles().filter((file) =>
      read(`supabase/migrations/${file}`).includes('create or replace function public.persist_session('),
    )
    expect(definers.at(-1)).toBe(LADDER_MIGRATION.split('/').at(-1))

    expect(migration).toMatch(/round_rest_seconds, rep_scheme, block_notes,\s+ladder_timing\s+\) values/)
    expect(migration).toContain("nullif(v_block -> 'ladder_timing', 'null'::jsonb)")
    // Everything else in the function is the deload migration's, unchanged.
    expect(migration).toContain("coalesce((p_session ->> 'is_deload')::boolean, false)")
    expect(migration).toContain('return public.session_snapshot(v_session_id);')
    expect(migration).toMatch(/revoke all on function public\.persist_session\(uuid, jsonb\) from public, anon;/)
  })

  it('reads it back through to_jsonb, so no reader needed changing', () => {
    expect(read(LIFECYCLE_MIGRATION)).toMatch(/'block', to_jsonb\(b\)/)
    expect(read('supabase/migrations/20260921000010_session_reconstruction.sql')).toMatch(
      /'block', to_jsonb\(b\)/,
    )
  })

  it('constrains the stored shape to the modes the schema knows', () => {
    expect(migration).toContain('add constraint workout_blocks_ladder_timing_shape')
    for (const mode of ['scheduled_starts', 'for_time', 'capped_window']) {
      expect(migration).toContain(`ladder_timing ->> 'mode' = '${mode}'`)
    }
    // No round count or interval is a scheduling constant: the numeric bounds
    // belong to the existing reader's integer domain, not to a workout policy.
    expect(migration).toContain("(ladder_timing ->> 'rounds')::numeric < 2")
    expect(migration).not.toMatch(/\b(180|300)\b/)
  })

  const timingReader = sessionSnapshotSchema.shape.sections.element.shape.blocks.element.shape.block.shape.ladder_timing
  const MAX_SAFE = 9007199254740991
  const timing = (mode: 'for_time' | 'scheduled_starts' | 'capped_window', overrides = {}) => ({
    mode,
    rounds: 2,
    interval_seconds: mode === 'scheduled_starts' ? 1 : null,
    cap_seconds: mode === 'capped_window' ? 1 : null,
    ...overrides,
  })

  /**
   * Offline transcription of this column CHECK, not a PostgreSQL execution.
   * The upper bounds are read from the actual SQL: removing one makes its
   * overflow fixtures fail instead of letting a hardcoded test oracle hide it.
   * Null here means SQL NULL after persist_session's nullif, not JSONB null.
   * This tests the stored timing's shape, not whole-block/sequence consistency.
   */
  function storedTimingShape(value: unknown, sql = migration): boolean {
    if (value === null || value === undefined) return true
    if (typeof value !== 'object' || Array.isArray(value)) return false
    const row = value as Record<string, unknown>
    if (Object.keys(row).sort().join(',') !== 'cap_seconds,interval_seconds,mode,rounds') return false
    const integer = (field: string, minimum: number) => {
      const operator = field === 'rounds' ? '>' : '<='
      const match = new RegExp(`\\(ladder_timing ->> '${field}'\\)::numeric ${operator} (\\d+)`).exec(sql)
      const ceiling = match === null ? Infinity : Number(match[1])
      const candidate = row[field]
      return typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= minimum && candidate <= ceiling
    }
    if (!integer('rounds', 2)) return false
    switch (row.mode) {
      case 'scheduled_starts': return row.cap_seconds === null && integer('interval_seconds', 1)
      case 'for_time': return row.interval_seconds === null && row.cap_seconds === null
      case 'capped_window': return row.interval_seconds === null && integer('cap_seconds', 1)
      default: return false
    }
  }

  it('binds all three SQL integer ceilings and strict null/key rules to the unchanged reader', () => {
    for (const field of ['rounds', 'interval_seconds', 'cap_seconds']) {
      const operator = field === 'rounds' ? '>' : '<='
      const bound = new RegExp(`\\(ladder_timing ->> '${field}'\\)::numeric ${operator} (\\d+)`).exec(migration)
      expect(bound?.[1], field).toBe(String(MAX_SAFE))
    }
    expect(migration).toContain('ladder_timing is null')
    expect(migration).toContain("ladder_timing ?& array['mode', 'rounds', 'interval_seconds', 'cap_seconds']")
    expect(migration).toContain("ladder_timing - array['mode', 'rounds', 'interval_seconds', 'cap_seconds']")
    expect(migration).toContain("jsonb_typeof(ladder_timing -> 'rounds') <> 'number'")
    expect(migration).toContain("(ladder_timing ->> 'rounds')::numeric % 1 <> 0")
    for (const field of ['interval_seconds', 'cap_seconds']) {
      expect(migration).toContain(`jsonb_typeof(ladder_timing -> '${field}') <> 'number'`)
      expect(migration).toContain(`(ladder_timing ->> '${field}')::numeric > 0`)
      expect(migration).toContain(`(ladder_timing ->> '${field}')::numeric % 1 = 0`)
    }
  })

  const shapeCases: [string, unknown, boolean][] = [
    ['absent legacy value normalizes to SQL NULL', undefined, true],
    ['persisted SQL NULL', null, true],
    ['minimum free-paced rungs', timing('for_time'), true],
    ['maximum free-paced rungs', timing('for_time', { rounds: MAX_SAFE }), true],
    ['maximum scheduled rungs', timing('scheduled_starts', { rounds: MAX_SAFE }), true],
    ['maximum capped rungs', timing('capped_window', { rounds: MAX_SAFE }), true],
    ['minimum interval', timing('scheduled_starts'), true],
    ['maximum interval', timing('scheduled_starts', { interval_seconds: MAX_SAFE }), true],
    ['minimum cap', timing('capped_window'), true],
    ['maximum cap', timing('capped_window', { cap_seconds: MAX_SAFE }), true],
    ['one rung', timing('for_time', { rounds: 1 }), false],
    ['fractional rungs', timing('for_time', { rounds: 2.5 }), false],
    ['null rungs', timing('for_time', { rounds: null }), false],
    ['string rungs', timing('for_time', { rounds: '2' }), false],
    ['zero interval', timing('scheduled_starts', { interval_seconds: 0 }), false],
    ['fractional interval', timing('scheduled_starts', { interval_seconds: 1.5 }), false],
    ['null interval', timing('scheduled_starts', { interval_seconds: null }), false],
    ['zero cap', timing('capped_window', { cap_seconds: 0 }), false],
    ['negative cap', timing('capped_window', { cap_seconds: -1 }), false],
    ['fractional cap', timing('capped_window', { cap_seconds: 1.5 }), false],
    ['null cap', timing('capped_window', { cap_seconds: null }), false],
    ['extra key', { ...timing('for_time'), extra: 1 }, false],
    ['missing nullable key', { mode: 'for_time', rounds: 2, interval_seconds: null }, false],
    ['unknown mode', { ...timing('for_time'), mode: 'unknown' }, false],
    ['free-paced interval', timing('for_time', { interval_seconds: 1 }), false],
    ['scheduled cap', timing('scheduled_starts', { cap_seconds: 1 }), false],
    ['capped interval', timing('capped_window', { interval_seconds: 1 }), false],
    ['array', [], false],
    ['scalar', 'for_time', false],
  ]
  for (const overflow of [MAX_SAFE + 1, MAX_SAFE * 2, 1e20]) {
    shapeCases.push(
      [`round overflow ${overflow}`, timing('for_time', { rounds: overflow }), false],
      [`interval overflow ${overflow}`, timing('scheduled_starts', { interval_seconds: overflow }), false],
      [`cap overflow ${overflow}`, timing('capped_window', { cap_seconds: overflow }), false],
    )
  }

  it.each(shapeCases)('stored timing shape agrees with the unchanged reader: %s', (_label, value, accepted) => {
    expect(timingReader.safeParse(value).success).toBe(accepted)
    expect(storedTimingShape(value)).toBe(accepted)
  })

  it.each([
    ['rounds', timing('for_time', { rounds: MAX_SAFE + 1 })],
    ['interval_seconds', timing('scheduled_starts', { interval_seconds: MAX_SAFE + 1 })],
    ['cap_seconds', timing('capped_window', { cap_seconds: MAX_SAFE + 1 })],
  ])('detects a missing SQL upper-bound guard for %s rather than trusting the reader alone', (_field, value) => {
    const withoutCeilings = migration.replace(
      /(?:or|and) \(ladder_timing ->> '(?:rounds|interval_seconds|cap_seconds)'\)::numeric (?:>|<=) 9007199254740991/g,
      '',
    )
    expect(storedTimingShape(value, withoutCeilings)).toBe(true)
    expect(storedTimingShape(value)).toBe(false)
    expect(timingReader.safeParse(value).success).toBe(false)
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
