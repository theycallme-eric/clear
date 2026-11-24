import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { timedBlock } from '../../src/dev/gallery-refinement-fixtures'
import { reviewHandoff } from '../../src/state/review-handoff'
import { CONTRACT_VERSION, sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import type { BlockProgress } from '../../src/state/workout-progress'
import { makePrescription, makeWorkoutBlock } from '../../src/test/factories'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-112 look check (TASK-AC-1AFEF9A3EE07): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 * This task wires the old build's TASK-001 and TASK-002 row checks to Round
 * 7's movement rows: `MovementIdentity` in `MovementList` under
 * `MovementGroupHeader` (src/ui/movement-presentation.tsx), drawn by Review's
 * `ReviewExerciseRow` on `/review` and by `BlockPanel`/`TimedWorkoutFlow` on
 * `/workout`. It changes no product file: only the tests come back. The
 * accepted `cards` state draws the live EMOM, AMRAP and For Time cards before
 * Start (`LiveFlow`: `timedBlock(kind)` from
 * `src/dev/gallery-refinement-fixtures.ts`, in pounds). Matched data: those
 * same blocks, handed to `/review` (JOURNEY-001/002's entry) and then started
 * on `/workout` (the action), with the profile in pounds.
 *
 * Each block's movement rows (its `MovementList`) are read on all three sides:
 *
 *   · `/workout` against the state: every visible word and every rendered
 *     element's box, within `LAYOUT_TOLERANCE_PX` (TASK-103's method, as
 *     TASK-110 keeps it). Both draw the same live components from the same
 *     block, so any difference fails the case.
 *   · `/review` against the state: every visible word, and the shared
 *     hierarchy's face (name, ordinal, equipment, prescription and load:
 *     family, size, weight, colour, case) element by element. The context's
 *     own slot and wording differ by intent (Review's Swap, AC-C06-01; its
 *     planned sets × reps where the live card states its minute or round,
 *     AC-R002-03), each labelled with its criterion; any other difference
 *     fails the case. Review draws the action slot beside the name, so its
 *     boxes are recorded, not compared.
 *
 * The accepted state at the base against this tree: the state's visible lines
 * are diffed with the base's own `cards` receipts (A3 TASK-110's, at
 * evidence/refinement/task-110/parity); this task changes no gallery-owned
 * file, so `galleryChanges` is empty and any difference fails the case.
 *
 * Captures hold steady run to run (TASK-116's method). Each case writes its
 * receipt to `evidence/refinement/task-112/parity/` and its captures to the
 * Runner's evidence store (outside Git), under this body's folder
 * (`clear-gallery-adoption-v2-20261120/task-112/captures/`), recording each
 * capture's SHA-256 in the receipt. Synthetic and contained: Start's two
 * session calls are answered here and never forwarded; nothing else is written.
 */
const OWNER = '00000000-0000-4000-8000-000000011120'
const PLACE = '00000000-0000-4000-8000-000000011121'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-112', 'parity')
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
    if (code !== null) throw new Error(`Synthetic TASK-112 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-112 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-112.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-112-public-placeholder',
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
// Matched data: the gallery's own blocks, handed to Review and started
// ─────────────────────────────────────────────────────────────────────────────

type Kind = 'emom' | 'amrap' | 'for_time'
const KINDS: readonly Kind[] = ['emom', 'amrap', 'for_time']
/** The blocks the cards state draws (`LiveFlow`: `timedBlock(kind, { rounds: 4 })`). */
const LIVE_BLOCKS: Readonly<Record<Kind, BlockProgress>> = {
  emom: timedBlock('emom'),
  amrap: timedBlock('amrap'),
  for_time: timedBlock('for_time'),
}
/** Review's list for each block (its format, lower case). */
const REVIEW_LISTS: Readonly<Record<Kind, string>> = { emom: 'emom', amrap: 'amrap', for_time: 'for time' }
/** The gallery's own sample unit (`PreviewSetLogging`), so the planned loads read alike. */
const GALLERY_UNIT = 'lb' as const
/** The page's clock at entry; held wherever a reading is compared. */
const ENTRY = Date.parse('2026-11-16T09:00:00.000Z')

function persistedBlock(block: BlockProgress) {
  return makeWorkoutBlock({
    structure_type: block.structureType,
    rep_scheme: block.repScheme,
    rounds: block.rounds,
    round_rest_seconds: block.roundRestSeconds,
    timer_type: block.timerType,
    timer_seconds: block.timerSeconds,
    ...(block.ladderTiming ? { ladder_timing: block.ladderTiming } : {}),
    exercises: block.exercises.map(({ prescription: p }) => makePrescription({
      exercise_id: p.exercise_id,
      equipment: p.equipment_used,
      session_function: 'conditioning',
      anchor_relationship: 'neutral',
      modality: p.modality,
      sets: p.sets,
      target_kind: p.target_kind,
      target_value: p.target_value,
      target_min: p.target_min,
      target_max: p.target_max,
      target_sequence: p.target_sequence,
      per_side: p.per_side,
      distance_unit: p.distance_unit,
      rest_seconds: p.rest_seconds,
      tempo: p.tempo,
      load_type: p.load_type ?? 'none',
      load_value: p.load_value,
      is_interval_exercise: p.is_interval_exercise,
      // The gallery row is already one valid prescription; its target fields
      // keep their own discriminant.
    } as Parameters<typeof makePrescription>[0])),
  })
}

type Section = SessionAcceptance['workout']['sections'][number]

const COOLDOWN: Section = {
  section_type: 'cooldown', section_title: 'Cooldown', section_notes: null,
  blocks: [makeWorkoutBlock({ exercises: [makePrescription({ exercise_id: 'burpee', equipment: 'bodyweight', load_type: 'none', load_value: null, sets: 1, target_value: 1 })] })],
}

/** The composed workout: the cards state's blocks, in its order, in one conditioning section. */
function acceptance(): SessionAcceptance {
  return {
    date: '2026-11-16',
    location_id: PLACE,
    session_focus: 'full_body',
    goal_preset: 'balanced',
    requested_duration_mins: 30,
    effective_duration_target_mins: 30,
    computed_duration_mins: null,
    requested_intensity: 5,
    effective_intensity: 5,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'e2e',
    contract_version: CONTRACT_VERSION,
    is_deload: false,
    workout: {
      title: 'TASK-112 parity',
      overview: null,
      estimated_duration_mins: 30,
      sections: [{ section_type: 'conditioning', section_title: 'Parity', section_notes: null, blocks: KINDS.map((kind) => persistedBlock(LIVE_BLOCKS[kind])) }, COOLDOWN],
    },
  }
}

/** The contained synthetic app: Review's hand-off, then Start's two session calls; any other write fails the case. */
async function syntheticApp(page: Page, composed: SessionAcceptance) {
  const unexpected: string[] = []
  const writes: string[] = []
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
  const prescribed = sessionSnapshotSchema.parse(peerGroupingSnapshot(composed, { userId: OWNER }))
  const running: SessionSnapshot = sessionSnapshotSchema.parse(peerGroupingSnapshot(composed, { userId: OWNER, startedAt: new Date(ENTRY - 60_000).toISOString() }))
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
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced', weight_unit: GALLERY_UNIT })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'workout_sessions') return reply(started ? [running.session] : [])
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
      if (name === 'session_as_performed') return reply(null)
      if (name === 'persist_session') {
        writes.push(name)
        return reply(prescribed)
      }
      if (name === 'start_session') {
        writes.push(name)
        started = true
        return reply({ outcome: 'started', state: 'active', session: running.session })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-112 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-112-session', refreshToken: 'synthetic-task-112-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-112@example.invalid' },
    }))
    if (location.pathname === '/review') history.replaceState({ usr: handoff, key: 'synthetic-task-112', idx: 0 }, '', location.href)
  }, { owner: OWNER, handoff: reviewHandoff(composed) })
  return {
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
      expect(writes, 'Only Start’s two session calls are attempted, once each').toEqual(['persist_session', 'start_session'])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

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
    const dir = join(store.dir, CAPTURE_BODY, 'task-112', 'captures')
    return { dir, identity: `store:${CAPTURE_BODY}/task-112/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-112-parity')
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
 * within a pixel.
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
 * The part's image, whole (A3 TASK-110's `wholePart`): a part taller than what
 * its scroll region shows is captured on a page made just tall enough, at the
 * same width, once no ScrollRegion is lit; the viewport is put back. Its words
 * and boxes were read before, at the approved size.
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
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-112-parity/v1', task: 'TASK-112', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
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
}

