import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { blockResultRowSchema, exerciseSetLogRowSchema, sessionSnapshotSchema } from '../src/state/schemas'
import { isSetObservationMutation, type SetObservationAck, type SetObservationMutation } from '../src/state/set-observation-mutation'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../src/test/workout-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — the logging/rest sheet's surface (REQ-013, TASK-013,
 * JOURNEY-010).
 *
 * B05-07.3: the pictured sheet frame had no accent bar; the owner asked for it
 * to be added. B05-07.4: its surface showed scanlines, and it sat above the
 * Previous/Next navigation. The owner asked for an inset half-sheet that keeps
 * the normal side gutters, a plain opaque surface, and that covers the lower
 * content and the navigation over the system's dim/light-blur backdrop
 * without its scanline/static layers. Collapsing removes panel and backdrop.
 *
 * Every measure is taken twice: of the reference's own pixels in a named
 * region, and of the actual production `/workout` capture, for new entry,
 * correction and the combined superset round at phone, narrow, short and a
 * keyboard-like resize. Data is synthetic; every API request is answered here
 * and nothing is forwarded; no model is called. None of this is an installed
 * iPhone result: physical UAT stays pending.
 */
const OWNER = '00000000-0000-4000-8000-000000000013'
const AUTH_KEY = 'clear.auth.session'
const LOCATION_ID = '00000000-0000-4000-8000-000000000131'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const SQUAT_REST = 150

type Viewport = { width: number; height: number }
const PHONE: Viewport = { width: 390, height: 844 }
const NARROW: Viewport = { width: 320, height: 568 }
const SHORT: Viewport = { width: 390, height: 480 }
/** A software keyboard takes roughly half of a 844pt phone. */
const KEYBOARD: Viewport = { width: 390, height: 420 }

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic B05 sheet surface workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: LOCATION_ID, goal_preset: 'strength' },
  sections: [
    { title: 'Strength', sectionType: 'primary_lift', blocks: [{ exercises: [
      { prescription: { exercise_id: 'back-squat', order_index: 0, sets: 4, target_value: 5, rest_seconds: SQUAT_REST } },
    ] }] },
    { title: 'Accessory', sectionType: 'accessory', blocks: [{
      structureType: 'superset', rounds: 2, roundRestSeconds: 60,
      exercises: [
        { prescription: { exercise_id: 'bench-press', order_index: 0, modality: 'reps', target_value: 8, sets: 2 } },
        { prescription: { exercise_id: 'plank', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'time', target_value: 30, sets: 2 } },
      ],
    }] },
  ],
}))
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
const BLOCK_IDS = new Set(WORKOUT.sections.flatMap((section) => section.blocks.map(({ block }) => block.id)))

// ─────────────────────────────────────────────────────────────────────────────
// The reference and its regions
// ─────────────────────────────────────────────────────────────────────────────

const REFERENCE_FILE = 'sources/source-10-B05-07-logging-sheet.jpg'
const REFERENCE_SHA256 = 'b7fa59ba908bd27bf86baa29075a1c8e8d308ecb9d72e20618dd1c9025c19f4e'
const REFERENCE_DIRS = [
  process.env.B05_EVIDENCE_DIR,
  resolve(import.meta.dirname, '..', '..', '.evidence', basename(resolve(import.meta.dirname, '..'))),
].filter((dir): dir is string => dir !== undefined && dir !== '')
function readReference() {
  const dir = REFERENCE_DIRS.find((candidate) => existsSync(resolve(candidate, REFERENCE_FILE)))
  if (dir === undefined) throw new Error(`B05-07 reference ${REFERENCE_FILE} is not readable from ${REFERENCE_DIRS.join(', ')}`)
  const bytes = readFileSync(resolve(dir, REFERENCE_FILE))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== REFERENCE_SHA256) throw new Error(`B05-07 reference changed: ${sha256}`)
  return { file: REFERENCE_FILE, sha256, bytes }
}

/**
 * B05-07 in the reference's own pixels (2974×1968). Each phone is ~912px wide
 * for a 390pt screen. The left phone is the card before the sheet opens; the
 * right phone is the opened sheet the owner marked 07.3 and 07.4. No region
 * crosses a red owner marker.
 */
const SCALE = 912 / 390
const REF = {
  /** 07.3 — a row across the left phone's movement card: outer edge, then its accent bar's inner line. */
  cardRow: { id: '07.3-card', description: 'Left phone movement card left edge, row through PRIMARY LIFT/STANDARD', y: 743, x0: 0, x1: 910 },
  /** 07.3/07.4 — a row across the right phone's sheet between its fields and EFFORT (marker 3: "No accent bar"). */
  sheetRow: { id: '07.3-sheet', description: 'Right phone sheet frame row between the field frames and EFFORT', y: 1279, x0: 1417, x1: 2330 },
  /** 07.4 — the same phone's Previous/Next row: the navigation's own gutters. */
  navRow: { id: '07.4-nav', description: 'Right phone Previous/Next row', y: 1695, x0: 1417, x1: 2330 },
  /** 07.4 — a blank part of the sheet surface between title and chevron (marker 4: "doesn't need the lines"). */
  sheetBlank: { id: '07.4-surface', description: 'Right phone sheet surface right of LOG SET 1, left of the chevron', x0: 1695, x1: 2156, y0: 964, y1: 1059 },
  /** 07.4 — a column down the right phone from the sheet's lower edge through the navigation. */
  overlapColumn: { id: '07.4-overlap', description: 'Right phone column from the sheet foot through Previous', x: 1636, y0: 1450, y1: 1760 },
  /** 07.4 — the header behind the open sheet (right) and with none open (left). */
  headerOpen: { id: '07.4-backdrop', description: 'Right phone header band behind the open sheet', x0: 1447, x1: 2012, y0: 112, y1: 208 },
  headerClosed: { id: '07.4-backdrop-before', description: 'Left phone header band, no sheet', x0: 30, x1: 595, y0: 112, y1: 208 },
} as const

