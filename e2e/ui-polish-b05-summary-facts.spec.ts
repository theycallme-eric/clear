import AxeBuilder from '@axe-core/playwright'
import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { reviewBriefing } from '../src/state/review'
import { reviewHandoff } from '../src/state/review-handoff'
import type { SessionAcceptance, WorkoutSessionRow } from '../src/state/schemas'
import {
  makeGenerationOutput,
  makePrescription,
  makeSessionAcceptance,
  makeSessionRow,
} from '../src/test/factories'
import { fixtureLocation, onboardedProfile } from '../src/test/user-data-double'
import { reconstructionFixture } from '../src/test/workout-double'
import { installDeterministicCapture } from './design-0143/fixtures'
import { expect, test as scanned } from './fixtures'

/**
 * UI polish batch 05 — Review's compact summary facts (REQ-008, TASK-008).
 *
 * B05-03 replaces the tall, loosely spaced metric grid on Review with the
 * workout title over one aligned row of facts, keeping the real system glyphs
 * (03.1), dropping the preview's "Bodyweight movements included" sentence and
 * keeping the page title and required equipment near the top.
 *
 * Every case renders the production route at a phone viewport, measures the
 * rendered row, and records captures plus their identity beside the test
 * output. The pixels are compared with the reference by review; the geometry
 * below is what that review is checked against.
 *
 * The consumer matrix is part of the proof: Review's workout facts use the
 * compact `SummaryFacts` composition; completed Summary's results and Session
 * detail's record keep their `MetricGrid`/`MetricFrame` readouts; the score
 * readouts (conditioning score, AMRAP) keep `MetricFrame`.
 *
 * Data is synthetic: an intercepted session for a fictional user, synthetic
 * reads, and no writes, model calls or real account.
 */
const OWNER = '00000000-0000-4000-8000-000000000008'
const PLACE = '00000000-0000-4000-8000-000000000081'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}

/** Same reasoning as the B05 shell spec: placeholders on `.invalid`, never forwarded. */
const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)

/** A port nothing on this machine is listening on — not a fixed range another checkout may hold. */
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

const REPO_ROOT = resolve(import.meta.dirname, '..')

/**
 * Ready only when the server answering is this checkout's own. A fixed port
 * shared with a concurrently running checkout would otherwise be answered by
 * that checkout's server, and the captures would be of a different tree:
 * `/@fs/` serves this checkout's files only from a server rooted in it.
 */
async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic summary-facts server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic summary-facts origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-b05-summary-facts.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-b05-summary-facts-public-placeholder',
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

type Viewport = { width: number; height: number }
/** The portrait phone B05 was captured on, and the narrowest supported one. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
  { name: 'narrow-320', viewport: { width: 320, height: 568 } },
]

const REFERENCE_DIR = resolve(import.meta.dirname, '..', '..', '.evidence',
  basename(resolve(import.meta.dirname, '..')), 'sources')
const REFERENCE_FILE = 'sources/source-06-B05-03-review-summary.jpg'
const REFERENCE_PATH = resolve(REFERENCE_DIR, basename(REFERENCE_FILE))
const REFERENCE = {
  file: REFERENCE_FILE,
  sha256: existsSync(REFERENCE_PATH)
    ? createHash('sha256').update(readFileSync(REFERENCE_PATH)).digest('hex')
    : null,
  regions: {
    'B05-03 current': 'Left pane: the tall OVERVIEW metric grid (Intensity/Anchor/Goal/Duration/Movements) being replaced',
    '03.1': 'Right pane, YOUR WORKOUT card: title over one row "45 MIN  POWER  INTENSITY 7" (marker 1: keep the icons, in a row)',
    'B05-03 equipment': 'Right pane, EQUIPMENT FOR THIS WORKOUT card: glyph + "Kettlebell · Mat"; struck-through "Bodyweight movements included"',
    'B05-03 header': 'Right pane: REVIEW page title at the top, equipment directly after the summary',
  },
}

function sourceIdentity() {
  try {
    const head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== ''
    return { head, dirty }
  } catch {
    return { head: process.env.GITHUB_SHA ?? 'unknown', dirty: null }
  }
}

/**
 * Real-shaped compositions. Values are the acceptance's own, never the
 * reference's demo row: the pictured workout's shape (power focus, 45 min,
 * intensity 7, kettlebell + mat, bodyweight movements present), the widest
 * real values (full body, 120 min, intensity 10, active recovery), and an
 * all-bodyweight workout with no goal.
 */
