import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { ASSET_BLOCKS } from '../../src/dev/gallery-refinement-assets-data'
import { EQUIPMENT } from '../../src/state/onboarding'
import { reviewHandoff } from '../../src/state/review-handoff'
import {
  CONTRACT_VERSION,
  sessionReconstructionSchema,
  sessionSnapshotSchema,
  type SessionAcceptance,
  type SessionSnapshot,
} from '../../src/state/schemas'
import { makePrescription, makeWorkoutBlock } from '../../src/test/factories'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, notOnboardedProfile, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-118 look check (TASK-AC-49761FC1B153): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 *   · `overview` (REQ-004, JOURNEY-004): Round 7's composed Overview card and
 *     Summary metric row. `/review`'s Overview (facts ordered and glyphed by
 *     their `FactKind` through `SummaryFacts`, and its `EquipmentSummary`),
 *     `/history/:id`'s Overview (the same composition over the record, and
 *     the Required equipment group built from the saved `equipment_used`) and
 *     `/summary`'s Duration and Streak cells are each read beside it, over a
 *     workout matched to the state's values (50 min, upper body, intensity 7,
 *     nine movements needing a barbell, a dumbbell, a bench and a kettlebell;
 *     42 min and a two-day streak through today).
 *   · `assets` (REQ-029, JOURNEY-029): Round 7's equipment inventory card.
 *     Setup's own equipment step (`/onboarding`) is read beside it (the same
 *     sixteen choices, in words), Review's Required equipment glyph beside the
 *     state's shipped Dumbbell, and `/review` and `/workout`'s equipment labels
 *     beside their names (words, never a glyph) are captured over the TASK-029
 *     composition naming every Setup id and the Wall ball's medicine ball.
 *
 * Every visible word of each part is read from both sides, and so is the
 * layout: every rendered element's box is measured and compared with its
 * counterpart within `LAYOUT_TOLERANCE_PX` (TASK-103's method, as TASK-110
 * keeps it). A difference no criterion intends fails the case; an intended
 * one is labelled with its criterion ID. Round 7's overview and assets states
 * are composed references over the real primitives
 * (`gallery-refinement-coverage.json`, `compositionBoundary`), so the parts
 * compared are the shared primitives the routes draw; each route's own extra
 * readings are labelled.
 *
 * The accepted states themselves are compared between the base (779618a0) and
 * this tree (`galleryAgainstBase`): their words and their rendered DOM, read
 * at the base by this spec's base reading
 * (`evidence/refinement/task-118/parity/gallery-base-*.json`).
 *
 * Captures hold steady run to run (TASK-116's method; TASK-110's `wholePart`).
 * Each case writes its receipt to `evidence/refinement/task-118/parity/` and
 * its captures to the Runner's evidence store (outside Git), under this
 * body's folder (`clear-gallery-adoption-v2-20261120/task-118/captures/`).
 * Synthetic and contained: nothing is written to any backend except the two
 * synthetic Start calls the assets case answers in memory.
 */
const OWNER = '00000000-0000-4000-8000-000000011801'
const PLACE = '00000000-0000-4000-8000-000000011802'
const EARLIER = '00000000-0000-4000-8000-000000011803'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-118', 'parity')
/** Captures go to this body's folder in the evidence store. */
const CAPTURE_BODY = 'clear-gallery-adoption-v2-20261120'
const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)

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

async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic TASK-118 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-118 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-118.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-118-public-placeholder',
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
test.use({ timezoneId: 'UTC' })

const VIEWPORTS = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Reading, comparing and keeping
// ─────────────────────────────────────────────────────────────────────────────

/** Renders one frame (a screenshot always renders one): pending scroll events and paint land. */
async function renderFrame(page: Page) {
  await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } })
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
  // Entrance and list motion finished, so every word is drawn (loops excepted).
  await page.waitForFunction(() => document.getAnimations()
    .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    .every((animation) => animation.playState !== 'running'))
}

/** The visible words of a part, line by line, read once they hold still. */
async function linesOf(target: Locator): Promise<string[]> {
  const read = async () => (await target.evaluate((element) => (element as HTMLElement).innerText))
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line !== '')
  let previous = await read()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await target.page().waitForTimeout(250)
    const next = await read()
    if (JSON.stringify(next) === JSON.stringify(previous)) return next
    previous = next
  }
  return previous
}

interface Difference { readonly side: 'gallery only' | 'route only'; readonly text: string; readonly criterion: string | null; readonly reason: string | null }
interface Intended { readonly criterion: string; readonly reason: string; readonly side: Difference['side']; readonly match: RegExp }

/** Each line only one side shows, labelled with the criterion that intends it, if any. */
function compare(gallery: readonly string[], route: readonly string[], intended: readonly Intended[]): Difference[] {
  const remaining = [...route]
  const differences: Difference[] = []
  for (const line of gallery) {
    const index = remaining.indexOf(line)
    if (index >= 0) remaining.splice(index, 1)
    else differences.push(label('gallery only', line, intended))
  }
  for (const line of remaining) differences.push(label('route only', line, intended))
  return differences
}

function label(side: Difference['side'], text: string, intended: readonly Intended[]): Difference {
  const rule = intended.find((candidate) => candidate.side === side && candidate.match.test(text))
  return { side, text, criterion: rule?.criterion ?? null, reason: rule?.reason ?? null }
}

