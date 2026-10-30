import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { blockResultRowSchema, exerciseSetLogRowSchema, sessionSnapshotSchema, type BlockResultRow } from '../src/state/schemas'
import { isSetObservationMutation, type SetObservationAck, type SetObservationMutation } from '../src/state/set-observation-mutation'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../src/test/workout-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — the selected movement hierarchy on active Workout
 * cards (REQ-014, TASK-015).
 *
 * B05-04's selected pane leads each movement with a heavy name row, then a
 * lighter prescription row, then a lighter equipment row. GLOBAL-PATTERNS
 * carries that hierarchy into the shared active `BlockPanel.Movement` role,
 * which the standard logger, the superset logger and the circuit row (closed
 * and with its logger open) all draw. Their counters, logged results,
 * Rest/Log/correction and the B05-06 movement countdown keep their own roles;
 * nothing here adds Review's Swap or inline logging fields.
 *
 * The production `/workout` route runs on a synthetic, non-personal session.
 * Every Auth/PostgREST/function request is answered here and nothing is
 * forwarded; no model is called. Only the explicit Log and correction actions
 * are acknowledged, and each is asserted exactly. The reference regions are
 * read in the reference's own pixels and each actual capture is read the same
 * way. None of this is an installed-iPhone result; physical UAT stays pending.
 */
const OWNER = '00000000-0000-4000-8000-000000000015'
const AUTH_KEY = 'clear.auth.session'
const LOCATION_ID = '00000000-0000-4000-8000-000000000151'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

type Viewport = { width: number; height: number }
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'narrow-320', viewport: { width: 320, height: 568 } },
  { name: 'short-390x480', viewport: { width: 390, height: 480 } },
]

// Long names are this spec's own, never the reference's demo movements.
const LUNGE = 'single-arm-kettlebell-overhead-reverse-lunge'
const HOLD = 'hollow-body-hold'
const ROW = 'alternating-dumbbell-renegade-row-to-push-up'
const PLANK = 'plank'
const CLIMBER = 'mountain-climber-cross-body-knee-drive'
const CRAWL = 'bear-crawl'
const name = (id: string) => id.replaceAll('-', ' ')
const HOLD_SECONDS = 30
const PLANK_SECONDS = 20
const CRAWL_SECONDS = 20
const LUNGE_REST = 60

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic B05 active hierarchy workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: LOCATION_ID, goal_preset: 'strength' },
  sections: [
    { title: 'Strength', sectionType: 'accessory', blocks: [{ exercises: [
      { prescription: { exercise_id: LUNGE, order_index: 0, equipment_used: 'kettlebell', sets: 2,
        target_value: 8, rest_seconds: LUNGE_REST } },
      { prescription: { exercise_id: HOLD, order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
        load_value: null, modality: 'time', target_value: HOLD_SECONDS, sets: 2, rest_seconds: 45 } },
    ] }] },
    { title: 'Pair', sectionType: 'accessory', blocks: [{
      structureType: 'superset', rounds: 2, roundRestSeconds: 60,
      exercises: [
        { prescription: { exercise_id: ROW, order_index: 0, equipment_used: 'dumbbell', target_value: 8, sets: 2,
          rest_seconds: null } },
        { prescription: { exercise_id: PLANK, order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'time', target_value: PLANK_SECONDS, sets: 2, rest_seconds: null } },
      ],
    }] },
    { title: 'Conditioning', sectionType: 'conditioning', blocks: [{
      structureType: 'circuit', rounds: 2, roundRestSeconds: 20,
      exercises: [
        { prescription: { exercise_id: CLIMBER, order_index: 0, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, target_value: 12, sets: 2, rest_seconds: null } },
        { prescription: { exercise_id: CRAWL, order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'time', target_value: CRAWL_SECONDS, sets: 2, rest_seconds: null } },
      ],
    }] },
  ],
}))
const EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
const EXERCISE_ID = new Map(EXERCISES.map((exercise) => [exercise.exercise_id, exercise.id]))

// ─────────────────────────────────────────────────────────────────────────────
// The reference and its regions
// ─────────────────────────────────────────────────────────────────────────────

const REFERENCE_FILE = 'sources/source-07-B05-04-review-grouping.jpg'
const REFERENCE_SHA256 = 'c1ddd3384b41d6b3a5d053633df2d779c1a2c3272e183d68ec933bfb1cb948ac'
const TIMER_REFERENCE = {
  file: 'sources/source-09-B05-06-movement-timer.jpg',
  sha256: '489dded0b4d90dd6789e23e352d5ec29cc96aa96a1abd6ee4be14d3f606f8aab',
  region: '06.2/06.3 — countdown above its Start/Reset pair, inside the movement card above its entry action (placement only; TASK-014 owns the arrangement proof)',
}
const REFERENCE_DIRS = [
  process.env.B05_EVIDENCE_DIR,
  resolve(import.meta.dirname, '..', '..', '.evidence', basename(resolve(import.meta.dirname, '..'))),
].filter((dir): dir is string => dir !== undefined && dir !== '')

function readReference(file: string, sha256: string) {
  const dir = REFERENCE_DIRS.find((candidate) => existsSync(resolve(candidate, file)))
  if (dir === undefined) throw new Error(`B05 reference ${file} is not readable from ${REFERENCE_DIRS.join(', ')}`)
  const bytes = readFileSync(resolve(dir, file))
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== sha256) throw new Error(`B05 reference ${file} changed: ${actual}`)
  return bytes
}

/**
 * B05-04's selected (right) pane, in the reference's own 2168 × 846 pixels:
 * each movement's three tiers from just above its name to just below its
 * equipment, stopping short of the Swap column on the right and the purple
 * rules between movements. Swap is Review's; an active card has none.
 */