type Movement = readonly [exerciseId: string, equipment: string]

/** The factory's two sections, each block holding the given movements. */
function workout(title: string, sections: readonly (readonly Movement[])[]) {
  const base = makeGenerationOutput()
  return {
    ...base,
    title,
    sections: base.sections.map((section, sectionIndex) => ({
      ...section,
      blocks: section.blocks.slice(0, 1).map((block) => ({
        ...block,
        exercises: sections[sectionIndex].map(([exercise_id, equipment]) => makePrescription({
          exercise_id,
          equipment,
          ...(equipment === 'bodyweight' || equipment === 'mat'
            ? { load_type: 'bodyweight' as const, load_value: null }
            : { load_type: 'rir' as const, load_value: 2 }),
        })),
      })),
    })),
  }
}

const today = new Date().toISOString().slice(0, 10)
const STATES: Readonly<Record<string, SessionAcceptance>> = {
  pictured: makeSessionAcceptance({
    date: today, location_id: PLACE, session_focus: 'power', goal_preset: 'balanced',
    requested_duration_mins: 45, effective_duration_target_mins: 45,
    requested_intensity: 7, effective_intensity: 7,
    workout: workout('Balanced Power', [
      [['hip-hinge', 'bodyweight']],
      [['kb-swing', 'kettlebell'], ['push-up', 'bodyweight'], ['dead-bug', 'mat']],
    ]),
  }),
  widest: makeSessionAcceptance({
    date: today, location_id: PLACE, session_focus: 'full_body', goal_preset: 'active_recovery',
    requested_duration_mins: 120, effective_duration_target_mins: 120,
    requested_intensity: 10, effective_intensity: 10,
    workout: workout('Full Body Metabolic Conditioning Intervals & Core', [
      [['arm-circle', 'bodyweight']],
      [['back-squat', 'barbell'], ['pull-up', 'pull up bar'], ['wall-ball', 'medicine ball']],
    ]),
  }),
  bodyweight: makeSessionAcceptance({
    date: today, location_id: PLACE, session_focus: 'lower_body', goal_preset: null,
    workout: workout('Lower Body Bodyweight', [
      [['air-squat', 'bodyweight']],
      [['split-squat', 'bodyweight'], ['glute-bridge', 'bodyweight']],
    ]),
  }),
}

const COMPLETED: WorkoutSessionRow = makeSessionRow({
  id: '00000000-0000-4000-8000-000000000801', user_id: OWNER, location_id: PLACE,
  date: today, title: 'Balanced Power', session_focus: 'power', goal_preset: 'balanced',
  created_at: `${today}T09:00:00.000Z`, updated_at: `${today}T10:00:00.000Z`,
  started_at: `${today}T09:00:00.000Z`, completed_at: `${today}T09:45:00.000Z`,
  actual_duration_mins: 45, effective_intensity: 7,
})

