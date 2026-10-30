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
 * UI polish batch 05 — Rest opens the logging sheet and starts rest; the
 * sheet's Log saves; collapse keeps the draft and the rest (REQ-012, TASK-012).
 *
 * B05-07.1/07.2: the pictured card's entry action said Log set, and the sheet
 * it opened showed no rest countdown ("There's no rest timer here"). The owner
 * resolved it: the card's entry action is Rest, which opens the shared
 * half-sheet and starts the prescribed rest; Log set N inside it is the only
 * save; the chevron collapses without logging.
 *
 * The production `/workout` route runs on a synthetic, non-personal session.
 * Every Auth/PostgREST/function request is answered here and nothing is
 * forwarded; set writes are recorded by the double, one may be refused. The
 * reference regions are measured in the reference's own pixels and the same
 * measure is taken of each actual capture. None of this is an installed-iPhone
 * result; physical UAT stays pending.
 */
const OWNER = '00000000-0000-4000-8000-000000000012'
const AUTH_KEY = 'clear.auth.session'
const LOCATION_ID = '00000000-0000-4000-8000-000000000121'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The reference card's own prescription: Rest 150s. */
const SQUAT_REST = 150
const ROUND_REST = 60

type Viewport = { width: number; height: number }
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'narrow-320', viewport: { width: 320, height: 568 } },
]

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic B05 rest and log workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: LOCATION_ID, goal_preset: 'strength' },
  sections: [
    { title: 'Strength', sectionType: 'primary_lift', blocks: [{ exercises: [
      { prescription: { exercise_id: 'back-squat', order_index: 0, sets: 4, target_value: 5, rest_seconds: SQUAT_REST } },
      // Prescribes no rest: Rest opens its sheet and starts nothing.
      { prescription: { exercise_id: 'romanian-deadlift', order_index: 1, sets: 2, target_value: 8, rest_seconds: null } },
    ] }] },
    { title: 'Accessory', sectionType: 'accessory', blocks: [{
      structureType: 'superset', rounds: 2, roundRestSeconds: ROUND_REST,
      exercises: [
        { prescription: { exercise_id: 'bench-press', order_index: 0, modality: 'reps', target_value: 8, sets: 2 } },
        { prescription: { exercise_id: 'plank', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'time', target_value: 30, sets: 2 } },
      ],
    }] },
    { title: 'Conditioning', sectionType: 'conditioning', blocks: [{
      structureType: 'circuit', rounds: 2, roundRestSeconds: 20,
      exercises: [{ prescription: { exercise_id: 'goblet-squat', order_index: 0, target_value: 6, sets: 2, rest_seconds: null } }],
    }] },
  ],
}))
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
const EXERCISE_ID = new Map(WORKOUT_EXERCISES.map((exercise) => [exercise.exercise_id, exercise.id]))
const BLOCK_IDS = new Set(WORKOUT.sections.flatMap((section) => section.blocks.map(({ block }) => block.id)))

// ─────────────────────────────────────────────────────────────────────────────
// The reference and its regions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The approved reference, read every run. A missing or unreadable file fails
 * the proof rather than yielding a capture with no reference behind it.
 */
const REFERENCE_FILE = 'sources/source-10-B05-07-logging-sheet.jpg'
const REFERENCE_SHA256 = 'b7fa59ba908bd27bf86baa29075a1c8e8d308ecb9d72e20618dd1c9025c19f4e'
const REFERENCE_DIRS = [
  process.env.B05_EVIDENCE_DIR,
  resolve(import.meta.dirname, '..', '..', '.evidence', basename(resolve(import.meta.dirname, '..'))),
].filter((dir): dir is string => dir !== undefined && dir !== '')
function reference() {
  const dir = REFERENCE_DIRS.find((candidate) => existsSync(resolve(candidate, REFERENCE_FILE)))
  if (dir === undefined) throw new Error(`B05-07 reference ${REFERENCE_FILE} is not readable from ${REFERENCE_DIRS.join(', ')}`)
  const bytes = readFileSync(resolve(dir, REFERENCE_FILE))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== REFERENCE_SHA256) throw new Error(`B05-07 reference changed: ${sha256}`)
  return { file: REFERENCE_FILE, sha256, bytes }
}

/**
 * B05-07 in the reference's own pixels (2974×1968; each phone ~912px wide for
 * a 390px viewport). Both regions avoid the red owner markers.
 *   · 07.1 — the left phone's card entry button, over its label's rows only.
 *   · 07.2 — the right phone's sheet, between the `LOG SET 1` title and the
 *     WEIGHT label, right of marker 2: where a countdown would be drawn.
 */
const SCALE = 912 / 390
const REGION_071 = {
  id: '07.1', description: 'Movement card entry action labelled LOG SET (marker 1: "Change this to either rest or two buttons")',
  x0: 90, x1: 840, y0: 969, y1: 990,
}
const REGION_072 = {
  id: '07.2', description: 'Opened sheet between title and fields (marker 2: "There\'s no rest timer here")',
  x0: 1670, x1: 2171, y0: 1026, y1: 1136,
}

