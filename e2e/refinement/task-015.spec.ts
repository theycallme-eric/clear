import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import {
  ACTUALS_AMRAP_WORK_LIST,
  ACTUALS_COOLDOWN_TITLE,
  ACTUALS_FOR_TIME_WORK_LIST,
  ACTUALS_LADDER_WORK_LIST,
  ACTUALS_PLANNED_LOADS,
  ACTUALS_RACE_SECTION_TITLE,
  ACTUALS_SECTION_TITLE,
  timedActualsAcceptance,
  timedActualsSnapshot,
} from '../../src/test/timed-actuals-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-015 (REQ-015; C37; R62, R69, R116; AC-C37-01, AC-R015-01, AC-R015-02;
 * JOURNEY-015) — truthful per-movement partial and actual-load entry on the
 * real `/workout` route.
 *
 * Entry: a running session, behind the existing auth guard, whose first
 * section holds a three-movement AMRAP, a single-pass For Time and a four-rung
 * ladder, whose second holds a three-round For Time, and whose third is a
 * cooldown (`src/test/timed-actuals-fixture.ts`). Action: end an attempt
 * Incomplete with some rounds or rungs completed, enter each movement's
 * completed amount for the round the partial belongs to and the actual load
 * used, by touch or by keyboard, save, reopen and edit. Result, read from the
 * browser at phone widths: the fields name the right round and movement, in
 * the movement's own unit and the athlete's load unit; blank stays unrecorded
 * and a typed zero is a zero; nothing is filled from the plan; a reload, a
 * refused save and its retry keep every entry; the saved rows carry each
 * round, amount, unit and load; saved fields read back and are no longer
 * offered.
 *
 * Synthetic and contained: an intercepted session for a fictional user. The
 * browser clock is Playwright's. The writes allowed are exactly the ones the
 * shell's one completion path makes — the `block_results` insert, its
 * correction on the unique key and the `block_movement_results` rows —
 * recorded here as the requests the app sent and answered as PostgREST
 * would (a second insert of the same block or movement is a 23505), never
 * forwarded; the one History read answers those rows back. This is the app's
 * own write and read contract on a synthetic origin, not backend persistence
 * proof (TASK-047 owns the real lane).
 */
