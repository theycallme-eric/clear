/**
 * Proposed additive TASK-040 artifact consumer. This source is NOT executed
 * evidence. Only the exact-head, retained browser packets/images may be bound.
 * Covers proposal19's remaining 7 Workout / 4 Summary / 1 Session Detail labels,
 * not already observed finish-summary, done-home or restart-review destinations.
 * Uses the unchanged TASK-033 camera/guard and isolated real backend fixtures.
 */
import { createHash, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import type { Page, Route, TestInfo } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { expect, test } from '../fixtures'
import { backend } from '../support/backend'
import { buildCaptureRecord, captureIdentity, capturePairId, type CaptureRecord } from './capture'
import { installDeterministicCapture, playwrightCaptureDriver } from './fixtures'
import {
  baselineEntry, BASELINE_INVENTORY_PATH, CAPTURE_VIEWPORTS,
  readBaselineInventory, readBaselinePackages, type CaptureSkin, type CaptureTarget,
} from './state-inventory'

const SOURCE_FILE = 'e2e/design-0143/task-040-lifecycle-gaps.spec.ts'
const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const TITLE = 'TASK-040 isolated lifecycle gaps'
const FIRST = 'First phase'
const SECOND = 'Second phase'
const SESSION_KEY = 'clear.auth.session'
const SOURCE_PATH = {
  Workout: 'src/app/Workout.tsx', Summary: 'src/app/Summary.tsx',
  'Session Detail': 'src/app/ActiveSessionPrompt.tsx',
} as const
type Screen = keyof typeof SOURCE_PATH
type Key = { screen: Screen; route: string; state: string }
type Oracle = () => Promise<void>
type Counts = { modelPostsObserved: number; blockedModelPosts: number; forwardedModelPosts: 0 }
type Catalogued = { id: string; default_equipment: string }
type Actor = { id: string; email: string; token: string; refreshToken: string }
type Persisted = {
  session: { id: string }
  sections: { blocks: { exercises: { exercise: { id: string } }[] }[] }[]
}
type Snapshot = {
  state: string
  session: { id: string; started_at: string | null; completed_at: string | null; abandoned_at: string | null }
}
type Transition = { from: { pathname: string; heading: string }; to: { pathname: string; heading: string } }
type Saved = (CaptureRecord | {
  schema: 1; kind: 'task040-transition'; phase: 'before'; baseline: { task: string; inventory: string; mainSha: string } & Key
  identity: ReturnType<typeof captureIdentity>; skin: CaptureSkin
  viewport: { id: string; width: number; height: number }
  reached: { pathname: string; heading: string; stateVisible: true }
  screenshot: { name: string; sha256: string; bytes: number; explicit: true }
  motion: Awaited<ReturnType<ReturnType<typeof playwrightCaptureDriver>['motion']>>
  deterministic: true; liveGeneration: false
}) & Key & { variant: string; evidence: {
  disposition: 'rendered-state' | 'observed-transition'; oracle: string; variant: string; network: Counts
  transition?: Transition
} }
const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const dayAgo = (offset: number) => {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() - offset)
  return value.toISOString().slice(0, 10)
}
/** No raw auth/backend body, actor or credential is printed or retained. */
function must<T>(answer: { ok: boolean; status: number; body: unknown }, operation: string): T {
  expect(answer.ok, `${operation}: HTTP status ${answer.status}`).toBe(true)
  return answer.body as T
}