type Region = { x0: number; x1: number; y0: number; y1: number }
type Ink = { bands: { top: number; bottom: number }[]; left: number | null; right: number | null }

/**
 * The bright ink in a region, as horizontal bands and a horizontal extent.
 * Text and frame lines are bright on the dark sheet; the background, its
 * scanlines and the dim atmosphere are not.
 */
async function ink(page: Page, image: Buffer, type: string, region: Region, mergeGap: number): Promise<Ink> {
  return page.evaluate(async ({ data, type, region, mergeGap }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:${type};base64,${data}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const width = region.x1 - region.x0
    const pixels = context.getImageData(region.x0, region.y0, width, region.y1 - region.y0).data
    const bright = (index: number) =>
      0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2] > 150
    const rows: number[] = []
    let left: number | null = null
    let right: number | null = null
    for (let y = 0; y < region.y1 - region.y0; y += 1) {
      let lit = false
      for (let x = 0; x < width; x += 1) {
        if (!bright((y * width + x) * 4)) continue
        lit = true
        left = left === null ? x : Math.min(left, x)
        right = right === null ? x : Math.max(right, x)
      }
      if (lit) rows.push(y)
    }
    const bands: { top: number; bottom: number }[] = []
    for (const y of rows) {
      const last = bands.at(-1)
      if (last !== undefined && y - last.bottom <= mergeGap) last.bottom = y
      else bands.push({ top: y, bottom: y })
    }
    return { bands, left, right }
  }, { data: image.toString('base64'), type, region, mergeGap })
}

async function referenceInk(page: Page) {
  const ref = reference()
  const card = await ink(page, ref.bytes, 'image/jpeg', REGION_071, Math.round(3 * SCALE))
  const sheet = await ink(page, ref.bytes, 'image/jpeg', REGION_072, Math.round(3 * SCALE))
  return {
    file: ref.file, sha256: ref.sha256,
    card: { region: REGION_071, labelWidth: (card.right! - card.left!) / SCALE },
    sheet: { region: REGION_072, bands: sheet.bands.length },
  }
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
  throw new Error(`Synthetic rest/log origin ${origin} did not start`)
}

/** As the other B05 specs: serve a bundle with non-secret placeholders when no public URL is configured. */
const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5620 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-rest-log.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-rest-log-public-placeholder',
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
      // Boot and the Workout loading state both expose headings. Scan only
      // after the actual route and its populated movement surface are ready.
      await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()
      await expect(content(page).getByRole('heading', { name: 'back squat', exact: true })).toBeVisible()
      await expect(content(page).getByRole('button', { name: 'Rest', exact: true }).first()).toBeVisible()
      await checkA11y()
    })
  },
})

/**
 * Reads answer the fixture; the two writes the route makes — set observations
 * and a section's block result — are answered here and never forwarded.
 */
async function syntheticApp(page: Page, origin: string) {
  const unexpected: string[] = []
  const blockedOutbound: string[] = []
  const attempts: SetObservationMutation[] = []
  const mutations: SetObservationMutation[] = []
  const blockResults: BlockResultRow[] = []
  const heads = new Map<string, SetObservationAck['head']>()
  let failNext = false
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
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
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
      const insert = (request.postDataJSON() as Record<string, unknown>[])[0]
      expect(BLOCK_IDS.has(String(insert.block_id))).toBe(true)
      const row = blockResultRowSchema.parse({ elapsed_seconds: null, completed_under_cap: null,
        rounds_completed: null, partial_round_reps: null, minutes_completed: null, highest_rung: null,
        perceived_effort: null, notes: null, ...insert,
        id: `00000000-0000-4000-8000-1200000000${String(blockResults.length + 1).padStart(2, '0')}`,
        created_at: new Date().toISOString() })
      blockResults.push(row)
      return reply([row], 201)
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
        attempts.push(mutation)
        // Reject a plausible-looking correction to the wrong observation:
        // the existing durable identity/revision contract is part of this proof.
        const previous = heads.get(mutation.observation_id)
        if (previous?.mutation_id === mutation.mutation_id) {
          // A response may be lost after application. Preserve the real RPC's
          // idempotent replay contract without counting a second observation.
          expect(mutation).toEqual(mutations.find((applied) => applied.mutation_id === mutation.mutation_id))
          return reply({ outcome: 'replayed', mutation, head: previous })
        }
        if (mutation.operation === 'insert') {
          expect(previous).toBeUndefined()
          expect(mutation.expected_revision).toBe(0)
          expect(mutation.revision).toBe(1)
        } else {
          expect(mutation.operation).toBe('correct')
          expect(previous).toBeDefined()
          expect(previous?.row?.workout_exercise_id).toBe(mutation.exercise_id)
          expect(previous?.row?.set_number).toBe(mutation.set_number)
          expect(mutation.expected_revision).toBe(previous?.revision)
          expect(mutation.revision).toBe((previous?.revision ?? -1) + 1)
          expect(mutation.mutation_id).not.toBe(previous?.mutation_id)
        }
        if (failNext) {
          failNext = false
          return reply({ code: 'PGRST000', message: 'Synthetic refused write.' }, 503)
        }
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
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic rest/log request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-b05-rest-log-session', refreshToken: 'synthetic-b05-rest-log-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-rest-log@example.invalid' },
    }))
  }, { authKey: AUTH_KEY, owner: OWNER })
  return {
    attempts, mutations, blockResults,
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
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Rest/log capture requires an actual Git source identity')
  return { head, dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '' }
}

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
const sheet = (page: Page) => page.locator('section.clr-set-sheet')
const restBars = (page: Page) => page.getByRole('region', { name: 'Rest', exact: true })

