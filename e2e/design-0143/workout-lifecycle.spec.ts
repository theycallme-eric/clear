import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { deriveAnchors } from '../../src/state/anchors'
import { anchorEvidenceSchema, loadAnchorPayloadSchema } from '../../src/state/schemas'
import { expect, test as base } from '../fixtures'
import { backend } from '../support/backend'
import { captureIdentity, capturePairId } from './capture'
import { installDeterministicCapture, playwrightCaptureDriver } from './fixtures'
import {
  baselineEntry, BASELINE_INVENTORY_PATH, CAPTURE_SKINS, CAPTURE_VIEWPORTS,
  isProtectedPath, readBaselineInventory, VIEWPORT_OF_PROJECT,
  type CaptureSkin, type CaptureViewportId,
} from './state-inventory'

/**
 * REQ-009/022/023/024/025/029/030 / TASK-036 — the workout-lifecycle group's
 * AFTER evidence: Review, every enabled Workout renderer with its timers,
 * rest and coaching, and Summary with its debrief, on the installed 0.14.3
 * package.
 *
 * Every picture is of the real app on its real route, behind its real guards,
 * holding a genuine session for a disposable namespaced user. Workouts are the
 * existing prescription fixtures persisted through the real `persist_session`
 * RPC — never a model response — and every model POST is held in the browser
 * and never forwarded, so nothing here is live generation or deployed proof.
 * Wire faults are scoped, synthetic 503s on one boundary at a time.
 *
 * Beside each picture the case measures what the criteria are about: no card
 * inside a card, labels inside their group, timers labelled and not live, the
 * low state's stepped 400ms crossing and 80% pulse, one interface loop, the
 * public mood glyphs and the pinned primary action.
 *
 * A case's record and pictures are written under `EVIDENCE_DIR` the first time
 * it passes and left alone afterwards: a committed record names the tree it was
 * taken from and is never rebound to a later run.
 */
const EVIDENCE_DIR = 'docs/design/evidence-0143/workout-lifecycle'
const BEFORE_MANIFEST = 'docs/design/0143-intake-baseline/manifest.json'
const BEFORE_DIR = 'docs/design/0143-intake-baseline/screenshots'
const SOURCE_FILE = 'e2e/design-0143/workout-lifecycle.spec.ts'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const SKIN_KEY = 'clear.skin'
const SESSION_KEY = 'clear.auth.session'
const TITLE = 'TASK-036 lifecycle spectrum'
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const heading = (page: Page, name: string) =>
  expect(page.locator('main h1')).toHaveAccessibleName(name, { timeout: 30_000 })

function deferred() {
  let release!: () => void
  const wait = new Promise<void>((done) => { release = done })
  return { wait, release }
}
const dayAgo = (offset: number) => {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() - offset)
  return value.toISOString().slice(0, 10)
}

interface BeforeCapture {
  screen: string
  route: string | null
  state: string
  variant: string | null
  screenshot: { name: string; sha256: string }
}
const beforeCaptures = (JSON.parse(readFileSync(resolve(process.cwd(), BEFORE_MANIFEST), 'utf8')) as {
  supplemental: { captures: BeforeCapture[] }
}).supplemental.captures

/** TASK-040's picture of the same state; a like-named variant first, else the state's first. */
function beforeOf(screen: string, route: string, state: string, variant: string) {
  const same = beforeCaptures.filter((c) => c.screen === screen && c.route === route && c.state === state)
  const match = same.find((c) => (c.variant ?? '') === variant) ?? same[0]
  return match
    ? { directory: BEFORE_DIR, screenshot: match.screenshot.name, sha256: match.screenshot.sha256,
        variant: match.variant }
    : null
}

// ── The backend fixture: a real user, real rows, nothing generated ──────────

type Catalogued = { id: string; default_equipment: string }
type Persisted = {
  session: { id: string }
  sections: { blocks: { exercises: { exercise: { id: string } }[] }[] }[]
}
type Answer = { ok: boolean; status: number; body: unknown }

/** Never put an admin response body, actor, token or email into an assertion. */
function must<T>(answer: Answer, operation: string): T {
  expect(answer.ok, `${operation}: HTTP status ${answer.status}`).toBe(true)
  return answer.body as T
}

function prescription(exercise: Catalogued, overrides: Record<string, unknown> = {}) {
  return {
    exercise_id: exercise.id, equipment: exercise.default_equipment, session_function: 'primary',
    anchor_relationship: 'neutral', modality: 'reps', sets: 2, target_kind: 'fixed', target_value: 8,
    target_min: null, target_max: null, target_sequence: null, per_side: false, distance_unit: null,
    rest_seconds: 10, tempo: null, load_type: 'none', load_value: null, is_interval_exercise: false,
    ...overrides,
  }
}

/** The seven enabled dispatches, as TASK-040 persisted them; Standard carries a load and a 30s rest. */
function spectrum(catalog: Catalogued[], locationId: string | null, title = TITLE, offset = 0) {
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
      : structure === 'standard'
        ? [prescription(one, { rest_seconds: 30, load_type: 'rir', load_value: 2 })]
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
    date: dayAgo(offset), location_id: locationId, session_focus: 'full_body', goal_preset: 'balanced',
    requested_duration_mins: 30, effective_duration_target_mins: 30, computed_duration_mins: null,
    requested_intensity: 5, effective_intensity: 5, adjustment_reason: null, generation_notes: null,
    prompt_version: 'e2e', contract_version: '4.1.0',
    workout: {
      title, overview: 'Persisted capture fixture; not a model response.', estimated_duration_mins: 30,
      sections: sections.map(([section_title, section_type, fixture]) => ({
        section_type, section_title, section_notes: null,
        blocks: [{ ...fixture, exercises: fixture.exercises.map((exercise) => ({
          ...exercise,
          session_function: section_type === 'primary_lift' ? 'primary' : section_type === 'accessory' ? 'accessory' : 'conditioning',
        })) }],
      })),
    },
  }
}

interface World {
  readonly client: ReturnType<typeof backend.client>
  readonly catalog: Catalogued[]
  readonly userId: string
  persist(title?: string, offset?: number, withoutLocation?: boolean): Promise<Persisted>
  start(stored: Persisted): Promise<void>
  /** Start, log one weighted working set through the real table, complete. */
  complete(stored: Persisted): Promise<void>
  /** The app's own anchor derivation over the real evidence read, stored through the real RPC. */
  storeAnchors(): Promise<number>
  snapshot(id: string): Promise<{ state: string; session: { started_at: string | null } }>
}

/** A scoped hold, synthetic 503 or held real answer on one REST boundary; never a fake row. */
type Boundary = { tail: string; method: 'GET' | 'POST' | 'PATCH'; limit?: 1 | 200 }
async function boundary(page: Page, target: Boundary, mode: 'held-failure' | 'failure' | 'held-real') {
  const hold = deferred()
  let arrived!: () => void
  const arrival = new Promise<void>((done) => { arrived = done })
  let intercepted = 0
  const pattern = `**/rest/v1/${target.tail}*`
  const handler = async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() !== target.method) return route.fallback()
    if (!new URL(request.url()).pathname.endsWith(`/rest/v1/${target.tail}`)) return route.fallback()
    if (target.limit !== undefined) {
      const body: unknown = request.postDataJSON()
      if (!(typeof body === 'object' && body !== null && 'p_limit' in body && body.p_limit === target.limit)) {
        return route.fallback()
      }
    }
    intercepted += 1
    if (mode === 'held-real') {
      const response = await route.fetch()
      arrived()
      await hold.wait
      return route.fulfill({ response })
    }
    arrived()
    if (mode === 'held-failure') await hold.wait
    return route.fulfill({ status: 503, headers: CORS,
      json: { code: 'PGRST000', message: 'Controlled TASK-036 capture boundary unavailable.' } })
  }
  await page.route(pattern, handler)
  return { arrival, release: hold.release, count: () => intercepted,
    async dispose() { hold.release(); await page.unroute(pattern, handler) } }
}

// ── The evidence fixture ──────────────────────────────────────────────────

type Assertion = () => Promise<void>
type NoteKind = 'keyboard' | 'motion' | 'contract' | 'timer' | 'containment' | 'discrepancy' | 'fixture'
interface ShotOptions {
  /** A discriminator when one state is pictured more than once. */
  readonly variant?: string
  /** Also picture the state in the other three skins (phone project only). */
  readonly skins?: boolean
  /** Additive responsive cases also sample the original tablet/desktop projects. */
  readonly acrossSkins?: boolean
  /** Also picture it at 390x320 with this action still reachable (phone project only). */
  readonly short?: Locator
}
interface Evidence {
  /** Assert, then picture, the state the browser is in at `at`. */
  shot(screen: string, route: string, state: string, at: string, title: string,
    assertState: Assertion, options?: ShotOptions): Promise<void>
  note(kind: NoteKind, text: string, data?: unknown): void
  disposition(screen: string, route: string, state: string, reason: string, sources: string[]): void
  readonly phone: boolean
  modelAttempts(): number
}

