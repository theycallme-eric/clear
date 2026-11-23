import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import { timerFramesAcceptance, timerFramesSnapshot } from '../../src/test/timer-frames-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-007 (REQ-007; C19, C20, C21; G06; R15, R17, R42, R49, R53, R67, R96,
 * R102, R103, R119; JOURNEY-007) — whole timer frames, the one-row workout
 * header and independent functional clocks on the real `/workout` route and
 * its open logging sheet.
 *
 * Entry (ENTRY-007): a running session, behind the existing auth guard, on its
 * Warm-up — a timed hold with a prescribed rest, the session clock in the
 * header — whose main section holds a lift, a circuit with a timed station and
 * every format clock (`src/test/timer-frames-fixture.ts`). Action: start and
 * pause the hold and a section clock, and open a log while the rest is
 * running, by touch and by keyboard. Result, read from the browser at phone
 * widths: every clock is one complete frame filling its place with centred
 * digits — no short inner chamfer inside an empty wider frame (C19,
 * AC-R007-01); the Workout title, the centred session readout and the menu
 * frame share one row at the menu's height (C20, AC-R007-02); and each clock
 * keeps its own reading and its existing pause and cap arithmetic while the
 * log opens, minimises and reopens (C21, AC-R007-03).
 *
 * Comparable reference: the accepted gallery bec4454's `?state=cards` and
 * `?state=urgency`, whose clocks are the route's own TimerFrame consumers.
 *
 * A3 TASK-108 carries the build's cases onto Round 7's owners: every clock is
 * one whole TimerFrame (`src/ui/workout-chrome.tsx`) — beside a card, the
 * app's Card in the timer role (one bar, one body, its readout centred);
 * inside a card, that card's element frame — the session's rest is Round 7's
 * one timer-role card (`CountdownBar`), and the header keeps TASK-007's
 * one-row rules (`src/ui/workout-navigation.css`). Each case keeps the build's
 * asserted behaviour (evidence/refinement/task-108/test-ledger.json).
 *
 * Synthetic and contained: an intercepted session for a fictional user. The
 * browser clock is Playwright's, so readings are exact. Nothing is written:
 * Rest opens the log and starts the rest without logging a set, and no block
 * result or session call is made.
 */
const OWNER = '00000000-0000-4000-8000-000000000701'
const PLACE = '00000000-0000-4000-8000-000000000711'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The browser's clock at entry; the session has run for one minute. */
const ENTRY = Date.parse('2026-11-09T09:00:00.000Z')

const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')

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

/** Ready only when the server answering is this checkout's own. */
async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic TASK-007 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-007 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-007.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-007-public-placeholder',
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

type Viewport = { width: number; height: number }
/** The approved mobile scope: the narrow phone and the project's own phone. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
]

const TOLERANCE = 1

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

async function syntheticApp(page: Page, options: { reducedMotion?: boolean } = {}) {
  const acceptance = timerFramesAcceptance({ locationId: PLACE })
  const running: SessionSnapshot = sessionSnapshotSchema.parse(timerFramesSnapshot(acceptance, {
    userId: OWNER,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  }))
  const writes: string[] = []
  const unexpected: string[] = []
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: options.reducedMotion ?? false })
  await page.clock.install({ time: ENTRY })

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
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      // Every other read is an empty answer: no history, notes, anchors or favorites.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') return reply(null)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    // Anything else is a write this journey must never make.
    writes.push(`${request.method()} ${url.pathname}`)
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-007 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-007-session', refreshToken: 'synthetic-task-007-refresh',
      // A day: the header case jumps the session past an hour.
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-007@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'No set, block result or session call is written').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** Layout flushed and fonts loaded, so geometry is read from the final type. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
  })
}

/** JOURNEY-007's entry: the running session's `/workout`, on its Warm-up. */
async function openWorkout(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByRole('region', { name: 'plank countdown' })).toBeVisible()
  await settle(page)
}

