import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { CIRCUIT } from '../../src/dev/gallery-refinement-fixtures'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-107 look check (TASK-AC-2FA21EDA32B4): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 * The route this task wires is `/workout`'s circuit (`CircuitBlock` over the
 * one circuit controller, `src/state/circuit.ts`): Finish round N confirms the
 * round in Round 7's dialog, `Round N recorded`, with the round time read back
 * from the stored history, the circuit's rest drawn in the dialog instead of
 * beside the card, and Take back this round; the X returns the rest to the
 * card and focus to the round clock. Its movement entry is the same block's
 * (gallery state `circuit-movement`). Each accepted state mounts the gallery's
 * own circuit (`CIRCUIT`, `src/dev/gallery-refinement-fixtures.ts`) on the
 * gallery's memory runtime and its driver presses the same controls a person
 * would; the route performs the very same block on a contained synthetic
 * session, with the profile's unit the gallery uses (lb).
 *
 * Both sides are read alike on the browser's own clock (Playwright's, held
 * still between steps so every reading, the round time and the running rest
 * included, is exact):
 *
 *   · `card`: the circuit's card before anything is pressed;
 *   · `open`: the dialog its control opens — `Round 1 recorded` after Start
 *     round 1 and Finish round 1 with 32.72 s between them (the gallery
 *     driver's timing), or the first movement's `Log set 1`;
 *   · `closed` (circuit-round): the block after the dialog's X — the rest back
 *     beside the card, the round recorded, its time in the history.
 *
 * The page behind an open dialog shows through its backdrop, so it is held
 * where the card was read (`holdPageScroll`); an open dialog's X is painted
 * afresh just before it is captured (`repaint`); and a part is captured once
 * it holds still (`steadyScreenshot`) — TASK-106's methods, so every capture
 * of the same code is the same image, run after run.
 *
 * Every visible word of each moment is read from both sides, and so is the
 * layout: every rendered element's box is measured and compared with its
 * counterpart within `LAYOUT_TOLERANCE_PX` (TASK-103's method). A difference
 * no criterion intends fails the case; an intended one is labelled with its
 * criterion ID. Each case writes its receipt to `evidence/refinement/task-107/
 * parity/` and its captures beside the Runner's evidence store (outside Git),
 * recording each capture's SHA-256 in the receipt. Synthetic and contained:
 * nothing is written over the network; the circuit's record is the route's own
 * local storage and the gallery's memory.
 */
const OWNER = '00000000-0000-4000-8000-000000010790'
const PLACE = '00000000-0000-4000-8000-000000010791'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-107', 'parity')
/** The browser's clock at the start of each case. */
const ENTRY = Date.parse('2026-11-19T09:00:00.000Z')
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
    if (code !== null) throw new Error(`Synthetic TASK-107 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-107 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-107.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-107-public-placeholder',
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
// Matched data: the gallery's own circuit, persisted as a session
// ─────────────────────────────────────────────────────────────────────────────

type State = 'circuit-round' | 'circuit-movement'
type Moment = 'card' | 'open' | 'closed'

interface StateShape {
  /** The gallery state's own title (`LOGGING_CONTEXTS`): its "Open …" button. */
  readonly label: string
  /** The dialog the state's control opens. */
  readonly title: string
  /** What the case presses, in the gallery's driver's order. */
  readonly drive: string
}

const STATES: Readonly<Record<State, StateShape>> = {
  'circuit-round': {
    label: 'Circuit round / take back', title: 'Round 1 recorded',
    drive: 'card; Start round 1, 32.72 s on the circuit’s clock, Finish round 1 → Round 1 recorded (read 0.5 s later); Close log → the block with its rest back beside the card (read 0.5 s later)',
  },
  'circuit-movement': {
    label: 'Circuit movement entry', title: 'Log set 1',
    drive: 'card; Rest for goblet squat → Log set 1 (read 0.5 s later)',
  },
}

/**
 * The gallery driver's round (`sceneFor('circuit-round')`): Start round 1 on
 * one 40 ms tick, `advance(32_000)` on the next, `wait(600)` for sixteen more,
 * Finish round 1 on the tick after — 32 s on the gallery's clock plus eighteen
 * ticks (720 ms) of the browser's. The route waits exactly as long.
 */
const ROUND_MS = 32_000 + 18 * 40

/** The gallery's own sample unit (`PreviewSetLogging`), so loads and saved weights read alike. */
const GALLERY_UNIT = 'lb' as const

/** The gallery's circuit, as the route's session carries it. */
function routeSession(): SessionSnapshot {
  return sessionSnapshotSchema.parse(snapshotFixture({
    userId: OWNER,
    title: 'TASK-107 parity circuit',
    startedAt: new Date(ENTRY - 10 * 60_000).toISOString(),
    session: { location_id: PLACE, goal_preset: 'balanced' },
    sections: [{
      title: 'Conditioning',
      sectionType: 'conditioning',
      blocks: [{
        structureType: CIRCUIT.structureType,
        rounds: CIRCUIT.rounds,
        roundRestSeconds: CIRCUIT.roundRestSeconds,
        repScheme: CIRCUIT.repScheme,
        timerType: CIRCUIT.timerType,
        timerSeconds: CIRCUIT.timerSeconds,
        exercises: CIRCUIT.exercises.map(({ prescription: p }) => ({
          prescription: {
            exercise_id: p.exercise_id, order_index: p.order_index, equipment_used: p.equipment_used,
            load_type: p.load_type, load_value: p.load_value, modality: p.modality, sets: p.sets,
            target_kind: p.target_kind, target_value: p.target_value, target_min: p.target_min,
            target_max: p.target_max, target_sequence: p.target_sequence, per_side: p.per_side,
            distance_unit: p.distance_unit, rest_seconds: p.rest_seconds, tempo: p.tempo,
            is_interval_exercise: p.is_interval_exercise,
          },
        })),
      }],
    }],
  }))
}

/** The contained synthetic app: reads only. A write of any kind is unexpected here. */
async function syntheticApp(page: Page, snapshot: SessionSnapshot) {
  const unexpected: string[] = []
  const exercises = snapshot.sections.flatMap((section) => section.blocks
    .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
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
      if (name === 'workout_exercises') return reply(exercises)
      if (name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(exercises.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(snapshot)
      if (name === 'session_as_performed') return reply(null)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-107 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-107-session', refreshToken: 'synthetic-task-107-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-107@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading, comparing and keeping
// ─────────────────────────────────────────────────────────────────────────────

/** Fonts loaded and entrance motion finished, so every word is drawn (loops excepted). */
async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
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

/**
 * The Runner body these captures belong to: each body keeps its own folder in
 * the evidence store, so a later body never overwrites an earlier one's images.
 */
const CAPTURE_BODY = 'clear-gallery-adoption-v2-20261118'

/** Captures go beside the Runner's evidence store, outside Git; else into test-results. */
function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    const dir = join(store.dir, CAPTURE_BODY, 'task-107', 'captures')
    return { dir, identity: `store:${CAPTURE_BODY}/task-107/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-107-parity')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

/**
 * Renders one frame (a screenshot always renders one): the browser dispatches
 * pending scroll events and records paint only when a frame is rendered.
 */
async function renderFrame(page: Page) {
  await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } })
}