type Rect = { x0: number; x1: number; y0: number; y1: number }
type Row = { y: number; x0: number; x1: number }
type Column = { x: number; y0: number; y1: number }
type Stats = { lum: number; stripe: number; grain: number }
type Runs = { start: number; end: number }[]

/**
 * Pixels decoded by the browser's own canvas. A frame line is saturated colour
 * — the purple structure border, a teal action border — so text (white) and
 * the dark surfaces never read as one. `stripe` is the mean step between
 * adjacent rows' mean luminance: scanlines alternate row by row and make it
 * large; a plain surface leaves it near zero. `grain` is the same step along a
 * row: static noise raises it, blur lowers it.
 */
async function measure(page: Page, image: Buffer, type: string, request: {
  stats?: Rect[]; rows?: Row[]; columns?: Column[]
}): Promise<{ stats: Stats[]; rows: Runs[]; columns: Runs[] }> {
  return page.evaluate(async ({ data, type, request }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:${type};base64,${data}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(bitmap, 0, 0)
    const lum = (p: Uint8ClampedArray, i: number) => 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]
    const line = (p: Uint8ClampedArray, i: number) => {
      const max = Math.max(p[i], p[i + 1], p[i + 2])
      return max > 130 && max - Math.min(p[i], p[i + 1], p[i + 2]) > 60
    }
    const runsOf = (flags: boolean[], origin: number) => {
      const runs: { start: number; end: number }[] = []
      flags.forEach((on, index) => {
        if (!on) return
        const last = runs.at(-1)
        if (last !== undefined && origin + index - last.end <= 1) last.end = origin + index
        else runs.push({ start: origin + index, end: origin + index })
      })
      return runs
    }
    const stats = (request.stats ?? []).map((r) => {
      const w = Math.round(r.x1 - r.x0)
      const h = Math.round(r.y1 - r.y0)
      const p = context.getImageData(Math.round(r.x0), Math.round(r.y0), w, h).data
      const rowMeans: number[] = []
      let total = 0
      let grain = 0
      for (let y = 0; y < h; y += 1) {
        let sum = 0
        for (let x = 0; x < w; x += 1) {
          const value = lum(p, (y * w + x) * 4)
          sum += value
          if (x > 0) grain += Math.abs(value - lum(p, (y * w + x - 1) * 4))
        }
        rowMeans.push(sum / w)
        total += sum
      }
      let stripe = 0
      for (let y = 1; y < h; y += 1) stripe += Math.abs(rowMeans[y] - rowMeans[y - 1])
      return { lum: total / (w * h), stripe: stripe / Math.max(1, h - 1), grain: grain / Math.max(1, h * (w - 1)) }
    })
    const rows = (request.rows ?? []).map((r) => {
      const w = Math.round(r.x1 - r.x0)
      const p = context.getImageData(Math.round(r.x0), Math.round(r.y), w, 1).data
      return runsOf(Array.from({ length: w }, (_, x) => line(p, x * 4)), Math.round(r.x0))
    })
    const columns = (request.columns ?? []).map((c) => {
      const h = Math.round(c.y1 - c.y0)
      const p = context.getImageData(Math.round(c.x), Math.round(c.y0), 1, h).data
      return runsOf(Array.from({ length: h }, (_, y) => line(p, y * 4)), Math.round(c.y0))
    })
    return { stats, rows, columns }
  }, { data: image.toString('base64'), type, request })
}

/** The reference's own measures, in CSS points of its 390pt phone. */
async function referenceMeasures(page: Page) {
  const ref = readReference()
  const m = await measure(page, ref.bytes, 'image/jpeg', {
    stats: [REF.sheetBlank, REF.headerOpen, REF.headerClosed],
    rows: [REF.cardRow, REF.sheetRow, REF.navRow],
    columns: [REF.overlapColumn],
  })
  const [card, sheet, nav] = m.rows
  const pt = (px: number) => px / SCALE
  // The card's outer edge, then its bar's inner line; the sheet's left edge only.
  const cardBar = card.length >= 2 ? pt(card[1].start - card[0].start) : null
  const sheetLeftLines = sheet.filter((run) => run.start - sheet[0].start < 30 * SCALE).length
  const [sheetSurface, headerOpen, headerClosed] = m.stats
  const column = m.columns[0]
  return {
    file: ref.file, sha256: ref.sha256, regions: REF,
    cardBarWidth: cardBar,
    sheetLeftLines,
    /** Sheet edges against the navigation's edges (reference points): equal gutters. */
    sheetGutterLeft: pt(sheet[0].start - nav[0].start),
    sheetGutterRight: pt(nav.at(-1)!.end - sheet.at(-1)!.end),
    sheetStripe: sheetSurface.stripe,
    headerDim: headerOpen.lum / headerClosed.lum,
    /** The sheet's lower edge, then lines below it (progress, Previous): the sheet ends above the navigation. */
    overlapLines: column.map((run) => pt(run.start - REF.overlapColumn.y0)),
  }
}
type ReferenceMeasures = Awaited<ReturnType<typeof referenceMeasures>>

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

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
  throw new Error(`Synthetic sheet-surface origin ${origin} did not start`)
}

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
const sheet = (page: Page) => page.locator('section.clr-set-sheet')
const backdrop = (page: Page) => page.locator('.clr-set-sheet-layer__backdrop')
const nav = (page: Page) => page.locator('.clr-workout-nav')
const restBars = (page: Page) => page.getByRole('region', { name: 'Rest', exact: true })