async function syntheticApp(page: Page, acceptance: SessionAcceptance | null) {
  const unexpected: string[] = []
  let attemptedWrites = 0
  let functionPosts = 0
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
  await page.route('**/*', async (route) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
    attemptedWrites += 1
    unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort('blockedbyclient')
  })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      if (request.method() === 'POST') functionPosts += 1
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full' })])
      if (name === 'workout_sessions') return reply([COMPLETED])
      if (['rest_days', 'load_anchors', 'location_equipment', 'saved_workouts', 'saved_workout_attempts',
        'saved_workout_completions', 'exercise_definitions'].includes(name)) return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session') return reply(null)
      if (name === 'streak_sessions') return reply([{
        session_id: COMPLETED.id, completed_at: COMPLETED.completed_at, counts_for_streak: true,
      }])
      if (name === 'session_as_performed') {
        return reply(reconstructionFixture({
          state: 'completed', sessionId: COMPLETED.id, userId: OWNER, title: COMPLETED.title,
          session: COMPLETED,
        }))
      }
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_candidate_sets_for_goal'].includes(name)) return reply([])
    }
    if (request.method() !== 'GET') attemptedWrites += 1
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic summary-facts request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner, handoff }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-b05-summary-facts-session', refreshToken: 'synthetic-b05-summary-facts-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-b05-summary-facts@example.invalid' },
    }))
    if (location.pathname === '/review' && handoff !== null) {
      history.replaceState({ usr: handoff, key: 'synthetic-summary-facts', idx: 0 }, '', location.href)
    }
  }, { owner: OWNER, handoff: acceptance === null ? null : reviewHandoff(acceptance) })
  return {
    assertReadOnly() {
      expect(unexpected).toEqual([])
      expect(attemptedWrites).toBe(0)
      expect(functionPosts).toBe(0)
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

/** The rendered row: each reading's box, glyph and text, and the frame around it. */
async function factsGeometry(row: Locator) {
  return row.evaluate((element) => {
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        width: rect.width, height: rect.height }
    }
    const card = element.closest('.clr-card')!
    const style = getComputedStyle(element)
    const readings = [...element.querySelectorAll<HTMLElement>('.clr-summary-fact')].map((reading) => {
      const term = reading.querySelector('dt')!
      const value = reading.querySelector('dd')!
      const glyph = reading.querySelector('.clr-summary-fact__glyph svg')
      const termStyle = getComputedStyle(term)
      return {
        term: term.textContent,
        termShown: termStyle.position !== 'absolute' && term.getBoundingClientRect().width > 1,
        value: value.textContent,
        box: box(reading),
        valueBox: box(value),
        glyph: glyph === null ? null : box(glyph),
        valueLines: new Set([...(() => {
          const range = document.createRange()
          range.selectNodeContents(value)
          return range.getClientRects()
        })()].map((rect) => Math.round(rect.top))).size,
        valueClipped: value.scrollWidth > value.clientWidth + 1,
      }
    })
    return {
      row: { ...box(element), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        overflow: style.overflow, display: style.display, lineHeight: parseFloat(style.lineHeight),
        rowGap: parseFloat(style.rowGap), fontFamily: style.fontFamily, textTransform: style.textTransform },
      card: box(card),
      cardInner: (() => {
        const rect = card.getBoundingClientRect()
        const cs = getComputedStyle(card)
        return { left: rect.left + parseFloat(cs.paddingLeft), right: rect.right - parseFloat(cs.paddingRight) }
      })(),
      readings,
      metricFrames: card.querySelectorAll('.clr-metric-grid, .clr-metric-frame').length,
    }
  })
}

type Geometry = Awaited<ReturnType<typeof factsGeometry>>

/** Readings grouped into rendered lines by their vertical centre. */
function linesOf(geometry: Geometry) {
  const lines: Geometry['readings'][] = []
  for (const reading of geometry.readings) {
    const centre = (reading.box.top + reading.box.bottom) / 2
    const line = lines.find((candidate) =>
      Math.abs((candidate[0].box.top + candidate[0].box.bottom) / 2 - centre) <= TOLERANCE)
    if (line === undefined) lines.push([reading])
    else line.push(reading)
  }
  return lines
}