type Region = { x: number; y: number; width: number; height: number }
const REFERENCE_REGIONS: ReadonlyArray<Region & { id: string; description: string }> = [
  { id: '04-selected-1', x: 1462, y: 190, width: 533, height: 148,
    description: 'Selected pane, first movement: MOUNTAIN CLIMBERS / 12 reps / Bodyweight (Swap column excluded)' },
  { id: '04-selected-2', x: 1462, y: 382, width: 533, height: 148,
    description: 'Selected pane, second movement: SQUAT JUMPS / 10 reps / Bodyweight (Swap column excluded)' },
  { id: '04-selected-3', x: 1462, y: 574, width: 533, height: 148,
    description: 'Selected pane, third movement: BEAR CRAWL / 20 sec / Bodyweight (Swap column excluded)' },
]

/**
 * A movement's text, read from pixels: rows of ink banded into lines, each
 * weighed by its mean stroke run times its dense glyph height (both grow with
 * face size and boldness, neither with line length), plus its mean ink
 * brightness. Ink is any pixel well above the region's own background that is
 * not the purple structure stroke. `exclude` blanks one rectangle — the active
 * counter, which stands where Review's Swap stands and is not a tier.
 */
async function analyse(page: Page, image: Buffer, mime: string, region: Region | null, exclude: Region | null) {
  return page.evaluate(async ({ data, mime, region, exclude }) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }))
    const r = region ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
    const canvas = new OffscreenCanvas(r.width, r.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(bitmap, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height)
    const pixels = context.getImageData(0, 0, r.width, r.height).data
    const { width, height } = r
    const lum = (i: number) => 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
    const all: number[] = []
    for (let i = 0; i < pixels.length; i += 16) all.push(lum(i))
    all.sort((a, b) => a - b)
    const background = all[Math.floor(all.length / 2)]
    const excluded = (x: number, y: number) => exclude !== null &&
      x >= exclude.x && x < exclude.x + exclude.width && y >= exclude.y && y < exclude.y + exclude.height
    const rowInk: number[] = []
    const rowBright: number[] = []
    const strokes: { length: number; runs: number }[] = []
    for (let y = 0; y < height; y += 1) {
      let ink = 0
      let bright = 0
      let run = 0
      const stroke = { length: 0, runs: 0 }
      for (let x = 0; x <= width; x += 1) {
        const i = (y * width + x) * 4
        let on = false
        if (x < width && !excluded(x, y)) {
          const [red, green, blue] = [pixels[i], pixels[i + 1], pixels[i + 2]]
          const purple = blue > green + 40 && red > green
          const l = lum(i)
          on = l > background + 60 && !purple
          if (on) bright += l
        }
        if (on) { ink += 1; run += 1 } else if (run > 0) {
          stroke.length += run
          stroke.runs += 1
          run = 0
        }
      }
      rowInk.push(ink)
      rowBright.push(bright)
      strokes.push(stroke)
    }
    const gap = Math.max(2, Math.round(height * 0.012))
    const bands: { top: number; bottom: number }[] = []
    rowInk.forEach((value, y) => {
      if (value <= 2) return
      const last = bands.at(-1)
      if (last && y - last.bottom <= gap) last.bottom = y
      else bands.push({ top: y, bottom: y })
    })
    // A frame's stroke is a rule, not a line of text: its runs span much of the width.
    const isRule = (band: { top: number; bottom: number }) => {
      for (let y = band.top; y <= band.bottom; y += 1) {
        if (strokes[y].runs > 0 && strokes[y].length / strokes[y].runs > width * 0.3) return true
      }
      return false
    }
    const lines = bands.filter((band) => band.bottom - band.top >= gap * 2 && !isRule(band)).map((band) => {
      let length = 0
      let runs = 0
      let peak = 0
      let ink = 0
      let bright = 0
      for (let y = band.top; y <= band.bottom; y += 1) {
        length += strokes[y].length
        runs += strokes[y].runs
        peak = Math.max(peak, rowInk[y])
        ink += rowInk[y]
        bright += rowBright[y]
      }
      let dense = 0
      for (let y = band.top; y <= band.bottom; y += 1) if (rowInk[y] >= peak / 3) dense += 1
      const stroke = length / Math.max(1, runs)
      return {
        top: band.top / height, bottom: band.bottom / height, dense,
        stroke: Math.round(stroke * 100) / 100,
        weight: Math.round(stroke * dense * 100) / 100,
        brightness: Math.round(bright / Math.max(1, ink)),
      }
    })
    return { size: { width, height }, background: Math.round(background), lines }
  }, { data: image.toString('base64'), mime, region, exclude })
}

type Reading = Awaited<ReturnType<typeof analyse>>

/**
 * The B05-04 relationships, normalised by the name line so a reference read
 * at its JPEG scale and a capture read at the device scale are comparable:
 * the name leads (wrapped lines continue at its weight), then exactly two
 * lighter tiers, the prescription above and heavier than the equipment.
 */
function hierarchy(reading: Reading) {
  const [first] = reading.lines
  if (first === undefined) return { nameLines: 0, tiers: 0, nameDominant: false, prescriptionOverEquipment: false, prescriptionRatio: 0, equipmentRatio: 0 }
  const heavy = (line: { weight: number }) => line.weight >= first.weight * 0.8
  const continuation = reading.lines.findIndex((line, index) => index > 0 && !heavy(line))
  const nameLines = continuation === -1 ? reading.lines.length : continuation
  const below = continuation === -1 ? [] : reading.lines.slice(continuation)
  const [prescription, equipment] = below
  return {
    nameLines,
    tiers: below.length,
    nameDominant: below.length > 0 && below.every((line) => !heavy(line)),
    prescriptionOverEquipment: prescription !== undefined && equipment !== undefined &&
      prescription.bottom <= equipment.top && prescription.weight > equipment.weight,
    prescriptionRatio: prescription === undefined ? 0 : Math.round(prescription.weight / first.weight * 1000) / 1000,
    equipmentRatio: equipment === undefined ? 0 : Math.round(equipment.weight / first.weight * 1000) / 1000,
  }
}

type Hierarchy = ReturnType<typeof hierarchy>

