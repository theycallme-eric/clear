/**
 * TASK-040 additive before-state consumer proposal. Source is not evidence.
 * Consumes TASK-033's unchanged camera and inventory. All setup rows belong
 * to one real disposable actor per case; auth deletion is the cleanup boundary.
 * Generation responses are synthetic, locally fulfilled, and never forwarded.
 * Run only through the approved execution-support browser wrapper; selecting
 * the existing mobile project by its full-title grep remains operator-owned.
 */
import { createHash, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { Page, Route, TestInfo } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { sessionAcceptanceSchema } from '../../src/state/schemas'
import { expect, test } from '../fixtures'
import { backend } from '../support/backend'
import { captureIdentity, capturePairId, captureTarget } from './capture'
import { installDeterministicCapture, playwrightCaptureDriver } from './fixtures'
import {
  baselineEntry, BASELINE_INVENTORY_PATH, CAPTURE_VIEWPORTS,
  readBaselineInventory, VIEWPORT_OF_PROJECT,
  type CaptureSkin, type CaptureTarget,
} from './state-inventory'

const SOURCE_FILE = 'e2e/design-0143/task-040-home-review.spec.ts'
const REST = '**/rest/v1/**'
const MODEL = '**/functions/v1/generate-workout'
const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const FAILED_READ = { code: 'PGRST000', message: 'Isolated capture read unavailable.', details: null }
type Actor = { id: string; email: string; token: string; refreshToken: string }
type Catalogued = { id: string; default_equipment: string }
type Persisted = {
  session: { id: string }
  sections: { blocks: { exercises: { exercise: { id: string } }[] }[] }[]
}
type Key = { screen: string; route: string | null; state: string }
type Oracle = () => Promise<void>
const home = (state: string): Key => ({ screen: 'Home', route: '/', state })
const review = (state: string): Key => ({ screen: 'Review', route: '/review', state })
const loading = (state: string): Key => ({ screen: 'Loading', route: null, state })
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const pathname = (page: Page) => new URL(page.url()).pathname
const heading = (page: Page, name: string) =>
  expect(page.locator('main h1')).toHaveAccessibleName(name, { timeout: 30_000 })
const text = (page: Page, value: string | RegExp) =>
  expect(page.locator('main').getByText(value, { exact: typeof value === 'string' }).first()).toBeVisible()
const alert = (page: Page, title: string) => page.locator('main').getByRole('alert').filter({ hasText: title })
const status = (page: Page, label: string) => page.locator('main').getByRole('status').filter({
  // CORE-04's native slow threshold may elapse during an actual capture. This
  // is still the held read, not a claim that the original label stayed frozen.
  hasText: new RegExp(`${label}|Taking longer than usual`),
}).first()
const day = (offset = 0) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}
function deferred() {
  let release!: () => void
  const wait = new Promise<void>((resolve) => { release = resolve })
  return { wait, release }
}
function must<T>(answer: { ok: boolean; status: number; body: unknown }, operation: string): T {
  // No response body, actor identifier, email or credential is an assertion operand.
  expect(answer.ok, `${operation}: HTTP status ${answer.status}`).toBe(true)
  return answer.body as T
}
async function answer(route: Route, code: number, body: unknown) {
  await route.fulfill({ status: code, headers: CORS, json: body })
}

