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
 * UI polish batch 05 — the movement countdown, full width above its paired
 * Start/Pause and Reset, inside its movement card above Rest (REQ-011,
 * TASK-014).
 *
 * B05-06.1 marks the live compact countdown beside stacked controls; 06.2/06.3
 * select the proposed full-width countdown with the two controls side by side
 * underneath, placed inside the movement card above its entry action (Rest,
 * after B05-07). The shared `MovementCountdown` draws it for the standard
 * logger and for a circuit row, whose one clock outlives optional load entry.
 *
 * The production `/workout` route runs on a synthetic, non-personal session.
 * Every Auth/PostgREST/function request is answered here and nothing is
 * forwarded. The original no-save cases reject every set write; only the
 * explicit combined-log case acknowledges its exact synthetic observations.
 * The reference
 * region is measured in the reference's own pixels and the same measure is
 * taken of each actual capture. None of this is an installed-iPhone result;
 * physical UAT stays pending.
 * Standalone no-host logger fallback remains component-unit coverage in
 * src/ui/set-logger.test.tsx, not a browser/gallery route claimed here.
 */
const OWNER = '00000000-0000-4000-8000-000000000014'
const AUTH_KEY = 'clear.auth.session'
const LOCATION_ID = '00000000-0000-4000-8000-000000000141'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const HOLD_SECONDS = 30
const PLANK_SECONDS = 20
const HOLD_REST = 60
const PAIR_REST = 60
const PAIR_NEXT_SECONDS = 15

type Viewport = { width: number; height: number }
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'narrow-320', viewport: { width: 320, height: 568 } },
  { name: 'short-390x480', viewport: { width: 390, height: 480 } },
]

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic B05 movement countdown workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: LOCATION_ID, goal_preset: 'strength' },
  sections: [
    { title: 'Core', sectionType: 'accessory', blocks: [{ exercises: [
      { prescription: { exercise_id: 'hollow-body-hold', order_index: 0, equipment_used: 'bodyweight',
        load_type: 'bodyweight', load_value: null, modality: 'time', target_value: HOLD_SECONDS, sets: 2,
        rest_seconds: HOLD_REST } },
      // Counted in reps: no movement countdown at all.
      { prescription: { exercise_id: 'bench-press', order_index: 1, sets: 2, target_value: 8, rest_seconds: 90 } },
    ] }] },
    { title: 'Conditioning', sectionType: 'conditioning', blocks: [{
      structureType: 'circuit', rounds: 2, roundRestSeconds: 20,
      exercises: [
        { prescription: { exercise_id: 'plank', order_index: 0, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'time', target_value: PLANK_SECONDS, sets: 2, rest_seconds: null } },
        { prescription: { exercise_id: 'goblet-squat', order_index: 1, target_value: 6, sets: 2, rest_seconds: null } },
      ],
    }] },
    { title: 'Finisher', sectionType: 'conditioning', blocks: [{
      structureType: 'amrap', timerType: 'countdown', timerSeconds: 300,
      exercises: [{ prescription: { exercise_id: 'push-up', order_index: 0, equipment_used: 'bodyweight',
        load_type: 'bodyweight', load_value: null, target_value: 10, sets: 1, rest_seconds: null } }],
    }] },
  ],
}))
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))

/** An actual Superset route consumer, using the established snapshot/RPC shapes. */
const SUPERSET_WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic B05 superset movement countdown workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: LOCATION_ID, goal_preset: 'strength' },
  sections: [
    // Keep the shared route-readiness/Axe entry the same as the original cases.
    { title: 'Core', sectionType: 'accessory', blocks: [{ exercises: [
      { prescription: { exercise_id: 'hollow-body-hold', order_index: 0, equipment_used: 'bodyweight',
        load_type: 'bodyweight', load_value: null, modality: 'time', target_value: HOLD_SECONDS, sets: 2,
        rest_seconds: HOLD_REST } },
    ] }] },
    { title: 'Timed pair', sectionType: 'accessory', blocks: [{
      structureType: 'superset', rounds: 2, roundRestSeconds: PAIR_REST,
      exercises: [
        { prescription: { exercise_id: 'bench-press', order_index: 0, target_value: 8, sets: 2, rest_seconds: null } },
        { prescription: { exercise_id: 'plank', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'time', target_kind: 'sequence', target_value: null,
          target_sequence: [PLANK_SECONDS, PAIR_NEXT_SECONDS], sets: 2, rest_seconds: null } },
      ],
    }] },
  ],
}))
const PAIR_EXERCISE_ID = new Map(SUPERSET_WORKOUT.sections[1].blocks[0].exercises
  .map(({ exercise }) => [exercise.exercise_id, exercise.id]))

// ─────────────────────────────────────────────────────────────────────────────
// The reference and its region
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The approved reference, read every run. A missing or unreadable file fails
 * the proof rather than yielding a capture with no reference behind it.
 */
const REFERENCE_FILE = 'sources/source-09-B05-06-movement-timer.jpg'
const REFERENCE_SHA256 = '489dded0b4d90dd6789e23e352d5ec29cc96aa96a1abd6ee4be14d3f606f8aab'
const REFERENCE_DIRS = [
  process.env.B05_EVIDENCE_DIR,
  resolve(import.meta.dirname, '..', '..', '.evidence', basename(resolve(import.meta.dirname, '..'))),
].filter((dir): dir is string => dir !== undefined && dir !== '')
function reference() {
  const dir = REFERENCE_DIRS.find((candidate) => existsSync(resolve(candidate, REFERENCE_FILE)))
  if (dir === undefined) throw new Error(`B05-06 reference ${REFERENCE_FILE} is not readable from ${REFERENCE_DIRS.join(', ')}`)
  const bytes = readFileSync(resolve(dir, REFERENCE_FILE))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== REFERENCE_SHA256) throw new Error(`B05-06 reference changed: ${sha256}`)
  return { file: REFERENCE_FILE, sha256, bytes }
}