function acceptance(catalog: Catalogued[], title = TITLE, offset = 0, twoSections = false) {
  const exercise = (entry: Catalogued) => ({
    exercise_id: entry.id, equipment: entry.default_equipment,
    session_function: 'primary', anchor_relationship: 'neutral', modality: 'reps', sets: 2,
    target_kind: 'fixed', target_value: 8, target_min: null, target_max: null, target_sequence: null,
    per_side: false, distance_unit: null, rest_seconds: 10, tempo: null,
    load_type: 'none', load_value: null, is_interval_exercise: false,
  })
  return {
    date: dayAgo(offset), location_id: null, session_focus: 'full_body', goal_preset: 'balanced',
    requested_duration_mins: 30, effective_duration_target_mins: 30, computed_duration_mins: null,
    requested_intensity: 5, effective_intensity: 5, adjustment_reason: null, generation_notes: null,
    prompt_version: 'e2e', contract_version: '4.1.0',
    workout: {
      title, overview: 'Isolated persisted fixture; not a model response.', estimated_duration_mins: 30,
      sections: catalog.slice(0, twoSections ? 2 : 1).map((entry, index) => ({
        section_type: index === 0 ? 'primary_lift' : 'accessory',
        section_title: index === 0 ? FIRST : SECOND, section_notes: null,
        blocks: [{ structure_type: 'standard', rounds: null, timer_type: 'none', timer_seconds: null,
          round_rest_seconds: null, rep_scheme: 'fixed', block_notes: null,
          exercises: [{ ...exercise(entry), session_function: index === 0 ? 'primary' : 'accessory' }] }],
      })),
    },
  }
}

/** Request matching observes only method/path and one allowlisted numeric RPC argument. */
type Boundary = { tail: string; method: 'GET' | 'POST'; limit?: 1 | 200 }
function matches(route: Route, boundary: Boundary) {
  if (route.request().method() !== boundary.method) return false
  if (!new URL(route.request().url()).pathname.endsWith(`/rest/v1/${boundary.tail}`)) return false
  if (boundary.limit === undefined) return true
  const body: unknown = route.request().postDataJSON()
  return typeof body === 'object' && body !== null && 'p_limit' in body && body.p_limit === boundary.limit
}
/** A scoped real-request hold or synthetic 503; never a fake workout/row. */
async function boundary(page: Page, target: Boundary, mode: 'held-failure' | 'failure' | 'held-real') {
  let release!: () => void
  let arrived!: () => void
  const arrival = new Promise<void>((resolve) => { arrived = resolve })
  const pending = new Promise<void>((resolve) => { release = resolve })
  let intercepted = 0
  const pattern = `**/rest/v1/${target.tail}*`
  const handler = async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    if (!matches(route, target)) return route.fallback()
    intercepted += 1
    if (mode === 'held-real') {
      const response = await route.fetch()
      expect(response.ok(), 'Held fixture read answered a successful status').toBe(true)
      arrived()
      await pending
      await route.fulfill({ response })
    } else {
      arrived()
      if (mode === 'held-failure') await pending
      await route.fulfill({ status: 503, headers: CORS,
        json: { code: 'PGRST000', message: 'Isolated TASK-040 capture boundary unavailable.' } })
    }
  }
  await page.route(pattern, handler)
  return { arrival, release, count: () => intercepted,
    async dispose() { release(); await page.unroute(pattern, handler) } }
}

