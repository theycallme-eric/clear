import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { sessionSnapshotSchema, type WorkoutSessionRow } from '../src/state/schemas'
import { makeSessionRow } from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../src/test/workout-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — Generate (REQ-005, REQ-006, TASK-007, JOURNEY-005).
 *
 * B05-02 marks the Generate form: a title that wraps (02.1), a Settings link
 * (02.3), a Focus explanation (02.4) and an intensity explanation (02.5) to
 * remove, a Focus to say beside the Goal (02.6), Recovery and Change focus as
 * one row beneath them (02.7) and a clipped MINUTES cap (02.9).
 *
 * The actual route is entered from Home and rendered at the phone width B05
 * was captured on and at a narrow, short phone. Each marked region of the
 * reference is measured in its own pixels and the same measure is taken of
 * the actual capture; the DOM supplies the geometry the pixels are read in.
 * Each control's behaviour is exercised, and the public Input unit specimens
 * and logging's separate Unit Select are checked beside the route.
 *
 * Data is synthetic and intercepted: no writes, no model calls, no request
 * leaves the local Vite origin. None of this is an installed-iPhone result.
 */
const OWNER = '00000000-0000-4000-8000-000000000007'
const AUTH_KEY = 'clear.auth.session'
const LOCATION_ID = '00000000-0000-4000-8000-000000000071'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const NOTES = 'Tight hamstrings today.'

type Viewport = { width: number; height: number }
/**
 * The portrait phone B05 was captured on (430 wide: see REFERENCE_SCALE), a
 * common narrower one, and a narrow, short one. The title and selected pair
 * criteria are asserted at all three widths, with label wrapping recorded.
 */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-430', viewport: { width: 430, height: 932 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'narrow-short-320', viewport: { width: 320, height: 568 } },
]
const SKINS = ['clear', 'vapour', 'signal', 'mono'] as const

function daysAgo(days: number) {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - days)
  return now.toISOString().slice(0, 10)
}

/** Completed upper-body history: the recommendation is a lower-body Focus. */
function completed(index: number, daysBack: number): WorkoutSessionRow {
  const date = daysAgo(daysBack)
  return makeSessionRow({
    id: `00000000-0000-4000-8000-00000000070${index}`,
    user_id: OWNER, location_id: LOCATION_ID, date,
    created_at: `${date}T09:00:00.000Z`, updated_at: `${date}T09:31:00.000Z`,
    started_at: `${date}T09:00:00.000Z`, completed_at: `${date}T09:31:00.000Z`,
    title: 'Synthetic upper-body strength session', session_focus: 'upper_body',
    goal_preset: 'balanced', requested_duration_mins: 45,
    actual_duration_mins: 31, requested_intensity: 8, effective_intensity: 8,
  })
}
const HISTORY = [completed(1, 1), completed(2, 3)]

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic B05 Generate workout',
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

/**
 * The reviewed reference, read every run: a missing or unreadable file fails
 * the proof rather than yielding a capture with no reference behind it.
 */
const REFERENCE_DIR = resolve(import.meta.dirname, '..', '..', '.evidence',
  basename(resolve(import.meta.dirname, '..')), 'sources')
const REFERENCE_FILE = 'sources/source-05-B05-02-generate.jpg'
/**
 * The reference's phone is 910px wide for a 430px viewport. Measured, not
 * assumed: its card frame spans ~841px for a 398px card (430 less two 16px
 * gutters), and its unselected RECOVERY SESSION chip ~370px for the 176px
 * this build lays the same chip out at.
 */
const REFERENCE_SCALE = 910 / 430
/**
 * B05-02's marked regions in the reference's own pixels (1550×1974). Each is
 * a box the measure below scans for rows of text ink.
 */
const REFERENCE_REGIONS = {
  title: { id: '02.1', description: 'Header title, two lines: "GENERATE" / "WORKOUT"', x0: 30, x1: 330, y0: 130, y1: 290 },
  settings: { id: '02.3', description: '"Change in Settings" link under the Goal', x0: 80, x1: 390, y0: 445, y1: 490 },
  recovery: { id: '02.7', description: 'RECOVERY SESSION label', x0: 110, x1: 420, y0: 540, y1: 585 },
  focus: { id: '02.6', description: '"Focus: Lower body" line', x0: 80, x1: 340, y0: 640, y1: 682 },
  reason: { id: '02.4', description: 'Focus recommendation explanation', x0: 80, x1: 720, y0: 700, y1: 740 },
  changeFocus: { id: '02.7', description: 'CHANGE FOCUS label', x0: 345, x1: 585, y0: 785, y1: 820 },
  intensityNote: { id: '02.5', description: '"Balanced works at 4 to 10."', x0: 80, x1: 490, y0: 962, y1: 1005 },
  minutes: { id: '02.9', description: 'Time available field, MINUTES end cap (marker 9)', x0: 694, x1: 847, y0: 1300, y1: 1352 },
} as const
type Region = { x0: number; x1: number; y0: number; y1: number }

function reference() {
  const bytes = readFileSync(resolve(REFERENCE_DIR, basename(REFERENCE_FILE)))
  return { file: REFERENCE_FILE, sha256: createHash('sha256').update(bytes).digest('hex'), bytes }
}

function sourceIdentity() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Generate capture requires an actual Git source identity')
  return {
    head,
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
  }
}

/** As the other B05 specs: serve a bundle with non-secret placeholders when no public URL is configured. */
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
  throw new Error(`Synthetic Generate origin ${origin} did not start`)
}

