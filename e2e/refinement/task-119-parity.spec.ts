import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { preparationAcceptance } from '../../src/dev/gallery-refinement-preparation-data'
import { composedPreparationGuide } from '../../src/state/preparation-guide'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot, type WorkoutSessionRow } from '../../src/state/schemas'
import { makePrescription, makeSessionRow, makeWorkoutBlock } from '../../src/test/factories'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-119 look check (TASK-AC-807B9EE9EECD): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 *   · `screens` (REQ-024, JOURNEY-024): Round 7's composed Generate card —
 *     the framed icon-only Back, the title, the goal above the Focus value
 *     that opens the choices, the MINUTES field and Generate workout. `/generate`
 *     is read beside it for a returning athlete whose history recommends Upper
 *     body on a strength goal, 45 minutes (the state's own values): its Back,
 *     title, Goal and Focus summary, Time available field and action, the
 *     choices the Focus value opens, and — owner decision 4 of 2026-11-18 —
 *     Recovery on with the choices closed (the chip and its note stay).
 *   · `preparation` (REQ-023, JOURNEY-023): Round 7's Warm-up guide, live For
 *     Time card and Cooldown guide in Review order. `/review` is read beside it
 *     over the same three movements per guide (TASK-109's matched
 *     composition): the Warm-up and Cooldown guide cards, the order of the
 *     content, and Regenerate after the Cooldown, which the state does not draw
 *     (C50 is the route's).
 *
 * Every visible word of each part is read from both sides, and so is the
 * layout: every rendered element's box is measured and compared with its
 * counterpart within `LAYOUT_TOLERANCE_PX` (TASK-103's method, as TASK-109,
 * TASK-110 and TASK-118 keep it). A difference no criterion intends fails the
 * case; an intended one is labelled with its criterion ID. Where Round 7's
 * state composes a part from other primitives than the route (the title, the
 * goal, the Focus value, its choices), the whole part is labelled with the
 * criterion that intends the route's own composition, and its words are still
 * compared line by line.
 *
 * The accepted states themselves are compared between the base (41dc9aa7) and
 * this tree (`galleryAgainstBase`, TASK-118's method): their words, their
 * rendered DOM and their boxes, read at the base by this spec's base reading
 * (`evidence/refinement/task-119/parity/gallery-base-*.json`). This task
 * changes no gallery-owned file the states draw (`galleryChanges`).
 *
 * Captures hold steady run to run (TASK-116's method; TASK-110's `wholePart`).
 * Each case writes its receipt to `evidence/refinement/task-119/parity/` and
 * its captures to the Runner's evidence store (outside Git), under this
 * body's folder (`clear-gallery-adoption-v2-20261120/task-119/captures/`).
 * Synthetic and contained: nothing is generated, started or written.
 */
const OWNER = '00000000-0000-4000-8000-000000011901'
const PLACE = '00000000-0000-4000-8000-000000011902'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-119', 'parity')
/** Captures go to this body's folder in the evidence store. */
const CAPTURE_BODY = 'clear-gallery-adoption-v2-20261120'
const GALLERY_COMMIT = 'bec44545eb982f6dc136a583400f7e314c306d1d'
const BASE_COMMIT = '41dc9aa7b00c099a2dc06abe89305a5c24ff1cd6'
const BASE_READING = process.env.TASK119_BASE_READING === '1'
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
    if (code !== null) throw new Error(`Synthetic TASK-119 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-119 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-119.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-119-public-placeholder',
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
// The matched data
// ─────────────────────────────────────────────────────────────────────────────

function daysAgo(days: number) {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - days)
  return now.toISOString().slice(0, 10)
}

/** Completed history on a strength goal whose stalest Focus is Upper body: the state's “Upper body”. */
function upperBodyDue(): WorkoutSessionRow[] {
  return ([['lower_body', 1], ['full_body', 2], ['power', 3], ['upper_body', 16]] as const).map(([focus, back], index) => {
    const date = daysAgo(back)
    return makeSessionRow({
      id: `00000000-0000-4000-8000-00000001191${index}`,
      user_id: OWNER, location_id: PLACE, date,
      created_at: `${date}T09:00:00.000Z`, updated_at: `${date}T09:31:00.000Z`,
      started_at: `${date}T09:00:00.000Z`, completed_at: `${date}T09:31:00.000Z`,
      title: 'Synthetic strength session', session_focus: focus,
      goal_preset: 'strength', requested_duration_mins: 45,
      actual_duration_mins: 31, requested_intensity: 7, effective_intensity: 7,
    })
  })
}

const bodyweight = { equipment: 'bodyweight', load_type: 'bodyweight' as const, load_value: null }
const prep = (exercise_id: string, session_function: 'prep' | 'recovery' = 'prep') =>
  makePrescription({ exercise_id, ...bodyweight, session_function, sets: 1, target_value: 10, rest_seconds: 30 })

/** The gallery's sample, as the catalog's slugs: three movements per guide (TASK-109's composition). */
const WARM_UP = ['arm-circles', 'scapular-push-ups', 'bench-press-rehearsal']
const COOLDOWN = ['chest-stretch', 'thoracic-rotation', 'childs-pose']

/** Warm-up, the state's For Time work and the Cooldown, in performed order. */
function parityAcceptance(): SessionAcceptance {
  return preparationAcceptance({
    locationId: PLACE,
    sections: [
      { section_type: 'warmup', section_title: 'Prime the upper body', section_notes: 'Move with control.', blocks: [makeWorkoutBlock({ exercises: WARM_UP.map((slug) => prep(slug)) })] },
      {
        section_type: 'conditioning', section_title: 'Conditioning', section_notes: null,
        blocks: [makeWorkoutBlock({ structure_type: 'for_time', timer_type: 'count_up', timer_seconds: 900, exercises: [makePrescription({ exercise_id: 'wall-ball', equipment: 'medicine-ball', sets: 1, target_value: 40, load_value: 9, rest_seconds: null })] })],
      },
      { section_type: 'cooldown', section_title: 'Unwind', section_notes: 'Breathe slowly.', blocks: [makeWorkoutBlock({ exercises: COOLDOWN.map((slug) => prep(slug, 'recovery')) })] },
    ],
  })
}

/** The contained synthetic account: Generate's reads and Review's hand-off; nothing is written. */
async function syntheticApp(page: Page, options: { history?: readonly WorkoutSessionRow[]; acceptance?: SessionAcceptance }) {
  const sessions = options.history ?? []
  const snapshot: SessionSnapshot | null = options.acceptance === undefined
    ? null
    : sessionSnapshotSchema.parse(peerGroupingSnapshot(options.acceptance, { userId: OWNER }))
  const unexpected: string[] = []
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const method = request.method()
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${method} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (method === 'GET' || method === 'HEAD') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', name: 'Building gym', is_default: true })])
      if (name === 'workout_sessions') return reply(sessions)
      // The library has no entry for any movement, as the gallery's memory library answers.
      return reply([])
    }
    if (method === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (name === 'session_snapshot') return reply(snapshot)
      if (name === 'streak_sessions') {
        return reply(sessions.map((row) => ({ session_id: row.id, completed_at: row.completed_at, counts_for_streak: row.counts_for_streak })))
      }
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    // The look check saves nothing: any write is recorded and refused.
    unexpected.push(`${method} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-119 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-119-session', refreshToken: 'synthetic-task-119-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-119@example.invalid' },
    }))
    if (location.pathname === '/review' && handoff !== null) {
      history.replaceState({ usr: handoff, key: 'synthetic-task-119', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: options.acceptance === undefined ? null : reviewHandoff(options.acceptance) })
  return {
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition; nothing is written or generated').toEqual([])
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading, comparing and keeping (TASK-109's and TASK-118's method)
// ─────────────────────────────────────────────────────────────────────────────

async function renderFrame(page: Page) {
  await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } })
}

