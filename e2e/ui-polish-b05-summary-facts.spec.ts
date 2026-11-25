import { execSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { basename, resolve } from 'node:path'
import type { Locator, Page, Route, TestInfo } from '@playwright/test'

import { readE2eEnv } from '../scripts/e2e/env.mjs'
import { reviewHandoff } from '../src/state/review-handoff'
import type { SessionAcceptance, WorkoutSessionRow } from '../src/state/schemas'
import {
  
  
  
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

// Native keyboard scrolling and its capture share the browser's active page.
// Keep these cases sequential so parallel foreground changes cannot steal it.
test.describe.configure({ mode: 'default' })

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
  sha256: createHash('sha256').update(readFileSync(REFERENCE_PATH)).digest('hex'),
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

const today = new Date().toISOString().slice(0, 10)

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

for (const { name: size, viewport } of VIEWPORTS) {
  test.describe(`B05 summary facts @ ${size}`, () => {
    test.use({ viewport })

    // TASK-115 retired the case `Review (${state}): title, one aligned glyph fact row with real values, equipment near the top` (old line 547): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.

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

    // TASK-115 retired the case 'Session detail keeps its record readouts (distinct variant)' (old line 710): superseded by Round 7
    // (D2, Eric, chat, 2026-11-24: "Retire, list for UAT (Recommended)"); evidence/refinement/task-115/test-ledger.json and UAT-LIST.md name it.
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
