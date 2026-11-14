import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import {
  COMPACT_LADDER_KEYS,
  EXPECTED,
  compactLadderAcceptance,
  compactLadderSnapshot,
  type CompactLadderKey,
} from '../../src/test/compact-ladder-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-012 (REQ-012; C35; R65, R70, R71, R72, R94, R95, R117; V11;
 * AC-C35-01, AC-R012-01, AC-R012-02; JOURNEY-012) — the compact truthful
 * ladder prescription on the real `/review` and `/workout` routes.
 *
 * Entry: three ladders shaped as differently as the data allows — the
 * accepted twelve-round push up and burpee ladder (07:00 capped window), a
 * loaded descending kettlebell swing with a fixed 250 m row (10:00 For Time
 * cap) and a timed plank pyramid with a fixed per-side lunge on a schedule
 * with no cap (`src/test/compact-ladder-fixture.ts`) — reach `/review` through
 * the existing Review hand-off, behind the existing auth guard. Action: read
 * each ladder before starting, Start, and read it again while tracking its
 * rounds, by touch and by keyboard, through Pause, Finish and a close and
 * reopen. Result, read from the browser at phone widths: each movement's
 * concise progression and every round's movement targets — the fixed
 * companion in each — in a compact grid that wraps into columns without
 * horizontal overflow, its rows level, in the same words on both routes; no
 * "same every round" suffix and no "Move through the rounds" paragraph.
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads. The only writes the app attempts are Start's two session
 * calls, answered here and never forwarded; no set or block result is logged,
 * no model is called and no real account or row exists to mutate.
 */