function card(page: Page, name: string): Locator {
  return content(page).locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) }).last()
}

/** As the other B05 specs: serve a bundle with non-secret placeholders when no public URL is configured. */
const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5640 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-sheet-surface.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-sheet-surface-public-placeholder',
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
      await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()
      await expect(content(page).getByRole('button', { name: 'Rest', exact: true }).first()).toBeVisible()
      await checkA11y()
    })
  },
})

/**
 * Reads answer the fixture. The route's one write here — a set observation —
 * is answered by this double and never forwarded; a correction needs a saved
 * set first. Any other request fails the proof.
 */
async function syntheticApp(page: Page, origin: string) {
  const unexpected: string[] = []
  const blockedOutbound: string[] = []
  const mutations: SetObservationMutation[] = []
  const heads = new Map<string, SetObservationAck['head']>()
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
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
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') {
        return reply([fixtureLocation({ id: LOCATION_ID, user_id: OWNER, tier: 'full', name: 'Building gym', is_default: true })])
      }
      if (name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(WORKOUT_EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (name === 'workout_exercises') return reply(WORKOUT_EXERCISES)
      if (['workout_sessions', 'load_anchors', 'location_equipment', 'saved_workout_attempts', 'saved_workouts',
        'saved_workout_completions', 'rest_days', 'user_constraints'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && name === 'block_results') {
      // Answered so a stray section save could not hang; the proof requires none.
      const insert = (request.postDataJSON() as Record<string, unknown>[])[0]
      expect(BLOCK_IDS.has(String(insert.block_id))).toBe(true)
      unexpected.push('POST block_results')
      return reply([blockResultRowSchema.parse({ elapsed_seconds: null, completed_under_cap: null,
        rounds_completed: null, partial_round_reps: null, minutes_completed: null, highest_rung: null,
        perceived_effort: null, notes: null, ...insert, id: '00000000-0000-4000-8000-130000000001',
        created_at: new Date().toISOString() })], 201)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(WORKOUT)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'mutate_set_observation') {
        const p = request.postDataJSON() as Record<string, unknown> & { p_values: Record<string, unknown> }
        const mutation = {
          observation_id: p.p_observation_id, mutation_id: p.p_mutation_id, revision: p.p_revision,
          expected_revision: p.p_expected_revision, operation: p.p_operation,
          exercise_id: p.p_exercise_id, set_number: p.p_set_number, values: p.p_values,
        }
        expect(isSetObservationMutation(mutation)).toBe(true)
        if (!isSetObservationMutation(mutation)) return reply({ outcome: 'invalid' }, 400)
        const previous = heads.get(mutation.observation_id)
        if (previous?.mutation_id === mutation.mutation_id) return reply({ outcome: 'replayed', mutation, head: previous })
        const row = exerciseSetLogRowSchema.parse({
          id: mutation.observation_id, workout_exercise_id: mutation.exercise_id,
          prescription_revision_status: 'active', set_number: mutation.set_number,
          actual_reps: null, actual_duration_seconds: null, actual_distance: null,
          actual_distance_unit: null, weight: null, weight_unit: 'kg', rpe: null,
          is_warmup_set: false, created_at: new Date().toISOString(), effort: null,
          ...(previous?.row ?? {}), ...mutation.values,
          mutation_revision: mutation.revision, last_mutation_id: mutation.mutation_id,
        })
        const ack: SetObservationAck = { outcome: 'applied', mutation,
          head: { revision: mutation.revision, mutation_id: mutation.mutation_id, cleared: false, row } }
        mutations.push(mutation)
        heads.set(mutation.observation_id, ack.head)
        return reply(ack)
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic sheet-surface request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-b05-sheet-surface-session', refreshToken: 'synthetic-b05-sheet-surface-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-sheet-surface@example.invalid' },
    }))
  }, { authKey: AUTH_KEY, owner: OWNER })
  return {
    mutations,
    assertContained() {
      expect(unexpected, 'Every API request must have an explicit synthetic disposition').toEqual([])
      expect(blockedOutbound, 'No request may leave the local origin/API mocks').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Captures and records
// ─────────────────────────────────────────────────────────────────────────────

function sourceIdentity() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Sheet-surface capture requires an actual Git source identity')
  return { head, dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '' }
}

async function screen(page: Page, testInfo: TestInfo, id: string) {
  const png = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  const file = `${id}.png`
  writeFileSync(testInfo.outputPath(file), png)
  await testInfo.attach(file, { path: testInfo.outputPath(file), contentType: 'image/png' })
  return { png, file, sha256: createHash('sha256').update(png).digest('hex') }
}

async function record(page: Page, testInfo: TestInfo, id: string, entry: Record<string, unknown>) {
  const body = JSON.stringify({
    id, ...entry,
    source: sourceIdentity(),
    route: new URL(page.url()).pathname,
    viewport: page.viewportSize(),
    syntheticPublicConfig: SYNTHETIC_ORIGIN_NEEDED,
    browser: `${testInfo.project.name} (Chromium emulation, deviceScaleFactor ${testInfo.project.use.deviceScaleFactor ?? 1})`,
  }, null, 2)
  writeFileSync(testInfo.outputPath(`${id}.json`), body)
  await testInfo.attach(`${id}.json`, { body, contentType: 'application/json' })
}

type Box = { x: number; y: number; width: number; height: number }
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!
const scaled = (b: Box, dpr: number, inset = 0): Rect => ({
  x0: (b.x + inset) * dpr, x1: (b.x + b.width - inset) * dpr, y0: (b.y + inset) * dpr, y1: (b.y + b.height - inset) * dpr,
})

/** The header band, as captured: what the backdrop dims. */
async function headerBand(page: Page): Promise<Box> {
  const header = await box(page.locator('main#main header').first())
  return { x: header.x + 4, y: header.y + 4, width: header.width - 8, height: Math.max(8, header.height - 8) }
}

/**
 * The open sheet, measured against B05-07.3/07.4 and the closed screen before
 * it. Returns the record; every criterion has asserted before it returns.
 */
async function proveSurface(page: Page, testInfo: TestInfo, ref: ReferenceMeasures, options: {
  id: string; consumer: string; state: string; closed: Awaited<ReturnType<typeof screen>>; header: Box; atTop?: boolean
}) {
  const { id, consumer, state, closed, header, atTop = true } = options
  const panel = sheet(page)
  await expect(panel).toHaveCount(1)
  await expect(panel).toBeVisible()
  await expect(backdrop(page)).toHaveCount(1)
  await page.evaluate(() => document.fonts.ready)
  // The sheet's public region sizes itself from the content's measured
  // height: wait until two frames agree before reading any geometry.
  const host = page.locator('.clr-set-sheet-layer__entry')
  await expect(host.locator(':scope > .clr-scroll-region')).toHaveAttribute('data-measured', '')
  await expect.poll(() => host.evaluate(async (element) => {
    const before = element.getBoundingClientRect()
    await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))
    const after = element.getBoundingClientRect()
    return before.height > 0 && before.height === after.height && before.y === after.y
  }), { message: 'the sheet region settles' }).toBe(true)
  const viewport = page.viewportSize()!
  const dpr = await page.evaluate(() => devicePixelRatio)
  // Horizontal edges are the sheet's; the visible vertical extent is its
  // region's, which clips a sheet taller than its allowance.
  const sectionBox = await box(panel)
  const hostBox = await box(host)
  const sheetBox: Box = { x: sectionBox.x, width: sectionBox.width, y: hostBox.y, height: hostBox.height }
  const scrollTop = await host.locator('.clr-scroll-region__scroller').evaluate((element) => element.scrollTop)
  if (atTop) {
    // Opened at its top: the title row and its chevron are whole.
    expect(scrollTop, 'the sheet opens at its top').toBe(0)
    expect(sectionBox.y).toBeGreaterThanOrEqual(hostBox.y - 0.5)
  }
  const navBox = await box(nav(page))
  const frame = panel.locator('.clr-set-sheet__frame')
  const frameBox = await box(frame)
  const titleBox = await box(panel.locator('.clr-set-sheet__title'))
  const chevronBox = await box(panel.getByRole('button', { name: 'Minimize' }))
  const shot = await screen(page, testInfo, id)

  // ── Structure, read from the actual DOM ────────────────────────────────────
  const dom = await panel.evaluate((element) => {
    const frame = element.querySelector<HTMLElement>('.clr-set-sheet__frame')!
    const bars = Array.from(frame.parentElement!.children).filter((child) => child.classList.contains('clr-card__bar'))
    const surface = getComputedStyle(frame, '::before')
    const layer = element.closest('.clr-set-sheet-layer')!
    const shade = layer.querySelector<HTMLElement>('.clr-set-sheet-layer__backdrop')
    const shadeStyle = shade === null ? null : getComputedStyle(shade)
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--surface-backdrop)'
    layer.append(probe)
    const expectedShade = getComputedStyle(probe).backgroundColor
    probe.remove()
    const filtered: string[] = []
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.filter !== 'none' || style.backdropFilter !== 'none') filtered.push(node.className)
    }
    const footer = document.querySelector('.clr-workout-footer__content')!
    const dialogs = document.querySelectorAll('dialog[open]').length
    return {
      bars: bars.length,
      barBeforeFrame: bars[0]?.nextElementSibling === frame,
      barWidth: bars[0]?.getBoundingClientRect().width ?? 0,
      inCard: element.closest('.clr-card') !== null,
      surfaceImage: surface.backgroundImage,
      surfaceColor: surface.backgroundColor,
      shade: shadeStyle === null ? null : {
        image: shadeStyle.backgroundImage, color: shadeStyle.backgroundColor, filter: shadeStyle.backdropFilter,
        expectedColor: expectedShade,
        covers: shade!.getBoundingClientRect().height >= innerHeight - 1 && shade!.getBoundingClientRect().width >= innerWidth - 1,
      },
      filtered,
      footerInert: footer.hasAttribute('inert'),
      dialogs,
    }
  })

  // B05-07.3 — one bar, joined to the frame, on a sheet that is not a card.
  expect(dom.bars, 'exactly one accent bar on the sheet frame').toBe(1)
  expect(dom.barBeforeFrame).toBe(true)
  expect(dom.inCard, 'the sheet is an overlay, not a card').toBe(false)
  // B05-07.4 — a plain opaque surface.
  expect(dom.surfaceImage, 'no scanline layer on the sheet surface').toBe('none')
  expect(dom.surfaceColor).toMatch(/^rgb\(/)
  // The backdrop: the system's dim and slight blur, no texture layers, the whole screen.
  expect(dom.shade).not.toBeNull()
  expect(dom.shade!.image, 'no scanline/static layers on the backdrop').toBe('none')
  expect(dom.shade!.color).toBe(dom.shade!.expectedColor)
  expect(dom.shade!.filter).toBe('blur(0.75px)')
  expect(dom.shade!.covers).toBe(true)
  // The panel itself is drawn sharp: nothing above it filters or blurs it.
  expect(dom.filtered, 'no filter or backdrop-filter on the sheet or its ancestors').toEqual([])
  // Not a native Dialog: no top-layer modal, its own Minimize only.
  expect(dom.dialogs).toBe(0)
  expect(dom.footerInert, 'the covered navigation leaves the focus order').toBe(true)

  // ── Geometry: inset, guttered, covering the navigation ─────────────────────
  const gutterLeft = sheetBox.x - navBox.x
  const gutterRight = navBox.x + navBox.width - (sheetBox.x + sheetBox.width)
  expect(Math.abs(gutterLeft), 'sheet left edge on the page gutter').toBeLessThanOrEqual(1)
  expect(Math.abs(gutterRight), 'sheet right edge on the page gutter').toBeLessThanOrEqual(1)
  expect(Math.abs(gutterLeft - ref.sheetGutterLeft)).toBeLessThanOrEqual(3)
  expect(Math.abs(gutterRight - ref.sheetGutterRight)).toBeLessThanOrEqual(3)
  expect(sheetBox.x, 'not edge-to-edge').toBeGreaterThanOrEqual(12)
  expect(viewport.width - (sheetBox.x + sheetBox.width)).toBeGreaterThanOrEqual(12)
  expect(sheetBox.y, 'not full-screen: dimmed screen remains above').toBeGreaterThanOrEqual(24)
  // Bottom safe-area clearance: the same bottom as the navigation it covers.
  expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(viewport.height + 0.5)
  expect(Math.abs(sheetBox.y + sheetBox.height - (navBox.y + navBox.height))).toBeLessThanOrEqual(1)
  expect(sheetBox.y, 'the sheet covers the navigation, not laid out above it').toBeLessThan(navBox.y)
  for (const name of ['Previous', /^(Next section|Finish workout)$/]) {
    const target = await box(nav(page).getByRole('button', { name }))
    const covered = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('section.clr-set-sheet') !== null,
      { x: target.x + target.width / 2, y: target.y + target.height / 2 })
    expect(covered, `${String(name)} lies under the sheet`).toBe(true)
  }
  // The reference's sheet ended above its navigation: first line (sheet foot) then lines below it.
  expect(ref.overlapLines.length).toBeGreaterThanOrEqual(2)

  // ── Pixels: the actual capture against the reference ──────────────────────
  const barRow = Math.round((titleBox.y + titleBox.height / 2) * dpr)
  const blank: Box = {
    x: titleBox.x + titleBox.width + 8, y: titleBox.y + 2,
    width: chevronBox.x - (titleBox.x + titleBox.width) - 16, height: Math.max(6, titleBox.height - 4),
  }
  expect(blank.width).toBeGreaterThan(24)
  // The screen behind: the header band above the panel only (its glow included).
  const band: Box = { ...header, height: Math.min(header.height, sheetBox.y - 8 - header.y) }
  expect(band.height, 'dimmed screen visible above the sheet').toBeGreaterThan(8)
  const open = await measure(page, shot.png, 'image/png', {
    stats: [scaled(blank, dpr), scaled(band, dpr)],
    rows: [{ y: barRow, x0: Math.max(0, (sheetBox.x - 4) * dpr), x1: (frameBox.x + 6) * dpr }],
  })
  const before = await measure(page, closed.png, 'image/png', { stats: [scaled(band, dpr)] })
  const [surface, dimmed] = open.stats
  const [undimmed] = before.stats
  const lines = open.rows[0]
  const barLines = lines.length >= 2 ? (lines[1].start - lines[0].start) / dpr : null
  const result = {
    accentBar: { lines: lines.length, width: barLines, domWidth: dom.barWidth, referenceCardBar: ref.cardBarWidth, referenceSheetLeftLines: ref.sheetLeftLines },
    gutters: { left: sheetBox.x, right: viewport.width - sheetBox.x - sheetBox.width, versusNavigation: [gutterLeft, gutterRight], reference: [ref.sheetGutterLeft, ref.sheetGutterRight] },
    surface: { stripe: surface.stripe, referenceStripe: ref.sheetStripe },
    backdrop: { dim: dimmed.lum / undimmed.lum, referenceDim: ref.headerDim, stripe: [undimmed.stripe, dimmed.stripe], grain: [undimmed.grain, dimmed.grain] },
    overlay: { sheetTop: sheetBox.y, sheetBottom: sheetBox.y + sheetBox.height, navTop: navBox.y, navBottom: navBox.y + navBox.height },
  }
  // 07.3: the reference sheet has one left line; the actual sheet has the bar's
  // two, as far apart as the reference card's bar.
  expect(ref.sheetLeftLines).toBe(1)
  expect(lines.length, JSON.stringify(result)).toBeGreaterThanOrEqual(2)
  expect(Math.abs(barLines! - ref.cardBarWidth!), JSON.stringify(result)).toBeLessThanOrEqual(3)
  expect(Math.abs(dom.barWidth - 12)).toBeLessThanOrEqual(0.5)
  // 07.4: the reference surface is striped; the actual surface is plain.
  expect(ref.sheetStripe, JSON.stringify(result)).toBeGreaterThan(0.5)
  expect(surface.stripe, JSON.stringify(result)).toBeLessThan(ref.sheetStripe / 3)
  // 07.4: the reference shows no dimming; the actual screen behind is dimmed,
  // not blacked out, adds no lines and no grain (the blur only softens).
  expect(ref.headerDim).toBeGreaterThan(0.9)
  expect(result.backdrop.dim, JSON.stringify(result)).toBeGreaterThan(0.3)
  expect(result.backdrop.dim, JSON.stringify(result)).toBeLessThan(0.8)
  expect(dimmed.stripe, JSON.stringify(result)).toBeLessThanOrEqual(undimmed.stripe + 0.25)
  expect(dimmed.grain, JSON.stringify(result)).toBeLessThan(undimmed.grain)

  await record(page, testInfo, id, {
    consumer, state,
    reference: { file: ref.file, sha256: ref.sha256, regions: ref.regions },
    capture: { file: shot.file, sha256: shot.sha256 },
    before: { file: closed.file, sha256: closed.sha256 },
    measured: result,
    criteria: { 'AC-040': 'passed', 'AC-041': 'passed', 'AC-042': 'passed', 'AC-068': 'passed (local Chromium emulation; physical iPhone UAT pending)' },
  })
  return result
}

