import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import {
  HANDOFF_COOLDOWN_TITLE,
  LADDER_ROUNDS_LIST,
  LONG_ROUNDS,
  LONG_TARGETS,
  LONG_TIMING_LINE,
  LONG_UNIT,
  ROUNDS_COMPLETED,
  SHORT_CAP_SECONDS,
  SHORT_ROUNDS,
  SHORT_TARGETS,
  SHORT_TIMING_LINE,
  SHORT_UNIT,
  WORK_COMPLETED,
  ladderHandoffAcceptance,
  ladderHandoffSnapshot,
} from '../../src/test/ladder-handoff-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-014 (REQ-014; C38, C39, C60; R124, R130, R141; P04; AC-C38-01,
 * AC-C39-01, AC-C60-01, AC-R014-01, AC-R014-02, AC-R014-03; JOURNEY-014) —
 * accidental Finish recovery with an aligned quiet Undo on the real `/workout`
 * route and the ladder's end log.
 *
 * Entry (ENTRY-014): a running session, behind the existing auth guard, whose
 * first section holds two true timed ladders shaped unlike each other — twelve
 * rungs of kettlebell swing 3 → 36 reps with a fixed 200 m row inside one
 * 09:00 cap, and four rungs of plank 5 → 20 seconds raced For Time under a
 * 15:00 cap — and whose second is a cooldown (TASK-013's
 * `src/test/ladder-handoff-fixture.ts`, imported unchanged). A ladder attempt
 * has checked progress and a draft, then Finish is tapped. Action: Undo finish
 * · Resume ladder, by touch and by keyboard; then Finish again and save.
 * Result, read from the browser at phone widths: the quiet Undo below Work
 * completed and before Rounds completed, its visible text — a Range over its
 * text node, not the button box — starting at the same left edge as the
 * dynamic rounds-completed count's text, with no inherited inset; the same
 * attempt back (clock running on or paused again, checked progress, the log's
 * entries) inside the original cap; Undo withdrawn at that cap, kept through a
 * reload and a failed save, and ended by a successful save — for good, even
 * when a reload cannot read the row back; one row with the truthful
 * `highest_rung` per ladder.
 *
 * Synthetic and contained: an intercepted session for a fictional user, the
 * browser clock Playwright's. The only writes allowed are the section's own
 * `block_results` inserts on its forward action — answered here as PostgREST
 * would, never forwarded; one may be refused on purpose. This is the app's
 * own write contract on a synthetic origin, not backend persistence proof
 * (`e2e/design-0143/workout-ladder.spec.ts` is the ladder's backend lane).
 */
const OWNER = '00000000-0000-4000-8000-000000001401'
const PLACE = '00000000-0000-4000-8000-000000001411'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The browser's clock at entry; the session has run for one minute. */
const ENTRY = Date.parse('2026-11-10T09:00:00.000Z')

/** The accepted quiet action's words (reference `GalleryLadderFlow`), which are also its name. */
const UNDO_FINISH = 'Undo finish · Resume ladder'

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
    if (code !== null) throw new Error(`Synthetic TASK-014 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-014 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-014.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-014-public-placeholder',
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
const PHONE_320: Viewport = { width: 320, height: 568 }
const PHONE_390: Viewport = { width: 390, height: 844 }

/** Sub-pixel tolerance for geometry read from the browser. */
const TOLERANCE = 1
/** The text-start alignment itself (R141, P04) is held to half a CSS pixel. */
const TEXT_TOLERANCE = 0.5

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

type BlockResultBody = Record<string, unknown>

interface SyntheticOptions {
  reducedMotion?: boolean
  /** Refuse the first `block_results` insert with a 503, storing nothing. */
  refuseFirstWrite?: boolean
}

async function syntheticApp(page: Page, options: SyntheticOptions = {}) {
  const running: SessionSnapshot = sessionSnapshotSchema.parse(ladderHandoffSnapshot(ladderHandoffAcceptance({ locationId: PLACE }), {
    userId: OWNER,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  }))
  const posts: BlockResultBody[] = []
  const saves: BlockResultBody[] = []
  const stored = new Map<string, BlockResultBody>()
  const unexpected: string[] = []
  const lane = { refuseNext: options.refuseFirstWrite ?? false, performedReadable: true }
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
    if (request.method() === 'POST' && url.pathname.endsWith('/rest/v1/block_results')) {
      const body = request.postDataJSON() as BlockResultBody | BlockResultBody[]
      const row = Array.isArray(body) ? body[0] : body
      posts.push(row)
      if (lane.refuseNext) {
        // The refused save: nothing is stored, and the app is told so.
        lane.refuseNext = false
        return reply({ code: 'PGRST000', message: 'Synthetic TASK-014 refused write.' }, 503)
      }
      saves.push(row)
      const id = `00000000-0000-4000-8000-${String(1400 + stored.size).padStart(12, '0')}`
      const answered = { id, created_at: '2026-11-10T09:40:00.000Z', ...row }
      stored.set(String(row.block_id), answered)
      return reply([answered], 201)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') {
        // A reload that cannot read the saved rows back claims nothing.
        if (!lane.performedReadable) return reply({ code: 'PGRST000', message: 'Synthetic TASK-014 read unavailable.' }, 503)
        return reply({
          reconstruction: 'performed',
          as_of: running.session.started_at,
          session: running.session,
          state: running.state,
          sections: running.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => ({ ...block, block_result: stored.get(block.block.id) ?? null })),
          })),
        })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    // Anything else is a write this journey must never make.
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-014 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-014-session', refreshToken: 'synthetic-task-014-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-014@example.invalid' },
    }))
  }, { owner: OWNER })

  const [long, short] = running.sections[0].blocks.map((entry) => entry.block.id)
  return {
    longBlockId: long,
    shortBlockId: short,
    posts,
    saves,
    lane,
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
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
  await page.waitForFunction(() => {
    const main = document.querySelector('main')
    return main !== null && main.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .every((animation) => animation.playState !== 'running')
  })
}

/** JOURNEY-014's entry: the running session's `/workout`, both ladders ready. */
async function openWorkout(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByText(LONG_TIMING_LINE, { exact: true })).toBeVisible()
  await expect(page.getByText(SHORT_TIMING_LINE, { exact: true })).toBeVisible()
  await settle(page)
}

async function reopen(page: Page, onLadders = true) {
  await page.reload()
  if (onLadders) await expect(page.getByText(LONG_TIMING_LINE, { exact: true })).toBeVisible()
  else await expect(page.getByRole('heading', { name: HANDOFF_COOLDOWN_TITLE, exact: true })).toBeVisible()
  await settle(page)
}

/** Time passes on the browser's own clock, and its interval repaints run. */
async function pass(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1000)
}

/**
 * Holds the browser's clock one minute after entry, so every reading until
 * `release` is exact arithmetic (TASK-006's pattern: an installed clock
 * otherwise drifts with real time during scans and captures).
 */
async function hold(page: Page) {
  await page.clock.pauseAt(ENTRY + 60_000)
}

/** axe keeps its own timers, and a reload boots the app: let the clock run again. */
async function release(page: Page) {
  await page.clock.resume()
}

function seconds(reading: string): number {
  const [minutes, rest] = reading.split(':').map(Number)
  return minutes * 60 + rest
}

interface StoredAttempt {
  clock: { startedAt: string | null; finishedAt: string | null; pausedAt?: string }
  checkpoint: { pausedAt: string | null } | null
  save: { status: string }
}

/** The ladder's durable attempt, as the route stored it. */
async function attemptOf(page: Page, blockId: string): Promise<StoredAttempt> {
  return page.evaluate((id) => JSON.parse(localStorage.getItem('clear.workout-ladders') ?? '{}')[id] as StoredAttempt, blockId)
}

/**
 * Running from the start it was stored with — after a reload, where the clock
 * has run with real time: the reading is the browser's now less that start,
 * to the tick.
 */
async function expectRunningFrom(page: Page, key: LadderKey, startedAt: string, label: string): Promise<number> {
  const { reading, words } = await clockOf(page, key)
  expect(words, label).toBe('Racing the clock')
  const now = await page.evaluate(() => Date.now())
  const expected = Math.floor((now - Date.parse(startedAt)) / 1000)
  expect(seconds(reading), `${label}: ${reading}`).toBeGreaterThanOrEqual(expected - 1)
  expect(seconds(reading), `${label}: ${reading}`).toBeLessThanOrEqual(expected)
  return seconds(reading)
}

type LadderKey = 'long' | 'short'
const TIMING_LINES: Readonly<Record<LadderKey, string>> = { long: LONG_TIMING_LINE, short: SHORT_TIMING_LINE }
const TARGETS: Readonly<Record<LadderKey, readonly number[]>> = { long: LONG_TARGETS, short: SHORT_TARGETS }
const UNITS: Readonly<Record<LadderKey, string>> = { long: LONG_UNIT, short: SHORT_UNIT }

function cardOf(scope: Page | Locator, key: LadderKey): Locator {
  const page = 'page' in scope ? scope.page() : scope
  return scope.locator('[data-workout-card="workout"]').filter({ has: page.getByText(TIMING_LINES[key], { exact: true }) })
}

/** The block's clock: its reading and its phase in words, beside its card. */
async function clockOf(page: Page, key: LadderKey): Promise<{ reading: string; words: string }> {
  const stack = page.locator('main .clr-stack').filter({ has: cardOf(page, key) }).last()
  const clock = stack.locator('.clr-card').filter({ has: page.getByRole('timer') }).first()
  const text = (await clock.getByRole('timer').first().textContent()) ?? ''
  const words = (await clock.getByRole('status').first().textContent()) ?? ''
  return { reading: /\d{2}:\d{2}/.exec(text)?.[0] ?? '', words }
}

function liveTile(card: Locator, round: number): Locator {
  return card.getByRole('list', { name: LADDER_ROUNDS_LIST, exact: true }).locator(`:scope > li[data-ladder-round="${round}"]`).getByRole('button')
}

function liveCount(card: Locator): Locator {
  return card.locator('[data-ladder-prescription]').getByRole('status')
}

/**
 * TASK-046 (C45; R100): each ladder's card holds one "Log results" action
 * where its log was; the log — the same form, with its quiet Undo — opens in
 * the shared focused dialog titled "Log results". One log is open at a time,
 * over a workout that is inert while it is open, and Undo finish closes it
 * as it resumes the attempt.
 */
function openerOf(card: Locator): Locator {
  return card.locator('[data-timed-log-opener]').getByRole('button', { name: 'Log results', exact: true })
}

/** The open log's form. */
function logOf(card: Locator): Locator {
  return card.page().locator('dialog.clr-accepted-log[open] form.clr-timed-log')
}

/** Opens the card's log by touch (closing any other first) and returns it. */
async function openLog(card: Locator): Promise<Locator> {
  if ((await openerOf(card).getAttribute('aria-expanded')) !== 'true') {
    await closeLog(card.page())
    await openerOf(card).tap()
  }
  await expect(logOf(card)).toBeVisible()
  return logOf(card)
}

/** Opens the card's log by keyboard: the action focused, then Enter. */
async function openLogByKeyboard(card: Locator): Promise<Locator> {
  await openerOf(card).focus()
  await card.page().keyboard.press('Enter')
  await expect(logOf(card)).toBeVisible()
  return logOf(card)
}

/** Closes the open log with its framed X. */
async function closeLog(page: Page) {
  const open = page.locator('dialog.clr-accepted-log[open]')
  if ((await open.count()) === 0) return
  await open.getByRole('button', { name: 'Close log', exact: true }).click()
  await expect(open).toHaveCount(0)
}

function completionOf(card: Locator): Locator {
  return logOf(card).getByRole('group', { name: WORK_COMPLETED, exact: true })
}

function roundsOf(card: Locator): Locator {
  return logOf(card).getByRole('group', { name: ROUNDS_COMPLETED, exact: true })
}

function undoOf(card: Locator): Locator {
  return logOf(card).getByRole('button', { name: UNDO_FINISH, exact: true })
}

function resultTile(card: Locator, round: number, key: LadderKey): Locator {
  return roundsOf(card).getByRole('button', { name: `Round ${round}: ${TARGETS[key][round - 1]} ${UNITS[key]}`, exact: true })
}

async function chosen(group: Locator): Promise<string[]> {
  return group.getByRole('radio').evaluateAll((radios) =>
    radios.filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.textContent ?? ''))
}

async function pressed(scope: Locator): Promise<number[]> {
  return scope.locator('button[aria-pressed]').evaluateAll((buttons) => buttons
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => Number((button as HTMLElement).dataset.ladderRung ?? button.closest('li')?.getAttribute('data-ladder-round'))))
}

async function lifecycle(card: Locator): Promise<string[]> {
  return card.getByRole('button', { name: /^(Start ladder|Pause|Resume|Finish)$/ }).allTextContents()
}

const through = (count: number) => Array.from({ length: count }, (_, index) => index + 1)

// ─────────────────────────────────────────────────────────────────────────────
// Reading the Undo against the count
// ─────────────────────────────────────────────────────────────────────────────

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number }

interface UndoReading {
  /** The Undo's visible text: the first line box of a Range over its text node. */
  text: Box
  /** The right end of its last line box. */
  textRight: number
  /** How many line boxes its text takes at this width. */
  lines: number
  /** The button's own box: its touch target. */
  button: Box
  /** The dynamic rounds-completed count's text, the same way. */
  count: Box
  countText: string
  /** The Work completed choice row, and the Rounds completed legend. */
  answer: Box
  legend: Box
  /** The result group's content edge, which both texts are meant to start at. */
  groupLeft: number
  controlHeight: number
  borderWidth: number
  quiet: { frame: string; fill: string; scan: string; transform: string; paddingLeft: string; paddingRight: string }
  focusFrame: string | null
}

/** TASK-046: read in the card's open log. */
async function readUndo(card: Locator): Promise<UndoReading> {
  return logOf(card).evaluate(async (root, { undo, rounds }) => {
    const box = (rect: DOMRect | DOMRectReadOnly) =>
      ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height })
    const textRects = (node: Node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      return [...range.getClientRects()].filter((rect) => rect.width > 0)
    }
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === undo)
    if (button === undefined) throw new Error('No Undo in this card')
    await Promise.all(root.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined)))
    const label = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '')!
    const undoLines = textRects(label)
    const set = [...root.querySelectorAll('fieldset')].find((node) => node.querySelector('legend')?.textContent === rounds)!
    const count = set.querySelector<HTMLElement>('[role="status"]')!
    const countLines = textRects(count)
    const probe = document.createElement('div')
    probe.style.height = 'var(--control-height)'
    probe.style.width = 'var(--border-width)'
    root.append(probe)
    const controlHeight = probe.getBoundingClientRect().height
    const borderWidth = probe.getBoundingClientRect().width
    probe.remove()
    const group = button.closest('.clr-timed-log__group')!
    const groupStyle = getComputedStyle(group)
    const after = getComputedStyle(button, '::after')
    const before = getComputedStyle(button, '::before')
    const style = getComputedStyle(button)
    return {
      text: box(undoLines[0]),
      textRight: Math.max(...undoLines.map((rect) => rect.right)),
      lines: new Set(undoLines.map((rect) => Math.round(rect.top))).size,
      button: box(button.getBoundingClientRect()),
      count: box(countLines[0]),
      countText: count.textContent ?? '',
      answer: box(root.querySelector('.clr-timed-completion')!.getBoundingClientRect()),
      legend: box(set.querySelector('legend')!.getBoundingClientRect()),
      groupLeft: group.getBoundingClientRect().left + parseFloat(groupStyle.borderLeftWidth) + parseFloat(groupStyle.paddingLeft),
      controlHeight,
      borderWidth,
      quiet: {
        frame: after.backgroundColor,
        fill: before.boxShadow,
        scan: before.backgroundImage,
        transform: style.textTransform,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
      },
      focusFrame: document.activeElement === button ? after.backgroundColor : null,
    }
  }, { undo: UNDO_FINISH, rounds: ROUNDS_COMPLETED })
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/**
 * C39, C60, AC-R014-01, AC-R014-02, P04, read from the browser: the Undo's
 * visible text starts where the count's text starts — the result group's
 * content edge — with no inherited inset left on it; its own box reaches past
 * the text by the same amount on each side, enough for the doubled focus frame
 * to clear the letters; it sits below the completion row and above Rounds
 * completed; it is the quiet button (no frame, no fill, its own casing) at the
 * shared control height, wide enough to tap.
 */
function expectAlignedQuietUndo(reading: UndoReading, completedThrough: number, rounds: number, label: string) {
  expect(reading.countText, `${label}: the dynamic count`).toBe(`${completedThrough} of ${rounds} rounds completed`)
  expect(Math.abs(reading.text.left - reading.count.left), `${label}: text starts with the count's text`).toBeLessThanOrEqual(TEXT_TOLERANCE)
  expect(Math.abs(reading.count.left - reading.groupLeft), `${label}: the count at the group's edge`).toBeLessThanOrEqual(TEXT_TOLERANCE)
  expect(Math.abs(reading.text.left - reading.groupLeft), `${label}: no inherited inset on the text`).toBeLessThanOrEqual(TEXT_TOLERANCE)
  const outside = reading.text.left - reading.button.left
  expect(outside, `${label}: the focus frame clears the first letter`).toBeGreaterThanOrEqual(2 * reading.borderWidth)
  expect(outside, `${label}: the box reaches past the text by its own inset`).toBeLessThanOrEqual(parseFloat(reading.quiet.paddingLeft) + TOLERANCE)
  if (reading.lines === 1) {
    expect(Math.abs(reading.button.right - reading.textRight - outside), `${label}: the same on the right`).toBeLessThanOrEqual(TOLERANCE)
  }
  expect(reading.button.top, `${label}: below Complete / Incomplete`).toBeGreaterThanOrEqual(reading.answer.bottom - TOLERANCE)
  expect(reading.button.bottom, `${label}: before Rounds completed`).toBeLessThanOrEqual(reading.legend.top + TOLERANCE)
  expect(reading.button.height, `${label}: the shared control height`).toBeGreaterThanOrEqual(reading.controlHeight - TOLERANCE)
  expect(reading.button.width, `${label}: usable width`).toBeGreaterThanOrEqual(reading.controlHeight)
  expect(reading.quiet.frame, `${label}: quiet, no frame at rest`).toBe(TRANSPARENT)
  expect(reading.quiet.fill, `${label}: quiet, no fill at rest`).toBe('none')
  expect(reading.quiet.scan, `${label}: quiet, no scanlines`).toBe('none')
  expect(reading.quiet.transform, `${label}: the quiet button's own casing`).toBe('uppercase')
}

async function attachReading(name: string, reading: UndoReading) {
  const measured = {
    textLeft: reading.text.left,
    countLeft: reading.count.left,
    groupLeft: reading.groupLeft,
    buttonLeft: reading.button.left,
    buttonRight: reading.button.right,
    textRight: reading.textRight,
    delta: reading.text.left - reading.count.left,
    insideLeft: reading.text.left - reading.button.left,
    insideRight: reading.button.right - reading.textRight,
    buttonHeight: reading.button.height,
    buttonWidth: reading.button.width,
    controlHeight: reading.controlHeight,
    lines: reading.lines,
    gapAbove: reading.button.top - reading.answer.bottom,
    gapBelow: reading.legend.top - reading.button.bottom,
    count: reading.countText,
  }
  await test.info().attach(`${name}.json`, { body: JSON.stringify(measured, null, 2), contentType: 'application/json' })
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

/** axe over the journey's screen after an interaction: every rule, every node, no exception. */
async function checkJourneyA11y(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  if (results.violations.length > 0) {
    await test.info().attach('axe-violations.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  }
  expect(results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target.join(' ')) }))).toEqual([])
}

