import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import {
  CONTEXT_EXPECTED,
  CONTEXT_LISTS,
  CONTEXT_SECTION,
  CONTEXT_STRUCTURES,
  contextActionsAcceptance,
  timedContextAcceptance,
  TIMED_EQUIPMENT,
  TIMED_LISTS,
  type ContextStructure,
} from '../../src/test/context-actions-fixture'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-002 (REQ-002; C03, C06, C07; JOURNEY-002) — context-specific actions
 * with compact equipment on the real `/review` and `/workout` routes.
 *
 * Entry: the same planned movements and equipment reach `/review` through the
 * existing Review hand-off, behind the existing auth guard. Action: read each
 * movement's identity and use the context's action — Swap in Review; Start;
 * then set progress, Rest and set entry on `/workout`. Result, read from the
 * browser at phone widths: equipment is quiet text beside each name, wrapping
 * as a unit; Review offers Swap under static section headers that share the
 * live cards' header face; the workout offers progress, Rest and logging and
 * never Swap. Recovery: a failed alternatives read and a failed Start leave
 * Review as planned; keyboard and touch reach every action; reduced motion.
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads. The only writes the app attempts are Start's two session
 * calls, answered here and never forwarded; no set is logged, no model is
 * called and no real account or row exists to mutate.
 */