/** The sheet's actions: one full-width Log, or the Cancel/Save pair side by side. */
async function proveActions(page: Page, mode: 'single' | 'paired') {
  const form = sheet(page).locator('form')
  const formBox = await box(form)
  const submit = await box(form.locator('button[type="submit"]'))
  if (mode === 'single') {
    expect(Math.abs(submit.width - formBox.width)).toBeLessThanOrEqual(1)
    return
  }
  const cancel = await box(form.getByRole('button', { name: 'Cancel' }))
  // The shared paired group's own contract (shell.css): each cell asks for
  // half the row but never less than its whole-word width, so the pair is one
  // row only when every cell's own width fits in half; otherwise it wraps,
  // Cancel first. Each cell's own width is read with its flex briefly off.
  const fit = await form.locator('.clr-action-group--paired').evaluate((group) => {
    const element = group as HTMLElement
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0
    const cells = Array.from(element.children) as HTMLElement[]
    const own = cells.map((cell) => {
      const { flex, width } = cell.style
      cell.style.flex = 'none'
      cell.style.width = 'max-content'
      const measured = cell.getBoundingClientRect().width
      cell.style.flex = flex
      cell.style.width = width
      return measured
    })
    const half = (element.clientWidth - gap) / 2
    return { cells: own, half, available: element.clientWidth, oneRow: own.every((width) => width <= half + 1) }
  })
  if (fit.oneRow) {
    expect(Math.abs(cancel.y - submit.y)).toBeLessThanOrEqual(1)
    expect(cancel.x + cancel.width).toBeLessThanOrEqual(submit.x)
  } else {
    expect(cancel.y + cancel.height).toBeLessThanOrEqual(submit.y)
    expect(Math.abs(cancel.width - formBox.width)).toBeLessThanOrEqual(1)
  }
  expect(Math.abs(submit.width - (fit.oneRow ? cancel.width : formBox.width))).toBeLessThanOrEqual(1)
  return fit
}

