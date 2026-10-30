import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { reviewHandoff } from '../src/state/review-handoff'
import { sessionReconstructionSchema, sessionSnapshotSchema } from '../src/state/schemas'
import { makeSessionAcceptance, makeSessionRow } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../src/test/workout-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — TASK-003 / REQ-003 / JOURNEY-002. Every actual scroll
 * viewport keeps its own public axis contract:
 * - vertical `ScrollRegion`: hard clip at its measured pinned layers, and a
 *   2px drawn scrollbar plus edge streaks only while scrolling;
 * - horizontal `OverflowRail`: start/end rules with stepped chevrons only
 *   where more content exists that way.
 *
 * Covered consumers: the page region with the header as its pinned head
 * (Home, B05-01.2), Settings' lower edge with no footer action (B05-08.2), a
 * fitting screen with no edge, the swap list overlay (B05-05), the capped
 * workout entry/sheet area (B05-07), Home's tab band and a ladder's rungs.
 *
 * Each case renders the production route, compares pixels from the actual
 * capture (decoded by the browser's own canvas) between rest and scrolling,
 * and writes the captures with their hashes beside the test output. Data is
 * synthetic and intercepted; nothing is written and no model is called. None
 * of this is an installed-iPhone result.
 */
const OWNER = '00000000-0000-4000-8000-000000000003'
const AUTH_KEY = 'clear.auth.session'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const LOCATION_ID = '00000000-0000-4000-8000-000000000031'
const PHONE = { width: 390, height: 844 }
const NARROW = { width: 320, height: 568 }
const SHORT = { width: 390, height: 480 }

const RUNGS = Array.from({ length: 11 }, (_, index) => index + 1)
const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic B05 scroll workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: LOCATION_ID, goal_preset: 'strength' },
  sections: [
    { title: 'Strength', sectionType: 'primary_lift', blocks: [{ exercises: [{ prescription: {
      exercise_id: 'back-squat', sets: 4, target_value: 5, rest_seconds: 150,
    } }] }] },
    { title: 'Ladder', sectionType: 'conditioning', blocks: [{ structureType: 'for_time', repScheme: 'ladder_up', timerType: 'countdown', timerSeconds: 480, exercises: [{ prescription: {
      exercise_id: 'push-up', equipment_used: 'bodyweight', load_type: 'bodyweight', load_value: null,
      target_kind: 'sequence', target_value: null, target_sequence: RUNGS, sets: 1, rest_seconds: null,
    } }] }] },
  ],
}))

const PERFORMED = sessionReconstructionSchema.parse({
  ...WORKOUT, reconstruction: 'performed', as_of: WORKOUT.session.started_at,
  sections: WORKOUT.sections.map((section) => ({ ...section, blocks: section.blocks.map((block) => ({
    ...block, block_result: null,
  })) })),
})
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))

const ACCEPTANCE = makeSessionAcceptance({ date: new Date().toISOString().slice(0, 10), goal_preset: 'strength' })
const SWAP_CANDIDATES = [{
  section: 'primary_lift',
  relaxed: false,
  candidates: Array.from({ length: 24 }, (_, index) => ({
    exercise_id: `synthetic-scroll-${index + 1}`, name: `Synthetic scroll option ${index + 1}`,
    exercise_role: 'compound_lift', can_be_primary: true, movement_patterns: ['hinge'], primary_patterns: ['hinge'],
    component_movements: [], muscles: [], usable_equipment: ['barbell'],
  })),
}]

/** Reviewed references: file, SHA-256 (when the evidence snapshot is reachable) and selected region. */
const REFERENCE_DIR = resolve(import.meta.dirname, '..', '..', '.evidence',
  basename(resolve(import.meta.dirname, '..')), 'sources')
const REFERENCE_FILES = {
  'B05-01': { file: 'sources/source-04-B05-01-home.jpg', region: '01.2 content clipped at the header rule' },
  'B05-05': { file: 'sources/source-08-B05-05-swap.jpg', region: '05.1/05.2 scrollable swap list in its overlay' },
  'B05-07': { file: 'sources/source-10-B05-07-logging-sheet.jpg', region: '07.4 sheet over the capped lower area' },
  'B05-08': { file: 'sources/source-11-B05-08-settings.jpg', region: '08.2 lower boundary with no footer action' },
} as const
type ReferenceId = keyof typeof REFERENCE_FILES
function reference(id: ReferenceId) {
  const entry = REFERENCE_FILES[id]
  const path = resolve(REFERENCE_DIR, basename(entry.file))
  return { id, ...entry, sha256: existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null }
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
  throw new Error(`Synthetic scroll origin ${origin} did not start`)
}

const PAGE_ORIGINS = new WeakMap<Page, string>()
const isLoopback = (hostname: string) => hostname === 'localhost' || hostname.endsWith('.localhost') ||
  /^127(?:\.\d{1,3}){3}$/.test(hostname) || hostname === '[::1]'

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5390 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-scroll.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-scroll-public-placeholder',
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

