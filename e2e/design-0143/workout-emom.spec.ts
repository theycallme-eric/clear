import { createHash } from 'node:crypto'
import type { Locator, Page, Route } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { expect, test as base } from '../fixtures'
import { backend } from '../support/backend'
import { installDeterministicCapture } from './fixtures'

/**
 * REQ-014 / TASK-024 / JOURNEY-023 — hands-off EMOM execution on a phone.
 *
 * The real app on its real `/workout` route, behind its real guards, holding a
 * genuine session for a disposable namespaced user. The workout is a fixed
 * prescription persisted through the real `persist_session` RPC — never a model
 * response — and every model POST is intercepted in the browser and never
 * forwarded. The clock is Playwright's, jumped and paused so minute
 * boundaries, rotations, the end-of-minute cue, a background, a refresh and
 * expiry are observed at exact seconds.
 *
 * What it proves, against the rows the shared progression action wrote:
 *
 *   · no set-entry form, no `Minute done` and no exertion prompt in any phase;
 *   · fixed, rising and rotating targets read off the scheduled minute, and
 *     the minute, target and countdown cue come back from the wall clock after
 *     a background and a refresh;
 *   · a failed save keeps the athlete on the section with the clock intact,
 *     and the retry writes one row — through the same forward action — that
 *     reaches Summary;
 *   · the stored `block_results` row carries no minutes the clock alone
 *     produced, and no set was logged for the EMOM's movements.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const SESSION_KEY = 'clear.auth.session'
const TITLE = 'TASK-024 hands-off EMOM'

type Catalogued = { id: string; default_equipment: string }
type Answer = { ok: boolean; status: number; body: unknown }
type BlockResult = {
  block_id: string
  minutes_completed: number | null
  rounds_completed: number | null
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
 * Six minutes, two movements alternating, a 15-second rest window at the foot
 * of every minute. The first movement rises 6-8-10 on its own turns (minutes
 * 1, 3, 5); the second holds 12 (minutes 2, 4, 6). A short standard cooldown
 * follows, so the forward action's destination is the next section first.
 */
function emomSession(catalog: Catalogued[], locationId: string | null) {
  const [rising, fixed] = catalog
  return {
    date: new Date().toISOString().slice(0, 10), location_id: locationId, session_focus: 'full_body',
    goal_preset: 'balanced', requested_duration_mins: 20, effective_duration_target_mins: 20,
    computed_duration_mins: null, requested_intensity: 5, effective_intensity: 5, adjustment_reason: null,
    generation_notes: null, prompt_version: 'e2e', contract_version: '4.1.0',
    workout: {
      title: TITLE, overview: null, estimated_duration_mins: 20,
      sections: [
        {
          section_type: 'conditioning', section_title: 'EMOM', section_notes: null,
          blocks: [{
            structure_type: 'emom', rounds: null, timer_type: 'per_minute', timer_seconds: 360,
            round_rest_seconds: 15, rep_scheme: 'fixed', block_notes: null,
            exercises: [
              prescription(rising, { target_kind: 'sequence', target_value: null, target_sequence: [6, 8, 10] }),
              prescription(fixed),
            ],
          }],
        },
        {
          section_type: 'cooldown', section_title: 'Cooldown', section_notes: null,
          blocks: [{
            structure_type: 'standard', rounds: null, timer_type: 'none', timer_seconds: null,
            round_rest_seconds: null, rep_scheme: 'fixed', block_notes: null,
            exercises: [prescription(rising, { sets: 1, target_value: 8 })],
          }],
        },
      ],
    },
  }
}

interface World {
  readonly catalog: Catalogued[]
  readonly sessionId: string
  /** `workout_blocks.id` of the EMOM, and its movements' prescription ids. */
  readonly emomBlockId: string
  blockResults(): Promise<BlockResult[]>
  emomSetLogs(): Promise<unknown[]>
  sessionState(): Promise<string>
}

