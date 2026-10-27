import { createHash } from 'node:crypto'
import type { Locator, Page, Route } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { blockResultRowSchema, conditioningHistoryRowSchema } from '../../src/state/schemas'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, fixtureId, reconstructionFixture, snapshotFixture, type SnapshotFixture } from '../../src/test/workout-double'
import { expect, test as base } from '../fixtures'
import { backend } from '../support/backend'
import { installDeterministicCapture } from './fixtures'

/**
 * REQ-014 / TASK-025 / JOURNEY-024 — hands-off AMRAP execution on a phone.
 *
 * The real app on its real `/workout` route, behind its real guards, holding a
 * genuine session for a disposable namespaced user in the trusted integration
 * run. Public CI has no service-role credential: there the same browser journey
 * uses a fully intercepted, schema-shaped in-memory API fixture. Its report is
 * explicitly labelled hermetic, never backend/persistence proof. Neither mode
 * skips a test or relaxes its UI/result assertions. A local required-command
 * run without the trusted harness still fails closed.
 *
 * The workout is a fixed prescription persisted through the real
 * `persist_session` RPC — never a model response — and every model POST is
 * intercepted in the browser and never forwarded. An identical AMRAP was
 * performed and scored the day before, so a like-for-like comparison has real
 * history to read. The clock is Playwright's, jumped and paused so the window,
 * its low-time cue, a background, a refresh and expiry are observed at exact
 * seconds.
 *
 * What it proves, against the rows the shared progression action wrote:
 *
 *   · no score entry, round counter or round goal while the window runs, and
 *     the countdown comes back from the wall clock after a background and a
 *     refresh;
 *   · after the window the result is optional: blank shows no score and no
 *     comparison, an entered result is compared only against the identical
 *     earlier piece, and an edit survives a refresh;
 *   · a failed save keeps the athlete on the section with the result intact,
 *     and the retry writes one row that carries the edited result — including
 *     an observed zero — and reaches Summary;
 *   · a result left blank never blocks completion and is stored as null.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const SESSION_KEY = 'clear.auth.session'
const AMRAP_KEY = 'clear.workout-amraps'
const TITLE = 'TASK-025 hands-off AMRAP'
/** Five minutes, two movements of ten: twenty reps a round. */
const WINDOW_SECONDS = 300

type Catalogued = { id: string; default_equipment: string }
type Answer = { ok: boolean; status: number; body: unknown }
type BlockResult = {
  block_id: string
  rounds_completed: number | null
  partial_round_reps: number | null
  elapsed_seconds: number | null
  minutes_completed: number | null
  perceived_effort: number | null
}

/** Never put an admin response body, actor, token or email into an assertion. */
function must<T>(answer: Answer, operation: string): T {
  expect(answer.ok, `${operation}: HTTP status ${answer.status}`).toBe(true)
  return answer.body as T
}

/** The movement's name as the app humanises a catalog slug. */
const display = (id: string) => id.replaceAll('-', ' ').replaceAll('_', ' ')

const isoDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

function prescription(exercise: Catalogued, overrides: Record<string, unknown> = {}) {
  return {
    exercise_id: exercise.id, equipment: exercise.default_equipment, session_function: 'conditioning',
    anchor_relationship: 'neutral', modality: 'reps', sets: null, target_kind: 'fixed', target_value: 10,
    target_min: null, target_max: null, target_sequence: null, per_side: false, distance_unit: null,
    rest_seconds: null, tempo: null, load_type: 'none', load_value: null, is_interval_exercise: false,
    ...overrides,
  }
}

/**
 * A five-minute AMRAP of two movements, ten reps each a round, then a short
 * standard cooldown so the forward action's destination is the next section.
 * The same piece, persisted twice, has the same like-for-like fingerprint.
 */
