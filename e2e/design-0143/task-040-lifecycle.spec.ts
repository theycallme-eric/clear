/**
 * TASK-040 supplemental artifact consumer — source is not executed evidence.
 * Uses the unchanged TASK-033 camera and the existing history-detail backend
 * recipe. Never calls a model, imports runtime code, or changes shared harness.
 * Do not count this source file as a completed baseline; only retained actual
 * records/images from a successful exact-head execution can populate manifest.
 */
import { createHash, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import type { Page, Route, TestInfo } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { expect, test } from '../fixtures'
import { backend } from '../support/backend'
import {
  buildCaptureRecord,
  captureIdentity,
  capturePairId,
  verifyReached,
  type CaptureRecord,
} from './capture'
import { installDeterministicCapture, playwrightCaptureDriver } from './fixtures'
import {
  baselineEntry,
  BASELINE_INVENTORY_PATH,
  CAPTURE_VIEWPORTS,
  readBaselineInventory,
  readBaselinePackages,
  type CaptureSkin,
  type CaptureTarget,
} from './state-inventory'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const TITLE = 'TASK-040 isolated structure spectrum'
const UNSTARTED_TITLE = 'TASK-040 isolated not-started session'
type Catalogued = { id: string; default_equipment: string }
type Actor = { id: string; email: string; token: string; refreshToken: string }
type Persisted = {
  session: { id: string }
  sections: { blocks: { exercises: { exercise: { id: string } }[] }[] }[]
}
type CoverageKey = { screen: string; route: string | null; state: string }
type Oracle = () => Promise<void>
type Counts = { modelPostsObserved: number; blockedModelPosts: number; forwardedModelPosts: 0 }
type SupplementalRecord = {
  schema: 1
  kind: 'task040-surface' | 'task040-transition'
  phase: 'before'
  baseline: { task: string; inventory: string; mainSha: string } & CoverageKey
  identity: ReturnType<typeof captureIdentity>
  skin: CaptureSkin
  viewport: { id: string; width: number; height: number }
  reached: { pathname: string; heading: string; stateVisible: true }
  screenshot: { name: string; sha256: string; bytes: number; explicit: true }
  motion: Awaited<ReturnType<ReturnType<typeof playwrightCaptureDriver>['motion']>>
  deterministic: true
  liveGeneration: false
}
type SavedRecord = (Omit<CaptureRecord, 'route'> | SupplementalRecord) & CoverageKey & {
  variant: string
  evidence: {
    disposition: 'rendered-state' | 'observed-transition'
    oracle: string
    variant: string
    network: Counts
    transition?: { from: { pathname: string; heading: string }; to: { pathname: string; heading: string } }
  }
}

const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const SOURCE_PATH: Readonly<Record<string, string>> = {
  Review: 'src/app/Review.tsx', Workout: 'src/app/Workout.tsx', Summary: 'src/app/Summary.tsx',
  History: 'src/app/useOpenHistorySession.ts', 'Session Detail': 'src/app/SessionDetail.tsx',
}
const day = (offset = 0) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

/** Never put an admin response body, actor, token or email into an assertion. */
function must<T>(answer: { ok: boolean; status: number; body: unknown }, operation: string): T {
  expect(answer.ok, `${operation}: HTTP status ${answer.status}`).toBe(true)
  return answer.body as T
}

function prescription(exercise: Catalogued, overrides: Record<string, unknown> = {}) {
  return {
    exercise_id: exercise.id,
    equipment: exercise.default_equipment,
    session_function: 'primary',
    anchor_relationship: 'neutral',
    modality: 'reps',
    sets: 2,
    target_kind: 'fixed',
    target_value: 8,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: 10,
    tempo: null,
    load_type: 'none',
    load_value: null,
    is_interval_exercise: false,
    ...overrides,
  }
}

/** A plain For Time is separate from the ladder dispatch override. */
function acceptance(catalog: Catalogued[], title = TITLE, offset = 1, spectrum = true) {
  const [one, two] = catalog
  const block = (structure: string, overrides: Record<string, unknown> = {}) => ({
    structure_type: structure,
    rounds: structure === 'circuit' ? 2 : null,
    timer_type: structure === 'emom' ? 'per_minute' : ['amrap', 'for_time'].includes(structure) ? 'countdown' : 'none',
    timer_seconds: ['emom', 'amrap', 'for_time'].includes(structure) ? 120 : null,
    round_rest_seconds: ['superset', 'circuit'].includes(structure) ? 10 : null,
    rep_scheme: 'fixed',
    block_notes: null,
    exercises: structure === 'superset'
      ? [prescription(one, { rest_seconds: 0 }), prescription(two, { rest_seconds: null })]
      : [prescription(one, { sets: ['amrap', 'for_time'].includes(structure) ? null : 2 })],
    ...overrides,
  })
  const sections = [
    ['Standard', 'primary_lift', block('standard')],
    ['Superset', 'accessory', block('superset')],
    ['Circuit', 'conditioning', block('circuit')],
    ['EMOM', 'conditioning', block('emom')],
    ['AMRAP', 'conditioning', block('amrap')],
    ['Plain For Time', 'conditioning', block('for_time')],
    ['Ladder', 'conditioning', block('for_time', {
      rep_scheme: 'ladder_up',
      exercises: [prescription(one, {
        target_kind: 'sequence', target_value: null, target_sequence: [2, 4, 6], sets: null,
      })],
    })],
  ] as const
  return {
    date: day(offset), location_id: null, session_focus: 'full_body', goal_preset: 'balanced',
    requested_duration_mins: 30, effective_duration_target_mins: 30,
    computed_duration_mins: null, requested_intensity: 5, effective_intensity: 5,
    adjustment_reason: null, generation_notes: null, prompt_version: 'e2e', contract_version: '4.1.0',
    workout: {
      title, overview: 'Isolated saved-workout fixture; not a model response.', estimated_duration_mins: 30,
      sections: (spectrum ? sections : sections.slice(0, 1)).map(([section_title, section_type, fixture]) => ({
        section_type, section_title, section_notes: null,
        blocks: [{ ...fixture, exercises: fixture.exercises.map((exercise) => ({
          ...exercise,
          session_function: section_type === 'primary_lift' ? 'primary' : section_type === 'accessory' ? 'accessory' : 'conditioning',
        })) }],
      })),
    },
  }
}

/** Scoped wire faults use safe synthetic errors; everything else remains real. */
async function fault(page: Page, tail: string, method: string, hold = false) {
  let release!: () => void
  let arrived!: () => void
  const reached = new Promise<void>((resolve) => { arrived = resolve })
  const pending = new Promise<void>((resolve) => { release = resolve })
  const pattern = `**/rest/v1/${tail}*`
  const handler = async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    if (route.request().method() !== method) return route.fallback()
    arrived()
    if (hold) await pending
    await route.fulfill({ status: 503, headers: CORS, json: { code: 'PGRST000', message: 'Isolated capture read/write unavailable.' } })
  }
  await page.route(pattern, handler)
  return {
    reached,
    release,
    dispose: async () => { release(); await page.unroute(pattern, handler) },
  }
}

