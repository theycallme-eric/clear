import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import {
  COOLDOWN_GENERATED_NOTES,
  COOLDOWN_GENERATED_TITLE,
  PREPARATION_NAMES,
  WARM_UP_GENERATED_NOTES,
  WARM_UP_GENERATED_TITLE,
  preparationAcceptance,
} from '../../src/dev/gallery-refinement-preparation-data'
import { composedPreparationGuide, type PreparationGuide } from '../../src/state/preparation-guide'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import { formatElapsed } from '../../src/state/workout-clock'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-022 (REQ-022; C49, G14; R01, R13, R14, R15, R36; AC-C49-01,
 * AC-R022-01, AC-R022-02; JOURNEY-022) — the accepted concise Warm-up and
 * Cooldown and their separate preparation clock on the real `/review` and
 * `/workout` routes, compared with V05 (earlier composition) and V06 (the
 * accepted concise prescription) and the accepted gallery state
 * `/gallery/refinements?state=preparation`.
 *
 * Entry: a workout with an authoritative Warm-up (four movements) and Cooldown
 * (two) around a worked section reaches `/review` through the existing
 * hand-off, behind the existing auth guard; Start persists and starts it.
 * Action: read both guides, then start, pause and extend the preparation
 * clock. Result, read from the browser at phone widths: each guide is the
 * stable title, the approximate total time and the movement names on
 * separate lines — no generated title, prose or per-movement sets, reps,
 * load, time or rest — with its title, names, count and time read from the
 * prescriptions (never the illustrated four minutes or three rows); the live
 * Warm-up and Cooldown each have their own clock in the rest timer's pattern
 * with Start / Pause and Add 30s and no Dismiss or substitute. Recovery: a
 * failed session read keeps its meaning and its retry; a reload keeps the
 * section and the guide and fabricates nothing; keyboard, touch and reduced
 * motion reach all of it.
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads only. The only writes the app attempts are Start's two
 * session calls, answered here and never forwarded; no set or block result is
 * written, no model is called and no real account or row exists to mutate.
 */