/**
 * Every rendered element of a part (the part itself first), named by its tag,
 * its `clr-` classes and the words it draws and numbered in document order, so
 * the same element is found on both sides whatever wraps the part. Elements
 * not drawn (`display: none`, hidden, or no box at all) are left out.
 */
async function boxesOf(target: Locator): Promise<Box[]> {
  return target.evaluate((root) => {
    const origin = root.getBoundingClientRect()
    const rounded = (value: number) => Math.round(value * 10) / 10
    const seen = new Map<string, number>()
    const boxes: { key: string; x: number; y: number; width: number; height: number }[] = []
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const classes = [...element.classList].filter((name) => name.startsWith('clr-')).sort().map((name) => `.${name}`).join('')
      const words = (element instanceof HTMLElement ? element.innerText : (element.textContent ?? '')).replace(/\s+/g, ' ').trim().slice(0, 80)
      const tag = element.tagName.toLowerCase().replace(/^h[1-6]$/, 'h')
      const name = element === root ? '(part)' : `${tag}${classes}|${words}`
      const index = seen.get(name) ?? 0
      seen.set(name, index + 1)
      boxes.push({
        key: `${name}#${index}`,
        x: rounded(rect.left - origin.left),
        y: rounded(rect.top - origin.top),
        width: rounded(rect.width),
        height: rounded(rect.height),
      })
    }
    return boxes
  })
}