/** Holds the browser's clock still one minute after entry: the session reads 02:00. */
async function hold(page: Page) {
  await page.clock.pauseAt(ENTRY + 60_000)
}

/** Time passes on the browser's own clock, and its interval repaints run. */
async function pass(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1000)
}

/** A long stretch jumped rather than ticked through; the page re-reads its clocks. */
async function jump(page: Page, seconds: number) {
  await page.clock.fastForward(seconds * 1000)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

/** A touch on a control, brought to the middle of its scroller first. */
async function tap(control: Locator) {
  await control.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await control.tap()
}

/** Enter on a focused control: the keyboard's way through the journey. */
async function press(page: Page, control: Locator) {
  await control.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await control.focus()
  await page.keyboard.press('Enter')
}

function holdRegion(page: Page): Locator {
  return page.getByRole('region', { name: 'plank countdown' })
}

/** The preparation hold's card: the one holding its countdown. */
function holdCard(page: Page): Locator {
  return page.locator('.clr-card').filter({ has: holdRegion(page) })
}

/** A block's card, by the list its work is named in (Round 7's lists name the block). */
function blockCard(page: Page, list: string): Locator {
  return page.locator('.clr-card').filter({ has: page.getByRole('list', { name: list, exact: true }) })
}

function reading(text: string | null): string {
  return /\d{1,2}:\d{2}(?::\d{2})?/.exec(text ?? '')?.[0] ?? ''
}

async function readingOf(timer: Locator): Promise<string> {
  return reading(await timer.textContent())
}

function sessionClock(page: Page): Locator {
  return page.getByRole('timer', { name: 'Session time' })
}

function countdown(page: Page): Locator {
  return holdRegion(page).getByRole('timer', { name: 'Countdown' })
}

function restTimer(page: Page): Locator {
  return page.getByRole('region', { name: 'Rest' }).getByRole('timer', { name: 'Time remaining' })
}

/** The jump list: Previous and the jump list save nothing (REQ-013). */
async function jumpToMain(page: Page, mode: 'touch' | 'keyboard' = 'touch') {
  const act = mode === 'touch' ? tap : (control: Locator) => press(page, control)
  await act(page.getByRole('button', { name: 'All sections' }))
  await act(page.getByRole('button', { name: /^Accessory, / }))
  // Round 7's ladders name their grid `Prescribed ladder rounds`.
  await expect(page.getByRole('list', { name: 'Prescribed ladder rounds' })).toHaveCount(2)
  await settle(page)
}

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number }

/**
 * How a clock is framed on Round 7: inside a card, that card's element frame
 * (the timer is the chamfer); beside a card, its own timer-role card (one bar,
 * one body) with the readout centred in it; or the rest's timer-role card,
 * whose readout sits beside its label on the card's row.
 */
type FrameKind = 'element' | 'card' | 'rest'

interface FrameGeometry {
  label: string
  kind: FrameKind
  /** The whole frame: the element frame, or the timer's card. */
  frame: Box
  /** Its body: the chamfered element, or the card's body. */
  body: Box
  /** What the readout draws: its caption and its digits. */
  readout: Box
  digits: Box
  /** The content box of the place the frame sits in. */
  place: Box
  /** Chamfers or cards inside the readout. */
  nestedFrames: number
  /** Cards around the frame's own (a frame inside a frame). */
  outerCards: number
  /** The frame's own accent bars. */
  bars: number
  /** The timer role on the body, low or not. */
  timerRole: boolean
}

