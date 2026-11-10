import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import {
  circuitAnchorEvidence,
  circuitAnchors,
  FORMAT_BADGES,
  FORMAT_DETAILS,
  FORMAT_KEYS,
  FORMAT_LISTS,
  FORMAT_LOADS,
  FORMAT_SECTION,
  formatBadgesAcceptance,
  formatBadgesSnapshot,
  type FormatReading,
} from '../../src/test/format-badges-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-003 (REQ-003; C08, C09, C10, C11; AC-R003-01…04; JOURNEY-003) —
 * consistent format badges and truthful prescribed load on the real `/review`
 * and `/workout` routes.
 *
 * Entry: standard, grouped, EMOM, AMRAP, plain For Time and a true timed
 * ladder reach `/review` through the existing Review hand-off, behind the
 * existing auth guard, with the same source prescriptions Start persists.
 * Action: inspect each block before (Review) and during execution (Workout).
 * Result, read from the browser at phone widths: every badge names the format
 * or shape alone, below its title, in the same place whatever its length and
 * never truncated; the duration, cap and rounds are readable text below it;
 * each movement's prescribed load stays in its target row in both views; the
 * timed Review movements drop the generic `Rest 60s` while the real schedule
 * and rest stay. The verified circuit offers no Review weight change and keeps
 * its actual weight entry in its optional logger. Recovery: a failed Start
 * leaves Review as planned; keyboard and touch reach every action; reduced
 * motion throughout.
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads. The only writes the app attempts are Start's two session
 * calls, answered here and never forwarded; no set is logged, no model is
 * called and no real account or row exists to mutate.
 */