const OWNER = '00000000-0000-4000-8000-000000001501'
const PLACE = '00000000-0000-4000-8000-000000001511'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The browser's clock at entry; the session has run for one minute. */
const ENTRY = Date.parse('2026-11-10T09:00:00.000Z')

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
    if (code !== null) throw new Error(`Synthetic TASK-015 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-015 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-015.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-015-public-placeholder',
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

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app: PostgREST as the shell's one completion path meets it
// ─────────────────────────────────────────────────────────────────────────────

type Skin = 'clear' | 'signal'
type Row = Record<string, unknown>
interface Sent { method: string; table: string; filter: string | null; body: Row | null }

const UNIQUE_VIOLATION = { code: '23505', message: 'duplicate key value violates unique constraint', details: null }

async function syntheticApp(page: Page, options: { skin?: Skin; reducedMotion?: boolean; refuseFirstMovementWrite?: boolean } = {}) {
  const running: SessionSnapshot = sessionSnapshotSchema.parse(timedActualsSnapshot(timedActualsAcceptance({ locationId: PLACE }), {
    userId: OWNER,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  }))
  /** Every write the app sent, in order, exactly as sent. */
  const sent: Sent[] = []
  /** The stored rows, by `block_id` and by `workout_exercise_id` — the two unique keys. */
  const blockRows = new Map<string, Row>()
  const movementRows = new Map<string, Row>()
  const unexpected: string[] = []
  let refusals = options.refuseFirstMovementWrite ? 1 : 0
  let minted = 0
  const mint = () => `00000000-0000-4000-8000-${String(1500 + (minted += 1)).padStart(12, '0')}`
  const guard = await installDeterministicCapture(page, { skin: options.skin ?? 'clear', reducedMotion: options.reducedMotion ?? false })
  await page.clock.install({ time: ENTRY })

  const filterOf = (url: URL, column: string): string | null => {
    const value = url.searchParams.get(column)
    return value === null ? null : value.replace(/^eq\./, '')
  }

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
      // Every other read is an empty answer: no history, notes, anchors or favorites.
      return reply([])
    }
    const body = request.postData() === null ? null : (request.postDataJSON() as Row | Row[])
    const row = Array.isArray(body) ? body[0] : body

    if (url.pathname.endsWith('/rest/v1/block_results')) {
      if (request.method() === 'POST') {
        sent.push({ method: 'POST', table: 'block_results', filter: null, body: row })
        const blockId = String(row?.block_id)
        // The unique index on block_id: a second insert is a 23505, as PostgREST answers it.
        if (blockRows.has(blockId)) return reply(UNIQUE_VIOLATION, 409)
        const answered = { id: mint(), created_at: '2026-11-10T09:10:00.000Z', effort: null, ...row }
        blockRows.set(blockId, answered)
        return reply([answered], 201)
      }
      if (request.method() === 'PATCH') {
        const blockId = filterOf(url, 'block_id')
        sent.push({ method: 'PATCH', table: 'block_results', filter: blockId, body: row })
        const stored = blockId === null ? undefined : blockRows.get(blockId)
        if (stored === undefined) return reply([], 200)
        const corrected = { ...stored, ...row }
        blockRows.set(blockId!, corrected)
        return reply([corrected], 200)
      }
    }
    if (url.pathname.endsWith('/rest/v1/block_movement_results')) {
      const exerciseId = request.method() === 'POST' ? String(row?.workout_exercise_id) : filterOf(url, 'workout_exercise_id')
      sent.push({ method: request.method(), table: 'block_movement_results', filter: request.method() === 'POST' ? null : exerciseId, body: row })
      if (request.method() === 'POST') {
        if (refusals > 0) {
          refusals -= 1
          return reply({ code: 'PGRST000', message: 'Controlled TASK-015 movement-write boundary unavailable.' }, 503)
        }
        if (movementRows.has(exerciseId!)) return reply(UNIQUE_VIOLATION, 409)
        const answered = { prescription_revision_status: 'active', created_at: '2026-11-10T09:10:00.000Z', updated_at: '2026-11-10T09:10:00.000Z', ...row }
        movementRows.set(exerciseId!, answered)
        return reply([answered], 201)
      }
      if (request.method() === 'PATCH') {
        const stored = exerciseId === null ? undefined : movementRows.get(exerciseId)
        if (stored === undefined) return reply([], 200)
        const restated = { ...stored, ...row, updated_at: '2026-11-10T09:11:00.000Z' }
        movementRows.set(exerciseId!, restated)
        return reply([restated], 200)
      }
      if (request.method() === 'DELETE') {
        if (exerciseId !== null) movementRows.delete(exerciseId)
        return route.fulfill({ status: 204, headers: CORS })
      }
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') {
        // History and the shell's performed read get the rows this origin was
        // sent — the block's result and each movement's actual — and nothing else.
        return reply({
          reconstruction: 'performed',
          as_of: running.session.started_at,
          session: running.session,
          state: running.state,
          sections: running.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => ({
              ...block,
              block_result: blockRows.get(block.block.id) ?? null,
              exercises: block.exercises.map((entry) => ({ ...entry, movement_result: movementRows.get(entry.exercise.id) ?? null })),
            })),
          })),
        })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    // Anything else is a write this journey must never make.
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-015 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-015-session', refreshToken: 'synthetic-task-015-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-015@example.invalid' },
    }))
  }, { owner: OWNER })

  const [amrap, forTime, ladder] = running.sections[0].blocks
  const exerciseIds = (block: typeof amrap) => block.exercises.map((entry) => entry.exercise.id)
  return {
    sessionId: running.session.id,
    amrapBlockId: amrap.block.id,
    forTimeBlockId: forTime.block.id,
    ladderBlockId: ladder.block.id,
    amrapExercises: exerciseIds(amrap),
    forTimeExercises: exerciseIds(forTime),
    sent,
    blockRow: (blockId: string) => blockRows.get(blockId) ?? null,
    movementRow: (exerciseId: string) => movementRows.get(exerciseId) ?? null,
    movementRowCount: () => movementRows.size,
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
  })
}

/** JOURNEY-015's entry: the running session's `/workout`, the three timed blocks ready. */
async function openWorkout(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByRole('list', { name: ACTUALS_AMRAP_WORK_LIST, exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: ACTUALS_FOR_TIME_WORK_LIST, exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: ACTUALS_LADDER_WORK_LIST, exact: true })).toBeVisible()
  await settle(page)
}

/** Time passes on the browser's own clock, and its interval repaints run. */
async function pass(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1000)
}

function cardOf(scope: Page | Locator, list: string): Locator {
  const page = 'page' in scope ? scope.page() : scope
  return scope.locator('[data-workout-card="workout"]').filter({
    has: page.getByRole('list', { name: list, exact: true }),
  })
}

/** The block's log: its card's one form, headed "Log results" (deliberately not a landmark). */
function logOf(card: Locator): Locator {
  return card.locator('form.clr-timed-log').filter({ has: card.page().getByRole('heading', { name: 'Log results', exact: true }) })
}

function completionOf(card: Locator): Locator {
  return card.getByRole('group', { name: 'Work completed', exact: true })
}

/** One movement's group in a log, by its name. */
function movementOf(log: Locator, name: string): Locator {
  return log.locator('[data-timed-movement]').filter({ has: log.page().getByRole('heading', { name, exact: true }) })
}

const amountOf = (log: Locator, name: string) => log.getByRole('spinbutton', { name: new RegExp(`^(?:Round \\d+|Completed) · ${name}$`) })
const weightOf = (log: Locator, name: string) => log.getByRole('spinbutton', { name: `Weight · ${name}`, exact: true })

/** The words of a question's checked answers — none, or one. */
async function chosen(group: Locator): Promise<string[]> {
  return group.getByRole('radio').evaluateAll((radios) =>
    radios.filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.textContent ?? ''))
}

/** Every movement group a log draws: its name, its fields' visible labels and their units. */
async function movementGroups(log: Locator) {
  return log.locator('[data-timed-movement]').evaluateAll((groups) =>
    groups.map((group) => ({
      name: group.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? '',
      fields: [...group.querySelectorAll('label')].map((label) => label.textContent ?? ''),
      units: [...group.querySelectorAll('.clr-field__unit')].map((unit) => unit.textContent ?? ''),
    })))
}

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number }

interface MovementGeometry {
  name: string
  title: Box
  titleFace: { transform: string; family: string }
  fields: { label: Box; frame: Box; unit: Box | null; clipped: boolean }[]
}

interface EntryGeometry {
  formContent: { left: number; right: number }
  resultBottom: number
  effortTop: number | null
  movements: MovementGeometry[]
}

/** The log's movement groups, read from the browser. */
async function readEntryGeometry(log: Locator): Promise<EntryGeometry> {
  return log.first().evaluate((form) => {
    const box = (node: Element): Box => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
    }
    const formStyle = getComputedStyle(form)
    const groups = [...form.querySelectorAll<HTMLElement>('.clr-timed-log__group')]
    const movements = [...form.querySelectorAll<HTMLElement>('[data-timed-movement]')]
    const result = groups.find((group) => !group.hasAttribute('data-timed-movement'))!
    const effort = [...form.querySelectorAll('fieldset')].find((node) => node.querySelector('legend')?.textContent === 'Effort · optional')
    return {
      formContent: {
        left: form.getBoundingClientRect().left + parseFloat(formStyle.paddingLeft),
        right: form.getBoundingClientRect().right - parseFloat(formStyle.paddingRight),
      },
      resultBottom: box(result).bottom,
      effortTop: effort === undefined ? null : box(effort).top,
      movements: movements.map((group) => {
        const title = group.querySelector('h1, h2, h3, h4, h5, h6')!
        const titleStyle = getComputedStyle(title)
        return {
          name: title.textContent ?? '',
          title: box(title),
          titleFace: { transform: titleStyle.textTransform, family: titleStyle.fontFamily },
          fields: [...group.querySelectorAll<HTMLElement>('label')].map((label) => {
            const field = label.parentElement!
            const frame = field.querySelector('.clr-field')!
            const unit = field.querySelector('.clr-field__unit')
            const input = field.querySelector('input')!
            return { label: box(label), frame: box(frame), unit: unit === null ? null : box(unit), clipped: input.scrollWidth > input.clientWidth + 1 }
          }),
        }
      }),
    }
  })
}

const TOLERANCE = 1

/** C37 read from the browser: each movement's titled group, its fields the log's full width, between the result and the effort. */
function expectEntryContract(geometry: EntryGeometry, label: string) {
  expect(geometry.movements.length, `${label}: at least one movement group`).toBeGreaterThan(0)
  let previous = geometry.resultBottom
  for (const movement of geometry.movements) {
    expect(movement.title.top, `${label}: ${movement.name} after the result`).toBeGreaterThanOrEqual(previous - TOLERANCE)
    expect(movement.titleFace.transform, `${label}: ${movement.name} title uppercase`).toBe('uppercase')
    expect(movement.title.left, `${label}: ${movement.name} title at the content edge`).toBeLessThanOrEqual(geometry.formContent.left + TOLERANCE)
    let above = movement.title.bottom
    for (const field of movement.fields) {
      expect(field.label.top, `${label}: ${movement.name} label below the title`).toBeGreaterThanOrEqual(above - TOLERANCE)
      expect(field.frame.top, `${label}: ${movement.name} frame below its label`).toBeGreaterThanOrEqual(field.label.bottom - TOLERANCE)
      expect(field.frame.left, `${label}: ${movement.name} frame from the log's start`).toBeLessThanOrEqual(geometry.formContent.left + TOLERANCE)
      expect(field.frame.right, `${label}: ${movement.name} frame to the log's end`).toBeGreaterThanOrEqual(geometry.formContent.right - TOLERANCE)
      expect(field.clipped, `${label}: ${movement.name} value unclipped`).toBe(false)
      if (field.unit !== null) {
        expect(field.unit.right, `${label}: ${movement.name} unit inside its frame`).toBeLessThanOrEqual(field.frame.right + TOLERANCE)
        expect(field.unit.left, `${label}: ${movement.name} unit inside its frame`).toBeGreaterThanOrEqual(field.frame.left - TOLERANCE)
      }
      above = field.frame.bottom
    }
    previous = above
  }
  if (geometry.effortTop !== null) {
    expect(geometry.effortTop, `${label}: the effort after the movements`).toBeGreaterThanOrEqual(previous - TOLERANCE)
  }
}

