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
 * one row beneath them (02.7) and a clipped MINUTES cap (02.9). TASK-024
 * (C51; R10.1, R25) supersedes 02.7's pair: the Focus value is its own change
 * control, and Recovery is reached inside its choices.
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
        await expect(page.getByRole('button', { name: /^Focus:/ })).toBeVisible()
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

    // TASK-115 retired the case 'JOURNEY-005: Home to Generate with the one-line title, removals, Goal/Focus summary with its Focus control, notes and pinned action' (old line 739): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.

    // TASK-115 retired the case 'Recovery session, the Focus control and intensity each keep their own behaviour, Recovery inside the Focus choices' (old line 793): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.

    // TASK-115 retired the case 'Generate Time available: MINUTES is whole and comfortably contained in every skin' (old line 862): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.

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

    // TASK-115 retired the case 'Logging keeps its separate Unit Select: its value, choices and behaviour' (old line 927): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.
  })
}