const OWNER = '00000000-0000-4000-8000-000000000301'
const PLACE = '00000000-0000-4000-8000-000000000311'
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
    if (code !== null) throw new Error(`Synthetic TASK-003 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-003 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-003.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-003-public-placeholder',
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

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  /** OVR-01c anchors for the circuit's kettlebell swing and the back squat. */
  anchored?: boolean
  /** Start's first write fails, so the session is never created. */
  startFails?: boolean
}

async function syntheticApp(page: Page, acceptance: SessionAcceptance, options: AppOptions = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = sessionSnapshotSchema.parse(formatBadgesSnapshot(acceptance, { userId: OWNER }))
  const running: SessionSnapshot = sessionSnapshotSchema.parse(
    formatBadgesSnapshot(acceptance, { userId: OWNER, startedAt }),
  )
  const exercises = running.sections.flatMap((section) => section.blocks)
    .flatMap((block) => block.exercises.map(({ exercise }) => exercise))
  const anchors = options.anchored === true ? circuitAnchors().map((anchor) => ({ ...anchor, user_id: OWNER })) : []
  const evidence = options.anchored === true ? circuitAnchorEvidence() : []
  const writes: string[] = []
  const unexpected: string[] = []
  let started = false
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })

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
      if (name === 'load_anchors') return reply(anchors)
      if (name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(exercises.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (name === 'workout_exercises') return reply(exercises)
      // Every other read is an empty answer: no history or favorites.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(started ? running : null)
      if (name === 'session_snapshot') return reply(started ? running : prescribed)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'anchor_evidence') return reply(evidence)
      if (name === 'persist_session') {
        writes.push(name)
        expect(request.postDataJSON()).toMatchObject({ p_user_id: OWNER, p_session: { workout: { title: acceptance.workout.title } } })
        if (options.startFails === true) return reply({ code: 'PGRST000', message: 'Synthetic write failure.' }, 503)
        return reply(prescribed)
      }
      if (name === 'start_session') {
        writes.push(name)
        started = true
        return reply({ outcome: 'started', state: 'active', session: running.session })
      }
      if (['streak_sessions', 'constraints_in_force', 'conditioning_history', 'generation_refusal_diagnostics',
        'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-003 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-003-session', refreshToken: 'synthetic-task-003-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-003@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-task-003', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(acceptance) })

  return {
    assertContained(expectedWrites: readonly string[] = ['persist_session', 'start_session']) {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Only Start’s session calls are attempted, once each; no set is logged').toEqual(expectedWrites)
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

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number }

interface HeaderGeometry {
  title: string
  titleBox: Box
  header: Box
  badge: string | null
  badgeBox: Box | null
  badgeTruncated: boolean
  badgeLines: number
  badgeGlyph: boolean
  meta: string | null
  metaBox: Box | null
  metaFont: number
  metaVisible: boolean
  metaInsideBadge: boolean
}

/** Every shared block header in one scope, in card order. */
async function readHeaders(scope: Locator | Page, context: Context): Promise<HeaderGeometry[]> {
  return scope.locator(`[data-workout-card="${context}"] > [data-movement-group-header]`).evaluateAll((headers) =>
    headers.map((header) => {
      const box = (node: Element) => {
        const rect = node.getBoundingClientRect()
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
      }
      const title = header.querySelector(':scope > .clr-movement-group-header__title')!
      const badge = header.querySelector(':scope > .clr-movement-group-header__badge')
      const meta = header.querySelector(':scope > [data-structure-meta]')
      const frame = badge?.querySelector('.clr-chamfer--structure') ?? null
      // The label's text lines only: the glyph beside it is its own box.
      const lines = (node: Element) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        const tops = new Set<number>()
        for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
          if ((text.textContent ?? '').trim() === '') continue
          const range = document.createRange()
          range.selectNodeContents(text)
          for (const rect of range.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top))
        }
        return tops.size
      }
      const truncated = (node: Element) => {
        const style = getComputedStyle(node)
        return node.scrollWidth > node.clientWidth + 1 || style.textOverflow === 'ellipsis'
      }
      const metaStyle = meta === null ? null : getComputedStyle(meta)
      return {
        title: title.textContent ?? '',
        titleBox: box(title),
        header: box(header),
        badge: badge?.textContent ?? null,
        badgeBox: badge === null ? null : box(badge),
        badgeTruncated: frame === null ? false : truncated(frame) || [...frame.querySelectorAll('*')].some(truncated),
        badgeLines: frame === null ? 0 : lines(frame),
        badgeGlyph: frame?.querySelector('svg') !== null && frame !== null,
        meta: meta?.textContent ?? null,
        metaBox: meta === null ? null : box(meta),
        metaFont: metaStyle === null ? 0 : parseFloat(metaStyle.fontSize),
        metaVisible: metaStyle !== null && metaStyle.visibility === 'visible' && Number(metaStyle.opacity) > 0 && metaStyle.display !== 'none',
        metaInsideBadge: meta !== null && badge !== null && badge.contains(meta),
      }
    }))
}

const TOLERANCE = 1
const FORMAT_ONLY = /^(STANDARD|SUPERSET|CIRCUIT|EMOM|AMRAP|FOR TIME|LADDER)$/

/**
 * C08, C09, AC-R003-01: the badge names the format alone, sits directly below
 * the title at the header's start, on one untruncated line inside the header;
 * the details it leaves out are readable text below it, outside it.
 */
function expectHeader(header: HeaderGeometry, label: string) {
  expect(header.title, `${label}: section identity`).toBe(FORMAT_SECTION)
  if (header.badgeBox === null) {
    expect(header.meta, `${label}: no details without a badge`).toBeNull()
    return
  }
  expect(header.badge, `${label}: format or shape only`).toMatch(FORMAT_ONLY)
  expect(header.badgeGlyph, `${label}: the glyph stays a second cue`).toBe(true)
  expect(header.badgeBox.top, `${label}: badge below the title`).toBeGreaterThanOrEqual(header.titleBox.bottom - TOLERANCE)
  expect(Math.abs(header.badgeBox.left - header.header.left), `${label}: badge at the header's start`).toBeLessThanOrEqual(TOLERANCE)
  expect(header.badgeBox.right, `${label}: badge inside the header`).toBeLessThanOrEqual(header.header.right + TOLERANCE)
  expect(header.badgeTruncated, `${label}: badge never truncated`).toBe(false)
  expect(header.badgeLines, `${label}: badge on one line`).toBe(1)
  if (header.meta === null || header.metaBox === null) return
  expect(header.metaInsideBadge, `${label}: details outside the badge`).toBe(false)
  expect(header.metaVisible, `${label}: details visible`).toBe(true)
  expect(header.metaFont, `${label}: details readable`).toBeGreaterThanOrEqual(12)
  expect(header.metaBox.top, `${label}: details below the badge`).toBeGreaterThanOrEqual(header.badgeBox.bottom - TOLERANCE)
  expect(Math.abs(header.metaBox.left - header.header.left), `${label}: details at the header's start`).toBeLessThanOrEqual(TOLERANCE)
  expect(header.metaBox.right, `${label}: details inside the header`).toBeLessThanOrEqual(header.header.right + TOLERANCE)
}

