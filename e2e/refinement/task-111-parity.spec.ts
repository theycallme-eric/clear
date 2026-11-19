import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { workoutSessionRowSchema } from '../../src/state/schemas'
import { makeSessionRow } from '../../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-111 look check (TASK-AC-75169419438B): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 * The routes this task wires are the two F9 dialogs (owner decision 3):
 *
 *   · /summary's Debrief card, whose "Log workout feedback" opens Round 7's
 *     "Workout feedback" LoggingOverlay — the gallery's `workout-feedback`
 *     state draws the same card, opener and dialog over the same shared
 *     owners (FeelingRow, Input, Button, LoggingOverlay);
 *   · Home's rest day, whose "Mark Rest Day" opens Round 7's "Log rest day"
 *     LoggingOverlay — the gallery's `rest-day` state draws the same control
 *     and dialog (Select, ActionGroup, ActionGlow, Button, LoggingOverlay).
 *
 * Matched data: the gallery's states start with no feeling, no notes and no
 * rest day marked; the route's synthetic account has one completed session
 * (yesterday, no mood, no notes) and no rest day marked, so today keeps its
 * rest-day affordance and /summary has that session to debrief.
 *
 * Both sides are read alike on the browser's own clock, held still between
 * steps:
 *
 *   · `card`: the opener before anything is opened — the Debrief card, and
 *     the rest-day control's own stack (its trigger group);
 *   · `open`: the dialog the opener opens;
 *   · `reopened`: the same dialog after an entry is made, the dialog is closed
 *     by its X and opened again — workout feedback's draft is still there
 *     (TASK-AC-49B5381CB1E9), and the rest day's X keeps Cancel's meaning
 *     (the reason is back at the saved one).
 *
 * Home draws its rest-day control as the ruled "Rest day" sub-group of its
 * This week card (Home's own hierarchy: a card never holds a card), where the
 * gallery scene draws the same control in a card of its own. The two
 * surroundings are captured and their words compared (`context`), and that
 * frame difference is labelled with its criterion; the control and the
 * dialog are compared box by box.
 *
 * The page behind an open dialog shows through its backdrop, so it is held
 * where the card was read (`holdPageScroll`); an open dialog's X is painted
 * afresh just before it is captured (`repaint`); and a part is captured once
 * it holds still (`steadyScreenshot`): every capture of the same code is then
 * the same image, run after run (TASK-106's method).
 *
 * Every visible word of each moment is read from both sides, and so is the
 * layout: every rendered element's box is measured and compared with its
 * counterpart within `LAYOUT_TOLERANCE_PX`. A difference no criterion intends
 * fails the case; an intended one is labelled with its criterion ID. Each
 * case writes its receipt to `evidence/refinement/task-111/parity/` and its
 * captures into this body's folder of the Runner's evidence store (outside
 * Git), recording each capture's SHA-256 in the receipt. Synthetic and
 * contained: nothing is saved, so nothing is written.
 */
const OWNER = '00000000-0000-4000-8000-000000011101'
const PLACE = '00000000-0000-4000-8000-000000011102'
const COMPLETED = '00000000-0000-4000-8000-000000011103'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-111', 'parity')
/** The browser's clock at the start of each case (a Thursday, UTC). */
const ENTRY = Date.parse('2026-11-19T09:00:00.000Z')
/** Yesterday's completed session, so today is unmarked and untrained. */
const YESTERDAY = '2026-11-18'
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
    if (code !== null) throw new Error(`Synthetic TASK-111 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-111 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-111.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-111-public-placeholder',
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
// The two states and their routes
// ─────────────────────────────────────────────────────────────────────────────

type State = 'workout-feedback' | 'rest-day'

interface StateShape {
  /** The gallery state's own title (`LOGGING_CONTEXTS`): its "Open …" button. */
  readonly label: string
  /** The route this task wires, and what it is called in the case's name. */
  readonly route: '/summary' | '/'
  readonly routeName: string
  /** The opener, by its accessible name, and the dialog it opens. */
  readonly control: string
  readonly title: string
}

const STATES: Readonly<Record<State, StateShape>> = {
  'workout-feedback': {
    label: 'Workout feedback', route: '/summary', routeName: '/summary’s Log workout feedback',
    control: 'Log workout feedback', title: 'Workout feedback',
  },
  'rest-day': {
    label: 'Rest day / reason change', route: '/', routeName: 'Home’s Mark Rest Day',
    control: 'Mark Rest Day', title: 'Log rest day',
  },
}

/** The contained synthetic account: one completed session yesterday, no rest day marked. */
async function syntheticApp(page: Page) {
  const unexpected: string[] = []
  const writes: string[] = []
  const completed = workoutSessionRowSchema.parse(makeSessionRow({
    id: COMPLETED, user_id: OWNER, location_id: PLACE, date: YESTERDAY,
    title: 'Lower-body strength', mood: null, session_notes: null,
    started_at: `${YESTERDAY}T17:00:00.000Z`, completed_at: `${YESTERDAY}T17:42:00.000Z`,
  }))
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
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'workout_sessions') return reply([completed])
      // No rest day marked, no favorites, nothing else on record.
      return reply([])
    }
    if (method === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_as_performed') return reply(null)
      if (name === 'streak_sessions') {
        return reply([{ session_id: completed.id, completed_at: completed.completed_at, counts_for_streak: true }])
      }
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) return reply([])
    }
    // The look check saves nothing: any write is recorded and refused.
    writes.push(`${method} ${url.pathname}`)
    unexpected.push(`${method} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-111 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-111-session', refreshToken: 'synthetic-task-111-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-111@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    writes,
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
      expect(writes, 'The look check writes nothing').toEqual([])
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
    const dir = join(store.dir, CAPTURE_BODY, 'task-111', 'captures')
    return { dir, identity: `store:${CAPTURE_BODY}/task-111/captures` }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-111-parity')
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
 * Paints the open dialog's X afresh before the dialog is captured (TASK-106's
 * finding: the browser can keep the X's chamfer as first recorded while the
 * dialog's arrival settled, one edge pixel two ways in identical runs).
 * Hiding the X for one rendered frame drops its recorded paint; shown again,
 * it is recorded from the settled dialog. Only the X is hidden, and focus
 * goes back where it was. Words and boxes are read before this.
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
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-111-parity/v1', task: 'TASK-111', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
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
 * is named `h` whatever its level: the level follows the host page's outline,
 * not the layout. Elements not drawn (`display: none`, hidden, or no box at
 * all) are left out, and so is a modal dialog the part holds (measured as its
 * own part), and Foundation's focus-bracket layer, which is decoration that
 * follows whatever has focus.
 */
async function boxesOf(target: Locator): Promise<Box[]> {
  return target.evaluate((root) => {
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
 * Words and boxes a criterion intends. The route draws the same shared owners
 * from the same (empty) answers, so none is expected in the parts compared;
 * the tables stay explicit so a future one is labelled rather than waved
 * through.
 */
const TEXT_INTENDED: readonly Intended[] = []
const LAYOUT_INTENDED: readonly IntendedLayout[] = []

/**
 * The one difference this check knows of, outside the parts compared box by
 * box: the rest-day control's surroundings (see the file's note).
 */
const REST_DAY_FRAME = {
  criterion: 'TASK-AC-579280C10CDC',
  reason: 'Home’s rest day is wired in place: Home draws the control as the ruled “Rest day” sub-group of its This week card (Home’s existing hierarchy, REQ-018/REQ-009: a card never holds another card), while the gallery scene, which has no week card, draws the same control in a card of its own. The control’s own stack and the dialog are compared box by box; the surroundings by their words.',
} as const

type Moment = 'card' | 'open' | 'reopened'
interface Reading {
  readonly lines: string[]
  readonly boxes: Box[]
  readonly capture: { file: string; sha256: string }
  /** The control holding focus when a dialog moment is read, by its name. */
  readonly focus: string | null
}

/**
 * Where an open dialog's focus is drawn is visible (the focused control's
 * frame), and boxes do not show it, so it is read and compared too. The rest
 * day's opening focus is on its native Reason picker (U25, kept: "opening
 * moves focus to the native picker"; TASK-045 and TASK-019 assert it), where
 * the gallery's composed state opens on the X, as the shared overlay does
 * when nothing else takes focus.
 */
const FOCUS_INTENDED: Readonly<Record<State, { readonly gallery: string; readonly route: string; readonly criterion: string; readonly reason: string } | null>> = {
  'workout-feedback': null,
  'rest-day': {
    gallery: 'Close log', route: 'Reason', criterion: 'AC-GAL-05',
    reason: 'The rest day keeps its own keyboard state: opening moves focus to its native Reason picker (U25, carried; the route’s own focus rule), where the gallery’s composed state, which has no such rule, opens on the X. The picker’s frame is drawn focused on the route.',
  },
}

/** The name of the control holding focus inside an open dialog, if any. */
async function focusOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || active.closest('dialog[open]') === null) return null
    const labelled = active.getAttribute('aria-label')
    if (labelled !== null) return labelled
    const labels = (active as HTMLInputElement).labels
    if (labels !== undefined && labels !== null && labels.length > 0) return labels[0].textContent?.trim() ?? null
    return active.textContent?.replace(/\s+/g, ' ').trim() ?? null
  })
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
 * Puts the page behind the dialog back where its card was read, polled until
 * it holds, with a frame rendered after each try so any scroll event (and the
 * ScrollRegion's streak timer it starts) comes before the held clock moves on
 * (TASK-106's method).
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

interface Side {
  /** The opener's part, read as `card`. */
  readonly card: Locator
  /** The rest-day control's surroundings, read as `context` (words and capture). */
  readonly context?: Locator
  /** The opener itself. */
  readonly opener: Locator
  /** Presses the opener the first time (the gallery's driver does it there). */
  readonly open: () => Promise<void>
  /**
   * The route's opener is pressed as a person presses it, so focus is back on
   * it once the X has closed the dialog. The gallery's driver presses its
   * opener without focusing it, so there focus goes back to the state's own
   * "Open …" control instead (the gallery's harness, not a look).
   */
  readonly focusReturns: boolean
}

/**
 * One side, read alike: the opener before anything opens; the dialog it
 * opens; and the same dialog reopened after an entry and its X. The browser's
 * clock is held between steps and moved exactly, and the page behind the
 * dialog is held where the card was read.
 */
async function drive(page: Page, side: Side, state: State, name: string): Promise<{ readings: Record<Moment, Reading>; context: Reading | null }> {
  const shape = STATES[state]
  const read = async (target: Locator, label: string, behind?: readonly number[]): Promise<Reading> => {
    await expect(target).toBeVisible()
    if (behind === undefined) await target.evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await settle(page)
    if (behind !== undefined) {
      expect(await pageScroll(page), `${label}: the page behind the dialog is held where its card was read`).toEqual(behind)
    }
    const focus = behind === undefined ? null : await focusOf(page)
    return { lines: await linesOf(target), boxes: await boxesOf(target), capture: await keep(target, label), focus }
  }
  await settle(page)
  const context = side.context === undefined ? null : await read(side.context, `${name}-context`)
  const card = await read(side.card, `${name}-card`)
  const behind = await pageScroll(page)

  await side.open()
  await holdPageScroll(page, behind)
  await page.clock.runFor(500)
  const dialog = page.getByRole('dialog', { name: shape.title, exact: true })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(openLog(page)).toHaveCount(1)
  const open = await read(openLog(page), `${name}-open`, behind)

  // An entry, the X, and the opener again.
  if (state === 'workout-feedback') {
    await openLog(page).getByRole('radio', { name: '2, Worn' }).click()
    await openLog(page).getByRole('textbox', { name: /Notes · optional/ }).fill('Long day.')
  } else {
    await openLog(page).getByRole('combobox', { name: 'Reason' }).selectOption('injury')
  }
  await openLog(page).getByRole('button', { name: 'Close log', exact: true }).click()
  await page.clock.runFor(500)
  await expect(openLog(page)).toHaveCount(0)
  if (side.focusReturns) await expect(side.opener).toBeFocused()
  await holdPageScroll(page, behind)
  await side.opener.click()
  await holdPageScroll(page, behind)
  await page.clock.runFor(500)
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  if (state === 'workout-feedback') {
    // The draft survives the X and the reopen (TASK-AC-49B5381CB1E9).
    await expect(openLog(page).getByRole('radio', { name: '2, Worn' })).toBeChecked()
    await expect(openLog(page).getByRole('textbox', { name: /Notes · optional/ })).toHaveValue('Long day.')
  } else {
    // The X is Cancel: the reason is back at the saved one.
    await expect(openLog(page).getByRole('combobox', { name: 'Reason' })).toHaveValue('rest')
  }
  const reopened = await read(openLog(page), `${name}-reopened`, behind)
  return { readings: { card, open, reopened }, context }
}

const MOMENTS = ['card', 'open', 'reopened'] as const

for (const state of Object.keys(STATES) as State[]) {
  const shape = STATES[state]
  for (const { name, viewport } of VIEWPORTS) {
    test(`TASK-AC-75169419438B ${state} ${name}: ${shape.routeName} opens ${shape.title} in the same Round 7 dialog as the accepted gallery state, drawn alike, and reopens it as the gallery does`, async ({ page, visit }) => {
      test.setTimeout(240_000)
      await page.setViewportSize(viewport)
      await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
      await page.clock.install({ time: ENTRY })

      // The accepted state: the shared owners on the gallery's memory runtime.
      await visit(`/gallery/refinements?state=${state}`)
      const scope = page.locator(`[data-refinement-state="${state}"]`)
      const scene = scope.locator('[data-gallery-scene]')
      const galleryCard = scene.locator('.clr-card').first()
      await expect(galleryCard).toBeVisible()
      await page.clock.pauseAt(ENTRY + 60_000)
      const galleryOpener = scene.getByRole('button', { name: shape.control, exact: true })
      const gallery = await drive(page, {
        context: state === 'rest-day' ? galleryCard : undefined,
        card: state === 'rest-day' ? galleryCard.locator('.clr-stack:has(> .clr-action-group)').first() : galleryCard,
        opener: galleryOpener,
        focusReturns: false,
        open: async () => {
          await scope.getByRole('button', { name: `Open ${shape.label}`, exact: true }).click()
          // The scene's driver presses the opener on its own 40 ms interval:
          // step the held clock tick by tick until it has.
          for (let tick = 0; tick < 100 && await openLog(page).count() === 0; tick += 1) await page.clock.runFor(40)
        },
      }, state, `${state}-${name}-gallery`)
      await page.clock.resume()

      // The real route, over matched data, driven the same way.
      const app = await syntheticApp(page)
      await visit(shape.route)
      let routeSide: Side
      if (state === 'workout-feedback') {
        const card = page.locator('main#main .clr-card').filter({
          has: page.getByRole('heading', { name: 'Debrief', exact: true }),
        }).first()
        await expect(card).toBeVisible()
        const opener = card.getByRole('button', { name: shape.control, exact: true })
        routeSide = { card, opener, open: () => opener.click(), focusReturns: true }
      } else {
        const region = page.getByRole('region', { name: 'Rest day', exact: true })
        await expect(region).toBeVisible()
        const opener = region.getByRole('button', { name: shape.control, exact: true })
        routeSide = {
          card: region.locator('.clr-stack:has(> .clr-action-group)').first(),
          context: region, opener, open: () => opener.click(), focusReturns: true,
        }
      }
      await page.clock.pauseAt(ENTRY + 600_000)
      const route = await drive(page, routeSide, state, `${state}-${name}-route`)
      await page.clock.resume()

      const differences = Object.fromEntries(MOMENTS.map((moment) => [moment,
        compare(gallery.readings[moment].lines, route.readings[moment].lines, TEXT_INTENDED)]))
      const layout = Object.fromEntries(MOMENTS.map((moment) => [moment,
        compareLayout(gallery.readings[moment].boxes, route.readings[moment].boxes, LAYOUT_INTENDED)]))
      const contextDifferences = gallery.context !== null && route.context !== null
        ? compare(gallery.context.lines, route.context.lines, TEXT_INTENDED) : []
      const part = (boxes: readonly Box[]) => boxes.find((box) => box.key === '(part)#0') ?? null
      const focusIntended = FOCUS_INTENDED[state]
      const focus = Object.fromEntries((['open', 'reopened'] as const).map((moment) => {
        const sides = { gallery: gallery.readings[moment].focus, route: route.readings[moment].focus }
        const same = sides.gallery === sides.route
        const intended = !same && focusIntended !== null && sides.gallery === focusIntended.gallery && sides.route === focusIntended.route
        return [moment, { ...sides, criterion: same ? null : intended ? focusIntended.criterion : null, reason: same ? null : intended ? focusIntended.reason : null, same }]
      }))
      writeReceipt(`${state}-${name}`, {
        state, label: shape.label, width: viewport.width, route: shape.route,
        drive: `card; ${shape.control} → ${shape.title}; ${state === 'workout-feedback' ? 'feeling 2 and “Long day.”' : 'Reason Injured'}, Close log, ${shape.control} → ${shape.title} again — on the browser clock, held between steps; the page behind the dialog held where the card was read`,
        parts: {
          card: state === 'rest-day' ? 'the rest-day control’s own stack (its trigger group), on both sides' : 'the Debrief card, on both sides',
          context: state === 'rest-day' ? 'gallery: the scene’s card; route: Home’s “Rest day” region' : null,
          open: 'the open dialog', reopened: 'the open dialog, after an entry, its X and the opener again',
        },
        captures: {
          ...(gallery.context !== null && route.context !== null
            ? { 'gallery-context': gallery.context.capture, 'route-context': route.context.capture } : {}),
          ...Object.fromEntries(MOMENTS.flatMap((moment) => [[`gallery-${moment}`, gallery.readings[moment].capture], [`route-${moment}`, route.readings[moment].capture]])),
        },
        lines: {
          gallery: { ...(gallery.context === null ? {} : { context: gallery.context.lines }), ...Object.fromEntries(MOMENTS.map((moment) => [moment, gallery.readings[moment].lines])) },
          route: { ...(route.context === null ? {} : { context: route.context.lines }), ...Object.fromEntries(MOMENTS.map((moment) => [moment, route.readings[moment].lines])) },
        },
        differences: { ...(state === 'rest-day' ? { context: contextDifferences } : {}), ...differences },
        focus,
        frame: state === 'rest-day'
          ? { gallery: 'a card of its own (.clr-card)', route: 'the ruled “Rest day” sub-group of This week (.clr-stack--tight)', ...REST_DAY_FRAME }
          : null,
        layout: {
          method: 'element boxes',
          keys: 'tag, clr- classes and words',
          tolerancePx: LAYOUT_TOLERANCE_PX,
          measured: {
            gallery: Object.fromEntries(MOMENTS.map((moment) => [moment, gallery.readings[moment].boxes.length])),
            route: Object.fromEntries(MOMENTS.map((moment) => [moment, route.readings[moment].boxes.length])),
          },
          parts: {
            gallery: Object.fromEntries(MOMENTS.map((moment) => [moment, part(gallery.readings[moment].boxes)])),
            route: Object.fromEntries(MOMENTS.map((moment) => [moment, part(route.readings[moment].boxes)])),
          },
          differences: layout,
        },
      })

      // The dialog this task wires, on both sides: its title first, each time.
      for (const [side, reading] of [['gallery', gallery], ['route', route]] as const) {
        for (const moment of ['open', 'reopened'] as const) {
          expect(reading.readings[moment].lines[0], `${side} ${moment} title @${name}`).toMatch(new RegExp(`^${shape.title}$`, 'i'))
        }
      }
      expectAllIntended(contextDifferences, `${state} context @${name}`)
      for (const [moment, reading] of Object.entries(focus)) {
        expect(reading.same || reading.criterion !== null, `${state} ${moment} focus @${name}: ${JSON.stringify(reading)}`).toBe(true)
      }
      for (const moment of MOMENTS) expectAllIntended(differences[moment], `${state} ${moment} @${name}`)
      for (const moment of MOMENTS) expectLayoutIntended(layout[moment], `${state} ${moment} layout @${name}`)
      app.assertContained()
    })
  }
}
