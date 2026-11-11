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
  LONG_CAP_SECONDS,
  LONG_ROUNDS,
  LONG_TARGETS,
  LONG_TIMING_LINE,
  LONG_UNIT,
  ROUNDS_COMPLETED,
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
 * TASK-013 (REQ-013; C33, C34, C36; R69, R77, R88, R89, R92, R93, R99, R118,
 * R124; AC-C33-01, AC-C34-01, AC-C36-01, AC-R013-01, AC-R013-02, AC-R013-03;
 * JOURNEY-013) — rep-first ordered live ladder progress and its result handoff
 * on the real `/workout` route.
 *
 * Entry (ENTRY-013): a running session, behind the existing auth guard, whose
 * first section holds two true timed ladders shaped unlike each other and
 * unlike the accepted screenshot — twelve rungs of kettlebell swing 3 → 36
 * reps with a fixed 200 m row inside one 09:00 cap, and four rungs of plank
 * 5 → 20 seconds raced For Time under a 15:00 cap — and whose second is a
 * cooldown (`src/test/ladder-handoff-fixture.ts`). Action: Start, tap rungs
 * while the work goes on, by touch and by keyboard, then Finish or let the cap
 * run out, correct the log, and save. Result, read from the browser at phone
 * widths: the checked prefix and its count while running; the same prefix
 * imported into the editable end log as wrapping rep-first tiles — target
 * largest, round secondary, unit distinct, every row level for one- and
 * two-digit targets, no check glyph and no sideways scroll; the saved row
 * records only the rounds completed through; a reload keeps all of it.
 *
 * Synthetic and contained: an intercepted session for a fictional user, the
 * browser clock Playwright's. The only writes allowed are the section's own
 * `block_results` inserts on its forward action — recorded here as the
 * requests the app sent and answered as PostgREST would, never forwarded. This
 * is the app's own write contract on a synthetic origin, not backend
 * persistence proof (`e2e/design-0143/workout-ladder.spec.ts` is the ladder's
 * backend lane).
 */
