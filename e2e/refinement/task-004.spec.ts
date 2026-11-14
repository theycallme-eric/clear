import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import {
  OVERVIEW_PLANNED,
  overviewAcceptance,
  savedOverviewRecord,
  savedSessionRow,
  type OverviewComposition,
  type SavedOverviewOptions,
} from '../../src/dev/gallery-refinement-overview-data'
import { formatDay } from '../../src/state/history'
import { reviewHandoff } from '../../src/state/review-handoff'
import {
  sessionAcceptanceSchema,
  sessionReconstructionSchema,
  workoutSessionRowSchema,
} from '../../src/state/schemas'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-004 (REQ-004; C12, C13, C14, C15; AC-R004-01…03; JOURNEY-004) —
 * accepted Overview facts, the Required equipment group and the Summary frames
 * on the real `/review`, `/history/:id` and `/summary` routes.
 *
 * Entry: a planned workout reaches `/review` through the existing Review
 * hand-off; the same workout, completed and recorded, is read by
 * `/history/:id` (`session_as_performed`) and debriefed by `/summary`
 * (`streak_sessions` and the session row), all behind the existing auth guard.
 * Action: read the Overview, the saved Overview and the completed summary.
 * Result, read from the browser at phone widths: every useful fact is a whole
 * glyph-led reading and the readings wrap onto further rows inside the card —
 * no carousel, rail, hidden overflow or tab stop; intensity reads its value
 * alone; Required equipment is one group under a rule, its names uppercase,
 * `None — bodyweight only` only for an all-bodyweight workout; the saved
 * Overview is the same composition over the record's own values; Summary's
 * Duration and Streak frames end at the same bottom edge as their cells and as
 * each other. Recovery: a failed saved read and a failed streak read keep their
 * meanings and retry; reopening reads the same record. Reduced motion
 * throughout; keyboard and touch.
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads only. Nothing is written — no Start, no debrief save, no
 * model call — and no real account or row exists to mutate.
 */
