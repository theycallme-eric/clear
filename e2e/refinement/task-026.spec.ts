import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { savedOverviewRecord } from '../../src/dev/gallery-refinement-overview-data'
import { formatDay, formatFocus } from '../../src/state/history'
import type { SessionReconstruction, WorkoutSessionRow } from '../../src/state/schemas'
import { makeSessionRow } from '../../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-026 (REQ-026; C53, G18; R08, R19; V07, V08; AC-C53-01, AC-R026-01;
 * JOURNEY-026) — on the real History route (`/history`) every workout row's
 * title has its own row with the status and the date beneath it, and the Show
 * filter offers All entries, Completed and Partial — no Rest days, no Not
 * started — without deleting a record or changing what a lifecycle state
 * means. Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=screens`, which draws the route's own
 * `HistoryCollection`.
 *
 * Entry (ENTRY-026): a signed-in athlete whose recorded workouts include
 * completed, partial and never-started sessions with rest days between them
 * reaches `/history` through the existing auth guard. Action: inspect a row,
 * use the status filter and open a row's saved detail (`/history/:id`).
 * Result, read from the browser at phone widths: the title alone on its row,
 * status then date together beneath it, then the metrics; the filter's
 * options; All entries still listing the rest runs and the never-started
 * workout with its status; and the detail reading the record's own stored
 * day, status and actual minutes. Recovery: a failed read is said and a retry
 * answers; an empty history and a filter matching nothing keep their own
 * meanings; keyboard, reduced motion and a reload reach all of it.
 *
 * Synthetic and contained: an intercepted session for a fictional user and
 * synthetic reads only. Nothing is written: every non-read request is
 * recorded and fails the case.
 */
const OWNER = '00000000-0000-4000-8000-000000002601'
const PLACE = '00000000-0000-4000-8000-000000002641'
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
    if (code !== null) throw new Error(`Synthetic TASK-026 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-026 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-026.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-026-public-placeholder',
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
/** The approved mobile scope: the narrow, short phone and the project's own phone. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
]

const LIST = 'Workout history'
const FILTER = 'Show'
const OFFERED = ['All entries', 'Completed', 'Partial']
const RETIRED = ['Rest days', 'Not started']
const ERROR_TITLE = 'History didn’t load'
const EMPTY_TITLE = 'No workouts yet'
const NO_MATCH_TITLE = 'Nothing matches this filter'
const NO_MATCH_ACTION = 'Show all entries'
const DETAIL_ERROR_TITLE = 'Workout didn’t load'

// ─────────────────────────────────────────────────────────────────────────────
// The stored record
// ─────────────────────────────────────────────────────────────────────────────

/** A local calendar day, `daysAgo` days before today. */
function localDay(daysAgo: number) {
  const at = new Date()
  at.setDate(at.getDate() - daysAgo)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

type Outcome = 'completed' | 'partial' | 'unstarted'

interface Stored {
  row: WorkoutSessionRow
  outcome: Outcome
}

function stored(
  n: number,
  daysAgo: number,
  title: string,
  focus: WorkoutSessionRow['session_focus'],
  outcome: Outcome,
  actual: number | null,
  intensity: number,
): Stored {
  const date = localDay(daysAgo)
  return {
    outcome,
    row: makeSessionRow({
      id: `00000000-0000-4000-8000-0000000026${String(n).padStart(2, '0')}`,
      user_id: OWNER, location_id: PLACE, date, title, session_focus: focus,
      created_at: `${date}T08:00:00.000Z`, updated_at: `${date}T09:00:00.000Z`,
      started_at: outcome === 'unstarted' ? null : `${date}T08:05:00.000Z`,
      completed_at: outcome === 'completed' ? `${date}T09:00:00.000Z` : null,
      abandoned_at: outcome === 'partial' ? `${date}T08:30:00.000Z` : null,
      requested_duration_mins: 45, actual_duration_mins: actual,
      requested_intensity: intensity, effective_intensity: intensity,
      counts_for_streak: outcome === 'completed',
    }),
  }
}

/** V08's pair, a long stopped workout and one never begun, with rest days between. */
const RECORD: readonly Stored[] = [
  stored(1, 1, 'Balanced lower body', 'lower_body', 'completed', 49, 7),
  stored(2, 3, 'Balanced upper body', 'upper_body', 'completed', 47, 7),
  stored(3, 5, 'Full-body conditioning intervals with a longer stored session name', 'full_body', 'partial', 18, 6),
  stored(4, 6, 'Upper-body strength', 'upper_body', 'unstarted', null, 8),
]
const BY_OUTCOME = (outcome: Outcome) => RECORD.filter((entry) => entry.outcome === outcome)
const COMPLETED_ONLY = BY_OUTCOME('completed')
/** More than one page: twenty older completed workouts behind the record, every other day. */
const LONG_RECORD: readonly Stored[] = [
  ...RECORD,
  ...Array.from({ length: 20 }, (_, index) =>
    stored(10 + index, 8 + index * 2, `Older workout ${index + 1}`, 'full_body', 'completed', 40, 6)),
]

const STATUS_WORD: Record<Outcome, string> = { completed: 'Completed', partial: 'Partial', unstarted: 'Not started' }
const DETAIL_STATE: Record<Outcome, SessionReconstruction['state']> = {
  completed: 'completed', partial: 'abandoned', unstarted: 'prescribed',
}
const DETAIL_WORD: Record<Outcome, string> = { completed: 'Completed', partial: 'Abandoned', unstarted: 'Never started' }

/** `session_as_performed` for a stored row: its own session, state and rows. */
function performed({ row, outcome }: Stored): SessionReconstruction {
  const base = savedOverviewRecord({ sessionId: row.id, userId: OWNER, date: row.date })
  let movement = 0
  return {
    ...base,
    as_of: row.completed_at ?? row.abandoned_at ?? row.created_at,
    session: row,
    state: DETAIL_STATE[outcome],
    sections: base.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({
        ...block,
        exercises: block.exercises.map((entry) => {
          movement += 1
          // A never-started workout performed nothing; a stopped one, its first two movements.
          const done = outcome === 'completed' || (outcome === 'partial' && movement <= 2)
          return { ...entry, exercise: { ...entry.exercise, execution_status: done ? 'completed' as const : 'not_started' as const } }
        }),
      })),
    })),
  }
}