function amrapSession(catalog: Catalogued[], locationId: string | null, date: string, title: string) {
  const [first, second] = catalog
  return {
    date, location_id: locationId, session_focus: 'full_body',
    goal_preset: 'balanced', requested_duration_mins: 20, effective_duration_target_mins: 20,
    computed_duration_mins: null, requested_intensity: 5, effective_intensity: 5, adjustment_reason: null,
    generation_notes: null, prompt_version: 'e2e', contract_version: '4.1.0',
    workout: {
      title, overview: null, estimated_duration_mins: 20,
      sections: [
        {
          section_type: 'conditioning', section_title: 'AMRAP', section_notes: null,
          blocks: [{
            structure_type: 'amrap', rounds: null, timer_type: 'countdown', timer_seconds: WINDOW_SECONDS,
            round_rest_seconds: null, rep_scheme: 'fixed', block_notes: null,
            exercises: [prescription(first), prescription(second)],
          }],
        },
        {
          section_type: 'cooldown', section_title: 'Cooldown', section_notes: null,
          blocks: [{
            structure_type: 'standard', rounds: null, timer_type: 'none', timer_seconds: null,
            round_rest_seconds: null, rep_scheme: 'fixed', block_notes: null,
            exercises: [prescription(first, { sets: 1, target_value: 8 })],
          }],
        },
      ],
    },
  }
}

interface World {
  readonly catalog: Catalogued[]
  /** `workout_blocks.id` of today's AMRAP. */
  readonly amrapBlockId: string
  blockResults(): Promise<BlockResult[]>
  sessionState(): Promise<string>
}

/**
 * Public-preview contract coverage, not evidence about the hosted database.
 * Reuse the existing typed builders; all data requests stay inside this test,
 * unexpected requests fail, and stored observations come only from actual app
 * POST bodies. The earlier identical attempt is one schema-checked
 * `conditioning_history` row. The trusted mode below proves real saved rows.
 */