const test = base.extend<{ world: World; modelPosts: () => number }>({
  // Provider interception: no model request leaves the browser, and the count
  // is asserted, so nothing here is live generation.
  modelPosts: async ({ page }, use) => {
    const guard = await installDeterministicCapture(page, { skin: 'clear' })
    await use(guard.blockedGenerations)
  },

  world: async ({ page }, use, testInfo) => {
    // A missing integration credential is a failure, never a skipped proof.
    expect(backend.available, backend.reason).toBe(true)
    const client = backend.client()
    const catalog = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
      select: 'id,default_equipment', default_equipment: 'neq.bodyweight', order: 'id.asc', limit: '2',
    }), 'Fixture catalog read')
    expect(catalog).toHaveLength(2)

    const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
    const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t024-${suffix}@example.com`
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
      throw new Error('TASK-024 namespaced fixture authentication failed; no response body retained.')
    }
    if (userId === null) throw new Error('TASK-024 fixture user was not created.')
    const owner = userId

    try {
      must(await client.rpcAs('complete_onboarding', {
        p_location_name: 'TASK-024 gym', p_location_tier: 'full',
        p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((e) => e.default_equipment)])],
        p_experience_level: 'some', p_goal_preset: 'balanced',
        p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
      }, token), 'Fixture onboarding')
      const [location] = must<Array<{ id: string }>>(await client.selectAsService('locations', {
        select: 'id', user_id: `eq.${owner}`, limit: '1',
      }), 'Fixture location read')
      const persisted = must<{ session: { id: string } }>(await client.rpcAs('persist_session', {
        p_user_id: owner, p_session: emomSession(catalog, location?.id ?? null),
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
      const emomBlock = blocks.find((block) => block.structure_type === 'emom')
      if (emomBlock === undefined) throw new Error('TASK-024 fixture has no EMOM block.')
      const exercises = must<Array<{ id: string }>>(await client.selectAsService('workout_exercises', {
        select: 'id', block_id: `eq.${emomBlock.id}`,
      }), 'Fixture prescription read')
      expect(exercises).toHaveLength(2)

      await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
        key: SESSION_KEY, session: { accessToken: token, refreshToken,
          expiresAt: Date.now() + 60 * 60 * 1000, user: { id: owner, email } },
      })

      await use({
        catalog, sessionId, emomBlockId: emomBlock.id,
        blockResults: async () => must<BlockResult[]>(await client.selectAsService('block_results', {
          select: 'block_id,minutes_completed,rounds_completed,elapsed_seconds,perceived_effort',
          block_id: `in.(${blocks.map((b) => b.id).join(',')})`,
        }), 'Block result read'),
        emomSetLogs: async () => must<unknown[]>(await client.selectAsService('exercise_set_logs', {
          select: 'id', workout_exercise_id: `in.(${exercises.map((e) => e.id).join(',')})`,
        }), 'Set log read'),
        sessionState: async () => must<{ state: string }>(await client.rpcAs('session_snapshot', {
          p_session_id: sessionId }, token), 'Snapshot read').state,
      })
    } finally {
      await client.deleteUser(owner).catch(() => {
        throw new Error('TASK-024 scoped fixture cleanup failed.')
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

/** Nothing on the screen asks for a set, a finished minute or an exertion. */
async function expectHandsOff(page: Page) {
  const main = page.locator('main')
  await expect(main.getByRole('form', { name: /^Log set/ })).toHaveCount(0)
  await expect(main.getByRole('spinbutton')).toHaveCount(0)
  await expect(main.getByRole('slider')).toHaveCount(0)
  await expect(main.getByRole('button', { name: /minute done|log set/i })).toHaveCount(0)
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
      json: { code: 'PGRST000', message: 'Controlled TASK-024 save boundary unavailable.' } })
  }
  await page.route(pattern, handler)
  return { failed: () => failed, dispose: () => page.unroute(pattern, handler) }
}

// ── The journey ──────────────────────────────────────────────────────────

test('JOURNEY-023: hands-off EMOM targets follow the scheduled minute, survive background and refresh, and save to Summary without fabricated work', async ({ page, visit, checkA11y, world, modelPosts }) => {
  test.setTimeout(240_000)
  const [rising, fixed] = world.catalog
  const first = movement(page, 1, rising.id)
  const second = movement(page, 2, fixed.id)
  const timer = page.getByRole('timer', { name: 'Time remaining', exact: true })
  const sessionTime = page.getByRole('timer', { name: 'Session time', exact: true })
  const countdown = page.locator('[data-urgent]').filter({ has: timer })

  await page.clock.install({ time: Date.now() })
  await visit('/workout')
  await expect(page.getByRole('list', { name: 'Movements in this EMOM', exact: true })).toBeVisible()

  // Ready: the schedule is stated before the clock runs, and nothing is a form.
  await expect(page.getByText('NOT STARTED', { exact: true })).toBeVisible()
  await expect(first.getByText('MIN 1 · 6 reps', { exact: true })).toBeVisible()
  await expect(first.getByText('Each turn: 6-8-10', { exact: true })).toBeVisible()
  await expect(second.getByText('MIN 2 · 12 reps', { exact: true })).toBeVisible()
  await expectHandsOff(page)

  // The one tap: start. Everything after it is the clock's.
  await page.getByRole('button', { name: 'Start EMOM', exact: true }).click()
  // The block's clock is the stored start; every jump below is relative to it.
  const emomStart = await page.waitForFunction((blockId) => {
    const records = JSON.parse(localStorage.getItem('clear.workout-emom') ?? '{}') as
      Record<string, { startedAt: string | null } | undefined>
    const startedAt = records[blockId]?.startedAt
    return startedAt == null ? null : Date.parse(startedAt)
  }, world.emomBlockId).then((handle) => handle.jsonValue() as Promise<number>)
  // Scanned while the clock still runs: axe schedules its own timers.
  await checkA11y()
  await page.clock.pauseAt(emomStart + 10_000)
  const sessionAtStart = (await sessionTime.textContent()) ?? ''

  await expect(page.getByText('MIN 1 OF 6', { exact: true })).toBeVisible()
  await expect(page.getByText('WORK', { exact: true })).toBeVisible()
  // On a phone the countdown is in view without scrolling, so it can be read
  // from across the room.
  await expect(timer).toBeInViewport()
  await expect(first).toHaveAttribute('aria-current', 'step')
  await expect(first.getByText('MIN 1 · 6 reps', { exact: true })).toBeVisible()
  await expectHandsOff(page)

  // The end-of-minute cue, then the rest window — with nothing to press.
  await page.clock.pauseAt(emomStart + 52_000)
  await expect(timer).toContainText('00:08')
  await expect(countdown).toHaveAttribute('data-urgent', 'true')
  await expect(page.getByText('REST', { exact: true })).toBeVisible()
  await expect(second.getByText('Next', { exact: true })).toBeVisible()
  await expectHandsOff(page)

  // Boundary: minute 2 is the second movement's, with no tap; the cue resets.
  await page.clock.pauseAt(emomStart + 61_000)
  await expect(page.getByText('MIN 2 OF 6', { exact: true })).toBeVisible()
  await expect(countdown).toHaveAttribute('data-urgent', 'false')
  await expect(second).toHaveAttribute('aria-current', 'step')
  await expect(second.getByText('MIN 2 · 12 reps', { exact: true })).toBeVisible()
  await expect(first.getByText('MIN 3 · 8 reps', { exact: true })).toBeVisible()

  // Backgrounded (phone in a pocket) into minute 3: the rotation, the risen
  // target and the countdown are the wall clock's.
  await background(page, emomStart + 160_000)
  await expect(page.getByText('MIN 3 OF 6', { exact: true })).toBeVisible()
  await expect(page.getByText('WORK', { exact: true })).toBeVisible()
  await expect(first).toHaveAttribute('aria-current', 'step')
  await expect(first.getByText('MIN 3 · 8 reps', { exact: true })).toBeVisible()
  await expect(timer).toContainText('00:20')
  await expect(countdown).toHaveAttribute('data-urgent', 'false')

  // Into its rest window: the end-of-minute cue, and the schedule looks ahead.
  await page.clock.pauseAt(emomStart + 172_000)
  await expect(timer).toContainText('00:08')
  await expect(countdown).toHaveAttribute('data-urgent', 'true')
  await expect(page.getByText('REST', { exact: true })).toBeVisible()
  await expect(second.getByText('Next', { exact: true })).toBeVisible()
  await expect(first.getByText('MIN 5 · 10 reps', { exact: true })).toBeVisible()

  // Refreshed inside minute 5: restored from the stored start, not restarted.
  // The boot runs on a live clock; the reading is then pinned to an exact second.
  await page.clock.resume()
  await page.reload()
  await expect(page.locator('main h1')).toHaveAccessibleName('Workout', { timeout: 30_000 })
  await page.clock.pauseAt(emomStart + 280_000)
  await expect(page.getByText('MIN 5 OF 6', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start EMOM', exact: true })).toHaveCount(0)
  await expect(first).toHaveAttribute('aria-current', 'step')
  await expect(first.getByText('MIN 5 · 10 reps', { exact: true })).toBeVisible()
  await expect(second.getByText('MIN 6 · 12 reps', { exact: true })).toBeVisible()
  await expect(timer).toContainText('00:20')
  await expectHandsOff(page)

  // The restored countdown still crosses into its cue at the end of the minute.
  await page.clock.pauseAt(emomStart + 292_000)
  await expect(timer).toContainText('00:08')
  await expect(countdown).toHaveAttribute('data-urgent', 'true')

  // Expiry: the schedule ends; nothing claims the work was performed.
  await page.clock.pauseAt(emomStart + 400_000)
  await expect(page.getByText('COMPLETE', { exact: true })).toBeVisible()
  await expect(timer).toContainText('00:00')
  await expect(page.getByText(/The clock has run every prescribed minute/)).toBeVisible()
  await expect(first.getByText('6-8-10 reps', { exact: true })).toBeVisible()
  await expectHandsOff(page)

  // The global session clock is untouched by the EMOM: it kept counting
  // through the background, the refresh and the expiry.
  const sessionAtEnd = (await sessionTime.textContent()) ?? ''
  expect(sessionAtEnd).not.toBe(sessionAtStart)

  // The rest of the journey is network and navigation, on a running clock.
  await page.clock.resume()

  // Save recovery: the shared forward action fails once, the athlete stays on
  // the EMOM with its state intact, and the retry is the same action again.
  const failure = await failFirstBlockSave(page)
  try {
    await page.getByRole('button', { name: 'Next section', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('That didn’t save')
    expect(failure.failed()).toBe(1)
    await expect(page.getByText('COMPLETE', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
  } finally {
    await failure.dispose()
  }
  await expect(page.getByRole('list', { name: 'Movements in this EMOM', exact: true })).toHaveCount(0)

  // Last section, then Summary.
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/summary', { timeout: 30_000 })
  await expect(page.locator('main h1')).toHaveAccessibleName('Nice work', { timeout: 30_000 })
  await expect(page.getByText(`${TITLE}, done.`, { exact: true })).toBeVisible()
  await checkA11y()

  // The rows: one EMOM result (the failed attempt wrote nothing, the retry
  // wrote once) with no minutes the clock produced, no effort, and no set
  // logged for its movements.
  expect(await world.sessionState()).toBe('completed')
  const emomRows = (await world.blockResults()).filter((row) => row.block_id === world.emomBlockId)
  expect(emomRows).toHaveLength(1)
  expect(emomRows[0]).toMatchObject({
    minutes_completed: null, rounds_completed: null, elapsed_seconds: null, perceived_effort: null,
  })
  expect(await world.emomSetLogs()).toEqual([])
  expect(modelPosts()).toBe(0)
})