const OWNER = '00000000-0000-4000-8000-000000001301'
const PLACE = '00000000-0000-4000-8000-000000001311'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The browser's clock at entry; the session has run for one minute. */
const ENTRY = Date.parse('2026-11-10T09:00:00.000Z')

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
    if (code !== null) throw new Error(`Synthetic TASK-013 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-013 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-013.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-013-public-placeholder',
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

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

type BlockResultBody = Record<string, unknown>

async function syntheticApp(page: Page, options: { reducedMotion?: boolean } = {}) {
  const running: SessionSnapshot = sessionSnapshotSchema.parse(ladderHandoffSnapshot(ladderHandoffAcceptance({ locationId: PLACE }), {
    userId: OWNER,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  }))
  const saves: BlockResultBody[] = []
  const stored = new Map<string, BlockResultBody>()
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
    if (request.method() === 'POST' && url.pathname.endsWith('/rest/v1/block_results')) {
      // Each block's own row, exactly as the app sent it.
      const body = request.postDataJSON() as BlockResultBody | BlockResultBody[]
      const row = Array.isArray(body) ? body[0] : body
      saves.push(row)
      const id = `00000000-0000-4000-8000-${String(1300 + stored.size).padStart(12, '0')}`
      const answered = { id, created_at: '2026-11-10T09:20:00.000Z', ...row }
      stored.set(String(row.block_id), answered)
      return reply([answered], 201)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') {
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
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-013 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-013-session', refreshToken: 'synthetic-task-013-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-013@example.invalid' },
    }))
  }, { owner: OWNER })

  const [long, short] = running.sections[0].blocks.map((entry) => entry.block.id)
  return {
    longBlockId: long,
    shortBlockId: short,
    saves,
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

/** JOURNEY-013's entry: the running session's `/workout`, both ladders ready. */
async function openWorkout(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByText(LONG_TIMING_LINE, { exact: true })).toBeVisible()
  await expect(page.getByText(SHORT_TIMING_LINE, { exact: true })).toBeVisible()
  await settle(page)
}

/** Time passes on the browser's own clock, and its interval repaints run. */
async function pass(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1000)
}

type LadderKey = 'long' | 'short'
const TIMING_LINES: Readonly<Record<LadderKey, string>> = { long: LONG_TIMING_LINE, short: SHORT_TIMING_LINE }
const TARGETS: Readonly<Record<LadderKey, readonly number[]>> = { long: LONG_TARGETS, short: SHORT_TARGETS }
const UNITS: Readonly<Record<LadderKey, string>> = { long: LONG_UNIT, short: SHORT_UNIT }

function cardOf(scope: Page | Locator, key: LadderKey): Locator {
  const page = 'page' in scope ? scope.page() : scope
  return scope.locator('[data-workout-card="workout"]').filter({ has: page.getByText(TIMING_LINES[key], { exact: true }) })
}

/** The block's clock: the reading beside its card, in its own stack. */
async function blockTime(page: Page, key: LadderKey): Promise<string> {
  const stack = page.locator('main .clr-stack').filter({ has: cardOf(page, key) }).last()
  const text = (await stack.getByRole('timer').first().textContent()) ?? ''
  return /\d{2}:\d{2}/.exec(text)?.[0] ?? ''
}

function liveTile(card: Locator, round: number): Locator {
  return card.getByRole('list', { name: LADDER_ROUNDS_LIST, exact: true }).locator(`:scope > li[data-ladder-round="${round}"]`).getByRole('button')
}

function liveCount(card: Locator): Locator {
  return card.locator('[data-ladder-prescription]').getByRole('status')
}

/**
 * TASK-046 (C45; R100): each ladder's card holds one "Log results" action
 * where its log was; the log — the same form — opens in the shared focused
 * dialog titled "Log results". One log is open at a time, over a workout
 * that is inert while it is open.
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

/** The open log's completion question. */
function completionOf(card: Locator): Locator {
  return logOf(card).getByRole('group', { name: WORK_COMPLETED, exact: true })
}

/** The open log's rounds completed. */
function roundsOf(card: Locator): Locator {
  return logOf(card).getByRole('group', { name: ROUNDS_COMPLETED, exact: true })
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

const through = (count: number) => Array.from({ length: count }, (_, index) => index + 1)

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number }
interface Row { top: number; height: number; fontSize: number; text: string; clipped: boolean }

interface ResultTilesReading {
  log: Box
  grid: Box
  gridScroll: { scrollWidth: number; clientWidth: number }
  columns: number
  count: string
  selectedRole: string
  tiles: {
    name: string
    pressed: boolean
    frame: string
    box: Box
    rows: Row[]
    glyphs: number
    clipped: boolean
  }[]
}

/** One ladder's rep-first result tiles, as the browser lays them out once their transitions land (TASK-046: in its open log). */
async function readResultTiles(card: Locator): Promise<ResultTilesReading> {
  return logOf(card).evaluate(async (root, legend) => {
    const group = [...root.querySelectorAll('fieldset')].find((node) => node.querySelector('legend')?.textContent === legend)
    if (group === undefined) throw new Error('No rounds completed in this card')
    await Promise.all(group.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined)))
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const probe = document.createElement('span')
    probe.style.color = 'var(--border-selected)'
    group.append(probe)
    const selectedRole = getComputedStyle(probe).color
    probe.remove()
    const grid = group.querySelector('.clr-ladder-completion__tiles')!
    const tiles = [...grid.querySelectorAll<HTMLElement>('.clr-ladder-completion__tile')].map((tile) => {
      const rows = [...tile.querySelector('.clr-ladder-completion__content')!.children].map((row) => {
        const rect = row.getBoundingClientRect()
        return {
          top: rect.top, height: rect.height,
          fontSize: parseFloat(getComputedStyle(row).fontSize),
          text: row.textContent ?? '',
          clipped: row.scrollWidth > row.clientWidth + 1,
        }
      })
      return {
        name: tile.getAttribute('aria-label') ?? '',
        pressed: tile.getAttribute('aria-pressed') === 'true',
        frame: getComputedStyle(tile, '::after').backgroundColor,
        box: box(tile),
        rows,
        glyphs: [...tile.querySelectorAll('svg')].filter((svg) => {
          const rect = svg.getBoundingClientRect()
          return getComputedStyle(svg).display !== 'none' && rect.width > 0 && rect.height > 0
        }).length,
        clipped: tile.scrollWidth > tile.clientWidth + 1,
      }
    })
    return {
      log: box(root),
      grid: box(grid),
      gridScroll: { scrollWidth: grid.scrollWidth, clientWidth: grid.clientWidth },
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter((track) => track !== '').length,
      count: group.querySelector('[role="status"]')?.textContent ?? '',
      selectedRole,
      tiles,
    }
  }, ROUNDS_COMPLETED)
}

/**
 * C33, C34, AC-R013-02 from the browser: every rung a tile, wrapping into more
 * than one column inside the log with no sideways scroll; three rows each —
 * round, target, unit — the target the largest; every row level across a
 * grid row and at the same place in every tile, whether its target has one
 * digit or two; nothing clipped; no check glyph; the prefix pressed on the
 * shared selected frame.
 */
function expectRepFirstTiles(reading: ResultTilesReading, key: LadderKey, completedThrough: number, label: string) {
  const targets = TARGETS[key]
  expect(reading.tiles.map((tile) => tile.name), `${label}: every rung, named by round and target`)
    .toEqual(targets.map((target, index) => `Round ${index + 1}: ${target} ${UNITS[key]}`))
  expect(reading.tiles.map((tile) => tile.rows.map((row) => row.text)), `${label}: rows`)
    .toEqual(targets.map((target, index) => [`R${index + 1}`, String(target), UNITS[key]]))
  expect(reading.columns, `${label}: wraps into columns`).toBeGreaterThan(1)
  expect(reading.gridScroll.scrollWidth, `${label}: no sideways scroll`).toBeLessThanOrEqual(reading.gridScroll.clientWidth + TOLERANCE)
  expect(reading.grid.left, `${label}: inside the log`).toBeGreaterThanOrEqual(reading.log.left - TOLERANCE)
  expect(reading.grid.right, `${label}: inside the log`).toBeLessThanOrEqual(reading.log.right + TOLERANCE)
  const first = reading.tiles[0]
  const offsets = first.rows.map((row) => row.top - first.box.top)
  const byRow = new Map<number, ResultTilesReading['tiles']>()
  for (const tile of reading.tiles) {
    const [round, number, unit] = tile.rows
    // R99: the rep target is the largest text; the round and unit secondary.
    expect(number.fontSize, `${label} ${tile.name}: target largest`).toBeGreaterThan(round.fontSize)
    expect(number.fontSize, `${label} ${tile.name}: target over unit`).toBeGreaterThan(unit.fontSize)
    // R93: each row at the same place in every tile.
    tile.rows.forEach((row, index) => {
      expect(Math.abs(row.top - tile.box.top - offsets[index]), `${label} ${tile.name}: row ${index} level`).toBeLessThanOrEqual(TOLERANCE)
      expect(row.clipped, `${label} ${tile.name}: row ${index} unclipped`).toBe(false)
    })
    expect(tile.clipped, `${label} ${tile.name}: unclipped`).toBe(false)
    expect(tile.glyphs, `${label} ${tile.name}: no check glyph`).toBe(0)
    expect(tile.box.left).toBeGreaterThanOrEqual(reading.grid.left - TOLERANCE)
    expect(tile.box.right).toBeLessThanOrEqual(reading.grid.right + TOLERANCE)
    const top = Math.round(tile.box.top)
    byRow.set(top, [...(byRow.get(top) ?? []), tile])
  }
  expect(byRow.size, `${label}: rows of tiles`).toBe(Math.ceil(reading.tiles.length / reading.columns))
  for (const row of byRow.values()) {
    for (const index of [0, 1, 2]) {
      const tops = row.map((tile) => tile.rows[index].top)
      expect(Math.max(...tops) - Math.min(...tops), `${label}: row ${index} level across a grid row`).toBeLessThanOrEqual(TOLERANCE)
    }
    const heights = row.map((tile) => tile.box.height)
    expect(Math.max(...heights) - Math.min(...heights), `${label}: tiles level`).toBeLessThanOrEqual(TOLERANCE)
  }
  // C34: the selected prefix, on the shared selected frame, and its count.
  expect(reading.tiles.map((tile) => tile.pressed), `${label}: prefix`).toEqual(targets.map((_, index) => index < completedThrough))
  for (const tile of reading.tiles) {
    if (tile.pressed) expect(tile.frame, `${label} ${tile.name}: selected frame`).toBe(reading.selectedRole)
    else expect(tile.frame, `${label} ${tile.name}: unselected frame`).not.toBe(reading.selectedRole)
  }
  expect(reading.count).toBe(`${completedThrough} of ${targets.length} rounds completed`)
}

interface LiveReading {
  grid: Box
  gridScroll: { scrollWidth: number; clientWidth: number }
  columns: number
  tiles: { pressed: boolean; box: Box; labelTop: number; glyphs: number; clipped: boolean }[]
}

/** The live check-off's tiles, as laid out while the race runs. */
async function readLiveTiles(card: Locator): Promise<LiveReading> {
  return card.evaluate((root, list) => {
    const grid = root.querySelector(`ol[aria-label="${list}"]`)!
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    return {
      grid: box(grid),
      gridScroll: { scrollWidth: grid.scrollWidth, clientWidth: grid.clientWidth },
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter((track) => track !== '').length,
      tiles: [...grid.querySelectorAll(':scope > li button')].map((tile) => ({
        pressed: tile.getAttribute('aria-pressed') === 'true',
        box: box(tile),
        labelTop: tile.querySelector('.clr-ladder-prescription__label')!.getBoundingClientRect().top,
        glyphs: [...tile.querySelectorAll('svg')].filter((svg) => getComputedStyle(svg).display !== 'none' && svg.getBoundingClientRect().width > 0).length,
        clipped: tile.scrollWidth > tile.clientWidth + 1,
      })),
    }
  }, LADDER_ROUNDS_LIST)
}

function expectLiveTiles(reading: LiveReading, rounds: number, completedThrough: number, label: string) {
  expect(reading.tiles, `${label}: every round a toggle`).toHaveLength(rounds)
  expect(reading.tiles.map((tile) => tile.pressed), `${label}: prefix`).toEqual(through(rounds).map((n) => n <= completedThrough))
  expect(reading.columns, `${label}: wraps`).toBeGreaterThan(1)
  expect(reading.gridScroll.scrollWidth, `${label}: no sideways scroll`).toBeLessThanOrEqual(reading.gridScroll.clientWidth + TOLERANCE)
  const byRow = new Map<number, LiveReading['tiles']>()
  for (const tile of reading.tiles) {
    expect(tile.glyphs, `${label}: no check glyph`).toBe(0)
    expect(tile.clipped, `${label}: unclipped`).toBe(false)
    const top = Math.round(tile.box.top)
    byRow.set(top, [...(byRow.get(top) ?? []), tile])
  }
  for (const row of byRow.values()) {
    const labels = row.map((tile) => tile.labelTop)
    expect(Math.max(...labels) - Math.min(...labels), `${label}: round labels level`).toBeLessThanOrEqual(TOLERANCE)
    const heights = row.map((tile) => tile.box.height)
    expect(Math.max(...heights) - Math.min(...heights), `${label}: tiles level`).toBeLessThanOrEqual(TOLERANCE)
  }
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

/** Delivered-revision evidence of one card, read in one taller viewport at the same width. */
async function attachCard(page: Page, card: Locator, name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 2600 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await settle(page)
    await test.info().attach(`${name}.png`, { body: await card.screenshot({ caret: 'hide' }), contentType: 'image/png' })
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

test.describe('TASK-013 rep-first ordered live ladder progress and result handoff', () => {
  for (const [name, viewport] of [['phone-320', PHONE_320], ['phone-390', PHONE_390]] as const) {
    test(`JOURNEY-013 ${name} touch: rounds checked off live carry into the editable end log at the cap and at Finish, as level rep-first wrapping tiles, and the save records only the rounds completed`, async ({ page, visit }) => {
      test.setTimeout(180_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page)
      await openWorkout(page, visit)
      const long = cardOf(page, 'long')
      const short = cardOf(page, 'short')

      // The twelve-rung ladder: Start, then check rounds off as they are done.
      await long.getByRole('button', { name: 'Start ladder', exact: true }).tap()
      await expect(liveCount(long)).toHaveText('No rounds marked yet')
      await pass(page, 60)
      await liveTile(long, 3).tap()
      await expect(liveCount(long)).toHaveText(`3 of ${LONG_ROUNDS} rounds completed`)
      await pass(page, 60)
      await liveTile(long, 5).tap()
      // A tap inside the prefix leaves the rounds before it; then on again.
      await liveTile(long, 5).tap()
      expect(await pressed(long.getByRole('list', { name: LADDER_ROUNDS_LIST, exact: true }))).toEqual(through(4))
      await liveTile(long, 5).tap()
      await expect(liveCount(long)).toHaveText(`5 of ${LONG_ROUNDS} rounds completed`)
      await settle(page)
      expectLiveTiles(await readLiveTiles(long), LONG_ROUNDS, 5, `long live @${name}`)
      await noHorizontalOverflow(page)
      await checkJourneyA11y(page)
      await attachCard(page, long, `long-live-checked-${name}`)

      // The four-rung ladder: every round checked, then Finish.
      await short.getByRole('button', { name: 'Start ladder', exact: true }).tap()
      for (const round of through(SHORT_ROUNDS)) {
        await pass(page, 20)
        await liveTile(short, round).tap()
      }
      await expect(liveCount(short)).toHaveText(`${SHORT_ROUNDS} of ${SHORT_ROUNDS} rounds completed`)
      expectLiveTiles(await readLiveTiles(short), SHORT_ROUNDS, SHORT_ROUNDS, `short live @${name}`)
      await short.getByRole('button', { name: 'Finish', exact: true }).tap()
      // Imported: every round checked starts Complete, every tile pressed.
      // TASK-046: read in the log the card's "Log results" opens.
      await openLog(short)
      await expect.poll(() => chosen(completionOf(short))).toEqual(['Complete'])
      await settle(page)
      expectRepFirstTiles(await readResultTiles(short), 'short', SHORT_ROUNDS, `short finished @${name}`)
      await attachCard(page, short, `short-finish-complete-${name}`)
      // Editable: the athlete says the last round was not done.
      await resultTile(short, 4, 'short').tap()
      await expect.poll(() => chosen(completionOf(short))).toEqual(['Incomplete'])
      await expect(roundsOf(short).getByText('Any partial work belongs to round 4', { exact: true })).toBeVisible()

      // The cap: the twelve-rung ladder runs out with five rounds checked —
      // imported as they were, never every rung. (The browser clock jumps to
      // past the cap, as a phone left on the floor would, and ticks once.)
      await closeLog(page)
      await page.clock.fastForward(LONG_CAP_SECONDS * 1000)
      await pass(page, 1)
      await expect(long.locator('[data-timed-actions]')).toHaveCount(0)
      await expect(long.getByRole('list', { name: LADDER_ROUNDS_LIST, exact: true }).getByRole('button')).toHaveCount(0)
      await openLog(long)
      await expect.poll(() => chosen(completionOf(long))).toEqual(['Incomplete'])
      await settle(page)
      expectRepFirstTiles(await readResultTiles(long), 'long', 5, `long capped @${name}`)
      await expect(roundsOf(long).getByText('Any partial work belongs to round 6', { exact: true })).toBeVisible()
      await noHorizontalOverflow(page)
      await checkJourneyA11y(page)
      await attachCard(page, long, `long-cap-incomplete-${name}`)

      // The save: the rounds completed through, and nothing else.
      await saveSection(page)
      expect(app.saves.map(resultColumns)).toEqual([
        { ...NOTHING_RECORDED, block_id: app.longBlockId, highest_rung: 5 },
        { ...NOTHING_RECORDED, block_id: app.shortBlockId, highest_rung: 3 },
      ])
      app.assertContained()
    })
  }

  test('JOURNEY-013 keyboard phone-390 reduced motion: rounds are checked off and corrected by keyboard, the count is announced, Finish with nothing more imports only what was checked, and nothing moves beyond the hard cut', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page, { reducedMotion: true })
    await openWorkout(page, visit)
    const long = cardOf(page, 'long')
    const short = cardOf(page, 'short')

    // Start by keyboard; Pause has the focus; Tab past Finish reaches round 1.
    await long.getByRole('button', { name: 'Start ladder', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(long.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(long.getByRole('button', { name: 'Finish', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(liveTile(long, 1)).toBeFocused()
    await page.keyboard.press('Space')
    await expect(liveTile(long, 1)).toHaveAttribute('aria-pressed', 'true')
    await expect(liveCount(long)).toHaveText(`1 of ${LONG_ROUNDS} rounds completed`)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(liveTile(long, 3)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(liveCount(long)).toHaveText(`3 of ${LONG_ROUNDS} rounds completed`)
    // The count is a polite live region: announced on each change.
    await expect(liveCount(long)).toHaveAttribute('role', 'status')
    await expect(liveTile(long, 3)).toBeFocused()

    // Finish by keyboard: three rounds imported, Incomplete (TASK-046: in
    // the log the card's "Log results" opens, by keyboard).
    await long.getByRole('button', { name: 'Finish', exact: true }).focus()
    await page.keyboard.press('Enter')
    await openLogByKeyboard(long)
    await expect.poll(() => chosen(completionOf(long))).toEqual(['Incomplete'])
    expect(await pressed(roundsOf(long))).toEqual(through(3))

    // The log by keyboard: the answer's one stop, then each round in order.
    // TASK-014 (AC-C39-01, AC-R014-01): while this Finish can be undone, the
    // quiet Undo sits below Complete / Incomplete and before Rounds completed,
    // so it is the one stop between them.
    await completionOf(long).getByRole('radio', { name: 'Incomplete', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(logOf(long).getByRole('button', { name: 'Undo finish · Resume ladder', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(resultTile(long, 1, 'long')).toBeFocused()
    for (let step = 1; step < 7; step += 1) await page.keyboard.press('Tab')
    await expect(resultTile(long, 7, 'long')).toBeFocused()
    await page.keyboard.press('Space')
    await expect(roundsOf(long).getByRole('status')).toHaveText(`7 of ${LONG_ROUNDS} rounds completed`)
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(roundsOf(long).getByRole('status')).toHaveText(`5 of ${LONG_ROUNDS} rounds completed`)

    // The short ladder finished with nothing checked: Incomplete, no round
    // stated, nothing recorded — Finish alone never selects every round.
    // TASK-046: Escape closes the long ladder's log first.
    await page.keyboard.press('Escape')
    await expect(logOf(long)).toHaveCount(0)
    await short.getByRole('button', { name: 'Start ladder', exact: true }).focus()
    await page.keyboard.press('Enter')
    await pass(page, 45)
    await short.getByRole('button', { name: 'Finish', exact: true }).focus()
    await page.keyboard.press('Enter')
    await openLogByKeyboard(short)
    await expect.poll(() => chosen(completionOf(short))).toEqual(['Incomplete'])
    expect(await pressed(roundsOf(short))).toEqual([])
    await expect(roundsOf(short).getByRole('status')).toHaveText('No rounds marked yet')

    // Reduced motion: whatever the ladder animates is the app's hard cut.
    for (const card of [long, short]) {
      const timings = await card.evaluate((root) => root.getAnimations({ subtree: true }).map((animation) => {
        const timing = animation.effect!.getComputedTiming()
        return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
      }))
      for (const timing of timings) {
        expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
        expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
      }
    }
    await page.keyboard.press('Escape')
    await expect(logOf(short)).toHaveCount(0)
    await openLogByKeyboard(long)
    await settle(page)
    expectRepFirstTiles(await readResultTiles(long), 'long', 5, 'long keyboard @phone-390')
    await noHorizontalOverflow(page)
    await checkJourneyA11y(page)
    await attachCard(page, long, 'long-keyboard-corrected-reduced-phone-390')

    // Saved by keyboard (TASK-046: Escape closes the log first).
    await page.keyboard.press('Escape')
    await expect(logOf(long)).toHaveCount(0)
    const next = page.getByRole('button', { name: 'Next section', exact: true })
    await next.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: HANDOFF_COOLDOWN_TITLE, exact: true })).toBeVisible()
    expect(app.saves.map(resultColumns)).toEqual([
      { ...NOTHING_RECORDED, block_id: app.longBlockId, highest_rung: 5 },
      { ...NOTHING_RECORDED, block_id: app.shortBlockId },
    ])
    app.assertContained()
  })

  test('JOURNEY-013 recovery phone-390: a reload keeps checked progress and the pause, and keeps the edited log after Finish; the save records the edit once', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(PHONE_390)
    const app = await syntheticApp(page)
    await openWorkout(page, visit)
    let long = cardOf(page, 'long')

    await long.getByRole('button', { name: 'Start ladder', exact: true }).tap()
    await pass(page, 75)
    await liveTile(long, 4).tap()
    await long.getByRole('button', { name: 'Pause', exact: true }).tap()
    const frozen = await blockTime(page, 'long')
    expect(frozen).toBe('01:15')

    // Close and reopen.
    await pass(page, 300)
    await page.reload()
    await expect(page.getByText(LONG_TIMING_LINE, { exact: true })).toBeVisible()
    await settle(page)
    long = cardOf(page, 'long')
    await expect(long.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
    expect(await blockTime(page, 'long')).toBe(frozen)
    expect(await pressed(long.getByRole('list', { name: LADDER_ROUNDS_LIST, exact: true }))).toEqual(through(4))
    await expect(liveCount(long)).toHaveText(`4 of ${LONG_ROUNDS} rounds completed`)

    // Resume, finish, correct; reload again.
    await long.getByRole('button', { name: 'Resume', exact: true }).tap()
    await liveTile(long, 6).tap()
    await long.getByRole('button', { name: 'Finish', exact: true }).tap()
    await openLog(long)
    await expect.poll(() => chosen(completionOf(long))).toEqual(['Incomplete'])
    await resultTile(long, 9, 'long').tap()
    await expect(roundsOf(long).getByRole('status')).toHaveText(`9 of ${LONG_ROUNDS} rounds completed`)
    await page.reload()
    await expect(page.getByText(LONG_TIMING_LINE, { exact: true })).toBeVisible()
    await settle(page)
    long = cardOf(page, 'long')
    // The edit comes back as the athlete left it — never re-imported over.
    await openLog(long)
    await expect.poll(() => chosen(completionOf(long))).toEqual(['Incomplete'])
    expect(await pressed(roundsOf(long))).toEqual(through(9))
    expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('clear.workout-ladders') ?? '{}')).length)).toBe(1)
    expect(await page.evaluate(() => localStorage.getItem('clear.workout-for-time'))).toBeNull()
    await checkJourneyA11y(page)

    await saveSection(page)
    expect(app.saves.map(resultColumns)).toEqual([
      { ...NOTHING_RECORDED, block_id: app.longBlockId, highest_rung: 9 },
      { ...NOTHING_RECORDED, block_id: app.shortBlockId },
    ])
    app.assertContained()
  })

  test('JOURNEY-013 gallery ladder-4 and ladder-12 phone-320: the actual ladder renderer checks rounds off live and hands them to its rep-first log, over memory only', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(PHONE_320)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    for (const rounds of [4, 12] as const) {
      await visit(`/gallery/refinements?state=ladder-${rounds}`)
      const state = page.locator(`[data-refinement-state="ladder-${rounds}"]`)
      const card = state.locator('[data-workout-card="workout"]')
      await card.getByRole('button', { name: 'Start ladder', exact: true }).tap()
      await liveTile(card, 2).tap()
      await expect(liveCount(card)).toHaveText(`2 of ${rounds} rounds completed`)
      expectLiveTiles(await readLiveTiles(card), rounds, 2, `gallery ladder-${rounds} live`)
      await card.getByRole('button', { name: 'Finish', exact: true }).tap()
      await openLog(card)
      await expect.poll(() => chosen(completionOf(card))).toEqual(['Incomplete'])
      const reading = await readResultTiles(card)
      expect(reading.tiles.map((tile) => tile.name)).toEqual(through(rounds).map((round) => `Round ${round}: ${round * 2} reps`))
      expect(reading.tiles.map((tile) => tile.pressed)).toEqual(through(rounds).map((round) => round <= 2))
      expect(reading.columns).toBeGreaterThan(1)
      expect(reading.gridScroll.scrollWidth).toBeLessThanOrEqual(reading.gridScroll.clientWidth + TOLERANCE)
      expect(reading.tiles.every((tile) => tile.glyphs === 0 && !tile.clipped)).toBe(true)
      await noHorizontalOverflow(page)
      await checkJourneyA11y(page)
      await test.info().attach(`gallery-ladder-${rounds}-handoff-phone-320.png`, { body: await card.screenshot({ caret: 'hide' }), contentType: 'image/png' })
      await test.info().attach(`gallery-ladder-${rounds}-handoff-log-phone-320.png`, { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
      await closeLog(page)
      expect(await page.evaluate(() => [localStorage.getItem('clear.workout-ladders'), localStorage.getItem('clear.workout-for-time')])).toEqual([null, null])
    }
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