/** Complete both collapse measurements before the next card action.
 * The fitted entry first measures its current content; the outer public
 * region then publishes the pinned-foot inset. Either may still describe the
 * open sheet after its DOM is gone, moving a target during auto-scroll/click.
 * Wait for both actual boundaries, without a sleep or a second click.
 */
async function collapseSheet(page: Page) {
  await page.getByRole('button', { name: 'Minimize' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect.poll(() => page.locator('main#main > .clr-scroll-region').evaluate((region) => {
    const foot = region.querySelector(':scope > .clr-scroll-region__foot')
    const fitted = foot?.querySelector<HTMLElement>('.clr-workout-footer__entry')
    const content = fitted?.querySelector(':scope > .clr-scroll-region > .clr-scroll-region__scroller > div')
    if (!foot || !fitted || !content) return false
    const requestedEntry = Number.parseFloat(fitted.style.height)
    const currentContent = content.getBoundingClientRect().height
    const actualFoot = foot.getBoundingClientRect().height
    const publishedFoot = Number.parseFloat(getComputedStyle(region).getPropertyValue('--foot-h'))
    return Number.isFinite(requestedEntry) && Math.abs(requestedEntry - currentContent) <= 1
      && actualFoot > 0 && Number.isFinite(publishedFoot) && Math.abs(actualFoot - publishedFoot) <= 1
  }), { message: 'Collapsed Workout entry content and outer footer must match both measured scroll boundaries before the next card action' }).toBe(true)
}

/** The one movement card, by its heading, on the main screen. */
function card(page: Page, name: string): Locator {
  return content(page).locator('section').filter({
    has: page.getByRole('heading', { name, exact: true }),
  }).last()
}

async function restRemaining(page: Page): Promise<string> {
  await expect(restBars(page)).toHaveCount(1)
  const text = await restBars(page).getByRole('timer', { name: 'Time remaining' }).textContent()
  const digits = /\d\d:\d\d/.exec(text ?? '')
  if (digits === null) throw new Error(`no countdown digits in ${text}`)
  return digits[0]
}

const seconds = (digits: string) => Number(digits.slice(0, 2)) * 60 + Number(digits.slice(3))

type Reading = { seconds: number; at: number }

/**
 * The one countdown, read again: at least `advanced` seconds on from
 * `previous` — a restarted or second rest would read higher. Real time also
 * passes under `page.clock`, so the reading may be lower by the wall-clock
 * time measured between the two readings, plus a second of rounding.
 */
async function expectRestFrom(page: Page, previous: Reading | number, advanced = 0): Promise<Reading> {
  const from = typeof previous === 'number' ? { seconds: previous, at: Date.now() } : previous
  const current = seconds(await restRemaining(page))
  const real = Math.ceil((Date.now() - from.at) / 1000) + 1
  expect(current).toBeLessThanOrEqual(from.seconds - advanced)
  expect(current).toBeGreaterThanOrEqual(from.seconds - advanced - real)
  return { seconds: current, at: Date.now() }
}

/** The sheet as captured, and the band between its title row and its first field label. */
async function captureSheet(page: Page, testInfo: TestInfo, id: string) {
  const frame = sheet(page)
  await expect(frame).toBeVisible()
  const shot = await frame.screenshot({ animations: 'disabled', caret: 'hide' })
  const file = `${id}.png`
  writeFileSync(testInfo.outputPath(file), shot)
  await testInfo.attach(file, { path: testInfo.outputPath(file), contentType: 'image/png' })
  const geometry = await frame.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const head = element.querySelector('.clr-set-sheet__head')!.getBoundingClientRect()
    const firstLabel = element.querySelector('form label, form [role="group"]')!.getBoundingClientRect()
    const rest = element.querySelector('[aria-label="Rest"]')?.getBoundingClientRect() ?? null
    return {
      width: box.width, height: box.height,
      band: { top: head.bottom - box.top + 1, bottom: firstLabel.top - box.top - 1 },
      rest: rest === null ? null : { top: rest.top - box.top, bottom: rest.bottom - box.top },
      dpr: devicePixelRatio,
    }
  })
  const scale = geometry.dpr
  const measured = await ink(page, shot, 'image/png', {
    x0: Math.round(16 * scale), x1: Math.round((geometry.width - 16) * scale),
    y0: Math.round(geometry.band.top * scale), y1: Math.round(geometry.band.bottom * scale),
  }, Math.round(3 * scale))
  // The integrated screen as the athlete sees it: the sheet docked in its
  // capped, scrolling pinned foot above the section navigation.
  const screen = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  const screenFile = `${id}-viewport.png`
  writeFileSync(testInfo.outputPath(screenFile), screen)
  await testInfo.attach(screenFile, { path: testInfo.outputPath(screenFile), contentType: 'image/png' })
  return {
    capture: {
      file, sha256: createHash('sha256').update(shot).digest('hex'),
      viewport: { file: screenFile, sha256: createHash('sha256').update(screen).digest('hex') },
    },
    geometry, bands: measured.bands.length,
  }
}