/** Captures go beside the Runner's evidence store, outside Git, in this body's folder; else into test-results. */
function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    const dir = join(store.dir, CAPTURE_BODY, 'task-118', 'captures')
    return { dir, identity: `store:${CAPTURE_BODY}/task-118/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-118-parity')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

/** The part's image once two screenshots 100 ms apart are identical; a part that never holds still fails the case. */
async function steadyScreenshot(target: Locator): Promise<Buffer> {
  const shot = () => target.screenshot({ caret: 'hide', animations: 'disabled' })
  let previous = await shot()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await target.page().waitForTimeout(100)
    const next = await shot()
    if (next.equals(previous)) return next
    previous = next
  }
  throw new Error('The captured part never held still for two screenshots in a row.')
}

/** No ScrollRegion is lit: the streak a scroll raises has settled (its 420 ms timer). */
async function scrollSettled(page: Page) {
  await page.waitForFunction(() => document.querySelector('.clr-scroll-region[data-scrolling]') === null)
}

/**
 * How far the part runs past what its scroll region shows: 0 when it is wholly
 * inside its scroller's visible area (or the viewport, with no scroller),
 * within a pixel (a part scrolled to the region's start can sit a fraction of
 * a pixel above its edge).
 */
async function overrun(target: Locator): Promise<number> {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const scroller = element.closest('.clr-scroll-region__scroller')
    const shown = scroller === null ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
    const over = Math.max(shown.top - box.top, box.bottom - shown.bottom)
    return over > 1 ? Math.ceil(over) : 0
  })
}

/**
 * The part's image, whole. A part taller than what its scroll region shows
 * (the circuit's card at 320) used to be captured clipped by the region, with
 * the pinned footer and the page beyond the viewport drawn over its lower
 * part — painted differently run to run (repair round 1: the route's
 * circuit-round card at 320 changed hash between identical runs). So the page
 * is made just tall enough, at the same width, for the region to show the
 * part whole; the part is captured once no ScrollRegion is lit, and the
 * viewport is put back. Its words and boxes were read before, at the
 * approved size.
 */
async function wholePart(target: Locator): Promise<Buffer> {
  const page = target.page()
  const viewport = page.viewportSize()!
  const extra = await overrun(target)
  if (extra > 0) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height + extra + 64 })
    await target.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
    await renderFrame(page)
    await settle(page)
    expect(await overrun(target), 'the part fits the taller page').toBe(0)
  }
  try {
    // Taken while no region is lit, and kept only if none lit while it was taken.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await scrollSettled(page)
      await renderFrame(page)
      const bytes = await steadyScreenshot(target)
      if (await page.evaluate(() => document.querySelector('.clr-scroll-region[data-scrolling]') === null)) return bytes
    }
    throw new Error('A scroll region stayed lit through every capture of the part.')
  } finally {
    if (extra > 0) {
      await page.setViewportSize(viewport)
      await target.evaluate((element) => element.scrollIntoView({ block: 'start' }))
      await renderFrame(page)
      await settle(page)
    }
  }
}

async function keep(target: Locator, name: string) {
  await target.page().mouse.move(0, 0)
  const bytes = await wholePart(target)
  await test.info().attach(`${name}.png`, { body: bytes, contentType: 'image/png' })
  const { dir, identity } = captureDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.png`), bytes)
  return { file: `${identity}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function writeReceipt(name: string, receipt: Record<string, unknown>) {
  mkdirSync(RECEIPTS, { recursive: true })
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-118-parity/v1', task: 'TASK-118', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
}

function expectAllIntended(differences: readonly Difference[], label: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${label}: every visible difference is one a criterion intends`).toEqual([])
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout: where each element is drawn, not only what it says
// ─────────────────────────────────────────────────────────────────────────────

/** How far, in CSS px, an element's edge or size may sit from its counterpart's. */
const LAYOUT_TOLERANCE_PX = 2

/** One rendered element's box, in CSS px from its part's top-left corner, scroll included. */
interface Box { readonly key: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface LayoutDifference {
  readonly key: string
  readonly gallery: Box | null
  readonly route: Box | null
  readonly criterion: string | null
  readonly reason: string | null
}
interface IntendedLayout { readonly criterion: string; readonly reason: string; readonly match: RegExp }

/**
 * Every rendered element of a part (the part itself first), named by its tag,
 * its `clr-` classes and the words it draws and numbered in document order, so
 * the same element is found on both sides whatever wraps the part. A heading
 * is named `h` whatever its level: the level follows the host page's outline
 * (the gallery nests the card one level deeper), not the layout. Elements not
 * drawn (`display: none`, hidden, or no box at all) are left out, and so is a
 * modal dialog the part holds: it is drawn in the top layer against the
 * viewport, not inside the part, and is measured as its own part.
 */
async function boxesOf(target: Locator): Promise<Box[]> {
  return target.evaluate((root) => {
    const origin = root.getBoundingClientRect()
    const rounded = (value: number) => Math.round(value * 10) / 10
    // A scrolled container moves what it holds; measured as drawn unscrolled.
    const scrolled = (element: Element) => {
      let x = 0
      let y = 0
      for (let node = element.parentElement; node !== null && node !== root.parentElement; node = node.parentElement) {
        x += node.scrollLeft
        y += node.scrollTop
      }
      return { x, y }
    }
    const seen = new Map<string, number>()
    const boxes: { key: string; x: number; y: number; width: number; height: number }[] = []
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const modal = element.closest(':modal')
      if (modal !== null && modal !== root && root.contains(modal)) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') continue
      // A disclosure's collapsed region is not drawn (A3 TASK-110: the navigator's closed jump list).
      if (element.closest('.clr-collapsible__region[data-expanded="false"]') !== null && element !== root) continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const classes = [...element.classList].filter((name) => name.startsWith('clr-')).sort().map((name) => `.${name}`).join('')
      const words = (element instanceof HTMLElement ? element.innerText : (element.textContent ?? '')).replace(/\s+/g, ' ').trim().slice(0, 80)
      const tag = element.tagName.toLowerCase().replace(/^h[1-6]$/, 'h')
      const name = element === root ? '(part)' : `${tag}${classes}|${words}`
      const index = seen.get(name) ?? 0
      seen.set(name, index + 1)
      const scroll = element === root ? { x: 0, y: 0 } : scrolled(element)
      boxes.push({
        key: `${name}#${index}`,
        x: rounded(rect.left - origin.left + scroll.x),
        y: rounded(rect.top - origin.top + scroll.y),
        width: rounded(rect.width),
        height: rounded(rect.height),
      })
    }
    return boxes
  })
}