/** The metrics each stored row reads as, in the row's fixed order. */
function expectedMetrics(row: WorkoutSessionRow) {
  return [
    formatFocus(row.session_focus),
    `Requested ${row.requested_duration_mins} min`,
    ...(row.actual_duration_mins === null ? [] : [`Actual ${row.actual_duration_mins} min`]),
    `Intensity ${row.effective_intensity}/10`,
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  readonly reducedMotion?: boolean
}

/** `HISTORY_PAGE_SIZE` rows plus the one that says there are more. */
const FIRST_PAGE_READ = 21

const EMPTY_READS = new Set(['rest_days', 'load_anchors', 'location_equipment', 'saved_workouts',
  'saved_workout_attempts', 'saved_workout_completions', 'exercises'])
const EMPTY_RPCS = new Set(['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'])

async function syntheticApp(page: Page, options: AppOptions = {}) {
  let rows: readonly Stored[] = RECORD
  const failing = { history: false, detail: false }
  const reads = { history: 0, detail: 0 }
  const unexpected: string[] = []
  const writes: string[] = []
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
    if (request.method() === 'GET' && url.pathname.startsWith('/rest/v1/')) {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'workout_sessions') {
        reads.history += 1
        const limit = Number(url.searchParams.get('limit') ?? '1000')
        // The boot check and the first page share one read; a failure is
        // injected only into a wider window, which History alone asks for.
        if (failing.history && limit > FIRST_PAGE_READ) {
          return reply({ code: 'PGRST000', message: 'Synthetic TASK-026 read failure.' }, 503)
        }
        return reply(rows.slice(0, limit).map((entry) => entry.row))
      }
      if (EMPTY_READS.has(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (EMPTY_RPCS.has(name)) return reply([])
      if (name === 'session_as_performed') {
        reads.detail += 1
        if (failing.detail) return reply({ code: 'PGRST000', message: 'Synthetic TASK-026 read failure.' }, 503)
        const id = (request.postDataJSON() as { p_session_id?: string }).p_session_id
        const found = RECORD.find((entry) => entry.row.id === id)
        return found === undefined ? reply(null) : reply(performed(found))
      }
      writes.push(name)
    } else if (request.method() !== 'GET') {
      writes.push(`${request.method()} ${name}`)
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-026 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-026-session', refreshToken: 'synthetic-task-026-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-026@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    reads,
    setRows(next: readonly Stored[]) { rows = next },
    failHistory(value: boolean) { failing.history = value },
    failDetail(value: boolean) { failing.detail = value },
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(writes, 'Nothing is written: reading and filtering History mutates no record').toEqual([])
      expect(guard.blockedGenerations(), 'No generation reached the model route').toBe(0)
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

async function attach(target: Page | Locator, name: string) {
  await test.info().attach(`${name}.png`, { body: await target.screenshot({ caret: 'hide' }), contentType: 'image/png' })
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a row
// ─────────────────────────────────────────────────────────────────────────────

interface Box { top: number; bottom: number; left: number; right: number; height: number }

interface RowReading {
  title: string
  status: string
  date: string
  metrics: string[]
  layout: string | null
  parts: string[]
  rowBox: Box
  contentLeft: number
  contentRight: number
  titleBox: Box
  /** Each rendered line box of the title's text. */
  titleLines: number
  statusBox: Box
  dateBox: Box
  statusDateBox: Box
  metricsBox: Box
  /** Elements outside the title that share any of its vertical extent. */
  besideTitle: string[]
}

/** Every session row of `list`, measured in the browser. */
async function readRows(list: Locator): Promise<RowReading[]> {
  return list.evaluate((element) => {
    const box = (node: Element): { top: number; bottom: number; left: number; right: number; height: number } => {
      const { top, bottom, left, right, height } = node.getBoundingClientRect()
      return { top, bottom, left, right, height }
    }
    const textOf = (node: Element) => {
      const clone = node.cloneNode(true) as Element
      clone.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
      return (clone.textContent ?? '').trim()
    }
    return [...element.querySelectorAll<HTMLElement>(':scope > li')]
      .filter((row) => row.querySelector('[data-part="status"]') !== null)
      .map((row) => {
        const part = (name: string) => row.querySelector<HTMLElement>(`[data-part="${name}"]`)!
        const title = part('title')
        const style = getComputedStyle(row)
        const rowBox = box(row)
        const titleBox = box(title)
        const range = document.createRange()
        range.selectNodeContents(title)
        const titleLines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size
        const besideTitle = [...row.querySelectorAll<HTMLElement>('[data-part]')]
          .filter((node) => node !== title && !title.contains(node) && !node.contains(title))
          .filter((node) => {
            const other = node.getBoundingClientRect()
            return other.height > 0 && other.top < titleBox.bottom - 0.5 && other.bottom > titleBox.top + 0.5
          })
          .map((node) => node.dataset.part ?? '')
        return {
          title: textOf(title),
          status: textOf(part('status')),
          date: textOf(part('date')),
          metrics: [...part('metrics').querySelectorAll('.clr-nowrap')].map((node) => (node.textContent ?? '').trim()),
          layout: row.getAttribute('data-layout'),
          parts: [...row.querySelectorAll('[data-part]')].map((node) => node.getAttribute('data-part') ?? ''),
          rowBox,
          contentLeft: rowBox.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
          contentRight: rowBox.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
          titleBox,
          titleLines,
          statusBox: box(part('status')),
          dateBox: box(part('date')),
          statusDateBox: box(part('status-date')),
          metricsBox: box(part('metrics')),
          besideTitle,
        }
      })
  })
}

/** C53 / R19: the title alone on its row; status then date together beneath it; then the metrics. */
function expectHierarchy(reading: RowReading, label: string) {
  expect(reading.parts, `${label}: one order in every row`).toEqual(['title', 'status-date', 'status', 'date', 'metrics'])
  expect(reading.besideTitle, `${label}: nothing shares the title's row`).toEqual([])
  expect(reading.titleBox.right - reading.titleBox.left, `${label}: the title has the row's full width`)
    .toBeGreaterThanOrEqual(reading.contentRight - reading.contentLeft - 1)
  expect(reading.statusDateBox.top, `${label}: status and date sit beneath the title`).toBeGreaterThanOrEqual(reading.titleBox.bottom - 0.5)
  const centre = (box: Box) => (box.top + box.bottom) / 2
  expect(Math.abs(centre(reading.statusBox) - centre(reading.dateBox)), `${label}: the date is beside the status, on its line`).toBeLessThanOrEqual(2)
  expect(reading.dateBox.left, `${label}: the status comes first, then the date`).toBeGreaterThan(reading.statusBox.right)
  expect(reading.metricsBox.top, `${label}: the metrics close the row`).toBeGreaterThanOrEqual(reading.statusDateBox.bottom - 0.5)
  expect(reading.layout, `${label}: History's own chronology row`).toBe('chronology')
}

/** AC-R026-01: what a row says is what the record stores. */
function expectTruthful(reading: RowReading, entry: Stored) {
  expect(reading.title).toBe(entry.row.title)
  expect(reading.status).toBe(STATUS_WORD[entry.outcome])
  expect(reading.date).toBe(formatDay(entry.row.date))
  expect(reading.metrics).toEqual(expectedMetrics(entry.row))
}

const listOf = (page: Page) => page.getByRole('list', { name: LIST })
const filterOf = (scope: Page | Locator) => scope.getByLabel(FILTER, { exact: true })
const restRows = (list: Locator) => list.getByRole('listitem').filter({ hasText: /· \d+ rest days?/ })
const titleLink = (scope: Page | Locator, title: string) => scope.getByRole('link', { name: title, exact: true })

async function expectOffered(scope: Page | Locator) {
  const offered = await filterOf(scope).locator('option').allTextContents()
  expect(offered.map((text) => text.trim()), 'the filter offers the useful choices only').toEqual(OFFERED)
  for (const retired of RETIRED) {
    expect(offered, `${retired} is not a filter option`).not.toContain(retired)
  }
}

/** ENTRY-026: a signed-in athlete with recorded workouts reaches /history. */
async function openHistory(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/history')
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('History')
  await expect(listOf(page)).toBeVisible()
  await settle(page)
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-026 History row hierarchy and intentional filter options', () => {
  for (const { name, viewport } of VIEWPORTS) {
    test(`JOURNEY-026 ${name}: each title has its own row with status and date beneath, the filter offers All entries, Completed and Partial, and a row opens its saved detail`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page)
      await openHistory(page, visit)
      const list = listOf(page)

      // All entries: every stored workout and the derived rest runs between them.
      await expect(filterOf(page)).toHaveValue('all')
      await expectOffered(page)
      await expect(list.getByRole('listitem')).toHaveCount(RECORD.length + 2)
      await expect(restRows(list)).toHaveCount(2)
      const all = await readRows(list)
      expect(all.map((row) => row.title)).toEqual(RECORD.map((entry) => entry.row.title))
      all.forEach((reading, index) => {
        expectHierarchy(reading, `${reading.title} @${name}`)
        expectTruthful(reading, RECORD[index])
      })
      // The long stored title wraps within its own full-width row.
      expect(all[2].titleLines, 'the long title wraps on its own row').toBeGreaterThan(1)
      await noHorizontalOverflow(page)
      await attach(page, `history-all-entries-${name}`)
      await checkA11y()

      // Completed: only the finished workouts, each with the same hierarchy.
      await filterOf(page).selectOption('completed')
      await expect(list.getByRole('listitem')).toHaveCount(COMPLETED_ONLY.length)
      const completed = await readRows(list)
      completed.forEach((reading, index) => {
        expectHierarchy(reading, `completed ${reading.title} @${name}`)
        expectTruthful(reading, COMPLETED_ONLY[index])
      })

      // Partial: the stopped workout, then its saved detail.
      await filterOf(page).selectOption('partial')
      await expect(list.getByRole('listitem')).toHaveCount(1)
      const [stopped] = BY_OUTCOME('partial')
      const [partialRow] = await readRows(list)
      expectHierarchy(partialRow, `partial @${name}`)
      expectTruthful(partialRow, stopped)
      await attach(page, `history-partial-${name}`)
      await titleLink(list, stopped.row.title).tap()
      await expect(page).toHaveURL((url) => url.pathname === `/history/${stopped.row.id}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(stopped.row.title)
      const facts = page.locator('dl[aria-label="Workout facts"]')
      await expect(facts).toContainText(formatDay(stopped.row.date))
      await expect(facts).toContainText(DETAIL_WORD.partial)
      await expect(facts).toContainText(`${stopped.row.actual_duration_mins}`)
      await settle(page)
      await attach(page, `history-detail-partial-${name}`)
      await checkA11y()

      // Back: History again, the whole chronology intact.
      await page.goBack()
      await expect(page).toHaveURL((url) => url.pathname === '/history')
      await expect(listOf(page).getByRole('listitem')).toHaveCount(RECORD.length + 2)
      app.assertContained()
    })
  }

  test('AC-R026-01 keyboard, reduced motion and reopen phone-320: every row keeps its stored date, status and actuals, a never-started workout stays listed and opens by keyboard, and a reload keeps it all', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, { reducedMotion: true })
    await openHistory(page, visit)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const list = listOf(page)

    const before = await readRows(list)
    before.forEach((reading, index) => expectTruthful(reading, RECORD[index]))
    const [neverBegun] = BY_OUTCOME('unstarted')
    const unstartedRow = list.getByRole('listitem').filter({ has: titleLink(page, neverBegun.row.title) })
    await expect(unstartedRow).toContainText('Not started')

    // Narrowing and widening again changes nothing about what is recorded.
    await filterOf(page).selectOption('completed')
    await filterOf(page).selectOption('partial')
    await filterOf(page).selectOption('all')
    expect((await readRows(list)).map(({ title, status, date, metrics }) => ({ title, status, date, metrics })))
      .toEqual(before.map(({ title, status, date, metrics }) => ({ title, status, date, metrics })))
    await expect(restRows(list)).toHaveCount(2)

    // Keyboard: the never-started workout's title takes focus in turn and Enter opens its detail.
    const link = titleLink(list, neverBegun.row.title)
    let reached = false
    for (let press = 0; press < 20 && !reached; press += 1) {
      await page.keyboard.press('Tab')
      reached = await link.evaluate((element) => element === document.activeElement)
    }
    expect(reached, 'the never-started row is reachable by Tab').toBe(true)
    await expect(link).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL((url) => url.pathname === `/history/${neverBegun.row.id}`)
    const facts = page.locator('dl[aria-label="Workout facts"]')
    await expect(facts).toContainText(DETAIL_WORD.unstarted)
    await expect(facts).toContainText(formatDay(neverBegun.row.date))
    await attach(page, 'history-detail-never-started-phone-320')
    await checkA11y()

    // Reopen History: a reload reads the same record and shows it the same way.
    await page.goBack()
    await expect(listOf(page)).toBeVisible()
    await page.reload()
    await expect(listOf(page)).toBeVisible()
    await settle(page)
    const reopened = await readRows(listOf(page))
    reopened.forEach((reading, index) => {
      expectHierarchy(reading, `reopened ${reading.title}`)
      expectTruthful(reading, RECORD[index])
    })
    await expectOffered(page)
    app.assertContained()
  })

  test('JOURNEY-026 recovery phone-320: a failed read is said and a retry answers, an empty history and a filter matching nothing keep their own meanings, and a failed detail read retries', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page)

    // An actual read failure — the wider window Load older workouts asks
    // for — is said, with Retry, and no rows are fabricated.
    app.setRows(LONG_RECORD)
    app.failHistory(true)
    await visit('/history')
    await expect(listOf(page)).toBeVisible()
    await page.getByRole('button', { name: 'Load older workouts', exact: true }).tap()
    await expect(page.getByText(ERROR_TITLE)).toBeVisible({ timeout: 15_000 })
    await expect(listOf(page)).toHaveCount(0)
    await attach(page, 'history-read-failed-phone-320')
    app.failHistory(false)
    await page.getByRole('button', { name: 'Retry', exact: true }).tap()
    await expect(listOf(page)).toBeVisible()
    await expectOffered(page)
    // The retried window holds every stored workout, the never-started one with its status.
    await expect(listOf(page).locator('[data-layout="chronology"]')).toHaveCount(LONG_RECORD.length)
    await expect(listOf(page).locator('[data-status="unstarted"]')).toContainText('Not started')

    // A filter matching nothing is not an empty history.
    app.setRows(COMPLETED_ONLY)
    await page.reload()
    await expect(listOf(page)).toBeVisible()
    await filterOf(page).selectOption('partial')
    await expect(page.getByText(NO_MATCH_TITLE)).toBeVisible()
    await expect(page.getByText(EMPTY_TITLE)).toHaveCount(0)
    await expect(filterOf(page)).toBeVisible()
    await attach(page, 'history-no-match-phone-320')
    await page.getByRole('button', { name: NO_MATCH_ACTION, exact: true }).tap()
    await expect(filterOf(page)).toHaveValue('all')
    await expect(listOf(page).getByRole('listitem')).not.toHaveCount(0)

    // No history at all: said once, with no filter to narrow.
    app.setRows([])
    await page.reload()
    await expect(page.getByText(EMPTY_TITLE)).toBeVisible()
    await expect(filterOf(page)).toHaveCount(0)
    await checkA11y()

    // A failed saved-detail read is said, and its retry reads the record.
    app.setRows(RECORD)
    app.failDetail(true)
    const [stopped] = BY_OUTCOME('partial')
    await page.goto(`/history/${stopped.row.id}`)
    await expect(page.getByText(DETAIL_ERROR_TITLE)).toBeVisible({ timeout: 15_000 })
    app.failDetail(false)
    await page.getByRole('button', { name: 'Retry', exact: true }).tap()
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(stopped.row.title)
    await expect(page.locator('dl[aria-label="Workout facts"]')).toContainText(DETAIL_WORD.partial)
    app.assertContained()
  })

  test('gallery screens phone-320: the accepted state draws History’s own card, filter and rows — title alone, status and date beneath — with nothing read or written', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 568 })
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    await visit('/gallery/refinements?state=screens')
    const part = page.locator('[data-refinement-state="screens"] [data-gallery-history]')
    await part.scrollIntoViewIfNeeded()
    await expect(part.getByRole('heading', { name: 'History', exact: true })).toBeVisible()
    const list = part.getByRole('list', { name: LIST })
    await expect(list).toBeVisible()
    await settle(page)

    await expectOffered(part)
    const rows = await readRows(list)
    expect(rows.map((row) => row.status)).toEqual(['Completed', 'Completed', 'Partial', 'Not started'])
    rows.forEach((reading) => expectHierarchy(reading, `gallery ${reading.title}`))
    await expect(restRows(list)).not.toHaveCount(0)
    await attach(part, 'gallery-history-phone-320')

    await filterOf(part).selectOption('partial')
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await filterOf(part).selectOption('all')
    await expect(list.locator('[data-status="unstarted"]')).toHaveCount(1)
    // The titles open nothing here.
    await titleLink(list, rows[0].title).tap()
    await noHorizontalOverflow(page)
    await expect(page).toHaveURL(/\/gallery\/refinements\?state=screens$/)
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
