import { createHash } from 'node:crypto'
import type { Locator, Page, Route } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { blockResultRowSchema, exerciseSetLogRowSchema } from '../../src/state/schemas'
import { isSetObservationMutation, sameSetMutation, type SetObservationAck } from '../../src/state/set-observation-mutation'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, fixtureId, reconstructionFixture, snapshotFixture, type SnapshotFixture } from '../../src/test/workout-double'
import { expect, test as base } from '../fixtures'
import { backend } from '../support/backend'
import { installDeterministicCapture } from './fixtures'

/**
 * REQ-014 (U40) / TASK-026 / JOURNEY-025 — the hands-off circuit on a phone.
 *
 * The real app on its real `/workout` route, behind its real guards, holding a
 * genuine session for a disposable namespaced user in the trusted integration
 * run. Public CI has no service-role credential: there the same browser journey
 * uses a fully intercepted, schema-shaped in-memory API fixture. Its report is
 * explicitly labelled hermetic, never backend/persistence proof. Neither mode
 * skips this test or relaxes its UI/result assertions. A local required-command
 * run without the trusted harness still fails closed.
 *
 * The workout is a fixed prescription persisted through the real
 * `persist_session` RPC — never a model response — and every model POST is
 * intercepted in the browser and never forwarded. The clock is Playwright's,
 * jumped and paused so the shared rest, a background, a refresh and the time
 * that passes without a tap are observed at exact seconds.
 *
 * What it proves, against the rows the shared progression action wrote:
 *
 *   · the complete ordered circuit — every movement with its reps, the total
 *     rounds and the shared rest — is on the card, with no set form, no
 *     per-movement step and no movement singled out;
 *   · load entry is optional and compact: one quiet action per movement opens
 *     that movement's form in the shared pinned sheet, without logging it;
 *   · twenty minutes on the session clock record no round; Start round starts
 *     only its elapsed clock, and Finish round records one duration and starts
 *     the shared rest, which the wall clock carries through a background and a
 *     refresh;
 *   · a failed save keeps the athlete on the circuit with its record intact,
 *     the retry writes one row through the same forward action, and Summary
 *     follows;
 *   · the stored `block_results` row carries the one round the athlete
 *     recorded — not the three the block prescribes — and no set was logged.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const SESSION_KEY = 'clear.auth.session'
const TITLE = 'TASK-026 hands-off circuit'
const REPS = [15, 10, 12] as const

type Catalogued = { id: string; default_equipment: string }
type Answer = { ok: boolean; status: number; body: unknown }
type BlockResult = {
  block_id: string
  minutes_completed: number | null
  rounds_completed: number | null
  partial_round_reps: number | null
  elapsed_seconds: number | null
  perceived_effort: number | null
}

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

/**
 * Three rounds of three movements, 30 seconds of shared rest between rounds,
 * then a short standard cooldown so the forward action's destination is the
 * next section first.
 */
function circuitSession(catalog: Catalogued[], locationId: string | null) {
  return {
    date: new Date().toISOString().slice(0, 10), location_id: locationId, session_focus: 'full_body',
    goal_preset: 'balanced', requested_duration_mins: 20, effective_duration_target_mins: 20,
    computed_duration_mins: null, requested_intensity: 5, effective_intensity: 5, adjustment_reason: null,
    generation_notes: null, prompt_version: 'e2e', contract_version: '4.1.0',
    workout: {
      title: TITLE, overview: null, estimated_duration_mins: 20,
      sections: [
        {
          section_type: 'conditioning', section_title: 'Circuit', section_notes: null,
          blocks: [{
            structure_type: 'circuit', rounds: 3, timer_type: 'none', timer_seconds: null,
            round_rest_seconds: 30, rep_scheme: 'fixed', block_notes: null,
            exercises: catalog.map((exercise, index) => prescription(exercise, { target_value: REPS[index] })),
          }],
        },
        {
          section_type: 'cooldown', section_title: 'Cooldown', section_notes: null,
          blocks: [{
            structure_type: 'standard', rounds: null, timer_type: 'none', timer_seconds: null,
            round_rest_seconds: null, rep_scheme: 'fixed', block_notes: null,
            exercises: [prescription(catalog[0], { sets: 1, target_value: 8 })],
          }],
        },
      ],
    },
  }
}

interface World {
  readonly catalog: Catalogued[]
  readonly sessionId: string
  /** `workout_blocks.id` of the circuit. */
  readonly circuitBlockId: string
  blockResults(): Promise<BlockResult[]>
  circuitSetLogs(): Promise<unknown[]>
  sessionState(): Promise<string>
}

/**
 * Public-preview contract coverage, not evidence about the hosted database.
 * Reuse the existing typed builders; all data requests stay inside this test,
 * unexpected requests fail, and stored observations come only from actual app
 * POST bodies. The trusted mode below continues to prove real saved rows.
 */