const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5610 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-generate.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-generate-public-placeholder',
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
  checkA11y: async ({ page, checkA11y }, use) => {
    await use(async () => {
      const path = new URL(page.url()).pathname
      if (path === '/generate') {
        // A boot/guard heading is not the populated Generate route.
        await expect(page.getByRole('heading', {
          level: 1, name: 'Generate', exact: true,
        })).toBeVisible()
        await expect(page.getByLabel('Notes', { exact: true })).toBeVisible()
        await expect(page.getByLabel('Time available', { exact: true })).toHaveValue('45')
        await expect(page.getByRole('button', {
          name: 'Change focus', exact: true,
        })).toBeVisible()
      } else if (path === '/dev/gallery/app') {
        // Wait for the lazy gallery route rather than scanning the boot shell.
        await expect(page.getByRole('heading', {
          level: 1, name: 'Component Gallery', exact: true,
        })).toBeVisible()
        await expect(page.getByRole('heading', { level: 3, name: 'Input', exact: true })).toBeVisible()
      }
      await checkA11y()
    })
  },
})

async function syntheticApp(page: Page, origin: string, mode: { activeWorkout?: boolean } = {}) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  const blockedOutbound: string[] = []
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
  // Registered first: the API mocks below take precedence. Everything else
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
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') {
        return reply([fixtureLocation({ id: LOCATION_ID, user_id: OWNER, tier: 'full', name: 'Building gym', is_default: true })])
      }
      if (name === 'workout_sessions') return reply(mode.activeWorkout ? [] : HISTORY)
      if (mode.activeWorkout && name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(WORKOUT_EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (mode.activeWorkout && name === 'workout_exercises') return reply(WORKOUT_EXERCISES)
      if (['load_anchors', 'location_equipment', 'saved_workout_attempts', 'saved_workouts',
        'saved_workout_completions', 'rest_days'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(mode.activeWorkout ? WORKOUT : null)
      if (mode.activeWorkout && name === 'session_snapshot') return reply(WORKOUT)
      if (mode.activeWorkout && name === 'session_as_performed') return reply(null)
      if (name === 'streak_sessions') {
        return reply(mode.activeWorkout ? [] : HISTORY.map((row) => ({
          session_id: row.id, completed_at: row.completed_at, counts_for_streak: row.counts_for_streak,
        })))
      }
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) return reply([])
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic Generate request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-b05-generate-session', refreshToken: 'synthetic-b05-generate-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-generate@example.invalid' },
    }))
  }, { authKey: AUTH_KEY, owner: OWNER })
  return {
    assertReadOnly() {
      expect(attemptedWrites, unexpected.join(', ')).toBe(0)
      expect(unexpected, 'Every API request must have an explicit synthetic read disposition').toEqual([])
      expect(blockedOutbound, 'No request may leave the exact local read origin/API mocks').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pixel measures, decoded by the browser's own canvas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rows of text ink in one box of a decoded image: per row, the brightest
 * pixel; a row is ink when it rises part-way from the box's darkest row to its
 * brightest. Adjacent ink rows (gaps under `join` px) are one band. `contrast`
 * is peak minus floor, so an empty box is told from a box of text.
 */
async function inkBands(page: Page, image: Buffer, type: string, box: Region, join: number) {
  return page.evaluate(async ({ data, type, box, join }) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const lum = (x: number, y: number) => {
      const i = (y * bitmap.width + x) * 4
      return 0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!
    }
    const x0 = Math.max(0, box.x0)
    const x1 = Math.min(bitmap.width - 1, box.x1)
    const y0 = Math.max(0, box.y0)
    const y1 = Math.min(bitmap.height - 1, box.y1)
    const rows: number[] = []
    for (let y = y0; y <= y1; y += 1) {
      let brightest = 0
      for (let x = x0; x <= x1; x += 1) brightest = Math.max(brightest, lum(x, y))
      rows.push(brightest)
    }
    const floor = Math.min(...rows)
    const peak = Math.max(...rows)
    const threshold = floor + 0.5 * (peak - floor)
    const bands: Array<{ top: number; bottom: number }> = []
    rows.forEach((value, index) => {
      if (value <= threshold) return
      const y = y0 + index
      const last = bands.at(-1)
      if (last !== undefined && y - last.bottom <= join) last.bottom = y
      else bands.push({ top: y, bottom: y })
    })
    return { width: bitmap.width, floor, peak, contrast: peak - floor, threshold, bands }
  }, { data: image.toString('base64'), type, box, join })
}

/** One region of B05-02, measured: its text rows in reference pixels. */
async function referenceRegion(page: Page, key: keyof typeof REFERENCE_REGIONS) {
  const ref = reference()
  const region = REFERENCE_REGIONS[key]
  const ink = await inkBands(page, ref.bytes, 'image/jpeg', region, 6)
  expect(ink.width).toBe(1550)
  return { file: ref.file, sha256: ref.sha256, region, ink }
}

/** A clip of the page, snapped outward to whole CSS px. */
async function capture(page: Page, testInfo: TestInfo, id: string, rect: { left: number; top: number; right: number; bottom: number }) {
  const clip = {
    x: Math.max(0, Math.floor(rect.left)),
    y: Math.max(0, Math.floor(rect.top)),
    width: 0, height: 0,
  }
  clip.width = Math.ceil(rect.right) - clip.x
  clip.height = Math.ceil(rect.bottom) - clip.y
  const shot = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' })
  const file = `${id}.png`
  writeFileSync(testInfo.outputPath(file), shot)
  await testInfo.attach(file, { path: testInfo.outputPath(file), contentType: 'image/png' })
  const scale = testInfo.project.use.deviceScaleFactor ?? 1
  return {
    shot, clip, scale,
    file, sha256: createHash('sha256').update(shot).digest('hex'),
    /** A CSS-px box on the page, in this capture's pixels. */
    local: (box: { left: number; top: number; right: number; bottom: number }): Region => ({
      x0: Math.round((box.left - clip.x) * scale), x1: Math.round((box.right - clip.x) * scale) - 1,
      y0: Math.round((box.top - clip.y) * scale), y1: Math.round((box.bottom - clip.y) * scale) - 1,
    }),
  }
}

async function record(page: Page, testInfo: TestInfo, id: string, entry: Record<string, unknown>) {
  const body = JSON.stringify({
    id, ...entry,
    source: sourceIdentity(),
    target: new URL(page.url()).origin,
    route: new URL(page.url()).pathname,
    skin: await page.locator('html').getAttribute('data-skin'),
    syntheticPublicConfig: SYNTHETIC_ORIGIN_NEEDED,
    browser: `${testInfo.project.name} (Chromium emulation, deviceScaleFactor ${testInfo.project.use.deviceScaleFactor ?? 1})`,
  }, null, 2)
  writeFileSync(testInfo.outputPath(`${id}.json`), body)
  await testInfo.attach(`${id}.json`, { body, contentType: 'application/json' })
}

const originOf = (baseURL: string | undefined) => new URL(baseURL!).origin

// ─────────────────────────────────────────────────────────────────────────────
// The route's pieces
// ─────────────────────────────────────────────────────────────────────────────

const card = (page: Page) => page.locator('main .clr-card').first()
const goalLine = (page: Page) => card(page).getByText(/^Goal:/)
const focusLine = (page: Page) => card(page).getByText(/^Focus:/)
const recoveryAction = (page: Page) => page.getByRole('button', { name: 'Recovery session', exact: true })
const changeFocusAction = (page: Page) => page.getByRole('button', { name: 'Change focus', exact: true })
const slider = (page: Page) => page.getByRole('slider', { name: 'Intensity' })
const generateAction = (page: Page) => page.locator('.clr-footer').getByRole('button', { name: 'Generate workout', exact: true })

/**
 * The element's box and its own text's laid-out lines, in CSS px. Only text
 * nodes count, so a chip's selection tick is not read as a line of text.
 */
async function textGeometry(locator: Locator) {
  return locator.evaluate((element) => {
    const rects: DOMRect[] = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const range = document.createRange()
      range.selectNodeContents(node)
      rects.push(...[...range.getClientRects()].filter((rect) => rect.width > 0))
    }
    const box = (rect: DOMRect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height })
    const left = Math.min(...rects.map((rect) => rect.left))
    const top = Math.min(...rects.map((rect) => rect.top))
    const right = Math.max(...rects.map((rect) => rect.right))
    const bottom = Math.max(...rects.map((rect) => rect.bottom))
    const style = getComputedStyle(element)
    return {
      box: box(element.getBoundingClientRect()),
      text: { left, top, right, bottom, width: right - left, height: bottom - top },
      lines: new Set(rects.map((rect) => Math.round(rect.bottom))).size,
      overflow: element.scrollWidth - element.clientWidth,
      font: { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight, color: style.color },
    }
  })
}