/** Every visible timer frame on the page, measured against the place it sits in. */
async function readFrames(page: Page): Promise<FrameGeometry[]> {
  return page.evaluate(() => {
    const box = (rect: DOMRect) => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height })
    const content = (place: HTMLElement) => {
      const style = getComputedStyle(place)
      const outer = place.getBoundingClientRect()
      const left = outer.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
      const right = outer.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
      return { top: outer.top, bottom: outer.bottom, left, right, width: right - left, height: outer.height }
    }
    const placeOf = (node: HTMLElement) => {
      let place = node.parentElement as HTMLElement
      while (place.classList.contains('clr-echo') || place.classList.contains('clr-bleed')) place = place.parentElement as HTMLElement
      return place
    }
    return [...document.querySelectorAll<HTMLElement>('[role="timer"]')]
      .filter((timer) => timer.getClientRects().length > 0)
      .map((timer) => {
        const element = timer.classList.contains('clr-chamfer')
        const rest = timer.closest('.clr-rest-bar') !== null
        const kind = element ? 'element' : rest ? 'rest' : 'card'
        const card = element ? null : timer.closest<HTMLElement>('.clr-card')!
        const frame = element ? timer : card!
        const body = element ? timer : (timer.closest<HTMLElement>('.clr-card__body') as HTMLElement)
        const outermost = element ? (timer.parentElement as HTMLElement) : (timer.closest<HTMLElement>('.clr-timer-frame, .clr-rest-bar') ?? card!)
        const parts = [...timer.children].filter((child) => !child.classList.contains('a11y-hidden'))
        const rects = parts.map((part) => part.getBoundingClientRect())
        const readout = {
          top: Math.min(...rects.map((rect) => rect.top)), bottom: Math.max(...rects.map((rect) => rect.bottom)),
          left: Math.min(...rects.map((rect) => rect.left)), right: Math.max(...rects.map((rect) => rect.right)),
          width: 0, height: 0,
        }
        readout.width = readout.right - readout.left
        readout.height = readout.bottom - readout.top
        const digits = parts.find((child) => child.querySelector('.clr-tumble') !== null) as HTMLElement
        let outerCards = 0
        for (let node = frame.parentElement?.closest('.clr-card') ?? null; node !== null; node = node.parentElement?.closest('.clr-card') ?? null) outerCards += 1
        return {
          label: timer.getAttribute('aria-label') ?? '',
          kind,
          frame: box(frame.getBoundingClientRect()),
          body: box(body.getBoundingClientRect()),
          readout,
          digits: box(digits.getBoundingClientRect()),
          place: content(placeOf(outermost)),
          nestedFrames: timer.querySelectorAll('.clr-chamfer, .clr-card').length,
          outerCards: element ? 0 : outerCards,
          bars: element ? frame.parentElement!.querySelectorAll(':scope > .clr-card__bar').length : card!.querySelectorAll(':scope > .clr-card__bar').length,
          timerRole: body.classList.contains('clr-chamfer--timer') || body.classList.contains('clr-chamfer--timer-low'),
        } satisfies Record<string, unknown>
      })
  }) as Promise<FrameGeometry[]>
}

function centre(b: Box) {
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
}

function expectCentredDigits(digits: Box, body: Box, label: string) {
  expect(Math.abs(centre(digits).x - centre(body).x), `${label}: digits centred across`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(centre(digits).y - centre(body).y), `${label}: digits centred down`).toBeLessThanOrEqual(TOLERANCE)
  expect(digits.width, `${label}: digits inside the body`).toBeLessThanOrEqual(body.width)
}

/**
 * C19 / AC-R007-01: one complete frame filling the available width, its
 * readout centred in its body both ways; never a short inner chamfer in an
 * empty wider frame, never a frame inside a frame. On Round 7 that is the
 * clock's TimerFrame: its own timer-role card (one bar) beside a card, or the
 * card's element frame (no bar of its own) inside one. The rest is its one
 * timer-role card, its readout beside its label on the card's row.
 */
function expectWholeBodyFrame(frame: FrameGeometry, label: string) {
  expect(frame.timerRole, `${label}: the timer role`).toBe(true)
  expect(frame.nestedFrames, `${label}: no second chamfer or card inside`).toBe(0)
  expect(frame.outerCards, `${label}: no frame around its card`).toBe(0)
  expect(frame.bars, `${label}: ${frame.kind === 'element' ? 'no bar of its own' : 'one bar'}`).toBe(frame.kind === 'element' ? 0 : 1)
  expect(Math.abs(frame.frame.left - frame.place.left), `${label}: starts at its place's start`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(frame.frame.right - frame.place.right), `${label}: ends at its place's end`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(frame.body.height - frame.frame.height), `${label}: one frame, not a frame in a frame`).toBeLessThanOrEqual(TOLERANCE)
  expect(frame.readout.width, `${label}: the readout inside the body`).toBeLessThanOrEqual(frame.body.width)
  if (frame.kind === 'rest') return
  expectCentredDigits(frame.readout, frame.body, label)
}

