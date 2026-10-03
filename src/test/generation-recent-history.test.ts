import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { ErrorCode, createError, err } from '../state/errors'
import { createLogger, type LogSink } from '../state/logger'
import type { GenerationRequest } from '../state/schemas'
import { sectionFixture } from './generation-prompt-fixtures'
import {
  createGenerationDatabase,
  performGeneration,
  type GenerationDatabase,
} from '../../supabase/functions/_shared/generate.ts'
import { buildUserMessage, type PromptInput } from '../../supabase/functions/_shared/prompt.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const NEWER = '22222222-2222-4222-8222-222222222222'
const OLDER = '33333333-3333-4333-8333-333333333333'
const FOREIGN = '44444444-4444-4444-8444-444444444444'
const PRESCRIPTION = '55555555-5555-4555-8555-555555555555'
const LOG = '66666666-6666-4666-8666-666666666666'
const REQUEST_ID = 'req_history_reader'
const PROJECT = 'https://reader.invalid'

function performed(exercise: string, session = NEWER, overrides: Record<string, unknown> = {}) {
  return {
    id: PRESCRIPTION,
    exercise_id: exercise,
    execution_status: 'completed',
    workout_blocks: { workout_sections: { session_id: session } },
    exercise_set_logs: [{ id: LOG }],
    ...overrides,
  }
}

function reader(overrides: Record<string, unknown | Response> = {}) {
  const calls: { url: URL; init: RequestInit | undefined }[] = []
  const lines: string[] = []
  const replies: Record<string, unknown | Response> = {
    workout_sessions: [
      { id: NEWER, session_focus: 'lower_body' },
      { id: OLDER, session_focus: 'upper_body' },
    ],
    workout_exercises: [
      performed('back-squat'),
      performed('back-squat'), // A second slot is not a second training day.
      performed('deadlift'),
      performed('back-squat', OLDER),
      performed('bench-press', OLDER),
    ],
    exercise_catalog: [
      { id: 'back-squat', movement_patterns: ['squat'] },
      { id: 'bench-press', movement_patterns: ['press'] },
      { id: 'deadlift', movement_patterns: ['hinge', 'squat'] },
    ],
    profiles: [{ experience_level: 'some' }],
    ...overrides,
  }
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    const reply = replies[url.pathname.replace('/rest/v1/', '')]
    if (reply instanceof Error) throw reply
    return reply instanceof Response ? reply : Response.json(reply ?? [], { status: 200 })
  }
  return {
    calls,
    lines,
    db: createGenerationDatabase({
      url: PROJECT,
      anonKey: 'public-reader-key',
      accessToken: 'reader-only-test-token',
      fetch,
      logger: createLogger({ scope: 'reader-test', sink: { write: (_level, line) => void lines.push(line) } }),
    }),
  }
}

