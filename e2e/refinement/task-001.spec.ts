import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import {
  peerGroupingAcceptance,
  SUPERSET_BLOCK,
  TEN_STATION_CIRCUIT_BLOCK,
} from '../../src/dev/gallery-refinement-cards-data'
import { reviewHandoff } from '../../src/state/review-handoff'
import { sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot } from '../../src/state/schemas'
import { peerGroupingSnapshot } from '../../src/test/peer-grouping-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-001 (REQ-001; C01, C02, C04; JOURNEY-001) — the shared movement
 * hierarchy and peer grouping on the real `/review` and `/workout` routes.
 *
 * Entry: a composed workout with standard, superset and circuit peers carrying
 * identical prescribed data reaches `/review` through the existing Review
 * hand-off, behind the existing auth guard. Action: Start. Result: the same
 * movements on `/workout`. At phone, tablet and desktop widths the rendered
 * geometry is read from the browser: prominent names, readable prescriptions
 * and loads, quiet equipment, a separate action/progress slot that the name
 * never covers, separators only between peers and no inner grouping rail.
 *
 * Carried onto Round 7 (gallery bec4454) by A3 TASK-112: each row is
 * `MovementIdentity` (src/ui/movement-presentation.tsx), whose name element is
 * the wrapping column (the compact equipment is inline in it, after the name's
 * words) and whose action or progress slot is the name's sibling; a live
 * group's ordinal (`A1`, `10.`) is part of the name's words, Review's is its
 * own element. Review draws a standard block's rows straight in its card's
 * movement group, with no list and no rule between them.
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads. The only writes the app attempts are Start's two session
 * calls, which are answered here and never forwarded; no model is called and
 * no real account or row exists to mutate.
 */