const OWNER = '00000000-0000-4000-8000-000000001201'
const PLACE = '00000000-0000-4000-8000-000000001211'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

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
    if (code !== null) throw new Error(`Synthetic TASK-012 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-012 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-012.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-012-public-placeholder',
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

type Context = 'review' | 'workout'

/** Sub-pixel tolerance for geometry read from the browser. */
const TOLERANCE = 1

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

async function syntheticApp(page: Page, acceptance: SessionAcceptance, options: { reducedMotion?: boolean } = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = sessionSnapshotSchema.parse(compactLadderSnapshot(acceptance, { userId: OWNER }))
  const running: SessionSnapshot = sessionSnapshotSchema.parse(
    compactLadderSnapshot(acceptance, { userId: OWNER, startedAt }),
  )
  const writes: string[] = []
  const unexpected: string[] = []
  let started = false
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: options.reducedMotion ?? true })

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
      if (name === 'resume_session') return reply(started ? running : null)
      if (name === 'session_snapshot') return reply(started ? running : prescribed)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'persist_session') {
        writes.push(name)
        expect(request.postDataJSON()).toMatchObject({ p_user_id: OWNER, p_session: { workout: { title: acceptance.workout.title } } })
        return reply(prescribed)
      }
      if (name === 'start_session') {
        writes.push(name)
        started = true
        return reply({ outcome: 'started', state: 'active', session: running.session })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history', 'generation_refusal_diagnostics',
        'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    // Anything else is a write this journey must never make.
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-012 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-012-session', refreshToken: 'synthetic-task-012-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-012@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-task-012', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(acceptance) })

  return {
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Only Start’s session calls are attempted, once each; no set or result is written').toEqual(['persist_session', 'start_session'])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
  // A screen entering is read once its finite transitions have finished, and
  // once every heading on it has its name: a freshly mounted workout names its
  // grouped Coaching and notes sections a moment after its cards (TASK-005's
  // owner, unchanged here).
  await page.waitForFunction(() => {
    const main = document.querySelector('main')
    return main !== null && main.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .every((animation) => animation.playState !== 'running')
  })
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')]
      .filter((heading) => (heading.textContent ?? '').trim() === '').length)).toBe(0)
}

async function openReview(page: Page, visit: (path: string) => Promise<void>, acceptance: SessionAcceptance) {
  await visit('/review')
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
  await expect(page.locator('[data-workout-card="review"]')).toHaveCount(COMPACT_LADDER_KEYS.length)
  await settle(page)
}

async function startWorkout(page: Page, start: (button: Locator) => Promise<void>) {
  await start(page.getByRole('button', { name: 'Start workout' }))
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.locator('[data-workout-card="workout"]')).toHaveCount(COMPACT_LADDER_KEYS.length)
  await settle(page)
}

const card = (page: Page, context: Context, key: CompactLadderKey) =>
  page.locator(`[data-workout-card="${context}"]`).nth(COMPACT_LADDER_KEYS.indexOf(key))

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number }

interface GridReading {
  card: Box
  grid: Box
  gridScroll: { scrollWidth: number; clientWidth: number }
  columns: number
  tiles: {
    label: string
    entries: string[]
    box: Box
    labelTop: number
    clipped: boolean
    focusable: number
  }[]
  summary: string[]
}

/** One ladder card's compact prescription, as the browser lays it out. */
async function readGrid(scope: Locator): Promise<GridReading> {
  return scope.evaluate((card) => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const grid = card.querySelector('ol[aria-label="Rounds in this ladder"]')
    if (grid === null) throw new Error('No round grid in this card')
    const tiles = [...grid.querySelectorAll(':scope > li')].map((tile) => {
      const frame = tile.querySelector('.clr-ladder-prescription__round')!
      const label = tile.querySelector('.clr-ladder-prescription__label')!
      return {
        label: label.querySelector('[aria-hidden="true"]')?.textContent ?? '',
        entries: [...tile.querySelectorAll('[data-ladder-entry] > [aria-hidden="true"]')].map((entry) => entry.textContent ?? ''),
        box: box(tile),
        labelTop: label.getBoundingClientRect().top,
        clipped: [frame, ...frame.querySelectorAll('[data-ladder-entry], .clr-ladder-prescription__label, .clr-ladder-prescription__detail')]
          .some((node) => node.scrollWidth > node.clientWidth + 1),
        focusable: tile.querySelectorAll('button, input, a, select, textarea, [tabindex]').length,
      }
    })
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter((track) => track !== '').length
    const summary = [...card.querySelectorAll('[data-ladder-movement]')].map((line) => (line.textContent ?? '').replace(/\s+/g, ' ').trim())
    return {
      card: box(card),
      grid: box(grid),
      gridScroll: { scrollWidth: grid.scrollWidth, clientWidth: grid.clientWidth },
      columns,
      tiles,
      summary,
    }
  })
}

/**
 * C35 / JOURNEY-012: every round's movement targets in a compact grid with
 * readable wrapping — inside the card, more than one column, the rows level
 * (each row's tiles and their round labels share one top), nothing clipped or
 * scrolled sideways, and nothing in a tile a focus stop.
 */
function expectCompactGrid(reading: GridReading, key: CompactLadderKey, label: string) {
  expect(reading.tiles.map((tile) => tile.label), `${label}: rounds`).toEqual(EXPECTED[key].labels)
  expect(reading.tiles.map((tile) => tile.entries), `${label}: every round's work`).toEqual(EXPECTED[key].rounds)
  expect(reading.columns, `${label}: wraps into columns`).toBeGreaterThan(1)
  expect(reading.gridScroll.scrollWidth, `${label}: no sideways scroll`).toBeLessThanOrEqual(reading.gridScroll.clientWidth + TOLERANCE)
  expect(reading.grid.left, `${label}: inside the card`).toBeGreaterThanOrEqual(reading.card.left - TOLERANCE)
  expect(reading.grid.right, `${label}: inside the card`).toBeLessThanOrEqual(reading.card.right + TOLERANCE)
  const rows = new Map<number, GridReading['tiles']>()
  for (const tile of reading.tiles) {
    expect(tile.box.left, `${label} ${tile.label}: inside the grid`).toBeGreaterThanOrEqual(reading.grid.left - TOLERANCE)
    expect(tile.box.right, `${label} ${tile.label}: inside the grid`).toBeLessThanOrEqual(reading.grid.right + TOLERANCE)
    expect(tile.clipped, `${label} ${tile.label}: wraps rather than clips`).toBe(false)
    expect(tile.focusable, `${label} ${tile.label}: read-only`).toBe(0)
    const top = Math.round(tile.box.top)
    rows.set(top, [...(rows.get(top) ?? []), tile])
  }
  expect(rows.size, `${label}: rows of tiles`).toBe(Math.ceil(reading.tiles.length / reading.columns))
  for (const row of rows.values()) {
    const heights = row.map((tile) => tile.box.height)
    expect(Math.max(...heights) - Math.min(...heights), `${label}: a row's tiles are level`).toBeLessThanOrEqual(TOLERANCE)
    const labels = row.map((tile) => tile.labelTop)
    expect(Math.max(...labels) - Math.min(...labels), `${label}: a row's round labels are level`).toBeLessThanOrEqual(TOLERANCE)
  }
}