/** Each element drawn elsewhere, at another size, or on one side only. */
function compareLayout(gallery: readonly Box[], route: readonly Box[]): LayoutDifference[] {
  const remaining = new Map(route.map((box) => [box.key, box]))
  const differences: LayoutDifference[] = []
  for (const box of gallery) {
    const counterpart = remaining.get(box.key)
    remaining.delete(box.key)
    if (counterpart === undefined) {
      differences.push({ key: box.key, gallery: box, route: null })
      continue
    }
    const offset = Math.max(
      Math.abs(box.x - counterpart.x), Math.abs(box.y - counterpart.y),
      Math.abs(box.width - counterpart.width), Math.abs(box.height - counterpart.height),
    )
    if (offset > LAYOUT_TOLERANCE_PX) differences.push({ key: box.key, gallery: box, route: counterpart })
  }
  for (const box of remaining.values()) differences.push({ key: box.key, gallery: null, route: box })
  return differences
}

// ─────────────────────────────────────────────────────────────────────────────
// The shared hierarchy's face, row by row
// ─────────────────────────────────────────────────────────────────────────────

const FACE = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'textTransform', 'letterSpacing'] as const
const HIERARCHY = {
  name: '.clr-movement-identity__name',
  ordinal: '.clr-movement-identity__ordinal',
  equipment: '[data-movement-context]',
  prescription: '[data-movement-detail] > span:nth-child(1)',
  load: '[data-movement-detail] > span:nth-child(2)',
} as const
type Tier = keyof typeof HIERARCHY

/** Each row's tiers (name, ordinal, equipment, prescription, load): present or not, and their face. */
async function facesOf(target: Locator): Promise<Record<Tier, Record<string, string> | null>[]> {
  return target.evaluate((root, { tiers, face }) => [...root.querySelectorAll('.clr-movement-identity')].map((identity) =>
    Object.fromEntries(Object.entries(tiers).map(([tier, selector]) => {
      const element = identity.querySelector(selector)
      if (element === null) return [tier, null]
      const style = getComputedStyle(element)
      return [tier, Object.fromEntries(face.map((property) => [property, style[property]]))]
    })) as Record<string, Record<string, string> | null>), { tiers: HIERARCHY, face: [...FACE] }) as Promise<Record<Tier, Record<string, string> | null>[]>
}

interface FaceDifference { readonly row: number; readonly tier: Tier; readonly gallery: Record<string, string> | null; readonly route: Record<string, string> | null }

function compareFaces(gallery: Awaited<ReturnType<typeof facesOf>>, route: Awaited<ReturnType<typeof facesOf>>): FaceDifference[] {
  const differences: FaceDifference[] = []
  expect(route.length, 'the same rows on both sides').toBe(gallery.length)
  gallery.forEach((row, index) => {
    for (const tier of Object.keys(HIERARCHY) as Tier[]) {
      if (JSON.stringify(row[tier]) !== JSON.stringify(route[index]?.[tier])) {
        differences.push({ row: index, tier, gallery: row[tier], route: route[index]?.[tier] ?? null })
      }
    }
  })
  return differences
}

/**
 * Differences a criterion intends between `/review`'s rows and the state's
 * live rows. Review supplies Swap in the movement's own slot (AC-C06-01; drawn
 * in the text action's capitals), and states the planned work as sets × reps
 * where the live card states the work of the minute, round or pass it runs
 * (an EMOM's `Min 1 · 12 reps`, an AMRAP's `10 reps`): live schedule and
 * progress belong to Workout, planned work to Review (AC-R002-03).
 */
