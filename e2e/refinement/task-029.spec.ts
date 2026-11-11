import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { ASSET_BLOCKS, ASSET_EQUIPMENT_LABELS } from '../../src/dev/gallery-refinement-assets-data'
import { peerGroupingAcceptance } from '../../src/dev/gallery-refinement-cards-data'
import { EQUIPMENT } from '../../src/state/onboarding'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import { EQUIPMENT_ASSETS } from '../../src/ui/refinements/equipment-assets'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, notOnboardedProfile, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-029 (REQ-029; C56; R122, R132; AC-C56-01, AC-R029-01, AC-R029-02;
 * JOURNEY-029) — the equipment asset inventory and its readable fallback on
 * the real `/review`, `/workout` and Setup equipment surfaces. Accepted gallery
 * reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=assets`.
 *
 * Entry (ENTRY-029): equipment labels appear before any new equipment glyph
 * work is supplied. One composition names every Setup equipment id and the
 * Wall ball review's medicine ball; only `dumbbells` has a shipped glyph. It
 * reaches `/review` through the existing Review hand-off behind the auth
 * guard, then `/workout` through Start; a signed-in athlete without a setup
 * reaches `/onboarding`'s equipment step through the onboarding guard. Action:
 * read each movement's equipment and each Setup choice. Result, read from the
 * browser at phone widths: every equipment kind, glyph or none, is a visible,
 * untruncated, readable label beside its movement's name, never a glyph alone;
 * Review's Required equipment names each kind in words beside its one shipped
 * category glyph; Setup names its sixteen choices in words, with no medicine
 * ball. Recovery: a failed Start keeps every label; keyboard, touch and
 * reduced motion reach it all.
 *
 * "In each skin": the label's colour (`--text-secondary`) is resolved per skin,
 * so the Review → Workout reading, axe (colour contrast included) and Setup's
 * worded choices are proven in every skin — clear, vapour, signal and mono —
 * with every equipment label's paint measured at AA contrast against its
 * captured ground (axe leaves these labels undecided; see expectLabelContrast).
 *
 * Synthetic and contained: intercepted sessions for fictional users and
 * synthetic reads. The only writes the journey attempts are Start's session
 * calls, answered here and never forwarded; no set is logged, Setup commits
 * nothing, no model is called and no real account or row exists to mutate.
 */
const OWNER = '00000000-0000-4000-8000-000000002901'
const PLACE = '00000000-0000-4000-8000-000000002911'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')

function freePort() {
  return new Promise<number>((settle, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => settle(port))
    })
  })
}

/** Ready only when the server answering is this checkout's own. */
async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic TASK-029 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-029 origin ${origin} did not start`)
}

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = await freePort()
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(REPO_ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-task-029.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-029-public-placeholder',
        },
        stdio: 'ignore',
      })
      let exitCode: number | null = null
      server.once('exit', (code) => { exitCode = code ?? -1 })
      try {
        await waitForOrigin(origin, Date.now() + 90_000, () => exitCode)
        await use(origin)
      } finally {
        server.kill()
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ baseURL, syntheticOrigin }, use) => use(syntheticOrigin ?? baseURL),
})

test.describe.configure({ mode: 'default' })

type Viewport = { width: number; height: number }
/** The approved mobile scope: the narrow phone and the project's own phone. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
]

type Context = 'review' | 'workout'
const STRUCTURES = ['standard', 'superset', 'circuit'] as const
const LISTS: Record<Context, Record<(typeof STRUCTURES)[number], string>> = {
  review: { standard: 'Movements in this block', superset: 'superset, 3 rounds', circuit: 'circuit, 2 rounds' },
  workout: { standard: 'Movements in this block', superset: 'Movements in this superset', circuit: 'Movements in this circuit' },
}
const REQUIRED_EQUIPMENT = 'Required equipment'
/** Every shipped skin: the label colour is resolved per skin. */
const SKINS = ['clear', 'vapour', 'signal', 'mono'] as const
type Skin = (typeof SKINS)[number]
const SETUP_STEP = 'What’s your gym setup?'

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  /** Start's first write fails, so the session is never created. */
  startFails?: boolean
  /** A signed-in athlete who has not set up yet: the guard sends them to Setup. */
  setup?: boolean
  reducedMotion?: boolean
  /** The pinned skin; clear unless a case reads another. */
  skin?: Skin
  /**
   * Hold the boot check's profile read until `releaseBoot()`, so the boot
   * screen stays put while `visit` scans it and the hand-off to the routed
   * screen (and the onboarding guard's redirect) never happens mid-scan.
   */
  holdBoot?: boolean
}