async function publicPreviewWorld(page: Page) {
  const owner = '00000000-0000-4000-8000-000000000026'
  const catalog = [
    { id: 'kettlebell-swing', default_equipment: 'kettlebell' },
    { id: 'dumbbell-push-press', default_equipment: 'dumbbells' },
    { id: 'goblet-squat', default_equipment: 'kettlebell' },
  ]
  const rows: ReturnType<typeof blockResultRowSchema.parse>[] = []
  const setLogs: unknown[] = []
  const mutationReceipts = new Map<string, SetObservationAck>()
  const unexpected: string[] = []
  let completedAt: string | null = null
  let abandonedAt: string | null = null
  const fixture: SnapshotFixture = {
    userId: owner, sessionId: fixtureId('5', 26), title: TITLE,
    startedAt: new Date().toISOString(),
    sections: [
      { sectionType: 'conditioning', title: 'Circuit', blocks: [{
        structureType: 'circuit', rounds: 3, roundRestSeconds: 30,
        exercises: catalog.map((exercise, index) => ({ prescription: {
          exercise_id: exercise.id, equipment_used: exercise.default_equipment, sets: null,
          target_value: REPS[index], order_index: index, rest_seconds: null,
        } })),
      }] },
      { sectionType: 'cooldown', title: 'Cooldown', blocks: [{
        exercises: [{ prescription: { exercise_id: catalog[0].id, equipment_used: catalog[0].default_equipment, sets: 1, target_value: 8 } }],
      }] },
    ],
  }
  const currentFixture = (): SnapshotFixture => ({ ...fixture,
    state: abandonedAt !== null ? 'abandoned' : completedAt === null ? 'active' : 'completed',
    session: { completed_at: completedAt, abandoned_at: abandonedAt, actual_duration_mins: completedAt === null ? null : 22 },
  })
  const observationsFor = (exerciseId: string) => setLogs.filter((row) =>
    exerciseSetLogRowSchema.safeParse(row).success &&
    (row as ReturnType<typeof exerciseSetLogRowSchema.parse>).workout_exercise_id === exerciseId,
  )
  const snapshot = () => {
    const value = snapshotFixture(currentFixture())
    return { ...value, sections: value.sections.map((section) => ({ ...section,
      blocks: section.blocks.map((block) => ({ ...block,
        exercises: block.exercises.map((exercise) => ({ ...exercise,
          set_logs: observationsFor(exercise.exercise.id),
        })),
      })),
    })) }
  }
  const firstBlock = snapshot().sections[0].blocks[0].block.id
  const reconstruction = () => {
    const value = reconstructionFixture(currentFixture())
    return { ...value, sections: value.sections.map((section) => ({ ...section,
      blocks: section.blocks.map((block) => ({ ...block,
        block_result: rows.find((row) => row.block_id === block.block.id) ?? null,
        exercises: block.exercises.map((exercise) => ({ ...exercise,
          set_logs: observationsFor(exercise.exercise.id),
        })),
      })),
    })) }
  }
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    // The hour-long rest-expiry probe also expires the synthetic access token.
    // Model the existing refresh exchange instead of extending its lifetime or
    // confusing an authentication failure with the controlled block-save 503.
    if (request.method() === 'POST' && url.pathname === '/auth/v1/token' &&
        url.searchParams.get('grant_type') === 'refresh_token') {
      expect(request.postDataJSON()).toEqual({ refresh_token: 'synthetic-preview-refresh' })
      return reply({
        access_token: 'synthetic-preview-session', refresh_token: 'synthetic-preview-refresh',
        expires_in: 3600, token_type: 'bearer',
        user: { id: owner, email: 'synthetic-preview@example.invalid' },
      })
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: owner })])
      if (name === 'locations') return reply([fixtureLocation({ user_id: owner })])
      if (name === 'workout_sessions') return reply([snapshot().session])
      if (name === 'exercise_definitions') return reply(catalog.map((e) => definitionFixture({ id: e.id })))
      if (name === 'workout_exercises') return reply(snapshot().sections.flatMap((s) => s.blocks.flatMap((b) => b.exercises.map((e) => e.exercise))))
      if (['load_anchors', 'location_equipment', 'saved_workout_attempts', 'saved_workouts', 'rest_days'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(completedAt !== null || abandonedAt !== null ? null : snapshot())
      if (name === 'session_snapshot') return reply(snapshot())
      if (name === 'session_as_performed') return reply(reconstruction())
      if (name === 'abandon_session') {
        expect(request.postDataJSON()).toEqual({ p_session_id: fixture.sessionId })
        abandonedAt = new Date().toISOString()
        return reply({ outcome: 'abandoned', state: 'abandoned', session: snapshot().session })
      }
      if (name === 'mutate_set_observation') {
        // Insert-only contract for the explicit observation in JOURNEY-015.
        // Values come from the actual UI request; this is never database proof.
        const body = request.postDataJSON() as Record<string, unknown>
        const mutation = {
          observation_id: body.p_observation_id, mutation_id: body.p_mutation_id,
          revision: body.p_revision, expected_revision: body.p_expected_revision,
          operation: body.p_operation, exercise_id: body.p_exercise_id,
          set_number: body.p_set_number, values: body.p_values,
        }
        if (!isSetObservationMutation(mutation) || mutation.operation !== 'insert' ||
            mutation.expected_revision !== 0 || mutation.revision !== 1 || abandonedAt !== null) {
          unexpected.push('Unsupported public-preview observation mutation')
          return reply({ outcome: 'invalid' })
        }
        const previous = mutationReceipts.get(mutation.mutation_id)
        if (previous !== undefined) {
          expect(sameSetMutation(previous.mutation, mutation)).toBe(true)
          return reply({ ...previous, outcome: 'replayed' })
        }
        const ownsExercise = snapshot().sections[0].blocks[0].exercises
          .some((exercise) => exercise.exercise.id === mutation.exercise_id)
        if (!ownsExercise || setLogs.some((row) =>
          (row as { id?: string }).id === mutation.observation_id)) {
          unexpected.push('Unsupported public-preview observation identity')
          return reply({ outcome: 'invalid' })
        }
        const row = exerciseSetLogRowSchema.parse({
          actual_reps: null, actual_duration_seconds: null, actual_distance: null,
          actual_distance_unit: null, weight: null, rpe: null, effort: null,
          is_warmup_set: false, ...mutation.values,
          id: mutation.observation_id, workout_exercise_id: mutation.exercise_id,
          prescription_revision_status: 'active', set_number: mutation.set_number,
          mutation_revision: mutation.revision, last_mutation_id: mutation.mutation_id,
          created_at: new Date().toISOString(),
        })
        setLogs.push(row)
        const ack: SetObservationAck = {
          outcome: 'applied', mutation,
          head: { revision: mutation.revision, mutation_id: mutation.mutation_id,
            cleared: false, row },
        }
        mutationReceipts.set(mutation.mutation_id, ack)
        return reply(ack)
      }
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
    if (request.method() === 'POST' && name === 'exercise_set_logs') {
      // Current UI inserts use the RPC above. Retain any raw-table attempt
      // as a failure rather than silently allowing a second write path.
      setLogs.push(request.postDataJSON())
      return reply({ code: 'PGRST000', message: 'Unexpected set log in the circuit fixture' }, 503)
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
    catalog, sessionId: fixtureId('5', 26), circuitBlockId: firstBlock,
    blockResults: async () => rows,
    circuitSetLogs: async () => setLogs,
    sessionState: async () => abandonedAt !== null ? 'abandoned' : completedAt === null ? 'active' : 'completed',
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
      select: 'id,default_equipment', default_equipment: 'neq.bodyweight', order: 'id.asc', limit: '3',
    }), 'Fixture catalog read')
    expect(catalog).toHaveLength(3)

    const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
    const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t026-${suffix}@example.com`
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
      throw new Error('TASK-026 namespaced fixture authentication failed; no response body retained.')
    }
    if (userId === null) throw new Error('TASK-026 fixture user was not created.')
    const owner = userId

    try {
      must(await client.rpcAs('complete_onboarding', {
        p_location_name: 'TASK-026 gym', p_location_tier: 'full',
        p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((e) => e.default_equipment)])],
        p_experience_level: 'some', p_goal_preset: 'balanced',
        p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
      }, token), 'Fixture onboarding')
      const [location] = must<Array<{ id: string }>>(await client.selectAsService('locations', {
        select: 'id', user_id: `eq.${owner}`, limit: '1',
      }), 'Fixture location read')
      const persisted = must<{ session: { id: string } }>(await client.rpcAs('persist_session', {
        p_user_id: owner, p_session: circuitSession(catalog, location?.id ?? null),
      }, token), 'Fixture persistence')
      const sessionId = persisted.session.id
      const started = must<{ outcome: string }>(await client.rpcAs('start_session', {
        p_session_id: sessionId }, token), 'Fixture start')
      expect(started.outcome).toBe('started')

      const sections = must<Array<{ id: string; section_type: string }>>(
        await client.selectAsService('workout_sections', {
          select: 'id,section_type', session_id: `eq.${sessionId}`,
        }), 'Fixture section read')
      const blocks = must<Array<{ id: string; section_id: string; structure_type: string }>>(
        await client.selectAsService('workout_blocks', {
          select: 'id,section_id,structure_type', section_id: `in.(${sections.map((s) => s.id).join(',')})`,
        }), 'Fixture block read')
      const circuitBlock = blocks.find((block) => block.structure_type === 'circuit')
      if (circuitBlock === undefined) throw new Error('TASK-026 fixture has no circuit block.')
      const exercises = must<Array<{ id: string }>>(await client.selectAsService('workout_exercises', {
        select: 'id', block_id: `eq.${circuitBlock.id}`,
      }), 'Fixture prescription read')
      expect(exercises).toHaveLength(3)

      await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
        key: SESSION_KEY, session: { accessToken: token, refreshToken,
          expiresAt: Date.now() + 60 * 60 * 1000, user: { id: owner, email } },
      })

      await use({
        catalog, sessionId, circuitBlockId: circuitBlock.id,
        blockResults: async () => must<BlockResult[]>(await client.selectAsService('block_results', {
          select: 'block_id,minutes_completed,rounds_completed,partial_round_reps,elapsed_seconds,perceived_effort',
          block_id: `in.(${blocks.map((b) => b.id).join(',')})`,
        }), 'Block result read'),
        circuitSetLogs: async () => must<unknown[]>(await client.selectAsService('exercise_set_logs', {
          select: '*', workout_exercise_id: `in.(${exercises.map((e) => e.id).join(',')})`, order: 'id.asc',
        }), 'Set log read'),
        sessionState: async () => must<{ state: string }>(await client.rpcAs('session_snapshot', {
          p_session_id: sessionId }, token), 'Snapshot read').state,
      })
    } finally {
      await client.deleteUser(owner).catch(() => {
        throw new Error('TASK-026 scoped fixture cleanup failed.')
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

/** Nothing on the screen asks for a set, a movement step or an exertion. */
async function expectHandsOff(page: Page) {
  const main = page.locator('main')
  await expect(main.getByRole('form', { name: /^Log set/ })).toHaveCount(0)
  await expect(main.getByRole('spinbutton')).toHaveCount(0)
  await expect(main.getByRole('slider')).toHaveCount(0)
  await expect(main.getByRole('button', { name: /next movement|log set/i })).toHaveCount(0)
  await expect(main.locator('li[aria-current]')).toHaveCount(0)
  await expect(main.getByText(/\bRPE\b|exertion|how hard/i)).toHaveCount(0)
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
      json: { code: 'PGRST000', message: 'Controlled TASK-026 save boundary unavailable.' } })
  }
  await page.route(pattern, handler)
  return { failed: () => failed, dispose: () => page.unroute(pattern, handler) }
}

/** Actual rendered phone geometry; no simulated notch or physical-device claim. */
async function expectFooterPair(page: Page, forwardName: 'Next section' | 'Finish workout') {
  const navigation = page.getByRole('navigation', { name: 'Workout sections', exact: true })
  const progress = navigation.getByRole('progressbar', { name: /^Section / })
  const previous = navigation.getByRole('button', { name: 'Previous', exact: true })
  const forward = navigation.getByRole('button', { name: forwardName, exact: true })
  await expect(navigation).toBeVisible()
  await expect(progress).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  const viewport = page.viewportSize()
  if (viewport === null) throw new Error('Footer geometry needs a configured phone viewport')
  const boxes: Array<{ left: number; right: number; top: number; bottom: number }> = []
  for (const action of [previous, forward]) {
    await expect(action).toBeVisible()
    const metrics = await action.evaluate((button) => {
      const box = button.getBoundingClientRect()
      const labels: Array<{ left: number; right: number; top: number; bottom: number }> = []
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        labels.push(...Array.from(range.getClientRects(), (rect) => ({
          left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        })))
      }
      return {
        left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        height: box.height,
        minimumHeight: Number.parseFloat(getComputedStyle(button).minHeight),
        scrollWidth: button.scrollWidth, clientWidth: button.clientWidth,
        scrollHeight: button.scrollHeight, clientHeight: button.clientHeight,
        labels,
      }
    })
    expect(metrics.left).toBeGreaterThanOrEqual(0)
    expect(metrics.top).toBeGreaterThanOrEqual(0)
    expect(metrics.right).toBeLessThanOrEqual(viewport.width)
    expect(metrics.bottom).toBeLessThanOrEqual(viewport.height)
    // Read the public control's computed sizing rather than inventing a tap-height gate.
    expect(metrics.minimumHeight).toBeGreaterThan(0)
    expect(metrics.height + 1).toBeGreaterThanOrEqual(metrics.minimumHeight)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1)
    expect(metrics.labels.length).toBeGreaterThan(0)
    for (const label of metrics.labels) {
      expect(label.left).toBeGreaterThanOrEqual(metrics.left - 1)
      expect(label.right).toBeLessThanOrEqual(metrics.right + 1)
      expect(label.top).toBeGreaterThanOrEqual(metrics.top - 1)
      expect(label.bottom).toBeLessThanOrEqual(metrics.bottom + 1)
    }
    boxes.push(metrics)
    // A visible rectangle is insufficient if another pinned layer covers the action.
    if (await action.isEnabled()) await action.click({ trial: true })
  }
  expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left)
  expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThanOrEqual(1)
  expect(Math.abs(boxes[0].bottom - boxes[1].bottom)).toBeLessThanOrEqual(1)

  const adjacency = await navigation.evaluate((nav) => {
    const bar = nav.querySelector('[role="progressbar"]')
    const children = Array.from(nav.children)
    const barFrame = children.find((child) => bar !== null && child.contains(bar))
    const pair = children.find((child) => child.querySelectorAll('button').length === 2)
    if (barFrame === undefined || pair === undefined) return null
    const barBox = barFrame.getBoundingClientRect()
    const pairBox = pair.getBoundingClientRect()
    return {
      adjacent: barFrame.nextElementSibling === pair,
      barBottom: barBox.bottom,
      pairTop: pairBox.top,
      gap: (Number.parseFloat(getComputedStyle(nav).rowGap) || 0) +
        (Number.parseFloat(getComputedStyle(barFrame).marginBottom) || 0) +
        (Number.parseFloat(getComputedStyle(pair).marginTop) || 0),
    }
  })
  if (adjacency === null) throw new Error('Footer progress and paired actions were not found')
  expect(adjacency.adjacent).toBe(true)
  expect(adjacency.barBottom).toBeLessThanOrEqual(adjacency.pairTop)
  expect(adjacency.pairTop - adjacency.barBottom).toBeLessThanOrEqual(adjacency.gap + 1)
}

// ── The journey ──────────────────────────────────────────────────────────

test('JOURNEY-025: the full ordered circuit runs hands-off, records only observed rounds, survives background and refresh, and saves to Summary', async ({ page, visit, checkA11y, world, modelPosts }) => {
  test.setTimeout(240_000)
  const list = page.getByRole('list', { name: 'Movements in this circuit', exact: true })
  const rows = world.catalog.map((exercise, index) => movement(page, index + 1, exercise.id))
  const timer = page.getByRole('timer', { name: 'Time remaining', exact: true })
  const sessionTime = page.getByRole('timer', { name: 'Session time', exact: true })
  const record = page.getByRole('status').filter({ hasText: /rounds? recorded$/ })

  await page.clock.install({ time: Date.now() })
  await visit('/workout')
  await expect(list).toBeVisible()

  // The complete ordered work: every movement, in order, with its reps; the
  // total rounds and the shared rest, once each.
  await expect(list.getByRole('heading')).toHaveText(
    world.catalog.map((exercise, index) => `${index + 1}. ${display(exercise.id)}`),
  )
  for (const [index, row] of rows.entries()) {
    await expect(row.getByText(`${REPS[index]} reps`, { exact: true })).toBeVisible()
  }
  const card = page.locator('.clr-card').filter({ has: list })
  await expect(card.getByText('CIRCUIT · 3 ROUNDS', { exact: true })).toBeVisible()
  await expect(page.getByText('30s rest between rounds', { exact: true })).toHaveCount(1)
  await expect(record).toHaveText('No rounds recorded')
  await expectHandsOff(page)
  await checkA11y()

  // Twenty minutes on the clock with no tap: the circuit infers no round, and
  // the session clock keeps its own time.
  const opened = await page.evaluate(() => Date.now())
  const sessionAtStart = (await sessionTime.textContent()) ?? ''
  await page.clock.pauseAt(opened + 20 * 60_000)
  await expect(record).toHaveText('No rounds recorded')
  await expect(timer).toHaveCount(0)
  await expect(sessionTime).not.toHaveText(sessionAtStart)
  await expectHandsOff(page)

  // Optional load entry is compact: one quiet action per movement opens its
  // one form in the actual pinned sheet, rather than inside the movement row.
  // Minimize and hide the entry again; no result was submitted.
  const second = display(world.catalog[1].id)
  for (const exercise of world.catalog) {
    await expect(page.getByRole('button', { name: `Log load and reps for ${display(exercise.id)}`, exact: true }))
      .toHaveAttribute('aria-expanded', 'false')
  }
  await page.getByRole('button', { name: `Log load and reps for ${second}`, exact: true }).click()
  const sheet = page.locator('[data-set-sheet-slot]')
  await expect(page.getByRole('form', { name: /^Log set/ })).toHaveCount(1)
  await expect(sheet.getByRole('form', { name: `Log set 1 of ${second}`, exact: true })).toBeVisible()
  await expect(rows[1].getByRole('form')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Minimize', exact: true }).click()
  await expect(page.getByRole('form', { name: /^Log set/ })).toHaveCount(0)
  await page.getByRole('button', { name: `Hide load entry for ${second}`, exact: true }).click()
  await expectHandsOff(page)

  // Starting the optional round clock records no work. Finish records the
  // round the athlete completed and starts the shared rest once, separately
  // from movement-result logging. The history displays the elapsed duration.
  await page.clock.resume()
  await page.getByRole('button', { name: 'Start round 1', exact: true }).click()
  const roundStart = await page.waitForFunction((blockId) => {
    const records = JSON.parse(localStorage.getItem('clear.workout-circuits') ?? '{}') as
      Record<string, { roundStartedAt: string | null } | undefined>
    const startedAt = records[blockId]?.roundStartedAt
    return startedAt == null ? null : Date.parse(startedAt)
  }, world.circuitBlockId).then((handle) => handle.jsonValue() as Promise<number>)
  await page.clock.pauseAt(roundStart + 15_000)
  await expect(page.getByRole('timer', { name: 'Round 1 time', exact: true })).toContainText('00:15')
  await expect(record).toHaveText('No rounds recorded')
  await page.getByRole('button', { name: 'Finish round 1', exact: true }).click()
  const roundTimes = page.getByRole('list', { name: 'Round times', exact: true })
  await expect(roundTimes.getByRole('listitem')).toHaveCount(1)
  await expect(roundTimes.getByText('Round 1', { exact: true })).toBeVisible()
  await expect(roundTimes.getByText('00:15', { exact: true })).toBeVisible()
  const restStart = await page.waitForFunction((blockId) => {
    const records = JSON.parse(localStorage.getItem('clear.workout-circuits') ?? '{}') as
      Record<string, { restStartedAt: string | null } | undefined>
    const startedAt = records[blockId]?.restStartedAt
    return startedAt == null ? null : Date.parse(startedAt)
  }, world.circuitBlockId).then((handle) => handle.jsonValue() as Promise<number>)
  await page.clock.pauseAt(restStart + 2_000)
  await expect(record).toHaveText('1 of 3 rounds recorded')
  await expect(timer).toContainText('00:28')
  await expect(timer).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Start round 2', exact: true })).toBeVisible()

  // Backgrounded (phone in a pocket): the rest is the wall clock's.
  await background(page, restStart + 12_000)
  await expect(timer).toContainText('00:18')

  // Refreshed mid-rest: restored from the stored start, not restarted, and the
  // recorded round is still the only one.
  await page.clock.resume()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Workout', { timeout: 30_000 })
  await page.clock.pauseAt(restStart + 20_000)
  await expect(record).toHaveText('1 of 3 rounds recorded')
  await expect(timer).toContainText('00:10')

  // Expiry ends the rest and records nothing more: an hour later, still one.
  await page.clock.pauseAt(restStart + 60 * 60_000)
  await expect(timer).toHaveCount(0)
  await expect(record).toHaveText('1 of 3 rounds recorded')
  await expect(page.getByRole('button', { name: 'Finish round 2', exact: true })).toBeVisible()
  await expectHandsOff(page)

  // The rest of the journey is network and navigation, on a running clock.
  await page.clock.resume()

  // Save recovery: the shared forward action fails once, the athlete stays on
  // the circuit with its record intact, and the retry is the same action again.
  const failure = await failFirstBlockSave(page)
  try {
    await page.getByRole('button', { name: 'Next section', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('That didn’t save')
    expect(failure.failed()).toBe(1)
    await expect(record).toHaveText('1 of 3 rounds recorded')
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
  } finally {
    await failure.dispose()
  }
  await expect(list).toHaveCount(0)

  // Last section, then Summary.
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/summary', { timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Nice work', { timeout: 30_000 })
  await expect(page.getByText(`${TITLE}, done.`, { exact: true })).toBeVisible()
  await checkA11y()

  // The rows: one circuit result (the failed attempt wrote nothing, the retry
  // wrote once) carrying the one recorded round — not the three prescribed —
  // with no time, partial round or effort, and no set logged.
  expect(await world.sessionState()).toBe('completed')
  const circuitRows = (await world.blockResults()).filter((row) => row.block_id === world.circuitBlockId)
  expect(circuitRows).toHaveLength(1)
  expect(circuitRows[0]).toMatchObject({
    rounds_completed: 1, partial_round_reps: null, minutes_completed: null,
    elapsed_seconds: null, perceived_effort: null,
  })
  expect(await world.circuitSetLogs()).toEqual([])
  expect(modelPosts()).toBe(0)
})

test('JOURNEY-025: an untouched circuit saves with no inferred rounds and skipping it never blocks progression', async ({ page, visit, world, modelPosts }) => {
  test.setTimeout(120_000)
  await page.clock.install({ time: Date.now() })
  await visit('/workout')
  await expect(page.getByRole('list', { name: 'Movements in this circuit', exact: true })).toBeVisible()
  await expectHandsOff(page)

  // The prescribed time and more passes; the athlete touches nothing and moves on.
  const opened = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(opened + 15 * 60_000)
  await page.clock.resume()
  await page.getByRole('button', { name: 'Next section', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Movements in this circuit', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/summary', { timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Nice work', { timeout: 30_000 })

  const circuitRows = (await world.blockResults()).filter((row) => row.block_id === world.circuitBlockId)
  expect(circuitRows).toHaveLength(1)
  expect(circuitRows[0]).toMatchObject({
    rounds_completed: null, partial_round_reps: null, minutes_completed: null,
    elapsed_seconds: null, perceived_effort: null,
  })
  expect(await world.circuitSetLogs()).toEqual([])
  expect(modelPosts()).toBe(0)
})

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`JOURNEY-014: paired footer stays readable and reachable at ${viewport.width}x${viewport.height}, including rest and the shared sheet`, async ({ page, visit, world, modelPosts }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    await page.clock.install({ time: Date.now() })
    await visit('/workout')
    await expect(page.getByRole('list', { name: 'Movements in this circuit', exact: true })).toBeVisible()
    // Freeze only time: no new observation is produced by the geometry checks.
    const opened = await page.evaluate(() => Date.now())
    await page.clock.pauseAt(opened + 30_000)
    await expectFooterPair(page, 'Next section')

    // Explicit round recording supplies a real shared rest; optional logging stays unsubmitted.
    await page.getByRole('button', { name: 'Start round 1', exact: true }).click()
    const started = await page.evaluate(() => Date.now())
    await page.clock.pauseAt(started + 1_000)
    await page.getByRole('button', { name: 'Finish round 1', exact: true }).click()
    const timer = page.getByRole('timer', { name: 'Time remaining', exact: true })
    await expect(timer).toBeVisible()
    const exercise = display(world.catalog[1].id)
    await page.getByRole('button', { name: `Log load and reps for ${exercise}`, exact: true }).click()
    const sheet = page.locator('[data-set-sheet-slot]')
    await expect(sheet.getByRole('form', { name: `Log set 1 of ${exercise}`, exact: true })).toBeVisible()
    // Circuit rest belongs to the block, independently of the set-rest sheet.
    await expect(timer).toHaveCount(1)
    await expect(timer).toContainText('00:30')
    await expectFooterPair(page, 'Next section')
    // Scrolling the entry to its final action must not scroll the pager away.
    await sheet.getByRole('button', { name: 'Log set 1', exact: true }).scrollIntoViewIfNeeded()
    await expectFooterPair(page, 'Next section')
    await sheet.getByRole('button', { name: 'Minimize', exact: true }).click()
    await page.getByRole('button', { name: `Hide load entry for ${exercise}`, exact: true }).click()
    await expectHandsOff(page)

    // The same real fixture supplies the last-section label, without changing its finish semantics.
    await page.clock.resume()
    await page.getByRole('button', { name: 'Next section', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Workout sections', exact: true })
      .getByRole('button', { name: 'Finish workout', exact: true })).toBeVisible()
    await expectFooterPair(page, 'Finish workout')
    expect(await world.circuitSetLogs()).toEqual([])
    expect(modelPosts()).toBe(0)
  })
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`JOURNEY-015: the icon-only workout menu and abandon confirmation stay reachable at ${viewport.width}x${viewport.height}, with safe dismissal and restored focus`, async ({ page, visit, world, modelPosts }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    await visit('/workout')
    await expect(page.getByRole('list', { name: 'Movements in this circuit', exact: true })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)

    const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1, name: 'Workout', exact: true }) })
    const trigger = header.getByRole('button', { name: 'Actions', exact: true })
    const panel = header.getByRole('group', { name: 'Actions', exact: true })
    const frame = panel.locator('.clr-workout-menu__frame')
    const abandon = panel.getByRole('button', { name: 'Abandon', exact: true })
    const question = page.getByRole('dialog', { name: 'Abandon workout?', exact: true })
    const beforeBlocks = await world.blockResults()
    const beforeSets = await world.circuitSetLogs()

    const reachable = async (target: Locator, hitTest = false) => {
      await expect(target).toBeVisible()
      await expect(target).toBeInViewport()
      const box = await target.boundingBox()
      if (box === null) throw new Error('Workout menu geometry is unavailable')
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
      if (hitTest) await target.click({ trial: true })
    }
    const unchanged = async () => {
      await expect(page).toHaveURL((url) => url.pathname === '/workout')
      expect(await world.sessionState()).toBe('active')
      expect(await world.blockResults()).toEqual(beforeBlocks)
      expect(await world.circuitSetLogs()).toEqual(beforeSets)
      expect(modelPosts()).toBe(0)
    }

    await expect(trigger).toHaveAccessibleName('Actions')
    await expect(trigger).toHaveText('')
    await expect(trigger).toHaveClass(/(?:^|\s)clr-chamfer(?:\s|$)/)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await reachable(trigger, true)

    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(panel).toHaveClass(/(?:^|\s)clr-bleed(?:\s|$)/)
    await expect(frame).toHaveClass(/(?:^|\s)clr-chamfer(?:\s|$)/)
    await expect(trigger).toHaveAttribute('aria-controls', await panel.getAttribute('id') ?? '')
    await reachable(panel)
    await reachable(frame)
    await reachable(abandon, true)

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toBeFocused()
    await expect(question).toBeHidden()
    await unchanged()

    await trigger.click()
    await expect(panel).toBeVisible()
    // A non-action outside the menu closes it without changing the workout.
    await header.getByRole('heading', { level: 1, name: 'Workout', exact: true }).click()
    await expect(panel).toBeHidden()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(question).toBeHidden()
    await unchanged()

    // Use the real tab order rather than focusing the item through a locator.
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(panel).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(abandon).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(panel).toBeHidden()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(question).toBeVisible()
    await expect(question).toContainText('Everything logged so far is kept.')
    await expect(question).toContainText('it does not count towards your streak')
    const keepGoing = question.getByRole('button', { name: 'Keep going', exact: true })
    await expect(keepGoing).toBeFocused()
    await keepGoing.click()
    await expect(question).toBeHidden()
    await expect(trigger).toBeFocused()
    await reachable(trigger, true)
    await unchanged()
  })
}

test('JOURNEY-015: menu abandon failure preserves an explicitly logged set, and retry lands Home with the same observation retained', async ({ page, visit, world, modelPosts }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await visit('/workout')
  await expect(page.getByRole('list', { name: 'Movements in this circuit', exact: true })).toBeVisible()
  expect(await world.sessionState()).toBe('active')
  expect(await world.circuitSetLogs()).toEqual([])

  // A real explicit submit through the shared sheet creates the observation.
  const exercise = display(world.catalog[0].id)
  await page.getByRole('button', { name: `Log load and reps for ${exercise}`, exact: true }).click()
  const sheet = page.locator('[data-set-sheet-slot]')
  const form = sheet.getByRole('form', { name: `Log set 1 of ${exercise}`, exact: true })
  await expect(form).toBeVisible()
  const weight = form.getByRole('spinbutton', { name: 'Weight', exact: true })
  if (await weight.count()) {
    await weight.fill('')
    await form.getByRole('combobox', { name: 'Unit', exact: true }).selectOption('kg')
  }
  await form.getByRole('spinbutton', { name: 'Reps', exact: true }).fill('7')
  await form.getByRole('radio', { name: 'About right', exact: true }).click()
  await form.getByRole('button', { name: 'Log set 1', exact: true }).click()
  await expect.poll(() => world.circuitSetLogs()).toHaveLength(1)
  const retained = structuredClone(await world.circuitSetLogs())
  expect(retained[0]).toMatchObject({
    prescription_revision_status: 'active', set_number: 1,
    actual_reps: 7, actual_duration_seconds: null, actual_distance: null,
    actual_distance_unit: null, weight: null, weight_unit: 'kg', effort: 'about_right',
  })
  expect(await world.blockResults()).toEqual([])
  await sheet.getByRole('button', { name: 'Minimize', exact: true }).click()
  await page.getByRole('button', { name: `Hide load entry for ${exercise}`, exact: true }).click()

  let abandonAttempts = 0
  const pattern = '**/rest/v1/rpc/abandon_session*'
  const failOnce = async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() !== 'POST') return route.fallback()
    expect(request.postDataJSON()).toEqual({ p_session_id: world.sessionId })
    abandonAttempts += 1
    if (abandonAttempts !== 1) return route.fallback()
    return route.fulfill({ status: 503, headers: CORS,
      json: { code: 'PGRST000', message: 'Controlled TASK-016 abandon boundary unavailable.' } })
  }
  await page.route(pattern, failOnce)
  try {
    const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1, name: 'Workout', exact: true }) })
    const trigger = header.getByRole('button', { name: 'Actions', exact: true })
    const panel = header.getByRole('group', { name: 'Actions', exact: true })
    const question = page.getByRole('dialog', { name: 'Abandon workout?', exact: true })
    const ask = async () => {
      await trigger.click()
      await panel.getByRole('button', { name: 'Abandon', exact: true }).click()
      await expect(question).toBeVisible()
      await expect(question).toContainText('Everything logged so far is kept.')
      await question.getByRole('button', { name: 'Abandon', exact: true }).click()
    }

    await ask()
    const failure = page.getByRole('dialog', { name: 'That didn’t save', exact: true })
    await expect(failure).toBeVisible()
    await expect(question).toBeHidden()
    expect(abandonAttempts).toBe(1)
    await expect(page).toHaveURL((url) => url.pathname === '/workout')
    expect(await world.sessionState()).toBe('active')
    expect(await world.circuitSetLogs()).toEqual(retained)
    expect(await world.blockResults()).toEqual([])
    await failure.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(failure).toBeHidden()

    // Retry through the same menu and confirmation; no alternate write path.
    await ask()
    await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Today', { timeout: 30_000 })
    expect(abandonAttempts).toBe(2)
    expect(await world.sessionState()).toBe('abandoned')
    expect(await world.circuitSetLogs()).toEqual(retained)
    expect(await world.blockResults()).toEqual([])
    expect(modelPosts()).toBe(0)
  } finally {
    await page.unroute(pattern, failOnce)
  }
})