const OWNER = '00000000-0000-4000-8000-000000000201'
const PLACE = '00000000-0000-4000-8000-000000000211'
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
    if (code !== null) throw new Error(`Synthetic TASK-002 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-002 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-002.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-002-public-placeholder',
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
const LIVE_PROGRESS = /^(Set \d+\/\d+|Extra set \d+)$/

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  /** Every alternatives read fails, as an unreachable catalog would. */
  candidatesFail?: boolean
  /** Start's first write fails, so the session is never created. */
  startFails?: boolean
}

async function syntheticApp(page: Page, acceptance: SessionAcceptance, options: AppOptions = {}) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = sessionSnapshotSchema.parse(peerGroupingSnapshot(acceptance, { userId: OWNER }))
  const running: SessionSnapshot = sessionSnapshotSchema.parse(
    peerGroupingSnapshot(acceptance, { userId: OWNER, startedAt }),
  )
  const exercises = running.sections.flatMap((section) => section.blocks)
    .flatMap((block) => block.exercises.map(({ exercise }) => exercise))
  const writes: string[] = []
  const unexpected: string[] = []
  let candidateReads = 0
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
      if (name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(exercises.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (name === 'workout_exercises') return reply(exercises)
      // Every other read is an empty answer: no history, anchors or favorites.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(started ? running : null)
      if (name === 'session_snapshot') return reply(started ? running : prescribed)
      if (name === 'session_as_performed') return reply(null)
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
      if (name === 'generation_candidate_sets_for_goal' || name === 'generation_candidate_sets') {
        candidateReads += 1
        if (options.candidatesFail === true) return reply({ code: 'PGRST000', message: 'Synthetic read failure.' }, 503)
        return reply([])
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-002 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-002-session', refreshToken: 'synthetic-task-002-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-002@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-task-002', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(acceptance) })

  return {
    candidateReads: () => candidateReads,
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

interface IdentityGeometry {
  name: string
  equipment: string
  load: string | null
  column: Box
  nameLastLine: Box
  nameBox: Box
  equipmentBox: Box
  equipmentLines: number
  equipmentFont: number
  nameFont: number
  equipmentVisible: boolean
  equipmentGlyphs: number
  equipmentTruncated: boolean
  equipmentInsideName: boolean
  slot: { kind: string; box: Box; text: string } | null
  overflow: boolean
  card: Box
}

async function readIdentities(scope: Locator): Promise<IdentityGeometry[]> {
  return scope.evaluate((list) => {
    const box = (node: Element | DOMRect) => {
      const rect = node instanceof DOMRect ? node : node.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const lineRects = (node: Element) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      return [...range.getClientRects()].filter((rect) => rect.width > 0)
    }
    return [...list.querySelectorAll(':scope > li [data-movement-identity]')].map((identity) => {
      const nameRow = identity.querySelector(':scope > [data-movement-name-row]')!
      const column = nameRow.querySelector(':scope > .clr-movement-identity__title')!
      const name = column.querySelector(':scope > .clr-movement-identity__name')!
      const words = name.querySelector('[data-movement-name]')!
      const equipment = column.querySelector(':scope > [data-movement-context]')
      if (equipment === null) throw new Error(`No equipment beside ${words.textContent}`)
      const nameLines = lineRects(words)
      const last = nameLines.at(-1)!
      const style = getComputedStyle(equipment)
      const slotElement = nameRow.querySelector(':scope > .clr-movement-identity__action, :scope > .clr-movement-identity__counter')
      const slotTarget = slotElement?.querySelector('button') ?? slotElement
      return {
        name: words.textContent ?? '',
        equipment: equipment.textContent ?? '',
        load: identity.querySelector('[data-movement-load]')?.textContent ?? null,
        column: box(column),
        nameLastLine: box(last),
        nameBox: box(name),
        equipmentBox: box(equipment),
        equipmentLines: new Set(lineRects(equipment).map((rect) => Math.round(rect.top))).size,
        equipmentFont: parseFloat(style.fontSize),
        nameFont: parseFloat(getComputedStyle(name).fontSize),
        equipmentVisible: style.visibility === 'visible' && Number(style.opacity) > 0 && style.display !== 'none',
        equipmentGlyphs: equipment.querySelectorAll('svg, img').length,
        equipmentTruncated: equipment.scrollWidth > equipment.clientWidth + 1 || style.textOverflow === 'ellipsis',
        equipmentInsideName: name.contains(equipment),
        slot: slotTarget === null || slotTarget === undefined
          ? null
          : { kind: slotElement!.className, box: box(slotTarget), text: slotElement!.textContent ?? '' },
        overflow: column.scrollWidth > column.clientWidth + 1 || identity.scrollWidth > identity.clientWidth + 1,
        card: box(identity.closest('.clr-card') ?? identity),
      }
    })
  })
}

const TOLERANCE = 1

/**
 * C03, AC-R002-01: the equipment is readable, quiet text beside the name —
 * on the name's last line when it fits, otherwise moved as one unit to the
 * start of the next line inside the name column — never inside the name's own
 * element, never truncated, never an icon alone and never under the slot.
 */
function expectEquipmentBesideName(movement: IdentityGeometry, label: string) {
  const at = `${label}: ${movement.name}`
  expect(movement.equipmentVisible, `${at}: equipment visible`).toBe(true)
  expect(movement.equipmentGlyphs, `${at}: equipment is text, not a glyph alone`).toBe(0)
  expect(movement.equipmentTruncated, `${at}: equipment is not truncated`).toBe(false)
  expect(movement.equipmentInsideName, `${at}: the name element holds only the name`).toBe(false)
  expect(movement.equipmentFont, `${at}: equipment readable`).toBeGreaterThanOrEqual(12)
  expect(movement.equipmentFont, `${at}: equipment quieter than the name`).toBeLessThan(movement.nameFont)
  const { equipmentBox: equipment, nameLastLine: line, column } = movement
  const besideOnLine = equipment.left >= line.right - TOLERANCE &&
    equipment.top < line.bottom && equipment.bottom > line.top
  const wrappedAsUnit = Math.abs(equipment.left - column.left) <= TOLERANCE &&
    equipment.top >= line.bottom - TOLERANCE && equipment.top - line.bottom < movement.nameFont
  expect(besideOnLine || wrappedAsUnit, `${at}: beside the name, or wrapped as one unit under it`).toBe(true)
  expect(movement.equipmentLines, `${at}: equipment wraps as a unit`).toBe(1)
  expect(equipment.left, `${at}: inside the name column`).toBeGreaterThanOrEqual(column.left - TOLERANCE)
  expect(equipment.right, `${at}: inside the name column`).toBeLessThanOrEqual(column.right + TOLERANCE)
  expect(movement.overflow, `${at}: nothing overflows`).toBe(false)
  if (movement.slot !== null) {
    expect(equipment.right, `${at}: equipment never under the ${movement.slot.kind}`).toBeLessThanOrEqual(movement.slot.box.left + TOLERANCE)
  }
}

/** C06: Review's slot is Swap; the live slot is set progress, never Swap. */
function expectSlot(movement: IdentityGeometry, context: Context, label: string, progress: boolean) {
  const at = `${label}: ${movement.name}`
  if (context === 'review') {
    expect(movement.slot?.kind, `${at}: Review supplies Swap`).toBe('clr-movement-identity__action')
    expect(movement.slot?.text, `${at}: Swap`).toMatch(/Swap/i)
  } else if (progress) {
    expect(movement.slot?.kind, `${at}: Workout supplies progress`).toBe('clr-movement-identity__counter')
    expect(movement.slot?.text, `${at}: progress`).toMatch(LIVE_PROGRESS)
  } else {
    expect(movement.slot?.kind ?? null, `${at}: no Swap in the workout`).not.toBe('clr-movement-identity__action')
  }
  if (movement.slot !== null) {
    expect(movement.slot.box.left, `${at}: slot not covered by the name`).toBeGreaterThanOrEqual(movement.column.right - TOLERANCE)
    expect(movement.slot.box.right, `${at}: slot inside the card`).toBeLessThanOrEqual(movement.card.right + TOLERANCE)
  }
}

const readings = (movements: IdentityGeometry[]) => movements.map(({ name, equipment, load }) => ({ name, equipment, load }))

interface HeaderGeometry {
  tag: string
  text: string
  badge: string | null
  header: Box
  title: Box
  badgeBox: Box | null
  face: Record<string, string>
  controls: number
  cursor: string
  hitIsTitle: boolean
}

const FACE = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'color'] as const

async function readHeaders(page: Page, context: Context): Promise<HeaderGeometry[]> {
  return page.locator(`[data-workout-card="${context}"] > [data-movement-group-header]`).evaluateAll((headers, face) =>
    headers.map((header) => {
      const box = (node: Element) => {
        const rect = node.getBoundingClientRect()
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
      }
      const title = header.querySelector('.clr-movement-group-header__title')!
      const badge = header.querySelector('.clr-movement-group-header__badge')
      // Read each header in view, so what is under a tap is the page itself.
      title.scrollIntoView({ block: 'center' })
      const style = getComputedStyle(title)
      const rect = title.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + Math.min(4, rect.width / 2), rect.top + rect.height / 2)
      return {
        tag: title.tagName,
        text: title.textContent ?? '',
        badge: badge?.textContent ?? null,
        header: box(header),
        title: box(title),
        badgeBox: badge === null ? null : box(badge),
        face: Object.fromEntries(face.map((property) => [property, style[property]])),
        controls: header.querySelectorAll('button, a, [role="button"], [aria-expanded], [tabindex]').length,
        cursor: style.cursor,
        hitIsTitle: hit !== null && title.contains(hit) && hit.closest('button') === null,
      }
    }), [...FACE])
}

/** C07, R37: the static header — section identity left, badge right, no control. */
function expectStaticHeader(header: HeaderGeometry, label: string) {
  expect(header.text, `${label}: section identity`).toBe(CONTEXT_SECTION)
  expect(header.controls, `${label}: no toggle, chevron, link or focus stop`).toBe(0)
  expect(header.cursor, `${label}: no hit area`).not.toBe('pointer')
  expect(header.hitIsTitle, `${label}: the title itself is under a tap, not a control`).toBe(true)
  expect(Math.abs(header.title.left - header.header.left), `${label}: identity on the left`).toBeLessThanOrEqual(TOLERANCE)
  if (header.badgeBox !== null && header.badgeBox.top < header.title.bottom) {
    expect(Math.abs(header.badgeBox.right - header.header.right), `${label}: badge on the right`).toBeLessThanOrEqual(TOLERANCE)
  }
}

async function openReview(page: Page, visit: (path: string) => Promise<void>, acceptance: SessionAcceptance) {
  await visit('/review')
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
  await settle(page)
}

async function startWorkout(page: Page, checkA11y: () => Promise<void>, firstList: string) {
  await page.getByRole('button', { name: 'Start workout' }).click()
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByRole('list', { name: firstList, exact: true })).toBeVisible()
  await settle(page)
  await checkA11y()
}

/** Delivered-revision visual evidence: the full scrolling content, attached to the case. */
async function attachCapture(page: Page, name: string) {
  const scroller = page.locator('main .clr-scroll-region__scroller').first()
  const body = await scroller.screenshot({ caret: 'hide' }).catch(() => page.screenshot({ caret: 'hide' }))
  await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
}

function contextList(page: Page, context: Context, structure: ContextStructure): Locator {
  return page.getByRole('list', { name: CONTEXT_LISTS[context][structure], exact: true })
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-002 context-specific actions with compact equipment', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-002 ${name}: Review offers Swap under static headers, then Workout offers progress, Rest and logging with equipment beside each name`, async ({ page, visit, checkA11y }) => {
      await page.setViewportSize(viewport)
      const acceptance = contextActionsAcceptance({ locationId: PLACE })
      const app = await syntheticApp(page, acceptance)
      await openReview(page, visit, acceptance)

      // Review: compact equipment beside each name, Swap in the slot.
      const review: Partial<Record<ContextStructure, IdentityGeometry[]>> = {}
      for (const structure of CONTEXT_STRUCTURES) {
        await expect(contextList(page, 'review', structure)).toBeVisible()
        const movements = await readIdentities(contextList(page, 'review', structure))
        review[structure] = movements
        expect(readings(movements), `Review ${structure} readings`).toEqual(CONTEXT_EXPECTED[structure])
        for (const movement of movements) {
          expectEquipmentBesideName(movement, `Review ${structure} @${name}`)
          expectSlot(movement, 'review', `Review ${structure} @${name}`, false)
        }
      }
      if (viewport.width <= 320) {
        // The long name genuinely wraps on the narrow phone, and its equipment still reads beside it.
        const [long] = review.superset!
        expect(long.nameLastLine.top).toBeGreaterThan(long.nameBox.top)
      }

      // Review: static section headers in the live header's face; nothing live.
      const reviewHeaders = await readHeaders(page, 'review')
      expect(reviewHeaders).toHaveLength(3)
      reviewHeaders.forEach((header, index) => expectStaticHeader(header, `Review header ${index + 1} @${name}`))
      expect(reviewHeaders[0].tag).toBe('H2')
      expect(reviewHeaders.map((header) => header.badge)).toEqual([null, 'SUPERSET · 3 ROUNDS', 'CIRCUIT · 2 ROUNDS'])
      const main = page.locator('main')
      await expect(main.getByRole('button', { name: /^Rest( for .+)?$/ })).toHaveCount(0)
      await expect(main.getByRole('button', { name: /^Log\b/ })).toHaveCount(0)
      await expect(main.getByText(LIVE_PROGRESS)).toHaveCount(0)
      for (const planned of ['3 × 5 reps', 'Rest 120s', 'One round: 01 → 02', 'Rest 90s between rounds', 'Rest 60s between rounds']) {
        await expect(main, `planned ${planned} stays in Review`).toContainText(planned)
      }

      // Tapping a section header changes nothing: it is not a control.
      const heading = page.getByRole('heading', { level: 2, name: CONTEXT_SECTION })
      const size = async () => {
        const box = await contextList(page, 'review', 'standard').boundingBox()
        return box === null ? null : { width: box.width, height: box.height }
      }
      const before = await size()
      await heading.tap()
      await expect(contextList(page, 'review', 'standard')).toBeVisible()
      // The section's content keeps its full size: nothing collapsed or toggled.
      expect(await size()).toEqual(before)
      await expect(page.locator('[data-workout-card="review"] [aria-expanded]')).toHaveCount(
        await page.locator('[data-workout-card="review"] .clr-collapsible__trigger').count(),
      )

      // Review's contextual action by touch: Swap opens this slot's alternatives; Keep returns.
      await page.getByRole('button', { name: 'Swap back squat' }).tap()
      const keep = page.getByRole('button', { name: 'Keep back squat' })
      await expect(keep).toBeVisible()
      await keep.tap()
      await expect(keep).toBeHidden()
      expect(readings(await readIdentities(contextList(page, 'review', 'standard')))).toEqual(CONTEXT_EXPECTED.standard)
      await noHorizontalOverflow(page)
      await attachCapture(page, `review-${name}`)

      // Workout: the same movements, equipment and header face; progress, Rest and logging.
      await startWorkout(page, checkA11y, CONTEXT_LISTS.workout.superset)
      for (const structure of CONTEXT_STRUCTURES) {
        const movements = await readIdentities(contextList(page, 'workout', structure))
        expect(readings(movements), `Workout ${structure} readings`).toEqual(CONTEXT_EXPECTED[structure])
        for (const movement of movements) {
          expectEquipmentBesideName(movement, `Workout ${structure} @${name}`)
          expectSlot(movement, 'workout', `Workout ${structure} @${name}`, structure !== 'circuit')
        }
      }
      const liveHeaders = await readHeaders(page, 'workout')
      expect(liveHeaders).toHaveLength(3)
      liveHeaders.forEach((header, index) => expectStaticHeader(header, `Workout header ${index + 1} @${name}`))
      expect(liveHeaders[0].tag).toBe('SPAN')
      for (const property of FACE) {
        expect(liveHeaders[0].face[property], `C07: header ${property} shared by Review and Workout`).toBe(reviewHeaders[0].face[property])
      }
      const live = page.locator('main')
      await expect(live.getByRole('button', { name: /^Swap / })).toHaveCount(0)
      await expect(live.getByRole('button', { name: 'Rest', exact: true })).toHaveCount(CONTEXT_EXPECTED.standard.length + 1)
      await expect(live.getByRole('button', { name: /^Rest for / })).toHaveCount(CONTEXT_EXPECTED.circuit.length)
      await noHorizontalOverflow(page)
      await attachCapture(page, `workout-${name}`)

      // Workout's contextual action by touch: Rest opens this set's entry. Nothing is logged.
      await contextList(page, 'workout', 'standard').getByRole('button', { name: 'Rest', exact: true }).first().tap()
      await expect(page.getByRole('form', { name: 'Log set 1 of back squat' })).toBeVisible()
      await page.getByRole('button', { name: 'Minimize' }).tap()
      await expect(page.getByRole('form', { name: 'Log set 1 of back squat' })).toBeHidden()
      app.assertContained()
    })
  }

  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-002 timed ${name}: EMOM, AMRAP and For Time keep the same equipment beside each name in Review and Workout`, async ({ page, visit, checkA11y }) => {
      await page.setViewportSize(viewport)
      const acceptance = timedContextAcceptance({ locationId: PLACE })
      const app = await syntheticApp(page, acceptance)
      await openReview(page, visit, acceptance)

      for (const [index, listName] of TIMED_LISTS.review.entries()) {
        const movements = await readIdentities(page.getByRole('list', { name: listName, exact: true }))
        expect(movements.map((movement) => movement.equipment), `Review ${listName}`).toEqual(TIMED_EQUIPMENT[index])
        for (const movement of movements) {
          expectEquipmentBesideName(movement, `Review ${listName} @${name}`)
          expectSlot(movement, 'review', `Review ${listName} @${name}`, false)
        }
      }
      // Bodyweight beside bodyweight equipment is said once; the loaded movements keep their load.
      const [emom] = await readIdentities(page.getByRole('list', { name: 'emom', exact: true }))
      expect(emom.load).toBe('24 kg')
      const headers = await readHeaders(page, 'review')
      expect(headers.map((header) => header.badge?.split(' · ')[0])).toEqual(['EMOM', 'AMRAP', 'FOR TIME'])
      headers.forEach((header, index) => expectStaticHeader(header, `Review timed header ${index + 1} @${name}`))
      await noHorizontalOverflow(page)
      await attachCapture(page, `review-timed-${name}`)

      await startWorkout(page, checkA11y, TIMED_LISTS.workout[0])
      for (const [index, listName] of TIMED_LISTS.workout.entries()) {
        const movements = await readIdentities(page.getByRole('list', { name: listName, exact: true }))
        expect(movements.map((movement) => movement.equipment), `Workout ${listName}`).toEqual(TIMED_EQUIPMENT[index])
        for (const movement of movements) {
          expectEquipmentBesideName(movement, `Workout ${listName} @${name}`)
          expectSlot(movement, 'workout', `Workout ${listName} @${name}`, false)
        }
      }
      await expect(page.locator('main').getByRole('button', { name: /^Swap / })).toHaveCount(0)
      await noHorizontalOverflow(page)
      await attachCapture(page, `workout-timed-${name}`)
      app.assertContained()
    })
  }

  test('AC-R002-02 keyboard: Review section headers are not focus stops, Swap and the tempo detail are, and Coaching and notes stays a disclosure in Workout', async ({ page, visit, checkA11y }) => {
    const acceptance = contextActionsAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance)
    await openReview(page, visit, acceptance)

    // Walk the whole tab order once, from the top of the page to Start.
    const stops: { name: string; inHeader: boolean }[] = []
    await page.locator('body').focus()
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab')
      const stop = await page.evaluate(() => {
        const active = document.activeElement
        if (active === null || active === document.body) return null
        return {
          name: (active.getAttribute('aria-label') ?? active.textContent ?? '').trim(),
          inHeader: active.closest('[data-movement-group-header]') !== null,
        }
      })
      if (stop === null) continue
      stops.push(stop)
      if (stop.name === 'Start workout') break
    }
    expect(stops.some((stop) => stop.inHeader), 'no stop inside a section header').toBe(false)
    expect(stops.map((stop) => stop.name)).toEqual(expect.arrayContaining([
      'Swap back squat', 'Swap push up', 'Swap kb swing', 'Tempo', 'Regenerate', 'Start workout',
    ]))

    // The tempo detail keeps its own disclosure, by keyboard.
    const tempo = page.getByRole('button', { name: 'Tempo' })
    await tempo.focus()
    await page.keyboard.press('Enter')
    await expect(tempo).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('region', { name: 'Tempo' })).toContainText('3-1-1-0')
    // Swap by keyboard, then Escape back to the same Review.
    await page.getByRole('button', { name: 'Swap kb swing' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Keep kb swing' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Keep kb swing' })).toBeHidden()

    await startWorkout(page, checkA11y, CONTEXT_LISTS.workout.superset)
    // The separate Coaching and notes disclosure remains, closed until asked for.
    const coaching = page.getByRole('button', { name: 'Coaching and notes — back squat' })
    await expect(coaching).toHaveAttribute('aria-expanded', 'false')
    await coaching.focus()
    await page.keyboard.press('Enter')
    await expect(coaching).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Enter')
    await expect(coaching).toHaveAttribute('aria-expanded', 'false')
    // Rest by keyboard opens the set entry.
    await contextList(page, 'workout', 'standard').getByRole('button', { name: 'Rest', exact: true }).first().focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('form', { name: 'Log set 1 of back squat' })).toBeVisible()
    app.assertContained()
  })

  test('JOURNEY-002 recovery: a failed alternatives read and a failed Start keep Review as planned and record no work', async ({ page, visit }) => {
    const acceptance = contextActionsAcceptance({ locationId: PLACE })
    const app = await syntheticApp(page, acceptance, { candidatesFail: true, startFails: true })
    await openReview(page, visit, acceptance)
    const before = await Promise.all(CONTEXT_STRUCTURES.map(async (structure) =>
      readings(await readIdentities(contextList(page, 'review', structure)))))

    await page.getByRole('button', { name: 'Swap push up' }).tap()
    await expect(page.getByText('Alternatives didn’t load')).toBeVisible()
    const reads = app.candidateReads()
    expect(reads).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Try again' }).tap()
    await expect.poll(() => app.candidateReads()).toBeGreaterThan(reads)
    await expect(page.getByText('Alternatives didn’t load')).toBeVisible()
    await page.getByRole('button', { name: 'Keep push up' }).tap()
    await expect(page.getByRole('button', { name: 'Keep push up' })).toBeHidden()

    await page.getByRole('button', { name: 'Start workout' }).tap()
    await expect(page.getByText('Couldn’t start this workout')).toBeVisible()
    await expect(page).toHaveURL(/\/review$/)
    // Review is as planned behind the error: same readings, static headers and Swap.
    const after = await Promise.all(CONTEXT_STRUCTURES.map(async (structure) =>
      readings(await readIdentities(contextList(page, 'review', structure)))))
    expect(after).toEqual(before)
    expect(await readHeaders(page, 'review')).toHaveLength(3)
    await expect(page.locator('main').getByRole('button', { name: /^Swap / })).toHaveCount(7)
    app.assertContained(['persist_session'])
  })

  test('gallery cards: the accepted state draws Review and Workout through the same card, static header and context slots', async ({ page, visit }) => {
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await visit('/gallery/refinements?state=cards')
    const state = page.locator('[data-refinement-state="cards"]')
    await expect(state).toBeVisible()
    await settle(page)

    for (const composition of ['Standard, superset and circuit', 'EMOM, AMRAP and For Time']) {
      await state.getByRole('radio', { name: new RegExp(composition) }).click()
      await settle(page)
      for (const context of ['review', 'workout'] as const) {
        const scope = state.locator(`[data-gallery-context="${context}"]`)
        const lists = scope.locator('ol.clr-movement-list')
        const count = await lists.count()
        expect(count).toBeGreaterThan(0)
        for (let index = 0; index < count; index += 1) {
          for (const movement of await readIdentities(lists.nth(index))) {
            expectEquipmentBesideName(movement, `Gallery ${context} ${composition}`)
            if (context === 'review') expectSlot(movement, 'review', `Gallery ${context}`, false)
            else expect(movement.slot?.kind ?? null).not.toBe('clr-movement-identity__action')
          }
        }
        const headers = await scope.locator('[data-workout-card] > [data-movement-group-header]').count()
        expect(headers).toBe(await scope.locator('[data-workout-card]').count())
        await expect(scope.locator('[data-movement-group-header] button, [data-movement-group-header] [aria-expanded]')).toHaveCount(0)
      }
    }
  })
})
