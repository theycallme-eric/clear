import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import {
  LONG_LADDER_ROUNDS,
  TIMED_FINISH,
  TIMED_FORMATS,
  timedActionsAcceptance,
  timedActionsSnapshot,
  type TimedFormat,
} from '../../src/test/timed-actions-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-006 (REQ-006; C17, C18; G05; R39, R48, R66, R68, R98; JOURNEY-006) —
 * the timed Start/Pause/Resume/Finish action hierarchy on the real `/workout`
 * route.
 *
 * Entry: a running session, behind the existing auth guard, whose last section
 * holds an EMOM, an AMRAP, a For Time and the accepted twelve-rung ladder
 * (`src/test/timed-actions-fixture.ts`). Action: Start, Pause, Resume and
 * Finish each section through its own controls, by touch and by keyboard.
 * Result, read from the browser at phone widths: every action row spans the
 * card's width — after the work and before the card's Coaching and notes for
 * the EMOM, AMRAP and For Time, and near the top of the long ladder, before
 * its rounds; running, a secondary Pause sits beside the format's primary
 * Finish or Finish early, and Resume takes Pause's place; Pause freezes the
 * section clock while the workout clock runs on; a section's Finish never
 * finishes the workout. Close/reopen keeps a paused section paused.
 *
 * Synthetic and contained: an intercepted session for a fictional user. The
 * browser clock is Playwright's, so pauses are read exactly. Nothing is
 * written: no set, no block result and no session call — the workout's own
 * Finish is never pressed here.
 *
 * A3 TASK-104 (F2, #727) carried this spec onto Round 7. The route's timed
 * blocks are Round 7's `TimedWorkoutFlow` (A3 TASK-103), so each case reads
 * Round 7's controls and words — its card, its `[data-timed-actions]` row, its
 * timer frame's caption and readout, its lists' names and its Coaching and
 * notes disclosure — and asserts the build's behaviour unchanged. What each
 * read changed is in `evidence/refinement/task-104/test-ledger.json`.
 */
const OWNER = '00000000-0000-4000-8000-000000000601'
const PLACE = '00000000-0000-4000-8000-000000000611'
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
    if (code !== null) throw new Error(`Synthetic TASK-006 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-006 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-006.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-006-public-placeholder',
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
/** Round 7's Start words: the block's own structure label, the ladder's `Start ladder`. */
const TIMED_START: Readonly<Record<TimedFormat, string>> = {
  emom: 'Start EMOM', amrap: 'Start AMRAP', for_time: 'Start FOR TIME', ladder: 'Start ladder',
}

/** The list each Round 7 card names its work by (the ladder's: its rounds). */
const TIMED_LISTS: Readonly<Record<TimedFormat, string>> = {
  emom: 'Movements in this EMOM',
  amrap: 'Movements in this AMRAP',
  for_time: 'Movements in this FOR TIME',
  ladder: 'Prescribed ladder rounds',
}

/** The approved mobile scope: the narrow phone and the project's own phone. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
]

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

async function syntheticApp(page: Page, options: { reducedMotion?: boolean } = {}) {
  const acceptance = timedActionsAcceptance({ locationId: PLACE })
  const running: SessionSnapshot = sessionSnapshotSchema.parse(timedActionsSnapshot(acceptance, {
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
    if (request.method() === 'GET' || request.method() === 'HEAD') {
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
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-006 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-006-session', refreshToken: 'synthetic-task-006-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-006@example.invalid' },
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

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
  })
}

/** JOURNEY-006's entry: the running session's `/workout`, every timed block ready. */
async function openWorkout(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByRole('list', { name: TIMED_LISTS.ladder, exact: true })).toBeVisible()
  await settle(page)
}

/** Time passes on the browser's own clock, and its interval repaints run. */
async function pass(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1000)
}

/**
 * Holds the browser's clock still one minute after entry — the session then
 * reads exactly 02:00 — so every reading below is exact arithmetic.
 */
async function hold(page: Page) {
  await page.clock.pauseAt(ENTRY + 60_000)
}

function seconds(reading: string): number {
  const [minutes, rest] = reading.split(':').map(Number)
  return minutes * 60 + rest
}

/** The block: Round 7's timed flow, its clock beside its card. */
function blockOf(page: Page, format: TimedFormat): Locator {
  return page.locator(`main .clr-timed-flow[data-timed-format="${format}"]`)
}

/** The block's one card: the one holding its group header and its work. */
function cardOf(page: Page, format: TimedFormat): Locator {
  return blockOf(page, format).locator('.clr-card').filter({ has: page.locator('[data-movement-group-header]') })
}

function rowOf(page: Page, format: TimedFormat): Locator {
  return cardOf(page, format).locator('[data-timed-actions]')
}

function controlOf(page: Page, format: TimedFormat, name: string): Locator {
  return rowOf(page, format).getByRole('button', { name, exact: true })
}

/** The section clock's readout: its digits, as drawn (the caption beside them is words). */
async function blockTime(page: Page, format: TimedFormat): Promise<string> {
  return blockOf(page, format).getByRole('timer').first().evaluate((timer) =>
    [...timer.children].map((part) => part.textContent ?? '').find((text) => /^\d{2}:\d{2}$/.test(text)) ?? '')
}

async function sessionTime(page: Page): Promise<string> {
  const text = (await page.getByRole('timer', { name: 'Session time' }).textContent()) ?? ''
  return /\d{2}:\d{2}/.exec(text)?.[0] ?? ''
}

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number }

interface SlotGeometry {
  card: Box
  row: Box
  cells: Box[]
  controls: { name: string; box: Box; primary: boolean; overflowing: boolean; position: string }[]
  workBottom: number
  coachingTop: number | null
  listTop: number
  listBottom: number
  headerBottom: number
  rowPosition: string
}

/** The card's action slot, against the card's own content box. */
async function readSlot(page: Page, format: TimedFormat): Promise<SlotGeometry> {
  return cardOf(page, format).evaluate((card, listName) => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
    }
    const row = card.querySelector('[data-timed-actions]')!
    const list = [...card.querySelectorAll('ul, ol')].find((node) => node.getAttribute('aria-label') === listName)!
    // The card's Coaching and notes disclosure (Round 7's one grouped disclosure),
    // named by TASK-005's words: the visible label, then its block's format and movements.
    const coaching = [...card.querySelectorAll('button')].find((node) => /^Coaching and notes — [^:]+: /.test(node.textContent?.trim() ?? ''))?.closest('.clr-collapsible') ?? null
    const work = [...card.querySelectorAll('.clr-movement-identity, [data-movement-detail], ul, ol')]
      .filter((node) => !row.contains(node) && (coaching === null || !coaching.contains(node)))
    return {
      // The card's own content box: Round 7's movement group, which holds the work and the slot.
      card: box(card.querySelector('.clr-movement-group')!),
      row: box(row),
      cells: [...row.children].map(box),
      controls: [...row.querySelectorAll('button')].map((button) => ({
        name: button.textContent ?? '',
        box: box(button),
        primary: button.classList.contains('clr-btn--primary'),
        overflowing: button.scrollWidth > button.clientWidth + 1,
        position: getComputedStyle(button).position,
      })),
      workBottom: Math.max(...work.map((node) => node.getBoundingClientRect().bottom)),
      coachingTop: coaching === null ? null : coaching.getBoundingClientRect().top,
      listTop: list.getBoundingClientRect().top,
      listBottom: list.getBoundingClientRect().bottom,
      headerBottom: card.querySelector('[data-movement-group-header]')!.getBoundingClientRect().bottom,
      rowPosition: getComputedStyle(row).position,
    }
  }, TIMED_LISTS[format])
}

const TOLERANCE = 1

/**
 * C17: one row as wide as the card's content, its cells sharing that width
 * equally and each control filling its cell, nothing overflowing, nothing
 * pinned — a lone Start fills the row, a running pair splits it.
 */
function expectFullWidthSlot(slot: SlotGeometry, count: number, label: string) {
  expect(slot.row.left, `${label}: the card's start`).toBeLessThanOrEqual(slot.card.left + TOLERANCE)
  expect(slot.row.right, `${label}: the card's end`).toBeGreaterThanOrEqual(slot.card.right - TOLERANCE)
  expect(slot.controls, `${label}: controls`).toHaveLength(count)
  expect(slot.cells, `${label}: one cell per control`).toHaveLength(count)
  for (const [index, control] of slot.controls.entries()) {
    expect(Math.abs(control.box.width - slot.cells[index].width), `${label}: ${control.name} fills its cell`).toBeLessThanOrEqual(TOLERANCE)
    expect(control.overflowing, `${label}: ${control.name} label fits`).toBe(false)
    expect(['sticky', 'fixed'], `${label}: not pinned`).not.toContain(control.position)
  }
  expect(['sticky', 'fixed'], `${label}: not pinned`).not.toContain(slot.rowPosition)
  if (count === 2) {
    const [first, second] = slot.controls
    expect(Math.abs(first.box.top - second.box.top), `${label}: one row`).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(first.box.width - second.box.width), `${label}: equal halves`).toBeLessThanOrEqual(TOLERANCE)
  }
}

