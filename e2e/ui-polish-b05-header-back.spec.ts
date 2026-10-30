import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { sessionSnapshotSchema } from '../src/state/schemas'
import { makeSessionRow } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../src/test/workout-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — TASK-005 / REQ-007 / JOURNEY-004. Every equivalent
 * header Back action (Generate, Settings, History, session detail, locations
 * and format preview) renders as the shared framed icon-only `IconButton`, the
 * housing Home's Settings control already uses (B05-02.2, B05-08.1), keeps its
 * accessible name, and still leads where it led before — with and without an
 * in-app screen behind it.
 *
 * Each consumer is rendered on its production route at a phone viewport. The
 * Back control is compared, in pixels decoded from the actual capture, with
 * Home's established framed control at the same viewport and skin. Unrelated
 * text actions, Cancel, the destructive confirmation and the logging sheet's
 * collapse control are checked unchanged. Data is synthetic and intercepted;
 * nothing is written and no model is called. None of this is an installed-
 * iPhone result.
 */
const OWNER = '00000000-0000-4000-8000-000000000007'
const AUTH_KEY = 'clear.auth.session'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const LOCATION_ID = '00000000-0000-4000-8000-000000000071'
const SECOND_LOCATION_ID = '00000000-0000-4000-8000-000000000072'
const PHONE = { width: 390, height: 844 }

const HISTORY = Array.from({ length: 3 }, (_, index) => {
  const day = new Date()
  day.setUTCDate(day.getUTCDate() - index - 1)
  const date = day.toISOString().slice(0, 10)
  return makeSessionRow({
    id: `00000000-0000-4000-8000-${String(80 + index).padStart(12, '0')}`, user_id: OWNER, location_id: LOCATION_ID, date,
    title: `Synthetic back history ${index + 1}`, goal_preset: 'strength',
    started_at: `${date}T12:00:00.000Z`, completed_at: `${date}T12:30:00.000Z`,
    created_at: `${date}T12:00:00.000Z`, updated_at: `${date}T12:30:00.000Z`,
  })
})
const DETAIL_PATH = `/history/${HISTORY[0]!.id}`

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic B05 back workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: LOCATION_ID, goal_preset: 'strength' },
  sections: [
    { title: 'Strength', sectionType: 'primary_lift', blocks: [{ exercises: [{ prescription: {
      exercise_id: 'back-squat', sets: 3, target_value: 5, rest_seconds: 90,
    } }] }] },
  ],
}))
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))

/** Required reviewed references: readable file, SHA-256 and selected region. */
const REFERENCE_DIR = resolve(import.meta.dirname, '..', '..', '.evidence',
  basename(resolve(import.meta.dirname, '..')), 'sources')