/** Each element drawn elsewhere, at another size, or on one side only, labelled if a criterion intends it. */
function compareLayout(gallery: readonly Box[], route: readonly Box[], intended: readonly IntendedLayout[], axes: 'both' | 'vertical' = 'both'): LayoutDifference[] {
  const remaining = new Map(route.map((box) => [box.key, box]))
  const differences: LayoutDifference[] = []
  const labelled = (key: string, galleryBox: Box | null, routeBox: Box | null): LayoutDifference => {
    const rule = intended.find((candidate) => candidate.match.test(key))
    return { key, gallery: galleryBox, route: routeBox, criterion: rule?.criterion ?? null, reason: rule?.reason ?? null }
  }
  for (const box of gallery) {
    const counterpart = remaining.get(box.key)
    remaining.delete(box.key)
    if (counterpart === undefined) {
      differences.push(labelled(box.key, box, null))
      continue
    }
    const offset = axes === 'vertical'
      ? Math.max(Math.abs(box.y - counterpart.y), Math.abs(box.height - counterpart.height))
      : Math.max(
        Math.abs(box.x - counterpart.x), Math.abs(box.y - counterpart.y),
        Math.abs(box.width - counterpart.width), Math.abs(box.height - counterpart.height),
      )
    if (offset > LAYOUT_TOLERANCE_PX) differences.push(labelled(box.key, box, counterpart))
  }
  for (const box of remaining.values()) differences.push(labelled(box.key, null, box))
  return differences
}

