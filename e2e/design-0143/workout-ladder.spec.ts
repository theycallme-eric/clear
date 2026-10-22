import { createHash } from 'node:crypto'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { MOBILE_VIEWPORT } from '../../playwright.config'
import { blockResultRowSchema, CONTRACT_VERSION, type LadderTiming } from '../../src/state/schemas'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, fixtureId, reconstructionFixture, snapshotFixture, type SnapshotFixture } from '../../src/test/workout-double'
import { expect, test as base } from '../fixtures'
import { backend } from '../support/backend'
import { installDeterministicCapture } from './fixtures'

/**
 * REQ-018 / E03 / TASK-033 / JOURNEY-029 — explicitly timed ladders on a phone.
 *
 * The real app on its real `/workout` route at 390×844, behind its real guards.
 * One session carries all three timing modes, each with its own round count and
 * interval or cap — none of them five rounds or three minutes:
 *
 *   · a **scheduled** ladder, four rounds starting every 1:15, a rising rung and
 *     fixed companion work — each round shows its start, its target and the
 *     companion already worked out, the live round follows the block's own
 *     clock through a background and a refresh, and the global session clock
 *     keeps counting untouched;
 *   · a **free-paced For Time** ladder, three rounds under a 10:00 block cap —
 *     no live round, no schedule and no clock-driven progress however long
 *     passes; the athlete declares how it ended;
 *   · a **capped window**, three rounds inside one 6:00 cap — the cap is
 *     stated, and how far the athlete got is theirs to say.
 *
 * Every model POST is intercepted in the browser and never forwarded. In the
 * trusted integration run the session is a genuine one for a disposable
 * namespaced user, persisted through the real `persist_session` RPC and read
 * back through the real snapshot RPCs; public CI without the service-role
 * credential runs the same journey against a schema-shaped, fully intercepted
 * API and labels its report hermetic. Neither mode skips, and neither relaxes
 * a UI or result assertion.
 *
 * The trusted run first asks the hosted schema whether `workout_blocks` has the
 * `ladder_timing` column (TASK-039's append-only migration). Where it does, the
 * timing makes the full round trip and the stored value is asserted. Where the
 * hosted database has not had that migration applied, the stored timing cannot
 * come back from it, so the same values are added to the real snapshot
 * responses in the browser and the report says exactly that — it is then proof
 * of the screen against real rows, not of timing persistence.
 *
 * What it proves, against the rows the shared progression action wrote: no
 * set-entry form or exertion prompt in any phase; a failed save keeps the
 * athlete on the section with every declaration intact, and the retry writes
 * one row per block that reaches Summary; no row carries elapsed time, rounds
 * or minutes the clock alone produced; the only `highest_rung` values stored
 * are the ones the athlete declared.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const SESSION_KEY = 'clear.auth.session'
const FOR_TIME_STORAGE_KEY = 'clear.workout-for-time'
const TITLE = 'TASK-033 timed ladders'

/** Four rounds, a new one every 75 s: the block runs 300 s. */
const SCHEDULED: LadderTiming = { mode: 'scheduled_starts', rounds: 4, interval_seconds: 75, cap_seconds: null }
const SCHEDULED_RUNGS = [5, 7, 9, 11]
const COMPANION_REPS = 6
/** Three free-paced rounds under the block's own 600 s cap. */
const FREE_PACED: LadderTiming = { mode: 'for_time', rounds: 3, interval_seconds: null, cap_seconds: null }
const FREE_PACED_RUNGS = [15, 10, 5]
const FREE_PACED_CAP = 600
/** Three rounds inside one 360 s cap for the whole ladder. */
const CAPPED: LadderTiming = { mode: 'capped_window', rounds: 3, interval_seconds: null, cap_seconds: 360 }
const CAPPED_RUNGS = [4, 8, 12]

type Catalogued = { id: string; default_equipment: string }
type Answer = { ok: boolean; status: number; body: unknown }
type BlockResult = {
  block_id: string
  highest_rung: number | null
  elapsed_seconds: number | null
  completed_under_cap: boolean | null
  rounds_completed: number | null
  minutes_completed: number | null
  perceived_effort: number | null
}
type TimedBlocks = { scheduled: string; freePaced: string; capped: string }