const OWNER = '00000000-0000-4000-8000-000000004501'
const PLACE = '00000000-0000-4000-8000-000000004511'
const EARLIER_SESSION = '00000000-0000-4000-8000-000000004521'
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
    if (code !== null) throw new Error(`Synthetic TASK-004 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-004 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-004.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-004-public-placeholder',
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

/** A local calendar day and an instant on it, `daysAgo` days before today. */
function localDay(daysAgo: number) {
  const at = new Date()
  at.setDate(at.getDate() - daysAgo)
  at.setHours(18, 0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return { date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, instant: at.toISOString() }
}

interface AppOptions {
  /** The planned workout `/review` is handed. */
  composition?: OverviewComposition
  /** The completed attempt `/history/:id` and `/summary` read. */
  saved?: SavedOverviewOptions
  /** The first `session_as_performed` read fails. */
  savedReadFails?: boolean
  /** The first streak read fails (the debrief's own one-row read still answers). */
  streakReadFails?: boolean
}

async function syntheticApp(page: Page, options: AppOptions = {}) {
  const yesterday = localDay(1)
  const before = localDay(2)
  const recorded: SavedOverviewOptions = {
    sessionId: savedSessionRow().id,
    userId: OWNER,
    date: yesterday.date,
    completedAt: yesterday.instant,
    ...options.saved,
  }
  const acceptance = sessionAcceptanceSchema.parse(overviewAcceptance({
    composition: options.composition ?? 'loaded', date: localDay(0).date, locationId: PLACE,
  }))
  const session = workoutSessionRowSchema.parse(savedSessionRow(recorded))
  const record = sessionReconstructionSchema.parse(savedOverviewRecord(recorded))
  // A two-day run that has not reached today: V12's `Through yesterday`.
  const streakRows = [
    { session_id: session.id, completed_at: yesterday.instant, counts_for_streak: true },
    { session_id: EARLIER_SESSION, completed_at: before.instant, counts_for_streak: true },
  ]
  const reads = { savedFailures: options.savedReadFails === true ? 1 : 0, streakFailures: options.streakReadFails === true ? 1 : 0 }
  const unexpected: string[] = []
  const writes: string[] = []
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
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'workout_sessions') return reply([session])
      // Every other read is an empty answer: no anchors, favorites or rest days.
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (name === 'session_as_performed') {
        if (reads.savedFailures > 0) {
          reads.savedFailures -= 1
          return reply({ code: 'PGRST000', message: 'Synthetic read failure.' }, 503)
        }
        return reply(record)
      }
      if (name === 'streak_sessions') {
        const body = request.postDataJSON() as { p_limit?: number }
        // The debrief's one-row read of the latest session always answers; the
        // streak's own paged read is the one that fails first, when asked to.
        if (body.p_limit !== 1 && reads.streakFailures > 0) {
          reads.streakFailures -= 1
          return reply({ code: 'PGRST000', message: 'Synthetic read failure.' }, 503)
        }
        return reply(body.p_limit === 1 ? streakRows.slice(0, 1) : streakRows)
      }
      if (['anchor_evidence', 'constraints_in_force', 'conditioning_history', 'generation_refusal_diagnostics',
        'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
      writes.push(name)
    } else {
      writes.push(`${request.method()} ${name}`)
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-004 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-004-session', refreshToken: 'synthetic-task-004-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-004@example.invalid' },
    }))
    if (location.pathname === '/review') {
      history.replaceState({ usr: handoff, key: 'synthetic-task-004', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: reviewHandoff(acceptance) })

  return {
    acceptance,
    session,
    detailPath: `/history/${session.id}`,
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Nothing is written: reading an Overview mutates no data').toEqual([])
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

interface FactReading {
  term: string
  value: string
  termShown: boolean
  glyph: string | null
  glyphVisible: boolean
  box: Box
  valueLines: number
}

interface OverviewGeometry {
  inner: Box
  facts: {
    box: Box
    font: string
    textTransform: string
    gap: string
    scrollWidth: number
    clientWidth: number
    overflowX: string
    tabIndex: number
    readings: FactReading[]
    rows: number
    orderedRows: boolean
  }
  carousel: number
  focusable: number
  nestedCards: number
  text: string
  equipment: {
    box: Box
    rule: { style: string; width: number; spans: boolean }
    label: string
    labelGlyphs: number
    names: string[]
    rendered: string[]
    namesInside: boolean
    namesUppercase: boolean
    none: string | null
    belowFacts: boolean
  }
}

/** The Overview card in `scope`: its facts row, its equipment group and its frame. */
async function readOverview(scope: Locator): Promise<OverviewGeometry> {
  const card = scope.locator('.clr-card').filter({ has: scope.page().getByRole('heading', { name: 'Overview', exact: true }) }).first()
  await expect(card).toBeVisible()
  return card.evaluate((element) => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const body = element.querySelector(':scope > .clr-card__body') ?? element
    const bodyStyle = getComputedStyle(body)
    const bodyBox = box(body)
    const inner = {
      ...bodyBox,
      left: bodyBox.left + parseFloat(bodyStyle.paddingLeft),
      right: bodyBox.right - parseFloat(bodyStyle.paddingRight),
    }
    const dl = element.querySelector<HTMLElement>('dl.clr-summary-facts')!
    const dlStyle = getComputedStyle(dl)
    const readings = [...dl.querySelectorAll(':scope > .clr-summary-fact')].map((fact) => {
      const term = fact.querySelector('dt')!
      const termText = term.lastElementChild as HTMLElement
      const glyph = term.querySelector('.clr-summary-fact__glyph svg')
      const value = fact.querySelector('dd')!
      const range = document.createRange()
      range.selectNodeContents(value)
      return {
        term: term.textContent ?? '',
        value: value.textContent ?? '',
        termShown: getComputedStyle(termText).position !== 'absolute' && termText.getBoundingClientRect().width > 1,
        glyph: glyph === null ? null : glyph.outerHTML,
        glyphVisible: glyph !== null && glyph.getBoundingClientRect().width > 0,
        box: box(fact),
        valueLines: new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size,
      }
    })
    const tops: number[] = []
    for (const reading of readings) {
      const centre = (reading.box.top + reading.box.bottom) / 2
      if (!tops.some((top) => Math.abs(top - centre) <= 2)) tops.push(centre)
    }
    const group = element.querySelector<HTMLElement>('[data-equipment-summary]')!
    const groupStyle = getComputedStyle(group)
    const items = [...group.querySelectorAll<HTMLElement>('li')]
    const focusable = 'a[href], button, input, select, textarea, [tabindex]'
    return {
      inner,
      facts: {
        box: box(dl),
        font: `${dlStyle.fontFamily} ${dlStyle.fontSize}`,
        textTransform: dlStyle.textTransform,
        gap: `${dlStyle.rowGap} ${dlStyle.columnGap}`,
        scrollWidth: dl.scrollWidth,
        clientWidth: dl.clientWidth,
        overflowX: dlStyle.overflowX,
        tabIndex: dl.tabIndex,
        readings,
        rows: tops.length,
        // Readings fill a row from the start, then continue on the next.
        orderedRows: readings.every((reading, index) => index === 0 ||
          reading.box.top > readings[index - 1].box.top + 1 ||
          (Math.abs(reading.box.top - readings[index - 1].box.top) <= 2 && reading.box.left > readings[index - 1].box.left)),
      },
      carousel: element.querySelectorAll('.clr-rail, .clr-rail__scroller, .clr-rail__cue, .clr-summary-facts-rail, [data-side]').length,
      focusable: element.querySelectorAll(focusable).length,
      nestedCards: element.querySelectorAll('.clr-card .clr-card').length,
      text: (element as HTMLElement).innerText,
      equipment: {
        box: box(group),
        rule: {
          style: groupStyle.borderTopStyle,
          width: parseFloat(groupStyle.borderTopWidth),
          spans: Math.abs(box(group).left - inner.left) <= 1 && Math.abs(box(group).right - inner.right) <= 1,
        },
        label: (group.querySelector('.clr-equipment-summary__label') as HTMLElement).innerText.trim(),
        labelGlyphs: group.querySelectorAll('.clr-equipment-summary__label svg').length,
        names: items.map((item) => item.textContent ?? ''),
        rendered: items.map((item) => item.innerText.trim()),
        namesInside: items.every((item) => box(item).left >= inner.left - 1 && box(item).right <= inner.right + 1),
        namesUppercase: items.every((item) => getComputedStyle(item).textTransform === 'uppercase'),
        none: group.querySelector('[data-equipment-none]')?.textContent ?? null,
        belowFacts: box(group).top >= box(dl).bottom - 1,
      },
    }
  })
}

const TOLERANCE = 1

/**
 * C12, AC-R004-01, R26: every reading whole and visible inside the card, the
 * readings wrapping onto further rows in order — no carousel, scroller, hidden
 * overflow, control or tab stop — each with its visible glyph.
 */
function expectWrappingFacts(overview: OverviewGeometry, label: string, viewportWidth: number) {
  const { facts, inner } = overview
  expect(overview.carousel, `${label}: no carousel`).toBe(0)
  expect(overview.focusable, `${label}: nothing in the Overview is a tab stop`).toBe(0)
  expect(facts.tabIndex, `${label}: the facts are not a tab stop`).toBe(-1)
  expect(facts.overflowX, `${label}: no horizontal scroller`).toBe('visible')
  expect(facts.scrollWidth, `${label}: nothing overflows the row`).toBeLessThanOrEqual(facts.clientWidth + TOLERANCE)
  expect(facts.box.left, `${label}: facts inside the card`).toBeGreaterThanOrEqual(inner.left - TOLERANCE)
  expect(facts.box.right, `${label}: facts inside the card`).toBeLessThanOrEqual(inner.right + TOLERANCE)
  expect(facts.rows, `${label}: the readings wrap onto another row`).toBeGreaterThanOrEqual(2)
  expect(facts.orderedRows, `${label}: rows fill in order`).toBe(true)
  for (const reading of facts.readings) {
    expect(reading.box.left, `${label}: ${reading.term} fully visible`).toBeGreaterThanOrEqual(facts.box.left - TOLERANCE)
    expect(reading.box.right, `${label}: ${reading.term} fully visible`).toBeLessThanOrEqual(facts.box.right + TOLERANCE)
    expect(reading.box.right, `${label}: ${reading.term} on screen`).toBeLessThanOrEqual(viewportWidth)
    expect(reading.valueLines, `${label}: ${reading.term} stays whole`).toBe(1)
    if (reading.term !== 'Status') expect(reading.glyphVisible, `${label}: ${reading.term} keeps its glyph`).toBe(true)
  }
  expect(overview.nestedCards, `${label}: the card is the only frame`).toBe(0)
  expect(overview.text, `${label}: intensity without "of 10"`).not.toMatch(/of\s*10|\/\s*10/i)
}

/** C13, AC-R004-02, R27, R34: one group under a rule, uppercase names, truthful empty state. */
function expectEquipmentGroup(overview: OverviewGeometry, label: string, names: readonly string[]) {
  const { equipment } = overview
  expect(equipment.belowFacts, `${label}: the group follows the facts`).toBe(true)
  expect(equipment.rule.style, `${label}: a rule separates the group`).toBe('solid')
  expect(equipment.rule.width, `${label}: a visible rule`).toBeGreaterThan(0)
  expect(equipment.rule.spans, `${label}: the rule spans the card`).toBe(true)
  expect(equipment.label, `${label}: the label, uppercase`).toBe('REQUIRED EQUIPMENT')
  expect(equipment.labelGlyphs, `${label}: the one shipped equipment glyph`).toBe(1)
  if (names.length === 0) {
    expect(equipment.none, `${label}: an all-bodyweight workout says so`).toBe('None — bodyweight only')
    expect(equipment.names).toEqual([])
    return
  }
  expect(equipment.none, `${label}: never beside real equipment`).toBeNull()
  expect(equipment.names, `${label}: the workout's own equipment, once each`).toEqual([...names])
  expect(equipment.rendered, `${label}: rendered uppercase`).toEqual(names.map((name) => name.toUpperCase()))
  expect(equipment.namesUppercase).toBe(true)
  expect(equipment.namesInside, `${label}: names inside the card`).toBe(true)
}