const REFERENCE_FILES = {
  'B05-02': { file: 'sources/source-05-B05-02-generate.jpg', region: '02.2 header Back, top right ("<- HOME" arrow plus text, to become the framed icon housing)' },
  'B05-08': { file: 'sources/source-11-B05-08-settings.jpg', region: '08.1 header Back, top right ("<- BACK" arrow plus text, "an icon in a container")' },
} as const
type ReferenceId = keyof typeof REFERENCE_FILES
function reference(id: ReferenceId) {
  const entry = REFERENCE_FILES[id]
  const path = resolve(REFERENCE_DIR, basename(entry.file))
  // Reading is mandatory: missing or unreadable approved evidence fails the
  // proof instead of allowing a successful capture with a null reference hash.
  const bytes = readFileSync(path)
  return { id, ...entry, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function sourceIdentity() {
  try {
    return {
      head: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
      dirty: execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== '',
    }
  } catch {
    return { head: process.env.GITHUB_SHA ?? 'unknown', dirty: null }
  }
}

/** As the shell spec does: serve a bundle with non-secret placeholders when no public URL is configured. */
const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)

async function waitForOrigin(origin: string, deadline: number) {
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic back origin ${origin} did not start`)
}

const PAGE_ORIGINS = new WeakMap<Page, string>()
const isLoopback = (hostname: string) => hostname === 'localhost' || hostname.endsWith('.localhost') ||
  /^127(?:\.\d{1,3}){3}$/.test(hostname) || hostname === '[::1]'

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5490 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-back.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-back-public-placeholder',
        },
        stdio: 'ignore',
      })
      const closed = new Promise<void>((settle) => {
        server.once('exit', () => settle())
        server.once('error', () => settle())
      })
      try {
        await waitForOrigin(origin, Date.now() + 90_000)
        await use(origin)
      } finally {
        server.kill()
        await closed
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  baseURL: async ({ baseURL, syntheticOrigin }, use) => use(syntheticOrigin ?? baseURL),
})

async function syntheticApp(page: Page, mode: { activeWorkout?: boolean } = {}) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  const blockedOutbound: string[] = []
  const origin = PAGE_ORIGINS.get(page)
  if (origin === undefined) throw new Error('Synthetic Back proof requires its verified local origin')
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: false })
  // Registered first: named API mocks below take precedence. Everything else
  // must be a read from this exact local Vite origin, never another service.
  await page.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue()
    blockedOutbound.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
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
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') {
        return reply([
          fixtureLocation({ id: LOCATION_ID, user_id: OWNER, tier: 'full', name: 'Synthetic gym', is_default: true }),
          fixtureLocation({ id: SECOND_LOCATION_ID, user_id: OWNER, tier: 'minimal', name: 'Synthetic flat', is_default: false }),
        ])
      }
      if (mode.activeWorkout && name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(WORKOUT_EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (mode.activeWorkout && name === 'workout_exercises') return reply(WORKOUT_EXERCISES)
      if (name === 'workout_sessions') return reply(HISTORY)
      if (['load_anchors', 'location_equipment', 'saved_workout_attempts', 'saved_workouts', 'rest_days'].includes(name)) {
        return reply([])
      }
      unexpected.push(`GET ${url.pathname}`)
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(mode.activeWorkout ? WORKOUT : null)
      if (mode.activeWorkout && name === 'session_snapshot') return reply(WORKOUT)
      // Session-detail reads answer as a failed read: the header and its Back
      // are under test, and no reconstructed session is invented.
      if (['session_snapshot', 'session_as_generated', 'session_as_intended_at_start', 'session_as_performed'].includes(name)) {
        return reply({ code: 'PGRST000', message: 'Synthetic session-detail read failure.' }, 503)
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic Back request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-b05-back-session', refreshToken: 'synthetic-b05-back-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-back@example.invalid' },
    }))
  }, { authKey: AUTH_KEY, owner: OWNER })
  return {
    assertNoWrites() {
      expect(attemptedWrites, unexpected.join(', ')).toBe(0)
      expect(unexpected, 'Every API request must have an explicit synthetic read disposition').toEqual([])
      expect(blockedOutbound, 'No request may leave the exact local read origin/API mocks').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

const SCREEN_HEADER = 'main#main > .clr-scroll-region > .clr-scroll-region__head > header'
const headerControl = (page: Page, name: string) =>
  page.locator(SCREEN_HEADER).getByRole('button', { name, exact: true })

/** Router history position: `idx` is react-router's own index for this entry. */
const historyIndex = (page: Page) => page.evaluate(() => (window.history.state as { idx?: number } | null)?.idx ?? null)
const pathname = (page: Page) => new URL(page.url()).pathname

/**
 * What the control is in the DOM: its housing classes, name, visible text and
 * box. Measured once the route transition has finished and the box is still,
 * so the box is where the capture draws the control.
 */
async function housing(control: Locator) {
  // Finite animations only: the atmosphere's ambient loops never finish.
  await control.page().waitForFunction(() => document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
    .every((animation) => animation.playState !== 'running'))
  await expect.poll(() => control.evaluate((button) => new Promise<boolean>((settle) => {
    const before = button.getBoundingClientRect().x
    requestAnimationFrame(() => requestAnimationFrame(() => settle(button.getBoundingClientRect().x === before)))
  }))).toBe(true)
  return control.evaluate((button) => {
    const rect = (node: Element) => {
      const r = node.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    const style = getComputedStyle(button)
    // The package draws the frame on the bleed wrapper around the clipped button.
    const wrapper = button.parentElement!
    return {
      classes: [...button.classList].sort(),
      label: button.getAttribute('aria-label'),
      text: (button.textContent ?? '').trim(),
      icons: button.querySelectorAll('svg').length,
      box: rect(button),
      frameBox: rect(wrapper),
      minWidth: style.minWidth,
      wrapper: wrapper.className,
    }
  })
}
type Housing = Awaited<ReturnType<typeof housing>>

type Box = { x: number; y: number; width: number; height: number }
/**
 * Luminance of the frame and its surroundings from an actual PNG capture,
 * decoded by the browser's own canvas: the brightest of the outer 3px of the
 * framed box (its drawn frame), the band 5–6px outside it (the header it sits
 * on), the interior with the icon, and the brightest interior pixel (the glyph).
 * Corners are skipped: the chamfer cuts one of them.
 */
async function framePixels(page: Page, png: Buffer, box: Box) {
  return page.evaluate(async ({ data, box }) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const rgb = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data].slice(0, 3)
    const lum = (x: number, y: number) => {
      const [r, g, b] = rgb(x, y)
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    const x0 = Math.round(box.x)
    const y0 = Math.round(box.y)
    const x1 = Math.round(box.x + box.width) - 1
    const y1 = Math.round(box.y + box.height) - 1
    const mean = (points: Array<[number, number]>) =>
      points.reduce((sum, [x, y]) => sum + lum(x, y), 0) / points.length
    const side = (inset: number) => {
      const top: Array<[number, number]> = []
      const left: Array<[number, number]> = []
      for (let x = x0 + 10; x <= x1 - 10; x += 1) top.push([x, y0 + inset])
      for (let y = y0 + 10; y <= y1 - 10; y += 1) left.push([x0 + inset, y])
      return { top: mean(top), left: mean(left) }
    }
    const frame = [0, 1, 2].map(side)
    const outside = [-6, -5].map(side)
    const interior: Array<[number, number]> = []
    let glyph = 0
    for (let y = y0 + 8; y <= y1 - 8; y += 1) {
      for (let x = x0 + 8; x <= x1 - 8; x += 1) {
        interior.push([x, y])
        glyph = Math.max(glyph, lum(x, y))
      }
    }
    // The frame's colour, as chromaticity: the brightest top band's mean RGB
    // over its sum, so a glow that brightens a frame leaves its hue comparable.
    const brightest = [0, 1, 2][frame.findIndex((band) => band.top === Math.max(...frame.map((b) => b.top)))]!
    const sums = [0, 0, 0]
    let count = 0
    for (let x = x0 + 10; x <= x1 - 10; x += 1) {
      rgb(x, y0 + brightest).forEach((value, channel) => { sums[channel]! += value })
      count += 1
    }
    const meanRgb = sums.map((sum) => sum / count)
    const total = meanRgb.reduce((a, b) => a + b, 0) || 1
    return {
      frameRgb: meanRgb.map((value) => Math.round(value)),
      frameChroma: meanRgb.map((value) => value / total),
      frameTop: Math.max(...frame.map((band) => band.top)),
      frameLeft: Math.max(...frame.map((band) => band.left)),
      outsideTop: Math.min(...outside.map((band) => band.top)),
      outsideLeft: Math.min(...outside.map((band) => band.left)),
      interior: mean(interior),
      glyph,
    }
  }, { data: png.toString('base64'), box })
}
type FramePixels = Awaited<ReturnType<typeof framePixels>>

/** One capture plus its record, written beside the test output and attached. */
async function capture(page: Page, testInfo: TestInfo, id: string, record: Record<string, unknown>) {
  await page.evaluate(() => document.fonts.ready)
  const png = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' })
  const viewport = page.viewportSize()!
  const pixels = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), scale: 'css' as const }
  expect(pixels.width).toBe(viewport.width)
  expect(pixels.height).toBe(viewport.height)
  const sha256 = createHash('sha256').update(png).digest('hex')
  writeFileSync(testInfo.outputPath(`${id}.png`), png)
  const entry = { id, sha256, viewport, pixels, source: sourceIdentity(), path: page.url(), ...record }
  writeFileSync(testInfo.outputPath(`${id}.json`), JSON.stringify(entry, null, 2))
  await testInfo.attach(`${id}.png`, { body: png, contentType: 'image/png' })
  await testInfo.attach(`${id}.json`, { body: JSON.stringify(entry, null, 2), contentType: 'application/json' })
  return png
}

/** Home's Settings control: the established framed icon-only housing B05-02.2 points to. */
async function establishedHousing(page: Page, visit: (path: string) => Promise<void>, testInfo: TestInfo) {
  await visit('/')
  const control = headerControl(page, 'Settings')
  await expect(control).toBeVisible()
  const dom = await housing(control)
  const png = await capture(page, testInfo, 'home-established-housing', {
    consumer: 'Home header Settings IconButton (established housing)', state: 'populated' })
  return { dom, pixels: await framePixels(page, png, dom.frameBox) }
}

/**
 * The criterion, per consumer: the Back control is the shared icon-only
 * IconButton housing (same classes, square target, no visible text, one
 * glyph, the preserved name), and its actual rendered frame matches the
 * established control — a visible frame against the header, the same
 * size and the same frame luminance, with the arrow glyph drawn inside.
 */
function expectSameHousing(name: string, back: { dom: Housing; pixels: FramePixels }, home: { dom: Housing; pixels: FramePixels }) {
  expect(back.dom.label).toBe(name)
  expect(back.dom.text).toBe('')
  expect(back.dom.icons).toBe(1)
  expect(back.dom.classes).toContain('clr-hit')
  expect(back.dom.classes).toEqual(home.dom.classes)
  expect(back.dom.minWidth).toBe(home.dom.minWidth)
  expect(Math.abs(back.dom.box.width - back.dom.box.height)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(back.dom.box.width - home.dom.box.width)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(back.dom.box.height - home.dom.box.height)).toBeLessThanOrEqual(0.5)
  expect(back.dom.wrapper).toContain('clr-bleed')
  expect(Math.abs(back.dom.frameBox.width - home.dom.frameBox.width)).toBeLessThanOrEqual(0.5)
  // Framed: the drawn edge stands clear of the header behind it on two sides.
  expect(back.pixels.frameTop).toBeGreaterThan(back.pixels.outsideTop + 20)
  expect(back.pixels.frameLeft).toBeGreaterThan(back.pixels.outsideLeft + 20)
  // The same frame as the established control: its colour and its brightness.
  const chromaDistance = Math.hypot(...back.pixels.frameChroma.map((value, channel) => value - home.pixels.frameChroma[channel]!))
  expect(chromaDistance).toBeLessThanOrEqual(0.05)
  expect(Math.abs(back.pixels.frameTop - home.pixels.frameTop)).toBeLessThanOrEqual(12)
  expect(Math.abs(back.pixels.frameLeft - home.pixels.frameLeft)).toBeLessThanOrEqual(12)
  // The arrow is drawn inside the housing.
  expect(back.pixels.glyph).toBeGreaterThan(back.pixels.interior + 40)
}

type Consumer = {
  consumer: string
  path: string
  name: string
  ref: ReferenceId
  /** How an in-app user reaches it, from Home. */
  arrive: (page: Page) => Promise<void>
  /** Where Back leads with an in-app screen behind it, and how the history moves. */
  withHistory: { lands: string; move: 'back' | 'push' }
  /** Where Back leads when the route is the first entry (URL or PWA launch). */
  withoutHistory: { lands: string; move: 'replace' | 'push' }
}

const openSettings = async (page: Page) => {
  await headerControl(page, 'Settings').click()
  await expect(page).toHaveURL(/\/settings$/)
}
const CONSUMERS: Consumer[] = [
  {
    consumer: 'Generate', path: '/generate', name: 'Home', ref: 'B05-02',
    arrive: async (page) => {
      await page.getByRole('button', { name: /generate/i }).last().click()
      await expect(page).toHaveURL(/\/generate/)
    },
    withHistory: { lands: '/', move: 'push' },
    withoutHistory: { lands: '/', move: 'push' },
  },
  {
    consumer: 'Settings', path: '/settings', name: 'Back', ref: 'B05-08',
    arrive: openSettings,
    withHistory: { lands: '/', move: 'back' },
    withoutHistory: { lands: '/', move: 'replace' },
  },
  {
    consumer: 'History', path: '/history', name: 'Home', ref: 'B05-08',
    arrive: async (page) => {
      await page.getByRole('link', { name: /view history/i }).click()
      await expect(page).toHaveURL(/\/history$/)
    },
    withHistory: { lands: '/', move: 'push' },
    withoutHistory: { lands: '/', move: 'push' },
  },
  {
    consumer: 'Session detail', path: DETAIL_PATH, name: 'Back', ref: 'B05-08',
    arrive: async (page) => {
      await page.getByRole('link', { name: /view history/i }).click()
      await expect(page).toHaveURL(/\/history$/)
      await page.getByRole('link', { name: /Synthetic back history 1/ }).click()
      await expect(page).toHaveURL(new RegExp(`${DETAIL_PATH}$`))
    },
    withHistory: { lands: '/history', move: 'back' },
    withoutHistory: { lands: '/history', move: 'push' },
  },
  {
    consumer: 'Locations', path: '/settings/locations', name: 'Settings', ref: 'B05-08',
    arrive: async (page) => {
      await openSettings(page)
      await page.getByRole('button', { name: /^Manage places/ }).click()
      await expect(page).toHaveURL(/\/settings\/locations$/)
    },
    withHistory: { lands: '/settings', move: 'back' },
    withoutHistory: { lands: '/settings', move: 'replace' },
  },
  {
    consumer: 'Format preview', path: '/settings/formats', name: 'Settings', ref: 'B05-08',
    arrive: async (page) => {
      await openSettings(page)
      await page.getByRole('button', { name: /^Preview formats/ }).click()
      await expect(page).toHaveURL(/\/settings\/formats$/)
    },
    withHistory: { lands: '/settings', move: 'back' },
    withoutHistory: { lands: '/settings', move: 'replace' },
  },
]

async function expectMove(page: Page, before: number, move: 'back' | 'push' | 'replace') {
  const expected = move === 'back' ? before - 1 : move === 'push' ? before + 1 : before
  await expect.poll(() => historyIndex(page)).toBe(expected)
}

test.use({ timezoneId: 'UTC' })

test.describe('B05 REQ-007 header Back housing', () => {
  test.beforeEach(({ browserName, baseURL, page }, testInfo) => {
    const origin = new URL(String(baseURL))
    expect(isLoopback(origin.hostname), 'This synthetic proof may run only on a local target').toBe(true)
    PAGE_ORIGINS.set(page, origin.origin)
    expect(testInfo.project.name).toBe('mobile')
    expect(browserName).toBe('chromium')
    testInfo.annotations.push({ type: 'proof-mode', description:
      'Synthetic intercepted API on production routes in mobile Chromium; no backend, model or installed-iPhone proof.' })
  })

  for (const entry of CONSUMERS) {
    const slug = entry.consumer.toLowerCase().replace(/\s+/g, '-')

    test(`${entry.consumer}: framed icon-only Back, reached in-app, returns to ${entry.withHistory.lands}`, async ({ page, visit }, testInfo) => {
      await page.setViewportSize(PHONE)
      const app = await syntheticApp(page)
      const home = await establishedHousing(page, visit, testInfo)
      await entry.arrive(page)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const back = headerControl(page, entry.name)
      await expect(back).toBeVisible()
      const dom = await housing(back)
      const png = await capture(page, testInfo, `${slug}-back-with-history`, {
        reference: reference(entry.ref), consumer: `${entry.consumer} header Back`,
        state: 'reached in-app (history behind it)', control: dom, established: home.dom })
      const pixels = await framePixels(page, png, dom.frameBox)
      testInfo.annotations.push({ type: 'pixel-comparison', description:
        `${entry.consumer} Back frame top/left ${pixels.frameTop.toFixed(1)}/${pixels.frameLeft.toFixed(1)} over header ` +
        `${pixels.outsideTop.toFixed(1)}/${pixels.outsideLeft.toFixed(1)}; established ${home.pixels.frameTop.toFixed(1)}/${home.pixels.frameLeft.toFixed(1)}; ` +
        `frame rgb ${pixels.frameRgb.join(',')} vs established ${home.pixels.frameRgb.join(',')}; ` +
        `glyph ${pixels.glyph.toFixed(1)} over interior ${pixels.interior.toFixed(1)}` })
      expectSameHousing(entry.name, { dom, pixels }, home)
      const comparison = JSON.stringify({ consumer: entry.consumer, reference: reference(entry.ref),
        capture: `${slug}-back-with-history.png`, established: 'home-established-housing.png',
        viewport: PHONE, pixels, establishedPixels: home.pixels, result: 'pass' }, null, 2)
      writeFileSync(testInfo.outputPath(`${slug}-comparison.json`), comparison)
      await testInfo.attach(`${slug}-comparison.json`, { body: comparison, contentType: 'application/json' })

      const before = await historyIndex(page)
      expect(before).not.toBeNull()
      await back.click()
      await expect.poll(() => pathname(page)).toBe(entry.withHistory.lands)
      await expectMove(page, before!, entry.withHistory.move)
      app.assertNoWrites()
    })

    test(`${entry.consumer}: Back without in-app history keeps its fallback to ${entry.withoutHistory.lands}`, async ({ page, visit }, testInfo) => {
      await page.setViewportSize(PHONE)
      const app = await syntheticApp(page)
      await visit(entry.path)
      expect(await historyIndex(page)).toBe(0)
      const back = headerControl(page, entry.name)
      await expect(back).toBeVisible()
      const dom = await housing(back)
      expect(dom.label).toBe(entry.name)
      expect(dom.text).toBe('')
      await capture(page, testInfo, `${slug}-back-without-history`, {
        reference: reference(entry.ref), consumer: `${entry.consumer} header Back`,
        state: 'first entry (URL / PWA launch, no in-app history)', control: dom })
      await back.click()
      await expect.poll(() => pathname(page)).toBe(entry.withoutHistory.lands)
      await expectMove(page, 0, entry.withoutHistory.move)
      // The app kept the user: the destination screen rendered.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      app.assertNoWrites()
    })
  }

  test('unrelated text actions, Cancel and the destructive confirmation keep their text treatment', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(PHONE)
    const app = await syntheticApp(page)
    await visit('/settings')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Settings')
    for (const name of ['Manage places', 'Preview formats', 'Sign out']) {
      const control = page.getByRole('button', { name: new RegExp(`^${name}`) })
      await expect(control).toHaveCount(1)
      await expect(control).toContainText(name)
      await expect(control).not.toHaveClass(/clr-hit/)
    }
    await visit('/settings/locations')
    await page.getByRole('button', { name: /delete/i }).last().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    for (const name of ['Cancel', 'Delete']) {
      const control = dialog.getByRole('button', { name, exact: true })
      await expect(control).toHaveText(name)
      await expect(control).not.toHaveClass(/clr-hit/)
    }
    await capture(page, testInfo, 'locations-delete-confirmation', {
      consumer: 'Locations delete ConfirmDialog (unchanged)', state: 'confirmation open' })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
    app.assertNoWrites()
  })

  test("the logging sheet's collapse control keeps its own treatment", async ({ page, visit }, testInfo) => {
    await page.setViewportSize(PHONE)
    const app = await syntheticApp(page, { activeWorkout: true })
    await visit('/workout')
    const content = page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
    await content.getByRole('button', { name: /^(log set|rest)/i }).first().click()
    const sheet = page.locator('.clr-set-sheet')
    await expect(sheet).toBeVisible()
    const collapse = sheet.getByRole('button', { name: 'Minimize', exact: true })
    await expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await expect(collapse).toHaveText('')
    // Not a Back action: no arrow-left glyph, and its own name and role remain.
    expect(await collapse.locator('svg').count()).toBe(1)
    await capture(page, testInfo, 'workout-sheet-collapse', {
      consumer: 'SetLoggingSheet collapse (unchanged)', state: 'sheet open' })
    await collapse.click()
    await expect(sheet).toBeHidden()
    app.assertNoWrites()
  })
})