const OWNER = '00000000-0000-4000-8000-000000000101'
const PLACE = '00000000-0000-4000-8000-000000000111'
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
    if (code !== null) throw new Error(`Synthetic TASK-001 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-001 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-001.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-001-public-placeholder',
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
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'tablet-768', viewport: { width: 768, height: 1024 } },
  { name: 'desktop-1280', viewport: { width: 1280, height: 800 } },
]

/**
 * Each structure's movements by context. Every Workout block and every grouped
 * Review block is a named list; Round 7's Review draws a standard block's rows
 * straight in its card's movement group, with no list around them (`null`).
 */
const LISTS = {
  review: { standard: null, superset: 'superset, 3 rounds', circuit: 'circuit, 2 rounds' },
  workout: { standard: 'Movements in this block', superset: 'Movements in this superset', circuit: 'Movements in this circuit' },
} as const
type Context = keyof typeof LISTS
type Structure = keyof (typeof LISTS)['review']
const STRUCTURES: readonly Structure[] = ['standard', 'superset', 'circuit']

/** The identical prescribed readings both contexts must show. */
const EXPECTED: Readonly<Record<Structure, ReadonlyArray<{ name: string; equipment: string; load: string | null }>>> = {
  standard: [
    { name: 'back squat', equipment: 'barbell', load: '100 kg' },
    { name: 'romanian deadlift', equipment: 'barbell', load: '70 kg' },
  ],
  superset: [
    { name: 'single arm kettlebell overhead reverse lunge to knee drive', equipment: 'kettlebell', load: '16 kg' },
    { name: 'push up', equipment: 'bodyweight', load: null },
  ],
  circuit: [
    { name: 'kb swing', equipment: 'kettlebell', load: '24 kg' },
    { name: 'mountain climber', equipment: 'bodyweight', load: null },
    { name: 'plank', equipment: 'bodyweight', load: null },
  ],
}

/** The cards state's lists (`LiveFlow`: the gallery's own timed blocks) and what each peer reads. */
const GALLERY_PEERS: ReadonlyArray<readonly [string, ReadonlyArray<{ name: string; equipment: string; load: string | null }>]> = [
  ['Movements in this EMOM', [{ name: 'kb swing', equipment: 'kettlebell', load: '24 lb' }]],
  ['Movements in this AMRAP', [{ name: 'burpee', equipment: 'bodyweight', load: null }]],
  ['Movements in this FOR TIME', [{ name: 'wall ball', equipment: 'medicine ball', load: '9 lb' }]],
]

const LAST_PERFORMANCE = /\bLast\b\s*(:|session|time|performed|performance)/i

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

async function syntheticApp(page: Page, acceptance: SessionAcceptance) {
  const startedAt = new Date(Date.now() - 60_000).toISOString()
  const prescribed = sessionSnapshotSchema.parse(peerGroupingSnapshot(acceptance, { userId: OWNER }))
  const running: SessionSnapshot = sessionSnapshotSchema.parse(
    peerGroupingSnapshot(acceptance, { userId: OWNER, startedAt }),
  )
  const exercises = running.sections.flatMap((section) => section.blocks)
    .flatMap((block) => block.exercises.map(({ exercise }) => exercise))
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
        return reply(prescribed)
      }
      if (name === 'start_session') {
        writes.push(name)
        started = true
        return reply({ outcome: 'started', state: 'active', session: running.session })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_candidate_sets_for_goal'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-001 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-001-session', refreshToken: 'synthetic-task-001-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-001@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-task-001', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(acceptance) })

  return {
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Only Start’s two session calls are attempted, once each').toEqual(['persist_session', 'start_session'])
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

interface MovementGeometry {
  name: string
  equipment: string
  load: string | null
  nameFont: number
  nameWeight: number
  prescriptionFont: number
  equipmentFont: number
  nameColor: string
  equipmentColor: string
  column: Box
  ordinal: Box | null
  nameLines: number
  slot: { kind: string; box: Box } | null
  slotsInsideColumn: boolean
  prescription: Box
  overflow: boolean
}

interface ListGeometry {
  /** A named list (`ol`), or Review's standard group (Round 7: no list). */
  listed: boolean
  itemRules: { width: number; style: string }[]
  rails: { element: string; width: number; style: string }[]
  movements: MovementGeometry[]
  card: Box
}

async function readList(list: Locator): Promise<ListGeometry> {
  return list.evaluate((ol) => {
    const LIVE_ORDINAL = /^([A-Z]\d+|\d+\.) /
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const lines = (node: Element) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size
    }
    const rail = (element: Element, label: string) => {
      const style = getComputedStyle(element)
      return { element: label, width: parseFloat(style.borderLeftWidth), style: style.borderLeftStyle }
    }
    const listed = ol.tagName === 'OL'
    // Review's standard group (Round 7): each row is the stack around one identity.
    const items = listed ? [...ol.children] : [...ol.children].filter((child) => child.querySelector('.clr-movement-identity') !== null)
    const rails = [rail(ol, 'list'), rail(ol.parentElement!, 'group'), ...items.map((item, index) => rail(item, `item ${index + 1}`))]
    const movements = items.map((item) => {
      const identity = item.querySelector('.clr-movement-identity')!
      const nameRow = identity.querySelector(':scope > [data-movement-name-row]')!
      // Round 7: the name element is the wrapping column; the equipment is inline in it.
      const column = nameRow.querySelector(':scope > .clr-movement-identity__name')!
      const name = column
      const words = column.querySelector(':scope > span:not([data-movement-context])')!
      const ordinal = column.querySelector('.clr-movement-identity__ordinal')
      const equipment = column.querySelector(':scope > [data-movement-context]')!
      const prescription = identity.querySelector(':scope > [data-movement-detail]')!
      const load = prescription.querySelector(':scope > span:nth-child(2)')
      const slotElement = nameRow.querySelector(':scope > .clr-movement-identity__action, :scope > .clr-movement-identity__counter')
      const slotTarget = slotElement?.querySelector('button') ?? slotElement
      const ownWords = [...words.childNodes]
        .filter((node) => !(node instanceof HTMLElement && node.classList.contains('clr-movement-identity__ordinal')))
        .map((node) => node.textContent ?? '').join('')
      return {
        name: ownWords.replace(LIVE_ORDINAL, ''),
        equipment: equipment.textContent ?? '',
        load: load?.textContent ?? null,
        nameFont: parseFloat(getComputedStyle(name).fontSize),
        nameWeight: Number(getComputedStyle(name).fontWeight),
        prescriptionFont: parseFloat(getComputedStyle(prescription).fontSize),
        equipmentFont: parseFloat(getComputedStyle(equipment).fontSize),
        nameColor: getComputedStyle(name).color,
        equipmentColor: getComputedStyle(equipment).color,
        column: box(column),
        ordinal: ordinal === null ? null : box(ordinal),
        nameLines: lines(words),
        // The slot's own class (Round 7's counter also wears a text role).
        slot: slotTarget === null || slotTarget === undefined
          ? null
          : { kind: [...slotElement!.classList].find((name) => name.startsWith('clr-movement-identity__')) ?? '', box: box(slotTarget) },
        slotsInsideColumn: column.querySelector('.clr-movement-identity__action, .clr-movement-identity__counter') !== null,
        prescription: box(prescription),
        overflow: column.scrollWidth > column.clientWidth + 1 || identity.scrollWidth > identity.clientWidth + 1,
      }
    })
    return {
      listed,
      itemRules: items.map((item) => {
        const style = getComputedStyle(item)
        return { width: parseFloat(style.borderBottomWidth), style: style.borderBottomStyle }
      }),
      rails,
      movements,
      card: box(ol.closest('.clr-card') ?? ol),
    }
  })
}

const TOLERANCE = 0.75

/**
 * C04 + AC-R001-01: a rule after every peer but the last; no rail anywhere.
 * Round 7's Review standard block is not a list: its rows are spaced by the
 * group's gap, with no rule after any of them (so none after the last).
 */
function expectPeerOnlySeparators(geometry: ListGeometry, label: string) {
  expect(geometry.itemRules.length, `${label}: peers`).toBeGreaterThan(0)
  geometry.itemRules.forEach((rule, index) => {
    if (!geometry.listed) {
      expect(rule.style === 'none' || rule.width === 0, `${label}: no rule after Review's standard row ${index + 1} (Round 7)`).toBe(true)
    } else if (index < geometry.itemRules.length - 1) {
      expect(rule.style, `${label}: separator after peer ${index + 1}`).toBe('solid')
      expect(rule.width, `${label}: separator after peer ${index + 1}`).toBeGreaterThan(0)
    } else {
      expect(rule.style === 'none' || rule.width === 0, `${label}: no final-item rule`).toBe(true)
    }
  })
  for (const rail of geometry.rails) {
    expect(rail.style === 'none' || rail.width === 0, `${label}: no inner grouping rail on ${rail.element}`).toBe(true)
  }
}