/** C09: one position for every badge — the same offset under the title, whatever its label. */
function expectOnePosition(headers: HeaderGeometry[], label: string) {
  const badged = headers.filter((header) => header.badgeBox !== null)
  expect(badged.length, `${label}: badges to compare`).toBeGreaterThan(1)
  const offsets = badged.map((header) => header.badgeBox!.top - header.titleBox.bottom)
  const starts = badged.map((header) => header.badgeBox!.left - header.header.left)
  for (const [index, offset] of offsets.entries()) {
    expect(Math.abs(offset - offsets[0]), `${label}: ${badged[index].badge} offset below the title`).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(starts[index] - starts[0]), `${label}: ${badged[index].badge} start`).toBeLessThanOrEqual(TOLERANCE)
  }
}

/** Each block's movements and their prescribed loads, in card order (C10). */
async function readLoads(page: Page, context: Context): Promise<FormatReading[][]> {
  return page.locator(`[data-workout-card="${context}"]`).evaluateAll((cards, lists) =>
    cards.map((card, index) => {
      const list = [...card.querySelectorAll('ol, ul')].find((node) => node.getAttribute('aria-label') === lists[index])
      if (list === undefined) throw new Error(`No list ${lists[index]} in card ${index + 1}`)
      const identities = [...list.querySelectorAll(':scope > li [data-movement-identity]')]
      if (list.getAttribute('aria-label') === 'Rounds in this ladder') {
        // TASK-012 (C35, R70, R72): the live ladder states each movement's load
        // once, in its line of the compact prescription's summary; its rounds
        // read `2 × dumbbell thruster` and repeat no load.
        if (list.querySelector('[data-movement-load]') !== null) throw new Error('A ladder round repeats the load')
        return [...card.querySelectorAll('[data-ladder-movement]')].map((line) => ({
          name: line.querySelector('[data-movement-name]')?.textContent ?? '',
          load: line.querySelector('[data-movement-load]')?.textContent ?? null,
        }))
      }
      return identities.map((identity) => ({
        name: (identity.querySelector('[data-movement-name]')?.textContent ?? '').replace(/^\d+\.\s+/, ''),
        load: identity.querySelector('[data-movement-load]')?.textContent ?? null,
      }))
    }), [...FORMAT_LISTS[context]])
}

/** C10: every prescribed load sits in its movement's target row, beside the target. */
async function loadsInTargetRows(page: Page, context: Context) {
  const rows = await page.locator(`[data-workout-card="${context}"] [data-movement-load]`).evaluateAll((loads) =>
    loads.map((load) => {
      const row = load.closest('[data-movement-detail]') ?? load.parentElement!
      const loadBox = load.getBoundingClientRect()
      const rowBox = row.getBoundingClientRect()
      return {
        load: load.textContent ?? '',
        row: row.textContent ?? '',
        inRow: loadBox.top >= rowBox.top - 1 && loadBox.bottom <= rowBox.bottom + 1,
        visible: loadBox.width > 0 && getComputedStyle(load).visibility === 'visible',
      }
    }))
  expect(rows.length).toBeGreaterThan(0)
  for (const row of rows) {
    expect(row.row, `${context}: ${row.load} beside its target`).toMatch(/\d+ (reps|sec|m)/)
    expect(row.inRow, `${context}: ${row.load} inside its row`).toBe(true)
    expect(row.visible, `${context}: ${row.load} visible`).toBe(true)
  }
}

const expectedLoads = () => FORMAT_KEYS.map((key) => [...FORMAT_LOADS[key]])

async function openReview(page: Page, visit: (path: string) => Promise<void>, acceptance: SessionAcceptance) {
  await visit('/review')
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
  await settle(page)
}

async function startWorkout(page: Page, checkA11y: () => Promise<void>, start: (button: Locator) => Promise<void>) {
  await start(page.getByRole('button', { name: 'Start workout' }))
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByRole('list', { name: FORMAT_LISTS.workout[1], exact: true })).toBeVisible()
  await settle(page)
  await checkA11y()
}

/** Delivered-revision visual evidence: the full scrolling content, attached to the case. */
async function attachCapture(page: Page, name: string) {
  const scroller = page.locator('main .clr-scroll-region__scroller').first()
  const body = await scroller.screenshot({ caret: 'hide' }).catch(() => page.screenshot({ caret: 'hide' }))
  await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
}

/**
 * Each block's card, header and target rows, as delivered: one image per card,
 * named for its format, comparable with the accepted `cards` state (C08–C10).
 */