/** One verdict per relationship, against the reference's own reading. */
function compare(actual: Hierarchy, reference: Hierarchy) {
  return {
    nameDominant: actual.nameDominant === reference.nameDominant,
    twoSubordinateTiers: actual.tiers === 2 && reference.tiers === 2,
    prescriptionOverEquipment: actual.prescriptionOverEquipment === reference.prescriptionOverEquipment,
    // The same steps down, within half again either way of the reference.
    prescriptionStep: actual.prescriptionRatio > reference.prescriptionRatio / 1.5 &&
      actual.prescriptionRatio < reference.prescriptionRatio * 1.5,
    equipmentStep: actual.equipmentRatio > reference.equipmentRatio / 1.5 &&
      actual.equipmentRatio < reference.equipmentRatio * 1.5,
  }
}

async function referenceHierarchy(page: Page) {
  const bytes = readReference(REFERENCE_FILE, REFERENCE_SHA256)
  const readings: { region: (typeof REFERENCE_REGIONS)[number]; reading: Reading; hierarchy: Hierarchy }[] = []
  for (const region of REFERENCE_REGIONS) {
    const reading = await analyse(page, bytes, 'image/jpeg', region, null)
    readings.push({ region, reading, hierarchy: hierarchy(reading) })
  }
  // The pictured movements step down alike; their mean is the reference.
  const mean = (pick: (h: Hierarchy) => number) =>
    Math.round(readings.reduce((sum, { hierarchy }) => sum + pick(hierarchy), 0) / readings.length * 1000) / 1000
  const measured: Hierarchy = {
    nameLines: 1,
    tiers: 2,
    nameDominant: readings.every(({ hierarchy }) => hierarchy.nameDominant),
    prescriptionOverEquipment: readings.every(({ hierarchy }) => hierarchy.prescriptionOverEquipment),
    prescriptionRatio: mean((h) => h.prescriptionRatio),
    equipmentRatio: mean((h) => h.equipmentRatio),
  }
  return { file: REFERENCE_FILE, sha256: REFERENCE_SHA256, readings, measured }
}

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
  throw new Error(`Synthetic active-hierarchy origin ${origin} did not start`)
}

/** As the other B05 specs: serve a bundle with non-secret placeholders when no public URL is configured. */
const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5680 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-active-hierarchy.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-active-hierarchy-public-placeholder',
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
      // Scan only after the actual route and its populated movement surface are ready.
      await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()
      await expect(content(page).getByRole('heading', { name: name(LUNGE), exact: true })).toBeVisible()
      await checkA11y()
    })
  },
})

/** Only explicit Log and correction actions are acknowledged; each is recorded exactly. */
async function syntheticApp(page: Page, origin: string) {
  const exerciseIds = new Set(EXERCISES.map((exercise) => exercise.id))
  const unexpected: string[] = []
  const blockedOutbound: string[] = []
  const attempts: SetObservationMutation[] = []
  const mutations: SetObservationMutation[] = []
  const heads = new Map<string, SetObservationAck['head']>()
  const blockResults: BlockResultRow[] = []
  let failNext = false
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: false })
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
    const last = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (last === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (last === 'locations') {
        return reply([fixtureLocation({ id: LOCATION_ID, user_id: OWNER, tier: 'full', name: 'Building gym', is_default: true })])
      }
      if (last === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (last === 'workout_exercises') return reply(EXERCISES)
      if (['workout_sessions', 'load_anchors', 'location_equipment', 'saved_workout_attempts', 'saved_workouts',
        'saved_workout_completions', 'rest_days', 'user_constraints'].includes(last)) return reply([])
      if (last === 'block_results') return reply(blockResults)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (last === 'resume_session' || last === 'session_snapshot') return reply(WORKOUT)
      if (last === 'session_as_performed') return reply(null)
      if (last === 'mutate_set_observation') {
        const p = request.postDataJSON() as Record<string, unknown>
        const mutation = { observation_id: p.p_observation_id, mutation_id: p.p_mutation_id,
          revision: p.p_revision, expected_revision: p.p_expected_revision, operation: p.p_operation,
          exercise_id: p.p_exercise_id, set_number: p.p_set_number, values: p.p_values } as SetObservationMutation
        if (!isSetObservationMutation(mutation)) {
          unexpected.push('invalid set observation')
          return reply({ outcome: 'invalid' }, 400)
        }
        attempts.push(mutation)
        if (failNext) {
          failNext = false
          return reply({ code: 'PGRST000', message: 'Synthetic: refused once.' }, 503)
        }
        expect(exerciseIds.has(mutation.exercise_id)).toBe(true)
        const previous = heads.get(mutation.observation_id)
        if (previous?.mutation_id === mutation.mutation_id) return reply({ outcome: 'replayed', mutation, head: previous })
        if (mutation.operation === 'insert') {
          expect(previous).toBeUndefined()
          expect(mutation.expected_revision).toBe(0)
        } else {
          expect(mutation.operation).toBe('correct')
          expect(mutation.expected_revision).toBe(previous!.revision)
        }
        const row = exerciseSetLogRowSchema.parse({
          ...(previous?.row ?? {}),
          id: mutation.observation_id, workout_exercise_id: mutation.exercise_id,
          prescription_revision_status: 'active', set_number: mutation.set_number,
          actual_reps: null, actual_duration_seconds: null, actual_distance: null,
          actual_distance_unit: null, weight: null, weight_unit: 'kg', rpe: null,
          is_warmup_set: false, created_at: new Date().toISOString(), effort: null,
          ...mutation.values, mutation_revision: mutation.revision, last_mutation_id: mutation.mutation_id,
        })
        const head = { revision: mutation.revision, mutation_id: mutation.mutation_id, cleared: false, row }
        mutations.push(mutation)
        heads.set(mutation.observation_id, head)
        return reply({ outcome: 'applied', mutation, head } satisfies SetObservationAck)
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(last)) {
        return reply([])
      }
    }
    if (request.method() === 'POST' && last === 'block_results') {
      // Leaving a section records that section's result; it is not a set.
      const insert = (request.postDataJSON() as Record<string, unknown>[])[0]
      const row = blockResultRowSchema.parse({ elapsed_seconds: null, completed_under_cap: null,
        rounds_completed: null, partial_round_reps: null, minutes_completed: null, highest_rung: null,
        perceived_effort: null, notes: null, ...insert,
        id: `00000000-0000-4000-8000-1500000000${String(blockResults.length + 1).padStart(2, '0')}`,
        created_at: new Date().toISOString() })
      blockResults.push(row)
      return reply([row], 201)
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic active-hierarchy request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-b05-active-hierarchy-session', refreshToken: 'synthetic-b05-active-hierarchy-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-active-hierarchy@example.invalid' },
    }))
  }, { authKey: AUTH_KEY, owner: OWNER })
  return {
    attempts,
    mutations,
    blockResults,
    failNextMutation() { failNext = true },
    assertContained() {
      expect(unexpected, 'Every API request must have an explicit synthetic disposition').toEqual([])
      expect(blockedOutbound, 'No request may leave the local origin/API mocks').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

function sourceIdentity() {
  const cwd = resolve(import.meta.dirname, '..')
  const git = (args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 10_000 }).trim()
  const head = git(['rev-parse', 'HEAD'])
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Active hierarchy capture requires an actual Git source identity')
  const frame = createHash('sha256').update(readFileSync(resolve(cwd, 'src/ui/block-renderers-frame.tsx'))).digest('hex')
  return { head, dirty: git(['status', '--porcelain', '--untracked-files=all']) !== '', blockRenderersFrameSha256: frame }
}

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
const sheet = (page: Page) => page.locator('section.clr-set-sheet')

/** The movement's own section, by its heading, on the main screen. */
function movement(page: Page, heading: string): Locator {
  return content(page).getByRole('heading', { name: heading, exact: true }).locator('xpath=ancestor::section[1]')
}

async function collapseSheet(page: Page) {
  await page.getByRole('button', { name: 'Minimize' }).click()
  await expect(sheet(page)).toHaveCount(0)
}

async function settleFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))
  })
}

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number }