/** Fonts loaded and entrance motion finished, so every word is drawn (loops excepted). */
async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
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

/** Captures go to this body's folder in the evidence store, outside Git; else into test-results. */
function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    const dir = join(store.dir, CAPTURE_BODY, 'task-119', 'captures')
    return { dir, identity: `store:${CAPTURE_BODY}/task-119/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-119-parity')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

/** The part's image once it holds still: two screenshots in a row byte-identical. */
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

/** No ScrollRegion is lit: the streak a scroll raises has settled. */
async function scrollSettled(page: Page) {
  await page.waitForFunction(() => document.querySelector('.clr-scroll-region[data-scrolling]') === null)
}

/** How far the part runs past what its scroll region (or the viewport) shows; 0 when whole. */
async function overrun(target: Locator): Promise<number> {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const scroller = element.closest('.clr-scroll-region__scroller')
    const shown = scroller === null ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
    const over = Math.max(shown.top - box.top, box.bottom - shown.bottom)
    return over > 1 ? Math.ceil(over) : 0
  })
}

/** TASK-110's `wholePart`: a part taller than its region is captured on a page just tall enough. */
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
      await target.evaluate((element) => element.scrollIntoView({ block: 'center' }))
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

/**
 * The files the accepted gallery (bec4454) owns that this task changes, each
 * named by its criterion and the state that would show it. Generate.tsx is the
 * route's own; neither the `screens` nor the `preparation` state draws it, and
 * both read as they did at the base (`galleryAgainstBase`).
 */
const GALLERY_CHANGES = [
  {
    file: 'src/app/Generate.tsx',
    criteria: ['TASK-AC-8C58C464BAD0'],
    states: [],
    change: 'Owner decision 4 (2026-11-18, Q-005): with a recommended Focus and Recovery on, the Recovery chip (with its note above it) stays in view when Change focus is collapsed (`recoveryKept`). Round 7 only; no state draws the route: the screens state composes its own Generate card, where a chosen Recovery already stays in view as the Focus value, so it is not updated.',
  },
] as const

function writeReceipt(name: string, receipt: Record<string, unknown>) {
  mkdirSync(RECEIPTS, { recursive: true })
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-119-parity/v1', task: 'TASK-119', gallery: GALLERY_COMMIT, galleryChanges: GALLERY_CHANGES, ...receipt }, null, 2)}\n`)
}