/**
 * Delivered-revision evidence: each block — its card and its clock — named
 * `<format>-<state>`, read in one taller viewport at the same width so nothing
 * pinned covers it; the viewport is restored after.
 */
async function attachBlocks(page: Page, state: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 4000 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await settle(page)
    for (const format of TIMED_FORMATS) {
      await test.info().attach(`${format}-${state}.png`, { body: await blockOf(page, format).screenshot({ caret: 'hide' }), contentType: 'image/png' })
    }
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

/** What the athlete sees on arrival at a card: the viewport, scrolled to its header. */
async function attachViewport(page: Page, format: TimedFormat, name: string) {
  await cardOf(page, format).locator('[data-movement-group-header]').evaluate((header) => header.scrollIntoView({ block: 'start' }))
  await settle(page)
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
}

/**
 * axe over the journey's screen after an interaction: every rule on every node
 * (`checkA11y`'s scan).
 *
 * This check once held one pre-existing finding to exactly itself: the twelve-
 * rung ladder's read-only rung row (`LadderRungs` over an OverflowRail)
 * overflowed at phone widths with no focus stop, and axe's
 * `scrollable-region-focusable` flagged its scroller. TASK-012 (C35, R95)
 * removed that row while a ladder is performed — the compact prescription's
 * wrapping grid states the rounds, with no scroller — and these journeys never
 * answer the ladder Complete, the one state that still draws it (TASK-013's).
 * So the exception has nothing left to hold, and every rule runs unexcepted.
 */
async function checkJourneyA11y(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  if (results.violations.length > 0) {
    await test.info().attach('axe-violations.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  }
  expect(results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target.join(' ')) }))).toEqual([])
}