/** Home's Generate entry (ENTRY-008) onto the actual route, then notes filled. */
async function enterGenerate(page: Page, visit: (path: string) => Promise<void>, checkA11y: () => Promise<void>) {
  await visit('/')
  await page.getByRole('button', { name: 'Generate workout', exact: true }).first().click()
  await expect(page).toHaveURL((url) => url.pathname === '/generate')
  await expect(focusLine(page)).toHaveText('Focus: Lower body')
  await page.getByLabel('Notes').fill(NOTES)
  await page.evaluate(() => document.fonts.ready)
  await checkA11y()
}

/**
 * 02.1: the header title, its lines in the DOM and in its pixels; the
 * reference's same region holds two. The permitted short title stays on one
 * line at the shown, common and narrow phone widths.
 */
async function assertTitle(page: Page, testInfo: TestInfo, id: string) {
  const heading = page.getByRole('heading', { level: 1, name: 'Generate', exact: true })
  const geometry = await textGeometry(heading)
  const shot = await capture(page, testInfo, id, geometry.text)
  const ink = await inkBands(page, shot.shot, 'image/png', shot.local(geometry.text), Math.round(4 * shot.scale))
  const back = await page.getByRole('button', { name: /back|home/i }).first().boundingBox()
  const detail = JSON.stringify({ geometry, ink, back })
  expect(geometry.overflow, detail).toBeLessThanOrEqual(0)
  expect(ink.bands.length, detail).toBe(geometry.lines)
  if (back !== null) expect(geometry.text.right, detail).toBeLessThanOrEqual(back.x)
  expect(geometry.lines, detail).toBe(1)
  return { text: await heading.textContent(), geometry, ink, capture: { file: shot.file, sha256: shot.sha256 } }
}

/**
 * 02.6/02.7: Goal then Focus said alike at the top; Recovery and Change focus
 * in one named action group beneath. The controls stay side by side at every
 * checked width. Label words may wrap inside those cells; DOM and pixel line
 * counts must agree and the complete label/tick must remain inside the frame.
 */