async function record(page: Page, targets: Readonly<Record<string, Locator>>, testInfo: TestInfo, id: string,
  context: {
    consumer: string; classification: string; state: string; viewport: Viewport
    criteria: Record<string, 'pass' | 'fail'>; measurements: unknown
  }) {
  await settleFonts(page)
  const captures = []
  for (const [part, target] of Object.entries(targets)) {
    await target.scrollIntoViewIfNeeded()
    const shot = await target.screenshot({ animations: 'disabled' })
    const file = `${id}-${part}.png`
    const shotPath = testInfo.outputPath(file)
    writeFileSync(shotPath, shot)
    await testInfo.attach(file, { path: shotPath, contentType: 'image/png' })
    captures.push({ part, file, sha256: createHash('sha256').update(shot).digest('hex') })
  }
  const entry = {
    id,
    ...context,
    reference: REFERENCE,
    source: sourceIdentity(),
    target: new URL(page.url()).origin,
    route: new URL(page.url()).pathname,
    skin: await page.locator('html').getAttribute('data-skin'),
    syntheticPublicConfig: SYNTHETIC_ORIGIN_NEEDED,
    browser: `${testInfo.project.name} (Chromium emulation, deviceScaleFactor ${testInfo.project.use.deviceScaleFactor ?? 1})`,
    captures,
  }
  writeFileSync(testInfo.outputPath(`${id}.json`), JSON.stringify(entry, null, 2))
  await testInfo.attach(`${id}.json`, { body: JSON.stringify(entry, null, 2), contentType: 'application/json' })
}

async function useSkin(page: Page, skin: 'clear' | 'vapour') {
  await page.evaluate((value) => {
    localStorage.setItem('clear.skin', value)
    document.documentElement.setAttribute('data-skin', value)
  }, skin)
  await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
  await settleFonts(page)
}

/**
 * Every declared face loaded before anything is measured. `fonts.ready` alone
 * can resolve before a face the new skin uses has even started loading, and a
 * fallback face's wider metrics would be measured as the product's layout.
 */
async function settleFonts(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((settle) => requestAnimationFrame(() => requestAnimationFrame(settle)))
  })
}

/**
 * Review, reached the way the product reaches it: Home is visited (and
 * scanned), then the router is handed the composition and moves to Review in
 * the same document — the Generate → Review handoff's own history state.
 *
 * Review is then scanned once its region has measured and its faces have
 * loaded. Observed while building this spec, with the product unchanged
 * between runs: the first axe pass over Review's section triggers (bold
 * uppercase data face) intermittently reported them nameless —
 * `button-has-visible-text`, and so `landmark-unique` for the regions they
 * label — while the text was in the DOM, visible and unhidden, and a second
 * pass over the same, unmutated DOM was clean every time. That is axe's
 * text-as-icon-ligature canvas heuristic being primed, not the screen. One
 * unasserted priming pass precedes the asserted scan; a real violation
 * survives into the asserted scan exactly as it would have without it.
 */
async function openReview(page: Page, acceptance: SessionAcceptance,
  visit: (path: string) => Promise<void>, checkA11y: () => Promise<void>) {
  await visit('/')
  await page.evaluate((handoff) => {
    history.pushState({ usr: handoff, key: 'synthetic-summary-facts', idx: 1 }, '', '/review')
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  }, reviewHandoff(acceptance))
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(acceptance.workout.title)
  await expect(page.locator('.clr-scroll-region[data-measured]')).toHaveCount(1)
  await settleFonts(page)
  await new AxeBuilder({ page }).analyze()
  await checkA11y()
}