/**
 * B05-06.2/06.3 in the reference's own pixels (2584×1848; the right phone's
 * 390px viewport is ~709px wide). The proposed countdown and its Start/Reset
 * pair, inside marker 3's box from just under its top outline (so the timer's
 * own top stroke is in) to above marker 3's badge. Marker 2's glyph touches
 * only the last ~1.5% of columns, far short of a rule row.
 */
const REF_SCALE = 709 / 390
const REGION_06 = {
  id: '06.2/06.3',
  description: 'Proposed full-width countdown with Start and Reset side by side underneath (marker 3: "timer on top and the two buttons underneath, but inline the card above the log set button")',
  x0: 1189, x1: 1912, y0: 572, y1: 827,
}

type Region = { x0: number; x1: number; y0: number; y1: number }

/**
 * The arrangement in a region, read from its pixels: the framed rows it
 * stacks into (each between a top and a bottom stroke), and for each row its
 * horizontal clusters — runs of inked columns separated by an uninked gutter
 * wider than 4 CSS px. The same measure reads the reference and a capture.
 */
async function arrangement(page: Page, image: Buffer, type: string, region: Region, scale: number) {
  const mergeGap = Math.round(4 * scale)
  const gutter = Math.round(4 * scale)
  const step = Math.max(1, Math.round(scale))
  return page.evaluate(async ({ data, type, region, mergeGap, gutter, step }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:${type};base64,${data}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const width = region.x1 - region.x0
    const height = region.y1 - region.y0
    const pixels = context.getImageData(region.x0, region.y0, width, height).data
    const luminance = (x: number, y: number) => {
      const index = (Math.min(y, height - 1) * width + Math.min(x, width - 1)) * 4
      return 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]
    }
    // Ink is a hard edge — a stroke or a glyph — measured across one CSS
    // pixel. The shipped emission halo and the urgency surface fade smoothly
    // and are not ink.
    const lit = (x: number, y: number) => {
      const here = luminance(x, y)
      // 25 keeps the crimson timer-low stroke and drops the faint scanlines.
      return Math.abs(here - luminance(x + step, y)) > 25 || Math.abs(here - luminance(x, y + step)) > 25
    }
    // A frame's top or bottom stroke is a rule: a row lit across most of the
    // width. The urgency cue's hard edge at the viewport side, digits and
    // labels never are.
    const ruleRow = (y: number) => {
      let count = 0
      for (let x = 0; x < width; x += 1) if (lit(x, y)) count += 1
      return count >= width * 0.6
    }
    const rules: { top: number; bottom: number }[] = []
    for (let y = 0; y < height; y += 1) {
      if (!ruleRow(y)) continue
      const last = rules.at(-1)
      if (last !== undefined && y - last.bottom <= mergeGap) last.bottom = y
      else rules.push({ top: y, bottom: y })
    }
    // Each framed row is the band from one rule to the next: top stroke to
    // bottom stroke, then the next row's.
    const blocks: { top: number; bottom: number }[] = []
    for (let index = 0; index + 1 < rules.length; index += 2) {
      blocks.push({ top: rules[index].top, bottom: rules[index + 1].bottom })
    }
    return blocks.map((block) => {
      const columns: boolean[] = []
      for (let x = 0; x < width; x += 1) {
        let on = false
        for (let y = block.top; y <= block.bottom && !on; y += 1) on = lit(x, y)
        columns.push(on)
      }
      const clusters: { left: number; right: number }[] = []
      for (let x = 0; x < width; x += 1) {
        if (!columns[x]) continue
        const last = clusters.at(-1)
        if (last !== undefined && x - last.right <= gutter) last.right = x
        else clusters.push({ left: x, right: x })
      }
      return {
        top: block.top / height, bottom: block.bottom / height, height: block.bottom - block.top + 1,
        clusters: clusters.map(({ left, right }) => ({ left: left / width, right: right / width })),
      }
    })
  }, { data: image.toString('base64'), type, region, mergeGap, gutter, step })
}

type Blocks = Awaited<ReturnType<typeof arrangement>>

/**
 * The B05-06 composition as numbers: a framed timer row spanning the width,
 * then — below it — a framed row that splits into two side-by-side halves
 * around the centre.
 */
function composition(major: Blocks) {
  const [timer, pair] = major
  const halves = pair?.clusters.filter((cluster) => cluster.right - cluster.left > 0.1) ?? []
  return {
    blocks: major.length,
    timerSpan: timer === undefined ? 0 : Math.max(...timer.clusters.map((c) => c.right)) - Math.min(...timer.clusters.map((c) => c.left)),
    timerAbovePair: timer !== undefined && pair !== undefined && timer.bottom < pair.top,
    timerToPairHeight: timer === undefined || pair === undefined ? 0 : timer.height / pair.height,
    pairHalves: halves.length,
    leftHalf: halves[0] ?? null,
    rightHalf: halves[1] ?? null,
  }
}

type Composition = ReturnType<typeof composition>

function expectComposition(actual: Composition, ref: Composition, context: string) {
  const detail = `${context}: ${JSON.stringify({ actual, ref })}`
  expect(actual.blocks, detail).toBeGreaterThanOrEqual(2)
  expect(actual.timerAbovePair, detail).toBe(true)
  // Full width: the timer spans the card's content as the reference does.
  expect(actual.timerSpan, detail).toBeGreaterThan(0.9)
  expect(Math.abs(actual.timerSpan - ref.timerSpan), detail).toBeLessThan(0.08)
  // The selected preview makes the readout more prominent than its controls;
  // a wide strip containing the old compact digits is not that composition.
  expect(actual.timerToPairHeight / ref.timerToPairHeight, detail).toBeGreaterThan(0.8)
  expect(actual.timerToPairHeight / ref.timerToPairHeight, detail).toBeLessThan(1.25)
  // Side by side: two halves, one each side of the centre, as wide as each other.
  expect(actual.pairHalves, detail).toBe(2)
  expect(actual.leftHalf!.right, detail).toBeLessThan(0.52)
  expect(actual.rightHalf!.left, detail).toBeGreaterThan(0.48)
  const width = (half: { left: number; right: number }) => half.right - half.left
  expect(width(actual.leftHalf!) / width(actual.rightHalf!), detail).toBeGreaterThan(0.85)
  expect(width(actual.leftHalf!) / width(actual.rightHalf!), detail).toBeLessThan(1.18)
  expect(Math.abs(width(actual.leftHalf!) - width(ref.leftHalf!)), detail).toBeLessThan(0.08)
}