const test = base.extend<{ world: World; evidence: Evidence }>({
  world: async ({ page }, use, testInfo) => {
    // A missing integration credential is not a passing or skipped capture.
    expect(backend.available, backend.reason).toBe(true)
    const client = backend.client()
    const catalog = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
      // Anchor evidence excludes bodyweight equipment, so the load suggestion is reachable.
      select: 'id,default_equipment', default_equipment: 'neq.bodyweight', order: 'id.asc', limit: '2',
    }), 'Fixture catalog read')
    expect(catalog).toHaveLength(2)
    const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 10)
    const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t036-${suffix}@example.com`
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
      throw new Error('TASK-036 namespaced fixture authentication failed; no response body retained.')
    }
    if (userId === null) throw new Error('TASK-036 fixture user was not created.')
    const owner = userId
    try {
      must(await client.rpcAs('complete_onboarding', {
        p_location_name: 'TASK-036 capture gym', p_location_tier: 'full',
        p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((e) => e.default_equipment)])],
        p_experience_level: 'some', p_goal_preset: 'balanced',
        p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
      }, token), 'Fixture onboarding')
      const [location] = must<Array<{ id: string }>>(await client.selectAsService('locations', {
        select: 'id', user_id: `eq.${owner}`, limit: '1',
      }), 'Fixture location read')
      await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
        key: SESSION_KEY, session: { accessToken: token, refreshToken,
          expiresAt: Date.now() + 60 * 60 * 1000, user: { id: owner, email } },
      })
      const world: World = {
        client, catalog, userId: owner,
        persist: async (title = TITLE, offset = 0, withoutLocation = false) => must<Persisted>(await client.rpcAs('persist_session', {
          p_user_id: owner, p_session: spectrum(catalog, withoutLocation ? null : location?.id ?? null, title, offset),
        }, token), 'Fixture persistence'),
        async start(stored) {
          const started = must<{ outcome: string }>(await client.rpcAs('start_session', {
            p_session_id: stored.session.id }, token), 'Fixture start')
          expect(started.outcome).toBe('started')
        },
        async complete(stored) {
          await world.start(stored)
          must(await client.insertAs('exercise_set_logs', {
            id: randomUUID(), workout_exercise_id: stored.sections[0].blocks[0].exercises[0].exercise.id,
            // An anchor is read from weight, reps and RPE together.
            set_number: 1, actual_reps: 8, weight: 40, weight_unit: 'kg', rpe: 8,
          }, token), 'Fixture performed-set write')
          const done = must<{ outcome: string }>(await client.rpcAs('complete_session', {
            p_session_id: stored.session.id, p_actual_duration_mins: 30 }, token), 'Fixture completion')
          expect(done.outcome).toBe('completed')
        },
        async storeAnchors() {
          const evidence = anchorEvidenceSchema.parse(must(await client.rpcAs('anchor_evidence', {
            p_user_id: owner }, token), 'Fixture anchor evidence read'))
          const payload = loadAnchorPayloadSchema.parse(deriveAnchors(evidence))
          const stored = must<unknown[]>(await client.rpcAs('set_load_anchors', {
            p_user_id: owner, p_anchors: payload }, token), 'Fixture anchor write')
          return stored.length
        },
        snapshot: async (id) => must(await client.rpcAs('session_snapshot', { p_session_id: id }, token),
          'Fixture snapshot read'),
      }
      await use(world)
    } finally {
      await client.deleteUser(owner).catch(() => {
        throw new Error('TASK-036 scoped fixture cleanup failed.')
      })
    }
  },

  evidence: async ({ page, world }, use, testInfo) => {
    void world
    const projectViewport = VIEWPORT_OF_PROJECT[testInfo.project.name]
    if (!projectViewport) throw new Error('TASK-036 expects an existing named viewport project')
    const phone = projectViewport === 'phone'
    let viewport: CaptureViewportId = projectViewport
    let skin: CaptureSkin = 'clear'
    const guard = await installDeterministicCapture(page, { skin })
    const identity = captureIdentity()
    expect(identity.packageVersion, 'after evidence is taken on the imported package').toBe('0.14.3')
    const inventory = readBaselineInventory()
    const driver = playwrightCaptureDriver(page, testInfo)
    const caseKey = slug(testInfo.title.split(':')[0])

    let modelAttempts = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/functions\/v1\/generate-/.test(new URL(request.url()).pathname)) {
        modelAttempts += 1
      }
    })

    const captures: unknown[] = []
    const observations: Array<{ kind: NoteKind; text: string; data?: unknown }> = []
    const dispositions: unknown[] = []
    const pictures = new Map<string, Uint8Array>()

    const ref = (screen: string, route: string, state: string) => {
      if (!baselineEntry(inventory, screen, route)?.states.includes(state)) {
        throw new Error(`No recorded baseline state: ${screen} ${route} ${state}`)
      }
      return { task: inventory.task, inventory: BASELINE_INVENTORY_PATH, mainSha: inventory.mainSha,
        screen, route, state }
    }
    const setSkin = async (next: CaptureSkin) => {
      // What the package's own `setSkin` does: the stored key and the attribute.
      await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value),
        { key: SKIN_KEY, value: next })
      await page.evaluate(({ key, value }) => {
        window.localStorage.setItem(key, value)
        document.documentElement.setAttribute('data-skin', value)
      }, { key: SKIN_KEY, value: next })
      skin = next
    }
    const setViewport = async (next: CaptureViewportId) => {
      const size = CAPTURE_VIEWPORTS.find((candidate) => candidate.id === next)!
      await page.setViewportSize({ width: size.width, height: size.height })
      viewport = next
    }
    const take = async (screen: string, route: string, state: string, at: string,
      title: string, assertState: Assertion, variant: string) => {
      const baseline = ref(screen, route, state)
      await expect(page, `${screen} "${state}" is pictured at ${at}`).toHaveURL((url) => url.pathname === at)
      await heading(page, title)
      if (isProtectedPath(at)) {
        // A protected route that fell back to Welcome is a failure, not a picture.
        await expect(page.getByRole('button', { name: 'Get started', exact: true })).toHaveCount(0)
      }
      await assertState()
      const size = CAPTURE_VIEWPORTS.find((candidate) => candidate.id === viewport)!
      expect(page.viewportSize()).toEqual({ width: size.width, height: size.height })
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        `${screen} "${state}" overflows the ${viewport} viewport sideways`).toBe(true)
      // Entrances and state changes end; only an endless loop may still be running.
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) =>
        animation.playState === 'running' &&
        Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))).length),
      { message: `${screen} "${state}" never came to rest`, timeout: 15_000, intervals: [100, 250, 500] }).toBe(0)
      const motion = await driver.motion()
      const name = [caseKey, slug(screen), slug(state), variant ? slug(variant) : null, viewport, skin]
        .filter(Boolean).join('--') + '.png'
      if (pictures.has(name)) throw new Error(`${name} was pictured twice`)
      const bytes = await page.screenshot({ caret: 'hide', scale: 'css' })
      pictures.set(name, bytes)
      captures.push({
        phase: 'after', kind: 'route-state',
        pairId: capturePairId({ screen, route, state }, viewport, skin),
        screen, route, state, variant: variant || null, baseline,
        before: beforeOf(screen, route, state, variant),
        viewport: size, skin, reached: { pathname: at, heading: title, stateVisible: true }, motion,
        screenshot: { name, sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.byteLength, explicit: true },
        deterministic: true, liveGeneration: false,
      })
    }

    const evidence: Evidence = {
      phone,
      async shot(screen, route, state, at, title, assertState, options = {}) {
        const variant = options.variant ?? ''
        await take(screen, route, state, at, title, assertState, variant)
        if (!phone && !options.acrossSkins) return
        if (options.skins) {
          for (const next of CAPTURE_SKINS.filter((candidate) => candidate !== 'clear')) {
            await setSkin(next)
            await take(screen, route, state, at, title, assertState, variant)
          }
          await setSkin('clear')
        }
        if (options.short && phone) {
          const action = options.short
          await setViewport('short')
          await take(screen, route, state, at, title, async () => {
            await assertState()
            await action.scrollIntoViewIfNeeded()
            await expect(action).toBeInViewport()
            const box = (await action.boundingBox())!
            // The TASK-040 condition, executed rather than recorded: the action's
            // bottom edge is inside the short viewport.
            expect(box.y).toBeGreaterThanOrEqual(0)
            expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
            // The page itself never scrolls; the screen's own region does.
            expect(await page.evaluate(() =>
              document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true)
          }, variant)
          if (options.acrossSkins && options.skins) {
            for (const next of CAPTURE_SKINS.filter((candidate) => candidate !== 'clear')) {
              await setSkin(next)
              await take(screen, route, state, at, title, async () => {
                await assertState()
                await action.scrollIntoViewIfNeeded()
                await expect(action).toBeInViewport()
                const box = (await action.boundingBox())!
                expect(box.y).toBeGreaterThanOrEqual(0)
                expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
                expect(await page.evaluate(() =>
                  document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true)
              }, variant)
            }
            await setSkin('clear')
          }
          await setViewport('phone')
        }
      },
      note(kind, text, data) {
        // A state re-asserted per skin or viewport says the same thing once.
        if (observations.some((seen) => seen.text === text)) return
        observations.push({ kind, text, ...(data === undefined ? {} : { data }) })
      },
      disposition(screen, route, state, reason, sources) {
        dispositions.push({ kind: 'source-branch-disposition', baseline: ref(screen, route, state),
          reason, sources, renderedClaim: false })
      },
      modelAttempts: () => modelAttempts,
    }

    await use(evidence)

    const record = {
      version: 1, task: 'TASK-036', issue: 382, consumer: 'workout-lifecycle', phase: 'after',
      caseTitle: testInfo.title, project: testInfo.project.name, sourceFile: SOURCE_FILE,
      identity, status: testInfo.status, captures, observations, dispositions,
      generation: { requests: modelAttempts, forwardedToProvider: 0,
        blockedUnexpected: guard.blockedGenerations() },
      deterministic: true, liveGeneration: false, deployedProof: false,
    }
    const attached = testInfo.outputPath('workout-lifecycle-record.json')
    writeFileSync(attached, JSON.stringify(record, null, 2))
    await testInfo.attach('workout-lifecycle-record', { path: attached, contentType: 'application/json' })
    expect(guard.blockedGenerations(), 'a model POST escaped its local hold').toBe(0)

    const committed = resolve(process.cwd(), EVIDENCE_DIR, 'records', `${testInfo.project.name}--${caseKey}.json`)
    if (testInfo.status === 'passed' && !existsSync(committed)) {
      mkdirSync(resolve(process.cwd(), EVIDENCE_DIR, 'records'), { recursive: true })
      mkdirSync(resolve(process.cwd(), EVIDENCE_DIR, 'screenshots'), { recursive: true })
      for (const [name, bytes] of pictures) {
        writeFileSync(resolve(process.cwd(), EVIDENCE_DIR, 'screenshots', name), bytes)
      }
      writeFileSync(committed, `${JSON.stringify(record, null, 2)}\n`)
      await indexRecords()
    }
  },
})

interface CaseRecord {
  project: string
  caseTitle: string
  status: string
  identity: unknown
  captures: Array<{ screen: string; route: string; state: string; skin: string
    viewport: { id: string }; before: { screenshot: string } | null
    motion: { settled: boolean; running: string[] }; screenshot: { name: string } }>
  observations: Array<{ kind: string; text: string; data?: unknown }>
  dispositions: unknown[]
  generation: { requests: number; forwardedToProvider: number; blockedUnexpected: number }
}

/**
 * `manifest.json` is derived from every record present, never written by hand.
 * Workers finish in parallel, so the read-and-write is taken one at a time.
 */
async function indexRecords() {
  const root = resolve(process.cwd(), EVIDENCE_DIR)
  const lock = resolve(root, '.indexing')
  for (let attempt = 0; ; attempt += 1) {
    try { mkdirSync(lock); break } catch (error) {
      if (attempt > 200) throw error
      await new Promise((retry) => setTimeout(retry, 50))
    }
  }
  try {
    const records = readdirSync(resolve(root, 'records')).filter((name) => name.endsWith('.json')).sort()
      .map((name) => JSON.parse(readFileSync(resolve(root, 'records', name), 'utf8')) as CaseRecord)
    const all = records.flatMap((entry) => entry.captures)
    const unique = <T>(values: T[]) => [...new Set(values.map((value) => JSON.stringify(value)))].sort()
      .map((value) => JSON.parse(value) as T)
    const tally = (key: (capture: CaseRecord['captures'][number]) => string) =>
      Object.fromEntries(unique(all.map(key)).map((id) => [id, all.filter((capture) => key(capture) === id).length]))
    const sum = (key: keyof CaseRecord['generation']) =>
      records.reduce((total, entry) => total + entry.generation[key], 0)
    const stateKey = (capture: CaseRecord['captures'][number]) =>
      ({ screen: capture.screen, route: capture.route, state: capture.state })
    writeFileSync(resolve(root, 'manifest.json'), `${JSON.stringify({
      version: 1, task: 'TASK-036', issue: 382, consumer: 'workout-lifecycle', phase: 'after',
      sourceFile: SOURCE_FILE, identity: unique(records.map((entry) => entry.identity)),
      deterministic: true, liveGeneration: false, deployedProof: false,
      screenshotDirectory: `${EVIDENCE_DIR}/screenshots`, beforeDirectory: BEFORE_DIR,
      run: {
        cases: records.map((entry) => ({ project: entry.project, caseTitle: entry.caseTitle,
          status: entry.status, captures: entry.captures.length })),
        generation: { requests: sum('requests'), forwardedToProvider: sum('forwardedToProvider'),
          blockedUnexpected: sum('blockedUnexpected') },
      },
      matrix: {
        captures: all.length,
        withBeforePicture: all.filter((capture) => capture.before !== null).length,
        withoutBeforePicture: unique(all.filter((capture) => capture.before === null).map(stateKey)),
        byViewport: tally((capture) => capture.viewport.id),
        bySkin: tally((capture) => capture.skin),
        byScreen: tally((capture) => capture.screen),
        stillMovingAtCapture: all.filter((capture) => !capture.motion.settled)
          .map((capture) => ({ screenshot: capture.screenshot.name, running: capture.motion.running })),
      },
      states: unique(all.map(stateKey)).map((state) => {
        const same = all.filter((capture) => JSON.stringify(stateKey(capture)) === JSON.stringify(state))
        return { ...state, before: unique(same.flatMap((capture) => capture.before ? [capture.before.screenshot] : [])),
          after: same.map((capture) => capture.screenshot.name).sort() }
      }),
      dispositions: unique(records.flatMap((entry) => entry.dispositions)),
      observations: unique(records.flatMap((entry) => entry.observations.map(({ kind, text }) => ({ kind, text }))))
        .map((seen) => {
          const cases = records.filter((entry) => entry.observations.some((own) => own.text === seen.text))
          return { ...seen, projects: unique(cases.map((entry) => entry.project)),
            data: cases[0].observations.find((own) => own.text === seen.text)?.data ?? null }
        }),
    }, null, 2)}\n`)
  } finally { rmSync(lock, { recursive: true }) }
}

// ── What the browser actually rendered ─────────────────────────────────────

/**
 * Card containment inside `main`, dialogs aside: how many cards, how many sit
 * inside another, and whether any field or field label is outside a card.
 */
function containment(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')!
    const outsideDialog = (el: Element) => el.closest('dialog') === null
    const cards = Array.from(main.querySelectorAll('.clr-card')).filter(outsideDialog)
    const fields = Array.from(main.querySelectorAll('.clr-field, fieldset, label, legend')).filter(outsideDialog)
    return {
      cards: cards.length,
      nested: cards.filter((card) => card.parentElement?.closest('.clr-card') !== null).length,
      fieldsOutsideCards: fields.filter((field) => field.closest('.clr-card__body') === null)
        .map((field) => field.textContent?.trim().slice(0, 40) ?? field.tagName),
      radius: Array.from(main.querySelectorAll<HTMLElement>('.clr-card__body, .clr-chamfer'))
        .filter((el) => getComputedStyle(el).borderRadius !== '0px').length,
    }
  })
}
async function expectContained(page: Page, where: string) {
  const probe = await containment(page)
  expect(probe.nested, `${where}: a card sits inside another card`).toBe(0)
  expect(probe.fieldsOutsideCards, `${where}: a field or its label sits outside its card`).toEqual([])
  expect(probe.radius, `${where}: a framed element has a rounded corner`).toBe(0)
  expect(probe.cards, `${where}: nothing is in a card`).toBeGreaterThan(0)
  return probe
}

/** One timer: its name, liveness, card depth, stepped crossing, low pulse and glow. */
function timerProbe(timer: Locator) {
  return timer.evaluate((el) => {
    const digits = el.querySelector<HTMLElement>('[aria-hidden="true"]')
    const digitStyle = digits ? getComputedStyle(digits) : null
    let cardDepth = 0
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (node.classList.contains('clr-card')) cardDepth += 1
    }
    const pulse = el.closest<HTMLElement>('.clr-pulse-micro')
    const pulseStyle = pulse ? getComputedStyle(pulse) : null
    // Every text emits through `body`'s shadow; only its geometry is comparable,
    // because each element tints it with its own colour.
    const geometry = (shadow: string) => shadow.replace(/(?:color|rgba?)\([^)]*\)\s*/g, '').trim()
    const pulseAnimation = pulse?.getAnimations().find((animation) =>
      'animationName' in animation && (animation as CSSAnimation).animationName === 'clr-micro-pulse')
    const opacities = pulseAnimation?.effect && 'getKeyframes' in pulseAnimation.effect
      ? (pulseAnimation.effect as KeyframeEffect).getKeyframes().map((frame) => Number(frame.opacity))
      : []
    return {
      name: el.getAttribute('aria-label'),
      role: el.getAttribute('role'),
      live: el.closest('[aria-live]')?.getAttribute('aria-live') ?? null,
      cardDepth,
      digits: digits?.textContent ?? null,
      crossing: digitStyle ? { duration: digitStyle.transitionDuration, timing: digitStyle.transitionTimingFunction } : null,
      digitGlow: digitStyle ? {
        own: geometry(digitStyle.textShadow),
        body: geometry(getComputedStyle(document.body).textShadow),
        inline: digits?.style.textShadow || null,
      } : null,
      low: pulse !== null,
      pulse: pulseStyle ? {
        animation: pulseStyle.animationName, duration: pulseStyle.animationDuration,
        timing: pulseStyle.animationTimingFunction, minimumOpacity: opacities.length ? Math.min(...opacities) : null,
        running: pulseAnimation?.playState ?? 'none', boxShadow: pulseStyle.boxShadow,
      } : null,
    }
  })
}
type TimerProbe = Awaited<ReturnType<typeof timerProbe>>
function expectTimerContract(probe: TimerProbe, name: string) {
  expect(probe).toMatchObject({ name, role: 'timer', live: null })
  // A timer is its own card or an element of one, never a card in a card.
  expect(probe.cardDepth).toBeLessThanOrEqual(1)
  // `steps(4, end)` computes as `steps(4)`: end is the default jump.
  expect(probe.crossing?.duration).toBe('0.4s')
  expect(probe.crossing?.timing).toMatch(/^steps\(4(, end)?\)$/)
  // The digits emit exactly as all text does; the timer adds no glow of its own.
  expect(probe.digitGlow?.inline).toBeNull()
  expect(probe.digitGlow?.own).toBe(probe.digitGlow?.body)
}
function expectLowState(probe: TimerProbe, reducedMotion: boolean) {
  expect(probe.low).toBe(true)
  expect(probe.pulse).toMatchObject({
    animation: reducedMotion ? 'none' : 'clr-micro-pulse',
    boxShadow: 'none',
  })
  if (!reducedMotion) {
    expect(probe.pulse).toMatchObject({ duration: '4s', minimumOpacity: 0.8 })
    expect(probe.pulse?.timing).toMatch(/^steps\(2(, end)?\)$/)
  }
}

/** Which elements hold the view's one loop, and which are stilled. */
function loops(page: Page) {
  return page.evaluate(() => ({
    running: Array.from(document.querySelectorAll('[data-loop="run"]'))
      .map((el) => el.getAttribute('aria-label') ?? el.className ?? el.tagName),
    stilled: document.querySelectorAll('[data-loop="still"]').length,
  }))
}

/** `MM:SS` digits of a timer, as seconds. */
async function seconds(timer: Locator) {
  const text = (await timer.locator('[aria-hidden="true"]').first().textContent()) ?? ''
  const [mm, ss] = text.trim().split(':').map(Number)
  return mm * 60 + ss
}

/** The four public faces, read from the vendored icon source itself. */
const ICON_SOURCE = readFileSync(resolve(process.cwd(), 'src/design-system/assets/icons.tsx'), 'utf8')
function publicMouth(name: string) {
  const match = new RegExp(`export const ${name} = [\\s\\S]*?<path d="([^"]+)"`).exec(ICON_SOURCE)
  if (!match) throw new Error(`The public set has no ${name}`)
  return match[1]
}
const MOOD_FACES = [
  { label: 'Worn', glyph: 'Frown' },
  { label: 'Flat', glyph: 'Meh' },
  { label: 'Ready', glyph: 'Smile' },
  { label: 'Peak', glyph: 'SmilePlus' },
] as const