/** How far, in CSS px, an element's edge or size may sit from its counterpart's. */
const LAYOUT_TOLERANCE_PX = 2

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
 * its `clr-` classes and the words it draws, numbered in document order; data
 * words that differ by intent are read as placeholders.
 */
async function boxesOf(target: Locator, placeholders: readonly (readonly [string, string])[] = []): Promise<Box[]> {
  return target.evaluate((root, swaps) => {
    const origin = root.getBoundingClientRect()
    const rounded = (value: number) => Math.round(value * 10) / 10
    const neutral = (words: string) => swaps.reduce((text, [from, to]) => text.split(from).join(to), words)
    const seen = new Map<string, number>()
    const boxes: { key: string; x: number; y: number; width: number; height: number }[] = []
    for (const element of [root, ...root.querySelectorAll('*')]) {
      if (element.closest('.clr-focus-brackets') !== null) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const classes = [...element.classList].filter((name) => name.startsWith('clr-')).sort().map((name) => `.${name}`).join('')
      const words = neutral((element instanceof HTMLElement ? element.innerText : (element.textContent ?? '')).replace(/\s+/g, ' ').trim()).slice(0, 80)
      const tag = element.tagName.toLowerCase().replace(/^h[1-6]$/, 'h')
      const name = element === root ? '(part)' : `${tag}${classes}|${words}`
      const index = seen.get(name) ?? 0
      seen.set(name, index + 1)
      boxes.push({ key: `${name}#${index}`, x: rounded(rect.left - origin.left), y: rounded(rect.top - origin.top), width: rounded(rect.width), height: rounded(rect.height) })
    }
    return boxes
  }, placeholders.map(([from, to]) => [from, to] as [string, string]))
}

/** Each element drawn elsewhere, at another size, or on one side only, labelled if a criterion intends it. */
function compareLayout(gallery: readonly Box[], route: readonly Box[], intended: readonly IntendedLayout[]): LayoutDifference[] {
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
    const offset = Math.max(
      Math.abs(box.x - counterpart.x), Math.abs(box.y - counterpart.y),
      Math.abs(box.width - counterpart.width), Math.abs(box.height - counterpart.height),
    )
    if (offset > LAYOUT_TOLERANCE_PX) differences.push(labelled(box.key, box, counterpart))
  }
  for (const box of remaining.values()) differences.push(labelled(box.key, null, box))
  return differences
}

interface Reading {
  readonly lines: string[]
  readonly boxes: Box[]
  readonly capture: { file: string; sha256: string }
  /** The control's accessible name, where the part is one control. */
  readonly name: string | null
}

async function nameOf(target: Locator): Promise<string | null> {
  return target.evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) return null
    return element.getAttribute('aria-label') ?? element.textContent?.replace(/\s+/g, ' ').trim() ?? null
  })
}

async function read(target: Locator, capture: string, placeholders: readonly (readonly [string, string])[] = []): Promise<Reading> {
  await expect(target).toBeVisible()
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await renderFrame(target.page())
  await settle(target.page())
  return { lines: await linesOf(target), boxes: await boxesOf(target, placeholders), capture: await keep(target, capture), name: await nameOf(target) }
}

interface Comparison {
  readonly part: string
  readonly gallery: Reading | null
  readonly route: Reading | null
  readonly differences: Difference[]
  readonly layout: LayoutDifference[]
  readonly names: { gallery: string | null; route: string | null; criterion: string | null; reason: string | null } | null
}

interface PartIntent {
  readonly lines?: readonly Intended[]
  readonly layout?: readonly IntendedLayout[]
  /** A control's accessible name that differs by intent. */
  readonly name?: { criterion: string; reason: string }
}

function compared(part: string, gallery: Reading | null, route: Reading | null, intent: PartIntent = {}): Comparison {
  const differences = compare(gallery?.lines ?? [], route?.lines ?? [], intent.lines ?? [])
  const layout = compareLayout(gallery?.boxes ?? [], route?.boxes ?? [], intent.layout ?? [])
  const galleryName = gallery?.name ?? null
  const routeName = route?.name ?? null
  const names = galleryName === null && routeName === null
    ? null
    : { gallery: galleryName, route: routeName, criterion: galleryName === routeName ? null : intent.name?.criterion ?? null, reason: galleryName === routeName ? null : intent.name?.reason ?? null }
  return { part, gallery, route, differences, layout, names }
}