async function publicPreviewWorld(page: Page) {
  const owner = '00000000-0000-4000-8000-000000000025'
  const catalog = [
    { id: 'dumbbell-thruster', default_equipment: 'dumbbells' },
    { id: 'burpee', default_equipment: 'bodyweight' },
  ]
  const rows: ReturnType<typeof blockResultRowSchema.parse>[] = []
  const unexpected: string[] = []
  let completedAt: string | null = null
  const movement = (exercise: Catalogued) => ({ prescription: {
    exercise_id: exercise.id, equipment_used: exercise.default_equipment, sets: null, target_value: 10,
    load_type: 'none' as const, load_value: null,
  } })
  const fixture: SnapshotFixture = {
    userId: owner, sessionId: fixtureId('5', 25), title: TITLE,
    startedAt: new Date().toISOString(),
    sections: [
      { sectionType: 'conditioning', title: 'AMRAP', blocks: [{
        structureType: 'amrap', timerType: 'countdown', timerSeconds: WINDOW_SECONDS,
        exercises: [movement(catalog[0]), movement(catalog[1])],
      }] },
      { sectionType: 'cooldown', title: 'Cooldown', blocks: [{
        exercises: [{ prescription: { exercise_id: catalog[0].id, equipment_used: catalog[0].default_equipment, sets: 1, target_value: 8 } }],
      }] },
    ],
  }
  const currentFixture = (): SnapshotFixture => ({ ...fixture,
    state: completedAt === null ? 'active' : 'completed',
    session: { completed_at: completedAt, actual_duration_mins: completedAt === null ? null : 7 },
  })
  const snapshot = () => snapshotFixture(currentFixture())
  const amrap = snapshot().sections[0].blocks[0]
  // Yesterday's identical piece: two rounds recorded, scored like today's.
  const earlier = conditioningHistoryRowSchema.parse({
    session_id: fixtureId('6', 1), session_date: isoDate(-1), effective_intensity: 5,
    goal_preset: 'balanced', section_id: fixtureId('6', 2), section_order: 0,
    block_id: fixtureId('6', 3), block_order: 0,
    structure_type: amrap.block.structure_type, rep_scheme: amrap.block.rep_scheme,
    timer_type: amrap.block.timer_type, timer_seconds: amrap.block.timer_seconds,
    rounds: amrap.block.rounds, round_rest_seconds: amrap.block.round_rest_seconds,
    elapsed_seconds: WINDOW_SECONDS, completed_under_cap: null, rounds_completed: 2,
    partial_round_reps: null, minutes_completed: null, highest_rung: null, perceived_effort: null,
    scored_at: new Date(Date.now() - 86_400_000).toISOString(),
    prescriptions: amrap.exercises.map(({ exercise: e }) => ({
      exercise_id: e.exercise_id, order_index: e.order_index, modality: e.modality, sets: e.sets,
      target_kind: e.target_kind, target_value: e.target_value, target_min: e.target_min,
      target_max: e.target_max, target_sequence: e.target_sequence, per_side: e.per_side,
      distance_unit: e.distance_unit, load_type: e.load_type, load_value: e.load_value,
      equipment_used: e.equipment_used,
    })),
  })
  const reconstruction = () => {
    const value = reconstructionFixture(currentFixture())
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
      if (name === 'conditioning_history') return reply([earlier])
      if (['constraints_in_force', 'anchor_evidence', 'set_load_anchors'].includes(name)) return reply([])
      if (name === 'record_favorite_completion') return reply({ outcome: 'not_a_favorite' })
    }
    if (request.method() === 'POST' && name === 'block_results') {
      const inserts: unknown = request.postDataJSON()
      expect(Array.isArray(inserts) && inserts.length === 1).toBe(true)
      const insert = (inserts as Record<string, unknown>[])[0]
      const row = blockResultRowSchema.parse({
        elapsed_seconds: null, completed_under_cap: null, rounds_completed: null,
        partial_round_reps: null, minutes_completed: null, highest_rung: null,
        perceived_effort: null, notes: null, ...insert,
        id: fixtureId('9', rows.length + 1), created_at: new Date().toISOString(),
      })
      if (rows.some((old) => old.block_id === row.block_id)) {
        return reply({ code: '23505', message: 'Duplicate fixture block result' }, 409)
      }
      rows.push(row)
      return reply([row], 201)
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
    catalog, amrapBlockId: amrap.block.id,
    blockResults: async () => rows,
    sessionState: async () => completedAt === null ? 'active' : 'completed',
  }
  return { world, assertRequests: () => expect(unexpected).toEqual([]) }
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
      testInfo.annotations.push({ type: 'proof-mode', description: 'Hermetic public-preview API contract; no hosted-backend proof or credentials.' })
      const fixture = await publicPreviewWorld(page)
      try { await use(fixture.world) } finally { fixture.assertRequests() }
      return
    }
    testInfo.annotations.push({ type: 'proof-mode', description: 'Trusted namespaced disposable-account integration; real backend rows and cleanup.' })
    // A missing integration credential is a failure, never a skipped proof.
    expect(backend.available, backend.reason).toBe(true)
    const client = backend.client()
    const catalog = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
      select: 'id,default_equipment', default_equipment: 'neq.bodyweight', order: 'id.asc', limit: '2',
    }), 'Fixture catalog read')
    expect(catalog).toHaveLength(2)

    const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
    const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t025-${suffix}@example.com`
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
      throw new Error('TASK-025 namespaced fixture authentication failed; no response body retained.')
    }
    if (userId === null) throw new Error('TASK-025 fixture user was not created.')
    const owner = userId

    /** One persisted, started session's AMRAP block and every block id in it. */
    const persistAndStart = async (date: string, title: string, locationId: string | null) => {
      const persisted = must<{ session: { id: string } }>(await client.rpcAs('persist_session', {
        p_user_id: owner, p_session: amrapSession(catalog, locationId, date, title),
      }, token), 'Fixture persistence')
      const sessionId = persisted.session.id
      const started = must<{ outcome: string }>(await client.rpcAs('start_session', {
        p_session_id: sessionId }, token), 'Fixture start')
      expect(started.outcome).toBe('started')
      const sections = must<Array<{ id: string }>>(await client.selectAsService('workout_sections', {
        select: 'id', session_id: `eq.${sessionId}`,
      }), 'Fixture section read')
      const blocks = must<Array<{ id: string; structure_type: string }>>(
        await client.selectAsService('workout_blocks', {
          select: 'id,structure_type', section_id: `in.(${sections.map((s) => s.id).join(',')})`,
        }), 'Fixture block read')
      const amrap = blocks.find((block) => block.structure_type === 'amrap')
      if (amrap === undefined) throw new Error('TASK-025 fixture has no AMRAP block.')
      return { sessionId, amrapId: amrap.id, blockIds: blocks.map((b) => b.id) }
    }

    try {
      must(await client.rpcAs('complete_onboarding', {
        p_location_name: 'TASK-025 gym', p_location_tier: 'full',
        p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((e) => e.default_equipment)])],
        p_experience_level: 'some', p_goal_preset: 'balanced',
        p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
      }, token), 'Fixture onboarding')
      const [location] = must<Array<{ id: string }>>(await client.selectAsService('locations', {
        select: 'id', user_id: `eq.${owner}`, limit: '1',
      }), 'Fixture location read')
      const locationId = location?.id ?? null

      // Yesterday: the identical piece, two rounds recorded, completed — the
      // history a like-for-like comparison reads.
      const before = await persistAndStart(isoDate(-1), `${TITLE} (earlier)`, locationId)
      must(await client.insertAs('block_results', {
        block_id: before.amrapId, rounds_completed: 2, elapsed_seconds: WINDOW_SECONDS,
      }, token), 'Fixture earlier result')
      const finished = must<{ outcome: string }>(await client.rpcAs('complete_session', {
        p_session_id: before.sessionId, p_actual_duration_mins: 20 }, token), 'Fixture earlier completion')
      expect(finished.outcome).toBe('completed')

      const today = await persistAndStart(isoDate(0), TITLE, locationId)

      await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
        key: SESSION_KEY, session: { accessToken: token, refreshToken,
          expiresAt: Date.now() + 60 * 60 * 1000, user: { id: owner, email } },
      })

      await use({
        catalog, amrapBlockId: today.amrapId,
        blockResults: async () => must<BlockResult[]>(await client.selectAsService('block_results', {
          select: 'block_id,rounds_completed,partial_round_reps,elapsed_seconds,minutes_completed,perceived_effort',
          block_id: `in.(${today.blockIds.join(',')})`,
        }), 'Block result read'),
        sessionState: async () => must<{ state: string }>(await client.rpcAs('session_snapshot', {
          p_session_id: today.sessionId }, token), 'Snapshot read').state,
      })
    } finally {
      await client.deleteUser(owner).catch(() => {
        throw new Error('TASK-025 scoped fixture cleanup failed.')
      })
    }
  },
})

test.use({ timezoneId: 'UTC' })

// ── Reading the screen ───────────────────────────────────────────────────

function movement(page: Page, position: number, id: string): Locator {
  return page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: `${position}. ${display(id)}`, exact: true }),
  })
}

/** While the window runs: no score entry, no round counter, no round goal. */
async function expectHandsOff(page: Page) {
  const main = page.locator('main')
  await expect(main.getByRole('form', { name: /^Log set/ })).toHaveCount(0)
  await expect(main.getByRole('spinbutton')).toHaveCount(0)
  await expect(main.getByRole('slider')).toHaveCount(0)
  await expect(main.getByRole('group', { name: 'Rounds completed', exact: true })).toHaveCount(0)
  await expect(main.getByRole('button', { name: /record rounds|add a completed round|partial round/i })).toHaveCount(0)
  await expect(main.getByText(/\bRPE\b|exertion|how hard/i)).toHaveCount(0)
  await expect(main.getByText(/round goal|target rounds|expected rounds|predicted/i)).toHaveCount(0)
}

/** A frameless text action, whose accessible name ends in the package's chevron. */
function textAction(page: Page, label: string): Locator {
  return page.locator('main').getByRole('button', { name: new RegExp(`^${label}\\b`) })
}

/** The count the rounds stepper is showing. */
function roundsShown(page: Page): Locator {
  return page.getByRole('group', { name: 'Rounds completed', exact: true }).getByRole('status')
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
      json: { code: 'PGRST000', message: 'Controlled TASK-025 save boundary unavailable.' } })
  }
  await page.route(pattern, handler)
  return { failed: () => failed, dispose: () => page.unroute(pattern, handler) }
}

/** Opens the AMRAP and starts its window; answers the stored start, in ms. */
async function startWindow(
  page: Page,
  world: World,
  visit: (path: string) => Promise<void>,
): Promise<number> {
  await page.clock.install({ time: Date.now() })
  await visit('/workout')
  await expect(page.getByRole('list', { name: 'Movements in this AMRAP', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start AMRAP', exact: true }).click()
  return page.waitForFunction(({ key, blockId }) => {
    const records = JSON.parse(localStorage.getItem(key) ?? '{}') as
      Record<string, { startedAt: string | null } | undefined>
    const startedAt = records[blockId]?.startedAt
    return startedAt == null ? null : Date.parse(startedAt)
  }, { key: AMRAP_KEY, blockId: world.amrapBlockId }).then((handle) => handle.jsonValue() as Promise<number>)
}

/** The rest of the journey after the AMRAP: the cooldown, then Summary. */
async function finishToSummary(page: Page) {
  await expect(page.getByRole('list', { name: 'Movements in this AMRAP', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/summary', { timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Nice work', { timeout: 30_000 })
  await expect(page.getByText(`${TITLE}, done.`, { exact: true })).toBeVisible()
}

// ── The journeys ─────────────────────────────────────────────────────────

test('JOURNEY-024: the AMRAP window is hands-off, the optional result is compared like-for-like, and an edited result survives refresh and save recovery into Summary', async ({ page, visit, checkA11y, world, modelPosts }) => {
  test.setTimeout(240_000)
  const [first, second] = world.catalog
  const timer = page.getByRole('timer', { name: 'Time remaining', exact: true })
  const sessionTime = page.getByRole('timer', { name: 'Session time', exact: true })
  // The block carries `data-urgent` only while the low-time cue is on.
  const urgentCue = page.locator('[data-urgent="true"]').filter({ has: timer })

  await page.clock.install({ time: Date.now() })
  await visit('/workout')
  await expect(page.getByRole('list', { name: 'Movements in this AMRAP', exact: true })).toBeVisible()

  // Ready: the window is stated, the round is listed, and there is no goal.
  await expect(page.getByText('As many rounds as possible in 05:00.', { exact: true })).toBeVisible()
  await expect(page.getByText('Each round:', { exact: true })).toBeVisible()
  await expect(movement(page, 1, first.id).getByText('10 reps', { exact: true })).toBeVisible()
  await expect(movement(page, 2, second.id).getByText('10 reps', { exact: true })).toBeVisible()
  await expectHandsOff(page)

  await page.getByRole('button', { name: 'Start AMRAP', exact: true }).click()
  const amrapStart = await page.waitForFunction(({ key, blockId }) => {
    const records = JSON.parse(localStorage.getItem(key) ?? '{}') as
      Record<string, { startedAt: string | null } | undefined>
    const startedAt = records[blockId]?.startedAt
    return startedAt == null ? null : Date.parse(startedAt)
  }, { key: AMRAP_KEY, blockId: world.amrapBlockId }).then((handle) => handle.jsonValue() as Promise<number>)
  // Scanned while the clock still runs: axe schedules its own timers.
  await checkA11y()
  await page.clock.pauseAt(amrapStart + 10_000)
  const sessionAtStart = (await sessionTime.textContent()) ?? ''

  // Running: the countdown is in view on a phone, and nothing asks for a score.
  await expect(timer).toContainText('04:50')
  await expect(timer).toBeInViewport()
  await expect(page.getByText('Nothing to enter now. Record your rounds afterwards if you like.', { exact: true })).toBeVisible()
  await expectHandsOff(page)

  // Backgrounded (phone on the floor): the window is the wall clock's.
  await background(page, amrapStart + 150_000)
  await expect(timer).toContainText('02:30')
  await expect(urgentCue).toHaveCount(0)
  await expectHandsOff(page)

  // Refreshed mid-window: restored from the stored start, not restarted.
  await page.clock.resume()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Workout', { timeout: 30_000 })
  await page.clock.pauseAt(amrapStart + 200_000)
  await expect(page.getByRole('button', { name: 'Start AMRAP', exact: true })).toHaveCount(0)
  await expect(timer).toContainText('01:40')
  await expectHandsOff(page)

  // The low-time cue, still with nothing to enter.
  await page.clock.pauseAt(amrapStart + 292_000)
  await expect(timer).toContainText('00:08')
  await expect(urgentCue).toHaveCount(1)
  await expectHandsOff(page)

  // Expiry: the window closes on its own and the result is offered, blank.
  await page.clock.pauseAt(amrapStart + 320_000)
  await expect(page.getByText('AMRAP complete', { exact: true })).toBeVisible()
  await expect(page.getByText('05:00 on the clock')).toBeVisible()
  await expect(page.getByText('Cap reached', { exact: true })).toBeVisible()
  await expect(timer).toHaveCount(0)
  await expect(page.getByText('No rounds recorded. Optional — leave it blank if you like.', { exact: true })).toBeVisible()
  await expect(page.getByText('No partial round recorded.', { exact: true })).toBeVisible()
  // Blank is not a score, and claims no comparison.
  await expect(page.getByText(/^Score:/)).toHaveCount(0)
  await expect(page.getByText(/previous best/i)).toHaveCount(0)

  // The global session clock is untouched by the AMRAP.
  expect((await sessionTime.textContent()) ?? '').not.toBe(sessionAtStart)
  await page.clock.resume()

  // Recorded after the window: three rounds is 12 reps/min against yesterday's
  // identical 8 — the only comparable history there is.
  await textAction(page, 'Record rounds').click()
  await expect(roundsShown(page)).toHaveText('0')
  for (let round = 0; round < 3; round += 1) {
    await page.getByRole('button', { name: 'Add a completed round', exact: true }).click()
  }
  await expect(roundsShown(page)).toHaveText('3')
  await expect(page.getByText('Score: 12 reps/min', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Previous best 8 reps/min · Ahead of your previous best', { exact: true })).toBeVisible()
  await checkA11y()

  // A post-window edit: a round taken back and a partial round of zero — an
  // observed zero, not a blank.
  await page.getByRole('button', { name: 'Take back a round', exact: true }).click()
  await textAction(page, 'Partial round').click()
  await expect(roundsShown(page)).toHaveText('2')
  await expect(page.getByRole('group', { name: 'Reps into the next round', exact: true }).getByRole('status')).toHaveText('0')
  await expect(page.getByText('Previous best 8 reps/min · Level with your previous best', { exact: true })).toBeVisible()

  // The edit survives a refresh.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Workout', { timeout: 30_000 })
  await expect(roundsShown(page)).toHaveText('2')
  await expect(page.getByRole('group', { name: 'Reps into the next round', exact: true }).getByRole('status')).toHaveText('0')

  // Save recovery: the shared forward action fails once, the athlete stays on
  // the AMRAP with the result intact, and the retry is the same action again.
  const failure = await failFirstBlockSave(page)
  try {
    await page.getByRole('button', { name: 'Next section', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('That didn’t save')
    expect(failure.failed()).toBe(1)
    await expect(roundsShown(page)).toHaveText('2')
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
  } finally {
    await failure.dispose()
  }
  await finishToSummary(page)
  await checkA11y()

  // One AMRAP row — the failed attempt wrote nothing — carrying the edited
  // result, the observed zero, the window's time and no effort.
  expect(await world.sessionState()).toBe('completed')
  const amrapRows = (await world.blockResults()).filter((row) => row.block_id === world.amrapBlockId)
  expect(amrapRows).toHaveLength(1)
  expect(amrapRows[0]).toMatchObject({
    rounds_completed: 2, partial_round_reps: 0, elapsed_seconds: WINDOW_SECONDS,
    minutes_completed: null, perceived_effort: null,
  })
  expect(modelPosts()).toBe(0)
})

test('JOURNEY-024: a result left blank never blocks completion and is stored as null, not zero', async ({ page, visit, world, modelPosts }) => {
  test.setTimeout(180_000)
  const amrapStart = await startWindow(page, world, visit)
  await expectHandsOff(page)

  // Finished early, and nothing entered.
  await page.clock.pauseAt(amrapStart + 95_000)
  await page.getByRole('button', { name: 'Finish early', exact: true }).click()
  await expect(page.getByText('01:35 on the clock')).toBeVisible()
  await expect(page.getByText('Cap reached', { exact: true })).toHaveCount(0)
  await expect(page.getByText('No rounds recorded. Optional — leave it blank if you like.', { exact: true })).toBeVisible()
  await expect(page.getByText(/^Score:/)).toHaveCount(0)
  await page.clock.resume()

  // Entered and cleared again: back to blank, not to zero.
  await textAction(page, 'Record rounds').click()
  await page.getByRole('button', { name: 'Add a completed round', exact: true }).click()
  await textAction(page, 'Clear rounds').click()
  await expect(page.getByText('No rounds recorded. Optional — leave it blank if you like.', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Next section', exact: true }).click()
  await finishToSummary(page)

  expect(await world.sessionState()).toBe('completed')
  const amrapRows = (await world.blockResults()).filter((row) => row.block_id === world.amrapBlockId)
  expect(amrapRows).toHaveLength(1)
  expect(amrapRows[0]).toMatchObject({
    rounds_completed: null, partial_round_reps: null, elapsed_seconds: 95,
    minutes_completed: null, perceived_effort: null,
  })
  expect(modelPosts()).toBe(0)
})