interface MetricCell {
  label: string
  value: string
  note: string | null
  cell: Box
  card: Box
  body: Box
  content: number
  frames: number
}

/** Each Summary metric cell: the cell, its card, the card's chamfered body and its content. */
async function readMetrics(scope: Locator): Promise<MetricCell[]> {
  return scope.locator('.clr-metric-grid').first().evaluate((grid) => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    return [...grid.children].map((cell) => {
      const card = cell.querySelector('.clr-card')!
      const body = card.querySelector(':scope > .clr-card__body')!
      const frame = body.querySelector('.clr-metric-frame') ?? body
      const notes = [...frame.querySelectorAll('p')].filter((p) => !p.hasAttribute('data-metric-value'))
      return {
        label: body.querySelector('h1, h2, h3, h4, .label')?.textContent ?? '',
        value: body.querySelector('[data-metric-value]')?.textContent ?? '',
        note: notes[0]?.textContent ?? null,
        cell: box(cell),
        card: box(card),
        body: box(body),
        content: box(frame).height,
        // A nested surface frame — a card, or a chamfered readout — never a
        // control's own frame (the failed streak's Retry button).
        frames: body.querySelectorAll('.clr-card, .clr-chamfer:not(.clr-btn)').length,
      }
    })
  })
}

/**
 * C15, AC-R004-03, R107: two equal-height cells, each card filling its cell —
 * accent bar and chamfered body to the cell's bottom edge — so Duration's frame
 * ends where Streak's does, with no short frame nested in a taller cell.
 */