/** The three tiers and the counter as drawn: boxes, faces and line counts. */
async function tiers(section: Locator) {
  return section.evaluate((element) => {
    const box = (node: Element | null): Box | null => {
      if (node === null) return null
      const { left, right, top, bottom, width, height } = node.getBoundingClientRect()
      return { left, right, top, bottom, width, height }
    }
    const face = (node: Element | null) => {
      if (node === null) return null
      const style = getComputedStyle(node)
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2
      const rect = node.getBoundingClientRect()
      return {
        ...box(node)!,
        text: node.textContent ?? '',
        fontSize: parseFloat(style.fontSize),
        fontWeight: Number(style.fontWeight),
        fontFamily: style.fontFamily,
        color: style.color,
        textTransform: style.textTransform,
        lines: Math.round(rect.height / lineHeight),
        clipped: (node as HTMLElement).scrollWidth > (node as HTMLElement).clientWidth + 1,
      }
    }
    const heading = element.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > [data-movement-name-row] > :is(h1, h2, h3, h4, h5, h6)')
    const counterRow = element.querySelector(':scope > [data-movement-name-row]')
    return {
      section: box(element)!,
      sectionOverflows: element.scrollWidth > element.clientWidth + 1,
      name: face(heading)!,
      counter: face(counterRow?.querySelector(':scope > span') ?? null),
      detail: face(element.querySelector(':scope > [data-movement-detail]')),
      equipment: face(element.querySelector(':scope > [data-movement-context]')),
      countdown: box(element.querySelector('section.clr-movement-countdown[aria-label$=" countdown"]')),
      // The entry action: the card's own Rest, or a superset block's one Rest after its members.
      entry: (() => {
        const rests = (root: Element | null) => root === null ? [] : Array.from(root.querySelectorAll('button'))
          .filter((button) => button.textContent?.trim() === 'Rest' || /^Rest for /.test(button.getAttribute('aria-label') ?? ''))
        const own = rests(element).at(-1) ?? rests(element.closest('.clr-card')).at(-1) ?? null
        return own === null ? null : { ...box(own)!, label: own.getAttribute('aria-label') ?? own.textContent?.trim() ?? '' }
      })(),
      logged: box(element.querySelector(':scope [aria-label="Logged sets"]')),
      // Logging fields only: the existing coaching panel's own Notes box is not one.
      inlineFields: Array.from(element.querySelectorAll<HTMLInputElement>('input, select, textarea')).filter((field) =>
        !/^Notes\b/.test(field.getAttribute('aria-label') ?? field.labels?.[0]?.textContent ?? '')).length,
      swaps: Array.from(element.querySelectorAll('button')).filter((button) => /swap/i.test(button.textContent ?? '')).length,
    }
  })
}

type Tiers = Awaited<ReturnType<typeof tiers>>
const TOLERANCE = 1

function overlaps(a: Box, b: Box) {
  return a.left < b.right - TOLERANCE && b.left < a.right - TOLERANCE &&
    a.top < b.bottom - TOLERANCE && b.top < a.bottom - TOLERANCE
}