/** Collapse: no panel, no backdrop, the navigation back and reachable. */
async function proveCollapsed(page: Page) {
  await expect(sheet(page)).toHaveCount(0)
  await expect(backdrop(page)).toHaveCount(0)
  await expect(page.locator('.clr-workout-footer__content')).not.toHaveAttribute('inert')
  const previous = nav(page).getByRole('button', { name: 'Previous', exact: true })
  await expect(previous).toBeVisible()
  const target = await box(previous)
  const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.clr-workout-nav') !== null,
    { x: target.x + target.width / 2, y: target.y + target.height / 2 })
  expect(top, 'Previous is the topmost element again').toBe(true)
}

async function remaining(page: Page): Promise<number> {
  await expect(restBars(page)).toHaveCount(1)
  const text = await restBars(page).getByRole('timer', { name: 'Time remaining' }).textContent()
  const digits = /(\d\d):(\d\d)/.exec(text ?? '')
  if (digits === null) throw new Error(`no countdown digits in ${text}`)
  return Number(digits[1]) * 60 + Number(digits[2])
}

const originOf = (baseURL: string | undefined) => new URL(baseURL!).origin

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test('B05-07.3/07.4 reference regions: no bar on the sheet, striped surface, sheet above navigation, undimmed screen', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><title>reference</title>')
  const ref = await referenceMeasures(page)
  const body = JSON.stringify(ref, null, 2)
  expect(ref.cardBarWidth, body).not.toBeNull()
  expect(ref.cardBarWidth!, body).toBeGreaterThan(8)
  expect(ref.cardBarWidth!, body).toBeLessThan(16)
  expect(ref.sheetLeftLines, body).toBe(1)
  expect(Math.abs(ref.sheetGutterLeft), body).toBeLessThanOrEqual(3)
  expect(Math.abs(ref.sheetGutterRight), body).toBeLessThanOrEqual(3)
  expect(ref.sheetStripe, body).toBeGreaterThan(0.5)
  expect(ref.headerDim, body).toBeGreaterThan(0.9)
  expect(ref.overlapLines.length, body).toBeGreaterThanOrEqual(2)
  await testInfo.attach('reference-07-3-07-4.json', { body, contentType: 'application/json' })
})