/** No app source draws a face of its own: no local component, no face circle. */
function localFaceDialect() {
  const root = resolve(process.cwd(), 'src')
  const found: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (path === resolve(root, 'design-system')) continue
      if (statSync(path).isDirectory()) { walk(path); continue }
      if (!/\.(tsx?|css)$/.test(name) || /\.test\.tsx?$/.test(name)) continue
      const text = readFileSync(path, 'utf8')
      if (/(?:const|function)\s+(?:Frown|Meh|Smile|SmilePlus)\b/.test(text) || /r="9\.5"/.test(text)) {
        found.push(relative(process.cwd(), path))
      }
    }
  }
  walk(root)
  return found
}

/** Where the focused control is, and whether the browser counts it as keyboard focus. */
function focusProbe(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    const box = active?.getBoundingClientRect()
    return {
      tag: active?.tagName.toLowerCase() ?? null,
      className: typeof active?.className === 'string' ? active.className : null,
      name: active?.getAttribute('aria-label') ?? active?.textContent?.trim().slice(0, 60) ?? null,
      focusVisible: active?.matches(':focus-visible') ?? false,
      brackets: document.querySelectorAll('.clr-focus-brackets').length,
      height: box?.height ?? 0,
    }
  })
}

// ENV-07: the Preview lane has no privileged backend credentials. Register only
// these backend-dependent cases as ineligible there, before their fixtures run.
const backendTest = backend.available ? test : test.skip
test.use({ timezoneId: 'UTC' })