/**
 * Paints the open dialog's X afresh before the dialog is captured. The
 * browser reuses recorded paint until something invalidates it, and a dialog
 * that opened while its arrival was still settling could keep the X's
 * chamfer as first recorded: one edge pixel at the corner where its two
 * clip-path polygons meet (and that pixel's glow) came out one of two ways in
 * identical runs, so the capture's hash changed with no change to the page.
 * Hiding the X for one rendered frame drops its recorded paint; shown again,
 * it is recorded from the settled dialog. Only the X is hidden (the dialog's
 * opaque frame stays over the page behind), and focus goes back where it
 * was. Words and boxes are read before this.
 */
async function repaint(target: Locator) {
  const isOpenLog = await target.evaluate((element) => element.matches('dialog.clr-logging-overlay[open]'))
  const close = target.locator('.clr-logging-overlay__head button[aria-label="Close log"]')
  if (!isOpenLog || await close.count() !== 1) return
  const page = target.page()
  const focused = await page.evaluateHandle(() => document.activeElement)
  const visibility = await close.evaluate((button) => {
    const style = ((button.closest('.clr-bleed') ?? button) as HTMLElement).style
    const before = style.visibility
    style.visibility = 'hidden'
    return before
  })
  await renderFrame(page)
  await close.evaluate((button, before) => { ((button.closest('.clr-bleed') ?? button) as HTMLElement).style.visibility = before }, visibility)
  await focused.evaluate((element) => {
    if (element instanceof HTMLElement && element.isConnected && element !== document.activeElement) element.focus({ preventScroll: true })
  })
  await focused.dispose()
}

