import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'
import { expect, test as base } from '../fixtures'
import { backend } from '../support/backend'
import type { WorkoutSessionRow } from '../../src/state/schemas'
import { nextWorkout } from '../../src/state/session-suggestion'
import { captureIdentity, capturePairId } from './capture'
import { installDeterministicCapture, playwrightCaptureDriver } from './fixtures'
import {
  baselineEntry, BASELINE_INVENTORY_PATH, CAPTURE_SKINS, CAPTURE_VIEWPORTS,
  isProtectedPath, readBaselineInventory, VIEWPORT_OF_PROJECT,
  type CaptureSkin, type CaptureViewportId,
} from './state-inventory'

/**
 * REQ-018/019/020/026/027/029/030 / TASK-035 — the collections and settings
 * group's AFTER evidence: Home and its resume slot, History and Favorites,
 * Session Detail, Settings with appearance, and Places and equipment, on the
 * installed 0.14.3 package.
 *
 * Every case signs in its own disposable, namespaced user and writes its
 * records through the same RPCs the app uses, so routing, ownership and reload
 * persistence are the backend's real answers. Only named failures are answered
 * locally, and only for that user's own request. Model POSTs are refused, so
 * nothing here is live generation or deployed proof.
 *
 * A picture is taken only after its route, heading and state were asserted. A
 * case's record and pictures are written under `EVIDENCE_DIR` the first time it
 * passes and left alone afterwards: a committed record names the tree it was
 * taken from and is never rebound to a later run.
 */
const EVIDENCE_DIR = 'docs/design/evidence-0143/collections-settings'
const BEFORE_MANIFEST = 'docs/design/0143-intake-baseline/manifest.json'
const BEFORE_DIR = 'docs/design/0143-intake-baseline/screenshots'
const SOURCE_FILE = 'e2e/design-0143/collections-settings.spec.ts'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}
const REST = '**/rest/v1/**'
const SKIN_KEY = 'clear.skin'
const SESSION_KEY = 'clear.auth.session'
const TITLE = 'TASK-035 reviewable session'
const UNSTARTED_TITLE = 'TASK-035 not-started session'
const PLACE = 'TASK-035 capture gym'
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const heading = (page: Page, name: string) =>
  expect(page.locator('main h1')).toHaveAccessibleName(name, { timeout: 30_000 })
const pathname = (page: Page) => new URL(page.url()).pathname
const visibleText = (page: Page, text: string | RegExp) =>
  expect(page.getByText(text, { exact: typeof text === 'string' }).first()).toBeVisible()
const serverFailure = { code: 'PGRST000', message: 'Controlled capture failure', details: null }

async function answer(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, headers: CORS, json: body })
}
function deferred() {
  let release!: () => void
  const wait = new Promise<void>((done) => { release = done })
  return { wait, release }
}
const day = (offset = 0) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
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
function beforeOf(screen: string, route: string | null, state: string, variant: string) {
  const same = beforeCaptures.filter((c) => c.screen === screen && c.route === route && c.state === state)
  const match = same.find((c) => (c.variant ?? '') === variant) ?? same[0]
  return match
    ? { directory: BEFORE_DIR, screenshot: match.screenshot.name, sha256: match.screenshot.sha256,
        variant: match.variant }
    : null
}

type Assertion = () => Promise<void>
interface ShotOptions {
  /** A discriminator when one state is pictured more than once. */
  readonly variant?: string
  /** Also picture the state in the other three skins (phone project only). */
  readonly skins?: boolean
  /** Add only the missing representative non-phone skins and short-phone skins. */
  readonly responsiveSample?: boolean
  /** Also picture it at 390x320 with this action still reachable (phone project only). */
  readonly short?: Locator
}
interface Evidence {
  /** Assert, then picture, the state the browser is in at `at`. */
  shot(screen: string, route: string, state: string, at: string, title: string,
    assertState: Assertion, options?: ShotOptions): Promise<void>
  note(kind: 'keyboard' | 'motion' | 'contract' | 'discrepancy' | 'fixture', text: string,
    data?: unknown): void
  disposition(screen: string, route: string, state: string, reason: string, sources: string[]): void
  /** The app itself chose this skin; pictures from here on are filed under it. */
  adoptSkin(skin: CaptureSkin): Promise<void>
  readonly phone: boolean
  modelAttempts(): number
}

const test = base.extend<{ evidence: Evidence }>({
  evidence: async ({ page }, use, testInfo) => {
    const projectViewport = VIEWPORT_OF_PROJECT[testInfo.project.name]
    if (!projectViewport) throw new Error('TASK-035 expects an existing named viewport project')
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
    const observations: unknown[] = []
    const dispositions: unknown[] = []
    const pictures = new Map<string, Uint8Array>()

    const ref = (screen: string, route: string, state: string) => {
      if (!baselineEntry(inventory, screen, route)?.states.includes(state)) {
        throw new Error(`No recorded baseline state: ${screen} ${route} ${state}`)
      }
      return { task: inventory.task, inventory: BASELINE_INVENTORY_PATH, mainSha: inventory.mainSha,
        screen, route, state }
    }
    const pinSkin = (next: CaptureSkin) =>
      page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), { key: SKIN_KEY, value: next })
    const setSkin = async (next: CaptureSkin) => {
      // What the package's own `setSkin` does: the stored key and the attribute.
      await pinSkin(next)
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
      expect(pathname(page), `${screen} "${state}" is pictured at ${at}`).toBe(at)
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
      // Entrances and state changes end; only a loader's endless loop may still run.
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) =>
        animation.playState === 'running' &&
        Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))).length),
      { message: `${screen} "${state}" never came to rest` }).toBe(0)
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
        if (!phone && !options.responsiveSample) return
        if (options.skins || (options.responsiveSample && !phone)) {
          const chosen = skin
          for (const next of CAPTURE_SKINS.filter((candidate) => candidate !== chosen)) {
            await setSkin(next)
            await take(screen, route, state, at, title, assertState, variant)
          }
          await setSkin(chosen)
        }
        if (options.short && phone) {
          const action = options.short
          const chosen = skin
          await setViewport('short')
          for (const next of options.responsiveSample ? CAPTURE_SKINS : [chosen]) {
            await setSkin(next)
            await take(screen, route, state, at, title, async () => {
              await assertState()
              await action.scrollIntoViewIfNeeded()
              await expect(action).toBeInViewport()
              // The page itself never scrolls; the screen's own region does.
              expect(await page.evaluate(() =>
                document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true)
            }, variant ? `${variant}-short` : 'short')
          }
          await setSkin(chosen)
          await setViewport('phone')
        }
      },
      note(kind, text, data) {
        if (observations.some((seen) => (seen as { text: string }).text === text)) return
        observations.push({ kind, text, ...(data === undefined ? {} : { data }) })
      },
      disposition(screen, route, state, reason, sources) {
        dispositions.push({ kind: 'source-branch-disposition', baseline: ref(screen, route, state),
          reason, sources, renderedClaim: false })
      },
      async adoptSkin(next) {
        await pinSkin(next)
        skin = next
      },
      modelAttempts: () => modelAttempts,
    }

    await use(evidence)

    const record = {
      version: 1, task: 'TASK-035', issue: 381, consumer: 'collections-settings', phase: 'after',
      caseTitle: testInfo.title, project: testInfo.project.name, sourceFile: SOURCE_FILE,
      identity, status: testInfo.status, captures, observations, dispositions,
      generation: { requests: modelAttempts, forwardedToProvider: 0,
        blockedUnexpected: guard.blockedGenerations() },
      deterministic: true, liveGeneration: false, deployedProof: false,
    }
    const attached = testInfo.outputPath('collections-settings-record.json')
    writeFileSync(attached, JSON.stringify(record, null, 2))
    await testInfo.attach('collections-settings-record', { path: attached, contentType: 'application/json' })
    expect(guard.blockedGenerations(), 'a model POST was attempted from a capture lane').toBe(0)

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
      version: 1, task: 'TASK-035', issue: 381, consumer: 'collections-settings', phase: 'after',
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
        byScreen: tally((capture) => `${capture.screen} ${capture.route}`),
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
 * Every top-level card on the screen: its accent bar, the heading inside its
 * body, and whether any card sits inside another. A list row is never a card.
 */