/** AC-054 in the DOM: three distinct tiers, the name leading, nothing colliding. */
function expectTiers(found: Tiers, context: string) {
  const detail = `${context}: ${JSON.stringify(found)}`
  const { name: n, detail: d, equipment: e, counter: c, section } = found
  expect(d, detail).not.toBeNull()
  expect(e, detail).not.toBeNull()
  expect(n.fontSize, detail).toBeGreaterThan(d!.fontSize)
  expect(d!.fontSize, detail).toBeGreaterThan(e!.fontSize)
  expect(n.fontWeight, detail).toBeGreaterThanOrEqual(600)
  expect(n.textTransform, detail).toBe('uppercase')
  expect(n.fontFamily, detail).not.toBe(d!.fontFamily)
  expect(d!.color, detail).not.toBe(e!.color)
  // Stacked in order, never overlapping, nothing clipped or overflowing.
  expect(d!.top, detail).toBeGreaterThanOrEqual(Math.max(n.bottom, c?.bottom ?? 0) - TOLERANCE)
  expect(e!.top, detail).toBeGreaterThanOrEqual(d!.bottom - TOLERANCE)
  for (const face of [n, d!, e!]) {
    expect(face.clipped, detail).toBe(false)
    expect(face.left, detail).toBeGreaterThanOrEqual(section.left - TOLERANCE)
    expect(face.right, detail).toBeLessThanOrEqual(section.right + TOLERANCE)
  }
  expect(found.sectionOverflows, detail).toBe(false)
  if (c !== null) {
    // The counter keeps its own column at the name row's end.
    expect(overlaps(n, c), detail).toBe(false)
    expect(c.left, detail).toBeGreaterThanOrEqual(n.right - TOLERANCE)
    expect(section.right - c.right, detail).toBeLessThanOrEqual(2)
    expect(c.top, detail).toBeLessThan(n.top + n.fontSize * 1.5)
    expect(c.fontSize, detail).toBeLessThan(n.fontSize)
  }
  // Review's Swap and the rejected inline logging fields stay out of the card.
  expect(found.swaps, detail).toBe(0)
  expect(found.inlineFields, detail).toBe(0)
}

/** The name role is one role: the same face in every consumer. */
function nameRole(found: Tiers) {
  const { fontSize, fontWeight, fontFamily, color, textTransform } = found.name
  return { fontSize, fontWeight, fontFamily, color, textTransform }
}

/** Capture the three tiers as drawn and read them the way the reference is read. */
async function capture(page: Page, testInfo: TestInfo, id: string, section: Locator) {
  // The tiers centred in the scroller, clear of the header and the footer.
  const centre = () => section.evaluate((element) =>
    element.firstElementChild!.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const clipOf = (at: Tiers) => {
    const top = at.name.top - 2
    return { x: at.section.left, y: top, width: at.section.width, height: at.equipment!.bottom - top }
  }
  const fits = async (clip: { y: number; height: number }) => {
    const scroller = (await content(page).boundingBox())!
    return { scroller, fits: clip.y >= scroller.y && clip.y + clip.height <= scroller.y + scroller.height }
  }
  await centre()
  await settleFonts(page)
  await page.mouse.move(0, 0)
  const found = await tiers(section)
  const viewportShot = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  let clip = clipOf(found)
  let window = await fits(clip)
  const viewport = page.viewportSize()!
  let captureWindow: Viewport = viewport
  if (!window.fits) {
    // A short phone's scroller is shorter than a wrapped name's three tiers.
    // Read them whole in a taller window of the same width: every line wraps
    // exactly as on the phone, and nothing sits under the header or footer.
    captureWindow = { width: viewport.width, height: 1600 }
    await page.setViewportSize(captureWindow)
    await centre()
    await settleFonts(page)
    const tall = await tiers(section)
    expect({ name: tall.name.lines, width: tall.section.width, detail: tall.detail!.lines, equipment: tall.equipment!.lines },
      'the taller window wraps every tier exactly as the phone does')
      .toEqual({ name: found.name.lines, width: found.section.width, detail: found.detail!.lines, equipment: found.equipment!.lines })
    clip = clipOf(tall)
    window = await fits(clip)
  }
  expect(window.fits, `tiers fully inside the visible scroller: ${JSON.stringify({ clip, window, captureWindow })}`).toBe(true)
  const tierShot = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' })
  const cardShot = await section.screenshot({ animations: 'disabled', caret: 'hide' })
  const counterNow = captureWindow === viewport ? found.counter : (await tiers(section)).counter
  if (captureWindow !== viewport) {
    await page.setViewportSize(viewport)
    await centre()
  }
  const scale = await page.evaluate(() => devicePixelRatio)
  const exclude = counterNow === null ? null : {
    x: Math.floor((counterNow.left - 2 - clip.x) * scale), y: 0,
    width: Math.ceil((clip.x + clip.width - counterNow.left + 2) * scale),
    height: Math.ceil((counterNow.bottom + 2 - clip.y) * scale),
  }
  const reading = await analyse(page, tierShot, 'image/png', null, exclude)
  const files = { tiers: `${id}.png`, card: `${id}-card.png`, viewport: `${id}-viewport.png` }
  for (const [file, png] of [[files.tiers, tierShot], [files.card, cardShot], [files.viewport, viewportShot]] as const) {
    writeFileSync(testInfo.outputPath(file), png)
    await testInfo.attach(file, { path: testInfo.outputPath(file), contentType: 'image/png' })
  }
  const hash = (png: Buffer) => createHash('sha256').update(png).digest('hex')
  return {
    found,
    reading,
    measured: hierarchy(reading),
    capture: {
      tiers: { file: files.tiers, sha256: hash(tierShot), clipCss: clip, counterExcludedPx: exclude,
        captureWindow, phoneScroller: window.scroller },
      card: { file: files.card, sha256: hash(cardShot) },
      viewport: { file: files.viewport, sha256: hash(viewportShot) },
    },
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
    physicalIphoneUat: 'pending — not observed',
  }, null, 2)
  writeFileSync(testInfo.outputPath(`${id}.json`), body)
  await testInfo.attach(`${id}.json`, { body, contentType: 'application/json' })
}

type Reference = Awaited<ReturnType<typeof referenceHierarchy>>

/**
 * One consumer/state: the DOM tiers, then the capture compared with B05-04.
 * Every relationship must hold; the verdict is recorded with its evidence.
 */