interface HeaderGeometry {
  header: Box
  title: Box
  frame: Box
  body: Box
  digits: Box
  menu: Box
  rows: number
  overflowing: boolean
}

async function readHeader(page: Page, scope = 'header.clr-workout-header'): Promise<HeaderGeometry[]> {
  return page.evaluate((selector) => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
    }
    return [...document.querySelectorAll<HTMLElement>(selector)].map((header) => {
      const title = header.querySelector('.clr-screen__title')!
      // Round 7: the session clock is its own timer-role card; its body is the readout's frame.
      const timer = header.querySelector<HTMLElement>('[role="timer"]')!.closest<HTMLElement>('.clr-card__body')!
      const card = timer.closest<HTMLElement>('.clr-card')!
      const digits = [...header.querySelector<HTMLElement>('[role="timer"]')!.children].find((child) => child.querySelector('.clr-tumble') !== null)!
      const menu = header.querySelector('button[aria-label="Actions"]')!
      const parts = [title, timer, menu].map((node) => node.getBoundingClientRect())
      const centres = parts.map((rect) => rect.top + rect.height / 2)
      // One row: every part's vertical centre within a pixel of the others'.
      const rows = Math.max(...centres) - Math.min(...centres) <= 1 ? 1 : 2
      return {
        header: box(header),
        title: box(title),
        frame: box(card),
        body: box(timer),
        digits: box(digits),
        menu: box(menu),
        rows,
        // The visible parts — title, readout frame, menu frame — inside the
        // header's box. (Not scrollWidth: a coarse pointer's enlarged hit area
        // around the menu is invisible and may reach past an unpadded header.)
        overflowing: [title, card, menu].some((node) => {
          const rect = node.getBoundingClientRect()
          const outer = header.getBoundingClientRect()
          return rect.left < outer.left - 1 || rect.right > outer.right + 1
        }),
      }
    })
  }, scope)
}

/**
 * C20 / AC-R007-02: the Workout title, the centred session readout and the
 * menu frame share the accepted single row: the readout is one frame of the
 * menu's height, all three are centred on one line, the readout sits between
 * the title and the menu, and it is not stretched across the header.
 */
function expectOneRowHeader(geometry: HeaderGeometry, label: string) {
  const middle = (b: Box) => b.top + b.height / 2
  expect(geometry.rows, `${label}: one row`).toBe(1)
  expect(Math.abs(geometry.body.height - geometry.menu.height), `${label}: readout and menu share a height`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(geometry.frame.height - geometry.body.height), `${label}: one frame`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(middle(geometry.body) - middle(geometry.menu)), `${label}: readout and menu on one line`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(middle(geometry.title) - middle(geometry.body)), `${label}: title on the same line`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(geometry.body.top - geometry.menu.top), `${label}: tops aligned`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(geometry.body.bottom - geometry.menu.bottom), `${label}: bottoms aligned`).toBeLessThanOrEqual(TOLERANCE)
  expect(geometry.title.right, `${label}: title before the readout`).toBeLessThanOrEqual(geometry.frame.left + TOLERANCE)
  expect(geometry.frame.right, `${label}: readout before the menu`).toBeLessThanOrEqual(geometry.menu.left + TOLERANCE)
  expect(geometry.frame.width, `${label}: not stretched across the header`).toBeLessThan(geometry.header.width / 2)
  expect(geometry.overflowing, `${label}: nothing spills out`).toBe(false)
  expectCentredDigits(geometry.digits, geometry.body, label)
}