/** Sub-pixel rounding only. */
const TOLERANCE = 0.75

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 summary facts @ ${size}`, () => {
    test.use({ viewport })

    for (const [state, acceptance] of Object.entries(STATES)) {
      test(`Review (${state}): title, one aligned glyph fact row with real values, equipment near the top`, async ({ page, visit, checkA11y }, testInfo) => {
        const app = await syntheticApp(page, acceptance)
        const briefing = reviewBriefing(acceptance, null)
        await openReview(page, acceptance, visit, checkA11y)
        const title = page.getByRole('heading', { level: 1 })
        await expect(title).toHaveAccessibleName(acceptance.workout.title)
        const row = page.locator('dl.clr-summary-facts')
        await expect(row).toHaveAttribute('aria-label', 'Workout facts')
        const card = page.locator('.clr-card').filter({ has: row })
        const scroller = page.getByRole('region', { name: 'Review content' })

        for (const skin of ['clear', 'vapour'] as const) {
          await useSkin(page, skin)
          await scroller.evaluate((element) => { element.scrollTop = 0 })
          const geometry = await factsGeometry(row)

          // The real facts, in the reference's order first, each whole.
          const value = (label: string) => briefing.facts.find((fact) => fact.label === label)!.value
          expect(geometry.readings.map((reading) => [reading.term, reading.value])).toEqual([
            ['Duration', value('Duration')],
            ['Anchor', value('Anchor')],
            ['Intensity', value('Intensity')],
            ['Goal', value('Goal')],
            ['Movements', String(briefing.movementCount)],
          ])
          await expect(row).not.toContainText(/45 min.*power.*intensity 7$/i)

          // 03.1: the system glyphs stay, one beside each composed fact, on its line.
          for (const reading of geometry.readings.slice(0, 4)) {
            expect(reading.glyph, reading.term ?? '').not.toBeNull()
            expect(reading.glyph!.width).toBeGreaterThanOrEqual(12)
            const glyphCentre = (reading.glyph!.top + reading.glyph!.bottom) / 2
            const valueCentre = (reading.valueBox.top + reading.valueBox.bottom) / 2
            expect(Math.abs(glyphCentre - valueCentre), JSON.stringify(reading)).toBeLessThanOrEqual(1.5)
          }
          // Terse readings: a self-describing value carries no visible term.
          expect(geometry.readings.map((reading) => reading.termShown)).toEqual([false, false, true, true, true])

          // No clipping or silent loss: every reading whole, inside the row and card.
          expect(geometry.row.scrollWidth).toBeLessThanOrEqual(geometry.row.clientWidth + 1)
          expect(geometry.row.left).toBeGreaterThanOrEqual(geometry.cardInner.left - TOLERANCE)
          expect(geometry.row.right).toBeLessThanOrEqual(geometry.cardInner.right + TOLERANCE)
          for (const reading of geometry.readings) {
            expect(reading.valueClipped, JSON.stringify(reading)).toBe(false)
            expect(reading.valueLines, JSON.stringify(reading)).toBe(1)
            expect(reading.box.left).toBeGreaterThanOrEqual(geometry.row.left - TOLERANCE)
            expect(reading.box.right).toBeLessThanOrEqual(geometry.row.right + TOLERANCE)
            expect(reading.box.bottom).toBeLessThanOrEqual(geometry.row.bottom + TOLERANCE)
          }

          // One aligned row: readings on a line share their centre; any
          // continuation line starts at the row's left edge, never indented.
          const lines = linesOf(geometry)
          for (const line of lines) {
            const centres = line.map((reading) => (reading.box.top + reading.box.bottom) / 2)
            expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(TOLERANCE)
            expect(Math.abs(line[0].box.left - geometry.row.left)).toBeLessThanOrEqual(TOLERANCE)
          }
          // The reference's three facts lead. At the pictured phone width with
          // the pictured-shape values they share the first line, as in 03.1;
          // the two further real facts (goal, movements) continue below, and
          // narrower widths or wider values wrap rather than clip or drop.
          expect(lines.flat().map((reading) => reading.term).slice(0, 3)).toEqual(['Duration', 'Anchor', 'Intensity'])
          if (state === 'pictured' && size === 'phone-390') {
            expect(lines[0].map((reading) => reading.term)).toEqual(['Duration', 'Anchor', 'Intensity'])
            expect(lines.length).toBe(2)
          }
          // Never one reading per line: the row stays a row wherever it fits two.
          expect(lines.length).toBeLessThan(geometry.readings.length)
          // Compact, not the tall grid: no metric frames, one text line per line.
          expect(geometry.metricFrames).toBe(0)
          expect(geometry.row.display).toBe('flex')
          expect(geometry.row.height).toBeLessThanOrEqual(
            lines.length * Math.max(geometry.row.lineHeight, 16) + (lines.length - 1) * geometry.row.rowGap + 2)

          // The title leads, the facts follow it, and the required equipment is
          // visible in the first screen before any section.
          const titleBox = (await title.boundingBox())!
          const scrollBox = (await scroller.boundingBox())!
          expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(geometry.card.top + TOLERANCE)
          expect(geometry.row.top).toBeGreaterThan(geometry.card.top)
          const equipment = briefing.equipment.length === 0
            ? card.getByText('None — bodyweight only', { exact: true })
            : card.getByRole('list', { name: 'Required equipment' })
          const equipmentBox = (await equipment.boundingBox())!
          expect(equipmentBox.y).toBeGreaterThanOrEqual(geometry.row.bottom)
          expect(equipmentBox.y + equipmentBox.height).toBeLessThanOrEqual(scrollBox.y + scrollBox.height)
          const firstSection = page.locator('.clr-collapsible__trigger').first()
          expect((await firstSection.boundingBox())!.y).toBeGreaterThan(equipmentBox.y)
          if (briefing.equipment.length > 0) {
            await expect(equipment.getByRole('listitem')).toHaveText([...briefing.equipment])
          }

          // The struck preview sentence is gone; bodyweight is still not equipment.
          await expect(page.getByRole('main')).not.toContainText(/bodyweight movements included/i)
          if (briefing.equipment.length > 0) {
            await expect(equipment.getByRole('listitem')).not.toContainText(['bodyweight'])
          }

          await record(page, { card, firstScreen: page.locator('#main') }, testInfo,
            `review-${state}-${size}-${skin}`, {
              consumer: 'Review overview (SummaryFacts)',
              classification: 'equivalent workout-facts object → compact SummaryFacts composition',
              state: `${state} workout, top of Review`, viewport,
              criteria: { 'AC-023': 'pass', 'AC-024': 'pass', 'AC-025': 'pass', 'AC-063': 'pass' },
              measurements: { lines: lines.map((line) => line.map((reading) => reading.term)), ...geometry },
            })
        }
        app.assertReadOnly()
      })
    }

    test('completed Summary keeps its result readouts (distinct variant)', async ({ page, visit }, testInfo) => {
      const app = await syntheticApp(page, null)
      await visit('/summary')
      await expect(page.getByText(`${COMPLETED.title}, done.`)).toBeVisible()
      const grid = page.locator('.clr-metric-grid').first()
      await expect(grid).toBeVisible()
      await expect(grid.locator('.clr-metric-frame')).toHaveCount(2)
      await expect(grid).toContainText('45 min')
      await expect(page.locator('.clr-summary-facts')).toHaveCount(0)
      const box = (await grid.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      await record(page, { results: grid }, testInfo, `summary-results-${size}`, {
        consumer: 'Completed Summary results (MetricGrid of Stat cards)',
        classification: 'distinct completed results → MetricGrid/MetricFrame retained',
        state: 'completed session, debrief open', viewport,
        criteria: { 'AC-025': 'pass' },
        measurements: { grid: box },
      })
      app.assertReadOnly()
    })

    test('Session detail keeps its record readouts (distinct variant)', async ({ page, visit }, testInfo) => {
      const app = await syntheticApp(page, null)
      await visit(`/history/${COMPLETED.id}`)
      const facts = page.locator('dl[aria-label="Workout facts"]')
      await expect(facts).toBeVisible()
      await expect(facts.locator('.clr-metric-frame')).toHaveCount(5)
      await expect(facts.locator('dt')).toHaveText(['Date', 'Focus', 'Status', 'Duration', 'Intensity'])
      await expect(page.locator('.clr-summary-facts')).toHaveCount(0)
      const box = (await facts.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      await record(page, { record: facts }, testInfo, `session-detail-record-${size}`, {
        consumer: 'Session detail overview (MetricGrid as dl)',
        classification: 'distinct detailed record → MetricGrid/MetricFrame retained',
        state: 'completed session, as performed', viewport,
        criteria: { 'AC-025': 'pass' },
        measurements: { facts: box },
      })
      app.assertReadOnly()
    })
  })
}

/**
 * Score/readout consumers live inside an active workout; their classification
 * is held at the source boundary: they compose `MetricFrame`, not the compact
 * workout-facts row.
 */
test('score/readout consumers keep MetricFrame (distinct variant)', () => {
  for (const file of ['src/ui/conditioning-score.tsx', 'src/ui/amrap-block.tsx']) {
    const source = readFileSync(resolve(import.meta.dirname, '..', file), 'utf8')
    expect(source, file).toContain('<MetricFrame>')
    expect(source, file).not.toContain('SummaryFact')
  }
})