/** Local helper only: consumes the tested camera; does not alter its API. */
function recorder(page: Page, testInfo: TestInfo, skin: CaptureSkin, counts: () => Counts) {
  const camera = playwrightCaptureDriver(page, testInfo)
  const identity = captureIdentity()
  const inventory = readBaselineInventory()
  expect(identity.packageVersion).toBe(readBaselinePackages().before)
  expect(identity.applicationCommit).not.toBeNull()
  const saved: SavedRecord[] = []
  const beforeFindings: Array<{
    kind: 'known-before-layout-constraint'
    screen: string; route: string; variant: string; control: string
    viewport: { width: number; height: number }
    rect: { x: number; y: number; width: number; height: number }
    bottom: number; requiredMaxBottom: number; overflow: number
    containmentPassed: boolean; afterAcceptanceRequirement: string
  }> = []
  const viewport = () => {
    const size = page.viewportSize()
    const declared = CAPTURE_VIEWPORTS.find((candidate) => candidate.width === size?.width && candidate.height === size?.height)
    expect(declared, 'Actual capture dimensions must match one recorded viewport').toBeDefined()
    return declared!
  }
  async function persist(record: SavedRecord) {
    const json = record.screenshot.name.replace(/\.png$/, '.json')
    const path = testInfo.outputPath(json)
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    // Path attachments survive the execution-support JSON reporter conversion.
    await testInfo.attach(json, { path, contentType: 'application/json' })
    saved.push(record)
    return record
  }
  async function take(
    key: CoverageKey, pathname: string, heading: string, oracleText: string, oracle: Oracle, variant = 'default',
    transition?: { from: { pathname: string; heading: string }; to: { pathname: string; heading: string } },
  ) {
    expect(baselineEntry(inventory, key.screen, key.route)?.states).toContain(key.state)
    await expect(page).toHaveURL((url) => url.pathname === pathname)
    await expect(page.locator('main h1')).toHaveAccessibleName(heading)
    await oracle()
    const v = viewport()
    const reached = { pathname: new URL(page.url()).pathname, heading, stateVisible: true as const }
    const network = counts()
    expect(network.forwardedModelPosts).toBe(0)
    expect(network.modelPostsObserved).toBe(network.blockedModelPosts)
    // No UI action in this consumer is allowed to initiate even an aborted model request.
    expect(network.modelPostsObserved).toBe(0)
    const target: CaptureTarget = { ...key, route: key.route ?? 'non-route', path: pathname, heading, stateText: oracleText }
    if (key.route !== null && transition === undefined) verifyReached(target, reached)
    const name = `${key.route !== null && transition === undefined
      ? capturePairId(target, v.id, skin)
      : [safe(key.screen), safe(key.route ?? 'non-route'), safe(key.state), v.id, skin].join('--')}--${safe(variant)}.png`
    const motion = await camera.motion()
    const bytes = await camera.screenshot(name)
    const record: CaptureRecord | SupplementalRecord = key.route !== null && transition === undefined
      ? buildCaptureRecord({ target, viewport: v.id, skin, identity, reached, motion, screenshot: { name, bytes } })
      : {
        schema: 1, kind: transition ? 'task040-transition' : 'task040-surface', phase: 'before',
        baseline: { task: inventory.task, inventory: BASELINE_INVENTORY_PATH, mainSha: inventory.mainSha, ...key },
        identity, skin, viewport: { id: v.id, width: v.width, height: v.height }, reached,
        screenshot: { name, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength, explicit: true },
        motion, deterministic: true, liveGeneration: false,
      }
    return persist({ ...record, ...key, variant, evidence: {
      disposition: transition ? 'observed-transition' : 'rendered-state', oracle: oracleText, variant, network,
      ...(transition ? { transition } : {}),
    } })
  }
  return {
    take,
    beforeFinding(finding: (typeof beforeFindings)[number]) { beforeFindings.push(finding) },
    async transition(key: CoverageKey, fromPath: string, fromHeading: string, before: Oracle, action: Oracle,
      toPath: string, toHeading: string, after: Oracle, variant = 'default') {
      await expect(page).toHaveURL((url) => url.pathname === fromPath)
      await expect(page.locator('main h1')).toHaveAccessibleName(fromHeading)
      await before()
      await action()
      return take(key, toPath, toHeading, 'Source precondition and actual destination asserted around the real interaction.', after, variant,
        { from: { pathname: fromPath, heading: fromHeading }, to: { pathname: toPath, heading: toHeading } })
    },
    async finish() {
      const path = testInfo.outputPath('task040-states.json')
      const network = counts()
      const body = {
        version: 1, caseTitle: testInfo.title, project: testInfo.project.name,
        sourceFile: 'e2e/design-0143/task-040-lifecycle.spec.ts', status: testInfo.status, identity, records: saved,
        transitions: saved.filter((record) => record.evidence.disposition === 'observed-transition')
          .map((record) => ({ screen: record.screen, route: record.route, state: record.state,
            screenshot: record.screenshot.name,
            fromPath: record.evidence.transition!.from.pathname, toPath: record.evidence.transition!.to.pathname,
            fromHeading: record.evidence.transition!.from.heading, toHeading: record.evidence.transition!.to.heading,
            sourcePath: SOURCE_PATH[record.screen], rationale: record.evidence.oracle })),
        // Absent states are not silently turned into covered states by this consumer.
        // The integration manifest computes all remaining source inventory keys.
        dispositions: [],
        beforeFindings,
        generation: { requests: network.modelPostsObserved, blocked: network.blockedModelPosts, forwarded: network.forwardedModelPosts },
      }
      await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
      await testInfo.attach('task040-states', { path, contentType: 'application/json' })
    },
  }
}