async function prove(page: Page, testInfo: TestInfo, ref: Reference, options: {
  id: string; heading: string; consumer: string; state: string; viewport: Viewport; longName: boolean
  criteria: string[]; extra?: Record<string, unknown>
}) {
  const section = movement(page, options.heading)
  const shot = await capture(page, testInfo, options.id, section)
  expectTiers(shot.found, `${options.id}`)
  const verdict = compare(shot.measured, ref.measured)
  const detail = `${options.id}: ${JSON.stringify({ actual: shot.measured, reference: ref.measured, lines: shot.reading.lines })}`
  expect(verdict, detail).toEqual({
    nameDominant: true, twoSubordinateTiers: true, prescriptionOverEquipment: true,
    prescriptionStep: true, equipmentStep: true,
  })
  expect(shot.measured.nameLines, detail).toBe(shot.found.name.lines)
  await record(page, testInfo, options.id, {
    consumer: options.consumer, state: options.state, viewport: options.viewport,
    reference: { file: ref.file, sha256: ref.sha256, regions: REFERENCE_REGIONS, measured: ref.measured },
    timerReference: TIMER_REFERENCE,
    dom: shot.found, measured: { reference: ref.measured, actual: shot.measured, lines: shot.reading.lines },
    comparison: verdict, capture: shot.capture, longName: options.longName, ...options.extra,
    criteria: Object.fromEntries(options.criteria.map((criterion) => [criterion, 'pass'])),
  })
  return shot.found
}

/** B05-06: the movement countdown in its own card, below the tiers, above the entry. */
function expectTimerPlacement(found: Tiers, entryLabel: string, context: string) {
  const detail = `${context}: ${JSON.stringify(found)}`
  expect(found.countdown, detail).not.toBeNull()
  expect(found.entry?.label, detail).toBe(entryLabel)
  const countdown = found.countdown!
  const entry = found.entry!
  expect(countdown.top, detail).toBeGreaterThanOrEqual(found.equipment!.bottom - TOLERANCE)
  expect(countdown.bottom, detail).toBeLessThanOrEqual(entry.top + TOLERANCE)
  expect(countdown.left, detail).toBeGreaterThanOrEqual(found.section.left - TOLERANCE)
  expect(countdown.right, detail).toBeLessThanOrEqual(found.section.right + TOLERANCE)
}

/** No unrelated heading/paragraph restyle: the screen title and block label keep their roles. */
async function expectUnrelatedRoles(page: Page) {
  const roles = await page.evaluate(() => {
    // Each token resolved where the element itself sits: skins and card scopes re-declare them.
    const token = (beside: Element, name: string) => {
      const probe = document.createElement('span')
      probe.style.fontSize = `var(${name})`
      beside.parentElement!.append(probe)
      const size = parseFloat(getComputedStyle(probe).fontSize)
      probe.remove()
      return size
    }
    const h1 = document.querySelector('h1')!
    const label = document.querySelector('[data-block-top-row] > span')!
    return {
      h1: parseFloat(getComputedStyle(h1).fontSize), h1Token: token(h1, '--heading-h1-size'),
      label: parseFloat(getComputedStyle(label).fontSize), labelToken: token(label, '--label-xs-size'),
    }
  })
  expect(roles.h1, JSON.stringify(roles)).toBe(roles.h1Token)
  expect(roles.label, JSON.stringify(roles)).toBe(roles.labelToken)
}