/** Never put an admin response body, actor, token or email into an assertion. */
function must<T>(answer: Answer, operation: string): T {
  expect(answer.ok, `${operation}: HTTP status ${answer.status}`).toBe(true)
  return answer.body as T
}

/** The movement's name as the app humanises a catalog slug. */
const display = (id: string) => id.replaceAll('-', ' ').replaceAll('_', ' ')

function prescription(exercise: Catalogued, overrides: Record<string, unknown> = {}) {
  return {
    exercise_id: exercise.id, equipment: exercise.default_equipment, session_function: 'conditioning',
    anchor_relationship: 'neutral', modality: 'reps', sets: null, target_kind: 'fixed', target_value: 12,
    target_min: null, target_max: null, target_sequence: null, per_side: false, distance_unit: null,
    rest_seconds: null, tempo: null, load_type: 'none', load_value: null, is_interval_exercise: false,
    ...overrides,
  }
}

const sequence = (exercise: Catalogued, rungs: number[]) =>
  prescription(exercise, { target_kind: 'sequence', target_value: null, target_sequence: rungs })

/** The three timed ladders in one conditioning section, then a short cooldown. */
function ladderSession(catalog: Catalogued[], locationId: string | null) {
  const [laddered, companion] = catalog
  const block = (overrides: Record<string, unknown>) => ({
    structure_type: 'for_time', rounds: null, timer_type: 'countdown', round_rest_seconds: null,
    block_notes: null, ...overrides,
  })
  return {
    date: new Date().toISOString().slice(0, 10), location_id: locationId, session_focus: 'full_body',
    goal_preset: 'balanced', requested_duration_mins: 30, effective_duration_target_mins: 30,
    computed_duration_mins: null, requested_intensity: 5, effective_intensity: 5, adjustment_reason: null,
    generation_notes: null, prompt_version: 'e2e', contract_version: CONTRACT_VERSION,
    workout: {
      title: TITLE, overview: null, estimated_duration_mins: 30,
      sections: [
        {
          section_type: 'conditioning', section_title: 'Ladders', section_notes: null,
          blocks: [
            block({
              timer_seconds: 300, rep_scheme: 'ladder_fixed_interval', ladder_timing: SCHEDULED,
              exercises: [sequence(laddered, SCHEDULED_RUNGS), prescription(companion, { target_value: COMPANION_REPS })],
            }),
            block({
              timer_seconds: FREE_PACED_CAP, rep_scheme: 'ladder_down', ladder_timing: FREE_PACED,
              exercises: [sequence(laddered, FREE_PACED_RUNGS)],
            }),
            block({
              timer_seconds: 360, rep_scheme: 'ladder_up', ladder_timing: CAPPED,
              exercises: [sequence(companion, CAPPED_RUNGS)],
            }),
          ],
        },
        {
          section_type: 'cooldown', section_title: 'Cooldown', section_notes: null,
          blocks: [{
            structure_type: 'standard', rounds: null, timer_type: 'none', timer_seconds: null,
            round_rest_seconds: null, rep_scheme: 'fixed', block_notes: null,
            exercises: [prescription(laddered, { sets: 1, target_value: 8 })],
          }],
        },
      ],
    },
  }
}

/**
 * Adds each block's timing to every block row in an API answer, wherever it
 * sits. Used only by the labelled hermetic public-preview fixture, whose
 * shared builders carry no timing column. Trusted responses are never augmented.
 */
function withTimings<T>(value: T, timings: ReadonlyMap<string, LadderTiming>): T {
  if (Array.isArray(value)) return value.map((item) => withTimings(item, timings)) as T
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(record)) next[key] = withTimings(child, timings)
  const timing = typeof record.id === 'string' && 'structure_type' in record ? timings.get(record.id) : undefined
  if (timing !== undefined) next.ladder_timing = timing
  return next as T
}

interface World {
  readonly catalog: Catalogued[]
  readonly blocks: TimedBlocks
  blockResults(): Promise<BlockResult[]>
  ladderSetLogs(): Promise<unknown[]>
  sessionState(): Promise<string>
  /** Real stored timing in trusted mode; fixture contract values in hermetic mode. */
  storedTimings(): Promise<Record<string, unknown>>
}