async function referenceComposition(page: Page) {
  const ref = reference()
  const blocks = await arrangement(page, ref.bytes, 'image/jpeg', REGION_06, REF_SCALE)
  return { file: ref.file, sha256: ref.sha256, region: REGION_06, blocks, measured: composition(blocks) }
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
  throw new Error(`Synthetic movement-countdown origin ${origin} did not start`)
}

/** As the other B05 specs: serve a bundle with non-secret placeholders when no public URL is configured. */
const test = scanned.extend<object, { syntheticOrigin: string | null }>({
  syntheticOrigin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      if (!SYNTHETIC_ORIGIN_NEEDED) return use(null)
      const port = 5660 + workerInfo.parallelIndex
      const origin = `http://localhost:${port}`
      const server = spawn(process.execPath, [
        resolve(import.meta.dirname, '../node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort',
      ], {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: 'https://synthetic-b05-movement-countdown.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-movement-countdown-public-placeholder',
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
      await expect(content(page).getByRole('heading', { name: 'hollow body hold', exact: true })).toBeVisible()
      await expect(content(page).getByRole('region', { name: 'hollow body hold countdown' })).toBeVisible()
      await checkA11y()
    })
  },
})

/** Default no-save cases reject every set write; only the explicit-save case opts in. */
async function syntheticApp(page: Page, origin: string, options: {
  workout?: typeof WORKOUT; allowSetWrites?: boolean
} = {}) {
  const workout = options.workout ?? WORKOUT
  const exercises = workout === WORKOUT ? WORKOUT_EXERCISES : workout.sections
    .flatMap((section) => section.blocks.flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
  const exerciseIds = new Set(exercises.map((exercise) => exercise.id))
  const unexpected: string[] = []
  const blockedOutbound: string[] = []
  const writes: string[] = []
  const mutations: SetObservationMutation[] = []
  const heads = new Map<string, SetObservationAck['head']>()
  const blockResults: BlockResultRow[] = []
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
        return reply(exercises.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (name === 'workout_exercises') return reply(exercises)
      if (['workout_sessions', 'load_anchors', 'location_equipment', 'saved_workout_attempts', 'saved_workouts',
        'saved_workout_completions', 'rest_days', 'user_constraints'].includes(name)) return reply([])
      if (name === 'block_results') return reply(blockResults)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(workout)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'mutate_set_observation') {
        // Running out never logs. The original cases still reject every write;
        // the Superset case enables only its explicitly submitted observations.
        const p = request.postDataJSON() as Record<string, unknown>
        const mutation = { observation_id: p.p_observation_id, mutation_id: p.p_mutation_id,
          revision: p.p_revision, expected_revision: p.p_expected_revision, operation: p.p_operation,
          exercise_id: p.p_exercise_id, set_number: p.p_set_number, values: p.p_values } as SetObservationMutation
        writes.push(`set ${isSetObservationMutation(mutation) ? mutation.set_number : '?'}`)
        if (!options.allowSetWrites) return reply({ code: 'PGRST000', message: 'Synthetic: no set write is expected.' }, 503)
        if (!isSetObservationMutation(mutation)) {
          unexpected.push('invalid set observation')
          return reply({ outcome: 'invalid' }, 400)
        }
        expect(exerciseIds.has(mutation.exercise_id)).toBe(true)
        const previous = heads.get(mutation.observation_id)
        if (previous?.mutation_id === mutation.mutation_id) {
          expect(mutation).toEqual(mutations.find((saved) => saved.mutation_id === mutation.mutation_id))
          return reply({ outcome: 'replayed', mutation, head: previous })
        }
        expect(mutation.operation).toBe('insert')
        expect(previous).toBeUndefined()
        expect(mutation.expected_revision).toBe(0)
        expect(mutation.revision).toBe(1)
        const row = exerciseSetLogRowSchema.parse({
          id: mutation.observation_id, workout_exercise_id: mutation.exercise_id,
          prescription_revision_status: 'active', set_number: mutation.set_number,
          actual_reps: null, actual_duration_seconds: null, actual_distance: null,
          actual_distance_unit: null, weight: null, weight_unit: 'kg', rpe: null,
          is_warmup_set: false, created_at: new Date().toISOString(), effort: null,
          ...mutation.values, mutation_revision: mutation.revision, last_mutation_id: mutation.mutation_id,
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
    if (request.method() === 'POST' && name === 'block_results') {
      // Leaving a section records that section's result; it is not a set.
      const insert = (request.postDataJSON() as Record<string, unknown>[])[0]
      const row = blockResultRowSchema.parse({ elapsed_seconds: null, completed_under_cap: null,
        rounds_completed: null, partial_round_reps: null, minutes_completed: null, highest_rung: null,
        perceived_effort: null, notes: null, ...insert,
        id: `00000000-0000-4000-8000-1400000000${String(blockResults.length + 1).padStart(2, '0')}`,
        created_at: new Date().toISOString() })
      blockResults.push(row)
      return reply([row], 201)
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic movement-countdown request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ authKey, owner }) => {
    localStorage.setItem(authKey, JSON.stringify({
      accessToken: 'synthetic-b05-movement-countdown-session', refreshToken: 'synthetic-b05-movement-countdown-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-movement-countdown@example.invalid' },
    }))
  }, { authKey: AUTH_KEY, owner: OWNER })
  return {
    writes,
    mutations,
    blockResults,
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
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Movement countdown capture requires an actual Git source identity')
  return { head, dirty: git(['status', '--porcelain', '--untracked-files=all']) !== '' }
}

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
const sheet = (page: Page) => page.locator('section.clr-set-sheet')

/** The one movement card, by its heading, on the main screen. */
function card(page: Page, heading: string): Locator {
  return content(page).locator('section').filter({
    has: page.getByRole('heading', { name: heading, exact: true }),
  }).last()
}

const countdownOf = (page: Page, movement: string) =>
  content(page).getByRole('region', { name: `${movement} countdown`, exact: true })
const timerOf = (region: Locator) => region.getByRole('timer', { name: 'Countdown', exact: true })

async function digits(timer: Locator): Promise<number> {
  const text = await timer.textContent()
  const match = /(\d\d):(\d\d)/.exec(text ?? '')
  if (match === null) throw new Error(`no countdown digits in ${text}`)
  return Number(match[1]) * 60 + Number(match[2])
}

/** Tick the controlled clock and let the countdown's own interval repaint. */
async function advance(page: Page, ms: number) {
  await page.clock.runFor(ms)
}

async function collapseSheet(page: Page) {
  await page.getByRole('button', { name: 'Minimize' }).click()
  await expect(sheet(page)).toHaveCount(0)
}

/**
 * Where the countdown sits: inside the card, full width of the card's
 * content, its two controls side by side under it, and above the card's Rest.
 */
async function placement(region: Locator, cardLocator: Locator, rest: Locator) {
  const [box, cardBox, restBox] = await Promise.all([region.boundingBox(), cardLocator.boundingBox(), rest.boundingBox()])
  const parts = await region.evaluate((element) => {
    const rect = (node: Element | null) => {
      if (node === null) return null
      const { left, right, top, bottom, width } = node.getBoundingClientRect()
      return { left, right, top, bottom, width }
    }
    const timer = element.querySelector('[role="timer"]')
    const buttons = Array.from(element.querySelectorAll('.clr-action-group button')).map(rect)
    return {
      timer: rect(timer?.closest('.clr-bleed') ?? null),
      group: rect(element.querySelector('.clr-action-group')),
      groupClass: element.querySelector('.clr-action-group')?.className ?? '',
      buttons,
      nestedCards: element.querySelectorAll('.clr-card').length,
      digitSize: parseFloat(getComputedStyle(element.querySelector('[role="timer"] .clr-tumble')!).fontSize),
      controlSize: parseFloat(getComputedStyle(element.querySelector('.clr-action-group button')!).fontSize),
    }
  })
  return { region: box!, card: cardBox!, rest: restBox!, ...parts }
}

function expectPlacement(found: Awaited<ReturnType<typeof placement>>, context: string) {
  const detail = `${context}: ${JSON.stringify(found)}`
  // Inside the card, above Rest.
  expect(found.region.x, detail).toBeGreaterThanOrEqual(found.card.x - 1)
  expect(found.region.x + found.region.width, detail).toBeLessThanOrEqual(found.card.x + found.card.width + 1)
  expect(found.region.y, detail).toBeGreaterThanOrEqual(found.card.y)
  expect(found.region.y + found.region.height, detail).toBeLessThanOrEqual(found.card.y + found.card.height + 1)
  expect(found.region.y + found.region.height, detail).toBeLessThanOrEqual(found.rest.y + 1)
  // Full width: the timer and the pair each span the countdown's own width.
  expect(found.timer!.width, detail).toBeGreaterThan(found.region.width - 2)
  expect(found.group!.width, detail).toBeGreaterThan(found.region.width - 2)
  expect(found.timer!.bottom, detail).toBeLessThanOrEqual(found.group!.top + 1)
  // Two controls, side by side, equal halves.
  expect(found.groupClass, detail).toContain('clr-action-group--paired')
  expect(found.buttons, detail).toHaveLength(2)
  const [first, second] = found.buttons as { left: number; right: number; top: number; width: number }[]
  expect(Math.abs(first.top - second.top), detail).toBeLessThan(1)
  expect(first.right, detail).toBeLessThanOrEqual(second.left)
  expect(Math.abs(first.width - second.width), detail).toBeLessThan(2)
  // EXC-03: no card nested inside the movement's card through the timer.
  expect(found.nestedCards, detail).toBe(0)
  expect(found.digitSize, detail).toBeGreaterThanOrEqual(found.controlSize * 1.5)
}

/** The countdown as captured, with the same arrangement measure the reference takes. */
async function capture(page: Page, testInfo: TestInfo, id: string, region: Locator, cardLocator: Locator) {
  await region.scrollIntoViewIfNeeded()
  const viewportShot = await page.screenshot({ animations: 'disabled', caret: 'hide' })
  const regionShot = await region.screenshot({ animations: 'disabled', caret: 'hide' })
  const cardShot = await cardLocator.screenshot({ animations: 'disabled', caret: 'hide' })
  const files = { region: `${id}.png`, card: `${id}-card.png`, viewport: `${id}-viewport.png` }
  writeFileSync(testInfo.outputPath(files.viewport), viewportShot)
  writeFileSync(testInfo.outputPath(files.region), regionShot)
  writeFileSync(testInfo.outputPath(files.card), cardShot)
  await testInfo.attach(files.region, { path: testInfo.outputPath(files.region), contentType: 'image/png' })
  await testInfo.attach(files.card, { path: testInfo.outputPath(files.card), contentType: 'image/png' })
  await testInfo.attach(files.viewport, { path: testInfo.outputPath(files.viewport), contentType: 'image/png' })
  const scale = await page.evaluate(() => devicePixelRatio)
  // Only the timer and its pair — not the milestone line under them.
  const extent = await region.evaluate((element) => {
    const top = element.getBoundingClientRect()
    const group = element.querySelector('.clr-action-group')!.getBoundingClientRect()
    return { width: top.width, bottom: group.bottom - top.top }
  })
  const blocks = await arrangement(page, regionShot, 'image/png', {
    x0: 0, x1: Math.round(extent.width * scale), y0: 0, y1: Math.round(extent.bottom * scale),
  }, scale)
  return {
    capture: {
      region: { file: files.region, sha256: createHash('sha256').update(regionShot).digest('hex') },
      card: { file: files.card, sha256: createHash('sha256').update(cardShot).digest('hex') },
      viewport: { file: files.viewport, sha256: createHash('sha256').update(viewportShot).digest('hex') },
    },
    measured: composition(blocks),
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

test('B05-06.2/06.3 reference region is a full-width countdown above a side-by-side pair', async ({ page }, testInfo) => {
  await page.setContent('<!doctype html><title>reference</title>')
  const ref = await referenceComposition(page)
  const detail = JSON.stringify(ref)
  expect(ref.measured.blocks, detail).toBeGreaterThanOrEqual(2)
  expect(ref.measured.timerAbovePair, detail).toBe(true)
  expect(ref.measured.timerToPairHeight, detail).toBeGreaterThan(1)
  expect(ref.measured.timerSpan, detail).toBeGreaterThan(0.9)
  expect(ref.measured.pairHalves, detail).toBe(2)
  await testInfo.attach('reference-06.json', { body: JSON.stringify(ref, null, 2), contentType: 'application/json' })
})

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 movement countdown @ ${size}`, () => {
    test.use({ viewport })

    test('logger card: full-width countdown above its pair, above Rest, through every state; distinct clocks; nothing logged', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await page.clock.install()
      await visit('/workout')
      const ref = await referenceComposition(page)
      const refRecord = { file: ref.file, sha256: ref.sha256, region: ref.region }
      const consumer = 'Workout · ExerciseSetLogger standard movement card (src/ui/set-logger.tsx → MovementCountdown)'

      const hold = card(page, 'hollow body hold')
      const region = countdownOf(page, 'hollow body hold')
      const timer = timerOf(region)
      const rest = hold.getByRole('button', { name: 'Rest', exact: true })
      const start = region.getByRole('button', { name: 'Start', exact: true })
      const pause = region.getByRole('button', { name: 'Pause', exact: true })
      const reset = region.getByRole('button', { name: 'Reset', exact: true })
      const status = region.getByRole('status')
      const edge = page.locator('[data-countdown-edge]')

      // One movement countdown, on the timed movement only; no outside Log.
      await expect(content(page).getByRole('region', { name: /countdown$/ })).toHaveCount(1)
      await expect(card(page, 'bench press').getByRole('timer', { name: 'Countdown' })).toHaveCount(0)
      await expect(content(page).getByRole('button', { name: /^log( set| round)?$/i })).toHaveCount(0)
      await expect(region).toBeVisible()

      const states: Record<string, unknown>[] = []
      const shoot = async (state: string) => {
        expectPlacement(await placement(region, hold, rest), `${size} ${state}`)
        const shot = await capture(page, testInfo, `logger-${state}-${size}`, region, hold)
        expectComposition(shot.measured, ref.measured, `${size} logger ${state}`)
        states.push({ state, ...shot })
        await record(page, testInfo, `logger-${state}-${size}`, {
          consumer, state, viewport, reference: refRecord,
          measured: { reference: ref.measured, actual: shot.measured }, capture: shot.capture,
          criteria: { 'AC-032': 'pass', 'AC-033': 'pass', 'AC-050': 'pass', 'AC-066': 'pass' },
        })
      }

      // ── Ready: Start enabled, Reset disabled ─────────────────────────────
      expect(await digits(timer)).toBe(HOLD_SECONDS)
      await expect(start).toBeEnabled()
      await expect(reset).toBeDisabled()
      await expect(region).toHaveAttribute('data-countdown-status', 'ready')
      await shoot('ready')

      // ── Running: Pause in Start's place, Reset enabled ───────────────────
      await start.click()
      await advance(page, 5000)
      await expect(region).toHaveAttribute('data-countdown-status', 'running')
      await expect(pause).toBeVisible()
      await expect(reset).toBeEnabled()
      expect(await digits(timer)).toBeLessThanOrEqual(HOLD_SECONDS - 5)
      await shoot('running')

      // ── Shared rest is the sheet's clock, not this one ───────────────────
      const beforeRest = await digits(timer)
      await rest.click()
      const restBar = sheet(page).getByRole('region', { name: 'Rest', exact: true })
      await expect(restBar.getByRole('timer', { name: 'Time remaining' })).toBeVisible()
      await expect(sheet(page).getByRole('timer', { name: 'Countdown' })).toHaveCount(0)
      await expect(content(page).getByRole('region', { name: 'hollow body hold countdown' })).toHaveCount(1)
      expect(await digits(timer)).toBeLessThanOrEqual(beforeRest)
      await collapseSheet(page)
      await expect(region).toHaveAttribute('data-countdown-status', 'running')

      // ── Paused: holds its reading while the session clock counts on ──────
      await pause.click()
      await expect(region).toHaveAttribute('data-countdown-status', 'paused')
      const held = await digits(timer)
      const session = page.getByRole('timer', { name: 'Session time' })
      await expect(session).toBeVisible()
      expect(await hold.getByRole('timer', { name: 'Session time' }).count()).toBe(0)
      const sessionBefore = await digits(session)
      await advance(page, 10_000)
      expect(await digits(timer)).toBe(held)
      expect(await digits(session)).toBeGreaterThanOrEqual(sessionBefore + 10)
      await expect(start).toBeEnabled()
      await expect(reset).toBeEnabled()
      await shoot('paused')

      // ── Reset returns to ready and logs nothing ──────────────────────────
      await reset.click()
      await expect(region).toHaveAttribute('data-countdown-status', 'ready')
      expect(await digits(timer)).toBe(HOLD_SECONDS)
      await expect(reset).toBeDisabled()

      // ── Final five seconds, with motion: low state, pulse, screen edge ───
      await start.click()
      await advance(page, (HOLD_SECONDS - 4) * 1000)
      await expect(timer).toHaveClass(/clr-chamfer--timer-low/)
      await expect(status).toHaveText('Final 5 seconds')
      await expect(edge).toHaveCount(1)
      await expect(edge).toHaveAttribute('data-loop', 'run')
      await expect(timer.locator('xpath=..')).toHaveAttribute('data-loop', 'run')
      await expect(session).not.toHaveClass(/clr-chamfer--timer-low/)
      await shoot('urgent')

      // ── Completed: done, Start disabled, nothing logged ──────────────────
      await advance(page, 6000)
      await expect(region).toHaveAttribute('data-countdown-status', 'finished')
      expect(await digits(timer)).toBe(0)
      await expect(status).toHaveText('Countdown done')
      await expect(start).toBeDisabled()
      await expect(reset).toBeEnabled()
      await expect(edge).toHaveCount(0)
      await advance(page, 60_000)
      expect(app.writes, 'Timer expiry must not fabricate a logged result').toEqual([])
      await expect(hold.getByRole('list', { name: 'Logged sets' })).toHaveCount(0)
      await expect(sheet(page)).toHaveCount(0)
      await shoot('completed')

      // ── Reduced motion: the same low state and edge, still ───────────────
      await reset.click()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await start.click()
      await advance(page, (HOLD_SECONDS - 3) * 1000)
      await expect(timer).toHaveClass(/clr-chamfer--timer-low/)
      await expect(status).toHaveText('Final 5 seconds')
      await expect(edge).toHaveCount(1)
      await expect(edge).toHaveAttribute('data-loop', 'still')
      await expect(timer.locator('xpath=..')).toHaveAttribute('data-loop', 'still')
      await shoot('urgent-reduced-motion')

      expect(app.writes).toEqual([])
      app.assertContained()
      await testInfo.attach(`logger-states-${size}.json`, { body: JSON.stringify(states, null, 2), contentType: 'application/json' })
    })

    test('circuit row: the one clock sits in the owning card above Rest and keeps its deadline through load entry; round and AMRAP clocks stay theirs', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL))
      await page.clock.install()
      await visit('/workout')
      const ref = await referenceComposition(page)
      const refRecord = { file: ref.file, sha256: ref.sha256, region: ref.region }
      await page.getByRole('button', { name: 'Next section' }).click()

      const plank = () => card(page, '1. plank')
      const region = countdownOf(page, 'plank')
      const timer = timerOf(region)
      const start = region.getByRole('button', { name: 'Start', exact: true })
      const pause = region.getByRole('button', { name: 'Pause', exact: true })
      const openEntry = page.getByRole('button', { name: 'Rest for plank', exact: true })

      // ── Closed row: in its card, above its Rest entry ────────────────────
      await expect(region).toBeVisible()
      await expect(content(page).getByRole('region', { name: /countdown$/ })).toHaveCount(1)
      await expect(card(page, '2. goblet squat').getByRole('timer', { name: 'Countdown' })).toHaveCount(0)
      expect(await digits(timer)).toBe(PLANK_SECONDS)
      expectPlacement(await placement(region, plank(), openEntry), `${size} circuit closed ready`)
      const closed = await capture(page, testInfo, `circuit-closed-ready-${size}`, region, plank())
      expectComposition(closed.measured, ref.measured, `${size} circuit closed ready`)
      await record(page, testInfo, `circuit-closed-ready-${size}`, {
        consumer: 'Workout · circuit row card, load entry closed (src/ui/circuit-block.tsx → MovementCountdownView)',
        state: 'ready', viewport, reference: refRecord,
        measured: { reference: ref.measured, actual: closed.measured }, capture: closed.capture,
        criteria: { 'AC-032': 'pass', 'AC-050': 'pass', 'AC-066': 'pass' },
      })

      // ── A movement's countdown is not the round clock ────────────────────
      await start.click()
      await advance(page, 5000)
      await expect(region).toHaveAttribute('data-countdown-status', 'running')
      await expect(page.getByRole('button', { name: 'Start round 1' })).toBeVisible()
      await expect(page.getByRole('timer', { name: 'Round 1 time' })).toHaveCount(0)
      const beforeEntry = await digits(timer)

      // ── Optional entry: same clock, same deadline, one region ────────────
      await openEntry.click()
      await expect(page.getByRole('form', { name: 'Log set 1 of plank' })).toBeVisible()
      await expect(content(page).getByRole('region', { name: 'plank countdown' })).toHaveCount(1)
      await expect(sheet(page).getByRole('timer', { name: 'Countdown' })).toHaveCount(0)
      await expect(region).toHaveAttribute('data-countdown-status', 'running')
      expect(await digits(timer)).toBeLessThanOrEqual(beforeEntry)
      expect(await digits(timer)).toBeGreaterThanOrEqual(beforeEntry - 2)
      await collapseSheet(page)
      await advance(page, 3000)
      const opened = plank()
      const loggerRest = opened.getByRole('button', { name: 'Rest', exact: true })
      expectPlacement(await placement(region, opened, loggerRest), `${size} circuit opened running`)
      const running = await capture(page, testInfo, `circuit-open-running-${size}`, region, opened)
      expectComposition(running.measured, ref.measured, `${size} circuit open running`)
      await record(page, testInfo, `circuit-open-running-${size}`, {
        consumer: 'Workout · circuit row with optional load entry open (shared ExerciseSetLogger card, row-owned clock)',
        state: 'running', viewport, reference: refRecord,
        measured: { reference: ref.measured, actual: running.measured }, capture: running.capture,
        criteria: { 'AC-032': 'pass', 'AC-050': 'pass', 'AC-066': 'pass' },
      })
      const beforeHide = await digits(timer)
      await page.getByRole('button', { name: 'Hide load entry for plank', exact: true }).click()
      await expect(openEntry).toBeVisible()
      await expect(content(page).getByRole('region', { name: 'plank countdown' })).toHaveCount(1)
      await expect(pause).toBeVisible()
      expect(await digits(timer)).toBeLessThanOrEqual(beforeHide)
      expect(await digits(timer)).toBeGreaterThanOrEqual(beforeHide - 2)

      // ── Pause, then run out with entry closed: nothing logged ────────────
      await pause.click()
      await expect(region).toHaveAttribute('data-countdown-status', 'paused')
      const paused = await capture(page, testInfo, `circuit-closed-paused-${size}`, region, plank())
      expectComposition(paused.measured, ref.measured, `${size} circuit closed paused`)
      await start.click()
      await advance(page, PLANK_SECONDS * 1000)
      await expect(region).toHaveAttribute('data-countdown-status', 'finished')
      await expect(start).toBeDisabled()
      const done = await capture(page, testInfo, `circuit-closed-completed-${size}`, region, plank())
      expectComposition(done.measured, ref.measured, `${size} circuit closed completed`)
      expect(app.writes, 'Timer expiry must not fabricate a logged result').toEqual([])
      for (const [state, shot] of [['paused', paused], ['completed', done]] as const) {
        await record(page, testInfo, `circuit-closed-${state}-${size}`, {
          consumer: 'Workout · circuit row card, load entry closed (src/ui/circuit-block.tsx → MovementCountdownView)',
          state, viewport, reference: refRecord,
          measured: { reference: ref.measured, actual: shot.measured }, capture: shot.capture,
          criteria: { 'AC-032': 'pass', 'AC-033': 'pass', 'AC-050': 'pass', 'AC-066': 'pass' },
        })
      }

      // ── The round clock is its own, and leaves the movement clock alone ──
      await page.getByRole('button', { name: 'Start round 1' }).click()
      await expect(page.getByRole('timer', { name: 'Round 1 time' })).toBeVisible()
      await expect(region.getByRole('timer', { name: 'Round 1 time' })).toHaveCount(0)
      await expect(region).toHaveAttribute('data-countdown-status', 'finished')

      // ── AMRAP: its window is the block's TimerDisplay, not a movement's ──
      await page.getByRole('button', { name: 'Next section' }).click()
      await page.getByRole('button', { name: 'Start AMRAP', exact: true }).click()
      const amrapWindow = page.getByRole('timer', { name: 'Time remaining' })
      await expect(amrapWindow).toBeVisible()
      await expect(content(page).getByRole('region', { name: /countdown$/ })).toHaveCount(0)
      await expect(content(page).getByRole('timer', { name: 'Countdown' })).toHaveCount(0)

      expect(app.writes.filter((write) => write.startsWith('set'))).toEqual([])
      app.assertContained()
    })

    test('superset movement: own-card countdown stays distinct from block rest, retains deadline and drafts, and rearms only after explicit combined logging', async ({ page, visit, baseURL }, testInfo) => {
      const app = await syntheticApp(page, originOf(baseURL), { workout: SUPERSET_WORKOUT, allowSetWrites: true })
      await page.clock.install()
      await visit('/workout')
      const ref = await referenceComposition(page)
      const refRecord = { file: ref.file, sha256: ref.sha256, region: ref.region }
      await page.getByRole('button', { name: 'Next section', exact: true }).click()
      const block = content(page).locator('.clr-card').filter({ has: page.getByRole('list', { name: 'Movements in this superset' }) }).last()
      // Section headings use the existing section-type label. Observe the
      // actual Superset consumer rather than the fixture's stored title.
      await expect(block.getByRole('list', { name: 'Movements in this superset', exact: true })).toBeVisible()
      await expect(block.getByRole('heading', { name: 'A2 plank', exact: true })).toBeVisible()
      const plank = () => card(page, 'A2 plank')
      const region = countdownOf(page, 'plank')
      const timer = timerOf(region)
      const start = region.getByRole('button', { name: 'Start', exact: true })
      const reset = region.getByRole('button', { name: 'Reset', exact: true })
      const blockRest = block.getByRole('button', { name: 'Rest', exact: true })
      const restBar = () => page.getByRole('region', { name: 'Rest', exact: true })
      const blockResultsBefore = app.blockResults.length
      const consumer = 'Workout · Superset ExerciseSetLogger per-movement countdown, separate combined-round sheet and block rest'
      const shoot = async (state: string) => {
        expectPlacement(await placement(region, plank(), blockRest), `${size} superset ${state}`)
        const shot = await capture(page, testInfo, `superset-${state}-${size}`, region, plank())
        expectComposition(shot.measured, ref.measured, `${size} superset ${state}`)
        await record(page, testInfo, `superset-${state}-${size}`, {
          consumer, state, viewport, reference: refRecord,
          measured: { reference: ref.measured, actual: shot.measured }, capture: shot.capture,
          criteria: { 'AC-032': 'pass', 'AC-050': 'pass', 'AC-066': 'pass' },
        })
      }

      await expect(blockRest).toHaveCount(1)
      await expect(content(page).getByRole('region', { name: /countdown$/ })).toHaveCount(1)
      await expect(card(page, 'A1 bench press').getByRole('timer', { name: 'Countdown' })).toHaveCount(0)
      expect(await digits(timer)).toBe(PLANK_SECONDS)
      await expect(reset).toBeDisabled()
      await shoot('ready')
      await start.click()
      await advance(page, 4000)
      await expect(region).toHaveAttribute('data-countdown-status', 'running')
      const beforeSheet = await digits(timer)
      await shoot('running')

      // One block Rest opens the real combined entry; the movement's timer
      // remains in its own card and is not moved into the sheet.
      await blockRest.click()
      const form = page.getByRole('form', { name: 'Log round 1 of bench press and plank', exact: true })
      await expect(form).toBeVisible()
      await expect(restBar()).toHaveCount(1)
      await expect(restBar()).toContainText('Rest after round 1')
      const restTimer = restBar().getByRole('timer', { name: 'Time remaining', exact: true })
      expect(await digits(restTimer)).toBeLessThanOrEqual(PAIR_REST)
      await expect(sheet(page).getByRole('timer', { name: 'Countdown', exact: true })).toHaveCount(0)
      await expect(content(page).getByRole('region', { name: 'plank countdown', exact: true })).toHaveCount(1)
      expect(await digits(timer)).toBeLessThanOrEqual(beforeSheet)

      const bench = form.getByRole('group', { name: 'A1 bench press, set 1', exact: true })
      const enteredPlank = form.getByRole('group', { name: 'A2 plank, set 1', exact: true })
      await bench.getByLabel('Weight').fill('135')
      await bench.getByRole('combobox', { name: 'Unit', exact: true }).selectOption('lb')
      await bench.getByLabel('Reps').fill('7')
      await bench.getByRole('radio', { name: 'Too easy', exact: true }).check()
      await enteredPlank.getByLabel('Seconds').fill('18')
      await enteredPlank.getByRole('radio', { name: 'About right', exact: true }).check()
      const beforeAdvance = await digits(timer)
      await advance(page, 2000)
      const withDraft = await digits(timer)
      expect(withDraft).toBeLessThanOrEqual(beforeAdvance - 2)
      expect(withDraft).toBeGreaterThanOrEqual(beforeAdvance - 4)
      const restBeforeCollapse = await digits(restTimer)
      await collapseSheet(page)
      await expect(region).toHaveAttribute('data-countdown-status', 'running')
      expect(await digits(timer)).toBeLessThanOrEqual(withDraft)
      expect(await digits(timer)).toBeGreaterThanOrEqual(withDraft - 2)
      await shoot('draft-minimized-running')
      expect(app.writes).toEqual([])
      expect(app.mutations).toEqual([])

      // Reopen the held inputs without restarting either clock.
      await blockRest.click()
      await expect(bench.getByLabel('Weight')).toHaveValue('135')
      await expect(bench.getByRole('combobox', { name: 'Unit', exact: true })).toHaveValue('lb')
      await expect(bench.getByLabel('Reps')).toHaveValue('7')
      await expect(bench.getByRole('radio', { name: 'Too easy', exact: true })).toBeChecked()
      await expect(enteredPlank.getByLabel('Seconds')).toHaveValue('18')
      await expect(enteredPlank.getByRole('radio', { name: 'About right', exact: true })).toBeChecked()
      expect(await digits(restBar().getByRole('timer', { name: 'Time remaining', exact: true }))).toBeLessThanOrEqual(restBeforeCollapse)
      await collapseSheet(page)

      // Expiry records neither an observation nor a circuit/block round.
      await advance(page, (PLANK_SECONDS + 2) * 1000)
      await expect(region).toHaveAttribute('data-countdown-status', 'finished')
      expect(await digits(timer)).toBe(0)
      await expect(start).toBeDisabled()
      expect(app.writes).toEqual([])
      expect(app.mutations).toEqual([])
      expect(app.blockResults).toHaveLength(blockResultsBefore)
      await shoot('expired-with-unlogged-draft')

      // Only the real combined Log action commits the independent entries.
      await blockRest.click()
      await expect(enteredPlank.getByLabel('Seconds')).toHaveValue('18')
      const restBeforeLog = await digits(restBar().getByRole('timer', { name: 'Time remaining', exact: true }))
      await form.getByRole('button', { name: 'Log round 1', exact: true }).click()
      await expect.poll(() => app.mutations.length).toBe(2)
      expect(app.mutations.map((mutation) => [mutation.operation, mutation.exercise_id, mutation.set_number])).toEqual([
        ['insert', PAIR_EXERCISE_ID.get('bench-press'), 1], ['insert', PAIR_EXERCISE_ID.get('plank'), 1],
      ])
      expect(app.mutations[0].values).toMatchObject({ weight: 135, weight_unit: 'lb', actual_reps: 7, effort: 'too_easy' })
      expect(app.mutations[1].values).toMatchObject({ actual_duration_seconds: 18, effort: 'about_right' })
      expect(new Set(app.mutations.map((mutation) => mutation.observation_id)).size).toBe(2)
      expect(app.writes).toEqual(['set 1', 'set 1'])
      expect(app.blockResults).toHaveLength(blockResultsBefore)
      expect(await digits(restBar().getByRole('timer', { name: 'Time remaining', exact: true }))).toBeLessThanOrEqual(restBeforeLog)
      if (await sheet(page).count() > 0) await collapseSheet(page)

      // The timed movement's own logged set advances its sequence to15s;
      // neither expiry nor opening/minimizing the entry had rearmed it.
      await expect(region).toHaveAttribute('data-countdown-status', 'ready')
      expect(await digits(timer)).toBe(PAIR_NEXT_SECONDS)
      await expect(start).toBeEnabled()
      await expect(reset).toBeDisabled()
      await shoot('next-set-rearmed-after-explicit-log')
      await blockRest.click()
      const nextRound = page.getByRole('form', { name: 'Log round 2 of bench press and plank', exact: true })
      await expect(nextRound.getByRole('group', { name: 'A2 plank, set 2', exact: true }).getByLabel('Seconds')).toHaveValue(String(PAIR_NEXT_SECONDS))
      await collapseSheet(page)
      await advance(page, PLANK_SECONDS * 1000)
      expect(await digits(timer)).toBe(PAIR_NEXT_SECONDS)
      expect(app.writes).toEqual(['set 1', 'set 1'])
      expect(app.mutations).toHaveLength(2)
      expect(app.blockResults).toHaveLength(blockResultsBefore)
      await record(page, testInfo, `superset-explicit-log-rearm-${size}`, {
        consumer, state: 'expiry wrote nothing; explicit combined round saved two observations; own next-set countdown rearmed but not started',
        viewport, reference: refRecord, mutations: app.mutations,
        measured: { blockResultsBefore, blockResultsAfter: app.blockResults.length, writes: app.writes, nextMovementSeconds: await digits(timer) },
        criteria: { 'AC-033': 'pass', 'AC-034': 'pass', 'AC-050': 'pass' },
      })
      app.assertContained()
    })
  })
}