function expectLayoutIntended(differences: readonly LayoutDifference[], label: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${label}: every element is drawn where the accepted gallery draws it, within ${LAYOUT_TOLERANCE_PX}px, unless a criterion intends otherwise`).toEqual([])
}

// ─────────────────────────────────────────────────────────────────────────────
// Matched data: the overview state's own values, as a real workout and record
// ─────────────────────────────────────────────────────────────────────────────

/** The page's clock at entry; held wherever a reading is compared. */
const ENTRY = Date.parse('2026-11-16T12:00:00.000Z')
const TODAY = '2026-11-16'
const RECORDED_DAY = '2026-11-15'

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }

/**
 * Nine movements needing, in order, a barbell, a dumbbell, a bench and a
 * kettlebell (the state's `['barbell', 'dumbbell', 'bench', 'kettlebell']`),
 * composed for 50 minutes of upper-body work at intensity 7.
 */
function overviewAcceptance(): SessionAcceptance {
  return {
    date: TODAY,
    location_id: PLACE,
    session_focus: 'upper_body',
    goal_preset: 'strength',
    requested_duration_mins: 50,
    effective_duration_target_mins: 50,
    computed_duration_mins: null,
    requested_intensity: 7,
    effective_intensity: 7,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'e2e',
    contract_version: CONTRACT_VERSION,
    is_deload: false,
    workout: {
      title: 'TASK-118 parity overview',
      overview: null,
      estimated_duration_mins: 50,
      sections: [
        {
          section_type: 'primary_lift', section_title: 'Main lift', section_notes: null,
          blocks: [makeWorkoutBlock({
            exercises: [
              makePrescription({ exercise_id: 'bench-press', equipment: 'barbell', load_type: 'absolute', load_value: 60, sets: 3, target_value: 5 }),
              makePrescription({ exercise_id: 'dumbbell-row', equipment: 'dumbbell', load_type: 'absolute', load_value: 22, sets: 3, target_value: 10 }),
              makePrescription({ exercise_id: 'step-up', equipment: 'bench', load_type: 'bodyweight', load_value: null, sets: 3, target_value: 10 }),
              makePrescription({ exercise_id: 'kb-swing', equipment: 'kettlebell', load_type: 'absolute', load_value: 24, sets: 3, target_value: 15 }),
            ],
          })],
        },
        {
          section_type: 'conditioning', section_title: 'Finisher', section_notes: null,
          blocks: [makeWorkoutBlock({
            structure_type: 'circuit', rounds: 2, round_rest_seconds: 60,
            exercises: ['push-up', 'air-squat', 'burpee', 'mountain-climber', 'plank'].map((exercise_id) =>
              makePrescription({ exercise_id, ...bodyweight, sets: 2, target_value: 10, rest_seconds: null })),
          })],
        },
      ],
    },
  }
}

/** The same workout, completed on the recorded day in 50 measured minutes, as `session_as_performed` reads it. */
function savedRecord(acceptance: SessionAcceptance) {
  const snapshot = peerGroupingSnapshot(acceptance, { userId: OWNER, startedAt: '2026-11-15T17:00:00.000Z' })
  const session = {
    ...snapshot.session,
    date: RECORDED_DAY,
    session_focus: acceptance.session_focus,
    goal_preset: acceptance.goal_preset,
    effective_intensity: acceptance.effective_intensity,
    requested_intensity: acceptance.requested_intensity,
    actual_duration_mins: 50,
    completed_at: '2026-11-15T17:50:00.000Z',
  }
  return sessionReconstructionSchema.parse({
    reconstruction: 'performed', as_of: session.completed_at, session, state: 'completed',
    sections: snapshot.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({ ...block, block_result: null, exercises: block.exercises.map((entry) => ({ ...entry, movement_result: null })) })),
    })),
  })
}

interface AppOptions {
  /** The planned workout `/review` is handed, and `/workout` runs after Start. */
  acceptance: SessionAcceptance
  /** A signed-in athlete with no setup yet: the guard sends them to Setup. */
  setup?: boolean
}

/** The contained synthetic app: reads, plus Start's two calls answered in memory. */
async function syntheticApp(page: Page, { acceptance, setup = false }: AppOptions) {
  const unexpected: string[] = []
  const writes: string[] = []
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
  const record = savedRecord(acceptance)
  // Summary's completed session: 42 measured minutes (the state's Duration cell).
  const completed = { ...record.session, date: TODAY, actual_duration_mins: 42, completed_at: '2026-11-16T09:00:00.000Z' }
  const streakRows = [
    { session_id: completed.id, completed_at: completed.completed_at, counts_for_streak: true },
    { session_id: EARLIER, completed_at: '2026-11-15T09:00:00.000Z', counts_for_streak: true },
  ]
  const running: SessionSnapshot = sessionSnapshotSchema.parse(peerGroupingSnapshot(acceptance, { userId: OWNER, startedAt: new Date(ENTRY - 60_000).toISOString() }))
  const prescribed: SessionSnapshot = sessionSnapshotSchema.parse(peerGroupingSnapshot(acceptance, { userId: OWNER }))
  const exercises = running.sections.flatMap((section) => section.blocks).flatMap((block) => block.exercises.map(({ exercise }) => exercise))
  let started = false
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET' || request.method() === 'HEAD') {
      if (name === 'profiles') return reply([setup ? notOnboardedProfile({ id: OWNER }) : onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') return reply(setup ? [] : [fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'workout_sessions') return reply([completed])
      if (name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(exercises.filter((exercise) => id === undefined || exercise.exercise_id === id).map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (name === 'workout_exercises') return reply(exercises)
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(started ? running : null)
      if (name === 'session_snapshot') return reply(started ? running : prescribed)
      if (name === 'session_as_performed') return reply(record)
      if (name === 'streak_sessions') {
        const body = request.postDataJSON() as { p_limit?: number }
        return reply(body.p_limit === 1 ? streakRows.slice(0, 1) : streakRows)
      }
      if (name === 'persist_session') {
        writes.push(name)
        return reply(prescribed)
      }
      if (name === 'start_session') {
        writes.push(name)
        started = true
        return reply({ outcome: 'started', state: 'active', session: running.session })
      }
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors', 'generation_refusal_diagnostics',
        'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-118 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-118-session', refreshToken: 'synthetic-task-118-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-118@example.invalid' },
    }))
    if (location.pathname === '/review') history.replaceState({ usr: handoff, key: 'synthetic-task-118', idx: 0 }, '', location.href)
  }, { owner: OWNER, handoff: reviewHandoff(acceptance) })
  return {
    detailPath: `/history/${record.session.id}`,
    assertContained(expectedWrites: readonly string[] = []) {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
      expect(writes, 'Nothing else is written').toEqual(expectedWrites)
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// What each side read, and what a criterion intends
// ─────────────────────────────────────────────────────────────────────────────

/** What each side read at one part. */
interface Reading { readonly lines: string[]; readonly boxes: Box[]; readonly capture: { file: string; sha256: string } | null }

async function read(target: Locator, capture: string | null): Promise<Reading> {
  await expect(target).toBeVisible()
  await target.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await renderFrame(target.page())
  await settle(target.page())
  const lines = await linesOf(target)
  const boxes = await boxesOf(target)
  return { lines, boxes, capture: capture === null ? null : await keep(target, capture) }
}

interface Compared {
  readonly gallery: string
  readonly route: string
  readonly differences: Difference[]
  readonly layout: LayoutDifference[] | null
}

/**
 * Differences a criterion intends between a route's part and the state's.
 * Each names its criterion and why; anything else fails the case.
 */
const GOAL: Intended[] = [
  { side: 'route only', match: /^GOAL$/, criterion: 'AC-C12-01', reason: 'Every useful actual fact: Round 7’s Review composes the workout’s goal (its own `Goal` reading, `src/app/Review.tsx` at bec4454), which the state’s composed card leaves out.' },
  { side: 'route only', match: /^STRENGTH$/, criterion: 'AC-C12-01', reason: 'The goal’s recorded value (the matched workout is composed for strength).' },
]
const RECORD_FACTS: Intended[] = [
  { side: 'gallery only', match: /^MOVEMENTS$|^9$/, criterion: 'AC-R004-03', reason: 'Saved views use recorded facts with recorded meanings: a saved record’s Overview reads its duration, focus and intensity, then its own date and status (C14’s shared order); it states no planned movement count.' },
  { side: 'route only', match: /^SUN 15 NOV 2026$|^DATE$|^STATUS$|^COMPLETED$/, criterion: 'AC-C14-01', reason: 'A saved record’s own date (glyph-led, its term kept for assistive technology) and status (named in words), after the readings it shares with the plan.' },
]
/**
 * Each view's own term for the focus reading. The words read include a term
 * kept for assistive technology only (`innerText` reads visually hidden text).
 */
const TERMS: Intended[] = [
  { side: 'gallery only', match: /^FOCUS$/, criterion: 'TASK-AC-010B47E192B5', reason: 'Each view keeps its own term: the state’s card and a saved record call the focus reading `Focus`, Review calls it `Anchor` (Round 7’s Review at bec4454). The kind (focus), not the word, picks its glyph, its place and that its term is kept for assistive technology only.' },
  { side: 'route only', match: /^ANCHOR$/, criterion: 'TASK-AC-010B47E192B5', reason: 'Review’s own term for the focus reading, kept for assistive technology only; the same Target glyph and place as the state’s `Focus` (compared by kind).' },
]

/** Look differences the words cannot show, each with its criterion; read in the captures and the per-reading layout. */
const LOOK_DIFFERENCES = [
  { parts: ['review-card', 'history-card'], criterion: 'TASK-AC-010B47E192B5', difference: 'The duration and focus readings (and a saved record’s date) show their glyph and value, their term kept for assistive technology only; the state’s composed card shows every term.', atBase: 'Review drew them so already at the base (779618a0); the saved Overview now draws Review’s composition (AC-C14-01).' },
] as const
/**
 * Summary's key numbers wear Summary's own face (Round 7's `Summary.tsx` at
 * bec4454: the display face at the h4 size, U41), where the state's composed
 * cells draw the number in the body face, so each route cell is taller by that
 * line; every element keeps its place across and its width (checked below),
 * and on both sides the two frames fill one equal-height row (C15).
 */
const METRIC_FACE: IntendedLayout[] = [{
  criterion: 'AC-C15-01',
  reason: 'Height only: Summary’s key number is drawn in Summary’s own face (unchanged since bec4454), a taller line than the state’s composed cell, so each cell, its card, accent bar, frame and Echo backdrop are taller alike; Duration and Streak still fill one equal-height row on both sides.',
  match: /^\(part\)#0$|^div\.clr-(echo|bleed\.clr-bleed--block|card|card__body\.clr-chamfer\.clr-chamfer--md)\|(DURATION 42 min|STREAK 2 days)#0$|^div\.clr-metric-frame\|(42 min|2 days)#0$|^p\|(42 min|2 days)#0$|^svg\.clr-echo__rear\|#[01]$|^path\.clr-echo__source\|#[01]$|^span\.clr-card__bar\|#[01]$/,
}]

/** C15 on one side: the two cells' cards end at one bottom edge, at one height. */
function expectEqualCells(boxes: readonly Box[], label: string) {
  const cards = ['div.clr-card|DURATION 42 min#0', 'div.clr-card|STREAK 2 days#0'].map((key) => boxes.find((box) => box.key === key))
  expect(cards.every((card) => card !== undefined), `${label}: both cells' cards are drawn`).toBe(true)
  const [duration, streak] = cards as Box[]
  expect(Math.abs(duration.y + duration.height - (streak.y + streak.height)), `${label}: one bottom edge`).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX)
  expect(Math.abs(duration.height - streak.height), `${label}: equal-height frames`).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX)
}