test.describe('TASK-040 — isolated saved-workout lifecycle before-state artifacts', () => {
  test.use({ timezoneId: 'UTC' })
  // Independent per-case users: one failure must not silently skip later captures.
  test.describe.configure({ mode: 'default' })
  let client: ReturnType<typeof backend.client>
  let actor: Actor
  let catalog: Catalogued[]
  let cleanupActorIds: string[] = []
  let save: ReturnType<typeof recorder>
  let recorderReady = false
  let blocked: () => number
  let observed = 0

  test.beforeEach(async ({ page }, testInfo) => {
    // Bounded fixture/capture window, matching the existing authenticated
    // fixture's 180s allowance; no retry, skipped-case or provider-budget change.
    test.setTimeout(180_000)
    // Missing integration credentials is not a passing or skipped baseline.
    expect(backend.available, backend.reason).toBe(true)
    client = backend.client()
    cleanupActorIds = []
    recorderReady = false
    catalog = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
      select: 'id,default_equipment', order: 'id.asc', limit: '2',
    }), 'Fixture catalog read')
    expect(catalog).toHaveLength(2)
    for (const exercise of catalog) {
      expect(typeof exercise.id).toBe('string')
      expect(typeof exercise.default_equipment).toBe('string')
      expect(exercise.id.length).toBeGreaterThan(0)
      expect(exercise.default_equipment.length).toBeGreaterThan(0)
    }
    const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
    const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t040-${suffix}@example.com`
    // These calls target only this invocation's exact disposable namespace.
    try {
      const prior = await client.findUserByEmail(email)
      if (prior) await client.deleteUser(prior.id)
      const created = await client.ensureConfirmedUser(email)
      // Track creation before minting: partial authentication must still clean up.
      cleanupActorIds.push(created.id)
      const session = await client.mintSession(email)
      actor = { id: created.id, email, token: session.accessToken, refreshToken: session.refreshToken }
    } catch {
      throw new Error('TASK-040 namespaced fixture authentication failed; no response body retained.')
    }
    must(await client.rpcAs('complete_onboarding', {
      p_location_name: 'TASK-040 isolated gym', p_location_tier: 'full',
      // Existing authenticated-session fixture's proven viable equipment, plus
      // the exact persisted fixture members' catalog defaults, never guessed IDs.
      p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((exercise) => exercise.default_equipment)])],
      p_experience_level: 'some', p_goal_preset: 'balanced',
      p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
    }, actor.token), 'Fixture onboarding')
    await page.addInitScript((session) => {
      localStorage.setItem('clear.auth.session', JSON.stringify(session))
    }, {
      accessToken: actor.token, refreshToken: actor.refreshToken, expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: actor.id, email: actor.email },
    })
    const skin: CaptureSkin = testInfo.title.includes('renderers') ? 'vapour'
      : testInfo.title.includes('Summary') ? 'signal' : testInfo.title.includes('read boundaries') ? 'mono' : 'clear'
    const guard = await installDeterministicCapture(page, { skin })
    blocked = guard.blockedGenerations
    observed = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/functions\/v1\/generate-[^/?]+(?:[?]|$)/.test(request.url())) observed += 1
    })
    save = recorder(page, testInfo, skin, () => ({ modelPostsObserved: observed, blockedModelPosts: blocked(), forwardedModelPosts: 0 }))
    recorderReady = true
  })

  test.afterEach(async () => {
    try {
      if (recorderReady) await save.finish()
    } finally {
      for (const id of cleanupActorIds) {
        try { await client.deleteUser(id) } catch { throw new Error('TASK-040 scoped fixture cleanup failed.') }
      }
      cleanupActorIds = []
    }
  })

  const persist = async (title = TITLE, offset = 1, spectrum = true) => must<Persisted>(
    await client.rpcAs('persist_session', { p_user_id: actor.id, p_session: acceptance(catalog, title, offset, spectrum) }, actor.token),
    'Fixture persistence',
  )
  const completed = async (title = TITLE, offset = 1, spectrum = true, logged = true) => {
    const stored = await persist(title, offset, spectrum)
    const started = must<{ outcome: string }>(await client.rpcAs('start_session', { p_session_id: stored.session.id }, actor.token), 'Fixture start')
    expect(started.outcome).toBe('started')
    if (logged) must(await client.insertAs('exercise_set_logs', {
      id: randomUUID(), workout_exercise_id: stored.sections[0].blocks[0].exercises[0].exercise.id,
      set_number: 1, actual_reps: 8, weight: 0, weight_unit: 'kg',
    }, actor.token), 'Fixture performed-set write')
    const result = must<{ outcome: string }>(await client.rpcAs('complete_session', {
      p_session_id: stored.session.id, p_actual_duration_mins: 30,
    }, actor.token), 'Fixture completion')
    expect(result.outcome).toBe('completed')
    return stored
  }

  test('History, detail and Review — real records, filters, restart and confirmation', async ({ page, visit, checkA11y }) => {
    await visit('/history')
    await save.take({ screen: 'History', route: '/history', state: 'no-workouts-empty' }, '/history', 'History', 'No history and no rows.', async () => {
      await expect(page.getByText('No workouts yet', { exact: true })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Workout history' })).toHaveCount(0)
    })
    const done = await completed()
    const unstarted = await persist(UNSTARTED_TITLE, 2, false)
    // Twenty-one prescriptions make the actual 20-row pagination branch reachable.
    for (let offset = 3; offset <= 23; offset += 1) await persist(`TASK-040 isolated older session ${offset}`, offset, false)
    await visit('/history')
    await expect(page.getByRole('button', { name: 'Load older workouts', exact: true })).toBeVisible()
    await save.take({ screen: 'History', route: '/history', state: 'populated-load-more' }, '/history', 'History', 'Actual populated paginated list and load-more control.', async () => {
      await expect(page.getByRole('list', { name: 'Workout history' }).getByRole('listitem')).toHaveCount(20)
      await expect(page.getByRole('button', { name: 'Load older workouts', exact: true })).toBeVisible()
    })
    await page.getByLabel('Show').selectOption('partial')
    await save.take({ screen: 'History', route: '/history', state: 'filtered-no-matches' }, '/history', 'History', 'Partial filter has no partial sessions, not no history.', async () => {
      await expect(page.getByText('Nothing matches this filter', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Show')).toHaveValue('partial')
    })
    await page.getByRole('button', { name: 'Show all entries', exact: true }).click()
    await page.getByLabel('Show').selectOption('completed')
    await save.take({ screen: 'History', route: '/history', state: 'selected-filters' }, '/history', 'History', 'Completed selected and only completed fixture row.', async () => {
      await expect(page.getByLabel('Show')).toHaveValue('completed')
      await expect(page.getByRole('list', { name: 'Workout history' }).getByRole('listitem')).toHaveCount(1)
    })
    await save.transition({ screen: 'History', route: '/history', state: 'compatible-review-entry' }, '/history', 'History', async () => {
      await expect(page.getByRole('list', { name: 'Workout history' }).getByText(TITLE, { exact: true })).toBeVisible()
    }, async () => {
      await page.getByRole('list', { name: 'Workout history' }).getByText(TITLE, { exact: true }).click()
    }, '/review', TITLE, async () => {
      await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled()
    })
    await save.take({ screen: 'Review', route: '/review', state: 'validated-workout' }, '/review', TITLE, 'Real compatible history handoff with enabled Start and seven source renderer sections.', async () => {
      await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled()
      await expect(page.getByRole('button', { name: 'Regenerate', exact: true })).toBeEnabled()
    })
    await page.getByRole('button', { name: 'Regenerate', exact: true }).click()
    await checkA11y()
    await save.take({ screen: 'Review', route: '/review', state: 'regenerate-confirmation' }, '/review', TITLE, 'Actual discard confirmation before any generation.', async () => {
      await expect(page.getByRole('dialog', { name: 'Discard this workout?' })).toBeVisible()
    })
    await page.getByRole('dialog', { name: 'Discard this workout?' }).getByRole('button', { name: 'Keep it', exact: true }).click()
    await visit(`/history/${done.session.id}`)
    await save.take({ screen: 'Session Detail', route: '/history/:id', state: 'as-performed-populated' }, `/history/${done.session.id}`, TITLE, 'Actual completed record, as-performed provenance and logged-set table.', async () => {
      await expect(page.getByText(/^As performed/)).toBeVisible()
      await expect(page.getByRole('table').first()).toBeVisible()
    })
    await page.getByRole('button', { name: 'Standard', exact: true }).click()
    await save.take({ screen: 'Session Detail', route: '/history/:id', state: 'section-collapsed' }, `/history/${done.session.id}`, TITLE, 'Actual Standard disclosure has aria-expanded false.', async () => {
      await expect(page.getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute('aria-expanded', 'false')
    })
    await page.getByRole('button', { name: 'Standard', exact: true }).click()
    const favoriteFailure = await fault(page, 'rpc/save_favorite', 'POST')
    try {
      await page.getByRole('button', { name: 'Save as favorite', exact: true }).click()
      await save.take({ screen: 'Session Detail', route: '/history/:id', state: 'favorite-save-failure' }, `/history/${done.session.id}`, TITLE, 'Secondary favorite failure leaves completed record and restart intact.', async () => {
        await expect(page.getByRole('alert')).toContainText('That workout wasn’t saved as a favorite. Try again.')
        await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeEnabled()
      })
    } finally { await favoriteFailure.dispose() }
    const restartFailure = await fault(page, 'rpc/session_as_intended_at_start', 'POST')
    try {
      await page.getByRole('button', { name: 'Restart', exact: true }).click()
      await save.take({ screen: 'Session Detail', route: '/history/:id', state: 'restart-read-validation-error' }, `/history/${done.session.id}`, TITLE, 'Restart reconstruction read fails; record remains and retry is available.', async () => {
        await expect(page.getByRole('alert').filter({ hasText: 'This workout couldn’t be rebuilt for a restart.' })).toBeVisible()
      })
    } finally { await restartFailure.dispose() }
    await save.transition({ screen: 'Session Detail', route: '/history/:id', state: 'restart-review' }, `/history/${done.session.id}`, TITLE,
      async () => { await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeEnabled() },
      async () => { await page.getByRole('button', { name: 'Restart', exact: true }).click() }, '/review', TITLE,
      async () => { await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled() })
    await visit('/history')
    await page.getByLabel('Show').selectOption('unstarted')
    await save.transition({ screen: 'History', route: '/history', state: 'incompatible-detail-fallback' }, '/history', 'History',
      async () => { await expect(page.getByText(UNSTARTED_TITLE, { exact: true })).toBeVisible() },
      async () => { await page.getByText(UNSTARTED_TITLE, { exact: true }).click() }, `/history/${unstarted.session.id}`, UNSTARTED_TITLE,
      async () => { await expect(page.getByText('Only a completed workout can be restarted.', { exact: true })).toBeVisible() })
    await save.take({ screen: 'Session Detail', route: '/history/:id', state: 'restart-ineligible' }, `/history/${unstarted.session.id}`, UNSTARTED_TITLE, 'Never-started fixture has explained unavailable Restart.', async () => {
      await expect(page.getByText('Only a completed workout can be restarted.', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Restart', exact: true })).toHaveCount(0)
    })
    await visit(`/history/${randomUUID()}`)
    await save.take({ screen: 'Session Detail', route: '/history/:id', state: 'missing-or-not-yours' }, new URL(page.url()).pathname, 'Workout', 'A missing synthetic UUID is not found, with no workout sections disclosed.', async () => {
      await expect(page.getByRole('alert')).toContainText('Workout not found')
      await expect(page.getByRole('region', { name: 'Sections' })).toHaveCount(0)
    }, 'missing')
    await visit('/review')
    await save.take({ screen: 'Review', route: '/review', state: 'missing-or-invalid-handoff' }, '/review', 'Nothing to review', 'Direct route with no handoff does not fabricate a workout.', async () => {
      await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toHaveCount(0)
    })
  })

  test('Workout renderers — all seven actual dispatches, logging, rest, effort, finish', async ({ page, visit, checkA11y }) => {
    const done = await completed()
    await visit(`/history/${done.session.id}`)
    await page.getByRole('button', { name: 'Restart', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/review')
    const startFailure = await fault(page, 'rpc/persist_session', 'POST', true)
    try {
      await page.getByRole('button', { name: 'Start workout', exact: true }).click()
      await startFailure.reached
      await save.take({ screen: 'Review', route: '/review', state: 'start-busy' }, '/review', TITLE, 'Start acceptance in flight disables the start control.', async () => {
        await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeDisabled()
      })
      startFailure.release()
      await save.take({ screen: 'Review', route: '/review', state: 'start-failure' }, '/review', TITLE, 'Actual failed acceptance opens the mounted blocking start-error dialog.', async () => {
        await expect(page.getByRole('dialog', { name: 'Couldn’t start this workout' })).toBeVisible()
      })
    } finally { await startFailure.dispose() }
    await page.getByRole('dialog', { name: 'Couldn’t start this workout' }).getByRole('button', { name: 'Close', exact: true }).click()
    await save.transition({ screen: 'Review', route: '/review', state: 'start-workout' }, '/review', TITLE,
      async () => { await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled() },
      async () => { await page.getByRole('button', { name: 'Start workout', exact: true }).click() }, '/workout', 'Workout',
      async () => { await expect(page.getByRole('form', { name: /^Log set 1 of/ })).toBeVisible() })
    await save.take({ screen: 'Workout', route: '/workout', state: 'active-standard-superset-circuit' }, '/workout', 'Workout', 'Actual Standard renderer with logged-set form, no rendered Superset/Circuit claim yet.', async () => {
      await expect(page.getByRole('form', { name: /^Log set 1 of/ })).toBeVisible()
    }, 'standard')
    const form = page.getByRole('form', { name: /^Log set 1 of/ }).first()
    await form.getByLabel('Reps', { exact: true }).fill('8')
    await form.getByRole('button', { name: 'Log set 1', exact: true }).click()
    await save.take({ screen: 'Workout', route: '/workout', state: 'rest-running-urgent-skipped' }, '/workout', 'Workout', 'Actual ten-second prescribed rest with urgency, after a real logged set.', async () => {
      await expect(page.getByRole('region', { name: 'Rest', exact: true })).toBeVisible()
      await expect(page.getByText('Final 10 seconds', { exact: true })).toBeVisible()
    }, 'running-urgent')
    await page.getByRole('button', { name: 'Skip rest', exact: true }).click()
    await save.take({ screen: 'Workout', route: '/workout', state: 'rest-running-urgent-skipped' }, '/workout', 'Workout', 'Actual rest skip removes the rest bar, not a zero-second rest.', async () => {
      await expect(page.getByRole('region', { name: 'Rest', exact: true })).toHaveCount(0)
    }, 'skipped')
    await page.getByRole('button', { name: 'Complete block', exact: true }).click()
    await save.take({ screen: 'Workout', route: '/workout', state: 'block-effort-dismissed-or-recorded' }, '/workout', 'Workout', 'Mounted effort dialog with keyboard-focused slider before recording.', async () => {
      await expect(page.getByRole('dialog')).toContainText('Rate the effort of the block you just finished.')
      await expect(page.getByRole('slider', { name: 'Effort', exact: true })).toBeFocused()
    }, 'question')
    await page.getByRole('button', { name: 'Not now', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Complete block', exact: true })).toBeEnabled()
    await save.take({ screen: 'Workout', route: '/workout', state: 'block-effort-dismissed-or-recorded' }, '/workout', 'Workout', 'Dismissed effort leaves the block unrecorded.', async () => {
      await expect(page.getByRole('button', { name: 'Complete block', exact: true })).toBeEnabled()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }, 'dismissed')
    await page.getByRole('button', { name: 'Complete block', exact: true }).click()
    await page.getByRole('button', { name: 'Record effort', exact: true }).click()
    await save.take({ screen: 'Workout', route: '/workout', state: 'block-effort-dismissed-or-recorded' }, '/workout', 'Workout', 'Successful real block_result write makes Block recorded disabled.', async () => {
      await expect(page.getByRole('button', { name: 'Block recorded', exact: true })).toBeDisabled()
    }, 'recorded')
    // Navigate real section chips; each renderer must expose its own controls.
    const variants = [
      { section: 'Superset', state: 'active-standard-superset-circuit', oracle: async () => {
        await expect(page.getByRole('form', { name: /^Log set 1 of/ })).toHaveCount(2)
        await expect(page.getByText(/^A1 /)).toBeVisible()
        await expect(page.getByText(/^A2 /)).toBeVisible()
      } },
      { section: 'Circuit', state: 'active-standard-superset-circuit', oracle: async () => {
        await expect(page.getByRole('list', { name: 'Movements in this circuit' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Complete circuit', exact: true })).toBeVisible()
      } },
      { section: 'EMOM', state: 'active-emom-amrap-for-time-ladder', oracle: async () => {
        await expect(page.getByRole('list', { name: 'Movements in this EMOM' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Start EMOM', exact: true })).toBeVisible()
      } },
      { section: 'AMRAP', state: 'active-emom-amrap-for-time-ladder', oracle: async () => {
        await expect(page.getByRole('list', { name: 'Movements in this AMRAP' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Start AMRAP', exact: true })).toBeVisible()
      } },
      { section: 'Plain For Time', state: 'active-emom-amrap-for-time-ladder', oracle: async () => {
        await expect(page.getByRole('list', { name: 'Movements in this block' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Start For Time', exact: true })).toBeVisible()
        await expect(page.getByRole('group', { name: 'How did this block end?' })).toHaveCount(0)
      } },
      { section: 'Ladder', state: 'active-emom-amrap-for-time-ladder', oracle: async () => {
        await expect(page.getByRole('list', { name: 'Movements in this ladder' })).toBeVisible()
        await expect(page.getByRole('radio', { name: 'Finished the ladder', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Start For Time', exact: true })).toHaveCount(0)
      } },
    ]
    for (const variant of variants) {
      await page.getByRole('button', { name: new RegExp(`^${variant.section}, `) }).click()
      await checkA11y()
      await save.take({ screen: 'Workout', route: '/workout', state: variant.state }, '/workout', 'Workout', `Actual ${variant.section} dispatch, source-specific controls and movement list.`, variant.oracle, safe(variant.section))
    }
    // Short viewport is a real contained-layout observation, not a new project.
    const previousViewport = page.viewportSize()!
    await page.setViewportSize({ width: 390, height: 320 })
    await save.take({ screen: 'Workout', route: '/workout', state: 'active-emom-amrap-for-time-ladder' }, '/workout', 'Workout', 'Actual short-view Ladder baseline; measured finish-button containment is recorded separately, not claimed passed.', async () => {
      await expect(page.getByRole('button', { name: 'Finish workout', exact: true })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Movements in this ladder' })).toBeVisible()
      const box = await page.getByRole('button', { name: 'Finish workout', exact: true }).boundingBox()
      expect(box).not.toBeNull()
      expect(Object.values(box!).every(Number.isFinite)).toBe(true)
      expect(box!.height).toBeGreaterThan(0)
      const viewport = page.viewportSize()!
      const bottom = box!.y + box!.height
      const requiredMaxBottom = viewport.height + 1
      save.beforeFinding({
        kind: 'known-before-layout-constraint', screen: 'Workout', route: '/workout',
        variant: 'ladder-short', control: 'Finish workout', viewport, rect: box!,
        bottom, requiredMaxBottom, overflow: Math.max(0, bottom - viewport.height),
        containmentPassed: box!.y >= 0 && bottom <= requiredMaxBottom,
        afterAcceptanceRequirement: 'TASK-036 must execute the unchanged finish-button bottom <= viewport height +1 condition; a recorded BEFORE capture is not containment success.',
      })
    }, 'ladder-short')
    await page.setViewportSize(previousViewport)
    await page.getByRole('button', { name: 'Abandon', exact: true }).click()
    await save.take({ screen: 'Workout', route: '/workout', state: 'abandon-confirmation' }, '/workout', 'Workout', 'Real abandon question keeps the session until confirmed.', async () => {
      await expect(page.getByRole('dialog', { name: 'Abandon workout?' })).toBeVisible()
    })
    await page.getByRole('dialog', { name: 'Abandon workout?' }).getByRole('button', { name: 'Keep going', exact: true }).click()
    const finishFailure = await fault(page, 'rpc/complete_session', 'POST', true)
    try {
      await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
      await finishFailure.reached
      await save.take({ screen: 'Workout', route: '/workout', state: 'finish-pending' }, '/workout', 'Workout', 'Actual completion call pending disables the measured footer.', async () => {
        await expect(page.getByRole('button', { name: 'Finish workout', exact: true })).toBeDisabled()
      })
      finishFailure.release()
      await save.take({ screen: 'Workout', route: '/workout', state: 'finish-error-retry' }, '/workout', 'Workout', 'Actual completion error leaves running workout behind blocking failure dialog.', async () => {
        await expect(page.getByRole('dialog', { name: 'That didn’t save' })).toBeVisible()
      })
    } finally { await finishFailure.dispose() }
    await page.getByRole('dialog', { name: 'That didn’t save' }).getByRole('button', { name: 'Close', exact: true }).click()
    await save.transition({ screen: 'Workout', route: '/workout', state: 'finish-summary' }, '/workout', 'Workout',
      async () => { await expect(page.getByRole('button', { name: 'Finish workout', exact: true })).toBeEnabled() },
      async () => { await page.getByRole('button', { name: 'Finish workout', exact: true }).click() }, '/summary', 'Nice work',
      async () => { await expect(page.getByText(`${TITLE}, done.`, { exact: true })).toBeVisible() })
  })

  test('Summary — real completed session, favorite failure, retained debrief and save', async ({ page, visit }) => {
    await completed()
    await visit('/summary')
    await save.take({ screen: 'Summary', route: '/summary', state: 'debrief-unrecorded-or-saved' }, '/summary', 'Nice work', 'Unrecorded debrief has empty notes and no chosen mood.', async () => {
      await expect(page.getByLabel('Notes · optional')).toHaveValue('')
      await expect(page.getByRole('radio', { name: 'Ready', exact: true })).not.toBeChecked()
    }, 'unrecorded')
    const favoriteFailure = await fault(page, 'rpc/save_favorite', 'POST')
    try {
      await page.getByRole('button', { name: 'Save as favorite', exact: true }).click()
      await save.take({ screen: 'Summary', route: '/summary', state: 'favorite-save-failure-secondary' }, '/summary', 'Nice work', 'Secondary favorite error does not block the debrief form.', async () => {
        await expect(page.getByRole('alert')).toContainText('That workout wasn’t saved as a favorite. Try again.')
        await expect(page.getByRole('button', { name: 'Save and close', exact: true })).toBeEnabled()
      })
    } finally { await favoriteFailure.dispose() }
    await page.getByRole('radio', { name: 'Ready', exact: true }).click()
    await page.getByLabel('Notes · optional').fill('TASK-040 isolated fixture debrief.')
    const saveFailure = await fault(page, 'workout_sessions', 'PATCH', true)
    try {
      await page.getByRole('button', { name: 'Save and close', exact: true }).click()
      await saveFailure.reached
      await save.take({ screen: 'Summary', route: '/summary', state: 'save-busy' }, '/summary', 'Nice work', 'Actual debrief PATCH in flight disables save.', async () => {
        await expect(page.getByRole('button', { name: 'Save and close', exact: true })).toBeDisabled()
      })
      saveFailure.release()
      await save.take({ screen: 'Summary', route: '/summary', state: 'save-error-draft-retry' }, '/summary', 'Nice work', 'Failed debrief PATCH leaves selected mood and typed fixture notes intact.', async () => {
        await expect(page.locator('form#summary-debrief').getByRole('alert')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Save and close', exact: true })).toBeEnabled()
        await expect(page.getByRole('radio', { name: 'Ready', exact: true })).toBeChecked()
        await expect(page.getByLabel('Notes · optional')).toHaveValue('TASK-040 isolated fixture debrief.')
      })
    } finally { await saveFailure.dispose() }
    await save.transition({ screen: 'Summary', route: '/summary', state: 'done-home' }, '/summary', 'Nice work',
      async () => { await expect(page.getByRole('button', { name: 'Save and close', exact: true })).toBeEnabled() },
      async () => { await page.getByRole('button', { name: 'Save and close', exact: true }).click() }, '/', 'Today',
      async () => { await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible() })
    await visit('/summary')
    await save.take({ screen: 'Summary', route: '/summary', state: 'debrief-unrecorded-or-saved' }, '/summary', 'Nice work', 'Reopened debrief reads the actual saved fixture mood and notes.', async () => {
      await expect(page.getByRole('radio', { name: 'Ready', exact: true })).toBeChecked()
      await expect(page.getByLabel('Notes · optional')).toHaveValue('TASK-040 isolated fixture debrief.')
    }, 'saved')
  })

  test('History and detail read boundaries — held loading, failure and real retry', async ({ page, visit }) => {
    const done = await completed(TITLE, 1, false, false)
    for (let offset = 2; offset <= 22; offset += 1) await persist(`TASK-040 isolated page-two session ${offset}`, offset, false)
    // Boot consumes the first shared history query. Warm it through real reads
    // first, then hold ONLY the new page-two request made by Load older workouts.
    await visit('/history')
    await expect(page.getByRole('list', { name: 'Workout history' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Load older workouts', exact: true })).toBeEnabled()
    const historyFailure = await fault(page, 'workout_sessions', 'GET', true)
    try {
      await page.getByRole('button', { name: 'Load older workouts', exact: true }).click()
      await historyFailure.reached
      await save.take({ screen: 'History', route: '/history', state: 'loading' }, '/history', 'History', 'History read is actually held at its boundary.', async () => {
        await expect(page.locator('main').getByRole('status')).toContainText(/Reading history|Taking longer than usual/)
      })
      historyFailure.release()
      await save.take({ screen: 'History', route: '/history', state: 'error-retry' }, '/history', 'History', 'History read actually failed with mounted Retry.', async () => {
        await expect(page.getByRole('alert')).toContainText('History didn’t load')
        await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled()
      })
    } finally { await historyFailure.dispose() }
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Workout history' })).toBeVisible()
    const detailFailure = await fault(page, 'rpc/session_as_performed', 'POST', true)
    try {
      await visit(`/history/${done.session.id}`)
      await detailFailure.reached
      await save.take({ screen: 'Session Detail', route: '/history/:id', state: 'loading' }, `/history/${done.session.id}`, 'Workout', 'As-performed reconstruction is actually held.', async () => {
        await expect(page.locator('main').getByRole('status')).toContainText(/Reading workout|Taking longer than usual/)
      })
      detailFailure.release()
      await save.take({ screen: 'Session Detail', route: '/history/:id', state: 'error-retry' }, `/history/${done.session.id}`, 'Workout', 'Failed as-performed reconstruction exposes Retry, not an empty record.', async () => {
        await expect(page.getByRole('alert')).toContainText('Workout didn’t load')
        await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled()
      })
    } finally { await detailFailure.dispose() }
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await save.take({ screen: 'Session Detail', route: '/history/:id', state: 'unscored-or-unlogged' }, `/history/${done.session.id}`, TITLE, 'Real completed fixture deliberately has no set logs or block scores.', async () => {
      await expect(page.getByText('Not scored', { exact: true })).toBeVisible()
      await expect(page.getByText('No sets logged', { exact: true })).toBeVisible()
    })
  })
})