/**
 * Public-preview contract coverage, not evidence about the hosted database.
 * Reuse the existing typed builders; all data requests stay inside this test,
 * unexpected requests fail, and stored observations come only from actual app
 * POST bodies. The trusted mode below continues to prove real saved rows.
 */
async function publicPreviewWorld(page: Page) {
  const owner = '00000000-0000-4000-8000-000000000033'
  const catalog = [
    { id: 'dumbbell-thruster', default_equipment: 'dumbbells' },
    { id: 'kettlebell-swing', default_equipment: 'kettlebell' },
  ]
  const [laddered, companion] = catalog
  const rows: ReturnType<typeof blockResultRowSchema.parse>[] = []
  const unexpected: string[] = []
  let completedAt: string | null = null
  const sequenceFixture = (exercise: Catalogued, rungs: number[]) => ({ prescription: {
    exercise_id: exercise.id, equipment_used: exercise.default_equipment, sets: null,
    target_kind: 'sequence' as const, target_value: null, target_sequence: rungs,
  } })
  const fixture: SnapshotFixture = {
    userId: owner, sessionId: fixtureId('5', 33), title: TITLE,
    startedAt: new Date().toISOString(),
    sections: [
      { sectionType: 'conditioning', title: 'Ladders', blocks: [
        { structureType: 'for_time', timerType: 'countdown', timerSeconds: 300, repScheme: 'ladder_fixed_interval',
          exercises: [sequenceFixture(laddered, SCHEDULED_RUNGS), { prescription: {
            exercise_id: companion.id, equipment_used: companion.default_equipment, sets: null, target_value: COMPANION_REPS,
          } }] },
        { structureType: 'for_time', timerType: 'countdown', timerSeconds: FREE_PACED_CAP, repScheme: 'ladder_down',
          exercises: [sequenceFixture(laddered, FREE_PACED_RUNGS)] },
        { structureType: 'for_time', timerType: 'countdown', timerSeconds: 360, repScheme: 'ladder_up',
          exercises: [sequenceFixture(companion, CAPPED_RUNGS)] },
      ] },
      { sectionType: 'cooldown', title: 'Cooldown', blocks: [{
        exercises: [{ prescription: { exercise_id: laddered.id, equipment_used: laddered.default_equipment, sets: 1, target_value: 8 } }],
      }] },
    ],
  }
  const currentFixture = (): SnapshotFixture => ({ ...fixture,
    state: completedAt === null ? 'active' : 'completed',
    session: { completed_at: completedAt, actual_duration_mins: completedAt === null ? null : 9 },
  })
  const [scheduled, freePaced, capped] = snapshotFixture(currentFixture()).sections[0].blocks.map((b) => b.block.id)
  const blocks: TimedBlocks = { scheduled, freePaced, capped }
  const timings = new Map<string, LadderTiming>([[scheduled, SCHEDULED], [freePaced, FREE_PACED], [capped, CAPPED]])
  const snapshot = () => withTimings(snapshotFixture(currentFixture()), timings)
  const reconstruction = () => {
    const value = withTimings(reconstructionFixture(currentFixture()), timings)
    return { ...value, sections: value.sections.map((section) => ({ ...section,
      blocks: section.blocks.map((block) => ({ ...block,
        block_result: rows.find((row) => row.block_id === block.block.id) ?? null,
      })),
    })) }
  }
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: owner })])
      if (name === 'locations') return reply([fixtureLocation({ user_id: owner })])
      if (name === 'workout_sessions') return reply([snapshot().session])
      if (name === 'exercise_definitions') return reply(catalog.map((e) => definitionFixture({ id: e.id })))
      if (name === 'workout_exercises') return reply(snapshot().sections.flatMap((s) => s.blocks.flatMap((b) => b.exercises.map((e) => e.exercise))))
      if (['load_anchors', 'location_equipment', 'saved_workout_attempts', 'saved_workouts', 'rest_days'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(snapshot())
      if (name === 'session_as_performed') return reply(reconstruction())
      if (name === 'complete_session') {
        completedAt = new Date().toISOString()
        return reply({ outcome: 'completed', state: 'completed', session: snapshot().session })
      }
      if (name === 'streak_sessions') return reply(completedAt === null ? [] : [{
        session_id: fixture.sessionId, completed_at: completedAt, counts_for_streak: true,
      }])
      if (['constraints_in_force', 'conditioning_history', 'anchor_evidence', 'set_load_anchors'].includes(name)) return reply([])
      if (name === 'record_favorite_completion') return reply({ outcome: 'not_a_favorite' })
    }
    if (request.method() === 'POST' && name === 'block_results') {
      const inserts: unknown = request.postDataJSON()
      const list = (Array.isArray(inserts) ? inserts : [inserts]) as Record<string, unknown>[]
      const parsed = list.map((insert, index) => blockResultRowSchema.parse({
        elapsed_seconds: null, completed_under_cap: null, rounds_completed: null,
        partial_round_reps: null, minutes_completed: null, highest_rung: null,
        perceived_effort: null, notes: null, ...insert,
        id: fixtureId('9', rows.length + index + 1), created_at: new Date().toISOString(),
      }))
      if (parsed.some((row) => rows.some((old) => old.block_id === row.block_id))) {
        return reply({ code: '23505', message: 'Duplicate fixture block result' }, 409)
      }
      rows.push(...parsed)
      return reply(parsed, 201)
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected public-preview fixture request' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.addInitScript(({ key, user }) => localStorage.setItem(key, JSON.stringify({
    accessToken: 'synthetic-preview-session', refreshToken: 'synthetic-preview-refresh',
    expiresAt: Date.now() + 60 * 60 * 1000, user: { id: user, email: 'synthetic-preview@example.invalid' },
  })), { key: SESSION_KEY, user: owner })
  const world: World = {
    catalog, blocks,
    blockResults: async () => rows,
    ladderSetLogs: async () => [],
    sessionState: async () => completedAt === null ? 'active' : 'completed',
    storedTimings: async () => Object.fromEntries(timings),
  }
  return { world, assertRequests: () => expect(unexpected).toEqual([]) }
}

