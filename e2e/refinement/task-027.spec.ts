import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { AMRAP_BLOCK, STANDARD_BLOCK } from '../../src/dev/gallery-refinement-cards-data'
import { PREPARATION_SECTIONS, preparationAcceptance } from '../../src/dev/gallery-refinement-preparation-data'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-027 (REQ-027; C54, G22; R35, R98; AC-C54-01, AC-R027-01; JOURNEY-027)
 * — the compact live navigator on the real `/workout` route, compared with the
 * accepted gallery state `/gallery/refinements?state=cards` (reference
 * eded158c…, `SectionHeader compact`).
 *
 * Entry: a started four-section workout — a finished Warm-up, a Press section
 * with one bench-press set already logged, an untouched Conditioning AMRAP and
 * a Cooldown — reached at `/workout` behind the existing auth guard; the shell
 * opens the first unfinished section. Action: open the navigator, jump to
 * another section and return, by touch and by keyboard. Result, read from the
 * browser at phone widths: the navigator is `All sections` with the `N / M`
 * position over the status-bearing jump list, with no section card, title,
 * status line or structure badges repeating the active card's identity; a jump
 * moves focus to the opened section's first card; the logged set, the section
 * statuses and the session clock stay as they were and nothing is written.
 * Recovery: a failed session read keeps its meaning and its retry; a reload
 * keeps the section and grabs no focus; reduced motion opens the list as a
 * hard cut.
 *
 * Synthetic and contained: an intercepted, already-started session for a
 * fictional user and synthetic reads only. The app attempts no write at all
 * here; any request without an explicit disposition fails the case.
 */
