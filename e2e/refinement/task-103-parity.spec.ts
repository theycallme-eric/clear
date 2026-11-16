import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, relative, resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { resolveObjectStore } from '../../scripts/refinement/lib/references.mjs'
import { timedBlock } from '../../src/dev/gallery-refinement-fixtures'
import { formatDay, formatFocus } from '../../src/state/history'
import { CONTRACT_VERSION, sessionSnapshotSchema, type SessionAcceptance, type SessionSnapshot, type WorkoutSessionRow } from '../../src/state/schemas'
import type { BlockProgress } from '../../src/state/workout-progress'
import { makePrescription, makeSessionRow, makeWorkoutBlock } from '../../src/test/factories'
import { formatBadgesSnapshot } from '../../src/test/format-badges-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * A3 TASK-103 look check (TASK-AC-A6EC0ADCD3BD): each real route this task
 * wires beside its accepted gallery state (gallery commit bec4454, Round 7),
 * with matched data, at the two approved phone widths, 320 and 390.
 *
 *   · `emom`, `amrap`, `for_time`, `ladder`: `/workout`'s timed card — Round 7's
 *     `TimedWorkoutFlow`, now the real renderer — beside
 *     `/gallery/refinements?state=<format>`, drawn from the very block the
 *     gallery uses (`timedBlock` in `src/dev/gallery-refinement-fixtures.ts`)
 *     persisted as a synthetic session with the same profile unit. Two
 *     moments: the card before Start, and its "Log results" dialog once the
 *     attempt has run past its cap (the gallery's own "Open …" drive; the
 *     route's clock moved by the same amount).
 *   · `screens`: `/history` (Round 7's `HistoryList` / `WorkoutListItem` and
 *     the carried TASK-026 filter) beside the accepted state's History part,
 *     over the same two workouts on the same days.
 *
 * Every visible word is read from both sides. A difference no criterion
 * intends fails the case; an intended one is labelled with its criterion ID.
 * Each case writes its receipt to `evidence/refinement/task-103/parity/` and
 * its captures beside the Runner's evidence store (outside Git), recording
 * each capture's SHA-256 in the receipt. Synthetic and contained: nothing is
 * written to any backend.
 */
const OWNER = '00000000-0000-4000-8000-000000010390'
const PLACE = '00000000-0000-4000-8000-000000010391'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const RECEIPTS = join(REPO_ROOT, 'evidence', 'refinement', 'task-103', 'parity')
const e2e = readE2eEnv()
const SYNTHETIC_ORIGIN_NEEDED = !e2e.usesExternalTarget && (e2e.url === null || e2e.anonKey === null)

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

async function waitForOrigin(origin: string, deadline: number, exited: () => number | null) {
  const own = `${origin}/@fs${resolve(REPO_ROOT, 'package.json')}`
  while (Date.now() < deadline) {
    const code = exited()
    if (code !== null) throw new Error(`Synthetic TASK-103 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-103 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-103.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-103-public-placeholder',
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
test.use({ timezoneId: 'UTC' })

const VIEWPORTS = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Matched data: the gallery's own blocks, persisted as a session
// ─────────────────────────────────────────────────────────────────────────────

type TimedState = 'emom' | 'amrap' | 'for_time' | 'ladder'
const TIMED_STATES: readonly TimedState[] = ['emom', 'amrap', 'for_time', 'ladder']
/** The blocks the accepted states draw (`sceneFor` in `gallery-refinement-forms.tsx`). */
const GALLERY_BLOCKS: Readonly<Record<TimedState, BlockProgress>> = {
  emom: timedBlock('emom'),
  amrap: timedBlock('amrap', { multi: true }),
  for_time: timedBlock('for_time', { multi: true }),
  ladder: timedBlock('ladder', { rounds: 4 }),
}
const OPEN: Readonly<Record<TimedState, string>> = {
  emom: 'Open EMOM results', amrap: 'Open AMRAP results', for_time: 'Open For Time results', ladder: 'Open Ladder results',
}
/** The gallery's own sample unit (`PreviewSetLogging`), so the planned loads read alike. */
const GALLERY_UNIT = 'lb' as const

function persistedBlock(block: BlockProgress) {
  return makeWorkoutBlock({
    structure_type: block.structureType,
    rep_scheme: block.repScheme,
    rounds: block.rounds,
    round_rest_seconds: block.roundRestSeconds,
    timer_type: block.timerType,
    timer_seconds: block.timerSeconds,
    ...(block.ladderTiming ? { ladder_timing: block.ladderTiming } : {}),
    exercises: block.exercises.map(({ prescription: p }) => makePrescription({
      exercise_id: p.exercise_id,
      equipment: p.equipment_used,
      session_function: 'conditioning',
      anchor_relationship: 'neutral',
      modality: p.modality,
      sets: p.sets,
      target_kind: p.target_kind,
      target_value: p.target_value,
      target_min: p.target_min,
      target_max: p.target_max,
      target_sequence: p.target_sequence,
      per_side: p.per_side,
      distance_unit: p.distance_unit,
      rest_seconds: p.rest_seconds,
      tempo: p.tempo,
      load_type: p.load_type ?? 'none',
      load_value: p.load_value,
      is_interval_exercise: p.is_interval_exercise,
      // The gallery row is already one valid prescription; its target fields
      // keep their own discriminant.
    } as Parameters<typeof makePrescription>[0])),
  })
}

function timedSession(state: TimedState): SessionSnapshot {
  const acceptance: SessionAcceptance = {
    date: '2026-11-16',
    location_id: PLACE,
    session_focus: 'full_body',
    goal_preset: 'balanced',
    requested_duration_mins: 30,
    effective_duration_target_mins: 30,
    computed_duration_mins: null,
    requested_intensity: 5,
    effective_intensity: 5,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'e2e',
    contract_version: CONTRACT_VERSION,
    is_deload: false,
    workout: {
      title: `TASK-103 parity ${state}`,
      overview: null,
      estimated_duration_mins: 30,
      sections: [
        { section_type: 'conditioning', section_title: 'Parity', section_notes: null, blocks: [persistedBlock(GALLERY_BLOCKS[state])] },
        {
          section_type: 'cooldown', section_title: 'Cooldown', section_notes: null,
          blocks: [makeWorkoutBlock({ exercises: [makePrescription({ exercise_id: 'burpee', equipment: 'bodyweight', load_type: 'none', load_value: null, sets: 1, target_value: 1 })] })],
        },
      ],
    },
  }
  return sessionSnapshotSchema.parse(formatBadgesSnapshot(acceptance, { userId: OWNER, startedAt: new Date(Date.now() - 60_000).toISOString() }))
}

/** The accepted state's two History rows, as stored workouts on the same days. */
const HISTORY_ROWS: readonly { row: WorkoutSessionRow; outcome: 'completed' | 'partial' }[] = [
  { outcome: 'completed', row: historyRow(1, '2026-11-03', 'Upper-body strength', 'upper_body', 'completed') },
  { outcome: 'partial', row: historyRow(2, '2026-11-01', 'Conditioning and longer session name', 'full_body', 'partial') },
]

function historyRow(n: number, date: string, title: string, focus: WorkoutSessionRow['session_focus'], outcome: 'completed' | 'partial') {
  return makeSessionRow({
    id: `00000000-0000-4000-8000-0000000103${String(n).padStart(2, '0')}`,
    user_id: OWNER, location_id: PLACE, date, title, session_focus: focus,
    created_at: `${date}T08:00:00.000Z`, updated_at: `${date}T09:00:00.000Z`,
    started_at: `${date}T08:05:00.000Z`,
    completed_at: outcome === 'completed' ? `${date}T09:00:00.000Z` : null,
    abandoned_at: outcome === 'partial' ? `${date}T08:30:00.000Z` : null,
    requested_duration_mins: 45, actual_duration_mins: outcome === 'completed' ? 47 : 18,
    requested_intensity: 7, effective_intensity: 7, counts_for_streak: outcome === 'completed',
  })
}

/** The contained synthetic app: reads only; any write fails the case. */
async function syntheticApp(page: Page, snapshot: SessionSnapshot | null) {
  const unexpected: string[] = []
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) => route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET' || request.method() === 'HEAD') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced', weight_unit: GALLERY_UNIT })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'workout_sessions') return reply(snapshot === null ? HISTORY_ROWS.map((entry) => entry.row) : [snapshot.session])
      return reply([])
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(snapshot)
      if (name === 'session_as_performed' && snapshot !== null) {
        return reply({
          reconstruction: 'performed', as_of: snapshot.session.started_at, session: snapshot.session, state: snapshot.state,
          sections: snapshot.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => ({ ...block, block_result: null, exercises: block.exercises.map((entry) => ({ ...entry, movement_result: null })) })),
          })),
        })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history', 'set_load_anchors'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-103 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-103-session', refreshToken: 'synthetic-task-103-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-103@example.invalid' },
    }))
  }, { owner: OWNER })
  return {
    assertContained() {
      expect(unexpected, 'Every synthetic API request has an explicit disposition').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading, comparing and keeping
// ─────────────────────────────────────────────────────────────────────────────

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  })
  // Entrance and list motion finished, so every word is drawn (loops excepted).
  await page.waitForFunction(() => document.getAnimations()
    .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    .every((animation) => animation.playState !== 'running'))
}

/** The visible words of a part, line by line, read once they hold still. */
async function linesOf(target: Locator): Promise<string[]> {
  const read = async () => (await target.evaluate((element) => (element as HTMLElement).innerText))
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line !== '')
  let previous = await read()
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await target.page().waitForTimeout(250)
    const next = await read()
    if (JSON.stringify(next) === JSON.stringify(previous)) return next
    previous = next
  }
  return previous
}

interface Difference { readonly side: 'gallery only' | 'route only'; readonly text: string; readonly criterion: string | null; readonly reason: string | null }
interface Intended { readonly criterion: string; readonly reason: string; readonly side: Difference['side']; readonly match: RegExp }

/** Each line only one side shows, labelled with the criterion that intends it, if any. */
function compare(gallery: readonly string[], route: readonly string[], intended: readonly Intended[]): Difference[] {
  const remaining = [...route]
  const differences: Difference[] = []
  for (const line of gallery) {
    const index = remaining.indexOf(line)
    if (index >= 0) remaining.splice(index, 1)
    else differences.push(label('gallery only', line, intended))
  }
  for (const line of remaining) differences.push(label('route only', line, intended))
  return differences
}

function label(side: Difference['side'], text: string, intended: readonly Intended[]): Difference {
  const rule = intended.find((candidate) => candidate.side === side && candidate.match.test(text))
  return { side, text, criterion: rule?.criterion ?? null, reason: rule?.reason ?? null }
}

/** Captures go beside the Runner's evidence store, outside Git; else into test-results. */
function captureDir(): { dir: string; identity: string } {
  const store = resolveObjectStore({ cwd: REPO_ROOT })
  if (store.problem === undefined && store.dir !== null) {
    const dir = join(store.dir, 'clear-gallery-adoption-v2-20261116', 'task-103', 'captures')
    return { dir, identity: 'store:clear-gallery-adoption-v2-20261116/task-103/captures' }
  }
  const dir = join(REPO_ROOT, 'test-results', 'task-103-parity')
  return { dir, identity: `repo:${relative(REPO_ROOT, dir)}` }
}

async function keep(target: Locator, name: string) {
  const bytes = await target.screenshot({ caret: 'hide', animations: 'disabled' })
  await test.info().attach(`${name}.png`, { body: bytes, contentType: 'image/png' })
  const { dir, identity } = captureDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.png`), bytes)
  return { file: `${identity}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function writeReceipt(name: string, receipt: Record<string, unknown>) {
  mkdirSync(RECEIPTS, { recursive: true })
  writeFileSync(join(RECEIPTS, `${name}.json`), `${JSON.stringify({ schema: 'clear-task-103-parity/v1', task: 'TASK-103', gallery: 'bec44545eb982f6dc136a583400f7e314c306d1d', ...receipt }, null, 2)}\n`)
}

function expectAllIntended(differences: readonly Difference[], label: string) {
  const unintended = differences.filter((difference) => difference.criterion === null)
  expect(unintended, `${label}: every visible difference is one a criterion intends`).toEqual([])
}

// ─────────────────────────────────────────────────────────────────────────────
// The timed cards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Differences a criterion intends on the timed cards. The route draws the
 * same Round 7 components from the same block, so none is expected; the
 * table stays explicit so a future one is labelled rather than waved through.
 */
const TIMED_INTENDED: readonly Intended[] = []

const capOf = (state: TimedState) => {
  const block = GALLERY_BLOCKS[state]
  return block.ladderTiming?.mode === 'capped_window' ? block.ladderTiming.cap_seconds ?? 0 : block.timerSeconds ?? 0
}

for (const state of TIMED_STATES) {
  for (const { name, viewport } of VIEWPORTS) {
    test(`TASK-AC-A6EC0ADCD3BD ${state} ${name}: /workout’s timed card and its Log results dialog match the accepted gallery state, before Start and past the cap`, async ({ page, visit }) => {
      test.setTimeout(180_000)
      await page.setViewportSize(viewport)

      // The accepted state: the real flow on the gallery's memory runtime.
      await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
      await visit(`/gallery/refinements?state=${state}`)
      const galleryCard = page.locator(`[data-refinement-state="${state}"] .clr-timed-flow`)
      await expect(galleryCard).toBeVisible()
      await settle(page)
      const galleryReady = await linesOf(galleryCard)
      const galleryReadyCapture = await keep(galleryCard, `${state}-${name}-gallery-ready`)
      await page.getByRole('button', { name: OPEN[state], exact: true }).click()
      const galleryLog = page.locator('dialog[open] form.clr-timed-log')
      await expect(galleryLog).toBeVisible({ timeout: 15_000 })
      await settle(page)
      const galleryLogLines = await linesOf(galleryLog)
      const galleryEnded = await linesOf(page.locator(`[data-refinement-state="${state}"] .clr-timed-flow`))
      const galleryLogCapture = await keep(page.locator('dialog[open]'), `${state}-${name}-gallery-log`)

      // The real route, over the same block, with its clock moved past the same cap.
      await page.clock.install()
      const app = await syntheticApp(page, timedSession(state))
      await visit('/workout')
      const routeCard = page.locator(`.clr-timed-flow[data-timed-format="${state}"]`)
      await expect(routeCard).toBeVisible()
      await settle(page)
      const routeReady = await linesOf(routeCard)
      const routeReadyCapture = await keep(routeCard, `${state}-${name}-route-ready`)
      await routeCard.getByRole('button', { name: /^Start / }).click()
      await page.clock.fastForward((capOf(state) + 1) * 1000)
      const routeLog = page.locator('dialog[open] form.clr-timed-log')
      await expect(routeLog).toBeVisible({ timeout: 15_000 })
      await settle(page)
      const routeLogLines = await linesOf(routeLog)
      const routeEnded = await linesOf(routeCard)
      const routeLogCapture = await keep(page.locator('dialog[open]'), `${state}-${name}-route-log`)

      const moments = {
        ready: compare(galleryReady, routeReady, TIMED_INTENDED),
        log: compare(galleryLogLines, routeLogLines, TIMED_INTENDED),
        ended: compare(galleryEnded, routeEnded, TIMED_INTENDED),
      }
      writeReceipt(`${state}-${name}`, {
        state, width: viewport.width, route: '/workout',
        captures: { galleryReady: galleryReadyCapture, galleryLog: galleryLogCapture, routeReady: routeReadyCapture, routeLog: routeLogCapture },
        lines: { gallery: { ready: galleryReady, log: galleryLogLines, ended: galleryEnded }, route: { ready: routeReady, log: routeLogLines, ended: routeEnded } },
        differences: moments,
      })
      for (const [moment, differences] of Object.entries(moments)) expectAllIntended(differences, `${state} ${moment} @${name}`)
      // Nothing outside the card is claimed: the route stays contained.
      app.assertContained()
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The accepted `screens` state draws History as a static composition with its
 * own sample words; the route keeps the app's own rows and words. Each
 * difference below is one the criteria intend.
 */
const DAY = String.raw`[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{4}`
const HISTORY_INTENDED: readonly Intended[] = [
  { side: 'gallery only', match: /^Filter$/i, criterion: 'TASK-AC-6BFF651DF237',
    reason: 'The route keeps its carried TASK-026 filter, labelled Show (task 2: the app keeps its own words).' },
  { side: 'route only', match: /^Show$/i, criterion: 'TASK-AC-6BFF651DF237',
    reason: 'The carried TASK-026 filter control, labelled Show.' },
  { side: 'gallery only', match: /^(All workouts|Incomplete)$/i, criterion: 'TASK-AC-6BFF651DF237',
    reason: 'The filter offers All entries, Completed and Partial (TASK-026); the sample words are the gallery’s.' },
  { side: 'route only', match: /^(All entries|Partial)$/i, criterion: 'TASK-AC-6BFF651DF237',
    reason: 'The filter offers All entries, Completed and Partial (TASK-026); a stopped workout reads Partial, as stored.' },
  { side: 'gallery only', match: /^[A-Z][a-z]+ \d{1,2} · (Completed|Incomplete)$/, criterion: 'AC-C53-01',
    reason: 'Decision 7 / C53: the route reads the status, then the stored date in the app’s day format, on the line beneath the title; the gallery sample is “date · status” in its own words.' },
  { side: 'route only', match: /^(Completed|Partial)$/i, criterion: 'AC-C53-01',
    reason: 'Decision 7 / C53: the status, with its glyph, on the line beneath the title.' },
  { side: 'route only', match: new RegExp(`^${DAY}$`), criterion: 'AC-C53-01',
    reason: 'Decision 7 / C53: the stored date beside the status, in the app’s day format (AC-R026-01: truthful stored dates).' },
  { side: 'route only', match: /^(Upper body|Lower body|Full body|Core|Conditioning)( Requested \d+ min)?( Actual \d+ min)?( Intensity \d+\/10)?$/, criterion: 'TASK-AC-6BFF651DF237',
    reason: 'Then the metrics (decision 7): focus, requested and actual minutes, intensity — the record’s own values.' },
  { side: 'route only', match: /^(Requested \d+ min|Actual \d+ min|Intensity \d+\/10)( (Actual \d+ min|Intensity \d+\/10))*$/, criterion: 'TASK-AC-6BFF651DF237',
    reason: 'The metrics row, wrapped at a narrow width.' },
  { side: 'route only', match: new RegExp(`^${DAY}( – ${DAY})? · \\d+ rest days?$`), criterion: 'TASK-AC-6BFF651DF237',
    reason: 'Rest days are still listed under All entries (TASK-026); the gallery sample has none.' },
  { side: 'route only', match: /^Rest$/i, criterion: 'TASK-AC-6BFF651DF237',
    reason: 'A rest run’s own row word, under All entries (TASK-026).' },
  { side: 'route only', match: /^Workout history$/i, criterion: 'AC-R026-01',
    reason: 'History’s own list card names the chronology it holds.' },
  { side: 'gallery only', match: /^History$/i, criterion: 'AC-R026-01',
    reason: 'The gallery card is headed History; the route’s History is the page itself (its h1) around the Workout history card.' },
]

for (const { name, viewport } of VIEWPORTS) {
  test(`TASK-AC-A6EC0ADCD3BD screens ${name}: /history’s rows and filter beside the accepted History part, every difference one a criterion intends`, async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(viewport)
    await installDeterministicCapture(page, { skin: 'clear', reducedMotion: true })
    await visit('/gallery/refinements?state=screens')
    const scene = page.locator('[data-refinement-state="screens"]')
    // The History card: the nearest ancestor of its rows that carries its heading.
    const galleryPart = scene.locator('.clr-accepted-history-row').first()
      .locator('xpath=ancestor::*[.//*[normalize-space(text())="History"]][1]')
    await galleryPart.scrollIntoViewIfNeeded()
    await settle(page)
    const galleryOptions = (await galleryPart.locator('select option').allTextContents()).map((text) => text.trim())
    const gallery = (await linesOf(galleryPart)).filter((line) => !galleryOptions.includes(line) || line === 'Completed')
    const galleryCapture = await keep(galleryPart, `screens-${name}-gallery`)

    const app = await syntheticApp(page, null)
    await visit('/history')
    const list = page.getByRole('list', { name: 'Workout history' })
    await expect(list).toBeVisible()
    await settle(page)
    const routePart = page.locator('main')
    const routeOptions = (await routePart.locator('select option').allTextContents()).map((text) => text.trim())
    const route = (await linesOf(routePart)).filter((line) => line !== 'History' && (!routeOptions.includes(line) || line === 'Completed'))
    const routeCapture = await keep(routePart, `screens-${name}-route`)

    // The rows themselves: title alone, then status with the stored date, then the metrics.
    for (const { row, outcome } of HISTORY_ROWS) {
      const item = list.getByRole('listitem').filter({ has: page.getByRole('link', { name: row.title, exact: true }) })
      await expect(item.locator('[data-part="status"]')).toHaveText(outcome === 'completed' ? 'Completed' : 'Partial')
      await expect(item.locator('[data-part="context"]')).toContainText(formatDay(row.date))
      await expect(item.locator('[data-part="metrics"]')).toContainText(formatFocus(row.session_focus))
    }

    const options = {
      gallery: galleryOptions,
      route: routeOptions,
      differences: compare(galleryOptions, routeOptions, HISTORY_INTENDED),
    }
    const differences = compare(gallery, route, HISTORY_INTENDED)
    writeReceipt(`screens-${name}`, {
      state: 'screens', width: viewport.width, route: '/history',
      captures: { gallery: galleryCapture, route: routeCapture },
      lines: { gallery, route },
      filterOptions: options,
      differences,
    })
    expectAllIntended(options.differences, `screens filter options @${name}`)
    expectAllIntended(differences, `screens @${name}`)
    app.assertContained()
  })
}