async function assertTopComposition(page: Page, testInfo: TestInfo, id: string) {
  // Filling the notes scrolled the form; the card's top is measured in view.
  await card(page).evaluate((element) => element.scrollIntoView({ block: 'start' }))
  // The public Chip animates its tick width/margin for --dur-state even
  // under reduced motion. Wait for those real finite transitions, then read
  // controls, cells and text in one browser task; separate reads can straddle
  // the tick's layout change and compare two different instants.
  const snapshot = await card(page).evaluate(async (card) => {
    const group = card.querySelector<HTMLElement>('.clr-action-group--paired-labels')!
    // Flush layout before enumerating CSS transitions that a new state started.
    group.getBoundingClientRect()
    const finiteMotion = () => group.getAnimations({ subtree: true }).filter((animation) =>
      (animation.playState === 'running' || animation.pending) &&
      Number.isFinite(animation.effect?.getComputedTiming().endTime),
    )
    await Promise.all(finiteMotion().map((animation) => animation.finished))
    if (finiteMotion().length !== 0) throw new Error('Generate pair motion did not settle before measurement')

    const box = (rect: DOMRect) => ({
      x: rect.x, y: rect.y, left: rect.left, top: rect.top, right: rect.right,
      bottom: rect.bottom, width: rect.width, height: rect.height,
    })
    const measureText = (element: Element) => {
      const rects: DOMRect[] = []
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        rects.push(...[...range.getClientRects()].filter((rect) => rect.width > 0))
      }
      const left = Math.min(...rects.map((rect) => rect.left))
      const top = Math.min(...rects.map((rect) => rect.top))
      const right = Math.max(...rects.map((rect) => rect.right))
      const bottom = Math.max(...rects.map((rect) => rect.bottom))
      const style = getComputedStyle(element)
      return {
        box: box(element.getBoundingClientRect()),
        text: { left, top, right, bottom, width: right - left, height: bottom - top },
        content: element.textContent,
        lines: new Set(rects.map((rect) => Math.round(rect.bottom))).size,
        overflow: element.scrollWidth - element.clientWidth,
        font: { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight, color: style.color },
      }
    }
    const paragraphs = [...card.querySelectorAll('p')]
    const goal = paragraphs.find((element) => element.textContent?.startsWith('Goal:'))!
    const focus = paragraphs.find((element) => element.textContent?.startsWith('Focus:'))!
    const controls = [...group.querySelectorAll('button')]
    const recovery = controls.find((element) => element.textContent === 'Recovery session')!
    const change = controls.find((element) => element.textContent === 'Change focus')!
    const tick = recovery.querySelector('svg')!
    const intensity = card.querySelector('input[type="range"], [role="slider"]')!
    return {
      goal: measureText(goal), focus: measureText(focus),
      recovery: measureText(recovery), change: measureText(change),
      selection: {
        pressed: recovery.getAttribute('aria-pressed'), opacity: getComputedStyle(tick).opacity,
        tick: box(tick.getBoundingClientRect()),
      },
      pair: {
        className: group.className,
        cells: [...group.children].map((cell) => box(cell.getBoundingClientRect())),
        box: box(group.getBoundingClientRect()),
      },
      cardBox: box(card.getBoundingClientRect()), intensity: box(intensity.getBoundingClientRect()),
    }
  })
  const { goal, focus, recovery, change, selection, pair, cardBox, intensity } = snapshot
  const detail = JSON.stringify({ goal, focus, recovery, change, selection, pair, cardBox, intensity })

  // Goal and Focus: the first lines of the card, adjacent, in one typography.
  expect(goal.box.top - cardBox.y, detail).toBeLessThan(48)
  expect(focus.box.top, detail).toBeGreaterThanOrEqual(goal.box.bottom - 0.5)
  expect(focus.box.top - goal.box.bottom, detail).toBeLessThan(12)
  expect(focus.font, detail).toEqual(goal.font)
  // The pair: the shared action group, Recovery then Change focus, directly
  // beneath the Focus and above the intensity, each label whole.
  expect(pair.className.split(' '), detail).toContain('clr-action-group')
  expect(pair.className.split(' '), detail).toContain('clr-action-group--paired-labels')
  expect(pair.cells, detail).toHaveLength(2)
  const sideBySide = Math.abs(pair.cells[0]!.top - pair.cells[1]!.top) <= 1 &&
    pair.cells[1]!.left > pair.cells[0]!.right - 0.5
  expect(sideBySide, detail).toBe(true)
  // Each control's frame fills its cell: the frames meet at the group's gap.
  expect(Math.abs(recovery.box.width - pair.cells[0]!.width), detail).toBeLessThanOrEqual(1)
  expect(Math.abs(change.box.width - pair.cells[1]!.width), detail).toBeLessThanOrEqual(1)
  for (const control of [recovery, change]) {
    expect(control.lines, detail).toBeGreaterThanOrEqual(1)
    expect(control.lines, detail).toBeLessThanOrEqual(2)
    expect(control.text.left, detail).toBeGreaterThanOrEqual(control.box.left)
    expect(control.text.right, detail).toBeLessThanOrEqual(control.box.right)
    expect(control.text.top, detail).toBeGreaterThanOrEqual(control.box.top)
    expect(control.text.bottom, detail).toBeLessThanOrEqual(control.box.bottom)
  }
  expect(recovery.overflow, detail).toBeLessThanOrEqual(0)
  expect(change.overflow, detail).toBeLessThanOrEqual(0)
  if (selection.pressed === 'true') {
    expect(selection.opacity, detail).toBe('1')
    expect(selection.tick.width, detail).toBeGreaterThan(0)
    expect(selection.tick.left, detail).toBeGreaterThanOrEqual(recovery.box.left)
    expect(selection.tick.right, detail).toBeLessThanOrEqual(recovery.box.right)
    expect(selection.tick.top, detail).toBeGreaterThanOrEqual(recovery.box.top)
    expect(selection.tick.bottom, detail).toBeLessThanOrEqual(recovery.box.bottom)
  }
  expect(pair.box.top, detail).toBeGreaterThan(focus.box.bottom)
  expect(pair.box.top - focus.box.bottom, detail).toBeLessThan(24)
  expect(pair.box.bottom, detail).toBeLessThan(intensity.y)
  expect(pair.box.right, detail).toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5)

  // Read every drawn label line, including natural narrow-phone wrapping.
  const top = { left: cardBox.x, top: cardBox.y, right: cardBox.x + cardBox.width, bottom: pair.box.bottom + 8 }
  const shot = await capture(page, testInfo, id, top)
  const join = Math.round(3 * shot.scale)
  const goalInk = await inkBands(page, shot.shot, 'image/png', shot.local(goal.text), join)
  const focusInk = await inkBands(page, shot.shot, 'image/png', shot.local(focus.text), join)
  const recoveryInk = await inkBands(page, shot.shot, 'image/png', shot.local(recovery.text), join)
  const changeInk = await inkBands(page, shot.shot, 'image/png', shot.local(change.text), join)
  const pixels = { goalInk, focusInk, recoveryInk, changeInk }
  const pixelDetail = JSON.stringify(pixels)
  // Each text drawn as many rows of ink as it has laid-out lines.
  const drawn: Array<[typeof goalInk, number]> = [
    [goalInk, goal.lines], [focusInk, focus.lines], [recoveryInk, recovery.lines], [changeInk, change.lines],
  ]
  for (const [ink, lines] of drawn) {
    expect(ink.bands, pixelDetail).toHaveLength(lines)
    expect(ink.contrast, pixelDetail).toBeGreaterThan(40)
  }
  const centre = (ink: typeof goalInk) => (ink.bands[0]!.top + ink.bands.at(-1)!.bottom) / 2 / shot.scale
  const rowDelta = Math.abs(centre(recoveryInk) - centre(changeInk))
  expect(rowDelta, pixelDetail).toBeLessThanOrEqual(2)
  expect(centre(focusInk), pixelDetail).toBeGreaterThan(centre(goalInk))
  expect(centre(recoveryInk), pixelDetail).toBeGreaterThan(centre(focusInk))
  const labels = {
    recovery: { text: recovery.content, lines: recovery.lines, inkRows: recoveryInk.bands.length, font: recovery.font },
    changeFocus: { text: change.content, lines: change.lines, inkRows: changeInk.bands.length, font: change.font },
  }
  return { goal, focus, recovery, change, selection, labels, pair, sideBySide, pixels: { ...pixels, labelRowDelta: rowDelta }, capture: { file: shot.file, sha256: shot.sha256 } }
}