/** C01 + AC-R001-02: hierarchy, and a slot the wrapped name never covers. */
function expectHierarchy(geometry: ListGeometry, context: Context, label: string) {
  for (const movement of geometry.movements) {
    const at = `${label}: ${movement.name}`
    expect(movement.nameFont, `${at}: name leads the prescription`).toBeGreaterThan(movement.prescriptionFont)
    expect(movement.prescriptionFont, `${at}: equipment is quieter than the prescription`).toBeGreaterThan(movement.equipmentFont)
    expect(movement.nameWeight, `${at}: name weight`).toBeGreaterThanOrEqual(600)
    expect(movement.equipmentColor, `${at}: equipment is a quieter ink`).not.toBe(movement.nameColor)
    expect(movement.prescription.top, `${at}: prescription below the name row`).toBeGreaterThanOrEqual(movement.column.top)
    expect(movement.overflow, `${at}: nothing overflows its column`).toBe(false)
    expect(movement.column.right, `${at}: inside the card`).toBeLessThanOrEqual(geometry.card.right + TOLERANCE)
    expect(movement.slotsInsideColumn, `${at}: slots are not inside the name column`).toBe(false)
    if (movement.ordinal !== null) {
      expect(movement.ordinal.left, `${at}: ordinal inside the column`).toBeGreaterThanOrEqual(movement.column.left - TOLERANCE)
      expect(movement.ordinal.right, `${at}: ordinal inside the column`).toBeLessThanOrEqual(movement.column.right + TOLERANCE)
    }
    if (movement.slot !== null) {
      // The name column ends before the action/progress target begins.
      expect(movement.slot.box.left, `${at}: ${movement.slot.kind} not covered by the name`).toBeGreaterThanOrEqual(movement.column.right - TOLERANCE)
      expect(movement.slot.box.right, `${at}: ${movement.slot.kind} inside the card`).toBeLessThanOrEqual(geometry.card.right + TOLERANCE)
      expect(movement.slot.box.width, `${at}: ${movement.slot.kind} keeps its size`).toBeGreaterThan(0)
    }
    if (context === 'review') {
      expect(movement.slot?.kind, `${at}: Review supplies Swap`).toBe('clr-movement-identity__action')
    }
  }
}