function proofMode(testInfo: TestInfo, description: string) {
  testInfo.annotations.push({ type: 'proof-mode', description })
}

const test = base.extend<{ world: World; modelPosts: () => number }>({
  // Provider interception: no model request leaves the browser, and the count
  // is asserted, so nothing here is live generation.
  modelPosts: async ({ page }, use) => {
    const guard = await installDeterministicCapture(page, { skin: 'clear' })
    await use(guard.blockedGenerations)
  },

  world: async ({ page }, use, testInfo) => {
    if (process.env.CI && !backend.available) {
      proofMode(testInfo, 'Hermetic public-preview API contract; no hosted-backend proof or credentials.')
      const fixture = await publicPreviewWorld(page)
      try { await use(fixture.world) } finally { fixture.assertRequests() }
      return
    }
    // A missing integration credential is a failure, never a skipped proof.
    expect(backend.available, backend.reason).toBe(true)
    const client = backend.client()
    const catalog = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
      select: 'id,default_equipment', default_equipment: 'neq.bodyweight', order: 'id.asc', limit: '2',
    }), 'Fixture catalog read')
    expect(catalog).toHaveLength(2)

    // A zero-row read checks the real hosted column without reading an athlete.
    // Missing columns, permissions and service errors fail closed, never overlay.
    must(await client.selectAsService('workout_blocks', {
      select: 'id,ladder_timing', limit: '0',
    }), 'Hosted timing boundary read')
    proofMode(testInfo, 'Trusted namespaced disposable-account integration; ladder timing persisted and restored by the hosted backend; real rows and cleanup.')

    const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
    const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t033-${suffix}@example.com`
    let userId: string | null = null
    let token: string
    let refreshToken: string
    try {
      const prior = await client.findUserByEmail(email)
      if (prior) await client.deleteUser(prior.id)
      const created = await client.ensureConfirmedUser(email)
      userId = created.id
      const session = await client.mintSession(email)
      token = session.accessToken
      refreshToken = session.refreshToken
    } catch {
      if (userId !== null) await client.deleteUser(userId).catch(() => undefined)
      throw new Error('TASK-033 namespaced fixture authentication failed; no response body retained.')
    }
    if (userId === null) throw new Error('TASK-033 fixture user was not created.')
    const owner = userId

    try {
      must(await client.rpcAs('complete_onboarding', {
        p_location_name: 'TASK-033 gym', p_location_tier: 'full',
        p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((e) => e.default_equipment)])],
        p_experience_level: 'some', p_goal_preset: 'balanced',
        p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
      }, token), 'Fixture onboarding')
      const [location] = must<Array<{ id: string }>>(await client.selectAsService('locations', {
        select: 'id', user_id: `eq.${owner}`, limit: '1',
      }), 'Fixture location read')
      const persisted = must<{ session: { id: string } }>(await client.rpcAs('persist_session', {
        p_user_id: owner, p_session: ladderSession(catalog, location?.id ?? null),
      }, token), 'Fixture persistence')
      const sessionId = persisted.session.id
      const started = must<{ outcome: string }>(await client.rpcAs('start_session', {
        p_session_id: sessionId }, token), 'Fixture start')
      expect(started.outcome).toBe('started')

      const sections = must<Array<{ id: string; section_type: string }>>(
        await client.selectAsService('workout_sections', {
          select: 'id,section_type', session_id: `eq.${sessionId}`,
        }), 'Fixture section read')
      const conditioning = sections.find((section) => section.section_type === 'conditioning')
      if (conditioning === undefined) throw new Error('TASK-033 fixture has no conditioning section.')
      const blockRows = must<Array<{ id: string; section_id: string; order_index: number }>>(
        await client.selectAsService('workout_blocks', {
          select: 'id,section_id,order_index', section_id: `in.(${sections.map((s) => s.id).join(',')})`,
        }), 'Fixture block read')
      const [scheduled, freePaced, capped] = blockRows
        .filter((block) => block.section_id === conditioning.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((block) => block.id)
      if (capped === undefined) throw new Error('TASK-033 fixture is missing a timed ladder block.')
      const blocks: TimedBlocks = { scheduled, freePaced, capped }
      const exercises = must<Array<{ id: string }>>(await client.selectAsService('workout_exercises', {
        select: 'id', block_id: `in.(${[scheduled, freePaced, capped].join(',')})`,
      }), 'Fixture prescription read')
      expect(exercises).toHaveLength(4)

      await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
        key: SESSION_KEY, session: { accessToken: token, refreshToken,
          expiresAt: Date.now() + 60 * 60 * 1000, user: { id: owner, email } },
      })

      await use({
        catalog, blocks,
        blockResults: async () => must<BlockResult[]>(await client.selectAsService('block_results', {
          select: 'block_id,highest_rung,elapsed_seconds,completed_under_cap,rounds_completed,minutes_completed,perceived_effort',
          block_id: `in.(${blockRows.map((b) => b.id).join(',')})`,
        }), 'Block result read'),
        ladderSetLogs: async () => must<unknown[]>(await client.selectAsService('exercise_set_logs', {
          select: 'id', workout_exercise_id: `in.(${exercises.map((e) => e.id).join(',')})`,
        }), 'Set log read'),
        sessionState: async () => must<{ state: string }>(await client.rpcAs('session_snapshot', {
          p_session_id: sessionId }, token), 'Snapshot read').state,
        storedTimings: async () => {
          const stored = must<Array<{ id: string; ladder_timing: unknown }>>(
            await client.selectAsService('workout_blocks', {
              select: 'id,ladder_timing', id: `in.(${[scheduled, freePaced, capped].join(',')})`,
            }), 'Stored timing read')
          return Object.fromEntries(stored.map((row) => [row.id, row.ladder_timing]))
        },
      })
    } finally {
      await client.deleteUser(owner).catch(() => {
        throw new Error('TASK-033 scoped fixture cleanup failed.')
      })
    }
  },
})

test.use({ timezoneId: 'UTC' })

// ── Reading the screen ───────────────────────────────────────────────────

/** The `n`th timed ladder's round list, in the order the section prescribes. */
function rounds(page: Page, index: number): Locator {
  return page.getByRole('list', { name: 'Rounds in this ladder', exact: true }).nth(index)
}

function round(page: Page, ladder: number, number: number): Locator {
  return rounds(page, ladder).getByRole('listitem').filter({
    has: page.getByRole('heading', { name: `Round ${number}`, exact: true }),
  })
}

/** The `n`th ladder's ending question. */
function ending(page: Page, index: number): Locator {
  return page.getByRole('group', { name: 'How did this block end?', exact: true }).nth(index)
}

/** Nothing on the screen asks for a set, a number or an exertion. */
async function expectHandsOff(page: Page) {
  const main = page.locator('main')
  await expect(main.getByRole('form', { name: /^Log set/ })).toHaveCount(0)
  await expect(main.getByRole('spinbutton')).toHaveCount(0)
  await expect(main.getByRole('slider')).toHaveCount(0)
  await expect(main.getByRole('button', { name: /round done|log set/i })).toHaveCount(0)
  await expect(main.getByText(/\bRPE\b|exertion|how hard/i)).toHaveCount(0)
}

/** No round of a free-paced or capped ladder is ever marked from the clock. */
async function expectNoLiveRound(page: Page, ladder: number, total: number) {
  for (let number = 1; number <= total; number += 1) {
    const row = round(page, ladder, number)
    await expect(row).not.toHaveAttribute('aria-current', 'step')
    await expect(row.getByText(/^(Now|Next)$/)).toHaveCount(0)
    await expect(row.getByText(/^Starts at/)).toHaveCount(0)
  }
}

/** Background the tab, let wall-clock time pass, and bring it back. */
async function background(page: Page, until: number) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.pauseAt(until)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}

/** One scoped synthetic 503 on the first `block_results` insert; never a fake row. */
async function failFirstBlockSave(page: Page) {
  let failed = 0
  const pattern = '**/rest/v1/block_results*'
  const handler = async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() !== 'POST' || failed > 0) return route.fallback()
    failed += 1
    return route.fulfill({ status: 503, headers: CORS,
      json: { code: 'PGRST000', message: 'Controlled TASK-033 save boundary unavailable.' } })
  }
  await page.route(pattern, handler)
  return { failed: () => failed, dispose: () => page.unroute(pattern, handler) }
}

/** A full-page phone render, attached to the report as evidence. */
async function phoneRender(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
}

// ── The journey ──────────────────────────────────────────────────────────

test('JOURNEY-029: timed ladders show precomputed rounds, keep free-paced progress observed, show the cap, and save to Summary', async ({ page, visit, checkA11y, world, modelPosts }, testInfo) => {
  test.setTimeout(240_000)
  expect(page.viewportSize()).toEqual(MOBILE_VIEWPORT)
  const [laddered, companion] = world.catalog
  const timer = page.getByRole('timer', { name: 'Time remaining', exact: true })
  const sessionTime = page.getByRole('timer', { name: 'Session time', exact: true })
  const countdown = page.locator('[data-urgent]').filter({ has: timer })

  await page.clock.install({ time: Date.now() })
  await visit('/workout')
  await expect(page.getByRole('list', { name: 'Rounds in this ladder', exact: true })).toHaveCount(3)

  // ENTRY-052 — the scheduled ladder: every round's start, rung target and
  // fixed companion work, already worked out.
  await expect(page.getByText('4 rounds · a new round every 01:15', { exact: true })).toBeVisible()
  await expect(rounds(page, 0).getByRole('listitem')).toHaveCount(SCHEDULED.rounds)
  for (const [index, reps] of SCHEDULED_RUNGS.entries()) {
    const row = round(page, 0, index + 1)
    await expect(row.getByText(`Starts at ${['00:00', '01:15', '02:30', '03:45'][index]}`, { exact: true })).toBeVisible()
    await expect(row.getByText(`${reps} reps ${display(laddered.id)}`, { exact: true })).toBeVisible()
    await expect(row.getByText(`${COMPANION_REPS} reps ${display(companion.id)} — same every round`, { exact: true })).toBeVisible()
  }
  await expect(page.getByText('NOT STARTED', { exact: true })).toBeVisible()
  await expect(round(page, 0, 1).getByText('Next', { exact: true })).toBeVisible()

  // ENTRY-053 — free-paced For Time and the capped window, with their caps.
  await expect(page.getByText('3 rounds · for time, at your pace · 10:00 cap', { exact: true })).toBeVisible()
  for (const [index, reps] of FREE_PACED_RUNGS.entries()) {
    await expect(round(page, 1, index + 1).getByText(`${reps} reps ${display(laddered.id)}`, { exact: true })).toBeVisible()
  }
  await expect(page.getByText('3 rounds · 06:00 cap on the whole ladder', { exact: true })).toBeVisible()
  for (const [index, reps] of CAPPED_RUNGS.entries()) {
    await expect(round(page, 2, index + 1).getByText(`${reps} reps ${display(companion.id)}`, { exact: true })).toBeVisible()
  }
  await expectNoLiveRound(page, 1, FREE_PACED.rounds)
  await expectNoLiveRound(page, 2, CAPPED.rounds)
  await expectHandsOff(page)
  await phoneRender(page, testInfo, 'ladders-ready-390x844')

  // The one tap: start the schedule. Everything after it is the clock's.
  await page.getByRole('button', { name: 'Start schedule', exact: true }).click()
  const scheduleStart = await page.waitForFunction(({ key, blockId }) => {
    const records = JSON.parse(localStorage.getItem(key) ?? '{}') as
      Record<string, { startedAt: string | null } | undefined>
    const startedAt = records[blockId]?.startedAt
    return startedAt == null ? null : Date.parse(startedAt)
  }, { key: FOR_TIME_STORAGE_KEY, blockId: world.blocks.scheduled }).then((handle) => handle.jsonValue() as Promise<number>)
  // Only the scheduled ladder has a clock to start.
  const freeAndCapped = await page.evaluate(({ key, ids }) => {
    const records = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
    return ids.filter((id) => id in records)
  }, { key: FOR_TIME_STORAGE_KEY, ids: [world.blocks.freePaced, world.blocks.capped] })
  expect(freeAndCapped).toEqual([])
  await checkA11y()

  await page.clock.pauseAt(scheduleStart + 80_000)
  const sessionAtStart = (await sessionTime.textContent()) ?? ''
  await expect(page.getByText('ROUND 2 OF 4', { exact: true })).toBeVisible()
  await expect(round(page, 0, 2)).toHaveAttribute('aria-current', 'step')
  await expect(timer).toContainText('01:10')
  await expect(countdown).toHaveAttribute('data-urgent', 'false')
  // However long has passed, the free-paced and capped ladders show no progress.
  await expectNoLiveRound(page, 1, FREE_PACED.rounds)
  await expectNoLiveRound(page, 2, CAPPED.rounds)
  await expectHandsOff(page)

  // The end-of-interval cue, with nothing to press.
  await page.clock.pauseAt(scheduleStart + 145_000)
  await expect(timer).toContainText('00:05')
  await expect(countdown).toHaveAttribute('data-urgent', 'true')

  // Backgrounded (phone on the floor) into round 3: read from the wall clock.
  await background(page, scheduleStart + 160_000)
  await expect(page.getByText('ROUND 3 OF 4', { exact: true })).toBeVisible()
  await expect(round(page, 0, 3)).toHaveAttribute('aria-current', 'step')
  await expect(timer).toContainText('01:05')
  await expect(countdown).toHaveAttribute('data-urgent', 'false')
  await phoneRender(page, testInfo, 'scheduled-round-3-390x844')

  // Refreshed inside round 4: restored from the stored start, not restarted.
  await page.clock.resume()
  await page.reload()
  await expect(page.locator('main h1')).toHaveAccessibleName('Workout', { timeout: 30_000 })
  await page.clock.pauseAt(scheduleStart + 240_000)
  await expect(page.getByText('ROUND 4 OF 4', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start schedule', exact: true })).toHaveCount(0)
  await expect(round(page, 0, 4)).toHaveAttribute('aria-current', 'step')
  await expect(timer).toContainText('01:00')
  await expectNoLiveRound(page, 1, FREE_PACED.rounds)
  await expectNoLiveRound(page, 2, CAPPED.rounds)
  await expectHandsOff(page)

  // The schedule runs out; nothing claims the work was performed.
  await page.clock.pauseAt(scheduleStart + 310_000)
  await expect(page.getByText('COMPLETE', { exact: true })).toBeVisible()
  await expect(page.getByText(/The clock has run every scheduled round/)).toBeVisible()
  for (let number = 1; number <= SCHEDULED.rounds; number += 1) {
    await expect(round(page, 0, number)).not.toHaveAttribute('aria-current', 'step')
  }

  // The global session clock kept counting through the background, the
  // refresh and the schedule's end; nothing here changed it.
  const sessionAtEnd = (await sessionTime.textContent()) ?? ''
  expect(sessionAtEnd).not.toBe(sessionAtStart)

  // The rest of the journey is the athlete's observations, then the network.
  await page.clock.resume()

  // Progress is declared, never inferred: finished the schedule; finished the
  // free-paced ladder; reached the second rung inside the cap.
  await ending(page, 0).getByRole('radio', { name: 'Finished the ladder', exact: true }).check()
  await ending(page, 1).getByRole('radio', { name: 'Finished the ladder', exact: true }).check()
  await ending(page, 2).getByRole('radio', { name: 'Hit the time cap', exact: true }).check()
  const reached = page.getByRole('group', { name: 'How far did you get?', exact: true })
  // The radio is visually hidden; the rung card that stands for it is its label.
  await reached.locator('label', {
    has: page.getByRole('radio', { name: `${CAPPED_RUNGS[1]} reps`, exact: true }),
  }).click()
  await expect(reached.getByRole('radio', { name: `${CAPPED_RUNGS[1]} reps`, exact: true })).toBeChecked()
  await expect(page.getByText(`Reached rung 2 of 3 — ${CAPPED_RUNGS[1]} reps`, { exact: true })).toBeVisible()
  await expectHandsOff(page)
  await phoneRender(page, testInfo, 'ladders-declared-390x844')

  // Save recovery: the shared forward action fails once, the athlete stays on
  // the section with every declaration intact, and the retry is the same action.
  const failure = await failFirstBlockSave(page)
  try {
    await page.getByRole('button', { name: 'Next section', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('That didn’t save')
    expect(failure.failed()).toBe(1)
    await expect(page.getByText('COMPLETE', { exact: true })).toBeVisible()
    await expect(ending(page, 1).getByRole('radio', { name: 'Finished the ladder', exact: true })).toBeChecked()
    await expect(reached.getByRole('radio', { name: `${CAPPED_RUNGS[1]} reps`, exact: true })).toBeChecked()
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
  } finally {
    await failure.dispose()
  }
  await expect(page.getByRole('list', { name: 'Rounds in this ladder', exact: true })).toHaveCount(0)

  // JOURNEY-029's destination: the next section, then Summary.
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/summary', { timeout: 30_000 })
  await expect(page.locator('main h1')).toHaveAccessibleName('Nice work', { timeout: 30_000 })
  await expect(page.getByText(`${TITLE}, done.`, { exact: true })).toBeVisible()
  await checkA11y()

  // The rows: one per ladder (the failed attempt wrote nothing, the retry wrote
  // once). The only rungs stored are the declared ones, and nothing the clock
  // alone produced — no elapsed time, rounds, minutes or effort.
  expect(await world.sessionState()).toBe('completed')
  const results = await world.blockResults()
  const row = (blockId: string) => {
    const matching = results.filter((result) => result.block_id === blockId)
    expect(matching).toHaveLength(1)
    return matching[0]
  }
  const nothingFromTheClock = {
    elapsed_seconds: null, completed_under_cap: null, rounds_completed: null,
    minutes_completed: null, perceived_effort: null,
  }
  expect(row(world.blocks.scheduled)).toMatchObject({ highest_rung: SCHEDULED.rounds, ...nothingFromTheClock })
  expect(row(world.blocks.freePaced)).toMatchObject({ highest_rung: FREE_PACED.rounds, ...nothingFromTheClock })
  expect(row(world.blocks.capped)).toMatchObject({ highest_rung: 2, ...nothingFromTheClock })
  expect(await world.ladderSetLogs()).toEqual([])

  // Trusted reads must always prove persisted timing. The separately labelled
  // public-preview mode checks its hermetic contract values, not a backend.
  const stored = await world.storedTimings()
  expect(stored).toEqual({
    [world.blocks.scheduled]: SCHEDULED,
    [world.blocks.freePaced]: FREE_PACED,
    [world.blocks.capped]: CAPPED,
  })
  expect(modelPosts()).toBe(0)
})