const originOf = (baseURL: string | undefined) => new URL(baseURL!).origin

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test('B05-04 selected reference regions read as name, then prescription, then lighter equipment', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><title>reference</title>')
  const ref = await referenceHierarchy(page)
  const detail = JSON.stringify(ref)
  for (const { hierarchy: h } of ref.readings) {
    expect(h.nameLines, detail).toBe(1)
    expect(h.tiers, detail).toBe(2)
    expect(h.nameDominant, detail).toBe(true)
    expect(h.prescriptionOverEquipment, detail).toBe(true)
  }
  await testInfo.attach('reference-04-selected.json', { body: JSON.stringify(ref, null, 2), contentType: 'application/json' })
})

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 active movement hierarchy @ ${size}`, () => {
    test.use({ viewport })

    test('standard logger cards: selected hierarchy with long names; counter, Rest/Log, saved result, refusal, correction and countdown keep their roles', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await page.clock.install()
      await visit('/workout')
      const ref = await referenceHierarchy(page)
      const consumer = 'Workout · standard ExerciseSetLogger card (src/ui/set-logger.tsx → BlockPanel.Movement)'
      const lunge = name(LUNGE)
      const lungeCard = movement(page, lunge)
      const rest = lungeCard.getByRole('button', { name: 'Rest', exact: true })

      await expectUnrelatedRoles(page)
      await expect(content(page).getByRole('button', { name: /swap/i })).toHaveCount(0)
      await expect(content(page).getByRole('button', { name: /^log( set| round)?( \d+)?$/i })).toHaveCount(0)
      await expect(lungeCard.getByText('Set 1/2', { exact: true })).toBeVisible()

      const ready = await prove(page, testInfo, ref, {
        id: `standard-long-ready-${size}`, heading: lunge, consumer, state: 'ready, nothing logged, long name',
        viewport, longName: true, criteria: ['AC-054', 'AC-069'],
      })
      expect(ready.counter?.text).toBe('Set 1/2')
      if (viewport.width <= 320) expect(ready.name.lines, 'a long name wraps at narrow width').toBeGreaterThanOrEqual(2)
      const role = nameRole(ready)

      // ── Rest opens the sheet and starts rest; Log set 1 inside it saves ──
      await rest.click()
      const restTimer = sheet(page).getByRole('region', { name: 'Rest', exact: true }).getByRole('timer', { name: 'Time remaining' })
      await expect(restTimer).toBeVisible()
      expect(app.attempts).toEqual([])
      const form1 = page.getByRole('form', { name: `Log set 1 of ${lunge}` })
      await form1.getByLabel('Reps').fill('8')
      await form1.getByRole('button', { name: 'Log set 1', exact: true }).click()
      await expect.poll(() => app.mutations.length).toBe(1)
      expect(app.mutations[0]).toMatchObject({ operation: 'insert', exercise_id: EXERCISE_ID.get(LUNGE), set_number: 1,
        values: { actual_reps: 8 } })
      await expect(restTimer).toBeVisible()
      await collapseSheet(page)
      const saved = lungeCard.getByRole('list', { name: 'Logged sets' }).getByRole('listitem').filter({ hasText: 'Set 1' })
      await expect(saved).toContainText('8 reps')
      await expect(saved).toContainText('Saved')
      await expect(lungeCard.getByText('Set 2/2', { exact: true })).toBeVisible()

      const logged = await prove(page, testInfo, ref, {
        id: `standard-long-logged-${size}`, heading: lunge, consumer, state: 'set 1 saved via Rest → Log set 1; counter Set 2/2; rest running',
        viewport, longName: true, criteria: ['AC-054', 'AC-055', 'AC-069'], extra: { mutations: app.mutations },
      })
      expect(nameRole(logged)).toEqual(role)
      expect(logged.counter?.text).toBe('Set 2/2')
      expect(logged.logged!.top, 'saved results sit below the equipment tier').toBeGreaterThanOrEqual(logged.equipment!.bottom - TOLERANCE)

      // ── A refused save stays recoverable on the device ───────────────────
      await rest.click()
      const form2 = page.getByRole('form', { name: `Log set 2 of ${lunge}` })
      await form2.getByLabel('Reps').fill('7')
      app.failNextMutation()
      await form2.getByRole('button', { name: 'Log set 2', exact: true }).click()
      const held = lungeCard.getByRole('list', { name: 'Logged sets' }).getByRole('listitem').filter({ hasText: 'Set 2' })
      await expect(held).toContainText('On this device only')
      await expect(held).toContainText('7 reps')
      expect(app.mutations).toHaveLength(1)
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(held).toContainText('Saved')
      expect(app.mutations[1]).toMatchObject({ operation: 'insert', set_number: 2, values: { actual_reps: 7 } })
      await collapseSheet(page)

      // ── Saved-row Edit corrects that set only ────────────────────────────
      await lungeCard.getByRole('button', { name: 'Edit set 1' }).click()
      const edit = page.getByRole('form', { name: `Edit set 1 of ${lunge}` })
      await expect(edit.getByLabel('Reps')).toHaveValue('8')
      await edit.getByLabel('Reps').fill('9')
      await edit.getByRole('button', { name: 'Save correction' }).click()
      await expect.poll(() => app.mutations.length).toBe(3)
      expect(app.mutations[2]).toMatchObject({ operation: 'correct', observation_id: app.mutations[0].observation_id,
        set_number: 1, expected_revision: 1, revision: 2, values: { actual_reps: 9 } })
      if (await sheet(page).count() > 0) await collapseSheet(page)
      await expect(saved).toContainText('9 reps')
      await expect(lungeCard.getByText('Extra set 3', { exact: true })).toBeVisible()
      const corrected = await prove(page, testInfo, ref, {
        id: `standard-long-corrected-${size}`, heading: lunge, consumer,
        state: 'set 1 corrected to 9 reps; set 2 saved after one refusal; counter Extra set 3',
        viewport, longName: true, criteria: ['AC-054', 'AC-055', 'AC-069'], extra: { mutations: app.mutations },
      })
      expect(nameRole(corrected)).toEqual(role)

      // ── The timed movement: its countdown stays in its card above Rest ───
      const hold = name(HOLD)
      const holdCard = movement(page, hold)
      const timed = await prove(page, testInfo, ref, {
        id: `standard-timed-ready-${size}`, heading: hold, consumer, state: 'timed movement, countdown ready',
        viewport, longName: false, criteria: ['AC-054', 'AC-055', 'AC-069'],
      })
      expect(nameRole(timed)).toEqual(role)
      expectTimerPlacement(timed, 'Rest', `${size} standard timed`)
      const countdown = holdCard.getByRole('region', { name: `${hold} countdown`, exact: true })
      await countdown.getByRole('button', { name: 'Start', exact: true }).click()
      await page.clock.runFor(HOLD_SECONDS * 1000 + 2000)
      await expect(countdown).toHaveAttribute('data-countdown-status', 'finished')
      expect(app.attempts, 'countdown expiry logs nothing').toHaveLength(4)

      expect(app.mutations).toHaveLength(3)
      app.assertContained()
    })

    test('superset logger cards: selected hierarchy, independent counters and countdown; one Rest and an explicit combined Log round', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await page.clock.install()
      await visit('/workout')
      const ref = await referenceHierarchy(page)
      await page.getByRole('button', { name: 'Next section', exact: true }).click()
      const block = content(page).locator('.clr-card').filter({ has: page.getByRole('list', { name: 'Movements in this superset' }) }).last()
      const row = `A1 ${name(ROW)}`
      const plank = `A2 ${name(PLANK)}`
      await expect(block.getByRole('heading', { name: row, exact: true })).toBeVisible()
      const consumer = 'Workout · Superset ExerciseSetLogger cards (src/ui/set-logger.tsx → BlockPanel.Movement) with one block Rest'
      await expectUnrelatedRoles(page)
      await expect(content(page).getByRole('button', { name: /swap/i })).toHaveCount(0)

      const first = await prove(page, testInfo, ref, {
        id: `superset-long-ready-${size}`, heading: row, consumer, state: 'ready, nothing logged, long name',
        viewport, longName: true, criteria: ['AC-054', 'AC-069'],
      })
      const second = await prove(page, testInfo, ref, {
        id: `superset-timed-ready-${size}`, heading: plank, consumer, state: 'timed member, countdown ready',
        viewport, longName: false, criteria: ['AC-054', 'AC-055', 'AC-069'],
      })
      expect(nameRole(second)).toEqual(nameRole(first))
      expect(first.counter?.text).toBe('Set 1/2')
      expect(second.counter?.text).toBe('Set 1/2')
      // Members log together: no per-movement Rest, one block Rest after them.
      await expect(movement(page, row).getByRole('button', { name: 'Rest', exact: true })).toHaveCount(0)
      const blockRest = block.getByRole('button', { name: 'Rest', exact: true })
      await expect(blockRest).toHaveCount(1)
      expectTimerPlacement(second, 'Rest', `${size} superset timed`)

      await blockRest.click()
      const form = page.getByRole('form', { name: `Log round 1 of ${name(ROW)} and ${name(PLANK)}`, exact: true })
      await expect(form).toBeVisible()
      await expect(page.getByRole('region', { name: 'Rest', exact: true })).toHaveCount(1)
      expect(app.attempts).toEqual([])
      // Each movement is saved only when ticked as performed.
      const rowEntry = form.getByRole('group', { name: `${row}, set 1`, exact: true })
      const plankEntry = form.getByRole('group', { name: `${plank}, set 1`, exact: true })
      await rowEntry.getByLabel('Reps').fill('7')
      await rowEntry.getByRole('checkbox', { name: 'Performed' }).check()
      await plankEntry.getByLabel('Seconds').fill('18')
      await plankEntry.getByRole('checkbox', { name: 'Performed' }).check()
      await form.getByRole('button', { name: 'Log round 1', exact: true }).click()
      await expect.poll(() => app.mutations.length).toBe(2)
      expect(app.mutations.map((m) => [m.operation, m.exercise_id, m.set_number])).toEqual([
        ['insert', EXERCISE_ID.get(ROW), 1], ['insert', EXERCISE_ID.get(PLANK), 1],
      ])
      expect(app.mutations[0].values).toMatchObject({ actual_reps: 7 })
      expect(app.mutations[1].values).toMatchObject({ actual_duration_seconds: 18 })
      if (await sheet(page).count() > 0) await collapseSheet(page)
      await expect(movement(page, row).getByRole('list', { name: 'Logged sets' })).toContainText('7 reps')
      await expect(movement(page, plank).getByRole('list', { name: 'Logged sets' })).toContainText('18')

      const after = await prove(page, testInfo, ref, {
        id: `superset-long-logged-${size}`, heading: row, consumer, state: 'round 1 saved by explicit Log round 1; counter Set 2/2',
        viewport, longName: true, criteria: ['AC-054', 'AC-055', 'AC-069'], extra: { mutations: app.mutations },
      })
      expect(nameRole(after)).toEqual(nameRole(first))
      expect(after.counter?.text).toBe('Set 2/2')
      expect(app.mutations).toHaveLength(2)
      app.assertContained()
    })

    test('circuit rows: selected hierarchy closed and with the shared logger open; countdown, Rest entry and round clock keep their roles', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await page.clock.install()
      await visit('/workout')
      const ref = await referenceHierarchy(page)
      await page.getByRole('button', { name: 'Next section', exact: true }).click()
      await page.getByRole('button', { name: 'Next section', exact: true }).click()
      const climber = `1. ${name(CLIMBER)}`
      const crawl = `2. ${name(CRAWL)}`
      await expect(content(page).getByRole('heading', { name: climber, exact: true })).toBeVisible()
      await expectUnrelatedRoles(page)
      await expect(content(page).getByRole('button', { name: /swap/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Start round 1' })).toBeVisible()

      const closed = 'Workout · circuit row, load entry closed (src/ui/circuit-block.tsx → BlockPanel.Movement)'
      const closedLong = await prove(page, testInfo, ref, {
        id: `circuit-closed-long-${size}`, heading: climber, consumer: closed, state: 'closed row, long name, nothing logged',
        viewport, longName: true, criteria: ['AC-054', 'AC-069'],
      })
      expect(closedLong.counter, 'a closed circuit row has no set counter').toBeNull()
      const closedTimed = await prove(page, testInfo, ref, {
        id: `circuit-closed-timed-${size}`, heading: crawl, consumer: closed, state: 'closed timed row, countdown ready',
        viewport, longName: false, criteria: ['AC-054', 'AC-055', 'AC-069'],
      })
      expect(nameRole(closedTimed)).toEqual(nameRole(closedLong))
      expectTimerPlacement(closedTimed, `Rest for ${name(CRAWL)}`, `${size} circuit closed timed`)

      // The row's one tap opens the shared logger and its sheet; Minimize logs nothing.
      await page.getByRole('button', { name: `Rest for ${name(CLIMBER)}`, exact: true }).click()
      await expect(page.getByRole('form', { name: `Log set 1 of ${name(CLIMBER)}` })).toBeVisible()
      await collapseSheet(page)
      expect(app.attempts).toEqual([])
      const open = 'Workout · circuit row with the shared ExerciseSetLogger open (src/ui/circuit-block.tsx → set-logger.tsx)'
      const opened = await prove(page, testInfo, ref, {
        id: `circuit-open-long-${size}`, heading: climber, consumer: open, state: 'logger open, sheet minimized, nothing logged',
        viewport, longName: true, criteria: ['AC-054', 'AC-055', 'AC-069'],
      })
      expect(nameRole(opened)).toEqual(nameRole(closedLong))
      expect(opened.counter?.text).toBe('Set 1/2')
      await page.getByRole('button', { name: `Hide load entry for ${name(CLIMBER)}`, exact: true }).click()
      await expect(page.getByRole('button', { name: `Rest for ${name(CLIMBER)}`, exact: true })).toBeVisible()

      // The round clock is the block's, not a movement's.
      await page.getByRole('button', { name: 'Start round 1' }).click()
      await expect(page.getByRole('timer', { name: 'Round 1 time' })).toBeVisible()
      await expect(movement(page, crawl).getByRole('timer', { name: 'Round 1 time' })).toHaveCount(0)
      await expect(movement(page, crawl).getByRole('region', { name: `${name(CRAWL)} countdown` })).toBeVisible()

      expect(app.attempts).toEqual([])
      app.assertContained()
    })
  })
}