function cardProbe(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')!
    // An inactive tab panel's card is not drawn, so it has no bar to measure.
    const cards = Array.from(main.querySelectorAll<HTMLElement>('.clr-card'))
      .filter((card) => card.getClientRects().length > 0)
    return {
      count: cards.length,
      nested: main.querySelectorAll('.clr-card .clr-card').length,
      rowCards: main.querySelectorAll('li .clr-card, [role="listitem"] .clr-card').length,
      cards: cards.map((card) => {
        const bar = card.querySelector<HTMLElement>(':scope > .clr-card__bar')
        const body = card.querySelector<HTMLElement>(':scope > .clr-card__body')
        const title = body?.querySelector<HTMLElement>('h2, h3, h4, [role="heading"], button[aria-expanded]')
        const box = card.getBoundingClientRect()
        return {
          heading: title?.textContent?.trim() ?? null,
          headingLevel: title ? (title.tagName.match(/^H(\d)$/)?.[1] ?? title.getAttribute('aria-level') ?? 'button') : null,
          headingInside: !!title && body!.contains(title),
          barWidth: bar ? getComputedStyle(bar).width : null,
          radius: body ? getComputedStyle(body).borderRadius : null,
          contained: box.left >= -1 && box.right <= window.innerWidth + 1,
        }
      }),
    }
  })
}

/** Cards present, each with the 12px bar and its heading inside, none nested. */
async function expectCurrentCards(page: Page, where: string, headings: string[]) {
  const probe = await cardProbe(page)
  expect(probe.nested, `${where}: a card is drawn inside another`).toBe(0)
  expect(probe.rowCards, `${where}: a list row is its own card`).toBe(0)
  for (const card of probe.cards) {
    expect(card.barWidth, `${where}: "${card.heading}" has no 12px bar`).toBe('12px')
    expect(card.contained, `${where}: "${card.heading}" leaves the viewport`).toBe(true)
  }
  const named = probe.cards.map((card) => card.heading)
  for (const name of headings) {
    const card = probe.cards.find((candidate) => candidate.heading === name)
    expect(card, `${where}: no card headed "${name}" (found ${named.join(', ')})`).toBeTruthy()
    expect(card!.headingInside, `${where}: "${name}" is not inside its card`).toBe(true)
  }
  return probe
}

/** The outline of `main`: no level is skipped on the way down. */
function headingOutline(page: Page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('main h1, main h2, main h3, main h4, main h5'))
    .map((el) => ({ level: Number(el.tagName.slice(1)), text: el.textContent?.trim() ?? '' })))
}
async function expectCoherentOutline(page: Page, where: string) {
  const outline = await headingOutline(page)
  expect(outline[0]?.level, `${where}: the outline does not start at h1`).toBe(1)
  for (let index = 1; index < outline.length; index += 1) {
    expect(outline[index].level - outline[index - 1].level, `${where}: "${outline[index].text}" skips a level`)
      .toBeLessThanOrEqual(1)
  }
  return outline
}

/** The pinned footer action: inside the viewport, not clipped by the frame. */
async function footerProbe(action: Locator) {
  return action.evaluate((el) => {
    const box = el.getBoundingClientRect()
    return {
      inViewport: box.top >= 0 && box.bottom <= window.innerHeight + 1 && box.left >= 0 &&
        box.right <= window.innerWidth + 1,
      textClipped: el.scrollWidth > el.clientWidth + 1,
      height: box.height,
    }
  })
}
async function expectReachableFooter(action: Locator, where: string) {
  await expect(action).toBeVisible()
  const probe = await footerProbe(action)
  expect(probe, `${where}: the footer action is clipped`).toMatchObject({ inViewport: true, textClipped: false })
  return probe
}

/** Which focus treatment the focused control got: its own border, or the bracket layer. */
function focusProbe(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    const bracket = document.querySelector('.clr-focus-brackets')
    return {
      mode: document.documentElement.getAttribute('data-clr-focus'),
      tag: active?.tagName.toLowerCase() ?? null,
      role: active?.getAttribute('role') ?? null,
      name: active?.getAttribute('aria-label') ?? active?.textContent?.trim().slice(0, 40) ?? null,
      layers: document.querySelectorAll('.clr-focus-brackets').length,
      bracketOpacity: bracket ? Number(getComputedStyle(bracket).opacity) : 0,
    }
  })
}

/** A selected choice carries a tick as well as a tint. */
function tickOpacity(choice: Locator) {
  return choice.evaluate((el) => {
    const tick = el.querySelector('svg')
    return tick ? Number(getComputedStyle(tick).opacity) : 0
  })
}

/** A failure toast is the shared host's; close it so it does not sit over the footer. */
async function dismissToast(page: Page) {
  const dismiss = page.getByRole('alert').getByRole('button', { name: 'Dismiss', exact: true })
  if (await dismiss.count() > 0) await dismiss.first().click()
  await expect(dismiss).toHaveCount(0)
}

const runningNames = (page: Page) => page.evaluate(() => document.getAnimations()
  .filter((animation) => animation.playState === 'running')
  .map((animation) => 'animationName' in animation ? String(animation.animationName)
    : 'transitionProperty' in animation ? String(animation.transitionProperty) : animation.id))

// ── A disposable user with real records ────────────────────────────────────

type Catalogued = { id: string; default_equipment: string }
type Persisted = { session: { id: string }; sections: { blocks: { exercises: { exercise: { id: string } }[] }[] }[] }