async function captureCardAction(page: Page, testInfo: TestInfo, id: string, action: Locator) {
  const shot = await action.screenshot({ animations: 'disabled', caret: 'hide' })
  const file = `${id}.png`
  writeFileSync(testInfo.outputPath(file), shot)
  await testInfo.attach(file, { path: testInfo.outputPath(file), contentType: 'image/png' })
  const box = (await action.boundingBox())!
  const scale = await page.evaluate(() => devicePixelRatio)
  const label = await ink(page, shot, 'image/png', {
    x0: Math.round(8 * scale), x1: Math.round((box.width - 8) * scale),
    y0: Math.round(box.height * 0.3 * scale), y1: Math.round(box.height * 0.7 * scale),
  }, Math.round(3 * scale))
  return {
    capture: { file, sha256: createHash('sha256').update(shot).digest('hex') },
    labelWidth: label.left === null ? 0 : (label.right! - label.left) / scale,
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
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test('B05-07.1/07.2 reference regions show the Log set entry and a sheet with no countdown', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><title>reference</title>')
  const ref = await referenceInk(page)
  // The defect as the owner marked it: a seven-character LOG SET label, and
  // only the context line between the sheet's title and its fields.
  expect(ref.card.labelWidth, JSON.stringify(ref)).toBeGreaterThan(45)
  expect(ref.sheet.bands, JSON.stringify(ref)).toBe(1)
  await testInfo.attach('reference-07.json', { body: JSON.stringify(ref, null, 2), contentType: 'application/json' })
})

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 Rest and Log @ ${size}`, () => {
    test.use({ viewport })

    test('Rest opens the sheet with the running prescribed rest; Log saves; collapse, reopen, failure, expiry and Edit keep their contracts', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await page.clock.install()
      await visit('/workout')
      const ref = await referenceInk(page)
      const refRecord = (region: typeof ref.card.region) => ({ file: ref.file, sha256: ref.sha256, region })

      // ── The entry: Rest, and no other Log button on the card ──────────────
      const squat = card(page, 'back squat')
      const rest = squat.getByRole('button', { name: 'Rest', exact: true })
      await expect(rest).toBeVisible()
      await expect(content(page).getByRole('button', { name: /^log( set| round)?$/i })).toHaveCount(0)
      await expect(restBars(page)).toHaveCount(0)
      const entry = await captureCardAction(page, testInfo, `card-entry-${size}`, rest)
      // Against 07.1: the entry's label is the shorter Rest, not LOG SET.
      expect(entry.labelWidth).toBeGreaterThan(10)
      expect(entry.labelWidth).toBeLessThan(ref.card.labelWidth * 0.8)
      await record(page, testInfo, `card-entry-${size}`, {
        consumer: 'Workout · standard movement card entry (src/ui/set-logger.tsx)', state: 'no rest running, nothing logged', viewport,
        reference: refRecord(ref.card.region), measured: { reference: ref.card.labelWidth, actual: entry.labelWidth },
        capture: entry.capture, criteria: { 'AC-035': 'pass', 'AC-067': 'pass' },
      })

      // ── Rest: the sheet opens and the prescribed rest is running ─────────
      await rest.click()
      await expect(page.getByRole('heading', { name: 'Log set 1', exact: true })).toBeVisible()
      let remaining = await expectRestFrom(page, SQUAT_REST)
      await expect(sheet(page).getByRole('region', { name: 'Rest', exact: true })).toBeVisible()
      expect(app.attempts).toHaveLength(0)
      const opened = await captureSheet(page, testInfo, `sheet-rest-open-${size}`)
      // Against 07.2: the band the reference leaves to the context line alone
      // now also carries the countdown card.
      expect(opened.geometry.rest).not.toBeNull()
      expect(opened.bands).toBeGreaterThan(ref.sheet.bands)
      await page.clock.fastForward(5000)
      remaining = await expectRestFrom(page, remaining, 5)
      await record(page, testInfo, `sheet-rest-open-${size}`, {
        consumer: 'Workout · SetLoggingSheet new entry via card Rest', state: 'Rest activated before any set; countdown running', viewport,
        reference: refRecord(ref.sheet.region), measured: { referenceBands: ref.sheet.bands, actualBands: opened.bands },
        capture: opened.capture, geometry: opened.geometry, criteria: { 'AC-035': 'pass', 'AC-067': 'pass' },
      })

      // ── Draft, collapse, reopen ──────────────────────────────────────────
      const form1 = page.getByRole('form', { name: 'Log set 1 of back squat' })
      await form1.getByLabel('Weight').fill('100')
      await form1.getByRole('combobox', { name: 'Unit' }).selectOption('lb')
      await form1.getByLabel('Reps').fill('5')
      await form1.getByRole('radio', { name: 'About right' }).check()
      await page.clock.fastForward(5000)
      await collapseSheet(page)
      await expect(sheet(page)).toHaveCount(0)
      // Collapsed: the same rest, now the footer's, still counting.
      remaining = await expectRestFrom(page, remaining, 5)
      expect(app.attempts).toHaveLength(0)
      await page.clock.fastForward(10_000)
      await rest.click()
      await expect(form1.getByLabel('Weight')).toHaveValue('100')
      await expect(form1.getByRole('combobox', { name: 'Unit' })).toHaveValue('lb')
      await expect(form1.getByLabel('Reps')).toHaveValue('5')
      await expect(form1.getByRole('radio', { name: 'About right' })).toBeChecked()
      // Reopened: not restarted, and still only one countdown.
      remaining = await expectRestFrom(page, remaining, 10)
      expect(app.attempts).toHaveLength(0)
      const reopened = await captureSheet(page, testInfo, `sheet-reopen-draft-${size}`)
      await record(page, testInfo, `sheet-reopen-draft-${size}`, {
        consumer: 'Workout · SetLoggingSheet new entry', state: 'collapsed with draft, reopened during active rest', viewport,
        reference: refRecord(ref.sheet.region), measured: { referenceBands: ref.sheet.bands, actualBands: reopened.bands },
        capture: reopened.capture, criteria: { 'AC-036': 'pass', 'AC-038': 'pass', 'AC-051': 'pass', 'AC-067': 'pass' },
      })
      expect(reopened.bands).toBeGreaterThan(ref.sheet.bands)

      // ── Log set 1 saves; the rest runs on ────────────────────────────────
      await form1.getByRole('button', { name: 'Log set 1', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Log set 2', exact: true })).toBeVisible()
      await expect.poll(() => app.mutations.length).toBe(1)
      expect(app.mutations[0]).toMatchObject({
        operation: 'insert', exercise_id: EXERCISE_ID.get('back-squat'), set_number: 1,
        values: { weight: 100, weight_unit: 'lb', actual_reps: 5, effort: 'about_right' },
      })
      remaining = await expectRestFrom(page, remaining)
      const saved =squat.getByRole('list', { name: 'Logged sets' }).getByRole('listitem').filter({ hasText: 'Set 1' })
      await expect(saved).toContainText('5 reps')
      await expect(saved).toContainText('100 lb')
      await expect(saved).toContainText('Saved')
      const logged = await captureSheet(page, testInfo, `sheet-after-log-${size}`)
      await record(page, testInfo, `sheet-after-log-${size}`, {
        consumer: 'Workout · SetLoggingSheet new entry', state: 'Log set 1 saved; rest continues; next entry set 2', viewport,
        reference: refRecord(ref.sheet.region), measured: { referenceBands: ref.sheet.bands, actualBands: logged.bands },
        mutation: app.mutations[0], capture: logged.capture, criteria: { 'AC-037': 'pass', 'AC-051': 'pass', 'AC-067': 'pass' },
      })

      // Collapse after the save writes nothing more.
      await collapseSheet(page)
      await page.clock.fastForward(1000)
      expect(app.attempts).toHaveLength(1)
      remaining = await expectRestFrom(page, remaining, 1)

      // ── A refused save keeps the entry, recoverable ──────────────────────
      await rest.click()
      remaining = await expectRestFrom(page, remaining)
      const form2 = page.getByRole('form', { name: 'Log set 2 of back squat' })
      await form2.getByLabel('Weight').fill('105')
      await form2.getByLabel('Reps').fill('4')
      app.failNextMutation()
      await form2.getByRole('button', { name: 'Log set 2', exact: true }).click()
      const held = squat.getByRole('list', { name: 'Logged sets' }).getByRole('listitem').filter({ hasText: 'Set 2' })
      await expect(held).toContainText('On this device only')
      await expect(held).toContainText('4 reps')
      expect(app.attempts).toHaveLength(2)
      expect(app.mutations).toHaveLength(1)
      remaining = await expectRestFrom(page, remaining)
      const failed = await captureSheet(page, testInfo, `sheet-save-failure-${size}`)
      await record(page, testInfo, `sheet-save-failure-${size}`, {
        consumer: 'Workout · SetLoggingSheet new entry', state: 'Log set 2 refused; entry held on device; rest unchanged', viewport,
        reference: refRecord(ref.sheet.region), measured: { referenceBands: ref.sheet.bands, actualBands: failed.bands },
        capture: failed.capture, criteria: { 'AC-037': 'pass', 'AC-051': 'pass', 'AC-067': 'pass' },
      })
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(held).toContainText('Saved')
      expect(app.mutations[1]).toMatchObject({ set_number: 2, values: { weight: 105, weight_unit: 'lb', actual_reps: 4 } })
      expect(app.attempts[2]).toEqual(app.attempts[1])
      expect(app.mutations[1]).toEqual(app.attempts[1])
      await collapseSheet(page)

      // ── Saved-row Edit: corrects, never starts or resets rest ────────────
      remaining = await expectRestFrom(page, remaining)
      await squat.getByRole('button', { name: 'Edit set 1' }).click()
      const edit = page.getByRole('form', { name: 'Edit set 1 of back squat' })
      await expect(edit.getByLabel('Reps')).toHaveValue('5')
      await expect(edit.getByRole('combobox', { name: 'Unit' })).toHaveValue('lb')
      remaining = await expectRestFrom(page, remaining)
      await edit.getByLabel('Weight').fill('0')
      await edit.getByRole('combobox', { name: 'Unit' }).selectOption('kg')
      await edit.getByLabel('Reps').fill('7')
      await edit.getByRole('radio', { name: 'Too easy' }).check()
      await edit.getByRole('button', { name: 'Cancel' }).click()
      expect(app.mutations).toHaveLength(2)
      await squat.getByRole('button', { name: 'Edit set 1' }).click()
      await expect(edit.getByLabel('Weight')).toHaveValue('100')
      await expect(edit.getByRole('combobox', { name: 'Unit' })).toHaveValue('lb')
      await expect(edit.getByLabel('Reps')).toHaveValue('5')
      await expect(edit.getByRole('radio', { name: 'About right' })).toBeChecked()
      await edit.getByLabel('Reps').fill('6')
      const editing = await captureSheet(page, testInfo, `sheet-saved-edit-${size}`)
      await edit.getByRole('button', { name: 'Save correction' }).click()
      await expect.poll(() => app.mutations.length).toBe(3)
      expect(app.mutations[2]).toMatchObject({
        operation: 'correct', observation_id: app.mutations[0].observation_id,
        exercise_id: app.mutations[0].exercise_id, set_number: 1,
        expected_revision: 1, revision: 2,
        values: { actual_reps: 6, weight: 100, weight_unit: 'lb', effort: 'about_right' },
      })
      expect(app.mutations[2].mutation_id).not.toBe(app.mutations[0].mutation_id)
      // Save correction neither starts nor resets the running rest.
      await expectRestFrom(page, remaining)
      await record(page, testInfo, `sheet-saved-edit-${size}`, {
        consumer: 'Workout · SetLoggingSheet edit mode via saved-row Edit', state: 'Cancel writes nothing; Save correction updates set 1; rest untouched', viewport,
        reference: refRecord(ref.sheet.region), measured: { referenceBands: ref.sheet.bands, actualBands: editing.bands },
        capture: editing.capture, criteria: { 'AC-039': 'pass', 'AC-051': 'pass', 'AC-067': 'pass' },
      })

      // ── Expiry with a draft open saves nothing ───────────────────────────
      // TASK-013: the saved correction leaves the current sheet open over
      // Rest. Use its real Minimize action before returning to that card.
      await collapseSheet(page)
      await rest.click()
      const form3 = page.getByRole('form', { name: 'Log set 3 of back squat' })
      await form3.getByLabel('Reps').fill('3')
      const writes = app.attempts.length
      await page.clock.fastForward((SQUAT_REST + 5) * 1000)
      await expect(restBars(page)).toHaveCount(0)
      await expect(form3.getByLabel('Reps')).toHaveValue('3')
      expect(app.attempts).toHaveLength(writes)
      const expired = await captureSheet(page, testInfo, `sheet-expired-${size}`)
      await record(page, testInfo, `sheet-expired-${size}`, {
        consumer: 'Workout · SetLoggingSheet new entry', state: 'rest expired with an unsaved draft open', viewport,
        reference: refRecord(ref.sheet.region), measured: { referenceBands: ref.sheet.bands, actualBands: expired.bands },
        capture: expired.capture, criteria: { 'AC-039': 'pass', 'AC-067': 'pass' },
      })
      // Log with an expired (non-null) period: saving may not silently start
      // another rest merely because there is no active countdown anymore.
      await form3.getByRole('button', { name: 'Log set 3', exact: true }).click()
      await expect.poll(() => app.mutations.length).toBe(4)
      expect(app.mutations[3]).toMatchObject({ operation: 'insert', set_number: 3, values: { actual_reps: 3 } })
      await expect(restBars(page)).toHaveCount(0)
      await collapseSheet(page)
      await squat.getByRole('button', { name: 'Edit set 3' }).click()
      await expect(restBars(page)).toHaveCount(0)
      const expiredEdit = page.getByRole('form', { name: 'Edit set 3 of back squat' })
      await expiredEdit.getByLabel('Reps').fill('2')
      await expiredEdit.getByRole('button', { name: 'Save correction' }).click()
      await expect.poll(() => app.mutations.length).toBe(5)
      expect(app.mutations[4]).toMatchObject({
        operation: 'correct', observation_id: app.mutations[3].observation_id,
        set_number: 3, values: { actual_reps: 2 },
      })
      await expect(restBars(page)).toHaveCount(0)
      // Only the explicit Rest activation may start the next prescribed rest.
      await collapseSheet(page)
      await expect(restBars(page)).toHaveCount(0)
      await expect(rest).toBeVisible()
      await rest.click()
      await expectRestFrom(page, SQUAT_REST)
      await restBars(page).getByRole('button', { name: 'Skip rest' }).click()
      await collapseSheet(page)

      // ── No rest prescribed: none is invented ─────────────────────────────
      await card(page, 'romanian deadlift').getByRole('button', { name: 'Rest', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Log set 1', exact: true })).toBeVisible()
      await expect(restBars(page)).toHaveCount(0)
      const unprescribed = await captureSheet(page, testInfo, `sheet-no-prescribed-rest-${size}`)
      expect(unprescribed.geometry.rest).toBeNull()
      await record(page, testInfo, `sheet-no-prescribed-rest-${size}`, {
        consumer: 'Workout · SetLoggingSheet new entry (rest_seconds null)', state: 'Rest activated; nothing prescribed; no countdown', viewport,
        reference: refRecord(ref.sheet.region), measured: { referenceBands: ref.sheet.bands, actualBands: unprescribed.bands },
        capture: unprescribed.capture, criteria: { 'AC-035': 'pass', 'AC-039': 'pass', 'AC-067': 'pass' },
      })
      const noRestForm = page.getByRole('form', { name: 'Log set 1 of romanian deadlift' })
      await noRestForm.getByLabel('Reps').fill('8')
      await noRestForm.getByRole('button', { name: 'Log set 1', exact: true }).click()
      await expect.poll(() => app.mutations.length).toBe(6)
      await expect(restBars(page)).toHaveCount(0)
      await collapseSheet(page)
      await card(page, 'romanian deadlift').getByRole('button', { name: 'Edit set 1' }).click()
      await expect(restBars(page)).toHaveCount(0)
      const noRestEdit = page.getByRole('form', { name: 'Edit set 1 of romanian deadlift' })
      await noRestEdit.getByLabel('Reps').fill('7')
      await noRestEdit.getByRole('button', { name: 'Save correction' }).click()
      await expect.poll(() => app.mutations.length).toBe(7)
      expect(app.mutations[6]).toMatchObject({
        operation: 'correct', observation_id: app.mutations[5].observation_id,
        exercise_id: EXERCISE_ID.get('romanian-deadlift'), set_number: 1, values: { actual_reps: 7 },
      })
      await expect(restBars(page)).toHaveCount(0)
      app.assertContained()
    })

    test('a superset Rest starts the round rest and Log round saves one combined round; circuit rounds are unchanged', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await page.clock.install()
      await visit('/workout')
      const ref = await referenceInk(page)
      await page.getByRole('button', { name: 'Next section' }).click()
      const pair = content(page).locator('.clr-card').filter({
        has: page.getByRole('list', { name: 'Movements in this superset' }),
      })
      await expect(pair).toBeVisible()
      // One block entry; its movements have none of their own.
      await expect(pair.getByRole('button', { name: 'Rest', exact: true })).toHaveCount(1)
      await expect(pair.getByRole('button', { name: /^log/i })).toHaveCount(0)

      await pair.getByRole('button', { name: 'Rest', exact: true }).click()
      const round = page.getByRole('form', { name: 'Log round 1 of bench press and plank' })
      await expect(round).toBeVisible()
      const roundRest = await expectRestFrom(page, ROUND_REST)
      await expect(restBars(page)).toContainText('Rest after round 1')
      expect(app.attempts).toHaveLength(0)
      const bench = round.getByRole('group', { name: 'A1 bench press, set 1' })
      const plank = round.getByRole('group', { name: 'A2 plank, set 1' })
      await bench.getByLabel('Weight').fill('135')
      await bench.getByRole('combobox', { name: 'Unit' }).selectOption('lb')
      await bench.getByLabel('Reps').fill('7')
      await bench.getByRole('radio', { name: 'Too easy' }).check()
      await plank.getByLabel('Seconds').fill('28')
      await plank.getByRole('radio', { name: 'About right' }).check()
      await collapseSheet(page)
      await expect(round).toHaveCount(0)
      expect(app.attempts).toHaveLength(0)
      await page.clock.fastForward(4000)
      await pair.getByRole('button', { name: 'Rest', exact: true }).click()
      await expect(bench.getByLabel('Weight')).toHaveValue('135')
      await expect(bench.getByRole('combobox', { name: 'Unit' })).toHaveValue('lb')
      await expect(bench.getByLabel('Reps')).toHaveValue('7')
      await expect(bench.getByRole('radio', { name: 'Too easy' })).toBeChecked()
      await expect(plank.getByLabel('Seconds')).toHaveValue('28')
      await expect(plank.getByRole('radio', { name: 'About right' })).toBeChecked()
      await expectRestFrom(page, roundRest, 4)
      expect(app.attempts).toHaveLength(0)
      const combined = await captureSheet(page, testInfo, `sheet-combined-round-${size}`)
      expect(combined.bands).toBeGreaterThan(ref.sheet.bands)
      await round.getByRole('button', { name: 'Log round 1', exact: true }).click()
      await expect.poll(() => app.mutations.length).toBe(2)
      // One action, each movement its own observation under the round's number.
      expect(app.mutations.map((mutation) => [mutation.exercise_id, mutation.set_number])).toEqual([
        [EXERCISE_ID.get('bench-press'), 1], [EXERCISE_ID.get('plank'), 1],
      ])
      expect(app.mutations[0].values).toMatchObject({ actual_reps: 7, weight: 135, weight_unit: 'lb', effort: 'too_easy' })
      expect(app.mutations[1].values).toMatchObject({ actual_duration_seconds: 28, effort: 'about_right' })
      expect(new Set(app.mutations.map((mutation) => mutation.observation_id)).size).toBe(2)
      await expectRestFrom(page, roundRest, 4)
      await record(page, testInfo, `sheet-combined-round-${size}`, {
        consumer: 'Workout · SupersetRoundSheet via the block Rest (src/ui/superset-block.tsx)',
        state: 'Rest started round rest; collapse/reopen retained independent drafts and deadline; Log round 1 saved both once', viewport,
        reference: { file: ref.file, sha256: ref.sha256, region: ref.sheet.region },
        measured: { referenceBands: ref.sheet.bands, actualBands: combined.bands },
        mutations: app.mutations, capture: combined.capture, criteria: { 'AC-039': 'pass', 'AC-051': 'pass', 'AC-067': 'pass' },
      })
      // Expiry while a second combined draft is open saves nothing. Its
      // subsequent explicit save cannot silently start another round rest.
      const round2 = page.getByRole('form', { name: 'Log round 2 of bench press and plank' })
      await expect(round2).toBeVisible()
      await round2.getByRole('group', { name: 'A1 bench press, set 2' }).getByLabel('Reps').fill('6')
      await round2.getByRole('group', { name: 'A2 plank, set 2' }).getByLabel('Seconds').fill('25')
      await page.clock.fastForward((ROUND_REST + 5) * 1000)
      await expect(restBars(page)).toHaveCount(0)
      expect(app.mutations).toHaveLength(2)
      await round2.getByRole('button', { name: 'Log round 2', exact: true }).click()
      await expect.poll(() => app.mutations.length).toBe(4)
      await expect(restBars(page)).toHaveCount(0)
      await collapseSheet(page)

      // The circuit's own Start / Finish round rest is untouched.
      await page.getByRole('button', { name: 'Next section' }).click()
      await page.getByRole('button', { name: 'Start round 1' }).click()
      await page.getByRole('button', { name: 'Finish round 1' }).click()
      await expect(page.getByText('Rest between rounds', { exact: true })).toBeVisible()
      await expect(restBars(page)).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Rest for goblet squat', exact: true })).toBeVisible()
      await expect(content(page).getByRole('button', { name: /^log/i })).toHaveCount(0)
      const writesBeforeCircuitEntry = app.attempts.length
      await page.getByRole('button', { name: 'Rest for goblet squat', exact: true }).click()
      const circuitForm = page.getByRole('form', { name: 'Log set 1 of goblet squat' })
      await expect(circuitForm).toBeVisible()
      // Circuit movement entry opens the shared sheet without inventing a
      // movement rest, resetting its round rest or recording a round/set.
      await expect(restBars(page)).toHaveCount(0)
      await expect(page.getByText('Rest between rounds', { exact: true })).toBeVisible()
      await expect(content(page).getByRole('button', { name: 'Rest', exact: true })).toHaveCount(1)
      await expect(content(page).getByRole('button', { name: /^log/i })).toHaveCount(0)
      expect(app.attempts).toHaveLength(writesBeforeCircuitEntry)
      const circuitEntry = await captureSheet(page, testInfo, `sheet-circuit-entry-${size}`)
      expect(circuitEntry.geometry.rest).toBeNull()
      await record(page, testInfo, `sheet-circuit-entry-${size}`, {
        consumer: 'Workout · circuit movement Rest entry and shared sheet',
        state: 'circuit round rest running; no movement rest prescribed; opening logs nothing', viewport,
        reference: { file: ref.file, sha256: ref.sha256, region: ref.sheet.region },
        measured: { referenceBands: ref.sheet.bands, actualBands: circuitEntry.bands },
        capture: circuitEntry.capture, criteria: { 'AC-035': 'pass', 'AC-039': 'pass' },
      })
      await collapseSheet(page)
      await content(page).getByRole('button', { name: 'Rest', exact: true }).click()
      await expect(circuitForm).toBeVisible()
      await expect(restBars(page)).toHaveCount(0)
      expect(app.attempts).toHaveLength(writesBeforeCircuitEntry)
      expect(app.mutations).toHaveLength(4)
      app.assertContained()
    })
  })
}