async function attach(page: Page, name: string, target?: Locator) {
  await settle(page)
  // A digit's tumble is finished rather than caught mid-flight.
  const body = target === undefined
    ? await page.screenshot({ caret: 'hide', animations: 'disabled' })
    : await target.screenshot({ caret: 'hide', animations: 'disabled' })
  await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
}

/** The open section's clocks in one taller viewport at the same width; restored after. */
async function attachSection(page: Page, name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 6000 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await attach(page, name)
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

/**
 * axe over the journey's screen after an interaction: every rule on every node,
 * with one pre-existing finding held to exactly itself — the read-only ladder
 * rung row's `scrollable-region-focusable` (TASK-006's note: the row is
 * TASK-012/TASK-013's), which a later scan of a page with a ladder reports.
 */
async function checkJourneyA11y(page: Page) {
  const rest = await new AxeBuilder({ page }).disableRules(['scrollable-region-focusable']).analyze()
  expect(rest.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target.join(' ')) }))).toEqual([])
  const scroll = await new AxeBuilder({ page }).withRules(['scrollable-region-focusable']).analyze()
  const flagged = scroll.violations.flatMap((violation) => violation.nodes.map((node) => node.target.join(' ')))
  expect(flagged.every((target) => target === '.clr-rail__scroller'), JSON.stringify(flagged)).toBe(true)
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-007 whole timer frames and independent functional clocks', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-007 ${name}: the Workout title, the centred session readout and the menu frame share one row at the menu's height, past an hour too`, async ({ page, visit }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page, { reducedMotion: true })
      await openWorkout(page, visit)
      await hold(page)
      await settle(page)

      const [entry] = await readHeader(page)
      expectOneRowHeader(entry, `header @${name}`)
      expect(await readingOf(sessionClock(page))).toBe('02:00')
      await attach(page, `header-${name}`, page.locator('header.clr-workout-header'))

      // The genuine wider reading: a session past an hour stays on the one row.
      // An hour is jumped, not ticked through: each due timer fires once.
      await page.clock.fastForward(3600 * 1000)
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await settle(page)
      expect(await readingOf(sessionClock(page))).toBe('1:02:00')
      const [hour] = await readHeader(page)
      expectOneRowHeader(hour, `header past an hour @${name}`)
      await attach(page, `header-hour-${name}`, page.locator('header.clr-workout-header'))
      await noHorizontalOverflow(page)
      app.assertContained()
    })

    test(`JOURNEY-007 ${name}: every clock is one whole frame filling its place with centred digits — the preparation hold, the rest in the open log and the footer, and every format clock`, async ({ page, visit }) => {
      test.setTimeout(180_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page, { reducedMotion: true })
      await openWorkout(page, visit)
      await hold(page)

      // Entry: the preparation hold's countdown, on its card.
      let frames = await readFrames(page)
      const holdFrame = frames.find((frame) => frame.label === 'Countdown')!
      expect(holdFrame.kind, 'the hold is its card\'s element frame').toBe('element')
      expectWholeBodyFrame(holdFrame, `preparation hold @${name}`)
      await attach(page, `entry-${name}`)

      // The hold runs; Rest opens the log with the rest running.
      await tap(holdRegion(page).getByRole('button', { name: 'Start' }))
      await pass(page, 4)
      await tap(holdCard(page).getByRole('button', { name: 'Rest', exact: true }))
      await expect(page.getByRole('form', { name: /^Log set 1 of plank$/i })).toBeVisible()
      await settle(page)
      frames = await readFrames(page)
      const inLog = frames.find((frame) => frame.kind === 'rest')!
      expectWholeBodyFrame(inLog, `rest in the open log @${name}`)
      // AC-R007-01: one frame as wide as the log's body, with no short inner chamfer inside it.
      expect(inLog.frame.width, 'the rest spans the log').toBeGreaterThan(viewport.width * 0.6)
      await attach(page, `log-rest-${name}`)

      // Minimised, the same rest in the footer: the same whole frame.
      // TASK-043: the log's framed X ("Close log") is its collapse (was Minimize).
      await tap(page.getByRole('button', { name: 'Close log' }))
      await expect(page.getByRole('form', { name: /^Log set 1 of plank$/i })).toHaveCount(0)
      await settle(page)
      frames = await readFrames(page)
      expectWholeBodyFrame(frames.find((frame) => frame.kind === 'rest')!, `rest in the footer @${name}`)
      await attach(page, `footer-rest-${name}`)

      // Every format clock in the main section, started.
      await jumpToMain(page)
      for (const label of ['Start EMOM', 'Start AMRAP', 'Start FOR TIME', 'Start ladder', 'Start schedule']) {
        await tap(page.getByRole('button', { name: label, exact: true }))
      }
      await pass(page, 3)
      await settle(page)
      frames = await readFrames(page)
      const body = frames.filter((frame) => frame.label !== 'Session time')
      // Round 7 names each format clock by its block.
      expect(body.map((frame) => `${frame.kind}:${frame.label}`).sort()).toEqual([
        'card:AMRAP time', // the AMRAP window
        'card:EMOM time', // the EMOM minute
        'card:FOR TIME time', // the For Time race
        'card:Ladder time', // the timed ladder's race (R67)
        'card:Time remaining', // the scheduled interval
        'element:Countdown', // the circuit's timed station
        'rest:Time remaining', // the session's rest, still running in the footer
      ])
      for (const frame of body) expectWholeBodyFrame(frame, `${frame.kind} ${frame.label} @${name}`)
      // The block clocks stand beside their cards at the cards' full width.
      const content = await page.locator('main .clr-screen__content').evaluate((node) => {
        const style = getComputedStyle(node)
        return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      })
      for (const frame of body.filter((candidate) => candidate.kind === 'card')) {
        expect(Math.abs(frame.frame.width - content), `beside-card clock spans the content @${name}`).toBeLessThanOrEqual(TOLERANCE)
      }
      await noHorizontalOverflow(page)
      await attachSection(page, `main-clocks-${name}`)
      await page.clock.resume()
      await checkJourneyA11y(page)
      app.assertContained()
    })
  }

  test('JOURNEY-007 touch phone-390: start and pause the hold and a section clock and open a log while the rest runs — every clock keeps its own reading and its pause and cap arithmetic', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page)
    await openWorkout(page, visit)
    await hold(page)
    expect(await readingOf(sessionClock(page))).toBe('02:00')

    // The preparation hold runs beside the session clock.
    await tap(holdRegion(page).getByRole('button', { name: 'Start' }))
    await pass(page, 10)
    expect(await readingOf(countdown(page))).toBe('00:20')
    expect(await readingOf(sessionClock(page))).toBe('02:10')

    // Rest opens the log with the prescribed rest; the hold runs on behind it.
    await tap(holdCard(page).getByRole('button', { name: 'Rest', exact: true }))
    await expect(page.getByRole('form', { name: /^Log set 1 of plank$/i })).toBeVisible()
    expect(await readingOf(restTimer(page))).toBe('00:20')
    await pass(page, 6)
    expect(await readingOf(restTimer(page))).toBe('00:14')
    expect(await readingOf(countdown(page))).toBe('00:14')
    expect(await readingOf(sessionClock(page))).toBe('02:16')

    // Minimised and reopened: the same rest, never a fresh one.
    // TASK-043: the log's framed X ("Close log") is its collapse (was Minimize).
    await tap(page.getByRole('button', { name: 'Close log' }))
    expect(await readingOf(restTimer(page))).toBe('00:14')
    await pass(page, 4)
    expect(await readingOf(restTimer(page))).toBe('00:10')
    await tap(holdCard(page).getByRole('button', { name: 'Rest', exact: true }))
    await expect(page.getByRole('form', { name: /^Log set 1 of plank$/i })).toBeVisible()
    expect(await readingOf(restTimer(page))).toBe('00:10')
    await tap(page.getByRole('button', { name: 'Close log' }))
    // Round 7's dialog closes on its own exit, timed on the page's clock: a
    // fraction of a second, inside the same whole second of every reading.
    await pass(page, 0.3)
    await expect(page.getByRole('form', { name: /^Log set 1 of plank$/i })).toHaveCount(0)

    // Pausing the hold banks its time; the rest and the session run on.
    await tap(holdRegion(page).getByRole('button', { name: 'Pause' }))
    await pass(page, 5)
    expect(await readingOf(countdown(page))).toBe('00:10')
    expect(await readingOf(restTimer(page))).toBe('00:05')
    expect(await readingOf(sessionClock(page))).toBe('02:25')

    // A section clock: the For Time race, its cap, Pause and Resume (TASK-006's arithmetic).
    await jumpToMain(page)
    // The For Time block's stack: its race clock beside its card.
    const forTimeCard = blockCard(page, 'Movements in this FOR TIME')
    const forTimeStack = page.locator('main .clr-stack').filter({ has: forTimeCard }).last()
    await tap(forTimeCard.getByRole('button', { name: 'Start FOR TIME' }))
    await pass(page, 30)
    const race = forTimeStack.getByRole('timer', { name: 'FOR TIME time' })
    const raceLow = () => race.evaluate((node) => node.closest('.clr-card__body')!.classList.contains('clr-chamfer--timer-low'))
    expect(await readingOf(race)).toBe('00:30')
    await tap(forTimeStack.getByRole('button', { name: 'Pause' }))
    await pass(page, 120)
    expect(await readingOf(race)).toBe('00:30')
    expect(await readingOf(sessionClock(page))).toBe('04:55')
    await tap(forTimeStack.getByRole('button', { name: 'Resume' }))
    await pass(page, 10)
    expect(await readingOf(race)).toBe('00:40')
    expect(await readingOf(sessionClock(page))).toBe('05:05')
    // The cap arithmetic is the race's own: its 15:00 cap is still 14:20 of
    // active time away — the pause counted for nothing — so the warning's
    // colour arrives at 14:50 of race time. (The build read ForTimeBlock's
    // "Cap in 14:30" line; the route's race draws no such words — plan
    // conflict C2 in evidence/refinement/task-108/test-ledger.json.)
    await jump(page, 840)
    await pass(page, 9)
    expect(await readingOf(race)).toBe('14:49')
    expect(await raceLow()).toBe(false)
    await pass(page, 1)
    expect(await readingOf(race)).toBe('14:50')
    expect(await raceLow()).toBe(true)
    await attachSection(page, 'main-clocks-running-phone-390')
    await page.clock.resume()
    await checkJourneyA11y(page)
    app.assertContained()
  })

  test('JOURNEY-007 keyboard, reduced motion and recovery phone-390: every control by keyboard, still frames, and a paused section clock comes back paused after close and reopen', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { reducedMotion: true })
    await openWorkout(page, visit)
    await hold(page)

    // The hold by keyboard: Start keeps focus as it becomes Pause.
    await press(page, holdRegion(page).getByRole('button', { name: 'Start' }))
    await expect(holdRegion(page).getByRole('button', { name: 'Pause' })).toBeFocused()
    await pass(page, 5)
    expect(await readingOf(countdown(page))).toBe('00:25')

    // Rest by keyboard opens the log; Minimize by keyboard closes it.
    // TASK-043: the log's framed X ("Close log") is its collapse (was Minimize).
    await press(page, holdCard(page).getByRole('button', { name: 'Rest', exact: true }))
    await expect(page.getByRole('form', { name: /^Log set 1 of plank$/i })).toBeVisible()
    expect(await readingOf(restTimer(page))).toBe('00:20')
    await press(page, page.getByRole('button', { name: 'Close log' }))
    await expect(page.getByRole('form', { name: /^Log set 1 of plank$/i })).toHaveCount(0)

    // Reduced motion: whatever a timer frame animates is the app's hard cut.
    const timings = await page.evaluate(() => [...document.querySelectorAll('[role="timer"]')]
      .map((timer) => timer.closest('.clr-timer-frame') ?? timer.closest('.clr-rest-bar') ?? timer.parentElement!)
      .flatMap((frame) => frame.getAnimations({ subtree: true }))
      .map((animation) => {
        const timing = animation.effect!.getComputedTiming()
        return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
      }))
    for (const timing of timings) {
      expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
      expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
    }

    // A section clock by keyboard, paused, then the page closed and reopened.
    await jumpToMain(page, 'keyboard')
    const amrapCard = blockCard(page, 'Movements in this AMRAP')
    const amrapStack = () => page.locator('main .clr-stack').filter({ has: amrapCard }).last()
    await press(page, amrapCard.getByRole('button', { name: 'Start AMRAP' }))
    await expect(amrapCard.getByRole('button', { name: 'Pause' })).toBeFocused()
    await pass(page, 45)
    await press(page, amrapCard.getByRole('button', { name: 'Pause' }))
    const window = () => amrapStack().getByRole('timer', { name: 'AMRAP time' })
    expect(await readingOf(window())).toBe('07:15')

    await pass(page, 30)
    // The page boots on its own timers: let the clock run through the reload.
    await page.clock.resume()
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Workout sections' })).toBeVisible()
    if (await page.getByRole('list', { name: 'Movements in this AMRAP' }).count() === 0) await jumpToMain(page, 'keyboard')
    await expect(amrapCard.getByRole('button', { name: 'Resume' })).toBeVisible()
    await settle(page)
    // The paused window is restored frozen, in the same whole frame.
    expect(await readingOf(window())).toBe('07:15')
    const restored = (await readFrames(page)).filter((frame) => frame.kind === 'card' && frame.label !== 'Session time')
    expect(restored.length).toBeGreaterThanOrEqual(1)
    for (const frame of restored) expectWholeBodyFrame(frame, `restored ${frame.label}`)
    await checkJourneyA11y(page)
    app.assertContained()
  })

  test('JOURNEY-007 gallery cards and urgency phone-320: no other header state, and every clock\'s actual consumer in one whole frame', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })

    // Round 7's accepted cards state (bec4454) draws the route's own timed
    // flows and no workout header: it presents no other header state.
    await visit('/gallery/refinements?state=cards')
    const cards = page.locator('[data-refinement-state="cards"]')
    await expect(cards.getByRole('button', { name: 'Start EMOM' })).toBeVisible()
    await expect(cards.locator('header.clr-workout-header')).toHaveCount(0)
    for (const label of ['Start EMOM', 'Start AMRAP', /^Start for time$/i]) {
      await tap(cards.getByRole('button', { name: label }))
    }
    await expect(cards.getByRole('timer')).toHaveCount(3)
    await settle(page)
    let frames = await readFrames(page)
    expect(frames.map((frame) => `${frame.kind}:${frame.label}`).sort()).toEqual(['card:AMRAP time', 'card:EMOM time', 'card:FOR TIME time'])
    for (const frame of frames) expectWholeBodyFrame(frame, `gallery cards ${frame.label}`)
    await attachSection(page, 'gallery-cards-frames-phone-320')

    // The urgency state: each moment's clock is the route's own frame.
    await visit('/gallery/refinements?state=urgency')
    const urgency = page.locator('[data-refinement-state="urgency"]')
    for (const [moment, clock] of [['EMOM · 10 seconds', 'EMOM time'], ['For Time · 5 seconds to cap', 'FOR TIME time'], ['Ladder · elapsed', 'Ladder time']] as const) {
      await tap(urgency.getByRole('button', { name: moment }))
      await expect(urgency.getByRole('timer', { name: clock })).toBeVisible()
      await settle(page)
      frames = await readFrames(page)
      expect(frames.map((frame) => frame.label)).toEqual([clock])
      expectWholeBodyFrame(frames[0], `gallery urgency ${moment}`)
    }
    await noHorizontalOverflow(page)
    await attachSection(page, 'gallery-urgency-frames-phone-320')
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