function list(page: Page, context: Context, structure: Structure): Locator {
  const name = LISTS[context][structure]
  if (name !== null) return page.getByRole('list', { name, exact: true })
  return page.locator('[data-review-section] .clr-movement-group:not(:has(ol)):not(:has(.clr-movement-group))')
    .filter({ has: page.locator('.clr-movement-identity') })
}

/** The movement whose ordinal reads exactly this: Review's own element, or a live name's leading words (Round 7). */
async function ordinalCount(page: Page, ordinal: string): Promise<number> {
  return page.locator('main .clr-movement-identity__name > span:not([data-movement-context])').evaluateAll((words, wanted) =>
    words.filter((node) => {
      const element = node.querySelector('.clr-movement-identity__ordinal')
      const drawn = element !== null ? (element.textContent ?? '').trim() : /^([A-Z]\d+|\d+\.) /.exec(node.textContent ?? '')?.[1] ?? null
      return drawn === wanted
    }).length, ordinal)
}

async function readContext(page: Page, context: Context) {
  const read: Partial<Record<Structure, ListGeometry>> = {}
  for (const structure of STRUCTURES) {
    await expect(list(page, context, structure)).toBeVisible()
    read[structure] = await readList(list(page, context, structure))
  }
  return read as Record<Structure, ListGeometry>
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
  await expect(list(page, 'workout', 'superset')).toBeVisible()
  await settle(page)
  await checkA11y()
}

/** Delivered-revision visual evidence: the full scrolling content, attached to the case. */
async function attachCapture(page: Page, name: string) {
  const scroller = page.locator('main .clr-scroll-region__scroller').first()
  const body = await scroller.screenshot({ caret: 'hide' }).catch(() => page.screenshot({ caret: 'hide' }))
  await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
}