describe('authenticated generation recent-history reader', () => {
  it('reads real logged exercise IDs and counts patterns once per observed completed session', async () => {
    const { db, calls } = reader()
    expect(await db.recentHistory(USER)).toEqual({
      ok: true,
      value: {
        focuses: ['lower_body', 'upper_body'],
        patterns: [
          { pattern: 'squat', count: 2 },
          { pattern: 'hinge', count: 1 },
          { pattern: 'press', count: 1 },
        ],
        exerciseIds: ['back-squat', 'deadlift', 'bench-press'],
      },
    })
    expect(calls.map(({ url }) => url.pathname)).toEqual([
      '/rest/v1/workout_sessions', '/rest/v1/workout_exercises', '/rest/v1/exercise_catalog',
    ])
    const [sessions, engagement, catalog] = calls.map(({ url }) => url.searchParams)
    expect(sessions.get('user_id')).toBe(`eq.${USER}`)
    expect(sessions.get('completed_at')).toBe('not.is.null')
    expect(sessions.get('select')).toBe('id,session_focus')
    expect(sessions.get('order')).toBe('completed_at.desc,id.asc')
    expect(sessions.get('limit')).toBe('8')
    expect(engagement.get('workout_blocks.workout_sections.session_id')).toBe(
      `in.("${NEWER}","${OLDER}")`,
    )
    expect(engagement.get('select')).toBe(
      'id,exercise_id,execution_status,workout_blocks!inner(workout_sections!inner(session_id)),exercise_set_logs!inner(id)',
    )
    expect(engagement.get('execution_status')).toBe('neq.skipped')
    expect(engagement.get('exercise_set_logs.limit')).toBe('1')
    expect(engagement.get('limit')).toBe('256')
    expect(catalog.get('select')).toBe('id,movement_patterns')
    expect(catalog.get('limit')).toBe('256')
    for (const { init } of calls) {
      expect(init?.method).toBe('GET')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer reader-only-test-token')
    }
  })

  it('does not count skipped, unlogged or timer-only prescriptions as exercise engagement', async () => {
    const { db, calls } = reader({
      workout_exercises: [
        performed('back-squat', NEWER, { execution_status: 'skipped' }),
        performed('deadlift', NEWER, { exercise_set_logs: [] }),
        performed('row', NEWER, { exercise_set_logs: [], elapsed_seconds: 300, rounds_completed: 5 }),
      ],
    })
    expect(await db.recentHistory(USER)).toEqual({
      ok: true,
      value: { focuses: ['lower_body', 'upper_body'], patterns: [], exerciseIds: [] },
    })
    expect(calls).toHaveLength(2)
  })

  it('retains actual logged work from a superseded prescription, not its unlogged replacement', async () => {
    const { db, calls } = reader({
      workout_exercises: [
        performed('back-squat', NEWER, { revision_status: 'superseded' }),
        performed('deadlift', NEWER, { revision_status: 'active', exercise_set_logs: [] }),
      ],
      exercise_catalog: [{ id: 'back-squat', movement_patterns: ['squat'] }],
    })
    const result = await db.recentHistory(USER)
    expect(result).toMatchObject({
      ok: true, value: { exerciseIds: ['back-squat'], patterns: [{ pattern: 'squat', count: 1 }] },
    })
    expect(calls[1].url.searchParams.has('revision_status')).toBe(false)
  })

  it('does not read prescriptions or catalog data when there are no completed sessions', async () => {
    const { db, calls } = reader({ workout_sessions: [] })
    expect(await db.recentHistory(USER)).toEqual({
      ok: true, value: { focuses: [], patterns: [], exerciseIds: [] },
    })
    expect(calls).toHaveLength(1)
  })

  it('bounds the compact ID context even when the observed snapshot has more exercises', async () => {
    const ids = Array.from({ length: 60 }, (_, index) => `exercise-${String(index).padStart(2, '0')}`)
    const { db } = reader({
      workout_exercises: ids.map((id) => performed(id)),
      exercise_catalog: ids.map((id) => ({ id, movement_patterns: ['squat'] })),
    })
    const result = await db.recentHistory(USER)
    expect(result).toMatchObject({ ok: true, value: { patterns: [{ pattern: 'squat', count: 1 }] } })
    if (result.ok) expect(result.value.exerciseIds).toEqual(ids.slice(0, 40))
  })

  it.each([
    ['invalid session ID', { workout_sessions: [{ id: 'not-a-uuid', session_focus: 'lower_body' }] }],
    ['unknown focus', { workout_sessions: [{ id: NEWER, session_focus: 'unknown-focus' }] }],
    ['duplicate session', { workout_sessions: Array(2).fill({ id: NEWER, session_focus: 'lower_body' }) }],
    ['excess sessions', { workout_sessions: Array(9).fill({ id: NEWER, session_focus: 'lower_body' }) }],
    ['foreign session', { workout_exercises: [performed('back-squat', FOREIGN)] }],
    ['invalid prescription ID', { workout_exercises: [performed('back-squat', NEWER, { id: 'not-a-uuid' })] }],
    ['blank exercise ID', { workout_exercises: [performed(' ', NEWER)] }],
    ['invalid log ID', { workout_exercises: [performed('back-squat', NEWER, { exercise_set_logs: [{ id: 'invalid' }] })] }],
    ['unknown status', { workout_exercises: [performed('back-squat', NEWER, { execution_status: 'imaginary' })] }],
    ['excess prescriptions', { workout_exercises: Array(257).fill(performed('back-squat')) }],
    ['foreign catalog ID', { exercise_catalog: [{ id: 'foreign-exercise', movement_patterns: ['squat'] }] }],
    ['unknown pattern', { exercise_catalog: [{ id: 'back-squat', movement_patterns: ['imaginary'] }] }],
    ['missing catalog rows', { exercise_catalog: [] }],
    ['invalid catalog response', { exercise_catalog: {} }],
  ])('fails safely for %s', async (_label, overrides) => {
    const { db } = reader(overrides)
    expect(await db.recentHistory(USER)).toMatchObject({
      ok: false, error: { code: ErrorCode.PERSISTENCE_READ_FAILED },
    })
  })

  it('returns only typed failure details when an authenticated read fails', async () => {
    const raw = 'private-reader-body-must-not-escape'
    const { db } = reader({ workout_exercises: Response.json({ message: raw }, { status: 403 }) })
    const result = await db.recentHistory(USER)
    expect(result).toMatchObject({
      ok: false,
      error: { code: ErrorCode.PERSISTENCE_READ_FAILED, details: { source: 'workout_exercises', status: 403 } },
    })
    expect(JSON.stringify(result)).not.toContain(raw)
  })

  for (const source of ['workout_exercises', 'exercise_catalog']) {
    it.each([
      { label: 'network exception', reply: new Error('private transport body'), code: ErrorCode.NETWORK_SERVER_ERROR },
      { label: 'HTTP 500', reply: Response.json({ message: 'private server body' }, { status: 500 }), code: ErrorCode.PERSISTENCE_READ_FAILED },
      { label: 'HTTP 503', reply: Response.json({ message: 'private server body' }, { status: 503 }), code: ErrorCode.PERSISTENCE_READ_FAILED },
    ])(`retains known focuses but omits unknown IDs/patterns on ${source} $label`, async ({ reply, code }) => {
      const { db, calls, lines } = reader({ [source]: reply })
      expect(await db.recentHistory(USER)).toEqual({
        ok: true, value: { focuses: ['lower_body', 'upper_body'], patterns: [], exerciseIds: [] },
      })
      expect(calls).toHaveLength(source === 'workout_exercises' ? 2 : 3)
      const warning = JSON.parse(lines[0]) as Record<string, unknown>
      expect(warning).toEqual({
        source, code, scope: 'reader-test', level: 'warn',
        msg: 'generation soft history unavailable; using known focuses only', time: expect.any(String),
      })
      expect(lines).toHaveLength(1)
      for (const privateValue of ['private', USER, NEWER, 'back-squat', 'reader-only-test-token', 'public-reader-key']) {
        expect(lines.join('\n')).not.toContain(privateValue)
      }
    })

    it.each([400, 401, 403, 404, 408, 429])(`still fails closed on ${source} HTTP %s`, async (status) => {
      const { db, lines } = reader({ [source]: Response.json({ message: 'private rejection' }, { status }) })
      expect(await db.recentHistory(USER)).toMatchObject({
        ok: false, error: { code: ErrorCode.PERSISTENCE_READ_FAILED, details: { source, status } },
      })
      expect(lines).toEqual([])
    })

    it(`still fails closed on ${source} malformed successful JSON`, async () => {
      const { db, lines } = reader({ [source]: new Response('not-json', { status: 200 }) })
      expect(await db.recentHistory(USER)).toMatchObject({
        ok: false, error: { code: ErrorCode.PERSISTENCE_READ_FAILED },
      })
      expect(lines).toEqual([])
    })
  }

  it.each([
    { reply: new Error('private prior-reader failure') },
    { reply: Response.json({ message: 'private prior-reader failure' }, { status: 503 }) },
  ])('preserves the existing focus-read failure policy', async ({ reply }) => {
    const { db, calls, lines } = reader({ workout_sessions: reply })
    expect(await db.recentHistory(USER)).toMatchObject({ ok: false })
    expect(calls).toHaveLength(1)
    expect(lines).toEqual([])
  })

  it('uses the canonical FK lineage rather than a view that includes phantom active work', () => {
    const execution = readFileSync(
      'supabase/migrations/20260921000004_execution_domain.sql', 'utf8',
    )
    expect(execution).toContain('foreign key (workout_exercise_id, prescription_revision_status)')
    expect(execution).toContain('references public.workout_exercises (id, revision_status)')
    expect(execution).toContain('on update cascade')
    expect(execution).toContain('One set the user engaged with.')
    expect(execution).toContain("and we.revision_status = 'active'")
  })
})