for (const { name: size, viewport } of [
  { name: 'phone-390x844', viewport: PHONE },
  { name: 'narrow-320x568', viewport: NARROW },
  { name: 'short-390x480', viewport: SHORT },
]) {
  test.describe(`B05 sheet surface @ ${size}`, () => {
    test.use({ viewport })

    test('new entry, correction and the combined superset round share the guttered, barred, opaque sheet over a clean backdrop; collapse restores navigation', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await page.clock.install()
      await visit('/workout')
      const ref = await referenceMeasures(page)
      const squat = card(page, 'back squat')
      const header = await headerBand(page)

      // ── New entry, opened by Rest ────────────────────────────────────────────
      const closed = await screen(page, testInfo, `closed-${size}`)
      // The app atmosphere and the movement cards keep their own CRT lines.
      const cardLines = await squat.locator('.clr-chamfer').first().evaluate((element) => getComputedStyle(element, '::before').backgroundImage)
      expect(cardLines).toContain('repeating-linear-gradient')
      await squat.getByRole('button', { name: 'Rest', exact: true }).click()
      const newEntry = await proveSurface(page, testInfo, ref, { id: `sheet-new-${size}`, consumer: 'SetLoggingSheet new entry (back squat Rest)', state: 'open, rest running', closed, header })
      await proveActions(page, 'single')
      const started = await remaining(page)
      expect(started).toBeLessThanOrEqual(SQUAT_REST)
      expect(app.mutations).toHaveLength(0)

      // Collapse with a draft: nothing saved, rest uninterrupted, navigation back.
      const logForm = page.getByRole('form', { name: 'Log set 1 of back squat' })
      await logForm.getByLabel('Weight').fill('100')
      await page.getByRole('button', { name: 'Minimize' }).click()
      await proveCollapsed(page)
      const collapsed = await screen(page, testInfo, `collapsed-${size}`)
      await page.clock.fastForward(3000)
      const later = await remaining(page)
      expect(later).toBeLessThanOrEqual(started - 3)
      expect(later).toBeGreaterThan(started - 10)
      expect(app.mutations).toHaveLength(0)
      await record(page, testInfo, `collapsed-${size}`, {
        consumer: 'SetLoggingSheet new entry', state: 'collapsed with unsaved draft',
        capture: { file: collapsed.file, sha256: collapsed.sha256 },
        measured: { restBefore: started, restAfter3s: later, writes: app.mutations.length },
        criteria: { 'AC-043': 'passed' },
      })

      // Reopen: the same draft, the same running rest, the same surface.
      await squat.getByRole('button', { name: 'Rest', exact: true }).click()
      await expect(logForm.getByLabel('Weight')).toHaveValue('100')
      expect(await remaining(page)).toBeLessThanOrEqual(later)
      await proveSurface(page, testInfo, ref, { id: `sheet-reopened-${size}`, consumer: 'SetLoggingSheet new entry', state: 'reopened, draft and rest retained', closed, header })
      await logForm.getByLabel('Reps').fill('5')
      await logForm.getByRole('button', { name: 'Log set 1', exact: true }).click()
      await expect.poll(() => app.mutations.length).toBe(1)

      // ── Correction of the saved set ──────────────────────────────────────────
      if (await sheet(page).count() > 0) {
        await page.getByRole('button', { name: 'Minimize' }).click()
      }
      await proveCollapsed(page)
      const closedEdit = await screen(page, testInfo, `closed-edit-${size}`)
      await squat.getByRole('button', { name: 'Edit set 1' }).click()
      await expect(page.getByRole('heading', { name: 'Edit set 1' })).toBeVisible()
      const edit = await proveSurface(page, testInfo, ref, { id: `sheet-edit-${size}`, consumer: 'SetLoggingSheet correction (Edit set 1)', state: 'open', closed: closedEdit, header })
      const pairFit = await proveActions(page, 'paired')
      await record(page, testInfo, `actions-edit-${size}`, {
        consumer: 'SetLoggingSheet correction', state: 'Cancel / Save correction pair', measured: { pairFit },
        criteria: { 'AC-052': 'passed (paired group keeps its own one-row/wrap contract)' },
      })
      // Cancel leaves the stored result alone and ends the correction; the
      // sheet's one collapse is still Minimize.
      await sheet(page).getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('heading', { name: 'Edit set 1' })).toHaveCount(0)
      if (await sheet(page).count() > 0) await page.getByRole('button', { name: 'Minimize' }).click()
      await proveCollapsed(page)
      expect(app.mutations).toHaveLength(1)

      // ── The combined superset round ──────────────────────────────────────────
      await page.getByRole('button', { name: 'All sections', exact: true }).click()
      await page.getByRole('button', { name: /^Accessory, / }).click()
      const pair = content(page).locator('.clr-card').filter({ has: page.getByRole('list', { name: 'Movements in this superset' }) })
      await expect(pair).toBeVisible()
      const closedRound = await screen(page, testInfo, `closed-round-${size}`)
      await pair.getByRole('button', { name: 'Rest', exact: true }).click()
      await expect(page.getByRole('form', { name: 'Log round 1 of bench press and plank' })).toBeAttached()
      const round = await proveSurface(page, testInfo, ref, { id: `sheet-round-${size}`, consumer: 'SetLoggingSheet combined superset round', state: 'open, round rest running', closed: closedRound, header: await headerBand(page) })
      await proveActions(page, 'single')
      await page.getByRole('button', { name: 'Minimize' }).click()
      await proveCollapsed(page)
      expect(app.mutations).toHaveLength(1)

      // The same bar and surface in every mode.
      for (const mode of [edit, round]) {
        expect(Math.abs(mode.accentBar.width! - newEntry.accentBar.width!)).toBeLessThanOrEqual(1)
        expect(mode.surface.stripe).toBeLessThan(0.5)
      }
      app.assertContained()
    })
  })
}