const REVIEW_INTENDED: readonly Intended[] = [
  { side: 'route only', match: /^SWAP$/, criterion: 'AC-C06-01', reason: 'Review supplies Swap in the movement’s own slot; the live card never does.' },
  { side: 'route only', match: /^\d+ × \d+ reps$/, criterion: 'AC-R002-03', reason: 'Review keeps the planned sets × reps; the live card states the work of the minute, round or pass it runs.' },
  { side: 'gallery only', match: /^Min \d+ · \d+ reps$/, criterion: 'AC-R002-03', reason: 'The live EMOM states each movement’s minute (its schedule); Review states the planned sets × reps.' },
  { side: 'gallery only', match: /^\d+ reps$/, criterion: 'AC-R002-03', reason: 'The live AMRAP and For Time state one round’s or one pass’s reps; Review states the planned sets × reps.' },
]
/** The face differences a criterion intends: none (the same hierarchy in both contexts, JOURNEY-001). */
const REVIEW_FACE_INTENDED: readonly { tier: Tier; criterion: string; reason: string }[] = []

/** The words that differ, each with its label; any unlabelled one fails the case. */
function expectAllIntended(differences: readonly { criterion: string | null }[], label: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${label}: every visible difference is one a criterion intends`).toEqual([])
}

/**
 * The accepted state at the base against this tree (the brief's gallery rule):
 * the state's visible lines as the base's own receipts read them (A3
 * TASK-110's `cards` receipts, carried unchanged by TASK-118 into this base),
 * diffed with what this run reads from the same state. This task changes no
 * gallery-owned file, so no difference is intended.
 */
const BASE_RECEIPTS = 'evidence/refinement/task-110/parity/cards'
const GALLERY_CHANGES: readonly { file: string; criterion: string; states: string[]; change: string }[] = []

function againstBase(width: number, flows: Readonly<Record<Kind, readonly string[]>>) {
  const base = JSON.parse(readFileSync(join(REPO_ROOT, `${BASE_RECEIPTS}-phone-${width}.json`), 'utf8')) as { lines: { gallery: Record<string, string[]> } }
  return Object.fromEntries(KINDS.map((kind) => {
    const was = base.lines.gallery[`${kind}:ready`]
    expect(was, `cards ${kind}: the base receipt reads this moment`).toBeDefined()
    const found = [
      ...was.filter((line) => !flows[kind].includes(line)).map((line) => ({ side: 'base only', line, criterion: null })),
      ...flows[kind].filter((line) => !was.includes(line)).map((line) => ({ side: 'tree only', line, criterion: null })),
    ]
    expect(found, `cards ${kind} against the base: the accepted state is unchanged`).toEqual([])
    return [`${kind}:ready`, { base: `${BASE_RECEIPTS}-phone-${width}.json#lines.gallery.${kind}:ready`, differences: found }]
  }))
}

/** What one side read of one block's rows. */
interface Reading { readonly lines: string[]; readonly boxes: Box[]; readonly faces: Awaited<ReturnType<typeof facesOf>>; readonly capture: { file: string; sha256: string } }

async function read(target: Locator, capture: string): Promise<Reading> {
  await expect(target).toBeVisible()
  await target.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await renderFrame(target.page())
  await settle(target.page())
  const lines = await linesOf(target)
  const boxes = await boxesOf(target)
  const faces = await facesOf(target)
  return { lines, boxes, faces, capture: await keep(target, capture) }
}