/** Same actual metadata/packet schema as the existing lifecycle consumer. */
function recorder(page: Page, info: TestInfo, skin: CaptureSkin, counts: () => Counts) {
  const camera = playwrightCaptureDriver(page, info)
  const identity = captureIdentity()
  const inventory = readBaselineInventory()
  expect(identity.packageVersion).toBe(readBaselinePackages().before)
  expect(identity.applicationCommit).not.toBeNull()
  const records: Saved[] = []
  async function take(key: Key, pathname: string, heading: string, rationale: string,
    oracle: Oracle, variant = 'default', transition?: Transition) {
    expect(baselineEntry(inventory, key.screen, key.route)?.states).toContain(key.state)
    await expect(page).toHaveURL((url) => url.pathname === pathname)
    await expect(page.locator('main h1')).toHaveAccessibleName(heading)
    await oracle()
    await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
    const dimensions = page.viewportSize()
    const viewport = CAPTURE_VIEWPORTS.find((v) => v.width === dimensions?.width && v.height === dimensions?.height)
    expect(viewport, 'A declared actual viewport is required').toBeDefined()
    const actual = viewport!
    const network = counts()
    expect(network).toEqual({ modelPostsObserved: 0, blockedModelPosts: 0, forwardedModelPosts: 0 })
    const target: CaptureTarget = { ...key, path: pathname, heading, stateText: rationale }
    const name = `${capturePairId(target, actual.id, skin)}--gaps-${safe(variant)}.png`
    const reached = { pathname: new URL(page.url()).pathname, heading, stateVisible: true as const }
    const motion = await camera.motion()
    const bytes = await camera.screenshot(name)
    const base = { task: inventory.task, inventory: BASELINE_INVENTORY_PATH, mainSha: inventory.mainSha, ...key }
    const record: Saved = {
      ...(transition ? {
        schema: 1 as const, kind: 'task040-transition' as const, phase: 'before' as const, baseline: base,
        identity, skin, viewport: { id: actual.id, width: actual.width, height: actual.height }, reached,
        screenshot: { name, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength, explicit: true as const },
        motion, deterministic: true as const, liveGeneration: false as const,
      } : buildCaptureRecord({ target, viewport: actual.id, skin, identity, reached, motion, screenshot: { name, bytes } })),
      ...key, variant, evidence: {
        disposition: transition ? 'observed-transition' : 'rendered-state', oracle: rationale, variant, network,
        ...(transition ? { transition } : {}),
      },
    }
    const path = info.outputPath(name.replace(/\.png$/, '.json'))
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    await info.attach(name.replace(/\.png$/, '.json'), { path, contentType: 'application/json' })
    records.push(record)
  }
  return {
    take,
    async transition(key: Key, fromPath: string, fromHeading: string, before: Oracle, action: Oracle,
      toPath: string, toHeading: string, after: Oracle, rationale: string, variant = 'default') {
      // Both endpoints are observed. Auto-redirect tests hold the real null/empty
      // read so their origin heading is never manufactured from source text.
      await expect(page).toHaveURL((url) => url.pathname === fromPath)
      await expect(page.locator('main h1')).toHaveAccessibleName(fromHeading)
      await before()
      await action()
      await take(key, toPath, toHeading, rationale, after, variant,
        { from: { pathname: fromPath, heading: fromHeading }, to: { pathname: toPath, heading: toHeading } })
    },
    async finish() {
      const network = counts()
      const path = info.outputPath('task040-states.json')
      await writeFile(path, `${JSON.stringify({
        version: 1, caseTitle: info.title, project: info.project.name, sourceFile: SOURCE_FILE,
        status: info.status, identity, records,
        transitions: records.filter((r) => r.evidence.transition).map((r) => ({
          screen: r.screen, route: r.route, state: r.state, screenshot: r.screenshot.name,
          fromPath: r.evidence.transition!.from.pathname, fromHeading: r.evidence.transition!.from.heading,
          toPath: r.evidence.transition!.to.pathname, toHeading: r.evidence.transition!.to.heading,
          sourcePath: SOURCE_PATH[r.screen], rationale: r.evidence.oracle,
        })),
        dispositions: [], generation: {
          requests: network.modelPostsObserved, blocked: network.blockedModelPosts, forwarded: network.forwardedModelPosts,
        },
      }, null, 2)}\n`, 'utf8')
      await info.attach('task040-states', { path, contentType: 'application/json' })
      expect(network).toEqual({ modelPostsObserved: 0, blockedModelPosts: 0, forwardedModelPosts: 0 })
    },
  }
}