/** axe over the journey's screen after an interaction: every rule, every node. */
async function checkJourneyA11y(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  if (results.violations.length > 0) {
    await test.info().attach('axe-violations.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  }
  expect(results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target.join(' ')) }))).toEqual([])
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

/** Delivered-revision evidence of one card, read in one taller viewport at the same width. */
async function attachCard(page: Page, card: Locator, name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 2600 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await settle(page)
    await test.info().attach(`${name}.png`, { body: await card.screenshot({ caret: 'hide' }), contentType: 'image/png' })
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

/** A saved block row's result columns, as the app sent them. */
function resultColumns(body: Row) {
  const { block_id, elapsed_seconds, completed_under_cap, rounds_completed, partial_round_reps, minutes_completed, highest_rung, perceived_effort, notes, effort } = body
  return { block_id, elapsed_seconds, completed_under_cap, rounds_completed, partial_round_reps, minutes_completed, highest_rung, perceived_effort, notes, effort }
}

/** A movement row's actual columns, as stored. */
function movementColumns(body: Row | null) {
  if (body === null) return null
  const { workout_exercise_id, round_number, actual_reps, actual_duration_seconds, actual_distance, actual_distance_unit, weight, weight_unit } = body
  return { workout_exercise_id, round_number, actual_reps, actual_duration_seconds, actual_distance, actual_distance_unit, weight, weight_unit }
}

const storedRace = (page: Page, blockId: string) =>
  page.evaluate((id) => JSON.parse(localStorage.getItem('clear.workout-for-time') ?? '{}')[id] ?? null, blockId)
const storedAmrap = (page: Page, blockId: string) =>
  page.evaluate((id) => JSON.parse(localStorage.getItem('clear.workout-amraps') ?? '{}')[id] ?? null, blockId)

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-015 truthful per-movement partial and actual-load entry', () => {
  test('JOURNEY-015 touch phone-390 Signal: a single-pass For Time stopped Incomplete takes each movement’s completed amount in its own unit and the actual load; a reload keeps them; a refused movement write keeps every entry and the existing dialog; the retry restates the row and writes the movement rows once; saved fields read back and are no longer offered; History reads the row', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { skin: 'signal', refuseFirstMovementWrite: true })
    await openWorkout(page, visit)
    const card = cardOf(page, ACTUALS_FOR_TIME_WORK_LIST)
    const [wallBall, plank] = app.forTimeExercises

    // Ready and running ask for nothing; the race stops under the cap.
    await expect(logOf(card)).toHaveCount(0)
    await card.getByRole('button', { name: 'Start For Time', exact: true }).tap()
    await pass(page, 90)
    await card.getByRole('button', { name: 'Finish', exact: true }).tap()
    const log = logOf(card)
    await expect(log).toBeVisible()
    await settle(page)

    // Complete: the work is done, so no partial; the loaded wall ball's load alone.
    expect(await chosen(completionOf(card))).toEqual(['Complete'])
    expect(await movementGroups(log)).toEqual([{ name: 'wall ball', fields: ['Weight used'], units: ['kg'] }])

    // Incomplete: round 1 of the single pass — each movement's completed
    // amount in its own unit, and the load; every field blank, nothing from
    // the plan's 40 reps, 60 s or 9 kg.
    await completionOf(card).getByRole('radio', { name: 'Incomplete', exact: true }).tap()
    await expect(amountOf(log, 'wall ball')).toBeVisible()
    expect(await movementGroups(log)).toEqual([
      { name: 'wall ball', fields: ['Completed', 'Weight used'], units: ['reps', 'kg'] },
      { name: 'plank', fields: ['Completed'], units: ['sec'] },
    ])
    await expect(amountOf(log, 'wall ball')).toHaveValue('')
    await expect(weightOf(log, 'wall ball')).toHaveValue('')
    await expect(amountOf(log, 'plank')).toHaveValue('')
    await expect(log).not.toContainText(`${ACTUALS_PLANNED_LOADS.wallBall} kg`)
    await settle(page)
    expectEntryContract(await readEntryGeometry(log), 'For Time Incomplete, blank @phone-390')
    await attachCard(page, card, 'for-time-incomplete-blank-signal-phone-390')

    // Typed as typed, and stored on the race's own record on every keystroke.
    await amountOf(log, 'wall ball').tap()
    await amountOf(log, 'wall ball').fill('28')
    await weightOf(log, 'wall ball').fill('8')
    await amountOf(log, 'plank').fill('45')
    await expect.poll(() => storedRace(page, app.forTimeBlockId)).toMatchObject({
      workCompleted: false,
      movements: { [wallBall]: { amount: '28', weight: '8' }, [plank]: { amount: '45', weight: '' } },
    })
    // A value the row would refuse is refused in the field, by the same rule.
    await weightOf(log, 'wall ball').fill('-1')
    await expect(weightOf(log, 'wall ball')).toHaveAttribute('aria-invalid', 'true')
    await expect(movementOf(log, 'wall ball')).toContainText('Enter a weight of zero or more')
    await weightOf(log, 'wall ball').fill('8')
    await expect(weightOf(log, 'wall ball')).not.toHaveAttribute('aria-invalid', 'true')
    await card.getByRole('group', { name: 'Effort · optional', exact: true }).getByRole('radio', { name: 'Too hard', exact: true }).tap()
    await settle(page)
    expectEntryContract(await readEntryGeometry(log), 'For Time Incomplete, entered @phone-390')
    await noHorizontalOverflow(page)
    await attachCard(page, card, 'for-time-incomplete-entered-signal-phone-390')
    await checkJourneyA11y(page)

    // Close and reopen: the entries come back as typed; the effort, a draft
    // held only while the block is open, comes back unanswered.
    await page.reload()
    await expect(page.getByRole('list', { name: ACTUALS_FOR_TIME_WORK_LIST, exact: true })).toBeVisible()
    await settle(page)
    expect(await chosen(completionOf(card))).toEqual(['Incomplete'])
    await expect(amountOf(log, 'wall ball')).toHaveValue('28')
    await expect(weightOf(log, 'wall ball')).toHaveValue('8')
    await expect(amountOf(log, 'plank')).toHaveValue('45')
    await card.getByRole('group', { name: 'Effort · optional', exact: true }).getByRole('radio', { name: 'Too hard', exact: true }).tap()
    // The unit the load is stated in, as the field shows it: the profile's.
    const unit = (await movementOf(log, 'wall ball').locator('.clr-field__unit').last().textContent()) ?? ''
    expect(unit).toMatch(/^(kg|lb)$/)

    // The forward action: the For Time's row lands and its first movement
    // write is refused. The athlete stays, with every entry and the dialog.
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('That didn’t save')
    await expect(amountOf(log, 'wall ball')).toHaveValue('28')
    await expect(weightOf(log, 'wall ball')).toHaveValue('8')
    await expect(amountOf(log, 'plank')).toHaveValue('45')
    await expect(amountOf(log, 'wall ball')).toBeEnabled()
    expect(app.blockRow(app.forTimeBlockId)).not.toBeNull()
    expect(app.movementRowCount()).toBe(0)
    await dialog.getByRole('button', { name: 'Try again', exact: true }).tap()
    await expect(page.getByRole('heading', { name: ACTUALS_RACE_SECTION_TITLE, exact: true })).toBeVisible()

    // What was sent: the For Time's insert, then its 23505 retry corrected in
    // place (the category as `effort`, the numeric effort null), then each
    // movement row once — the refused write, then the two that landed.
    const forTimeWrites = app.sent.filter((write) => write.table === 'block_results' && (write.body?.block_id === app.forTimeBlockId || write.filter === app.forTimeBlockId))
    expect(forTimeWrites.map((write) => write.method)).toEqual(['POST', 'POST', 'PATCH'])
    expect(resultColumns(app.blockRow(app.forTimeBlockId)!)).toEqual({
      block_id: app.forTimeBlockId, elapsed_seconds: 90, completed_under_cap: false, rounds_completed: null, partial_round_reps: null,
      minutes_completed: null, highest_rung: null, perceived_effort: null, notes: null, effort: 'too_hard',
    })
    const movementWrites = app.sent.filter((write) => write.table === 'block_movement_results')
    expect(movementWrites.map((write) => write.method)).toEqual(['POST', 'POST', 'POST'])
    expect(movementWrites.map((write) => write.body?.workout_exercise_id)).toEqual([wallBall, wallBall, plank])
    expect(movementColumns(app.movementRow(wallBall))).toEqual({
      workout_exercise_id: wallBall, round_number: 1, actual_reps: 28, actual_duration_seconds: null, actual_distance: null, actual_distance_unit: null, weight: 8, weight_unit: unit,
    })
    expect(movementColumns(app.movementRow(plank))).toEqual({
      workout_exercise_id: plank, round_number: 1, actual_reps: null, actual_duration_seconds: 45, actual_distance: null, actual_distance_unit: null, weight: null, weight_unit: unit,
    })
    expect(app.movementRowCount()).toBe(2)
    // The AMRAP and the ladder, never started: the bare insert each, nothing richer.
    for (const blockId of [app.amrapBlockId, app.ladderBlockId]) {
      expect(app.sent.filter((write) => write.table === 'block_results' && write.body?.block_id === blockId).map((write) => write.method)).toEqual(['POST'])
      expect(Object.keys(app.blockRow(blockId)!)).not.toContain('round_number')
    }
    for (const write of app.sent) expect(JSON.stringify(write.body)).not.toMatch(/"perceived_effort":\d/)

    // Back to the saved section: the entries read back and are no longer offered.
    await page.getByRole('button', { name: 'Previous', exact: true }).tap()
    await expect(page.getByRole('heading', { name: ACTUALS_SECTION_TITLE, exact: true })).toBeVisible()
    await expect(amountOf(log, 'wall ball')).toHaveValue('28')
    await expect(amountOf(log, 'wall ball')).toBeDisabled()
    await expect(weightOf(log, 'wall ball')).toHaveValue('8')
    await expect(weightOf(log, 'wall ball')).toBeDisabled()
    await expect(amountOf(log, 'plank')).toHaveValue('45')
    await expect(amountOf(log, 'plank')).toBeDisabled()
    await expect(card.getByText('Block saved', { exact: true })).toBeVisible()
    await attachCard(page, card, 'for-time-saved-readback-signal-phone-390')

    // History reads the row back: stopped before its cap, as Incomplete.
    await visit(`/history/${app.sessionId}`)
    await expect(page.getByText('Cap', { exact: true }).locator('xpath=..')).toHaveText('CapIncomplete')
    await expect(page.getByText('Elapsed', { exact: true }).locator('xpath=..')).toHaveText('Elapsed01:30')
    app.assertContained()
  })

  test('JOURNEY-015 keyboard phone-320 reduced motion: the AMRAP’s partial fields appear only once a rounds count is recorded and name the round after it, a load only on the loaded movement, filled by keyboard beside the kept Reps into the next round, and the saved rows carry each round, amount, unit and load with no row for a blank movement', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, { skin: 'clear', reducedMotion: true })
    await openWorkout(page, visit)
    const card = cardOf(page, ACTUALS_AMRAP_WORK_LIST)
    const [swing, burpee, row] = app.amrapExercises

    const start = card.getByRole('button', { name: 'Start AMRAP', exact: true })
    await start.focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await pass(page, 120)
    await card.getByRole('button', { name: 'Finish early', exact: true }).focus()
    await page.keyboard.press('Enter')
    const log = logOf(card)
    await expect(log).toBeVisible()
    await settle(page)

    // Nothing counted: no round to attach a partial to, so no amount field;
    // the loaded swing's load alone.
    expect(await movementGroups(log)).toEqual([{ name: 'kettlebell swing', fields: ['Weight used'], units: ['kg'] }])
    await expect(log.getByRole('spinbutton', { name: /^Round \d+ · / })).toHaveCount(0)

    // Two rounds by keyboard: each movement's round-3 amount in its own unit —
    // reps, reps, metres — and still one load field; the partial reps count
    // beside them.
    const plusRounds = card.getByRole('button', { name: 'Increase rounds completed', exact: true })
    await plusRounds.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(amountOf(log, 'kettlebell swing')).toBeVisible()
    expect(await movementGroups(log)).toEqual([
      { name: 'kettlebell swing', fields: ['Completed in round 3', 'Weight used'], units: ['reps', 'kg'] },
      { name: 'burpee', fields: ['Completed in round 3'], units: ['reps'] },
      { name: 'row', fields: ['Completed in round 3'], units: ['m'] },
    ])
    const plusReps = card.getByRole('button', { name: 'Increase reps into the next round', exact: true })
    await plusReps.focus()
    for (let reps = 0; reps < 5; reps += 1) await page.keyboard.press('Enter')
    await expect(card.getByRole('status', { name: 'Reps into the next round', exact: true })).toHaveText('5')

    // Keyboard through the fields: the swing's amount, Tab to its load, Tab to
    // the burpee's amount; the row left blank; nothing filled from the plan.
    await amountOf(log, 'kettlebell swing').focus()
    await expect(amountOf(log, 'kettlebell swing')).toBeFocused()
    await page.keyboard.type('7')
    await page.keyboard.press('Tab')
    await expect(weightOf(log, 'kettlebell swing')).toBeFocused()
    await page.keyboard.type('20')
    await page.keyboard.press('Tab')
    await expect(amountOf(log, 'burpee')).toBeFocused()
    await page.keyboard.type('0')
    await page.keyboard.press('Tab')
    await expect(amountOf(log, 'row')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(amountOf(log, 'burpee')).toBeFocused()
    await expect(amountOf(log, 'row')).toHaveValue('')
    await expect.poll(() => storedAmrap(page, app.amrapBlockId)).toMatchObject({
      roundsCompleted: 2, partialRoundReps: 5,
      movements: { [swing]: { amount: '7', weight: '20' }, [burpee]: { amount: '0', weight: '' } },
    })

    // Reduced motion: nothing in the log moves or loops beyond the app's hard cut.
    const timings = await log.evaluate((form) => form.getAnimations({ subtree: true }).map((animation) => {
      const timing = animation.effect!.getComputedTiming()
      return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
    }))
    for (const timing of timings) {
      expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
      expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
    }
    await settle(page)
    expectEntryContract(await readEntryGeometry(log), 'AMRAP round 3 entries @phone-320')
    await noHorizontalOverflow(page)
    await attachCard(page, card, 'amrap-round-3-entries-keyboard-reduced-phone-320')
    await checkJourneyA11y(page)

    // A count corrected by keyboard moves the round: every amount clears —
    // the burpee's zero included, never carried to round 2 — and the load stays.
    await card.getByRole('button', { name: 'Decrease rounds completed', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(log.getByText('Completed in round 2', { exact: true })).toHaveCount(3)
    await expect(amountOf(log, 'kettlebell swing')).toHaveValue('')
    await expect(amountOf(log, 'burpee')).toHaveValue('')
    await expect(weightOf(log, 'kettlebell swing')).toHaveValue('20')
    await amountOf(log, 'kettlebell swing').focus()
    await page.keyboard.type('9')
    await amountOf(log, 'burpee').focus()
    await page.keyboard.type('0')
    await expect.poll(() => storedAmrap(page, app.amrapBlockId)).toMatchObject({
      roundsCompleted: 1,
      movements: { [swing]: { amount: '9', weight: '20' }, [burpee]: { amount: '0', weight: '' } },
    })
    const unit = (await movementOf(log, 'kettlebell swing').locator('.clr-field__unit').last().textContent()) ?? ''
    expect(unit).toMatch(/^(kg|lb)$/)

    // Saved by keyboard: the AMRAP's row with its counts as corrected (one
    // round, five reps into the next), then one movement row per entered
    // movement — the swing's round-2 reps and load, the burpee's explicit
    // zero — and none for the blank row.
    const next = page.getByRole('button', { name: 'Next section', exact: true })
    await next.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: ACTUALS_RACE_SECTION_TITLE, exact: true })).toBeVisible()
    expect(resultColumns(app.blockRow(app.amrapBlockId)!)).toMatchObject({ block_id: app.amrapBlockId, elapsed_seconds: 120, rounds_completed: 1, partial_round_reps: 5, perceived_effort: null, effort: null })
    expect(app.sent.filter((write) => write.table === 'block_results').map((write) => write.method)).toEqual(['POST', 'POST', 'POST'])
    expect(app.sent.filter((write) => write.table === 'block_movement_results').map((write) => [write.method, write.body?.workout_exercise_id])).toEqual([['POST', swing], ['POST', burpee]])
    expect(movementColumns(app.movementRow(swing))).toEqual({
      workout_exercise_id: swing, round_number: 2, actual_reps: 9, actual_duration_seconds: null, actual_distance: null, actual_distance_unit: null, weight: 20, weight_unit: unit,
    })
    expect(movementColumns(app.movementRow(burpee))).toEqual({
      workout_exercise_id: burpee, round_number: 2, actual_reps: 0, actual_duration_seconds: null, actual_distance: null, actual_distance_unit: null, weight: null, weight_unit: unit,
    })
    expect(app.movementRow(row)).toBeNull()
    expect(app.movementRowCount()).toBe(2)

    // The three-round race in the next section: loads only, no partial round
    // and no rounds count (owner decision); its load reaches a load-only row.
    const race = cardOf(page, ACTUALS_FOR_TIME_WORK_LIST)
    await race.getByRole('button', { name: 'Start For Time', exact: true }).focus()
    await page.keyboard.press('Enter')
    await pass(page, 200)
    await race.getByRole('button', { name: 'Finish', exact: true }).focus()
    await page.keyboard.press('Enter')
    const raceLog = logOf(race)
    await completionOf(race).getByRole('radio', { name: 'Incomplete', exact: true }).focus()
    await page.keyboard.press('Space')
    expect(await movementGroups(raceLog)).toEqual([{ name: 'thruster', fields: ['Weight used'], units: ['kg'] }])
    await expect(raceLog.getByRole('group', { name: 'Rounds completed', exact: true })).toHaveCount(0)
    await weightOf(raceLog, 'thruster').focus()
    await page.keyboard.type('35')
    await next.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: ACTUALS_COOLDOWN_TITLE, exact: true })).toBeVisible()
    const thrusterRow = [...app.sent].reverse().find((write) => write.table === 'block_movement_results')?.body
    expect(movementColumns(thrusterRow ?? null)).toMatchObject({ round_number: null, actual_reps: null, weight: 35 })
    expect(app.movementRowCount()).toBe(3)
    app.assertContained()
  })

  test('JOURNEY-015 gallery amrap, for_time and ladder phone-390: the route’s own per-movement fields over memory only — the seeded entries read back unlike the plan, loads only where they apply, the ladder’s round-3 fields once round 2 is stated and bounded by its target — with nothing stored and no network', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await installDeterministicCapture(page, { skin: 'signal', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })

    // AMRAP: finished early with 3 rounds — round-4 amounts, the swing's
    // seeded 7 reps and 20 kg (not its prescribed 12 and 24); the cap with
    // nothing counted — the load field alone.
    await visit('/gallery/refinements?state=amrap')
    const amrapRoot = page.locator('[data-refinement-state="amrap"]')
    await expect(amrapRoot.getByRole('heading', { name: 'AMRAP results', exact: true })).toBeVisible()
    const early = cardOf(amrapRoot.locator('[data-gallery-amrap="early"]'), ACTUALS_AMRAP_WORK_LIST)
    const earlyLog = logOf(early)
    await expect(earlyLog).toBeVisible()
    await settle(page)
    expect(await movementGroups(earlyLog)).toEqual([{ name: 'kb swing', fields: ['Completed in round 4', 'Weight used'], units: ['reps', 'kg'] }])
    await expect(amountOf(earlyLog, 'kb swing')).toHaveValue('7')
    await expect(weightOf(earlyLog, 'kb swing')).toHaveValue('20')
    await expect(early.getByRole('status', { name: 'Reps into the next round', exact: true })).toHaveText('0')
    expectEntryContract(await readEntryGeometry(earlyLog), 'gallery amrap early')
    const capped = cardOf(amrapRoot.locator('[data-gallery-amrap="cap"]'), ACTUALS_AMRAP_WORK_LIST)
    expect(await movementGroups(logOf(capped))).toEqual([{ name: 'kb swing', fields: ['Weight used'], units: ['kg'] }])
    await test.info().attach('gallery-amrap-entries-signal-phone-390.png', { body: await amrapRoot.locator('[data-gallery-amrap="early"]').screenshot({ caret: 'hide' }), contentType: 'image/png' })
    // Live over memory: a count moves the round and clears the amount, keeping the load.
    await early.getByRole('button', { name: 'Increase rounds completed', exact: true }).tap()
    await expect(earlyLog.getByText('Completed in round 5', { exact: true })).toBeVisible()
    await expect(amountOf(earlyLog, 'kb swing')).toHaveValue('')
    await expect(weightOf(earlyLog, 'kb swing')).toHaveValue('20')
    await noHorizontalOverflow(page)
    await checkJourneyA11y(page)

    // For Time: the cap (Incomplete) — the wall ball's seeded round-1 28 reps
    // and 8 kg (not 40 and 9), the burpee blank; the finish (Complete) — the
    // wall ball's load alone, blank.
    await visit('/gallery/refinements?state=for_time')
    const forTimeRoot = page.locator('[data-refinement-state="for_time"]')
    await expect(forTimeRoot.getByRole('heading', { name: 'For Time results', exact: true })).toBeVisible()
    const capRace = cardOf(forTimeRoot.locator('[data-gallery-race="for-time-cap"]'), ACTUALS_FOR_TIME_WORK_LIST)
    const capLog = logOf(capRace)
    await expect(capLog).toBeVisible()
    await settle(page)
    expect(await movementGroups(capLog)).toEqual([
      { name: 'wall ball', fields: ['Completed', 'Weight used'], units: ['reps', 'kg'] },
      { name: 'burpee', fields: ['Completed'], units: ['reps'] },
    ])
    await expect(amountOf(capLog, 'wall ball')).toHaveValue('28')
    await expect(weightOf(capLog, 'wall ball')).toHaveValue('8')
    await expect(amountOf(capLog, 'burpee')).toHaveValue('')
    expectEntryContract(await readEntryGeometry(capLog), 'gallery for_time cap')
    const finishRace = cardOf(forTimeRoot.locator('[data-gallery-race="for-time-finish"]'), ACTUALS_FOR_TIME_WORK_LIST)
    expect(await movementGroups(logOf(finishRace))).toEqual([{ name: 'wall ball', fields: ['Weight used'], units: ['kg'] }])
    await expect(weightOf(logOf(finishRace), 'wall ball')).toHaveValue('')
    await test.info().attach('gallery-for-time-entries-signal-phone-390.png', { body: await forTimeRoot.locator('[data-gallery-race="for-time-cap"]').screenshot({ caret: 'hide' }), contentType: 'image/png' })
    await noHorizontalOverflow(page)
    await checkJourneyA11y(page)

    // Ladder: Incomplete with no rung stated and bodyweight work — nothing to
    // ask; stating round 2 asks each movement's round-3 amount, bounded by
    // that rung's target, blank; typing changes the gallery's copy only.
    await visit('/gallery/refinements?state=ladder')
    const ladderRoot = page.locator('[data-refinement-state="ladder"]')
    await expect(ladderRoot.getByRole('heading', { name: 'Ladder results', exact: true })).toBeVisible()
    const ladderFinish = cardOf(ladderRoot.locator('[data-gallery-race="ladder-finish"]'), ACTUALS_LADDER_WORK_LIST)
    const ladderLog = logOf(ladderFinish)
    await expect(ladderLog).toBeVisible()
    await settle(page)
    expect(await chosen(completionOf(ladderFinish))).toEqual(['Incomplete'])
    expect(await movementGroups(ladderLog)).toEqual([])
    await ladderLog.getByRole('group', { name: 'Rounds completed', exact: true }).getByRole('button', { name: /^Round 2: / }).tap()
    await expect(amountOf(ladderLog, 'push up')).toBeVisible()
    expect(await movementGroups(ladderLog)).toEqual([
      { name: 'push up', fields: ['Completed in round 3'], units: ['reps'] },
      { name: 'burpee', fields: ['Completed in round 3'], units: ['reps'] },
    ])
    await expect(amountOf(ladderLog, 'push up')).toHaveValue('')
    await expect(amountOf(ladderLog, 'push up')).toHaveAttribute('max', /^\d+$/)
    await amountOf(ladderLog, 'push up').fill('3')
    await expect(amountOf(ladderLog, 'push up')).toHaveValue('3')
    expectEntryContract(await readEntryGeometry(ladderLog), 'gallery ladder round 3')
    await test.info().attach('gallery-ladder-entries-signal-phone-390.png', { body: await ladderRoot.locator('[data-gallery-race="ladder-finish"]').screenshot({ caret: 'hide' }), contentType: 'image/png' })
    await noHorizontalOverflow(page)
    await checkJourneyA11y(page)

    expect(await page.evaluate(() => localStorage.getItem('clear.workout-amraps'))).toBeNull()
    expect(await page.evaluate(() => localStorage.getItem('clear.workout-for-time'))).toBeNull()
    expect(await page.evaluate(() => localStorage.getItem('clear.workout-ladders'))).toBeNull()
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