const part = (boxes: readonly Box[]) => boxes.find((box) => box.key === '(part)#0') ?? null

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-1AFEF9A3EE07 cards ${name}: /review’s and /workout’s EMOM, AMRAP and For Time movement rows match the accepted cards state`, async ({ page, visit, checkA11y }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    const flow = (scope: Locator, kind: Kind) => scope.locator(`.clr-timed-flow[data-timed-format="${kind}"]`)
    const rowsIn = (scope: Locator) => scope.locator('ol.clr-movement-list')

    // The accepted state: the real flows on the gallery's memory runtime, on the page's clock.
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await page.clock.setFixedTime(ENTRY)
    await visit('/gallery/refinements?state=cards')
    const state = page.locator('[data-refinement-state="cards"]')
    await expect(rowsIn(state)).toHaveCount(KINDS.length)
    const gallery: Partial<Record<Kind, Reading>> = {}
    const galleryFlows: Partial<Record<Kind, string[]>> = {}
    for (const kind of KINDS) {
      galleryFlows[kind] = await linesOf(flow(state, kind))
      gallery[kind] = await read(rowsIn(flow(state, kind)), `cards-${kind}-${name}-gallery-rows`)
    }

    // The real routes, over the same blocks: Review's hand-off, then Start.
    const composed = acceptance()
    const app = await syntheticApp(page, composed)
    await page.clock.setFixedTime(ENTRY)
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(composed.workout.title)
    const review: Partial<Record<Kind, Reading>> = {}
    for (const kind of KINDS) {
      review[kind] = await read(page.getByRole('list', { name: REVIEW_LISTS[kind], exact: true }), `cards-${kind}-${name}-review-rows`)
    }

    await page.getByRole('button', { name: 'Start workout' }).click()
    await expect(page).toHaveURL(/\/workout$/)
    const main = page.locator('main')
    await expect(flow(main, 'emom')).toBeVisible()
    await settle(page)
    await checkA11y()
    const workout: Partial<Record<Kind, Reading>> = {}
    for (const kind of KINDS) workout[kind] = await read(rowsIn(flow(main, kind)), `cards-${kind}-${name}-workout-rows`)

    const compared = Object.fromEntries(KINDS.map((kind) => [kind, {
      workout: { differences: compare(gallery[kind]!.lines, workout[kind]!.lines, []), layout: compareLayout(gallery[kind]!.boxes, workout[kind]!.boxes), faces: compareFaces(gallery[kind]!.faces, workout[kind]!.faces) },
      review: { differences: compare(gallery[kind]!.lines, review[kind]!.lines, REVIEW_INTENDED), faces: compareFaces(gallery[kind]!.faces, review[kind]!.faces) },
    }]))

    writeReceipt(`cards-${name}`, {
      state: 'cards', width: viewport.width, routes: ['/review', '/workout'],
      part: 'each block’s movement rows (its MovementList): EMOM, AMRAP and For Time',
      captures: Object.fromEntries(KINDS.flatMap((kind) => [
        [`gallery:${kind}`, gallery[kind]!.capture], [`review:${kind}`, review[kind]!.capture], [`workout:${kind}`, workout[kind]!.capture],
      ])),
      lines: {
        gallery: Object.fromEntries(KINDS.map((kind) => [kind, gallery[kind]!.lines])),
        review: Object.fromEntries(KINDS.map((kind) => [kind, review[kind]!.lines])),
        workout: Object.fromEntries(KINDS.map((kind) => [kind, workout[kind]!.lines])),
      },
      differences: Object.fromEntries(KINDS.map((kind) => [kind, { workout: compared[kind].workout.differences, review: compared[kind].review.differences }])),
      faces: {
        method: 'computed face of each row’s name, ordinal, equipment, prescription and load, row by row',
        properties: [...FACE],
        differences: Object.fromEntries(KINDS.map((kind) => [kind, { workout: compared[kind].workout.faces, review: compared[kind].review.faces }])),
      },
      layout: {
        method: 'element boxes (workout against the state); Review’s rows draw the action slot beside the name, so their boxes are recorded, not compared',
        tolerancePx: LAYOUT_TOLERANCE_PX,
        parts: Object.fromEntries(KINDS.map((kind) => [kind, { gallery: part(gallery[kind]!.boxes), review: part(review[kind]!.boxes), workout: part(workout[kind]!.boxes) }])),
        measured: Object.fromEntries(KINDS.map((kind) => [kind, { gallery: gallery[kind]!.boxes.length, review: review[kind]!.boxes.length, workout: workout[kind]!.boxes.length }])),
        differences: Object.fromEntries(KINDS.map((kind) => [kind, { workout: compared[kind].workout.layout }])),
      },
      galleryChanges: GALLERY_CHANGES,
      galleryAgainstBase: againstBase(viewport.width, galleryFlows as Record<Kind, string[]>),
    })

    for (const kind of KINDS) {
      expectAllIntended(compared[kind].workout.differences, `/workout ${kind} @${name}`)
      expect(compared[kind].workout.layout, `/workout ${kind} layout @${name}: every element is drawn where the accepted gallery draws it, within ${LAYOUT_TOLERANCE_PX}px`).toEqual([])
      expect(compared[kind].workout.faces, `/workout ${kind} faces @${name}`).toEqual([])
      expectAllIntended(compared[kind].review.differences, `/review ${kind} @${name}`)
      const unintendedFaces = compared[kind].review.faces.filter((difference) => !REVIEW_FACE_INTENDED.some((rule) => rule.tier === difference.tier))
      expect(unintendedFaces, `/review ${kind} faces @${name}: the same hierarchy in both contexts`).toEqual([])
    }
    app.assertContained()
  })
}