// Additive original-coverage repairs. Old records/pictures remain byte-identical.
backendTest('responsive: original route families and seven renderers across widths, skins and short phone', async ({ page, visit, world, evidence }) => {
  test.setTimeout(300_000)
  evidence.note('fixture', 'Additive original width/skin coverage, not a new all-state Cartesian target; original records and runtime are unchanged.')
  const done = await world.persist(TITLE, 1)
  await world.complete(done)
  await visit('/history/' + done.session.id)
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  const start = page.getByRole('button', { name: 'Start workout', exact: true })
  await evidence.shot('Review', '/review', 'validated-workout', '/review', TITLE, async () => {
    await expect(start).toBeEnabled()
    await expectContained(page, 'Responsive Review')
  }, { variant: 'responsive-briefing', skins: true, acrossSkins: true, short: start })
  await page.clock.install({ time: Date.now() })
  await start.click()
  await heading(page, 'Workout')
  // Freeze geometry captures: a continually ticking session remounts a digit's
  // finite tumble each second. The later urgency step advances this same clock.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000)
  const finish = page.getByRole('button', { name: 'Finish workout', exact: true })
  const sections = [
    { name: 'Standard', variant: 'standard', state: 'active-standard-superset-circuit' },
    { name: 'Superset', variant: 'superset', state: 'active-standard-superset-circuit' },
    { name: 'Circuit', variant: 'circuit', state: 'active-standard-superset-circuit' },
    { name: 'EMOM', variant: 'emom-ready', state: 'active-emom-amrap-for-time-ladder' },
    { name: 'AMRAP', variant: 'amrap-ready', state: 'active-emom-amrap-for-time-ladder' },
    { name: 'Plain For Time', variant: 'for-time-ready', state: 'active-emom-amrap-for-time-ladder' },
    { name: 'Ladder', variant: 'ladder-selected', state: 'active-emom-amrap-for-time-ladder' },
  ]
  for (const section of sections) {
    const tab = page.getByRole('button', { name: new RegExp('^' + section.name + ', ') })
    await tab.click()
    if (section.name === 'Ladder') {
      await page.getByRole('radio', { name: 'Finished the ladder', exact: true }).click()
    }
    await evidence.shot('Workout', '/workout', section.state, '/workout', 'Workout', async () => {
      await expect(tab).toHaveAttribute('aria-current', 'step')
      await expectContained(page, 'Responsive ' + section.name)
      expectTimerContract(await timerProbe(page.getByRole('timer', { name: 'Session time', exact: true })), 'Session time')
      if (section.name === 'Standard') {
        await expect(page.getByRole('form', { name: /^Log set 1 of/ }).first()).toBeVisible()
      } else if (section.name === 'Ladder') {
        await expect(page.getByRole('radio', { name: 'Finished the ladder', exact: true })).toHaveAttribute('aria-checked', 'true')
      } else {
        const names: Record<string, string> = {
          Superset: 'Movements in this superset', Circuit: 'Movements in this circuit',
          EMOM: 'Movements in this EMOM', AMRAP: 'Movements in this AMRAP',
          'Plain For Time': 'Movements in this block',
        }
        await expect(page.getByRole('list', { name: names[section.name], exact: true })).toBeVisible()
      }
    }, { variant: 'responsive-' + section.variant, skins: true, acrossSkins: true,
      ...(section.name === 'Standard'
        ? { short: page.getByRole('form', { name: /^Log set 1 of/ }).first().getByRole('button', { name: 'Log set 1', exact: true }) }
        : section.name === 'Ladder' ? { short: finish } : {}) })
  }
  await page.getByRole('button', { name: /^EMOM, / }).click()
  await page.getByRole('button', { name: 'Start EMOM', exact: true }).click()
  const emomStart = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(emomStart + 52_000)
  const timer = page.getByRole('timer', { name: 'Time remaining', exact: true })
  const urgent = async () => {
    expect(await seconds(timer)).toBe(8)
    expectTimerContract(await timerProbe(timer), 'Time remaining')
    expectLowState(await timerProbe(timer), false)
    expect((await loops(page)).running).toHaveLength(1)
    await expectContained(page, 'Responsive urgent timer')
  }
  await evidence.shot('Workout', '/workout', 'active-emom-amrap-for-time-ladder', '/workout', 'Workout', urgent,
    { variant: 'responsive-emom-urgent', skins: true, acrossSkins: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await evidence.shot('Workout', '/workout', 'active-emom-amrap-for-time-ladder', '/workout', 'Workout', async () => {
    expect(await seconds(timer)).toBe(8)
    expectLowState(await timerProbe(timer), true)
    await expect.poll(() => page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0)
  }, { variant: 'responsive-emom-urgent-reduced', skins: true, acrossSkins: true })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.resume()
  // Finish is the existing last-section action, not a control on Standard or EMOM.
  await page.getByRole('button', { name: /^Ladder, / }).click()
  await finish.click()
  const save = page.getByRole('button', { name: 'Save and close', exact: true })
  await evidence.shot('Summary', '/summary', 'debrief-unrecorded-or-saved', '/summary', 'Nice work', async () => {
    await expect(save).toBeEnabled()
    await expect(page.getByLabel('Notes · optional')).toBeVisible()
    await expectContained(page, 'Responsive Summary')
  }, { variant: 'responsive-debrief', skins: true, acrossSkins: true, short: save })
  const moods = page.getByRole('radiogroup')
  await moods.locator('[role="radio"][tabindex="0"]').focus()
  await expect(moods.getByRole('radio', { name: 'Spent', exact: true })).toBeFocused()
  for (const name of ['Worn', 'Flat', 'Ready', 'Peak']) {
    await page.keyboard.press('ArrowRight')
    // ChoiceGroup moves focus on requestAnimationFrame; Space must wait for it.
    await expect(moods.getByRole('radio', { name, exact: true })).toBeFocused()
  }
  await page.keyboard.press('Space')
  await evidence.shot('Summary', '/summary', 'debrief-unrecorded-or-saved', '/summary', 'Nice work', async () => {
    await expect(moods.getByRole('radio', { name: 'Peak', exact: true })).toHaveAttribute('aria-checked', 'true')
    expect((await focusProbe(page)).focusVisible).toBe(true)
  }, { variant: 'responsive-keyboard-mood', skins: true, acrossSkins: true })
  expect(evidence.modelAttempts()).toBe(0)
})

backendTest('review-boundaries: actual favorite history loading/error/retry and missing-location regenerate fallback', async ({ page, visit, world, evidence }) => {
  test.setTimeout(240_000)
  const done = await world.persist(TITLE, 1)
  await world.complete(done)
  await visit('/summary')
  await page.getByRole('button', { name: 'Save as favorite', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved to favorites' })).toBeVisible()
  await visit('/')
  await page.getByRole('tab', { name: 'Favorites', exact: true }).click()
  const history = await boundary(page, { tail: 'saved_workout_completions', method: 'GET' }, 'held-failure')
  try {
    await page.getByRole('button', { name: /^Start\b/ }).click()
    await history.arrival
    await evidence.shot('Review', '/review', 'favorite-progression-loading', '/review', TITLE, async () => {
      await expect(page.getByRole('status').filter({ hasText: 'Reading what happened last time' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled()
    }, { variant: 'favorite-real-history-read', skins: true, acrossSkins: true })
    history.release()
    const retry = page.getByRole('button', { name: 'Retry', exact: true })
    await evidence.shot('Review', '/review', 'favorite-progression-error-retry', '/review', TITLE, async () => {
      await expect(page.getByText('Your history for this one didn’t load', { exact: true })).toBeVisible()
      await expect(retry).toBeEnabled()
      await expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled()
    }, { variant: 'favorite-real-history-error', skins: true, acrossSkins: true, short: retry })
  } finally { await history.dispose() }
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await evidence.shot('Review', '/review', 'favorite-progression-error-retry', '/review', TITLE, async () => {
    await expect(page.getByText(/^Completed once(?: ·|$)/)).toBeVisible()
    await expect(page.getByText('Your history for this one didn’t load', { exact: true })).toHaveCount(0)
    const [saved] = must<Array<{ times_completed: number }>>(await world.client.selectAsService('saved_workouts', {
      select: 'times_completed', user_id: 'eq.' + world.userId, limit: '1',
    }), 'Favorite completed-count readback')
    expect(saved.times_completed).toBe(1)
  }, { variant: 'favorite-real-history-retry', skins: true, acrossSkins: true })
  evidence.note('contract', 'The favorite was saved through the actual Summary action; its real progression read is held/fails on one boundary, retries to the actual first completion (confirmed by its stored counter), and never blocks Start or dispatches generation.')

  const noPlaceTitle = 'TASK-036 existing missing-location fallback'
  const noPlace = await world.persist(noPlaceTitle, 1, true)
  await world.complete(noPlace)
  await visit('/history/' + noPlace.session.id)
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await heading(page, noPlaceTitle)
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click()
  await page.getByRole('dialog', { name: 'Discard this workout?' })
    .getByRole('button', { name: 'Discard and regenerate', exact: true }).click()
  await evidence.shot('Review', '/review', 'missing-or-invalid-handoff', '/generate', 'Generate workout', async () => {
    await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible()
    await expectContained(page, 'Existing regenerate input fallback')
    expect(evidence.modelAttempts()).toBe(0)
  }, { variant: 'regenerate-missing-location-fallback', skins: true, acrossSkins: true })
  evidence.note('contract', 'A real completed fixture with no location follows History Restart into Review; confirmed Regenerate routes to the existing Generate form without a provider request. No route, persistence or generation code changed.')
  expect(evidence.modelAttempts()).toBe(0)
})

// ── Review ─────────────────────────────────────────────────────────────────

backendTest('review: briefing geometry, load suggestion, regenerate, start busy, failure and start', async ({ page, visit, checkA11y, world, evidence }) => {
  test.setTimeout(240_000)
  evidence.note('fixture', 'A completed persisted fixture with one weighted working set; anchors are the app\'s own deriveAnchors over the real anchor_evidence read, stored through set_load_anchors. Review is reached through History Restart, not a sample screen.')
  const done = await world.persist(TITLE, 1)
  await world.complete(done)
  expect(await world.storeAnchors(), 'the weighted set produced an anchor').toBeGreaterThan(0)
  const at = '/review'
  const start = page.getByRole('button', { name: 'Start workout', exact: true })
  const regenerate = page.getByRole('button', { name: 'Regenerate', exact: true })
  const restart = async () => {
    await visit(`/history/${done.session.id}`)
    await page.getByRole('button', { name: 'Restart', exact: true }).click()
    await heading(page, TITLE)
  }
  await restart()

  const suggestion = page.locator('main .clr-text-action').first()
  await evidence.shot('Review', '/review', 'validated-workout', at, TITLE, async () => {
    await expect(start).toBeEnabled()
    await expect(regenerate).toBeEnabled()
    await expect(suggestion).toBeVisible()
    const probe = await expectContained(page, 'Review')
    // Overview card, then one card per section: no frame inside either.
    const sections = await page.locator('main .clr-card [aria-expanded]').count()
    expect(sections).toBe(7)
    expect(probe.cards).toBeGreaterThanOrEqual(8)
    // The primary action is pinned below the scroller, not inside it.
    expect(await start.evaluate((el) => el.closest('.clr-scroll-region__foot') !== null &&
      el.closest('.clr-scroll-region__scroller') === null)).toBe(true)
    evidence.note('containment', 'Review: overview metrics and seven section cards, no card nested in another, every field and label inside its card, Start and Regenerate pinned in the footer.', probe)
  }, { skins: true, short: start })

  // The quiet action: public TextAction, chevron, 40px, button semantics, keyboard focus.
  const action = await suggestion.evaluate((el) => ({
    tag: el.tagName.toLowerCase(), type: el.getAttribute('type'),
    chevron: getComputedStyle(el, '::after').content, height: el.getBoundingClientRect().height,
    framed: el.closest('.clr-card__body') !== null && el.classList.contains('clr-chamfer') === false,
    name: el.getAttribute('aria-label'), popup: el.getAttribute('aria-haspopup'),
  }))
  expect(action).toMatchObject({ tag: 'button', type: 'button', chevron: '"›"', framed: true, popup: 'dialog' })
  expect(action.height).toBeGreaterThanOrEqual(40)
  expect(action.name).toMatch(/kg|lb/)
  await suggestion.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  const focused = await focusProbe(page)
  expect(focused.className).toContain('clr-text-action')
  expect(focused.focusVisible).toBe(true)
  evidence.note('keyboard', 'The load suggestion is the public TextAction: a real button with the chevron, a 40px target, reached by Tab with keyboard focus and opening its dialog on Enter.', { action, focused })
  await page.keyboard.press('Enter')
  const explain = page.getByRole('dialog')
  await expect(explain).toBeVisible()
  await checkA11y()
  await evidence.shot('Review', '/review', 'validated-workout', at, TITLE, async () => {
    await expect(explain).toBeVisible()
    await expect(explain.locator('input')).toHaveCount(1)
  }, { variant: 'load-suggestion-explained' })
  await page.keyboard.press('Escape')
  await expect(explain).toHaveCount(0)

  const standard = page.locator('main [aria-expanded]').first()
  await standard.click()
  await evidence.shot('Review', '/review', 'validated-workout', at, TITLE, async () => {
    await expect(standard).toHaveAttribute('aria-expanded', 'false')
    await expectContained(page, 'Review collapsed')
  }, { variant: 'section-collapsed' })
  await standard.click()

  await regenerate.click()
  const discard = page.getByRole('dialog', { name: 'Discard this workout?' })
  await evidence.shot('Review', '/review', 'regenerate-confirmation', at, TITLE, async () => {
    await expect(discard).toBeVisible()
    await expect(discard.getByRole('button', { name: 'Keep it', exact: true })).toBeVisible()
  }, { skins: true })
  await discard.getByRole('button', { name: 'Keep it', exact: true }).click()
  expect(evidence.modelAttempts()).toBe(0)

  const startWrite = await boundary(page, { tail: 'rpc/persist_session', method: 'POST' }, 'held-failure')
  try {
    await start.click()
    await startWrite.arrival
    await evidence.shot('Review', '/review', 'start-busy', at, TITLE, async () => {
      await expect(start).toBeDisabled()
      await expect(regenerate).toBeDisabled()
    })
    startWrite.release()
    const failed = page.getByRole('dialog', { name: 'Couldn’t start this workout' })
    await evidence.shot('Review', '/review', 'start-failure', at, TITLE, async () => {
      await expect(failed).toBeVisible()
      await expect(failed.getByRole('button', { name: 'Start workout', exact: true })).toBeVisible()
    }, { skins: true })
    await failed.getByRole('button', { name: 'Close', exact: true }).click()
  } finally { await startWrite.dispose() }
  evidence.note('contract', 'A failed Start leaves the briefing in place behind its blocking dialog, with Start offered again; no session was started.')

  // Regenerate is a generation run: held here and never forwarded, then cancelled.
  let held = 0
  const generation = deferred()
  await page.route('**/functions/v1/generate-workout', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (route.request().method() !== 'POST') return route.fallback()
    held += 1
    await generation.wait
    return route.abort('blockedbyclient')
  })
  await regenerate.click()
  await discard.getByRole('button', { name: 'Discard and regenerate', exact: true }).click()
  const cancel = page.locator('main').getByRole('button', { name: 'Cancel', exact: true })
  await evidence.shot('Review', '/review', 'regenerating-cancel', at, 'Generating session', async () => {
    await expect(cancel).toBeVisible()
    expect(held).toBe(1)
  }, { short: cancel })
  await cancel.click()
  await evidence.shot('Review', '/review', 'regenerating-cancel', at, 'Nothing to review', async () => {
    await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible()
    await expect(start).toHaveCount(0)
  }, { variant: 'cancelled-discarded' })
  generation.release()
  evidence.note('contract', 'Regenerate asks first; confirming discards the briefing and runs a generation (held locally, never forwarded); Cancel returns to Review with nothing to review rather than the discarded workout.')

  await visit('/review')
  await evidence.shot('Review', '/review', 'missing-or-invalid-handoff', at, 'Nothing to review', async () => {
    await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible()
    await expect(start).toHaveCount(0)
    await expectContained(page, 'Review empty')
  })

  await restart()
  await start.click()
  await evidence.shot('Review', '/review', 'start-workout', '/workout', 'Workout', async () => {
    await expect(page.getByRole('form', { name: /^Log set 1 of/ }).first()).toBeVisible()
  })
  evidence.note('contract', 'Start persists and starts the restarted session and lands on /workout with the first set form.')

  evidence.disposition('Review', '/review', 'favorite-progression-loading', 'Reached only from a favorite\'s repeat surface; this lane restarts from History. The panel\'s four states are proved in src/ui/favorite-progression.test.tsx and src/app/ReviewRoute.test.tsx.', ['src/app/ReviewRoute.tsx', 'src/ui/favorite-progression.tsx'])
  evidence.disposition('Review', '/review', 'favorite-progression-error-retry', 'As favorite-progression-loading.', ['src/app/ReviewRoute.tsx', 'src/ui/favorite-progression.tsx'])
  evidence.disposition('Review', '/review', 'swap-confirmation', 'Review renders no swap control in the current source; Swap lives on the Workout exercise card and is pictured there (active-standard-superset-circuit, variant swap-options).', ['src/app/Review.tsx', 'src/ui/exercise-swap.tsx'])
  evidence.disposition('Review', '/review', 'swap-failure', 'As swap-confirmation; the swap list\'s failure state is proved in src/ui/exercise-swap.test.tsx and e2e/d6-swap-persistence.spec.ts.', ['src/ui/exercise-swap.tsx'])
  expect(evidence.modelAttempts()).toBe(1)
})

// ── Workout: every enabled renderer, rest, timers and coaching ─────────────

backendTest('structures: seven renderers, rest urgency, timers, coaching, effort, swap, finish', async ({ page, visit, checkA11y, world, evidence }) => {
  test.setTimeout(300_000)
  evidence.note('fixture', 'A persisted seven-structure prescription started through start_session; the clock is Playwright\'s, advanced and paused so urgency and timing are observed at exact points.')
  const stored = await world.persist(TITLE, 0)
  await world.start(stored)
  await page.clock.install({ time: Date.now() })
  await visit('/workout')
  const at = '/workout'
  const key = (state: string) => ['Workout', '/workout', state] as const
  const form = page.getByRole('form', { name: /^Log set 1 of/ }).first()
  const sessionTime = page.getByRole('timer', { name: 'Session time', exact: true })
  const finish = page.getByRole('button', { name: 'Finish workout', exact: true })
  await expect(form).toBeVisible()

  const logSet = form.getByRole('button', { name: 'Log set 1', exact: true })
  await evidence.shot(...key('active-standard-superset-circuit'), at, 'Workout', async () => {
    await expect(form).toBeVisible()
    const probe = await expectContained(page, 'Standard')
    expectTimerContract(await timerProbe(sessionTime), 'Session time')
    await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled()
    evidence.note('containment', 'Standard: shell, section, block and set form are sibling cards; fields and labels inside; Session time is a labelled non-live timer card.', probe)
  }, { variant: 'standard', skins: true, short: logSet })

  // Swap is the exercise card's action; its list is opened and left unchanged.
  const swap = page.getByRole('button', { name: /^Swap / }).first()
  await swap.click()
  const swapDialog = page.getByRole('dialog')
  await evidence.shot(...key('active-standard-superset-circuit'), at, 'Workout', async () => {
    await expect(swapDialog).toBeVisible()
    await expect(swapDialog.getByRole('list', { name: 'Alternatives' })
      .or(swapDialog.getByText('Nothing else fits this slot'))).toBeVisible()
  }, { variant: 'swap-options' })
  await page.keyboard.press('Escape')
  await expect(swapDialog).toHaveCount(0)

  // A real set, through the real table.
  await form.getByLabel(/^Weight/).fill('40')
  await form.getByLabel('Reps', { exact: true }).fill('8')
  await logSet.click()
  const rest = page.getByRole('region', { name: 'Rest', exact: true })
  const restTimer = rest.getByRole('timer', { name: 'Time remaining', exact: true })
  await expect(rest).toBeVisible()
  await expect.poll(async () => {
    const rows = must<unknown[]>(await world.client.selectAsService('exercise_set_logs', {
      select: 'id', workout_exercise_id: `eq.${stored.sections[0].blocks[0].exercises[0].exercise.id}`,
    }), 'Logged-set readback')
    return rows.length
  }).toBe(1)

  // Actual timing: five seconds of wall clock move the session up and the rest down by five.
  const t0 = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(t0 + 15_000)
  await expect(rest).toHaveAttribute('data-urgent', 'false')
  const before = { session: await seconds(sessionTime), rest: await seconds(restTimer) }
  await evidence.shot(...key('rest-running-urgent-skipped'), at, 'Workout', async () => {
    await expect(rest).toHaveAttribute('data-urgent', 'false')
    expectTimerContract(await timerProbe(restTimer), 'Time remaining')
    expect((await timerProbe(restTimer)).low).toBe(false)
  }, { variant: 'running' })
  await page.clock.pauseAt(t0 + 21_000)
  await expect(rest).toHaveAttribute('data-urgent', 'true')
  const after = { session: await seconds(sessionTime), rest: await seconds(restTimer) }
  expect(after.session - before.session).toBe(6)
  expect(before.rest - after.rest).toBe(6)
  expect(after.rest).toBeLessThanOrEqual(10)
  evidence.note('timer', 'Paused at two clock points six seconds apart, Session time advanced by six and the rest counted down by six: one wall clock drives both.', { before, after })

  const urgent = await timerProbe(restTimer)
  await evidence.shot(...key('rest-running-urgent-skipped'), at, 'Workout', async () => {
    await expect(page.getByText('Final 10 seconds', { exact: true })).toBeVisible()
    expectTimerContract(await timerProbe(restTimer), 'Time remaining')
    expectLowState(await timerProbe(restTimer), false)
    await expectContained(page, 'Rest urgent')
  }, { variant: 'running-urgent', skins: true })
  evidence.note('timer', 'Rest low state: the card takes the timer-low role, digits cross colour over 0.4s in four steps, the card dims to 80% on the 4s two-step pulse, and no glow is added to the timer.', urgent)

  // Coaching opened while the rest is urgent: its read is held, so two loops want the view.
  const definition = await boundary(page, { tail: 'exercise_definitions', method: 'GET' }, 'held-real')
  try {
    const coaching = page.getByRole('button', { name: /^Coaching and notes — / }).first()
    await coaching.click()
    await definition.arrival
    await evidence.shot(...key('rest-running-urgent-skipped'), at, 'Workout', async () => {
      await expect(page.locator('main [aria-busy="true"]').first()).toBeVisible()
      const held = await loops(page)
      expect(held.running).toHaveLength(1)
      expect(held.running[0]).toBe('Rest')
      expect(held.stilled).toBeGreaterThan(0)
      evidence.note('motion', 'Coaching loading beside an urgent rest: the rest pulse holds the one interface loop and the loading region is stilled but still busy.', held)
    }, { variant: 'rest-with-coaching-loading' })
    definition.release()
  } finally { await definition.dispose() }
  await expect(page.getByRole('heading', { name: 'Cues' })).toBeVisible()
  await evidence.shot(...key('active-standard-superset-circuit'), at, 'Workout', async () => {
    const group = await page.getByRole('heading', { name: 'Cues' }).evaluate((el) => {
      const card = el.closest('.clr-card')
      return {
        sameCard: card !== null,
        regressionInSameCard: card?.contains(Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
          .find((h) => h.textContent === 'Regression') ?? null) ?? false,
        noteInSameCard: card?.querySelector('textarea') !== null,
      }
    })
    expect(group).toMatchObject({ sameCard: true, regressionInSameCard: true, noteInSameCard: true })
    await expectContained(page, 'Coaching')
    evidence.note('containment', 'Coaching: cues, regression and the note field are ruled sub-groups with their labels inside one card, never a card in a card.', group)
  }, { variant: 'coaching-open' })

  if (evidence.phone) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await evidence.shot(...key('rest-running-urgent-skipped'), at, 'Workout', async () => {
      await expect(page.getByText('Final 10 seconds', { exact: true })).toBeVisible()
      await expect(rest).toHaveAttribute('data-urgent', 'true')
      expectLowState(await timerProbe(restTimer), true)
      expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0)
    }, { variant: 'reduced-motion' })
    evidence.note('motion', 'Under reduced motion the urgent rest keeps its words, digits and low colours; the pulse and every other animation stop.')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  }
  await page.clock.resume()
  await rest.getByRole('button', { name: 'Skip rest', exact: true }).click()
  await evidence.shot(...key('rest-running-urgent-skipped'), at, 'Workout', async () => {
    await expect(rest).toHaveCount(0)
  }, { variant: 'skipped' })

  const complete = page.getByRole('button', { name: 'Complete block', exact: true })
  await complete.click()
  await evidence.shot(...key('block-effort-dismissed-or-recorded'), at, 'Workout', async () => {
    await expect(page.getByRole('dialog')).toContainText('Rate the effort of the block you just finished.')
    await expect(page.getByRole('slider', { name: 'Effort', exact: true })).toBeFocused()
  }, { variant: 'question' })
  await page.getByRole('button', { name: 'Not now', exact: true }).click()
  await expect(complete).toBeEnabled()
  await complete.click()
  await page.getByRole('button', { name: 'Record effort', exact: true }).click()
  await evidence.shot(...key('block-effort-dismissed-or-recorded'), at, 'Workout', async () => {
    await expect(page.getByRole('button', { name: 'Block recorded', exact: true })).toBeDisabled()
  }, { variant: 'recorded' })

  const section = async (name: string) => {
    await page.getByRole('button', { name: new RegExp(`^${name}, `) }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^${name}, `) })).toHaveAttribute('aria-current', 'step')
  }

  await section('Superset')
  await checkA11y()
  await evidence.shot(...key('active-standard-superset-circuit'), at, 'Workout', async () => {
    await expect(page.getByRole('form', { name: /^Log set 1 of/ })).toHaveCount(2)
    await expect(page.getByRole('list', { name: 'Movements in this superset' })).toBeVisible()
    await expectContained(page, 'Superset')
  }, { variant: 'superset' })

  await section('Circuit')
  await checkA11y()
  await evidence.shot(...key('active-standard-superset-circuit'), at, 'Workout', async () => {
    await expect(page.getByRole('list', { name: 'Movements in this circuit' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Complete circuit', exact: true })).toBeVisible()
    await expectContained(page, 'Circuit')
  }, { variant: 'circuit', skins: true })

  await section('EMOM')
  await checkA11y()
  await evidence.shot(...key('active-emom-amrap-for-time-ladder'), at, 'Workout', async () => {
    await expect(page.getByRole('list', { name: 'Movements in this EMOM' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start EMOM', exact: true })).toBeVisible()
    await expectContained(page, 'EMOM ready')
  }, { variant: 'emom-ready' })
  await page.getByRole('button', { name: 'Start EMOM', exact: true }).click()
  const emomTimer = page.getByRole('timer', { name: 'Time remaining', exact: true })
  const emomStart = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(emomStart + 20_000)
  await evidence.shot(...key('active-emom-amrap-for-time-ladder'), at, 'Workout', async () => {
    await expect(page.getByText('WORK', { exact: true })).toBeVisible()
    const probe = await timerProbe(emomTimer)
    expectTimerContract(probe, 'Time remaining')
    expect(probe.low).toBe(false)
    expect(await seconds(emomTimer)).toBe(40)
  }, { variant: 'emom-active' })
  await page.clock.pauseAt(emomStart + 52_000)
  await evidence.shot(...key('active-emom-amrap-for-time-ladder'), at, 'Workout', async () => {
    expect(await seconds(emomTimer)).toBe(8)
    const probe = await timerProbe(emomTimer)
    expectTimerContract(probe, 'Time remaining')
    expectLowState(probe, false)
    expect((await loops(page)).running).toHaveLength(1)
    await expectContained(page, 'EMOM urgent')
    evidence.note('timer', 'EMOM low state: the shipped TimerDisplay is its own card beside the block card, steps its colour over 0.4s and pulses to 80% on the one loop, with no extra glow.', probe)
  }, { variant: 'emom-urgent', skins: true })
  await page.clock.resume()

  await section('AMRAP')
  await checkA11y()
  await page.getByRole('button', { name: 'Start AMRAP', exact: true }).click()
  const amrapStart = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(amrapStart + 30_000)
  await evidence.shot(...key('active-emom-amrap-for-time-ladder'), at, 'Workout', async () => {
    await expect(page.getByRole('list', { name: 'Movements in this AMRAP' })).toBeVisible()
    const probe = await timerProbe(page.getByRole('timer', { name: 'Time remaining', exact: true }))
    expectTimerContract(probe, 'Time remaining')
    expect(probe.low).toBe(false)
    await expect(page.getByRole('button', { name: /^Finish/ })).toBeVisible()
    await expectContained(page, 'AMRAP')
  }, { variant: 'amrap-active' })
  await page.clock.resume()

  await section('Plain For Time')
  await checkA11y()
  await page.getByRole('button', { name: 'Start For Time', exact: true }).click()
  const forTimeStart = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(forTimeStart + 45_000)
  await evidence.shot(...key('active-emom-amrap-for-time-ladder'), at, 'Workout', async () => {
    const probe = await timerProbe(page.getByRole('timer', { name: 'Block time', exact: true }))
    expectTimerContract(probe, 'Block time')
    expect(await seconds(page.getByRole('timer', { name: 'Block time', exact: true }))).toBe(45)
    await expect(page.getByRole('group', { name: 'How did this block end?' })).toHaveCount(0)
    await expectContained(page, 'For Time')
  }, { variant: 'for-time-active' })
  await page.clock.resume()

  await section('Ladder')
  await checkA11y()
  const finished = page.getByRole('radio', { name: 'Finished the ladder', exact: true })
  await finished.click()
  await evidence.shot(...key('active-emom-amrap-for-time-ladder'), at, 'Workout', async () => {
    await expect(page.getByRole('list', { name: 'Movements in this ladder' })).toBeVisible()
    await expect(finished).toHaveAttribute('aria-checked', 'true')
    // Selection is a tick as well as a tint, measured once its fade has landed.
    await expect.poll(() => finished.evaluate((el) => {
      const tick = el.querySelector('svg')
      return tick ? Number(getComputedStyle(tick).opacity) : 0
    })).toBe(1)
    await expect(page.getByRole('button', { name: 'Start For Time', exact: true })).toHaveCount(0)
    await expectContained(page, 'Ladder')
  }, { variant: 'ladder-selected', short: finish })
  evidence.note('containment', 'Finish workout stays inside the 390x320 short viewport on the last section (TASK-040\'s recorded overflow condition, now executed).')

  await page.getByRole('button', { name: 'Abandon', exact: true }).click()
  await evidence.shot(...key('abandon-confirmation'), at, 'Workout', async () => {
    await expect(page.getByRole('dialog', { name: 'Abandon workout?' })).toBeVisible()
  }, { skins: true })
  await page.getByRole('dialog', { name: 'Abandon workout?' }).getByRole('button', { name: 'Keep going', exact: true }).click()

  const finishWrite = await boundary(page, { tail: 'rpc/complete_session', method: 'POST' }, 'held-failure')
  try {
    await finish.click()
    await finishWrite.arrival
    await evidence.shot(...key('finish-pending'), at, 'Workout', async () => {
      await expect(finish).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled()
    })
    finishWrite.release()
    await evidence.shot(...key('finish-error-retry'), at, 'Workout', async () => {
      await expect(page.getByRole('dialog', { name: 'That didn’t save' })).toBeVisible()
    }, { skins: true })
  } finally { await finishWrite.dispose() }
  await page.getByRole('dialog', { name: 'That didn’t save' }).getByRole('button', { name: 'Close', exact: true }).click()
  expect((await world.snapshot(stored.session.id)).state).toBe('active')
  await finish.click()
  await evidence.shot(...key('finish-summary'), '/summary', 'Nice work', async () => {
    await expect(page.getByText(`${TITLE}, done.`, { exact: true })).toBeVisible()
    expect((await world.snapshot(stored.session.id)).state).toBe('completed')
  })
  evidence.note('contract', 'A failed completion keeps the session active behind its dialog; Finish again completes the stored session and lands on Summary.')
  evidence.disposition('Workout', '/workout', 'rest-running-urgent-skipped', 'No generic pause exists in the product: the rest is extended (Add 30s) or skipped, and timed blocks start and finish. "Paused" is pictured as the clock held at exact points, not as a pause control.', ['src/ui/workout-chrome.tsx', 'src/ui/emom-block.tsx', 'src/ui/amrap-block.tsx', 'src/ui/for-time-block.tsx'])
  expect(evidence.modelAttempts()).toBe(0)
})

// ── Workout: reads, sync failure, re-entry and abandonment ─────────────────

backendTest('recovery: active read, set-sync failure and retry, re-entry, abandon error and home', async ({ page, visit, world, evidence }) => {
  test.setTimeout(300_000)
  const at = '/workout'
  const ready = async () => {
    await heading(page, 'Workout')
    await expect(page.getByRole('form', { name: /^Log set 1 of/ }).first()).toBeVisible()
  }

  const noActive = await boundary(page, { tail: 'rpc/resume_session', method: 'POST' }, 'held-real')
  try {
    await visit('/workout')
    await noActive.arrival
    noActive.release()
    await evidence.shot('Workout', '/workout', 'no-active-session-home', '/', 'Today', async () => {
      await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
    })
  } finally { await noActive.dispose() }
  const noCompleted = await boundary(page, { tail: 'rpc/streak_sessions', method: 'POST', limit: 1 }, 'held-real')
  try {
    await visit('/summary')
    await noCompleted.arrival
    noCompleted.release()
    await evidence.shot('Summary', '/summary', 'no-completed-session-home', '/', 'Today', async () => {
      await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
    })
  } finally { await noCompleted.dispose() }

  const stored = await world.persist(TITLE, 0)
  await world.start(stored)
  const startedAt = (await world.snapshot(stored.session.id)).session.started_at
  const read = await boundary(page, { tail: 'rpc/resume_session', method: 'POST' }, 'held-failure')
  try {
    await visit('/workout')
    await read.arrival
    await evidence.shot('Workout', '/workout', 'active-read-loading', at, 'Workout', async () => {
      await expect(page.locator('main').getByRole('status')).toContainText(/Loading session|Taking longer than usual/)
      await expect(page.getByRole('form', { name: /^Log set/ })).toHaveCount(0)
    }, { skins: true })
    read.release()
    await evidence.shot('Workout', '/workout', 'active-read-error-retry', at, 'Workout', async () => {
      await expect(page.getByRole('alert')).toContainText('Your session didn’t load')
      await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled()
      await expectContained(page, 'Workout read error')
    }, { skins: true, short: page.getByRole('button', { name: 'Try again', exact: true }) })
  } finally { await read.dispose() }
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await ready()

  await page.getByRole('button', { name: /^Superset, / }).click()
  const write = await boundary(page, { tail: 'exercise_set_logs', method: 'POST' }, 'failure')
  try {
    const form = page.getByRole('form', { name: /^Log set 1 of/ }).first()
    await form.getByLabel('Reps', { exact: true }).fill('8')
    await form.getByRole('button', { name: 'Log set 1', exact: true }).click()
    await evidence.shot('Workout', '/workout', 'set-sync-sustained-failure-retry', at, 'Workout', async () => {
      await expect.poll(write.count, { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
      await expect(page.getByRole('status').filter({ hasText: 'Sets waiting to sync' })).toContainText('1 set is saved on this device')
      await expect(page.getByRole('list', { name: 'Logged sets' }).first()).toContainText('On this device only')
      await expect(page.getByRole('button', { name: 'Try now', exact: true })).toBeEnabled()
      await expectContained(page, 'Set sync failure')
    }, { variant: 'sustained-failure', skins: true })
  } finally { await write.dispose() }
  // Once the fault is lifted the queue's own retry and Try now race to send the
  // same set; either is the product's retry, and which one won is recorded.
  const tryNow = page.getByRole('button', { name: 'Try now', exact: true })
  const manual = await tryNow.click({ timeout: 5_000 }).then(() => true, () => false)
  evidence.note('contract', 'After the fault is lifted, the queued set is resent by Try now or by the queue\'s own retry, whichever comes first.', { sentByTryNow: manual })
  await evidence.shot('Workout', '/workout', 'set-sync-sustained-failure-retry', at, 'Workout', async () => {
    await expect(page.getByRole('list', { name: 'Logged sets' }).first()).toContainText('Saved')
    await expect(page.getByRole('status').filter({ hasText: 'Sets waiting to sync' })).toHaveCount(0)
    await expect.poll(async () => must<unknown[]>(await world.client.selectAsService('exercise_set_logs', {
      select: 'id', workout_exercise_id: `eq.${stored.sections[1].blocks[0].exercises[0].exercise.id}`,
    }), 'Queued-set readback').length).toBe(1)
  }, { variant: 'retry-confirmed' })
  evidence.note('contract', 'A set whose writes fail stays on the device with one factual notice; Try now sends the same set and the database then holds exactly one row.')

  await visit('/')
  await page.getByRole('button', { name: 'Resume workout', exact: true }).click()
  await evidence.shot('Workout', '/workout', 'background-resume', at, 'Workout', async () => {
    await expect(page.getByRole('button', { name: /^Superset, / })).toHaveAttribute('aria-current', 'step')
    await expect(page.getByRole('timer', { name: 'Session time', exact: true })).toBeVisible()
    const resumed = await world.snapshot(stored.session.id)
    expect(resumed.state).toBe('active')
    expect(resumed.session.started_at).toBe(startedAt)
  })

  const abandon = await boundary(page, { tail: 'rpc/abandon_session', method: 'POST' }, 'failure')
  try {
    await page.getByRole('button', { name: 'Abandon', exact: true }).click()
    await page.getByRole('dialog', { name: 'Abandon workout?' }).getByRole('button', { name: 'Abandon', exact: true }).click()
    await evidence.shot('Workout', '/workout', 'abandon-error-retry', at, 'Workout', async () => {
      await expect(page.getByRole('dialog', { name: 'That didn’t save' })).toBeVisible()
      expect((await world.snapshot(stored.session.id)).state).toBe('active')
    })
  } finally { await abandon.dispose() }
  await page.getByRole('dialog', { name: 'That didn’t save' }).getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Abandon', exact: true }).click()
  await page.getByRole('dialog', { name: 'Abandon workout?' }).getByRole('button', { name: 'Abandon', exact: true }).click()
  await evidence.shot('Workout', '/workout', 'abandon-home', '/', 'Today', async () => {
    await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeEnabled()
    expect((await world.snapshot(stored.session.id)).state).toBe('abandoned')
  })
  expect(evidence.modelAttempts()).toBe(0)
})

// ── Summary ─────────────────────────────────────────────────────────────────

backendTest('summary: metric cards, debrief card, public moods, save busy, error, home and persisted', async ({ page, visit, world, evidence }) => {
  test.setTimeout(240_000)
  const done = await world.persist(TITLE, 0)
  await world.complete(done)
  const at = '/summary'
  const save = page.getByRole('button', { name: 'Save and close', exact: true })
  const notes = page.getByLabel('Notes · optional')

  const latest = await boundary(page, { tail: 'rpc/streak_sessions', method: 'POST', limit: 1 }, 'held-failure')
  try {
    await visit('/summary')
    await latest.arrival
    await evidence.shot('Summary', '/summary', 'completed-read-loading', at, 'Nice work', async () => {
      await expect(page.locator('main').getByRole('status')).toContainText(/Reading your session|Taking longer than usual/)
      await expect(page.locator('form#summary-debrief')).toHaveCount(0)
    })
    latest.release()
    await evidence.shot('Summary', '/summary', 'completed-read-error-retry', at, 'Nice work', async () => {
      await expect(page.getByRole('alert')).toContainText('That session didn’t load')
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled()
    }, { skins: true })
  } finally { await latest.dispose() }
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(save).toBeEnabled()

  const moods = page.getByRole('radiogroup')
  await evidence.shot('Summary', '/summary', 'debrief-unrecorded-or-saved', at, 'Nice work', async () => {
    await expect(notes).toHaveValue('')
    await expect(moods.getByRole('radio', { checked: true })).toHaveCount(0)
    const probe = await expectContained(page, 'Summary')
    const layout = await page.evaluate(() => {
      const card = (text: string) => Array.from(document.querySelectorAll('main h2, main h3, main legend, main label'))
        .find((el) => el.textContent?.trim() === text)?.closest('.clr-card') ?? null
      const duration = card('Duration')
      const streak = card('Streak')
      const legend = card('How do you feel?')
      const field = card('Notes · optional')
      const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save and close')
      return {
        durationOwnCard: duration !== null, streakOwnCard: streak !== null && streak !== duration,
        durationSmall: duration ? duration.getBoundingClientRect().width < document.querySelector('main')!.getBoundingClientRect().width : false,
        debriefOneCard: legend !== null && legend === field,
        debriefSeparateFromMetrics: legend !== duration && legend !== streak,
        pinned: !!button && button.closest('.clr-scroll-region__foot') !== null && button.closest('.clr-scroll-region__scroller') === null,
      }
    })
    expect(layout).toEqual({ durationOwnCard: true, streakOwnCard: true, durationSmall: true,
      debriefOneCard: true, debriefSeparateFromMetrics: true, pinned: true })
    evidence.note('containment', 'Summary: Duration and Streak are each their own small card; the mood choice and notes share one debrief card with their labels inside; Save and close is pinned in the footer outside the scroller.', { ...layout, ...probe })
  }, { variant: 'unrecorded', skins: true, short: save })

  // The public faces, by geometry: the vendored mouth, one path, no plus.
  const faces = await moods.evaluate((group) => Array.from(group.querySelectorAll('[role="radio"]')).map((radio) => {
    const face = Array.from(radio.querySelectorAll('svg')).find((svg) => svg.querySelector('circle[r="9.5"]'))
    return {
      label: radio.textContent?.trim() ?? '',
      paths: face ? Array.from(face.querySelectorAll('path')).map((path) => path.getAttribute('d')) : [],
      circles: face?.querySelectorAll('circle').length ?? 0,
      lines: face?.querySelectorAll('line, rect, polyline').length ?? 0,
    }
  }))
  for (const { label, glyph } of MOOD_FACES) {
    expect(faces.find((face) => face.label === label), `${label} draws ${glyph}`).toEqual({
      label, paths: [publicMouth(glyph)], circles: 3, lines: 0,
    })
  }
  expect(localFaceDialect(), 'a local face dialect remains in app source').toEqual([])
  evidence.note('contract', 'Worn/Flat/Ready/Peak draw the public Frown/Meh/Smile/SmilePlus exactly (mouth path read from the vendored icons.tsx); SmilePlus is one wide smile with no plus; no app source defines a face of its own.', faces)

  // Keyboard: the roving radio group moves selection with the arrows.
  // The group's one tab stop, then the arrows to the last face.
  await moods.locator('[role="radio"][tabindex="0"]').focus()
  await expect(moods.getByRole('radio', { name: 'Spent', exact: true })).toBeFocused()
  for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowRight')
  const peak = moods.getByRole('radio', { name: 'Peak', exact: true })
  await expect(peak).toBeFocused()
  await page.keyboard.press('Space')
  await expect(peak).toHaveAttribute('aria-checked', 'true')
  const focused = await focusProbe(page)
  expect(focused.focusVisible).toBe(true)
  evidence.note('keyboard', 'Mood is a radio group: arrow keys move focus, Space selects, keyboard focus is visible, and the selected face carries a tick as well as a tint.', focused)
  await notes.fill('TASK-036 capture debrief.')
  await evidence.shot('Summary', '/summary', 'debrief-unrecorded-or-saved', at, 'Nice work', async () => {
    await expect(peak).toHaveAttribute('aria-checked', 'true')
    // The tick fades in over --dur-state; it is measured once it has landed.
    await expect.poll(() => peak.evaluate((el) => Number(getComputedStyle(el.querySelector('svg')!).opacity))).toBe(1)
  }, { variant: 'peak-selected', skins: true })

  const favorite = await boundary(page, { tail: 'rpc/save_favorite', method: 'POST' }, 'failure')
  try {
    await page.getByRole('button', { name: 'Save as favorite', exact: true }).click()
    await evidence.shot('Summary', '/summary', 'favorite-save-failure-secondary', at, 'Nice work', async () => {
      await expect(page.getByRole('alert')).toContainText('That workout wasn’t saved as a favorite. Try again.')
      await expect(save).toBeEnabled()
      await expect(peak).toHaveAttribute('aria-checked', 'true')
    })
  } finally { await favorite.dispose() }

  const patch = await boundary(page, { tail: 'workout_sessions', method: 'PATCH' }, 'held-failure')
  try {
    await save.click()
    await patch.arrival
    await evidence.shot('Summary', '/summary', 'save-busy', at, 'Nice work', async () => {
      await expect(save).toBeDisabled()
    })
    patch.release()
    await evidence.shot('Summary', '/summary', 'save-error-draft-retry', at, 'Nice work', async () => {
      await expect(page.locator('form#summary-debrief').getByRole('alert')).toBeVisible()
      await expect(save).toBeEnabled()
      await expect(peak).toHaveAttribute('aria-checked', 'true')
      await expect(notes).toHaveValue('TASK-036 capture debrief.')
    }, { skins: true, short: save })
  } finally { await patch.dispose() }

  const streak = await boundary(page, { tail: 'rpc/streak_sessions', method: 'POST', limit: 200 }, 'failure')
  try {
    await visit('/summary')
    await streak.arrival
    await evidence.shot('Summary', '/summary', 'streak-empty-or-error', at, 'Nice work', async () => {
      await expect(page.getByRole('alert')).toContainText('Your streak didn’t load')
      await expect(page.getByText(`${TITLE}, done.`, { exact: true })).toBeVisible()
      await expect(save).toBeEnabled()
    }, { variant: 'independent-error' })
  } finally { await streak.dispose() }
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await moods.getByRole('radio', { name: 'Peak', exact: true }).click()
  await notes.fill('TASK-036 capture debrief.')
  await save.click()
  await evidence.shot('Summary', '/summary', 'done-home', '/', 'Today', async () => {
    await expect(page.getByRole('button', { name: 'Generate workout', exact: true })).toBeVisible()
    const [row] = must<Array<{ mood: number; session_notes: string }>>(await world.client.selectAsService('workout_sessions', {
      select: 'mood,session_notes', id: `eq.${done.session.id}`,
    }), 'Saved debrief readback')
    expect(row).toEqual({ mood: 5, session_notes: 'TASK-036 capture debrief.' })
  })
  await visit('/summary')
  await evidence.shot('Summary', '/summary', 'debrief-unrecorded-or-saved', at, 'Nice work', async () => {
    await expect(moods.getByRole('radio', { name: 'Peak', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(notes).toHaveValue('TASK-036 capture debrief.')
    await expect(page.getByText(`${TITLE}, done.`, { exact: true })).toBeVisible()
  }, { variant: 'saved' })
  evidence.note('contract', 'Save writes mood 5 (Peak) and the notes to the completed session row and returns Home; reopening Summary reads the same stored debrief. A failed save keeps the draft.')
  expect(evidence.modelAttempts()).toBe(0)
})