function expectFilledCells(cells: MetricCell[], label: string) {
  expect(cells.map((cell) => cell.label), label).toEqual(['Duration', 'Streak'])
  const [duration, streak] = cells
  expect(Math.abs(duration.cell.bottom - streak.cell.bottom), `${label}: one row`).toBeLessThanOrEqual(TOLERANCE)
  for (const cell of cells) {
    expect(Math.abs(cell.card.top - cell.cell.top), `${label}: ${cell.label} card starts with its cell`).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(cell.card.bottom - cell.cell.bottom), `${label}: ${cell.label} card fills its cell`).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(cell.body.bottom - cell.cell.bottom), `${label}: ${cell.label} frame reaches the cell's bottom edge`).toBeLessThanOrEqual(TOLERANCE)
    expect(cell.frames, `${label}: ${cell.label} has no nested frame`).toBe(0)
  }
  expect(Math.abs(duration.body.bottom - streak.body.bottom), `${label}: frames end at one bottom edge`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(duration.body.height - streak.body.height), `${label}: equal-height frames`).toBeLessThanOrEqual(TOLERANCE)
}

/** Delivered-revision visual evidence: one element, attached to the case. */
async function attach(target: Locator, name: string) {
  await target.scrollIntoViewIfNeeded()
  const body = await target.screenshot({ caret: 'hide', animations: 'disabled' })
  await test.info().attach(`${name}.png`, { body, contentType: 'image/png' })
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

const overviewCard = (page: Page) =>
  page.locator('main .clr-card').filter({ has: page.getByRole('heading', { name: 'Overview', exact: true }) }).first()

/** Keyboard: Tab moves through the screen without ever stopping inside the Overview. */
async function tabsPastOverview(page: Page) {
  await page.getByRole('link', { name: 'Skip to content', exact: true }).focus()
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press('Tab')
    const inside = await page.evaluate(() => {
      const active = document.activeElement
      return active !== null && active.closest('[data-overview-facts], [data-equipment-summary]') !== null
    })
    expect(inside, 'no tab stop inside the facts or the equipment group').toBe(false)
  }
}