/** Same safe packet shape as entry-settings; separate precise producer identity. */
function recorder(page: Page, testInfo: TestInfo, skin: CaptureSkin,
  generation: () => { requests: number; forwarded: 0; blockedUnexpected: number }) {
  const identity = captureIdentity()
  expect(identity.packageVersion).toBe('0.9.7')
  const inventory = readBaselineInventory()
  const viewportId = VIEWPORT_OF_PROJECT[testInfo.project.name]
  if (!viewportId) throw new Error('TASK-040 requires an existing viewport project')
  const viewport = CAPTURE_VIEWPORTS.find((v) => v.id === viewportId)!
  const native = playwrightCaptureDriver(page, testInfo)
  const driver = { ...native, async screenshot(name: string) {
    const path = testInfo.outputPath(name)
    const bytes = await page.screenshot({ path, caret: 'hide', mask: [
      page.getByLabel('Email'), page.getByLabel('Code'),
      page.getByText(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
      page.locator('main p').filter({ hasText: /[^\s@]+@[^\s@]+\.[^\s@]+/ }),
    ] })
    await testInfo.attach(name, { path, contentType: 'image/png' })
    return bytes
  } }
  const records: unknown[] = []
  const transitions: unknown[] = []
  const dispositions: unknown[] = []
  const fixtures: string[] = []
  const pairs = new Set<string>()
  let sequence = 0
  const ref = (key: Key) => {
    expect(baselineEntry(inventory, key.screen, key.route)?.states).toContain(key.state)
    return { task: inventory.task, inventory: BASELINE_INVENTORY_PATH, mainSha: inventory.mainSha, ...key }
  }
  async function reached(path: string, title: string, oracle: Oracle) {
    await expect(page).toHaveURL((url) => url.pathname === path)
    await heading(page, title)
    await oracle()
    expect(page.viewportSize()).toEqual({ width: viewport.width, height: viewport.height })
    await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
  }
  async function surface(key: Key, path: string, title: string, oracle: Oracle, variant: string) {
    const baseline = ref(key)
    await reached(path, title, oracle)
    const motion = await driver.motion()
    const name = `home-review-${slug(testInfo.title)}-${++sequence}-${slug(key.screen)}-${slug(key.state)}-${viewportId}-${skin}-${slug(variant)}.png`
    const bytes = await driver.screenshot(name)
    records.push({ phase: 'before', kind: key.route === null ? 'non-route-surface' : 'route-variant',
      ...key, baseline, identity, viewport, skin,
      reached: { pathname: pathname(page), heading: title, stateVisible: true }, motion,
      variant, screenshot: { name, sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.byteLength, explicit: true }, deterministic: true, liveGeneration: false })
  }
  return {
    async take(key: Key, path: string, title: string, oracle: Oracle, variant?: string) {
      ref(key)
      const target: CaptureTarget = { screen: key.screen, route: key.route ?? 'non-route',
        state: key.state, path, heading: title, stateText: '' }
      const pair = capturePairId(target, viewportId, skin)
      if (key.route === null || variant || pairs.has(pair)) {
        await surface(key, path, title, oracle, variant ?? 'additional-observation')
        return
      }
      expect(key.route === path, 'a canonical picture depicts its actual source route').toBe(true)
      await reached(path, title, oracle)
      const strict = { ...driver, async observe() {
        await reached(path, title, oracle)
        return { pathname: pathname(page), heading: title, stateVisible: true }
      } }
      records.push(await captureTarget(strict, { target, viewport: viewportId, skin, identity }))
      pairs.add(pair)
    },
    async transition(key: Key, requested: string, destination: string, title: string, oracle: Oracle) {
      await surface(key, destination, title, oracle, 'transition-destination')
      transitions.push({ kind: 'transition', baseline: ref(key), requestedPath: requested,
        actualDestination: destination, actualHeading: title })
    },
    disposition(key: Key, reason: string, sources: string[]) {
      dispositions.push({ kind: 'source-branch-disposition', baseline: ref(key), reason, sources,
        renderedClaim: false, status: 'pending-acceptance-review' })
    },
    fixture(name: string) { if (!fixtures.includes(name)) fixtures.push(name) },
    finish() {
      const path = testInfo.outputPath('task040-states.json')
      writeFileSync(path, JSON.stringify({ version: 1, task: 'TASK-040', consumer: 'home-review',
        caseTitle: testInfo.title, project: testInfo.project.name, sourceFile: SOURCE_FILE,
        identity, status: testInfo.status, records, transitions, dispositions, fixtures,
        generation: generation(), liveGeneration: false }, null, 2))
      return testInfo.attach('task040-states', { path, contentType: 'application/json' })
    },
  }
}

/** A held fault must match the owned actor/record before it can answer. */
async function fault(page: Page, matches: (route: Route) => boolean) {
  const held = deferred()
  const arrived = deferred()
  let posts = 0
  const handler = async (route: Route) => {
    if (!matches(route)) return route.fallback()
    posts += 1
    arrived.release()
    await held.wait
    await answer(route, 503, FAILED_READ)
  }
  await page.route(REST, handler)
  return { reached: arrived.wait, release: held.release, attempts: () => posts,
    async dispose() { held.release(); await page.unroute(REST, handler) } }
}
const ownedGet = (table: string, field: string, value: string) => (route: Route) => {
  const request = route.request()
  const url = new URL(request.url())
  return request.method() === 'GET' && url.pathname.endsWith(`/rest/v1/${table}`) &&
    url.searchParams.get(field) === `eq.${value}`
}
const ownedRpc = (rpc: string, field: string, value: string) => (route: Route) => {
  const request = route.request()
  return request.method() === 'POST' && new URL(request.url()).pathname.endsWith(`/rest/v1/rpc/${rpc}`) &&
    (request.postDataJSON() as Record<string, unknown>)[field] === value
}

test.describe('TASK-040 — Home and Review additive before-state artifacts', () => {
  test.use({ timezoneId: 'UTC' })
  test.describe.configure({ mode: 'default' })
  let client: ReturnType<typeof backend.client>
  let actor: Actor
  let catalog: Catalogued[]
  let locationId: string
  let actorIds: string[] = []
  let save: ReturnType<typeof recorder>
  let ready = false
  let observed = 0
  let expectedLocalPosts = 0
  let blocked: () => number

  test.beforeEach(async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    expect(backend.available, backend.reason).toBe(true)
    client = backend.client()
    actorIds = []
    ready = false
    expectedLocalPosts = 0
    observed = 0
    catalog = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
      select: 'id,default_equipment', order: 'id.asc', limit: '2',
    }), 'Fixture catalog read')
    expect(catalog.length).toBe(2)
    expect(catalog.every((row) => typeof row.id === 'string' && row.id.length > 0 &&
      typeof row.default_equipment === 'string' && row.default_equipment.length > 0)).toBe(true)
    const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
    const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t040-home-review-${suffix}@example.com`
    try {
      const prior = await client.findUserByEmail(email)
      if (prior) await client.deleteUser(prior.id)
      const created = await client.ensureConfirmedUser(email)
      actorIds.push(created.id) // track before minting, including partial setup failures
      const session = await client.mintSession(email)
      actor = { id: created.id, email, token: session.accessToken, refreshToken: session.refreshToken }
    } catch {
      throw new Error('TASK-040 scoped authentication failed; no response body retained.')
    }
    must(await client.rpcAs('complete_onboarding', {
      p_location_name: 'TASK-040 isolated Home Review gym', p_location_tier: 'full',
      p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((row) => row.default_equipment)])],
      p_experience_level: 'some', p_goal_preset: 'balanced',
      p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
    }, actor.token), 'Fixture onboarding')
    const locations = must<Array<{ id: string }>>(await client.selectAs('locations', {
      select: 'id', user_id: `eq.${actor.id}`,
    }, actor.token), 'Owned fixture location read')
    expect(locations.length).toBe(1)
    expect(typeof locations[0]?.id === 'string').toBe(true)
    locationId = locations[0].id
    await page.addInitScript((session) => {
      localStorage.setItem('clear.auth.session', JSON.stringify(session))
    }, { accessToken: actor.token, refreshToken: actor.refreshToken,
      expiresAt: Date.now() + 60 * 60 * 1000, user: { id: actor.id, email: actor.email } })
    const skin: CaptureSkin = testInfo.title.includes('read boundaries') ? 'mono'
      : testInfo.title.includes('progression') ? 'vapour'
        : testInfo.title.includes('suggestion') || testInfo.title.includes('regeneration') ? 'signal' : 'clear'
    const guard = await installDeterministicCapture(page, { skin })
    blocked = guard.blockedGenerations
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/functions\/v1\/generate-/.test(new URL(request.url()).pathname)) observed += 1
    })
    save = recorder(page, testInfo, skin, () => ({ requests: observed, forwarded: 0, blockedUnexpected: blocked() }))
    save.fixture('Real per-case namespaced actor, catalog-backed prescriptions, authenticated onboarding and cascading exact-user cleanup')
    ready = true
  })
  test.afterEach(async () => {
    try {
      if (ready) {
        await save.finish() // retain partial/failing proof before cleanup/assertion
        expect(blocked(), 'any unexpected generation is a failed capture, not success').toBe(0)
        expect(observed, 'all observed model POSTs must be explicitly local fixtures').toBe(expectedLocalPosts)
      }
    } finally {
      for (const id of actorIds) {
        try { await client.deleteUser(id) } catch { throw new Error('TASK-040 scoped cleanup failed.') }
      }
      actorIds = []
    }
  })

  function acceptance(title: string, offset = 1, focus: 'upper_body' | 'lower_body' | 'full_body' = 'full_body') {
    return sessionAcceptanceSchema.parse({ date: day(offset), location_id: locationId,
      session_focus: focus, goal_preset: 'balanced', requested_duration_mins: 30,
      effective_duration_target_mins: 30, computed_duration_mins: null,
      requested_intensity: 5, effective_intensity: 5, adjustment_reason: null,
      generation_notes: null, prompt_version: 'e2e', contract_version: '4.1.0',
      workout: { title, overview: 'Catalog-backed isolated fixture; not model-created.', estimated_duration_mins: 30,
        sections: [{ section_type: 'primary_lift', section_title: 'Standard', section_notes: null,
          blocks: [{ structure_type: 'standard', rounds: null, timer_type: 'none', timer_seconds: null,
            round_rest_seconds: null, rep_scheme: 'fixed', block_notes: null,
            exercises: [{ exercise_id: catalog[0].id, equipment: catalog[0].default_equipment,
              session_function: 'primary', anchor_relationship: 'neutral', modality: 'reps', sets: 2,
              target_kind: 'fixed', target_value: 8, target_min: null, target_max: null,
              target_sequence: null, per_side: false, distance_unit: null, rest_seconds: 10,
              tempo: null, load_type: 'none', load_value: null, is_interval_exercise: false }] }] }] } })
  }
  const persist = async (title: string, offset = 1, focus: 'upper_body' | 'lower_body' | 'full_body' = 'full_body') =>
    must<Persisted>(await client.rpcAs('persist_session', { p_user_id: actor.id,
      p_session: acceptance(title, offset, focus) }, actor.token), 'Fixture persistence')
  async function complete(title: string, offset = 1, focus: 'upper_body' | 'lower_body' | 'full_body' = 'full_body') {
    const stored = await persist(title, offset, focus)
    expect(must<{ outcome: string }>(await client.rpcAs('start_session', {
      p_session_id: stored.session.id,
    }, actor.token), 'Fixture start').outcome).toBe('started')
    must(await client.insertAs('exercise_set_logs', { id: randomUUID(),
      workout_exercise_id: stored.sections[0].blocks[0].exercises[0].exercise.id,
      set_number: 1, actual_reps: 8, weight: 0, weight_unit: 'kg',
    }, actor.token), 'Fixture actual-work log')
    expect(must<{ outcome: string }>(await client.rpcAs('complete_session', {
      p_session_id: stored.session.id, p_actual_duration_mins: 30,
    }, actor.token), 'Fixture completion').outcome).toBe('completed')
    return stored
  }
  async function favoritesTab(page: Page) {
    await page.getByRole('tab', { name: 'Favorites', exact: true }).click()
  }
  async function saveFavorite(page: Page, visit: (path: string) => Promise<void>, session: Persisted, title: string) {
    await visit(`/history/${session.session.id}`)
    await heading(page, title)
    await page.getByRole('button', { name: 'Save as favorite', exact: true }).click()
    await expect(page.locator('main').getByRole('status').filter({ hasText: 'Saved to favorites' })).toBeVisible()
    const rows = must<Array<{ id: string }>>(await client.selectAs('saved_workouts', {
      select: 'id', user_id: `eq.${actor.id}`, original_session_id: `eq.${session.session.id}`,
    }, actor.token), 'Owned favorite read')
    expect(rows.length).toBe(1)
    return rows[0].id
  }
  async function openFavorite(page: Page, visit: (path: string) => Promise<void>, title: string) {
    await visit('/')
    await heading(page, 'Today')
    await favoritesTab(page)
    await page.getByRole('list', { name: 'Favorites', exact: true }).getByRole('listitem')
      .filter({ hasText: title }).getByRole('button', { name: 'Start', exact: true }).click()
    await heading(page, title)
    await expect(page).toHaveURL((url) => url.pathname === '/review')
  }

  test('Home: genuine empty and populated history and favorites', async ({ page, visit }) => {
    await visit('/')
    await save.take(home('no-history'), '/', 'Today', async () => {
      await text(page, 'No workouts yet')
      await expect(page.getByRole('list', { name: 'Recent workouts', exact: true })).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Suggested next', exact: true })).toHaveCount(0)
    })
    await favoritesTab(page)
    await save.take(home('favorites-empty'), '/', 'Today', () => text(page, 'No favorites yet'))
    const title = 'TASK-040 Home completed fixture'
    const done = await complete(title)
    await visit('/')
    await save.take(home('history-populated'), '/', 'Today', async () => {
      await expect(page.getByRole('list', { name: 'Recent workouts', exact: true })
        .getByRole('link', { name: title, exact: true })).toBeVisible()
    })
    await saveFavorite(page, visit, done, title)
    await visit('/')
    await favoritesTab(page)
    await save.take(home('favorites-populated'), '/', 'Today', async () => {
      const row = page.getByRole('list', { name: 'Favorites', exact: true }).getByRole('listitem').filter({ hasText: title })
      await expect(row.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
      await expect(row.getByRole('button', { name: 'Remove from favorites', exact: true })).toBeEnabled()
    })
  })

  test('Home: independent read boundaries and actual Retry recovery', async ({ page, visit }) => {
    const definitions = [
      { member: 'week-rest-days', match: ownedGet('rest_days', 'user_id', actor.id),
        pending: 'Reading your training week', failed: 'This week didn’t load' },
      { member: 'streak-rpc', match: ownedRpc('streak_sessions', 'p_user_id', actor.id),
        pending: 'Reading your streak', failed: 'Your streak didn’t load' },
      { member: 'favorites-list', match: ownedGet('saved_workouts', 'user_id', actor.id),
        pending: 'Reading your favorites', failed: 'Your favorites didn’t load' },
    ]
    for (const branch of definitions) {
      save.fixture(`Home read member ${branch.member}: held scoped read, safe 503, native Retry, genuine backend recovery`)
      const failure = await fault(page, branch.match)
      try {
        await visit('/')
        if (branch.member === 'favorites-list') await favoritesTab(page)
        await failure.reached
        await save.take(home('reads-loading'), '/', 'Today', async () => {
          await expect(status(page, branch.pending)).toBeVisible()
          await expect(status(page, branch.pending)).toHaveAttribute('aria-busy', 'true')
        }, branch.member)
        failure.release()
        await save.take(home('read-error-retry'), '/', 'Today', async () => {
          await expect(alert(page, branch.failed)).toBeVisible()
          await expect(alert(page, branch.failed).getByRole('button', { name: 'Retry', exact: true })).toBeEnabled()
        }, branch.member)
        if (branch.member === 'week-rest-days') {
          // The streak depends on rest-day policy: same failed read, not an independent second RPC failure.
          await save.take(home('read-error-retry'), '/', 'Today', () =>
            expect(alert(page, 'Your streak didn’t load')).toBeVisible(), 'streak-dependent-on-rest-days')
        }
        await failure.dispose()
        await alert(page, branch.failed).getByRole('button', { name: 'Retry', exact: true }).click()
        await heading(page, 'Today')
        await save.transition(home('read-error-retry'), '/', '/', 'Today', async () => {
          await expect(alert(page, branch.failed)).toHaveCount(0)
          if (branch.member === 'favorites-list') await text(page, 'No favorites yet')
          else if (branch.member === 'week-rest-days') await text(page, 'No sessions this week yet.')
          else await text(page, 'No streak yet. Sessions on consecutive days build one.')
        })
        expect(failure.attempts()).toBe(1)
      } finally { await failure.dispose() }
    }
    save.disposition(home('reads-loading'),
      'History/profile/location/constraint reads share BootGate initialization keys. Their cold pending branches replace the route tree with BootSequence, so they cannot honestly be Home source pictures. Active resume pending independently renders the ordinary QuickActions fallback, not a distinct loader.',
      ['src/state/boot-queries.ts:64-67', 'src/state/boot-queries.ts:87-93', 'src/app/BootSequence.tsx:109-116', 'src/app/ResumableSession.tsx:71-89'])
    save.disposition(home('read-error-retry'),
      'Home history errors would qualify recent workouts/week/suggestion, but BootGate consumes that same history error and replaces Home. Retry suggestion/recent-history failures therefore are source branches masked by Boot, not additional Home captures. Resume error is separately visible as the inline check-for-active-session failure, covered below.',
      ['src/app/Home.tsx:534-547', 'src/app/Home.tsx:706-726', 'src/state/boot-queries.ts:64-67', 'src/state/boot-queries.ts:87-93', 'src/app/BootSequence.tsx:109-116'])
    const resumeFailure = await fault(page, ownedRpc('resume_session', 'p_user_id', actor.id))
    try {
      await visit('/')
      await resumeFailure.reached
      resumeFailure.release()
      await save.take(home('read-error-retry'), '/', 'Today', () =>
        expect(alert(page, 'Couldn’t check for a workout in progress')).toBeVisible(), 'active-resume-read')
      await resumeFailure.dispose()
      await alert(page, 'Couldn’t check for a workout in progress').getByRole('button', { name: 'Retry', exact: true }).click()
      await save.transition(home('read-error-retry'), '/', '/', 'Today', async () => {
        await expect(alert(page, 'Couldn’t check for a workout in progress')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
      })
    } finally { await resumeFailure.dispose() }
  })

  test('Home: suggestion selected and dismissed, compatible and fallback entries', async ({ page, visit }) => {
    const title = 'TASK-040 compatible Home fixture'
    const incompleteTitle = 'TASK-040 incomplete Home fixture'
    const done = await complete(title, 1, 'upper_body')
    const unstarted = await persist(incompleteTitle, 2)
    await complete('TASK-040 older Home fixture', 3, 'lower_body')
    await visit('/')
    const suggestion = page.getByRole('region', { name: 'Suggested next', exact: true })
    await save.take(home('suggestion-selected-dismissed'), '/', 'Today', async () => {
      await expect(suggestion).toBeVisible()
      await expect(suggestion.getByRole('button', { name: 'Use this', exact: true })).toBeEnabled()
      await expect(suggestion.getByRole('button', { name: 'Dismiss', exact: true })).toBeEnabled()
    }, 'recommendation-offered-before-selection')
    await suggestion.getByRole('button', { name: 'Use this', exact: true }).click()
    await save.transition(home('suggestion-selected-dismissed'), '/', '/generate', 'Generate workout', async () => {
      const url = new URL(page.url())
      expect(url.searchParams.has('focus')).toBe(true)
      expect(url.searchParams.has('intensity')).toBe(true)
      await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
    })
    await visit('/')
    await expect(suggestion).toBeVisible()
    await suggestion.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await save.take(home('suggestion-selected-dismissed'), '/', 'Today', async () => {
      await expect(suggestion).toHaveCount(0)
      expect(await page.evaluate(() => localStorage.getItem('clear.home-suggestion') !== null)).toBe(true)
    }, 'dismissed-for-today')
    await visit('/')
    await save.take(home('suggestion-selected-dismissed'), '/', 'Today', () =>
      expect(suggestion).toHaveCount(0), 'dismissal-survives-real-route-reload')
    const recents = page.getByRole('list', { name: 'Recent workouts', exact: true })
    const compatible = recents.getByRole('link', { name: title, exact: true })
    await save.take(home('compatible-review-entry'), '/', 'Today', () => expect(compatible).toBeVisible())
    await compatible.click()
    await save.transition(home('compatible-review-entry'), '/', '/review', title, () =>
      expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled())
    await visit('/')
    let incompleteIntendedReads = 0
    const incompleteSpy = async (route: Route) => {
      if (ownedRpc('session_as_intended_at_start', 'p_session_id', unstarted.session.id)(route)) incompleteIntendedReads += 1
      return route.fallback()
    }
    await page.route(REST, incompleteSpy)
    try {
      await save.take(home('incompatible-detail-fallback'), '/', 'Today', () =>
        expect(recents.getByRole('link', { name: incompleteTitle, exact: true })).toBeVisible(), 'incomplete-prescribed-before-activation')
      await recents.getByRole('link', { name: incompleteTitle, exact: true }).click()
      await save.transition(home('incompatible-detail-fallback'), '/', `/history/${unstarted.session.id}`, incompleteTitle, async () => {
        await text(page, 'Only a completed workout can be restarted.')
        await expect(page.getByRole('button', { name: 'Restart', exact: true })).toHaveCount(0)
        expect(incompleteIntendedReads).toBe(0)
      })
    } finally { await page.unroute(REST, incompleteSpy) }
    for (const member of ['legacy-contract', 'invalid-restart-workout', 'unreadable-prescription'] as const) {
      save.fixture(`Home fallback ${member}: owned completed backing record, scoped intended-at-start boundary fixture; durable Detail remains real`)
      let reads = 0
      const handler = async (route: Route) => {
        if (!ownedRpc('session_as_intended_at_start', 'p_session_id', done.session.id)(route)) return route.fallback()
        reads += 1
        if (member === 'unreadable-prescription') return answer(route, 503, FAILED_READ)
        const response = await route.fetch() // domain reconstruction only, NEVER a model endpoint
        if (!response.ok()) throw new Error('Owned real reconstruction read failed')
        const body = await response.json() as { session: Record<string, unknown>; sections: unknown[] }
        if (typeof body.session !== 'object' || body.session === null || !Array.isArray(body.sections)) {
          throw new Error('Owned real reconstruction shape changed')
        }
        await route.fulfill({ response, json: member === 'legacy-contract'
          ? { ...body, session: { ...body.session, contract_version: '3.0.0' } }
          : { ...body, sections: [] } })
      }
      await page.route(REST, handler)
      try {
        await visit('/')
        await save.take(home('incompatible-detail-fallback'), '/', 'Today', () => expect(compatible).toBeVisible(), `${member}-before-activation`)
        await compatible.click()
        await save.transition(home('incompatible-detail-fallback'), '/', `/history/${done.session.id}`, title, async () => {
          await text(page, 'Standard')
          await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeEnabled()
        })
        expect(reads).toBe(1)
      } finally { await page.unroute(REST, handler) }
    }
  })

  test('Home: real active session Resume handoff', async ({ page, visit }) => {
    const title = 'TASK-040 Home active fixture'
    const stored = await persist(title, 0)
    expect(must<{ outcome: string }>(await client.rpcAs('start_session', {
      p_session_id: stored.session.id,
    }, actor.token), 'Fixture start').outcome).toBe('started')
    await visit('/')
    await save.take(home('active-session-resume'), '/', 'Today', async () => {
      await text(page, `In progress · ${title}`)
      await expect(page.getByRole('button', { name: 'Resume workout', exact: true })).toBeEnabled()
      await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toHaveCount(0)
    })
    await page.getByRole('button', { name: 'Resume workout', exact: true }).click()
    await save.transition(home('active-session-resume'), '/', '/workout', 'Workout', async () => {
      await text(page, 'Standard')
      await expect(page.getByRole('button', { name: 'Finish workout', exact: true })).toBeVisible()
    })
  })

  test('Review: favorite progression loading, both read depths, error and Retry', async ({ page, visit }) => {
    const title = 'TASK-040 favorite progression fixture'
    const done = await complete(title)
    const favoriteId = await saveFavorite(page, visit, done, title)
    const branches = [
      { member: 'attempts-list', match: ownedGet('saved_workout_completions', 'saved_workout_id', favoriteId) },
      { member: 'performed-reconstruction', match: ownedRpc('session_as_performed', 'p_session_id', done.session.id) },
    ]
    for (const branch of branches) {
      save.fixture(`Review progression ${branch.member}: held exact owned read, safe 503, native Retry, real completion recovery`)
      const failure = await fault(page, branch.match)
      try {
        await openFavorite(page, visit, title)
        await failure.reached
        await save.take(review('favorite-progression-loading'), '/review', title, async () => {
          await expect(status(page, 'Reading what happened last time')).toBeVisible()
          await expect(status(page, 'Reading what happened last time')).toHaveAttribute('aria-busy', 'true')
          await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled()
        }, branch.member)
        failure.release()
        const failed = alert(page, 'Your history for this one didn’t load')
        await save.take(review('favorite-progression-error-retry'), '/review', title, async () => {
          await expect(failed).toBeVisible()
          await expect(failed.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled()
          await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled()
        }, branch.member)
        await failure.dispose()
        await failed.getByRole('button', { name: 'Retry', exact: true }).click()
        await save.transition(review('favorite-progression-error-retry'), '/review', '/review', title, async () => {
          await expect(failed).toHaveCount(0)
          await text(page, 'Last time')
          await text(page, /^Completed once · /)
          await text(page, 'First attempt recorded. Nothing to compare it against yet.')
        })
        expect(failure.attempts()).toBe(1)
      } finally { await failure.dispose() }
    }
    save.disposition(review('swap-confirmation'),
      'No native Review swap action, provider or confirmation is implemented. Review renders prescription details/load suggestions and Start/Regenerate. Workout swap UI and the D6 backend pre-start write are not Review UI evidence.',
      ['src/app/Review.tsx:243-333', 'src/app/Review.tsx:525-557', 'src/app/ReviewRoute.tsx:133-178', 'e2e/d6-swap-persistence.spec.ts:282-320'])
    save.disposition(review('swap-failure'),
      'No native Review swap dispatch/error branch is implemented. The generation swapSection client is not consumed by this screen; a Workout swap failure cannot cover this Review inventory label.',
      ['src/app/Review.tsx:243-333', 'src/app/Review.tsx:525-557', 'src/data/generation.ts:427-443'])
  })

  test('Review: regeneration Cancel discards and local Loading success enters Review', async ({ page, visit }) => {
    const original = 'TASK-040 regeneration original'
    const replacement = 'TASK-040 locally supplied replacement'
    const done = await complete(original)
    let held = deferred()
    let localPosts = 0
    const handler = async (route: Route) => {
      if (route.request().method() === 'OPTIONS') return answer(route, 204, null)
      if (route.request().method() !== 'POST') return route.fallback()
      localPosts += 1
      // An extra request falls through to TASK-033's counted abort guard. It
      // must not be relabelled an expected synthetic request by this handler.
      if (localPosts > 2) return route.fallback()
      expectedLocalPosts += 1
      const requestId = route.request().headers()['x-request-id']
      if (!requestId) throw new Error('Real generation client omitted its request ID')
      const gate = held
      await gate.wait
      await answer(route, 200, { requestId, acceptance: acceptance(replacement, 0) })
    }
    // Installed AFTER the shared fail-closed guard; this narrow handler never
    // fetches/continues any model POST. Every other generate-* stays blocked.
    await page.route(MODEL, handler)
    save.fixture('Two actual generation-client POSTs held and locally supplied: first response delivered after ticket cancellation, valid synthetic second acceptance; provider forwarded zero')
    const enter = async () => {
      await visit('/')
      await page.getByRole('list', { name: 'Recent workouts', exact: true }).getByRole('link', { name: original, exact: true }).click()
      await heading(page, original)
      await page.getByRole('button', { name: 'Regenerate', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Discard this workout?', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Discard and regenerate', exact: true }).click()
      await heading(page, 'Generating session')
      await expect(page.locator('main').getByRole('status')).toContainText('Composing session')
    }
    try {
      await enter()
      await save.take(review('regenerating-cancel'), '/review', 'Generating session', async () => {
        await expect(page.locator('main').getByRole('status')).toHaveAttribute('aria-busy', 'true')
        await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled()
        expect(localPosts).toBe(1)
      })
      // Cancel invalidates the mutation ticket; it does not abort fetch. Wait
      // for the actual local late200 to finish before claiming it was ignored.
      const lateResponse = page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/functions/v1/generate-workout'))
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      held.release()
      const delivered = await lateResponse
      expect(delivered.status()).toBe(200)
      await delivered.finished()
      await page.waitForLoadState('networkidle')
      await save.transition(review('regenerating-cancel'), '/review', '/review', 'Nothing to review', async () => {
        await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
        await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toHaveCount(0)
        await expect(page.locator('main h1')).not.toHaveAccessibleName(original)
      })
      held = deferred()
      await enter()
      // There is no Loading success screen. Retain the actual pending source,
      // then a separate destination picture plus transition metadata.
      await save.take(loading('active-stage'), '/review', 'Generating session', async () => {
        await expect(page.locator('main').getByRole('status')).toContainText('Composing session')
        expect(localPosts).toBe(2)
      }, 'success-review-source')
      held.release()
      await save.transition(loading('success-review'), '/review', '/review', replacement, async () => {
        await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled()
        await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
        await expect(page.locator('main h1')).not.toHaveAccessibleName(original)
      })
      expect(localPosts).toBe(2)
      save.disposition(loading('success-review'),
        'Loading is rendered only for pending/error. Success is a real transition to the new Review briefing; destination evidence is not a fictional rendered Loading-success surface.',
        ['src/app/GenerationLoadingHost.tsx:65-77', 'src/app/ReviewRoute.tsx:98-107'])
      save.disposition(review('regenerating-cancel'),
        'When the composition has null location or goal, regenerationInput returns null and the confirmation redirects to Generate without a run. This is a non-regenerating fallback, not the pending/cancel surface captured with a real location here. Cancel discards the old handoff; it does not restore it.',
        ['src/state/review-handoff.ts:66-78', 'src/app/ReviewRoute.tsx:148-159', 'src/app/ReviewRoute.test.tsx:354-388'])
      // Cleanup has not been delegated to generation: the original remains an
      // owned completed backing row and is removed only with this case's actor.
      expect(typeof done.session.id === 'string').toBe(true)
    } finally {
      held.release()
      await page.unroute(MODEL, handler)
    }
  })
})