const OWNER = '00000000-0000-4000-8000-000000002201'
const PLACE = '00000000-0000-4000-8000-000000002211'
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
    if (code !== null) throw new Error(`Synthetic TASK-022 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-022 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-022.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-022-public-placeholder',
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

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  readonly reducedMotion?: boolean
  /** The session was already started: `/workout` is the entry. */
  readonly running?: boolean
  /** The first active-session read fails, so its retry is exercised. */
  readonly failFirstRead?: boolean
}

async function syntheticApp(page: Page, acceptance: SessionAcceptance, options: AppOptions = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed: SessionSnapshot = sessionSnapshotSchema.parse(peerGroupingSnapshot(acceptance, { userId: OWNER }))
  const running: SessionSnapshot = sessionSnapshotSchema.parse(
    peerGroupingSnapshot(acceptance, { userId: OWNER, startedAt }),
  )
  const writes: string[] = []
  const unexpected: string[] = []
  let started = options.running === true
  let failRead = options.failFirstRead === true
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
      // Every other read is an empty answer: no history, anchors, catalog or favorites.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') {
        if (failRead) {
          failRead = false
          return reply({ code: 'PGRST000', message: 'Synthetic read failure.' }, 503)
        }
        return reply(started ? running : null)
      }
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
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-022 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-022-session', refreshToken: 'synthetic-task-022-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-022@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-task-022', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(acceptance) })

  return {
    assertContained(expected: readonly string[] = ['persist_session', 'start_session']) {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Only Start’s session calls are attempted; no set, block result or session end is written').toEqual([...expected])
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
  // A screen entering is read once its finite transitions have finished.
  await page.waitForFunction(() => {
    const main = document.querySelector('main')
    return main !== null && main.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .every((animation) => animation.playState !== 'running')
  })
}

async function openReview(page: Page, visit: (path: string) => Promise<void>, acceptance: SessionAcceptance) {
  await visit('/review')
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
  await settle(page)
}

async function startWorkout(page: Page, checkA11y: () => Promise<void>) {
  await page.getByRole('button', { name: 'Start workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(guideOf(page, 'warmup')).toBeVisible()
  await settle(page)
  await checkA11y()
}

/**
 * Delivered-revision visual evidence: the scrolling content, attached to the
 * case — read in a taller viewport at the same width so the whole screen fits.
 */
async function attachCapture(page: Page, name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 2400 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await settle(page)
    const scroller = page.locator('main .clr-scroll-region__scroller').first()
    const body = await scroller.screenshot({ caret: 'hide' }).catch(() => page.screenshot({ caret: 'hide' }))
    await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

/** The whole phone screen as the athlete sees it, for comparison with V06. */
async function attachScreen(page: Page, name: string) {
  await settle(page)
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

type Prep = 'warmup' | 'cooldown'

function guideOf(scope: Page | Locator, type: Prep): Locator {
  return scope.locator(`[data-preparation-guide="${type}"]`)
}

function clockOf(scope: Page | Locator, title: string): Locator {
  return scope.getByRole('region', { name: `${title} timer`, exact: true })
}

/** TASK-034's reading of the composed section: what both routes must draw. */
function readingOf(acceptance: SessionAcceptance, type: Prep): PreparationGuide {
  return composedPreparationGuide(acceptance.workout.sections.find((section) => section.section_type === type)!)!
}

interface GuideGeometry {
  text: string
  names: string[]
  listStyle: string
  rows: { top: number; bottom: number; left: number }[]
  card: { left: number; right: number }
  buttons: number
  timers: number
}

async function readGuide(card: Locator): Promise<GuideGeometry> {
  return card.evaluate((node) => {
    const list = node.querySelector('ul')!
    const items = [...list.querySelectorAll(':scope > li')]
    const box = node.getBoundingClientRect()
    return {
      text: node.textContent ?? '',
      names: items.map((item) => item.textContent ?? ''),
      listStyle: getComputedStyle(list).listStyleType,
      rows: items.map((item) => {
        const rect = item.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, left: rect.left }
      }),
      card: { left: box.left, right: box.right },
      buttons: node.querySelectorAll('button').length,
      timers: node.querySelectorAll('[role="timer"]').length,
    }
  })
}

const PRESCRIPTION_WORDS = /×|\breps?\b|\bsec\b|\bRest\b|\bkg\b|\blb\b|each side|Log set|Swap/

/** C49, R01, R13: title, approximate time and one name per line — nothing else. */
function expectConcise(geometry: GuideGeometry, guide: PreparationGuide, label: string) {
  expect(geometry.text, `${label}: exactly the title, the time and the names`)
    .toBe([guide.title, guide.durationText, ...guide.movements.map(({ name }) => name)].join(''))
  expect(geometry.text, `${label}: no per-movement prescription`).not.toMatch(PRESCRIPTION_WORDS)
  expect(geometry.names, `${label}: the names, in composed order`).toEqual(guide.movements.map(({ name }) => name))
  expect(geometry.listStyle, `${label}: no list marker`).toBe('none')
  for (let index = 1; index < geometry.rows.length; index += 1) {
    expect(geometry.rows[index].top, `${label}: each name on its own line`).toBeGreaterThanOrEqual(geometry.rows[index - 1].bottom - 1)
    expect(Math.abs(geometry.rows[index].left - geometry.rows[0].left), `${label}: names share one start`).toBeLessThanOrEqual(1)
  }
  expect(geometry.buttons, `${label}: no action in the guide`).toBe(0)
  expect(geometry.timers, `${label}: the clock is not part of the guide`).toBe(0)
}

async function digits(clock: Locator): Promise<string> {
  return (await clock.getByRole('timer').locator('[aria-hidden="true"]').first().textContent()) ?? ''
}

async function clockActions(clock: Locator): Promise<string[]> {
  return (await clock.getByRole('button').allTextContents()).map((text) => text.trim())
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-022 accepted concise Warm-up and Cooldown with separate preparation timer', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-022 ${name}: Review then Workout — concise Warm-up and Cooldown read from the prescriptions, and each preparation clock started, paused and extended with no Dismiss`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const acceptance = preparationAcceptance({ locationId: PLACE })
      const app = await syntheticApp(page, acceptance)
      const warm = readingOf(acceptance, 'warmup')
      const cool = readingOf(acceptance, 'cooldown')
      expect([warm.movements.map((m) => m.name), cool.movements.map((m) => m.name)]).toEqual([PREPARATION_NAMES.warmup, PREPARATION_NAMES.cooldown])
      await openReview(page, visit, acceptance)

      // Review: each guide is the section, headed by its stable title.
      const main = page.locator('main')
      for (const [type, guide] of [['warmup', warm], ['cooldown', cool]] as const) {
        const card = guideOf(page, type)
        await expect(card.getByRole('heading', { name: guide.title, exact: true })).toBeVisible()
        expectConcise(await readGuide(card), guide, `review ${type} @${name}`)
      }
      for (const words of [WARM_UP_GENERATED_TITLE, WARM_UP_GENERATED_NOTES, COOLDOWN_GENERATED_TITLE, COOLDOWN_GENERATED_NOTES]) {
        await expect(main.getByText(words)).toHaveCount(0)
      }
      // Not the illustration: four and two names, each guide's own time.
      expect(warm.durationText).not.toBe('~4 minutes')
      await expect(main.getByRole('button', { name: /^Swap (arm circles|scapular push up|kettlebell halo|dead hang|doorway chest stretch|childs pose)$/ })).toHaveCount(0)
      await expect(main.getByRole('button', { name: 'Swap bench press' })).toBeVisible()
      await expect(main.getByRole('timer')).toHaveCount(0)
      await noHorizontalOverflow(page)
      await attachCapture(page, `review-${name}`)

      await startWorkout(page, checkA11y)
      // The live Warm-up: the guide under the section header, then its own clock (V06).
      await expect(page.getByRole('heading', { name: 'Warm-up', exact: true })).toHaveCount(1)
      expectConcise(await readGuide(guideOf(page, 'warmup')), warm, `workout warmup @${name}`)
      await expect(main.locator('[data-workout-card="workout"], [data-movement-identity]')).toHaveCount(0)
      await expect(main.getByRole('button', { name: /^(Log set|Rest|Dismiss|Hide|Skip|Close)/ })).toHaveCount(0)
      const clock = clockOf(page, 'Warm-up')
      await expect(clock).toBeVisible()
      expect(await digits(clock)).toBe(formatElapsed(warm.approximateMinutes * 60))
      expect(await clockActions(clock)).toEqual(['Start', 'Add 30s'])
      // The guide sits above its clock, inside the content column.
      const [guideBox, clockBox] = [await guideOf(page, 'warmup').boundingBox(), await clock.boundingBox()]
      expect(clockBox!.y).toBeGreaterThanOrEqual(guideBox!.y + guideBox!.height - 1)
      await noHorizontalOverflow(page)
      await attachScreen(page, `workout-warmup-ready-${name}`)

      // Start by touch; it counts its own time down while the session clock runs on.
      const session = page.getByRole('timer', { name: 'Session time' })
      const sessionBefore = await session.textContent()
      await clock.getByRole('button', { name: 'Start' }).tap()
      expect(await clockActions(clock)).toEqual(['Pause', 'Add 30s'])
      await expect.poll(() => digits(clock), { timeout: 5_000 }).not.toBe(formatElapsed(warm.approximateMinutes * 60))
      await expect.poll(() => session.textContent(), { timeout: 5_000 }).not.toBe(sessionBefore)
      await expect(page.getByRole('region', { name: 'Rest', exact: true })).toHaveCount(0)

      // Pause holds it; Add 30s adds thirty seconds to what is left.
      await clock.getByRole('button', { name: 'Pause' }).tap()
      const held = await digits(clock)
      await page.waitForTimeout(1_200)
      expect(await digits(clock)).toBe(held)
      const [minutes, seconds] = held.split(':').map(Number)
      await clock.getByRole('button', { name: 'Add 30s' }).tap()
      expect(await digits(clock)).toBe(formatElapsed(minutes * 60 + seconds + 30))
      await expect(page.getByRole('button', { name: /Dismiss|Hide|Close/ })).toHaveCount(0)
      await checkA11y()
      await attachScreen(page, `workout-warmup-paused-${name}`)

      // The Cooldown: its own guide and its own clock, ready on its own time.
      await page.getByRole('button', { name: 'All sections' }).tap()
      await page.getByRole('button', { name: /^Cooldown, / }).tap()
      await expect(guideOf(page, 'cooldown')).toBeVisible()
      expectConcise(await readGuide(guideOf(page, 'cooldown')), cool, `workout cooldown @${name}`)
      expect(await digits(clockOf(page, 'Cooldown'))).toBe(formatElapsed(cool.approximateMinutes * 60))
      expect(await clockActions(clockOf(page, 'Cooldown'))).toEqual(['Start', 'Add 30s'])
      await noHorizontalOverflow(page)
      await attachScreen(page, `workout-cooldown-${name}`)

      // Back to the Warm-up: its clock is as it was left, paused.
      await page.getByRole('button', { name: 'All sections' }).tap()
      await page.getByRole('button', { name: /^Warm-up, / }).tap()
      await expect(clockOf(page, 'Warm-up')).toBeVisible()
      expect(await digits(clockOf(page, 'Warm-up'))).toBe(formatElapsed(minutes * 60 + seconds + 30))
      expect(await clockActions(clockOf(page, 'Warm-up'))).toEqual(['Start', 'Add 30s'])
      app.assertContained()
    })
  }

  test('AC-R022-02 keyboard, reduced motion and reopen phone-390: Start, Pause and Add 30s from the keyboard; a failed session read keeps its meaning and its retry; a reload keeps the section and the guide and fabricates no work', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const acceptance = preparationAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance, { running: true, failFirstRead: true, reducedMotion: true })
    const warm = readingOf(acceptance, 'warmup')
    const full = formatElapsed(warm.approximateMinutes * 60)

    // A failed read is the route's existing error, with its retry — not an empty guide.
    await visit('/workout')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Your session didn’t load')
    await expect(guideOf(page, 'warmup')).toHaveCount(0)
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(guideOf(page, 'warmup')).toBeVisible()
    await settle(page)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    // Keyboard: Start, then Pause, then Add 30s, each reached and pressed from the keyboard.
    const clock = clockOf(page, 'Warm-up')
    await clock.getByRole('button', { name: 'Start' }).focus()
    await page.keyboard.press('Enter')
    await expect(clock.getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect.poll(() => digits(clock), { timeout: 5_000 }).not.toBe(full)
    await clock.getByRole('button', { name: 'Pause' }).focus()
    await page.keyboard.press('Space')
    await expect(clock.getByRole('button', { name: 'Start' })).toBeVisible()
    const held = await digits(clock)
    await page.keyboard.press('Tab')
    await expect(clock.getByRole('button', { name: 'Add 30s' })).toBeFocused()
    await page.keyboard.press('Enter')
    const [minutes, seconds] = held.split(':').map(Number)
    expect(await digits(clock)).toBe(formatElapsed(minutes * 60 + seconds + 30))
    // Reduced motion: whatever the clock animates (its tumbling digits, its fill) is a hard cut —
    // the app's reduced-motion guarantee (a11y.css) leaves at most 0.01ms, one iteration.
    const timings = await clock.evaluate((node) => node.getAnimations({ subtree: true }).map((animation) => {
      const timing = animation.effect?.getComputedTiming()
      return { duration: Number(timing?.duration ?? 0), iterations: Number(timing?.iterations ?? 1) }
    }))
    expect(timings.every(({ duration, iterations }) => duration <= 0.01 && iterations === 1), JSON.stringify(timings)).toBe(true)
    await checkA11y()

    // Reopen: the same section and guide; the clock is ready again — it was never stored, and nothing was recorded.
    await page.reload()
    await expect(guideOf(page, 'warmup')).toBeVisible()
    expectConcise(await readGuide(guideOf(page, 'warmup')), warm, 'reopened warmup')
    expect(await digits(clockOf(page, 'Warm-up'))).toBe(full)
    expect(await clockActions(clockOf(page, 'Warm-up'))).toEqual(['Start', 'Add 30s'])
    app.assertContained([])
  })

  test('gallery preparation phone-320: the accepted state draws the routes’ own guides and clocks from the actual reading, with no Dismiss and nothing read or written', async ({ page, visit }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    const acceptance = preparationAcceptance()
    const warm = readingOf(acceptance, 'warmup')
    const cool = readingOf(acceptance, 'cooldown')
    await visit('/gallery/refinements?state=preparation')
    const state = page.locator('[data-refinement-state="preparation"]')
    const review = state.locator('[data-gallery-context="review"]')
    expectConcise(await readGuide(guideOf(review, 'warmup')), warm, 'gallery review warmup')
    expectConcise(await readGuide(guideOf(review, 'cooldown')), cool, 'gallery review cooldown')
    await expect(review.locator('[data-workout-card="review"]')).toHaveCount(1)
    await expect(state.getByText('~5 minutes', { exact: true })).toHaveCount(0)
    await noHorizontalOverflow(page)
    await test.info().attach('gallery-review-phone-320.png', { body: await state.screenshot({ caret: 'hide' }), contentType: 'image/png' })

    await state.getByRole('radio', { name: 'Workout' }).check()
    const workout = state.locator('[data-gallery-context="workout"]')
    for (const guide of [warm, cool]) {
      const clock = clockOf(workout, guide.title)
      expect(await digits(clock)).toBe(formatElapsed(guide.approximateMinutes * 60))
      expect(await clockActions(clock)).toEqual(['Start', 'Add 30s'])
    }
    await expect(workout.getByRole('button', { name: /Dismiss|Hide|Close|Skip/ })).toHaveCount(0)
    await clockOf(workout, 'Warm-up').getByRole('button', { name: 'Start' }).tap()
    await expect(clockOf(workout, 'Warm-up').getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect(clockOf(workout, 'Cooldown').getByRole('button', { name: 'Start' })).toBeEnabled()
    await noHorizontalOverflow(page)
    await test.info().attach('gallery-workout-phone-320.png', { body: await state.screenshot({ caret: 'hide' }), contentType: 'image/png' })
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