/** 02.3–02.5: the three marked texts are not on the route at all. */
async function assertRemovals(page: Page) {
  await expect(page.getByRole('link', { name: 'Change in Settings' })).toHaveCount(0)
  await expect(page.getByText('Change in Settings')).toHaveCount(0)
  await expect(page.getByText(/in the sessions you’ve logged|in \d+ days\./)).toHaveCount(0)
  await expect(page.getByText(/works at \d+ to \d+\.$/)).toHaveCount(0)
  await expect(slider(page)).not.toHaveAttribute('aria-describedby')
}

/** Populated notes stay usable above the pinned Generate action. */
async function assertNotesAndAction(page: Page, testInfo: TestInfo, id: string) {
  const notes = page.getByLabel('Notes')
  await notes.scrollIntoViewIfNeeded()
  await expect(notes).toHaveValue(NOTES)
  const notesBox = (await notes.boundingBox())!
  const footer = (await page.locator('.clr-footer').boundingBox())!
  const action = (await generateAction(page).boundingBox())!
  const viewport = page.viewportSize()!
  const detail = JSON.stringify({ notesBox, footer, action, viewport })
  await expect(generateAction(page)).toBeEnabled()
  expect(notesBox.y + notesBox.height, detail).toBeLessThanOrEqual(footer.y + 0.5)
  expect(action.y + action.height, detail).toBeLessThanOrEqual(viewport.height + 0.5)
  expect(action.y, detail).toBeGreaterThanOrEqual(0)
  const shot = await capture(page, testInfo, id, { left: 0, top: 0, right: viewport.width, bottom: viewport.height })
  return { notesBox, footer, action, capture: { file: shot.file, sha256: shot.sha256 } }
}

// ─────────────────────────────────────────────────────────────────────────────
// 02.9: the unit-field fit through the public Input contract
// ─────────────────────────────────────────────────────────────────────────────

/** Sub-pixel rounding and anti-aliasing only; the defect measured several CSS px. */
const TOLERANCE = 0.75

/** The unit's first and last ink columns between the cap's rule and the frame's border. */
async function inkColumns(page: Page, image: Buffer, type: string, box: Region, surfaceRow: number) {
  return page.evaluate(async ({ data, type, box, surfaceRow }) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const lum = (x: number, y: number) => {
      const i = (y * bitmap.width + x) * 4
      return 0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!
    }
    const columns: number[] = []
    for (let x = box.x0; x <= box.x1; x += 1) {
      let brightest = 0
      for (let y = box.y0; y <= box.y1; y += 1) brightest = Math.max(brightest, lum(x, y))
      columns.push(brightest)
    }
    const surfaces: number[] = []
    for (let x = box.x0; x <= box.x1; x += 1) surfaces.push(lum(x, surfaceRow))
    surfaces.sort((a, b) => a - b)
    const surface = surfaces[Math.floor(surfaces.length / 2)]!
    const peak = Math.max(...columns)
    const threshold = surface + 0.4 * (peak - surface)
    const ink = columns.map((value, index) => (value > threshold ? box.x0 + index : -1)).filter((x) => x >= 0)
    return { width: bitmap.width, surface, peak, threshold, first: ink[0] ?? null, last: ink.at(-1) ?? null }
  }, { data: image.toString('base64'), type, box, surfaceRow })
}

/** B05-02.9 in CSS px: the clipped MINUTES' gutters and drawn width. */
async function referenceMinutes(page: Page) {
  const ref = reference()
  const region = REFERENCE_REGIONS.minutes
  const ink = await inkColumns(page, ref.bytes, 'image/jpeg', region, region.y0 - 6)
  expect(ink.first).not.toBeNull()
  const rule = region.x0 - 2
  const border = region.x1 + 2
  return {
    file: ref.file, sha256: ref.sha256, region,
    leftGap: (ink.first! - rule) / REFERENCE_SCALE,
    rightGap: (border - ink.last!) / REFERENCE_SCALE,
    inkWidth: (ink.last! - ink.first! + 1) / REFERENCE_SCALE,
  }
}