/**
 * A section's Finish opens its Round 7 log (the focused "Log results" dialog);
 * the athlete closes it with its framed X before moving on, as on the route.
 */
async function closeLog(page: Page) {
  const dialog = page.locator('dialog[open]').filter({ has: page.locator('form.clr-timed-log') })
  await expect(dialog).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Close log' }).click()
  await expect(dialog).toHaveCount(0)
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-006 timed action hierarchy', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-006 ${name}: EMOM, AMRAP and For Time Start spans the card after the work and before coaching; the long ladder's Start is near the top`, async ({ page, visit }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page)
      await openWorkout(page, visit)

      for (const format of ['emom', 'amrap', 'for_time'] as const) {
        const slot = await readSlot(page, format)
        expectFullWidthSlot(slot, 1, `${format} ready @${name}`)
        expect(slot.controls[0]).toMatchObject({ name: TIMED_START[format], primary: true })
        expect(slot.row.top, `${format}: after the work and its prescription`).toBeGreaterThanOrEqual(slot.workBottom - TOLERANCE)
        expect(slot.coachingTop, `${format}: the card's coaching`).not.toBeNull()
        expect(slot.coachingTop!, `${format}: before coaching`).toBeGreaterThanOrEqual(slot.row.bottom - TOLERANCE)
      }
      // The EMOM's schedule is part of its prescription — each movement's minute
      // and target: Start is below the last of it too.
      const minute = await cardOf(page, 'emom').getByText('Min 2 · 10 reps', { exact: true }).boundingBox()
      expect((await readSlot(page, 'emom')).row.top).toBeGreaterThanOrEqual(minute!.y + minute!.height - TOLERANCE)

      // The long ladder: Start after its identity and cap, before every round.
      const ladder = await readSlot(page, 'ladder')
      expectFullWidthSlot(ladder, 1, `ladder ready @${name}`)
      expect(ladder.controls[0]).toMatchObject({ name: TIMED_START.ladder, primary: true })
      expect(ladder.row.top, 'after the identity and cap').toBeGreaterThanOrEqual(ladder.headerBottom - TOLERANCE)
      expect(ladder.row.bottom, 'before the rounds').toBeLessThanOrEqual(ladder.listTop + TOLERANCE)
      // Reachable without the rounds: within the first screen from the card's
      // header, above all twelve of them. TASK-012 (C35, R95, R117) superseded
      // "the twelve rounds alone run longer than a screen": they are now the
      // compact wrapping grid, not the repetitive list; the Start still leads.
      expect(ladder.row.bottom - ladder.headerBottom, 'within the first screen').toBeLessThan(viewport.height)
      expect(ladder.listBottom, `${LONG_LADDER_ROUNDS} rounds after the Start`).toBeGreaterThan(ladder.row.bottom)
      await expect(page.getByRole('button', { name: TIMED_START.ladder, exact: true })).toHaveCount(1)

      await noHorizontalOverflow(page)
      await attachBlocks(page, `ready-${name}`)
      await attachViewport(page, 'ladder', `ladder-arrival-${name}`)
      await expect(controlOf(page, 'ladder', TIMED_START.ladder)).toBeInViewport()
      await checkJourneyA11y(page)
      app.assertContained()
    })

    test(`JOURNEY-006 ${name}: by touch, a secondary Pause beside the primary Finish or Finish early, Resume in its place; the section clock freezes while the workout clock runs`, async ({ page, visit }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page)
      await openWorkout(page, visit)
      await hold(page)
      expect(await sessionTime(page)).toBe('02:00')

      for (const format of TIMED_FORMATS) {
        await controlOf(page, format, TIMED_START[format]).tap()
        const running = await readSlot(page, format)
        expectFullWidthSlot(running, 2, `${format} running @${name}`)
        expect(running.controls.map(({ name: label, primary }) => [label, primary])).toEqual([
          ['Pause', false], [TIMED_FINISH[format], true],
        ])
        // Still the same slot: after the work (the ladder: above its rounds), before coaching.
        if (format === 'ladder') expect(running.row.bottom).toBeLessThanOrEqual(running.listTop + TOLERANCE)
        else expect(running.row.top).toBeGreaterThanOrEqual(running.workBottom - TOLERANCE)
        expect(running.coachingTop!).toBeGreaterThanOrEqual(running.row.bottom - TOLERANCE)
      }

      await pass(page, 30)
      expect(await blockTime(page, 'for_time')).toBe('00:30')
      expect(await sessionTime(page)).toBe('02:30')
      for (const format of TIMED_FORMATS) await controlOf(page, format, 'Pause').tap()
      for (const format of TIMED_FORMATS) {
        const paused = await readSlot(page, format)
        expectFullWidthSlot(paused, 2, `${format} paused @${name}`)
        expect(paused.controls.map(({ name: label, primary }) => [label, primary])).toEqual([
          ['Resume', false], [TIMED_FINISH[format], true],
        ])
      }
      const frozen = {
        emom: await blockTime(page, 'emom'), amrap: await blockTime(page, 'amrap'),
        for_time: await blockTime(page, 'for_time'), ladder: await blockTime(page, 'ladder'),
      }
      expect(frozen).toEqual({ emom: '00:30', amrap: '07:30', for_time: '00:30', ladder: '00:30' })

      // Two minutes paused: every section clock holds; the workout clock runs on.
      await pass(page, 120)
      for (const format of TIMED_FORMATS) expect(await blockTime(page, format), `${format} frozen`).toBe(frozen[format])
      expect(await sessionTime(page)).toBe('04:30')
      await noHorizontalOverflow(page)
      await attachBlocks(page, `paused-${name}`)

      // Resume keeps the active time and the window left.
      for (const format of TIMED_FORMATS) await controlOf(page, format, 'Resume').tap()
      await pass(page, 10)
      expect({
        amrap: await blockTime(page, 'amrap'), for_time: await blockTime(page, 'for_time'), ladder: await blockTime(page, 'ladder'),
      }).toEqual({ amrap: '07:20', for_time: '00:40', ladder: '00:40' })
      expect(await blockTime(page, 'emom')).toBe('00:20')
      await expect(blockOf(page, 'emom').getByText('Minute 1 of 10', { exact: true })).toBeVisible()
      await attachBlocks(page, `running-${name}`)
      // axe keeps its own timers: let the browser's clock run again to scan.
      await page.clock.resume()
      await checkJourneyA11y(page)
      app.assertContained()
    })
  }

  test('JOURNEY-006 keyboard and reduced motion: every action by keyboard, focus kept through Start and Pause, and the section Finish is not Finish workout', async ({ page, visit }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { reducedMotion: true })
    await openWorkout(page, visit)
    // Held still, so each section's reading below is exact arithmetic.
    await hold(page)

    for (const format of TIMED_FORMATS) {
      const start = controlOf(page, format, TIMED_START[format])
      await start.focus()
      await page.keyboard.press('Enter')
      // The control under the keyboard becomes Pause: focus is not lost.
      await expect(controlOf(page, format, 'Pause')).toBeFocused()
      await page.keyboard.press('Space')
      await expect(controlOf(page, format, 'Resume')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(controlOf(page, format, 'Pause')).toBeFocused()
      // The primary Finish is the next stop in the tab order.
      await page.keyboard.press('Tab')
      await expect(controlOf(page, format, TIMED_FINISH[format])).toBeFocused()
    }

    // Reduced motion: whatever the action slots animate is the app's hard cut
    // (a11y.css: at most 0.01ms, once) — nothing moves, nothing loops.
    const timings = await page.evaluate(() => [...document.querySelectorAll('[data-timed-actions]')]
      .flatMap((row) => row.getAnimations({ subtree: true }))
      .map((animation) => {
        const timing = animation.effect!.getComputedTiming()
        return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
      }))
    for (const timing of timings) {
      expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
      expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
    }

    // A section's Finish ends that block's attempt, and only that.
    await pass(page, 20)
    await controlOf(page, 'for_time', 'Finish').focus()
    await page.keyboard.press('Enter')
    await expect(blockOf(page, 'for_time').getByRole('timer')).toContainText('Finished')
    expect(await blockTime(page, 'for_time')).toBe('00:20')
    await expect(rowOf(page, 'for_time')).toHaveCount(0)
    await closeLog(page)
    await controlOf(page, 'amrap', 'Finish early').focus()
    await page.keyboard.press('Enter')
    // The window is settled where it was ended: twenty seconds into its eight minutes.
    await expect(blockOf(page, 'amrap').getByRole('timer')).toContainText('Finished')
    expect(await blockTime(page, 'amrap')).toBe('07:40')
    await closeLog(page)
    await controlOf(page, 'emom', 'Finish early').focus()
    await page.keyboard.press('Enter')
    await expect(cardOf(page, 'emom').getByText('Finished early, in minute 1 of 10. Continue when you are ready.')).toBeVisible()
    await closeLog(page)
    await controlOf(page, 'ladder', 'Finish').focus()
    await page.keyboard.press('Enter')
    await expect(blockOf(page, 'ladder').getByRole('timer')).toContainText('Finished')
    await closeLog(page)
    // axe keeps its own timers: let the browser's clock run again to scan.
    await page.clock.resume()

    await expect(page).toHaveURL(/\/workout$/)
    const finishWorkout = page.getByRole('button', { name: 'Finish workout', exact: true })
    await expect(finishWorkout).toBeVisible()
    await expect(finishWorkout).toBeEnabled()
    await expect(page.getByRole('navigation', { name: 'Workout sections' })).toContainText('Finish workout')
    for (const format of TIMED_FORMATS) await expect(cardOf(page, format).getByRole('button', { name: 'Finish workout' })).toHaveCount(0)
    await checkJourneyA11y(page)
    app.assertContained()
  })

  test('JOURNEY-006 recovery phone-390: close and reopen keeps a paused section paused and frozen, and a running one running', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page)
    await openWorkout(page, visit)
    await controlOf(page, 'amrap', TIMED_START.amrap).tap()
    await controlOf(page, 'ladder', TIMED_START.ladder).tap()
    await pass(page, 45)
    await controlOf(page, 'amrap', 'Pause').tap()
    const frozen = await blockTime(page, 'amrap')
    expect(seconds(frozen)).toBeLessThanOrEqual(480 - 45)

    await pass(page, 30)
    await page.reload()
    await expect(page.getByRole('list', { name: TIMED_LISTS.ladder, exact: true })).toBeVisible()
    await settle(page)
    expect((await readSlot(page, 'amrap')).controls.map(({ name: label }) => label)).toEqual(['Resume', 'Finish early'])
    await expect(blockOf(page, 'amrap').getByText('Paused', { exact: true })).toBeVisible()
    expect(await blockTime(page, 'amrap')).toBe(frozen)
    // The ladder was running: it ran on through the close (at least the 75
    // seconds stepped here, plus however long the reload took).
    expect((await readSlot(page, 'ladder')).controls.map(({ name: label }) => label)).toEqual(['Pause', 'Finish'])
    expect(seconds(await blockTime(page, 'ladder'))).toBeGreaterThanOrEqual(75)
    // Untouched blocks are still ready.
    expect((await readSlot(page, 'emom')).controls.map(({ name: label }) => label)).toEqual([TIMED_START.emom])

    await controlOf(page, 'amrap', 'Resume').tap()
    await pass(page, 5)
    // Resume picks the window up where it was paused: five seconds on, not 75.
    expect(seconds(frozen) - seconds(await blockTime(page, 'amrap'))).toBeGreaterThanOrEqual(5)
    expect(seconds(frozen) - seconds(await blockTime(page, 'amrap'))).toBeLessThanOrEqual(8)
    await checkJourneyA11y(page)
    app.assertContained()
  })

  test('JOURNEY-006 gallery ladder-4 and ladder-12 phone-320: the actual ladder renderer, Start at the top, then Pause and Finish', async ({ page, visit }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    for (const rounds of [4, 12] as const) {
      await visit(`/gallery/refinements?state=ladder-${rounds}`)
      const state = page.locator(`[data-refinement-state="ladder-${rounds}"]`)
      const card = state.locator('.clr-timed-flow[data-timed-format="ladder"] .clr-card').filter({ has: page.locator('[data-movement-group-header]') })
      const list = card.getByRole('list', { name: TIMED_LISTS.ladder, exact: true })
      await expect(list.getByRole('listitem')).toHaveCount(rounds)
      const row = card.locator('[data-timed-actions]')
      const start = row.getByRole('button', { name: 'Start ladder', exact: true })
      const startBox = await start.boundingBox()
      const listBox = await list.boundingBox()
      expect(startBox!.y + startBox!.height).toBeLessThanOrEqual(listBox!.y + TOLERANCE)
      await test.info().attach(`gallery-ladder-${rounds}-ready-phone-320.png`, { body: await card.screenshot({ caret: 'hide' }), contentType: 'image/png' })
      await start.tap()
      await expect(row.getByRole('button')).toHaveText(['Pause', 'Finish'])
      const [pause, finish] = [await row.getByRole('button').nth(0).boundingBox(), await row.getByRole('button').nth(1).boundingBox()]
      expect(Math.abs(pause!.y - finish!.y)).toBeLessThanOrEqual(TOLERANCE)
      expect(Math.abs(pause!.width - finish!.width)).toBeLessThanOrEqual(TOLERANCE)
      await row.getByRole('button', { name: 'Pause', exact: true }).tap()
      await expect(row.getByRole('button')).toHaveText(['Resume', 'Finish'])
      await noHorizontalOverflow(page)
      await test.info().attach(`gallery-ladder-${rounds}-paused-phone-320.png`, { body: await state.screenshot({ caret: 'hide' }), contentType: 'image/png' })
    }
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