/** A labelled height-only difference keeps its place across and its width. */
function expectHeightOnly(differences: readonly LayoutDifference[], label: string) {
  for (const difference of differences) {
    expect(difference.gallery !== null && difference.route !== null, `${label}: ${difference.key} drawn on both sides`).toBe(true)
    expect(Math.abs(difference.gallery!.x - difference.route!.x), `${label}: ${difference.key} across`).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX)
    expect(Math.abs(difference.gallery!.width - difference.route!.width), `${label}: ${difference.key} width`).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX)
  }
}

function compared(gallery: string, route: string, readings: Readonly<Record<string, Reading>>, intended: readonly Intended[], layout: readonly IntendedLayout[] | null): Compared {
  return {
    gallery, route,
    differences: compare(readings[gallery].lines, readings[route].lines, intended),
    layout: layout === null ? null : compareLayout(readings[gallery].boxes, readings[route].boxes, layout),
  }
}

function expectCompared(all: Readonly<Record<string, Compared>>, label: string) {
  for (const [part, found] of Object.entries(all)) {
    expectAllIntended(found.differences, `${part} @${label}`)
    if (found.layout !== null) expectLayoutIntended(found.layout, `${part} layout @${label}`)
  }
}

function receiptOf(readings: Readonly<Record<string, Reading>>, all: Readonly<Record<string, Compared>>) {
  return {
    captures: Object.fromEntries(Object.entries(readings).filter(([, reading]) => reading.capture !== null).map(([part, reading]) => [part, reading.capture])),
    lines: Object.fromEntries(Object.entries(readings).map(([part, reading]) => [part, reading.lines])),
    compared: Object.fromEntries(Object.entries(all).map(([part, found]) => [part, { gallery: found.gallery, route: found.route, differences: found.differences }])),
    layout: {
      method: 'element boxes',
      tolerancePx: LAYOUT_TOLERANCE_PX,
      measured: Object.fromEntries(Object.entries(readings).map(([part, reading]) => [part, reading.boxes.length])),
      parts: Object.fromEntries(Object.entries(readings).map(([part, reading]) => [part, reading.boxes.find((box) => box.key === '(part)#0') ?? null])),
      differences: Object.fromEntries(Object.entries(all).filter(([, found]) => found.layout !== null).map(([part, found]) => [part, found.layout])),
      notCompared: Object.fromEntries(Object.entries(all).filter(([, found]) => found.layout === null).map(([part]) => [part, 'words only: the parts hold different readings by intent (the labelled differences), so each shared reading’s own layout is compared as its own part'])),
    },
  }
}