/** One unit field, laid out whole and drawn clear of its frame. */
async function assertUnitFits(page: Page, input: Locator, testInfo: TestInfo, id: string) {
  await input.scrollIntoViewIfNeeded()
  const geometry = await input.evaluate((element) => {
    const field = element.closest('.clr-field')!
    const unit = field.querySelector<HTMLElement>('.clr-field__unit')!
    const range = document.createRange()
    range.selectNodeContents(unit)
    const box = (rect: DOMRect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width })
    const style = getComputedStyle(unit)
    return {
      text: unit.textContent,
      lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size,
      field: box(field.getBoundingClientRect()),
      unit: box(unit.getBoundingClientRect()),
      textBox: box(range.getBoundingClientRect()),
      input: box(element.getBoundingClientRect()),
      bleed: box(element.closest('.clr-bleed')!.getBoundingClientRect()),
      ruleWidth: parseFloat(style.borderLeftWidth),
      frameWidth: parseFloat(getComputedStyle(field).getPropertyValue('--border-width')) || parseFloat(style.borderLeftWidth),
      padding: { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) },
      scrollWidth: unit.scrollWidth,
      clientWidth: unit.clientWidth,
    }
  })
  const shot = await capture(page, testInfo, id, geometry.bleed)
  const local = (x: number) => Math.round((x - shot.clip.x) * shot.scale)
  const ink = await inkColumns(page, shot.shot, 'image/png', {
    x0: local(geometry.unit.left + geometry.ruleWidth) + 1,
    x1: local(geometry.field.right - geometry.frameWidth) - 2,
    y0: Math.round((geometry.textBox.top - shot.clip.y) * shot.scale),
    y1: Math.round((geometry.textBox.bottom - shot.clip.y) * shot.scale),
  }, Math.round((geometry.unit.top - shot.clip.y) * shot.scale) + Math.round(3 * shot.scale))
  expect(ink.first, JSON.stringify(ink)).not.toBeNull()
  const pixels = {
    leftGap: (ink.first! / shot.scale + shot.clip.x) - (geometry.unit.left + geometry.ruleWidth),
    rightGap: (geometry.field.right - geometry.frameWidth) - (ink.last! / shot.scale + shot.clip.x),
    inkWidth: (ink.last! - ink.first! + 1) / shot.scale,
  }
  const detail = JSON.stringify({ geometry, pixels })
  expect(geometry.lines, detail).toBe(1)
  expect(geometry.scrollWidth, detail).toBeLessThanOrEqual(geometry.clientWidth)
  expect(geometry.textBox.left, detail).toBeGreaterThanOrEqual(geometry.unit.left + geometry.padding.left - TOLERANCE)
  expect(geometry.textBox.right, detail).toBeLessThanOrEqual(geometry.unit.right - geometry.padding.right + TOLERANCE)
  expect(geometry.unit.right, detail).toBeLessThanOrEqual(geometry.field.right + TOLERANCE)
  // More room, not a narrower cap: the package's padding, both sides alike.
  expect(geometry.padding.left, detail).toBe(geometry.padding.right)
  expect(geometry.input.width, detail).toBeGreaterThanOrEqual(48)
  expect(Math.abs(pixels.inkWidth - geometry.textBox.width), detail).toBeLessThanOrEqual(3)
  expect(pixels.rightGap, detail).toBeGreaterThanOrEqual(geometry.padding.right - 3)
  expect(pixels.rightGap / pixels.leftGap, detail).toBeGreaterThanOrEqual(0.6)
  return { geometry, pixels, capture: { file: shot.file, sha256: shot.sha256 } }
}

// ─────────────────────────────────────────────────────────────────────────────
// The reference, measured
// ─────────────────────────────────────────────────────────────────────────────