/** What a reader sees of each tile: its round, then each movement's work. */
function words(reading: GridReading): string[][] {
  return reading.tiles.map((tile) => [tile.label, ...tile.entries])
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

/** Text the approved criteria removed, nowhere on the screen. */
async function expectRemovedCopyAbsent(page: Page) {
  const text = (await page.locator('main').textContent()) ?? ''
  expect(text).not.toMatch(/same every round/i)
  expect(text).not.toMatch(/Move through the rounds/)
  expect(text).not.toMatch(/between each rung/)
}

/** Delivered-revision evidence, each ladder card in one taller viewport at the same width. */
async function attachCards(page: Page, context: Context, name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 3200 })
  await settle(page)
  try {
    for (const key of COMPACT_LADDER_KEYS) {
      const body = await card(page, context, key).screenshot({ caret: 'hide' })
      await test.info().attach(`${context}-${key}-${name}.png`, { body, contentType: 'image/png' })
    }
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-012 compact truthful ladder prescription', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-012 ${name}: Review then Workout state each ladder’s concise progression and every round’s movement targets in a compact wrapping grid, from its own data`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const acceptance = compactLadderAcceptance({ locationId: PLACE })
      const app = await syntheticApp(page, acceptance)
      await openReview(page, visit, acceptance)

      // Review, before starting: every round of each ladder, read-only, under
      // the accepted movement rows (R65, R72), in a compact wrapping grid.
      const review = {} as Record<CompactLadderKey, GridReading>
      for (const key of COMPACT_LADDER_KEYS) {
        review[key] = await readGrid(card(page, 'review', key))
        expectCompactGrid(review[key], key, `Review ${key} @${name}`)
      }
      await expect(card(page, 'review', 'accepted').getByText('12 rungs · 2-4-6-8-10-12-14-16-18-20-22-24 reps', { exact: true })).toBeVisible()
      await expectRemovedCopyAbsent(page)
      await noHorizontalOverflow(page)
      await attachCards(page, 'review', name)

      // Workout, by touch: the same ladders, now with their concise progression.
      await startWorkout(page, (button) => button.tap())
      await checkA11y()
      for (const key of COMPACT_LADDER_KEYS) {
        const scope = card(page, 'workout', key)
        const live = await readGrid(scope)
        expectCompactGrid(live, key, `Workout ${key} @${name}`)
        // The same words as Review, round for round (AC-R012-01).
        expect(words(live)).toEqual(words(review[key]))
        // The concise overall progression, one line per movement (C35).
        expect(live.summary, `${key} summary`).toEqual(EXPECTED[key].movements)
        // The round count and the cap, from the block's own timing.
        await expect(scope.getByText(EXPECTED[key].timing, { exact: true })).toBeVisible()
        // No read-only rung row repeats the rounds before an answer (R95).
        await expect(scope.getByRole('list', { name: 'Ladder', exact: true })).toHaveCount(0)
        await expect(scope.locator('.clr-rail')).toHaveCount(0)
      }
      // The long ladder's Start stays at its top (R66), above its prescription.
      const accepted = card(page, 'workout', 'accepted')
      const start = (await accepted.getByRole('button', { name: 'Start ladder', exact: true }).boundingBox())!
      const summary = (await accepted.getByRole('list', { name: 'Movements in this ladder', exact: true }).boundingBox())!
      expect(start.y + start.height).toBeLessThanOrEqual(summary.y + TOLERANCE)
      // Compact: twelve rounds fit within one screen's height (R117), where the
      // long per-round list they replace ran past it.
      const twelve = await readGrid(accepted)
      expect(twelve.grid.height, `12 rounds @${name}`).toBeLessThan(viewport.height)
      await expectRemovedCopyAbsent(page)
      await noHorizontalOverflow(page)
      await attachCards(page, 'workout', name)
      await accepted.scrollIntoViewIfNeeded()
      await test.info().attach(`workout-accepted-arrival-${name}.png`, { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
      app.assertContained()
    })
  }

  test('JOURNEY-012 keyboard and reduced motion phone-390: no tile is a focus stop; Start, Pause, Resume and Finish by keyboard leave the prescription unchanged, and the rung question appears only once the ladder is answered', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const acceptance = compactLadderAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance, { reducedMotion: true })
    await openReview(page, visit, acceptance)
    const start = page.getByRole('button', { name: 'Start workout' })
    await start.focus()
    await startWorkout(page, () => page.keyboard.press('Enter'))
    await checkA11y()

    const accepted = card(page, 'workout', 'accepted')
    const before = await readGrid(accepted)
    // Tab from the ladder's Start: focus moves on past the prescription to
    // the result log, never into a tile.
    const startLadder = accepted.getByRole('button', { name: 'Start ladder', exact: true })
    await startLadder.focus()
    await page.keyboard.press('Tab')
    const inPrescription = () => page.evaluate(() => document.activeElement?.closest('[data-ladder-prescription]') !== null)
    expect(await inPrescription()).toBe(false)
    // TASK-046: the result log's place on the card is its "Log results"
    // action, so that is the next stop after the prescription.
    await expect(accepted.locator('[data-timed-log-opener]').getByRole('button', { name: 'Log results', exact: true })).toBeFocused()

    // Keyboard lifecycle on the top slot (TASK-006): the prescription holds.
    await startLadder.focus()
    await page.keyboard.press('Enter')
    const pause = accepted.getByRole('button', { name: 'Pause', exact: true })
    await expect(pause).toBeFocused()
    await page.keyboard.press('Space')
    await expect(accepted.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
    expect(words(await readGrid(accepted))).toEqual(words(before))
    await page.keyboard.press('Enter')
    await accepted.getByRole('button', { name: 'Finish', exact: true }).focus()
    await page.keyboard.press('Enter')
    // The attempt has ended: the top slot leaves (TASK-006).
    await expect(accepted.locator('[data-timed-actions]')).toHaveCount(0)

    // Answered: Incomplete with no rung (TASK-010), so how far is asked — and
    // the prescription is unchanged beside it. TASK-013 (C33, C34) moved the
    // question into the result log as its rep-first "Rounds completed" tiles.
    // TASK-046: in the log its card's "Log results" opens, by keyboard.
    await accepted.locator('[data-timed-log-opener]').getByRole('button', { name: 'Log results', exact: true }).focus()
    await page.keyboard.press('Enter')
    const howFar = page.locator('dialog.clr-accepted-log[open]').getByRole('group', { name: 'Rounds completed', exact: true })
    await expect(howFar.getByRole('button')).toHaveCount(12)
    const after = await readGrid(accepted)
    expect(words(after)).toEqual(words(before))
    expectCompactGrid(after, 'accepted', 'Workout accepted, answered @phone-390')

    // Reduced motion: whatever the prescription animates is the app's hard
    // cut (a11y.css) — nothing moves, nothing loops.
    const timings = await accepted.locator('[data-ladder-prescription]').evaluate((node) => node.getAnimations({ subtree: true })
      .map((animation) => {
        const timing = animation.effect!.getComputedTiming()
        return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
      }))
    for (const timing of timings) {
      expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
      expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
    }
    await checkA11y()
    await test.info().attach('workout-accepted-answered-keyboard-phone-390.png', { body: await accepted.screenshot({ caret: 'hide' }), contentType: 'image/png' })
    app.assertContained()
  })

  test('JOURNEY-012 touch and recovery phone-320: a tapped tile does nothing, and a close and reopen while the ladders run keeps every prescription as it was', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const acceptance = compactLadderAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance)
    await openReview(page, visit, acceptance)
    await startWorkout(page, (button) => button.tap())
    const before = {} as Record<CompactLadderKey, string[][]>
    for (const key of COMPACT_LADDER_KEYS) before[key] = words(await readGrid(card(page, 'workout', key)))

    // A tile is the prescription, not a control: a tap changes nothing.
    const loaded = card(page, 'workout', 'loaded')
    await loaded.locator('ol[aria-label="Rounds in this ladder"] > li').nth(2).tap()
    expect(words(await readGrid(loaded))).toEqual(before.loaded)
    await expect(loaded.getByRole('radio', { checked: true })).toHaveCount(0)

    // Two ladders running, then a close and reopen.
    await loaded.getByRole('button', { name: 'Start ladder', exact: true }).tap()
    const scheduled = card(page, 'workout', 'scheduled')
    await scheduled.getByRole('button', { name: 'Start schedule', exact: true }).tap()
    await expect(scheduled.locator('[data-ladder-marker="now"]')).toHaveCount(1)
    await page.reload()
    await expect(page.locator('[data-workout-card="workout"]')).toHaveCount(COMPACT_LADDER_KEYS.length)
    await settle(page)
    for (const key of COMPACT_LADDER_KEYS) {
      const reading = await readGrid(card(page, 'workout', key))
      expect(words(reading), key).toEqual(before[key])
      expect(reading.summary, key).toEqual(EXPECTED[key].movements)
    }
    // Still running after the reopen, read back from their own stored clocks.
    await expect(card(page, 'workout', 'loaded').getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    const live = card(page, 'workout', 'scheduled').locator('ol[aria-label="Rounds in this ladder"] > li[aria-current="step"]')
    await expect(live).toHaveCount(1)
    await expect(live.locator('[data-ladder-marker]')).toHaveText('Now')
    await expect(card(page, 'workout', 'scheduled').getByText('Starts at 01:15', { exact: true })).toBeVisible()
    await checkA11y()
    await noHorizontalOverflow(page)
    await test.info().attach('workout-scheduled-reopened-phone-320.png', { body: await card(page, 'workout', 'scheduled').screenshot({ caret: 'hide' }), contentType: 'image/png' })
    app.assertContained()
  })

  test('JOURNEY-012 gallery ladder-4 and ladder-12 phone-320: the accepted states draw the actual consumer’s compact prescription with no network', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    for (const rounds of [4, 12] as const) {
      await visit(`/gallery/refinements?state=ladder-${rounds}`)
      const state = page.locator(`[data-refinement-state="ladder-${rounds}"]`)
      const scope = state.locator('[data-workout-card="workout"]')
      const reading = await readGrid(scope)
      const reps = Array.from({ length: rounds }, (_, index) => (index + 1) * 2)
      expect(reading.summary).toEqual([`push up bodyweight · 2 → ${reps.at(-1)} reps · +2 per round`, 'burpee bodyweight · 4 reps'])
      expect(words(reading)).toEqual(reps.map((count, index) => [`R${index + 1}`, `${count} × push up`, '4 × burpee']))
      expect(reading.columns).toBeGreaterThan(1)
      expect(reading.gridScroll.scrollWidth).toBeLessThanOrEqual(reading.gridScroll.clientWidth + TOLERANCE)
      expect(reading.tiles.every((tile) => !tile.clipped && tile.focusable === 0)).toBe(true)
      await expect(scope.getByText(`${rounds} rounds · 07:00 cap on the whole ladder`, { exact: true })).toBeVisible()
      await expectRemovedCopyAbsent(page)
      await noHorizontalOverflow(page)
      await test.info().attach(`gallery-ladder-${rounds}-phone-320.png`, { body: await scope.screenshot({ caret: 'hide' }), contentType: 'image/png' })
    }
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