/** Never put an admin response body, token or email into an assertion. */
function must<T>(result: { ok: boolean; status: number; body: unknown }, operation: string): T {
  expect(result.ok, `${operation}: HTTP status ${result.status}`).toBe(true)
  return result.body as T
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

/** A saved workout in the stored acceptance contract; a fixture, never a model answer. */
function acceptance(catalog: Catalogued[], title: string, offset: number, sections: number) {
  const [one, two] = catalog
  const block = (structure: string) => ({
    structure_type: structure,
    rounds: structure === 'circuit' ? 2 : null,
    timer_type: structure === 'emom' ? 'per_minute' : 'none',
    timer_seconds: structure === 'emom' ? 120 : null,
    round_rest_seconds: ['superset', 'circuit'].includes(structure) ? 10 : null,
    rep_scheme: 'fixed', block_notes: null,
    exercises: structure === 'superset'
      ? [prescription(one, { rest_seconds: 0 }), prescription(two, { rest_seconds: null })]
      : [prescription(one)],
  })
  const all = [
    ['Standard', 'primary_lift', [block('standard'), block('standard')]],
    ['Superset', 'accessory', [block('superset')]],
    ['Circuit', 'conditioning', [block('circuit')]],
    ['EMOM', 'conditioning', [block('emom')]],
  ] as const
  return {
    date: day(offset), location_id: null, session_focus: 'full_body', goal_preset: 'balanced',
    requested_duration_mins: 30, effective_duration_target_mins: 30, computed_duration_mins: null,
    requested_intensity: 5, effective_intensity: 5, adjustment_reason: null, generation_notes: null,
    prompt_version: 'e2e', contract_version: '4.1.0',
    workout: {
      title, overview: 'Disposable saved-workout fixture; not a model response.', estimated_duration_mins: 30,
      sections: all.slice(0, sections).map(([section_title, section_type, blocks]) => ({
        section_type, section_title, section_notes: null,
        blocks: blocks.map((fixture) => ({ ...fixture, exercises: fixture.exercises.map((exercise) => ({
          ...exercise,
          session_function: section_type === 'primary_lift' ? 'primary' : section_type === 'accessory' ? 'accessory' : 'conditioning',
        })) })),
      })),
    },
  }
}

interface Actor {
  readonly id: string
  readonly client: ReturnType<typeof backend.client>
  persist(title: string, offset: number, sections?: number): Promise<Persisted>
  start(stored: Persisted): Promise<void>
  completed(title: string, offset: number, options?: { sections?: number; logged?: boolean }): Promise<Persisted>
}

/**
 * One namespaced user per case, signed in the way the app stores its own
 * session, onboarded through the real RPC. `cleanup` deletes every user made.
 */
async function makeActor(testInfo: TestInfo, purpose: string, cleanup: string[], page?: Page): Promise<Actor> {
  expect(backend.available, backend.reason).toBe(true)
  const client = backend.client()
  const catalog = must<Catalogued[]>(await client.selectAsService('exercise_definitions', {
    select: 'id,default_equipment', order: 'id.asc', limit: '2',
  }), 'Fixture catalog read')
  expect(catalog).toHaveLength(2)
  const suffix = createHash('sha256').update(testInfo.titlePath.join('\0')).digest('hex').slice(0, 8)
  const email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-t035-${suffix}-${purpose}@example.com`
  let id: string
  let token: string
  let refreshToken: string
  try {
    const prior = await client.findUserByEmail(email)
    if (prior) await client.deleteUser(prior.id)
    const created = await client.ensureConfirmedUser(email)
    cleanup.push(created.id)
    const session = await client.mintSession(email)
    id = created.id
    token = session.accessToken
    refreshToken = session.refreshToken
  } catch {
    throw new Error('TASK-035 namespaced fixture authentication failed; no response body retained.')
  }
  must(await client.rpcAs('complete_onboarding', {
    p_location_name: PLACE, p_location_tier: 'full',
    p_equipment: [...new Set(['bodyweight', 'dumbbells', ...catalog.map((exercise) => exercise.default_equipment)])],
    p_experience_level: 'some', p_goal_preset: 'balanced',
    p_sections: ['warmup', 'primary_lift', 'cooldown'], p_avoid_patterns: [], p_note: null,
  }, token), 'Fixture onboarding')
  if (page) {
    await page.addInitScript(({ key, session }) => {
      // Only until the app has its own: a sign-out in the case must stay signed out.
      if (window.sessionStorage.getItem('task035.seeded') === null) {
        window.localStorage.setItem(key, JSON.stringify(session))
        window.sessionStorage.setItem('task035.seeded', '1')
      }
    }, { key: SESSION_KEY, session: {
      accessToken: token, refreshToken, expiresAt: Date.now() + 60 * 60 * 1000, user: { id, email },
    } })
  }
  const persist = async (title: string, offset: number, sections = 1) => must<Persisted>(
    await client.rpcAs('persist_session', { p_user_id: id, p_session: acceptance(catalog, title, offset, sections) }, token),
    'Fixture persistence')
  const start = async (stored: Persisted) => {
    const started = must<{ outcome: string }>(await client.rpcAs('start_session', { p_session_id: stored.session.id }, token), 'Fixture start')
    expect(started.outcome).toBe('started')
  }
  return {
    id, client, persist, start,
    async completed(title, offset, options = {}) {
      const stored = await persist(title, offset, options.sections ?? 1)
      await start(stored)
      if (options.logged ?? true) must(await client.insertAs('exercise_set_logs', {
        id: randomUUID(), workout_exercise_id: stored.sections[0].blocks[0].exercises[0].exercise.id,
        set_number: 1, actual_reps: 8, weight: 0, weight_unit: 'kg',
      }, token), 'Fixture performed-set write')
      const result = must<{ outcome: string }>(await client.rpcAs('complete_session', {
        p_session_id: stored.session.id, p_actual_duration_mins: 30,
      }, token), 'Fixture completion')
      expect(result.outcome).toBe('completed')
      return stored
    },
  }
}

async function removeActors(cleanup: string[]) {
  const client = backend.client()
  for (const id of cleanup.splice(0)) await client.deleteUser(id)
}

/** Only this user's own read, held then answered — never every REST request. */
async function scopedFault(page: Page, matches: (route: Route) => boolean, status = 500) {
  const hold = deferred()
  let failing = true
  let hits = 0
  const handler = async (route: Route) => {
    if (!matches(route)) return route.fallback()
    if (!failing) return route.fallback()
    hits += 1
    await hold.wait
    await answer(route, status, serverFailure)
  }
  await page.route(REST, handler)
  return {
    release: hold.release,
    hits: () => hits,
    async stop() { failing = false; hold.release(); await page.unroute(REST, handler) },
  }
}
const ownedGet = (table: string, field: string, value: string) => (route: Route) => {
  const url = new URL(route.request().url())
  return route.request().method() === 'GET' && url.pathname.endsWith(`/${table}`) &&
    url.searchParams.get(field) === `eq.${value}`
}
const ownedRpc = (rpc: string) => (route: Route) =>
  route.request().method() === 'POST' && new URL(route.request().url()).pathname.endsWith(`/rpc/${rpc}`)

/** Records each container that takes the `.clr-boot` arrival, and the delays its children got. */
async function watchArrivals(page: Page) {
  await page.addInitScript(() => {
    const store = window as unknown as { __arrivals: Array<{ label: string; delays: string[] }> }
    store.__arrivals = []
    const state = new WeakMap<Element, boolean>()
    const check = (el: Element) => {
      const has = el.classList.contains('clr-boot')
      if (has && state.get(el) !== true) {
        store.__arrivals.push({
          label: Array.from(el.querySelectorAll('h2, h3')).map((title) => title.textContent?.trim()).join(' | '),
          delays: Array.from(el.children).slice(0, 4).map((child) => getComputedStyle(child).animationDelay),
        })
      }
      state.set(el, has)
    }
    new MutationObserver((records) => {
      for (const change of records) {
        if (change.type === 'attributes' && change.target instanceof Element) check(change.target)
        for (const node of Array.from(change.addedNodes)) {
          if (!(node instanceof Element)) continue
          check(node)
          node.querySelectorAll('.clr-boot').forEach(check)
        }
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  })
  return () => page.evaluate(() =>
    (window as unknown as { __arrivals: Array<{ label: string; delays: string[] }> }).__arrivals)
}
const seconds = (value: string) => value.endsWith('ms') ? Number.parseFloat(value) / 1000 : Number.parseFloat(value)

// ENV-07: the Preview lane has no privileged backend credentials. Every case
// here needs one; register them as ineligible there before fixtures run.
const backendTest = backend.available ? test : test.skip

// ── Home ───────────────────────────────────────────────────────────────────

backendTest('home: groups, arrival, tabs, favorites, routing and resume', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(360_000)
  const cleanup: string[] = []
  const arrivals = await watchArrivals(page)
  try {
    const actor = await makeActor(testInfo, 'home', cleanup, page)
    evidence.note('fixture', 'A disposable namespaced user onboarded through complete_onboarding; sessions are written with persist_session/start_session/complete_session, the favorite through the app’s own Save as favorite.')
    const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
    const tabs = page.getByRole('tablist')
    const recentTab = page.getByRole('tab', { name: 'Recent workouts', exact: true })
    const favoritesTab = page.getByRole('tab', { name: 'Favorites', exact: true })

    await visit('/')
    await evidence.shot('Home', '/', 'no-history', '/', 'Today', async () => {
      await visibleText(page, 'No workouts yet')
      const cards = await expectCurrentCards(page, 'Home no-history', ['Train today', 'This week', 'Recent workouts'])
      evidence.note('contract', 'Home groups are Train today, This week and the Recent workouts / Favorites tab panel: each a current Card with its 12px accent bar and an internal heading, none nested.',
        cards.cards.map(({ heading: name, barWidth, headingLevel }) => ({ heading: name, barWidth, headingLevel })))
      await expect(tabs).toBeVisible()
      await expect(recentTab).toHaveAttribute('aria-selected', 'true')
      await expectReachableFooter(generate, 'Home no-history')
      await expectCoherentOutline(page, 'Home')
    }, { skins: true, short: generate })

    // One arrival: the group set staggered once, 40ms apart, and nothing again.
    const first = await arrivals()
    const home = first.filter((arrival) => arrival.label.includes('This week'))
    expect(home, 'Home’s groups did not arrive exactly once').toHaveLength(1)
    const [d0, d1] = home[0].delays.map(seconds)
    expect(Math.round((d1 - d0) * 1000), 'Home’s stagger is not 40ms').toBe(40)
    await favoritesTab.click()
    await recentTab.click()
    expect((await arrivals()).filter((arrival) => arrival.label.includes('This week')),
      'a tab change replayed Home’s arrival').toHaveLength(1)
    evidence.note('motion', 'Home’s three groups arrive as one .clr-boot set, 40ms apart, once; switching tabs is an inline update and replays nothing.',
      { arrivals: first })

    await recentTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(favoritesTab).toBeFocused()
    await expect(favoritesTab).toHaveAttribute('aria-selected', 'true')
    await expect.poll(async () => (await focusProbe(page)).bracketOpacity,
      { message: 'a focused tab has no brackets' }).toBe(1)
    evidence.note('keyboard', 'The Home tablist is the package TabBar: ArrowRight moves focus and selection from Recent workouts to Favorites, and the bracket layer frames the focused tab.',
      await focusProbe(page))
    await evidence.shot('Home', '/', 'favorites-empty', '/', 'Today', async () => {
      await expect(favoritesTab).toHaveAttribute('aria-selected', 'true')
      await visibleText(page, 'No favorites yet')
      await expectCurrentCards(page, 'Home favorites-empty', ['Favorites'])
    }, { skins: true })
    await page.keyboard.press('ArrowLeft')
    await expect(recentTab).toHaveAttribute('aria-selected', 'true')

    if (evidence.phone) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.reload()
      await heading(page, 'Today')
      expect((await arrivals()).filter((arrival) => arrival.label.includes('This week')),
        'reduced motion still staggered Home’s groups').toEqual([])
      await expect.poll(() => runningNames(page), { message: 'reduced motion left Home animating' }).toEqual([])
      await evidence.shot('Home', '/', 'no-history', '/', 'Today', () => expect(generate).toBeEnabled(),
        { variant: 'reduced-motion' })
      evidence.note('motion', 'Under prefers-reduced-motion Home’s groups take no .clr-boot arrival and nothing is left running once the reload settles.')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }

    // A completed, reviewable record.
    const done = await actor.completed(TITLE, 1, { sections: 2 })
    await page.reload()
    // Only the active tab's panel is exposed.
    const recents = page.getByRole('tabpanel')
    await evidence.shot('Home', '/', 'history-populated', '/', 'Today', async () => {
      await expect(recents.getByText(TITLE, { exact: true })).toBeVisible()
      await expectCurrentCards(page, 'Home history-populated', ['Train today', 'This week', 'Recent workouts'])
      // The quiet action's drawn chevron is part of its text.
      await expect(page.getByRole('link', { name: /^View history/ })).toBeVisible()
      await expectReachableFooter(generate, 'Home history-populated')
    }, { skins: true, short: generate })
    await recents.getByText(TITLE, { exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/review')
    await evidence.shot('Home', '/', 'compatible-review-entry', '/review', TITLE, () =>
      expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled(),
    { variant: 'transition-destination' })
    evidence.note('contract', 'A completed recent whose stored prescription validates opens in Review, not Session Detail.')

    // Favorite through the app’s own control; it survives a reload of Home.
    await visit(`/history/${done.session.id}`)
    await page.getByRole('button', { name: 'Save as favorite', exact: true }).click()
    await visibleText(page, 'Saved to favorites')
    await visit('/')
    await page.reload()
    await favoritesTab.click()
    const favorites = page.getByRole('tabpanel')
    await evidence.shot('Home', '/', 'favorites-populated', '/', 'Today', async () => {
      await expect(favoritesTab).toHaveAttribute('aria-selected', 'true')
      await expect(favorites.getByText(TITLE).first()).toBeVisible()
      await expectCurrentCards(page, 'Home favorites-populated', ['Favorites'])
    }, { skins: true, short: generate })
    const saved = must<Array<{ id: string }>>(await actor.client.selectAsService('saved_workouts', {
      select: 'id', user_id: `eq.${actor.id}` }), 'Favorite persistence read')
    expect(saved).toHaveLength(1)
    evidence.note('contract', 'Save as favorite wrote one saved_workouts row for the owner; the Favorites tab lists it after a full reload.')

    // Favorites read: held, then failed, with its own Retry; the recents are unaffected.
    const favFault = await scopedFault(page, ownedGet('saved_workouts', 'user_id', actor.id))
    try {
      await page.reload()
      await heading(page, 'Today')
      await favoritesTab.click()
      await evidence.shot('Home', '/', 'reads-loading', '/', 'Today', () =>
        visibleText(page, 'Reading your favorites'), { variant: 'favorites-list' })
      favFault.release()
      await evidence.shot('Home', '/', 'read-error-retry', '/', 'Today', async () => {
        await expect(page.getByRole('alert').filter({ hasText: 'Your favorites didn’t load' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
        await expectCurrentCards(page, 'Home favorites error', ['Favorites'])
      }, { variant: 'favorites-list', skins: true })
    } finally { await favFault.stop() }
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(favorites.getByText(TITLE).first()).toBeVisible()
    await recentTab.click()
    await expect(recents.getByText(TITLE, { exact: true })).toBeVisible()

    // An active session takes the top slot and the primary footer.
    const active = await actor.persist('TASK-035 active session', 0)
    await actor.start(active)
    await page.reload()
    const resume = page.getByRole('button', { name: 'Resume workout', exact: true })
    await evidence.shot('Home', '/', 'active-session-resume', '/', 'Today', async () => {
      await visibleText(page, /In progress · TASK-035 active session/)
      await expect(generate).toHaveCount(0)
      await expectReachableFooter(resume, 'Home active-session-resume')
      await expect(page.getByRole('button', { name: 'Abandon', exact: true })).toBeVisible()
      await expectCurrentCards(page, 'Home active', ['Train today', 'This week'])
    }, { skins: true, short: resume })
    await resume.click()
    await expect(page).toHaveURL((url) => url.pathname === '/workout')
    evidence.note('contract', 'With an active session the footer is Resume workout and leads to /workout; Generate workout is not offered.')
    evidence.disposition('Home', '/', 'incompatible-detail-fallback',
      'Home recents and History rows share useOpenHistorySession; the incompatible fallback is exercised on History, where a not-started record is listed.',
      ['src/app/useOpenHistorySession.ts', 'src/app/Home.tsx', SOURCE_FILE])
    evidence.note('contract', 'The reachable Suggested next selection/dismissal is rendered in the additive suggestion case; the original saved source-only disposition remains historical, not a current substitute for that state.')
    expect(evidence.modelAttempts()).toBe(0)
  } finally { await removeActors(cleanup) }
})

// ── History ────────────────────────────────────────────────────────────────

backendTest('responsive: representative route families in the missing skins and short-phone sizes', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(360_000)
  const cleanup: string[] = []
  try {
    const actor = await makeActor(testInfo, 'responsive', cleanup, page)
    const done = await actor.completed(TITLE, 1, { sections: 2 })
    const detailPath = `/history/${done.session.id}`
    const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
    const responsive = { responsiveSample: true, variant: 'representative-responsive' }
    evidence.note('fixture', 'Additive representative layouts only: non-phone projects add all four skins; the phone project adds all four short-phone skins. Existing full-phone skin evidence and every original record/picture are retained. This is not every state/skin/width combination or deployed proof.')

    await visit(detailPath)
    await page.getByRole('button', { name: 'Save as favorite', exact: true }).click()
    await visibleText(page, 'Saved to favorites')
    await visit('/')
    await evidence.shot('Home', '/', 'history-populated', '/', 'Today', async () => {
      await expect(page.getByRole('tabpanel').getByText(TITLE, { exact: true })).toBeVisible()
      await expectCurrentCards(page, 'Responsive Home', ['Train today', 'This week', 'Recent workouts'])
      await expectReachableFooter(generate, 'Responsive Home')
    }, { ...responsive, short: generate })
    await page.getByRole('tab', { name: 'Favorites', exact: true }).click()
    await evidence.shot('Home', '/', 'favorites-populated', '/', 'Today', async () => {
      await expect(page.getByRole('tabpanel').getByText(TITLE).first()).toBeVisible()
      await expectCurrentCards(page, 'Responsive Favorites', ['Favorites'])
    }, { ...responsive, short: generate })

    await visit('/history')
    const filter = page.getByLabel('Show')
    await filter.selectOption('completed')
    const home = page.getByRole('button', { name: 'Home', exact: true })
    await evidence.shot('History', '/history', 'selected-filters', '/history', 'History', async () => {
      await expect(filter).toHaveValue('completed')
      await expect(page.getByRole('list', { name: 'Workout history' }).getByText(TITLE, { exact: true })).toBeVisible()
      await expectCurrentCards(page, 'Responsive History', ['Workout history'])
    }, { ...responsive, short: home })

    await visit(detailPath)
    const restart = page.getByRole('button', { name: 'Restart', exact: true })
    await evidence.shot('Session Detail', '/history/:id', 'as-performed-populated', detailPath, TITLE, async () => {
      await expect(page.getByText(/^As performed/)).toBeVisible()
      await expect(page.getByRole('table').first()).toBeVisible()
      await expectCurrentCards(page, 'Responsive Session Detail', ['Overview'])
      await expectReachableFooter(restart, 'Responsive Session Detail')
    }, { ...responsive, short: restart })

    await visit('/settings')
    const signOut = page.getByRole('button', { name: 'Sign out', exact: true })
    await evidence.shot('Settings', '/settings', 'preferences-populated', '/settings', 'Settings', async () => {
      for (const name of ['Training', 'Limitations', 'Appearance', 'Places and equipment', 'Session']) {
        await expect(page.getByRole('region', { name, exact: true })).toBeVisible()
      }
      await expectCurrentCards(page, 'Responsive Settings', ['Training', 'Limitations', 'Appearance', 'Places and equipment', 'Session'])
    }, { ...responsive, short: signOut })
    const appearance = page.getByRole('region', { name: 'Appearance', exact: true })
    await evidence.shot('Settings', '/settings', 'appearance-system-or-skin', '/settings', 'Settings', async () => {
      await appearance.scrollIntoViewIfNeeded()
      await expect(appearance).toBeVisible()
      await expect(appearance.getByRole('radio')).toHaveCount(5)
    }, { ...responsive, short: appearance.getByRole('radio', { name: /^Clear\b/i }) })
    evidence.note('fixture', 'Responsive palette sampling uses the existing owned screenshot fixture to set the stored skin and document attribute; real appearance-picker persistence and selection remain asserted in the original settings case. These are layout pictures, not new preference behavior.')

    await visit('/settings/locations')
    const add = page.getByRole('button', { name: 'Add place', exact: true })
    await evidence.shot('Settings', '/settings/locations', 'list-populated', '/settings/locations', 'Places and equipment', async () => {
      await expect(page.getByRole('heading', { name: PLACE, exact: true })).toBeVisible()
      await visibleText(page, 'Default for generation')
      await expectReachableFooter(add, 'Responsive Places')
    }, { ...responsive, short: add })
    expect(evidence.modelAttempts()).toBe(0)
  } finally { await removeActors(cleanup) }
})

backendTest('suggestion: real qualifying history, one next-workout entry into prefilled Generate', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(360_000)
  const cleanup: string[] = []
  try {
    const actor = await makeActor(testInfo, 'suggestion', cleanup, page)
    await actor.completed('TASK-035 suggestion history', 1)
    const rows = must<WorkoutSessionRow[]>(await actor.client.selectAsService('workout_sessions', {
      select: '*', user_id: `eq.${actor.id}`, order: 'date.desc',
    }), 'Owned suggestion history read')
    // TASK-012 (U20): Use this, Dismiss and Quick start became one entry.
    const next = nextWorkout(rows)
    expect(next.status, 'the actual recent completed fixture must qualify for a suggestion').toBe('recommended')
    if (next.prior === null) throw new Error('Owned completed history has no prior request')
    const train = page.locator('.clr-card').filter({ has: page.getByRole('heading', { level: 2, name: 'Train today', exact: true }) })
    const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
    evidence.note('fixture', 'A real disposable actor with one recent completed RPC-written session qualifies under the installed minimum-history rule. Expected entry/path are derived from the actual owned rows, not a mocked Home suggestion or a model response.')

    await visit('/')
    await evidence.shot('Home', '/', 'suggestion-selected-dismissed', '/', 'Today', async () => {
      await expect(train.getByText(`Last time: ${next.prior!.summary}.`, { exact: true })).toBeVisible()
      await expect(train.getByText(`Suggested next: ${next.guidance}`, { exact: true })).toBeVisible()
      await expect(train.getByRole('button')).toHaveCount(0)
      for (const retired of ['Use this', 'Dismiss', 'Quick start']) {
        await expect(page.getByRole('button', { name: retired, exact: true })).toHaveCount(0)
      }
      await expect(generate).toBeEnabled()
      await expectCurrentCards(page, 'Home suggestion', ['Train today'])
    }, { variant: 'suggested-next', skins: true, short: generate })
    await generate.click()
    const selected = new URL(next.path, 'https://owned-fixture.invalid')
    await expect(page).toHaveURL((url) => url.pathname === selected.pathname && url.search === selected.search)
    await evidence.shot('Home', '/', 'suggestion-selected-dismissed', '/generate', 'Generate workout', async () => {
      await visibleText(page, next.suggestion!.focusLabel)
      await expect(page.getByRole('slider')).toHaveValue(String(next.suggestion!.intensity))
      await expect(page.getByLabel(/Time available/i)).toHaveValue(String(next.prior!.durationMins))
      await expect(page.getByRole('group', { name: 'Anchor', exact: true })).toHaveCount(0)
    }, { variant: 'next-workout-destination' })
    evidence.note('contract', 'The one primary action follows the actual next-workout path: Generate opens with the recommended focus, history intensity and the prior request minutes. No Generate/model POST was submitted.')
    expect(evidence.modelAttempts()).toBe(0)
  } finally { await removeActors(cleanup) }
})

// ── Original History cases ─────────────────────────────────────────────────

backendTest('history: one card, filters, pagination, routing, loading and error', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(360_000)
  const cleanup: string[] = []
  try {
    const actor = await makeActor(testInfo, 'history', cleanup, page)
    evidence.note('fixture', 'A disposable namespaced user; one completed reviewable record, one never-started record and twenty-one older prescriptions written through persist_session.')
    const list = page.getByRole('list', { name: 'Workout history' })
    const filter = page.getByLabel('Show')

    await visit('/history')
    await evidence.shot('History', '/history', 'no-workouts-empty', '/history', 'History', async () => {
      await visibleText(page, 'No workouts yet')
      await expect(list).toHaveCount(0)
      // Nothing to narrow: the filter belongs to a history that exists.
      await expect(filter).toHaveCount(0)
      const probe = await expectCurrentCards(page, 'History empty', ['Workout history'])
      expect(probe.count, 'History empty has more than one card').toBe(1)
    }, { skins: true, short: page.getByRole('button', { name: 'Home', exact: true }) })

    const done = await actor.completed(TITLE, 1)
    const unstarted = await actor.persist(UNSTARTED_TITLE, 2)
    for (let offset = 3; offset <= 23; offset += 1) await actor.persist(`TASK-035 older session ${offset}`, offset)
    await page.reload()
    const more = page.getByRole('button', { name: 'Load older workouts', exact: true })
    await evidence.shot('History', '/history', 'populated-load-more', '/history', 'History', async () => {
      await expect(list.getByRole('listitem').first()).toBeVisible()
      expect(await list.getByRole('listitem').count()).toBeGreaterThanOrEqual(20)
      const probe = await expectCurrentCards(page, 'History populated', ['Workout history'])
      expect(probe.count, 'the collection is not one card').toBe(1)
      await expectReachableFooter(more, 'History populated')
      // Rows are separated by the list's inset rule, not framed.
      const rules = await list.evaluate((el) => Array.from(el.children).slice(0, 3).map((row) => {
        const style = getComputedStyle(row)
        return { top: style.borderTopWidth, bottom: style.borderBottomWidth, radius: style.borderRadius }
      }))
      evidence.note('contract', 'History is one Workout history card: the filter, rows and every state are its content, rows are list items with inset rules and no frame, and Load older workouts sits in the pinned footer.',
        { rowRules: rules })
    }, { skins: true, short: more })
    // Boot consumes the first history read, so the held and failed read is the
    // second page, asked for by Load older workouts.
    const before = await list.getByRole('listitem').count()
    const hold = await scopedFault(page, ownedGet('workout_sessions', 'user_id', actor.id))
    try {
      await more.click()
      await expect.poll(hold.hits).toBe(1)
      await evidence.shot('History', '/history', 'loading', '/history', 'History', async () => {
        await expect(page.locator('main').getByRole('status')).toContainText(/Reading history|Taking longer than usual/)
        expect((await cardProbe(page)).count).toBe(1)
      })
      hold.release()
      const retry = page.getByRole('button', { name: 'Retry', exact: true })
      await evidence.shot('History', '/history', 'error-retry', '/history', 'History', async () => {
        await expect(page.getByRole('alert')).toContainText('History didn’t load')
        expect((await cardProbe(page)).count).toBe(1)
        await expectReachableFooter(retry, 'History error')
      }, { skins: true, short: retry })
    } finally { await hold.stop() }
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect.poll(() => list.getByRole('listitem').count()).toBeGreaterThan(before)
    evidence.note('contract', 'A held then failed page read keeps the one card and puts Retry in the footer; Retry re-reads and Load older workouts widens the window to the remaining records.',
      { before, after: await list.getByRole('listitem').count() })

    await filter.selectOption('partial')
    const showAll = page.getByRole('button', { name: 'Show all entries', exact: true })
    await evidence.shot('History', '/history', 'filtered-no-matches', '/history', 'History', async () => {
      await visibleText(page, 'Nothing matches this filter')
      await expect(filter).toHaveValue('partial')
      expect((await cardProbe(page)).count).toBe(1)
      await expectReachableFooter(showAll, 'History filtered')
    }, { skins: true, short: showAll })
    await showAll.click()
    await filter.selectOption('completed')
    await evidence.shot('History', '/history', 'selected-filters', '/history', 'History', async () => {
      await expect(filter).toHaveValue('completed')
      await expect(list.getByRole('listitem')).toHaveCount(1)
      expect((await cardProbe(page)).count).toBe(1)
    }, { skins: true })
    await filter.focus()
    evidence.note('keyboard', 'The Show filter is a native select reached by Tab; as a field it owns its focus.', await focusProbe(page))

    await list.getByText(TITLE, { exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/review')
    await evidence.shot('History', '/history', 'compatible-review-entry', '/review', TITLE, () =>
      expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled(),
    { variant: 'transition-destination' })

    await visit('/history')
    await filter.selectOption('unstarted')
    await list.getByText(UNSTARTED_TITLE, { exact: true }).click()
    const unstartedPath = `/history/${unstarted.session.id}`
    await expect(page).toHaveURL((url) => url.pathname === unstartedPath)
    await evidence.shot('History', '/history', 'incompatible-detail-fallback', unstartedPath, UNSTARTED_TITLE, () =>
      visibleText(page, 'Only a completed workout can be restarted.'), { variant: 'transition-destination' })
    evidence.note('contract', 'A completed, valid record opens Review; a never-started record follows its durable /history/:id fallback into Session Detail.',
      { reviewable: done.session.id === unstarted.session.id ? 'collision' : 'distinct' })

    expect(evidence.modelAttempts()).toBe(0)
  } finally { await removeActors(cleanup) }
})

// ── Session Detail ─────────────────────────────────────────────────────────

backendTest('detail: metadata, ruled sections, refusals, restart and favorite', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(360_000)
  const cleanup: string[] = []
  try {
    const actor = await makeActor(testInfo, 'detail', cleanup, page)
    const other = await makeActor(testInfo, 'other', cleanup)
    evidence.note('fixture', 'Two disposable namespaced users. The viewer owns a logged completed record, an unlogged completed record and a never-started record; the other user owns one completed record.')
    const done = await actor.completed(TITLE, 1, { sections: 2 })
    const unlogged = await actor.completed('TASK-035 unlogged session', 2, { logged: false })
    const unstarted = await actor.persist(UNSTARTED_TITLE, 3)
    const foreign = await other.completed('TASK-035 another user’s session', 1)
    const at = `/history/${done.session.id}`
    const restart = page.getByRole('button', { name: 'Restart', exact: true })

    await visit(at)
    await evidence.shot('Session Detail', '/history/:id', 'as-performed-populated', at, TITLE, async () => {
      await expect(page.getByText(/^As performed/)).toBeVisible()
      await expect(page.getByRole('table').first()).toBeVisible()
      await expectCurrentCards(page, 'Session Detail', ['Overview'])
      const facts = page.getByRole('definition')
      expect(await facts.count(), 'the facts are not a description list').toBeGreaterThanOrEqual(4)
      // Mood and Notes are ruled sub-groups inside Overview, not second frames.
      const subgroups = await page.evaluate(() => Array.from(document.querySelectorAll('main .clr-card h3'))
        .map((el) => ({ text: el.textContent?.trim(), rule: getComputedStyle(el.parentElement!).borderBottomStyle })))
      expect(subgroups.filter((group) => ['Mood', 'Notes'].includes(group.text ?? '')))
        .toEqual([{ text: 'Mood', rule: 'solid' }, { text: 'Notes', rule: 'solid' }])
      // A block after the first is set off by the card's internal rule.
      const blocks = await page.locator('[data-detail-block]').evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).borderTopStyle))
      expect(blocks.slice(0, 2)).toEqual(['none', 'solid'])
      const outline = await expectCoherentOutline(page, 'Session Detail')
      evidence.note('contract', 'Session Detail: one Overview card holds the facts (dl), provenance and the Mood/Notes sub-groups, each with a ruled heading; each section is one card whose later blocks are separated by an internal rule; the outline never skips a level.',
        { outline, blocks, subgroups })
      await expectReachableFooter(restart, 'Session Detail populated')
    }, { skins: true, short: restart })

    await page.getByRole('button', { name: 'Standard', exact: true }).click()
    await evidence.shot('Session Detail', '/history/:id', 'section-collapsed', at, TITLE, () =>
      expect(page.getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute('aria-expanded', 'false'))
    await page.getByRole('button', { name: 'Standard', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute('aria-expanded', 'true')
    evidence.note('keyboard', 'A section heading is a disclosure button: Enter toggles aria-expanded, and the focused trigger is bracketed.', await focusProbe(page))

    const favFault = await scopedFault(page, ownedRpc('save_favorite'))
    try {
      favFault.release()
      await page.getByRole('button', { name: 'Save as favorite', exact: true }).click()
      await evidence.shot('Session Detail', '/history/:id', 'favorite-save-failure', at, TITLE, async () => {
        await expect(page.getByRole('alert')).toContainText('That workout wasn’t saved as a favorite. Try again.')
        await expect(restart).toBeEnabled()
      }, { skins: true })
    } finally { await favFault.stop() }

    const restartFault = await scopedFault(page, ownedRpc('session_as_intended_at_start'))
    try {
      restartFault.release()
      await restart.click()
      await evidence.shot('Session Detail', '/history/:id', 'restart-read-validation-error', at, TITLE, () =>
        expect(page.getByRole('alert').filter({ hasText: 'This workout couldn’t be rebuilt for a restart.' })).toBeVisible())
    } finally { await restartFault.stop() }
    await restart.click()
    await expect(page).toHaveURL((url) => url.pathname === '/review')
    await evidence.shot('Session Detail', '/history/:id', 'restart-review', '/review', TITLE, () =>
      expect(page.getByRole('button', { name: 'Start workout', exact: true })).toBeEnabled(),
    { variant: 'transition-destination' })

    const unloggedAt = `/history/${unlogged.session.id}`
    await visit(unloggedAt)
    await evidence.shot('Session Detail', '/history/:id', 'unscored-or-unlogged', unloggedAt, 'TASK-035 unlogged session', async () => {
      await visibleText(page, 'No sets logged')
      await expectCurrentCards(page, 'Session Detail unlogged', ['Overview'])
    })

    const unstartedAt = `/history/${unstarted.session.id}`
    await visit(unstartedAt)
    await evidence.shot('Session Detail', '/history/:id', 'restart-ineligible', unstartedAt, UNSTARTED_TITLE, async () => {
      await visibleText(page, 'Only a completed workout can be restarted.')
      await expect(restart).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Save as favorite', exact: true })).toHaveCount(0)
    }, { skins: true })

    // Another user’s record is refused exactly like a missing one.
    const foreignAt = `/history/${foreign.session.id}`
    await visit(foreignAt)
    const openHistory = page.getByRole('button', { name: 'Open history', exact: true })
    await evidence.shot('Session Detail', '/history/:id', 'missing-or-not-yours', foreignAt, 'Workout', async () => {
      await expect(page.getByRole('alert')).toContainText('Workout not found')
      await expect(page.getByRole('region', { name: 'Sections' })).toHaveCount(0)
      await expect(page.getByText('TASK-035 another user’s session')).toHaveCount(0)
      await expectReachableFooter(openHistory, 'Session Detail refused')
    }, { variant: 'not-yours', skins: true, short: openHistory })
    const missingAt = `/history/${randomUUID()}`
    await visit(missingAt)
    await evidence.shot('Session Detail', '/history/:id', 'missing-or-not-yours', missingAt, 'Workout', () =>
      expect(page.getByRole('alert')).toContainText('Workout not found'), { variant: 'missing' })
    await openHistory.click()
    await expect(page).toHaveURL((url) => url.pathname === '/history')
    evidence.note('contract', 'Another user’s completed record and a random id both answer Workout not found with no sections disclosed; Open history returns to /history.')

    // Back: direct entry goes to History; in-app entry goes back where it came from.
    await visit(at)
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/history')
    await page.getByLabel('Show').selectOption('unstarted')
    await page.getByRole('list', { name: 'Workout history' }).getByText(UNSTARTED_TITLE, { exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === unstartedAt)
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/history')
    evidence.note('contract', 'Back on a directly entered record goes to /history; Back on a record opened from History returns to the prior in-app route.')

    const readFault = await scopedFault(page, ownedRpc('session_as_performed'))
    try {
      await visit(unloggedAt)
      // Held past the slow threshold by the time the visit's scan ends.
      await evidence.shot('Session Detail', '/history/:id', 'loading', unloggedAt, 'Workout', () =>
        expect(page.locator('main').getByRole('status').first()).toContainText(/Reading workout|Taking longer than usual/))
      readFault.release()
      const retry = page.getByRole('button', { name: 'Retry', exact: true })
      await evidence.shot('Session Detail', '/history/:id', 'error-retry', unloggedAt, 'Workout', async () => {
        await expect(page.getByRole('alert')).toContainText('Workout didn’t load')
        await expectReachableFooter(retry, 'Session Detail error')
      }, { skins: true, short: retry })
    } finally { await readFault.stop() }
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await heading(page, 'TASK-035 unlogged session')
    evidence.disposition('Session Detail', '/history/:id', 'restart-active-confirmation',
      'Restart with an active session raises the shared workout-chrome confirmation, whose after evidence belongs to the workout lifecycle group.',
      ['src/app/SessionDetail.tsx', 'src/ui/workout-chrome.tsx'])
    expect(evidence.modelAttempts()).toBe(0)
  } finally { await removeActors(cleanup) }
})

// ── Settings ───────────────────────────────────────────────────────────────

backendTest('settings: sections, held save, refusal, reload, skins and focus', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(360_000)
  const cleanup: string[] = []
  try {
    const actor = await makeActor(testInfo, 'settings', cleanup, page)
    evidence.note('fixture', 'A disposable namespaced user; the first experience PATCH is held then answered with the typed settings_not_viable refusal, every later write is the real endpoint.')
    const hold = deferred()
    let refuse = true
    await page.route(REST, async (route) => {
      const url = new URL(route.request().url())
      if (route.request().method() !== 'PATCH' || !url.pathname.endsWith('/profiles') ||
        url.searchParams.get('id') !== `eq.${actor.id}` || !refuse) return route.fallback()
      await hold.wait
      await answer(route, 400, { code: 'P0001', message: 'settings_not_viable', details: '[]' })
    })
    const signOut = page.getByRole('button', { name: 'Sign out', exact: true })
    const sections = ['Training', 'Limitations', 'Appearance', 'Places and equipment', 'Session']
    try {
      await visit('/settings')
      await evidence.shot('Settings', '/settings', 'preferences-populated', '/settings', 'Settings', async () => {
        for (const name of sections) {
          await expect(page.getByRole('region', { name, exact: true })).toBeVisible()
        }
        await expectCurrentCards(page, 'Settings', sections)
        await expect(page.getByRole('radio', { name: /^Some experience/ })).toHaveAttribute('aria-checked', 'true')
        await expect(page.getByRole('button', { name: /^Manage places/ })).toBeVisible()
        // A ready screen has no pinned footer; Retry is the only footer, for a failed read.
        await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
        evidence.note('contract', 'Settings is five landmark sections, each a current card with a 12px bar and its heading inside: Training, Limitations, Appearance, Places and equipment, Session.',
          await expectCoherentOutline(page, 'Settings'))
      }, { skins: true, short: signOut })
      await evidence.shot('Settings', '/settings', 'constraints-loading-empty-error-populated', '/settings', 'Settings', () =>
        visibleText(page, 'Nothing recorded. Tick anything a workout should work around.'), { variant: 'empty' })

      await page.getByRole('radio', { name: /^Confident/ }).click()
      await evidence.shot('Settings', '/settings', 'inline-save-pending-saved', '/settings', 'Settings', () =>
        visibleText(page, 'Saving…'), { variant: 'pending' })
      hold.release()
      await evidence.shot('Settings', '/settings', 'save-refusal-rollback', '/settings', 'Settings', async () => {
        await expect(page.getByRole('radio', { name: /^Some experience/ })).toHaveAttribute('aria-checked', 'true')
        await expect(page.getByRole('radio', { name: /^Confident/ })).toHaveAttribute('aria-checked', 'false')
        await expect(page.getByRole('alert').filter({ hasText: 'Not saved. Your previous settings are kept.' })).toBeVisible()
      }, { skins: true })
      const kept = must<Array<{ experience_level: string }>>(await actor.client.selectAsService('profiles', {
        select: 'experience_level', id: `eq.${actor.id}` }), 'Profile read after refusal')
      expect(kept).toEqual([{ experience_level: 'some' }])
      evidence.note('contract', 'A typed settings_not_viable refusal rolls the control back to the stored value and says so; the stored profile still reads experience_level=some.')
      await dismissToast(page)
    } finally { hold.release() }
    refuse = false

    await page.getByRole('radio', { name: /^Confident/ }).click()
    const training = page.getByRole('region', { name: 'Training', exact: true })
    await expect(training.getByRole('status')).toHaveText('Saved')
    await evidence.shot('Settings', '/settings', 'inline-save-pending-saved', '/settings', 'Settings', () =>
      expect(training.getByRole('status')).toHaveText('Saved'), { variant: 'actual-saved' })
    const hard = page.getByRole('checkbox', { name: 'Hard conditioning', exact: true })
    await hard.click()
    await expect(hard).toBeChecked()
    await expect(page.getByRole('region', { name: 'Limitations', exact: true }).getByRole('status')).toHaveText('Saved')
    await page.reload()
    await heading(page, 'Settings')
    await evidence.shot('Settings', '/settings', 'constraints-loading-empty-error-populated', '/settings', 'Settings', async () => {
      await expect(page.getByRole('radio', { name: /^Confident/ })).toHaveAttribute('aria-checked', 'true')
      await expect(hard).toBeChecked()
      await expect(page.getByText('Nothing recorded. Tick anything a workout should work around.')).toHaveCount(0)
    }, { variant: 'actual-populated-after-reload' })
    const stored = must<Array<{ experience_level: string }>>(await actor.client.selectAsService('profiles', {
      select: 'experience_level', id: `eq.${actor.id}` }), 'Profile read after save')
    expect(stored).toEqual([{ experience_level: 'confident' }])
    evidence.note('contract', 'After a full reload the saved Confident experience and the Hard conditioning limitation are still selected, and the stored profile reads experience_level=confident.')

    // Appearance: the app chooses the skin; selection carries a tick, not only a tint.
    for (const skin of evidence.phone ? CAPTURE_SKINS : (['clear', 'mono'] as const)) {
      const radio = page.getByRole('radio', { name: new RegExp(`^${skin}\\b`, 'i') })
      await radio.click()
      await expect(radio).toHaveAttribute('aria-checked', 'true')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      expect(await page.evaluate((key) => localStorage.getItem(key), SKIN_KEY)).toBe(skin)
      await evidence.adoptSkin(skin)
      await evidence.shot('Settings', '/settings', 'appearance-system-or-skin', '/settings', 'Settings', async () => {
        await expect(radio).toHaveAttribute('aria-checked', 'true')
        await expect.poll(() => tickOpacity(radio), { message: `${skin} selected without a tick` }).toBe(1)
        await expectCurrentCards(page, `Settings in ${skin}`, ['Appearance'])
      }, { variant: `chosen-${skin}` })
    }
    evidence.note('contract', 'Choosing a skin writes clear.skin and data-skin through the picker; the stored key is what boot applies on reload (the same path every capture here uses to pin its skin).')
    // U24: there is no System option, and OS enhanced contrast never switches the skin.
    const clear = page.getByRole('radio', { name: /^clear\b/i })
    await clear.click()
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'clear')
    await evidence.adoptSkin('clear')
    await page.emulateMedia({ contrast: 'more' })
    await evidence.shot('Settings', '/settings', 'appearance-system-or-skin', '/settings', 'Settings', async () => {
      await expect(page.getByRole('radio', { name: /^System\b/i })).toHaveCount(0)
      await expect(clear).toHaveAttribute('aria-checked', 'true')
      await expect(page.locator('html')).toHaveAttribute('data-skin', 'clear')
      expect(await page.evaluate((key) => localStorage.getItem(key), SKIN_KEY)).toBe('clear')
    }, { variant: 'system-contrast' })
    await page.emulateMedia({ contrast: 'no-preference' })

    const goal = page.getByRole('radio', { name: /^Balanced/ })
    await goal.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect.poll(async () => (await focusProbe(page)).bracketOpacity,
      { message: 'a focused goal choice has no brackets' }).toBe(1)
    evidence.note('keyboard', 'The Goal radiogroup is reached by Tab and framed by the static bracket layer.', await focusProbe(page))
    const note = page.getByLabel(/Note/)
    await note.focus()
    expect((await focusProbe(page)).bracketOpacity, 'a text field summoned the bracket layer').toBe(0)
    evidence.note('keyboard', 'The limitations note owns its focus: the bracket layer stays hidden on a text field.', await focusProbe(page))
    await note.blur()

    if (evidence.phone) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.reload()
      await heading(page, 'Settings')
      await expect.poll(() => runningNames(page), { message: 'reduced motion left Settings animating' }).toEqual([])
      await evidence.shot('Settings', '/settings', 'preferences-populated', '/settings', 'Settings',
        () => expect(signOut).toBeVisible(), { variant: 'reduced-motion', short: signOut })
      evidence.note('motion', 'Under prefers-reduced-motion Settings comes to rest after reload with no animation or transition left running.')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }

    await signOut.click()
    await expect(page).toHaveURL((url) => url.pathname === '/welcome')
    await evidence.shot('Settings', '/settings', 'sign-out', '/welcome', 'CLEAR', () =>
      expect(page.getByRole('button', { name: 'Get started', exact: true })).toBeEnabled(),
    { variant: 'transition-destination' })
    evidence.disposition('Settings', '/settings', 'profile-loading',
      'The profile read is Boot-watched; BootGate withholds the route tree while it is pending, so Boot is the native surface.',
      ['src/state/boot-queries.ts', 'src/app/Settings.test.tsx'])
    evidence.disposition('Settings', '/settings', 'profile-error-retry',
      'A failed Boot-watched profile read is answered by Boot’s own retry before Settings mounts; the Settings footer Retry is covered by the mounted component test.',
      ['src/state/boot-queries.ts', 'src/app/Settings.test.tsx'])
    evidence.disposition('Settings', '/settings', 'missing-profile',
      'The guard sends a user with no onboarded profile to /onboarding; the empty branch is unreachable through the route.',
      ['src/app/guards.tsx', 'src/app/Settings.test.tsx'])
    expect(evidence.modelAttempts()).toBe(0)
  } finally { await removeActors(cleanup) }
})

// ── Places and equipment ───────────────────────────────────────────────────

backendTest('places: list, editor, CRUD, refusals, default rules, delete and reload', async ({ page, visit, evidence }, testInfo) => {
  test.setTimeout(360_000)
  const cleanup: string[] = []
  const at = '/settings/locations'
  const title = 'Places and equipment'
  try {
    const actor = await makeActor(testInfo, 'places', cleanup, page)
    evidence.note('fixture', 'A disposable namespaced user with one onboarded place; creates, renames, default changes and deletes are real writes. Only the named equipment read, default change and viability refusal are answered locally for that user.')
    const original = must<Array<{ id: string }>>(await actor.client.selectAsService('locations', {
      select: 'id', user_id: `eq.${actor.id}`, name: `eq.${PLACE}` }), 'Fixture place read')[0]
    const card = (name: string) => page.locator('.clr-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
    const add = page.getByRole('button', { name: 'Add place', exact: true })
    const save = page.getByRole('button', { name: 'Save place', exact: true })
    const name = page.getByRole('textbox', { name: 'Name' })

    await visit(at)
    await evidence.shot('Settings', at, 'list-populated', at, title, async () => {
      await expect(card(PLACE).getByText('Default for generation')).toBeVisible()
      // Default is a tick and a sentence, never colour alone.
      expect(await card(PLACE).getByText('Default for generation').locator('svg').count()).toBe(1)
      await expectCurrentCards(page, 'Places list', [PLACE])
      await expectReachableFooter(add, 'Places list')
    }, { skins: true, short: add })

    const equipmentFault = await scopedFault(page, ownedGet('location_equipment', 'location_id', original.id))
    try {
      await card(PLACE).getByRole('button', { name: 'Edit', exact: true }).click()
      await evidence.shot('Settings', at, 'equipment-loading-error', at, title, () =>
        visibleText(page, `Reading ${PLACE} equipment…`), { variant: 'loading-member' })
      equipmentFault.release()
      await evidence.shot('Settings', at, 'equipment-loading-error', at, title, async () => {
        await visibleText(page, 'This equipment list didn’t load')
        await expectCurrentCards(page, 'Places equipment error', [`Edit ${PLACE}`])
      }, { variant: 'error-member', skins: true })
    } finally { await equipmentFault.stop() }
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(name).toHaveValue(PLACE)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()

    await add.click()
    await evidence.shot('Settings', at, 'new-location-editor', at, title, async () => {
      await expect(name).toBeFocused()
      expect((await focusProbe(page)).bracketOpacity, 'the Name field summoned the bracket layer').toBe(0)
      await expectCurrentCards(page, 'Places new editor', ['Add place'])
      await expectReachableFooter(save, 'Places editor')
    }, { skins: true, short: save })
    await save.click()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toBeFocused()
    evidence.note('contract', 'Saving a nameless place is refused before any write: the Name field is marked invalid and takes focus.')

    const created = 'TASK-035 travel gym'
    const renamed = 'TASK-035 hotel gym'
    await name.fill(created)
    // No tier preset outside onboarding (U15): the place holds what is ticked.
    for (const item of ['Bodyweight', 'Resistance bands', 'Foam roller', 'Dumbbells', 'Kettlebells', 'Pull-up bar']) {
      await page.getByRole('checkbox', { name: item, exact: true }).check()
    }
    await save.click()
    await expect(save).toHaveCount(0)
    await card(created).getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(name).toHaveValue(created)
    await name.fill(renamed)
    await save.click()
    await expect(save).toHaveCount(0)
    await page.reload()
    await heading(page, title)
    await evidence.shot('Settings', at, 'edit-inline-save', at, title, async () => {
      await expect(card(renamed)).toBeVisible()
      await expect(card(created)).toHaveCount(0)
      await expectCurrentCards(page, 'Places after rename', [PLACE, renamed])
    }, { variant: 'after-reload' })
    const persisted = must<Array<{ id: string }>>(await actor.client.selectAsService('locations', {
      select: 'id', user_id: `eq.${actor.id}`, name: `eq.${renamed}` }), 'Rename persistence read')
    expect(persisted).toHaveLength(1)
    evidence.note('contract', 'Create then rename are real save_location writes: after a full reload the renamed place is listed and stored once.')

    await page.route('**/rest/v1/rpc/save_location', (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      return answer(route, 400, { code: '23514', message: 'location_not_viable', details: JSON.stringify({
        change: { kind: 'edit', location: PLACE, removed: ['dumbbells'], added: [] },
        failures: [{ section: 'primary_lift', failure_class: 'missing_equipment',
          incompatible_choice: { kind: 'equipment', equipment: ['bodyweight'] },
          goals: ['balanced'], focuses: ['lower_body'], blocks_proposed_goal: true }],
      }) })
    })
    await card(PLACE).getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(name).toHaveValue(PLACE)
    await page.getByRole('checkbox', { name: 'Dumbbells', exact: true }).uncheck()
    await save.click()
    await evidence.shot('Settings', at, 'typed-viability-refusal-rollback', at, title, async () => {
      await expect(page.getByRole('alert').filter({ hasText: 'Nothing was changed.' })).toBeVisible()
      await expect(name).toHaveValue(PLACE)
      await expect(card(PLACE).getByText('Default for generation')).toBeVisible()
      await expectReachableFooter(save, 'Places refusal')
    }, { skins: true, short: save })
    await page.unroute('**/rest/v1/rpc/save_location')
    await dismissToast(page)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: 15_000 })

    const defaultFault = await scopedFault(page, ownedRpc('set_default_location'))
    try {
      defaultFault.release()
      await card(renamed).getByRole('button', { name: 'Make default', exact: true }).click()
      await evidence.shot('Settings', at, 'default-change-rollback', at, title, async () => {
        await expect(card(PLACE).getByText('Default for generation')).toBeVisible()
        await expect(card(renamed).getByText('Default for generation')).toHaveCount(0)
      })
    } finally { await defaultFault.stop() }
    await dismissToast(page)
    await card(renamed).getByRole('button', { name: 'Make default', exact: true }).click()
    await expect(card(renamed).getByText('Default for generation')).toBeVisible()
    await card(renamed).getByRole('button', { name: 'Delete', exact: true }).click()
    await evidence.shot('Settings', at, 'default-delete-reassignment', at, title, async () => {
      await expect(card(renamed).getByRole('alert')).toHaveText(
        'Workouts are generated from this location. Make another one the default first.')
      await expect(page.getByRole('dialog', { name: 'Delete this place?' })).toHaveCount(0)
    }, { skins: true })
    await card(PLACE).getByRole('button', { name: 'Make default', exact: true }).click()
    await expect(card(PLACE).getByText('Default for generation')).toBeVisible()
    await card(renamed).getByRole('button', { name: 'Delete', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete this place?' })
    await evidence.shot('Settings', at, 'delete-confirmation', at, title, async () => {
      await expect(dialog).toBeVisible()
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), 'focus is outside the open dialog').toBe(true)
      await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
    }, { skins: true })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(card(renamed)).toBeVisible()
    evidence.note('keyboard', 'The delete confirmation is a native dialog: focus is held inside it while open and Escape dismisses it without deleting.')
    await card(renamed).getByRole('button', { name: 'Delete', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(card(renamed)).toHaveCount(0)
    // The list answers optimistically; reload only once the write has landed.
    await expect.poll(async () => (await actor.client.selectAsService('locations', {
      select: 'id', user_id: `eq.${actor.id}`, name: `eq.${renamed}` })).body,
    { message: 'the deleted place is still stored', timeout: 15_000 }).toEqual([])
    await page.reload()
    await heading(page, title)
    await evidence.shot('Settings', at, 'list-populated', at, title, async () => {
      await expect(card(renamed)).toHaveCount(0)
      await expect(card(PLACE).getByText('Default for generation')).toBeVisible()
    }, { variant: 'after-default-reassignment-and-delete-reload' })
    evidence.note('contract', 'The default cannot be deleted until another place is made default; a failed default change rolls back; the confirmed delete removes the stored row and survives reload.')

    await page.route(REST, async (route) => {
      if (ownedGet('locations', 'user_id', actor.id)(route)) return answer(route, 200, [])
      return route.fallback()
    })
    await page.reload()
    await evidence.shot('Settings', at, 'no-locations-empty', at, title, async () => {
      await visibleText(page, 'No places yet')
      await expectReachableFooter(add, 'Places empty')
    }, { skins: true, short: add })
    evidence.disposition('Settings', at, 'locations-loading',
      'The locations read is Boot-watched; BootGate withholds the route tree while it is pending.',
      ['src/state/boot-queries.ts', 'src/app/LocationSettings.test.tsx'])
    evidence.disposition('Settings', at, 'locations-error-retry',
      'A failed Boot-watched locations read is answered by Boot’s retry before this route mounts; the footer Retry branch is covered by the mounted component test.',
      ['src/state/boot-queries.ts', 'src/app/LocationSettings.test.tsx'])
    expect(evidence.modelAttempts()).toBe(0)
  } finally { await removeActors(cleanup) }
})