function expectIntended(comparisons: readonly Comparison[], label: string) {
  for (const comparison of comparisons) {
    expect(comparison.differences.filter((difference) => difference.criterion === null), `${label} ${comparison.part}: every visible difference is one a criterion intends`).toEqual([])
    expect(comparison.layout.filter((difference) => difference.criterion === null), `${label} ${comparison.part}: every element is drawn where the accepted gallery draws it, within ${LAYOUT_TOLERANCE_PX}px, unless a criterion intends otherwise`).toEqual([])
    if (comparison.names !== null && comparison.names.gallery !== comparison.names.route) {
      expect(comparison.names.criterion, `${label} ${comparison.part}: the control's name differs only by intent`).not.toBeNull()
    }
  }
}

function receiptOf(comparisons: readonly Comparison[]) {
  return {
    captures: Object.fromEntries(comparisons.flatMap((comparison) => [
      ...(comparison.gallery === null ? [] : [[`gallery-${comparison.part}`, comparison.gallery.capture]]),
      ...(comparison.route === null ? [] : [[`route-${comparison.part}`, comparison.route.capture]]),
    ])),
    lines: Object.fromEntries(comparisons.map((comparison) => [comparison.part, { gallery: comparison.gallery?.lines ?? null, route: comparison.route?.lines ?? null }])),
    names: Object.fromEntries(comparisons.filter((comparison) => comparison.names !== null).map((comparison) => [comparison.part, comparison.names])),
    differences: Object.fromEntries(comparisons.map((comparison) => [comparison.part, comparison.differences])),
    layout: {
      method: 'element boxes',
      keys: 'tag, clr- classes and words (data words that differ by intent read as placeholders)',
      tolerancePx: LAYOUT_TOLERANCE_PX,
      measured: Object.fromEntries(comparisons.map((comparison) => [comparison.part, { gallery: comparison.gallery?.boxes.length ?? 0, route: comparison.route?.boxes.length ?? 0 }])),
      parts: Object.fromEntries(comparisons.map((comparison) => [comparison.part, {
        gallery: comparison.gallery?.boxes.find((box) => box.key === '(part)#0') ?? null,
        route: comparison.route?.boxes.find((box) => box.key === '(part)#0') ?? null,
      }])),
      differences: Object.fromEntries(comparisons.map((comparison) => [comparison.part, comparison.layout])),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The accepted states at the base (TASK-118's method)
// ─────────────────────────────────────────────────────────────────────────────

/** A state's words, its DOM (React's generated ids dropped) and where each element is drawn. */
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
 * The state at the base (41dc9aa7) against this tree. The base reading is this
 * spec's own, taken once on a clean export of the base commit with
 * `TASK119_BASE_READING=1` and kept beside the receipts.
 */
function againstBase(state: 'screens' | 'preparation', width: number, here: { lines: string[]; dom: string; boxes: Box[] }) {
  const file = join(RECEIPTS, `gallery-base-${state}-phone-${width}.json`)
  if (BASE_READING) {
    mkdirSync(RECEIPTS, { recursive: true })
    writeFileSync(file, `${JSON.stringify({ schema: 'clear-task-119-gallery-base/v1', base: BASE_COMMIT, state, width, ...here }, null, 2)}\n`)
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
// screens: /generate beside Round 7's composed Generate card
// ─────────────────────────────────────────────────────────────────────────────

const all = /.*/
const SCREENS_INTENT: Record<string, PartIntent> = {
  back: {
    name: { criterion: 'AC-R024-05', reason: 'R10.5 / #286: the route’s shared icon-only Back is named for its destination, “Home” (unchanged at the base); the state’s composed card names its Back “Back to Home”.' },
    layout: [{ criterion: 'AC-R024-05', match: /^(svg|path)\|/, reason: 'The route’s Back glyph is ArrowLeft at 20 px in the screen header (unchanged at the base); the state’s card draws ArrowLeft at its default size.' }],
  },
  title: {
    lines: [
      { side: 'gallery only', match: /^GENERATE$/, criterion: 'AC-R024-04', reason: 'R10.4: the route’s page title is Generate as the screen’s own heading (h1, sentence case); the state’s card labels itself “Generate” in the label face.' },
      { side: 'route only', match: /^Generate$/, criterion: 'AC-R024-04', reason: 'R10.4: the page title, Generate, the route’s h1.' },
    ],
    layout: [{ criterion: 'AC-R024-04', match: /^(\(part\)#0|span\.clr-echo-text)/, reason: 'The route’s title is the screen heading on the atmosphere (Form Screen template, unchanged at the base), drawn in the heading face through the shared foreground echo; the state’s card draws a label.' }],
  },
  goal: {
    lines: [
      { side: 'gallery only', match: /^BUILD STRENGTH$/, criterion: 'AC-C51-01', reason: 'C51: Goal/Focus lead the card. The state illustrates the standing goal as one label; the route’s Round 7 summary states the Goal term and the profile’s standing Goal value (Strength).' },
      { side: 'route only', match: /^GOAL$|^Strength$/, criterion: 'AC-C51-01', reason: 'C51 / R21: the route’s Goal/Focus summary (Round 7, decision 4 of 2026-11-13): the Goal term and the standing Goal’s label in the summary’s larger type.' },
    ],
    layout: [{ criterion: 'AC-R024-02', match: all, reason: 'R10.2: the route’s Goal and Focus share one two-column summary row in the larger summary type; the state’s card stacks a label over the Focus value.' }],
  },
  focus: {
    name: { criterion: 'AC-R024-02', reason: 'R10.2: the route’s Focus value is the disclosure named Change focus, with its expanded state (Round 7’s naming, round-07 S4); the state’s quiet button is named by the value it shows.' },
    lines: [
      { side: 'route only', match: /^FOCUS$/, criterion: 'AC-C51-01', reason: 'C51: the route’s summary keeps the Focus term above the interactive Focus value.' },
    ],
    layout: [{ criterion: 'AC-R024-02', match: all, reason: 'R10.2 / R25: the route’s Focus value is a secondary text action (no frame) under its term in the summary; the state draws a framed quiet button.' }],
  },
  'focus-open': {
    lines: [
      { side: 'gallery only', match: /^FOCUS$/, criterion: 'AC-R024-02', reason: 'R10.2 / #286: the route opens the choices in place under the Focus value (a disclosure with its expanded state, one-workout override); the state opens a titled dialog with a legend.' },
      { side: 'gallery only', match: /^RECOVERY$/, criterion: 'AC-R024-01', reason: 'R10.1: Recovery is never a fifth movement focus; the route keeps it as its own session toggle apart from the four. The state lists it as a Focus choice.' },
      { side: 'route only', match: /^RECOVERY SESSION$/, criterion: 'AC-R024-01', reason: 'R10.1: the route’s one-workout Recovery toggle, inside the choices and apart from the four focuses.' },
      { side: 'route only', match: /^POWER$/, criterion: 'AC-R024-08', reason: '#286: the route keeps all four Anchors (Power included) as the one-workout choices; the state’s illustration omits Power.' },
    ],
    layout: [{ criterion: 'AC-R024-02', match: all, reason: 'R10.2 / #286: the route’s choices open in place under the summary (chips, then Recovery apart); the state’s open in a centred dialog.' }],
  },
  'recovery-closed': {
    name: { criterion: 'TASK-AC-8C58C464BAD0', reason: 'Owner decision 4 (2026-11-18): closed, the route keeps its Recovery chip (“Recovery session”, pressed) in view; the state, where Recovery is a Focus choice, shows it as the Focus value.' },
    lines: [
      { side: 'gallery only', match: /^RECOVERY$/, criterion: 'TASK-AC-8C58C464BAD0', reason: 'Decision 4: a chosen Recovery stays in view once the choices close; the state shows it as the Focus value.' },
      { side: 'route only', match: /^RECOVERY SESSION$/, criterion: 'TASK-AC-8C58C464BAD0', reason: 'Decision 4: the route’s pressed Recovery chip stays in view with the choices closed.' },
    ],
    layout: [{ criterion: 'TASK-AC-8C58C464BAD0', match: all, reason: 'Decision 4 / R10.1: the route’s Recovery is its own chip (pressed, with its tick), the state’s the Focus value’s quiet button.' }],
  },
  'recovery-note': {
    lines: [{ side: 'route only', match: /^A lighter workout, for today only\. Power isn’t offered for recovery\.$/, criterion: 'TASK-AC-8C58C464BAD0', reason: 'Decision 4: “the chip stays visible with its note” — the route’s Recovery note (U29), above the chip; the state has no note.' }],
    layout: [{ criterion: 'TASK-AC-8C58C464BAD0', match: all, reason: 'Route only: the Recovery note (U29), kept with the chip (decision 4).' }],
  },
  minutes: {
    lines: [
      { side: 'gallery only', match: /^TIME$/, criterion: 'AC-R024-07', reason: 'The route keeps its field’s own label, Time available (labels retained); the state’s illustration says Time.' },
      { side: 'route only', match: /^TIME AVAILABLE$/, criterion: 'AC-R024-07', reason: 'The route’s retained field label.' },
    ],
    layout: [{ criterion: 'AC-R024-07', match: /^label\|TIME( AVAILABLE)?#0$/, reason: 'The same public Input, field and MINUTES end cap drawn box for box (R10.3); only its label’s words differ (the route’s retained label, Time available).' }],
  },
  action: {
    layout: [{ criterion: 'AC-R024-04', match: /^\(part\)#0$/, reason: 'The action keeps its name (R10.4); the route pins it, large and full width, in the measured footer (Form Screen template, unchanged at the base); the state’s card draws it at its default size inside the card. Its words and inner boxes match.' }],
  },
}

/** The Input's root (label and field) around a `.clr-field` holding an end cap. */
const fieldRoot = (scope: Locator) => scope.locator('.clr-field').filter({ has: scope.page().locator('.clr-field__unit') }).locator('xpath=../..')

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-807B9EE9EECD screens ${name}: /generate’s Back, title, Goal and Focus, the choices it opens, Recovery kept in view closed, the minutes field and Generate workout match the accepted screens state`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })

    // The accepted state.
    await visit('/gallery/refinements?state=screens')
    const state = page.locator('[data-refinement-state="screens"]')
    await expect(state).toBeVisible()
    await settle(page)
    const base = againstBase('screens', viewport.width, await stateIdentity(state))
    if (BASE_READING) return
    const card = state.locator('.clr-card').filter({ has: page.locator('p.label', { hasText: /^Generate$/ }) })
    const gallery: Record<string, Reading> = {}
    gallery.back = await read(card.getByRole('button', { name: 'Back to Home', exact: true }), `screens-${name}-gallery-back`)
    gallery.title = await read(card.locator('p.label', { hasText: /^Generate$/ }), `screens-${name}-gallery-title`)
    gallery.goal = await read(card.locator('p.label', { hasText: /^Build strength$/ }), `screens-${name}-gallery-goal`)
    const galleryFocus = card.getByRole('button', { name: 'Upper body', exact: true })
    gallery.focus = await read(galleryFocus, `screens-${name}-gallery-focus`)
    gallery.minutes = await read(fieldRoot(card), `screens-${name}-gallery-minutes`)
    gallery.action = await read(card.getByRole('button', { name: 'Generate workout', exact: true }), `screens-${name}-gallery-action`)
    await galleryFocus.click()
    const dialog = page.getByRole('dialog', { name: 'Focus', exact: true })
    await expect(dialog).toBeVisible()
    gallery['focus-open'] = await read(dialog, `screens-${name}-gallery-focus-open`)
    await dialog.getByRole('radio', { name: 'Recovery', exact: true }).check()
    await expect(dialog).toBeHidden()
    gallery['recovery-closed'] = await read(card.getByRole('button', { name: 'Recovery', exact: true }), `screens-${name}-gallery-recovery-closed`)

    // The real route: a returning athlete, Upper body recommended on a strength goal, 45 minutes.
    const app = await syntheticApp(page, { history: upperBodyDue() })
    await visit('/generate')
    const main = page.locator('main')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Generate')
    const focus = main.getByRole('button', { name: 'Change focus', exact: true })
    await expect(focus).toHaveText('Upper body')
    await expect(page.getByLabel('Time available', { exact: true })).toHaveValue('45')
    const summary = (term: 'Goal' | 'Focus') => main.locator('.clr-v4-program-summary > div').filter({ has: page.locator('span', { hasText: new RegExp(`^${term}$`) }) })
    const route: Record<string, Reading> = {}
    route.back = await read(main.locator('header').getByRole('button', { name: 'Home', exact: true }), `screens-${name}-route-back`)
    route.title = await read(page.getByRole('heading', { level: 1 }), `screens-${name}-route-title`)
    route.goal = await read(summary('Goal'), `screens-${name}-route-goal`)
    route.focus = await read(summary('Focus'), `screens-${name}-route-focus`)
    const routeFocusName = await nameOf(focus)
    route.minutes = await read(fieldRoot(main), `screens-${name}-route-minutes`)
    route.action = await read(page.getByRole('button', { name: 'Generate workout', exact: true }), `screens-${name}-route-action`)
    await focus.click()
    await expect(focus).toHaveAttribute('aria-expanded', 'true')
    const choices = main.getByRole('group', { name: 'Focus for this workout' }).locator('xpath=..')
    route['focus-open'] = await read(choices, `screens-${name}-route-focus-open`)
    // Decision 4: Recovery on, then the choices closed — the chip and its note stay.
    const chip = main.getByRole('button', { name: 'Recovery session', exact: true })
    await chip.click()
    await focus.click()
    await expect(focus).toHaveAttribute('aria-expanded', 'false')
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    route['recovery-closed'] = await read(chip, `screens-${name}-route-recovery-closed`)
    const note = main.getByText(/^A lighter workout, for today only\./)
    route['recovery-note'] = await read(note, `screens-${name}-route-recovery-note`)

    const comparisons = [
      compared('back', gallery.back, route.back, SCREENS_INTENT.back),
      compared('title', gallery.title, route.title, SCREENS_INTENT.title),
      compared('goal', gallery.goal, route.goal, SCREENS_INTENT.goal),
      compared('focus', gallery.focus, { ...route.focus, name: routeFocusName }, SCREENS_INTENT.focus),
      compared('focus-open', gallery['focus-open'], route['focus-open'], SCREENS_INTENT['focus-open']),
      compared('recovery-closed', gallery['recovery-closed'], route['recovery-closed'], SCREENS_INTENT['recovery-closed']),
      compared('recovery-note', null, route['recovery-note'], SCREENS_INTENT['recovery-note']),
      compared('minutes', gallery.minutes, route.minutes, SCREENS_INTENT.minutes),
      compared('action', gallery.action, route.action, SCREENS_INTENT.action),
    ]
    writeReceipt(`screens-${name}`, {
      state: 'screens', width: viewport.width, route: '/generate',
      drive: 'gallery state as loaded, then its Focus value pressed (the Focus dialog) and Recovery chosen; /generate for a returning athlete (Upper body recommended, strength, 45 minutes), then Change focus pressed (the choices), Recovery session pressed and Change focus pressed again (closed)',
      matchedData: { gallery: { goal: 'Build strength', focus: 'Upper body', minutes: '45' }, route: { goal: 'strength (Strength)', focus: 'Upper body (recommended from history)', minutes: '45' } },
      parts: {
        back: 'the framed icon-only Back',
        title: 'the Generate title',
        goal: 'the goal reading',
        focus: 'the Focus value (the route’s Focus summary item: its term and the Change focus control)',
        'focus-open': 'the choices the Focus value opens (the state’s Focus dialog; the route’s four focuses and Recovery in place)',
        'recovery-closed': 'Recovery with the choices closed (owner decision 4, 2026-11-18)',
        'recovery-note': 'the Recovery note kept with the chip (route only)',
        minutes: 'the time field with its MINUTES end cap',
        action: 'Generate workout',
      },
      routeOnly: {
        intensity: { criterion: 'AC-R024-08', reason: '#286 / decision of 2026-11-13 (kept): the 1–10 Intensity and its explanation line; the state’s composed card omits them.' },
        place: { criterion: 'AC-R024-07', reason: 'Place keeps its label and control with no helper line (R23); the state’s card omits it.' },
        notes: { criterion: 'AC-R024-07', reason: 'Notes keeps its label, control and placeholder with no helper line (R23); the state’s card omits it.' },
      },
      galleryAgainstBase: base,
      ...receiptOf(comparisons),
    })
    expectIntended(comparisons, `screens @${name}`)
    app.assertContained()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// preparation: /review beside Round 7's preparation state
// ─────────────────────────────────────────────────────────────────────────────

/** The gallery's illustrated sample (src/dev/gallery-refinement-runtime.tsx), as drawn. */
const SAMPLE = {
  'Warm-up': ['Arm circles', 'Scapular push-ups', 'Bench press rehearsal'],
  Cooldown: ['Chest stretch', 'Thoracic rotation', 'Child’s pose'],
} as const
type Title = keyof typeof SAMPLE

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function guideIntent(title: Title, routeNames: readonly string[], routeMinutes: string): PartIntent {
  const names = (side: Difference['side'], list: readonly string[]) => list.map((entry): Intended => ({
    side, match: new RegExp(`^${escape(entry)}$`, 'i'), criterion: 'AC-R034-01',
    reason: 'Real data only (TASK-AC-0A3231160F1D): each route names its guide’s movements with the catalog reader (lower case, no apostrophe) from the same three movements the state’s illustrated sample lists in sentence case (TASK-109’s matched composition).',
  }))
  return {
    lines: [
      ...names('gallery only', SAMPLE[title]),
      ...names('route only', routeNames),
      ...(title === 'Cooldown' ? [
        { side: 'gallery only' as const, match: /^~3 minutes$/i, criterion: 'AC-R022-01', reason: 'The approximate time is TASK-034’s estimate of the actual prescriptions (~4 minutes), never the state’s illustrated ~3.' },
        { side: 'route only' as const, match: new RegExp(`^${escape(routeMinutes)}$`, 'i'), criterion: 'AC-R022-01', reason: 'TASK-034’s estimate of the actual prescriptions.' },
      ] : []),
    ],
  }
}

function guidePlaceholders(names: readonly string[], minutes: string): (readonly [string, string])[] {
  return [
    ...names.map((entry, index) => [entry, `NAME-${index + 1}`] as const),
    ...names.map((entry, index) => [entry.toUpperCase(), `NAME-${index + 1}`] as const),
    [minutes, '~N MINUTES'], [minutes.toUpperCase(), '~N MINUTES'],
  ]
}

const guideCard = (scope: Locator | Page, title: Title) => scope.locator(`[data-preparation-guide="${title}"]`).locator('.clr-card').first()

/** The content's parts in order from the Warm-up on: guides by title, work, then Regenerate. */
async function orderOf(scope: Locator): Promise<string[]> {
  return scope.evaluate((root) => {
    const parts = [...root.querySelectorAll<HTMLElement>('[data-preparation-guide], [data-review-section], .clr-movement-group, .clr-actions')]
      .filter((part) => part.parentElement?.closest('[data-preparation-guide], [data-review-section], .clr-movement-group, .clr-actions') == null)
      // A closed confirmation's actions are not content.
      .filter((part) => part.closest('dialog') === null)
      // Any other action row (a live card's Start) is part of its work.
      .map((part) => part.dataset.preparationGuide ?? ((part.textContent ?? '').trim() === 'Regenerate' && part.classList.contains('clr-actions') ? 'Regenerate' : 'work'))
    return parts.filter((part, index) => part !== 'work' || parts[index - 1] !== 'work')
  })
}

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-807B9EE9EECD preparation ${name}: /review draws the Warm-up and Cooldown guides as the accepted preparation state does, the work between them, and Regenerate after the Cooldown`, async ({ page, visit }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const acceptance = parityAcceptance()
    const guides = {
      'Warm-up': composedPreparationGuide(acceptance.workout.sections[0])!,
      Cooldown: composedPreparationGuide(acceptance.workout.sections[2])!,
    }
    expect(guides['Warm-up'].movementCount).toBe(SAMPLE['Warm-up'].length)
    expect(guides.Cooldown.movementCount).toBe(SAMPLE.Cooldown.length)
    const routeNames = (title: Title) => guides[title].movements.map((movement) => movement.name)

    // The accepted state.
    await visit('/gallery/refinements?state=preparation')
    const state = page.locator('[data-refinement-state="preparation"]')
    await expect(state).toBeVisible()
    await settle(page)
    const base = againstBase('preparation', viewport.width, await stateIdentity(state))
    if (BASE_READING) return
    const galleryOrder = await orderOf(state)
    const gallery: Record<string, Reading> = {}
    for (const title of ['Warm-up', 'Cooldown'] as const) {
      gallery[title] = await read(guideCard(state, title), `preparation-${name}-gallery-${title.toLowerCase()}`, guidePlaceholders(SAMPLE[title], title === 'Cooldown' ? '~3 minutes' : '~4 minutes'))
    }

    // /review: the composed workout handed off, read to its end.
    const app = await syntheticApp(page, { acceptance })
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
    const region = page.getByRole('region', { name: 'Review content' })
    const routeOrder = await orderOf(region)
    const route: Record<string, Reading> = {}
    for (const title of ['Warm-up', 'Cooldown'] as const) {
      route[title] = await read(guideCard(page, title), `preparation-${name}-route-${title.toLowerCase()}`, guidePlaceholders(routeNames(title), guides[title].durationText))
    }
    const regenerate = region.getByRole('button', { name: 'Regenerate', exact: true })
    route.regenerate = await read(regenerate.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " clr-actions ")][1]'), `preparation-${name}-route-regenerate`)
    const placement = await region.evaluate((root) => {
      const cooldown = root.querySelector('[data-preparation-guide="Cooldown"]')!
      const names = [...cooldown.querySelectorAll('li')]
      const button = [...root.querySelectorAll('button')].filter((control) => control.closest('dialog') === null).at(-1)!
      return {
        lastButton: button.textContent?.trim() ?? '',
        gapBelowCooldownPx: Math.round((button.getBoundingClientRect().top - cooldown.getBoundingClientRect().bottom) * 10) / 10,
        belowCooldownLastMovement: names.at(-1)!.getBoundingClientRect().bottom <= button.getBoundingClientRect().top + 0.5,
      }
    })
    expect(placement.lastButton).toBe('Regenerate')
    expect(placement.belowCooldownLastMovement).toBe(true)

    const comparisons = [
      compared('warm-up', gallery['Warm-up'], route['Warm-up'], guideIntent('Warm-up', routeNames('Warm-up'), guides['Warm-up'].durationText)),
      compared('cooldown', gallery.Cooldown, route.Cooldown, guideIntent('Cooldown', routeNames('Cooldown'), guides.Cooldown.durationText)),
      compared('regenerate', null, route.regenerate, {
        lines: [{ side: 'route only', match: /^REGENERATE$/, criterion: 'AC-C50-01', reason: 'C50: Review’s Regenerate follows all workout content, the Cooldown guide included; the state draws the Review order’s guides and work only, with no Review screen.' }],
        layout: [{ criterion: 'AC-C50-01', match: all, reason: 'C50: the route’s Regenerate row, the last item of the content, after the Cooldown guide (route only).' }],
      }),
    ]
    const orderDifferences = compare(galleryOrder, routeOrder, [
      { side: 'route only', match: /^Regenerate$/, criterion: 'AC-C50-01', reason: 'C50: Regenerate follows the whole workout, after the Cooldown.' },
    ])
    writeReceipt(`preparation-${name}`, {
      state: 'preparation', width: viewport.width, route: '/review',
      drive: 'gallery state as loaded (the sample guides around the live For Time card); /review as handed off, read to the end of its content',
      matchedData: {
        gallery: SAMPLE,
        route: { 'Warm-up': { names: routeNames('Warm-up'), time: guides['Warm-up'].durationText }, Cooldown: { names: routeNames('Cooldown'), time: guides.Cooldown.durationText } },
      },
      parts: {
        'warm-up': 'the Warm-up guide’s own card: title, approximate time and names',
        cooldown: 'the Cooldown guide’s own card',
        regenerate: 'Review’s Regenerate row (route only)',
      },
      order: { gallery: galleryOrder, route: routeOrder, differences: orderDifferences },
      placement,
      galleryAgainstBase: base,
      ...receiptOf(comparisons),
    })
    expect(galleryOrder).toEqual(['Warm-up', 'work', 'Cooldown'])
    expect(routeOrder).toEqual(['Warm-up', 'work', 'Cooldown', 'Regenerate'])
    expect(orderDifferences.filter((difference) => difference.criterion === null), `preparation @${name}: the order differs only by Regenerate after the Cooldown`).toEqual([])
    expectIntended(comparisons, `preparation @${name}`)
    app.assertContained()
  })
}