async function attachCards(page: Page, context: Context, name: string) {
  // Taller, at the same width, so no card is clipped under the pinned header or
  // footer; the layout under test is the width's, and it is restored after.
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 3000 })
  await settle(page)
  try {
    const cards = page.locator(`[data-workout-card="${context}"]`)
    const count = await cards.count()
    for (let index = 0; index < count; index += 1) {
      const body = await cards.nth(index).screenshot({ caret: 'hide' })
      await test.info().attach(`${context}-${FORMAT_KEYS[index] ?? index}-${name}.png`, { body, contentType: 'image/png' })
    }
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

const card = (page: Page, context: Context, index: number) => page.locator(`[data-workout-card="${context}"]`).nth(index)

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-003 consistent format badges and truthful prescribed load', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-003 ${name}: Review then Workout show format-only badges below each title, their details beside them and each prescribed load in its target row`, async ({ page, visit, checkA11y }) => {
      await page.setViewportSize(viewport)
      const acceptance = formatBadgesAcceptance({ locationId: PLACE })
      const app = await syntheticApp(page, acceptance)
      await openReview(page, visit, acceptance)

      // Review: C08, C09, AC-R003-01 — the badge, its place and the details.
      const review = await readHeaders(page, 'review')
      expect(review.map((header) => header.badge)).toEqual(FORMAT_BADGES.review)
      expect(review.map((header) => header.meta)).toEqual(FORMAT_DETAILS.review)
      review.forEach((header, index) => expectHeader(header, `Review ${FORMAT_KEYS[index]} @${name}`))
      expectOnePosition(review, `Review @${name}`)
      // C10, AC-R003-02: each prescribed load through the existing formatter and unit.
      expect(await readLoads(page, 'review')).toEqual(expectedLoads())
      await loadsInTargetRows(page, 'review')
      // C11, AC-R003-03: no generic rest on a timed movement; planned rest elsewhere stays.
      for (let index = 3; index < FORMAT_KEYS.length; index += 1) {
        await expect(card(page, 'review', index).locator('[data-movement-detail]').filter({ hasText: /\bRest\b/ })).toHaveCount(0)
      }
      await expect(card(page, 'review', 0)).toContainText('Rest 120s')
      await expect(card(page, 'review', 3)).toContainText('Rest 15s between rounds')
      await expect(card(page, 'review', 2)).toContainText('Rest 60s between rounds')
      await noHorizontalOverflow(page)
      await attachCapture(page, `review-${name}`)
      await attachCards(page, 'review', name)

      // Workout, by touch: the same blocks and prescriptions, executed.
      await startWorkout(page, checkA11y, (button) => button.tap())
      const live = await readHeaders(page, 'workout')
      expect(live.map((header) => header.badge)).toEqual(FORMAT_BADGES.workout)
      expect(live.map((header) => header.meta)).toEqual(FORMAT_DETAILS.workout)
      live.forEach((header, index) => expectHeader(header, `Workout ${FORMAT_KEYS[index]} @${name}`))
      expectOnePosition(live, `Workout @${name}`)
      // The live section's structure list says the same format-only words.
      await expect(page.getByRole('list', { name: 'Structures in this section' }).getByRole('listitem'))
        .toHaveText([...FORMAT_BADGES.workout] as string[])
      // C10: the live EMOM, AMRAP, For Time and ladder keep the prescribed load Review stated.
      expect(await readLoads(page, 'workout')).toEqual(expectedLoads())
      await loadsInTargetRows(page, 'workout')
      // AC-R003-01, AC-R003-03: the schedule, rest window and caps stay readable.
      await expect(card(page, 'workout', 3)).toContainText('MIN 1 OF 10')
      await expect(card(page, 'workout', 3)).toContainText('15s rest at the end of each minute')
      await expect(card(page, 'workout', 4)).toContainText('As many rounds as possible in 08:00.')
      await expect(page.getByText('15:00 cap', { exact: true })).toBeVisible()
      await expect(card(page, 'workout', 6)).toContainText('4 rounds · 10:00 cap on the whole ladder')
      await noHorizontalOverflow(page)
      await attachCapture(page, `workout-${name}`)
      await attachCards(page, 'workout', name)
      app.assertContained()
    })
  }

  test('AC-R003-04 keyboard and touch: the verified circuit explains its suggestion without a Review weight change, and its optional logger takes the actual weight', async ({ page, visit, checkA11y }) => {
    await page.setViewportSize(VIEWPORTS[0].viewport)
    const acceptance = formatBadgesAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance, { anchored: true })
    await openReview(page, visit, acceptance)

    // Keyboard: the circuit's suggestion opens its explanation, with no weight field.
    const circuitSuggestion = card(page, 'review', 2).getByRole('button', { name: /^(Suggested|No suggested weight)/ })
    await expect(circuitSuggestion).toBeVisible()
    await circuitSuggestion.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Why this number · kb swing')
    await checkA11y()
    await expect(dialog.getByRole('spinbutton')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Use this weight' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Use the suggestion' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(card(page, 'review', 2).getByRole('spinbutton')).toHaveCount(0)
    await expect(card(page, 'review', 2).getByRole('button', { name: /change weight/i })).toHaveCount(0)

    // Touch: a standard lift keeps its override — the circuit's proof is not extrapolated.
    await card(page, 'review', 0).getByRole('button', { name: /^(Suggested|No suggested weight)/ }).tap()
    await expect(dialog.getByRole('spinbutton')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Use this weight' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).tap()
    await expect(dialog).toBeHidden()
    await attachCapture(page, 'review-anchored-phone-320')

    // Workout: the circuit's existing optional logger is where its actual weight goes.
    await startWorkout(page, checkA11y, (button) => button.tap())
    await card(page, 'workout', 2).getByRole('button', { name: 'Rest for kb swing' }).tap()
    const form = page.getByRole('form', { name: 'Log set 1 of kb swing' })
    await expect(form).toBeVisible()
    await expect(form.getByLabel('Weight', { exact: true })).toBeVisible()
    // The prescribed target stays the circuit row's own reading, apart from the entry.
    await expect(card(page, 'workout', 2).locator('[data-movement-load]').first()).toHaveText('24 kg')
    await page.getByRole('button', { name: 'Minimize' }).tap()
    await expect(form).toBeHidden()
    app.assertContained()
  })

  test('JOURNEY-003 recovery: a failed Start keeps Review’s badges, details and loads as planned and records no work', async ({ page, visit }) => {
    await page.setViewportSize(VIEWPORTS[1].viewport)
    const acceptance = formatBadgesAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance, { startFails: true })
    await openReview(page, visit, acceptance)
    const before = { headers: await readHeaders(page, 'review'), loads: await readLoads(page, 'review') }

    await page.getByRole('button', { name: 'Start workout' }).tap()
    await expect(page.getByText('Couldn’t start this workout')).toBeVisible()
    await expect(page).toHaveURL(/\/review$/)
    const after = await readHeaders(page, 'review')
    expect(after.map((header) => [header.badge, header.meta])).toEqual(before.headers.map((header) => [header.badge, header.meta]))
    expect(await readLoads(page, 'review')).toEqual(before.loads)
    app.assertContained(['persist_session'])
  })

  test('gallery cards: the accepted state draws format-only badges below each title, the details beside them and the live prescribed load', async ({ page, visit }) => {
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await page.setViewportSize(VIEWPORTS[0].viewport)
    await visit('/gallery/refinements?state=cards')
    const state = page.locator('[data-refinement-state="cards"]')
    await expect(state).toBeVisible()
    await settle(page)

    const compositions = [
      { name: 'Standard, superset and circuit', review: [null, 'SUPERSET', 'CIRCUIT'], workout: ['STANDARD', 'SUPERSET', 'CIRCUIT'], details: { review: [null, '3 ROUNDS', '2 ROUNDS'], workout: [null, null, '2 ROUNDS'] } },
      { name: 'EMOM, AMRAP and For Time', review: ['EMOM', 'AMRAP', 'FOR TIME'], workout: ['EMOM', 'AMRAP', 'FOR TIME'], details: { review: ['10 MIN', '8 MIN', '15 MIN CAP'], workout: ['10 MIN', '8 MIN', '15 MIN CAP'] } },
    ] as const
    for (const composition of compositions) {
      await state.getByRole('radio', { name: new RegExp(composition.name) }).click()
      await settle(page)
      for (const context of ['review', 'workout'] as const) {
        const scope = state.locator(`[data-gallery-context="${context}"]`)
        const headers = await readHeaders(scope, context)
        expect(headers.map((header) => header.badge)).toEqual([...composition[context]])
        expect(headers.map((header) => header.meta)).toEqual([...composition.details[context]])
        for (const header of headers) {
          if (header.badgeBox === null) continue
          expect(header.badge).toMatch(FORMAT_ONLY)
          expect(header.badgeBox.top).toBeGreaterThanOrEqual(header.titleBox.bottom - TOLERANCE)
          expect(Math.abs(header.badgeBox.left - header.header.left)).toBeLessThanOrEqual(TOLERANCE)
          expect(header.badgeTruncated).toBe(false)
        }
      }
      // The live movements state the same prescribed load as Review, timed ones included.
      const loads = (context: Context) => state.locator(`[data-gallery-context="${context}"] [data-movement-identity]`)
        .evaluateAll((identities) => identities.map((identity) => identity.querySelector('[data-movement-load]')?.textContent ?? null))
      expect(await loads('workout')).toEqual(await loads('review'))
    }
    await attachCapture(page, 'gallery-cards-phone-320')
  })
})