/** The facts' shared composition: the same face, case, gap and per-kind glyphs and term visibility. */
function compositionOf(overview: OverviewGeometry) {
  const kind = (term: string) => (term === 'Anchor' ? 'Focus' : term)
  return {
    font: overview.facts.font,
    textTransform: overview.facts.textTransform,
    gap: overview.facts.gap,
    shared: Object.fromEntries(overview.facts.readings
      .filter((reading) => ['Duration', 'Focus', 'Anchor', 'Intensity'].includes(reading.term))
      .map((reading) => [kind(reading.term), { glyph: reading.glyph, termShown: reading.termShown }])),
  }
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-004 accepted Overview facts, equipment and summary frames', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-004 ${name}: Review, the saved workout and Summary read wrapping glyph facts, one equipment group and filled metric frames`, async ({ page, visit }) => {
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page, { saved: { effectiveIntensity: 6, requestedIntensity: 9 } })
      const planned = OVERVIEW_PLANNED.loaded

      // ── /review: the planned Overview ────────────────────────────────────
      await visit('/review')
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(app.acceptance.workout.title)
      await settle(page)
      const review = await readOverview(page.locator('main'))
      expect(review.facts.readings.map((reading) => [reading.term, reading.value])).toEqual([
        ['Duration', planned.duration], ['Anchor', planned.focus], ['Intensity', planned.intensity],
        ['Goal', planned.goal], ['Movements', planned.movements],
      ])
      expectWrappingFacts(review, `Review @${name}`, viewport.width)
      expectEquipmentGroup(review, `Review @${name}`, planned.equipment)
      await tabsPastOverview(page)
      await noHorizontalOverflow(page)
      await attach(overviewCard(page), `review-overview-${name}`)

      // ── /history/:id: the saved Overview, the record's own values ───────
      await visit(app.detailPath)
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(app.session.title)
      await settle(page)
      const saved = await readOverview(page.locator('main'))
      expect(saved.facts.readings.map((reading) => [reading.term, reading.value])).toEqual([
        ['Duration', '42 min'], ['Focus', planned.focus], ['Intensity', '6'],
        // The session's own recorded day, not today's.
        ['Date', formatDay(app.session.date)],
        ['Status', 'Completed'],
      ])
      expectWrappingFacts(saved, `Saved @${name}`, viewport.width)
      expectEquipmentGroup(saved, `Saved @${name}`, planned.equipment)
      // C14: the same composition as Review, not a second version of it.
      expect(compositionOf(saved)).toEqual(compositionOf(review))
      await tabsPastOverview(page)
      await noHorizontalOverflow(page)
      await attach(overviewCard(page), `saved-overview-${name}`)

      // ── /summary: Duration beside Streak ────────────────────────────────
      await visit('/summary')
      await expect(page.getByText(`${app.session.title}, done.`)).toBeVisible()
      await expect(page.getByText('2 days', { exact: true })).toBeVisible()
      await settle(page)
      const cells = await readMetrics(page.locator('main'))
      expect(cells.map((cell) => [cell.value, cell.note])).toEqual([['42 min', null], ['2 days', 'Through yesterday']])
      // V12's case: Duration's content is shorter, and its frame still fills.
      expect(cells[0].content).toBeLessThan(cells[1].content)
      expectFilledCells(cells, `Summary @${name}`)
      await noHorizontalOverflow(page)
      await attach(page.locator('main .clr-metric-grid').first(), `summary-metrics-${name}`)
      app.assertContained()
    })
  }

  test('AC-R004-02 phone-320: None — bodyweight only appears for an all-bodyweight workout, in Review and the saved Overview, and only there', async ({ page, visit }) => {
    await page.setViewportSize(VIEWPORTS[0].viewport)
    const app = await syntheticApp(page, { composition: 'bodyweight', saved: { composition: 'bodyweight' } })
    await visit('/review')
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(app.acceptance.workout.title)
    await settle(page)
    const review = await readOverview(page.locator('main'))
    expectWrappingFacts(review, 'Review bodyweight', 320)
    expectEquipmentGroup(review, 'Review bodyweight', [])
    await expect(overviewCard(page).getByRole('list')).toHaveCount(0)
    await attach(overviewCard(page), 'review-overview-bodyweight-phone-320')

    await visit(app.detailPath)
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(app.session.title)
    await settle(page)
    const saved = await readOverview(page.locator('main'))
    expectEquipmentGroup(saved, 'Saved bodyweight', [])
    await attach(overviewCard(page), 'saved-overview-bodyweight-phone-320')
    app.assertContained()
  })

  test('JOURNEY-004 recovery phone-390: a failed saved read and a failed streak read keep their meanings, retry by touch and reopen the same record', async ({ page, visit, checkA11y }) => {
    await page.setViewportSize(VIEWPORTS[1].viewport)
    const app = await syntheticApp(page, { savedReadFails: true, streakReadFails: true })

    // The saved read fails: its own error and retry, and no invented facts.
    await page.goto(app.detailPath)
    await expect(page.getByText('Workout didn’t load')).toBeVisible()
    await expect(page.locator('[data-overview-facts], [data-equipment-summary]')).toHaveCount(0)
    await checkA11y()
    await page.getByRole('button', { name: 'Retry', exact: true }).tap()
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(app.session.title)
    await settle(page)
    const first = await readOverview(page.locator('main'))
    expect(first.facts.readings.map((reading) => reading.value).slice(0, 3)).toEqual(['42 min', 'Upper body', '7'])
    // Close and reopen: the same record reads the same, and nothing was written.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(app.session.title)
    await settle(page)
    const reopened = await readOverview(page.locator('main'))
    expect(reopened.facts.readings.map((reading) => [reading.term, reading.value]))
      .toEqual(first.facts.readings.map((reading) => [reading.term, reading.value]))
    expect(reopened.equipment.names).toEqual(first.equipment.names)

    // The streak read fails: its card says so and offers retry, the recorded
    // duration stands, and both frames still fill one equal-height row.
    await visit('/summary')
    await expect(page.getByText('Your streak didn’t load')).toBeVisible()
    await settle(page)
    const failed = await readMetrics(page.locator('main'))
    expect(failed[0].value).toBe('42 min')
    expectFilledCells(failed, 'Summary streak failure')
    await attach(page.locator('main .clr-metric-grid').first(), 'summary-metrics-streak-failure-phone-390')
    await page.locator('main .clr-metric-grid').getByRole('button', { name: 'Retry', exact: true }).tap()
    await expect(page.getByText('2 days', { exact: true })).toBeVisible()
    await settle(page)
    expectFilledCells(await readMetrics(page.locator('main')), 'Summary after retry')
    app.assertContained()
  })

  test('gallery overview phone-320: the accepted state draws the Review, saved and Summary consumers with the same facts, equipment and frames', async ({ page, visit }) => {
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await page.setViewportSize(VIEWPORTS[0].viewport)
    await visit('/gallery/refinements?state=overview')
    const state = page.locator('[data-refinement-state="overview"]')
    await expect(state).toBeVisible()
    await settle(page)

    const planned = await readOverview(state)
    expect(planned.facts.readings.map((reading) => [reading.term, reading.value])).toEqual([
      ['Duration', '45 min'], ['Anchor', 'Upper body'], ['Intensity', '7'], ['Goal', 'Strength'], ['Movements', '6'],
    ])
    expectWrappingFacts(planned, 'Gallery planned', 320)
    expectEquipmentGroup(planned, 'Gallery planned', OVERVIEW_PLANNED.loaded.equipment)
    expectFilledCells(await readMetrics(state), 'Gallery summary frames')
    await attach(state, 'gallery-overview-planned-phone-320')

    await state.getByRole('radio', { name: /Saved workout/ }).tap()
    await settle(page)
    const saved = await readOverview(state)
    expect(saved.facts.readings.map((reading) => reading.term)).toEqual(['Duration', 'Focus', 'Intensity', 'Date', 'Status'])
    expect(compositionOf(saved)).toEqual(compositionOf(planned))
    expectEquipmentGroup(saved, 'Gallery saved', OVERVIEW_PLANNED.loaded.equipment)

    await state.getByRole('radio', { name: /Bodyweight only/ }).tap()
    await settle(page)
    expectEquipmentGroup(await readOverview(state), 'Gallery saved bodyweight', [])
    await attach(state, 'gallery-overview-saved-bodyweight-phone-320')
  })
})