test.describe('B05 sheet surface @ keyboard resize and semantics', () => {
  test.use({ viewport: PHONE })

  test('a keyboard-like resize keeps the guttered sheet scrolling through its public region; focus, Escape and outside taps keep their semantics', async ({ page, visit, baseURL }, testInfo) => {
    const app = await syntheticApp(page, originOf(baseURL))
    await visit('/workout')
    const ref = await referenceMeasures(page)
    const squat = card(page, 'back squat')
    await squat.getByRole('button', { name: 'Rest', exact: true }).click()
    const title = page.getByRole('heading', { name: 'Log set 1' })
    // Opening takes focus to the sheet's title, as before.
    await expect(title).toBeFocused()

    // Escape answers nothing: this is not a native Dialog.
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeVisible()
    // A tap on the dimmed screen above dismisses nothing.
    const sectionTitle = await box(content(page).locator('.clr-card').first())
    await page.mouse.click(sectionTitle.x + sectionTitle.width - 24, sectionTitle.y + 8)
    await expect(sheet(page)).toBeVisible()
    await expect(backdrop(page)).toHaveCount(1)
    // Focus is not trapped: leaving the sheet backwards reaches the screen, never the covered navigation.
    await page.getByRole('button', { name: 'Minimize' }).focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    const outside = await page.evaluate(() => {
      const active = document.activeElement
      return {
        inSheet: active?.closest('section.clr-set-sheet') !== null,
        inNav: active?.closest('.clr-workout-footer__content') !== null,
      }
    })
    expect(outside.inSheet).toBe(false)
    expect(outside.inNav).toBe(false)

    // The keyboard opens: the window shrinks while the Weight field has focus.
    const weight = page.getByRole('form', { name: 'Log set 1 of back squat' }).getByLabel('Weight')
    await weight.focus()
    const closed = await screen(page, testInfo, 'keyboard-before')
    await page.setViewportSize(KEYBOARD)
    await expect(weight).toBeFocused()
    await weight.scrollIntoViewIfNeeded()
    const field = await box(weight)
    expect(field.y).toBeGreaterThanOrEqual(0)
    expect(field.y + field.height).toBeLessThanOrEqual(KEYBOARD.height)
    // The sheet scrolls through the public region: measured, hard-clipped, inside the gutters.
    const region = page.locator('.clr-set-sheet-layer__entry > .clr-scroll-region')
    await expect(region).toHaveAttribute('data-measured', '')
    const scroll = await region.locator(':scope > .clr-scroll-region__scroller').evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY, client: element.clientHeight, scroll: element.scrollHeight,
    }))
    expect(scroll.overflowY).toBe('auto')
    expect(scroll.scroll).toBeGreaterThan(scroll.client)
    const regionBox = await box(region)
    expect(regionBox.y).toBeGreaterThan(0)
    expect(regionBox.y + regionBox.height).toBeLessThanOrEqual(KEYBOARD.height + 0.5)
    await region.locator(':scope > .clr-scroll-region__scroller').evaluate((element) => { element.scrollTop = 0 })
    await proveSurface(page, testInfo, ref, { id: 'sheet-keyboard-390x420', consumer: 'SetLoggingSheet new entry', state: 'keyboard-like resize 844 -> 420, Weight focused, region scrolled to top', closed: await (async () => {
      // The same window, sheet collapsed, as the comparison's undimmed screen.
      await page.getByRole('button', { name: 'Minimize' }).click()
      const shot = await screen(page, testInfo, 'keyboard-closed-390x420')
      await squat.getByRole('button', { name: 'Rest', exact: true }).click()
      return shot
    })(), header: await headerBand(page) })
    await record(page, testInfo, 'semantics', {
      consumer: 'SetLoggingSheet new entry', state: 'focus, Escape, outside tap, keyboard resize',
      before: { file: closed.file, sha256: closed.sha256 },
      measured: { escapeKeptOpen: true, outsideTapKeptOpen: true, focusLeftSheetBackwards: !outside.inSheet, scroll },
      criteria: { 'AC-044': 'passed', 'AC-053': 'passed' },
    })
    await page.setViewportSize(PHONE)
    await page.getByRole('button', { name: 'Minimize' }).click()
    await proveCollapsed(page)
    expect(app.mutations).toHaveLength(0)

    // Unrelated roles are unchanged: the vendor Dialog backdrop keeps its texture.
    const dialogBackdrop = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList
        try { rules = sheet.cssRules } catch { continue }
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule && rule.selectorText === '.clr-dialog::backdrop') return rule.style.background
        }
      }
      return null
    })
    expect(dialogBackdrop).toContain('var(--frame-scan)')
    expect(dialogBackdrop).toContain('feTurbulence')
    app.assertContained()
  })
})