/** Delivered-revision evidence of one card with its log, read in one taller viewport at the same width. */
async function attachLog(page: Page, card: Locator, name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 2600 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await settle(page)
    await test.info().attach(`${name}.png`, { body: await card.screenshot({ caret: 'hide' }), contentType: 'image/png' })
    // TASK-046: the log itself is in the open focused dialog.
    const open = page.locator('dialog.clr-accepted-log[open] [data-logging-frame]')
    if ((await open.count()) > 0) await test.info().attach(`${name}-log.png`, { body: await open.screenshot({ caret: 'hide' }), contentType: 'image/png' })
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

function resultColumns(body: Record<string, unknown>) {
  const { block_id, elapsed_seconds, completed_under_cap, rounds_completed, partial_round_reps, minutes_completed, highest_rung, perceived_effort, notes } = body
  return { block_id, elapsed_seconds, completed_under_cap, rounds_completed, partial_round_reps, minutes_completed, highest_rung, perceived_effort, notes }
}

const NOTHING_RECORDED = {
  elapsed_seconds: null, completed_under_cap: null, rounds_completed: null, partial_round_reps: null,
  minutes_completed: null, highest_rung: null, perceived_effort: null, notes: null,
}

async function saveSection(page: Page) {
  // TASK-046: the open log is closed first; the workout behind it is inert.
  await closeLog(page)
  await page.getByRole('button', { name: 'Next section', exact: true }).tap()
  await expect(page.getByRole('heading', { name: HANDOFF_COOLDOWN_TITLE, exact: true })).toBeVisible()
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-014 accidental Finish recovery with an aligned quiet Undo', () => {
  for (const [name, viewport] of [['phone-320', PHONE_320], ['phone-390', PHONE_390]] as const) {
    test(`JOURNEY-014 ${name} touch: the quiet Undo's text starts at the rounds-completed count's left edge for one- and two-digit ladders, and Undo returns the same attempt running or paused within its original cap; Finish again and the save records one truthful row each`, async ({ page, visit }) => {
      test.setTimeout(180_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page)
      await openWorkout(page, visit)
      await hold(page)
      const long = cardOf(page, 'long')
      const short = cardOf(page, 'short')

      // The twelve-round ladder: three rounds checked, then Finish at 02:00.
      await long.getByRole('button', { name: 'Start ladder', exact: true }).tap()
      await pass(page, 60)
      await liveTile(long, 3).tap()
      await pass(page, 60)
      await long.getByRole('button', { name: 'Finish', exact: true }).tap()
      await openLog(long)
      await expect.poll(() => chosen(completionOf(long))).toEqual(['Incomplete'])
      expect(await clockOf(page, 'long')).toEqual({ reading: '02:00', words: 'Finished' })
      await expect(undoOf(long)).toBeVisible()
      await settle(page)
      const longFirst = await readUndo(long)
      expectAlignedQuietUndo(longFirst, 3, LONG_ROUNDS, `long 3 @${name}`)
      await attachReading(`alignment-long-3-of-12-${name}`, longFirst)
      await noHorizontalOverflow(page)
      await attachLog(page, long, `long-finished-undo-${name}`)

      // Thirty seconds later, Undo: running on from the same start, nothing granted.
      await pass(page, 30)
      await undoOf(long).tap()
      // TASK-046: Undo closes the log in the same act.
      await expect(page.locator('dialog.clr-accepted-log[open]')).toHaveCount(0)
      await expect(undoOf(long)).toHaveCount(0)
      expect(await clockOf(page, 'long')).toEqual({ reading: '02:30', words: 'Racing the clock' })
      expect(await lifecycle(long)).toEqual(['Pause', 'Finish'])
      expect(await pressed(long.getByRole('list', { name: LADDER_ROUNDS_LIST, exact: true }))).toEqual(through(3))
      await expect(liveCount(long)).toHaveText(`3 of ${LONG_ROUNDS} rounds completed`)
      await openLog(long)
      expect(await chosen(completionOf(long))).toEqual([])
      await expect(roundsOf(long)).toHaveCount(0)
      await expect(undoOf(long)).toHaveCount(0)
      await closeLog(page)
      expect(app.posts).toEqual([])

      // More rounds, Finish again: a two-digit count, the same alignment.
      await liveTile(long, 10).tap()
      await long.getByRole('button', { name: 'Finish', exact: true }).tap()
      await openLog(long)
      await expect.poll(() => chosen(completionOf(long))).toEqual(['Incomplete'])
      await settle(page)
      const longSecond = await readUndo(long)
      expectAlignedQuietUndo(longSecond, 10, LONG_ROUNDS, `long 10 @${name}`)
      await attachReading(`alignment-long-10-of-12-${name}`, longSecond)

      // The four-round ladder, every round, paused, then Finish.
      await closeLog(page)
      await short.getByRole('button', { name: 'Start ladder', exact: true }).tap()
      for (const round of through(SHORT_ROUNDS)) {
        await pass(page, 10)
        await liveTile(short, round).tap()
      }
      await short.getByRole('button', { name: 'Pause', exact: true }).tap()
      await pass(page, 120)
      await short.getByRole('button', { name: 'Finish', exact: true }).tap()
      await openLog(short)
      await expect.poll(() => chosen(completionOf(short))).toEqual(['Complete'])
      await settle(page)
      expect(await clockOf(page, 'short')).toEqual({ reading: '00:40', words: 'Finished' })
      const shortReading = await readUndo(short)
      expectAlignedQuietUndo(shortReading, SHORT_ROUNDS, SHORT_ROUNDS, `short 4 @${name}`)
      await attachReading(`alignment-short-4-of-4-${name}`, shortReading)
      await attachLog(page, short, `short-finished-undo-${name}`)

      // Undo a paused Finish: paused again at the same moment, every round still checked.
      await undoOf(short).tap()
      expect(await clockOf(page, 'short')).toEqual({ reading: '00:40', words: 'Paused' })
      expect(await lifecycle(short)).toEqual(['Resume', 'Finish'])
      await pass(page, 60)
      expect((await clockOf(page, 'short')).reading).toBe('00:40')
      expect(await pressed(short.getByRole('list', { name: LADDER_ROUNDS_LIST, exact: true }))).toEqual(through(SHORT_ROUNDS))
      // Resumed; round four taken back; Finish again.
      await short.getByRole('button', { name: 'Resume', exact: true }).tap()
      await liveTile(short, 4).tap()
      await short.getByRole('button', { name: 'Finish', exact: true }).tap()
      await openLog(short)
      await expect.poll(() => chosen(completionOf(short))).toEqual(['Incomplete'])
      expect(await pressed(roundsOf(short))).toEqual(through(3))
      await settle(page)
      expectAlignedQuietUndo(await readUndo(short), 3, SHORT_ROUNDS, `short 3 @${name}`)
      // Both finished attempts still offer their Undo, inside their caps; axe
      // over the whole screen, every rule, no exception.
      await openLog(long)
      await expect(undoOf(long)).toBeVisible()
      await openLog(short)
      await expect(undoOf(short)).toBeVisible()
      await noHorizontalOverflow(page)
      await release(page)
      await checkJourneyA11y(page)

      // Saved: one row each, the rounds completed through and nothing else.
      await saveSection(page)
      expect(app.saves.map(resultColumns)).toEqual([
        { ...NOTHING_RECORDED, block_id: app.longBlockId, highest_rung: 10 },
        { ...NOTHING_RECORDED, block_id: app.shortBlockId, highest_rung: 3 },
      ])
      app.assertContained()
    })
  }

  test('JOURNEY-014 keyboard phone-390 reduced motion: the Undo is one tab stop between the answer and the first round, shows its focus, needs no confirmation, and hands the focus back to the restored Pause or Resume', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page, { reducedMotion: true })
    let dialogs = 0
    page.on('dialog', (dialog) => { dialogs += 1; void dialog.dismiss() })
    await openWorkout(page, visit)
    await hold(page)
    const long = cardOf(page, 'long')

    // Start, check two rounds and Finish, all by keyboard.
    await long.getByRole('button', { name: 'Start ladder', exact: true }).focus()
    await page.keyboard.press('Enter')
    await pass(page, 45)
    await liveTile(long, 2).focus()
    await page.keyboard.press('Space')
    await long.getByRole('button', { name: 'Finish', exact: true }).focus()
    await page.keyboard.press('Enter')
    await openLogByKeyboard(long)
    await expect.poll(() => chosen(completionOf(long))).toEqual(['Incomplete'])

    // The order: the answer's one stop, the Undo, then the first round.
    await completionOf(long).getByRole('radio', { name: 'Incomplete', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(undoOf(long)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(resultTile(long, 1, 'long')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(undoOf(long)).toBeFocused()
    await settle(page)
    const focused = await readUndo(long)
    expectAlignedQuietUndo({ ...focused, quiet: { ...focused.quiet, frame: TRANSPARENT } }, 2, LONG_ROUNDS, 'long keyboard @phone-390')
    // Its focus is visible: the shared focus frame, which it has only while focused.
    expect(focused.focusFrame).not.toBeNull()
    expect(focused.focusFrame).not.toBe(TRANSPARENT)
    await attachReading('alignment-long-2-of-12-keyboard-reduced-phone-390', focused)
    // The focused Undo with its surroundings: the focus frame clears the text
    // and stays inside the card.
    await undoOf(long).scrollIntoViewIfNeeded()
    const around = (await undoOf(long).boundingBox())!
    await test.info().attach('undo-focused-keyboard-reduced-phone-390.png', {
      body: await page.screenshot({ caret: 'hide', clip: { x: Math.max(0, around.x - 24), y: around.y - 16, width: around.width + 48, height: around.height + 32 } }),
      contentType: 'image/png',
    })
    await attachLog(page, long, 'long-undo-focused-keyboard-reduced-phone-390')

    // Enter: the attempt is back at once, no dialog; the focus is on Pause.
    // TASK-046: the log closes in the same act, so no dialog is left open.
    await page.keyboard.press('Enter')
    await expect(long.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()
    expect(dialogs).toBe(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(await clockOf(page, 'long')).toEqual({ reading: '00:45', words: 'Racing the clock' })

    // Paused, finished, undone by Space: the focus is on Resume.
    await page.keyboard.press('Enter')
    await expect(long.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
    await long.getByRole('button', { name: 'Finish', exact: true }).focus()
    await page.keyboard.press('Enter')
    await openLogByKeyboard(long)
    await undoOf(long).focus()
    await page.keyboard.press('Space')
    await expect(long.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
    expect(await clockOf(page, 'long')).toEqual({ reading: '00:45', words: 'Paused' })
    expect(dialogs).toBe(0)

    // Reduced motion: whatever the ladder animates is the app's hard cut.
    const timings = await long.evaluate((root) => root.getAnimations({ subtree: true }).map((animation) => {
      const timing = animation.effect!.getComputedTiming()
      return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
    }))
    for (const timing of timings) {
      expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
      expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
    }

    // Resume, Finish again: the Undo is offered and focusable again; axe.
    await page.keyboard.press('Enter')
    await long.getByRole('button', { name: 'Finish', exact: true }).focus()
    await page.keyboard.press('Enter')
    await openLogByKeyboard(long)
    await expect.poll(() => chosen(completionOf(long))).toEqual(['Incomplete'])
    await undoOf(long).focus()
    await noHorizontalOverflow(page)
    await release(page)
    await checkJourneyA11y(page)

    // Saved by keyboard (TASK-046: Escape closes the log first).
    await page.keyboard.press('Escape')
    await expect(logOf(long)).toHaveCount(0)
    const next = page.getByRole('button', { name: 'Next section', exact: true })
    await next.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: HANDOFF_COOLDOWN_TITLE, exact: true })).toBeVisible()
    expect(app.saves.map(resultColumns)).toEqual([
      { ...NOTHING_RECORDED, block_id: app.longBlockId, highest_rung: 2 },
      { ...NOTHING_RECORDED, block_id: app.shortBlockId },
    ])
    app.assertContained()
  })

  test('JOURNEY-014 recovery phone-390: the original cap withdraws Undo unprompted; a reload and a failed save keep it and the draft; a successful save ends it for good, even when a reload cannot read the row back', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page, { refuseFirstWrite: true })
    await openWorkout(page, visit)
    await hold(page)
    let long = cardOf(page, 'long')
    let short = cardOf(page, 'short')

    // The four-round ladder finished ten seconds before its 15:00 cap.
    await short.getByRole('button', { name: 'Start ladder', exact: true }).tap()
    await liveTile(short, 2).tap()
    await page.clock.fastForward((SHORT_CAP_SECONDS - 20) * 1000)
    await pass(page, 10)
    await short.getByRole('button', { name: 'Finish', exact: true }).tap()
    expect(await clockOf(page, 'short')).toEqual({ reading: '14:50', words: 'Finished' })
    await openLog(short)
    await expect(undoOf(short)).toBeVisible()
    await pass(page, 9)
    await expect(undoOf(short)).toBeVisible()
    // At the cap it would resume at, it is withdrawn with nothing pressed.
    await pass(page, 1)
    await expect(undoOf(short)).toHaveCount(0)
    expect(await clockOf(page, 'short')).toEqual({ reading: '14:50', words: 'Finished' })
    expect(await chosen(completionOf(short))).toEqual(['Incomplete'])
    expect(await pressed(roundsOf(short))).toEqual(through(2))

    // The twelve-round ladder: five rounds, Finish at 02:00, the log corrected to six.
    await closeLog(page)
    await long.getByRole('button', { name: 'Start ladder', exact: true }).tap()
    await pass(page, 120)
    await liveTile(long, 5).tap()
    await long.getByRole('button', { name: 'Finish', exact: true }).tap()
    await openLog(long)
    await expect.poll(() => chosen(completionOf(long))).toEqual(['Incomplete'])
    await resultTile(long, 6, 'long').tap()
    await expect(roundsOf(long).getByRole('status')).toHaveText(`6 of ${LONG_ROUNDS} rounds completed`)
    const finished = await attemptOf(page, app.longBlockId)
    expect(finished.checkpoint).toEqual({ pausedAt: null, progress: 5, completed: null })

    // A reload: the same Finish, its log and its Undo; the expired one stays gone.
    await pass(page, 20)
    await release(page)
    await reopen(page)
    long = cardOf(page, 'long')
    short = cardOf(page, 'short')
    await openLog(short)
    await expect(undoOf(short)).toHaveCount(0)
    await openLog(long)
    await expect(undoOf(long)).toBeVisible()
    expect(await clockOf(page, 'long')).toEqual({ reading: '02:00', words: 'Finished' })
    expect(await pressed(roundsOf(long))).toEqual(through(6))

    // The save is refused: nothing stored, nothing discarded, Undo still there.
    await closeLog(page)
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    const failed = page.getByRole('dialog')
    await expect(failed).toContainText('That didn’t save')
    expect(app.saves).toEqual([])
    await failed.getByRole('button', { name: 'Close', exact: true }).tap()
    await openLog(long)
    await expect(undoOf(long)).toBeVisible()
    expect(await chosen(completionOf(long))).toEqual(['Incomplete'])
    expect(await pressed(roundsOf(long))).toEqual(through(6))
    await reopen(page)
    long = cardOf(page, 'long')
    await openLog(long)
    await expect(undoOf(long)).toBeVisible()
    await settle(page)
    expectAlignedQuietUndo(await readUndo(long), 6, LONG_ROUNDS, 'long after a failed save @phone-390')

    // Undo: running on from the start it was stored with — the time spent
    // finished and closed counts (at least 02:00 + 20 s), none is granted.
    await undoOf(long).tap()
    await expect(page.locator('dialog.clr-accepted-log[open]')).toHaveCount(0)
    await expect(undoOf(long)).toHaveCount(0)
    const resumed = await attemptOf(page, app.longBlockId)
    expect(resumed.clock).toEqual({ startedAt: finished.clock.startedAt, finishedAt: null })
    expect(await expectRunningFrom(page, 'long', finished.clock.startedAt!, 'long resumed')).toBeGreaterThanOrEqual(140)
    expect(await pressed(long.getByRole('list', { name: LADDER_ROUNDS_LIST, exact: true }))).toEqual(through(6))
    await liveTile(long, 8).tap()
    await long.getByRole('button', { name: 'Finish', exact: true }).tap()
    await openLog(long)
    await expect.poll(() => chosen(completionOf(long))).toEqual(['Incomplete'])

    // Saved: one row each, the long ladder's once, never the refused attempt.
    await saveSection(page)
    expect(app.posts).toHaveLength(3)
    expect(app.saves.map(resultColumns)).toEqual([
      { ...NOTHING_RECORDED, block_id: app.longBlockId, highest_rung: 8 },
      { ...NOTHING_RECORDED, block_id: app.shortBlockId, highest_rung: 2 },
    ])
    const records = await page.evaluate(() => JSON.parse(localStorage.getItem('clear.workout-ladders') ?? '{}') as Record<string, { checkpoint: unknown; save: { status: string } }>)
    for (const id of [app.longBlockId, app.shortBlockId]) {
      expect(records[id], id).toMatchObject({ checkpoint: null, save: { status: 'saved' } })
    }

    // A reload that cannot read the saved rows back: still no Undo, nothing
    // to start or choose. TASK-048 (AC-R032-02, superseding "no draft
    // claimed"): each attempt this device saved shows the draft it saved —
    // Incomplete through 8 and through 2 — disabled, never a starting point.
    app.lane.performedReadable = false
    await reopen(page, false)
    await page.getByRole('button', { name: 'Previous', exact: true }).tap()
    await expect(page.getByText(LONG_TIMING_LINE, { exact: true })).toBeVisible()
    await settle(page)
    for (const [key, rung] of [['long', 8], ['short', 2]] as const) {
      const card = cardOf(page, key)
      expect(await lifecycle(card), key).toEqual([])
      await openLog(card)
      await expect(undoOf(card)).toHaveCount(0)
      expect(await chosen(completionOf(card)), key).toEqual(['Incomplete'])
      expect(await pressed(roundsOf(card)), key).toEqual(through(rung))
      for (const radio of await completionOf(card).getByRole('radio').all()) await expect(radio).toBeDisabled()
    }
    await checkJourneyA11y(page)
    expect(app.posts).toHaveLength(3)
    app.assertContained()
  })

  test('JOURNEY-014 gallery ladder-4 and ladder-12 at phone-320 and phone-390: the actual ladder renderer draws the aligned quiet Undo and brings the same attempt back, over memory only', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    for (const [name, viewport] of [['phone-320', PHONE_320], ['phone-390', PHONE_390]] as const) {
      await page.setViewportSize(viewport)
      for (const rounds of [4, 12] as const) {
        await visit(`/gallery/refinements?state=ladder-${rounds}`)
        const state = page.locator(`[data-refinement-state="ladder-${rounds}"]`)
        const card = state.locator('[data-workout-card="workout"]')
        await card.getByRole('button', { name: 'Start ladder', exact: true }).tap()
        await liveTile(card, 2).tap()
        await card.getByRole('button', { name: 'Finish', exact: true }).tap()
        await openLog(card)
        await expect.poll(() => chosen(completionOf(card))).toEqual(['Incomplete'])
        await settle(page)
        const reading = await readUndo(card)
        expectAlignedQuietUndo(reading, 2, rounds, `gallery ladder-${rounds} @${name}`)
        await attachReading(`alignment-gallery-ladder-${rounds}-${name}`, reading)
        await noHorizontalOverflow(page)
        await checkJourneyA11y(page)
        await attachLog(page, card, `gallery-ladder-${rounds}-undo-${name}`)

        await undoOf(card).tap()
        await expect(page.locator('dialog.clr-accepted-log[open]')).toHaveCount(0)
        await expect(undoOf(card)).toHaveCount(0)
        expect(await lifecycle(card)).toEqual(['Pause', 'Finish'])
        expect(await pressed(card.getByRole('list', { name: LADDER_ROUNDS_LIST, exact: true }))).toEqual(through(2))
        await expect(liveCount(card)).toHaveText(`2 of ${rounds} rounds completed`)
        expect(await page.evaluate(() => [localStorage.getItem('clear.workout-ladders'), localStorage.getItem('clear.workout-for-time')])).toEqual([null, null])
      }
    }
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