/**
 * The part's image once it holds still: screenshots 100 ms apart until two in
 * a row are byte-identical, so nothing is captured mid-change. A part that
 * never holds still fails the case rather than record an image the next run
 * would not reproduce.
 */
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

async function keep(target: Locator, name: string) {
  await repaint(target)
  const bytes = await steadyScreenshot(target)
  await test.info().attach(`${name}.png`, { body: bytes, contentType: 'image/png' })
  const { dir, identity } = captureDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.png`), bytes)
  return { file: `${identity}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function writeReceipt(name: string, receipt: Record<string, unknown>) {
  mkdirSync(RECEIPTS, { recursive: true })
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-107-parity/v1', task: 'TASK-107', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
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
 * modal dialog the part holds (measured as its own part), and Foundation's
 * focus-bracket layer, which is decoration that follows whatever has focus.
 */
async function boxesOf(target: Locator): Promise<Box[]> {
  return target.evaluate((root, aliases) => {
    const origin = root.getBoundingClientRect()
    const rounded = (value: number) => Math.round(value * 10) / 10
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
      if (element.closest('.clr-focus-brackets') !== null) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const classes = [...element.classList].filter((name) => name.startsWith('clr-')).sort().map((name) => `.${name}`).join('')
      const words = aliases.reduce((text, [source, flags, replacement]) => text.replace(new RegExp(source, flags), replacement),
        (element instanceof HTMLElement ? element.innerText : (element.textContent ?? '')).replace(/\s+/g, ' ').trim()).slice(0, 80)
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
  }, KEY_ALIASES)
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

function expectLayoutIntended(differences: readonly LayoutDifference[], label: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${label}: every element is drawn where the accepted gallery draws it, within ${LAYOUT_TOLERANCE_PX}px, unless a criterion intends otherwise`).toEqual([])
}

// ─────────────────────────────────────────────────────────────────────────────
// Intended differences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Differences a criterion intends. The route draws the same Round 7 circuit
 * and dialog from the same block, so none is expected: the gallery's sample
 * presentation carries no value for this circuit (no suggested load, guide or
 * report touches it), and the route reads only real rows (TASK-AC-70107ED1D231).
 * The tables stay explicit so a future difference is labelled rather than
 * waved through.
 */
const INTENDED: readonly Intended[] = []
const LAYOUT_INTENDED: readonly IntendedLayout[] = []
/** Words read as one name in the layout keys: [pattern, flags, name]. None here. */
const KEY_ALIASES: readonly (readonly [string, string, string])[] = []

interface Reading {
  readonly lines: string[]
  readonly boxes: Box[]
  readonly capture: { file: string; sha256: string }
}

const openLog = (page: Page) => page.locator('dialog.clr-logging-overlay[open]')

/**
 * The page behind an open dialog shows through its backdrop, so its scroll
 * position is part of every dialog capture: the document's, and each page
 * ScrollRegion's outside a dialog (whose drawn scrollbar follows it), in
 * document order, as [top, left] pairs.
 */
async function pageScroll(page: Page): Promise<number[]> {
  return page.evaluate(() => [document.scrollingElement, ...document.querySelectorAll('.clr-scroll-region__scroller')]
    .filter((element): element is Element => element !== null && element.closest('dialog') === null)
    .flatMap((element) => [element.scrollTop, element.scrollLeft]))
}

/**
 * Puts the page behind the dialog back where its card was read. Opening a
 * gallery state can scroll it on its own: pressing the scene's "Open …"
 * control briefly shortens the page by 12 px while the card sits at the end
 * of its scroll range, and whether the browser lays out during that dip (and
 * clamps the scroll) depends on frame timing, so the page behind was left at
 * one of two places and the captures' hashes changed between identical runs.
 * The page may still be short when the dialog appears, so the positions are
 * set again until they hold (polled in real time; the page grows back on its
 * own render). A frame is rendered after each try, so the scroll event a move
 * raises (and the 420 ms timer that settles the ScrollRegion's streak) comes
 * before the held clock moves on: the streak has settled by the time the
 * moment is read, rather than staying lit on a clock that no longer moves.
 */
async function holdPageScroll(page: Page, held: readonly number[]) {
  await expect.poll(async () => {
    await page.evaluate((positions) => {
      const scrollers = [document.scrollingElement, ...document.querySelectorAll('.clr-scroll-region__scroller')]
        .filter((element): element is Element => element !== null && element.closest('dialog') === null)
      scrollers.forEach((element, index) => {
        element.scrollTop = positions[index * 2] ?? element.scrollTop
        element.scrollLeft = positions[index * 2 + 1] ?? element.scrollLeft
      })
    }, held)
    await renderFrame(page)
    return pageScroll(page)
  }, { message: 'the page behind the dialog goes back where its card was read', timeout: 10_000 }).toEqual(held)
}

/** The circuit's one card on either side: the card that holds its movement list. */
function circuitCard(scope: Locator): Locator {
  return scope.locator('.clr-card').filter({
    has: scope.page().getByRole('list', { name: 'Movements in this circuit', exact: true }),
  }).first()
}

/** The whole block: `BlockPanel`'s root (the card's nearest `.clr-stack`), which holds the rest timer beside the card. */
const wholeBlock = (card: Locator) =>
  card.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " clr-stack ")][1]')

/**
 * One side, read alike: the card before anything is pressed; the dialog the
 * state's control opens; and, for the circuit round, the block once the
 * dialog's X has closed it. The browser's clock is held between steps and
 * moved exactly, and the page behind the dialog is held where the card was
 * read.
 */
async function drive(page: Page, card: Locator, open: () => Promise<void>, state: State, side: string): Promise<Partial<Record<Moment, Reading>>> {
  const shape = STATES[state]
  const read = async (target: Locator, name: string, behind?: readonly number[]): Promise<Reading> => {
    await expect(target).toBeVisible()
    await target.evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await settle(page)
    if (behind !== undefined) {
      expect(await pageScroll(page), `${name}: the page behind the dialog is held where its card was read`).toEqual(behind)
    }
    return { lines: await linesOf(target), boxes: await boxesOf(target), capture: await keep(target, name) }
  }
  const readings: Partial<Record<Moment, Reading>> = {}
  await settle(page)
  readings.card = await read(card, `${side}-card`)
  const behind = await pageScroll(page)

  // The control is pressed (the round it records, and the rest it starts, are
  // now); both sides then read the same half second later.
  await open()
  await holdPageScroll(page, behind)
  await page.clock.runFor(500)
  const dialog = page.getByRole('dialog', { name: shape.title, exact: true })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(openLog(page)).toHaveCount(1)
  readings.open = await read(openLog(page), `${side}-open`, behind)

  if (state === 'circuit-round') {
    // The X: the dialog closes, the same rest is drawn beside the card again,
    // and focus is on the round clock's control (Start round 2).
    await openLog(page).getByRole('button', { name: 'Close log', exact: true }).click()
    await expect(openLog(page)).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Start round 2', exact: true })).toBeFocused()
    await page.clock.runFor(500)
    // The same rest, drawn once again: beside the card, inside the block's root.
    await expect(wholeBlock(card).getByRole('timer', { name: 'Time remaining', exact: true })).toHaveCount(1)
    await expect(card.getByRole('timer', { name: 'Time remaining', exact: true })).toHaveCount(0)
    await expect(page.getByRole('timer', { name: 'Time remaining', exact: true })).toHaveCount(1)
    readings.closed = await read(wholeBlock(card), `${side}-closed`)
  }
  return readings
}

for (const state of Object.keys(STATES) as State[]) {
  const shape = STATES[state]
  for (const { name, viewport } of VIEWPORTS) {
    test(`TASK-AC-2FA21EDA32B4 ${state} ${name}: /workout’s ${shape.label.toLowerCase()} opens in the same Round 7 dialog as the accepted gallery state, drawn alike`, async ({ page, visit }) => {
      test.setTimeout(240_000)
      await page.setViewportSize(viewport)
      await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
      await page.clock.install({ time: ENTRY })

      // The accepted state: the route's CircuitBlock on the gallery's memory runtime.
      await visit(`/gallery/refinements?state=${state}`)
      const scope = page.locator(`[data-refinement-state="${state}"]`)
      const galleryCard = circuitCard(scope.locator('[data-gallery-scene]'))
      await expect(galleryCard).toBeVisible()
      await page.clock.pauseAt(ENTRY + 60_000)
      const gallery = await drive(page, galleryCard, async () => {
        await scope.getByRole('button', { name: `Open ${shape.label}`, exact: true }).click()
        // The scene's driver presses the controls on its own 40 ms interval:
        // step the held clock tick by tick until it has opened the dialog.
        for (let tick = 0; tick < 100 && await openLog(page).count() === 0; tick += 1) await page.clock.runFor(40)
      }, state, `${state}-${name}-gallery`)
      await page.clock.resume()

      // The real route, over the same block, driven the same way.
      const app = await syntheticApp(page, routeSession())
      await visit('/workout')
      const routeCard = circuitCard(page.locator('main#main'))
      await expect(routeCard).toBeVisible()
      await page.clock.pauseAt(ENTRY + 600_000)
      const route = await drive(page, routeCard, async () => {
        if (state === 'circuit-round') {
          await routeCard.getByRole('button', { name: 'Start round 1', exact: true }).click()
          await page.clock.runFor(ROUND_MS)
          await routeCard.getByRole('button', { name: 'Finish round 1', exact: true }).click()
        } else {
          await routeCard.getByRole('button', { name: 'Rest for goblet squat', exact: true }).click()
        }
      }, state, `${state}-${name}-route`)
      await page.clock.resume()

      const moments = (['card', 'open', 'closed'] as const).filter((moment) => gallery[moment] !== undefined)
      const differences = Object.fromEntries(moments.map((moment) => [moment, compare(gallery[moment]!.lines, route[moment]!.lines, INTENDED)]))
      const layout = Object.fromEntries(moments.map((moment) => [moment,
        compareLayout(gallery[moment]!.boxes, route[moment]!.boxes, LAYOUT_INTENDED)]))
      const part = (boxes: readonly Box[]) => boxes.find((box) => box.key === '(part)#0') ?? null
      writeReceipt(`${state}-${name}`, {
        state, label: shape.label, width: viewport.width, route: '/workout',
        drive: `${shape.drive} — on the browser clock, held between steps; the page behind the dialog held where the card was read`,
        captures: Object.fromEntries(moments.flatMap((moment) => [[`gallery-${moment}`, gallery[moment]!.capture], [`route-${moment}`, route[moment]!.capture]])),
        lines: {
          gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment]!.lines])),
          route: Object.fromEntries(moments.map((moment) => [moment, route[moment]!.lines])),
        },
        differences,
        layout: {
          method: 'element boxes',
          keys: 'tag, clr- classes and words',
          tolerancePx: LAYOUT_TOLERANCE_PX,
          measured: {
            gallery: Object.fromEntries(moments.map((moment) => [moment, gallery[moment]!.boxes.length])),
            route: Object.fromEntries(moments.map((moment) => [moment, route[moment]!.boxes.length])),
          },
          parts: {
            gallery: Object.fromEntries(moments.map((moment) => [moment, part(gallery[moment]!.boxes)])),
            route: Object.fromEntries(moments.map((moment) => [moment, part(route[moment]!.boxes)])),
          },
          differences: layout,
        },
      })

      // What this task wires, on both sides: the dialog's title; for the
      // circuit round, the round time read back, the rest drawn once (in the
      // dialog, then beside the card again) and Take back this round.
      for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) {
        expect(reading.open!.lines[0], `${side} open title @${name}`).toMatch(new RegExp(`^${shape.title}$`, 'i'))
        if (state === 'circuit-round') {
          // Read as drawn (some labels are set in capitals), compared without case.
          const open = reading.open!.lines.map((line) => line.toLowerCase())
          const closed = reading.closed!.lines.map((line) => line.toLowerCase())
          expect(open, `${side} round time @${name}`).toContain('00:32 round time recorded')
          expect(open.join(' '), `${side} rest in the dialog @${name}`).toContain('00:45')
          expect(open, `${side} Take back this round @${name}`).toContain('take back this round')
          expect(closed, `${side} the round recorded @${name}`).toContain('1 of 3 rounds recorded')
          expect(closed.join(' '), `${side} rest back beside the card @${name}`).toContain('00:44')
        }
      }
      for (const moment of moments) expectAllIntended(differences[moment], `${state} ${moment} @${name}`)
      for (const moment of moments) expectLayoutIntended(layout[moment], `${state} ${moment} layout @${name}`)
      app.assertContained()
    })
  }
}