/**
 * This task's changes to gallery-owned files, against the accepted bec4454,
 * each with its criterion and the state (if any) that shows it.
 */
const GALLERY_CHANGES = [
  { file: 'src/ui/composition.tsx', criterion: 'TASK-AC-010B47E192B5, AC-C14-01', states: [],
    change: '`SummaryFacts` takes `facts` that carry their `FactKind` and orders, glyphs and sets the term visibility of each by its kind (marked `data-overview-facts`); given children only, as the overview state passes them, it draws exactly as before.' },
  { file: 'src/app/Review.tsx', criterion: 'TASK-AC-010B47E192B5', states: [],
    change: 'Review’s Overview hands its facts to `SummaryFacts` with their kinds (and the movement count as `movements`), in place of its label-keyed glyph, order and term tables; it draws the same readings.' },
  { file: 'src/app/SessionDetail.tsx', criterion: 'TASK-AC-BF12C17FC7BF, AC-C14-01, AC-R004-02, AC-R004-03', states: [],
    change: 'The saved Overview’s facts carry their kinds (Review’s glyphs, order and term visibility over the record’s own values) and the card gains Round 7’s `EquipmentSummary` built from the saved `equipment_used`. No state draws `/history/:id`.' },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// The accepted states at the base
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A state's words, its DOM and where each element is drawn, read the same way
 * at the base and here. The DOM drops React's generated ids and the
 * Echo's measured backdrop (`.clr-echo__rear`, aria-hidden, sized from the
 * frame at run time); the frame itself is compared by its boxes.
 */
async function stateIdentity(state: Locator) {
  await state.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await renderFrame(state.page())
  await settle(state.page())
  const html = await state.evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement
    for (const rear of copy.querySelectorAll('.clr-echo__rear')) rear.remove()
    return copy.outerHTML.replace(/_r_[0-9a-z]+_/g, '_r_')
  })
  return { lines: await linesOf(state), dom: createHash('sha256').update(html).digest('hex'), boxes: await boxesOf(state) }
}

/**
 * The state at the base (779618a0) against this tree. The base reading is
 * this spec's own, taken once on a clean export of the base commit with
 * `TASK118_BASE_READING=1` and kept beside the receipts.
 */
function againstBase(state: 'overview' | 'assets', width: number, here: { lines: string[]; dom: string; boxes: Box[] }) {
  const file = join(RECEIPTS, `gallery-base-${state}-phone-${width}.json`)
  if (process.env.TASK118_BASE_READING === '1') {
    mkdirSync(RECEIPTS, { recursive: true })
    writeFileSync(file, `${JSON.stringify({ schema: 'clear-task-118-gallery-base/v1', base: '779618a01fd7642e4a532aca02f88b377588ffdb', state, width, ...here }, null, 2)}\n`)
    return null
  }
  expect(existsSync(file), `${state} @${width}: the base reading exists`).toBe(true)
  const base = JSON.parse(readFileSync(file, 'utf8')) as { lines: string[]; dom: string; boxes: Box[] }
  const differences = compare(base.lines, here.lines, [])
  const layout = compareLayout(base.boxes, here.boxes, [])
  expect(differences, `${state} @${width}: the accepted state reads as it did at the base`).toEqual([])
  expect(here.dom, `${state} @${width}: the accepted state renders the base's DOM`).toBe(base.dom)
  expect(layout, `${state} @${width}: every element of the accepted state is drawn where it was at the base`).toEqual([])
  return { base: relative(REPO_ROOT, file), lines: 'unchanged', dom: here.dom, boxes: here.boxes.length, layout: 'unchanged', differences, layoutDifferences: layout }
}

// ─────────────────────────────────────────────────────────────────────────────