test('B05-02 reference regions show the marked state this proof compares against', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><title>reference</title>')
  const title = await referenceRegion(page, 'title')
  const settings = await referenceRegion(page, 'settings')
  const recovery = await referenceRegion(page, 'recovery')
  const focus = await referenceRegion(page, 'focus')
  const reason = await referenceRegion(page, 'reason')
  const change = await referenceRegion(page, 'changeFocus')
  const note = await referenceRegion(page, 'intensityNote')
  const minutes = await referenceMinutes(page)
  const centre = (ink: typeof title.ink) => (ink.bands[0]!.top + ink.bands[0]!.bottom) / 2
  const measured = { title, settings, recovery, focus, reason, change, note, minutes }
  const detail = JSON.stringify(measured)
  // 02.1: the title on two lines.
  expect(title.ink.bands, detail).toHaveLength(2)
  // 02.3–02.5: each marked text is drawn.
  for (const region of [settings, reason, note]) expect(region.ink.contrast, detail).toBeGreaterThan(60)
  // 02.6/02.7: Recovery above the Focus and Change focus below it, one stacked
  // action per row, ~100 CSS px apart.
  expect(centre(recovery.ink), detail).toBeLessThan(centre(focus.ink))
  expect(centre(change.ink), detail).toBeGreaterThan(centre(focus.ink))
  expect((centre(change.ink) - centre(recovery.ink)) / REFERENCE_SCALE, detail).toBeGreaterThan(60)
  // 02.9: the word runs into the frame's border.
  expect(minutes.rightGap, detail).toBeLessThan(3)
  await testInfo.attach('reference-b05-02.json', { body: JSON.stringify(measured, null, 2), contentType: 'application/json' })
})

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 Generate @ ${size}`, () => {
    test.use({ viewport })

    test('JOURNEY-005: Home to Generate with the one-line title, removals, Goal/Focus and paired actions, notes and pinned action', async ({ page, visit, baseURL, checkA11y }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await enterGenerate(page, visit, checkA11y)
      const ref = reference()
      const titleRef = await referenceRegion(page, 'title')
      const recoveryRef = await referenceRegion(page, 'recovery')
      const changeRef = await referenceRegion(page, 'changeFocus')
      const referenceRowDelta = Math.abs((recoveryRef.ink.bands[0]!.top + recoveryRef.ink.bands[0]!.bottom) / 2
        - (changeRef.ink.bands[0]!.top + changeRef.ink.bands[0]!.bottom) / 2) / REFERENCE_SCALE

      // 02.1: the permitted short title stays on one line at every phone width.
      const title = await assertTitle(page, testInfo, `generate-title-${size}`)
      expect(title.ink.bands.length).toBeLessThan(titleRef.ink.bands.length)
      await record(page, testInfo, `generate-title-${size}`, {
        consumer: 'Generate · AppHeader title', state: 'recommended Focus, populated notes', viewport,
        reference: { file: ref.file, sha256: ref.sha256, region: titleRef.region, measuredLines: titleRef.ink.bands.length },
        actual: { text: title.text, lines: title.geometry.lines, inkRows: title.ink.bands.length },
        capture: title.capture,
        criteria: { 'AC-014': 'pass' },
      })

      // 02.3–02.5
      await assertRemovals(page)
      await expect(focusLine(page)).toHaveText('Focus: Lower body')
      await expect(slider(page)).toHaveValue('8')

      // 02.6/02.7
      const top = await assertTopComposition(page, testInfo, `generate-top-${size}`)
      if (top.sideBySide) expect(top.pixels.labelRowDelta).toBeLessThan(referenceRowDelta - 50)
      await record(page, testInfo, `generate-top-${size}`, {
        consumer: 'Generate · form card top (Goal, Focus, ActionGroup: Recovery session | Change focus)',
        state: 'recommended Focus, Recovery off, choices closed', viewport,
        reference: { file: ref.file, sha256: ref.sha256,
          regions: [REFERENCE_REGIONS.settings, REFERENCE_REGIONS.recovery, REFERENCE_REGIONS.focus,
            REFERENCE_REGIONS.reason, REFERENCE_REGIONS.changeFocus, REFERENCE_REGIONS.intensityNote],
          measured: { recoveryToChangeFocusRowDelta: referenceRowDelta } },
        actual: { sideBySide: top.sideBySide, labels: top.labels, selection: top.selection, labelRowDelta: top.pixels.labelRowDelta, pair: top.pair, goalFont: top.goal.font, focusFont: top.focus.font },
        capture: top.capture,
        criteria: { 'AC-015': 'pass', 'AC-016': 'pass', 'AC-017': 'pass', 'AC-047': 'pass', 'AC-060': 'pass',
          'AC-018': 'pass' },
      })

      // Notes and the pinned action, at the foot of the form.
      const foot = await assertNotesAndAction(page, testInfo, `generate-notes-action-${size}`)
      await record(page, testInfo, `generate-notes-action-${size}`, {
        consumer: 'Generate · Notes and pinned Generate workout', state: `notes "${NOTES}", scrolled to notes`, viewport,
        reference: { file: ref.file, sha256: ref.sha256, region: { id: '02 (foot)', description: 'Notes field above the pinned GENERATE WORKOUT action' } },
        actual: foot, capture: foot.capture, criteria: { 'AC-060': 'pass' },
      })
      app.assertReadOnly()
    })

    test('Recovery session, Change focus and intensity each keep their own behaviour from the paired row', async ({ page, visit, baseURL, checkA11y }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await enterGenerate(page, visit, checkA11y)
      const recovery = recoveryAction(page)
      const change = changeFocusAction(page)
      const choices = page.getByRole('group', { name: 'Focus for this workout' })

      // Change focus alone: opens and closes the choices; Recovery is untouched.
      await expect(change).toHaveAttribute('aria-expanded', 'false')
      await change.click()
      await expect(change).toHaveAttribute('aria-expanded', 'true')
      await expect(choices).toBeVisible()
      await expect(recovery).toHaveAttribute('aria-pressed', 'false')
      // An override for this workout only, and the way back to the recommendation.
      await choices.getByRole('button', { name: 'Upper body', exact: true }).click()
      await expect(focusLine(page)).toHaveText('Focus: Upper body — this workout only')
      await expect(page).toHaveURL((url) => url.searchParams.get('override') === 'upper_body')
      const override = await assertTopComposition(page, testInfo, `generate-top-override-${size}`)
      await record(page, testInfo, `generate-top-override-${size}`, {
        consumer: 'Generate · form card top', state: 'Focus overridden for this workout, choices open', viewport,
        reference: { file: REFERENCE_FILE, sha256: reference().sha256, regions: [REFERENCE_REGIONS.recovery, REFERENCE_REGIONS.focus, REFERENCE_REGIONS.changeFocus] },
        actual: { sideBySide: override.sideBySide, labels: override.labels, selection: override.selection, labelRowDelta: override.pixels.labelRowDelta, pair: override.pair },
        capture: override.capture, criteria: { 'AC-018': 'pass', 'AC-047': 'pass', 'AC-060': 'pass' },
      })
      // The single cancel action keeps its own group and row, outside the pair.
      const cancel = page.getByRole('button', { name: 'Use the recommended focus', exact: true })
      await expect(cancel).toBeVisible()
      const single = await cancel.evaluate((element) => {
        const group = element.closest('.clr-action-group')!
        return { children: group.children.length, text: group.textContent }
      })
      expect(single).toEqual({ children: 1, text: 'Use the recommended focus' })
      await cancel.click()
      await expect(focusLine(page)).toHaveText('Focus: Lower body')
      await change.click()
      await expect(change).toHaveAttribute('aria-expanded', 'false')
      await expect(choices).toHaveCount(0)

      // Recovery alone: pressed, says what it does, and turns off again.
      await recovery.click()
      await expect(recovery).toHaveAttribute('aria-pressed', 'true')
      await expect(card(page).getByText(/Power/).first()).toBeVisible()
      const recovering = await assertTopComposition(page, testInfo, `generate-top-recovery-${size}`)
      await record(page, testInfo, `generate-top-recovery-${size}`, {
        consumer: 'Generate · form card top', state: 'Recovery session on (tick shown)', viewport,
        reference: { file: REFERENCE_FILE, sha256: reference().sha256, regions: [REFERENCE_REGIONS.recovery, REFERENCE_REGIONS.changeFocus] },
        actual: { sideBySide: recovering.sideBySide, labels: recovering.labels, selection: recovering.selection, labelRowDelta: recovering.pixels.labelRowDelta, pair: recovering.pair },
        capture: recovering.capture, criteria: { 'AC-018': 'pass', 'AC-047': 'pass' },
      })
      await recovery.click()
      await expect(recovery).toHaveAttribute('aria-pressed', 'false')

      // Intensity: the value moves with the control; no explanation appears.
      await expect(slider(page)).toHaveValue('8')
      await slider(page).focus()
      await page.keyboard.press('ArrowLeft')
      await expect(slider(page)).toHaveValue('7')
      await expect(slider(page)).toHaveAttribute('aria-valuetext', '7 of 10')
      await assertRemovals(page)
      await record(page, testInfo, `generate-behaviour-${size}`, {
        consumer: 'Generate · Recovery session, Change focus, Intensity', state: 'each exercised independently', viewport,
        criteria: { 'AC-016': 'pass', 'AC-017': 'pass', 'AC-018': 'pass', 'AC-047': 'pass' },
      })
      app.assertReadOnly()
    })

    test('Generate Time available: MINUTES is whole and comfortably contained in every skin', async ({ page, visit, baseURL, checkA11y }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await enterGenerate(page, visit, checkA11y)
      const input = page.getByLabel('Time available')
      await expect(input).toHaveValue('45')
      const ref = await referenceMinutes(page)
      for (const skin of SKINS) {
        await page.evaluate((value) => {
          localStorage.setItem('clear.skin', value)
          document.documentElement.setAttribute('data-skin', value)
        }, skin)
        await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
        const id = `generate-minutes-${size}-${skin}`
        const fit = await assertUnitFits(page, input, testInfo, id)
        expect(fit.geometry.text).toBe('minutes')
        // Against the reference: the right gutter it lacks is there. (At the
        // reference's measured 430 scale its word is drawn nearly whole; the
        // marked defect is the word running into the frame's border.)
        expect(fit.pixels.rightGap).toBeGreaterThan(ref.rightGap + 6)
        await record(page, testInfo, id, {
          consumer: 'Generate · Time available (public Input unit="minutes")',
          state: 'populated form, default 45 minutes', viewport,
          reference: { file: ref.file, sha256: ref.sha256, region: ref.region,
            measured: { leftGap: ref.leftGap, rightGap: ref.rightGap, inkWidth: ref.inkWidth } },
          capture: fit.capture, geometry: fit.geometry, pixels: fit.pixels,
          criteria: { 'AC-019': 'pass', 'AC-061': 'pass' },
        })
      }
      app.assertReadOnly()
    })

    test('Public Input unit specimens fit through the same contract', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await visit('/dev/gallery/app?component=Input')
      const entry = page.locator('.clr-dev-gallery__group').filter({
        has: page.getByRole('heading', { name: 'Input', exact: true }),
      })
      await expect(entry).toHaveCount(1)
      const ref = await referenceMinutes(page)
      const variants = [
        { state: 'unit="kg" invalid, public specimen basis', label: 'Load', unit: 'kg' },
        { state: 'unit="minutes"', label: 'Time available', unit: 'minutes' },
        { state: 'unit="minutes" invalid', label: 'Time available', unit: 'minutes' },
        { state: 'unit="reps" disabled', label: 'Reps', unit: 'reps' },
      ]
      for (const variant of variants) {
        const specimen = entry.locator('.clr-dev-gallery__specimen').filter({
          has: page.getByRole('heading', { name: variant.state, exact: true }),
        })
        const input = specimen.getByLabel(variant.label)
        await expect(input).toBeVisible()
        const id = `gallery-${variant.state.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${size}`
        const fit = await assertUnitFits(page, input, testInfo, id)
        expect(fit.geometry.text).toBe(variant.unit)
        await record(page, testInfo, id, {
          consumer: `Gallery · Input ${variant.state}`, state: variant.state, viewport,
          reference: { file: ref.file, sha256: ref.sha256, region: ref.region,
            measured: { leftGap: ref.leftGap, rightGap: ref.rightGap, inkWidth: ref.inkWidth } },
          capture: fit.capture, geometry: fit.geometry, pixels: fit.pixels,
          criteria: { 'AC-061': 'pass' },
        })
      }
      app.assertReadOnly()
    })

    test('Logging keeps its separate Unit Select: its value, choices and behaviour', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL), { activeWorkout: true })
      await visit('/workout')
      const content = page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
      await content.getByRole('button', { name: /^(log set|rest)/i }).first().click()
      const sheet = page.locator('.clr-set-sheet')
      await expect(sheet).toBeVisible()
      const unit = sheet.getByRole('combobox', { name: 'Unit' })
      await expect(unit).toBeVisible()
      const shape = await unit.evaluate((select: HTMLSelectElement) => ({
        tag: select.tagName,
        value: select.value,
        options: [...select.options].map((option) => ({ value: option.value, disabled: option.disabled })),
        endCaps: select.closest('.clr-set-sheet')!.querySelectorAll('.clr-field__unit').length,
      }))
      expect(shape.tag).toBe('SELECT')
      expect(shape.endCaps).toBe(0)
      const choices = shape.options.filter((option) => !option.disabled).map((option) => option.value)
      expect(choices).toEqual(expect.arrayContaining(['kg', 'lb']))
      const next = choices.find((value) => value !== shape.value)!
      await unit.selectOption(next)
      await expect(unit).toHaveValue(next)
      await unit.selectOption(shape.value)
      await expect(unit).toHaveValue(shape.value)
      const rect = (await sheet.locator('.clr-set-sheet__measures').first().boundingBox())!
      const shot = await capture(page, testInfo, `logging-unit-select-${size}`,
        { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height })
      await record(page, testInfo, `logging-unit-select-${size}`, {
        consumer: 'Workout logging sheet · Unit Select (distinct from the Input unit cap)',
        state: 'active workout, sheet open, unit changed and restored without logging', viewport,
        initial: shape, selected: next,
        capture: { file: shot.file, sha256: shot.sha256 }, criteria: { 'AC-061': 'pass' },
      })
      app.assertReadOnly()
    })
  })
}