type Mode = { activeWorkout?: boolean; review?: boolean; history?: number; swapCount?: number; skin?: 'clear' | 'vapour' }

async function syntheticApp(page: Page, mode: Mode = {}) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  const blockedOutbound: string[] = []
  const origin = PAGE_ORIGINS.get(page)
  if (origin === undefined) throw new Error('Synthetic scroll proof requires its verified local origin')
  const guard = await installDeterministicCapture(page, { skin: mode.skin ?? 'clear', reducedMotion: false })
  // Registered first: named API mocks below take precedence. Everything else
  // must be a read from this exact local Vite origin, never another service.
  await page.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue()
    blockedOutbound.push(`${request.method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  const history = Array.from({ length: mode.history ?? 6 }, (_, index) => {
    const day = new Date()
    day.setUTCDate(day.getUTCDate() - index - 1)
    const date = day.toISOString().slice(0, 10)
    return makeSessionRow({
      id: `00000000-0000-4000-8000-${String(70 + index).padStart(12, '0')}`, user_id: OWNER, location_id: LOCATION_ID, date,
      title: `Synthetic scroll history ${index + 1}`, goal_preset: 'strength',
      started_at: `${date}T12:00:00.000Z`, completed_at: `${date}T12:30:00.000Z`,
      created_at: `${date}T12:00:00.000Z`, updated_at: `${date}T12:30:00.000Z`,
    })
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
        const id = mode.review ? ACCEPTANCE.location_id! : LOCATION_ID
        return reply([fixtureLocation({ id, user_id: OWNER, tier: 'full' })])
      }
      if (mode.activeWorkout && name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(WORKOUT_EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (mode.activeWorkout && name === 'workout_exercises') return reply(WORKOUT_EXERCISES)
      if (name === 'workout_sessions') return reply(mode.review ? [] : history)
      if (['load_anchors', 'location_equipment', 'saved_workout_attempts', 'saved_workouts', 'rest_days'].includes(name)) {
        return reply([])
      }
      unexpected.push(`GET ${url.pathname}`)
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(mode.activeWorkout ? WORKOUT : null)
      if (mode.activeWorkout && name === 'session_snapshot') return reply(WORKOUT)
      if (mode.activeWorkout && name === 'session_as_performed') return reply(PERFORMED)
      if (name === 'generation_candidate_sets_for_goal') return reply(SWAP_CANDIDATES.map((entry) => ({
        ...entry, candidates: entry.candidates.slice(0, mode.swapCount ?? 24),
      })))
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic scroll-boundary request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner, handoff }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-b05-scroll-session', refreshToken: 'synthetic-b05-scroll-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-scroll@example.invalid' },
    }))
    if (handoff !== null && location.pathname === '/review') {
      window.history.replaceState({ usr: handoff, key: 'synthetic-scroll-proof', idx: 0 }, '', location.href)
    }
  }, { authKey: AUTH_KEY, owner: OWNER, handoff: mode.review ? reviewHandoff(ACCEPTANCE) : null })
  return {
    assertNoWrites() {
      expect(attemptedWrites, unexpected.join(', ')).toBe(0)
      expect(unexpected, 'Every API request must have an explicit synthetic read disposition').toEqual([])
      expect(blockedOutbound, 'No request may leave the exact local read origin/API mocks').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** The public region's rendered state: layers, clip, streaks and drawn bar. */
async function regionState(region: Locator) {
  return region.evaluate((element) => {
    const rect = (node: Element | null) => {
      if (node === null) return null
      const r = node.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width }
    }
    const scroller = element.querySelector(':scope > .clr-scroll-region__scroller') as HTMLElement
    const head = element.querySelector(':scope > .clr-scroll-region__head')
    const foot = element.querySelector(':scope > .clr-scroll-region__foot')
    const streaks = [...element.querySelectorAll(':scope > .clr-scroll-region__streak')].map((streak) => ({
      bottom: streak.classList.contains('clr-scroll-region__streak--bottom'),
      box: rect(streak), opacity: Number(getComputedStyle(streak).opacity),
    }))
    const bar = element.querySelector(':scope > .clr-scroll-region__bar')!
    const barStyle = getComputedStyle(bar)
    const footStyle = foot === null ? null : getComputedStyle(foot)
    const fades = [element, scroller, head, foot].filter((node) => node !== null).map((node) => {
      const style = getComputedStyle(node!)
      return `${style.maskImage}|${style.webkitMaskImage}|${style.backgroundImage}`
    })
    return {
      measured: element.hasAttribute('data-measured'),
      scrolling: element.hasAttribute('data-scrolling'),
      region: rect(element), scroller: rect(scroller), head: rect(head), foot: rect(foot),
      headHasHeader: head?.querySelector(':scope > header') != null,
      headRule: head?.hasAttribute('data-rule') ?? null,
      footRule: footStyle === null ? null : { width: parseFloat(footStyle.borderTopWidth), style: footStyle.borderTopStyle, color: footStyle.borderTopColor },
      footEdge: foot?.querySelector(':scope > [data-screen-edge]') != null,
      footControls: foot === null ? 0 : foot.querySelectorAll('button, a[href]').length,
      overflow: { scroll: scroller.scrollHeight, client: scroller.clientHeight, top: scroller.scrollTop },
      clip: getComputedStyle(element).overflow,
      streaks,
      bar: { width: parseFloat(barStyle.width), height: parseFloat(barStyle.height), opacity: Number(barStyle.opacity) },
      fades,
      ruleWidth: parseFloat(getComputedStyle(element).getPropertyValue('--border-width')),
    }
  })
}
type RegionState = Awaited<ReturnType<typeof regionState>>

/** Mean luminance of a rectangle of an actual PNG capture, decoded by the browser. */
async function luminance(page: Page, png: Buffer, box: { x: number; y: number; width: number; height: number }) {
  return page.evaluate(async ({ data, box }) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const x = Math.max(0, Math.round(box.x))
    const y = Math.max(0, Math.round(box.y))
    const w = Math.max(1, Math.min(bitmap.width - x, Math.round(box.width)))
    const h = Math.max(1, Math.min(bitmap.height - y, Math.round(box.height)))
    const pixels = context.getImageData(x, y, w, h).data
    let sum = 0
    for (let index = 0; index < pixels.length; index += 4) {
      sum += 0.2126 * pixels[index]! + 0.7152 * pixels[index + 1]! + 0.0722 * pixels[index + 2]!
    }
    return sum / (pixels.length / 4)
  }, { data: png.toString('base64'), box })
}

/** One capture plus its record, written beside the test output and attached. */
async function capture(page: Page, testInfo: TestInfo, id: string, record: Record<string, unknown>, observedPng?: Buffer) {
  const png = observedPng ?? await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' })
  const viewport = page.viewportSize()!
  const pixels = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), scale: 'css' as const }
  expect(pixels.width).toBe(viewport.width)
  expect(pixels.height).toBe(viewport.height)
  const sha256 = createHash('sha256').update(png).digest('hex')
  const path = testInfo.outputPath(`${id}.png`)
  writeFileSync(path, png)
  const entry = { id, sha256, viewport, pixels, source: sourceIdentity(), path: page.url(), ...record }
  writeFileSync(testInfo.outputPath(`${id}.json`), JSON.stringify(entry, null, 2))
  await testInfo.attach(`${id}.png`, { body: png, contentType: 'image/png' })
  await testInfo.attach(`${id}.json`, { body: JSON.stringify(entry, null, 2), contentType: 'application/json' })
  return png
}

/** Scroll by real wheel input over the scroller and capture while the streaks are lit. */
async function wheelWhileCapturing(page: Page, region: Locator, deltaY: number) {
  const scroller = region.locator(':scope > .clr-scroll-region__scroller')
  const box = (await scroller.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, deltaY)
  await expect(region).toHaveAttribute('data-scrolling', '')
  // The public transition is --dur-enter; read once the cue has reached its lit value.
  await page.waitForFunction((element) => {
    const bar = element.querySelector(':scope > .clr-scroll-region__bar')!
    return element.hasAttribute('data-scrolling') && Number(getComputedStyle(bar).opacity) > 0.4
  }, await region.elementHandle(), { polling: 'raf', timeout: 5_000 })
  const state = await regionState(region)
  const png = await page.screenshot({ animations: 'allow', caret: 'hide', scale: 'css' })
  return { state, png }
}

/**
 * The cue's own pixels: the same box in the lit capture and in a capture of
 * the same scroll position once the cue has settled, so content cannot differ.
 */
async function cueContrast(page: Page, region: Locator, litPng: Buffer, box: { x: number; y: number; width: number; height: number }) {
  const settled = await settle(region)
  const settledPng = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' })
  return { settled, lit: await luminance(page, litPng, box), rest: await luminance(page, settledPng, box) }
}

/** Compare both rendered edge bands at the same scroll position. */
async function expectVisibleEdges(page: Page, region: Locator, lit: RegionState, litPng: Buffer, testInfo: TestInfo) {
  expectLitWhileScrolling(lit)
  const settled = await settle(region)
  const settledPng = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' })
  for (const streak of lit.streaks) {
    const edge = streak.bottom ? 'bottom' : 'top'
    const box = streak.box!
    const band = { x: box.left, y: box.top, width: box.width, height: box.height }
    const on = await luminance(page, litPng, band)
    const off = await luminance(page, settledPng, band)
    testInfo.annotations.push({ type: 'pixel-comparison', description: `${edge} streak settled ${off.toFixed(1)} -> scrolling ${on.toFixed(1)}` })
    expect(on, `${edge} edge must visibly brighten in the actual scrolling PNG`).toBeGreaterThan(off + 8)
  }
  expectAtRest(settled)
  return settled
}

async function settle(region: Locator) {
  await expect(region).not.toHaveAttribute('data-scrolling', '', { timeout: 5_000 })
  await expect.poll(async () => {
    const state = await regionState(region)
    return Math.max(state.bar.opacity, ...state.streaks.map((streak) => streak.opacity))
  }).toBe(0)
  return regionState(region)
}

/** Hard-edge contract shared by every vertical consumer. */
function expectHardEdges(state: RegionState) {
  expect(state.measured).toBe(true)
  expect(state.clip).toBe('hidden')
  if (state.head !== null) expect(state.scroller!.top).toBeGreaterThanOrEqual(state.head.bottom - 0.5)
  if (state.foot !== null) expect(state.scroller!.bottom).toBeLessThanOrEqual(state.foot.top + 0.5)
  // No fade or gradient approximates the edge.
  for (const fade of state.fades) expect(fade).toBe('none|none|none')
}

function expectLitWhileScrolling(state: RegionState) {
  expect(state.scrolling).toBe(true)
  expect(state.bar.width).toBe(2)
  expect(state.bar.height).toBeGreaterThan(0)
  expect(state.streaks).toHaveLength(2)
  expect(state.streaks.some((streak) => !streak.bottom)).toBe(true)
  expect(state.streaks.some((streak) => streak.bottom)).toBe(true)
  for (const streak of state.streaks) expect(streak.opacity).toBeGreaterThan(0.4)
}

function expectAtRest(state: RegionState) {
  expect(state.scrolling).toBe(false)
  expect(state.bar.opacity).toBe(0)
  for (const streak of state.streaks) expect(streak.opacity).toBe(0)
}

const page_region = (page: Page) => page.locator('main#main > .clr-scroll-region')

test.use({ timezoneId: 'UTC' })

test.describe('B05 REQ-003 scroll boundaries', () => {
  test.beforeEach(({ browserName, baseURL, page }, testInfo) => {
    const origin = new URL(String(baseURL))
    expect(isLoopback(origin.hostname), 'This synthetic proof may run only on a local target').toBe(true)
    PAGE_ORIGINS.set(page, origin.origin)
    expect(testInfo.project.name).toBe('mobile')
    expect(browserName).toBe('chromium')
    testInfo.annotations.push({ type: 'proof-mode', description:
      'Synthetic intercepted API on production routes in mobile Chromium; no backend, model or installed-iPhone proof.' })
  })

  test('page region: the header is the pinned head and the top streak lights on its rule (B05-01.2)', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(NARROW)
    const app = await syntheticApp(page, { skin: 'vapour' })
    await visit('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const region = page_region(page)
    await expect(region).toHaveAttribute('data-measured', '')
    await page.evaluate(() => document.fonts.ready)

    const rest = await regionState(region)
    expect(rest.headHasHeader).toBe(true)
    // The header draws its own closing rule; the region's head adds no second one.
    expect(rest.headRule).toBe(false)
    expect(rest.streaks).toHaveLength(2)
    const top = rest.streaks.find((streak) => !streak.bottom)!
    // The top streak sits on the header's rule, the clip line B05-01.2 marks.
    expect(Math.abs(top.box!.bottom - rest.head!.bottom)).toBeLessThanOrEqual(0.5)
    expect(rest.overflow.scroll).toBeGreaterThan(rest.overflow.client)
    expectHardEdges(rest)
    expectAtRest(rest)
    await capture(page, testInfo, 'home-narrow-rest', {
      reference: reference('B05-01'), consumer: 'page ScrollRegion + AppHeader head', state: 'overflowing, at rest' })

    const { state: lit, png: litPng } = await wheelWhileCapturing(page, region, 240)
    expectLitWhileScrolling(lit)
    expectHardEdges(lit)
    await capture(page, testInfo, 'home-narrow-scrolling', {
      reference: reference('B05-01'), consumer: 'page ScrollRegion + AppHeader head', state: 'scrolling', rendered: lit }, litPng)
    const band = { x: 0, y: top.box!.top, width: NARROW.width, height: 1 }
    const contrast = await cueContrast(page, region, litPng, band)
    testInfo.annotations.push({ type: 'pixel-comparison', description: `header-rule streak luminance settled ${contrast.rest.toFixed(1)} -> scrolling ${contrast.lit.toFixed(1)}` })
    expect(contrast.lit).toBeGreaterThan(contrast.rest + 8)
    expectAtRest(contrast.settled)
    app.assertNoWrites()
  })

  test('Settings keeps a lower boundary without a footer action (B05-08.2)', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(PHONE)
    const app = await syntheticApp(page, { skin: 'vapour' })
    await visit('/settings')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Settings')
    const region = page_region(page)
    await expect(region.locator(':scope > .clr-scroll-region__foot [data-screen-edge]')).toHaveCount(1)
    await page.evaluate(() => document.fonts.ready)

    const rest = await regionState(region)
    expect(rest.footEdge).toBe(true)
    expect(rest.footControls).toBe(0)
    expect(rest.ruleWidth).toBeGreaterThan(0)
    expect(rest.footRule).toMatchObject({ width: rest.ruleWidth, style: 'solid' })
    expect(rest.footRule!.color).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    expect(rest.foot!.bottom).toBe(PHONE.height)
    expectHardEdges(rest)
    expectAtRest(rest)

    // Scrolled to its end, the last card stops at the edge rule.
    await region.locator(':scope > .clr-scroll-region__scroller').evaluate((scroller) => {
      scroller.scrollTop = scroller.scrollHeight
    })
    const end = await settle(region)
    const lastCard = await region.locator('.clr-screen__content > *').last().boundingBox()
    expect(lastCard!.y + lastCard!.height).toBeLessThanOrEqual(end.foot!.top + 0.5)
    expect(end.overflow.top + end.overflow.client).toBeGreaterThanOrEqual(end.overflow.scroll - 1)
    const endPng = await capture(page, testInfo, 'settings-phone-end-rest', {
      reference: reference('B05-08'), consumer: 'page ScrollRegion lower edge layer (no footer action)', state: 'scrolled to end, at rest' })
    // The rule itself is visible against the atmosphere just below it.
    const rule = { x: 0, y: end.foot!.top, width: PHONE.width, height: 1 }
    const below = { x: 0, y: end.foot!.top + 4, width: PHONE.width, height: 1 }
    const ruleLight = await luminance(page, endPng, rule)
    const belowLight = await luminance(page, endPng, below)
    testInfo.annotations.push({ type: 'pixel-comparison', description: `lower edge rule ${ruleLight.toFixed(1)} vs atmosphere below ${belowLight.toFixed(1)}` })
    expect(ruleLight).toBeGreaterThan(belowLight + 4)

    const { state: lit, png: litPng } = await wheelWhileCapturing(page, region, -240)
    expectLitWhileScrolling(lit)
    await capture(page, testInfo, 'settings-phone-scrolling', {
      reference: reference('B05-08'), consumer: 'page ScrollRegion lower edge layer', state: 'scrolling', rendered: lit }, litPng)
    const bottom = lit.streaks.find((streak) => streak.bottom)!
    expect(Math.abs(bottom.box!.top - lit.foot!.top)).toBeLessThanOrEqual(0.5)
    const streakBand = { x: 0, y: bottom.box!.top, width: PHONE.width, height: 1 }
    const contrast = await cueContrast(page, region, litPng, streakBand)
    testInfo.annotations.push({ type: 'pixel-comparison', description: `lower edge streak settled ${contrast.rest.toFixed(1)} -> scrolling ${contrast.lit.toFixed(1)}` })
    expect(contrast.lit).toBeGreaterThan(contrast.rest + 8)
    // The rule stays once the streak has settled: the boundary is not a transient cue.
    expect(contrast.settled.footEdge).toBe(true)
    app.assertNoWrites()
  })

  test('History with an explicit null footer retains the overflowing lower boundary', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(PHONE)
    const app = await syntheticApp(page, { history: 12 })
    await visit('/history')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('History')
    await expect(page.getByRole('button', { name: 'Load older workouts' })).toHaveCount(0)
    const region = page_region(page)
    await expect(region.locator(':scope > .clr-scroll-region__foot [data-screen-edge]')).toHaveCount(1)
    await page.evaluate(() => document.fonts.ready)
    const rest = await settle(region)
    expect(rest.overflow.scroll).toBeGreaterThan(rest.overflow.client)
    expect(rest.footControls).toBe(0)
    expect(rest.footEdge).toBe(true)
    expect(rest.footRule).toMatchObject({ width: rest.ruleWidth, style: 'solid' })
    expectHardEdges(rest)
    const { state: lit, png } = await wheelWhileCapturing(page, region, 260)
    await capture(page, testInfo, 'history-null-footer-scrolling', {
      consumer: 'History page ScrollRegion with pinnedFoot=null', state: 'overflowing, scrolling', rendered: lit }, png)
    await expectVisibleEdges(page, region, lit, png, testInfo)
    app.assertNoWrites()
  })

  test('a screen that fits gets no lower edge, no scrolling and no cue', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(PHONE)
    const app = await syntheticApp(page)
    await visit('/no-such-screen')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const region = page_region(page)
    await expect(region).toHaveAttribute('data-measured', '')
    const state = await regionState(region)
    expect(state.overflow.scroll).toBeLessThanOrEqual(state.overflow.client + 1)
    expect(state.foot === null || !state.footEdge).toBe(true)
    const scroller = region.locator(':scope > .clr-scroll-region__scroller')
    const box = (await scroller.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(150)
    const after = await regionState(region)
    expect(after.scrolling).toBe(false)
    expectAtRest(after)
    expectHardEdges(after)
    await capture(page, testInfo, 'fitting-screen-phone', { consumer: 'page ScrollRegion', state: 'non-overflowing' })
    app.assertNoWrites()
  })

  test('decorative and collapsible content gains no scroller, cue or fade (Home)', async ({ page, visit }) => {
    await page.setViewportSize(PHONE)
    const app = await syntheticApp(page)
    await visit('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page_region(page)).toHaveAttribute('data-measured', '')
    const extra = await page.locator('.clr-screen__content').evaluate((content) =>
      [...content.querySelectorAll('*')].filter((node) => {
        const style = getComputedStyle(node)
        return node.classList.contains('clr-scroll-region') || ['auto', 'scroll'].includes(style.overflowY) ||
          style.maskImage !== 'none' || /gradient\(.*transparent/.test(style.backgroundImage)
      }).filter((node) => !node.closest('.clr-rail')).map((node) => node.className))
    expect(extra).toEqual([])
    app.assertNoWrites()
  })

  test('tab band keeps the horizontal rail contract with no cue when the tabs fit', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(NARROW)
    const app = await syntheticApp(page)
    await visit('/')
    const band = page.locator('.clr-screen__content .clr-band .clr-rail').first()
    await expect(band).toBeVisible()
    const state = await band.evaluate((rail) => {
      const scroller = rail.querySelector('.clr-rail__scroller')!
      return {
        overflowX: getComputedStyle(scroller).overflowX,
        fits: scroller.scrollWidth <= scroller.clientWidth + 1,
        cues: [...rail.querySelectorAll(':scope > .clr-rail__cue')].map((cue) => Number(getComputedStyle(cue).opacity)),
        vertical: rail.closest('.clr-scroll-region__scroller') !== null && rail.querySelector('.clr-scroll-region') === null,
      }
    })
    expect(state.overflowX).toBe('auto')
    expect(state.vertical).toBe(true)
    expect(state.fits).toBe(true)
    expect(state.cues).toEqual([0, 0])
    const active = band.getByRole('tab', { selected: true })
    const activeBox = (await active.boundingBox())!
    const railBox = (await band.boundingBox())!
    expect(activeBox.x).toBeGreaterThanOrEqual(railBox.x - 0.5)
    expect(activeBox.x + activeBox.width).toBeLessThanOrEqual(railBox.x + railBox.width + 0.5)
    await capture(page, testInfo, 'home-tab-band-narrow', { consumer: 'TabBar over OverflowRail', state: 'non-overflowing, active tab revealed' })
    app.assertNoWrites()
  })

  test('swap list overlay scrolls through its own public region (B05-05)', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(PHONE)
    const app = await syntheticApp(page, { review: true })
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(ACCEPTANCE.workout.title)
    await page.getByRole('button', { name: 'Swap back squat', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Swap back squat', exact: true })
    await expect(dialog.getByRole('list', { name: 'Alternatives' }).getByRole('button')).toHaveCount(24)
    const region = dialog.locator('.clr-scroll-region')
    await expect(region).toHaveAttribute('data-measured', '')
    await page.evaluate(() => document.fonts.ready)
    const rest = await regionState(region)
    expect(rest.overflow.scroll).toBeGreaterThan(rest.overflow.client)
    expectHardEdges(rest)
    expectAtRest(rest)
    await capture(page, testInfo, 'swap-list-phone-rest', {
      reference: reference('B05-05'), consumer: 'SwapDialog ScrollRegion', state: 'overflowing, at rest' })
    const { state: lit, png: litPng } = await wheelWhileCapturing(page, region, 300)
    expectLitWhileScrolling(lit)
    await capture(page, testInfo, 'swap-list-phone-scrolling', {
      reference: reference('B05-05'), consumer: 'SwapDialog ScrollRegion', state: 'scrolling', rendered: lit }, litPng)
    const barBox = await region.locator(':scope > .clr-scroll-region__bar').boundingBox()
    const contrast = await cueContrast(page, region, litPng, { x: barBox!.x, y: barBox!.y, width: 2, height: barBox!.height })
    testInfo.annotations.push({ type: 'pixel-comparison', description: `swap scrollbar settled ${contrast.rest.toFixed(1)} -> scrolling ${contrast.lit.toFixed(1)}` })
    expect(contrast.lit).toBeGreaterThan(contrast.rest + 8)
    expectAtRest(contrast.settled)
    await expectVisibleEdges(page, region, lit, litPng, testInfo)
    await dialog.getByRole('button', { name: 'Keep back squat', exact: true }).click()
    app.assertNoWrites()
  })

  test('swap list removes both pinned edges when its real content fits after resize', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(SHORT)
    const app = await syntheticApp(page, { review: true, swapCount: 4 })
    await visit('/review')
    await page.getByRole('button', { name: 'Swap back squat', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Swap back squat', exact: true })
    await expect(dialog.getByRole('list', { name: 'Alternatives' }).getByRole('button')).toHaveCount(4)
    const region = dialog.locator('.clr-scroll-region')
    await expect(region).toHaveAttribute('data-measured', '')
    await expect.poll(async () => (await regionState(region)).overflow.scroll - (await regionState(region)).overflow.client).toBeGreaterThan(1)
    const { state: lit, png } = await wheelWhileCapturing(page, region, 100)
    await capture(page, testInfo, 'swap-four-short-scrolling', {
      reference: reference('B05-05'), consumer: 'SwapDialog fitted region', state: 'overflowing, scrolling', rendered: lit }, png)
    await expectVisibleEdges(page, region, lit, png, testInfo)
    // The measured parent expands naturally; no forced element geometry.
    await page.setViewportSize(PHONE)
    await expect(region.locator(':scope > .clr-scroll-region__head')).toHaveCount(0)
    await expect(region.locator(':scope > .clr-scroll-region__foot')).toHaveCount(0)
    const fit = await settle(region)
    expect(fit.overflow.scroll).toBeLessThanOrEqual(fit.overflow.client + 1)
    expectAtRest(fit)
    await page.mouse.move(fit.scroller!.left + fit.scroller!.width / 2, fit.scroller!.top + fit.scroller!.height / 2)
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(150)
    expectAtRest(await regionState(region))
    await capture(page, testInfo, 'swap-four-phone-fitting', {
      reference: reference('B05-05'), consumer: 'SwapDialog fitted region', state: 'non-overflowing after resize', rendered: fit })
    app.assertNoWrites()
  })

  for (const { viewport, overflowing } of [
    { viewport: { width: 320, height: 360 }, overflowing: true },
    // At 390x480 the overlay keeps a dimmed band above the sheet, so the
    // sheet with its running rest scrolls rather than covering the header.
    { viewport: SHORT, overflowing: true },
    { viewport: PHONE, overflowing: false },
  ]) {
    test(`capped workout entry area holds the sheet through a public region at ${viewport.width}x${viewport.height} (B05-07)`, async ({ page, visit }, testInfo) => {
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page, { activeWorkout: true })
      await visit('/workout')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const content = page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
      await content.getByRole('button', { name: /^(log set|rest)/i }).first().click()
      const sheet = page.locator('.clr-set-sheet')
      await expect(sheet).toBeVisible()
      // B05-07.4 (TASK-013): the sheet floats in its own overlay region now,
      // over the navigation rather than inside the pinned foot.
      const region = page.locator('.clr-set-sheet-layer__entry > .clr-scroll-region')
      await expect(region).toHaveAttribute('data-measured', '')
      await page.evaluate(() => document.fonts.ready)
      await expect.poll(async () => (await regionState(region)).overflow.client).toBeGreaterThan(0)
      const rest = await settle(region)
      expectHardEdges(rest)
      expectAtRest(rest)
      // The navigation below stays fully on screen.
      const nav = (await page.locator('.clr-workout-nav').boundingBox())!
      expect(nav.y + nav.height).toBeLessThanOrEqual(viewport.height + 0.5)
      const id = `workout-sheet-${viewport.width}x${viewport.height}`
      await capture(page, testInfo, `${id}-rest`, {
        reference: reference('B05-07'), consumer: 'Workout sheet overlay FittedScrollRegion + SetLoggingSheet',
        state: overflowing ? 'overflowing, at rest' : 'non-overflowing' })
      if (overflowing) {
        expect(rest.overflow.scroll).toBeGreaterThan(rest.overflow.client)
        const { state: lit, png: litPng } = await wheelWhileCapturing(page, region, 200)
        expectLitWhileScrolling(lit)
        await capture(page, testInfo, `${id}-scrolling`, {
          reference: reference('B05-07'), consumer: 'Workout sheet overlay FittedScrollRegion', state: 'scrolling', rendered: lit }, litPng)
        const barBox = await region.locator(':scope > .clr-scroll-region__bar').boundingBox()
        const contrast = await cueContrast(page, region, litPng, { x: barBox!.x, y: barBox!.y, width: 2, height: barBox!.height })
        testInfo.annotations.push({ type: 'pixel-comparison', description: `sheet scrollbar settled ${contrast.rest.toFixed(1)} -> scrolling ${contrast.lit.toFixed(1)}` })
        expect(contrast.lit).toBeGreaterThan(contrast.rest + 8)
        expectAtRest(contrast.settled)
        await expectVisibleEdges(page, region, lit, litPng, testInfo)
      } else {
        expect(rest.overflow.scroll).toBeLessThanOrEqual(rest.overflow.client + 1)
        // The public bar may retain its last measured length; it must stay
        // invisible at rest and cannot relight without actual scrolling.
        expect(rest.bar.opacity).toBe(0)
        expect(rest.head).toBeNull()
        expect(rest.foot).toBeNull()
        expect(rest.streaks).toHaveLength(1)
        await page.mouse.move(rest.scroller!.left + rest.scroller!.width / 2, rest.scroller!.top + rest.scroller!.height / 2)
        await page.mouse.wheel(0, 200)
        await page.waitForTimeout(150)
        expectAtRest(await regionState(region))
        // The region is exactly as tall as the sheet: no empty band, no clip.
        const sheetBox = (await sheet.boundingBox())!
        expect(Math.abs(rest.region!.height - sheetBox.height)).toBeLessThanOrEqual(1)
      }
      app.assertNoWrites()
    })
  }

  test('ladder rungs keep the horizontal start/end cues and reveal the chosen rung', async ({ page, visit }, testInfo) => {
    await page.setViewportSize(NARROW)
    const app = await syntheticApp(page, { activeWorkout: true })
    await visit('/workout')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'All sections', exact: true }).click()
    await page.getByRole('button', { name: 'Conditioning, not started', exact: true }).click()
    const rail = page.locator('main .clr-rail:has(.clr-rungs)').first()
    await expect(rail).toBeVisible()
    // Bring the rung row out from behind the pinned navigation with real
    // vertical input before exercising its independent horizontal contract.
    const pageScroller = page_region(page).locator(':scope > .clr-scroll-region__scroller')
    const pageBox = (await pageScroller.boundingBox())!
    await page.mouse.move(pageBox.x + pageBox.width / 2, pageBox.y + pageBox.height / 2)
    await page.mouse.wheel(0, 260)
    await settle(page_region(page))
    const cues = () => rail.evaluate((element) => {
      const scroller = element.querySelector('.clr-rail__scroller')!
      return {
        overflows: scroller.scrollWidth > scroller.clientWidth + 1,
        left: scroller.scrollLeft,
        start: Number(getComputedStyle(element.querySelector('.clr-rail__cue[data-side="start"]')!).opacity),
        end: Number(getComputedStyle(element.querySelector('.clr-rail__cue[data-side="end"]')!).opacity),
      }
    })
    const atStart = await cues()
    expect(atStart.overflows).toBe(true)
    expect(atStart.start).toBe(0)
    await expect.poll(async () => (await cues()).end).toBe(1)
    await capture(page, testInfo, 'ladder-rungs-narrow-start', { consumer: 'LadderRungs OverflowRail', state: 'overflowing, at start' })

    await rail.locator('.clr-rail__cue[data-side="end"]').click()
    await expect.poll(async () => (await cues()).start).toBe(1)
    await expect.poll(async () => (await cues()).end).toBe(0)
    await capture(page, testInfo, 'ladder-rungs-narrow-end', { consumer: 'LadderRungs OverflowRail', state: 'overflowing, at end' })

    // Make the production ladder interactive, then use the real radio group.
    // No scrollIntoView or geometry writes precede focus or selection reveal.
    await page.getByRole('radio', { name: 'Hit the time cap', exact: true }).check()
    const radios = rail.getByRole('radio')
    await expect(radios).toHaveCount(RUNGS.length)
    const first = radios.first()
    const last = radios.last()
    const position = (radio: Locator) => radio.evaluate((node) => {
      const rail = node.closest('.clr-rail')!
      const scroller = rail.querySelector('.clr-rail__scroller')!
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return { left: rect.left, right: rect.right, width: rect.width }
      }
      const pageScroller = rail.closest('.clr-scroll-region__scroller')!
      return { rung: box(node.closest('.clr-rung')!), rail: box(rail),
        scroller: box(scroller), scrollLeft: scroller.scrollLeft,
        page: box(pageScroller), pageScrollLeft: pageScroller.scrollLeft }
    })
    const expectRevealed = async (radio: Locator) => {
      await expect.poll(async () => {
        const { rung, scroller, page: clip, pageScrollLeft } = await position(radio)
        return scroller.width > 0 && rung.width > 0 && pageScrollLeft === 0 &&
          scroller.left >= Math.max(0, clip.left) - 0.5 &&
          scroller.right <= Math.min(page.viewportSize()!.width, clip.right) + 0.5 &&
          rung.left >= scroller.left - 0.5 && rung.right <= scroller.right + 0.5
      }).toBe(true)
    }
    // Changing to the interactive fieldset mounts its native radio rail at
    // the start; the last radio must be genuinely hidden before key selection.
    await first.focus()
    await first.press('Space')
    await expect(first).toBeFocused()
    await expect(first).toBeChecked()
    await expectRevealed(first)
    const lastBefore = await position(last)
    expect(lastBefore.rung.left).toBeGreaterThanOrEqual(lastBefore.scroller.right)
    for (let index = 1; index < RUNGS.length; index += 1) await page.keyboard.press('ArrowRight')
    await expect(last).toBeFocused()
    await expect(last).toBeChecked()
    await expectRevealed(last)
    await expect.poll(async () => (await cues()).start).toBe(1)
    await expect.poll(async () => (await cues()).end).toBe(0)
    await capture(page, testInfo, 'ladder-rungs-narrow-revealed', {
      consumer: 'LadderRungs OverflowRail', state: 'last real radio focused and selected through native ArrowRight',
      before: lastBefore, rendered: await position(last) })
    // Native wrap selection must reveal the first genuinely hidden target again.
    const beforeWrap = await position(first)
    expect(beforeWrap.rung.right).toBeLessThanOrEqual(beforeWrap.scroller.left)
    await page.keyboard.press('ArrowRight')
    await expect(first).toBeFocused()
    await expect(first).toBeChecked()
    await expectRevealed(first)
    await expect.poll(async () => (await cues()).start).toBe(0)
    await expect.poll(async () => (await cues()).end).toBe(1)
    await capture(page, testInfo, 'ladder-rungs-narrow-wrap-revealed', {
      consumer: 'LadderRungs OverflowRail', state: 'first real radio selected by native wrap from offscreen',
      before: beforeWrap, rendered: await position(first) })
    app.assertNoWrites()
  })
})