test.describe('TASK-040 — additive lifecycle gaps, not a replacement baseline', () => {
  // Credential-free Preview is not capture proof; local captures keep hard prerequisites.
  test.skip(Boolean(process.env.CI) && process.env.GITHUB_JOB === 'preview-e2e' && !backend.available,
    backend.reason)
  test.use({ timezoneId: 'UTC' })
  test.describe.configure({ mode: 'default', retries: 0 })
  let client: ReturnType<typeof backend.client>
  let actor: Actor
  let catalog: Catalogued[]
  let ownedActorId: string | null
  let save: ReturnType<typeof recorder> | null
  test.beforeEach(async ({ page }, info) => {
    test.setTimeout(180_000)
    ownedActorId = null
    save = null
    expect(backend.available, backend.reason).toBe(true)
    client = backend.client()
    catalog = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
      select: 'id,default_equipment', order: 'id.asc', limit: '2',
    }), 'Fixture catalog read')
    expect(catalog).toHaveLength(2)
    for (const entry of catalog) {
      expect(typeof entry.id === 'string' && entry.id.length > 0).toBe(true)
      expect(typeof entry.default_equipment === 'string' && entry.default_equipment.length > 0).toBe(true)
    }
    const suffix = createHash('sha256').update(info.titlePath.join('\0')).digest('hex').slice(0, 10)
    const email = `clear-e2e-${namespaceId()}-${info.project.name}-t040-gaps-${suffix}@example.com`
    try {
      const prior = await client.findUserByEmail(email)
      if (prior) await client.deleteUser(prior.id)
      const created = await client.ensureConfirmedUser(email)
      ownedActorId = created.id
      const session = await client.mintSession(email)
      actor = { id: created.id, email, token: session.accessToken, refreshToken: session.refreshToken }
    } catch { throw new Error('TASK-040 isolated gaps authentication failed; no raw response retained.') }
    must(await client.rpcAs('complete_onboarding', {
      p_location_name: 'TASK-040 isolated gaps gym', p_location_tier: 'full',
      p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((e) => e.default_equipment)])],
      p_experience_level: 'some', p_goal_preset: 'balanced',
      p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
    }, actor.token), 'Fixture onboarding')
    await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
      key: SESSION_KEY, session: { accessToken: actor.token, refreshToken: actor.refreshToken,
        expiresAt: Date.now() + 60 * 60 * 1000, user: { id: actor.id, email: actor.email } },
    })
    const skin: CaptureSkin = info.title.startsWith('Summary') ? 'signal'
      : info.title.includes('persisted') ? 'vapour' : info.title.includes('Detail') ? 'mono' : 'clear'
    const guard = await installDeterministicCapture(page, { skin })
    let observed = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/functions\/v1\/generate-[^/?]+(?:[?]|$)/.test(request.url())) observed += 1
    })
    save = recorder(page, info, skin, () => ({
      modelPostsObserved: observed, blockedModelPosts: guard.blockedGenerations(), forwardedModelPosts: 0,
    }))
  })
  test.afterEach(async () => {
    let captureFailed = false
    let captureError: unknown
    let cleanupError: Error | undefined
    try {
      if (save) await save.finish()
    } catch (error) {
      captureFailed = true
      captureError = error
    } finally {
      const ownedId = ownedActorId
      ownedActorId = null
      if (ownedId !== null) {
        try { await client.deleteUser(ownedId) } catch { cleanupError = new Error('TASK-040 isolated gaps cleanup failed.') }
      }
    }
    if (captureFailed && cleanupError) {
      throw new AggregateError([captureError, cleanupError], 'TASK-040 capture and isolated gaps cleanup failed.')
    }
    if (captureFailed) throw captureError
    if (cleanupError) throw cleanupError
  })
  const persist = async (title = TITLE, offset = 0, twoSections = false) => must<Persisted>(
    await client.rpcAs('persist_session', {
      p_user_id: actor.id, p_session: acceptance(catalog, title, offset, twoSections),
    }, actor.token), 'Fixture persistence')
  const start = async (stored: Persisted) => {
    const answer = must<{ outcome: string }>(await client.rpcAs('start_session', {
      p_session_id: stored.session.id,
    }, actor.token), 'Fixture start')
    expect(answer.outcome).toBe('started')
  }
  const complete = async (stored: Persisted) => {
    await start(stored)
    must(await client.insertAs('exercise_set_logs', {
      id: randomUUID(), workout_exercise_id: stored.sections[0].blocks[0].exercises[0].exercise.id,
      set_number: 1, actual_reps: 8, weight: 0, weight_unit: 'kg',
    }, actor.token), 'Fixture actual performed-set write')
    const answer = must<{ outcome: string }>(await client.rpcAs('complete_session', {
      p_session_id: stored.session.id, p_actual_duration_mins: 30,
    }, actor.token), 'Fixture completion')
    expect(answer.outcome).toBe('completed')
  }
  const snapshot = async (id: string) => must<Snapshot>(await client.rpcAs('session_snapshot', {
    p_session_id: id,
  }, actor.token), 'Fixture snapshot read')
  const key = (screen: Screen, state: string): Key => ({
    screen, route: screen === 'Session Detail' ? '/history/:id' : `/${screen.toLowerCase()}`, state,
  })
  const readyWorkout = async (page: Page) => {
    await expect(page.locator('main h1')).toHaveAccessibleName('Workout')
    await expect(page.getByRole('form', { name: /^Log set 1 of/ })).toBeVisible()
  }

  test('Workout — actual active-read loading, failure and real retry', async ({ page, visit }) => {
    await start(await persist())
    const held = await boundary(page, { tail: 'rpc/resume_session', method: 'POST' }, 'held-failure')
    try {
      await visit('/workout')
      await held.arrival
      await save!.take(key('Workout', 'active-read-loading'), '/workout', 'Workout',
        'Actual resume_session read is held; shell has not rendered a session.', async () => {
          await expect(page.locator('main').getByRole('status')).toContainText(/Loading session|Taking longer than usual/)
          await expect(page.getByRole('form', { name: /^Log set/ })).toHaveCount(0)
        })
      held.release()
      await save!.take(key('Workout', 'active-read-error-retry'), '/workout', 'Workout',
        'Actual failed active read offers Try again rather than no-active redirection.', async () => {
          await expect(page.getByRole('alert')).toContainText('Your session didn’t load')
          await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled()
        })
    } finally { await held.dispose() }
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await readyWorkout(page)
  })

  test('Workout and Summary — real null/empty reads redirect without an empty shell', async ({ page, visit }) => {
    const noActive = must<Snapshot | null>(await client.rpcAs('resume_session', { p_user_id: actor.id }, actor.token), 'No-active fixture read')
    expect(noActive === null).toBe(true)
    const activeRead = await boundary(page, { tail: 'rpc/resume_session', method: 'POST' }, 'held-real')
    try {
      await visit('/workout')
      await activeRead.arrival
      await save!.transition(key('Workout', 'no-active-session-home'), '/workout', 'Workout', async () => {
        await expect(page.locator('main').getByRole('status')).toContainText(/Loading session|Taking longer than usual/)
      }, async () => { activeRead.release() }, '/', 'Today', async () => {
        await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
        await expect(page.getByRole('button', { name: 'Resume workout', exact: true })).toHaveCount(0)
      }, 'Observed Workout loading origin; unchanged real null resume response redirects Home, not a rendered empty shell.')
    } finally { await activeRead.dispose() }
    const noCompleted = must<unknown[]>(await client.rpcAs('streak_sessions', {
      p_user_id: actor.id, p_before: null, p_limit: 1,
    }, actor.token), 'No-completed fixture read')
    expect(noCompleted).toEqual([])
    const completedRead = await boundary(page, { tail: 'rpc/streak_sessions', method: 'POST', limit: 1 }, 'held-real')
    try {
      await visit('/summary')
      await completedRead.arrival
      await save!.transition(key('Summary', 'no-completed-session-home'), '/summary', 'Nice work', async () => {
        await expect(page.locator('main').getByRole('status')).toContainText(/Reading your session|Taking longer than usual/)
      }, async () => { completedRead.release() }, '/', 'Today', async () => {
        await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
      }, 'Observed Summary loading origin; unchanged real empty latest-session response redirects Home without a fabricated debrief.')
    } finally { await completedRead.dispose() }
  })

  test('Workout — persisted re-entry and genuine sustained set-sync failure/retry', async ({ page, visit }) => {
    const stored = await persist(TITLE, 0, true)
    await start(stored)
    const initial = await snapshot(stored.session.id)
    expect(initial.state).toBe('active')
    const startedAt = initial.session.started_at
    expect(startedAt !== null).toBe(true)
    await visit('/workout')
    await readyWorkout(page)
    await page.getByRole('button', { name: /^Second phase, / }).click()
    const failedWrite = await boundary(page, { tail: 'exercise_set_logs', method: 'POST' }, 'failure')
    try {
      const form = page.getByRole('form', { name: /^Log set 1 of/ })
      await form.getByLabel('Reps', { exact: true }).fill('8')
      await form.getByRole('button', { name: 'Log set 1', exact: true }).click()
      await page.getByRole('button', { name: 'Add 30s', exact: true }).click()
      await save!.take(key('Workout', 'rest-running-urgent-skipped'), '/workout', 'Workout',
        'A real prescribed ten-second rest is extended through Add 30s; its ordinary >10s branch is distinct from the retained urgent/skipped captures.', async () => {
          await expect(page.getByRole('region', { name: 'Rest', exact: true })).toHaveAttribute('data-urgent', 'false')
          await expect(page.getByText('Final 10 seconds', { exact: true })).toHaveCount(0)
          await expect(page.getByRole('button', { name: 'Skip rest', exact: true })).toBeEnabled()
        }, 'ordinary-extended')
      await page.getByRole('button', { name: 'Skip rest', exact: true }).click()
      await save!.take(key('Workout', 'set-sync-sustained-failure-retry'), '/workout', 'Workout',
        'A genuine UI-logged set has actually failed at least two writes; local queue and one factual notice retain it.', async () => {
          await expect.poll(failedWrite.count, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
          await expect(page.getByRole('status').filter({ hasText: 'Sets waiting to sync' })).toContainText('1 set is saved on this device')
          await expect(page.getByRole('list', { name: 'Logged sets' })).toContainText('On this device only')
          await expect(page.getByRole('button', { name: 'Try now', exact: true })).toBeEnabled()
        }, 'sustained-failure')
    } finally { await failedWrite.dispose() }
    await page.getByRole('button', { name: 'Try now', exact: true }).click()
    await save!.take(key('Workout', 'set-sync-sustained-failure-retry'), '/workout', 'Workout',
      'Actual Try now sends the same queued set to the real backend; Saved is confirmed and the factual notice disappears.', async () => {
        await expect(page.getByRole('list', { name: 'Logged sets' })).toContainText('Saved')
        await expect(page.getByRole('status').filter({ hasText: 'Sets waiting to sync' })).toHaveCount(0)
        await expect.poll(async () => {
          const rows = must<unknown[]>(await client.selectAsService('exercise_set_logs', {
            select: 'id', workout_exercise_id: `eq.${stored.sections[1].blocks[0].exercises[0].exercise.id}`, set_number: 'eq.1',
          }), 'Exact fixture performed-set readback')
          return rows.length
        }).toBe(1)
      }, 'real-retry-confirmed')
    // A fresh document models persisted re-entry; not an invented pause mode or
    // an assertion that the OS actually backgrounded a physical phone.
    await visit('/')
    await expect(page.getByRole('button', { name: 'Resume workout', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Resume workout', exact: true }).click()
    await save!.take(key('Workout', 'background-resume'), '/workout', 'Workout',
      'Fresh-document re-entry resumes the same real started session, restores its selected section and reads the stored set; no restart/pause claim.', async () => {
        await expect(page.getByRole('button', { name: /^Second phase, / })).toHaveAttribute('aria-current', 'step')
        await expect(page.getByRole('list', { name: 'Logged sets' })).toContainText('Saved')
        await expect(page.getByRole('timer', { name: 'Session time', exact: true })).toBeVisible()
        const resumed = await snapshot(stored.session.id)
        expect(resumed.state).toBe('active')
        expect(resumed.session.started_at === startedAt).toBe(true)
      })
  })

  test('Workout — abandon error preserves active work, real retry lands Home', async ({ page, visit }) => {
    const stored = await persist()
    await start(stored)
    await visit('/workout')
    await readyWorkout(page)
    const failedWrite = await boundary(page, { tail: 'rpc/abandon_session', method: 'POST' }, 'failure')
    try {
      await page.getByRole('button', { name: 'Abandon', exact: true }).click()
      await page.getByRole('dialog', { name: 'Abandon workout?' }).getByRole('button', { name: 'Abandon', exact: true }).click()
      await save!.take(key('Workout', 'abandon-error-retry'), '/workout', 'Workout',
        'Actual abandon failed; blocking That didn’t save dialog leaves the same active session, with retry through its original control.', async () => {
          await expect(page.getByRole('dialog', { name: 'That didn’t save' })).toBeVisible()
          const remaining = await snapshot(stored.session.id)
          expect(remaining.state).toBe('active')
          expect(remaining.session.completed_at === null && remaining.session.abandoned_at === null).toBe(true)
        })
    } finally { await failedWrite.dispose() }
    await page.getByRole('dialog', { name: 'That didn’t save' }).getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Abandon', exact: true }).click()
    await save!.transition(key('Workout', 'abandon-home'), '/workout', 'Workout', async () => {
      await expect(page.getByRole('dialog', { name: 'Abandon workout?' })).toBeVisible()
    }, async () => {
      await page.getByRole('dialog', { name: 'Abandon workout?' }).getByRole('button', { name: 'Abandon', exact: true }).click()
    }, '/', 'Today', async () => {
      await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
      const ended = await snapshot(stored.session.id)
      expect(ended.state).toBe('abandoned')
      expect(ended.session.abandoned_at !== null && ended.session.completed_at === null).toBe(true)
    }, 'Observed actual abandon confirmation; successful real abandon changes the stored session to abandoned and lands Home, preserving rather than deleting its structure.')
  })

  test('Summary — actual completed-read loading/error/retry and both independent streak branches', async ({ page, visit }) => {
    const stored = await persist(TITLE, 3)
    await complete(stored)
    // Real namespaced historical row, not a mocked Streak object. Both lifecycle
    // timestamps stay ordered and non-null; no current/yesterday training exists.
    const finished = new Date(Date.now() - 3 * 86_400_000).toISOString()
    const began = new Date(Date.parse(finished) - 30 * 60_000).toISOString()
    const historical = must<Array<{ id: string }>>(await client.updateAs('workout_sessions', {
      id: `eq.${stored.session.id}`, user_id: `eq.${actor.id}`,
    }, { started_at: began, completed_at: finished }, actor.token), 'Exact owned historical fixture timestamps')
    expect(historical.length === 1 && historical[0].id === stored.session.id).toBe(true)
    const latest = await boundary(page, { tail: 'rpc/streak_sessions', method: 'POST', limit: 1 }, 'held-failure')
    try {
      await visit('/summary')
      await latest.arrival
      await save!.take(key('Summary', 'completed-read-loading'), '/summary', 'Nice work',
        'Summary latest-session RPC (p_limit=1) is actually pending; the debrief is not rendered yet.', async () => {
          await expect(page.locator('main').getByRole('status')).toContainText(/Reading your session|Taking longer than usual/)
          await expect(page.locator('form#summary-debrief')).toHaveCount(0)
        })
      latest.release()
      await save!.take(key('Summary', 'completed-read-error-retry'), '/summary', 'Nice work',
        'Actual latest-session failure exposes Retry, distinct from its independently loaded streak.', async () => {
          await expect(page.getByRole('alert')).toContainText('That session didn’t load')
          await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled()
        })
    } finally { await latest.dispose() }
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await save!.take(key('Summary', 'streak-empty-or-error'), '/summary', 'Nice work',
      'Real historical completed session opens a debrief, but no today/yesterday session or rest-day mark forms a current streak.', async () => {
        await expect(page.getByText('No streak yet. Sessions on consecutive days build one.', { exact: true })).toBeVisible()
        await expect(page.getByText(`${TITLE}, done.`, { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Save and close', exact: true })).toBeEnabled()
      }, 'empty')
    const streak = await boundary(page, { tail: 'rpc/streak_sessions', method: 'POST', limit: 200 }, 'failure')
    try {
      // Fresh document resets the cached streak; only the p_limit=200 read fails.
      // p_limit=1 latest and its owned session-row read remain completely real.
      await visit('/summary')
      await streak.arrival
      await save!.take(key('Summary', 'streak-empty-or-error'), '/summary', 'Nice work',
        'Actual independent streak read fails without blocking the real completed-session debrief or its save control.', async () => {
          await expect(page.getByRole('alert')).toContainText('Your streak didn’t load')
          await expect(page.getByText(`${TITLE}, done.`, { exact: true })).toBeVisible()
          await expect(page.getByLabel('Notes · optional')).toHaveValue('')
          await expect(page.getByRole('button', { name: 'Save and close', exact: true })).toBeEnabled()
        }, 'independent-error')
    } finally { await streak.dispose() }
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByText('No streak yet. Sessions on consecutive days build one.', { exact: true })).toBeVisible()
  })

  test('Session Detail — actual active-session question and abandon confirmation before restart', async ({ page, visit }) => {
    const legacyTitle = 'TASK-040 isolated completed legacy contract'
    const legacy = await persist(legacyTitle, 2)
    await complete(legacy)
    const revised = must<Array<{ id: string }>>(await client.updateAs('workout_sessions', {
      id: `eq.${legacy.session.id}`, user_id: `eq.${actor.id}`,
    }, { contract_version: '3.0.0' }, actor.token), 'Exact owned legacy-contract fixture')
    expect(revised.length === 1 && revised[0].id === legacy.session.id).toBe(true)
    const legacyPath = `/history/${legacy.session.id}`
    await visit(legacyPath)
    await save!.take(key('Session Detail', 'restart-ineligible'), legacyPath, legacyTitle,
      'Actual completed legacy contract remains readable; the unsupported-contract branch explains why Restart is unavailable, distinct from the retained never-started branch.', async () => {
        await expect(page.getByText('This workout was recorded before a change to how workouts are stored, so it can’t be restarted. Generate a new workout instead.', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Restart', exact: true })).toHaveCount(0)
        await expect(page.getByRole('region', { name: 'Sections', exact: true })).toBeVisible()
      }, 'completed-unsupported-contract')
    const done = await persist(TITLE, 1)
    await complete(done)
    const active = await persist('TASK-040 isolated still-running workout')
    await start(active)
    let restartReads = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/rpc/session_as_intended_at_start')) restartReads += 1
    })
    const path = `/history/${done.session.id}`
    await visit(path)
    await save!.take(key('Session Detail', 'restart-active-confirmation'), path, TITLE,
      'AppChrome’s real global active-session prompt masks the completed record before Restart is reachable; not a fabricated restart-specific confirmation.', async () => {
        const dialog = page.getByRole('dialog', { name: 'You have a workout in progress', exact: true })
        await expect(dialog).toContainText('TASK-040 isolated still-running workout is still running.')
        await expect(dialog.getByRole('button', { name: 'Resume workout', exact: true })).toBeEnabled()
        await expect(dialog.getByRole('button', { name: 'Abandon it', exact: true })).toBeEnabled()
        // Native showModal makes the background inert, but Playwright role
        // selectors can still match its DOM button. Absence would be a false
        // claim; prove the real top-layer modal and retained underlying action.
        await expect(page.locator('dialog:modal')).toHaveAccessibleName('You have a workout in progress')
        await expect(page.getByRole('button', { name: 'Restart', exact: true })).toHaveCount(1)
        expect(restartReads).toBe(0)
      }, 'global-active-question')
    await page.getByRole('dialog', { name: 'You have a workout in progress', exact: true }).getByRole('button', { name: 'Abandon it', exact: true }).click()
    await save!.take(key('Session Detail', 'restart-active-confirmation'), path, TITLE,
      'The prompt’s real destructive answer opens the existing shared Abandon workout confirmation; completed history is unchanged and no restart/generation read occurred.', async () => {
        await expect(page.getByRole('dialog', { name: 'Abandon workout?', exact: true })).toBeVisible()
        await expect(page.getByRole('dialog', { name: 'Abandon workout?', exact: true })).toContainText('Everything logged so far is kept.')
        expect(restartReads).toBe(0)
      }, 'shared-abandon-confirmation')
    await page.getByRole('dialog', { name: 'Abandon workout?', exact: true }).getByRole('button', { name: 'Keep going', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'You have a workout in progress', exact: true })).toBeVisible()
    await page.getByRole('dialog', { name: 'You have a workout in progress', exact: true }).getByRole('button', { name: 'Resume workout', exact: true }).click()
    await readyWorkout(page)
    const resumed = await snapshot(active.session.id)
    expect(resumed.state).toBe('active')
    expect(restartReads).toBe(0)
  })
})