/** The reads the boot check and the guards make, answered here. */
const READ_RPCS = new Set(['resume_session', 'streak_sessions', 'constraints_in_force', 'anchor_evidence',
  'conditioning_history', 'generation_refusal_diagnostics'])

async function syntheticApp(page: Page, acceptance: SessionAcceptance | null, options: AppOptions = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = acceptance === null ? null : sessionSnapshotSchema.parse(peerGroupingSnapshot(acceptance, { userId: OWNER }))
  const running: SessionSnapshot | null = acceptance === null
    ? null
    : sessionSnapshotSchema.parse(peerGroupingSnapshot(acceptance, { userId: OWNER, startedAt }))
  const exercises = (running?.sections ?? []).flatMap((section) => section.blocks)
    .flatMap((block) => block.exercises.map(({ exercise }) => exercise))
  const writes: string[] = []
  const unexpected: string[] = []
  let started = false
  let releaseBoot = () => {}
  const bootHeld = options.holdBoot === true
    ? new Promise<void>((done) => { releaseBoot = done })
    : Promise.resolve()
  const guard = await installDeterministicCapture(page, { skin: options.skin ?? 'clear', reducedMotion: options.reducedMotion ?? true })

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') {
        await bootHeld
        return reply([options.setup === true ? notOnboardedProfile({ id: OWNER }) : onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      }
      if (name === 'locations') {
        return reply(options.setup === true ? [] : [fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      }
      if (name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(exercises.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (name === 'workout_exercises') return reply(exercises)
      // Every other read is an empty answer: no history, anchors or favorites.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(started ? running : null)
      if (name === 'session_snapshot') return reply(started ? running : prescribed)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'persist_session' && acceptance !== null) {
        writes.push(name)
        expect(request.postDataJSON()).toMatchObject({ p_user_id: OWNER, p_session: { workout: { title: acceptance.workout.title } } })
        if (options.startFails === true) return reply({ code: 'PGRST000', message: 'Synthetic write failure.' }, 503)
        return reply(prescribed)
      }
      if (name === 'start_session' && running !== null) {
        writes.push(name)
        started = true
        return reply({ outcome: 'started', state: 'active', session: running.session })
      }
      if (name === 'generation_candidate_sets_for_goal' || name === 'generation_candidate_sets') return reply([])
      if (READ_RPCS.has(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-029 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-029-session', refreshToken: 'synthetic-task-029-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-029@example.invalid' },
    }))
    if (location.pathname === '/review' && handoff !== null) {
      history.replaceState({ usr: handoff, key: 'synthetic-task-029', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: acceptance === null ? null : reviewHandoff(acceptance) })

  return {
    writes: () => [...writes],
    releaseBoot: () => releaseBoot(),
    assertContained(expectedWrites: readonly string[] = []) {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Only Start’s session calls are attempted; no set is logged and Setup commits nothing').toEqual(expectedWrites)
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
  // A screen entering is read once its finite transitions have finished.
  await page.waitForFunction(() => {
    const main = document.querySelector('main')
    return main === null || main.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .every((animation) => animation.playState !== 'running')
  })
}

/** The applied skin is the requested one and its colour transitions have finished. */
async function settledSkin(page: Page, skin: Skin) {
  await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
  await page.evaluate(async () => {
    await Promise.race([
      Promise.all(document.getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined))),
      new Promise((done) => setTimeout(done, 1_000)),
    ])
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
}

/**
 * Setup's entry, read only once it has settled. `visit('/')` scans the boot
 * check while its profile read is held, so the scan never races the boot
 * hand-off and the onboarding guard's redirect (a scan that straddled them
 * found the skip link's `#main` momentarily gone). Released, the guard sends
 * the athlete to `/onboarding`; the Setup step heading, its transitions and
 * the skin settle before the full scan of the settled Setup screen.
 */
async function enterSetup(page: Page, visit: (path: string) => Promise<void>,
  checkA11y: () => Promise<void>, app: { releaseBoot: () => void }, skin: Skin) {
  await visit('/')
  // What was scanned is the boot check itself, still checking at '/'.
  await expect(page).toHaveURL((url) => url.pathname === '/')
  await expect(page.getByRole('heading', { level: 1, name: 'CLEAR', exact: true })).toBeVisible()
  app.releaseBoot()
  await expect(page).toHaveURL((url) => url.pathname === '/onboarding')
  await expect(page.getByRole('heading', { level: 1, name: 'Set up CLEAR' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: SETUP_STEP })).toBeVisible()
  await settle(page)
  await settledSkin(page, skin)
  await checkA11y()
}

/** WCAG contrast between two sRGB colours. */
function contrast(a: readonly number[], b: readonly number[]) {
  const luminance = (rgb: readonly number[]) => {
    const [r, g, b] = rgb.map((channel) => {
      const c = channel / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG 1.4.3 AA for text below the large-text size. */
const TEXT_CONTRAST = 4.5

/**
 * JOURNEY-029 "in each skin": every movement's equipment label paints the
 * skin's own `--text-secondary` and reads at AA text contrast against what is
 * actually painted behind it.
 *
 * axe's colour-contrast rule cannot decide these labels: text clipped out of
 * the scroll region is "not on screen", and on screen the card's decorative
 * pseudo element leaves the ground undetermined ("incomplete"). So each label
 * is brought to the middle of the view, its own paint is made transparent for
 * one capture of the ground beneath its box, and its computed colour,
 * composited over every captured pixel, is measured; the weakest pixel decides.
 */
async function expectLabelContrast(page: Page, skin: Skin, label: string) {
  const labels = page.locator('[data-movement-context]')
  const count = await labels.count()
  expect(count, `${label}: labels to read`).toBeGreaterThan(0)
  const readings: Array<{ text: string; colour: string; expected: string; minimum: number; median: number }> = []
  for (let index = 0; index < count; index += 1) {
    const node = labels.nth(index)
    const { text, colour, expected, clip, topmost } = await node.evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'nearest' })
      const probe = document.createElement('span')
      probe.style.color = 'var(--text-secondary)'
      element.parentElement!.append(probe)
      const resolved = getComputedStyle(probe).color
      probe.remove()
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return {
        text: element.textContent ?? '',
        colour: getComputedStyle(element).color,
        expected: resolved,
        clip: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        topmost: hit !== null && element.contains(hit),
      }
    })
    const at = `${label}: ${text}`
    expect(colour, `${at} paints the ${skin} skin's --text-secondary`).toBe(expected)
    expect(topmost, `${at} is not covered where it is read`).toBe(true)
    // Without a transition, so neither the capture nor the restore is mid-fade.
    await node.evaluate((element) => {
      const style = (element as HTMLElement).style
      style.setProperty('transition', 'none', 'important')
      style.setProperty('color', 'transparent', 'important')
      void getComputedStyle(element).color
    })
    const ground = await page.screenshot({ clip, caret: 'hide', animations: 'disabled', scale: 'css' })
    await node.evaluate((element) => {
      const style = (element as HTMLElement).style
      style.removeProperty('color')
      void getComputedStyle(element).color
      style.removeProperty('transition')
    })
    expect(await node.evaluate((element) => getComputedStyle(element).color), `${at} paint restored`).toBe(colour)
    const pixels = await page.evaluate(async ({ png, paint }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      context.drawImage(image, 0, 0)
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      // The label's paint (any CSS colour form, alpha included) over each ground pixel.
      const swatch = document.createElement('canvas')
      swatch.width = swatch.height = 1
      const blend = swatch.getContext('2d', { willReadFrequently: true })!
      const seen = new Map<string, [number[], number[]]>()
      for (let offset = 0; offset < data.length; offset += 4) {
        const ground = [data[offset], data[offset + 1], data[offset + 2]]
        const key = ground.join(',')
        if (seen.has(key)) continue
        blend.fillStyle = `rgb(${key})`
        blend.fillRect(0, 0, 1, 1)
        blend.fillStyle = paint
        blend.fillRect(0, 0, 1, 1)
        seen.set(key, [ground, [...blend.getImageData(0, 0, 1, 1).data.slice(0, 3)]])
      }
      return [...seen.values()]
    }, { png: ground.toString('base64'), paint: colour })
    const ratios = pixels.map(([back, fore]) => contrast(fore, back)).sort((a, b) => a - b)
    expect(ratios.length, `${at}: ground captured`).toBeGreaterThan(0)
    readings.push({ text, colour, expected, minimum: ratios[0], median: ratios[Math.floor(ratios.length / 2)] })
  }
  await test.info().attach(`equipment-contrast-${label.replace(/\W+/g, '-')}.json`, {
    body: JSON.stringify({ skin, threshold: TEXT_CONTRAST, readings }, null, 2),
    contentType: 'application/json',
  })
  for (const { text, minimum } of readings) {
    expect(minimum, `${label}: ${text} reads at AA contrast in ${skin}`).toBeGreaterThanOrEqual(TEXT_CONTRAST)
  }
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

/** Delivered-revision visual evidence: the full scrolling content, attached to the case. */
async function attachCapture(page: Page, name: string, target?: Locator | Page) {
  const scroller = target ?? page.locator('main .clr-scroll-region__scroller').first()
  const body = await scroller.screenshot({ caret: 'hide' }).catch(() => page.screenshot({ caret: 'hide' }))
  await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the equipment
// ─────────────────────────────────────────────────────────────────────────────

type Box = { left: number; right: number; top: number; bottom: number }

interface EquipmentReading {
  name: string
  equipment: string
  visible: boolean
  glyphs: number
  truncated: boolean
  insideName: boolean
  font: number
  nameFont: number
  box: Box
  column: Box
  nameLastLine: Box
  lines: number
  overflow: boolean
}

/** Every movement's equipment in a list, read in the browser. */
async function readEquipment(scope: Locator): Promise<EquipmentReading[]> {
  return scope.evaluate((root) => {
    const box = (rect: DOMRect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })
    const lineRects = (node: Element) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      return [...range.getClientRects()].filter((rect) => rect.width > 0)
    }
    return [...root.querySelectorAll('[data-movement-identity]')].map((identity) => {
      const column = identity.querySelector(':scope > [data-movement-name-row] > .clr-movement-identity__title')!
      const name = column.querySelector(':scope > .clr-movement-identity__name')!
      const words = name.querySelector('[data-movement-name]')!
      const equipment = column.querySelector(':scope > [data-movement-context]')
      if (equipment === null) throw new Error(`No equipment beside ${words.textContent}`)
      const style = getComputedStyle(equipment)
      return {
        name: words.textContent ?? '',
        equipment: equipment.textContent ?? '',
        visible: style.visibility === 'visible' && Number(style.opacity) > 0 && style.display !== 'none',
        glyphs: equipment.querySelectorAll('svg, img, [role="img"]').length,
        truncated: equipment.scrollWidth > equipment.clientWidth + 1 || style.textOverflow === 'ellipsis',
        insideName: name.contains(equipment),
        font: parseFloat(style.fontSize),
        nameFont: parseFloat(getComputedStyle(name).fontSize),
        box: box(equipment.getBoundingClientRect()),
        column: box(column.getBoundingClientRect()),
        nameLastLine: box(lineRects(words).at(-1)!),
        lines: new Set(lineRects(equipment).map((rect) => Math.round(rect.top))).size,
        overflow: column.scrollWidth > column.clientWidth + 1 || identity.scrollWidth > identity.clientWidth + 1,
      }
    })
  })
}

const TOLERANCE = 1

/**
 * AC-R029-02, R132: the readable label beside the name — on the name's last
 * line, or moved as one unit to the next line inside the name column — visible,
 * untruncated, readable and never a glyph alone, whether or not its kind has a
 * shipped glyph.
 */
function expectReadableLabel(reading: EquipmentReading, label: string) {
  const at = `${label}: ${reading.name} · ${reading.equipment}`
  expect(reading.equipment.trim().length, `${at}: a word, not an empty slot`).toBeGreaterThan(0)
  expect(reading.visible, `${at}: visible`).toBe(true)
  expect(reading.glyphs, `${at}: text, never a glyph alone`).toBe(0)
  expect(reading.truncated, `${at}: not truncated`).toBe(false)
  expect(reading.insideName, `${at}: beside the name, not inside it`).toBe(false)
  expect(reading.font, `${at}: readable size`).toBeGreaterThanOrEqual(12)
  expect(reading.font, `${at}: quieter than the name`).toBeLessThan(reading.nameFont)
  expect(reading.lines, `${at}: wraps as one unit`).toBe(1)
  const { box, nameLastLine: line, column } = reading
  const besideOnLine = box.left >= line.right - TOLERANCE && box.top < line.bottom && box.bottom > line.top
  const wrappedAsUnit = Math.abs(box.left - column.left) <= TOLERANCE && box.top >= line.bottom - TOLERANCE
  expect(besideOnLine || wrappedAsUnit, `${at}: beside the name, or wrapped as one unit under it`).toBe(true)
  expect(box.right, `${at}: inside the name column`).toBeLessThanOrEqual(column.right + TOLERANCE)
  expect(reading.overflow, `${at}: nothing overflows`).toBe(false)
}

/** Every structure's labels in one context, read and checked. */
async function expectEveryLabel(page: Page, context: Context, label: string) {
  const labels: string[][] = []
  for (const structure of STRUCTURES) {
    const list = page.getByRole('list', { name: LISTS[context][structure], exact: true })
    await expect(list).toBeVisible()
    const readings = await readEquipment(list)
    for (const reading of readings) expectReadableLabel(reading, `${label} ${structure}`)
    labels.push(readings.map((reading) => reading.equipment))
  }
  expect(labels, `${label}: every kind, in order`).toEqual(ASSET_EQUIPMENT_LABELS)
}

/** Review's Required equipment: the label and its one category glyph, then every kind in words. */
async function expectRequiredEquipment(page: Page, label: string) {
  const summary = page.locator('[data-equipment-summary]')
  await expect(summary).toBeVisible()
  await expect(summary.locator('.clr-equipment-summary__label')).toHaveText(REQUIRED_EQUIPMENT)
  await expect(summary.locator('svg'), `${label}: one category glyph, beside its label`).toHaveCount(1)
  await expect(summary.locator('.clr-equipment-summary__label [aria-hidden="true"] svg')).toHaveCount(1)
  const names = summary.getByRole('list', { name: REQUIRED_EQUIPMENT })
  const expected = ASSET_EQUIPMENT_LABELS.flat().filter((name) => name !== 'bodyweight')
  await expect(names.getByRole('listitem')).toHaveCount(expected.length)
  const items = await names.getByRole('listitem').evaluateAll((nodes) => nodes.map((node) => ({
    text: node.textContent ?? '',
    glyphs: node.querySelectorAll('svg, img').length,
    visible: node.getBoundingClientRect().width > 0,
    truncated: node.scrollWidth > node.clientWidth + 1,
  })))
  expect(items.map((item) => item.text)).toEqual(expected)
  for (const item of items) {
    expect(item.glyphs, `${label}: ${item.text} in words`).toBe(0)
    expect(item.visible && !item.truncated, `${label}: ${item.text} readable`).toBe(true)
  }
}

async function openReview(page: Page, visit: (path: string) => Promise<void>, acceptance: SessionAcceptance) {
  await visit('/review')
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
  await settle(page)
}

async function startWorkout(page: Page) {
  await page.getByRole('button', { name: 'Start workout' }).tap()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByRole('list', { name: LISTS.workout.superset, exact: true })).toBeVisible()
  await settle(page)
}

const assetAcceptance = () => peerGroupingAcceptance({ locationId: PLACE, blocks: ASSET_BLOCKS })

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-029 equipment asset inventory and readable fallback', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-029 ${name}: every equipment kind reads as a label beside its name in Review and Workout, glyph or none, and Review’s Required equipment names each in words`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page, assetAcceptance())
      await openReview(page, visit, assetAcceptance())

      await expectRequiredEquipment(page, `Review @${name}`)
      await expectEveryLabel(page, 'review', `Review @${name}`)
      await noHorizontalOverflow(page)
      await attachCapture(page, `review-${name}`)
      await checkA11y()

      await startWorkout(page)
      await expectEveryLabel(page, 'workout', `Workout @${name}`)
      // The live heading names the movement alone; its equipment is beside it.
      await expect(page.getByRole('heading', { name: 'dumbbell bench press', exact: true })).toBeVisible()
      await noHorizontalOverflow(page)
      await attachCapture(page, `workout-${name}`)
      await checkA11y()
      app.assertContained(['persist_session', 'start_session'])
    })
  }

  test('AC-R029-01 Setup equipment phone-320: the sixteen Setup choices are named in words, none is a medicine ball, and touch and keyboard answer them', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, null, { setup: true, holdBoot: true })
    await enterSetup(page, visit, checkA11y, app, 'clear')
    const main = page.locator('main')
    await main.getByRole('radio', { name: /^Home gym/ }).tap()
    const group = main.getByRole('group', { name: 'Equipment' })
    await expect(group.getByRole('checkbox')).toHaveCount(EQUIPMENT.length)
    expect(EQUIPMENT_ASSETS.map(({ label }) => label)).toEqual(EQUIPMENT.map(({ label }) => label))

    for (const { label } of EQUIPMENT) {
      const choice = group.getByRole('checkbox', { name: label, exact: true })
      await expect(choice).toHaveCount(1)
      const text = group.getByText(label, { exact: true })
      await text.scrollIntoViewIfNeeded()
      await expect(text, `${label} is a visible word`).toBeVisible()
      const font = await text.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
      expect(font, `${label} readable`).toBeGreaterThanOrEqual(12)
    }
    await expect(group.getByRole('checkbox', { name: /medicine/i })).toHaveCount(0)
    await expect(group).not.toContainText(/medicine/i)
    await checkA11y()

    // Touch answers a choice over its labelled row (the input lies over the
    // row, U09); keyboard answers another.
    const barbell = group.getByRole('checkbox', { name: 'Barbell', exact: true })
    await expect(barbell).not.toBeChecked()
    await barbell.tap()
    await expect(barbell).toBeChecked()
    const ropes = group.getByRole('checkbox', { name: 'Battle ropes', exact: true })
    await ropes.focus()
    await page.keyboard.press('Space')
    await expect(ropes).toBeChecked()
    await noHorizontalOverflow(page)
    await attachCapture(page, 'setup-equipment-phone-320')
    await checkA11y()
    app.assertContained()
  })

  for (const skin of SKINS) {
    test(`JOURNEY-029 skin ${skin} phone-320: every equipment kind reads as a label beside its name in Review and Workout in the ${skin} skin, with each label's contrast passing and Required equipment in words`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width: 320, height: 568 })
      const app = await syntheticApp(page, assetAcceptance(), { skin })
      await openReview(page, visit, assetAcceptance())
      await settledSkin(page, skin)

      await expectRequiredEquipment(page, `Review ${skin}`)
      await expectEveryLabel(page, 'review', `Review ${skin}`)
      await expectLabelContrast(page, skin, `Review ${skin}`)
      await noHorizontalOverflow(page)
      await attachCapture(page, `review-${skin}-phone-320`)
      await checkA11y()

      await startWorkout(page)
      await settledSkin(page, skin)
      await expectEveryLabel(page, 'workout', `Workout ${skin}`)
      await expectLabelContrast(page, skin, `Workout ${skin}`)
      await noHorizontalOverflow(page)
      await attachCapture(page, `workout-${skin}-phone-320`)
      await checkA11y()
      app.assertContained(['persist_session', 'start_session'])
    })

    test(`AC-R029-01 Setup equipment skin ${skin} phone-320: the sixteen Setup choices are visible words in the ${skin} skin and none is a medicine ball`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width: 320, height: 568 })
      const app = await syntheticApp(page, null, { setup: true, holdBoot: true, skin })
      await enterSetup(page, visit, checkA11y, app, skin)
      const main = page.locator('main')
      await main.getByRole('radio', { name: /^Home gym/ }).tap()
      const group = main.getByRole('group', { name: 'Equipment' })
      await expect(group.getByRole('checkbox')).toHaveCount(EQUIPMENT.length)
      for (const { label } of EQUIPMENT) {
        await expect(group.getByRole('checkbox', { name: label, exact: true })).toHaveCount(1)
        const text = group.getByText(label, { exact: true })
        await text.scrollIntoViewIfNeeded()
        await expect(text, `${label} is a visible word in ${skin}`).toBeVisible()
        const font = await text.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
        expect(font, `${label} readable in ${skin}`).toBeGreaterThanOrEqual(12)
      }
      await expect(group).not.toContainText(/medicine/i)
      await noHorizontalOverflow(page)
      await attachCapture(page, `setup-equipment-${skin}-phone-320`)
      await checkA11y()
      app.assertContained()
    })
  }

  test('JOURNEY-029 recovery phone-320: a failed Start and its keyboard retry keep every equipment label and Required equipment as they were, record no work, and Start stays reachable', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, assetAcceptance(), { startFails: true, reducedMotion: true })
    await openReview(page, visit, assetAcceptance())
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    const before = await Promise.all(STRUCTURES.map(async (structure) =>
      (await readEquipment(page.getByRole('list', { name: LISTS.review[structure], exact: true }))).map((reading) => reading.equipment)))
    await page.locator('footer').getByRole('button', { name: 'Start workout' }).tap()
    const failure = page.getByRole('dialog', { name: 'Couldn’t start this workout' })
    await expect(failure).toBeVisible()
    await expect(page).toHaveURL(/\/review$/)
    // Retry by keyboard: the same draft is sent again, and fails again.
    const retry = failure.getByRole('button', { name: 'Start workout' })
    await retry.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => app.writes()).toEqual(['persist_session', 'persist_session'])
    await expect(failure).toBeVisible()
    await attachCapture(page, 'review-failed-start-dialog-phone-320', page)
    // Dismissing returns to the same Review: every label and Required equipment as before.
    await page.keyboard.press('Escape')
    await expect(failure).toBeHidden()
    await settle(page)
    await expectRequiredEquipment(page, 'after a failed Start')
    await expectEveryLabel(page, 'review', 'after a failed Start')
    const after = await Promise.all(STRUCTURES.map(async (structure) =>
      (await readEquipment(page.getByRole('list', { name: LISTS.review[structure], exact: true }))).map((reading) => reading.equipment)))
    expect(after).toEqual(before)
    // Start stays reachable by keyboard.
    const start = page.locator('footer').getByRole('button', { name: 'Start workout' })
    await start.focus()
    await expect(start).toBeFocused()
    await attachCapture(page, 'review-after-failed-start-phone-320')
    app.assertContained(['persist_session', 'persist_session'])
  })

  test('gallery assets phone-320: the accepted state draws the shared inventory, then the routes’ own Review, Workout and Setup equipment as readable labels, with nothing read or written', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    await visit('/gallery/refinements?state=assets')
    const state = page.locator('[data-refinement-state="assets"]')
    await expect(state).toBeVisible()
    await settle(page)

    const inventory = state.getByRole('list', { name: 'Setup equipment glyph status' })
    await expect(inventory.getByRole('listitem')).toHaveCount(EQUIPMENT.length)
    expect(await inventory.getByRole('listitem').evaluateAll((items) => items.map((item) => [
      (item as HTMLElement).dataset.equipmentAsset, (item as HTMLElement).dataset.equipmentStatus,
    ]))).toEqual(EQUIPMENT_ASSETS.map(({ id, status }) => [id, status]))
    await expect(state.getByRole('list', { name: 'Shipped equipment glyphs' }).locator('svg')).toHaveCount(2)
    await expect(state.locator('[data-equipment-wanted="medicine-ball"]')).toContainText('not a current Setup equipment ID')
    await attachCapture(page, 'gallery-assets-inventory-phone-320', state.locator('[data-equipment-inventory]'))

    for (const context of ['review', 'workout'] as const) {
      if (context === 'workout') {
        await state.getByRole('radio', { name: 'Workout' }).tap()
        await settle(page)
      }
      const scope = state.locator(`[data-gallery-context="${context}"]`)
      const readings = await readEquipment(scope)
      expect(readings.map((reading) => reading.equipment)).toEqual(ASSET_EQUIPMENT_LABELS.flat())
      for (const reading of readings) expectReadableLabel(reading, `Gallery ${context}`)
    }
    const setup = state.locator('[data-gallery-setup-equipment]')
    await expect(setup.getByRole('checkbox')).toHaveCount(EQUIPMENT.length)
    for (const { label } of EQUIPMENT) await expect(setup.getByRole('checkbox', { name: label, exact: true })).toHaveCount(1)
    await noHorizontalOverflow(page)
    await expect(page).toHaveURL(/\/gallery\/refinements\?state=assets$/)
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