const readings = (geometry: ListGeometry) =>
  geometry.movements.map(({ name, equipment, load }) => ({ name, equipment, load }))

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-001 shared movement hierarchy and peer grouping', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-001 ${name}: Review then Workout show the same hierarchy, peer-only separators and no Last-performance row`, async ({ page, visit, checkA11y }) => {
      await page.setViewportSize(viewport)
      const acceptance = peerGroupingAcceptance({ locationId: PLACE })
      const app = await syntheticApp(page, acceptance)
      await openReview(page, visit, acceptance)

      const review = await readContext(page, 'review')
      for (const structure of STRUCTURES) {
        expectPeerOnlySeparators(review[structure], `Review ${structure} @${name}`)
        expectHierarchy(review[structure], 'review', `Review ${structure} @${name}`)
        expect(readings(review[structure]), `Review ${structure} readings`).toEqual(EXPECTED[structure])
      }
      await expect(page.locator('main')).not.toContainText(LAST_PERFORMANCE)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await attachCapture(page, `review-${name}`)

      await startWorkout(page, checkA11y)
      const workout = await readContext(page, 'workout')
      for (const structure of STRUCTURES) {
        expectPeerOnlySeparators(workout[structure], `Workout ${structure} @${name}`)
        expectHierarchy(workout[structure], 'workout', `Workout ${structure} @${name}`)
        expect(readings(workout[structure]), `Workout ${structure} readings`).toEqual(EXPECTED[structure])
      }
      for (const structure of ['standard', 'superset'] as const) {
        for (const movement of workout[structure].movements) {
          expect(movement.slot?.kind, `Workout ${structure}: progress in its own slot`).toBe('clr-movement-identity__counter')
        }
      }
      await expect(page.locator('main')).not.toContainText(LAST_PERFORMANCE)
      await expect(page.getByRole('button', { name: /^Swap / })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await attachCapture(page, `workout-${name}`)
      app.assertContained()
    })
  }

  for (const { name, viewport } of VIEWPORTS) {
    test(`AC-R001-02 ${name}: long names and multi-digit ordinals wrap without obscuring Swap or set progress`, async ({ page, visit, checkA11y }) => {
      await page.setViewportSize(viewport)
      const acceptance = peerGroupingAcceptance({ locationId: PLACE, blocks: [SUPERSET_BLOCK, TEN_STATION_CIRCUIT_BLOCK] })
      const app = await syntheticApp(page, acceptance)
      await openReview(page, visit, acceptance)

      const reviewTen = await readList(list(page, 'review', 'circuit'))
      expect(reviewTen.movements).toHaveLength(10)
      expectPeerOnlySeparators(reviewTen, `Review ten stations @${name}`)
      expectHierarchy(reviewTen, 'review', `Review ten stations @${name}`)
      const reviewPair = await readList(list(page, 'review', 'superset'))
      expectHierarchy(reviewPair, 'review', `Review superset @${name}`)
      if (viewport.width < 768) {
        // On a phone the long names genuinely wrap, and still clear Swap.
        expect(Math.max(...reviewTen.movements.map((movement) => movement.nameLines))).toBeGreaterThan(1)
      }
      expect(await ordinalCount(page, '10')).toBe(1)

      await startWorkout(page, checkA11y)
      const liveTen = await readList(list(page, 'workout', 'circuit'))
      expect(liveTen.movements).toHaveLength(10)
      expectPeerOnlySeparators(liveTen, `Workout ten stations @${name}`)
      expectHierarchy(liveTen, 'workout', `Workout ten stations @${name}`)
      const livePair = await readList(list(page, 'workout', 'superset'))
      expectHierarchy(livePair, 'workout', `Workout superset @${name}`)
      expect(await ordinalCount(page, '10.')).toBe(1)
      // Neither the shared header nor the surrounding group layout draws a rail.
      const headerRails = await page.locator('[data-movement-group-header]').evaluateAll((headers) =>
        headers.map((header) => {
          const style = getComputedStyle(header)
          return style.borderLeftStyle === 'none' || parseFloat(style.borderLeftWidth) === 0
        }))
      expect(headerRails.length).toBeGreaterThan(0)
      expect(headerRails.every(Boolean)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      app.assertContained()
    })
  }

  test('gallery cards: the accepted state renders the same peers through the Review and Workout consumers', async ({ page, visit }) => {
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await visit('/gallery/refinements?state=cards')
    const state = page.locator('[data-refinement-state="cards"]')
    await expect(state).toBeVisible()
    await settle(page)
    // Round 7's state draws the live consumer (`TimedWorkoutFlow`'s EMOM,
    // AMRAP and For Time cards before Start, over the gallery's own blocks, in
    // pounds); Review's consumer is read on the real /review route above.
    await expect(state.locator('ol.clr-movement-list')).toHaveCount(GALLERY_PEERS.length)
    for (const [name, expected] of GALLERY_PEERS) {
      const geometry = await readList(state.getByRole('list', { name, exact: true }))
      expectPeerOnlySeparators(geometry, `Gallery workout ${name}`)
      expectHierarchy(geometry, 'workout', `Gallery workout ${name}`)
      expect(readings(geometry)).toEqual(expected)
    }
  })
})