const overviewCard = (scope: Locator) => scope.locator('.clr-card').filter({ has: scope.page().getByRole('heading', { name: 'Overview', exact: true }) }).first()
const factsOf = (card: Locator) => card.locator('dl.clr-summary-facts')
const factOf = (card: Locator, term: string) => factsOf(card).locator('.clr-summary-fact').filter({ has: card.page().locator('dt', { hasText: new RegExp(`^${term}$`) }) })

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-49761FC1B153 overview ${name}: /review’s and /history/:id’s Overview and /summary’s Duration and Streak match the accepted overview state`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    const acceptance = overviewAcceptance()
    const app = await syntheticApp(page, { acceptance })
    const readings: Record<string, Reading> = {}

    // The accepted state, on the page's clock.
    await page.clock.setFixedTime(ENTRY)
    await visit('/gallery/refinements?state=overview')
    const state = page.locator('[data-refinement-state="overview"]')
    await expect(state).toBeVisible()
    await settle(page)
    const galleryCard = overviewCard(state)
    readings['gallery:card'] = await read(galleryCard, `overview-${name}-gallery-card`)
    readings['gallery:facts'] = await read(factsOf(galleryCard), null)
    for (const term of ['Intensity', 'Movements']) readings[`gallery:fact-${term.toLowerCase()}`] = await read(factOf(galleryCard, term), null)
    readings['gallery:equipment'] = await read(galleryCard.locator('.clr-equipment-summary'), `overview-${name}-gallery-equipment`)
    readings['gallery:metrics'] = await read(state.locator('.clr-metric-grid'), `overview-${name}-gallery-metrics`)
    const base = againstBase('overview', viewport.width, await stateIdentity(state))

    // /review: the planned Overview.
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
    const reviewCard = overviewCard(page.locator('main'))
    readings['review:card'] = await read(reviewCard, `overview-${name}-review-card`)
    readings['review:facts'] = await read(factsOf(reviewCard), null)
    for (const term of ['Intensity', 'Movements']) readings[`review:fact-${term.toLowerCase()}`] = await read(factOf(reviewCard, term), null)
    readings['review:equipment'] = await read(reviewCard.locator('.clr-equipment-summary'), `overview-${name}-review-equipment`)
    await expect(factsOf(reviewCard)).toHaveAttribute('data-overview-facts', '')

    // /history/:id: the saved Overview of the same workout, completed.
    await visit(app.detailPath)
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
    const savedCard = overviewCard(page.locator('main'))
    readings['history:card'] = await read(savedCard, `overview-${name}-history-card`)
    readings['history:facts'] = await read(factsOf(savedCard), null)
    readings['history:fact-intensity'] = await read(factOf(savedCard, 'Intensity'), null)
    readings['history:equipment'] = await read(savedCard.locator('.clr-equipment-summary'), `overview-${name}-history-equipment`)
    await expect(factsOf(savedCard)).toHaveAttribute('data-overview-facts', '')

    // /summary: the completed session's Duration beside its Streak.
    await visit('/summary')
    await expect(page.getByText('2 days', { exact: true })).toBeVisible()
    readings['summary:metrics'] = await read(page.locator('main .clr-metric-grid').first(), `overview-${name}-summary-metrics`)

    const all: Record<string, Compared> = {
      'review-facts': compared('gallery:facts', 'review:facts', readings, [...TERMS, ...GOAL], null),
      'review-fact-intensity': compared('gallery:fact-intensity', 'review:fact-intensity', readings, [], []),
      'review-fact-movements': compared('gallery:fact-movements', 'review:fact-movements', readings, [], []),
      'review-equipment': compared('gallery:equipment', 'review:equipment', readings, [], []),
      'review-card': compared('gallery:card', 'review:card', readings, [...TERMS, ...GOAL], null),
      'history-facts': compared('gallery:facts', 'history:facts', readings, [...TERMS, ...RECORD_FACTS], null),
      'history-fact-intensity': compared('gallery:fact-intensity', 'history:fact-intensity', readings, [], []),
      'history-equipment': compared('gallery:equipment', 'history:equipment', readings, [], []),
      'summary-metrics': compared('gallery:metrics', 'summary:metrics', readings, [], METRIC_FACE),
    }
    expectEqualCells(readings['gallery:metrics'].boxes, `gallery metrics @${name}`)
    expectEqualCells(readings['summary:metrics'].boxes, `summary metrics @${name}`)
    expectHeightOnly(all['summary-metrics'].layout ?? [], `summary metrics @${name}`)
    writeReceipt(`overview-${name}`, {
      state: 'overview', width: viewport.width, routes: ['/review', '/history/:id', '/summary'],
      ...receiptOf(readings, all),
      lookDifferences: LOOK_DIFFERENCES,
      galleryChanges: GALLERY_CHANGES,
      galleryAgainstBase: base,
    })
    expectCompared(all, `overview ${name}`)
    app.assertContained()
  })

  test(`TASK-AC-49761FC1B153 assets ${name}: Setup’s equipment, Review’s Required equipment glyph and /review’s and /workout’s equipment labels match the accepted assets state`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    const readings: Record<string, Reading> = {}

    // The accepted state.
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await page.clock.setFixedTime(ENTRY)
    await visit('/gallery/refinements?state=assets')
    const state = page.locator('[data-refinement-state="assets"]')
    await expect(state).toBeVisible()
    await settle(page)
    const inventory = state.locator('.clr-card').filter({ has: page.getByRole('heading', { name: 'Equipment icon inventory', exact: true }) })
    readings['gallery:inventory'] = await read(inventory, `assets-${name}-gallery-inventory`)
    const inventoryKinds = (await inventory.getByRole('listitem').allTextContents()).map((text) => text.split(' · ')[0])
    // A glyph's drawing (its paths), whatever size each consumer draws it at.
    const shippedGlyphs = await inventory.locator('svg').evaluateAll((nodes) => nodes.map((node) => node.innerHTML))
    const base = againstBase('assets', viewport.width, await stateIdentity(state))

    // Setup's own equipment step, through the onboarding guard.
    const setup = await syntheticApp(page, { acceptance: assetAcceptance(), setup: true })
    await page.clock.setFixedTime(ENTRY)
    await visit('/onboarding')
    await expect(page.getByRole('heading', { level: 2, name: 'What’s your gym setup?' })).toBeVisible()
    await page.locator('main').getByRole('radio', { name: /^Home gym/ }).click()
    const group = page.locator('main').getByRole('group', { name: 'Equipment' })
    await expect(group.getByRole('checkbox')).toHaveCount(EQUIPMENT.length)
    readings['setup:equipment'] = await read(group, `assets-${name}-setup-equipment`)
    const setupKinds = await group.getByRole('checkbox').evaluateAll((nodes) => nodes.map((node) =>
      node.getAttribute('aria-label') ?? (node as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? ''))
    setup.assertContained()
    await page.unrouteAll({ behavior: 'ignoreErrors' })

    // Review and Workout over the composition naming every Setup id and the medicine ball.
    const app = await syntheticApp(page, { acceptance: assetAcceptance() })
    await page.clock.setFixedTime(ENTRY)
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(assetAcceptance().workout.title)
    const required = page.locator('main .clr-equipment-summary')
    readings['review:required'] = await read(required, `assets-${name}-review-required`)
    const requiredGlyphs = await required.locator('svg').evaluateAll((nodes) => nodes.map((node) => node.innerHTML))
    const reviewStandard = page.locator('[data-review-section] .clr-card').filter({ has: page.locator('.clr-movement-identity') }).first()
    readings['review:standard'] = await read(reviewStandard, `assets-${name}-review-standard`)
    const reviewLabels = await page.locator('main [data-movement-context]').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent ?? '', glyphs: node.querySelectorAll('svg, img').length })))
    await page.getByRole('button', { name: 'Start workout' }).click()
    await expect(page.getByRole('list', { name: 'Movements in this superset', exact: true })).toBeVisible()
    const workoutStandard = page.locator('main .clr-card').filter({ has: page.getByRole('list', { name: 'Movements in this block', exact: true }) }).first()
    readings['workout:standard'] = await read(workoutStandard, `assets-${name}-workout-standard`)
    const workoutLabels = await page.locator('main [data-movement-context]').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent ?? '', glyphs: node.querySelectorAll('svg, img').length })))

    // The words: Setup's sixteen choices are the inventory's sixteen kinds, in order.
    expect(setupKinds, 'Setup names the kinds the inventory lists').toEqual(inventoryKinds)
    expect(inventoryKinds).toEqual(EQUIPMENT.map(({ label }) => label))
    // The glyphs: the one shipped equipment glyph Review's Required equipment
    // draws is the state's shipped Dumbbell; every movement label is words.
    expect(requiredGlyphs, 'Review draws the shipped Dumbbell beside Required equipment').toEqual([shippedGlyphs[0]])
    for (const label of [...reviewLabels, ...workoutLabels]) {
      expect(label.text.trim().length, `${label.text}: a word`).toBeGreaterThan(0)
      expect(label.glyphs, `${label.text}: never a glyph`).toBe(0)
    }
    expect(reviewLabels.map((label) => label.text)).toEqual(ASSET_LABELS)
    expect(workoutLabels.map((label) => label.text)).toEqual(ASSET_LABELS)

    const all: Record<string, Compared> = {
      'setup-equipment': compared('gallery:inventory', 'setup:equipment', readings, ASSETS_INTENDED, null),
    }
    writeReceipt(`assets-${name}`, {
      state: 'assets', width: viewport.width, routes: ['/onboarding', '/review', '/workout'],
      ...receiptOf(readings, all),
      kinds: { gallery: inventoryKinds, setup: setupKinds },
      glyphs: { gallery: shippedGlyphs.map(digest), reviewRequiredEquipment: requiredGlyphs.map(digest) },
      labels: { review: reviewLabels.map((label) => label.text), workout: workoutLabels.map((label) => label.text) },
      galleryChanges: GALLERY_CHANGES,
      galleryAgainstBase: base,
    })
    expectCompared(all, `assets ${name}`)
    app.assertContained(['persist_session', 'start_session'])
  })
}

const assetAcceptance = (): SessionAcceptance => ({
  ...overviewAcceptance(),
  workout: {
    title: 'TASK-118 parity assets', overview: null, estimated_duration_mins: 50,
    sections: [{ section_type: 'accessory', section_title: 'Strength and conditioning', section_notes: null, blocks: [...ASSET_BLOCKS] }],
  },
})

/** Each movement's label, in order, as the routes read the composed equipment (`equipmentName`). */
const ASSET_LABELS = ASSET_BLOCKS.flatMap((block) => block.exercises.map((exercise) => exercise.equipment.replaceAll('-', ' ').replaceAll('_', ' ')))

const digest = (markup: string) => createHash('sha256').update(markup).digest('hex')

/**
 * The inventory card is the state's own record (glyph status, the wanted
 * list and the selected placement); Setup's step draws the same kinds as its
 * choices, under its own legend.
 */
const ASSETS_INTENDED: Intended[] = [
  { side: 'gallery only', match: /^EQUIPMENT ICON INVENTORY$/, criterion: 'AC-C56-01', reason: 'The inventory card’s own heading: the verified inventory is a reference record, drawn by the state and recorded in the wanted list; no route draws it.' },
  { side: 'gallery only', match: /^Equipment names remain readable beside movement names\. New glyphs are a wanted list; none are invented here\.$/, criterion: 'AC-R029-02', reason: 'The state states the selected placement and the explicit follow-up; the routes show it (labels beside names, read here and in task-029.spec.ts).' },
  { side: 'gallery only', match: /^(Dumbbell · shipped|WeightPlate · shipped supplementary glyph)$/, criterion: 'AC-C56-01', reason: 'The two shipped equipment glyphs, named; Review’s Required equipment draws the shipped Dumbbell (compared above).' },
  { side: 'gallery only', match: / · (Dumbbell available|equipment glyph wanted \/ text fallback)$/, criterion: 'AC-C56-01', reason: 'Each Setup kind with its glyph status from the shared inventory; Setup draws the same kind as its choice, in the same words (compared above).' },
  { side: 'gallery only', match: /^Medicine ball is also wanted from the Wall ball review\./, criterion: 'AC-R029-01', reason: 'The wanted medicine ball, which is no Setup id: Setup offers no medicine ball.' },
  { side: 'route only', match: new RegExp(`^(${EQUIPMENT.map(({ label }) => label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})$`, 'i'), criterion: 'AC-R029-01', reason: 'Setup’s own choices, each named in words in Setup’s own uppercase face: the same kinds the inventory lists with its status (compared by their accessible names above).' },
  { side: 'route only', match: /^EQUIPMENT$/, criterion: 'AC-R029-01', reason: 'Setup’s own step legend.' },
]