describe('saved experience reader and real prompt wiring', () => {
  it.each(['new', 'some', 'confident'])('reads only the saved known %s value', async (experience) => {
    const { db, calls } = reader({ profiles: [{ experience_level: experience }] })
    expect(await db.experience?.(USER)).toEqual({ ok: true, value: experience })
    expect(calls).toHaveLength(1)
    expect(calls[0].url.pathname).toBe('/rest/v1/profiles')
    expect(calls[0].url.searchParams.get('id')).toBe(`eq.${USER}`)
    expect(calls[0].url.searchParams.get('select')).toBe('experience_level')
    expect(calls[0].url.searchParams.get('limit')).toBe('1')
  })

  it.each([{ profiles: [] }, { profiles: [{ experience_level: null }] }])('does not invent experience for %j', async ({ profiles }) => {
    expect(await reader({ profiles }).db.experience?.(USER)).toEqual({ ok: true, value: null })
  })

  it.each([
    { profiles: {} },
    { profiles: [{ experience_level: 'expert' }] },
    { profiles: [{}] },
    { profiles: [null] },
    { profiles: [{ experience_level: 'new' }, { experience_level: 'some' }] },
  ])(
    'refuses malformed saved experience %j', async ({ profiles }) => {
      expect(await reader({ profiles }).db.experience?.(USER)).toMatchObject({
        ok: false, error: { code: ErrorCode.PERSISTENCE_READ_FAILED },
      })
    },
  )

  const request: GenerationRequest = {
    request_id: REQUEST_ID, goal: 'strength', focus: 'lower_body', date: '2026-10-03',
    requested_intensity: 7, requested_duration_mins: 45, location_id: FOREIGN, notes: null, deload: false,
  }

  async function observedInput(db: GenerationDatabase) {
    const inputs: PromptInput[] = []
    const lines: string[] = []
    const sink: LogSink = { write: (_level, line) => void lines.push(line) }
    const result = await performGeneration(request, {
      userId: USER, requestId: REQUEST_ID, logger: createLogger({ scope: 'generation-test', sink }),
    }, {
      db: {
        ...db,
        candidates: async () => ({ ok: true, value: [sectionFixture('primary_lift', ['back-squat'])] }),
      },
      catalog: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
      composer: () => ({ compose: async (input) => {
        inputs.push(input)
        return err(createError(ErrorCode.GENERATION_FAILED))
      } }),
    })
    return { inputs, lines, result }
  }

  it('carries authenticated real-reader experience and observed history into the existing prompt', async () => {
    const { db } = reader()
    const { inputs, lines } = await observedInput(db)
    expect(inputs).toHaveLength(1)
    const [input] = inputs
    expect(input.experience).toBe('some')
    const prompt = buildUserMessage(input)
    expect(prompt).toContain('experience: some')
    expect(prompt).toContain('patterns: squat(2) hinge(1) press(1)')
    expect(prompt).toContain('recent_exercise_ids: back-squat, deadlift, bench-press')
    // Historical IDs are preferences, not additions to the eligible set.
    expect(input.sections).toEqual([sectionFixture('primary_lift', ['back-squat'])])
    expect(lines.join('\n')).not.toContain('back-squat')
    expect(lines.join('\n')).not.toContain('experience')
    expect(lines.join('\n')).not.toContain('reader-only-test-token')
  })

  it('does not compose after a malformed saved experience read', async () => {
    const { result, inputs } = await observedInput(reader({ profiles: [{ experience_level: 'invented' }] }).db)
    expect(result).toMatchObject({ ok: false, error: { code: ErrorCode.PERSISTENCE_READ_FAILED } })
    expect(inputs).toEqual([])
  })

  it.each([
    { label: 'network exception', reply: new Error('private experience transport'), code: ErrorCode.NETWORK_SERVER_ERROR },
    { label: 'HTTP 503', reply: Response.json({ message: 'private experience body' }, { status: 503 }), code: ErrorCode.PERSISTENCE_READ_FAILED },
  ])('omits unknown experience after $label without inventing a default', async ({ reply, code }) => {
    const { inputs, lines } = await observedInput(reader({ profiles: reply }).db)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).not.toHaveProperty('experience')
    expect(buildUserMessage(inputs[0])).not.toContain('experience:')
    expect(inputs[0].history.focuses).toEqual(['lower_body', 'upper_body'])
    const warnings = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line.level === 'warn')
    expect(warnings).toEqual([{
      source: 'profiles', code, scope: 'generation-test', level: 'warn',
      msg: 'generation saved experience unavailable; omitting unknown context', time: expect.any(String),
    }])
    for (const privateValue of ['private', USER, 'back-squat', 'reader-only-test-token', 'public-reader-key']) {
      expect(JSON.stringify(warnings)).not.toContain(privateValue)
    }
  })

  it.each([400, 401, 403, 404, 408, 429])('does not compose around saved-experience HTTP %s', async (status) => {
    const { result, inputs, lines } = await observedInput(reader({
      profiles: Response.json({ message: 'private experience rejection' }, { status }),
    }).db)
    expect(result).toMatchObject({
      ok: false, error: { code: ErrorCode.PERSISTENCE_READ_FAILED, details: { source: 'profiles', status } },
    })
    expect(inputs).toEqual([])
    expect(lines).toEqual([])
  })

  it('keeps older injected readers compatible without defaulting their experience', async () => {
    const db = reader({ workout_sessions: [] }).db
    const older = { ...db }
    delete older.experience
    const { inputs } = await observedInput(older)
    expect(inputs).toHaveLength(1)
    expect(inputs[0].experience).toBeNull()
    expect(buildUserMessage(inputs[0])).not.toContain('experience:')
  })
})