const OWNER = '00000000-0000-4000-8000-000000002701'
const PLACE = '00000000-0000-4000-8000-000000002711'
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
    if (code !== null) throw new Error(`Synthetic TASK-027 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-027 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-027.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-027-public-placeholder',
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
// The synthetic session: four sections, one set already logged
// ─────────────────────────────────────────────────────────────────────────────

type Section = SessionAcceptance['workout']['sections'][number]

/** The Press: the bench press (one set logged below), then a second standard block already done. */
const PRESS: Section = { ...PREPARATION_SECTIONS.main, blocks: [...PREPARATION_SECTIONS.main.blocks, STANDARD_BLOCK] }

const CONDITIONING: Section = {
  section_type: 'conditioning',
  section_title: 'Engine',
  section_notes: null,
  blocks: [AMRAP_BLOCK],
}

function navigatorAcceptance(): SessionAcceptance {
  return preparationAcceptance({
    locationId: PLACE,
    sections: [PREPARATION_SECTIONS.warmup, PRESS, CONDITIONING, PREPARATION_SECTIONS.cooldown],
  })
}

/** The bench press's first set, already stored before this visit. */
const LOGGED_SET = {
  id: '00000000-0000-4000-8000-0a0000002701',
  prescription_revision_status: 'active' as const,
  set_number: 1,
  actual_reps: 6,
  actual_duration_seconds: null,
  actual_distance: null,
  actual_distance_unit: null,
  weight: 60,
  weight_unit: 'kg' as const,
  rpe: null,
  is_warmup_set: false,
  created_at: '2026-11-10T09:05:00+00:00',
  effort: null,
  mutation_revision: 0,
  last_mutation_id: null,
}

/**
 * The started session as `resume_session` and `session_snapshot` answer it:
 * the Warm-up done, the Press under way — one bench-press set logged, its
 * second block done — and the rest untouched.
 */
function runningSession(acceptance: SessionAcceptance): SessionSnapshot {
  const startedAt = new Date(Date.now() - 10 * 60_000).toISOString()
  const snapshot = peerGroupingSnapshot(acceptance, { userId: OWNER, startedAt })
  const [warmup, press, ...rest] = snapshot.sections
  return sessionSnapshotSchema.parse({
    ...snapshot,
    sections: [
      { ...warmup, blocks: warmup.blocks.map((block) => ({ ...block, exercises: block.exercises.map((entry) => ({ ...entry, exercise: { ...entry.exercise, execution_status: 'completed' } })) })) },
      {
        ...press,
        // The bench press is still owed three sets; the block after it is done.
        blocks: press.blocks.map((block, index) => index !== 0
          ? { ...block, exercises: block.exercises.map((entry) => ({ ...entry, exercise: { ...entry.exercise, execution_status: 'completed' } })) }
          : { ...block, exercises: block.exercises.map((entry) => ({ ...entry, set_logs: [{ ...LOGGED_SET, workout_exercise_id: entry.exercise.id }] })) }),
      },
      ...rest,
    ],
  })
}

interface AppOptions {
  readonly reducedMotion?: boolean
  /** The first active-session read fails, so its retry is exercised. */
  readonly failFirstRead?: boolean
}

async function syntheticApp(page: Page, options: AppOptions = {}) {
  const running = runningSession(navigatorAcceptance())
  const unexpected: string[] = []
  const writes: string[] = []
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
        return reply(running)
      }
      if (name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') return reply(null)
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    // Anything else — a set, a block result, a session end — is a write this journey must not make.
    writes.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-027 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-027-session', refreshToken: 'synthetic-task-027-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-027@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    assertContained() {
      expect(unexpected, 'No function is called').toEqual([])
      expect(writes, 'A jump writes nothing: no set, block result, status or session end').toEqual([])
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
  await page.waitForFunction(() => {
    const main = document.querySelector('main')
    return main !== null && main.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .every((animation) => animation.playState !== 'running')
  })
}

async function openWorkout(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(navigatorOf(page)).toBeVisible()
  await settle(page)
}

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

function navigatorOf(scope: Page | Locator): Locator {
  return scope.locator('[data-section-navigation]')
}

function toggleOf(scope: Page | Locator): Locator {
  return navigatorOf(scope).getByRole('button', { name: 'All sections', exact: true })
}

/** The opened section's first card frame: the first card after the navigator. */
function firstCard(page: Page): Locator {
  return page.locator(
    'xpath=//*[@data-section-navigation]/following::*[contains(concat(" ", normalize-space(@class), " "), " clr-card__body ")][1]',
  )
}

interface NavigatorReading {
  /** What a sighted athlete reads: no visually hidden text, nothing collapsed out of sight. */
  visible: string
  /** The hidden reading assistive technology gets. */
  heading: string
  status: string
  insideCard: boolean
  structureBadges: number
  height: number
  toggleWidth: number
  positionRight: number
  toggleRight: number
}

async function readNavigator(page: Page): Promise<NavigatorReading> {
  return navigatorOf(page).evaluate((node) => {
    const clone = node.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.a11y-hidden, .clr-collapsible__region[data-expanded="false"]').forEach((hidden) => hidden.remove())
    const toggle = node.querySelector('.clr-collapsible__trigger')!.getBoundingClientRect()
    const position = node.querySelector('[data-section-position]')!.getBoundingClientRect()
    return {
      visible: (clone.textContent ?? '').replace(/\s+/g, ' ').trim(),
      heading: node.querySelector('h2')?.textContent ?? '',
      status: node.querySelector('p.a11y-hidden')?.textContent ?? '',
      insideCard: node.closest('.clr-card') !== null,
      structureBadges: node.querySelectorAll('.clr-chamfer--structure').length,
      height: node.getBoundingClientRect().height,
      toggleWidth: toggle.width,
      positionRight: position.right,
      toggleRight: toggle.right,
    }
  })
}

/**
 * Where a phrase is drawn so a sighted athlete can read it in the content
 * column: on the live cards, and anywhere else.
 */
async function visibleCount(page: Page, phrase: string): Promise<{ cards: number; elsewhere: number }> {
  return page.locator('main').evaluate((main, text) => {
    const count = { cards: 0, elsewhere: 0 }
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? '').trim().toLowerCase() !== text.toLowerCase()) continue
      const element = node.parentElement!
      if (element.closest('.a11y-hidden, [aria-hidden="true"], .clr-collapsible__region[data-expanded="false"]')) continue
      if (element.getBoundingClientRect().width === 0) continue
      if (element.closest('[data-workout-card]')) count.cards += 1
      else count.elsewhere += 1
    }
    return count
  }, phrase)
}

async function chipNames(page: Page): Promise<(string | null)[]> {
  return navigatorOf(page).getByRole('list', { name: 'Sections' }).getByRole('button').evaluateAll(
    (chips) => chips.map((chip) => chip.getAttribute('aria-label')),
  )
}

const STATUSES_AT_ENTRY = ['Warm-up, complete', 'Primary lift, in progress', 'Conditioning, not started', 'Cooldown, not started']

async function loggedSets(page: Page): Promise<number> {
  return firstCard(page).getByRole('list', { name: 'Logged sets' }).getByRole('listitem').count()
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-027 compact live navigator preserves section access', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-027 ${name}: a started multi-section workout — the compact navigator shows position and status without repeating the active card, jumps away and back by touch with focus on each opened section’s first card, and records or resets nothing`, async ({ page, visit, checkA11y }) => {
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page)
      await openWorkout(page, visit)

      // Entry: the first unfinished section, Press (Primary lift), is open with its logged set.
      const entry = await readNavigator(page)
      expect(entry.visible).toBe('All sections2 / 4')
      expect(entry.heading).toBe('Primary lift')
      expect(entry.status).toBe('Section 2 / 4 · In progress')
      expect(entry.insideCard, 'C54: no separate section card').toBe(false)
      expect(entry.structureBadges, 'C54: no repeated structure badge').toBe(0)
      // Compact: one disclosure row — the position at its end, inside the content column.
      expect(entry.positionRight).toBeLessThanOrEqual(entry.toggleRight + 1)
      expect(entry.positionRight).toBeGreaterThan(entry.toggleRight - entry.toggleWidth / 2)
      await expect(page.getByRole('list', { name: 'Structures in this section' })).toHaveCount(0)
      // The active cards' identity is drawn on the cards only: their label and their badges.
      const label = await visibleCount(page, 'Primary lift')
      expect(label.cards, 'each card keeps its label').toBeGreaterThan(0)
      expect(label.elsewhere, 'the section label is not repeated above the cards').toBe(0)
      expect(await visibleCount(page, 'STANDARD'), 'the format badges are on the cards only').toEqual({ cards: 2, elsewhere: 0 })
      expect(await loggedSets(page)).toBe(1)
      expect(await chipNames(page)).toEqual(STATUSES_AT_ENTRY)
      const session = page.getByRole('timer', { name: 'Session time' })
      const sessionAtEntry = await session.textContent()
      await noHorizontalOverflow(page)
      await attachScreen(page, `workout-navigator-collapsed-${name}`)

      // Open by touch: every section's status, the open one current.
      await toggleOf(page).tap()
      await expect(toggleOf(page)).toHaveAttribute('aria-expanded', 'true')
      const list = navigatorOf(page).getByRole('list', { name: 'Sections' })
      await expect(list.getByRole('button', { name: 'Primary lift, in progress' })).toHaveAttribute('aria-current', 'step')
      await expect(list.getByRole('button', { name: 'Conditioning, not started' })).toBeVisible()
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `workout-navigator-open-${name}`)

      // Jump away: the Conditioning AMRAP's card takes focus; the list collapses.
      await list.getByRole('button', { name: 'Conditioning, not started' }).tap()
      await expect(firstCard(page)).toBeFocused()
      await expect(firstCard(page).locator('.clr-movement-group-header__badge')).toHaveText('AMRAP')
      await expect(toggleOf(page)).toHaveAttribute('aria-expanded', 'false')
      const away = await readNavigator(page)
      expect(away.visible).toBe('All sections3 / 4')
      expect(away.heading).toBe('Conditioning')
      expect(away.status).toBe('Section 3 / 4 · Not started')
      expect(away.structureBadges).toBe(0)
      expect(await visibleCount(page, 'AMRAP')).toEqual({ cards: 1, elsewhere: 0 })
      expect((await visibleCount(page, 'Conditioning')).elsewhere).toBe(0)
      expect(await chipNames(page), 'a jump marks nothing complete').toEqual(STATUSES_AT_ENTRY)
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `workout-navigator-jumped-${name}`)

      // And back: the Press card again, its logged set still there and nothing new.
      await toggleOf(page).tap()
      await navigatorOf(page).getByRole('button', { name: 'Primary lift, in progress' }).tap()
      await expect(firstCard(page)).toBeFocused()
      expect((await readNavigator(page)).visible).toBe('All sections2 / 4')
      expect(await loggedSets(page)).toBe(1)
      expect(await chipNames(page)).toEqual(STATUSES_AT_ENTRY)
      await expect(page.getByRole('progressbar', { name: 'Section 2 of 4' })).toHaveAttribute('aria-valuenow', '1')
      // The session clock ran on through both jumps; it was never reset.
      await expect.poll(async () => (await session.textContent()) !== sessionAtEntry, { timeout: 5_000 }).toBe(true)
      expect(await session.textContent()).not.toMatch(/^00:0/)
      app.assertContained()
    })
  }

  test('AC-C54-01 keyboard, reduced motion, failed read and reopen phone-390: the jump list opens and jumps from the keyboard with a visible focus on the opened card; a failed read keeps its retry; a reload keeps the section and grabs no focus', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { failFirstRead: true, reducedMotion: true })

    // A failed read is the route's existing error with its retry — not an empty navigator.
    await visit('/workout')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Your session didn’t load')
    await expect(navigatorOf(page)).toHaveCount(0)
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(navigatorOf(page)).toBeVisible()
    await settle(page)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    // Keyboard: the toggle, Enter, Tab into the list — reachable only while it is open.
    const toggle = toggleOf(page)
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Reduced motion: the list opens as a hard cut.
    const region = navigatorOf(page).locator('.clr-collapsible__region')
    expect(await region.evaluate((node) => getComputedStyle(node).transitionDuration.split(',').map((value) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000))
      .every((ms) => ms <= 0.01))).toBe(true)
    await page.keyboard.press('Tab')
    await expect(navigatorOf(page).getByRole('button', { name: 'Warm-up, complete' })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(navigatorOf(page).getByRole('button', { name: 'Conditioning, not started' })).toBeFocused()
    await page.keyboard.press('Enter')

    // The opened section's first card has focus, and the focus is drawn.
    const card = firstCard(page)
    await expect(card).toBeFocused()
    expect(await card.evaluate((node) => node.matches(':focus-visible'))).toBe(true)
    await expect(card.locator('.clr-movement-group-header__badge')).toHaveText('AMRAP')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Collapsed again, the list is out of the tab order: Shift+Tab from the card reaches the toggle.
    await page.keyboard.press('Shift+Tab')
    await expect(toggle).toBeFocused()
    await checkA11y()
    await attachScreen(page, 'workout-navigator-keyboard-phone-390')

    // Reopen: the same section, its statuses unchanged, and no focus grabbed by the restore.
    await page.reload()
    await expect(navigatorOf(page)).toBeVisible()
    await settle(page)
    expect((await readNavigator(page)).visible).toBe('All sections3 / 4')
    await expect(firstCard(page)).not.toBeFocused()
    expect(await chipNames(page)).toEqual(STATUSES_AT_ENTRY)

    // Previous from the keyboard lands where a jump does: the opened section's
    // first card, with its focus drawn — never the visually hidden heading.
    const previous = page.getByRole('navigation', { name: 'Workout sections' })
      .getByRole('button', { name: 'Previous', exact: true })
    await previous.focus()
    await page.keyboard.press('Enter')
    await expect(firstCard(page)).toBeFocused()
    expect(await firstCard(page).evaluate((node) => node.matches(':focus-visible'))).toBe(true)
    expect((await readNavigator(page)).visible).toBe('All sections2 / 4')
    expect(await loggedSets(page)).toBe(1)
    expect(await chipNames(page), 'Previous marks nothing complete').toEqual(STATUSES_AT_ENTRY)
    app.assertContained()
  })

  test('gallery cards phone-320: the accepted state draws the route’s own compact navigator before the live cards and jumps a memory-only position, with nothing read or written', async ({ page, visit }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    await visit('/gallery/refinements?state=cards')
    const state = page.locator('[data-refinement-state="cards"]')
    const workout = state.locator('[data-gallery-context="workout"]')
    await expect(navigatorOf(state.locator('[data-gallery-context="review"]'))).toHaveCount(0)
    const navigator = navigatorOf(workout)
    await expect(navigator).toHaveCount(1)
    const order = await workout.evaluate((node) => {
      const nav = node.querySelector('[data-section-navigation]')!
      const card = node.querySelector('[data-workout-card="workout"]')!
      return Boolean(nav.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(order, 'the navigator sits above the live cards').toBe(true)
    await expect(navigator.locator('[data-section-position]')).toHaveText('2 / 3')
    await expect(navigator.locator('.clr-chamfer--structure')).toHaveCount(0)
    await toggleOf(workout).tap()
    await navigator.getByRole('button', { name: 'Cooldown, not started' }).tap()
    await expect(navigator.locator('[data-section-position]')).toHaveText('3 / 3')
    await expect(workout.locator('[data-workout-card="workout"]')).toHaveCount(3)
    await noHorizontalOverflow(page)
    await navigator.scrollIntoViewIfNeeded()
    await test.info().attach('gallery-cards-navigator-phone-320.png', { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
