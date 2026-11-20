import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import {
  COOLDOWN_SECTION_TITLE,
  EMOM_NOTES_LABEL,
  EMOM_WORK_LIST,
  RETIRED_CAPTIONS,
  emomEndLogAcceptance,
  emomEndLogSnapshot,
} from '../../src/test/emom-end-log-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-011 (REQ-011; C31, C32; R40, R43, R44, R84; JOURNEY-011) — the EMOM's
 * schedule context and its end log without a completion counter, on the real
 * `/workout` route.
 *
 * Entry: a running session, behind the existing auth guard, whose first
 * section holds the accepted two-movement EMOM (ten minutes, 15 seconds' rest
 * in each) and whose second is a cooldown (`src/test/emom-end-log-fixture.ts`).
 * Action: run the interval — Start, a minute boundary and its rest, Pause and
 * Resume — to its natural end, or end it early, and open its end log by touch
 * or by keyboard. Result, read from the browser at phone widths: the minute,
 * each movement's minutes and Now/Next stay clear without the NOT STARTED and
 * WORK captions; the end log has no minutes-completed counter or completion
 * question and takes an exception in its notes; the saved row holds the note
 * and no minutes tally or timing; History reads the note back; an early
 * finish keeps its actual stop and is never a completed schedule.
 *
 * Synthetic and contained: an intercepted session for a fictional user. The
 * browser clock is Playwright's, held at exact seconds around each reading.
 * The only writes allowed are the EMOM's own `block_results` insert on the
 * section's forward action — recorded here as the request the app sent,
 * answered as PostgREST would, never forwarded — and the one History read
 * answers that recorded row back. This is the app's own write and read
 * contract on a synthetic origin, not backend persistence proof
 * (`e2e/design-0143/workout-emom.spec.ts` is the backend lane).
 *
 * A3 TASK-117 (F3, #743) carries this spec onto Round 7's owners, the ones
 * `/workout` draws: `TimedWorkoutFlow` with its one "Log results"
 * `LoggingOverlay`, and `TimedResultLog`'s EMOM family inside it. Each case
 * keeps its name and its asserted behaviour, read from Round 7's words and
 * geometry (`evidence/refinement/task-117/test-ledger.json` says what each
 * read changed): the minute is the clock's caption (`Minute 3 of 10`, with
 * `· Rest` in the block's rest window), its state words are Round 7's
 * (`Paused`, `Finished early`, `Time complete`), each movement's minute is
 * `Min 3 · …`, Round 7 keeps the minute's movement marked Now through its
 * minute and marks the next minute's movement Next, the log opens by itself as
 * the schedule ends (and from the card's action after), the grouped coaching
 * disclosure is found by its accessible name, and the accepted gallery's EMOM
 * state is Round 7's one-movement EMOM, run past every minute by its own drive
 * (`?state=emom&open=1`) or finished early by its own controls.
 */
const OWNER = '00000000-0000-4000-8000-000000001101'
const PLACE = '00000000-0000-4000-8000-000000001111'
const ROW_ID = '00000000-0000-4000-8000-000000001121'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The browser's clock at entry; the session has run for one minute. */
const ENTRY = Date.parse('2026-11-09T09:00:00.000Z')
/** The EMOM's two movements, by their names on Round 7's rows: the minute rotation's order. */
const EMOM_MOVEMENTS = ['kb swing', 'burpee'] as const
/** The grouped coaching disclosure's accessible name (TASK-005: the visible words, then the block's format and movements). */
const EMOM_COACHING = /^Coaching and notes — EMOM: /
const EXCEPTION_NOTE = 'Dropped to 10 swings from minute 7.'
const EARLY_NOTE = 'Stopped in minute 3: shoulder.'

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
    if (code !== null) throw new Error(`Synthetic TASK-011 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-011 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-011.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-011-public-placeholder',
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
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

type Skin = 'clear' | 'signal'
type BlockResultBody = Record<string, unknown>

async function syntheticApp(page: Page, options: { skin?: Skin; reducedMotion?: boolean; failFirstSave?: boolean } = {}) {
  const running: SessionSnapshot = sessionSnapshotSchema.parse(emomEndLogSnapshot(emomEndLogAcceptance({ locationId: PLACE }), {
    userId: OWNER,
    startedAt: new Date(ENTRY - 60_000).toISOString(),
  }))
  const saves: BlockResultBody[] = []
  const stored = new Map<string, BlockResultBody>()
  const unexpected: string[] = []
  let refusals = options.failFirstSave ? 1 : 0
  const guard = await installDeterministicCapture(page, { skin: options.skin ?? 'clear', reducedMotion: options.reducedMotion ?? false })
  await page.clock.install({ time: ENTRY })

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
    if (request.method() === 'POST' && url.pathname.endsWith('/rest/v1/block_results')) {
      // The EMOM's own row, exactly as the app sent it. The first may be
      // refused, writing nothing, as a failed save would.
      const body = request.postDataJSON() as BlockResultBody | BlockResultBody[]
      const row = Array.isArray(body) ? body[0] : body
      saves.push(row)
      if (refusals > 0) {
        refusals -= 1
        return reply({ code: 'PGRST000', message: 'Controlled TASK-011 save boundary unavailable.' }, 503)
      }
      const answered = { id: ROW_ID, created_at: '2026-11-09T09:20:00.000Z', ...row }
      stored.set(String(row.block_id), answered)
      return reply([answered], 201)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') {
        // History reads back the rows this origin was sent — and nothing else.
        return reply({
          reconstruction: 'performed',
          as_of: running.session.started_at,
          session: running.session,
          state: running.state,
          sections: running.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => ({ ...block, block_result: stored.get(block.block.id) ?? null })),
          })),
        })
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history',
        'generation_refusal_diagnostics', 'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    // Anything else is a write this journey must never make.
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-011 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-011-session', refreshToken: 'synthetic-task-011-refresh',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-011@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    sessionId: running.session.id,
    emomBlockId: running.sections[0].blocks[0].block.id,
    saves,
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

/** JOURNEY-011's entry: the running session's `/workout`, the EMOM ready. */
async function openWorkout(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByRole('list', { name: EMOM_WORK_LIST, exact: true })).toBeVisible()
  await settle(page)
}

function pageOf(scope: Page | Locator): Page {
  return 'page' in scope ? scope.page() : scope
}

/** The EMOM's Round 7 flow — its clock, its card and its log dialog — as an inner locator any scope can filter by. */
function cardOf(scope: Page | Locator): Locator {
  return scope.locator('.clr-timed-flow').filter({
    has: pageOf(scope).getByRole('list', { name: EMOM_WORK_LIST, exact: true }),
  })
}

/** The EMOM's stack: its minute countdown beside its card. */
function stackOf(scope: Page | Locator): Locator {
  return cardOf(scope)
}

function timerOf(scope: Page | Locator): Locator {
  return cardOf(scope).getByRole('timer', { name: 'EMOM time', exact: true })
}

/**
 * TASK-046 (C45; R43, R100): the EMOM's card holds one "Log results" action
 * where its end log was — R43's real Log action — and the log, the same
 * form, opens in the shared focused dialog titled "Log results".
 */
function openerOf(scope: Page | Locator): Locator {
  return cardOf(scope).locator('.clr-timed-actions').getByRole('button', { name: 'Log results', exact: true })
}

/** The end log: the open focused dialog's one form (Round 7 draws the dialog inside the block's flow). */
function logOf(scope: Page | Locator): Locator {
  return cardOf(scope).locator('dialog.clr-logging-overlay[open] form.clr-timed-log')
}

/**
 * Round 7 opens the log by itself as the schedule ends; wait briefly for it,
 * so a later step does not race it. A log it does not open is opened from the
 * card's action instead.
 */
async function ownOpening(scope: Page | Locator) {
  try {
    await expect(logOf(scope)).toBeVisible({ timeout: 3_000 })
  } catch {
    // Not opened by itself: the next step opens it from the card's action.
  }
}

/** Opens the end log from the card's action (unless it is open) and returns it. */
async function openLog(scope: Page | Locator): Promise<Locator> {
  if ((await logOf(scope).count()) === 0) {
    await closeLog(pageOf(scope))
    await openerOf(scope).click()
  }
  await expect(logOf(scope)).toBeVisible()
  return logOf(scope)
}

/** Closes the open log with its framed X: the workout behind it is inert while it is open. */
async function closeLog(page: Page) {
  const open = page.locator('dialog.clr-logging-overlay[open]')
  if ((await open.count()) === 0) return
  await open.getByRole('button', { name: 'Close log', exact: true }).click()
  await expect(open).toHaveCount(0)
}

function notesOf(scope: Page | Locator): Locator {
  return logOf(scope).getByRole('textbox', { name: EMOM_NOTES_LABEL, exact: true })
}

/**
 * The minute and the clock's state, exactly as drawn: the timer frame's
 * caption (`Minute 3 of 10`, `Minute 3 of 10 · Rest`, `Paused`,
 * `Finished early`, `Time complete`). Empty before Start: Round 7 draws the
 * clock only once it runs, so nothing — no Not started — is said before then.
 */
async function scheduleLines(scope: Page | Locator): Promise<string[]> {
  return cardOf(scope).evaluate((flow) => {
    const timer = flow.querySelector('[role="timer"]')
    return timer === null ? [] : [timer.firstElementChild?.textContent ?? '']
  })
}

/** The movements a marker word sits on, by name. */
async function marked(scope: Page | Locator, word: 'Now' | 'Next'): Promise<string[]> {
  return cardOf(scope).evaluate((flow, { list, word }) => {
    const movements = [...flow.querySelectorAll('ol, ul')].find((node) => node.getAttribute('aria-label') === list)!
    return [...movements.children]
      .filter((item) => [...item.children].some((child) => child.tagName === 'P' && child.textContent === word))
      .map((item) => item.querySelector('.clr-movement-identity__name > span')?.textContent?.replace(/^\d+\s*/, '') ?? '')
  }, { list: EMOM_WORK_LIST, word })
}

async function expectNoRetiredCaption(scope: Page | Locator) {
  for (const caption of RETIRED_CAPTIONS) await expect(stackOf(scope).getByText(new RegExp(`^${caption}$`, 'i'))).toHaveCount(0)
  for (const line of await scheduleLines(scope)) expect(line).not.toMatch(/not started|\bwork\b/i)
}

/** C31: no tally, no completion question, no confirmation in the log. */
async function expectNoTally(scope: Page | Locator) {
  const log = logOf(scope)
  await expect(log.locator('output, .clr-quantity')).toHaveCount(0)
  // TASK-047 (REQ-031; R84: "optional effort, applicable movement weights and
  // notes") supersedes "no number field, no radiogroup, no button, no effort":
  // the only number fields are loaded movements' actual loads, the only
  // radiogroup the existing effort faces, the only buttons their compact
  // Clear and Round 7's own Save log (A3 TASK-103 bound it to the shell's one
  // completion path), and the only text field still the notes. Still no
  // counter, no completion question and no confirmation.
  for (const field of await log.getByRole('spinbutton').all()) await expect(field).toHaveAccessibleName(/^Weight · /)
  for (const role of ['slider', 'checkbox'] as const) await expect(log.getByRole(role)).toHaveCount(0)
  for (const group of await log.getByRole('radiogroup').all()) {
    expect(await group.getByRole('radio').allTextContents()).toEqual(['Too hard', 'About right', 'Too easy'])
  }
  for (const button of await log.getByRole('button').all()) await expect(button).toHaveAccessibleName(/^(Save log|Clear effort for this section)$/)
  await expect(log.getByRole('group', { name: 'Work completed', exact: true })).toHaveCount(0)
  await expect(log.getByText(/minutes?|completed|complete|tally|count|confirm/i)).toHaveCount(0)
  await expect(log.locator('textarea, select, input:not([type="number"]):not([type="radio"])')).toHaveCount(1)
}

/** The EMOM's stored grid, read from the browser. */
async function storedGrid(page: Page, blockId: string): Promise<Record<string, unknown> | undefined> {
  return page.evaluate((id) => JSON.parse(localStorage.getItem('clear.workout-emom') ?? '{}')[id], blockId)
}

/** The block's clock start, once Start has stored it. */
async function startedAt(page: Page, blockId: string): Promise<number> {
  const handle = await page.waitForFunction((id) => {
    const records = JSON.parse(localStorage.getItem('clear.workout-emom') ?? '{}') as Record<string, { startedAt: string | null } | undefined>
    const started = records[id]?.startedAt
    return started == null ? null : Date.parse(started)
  }, blockId)
  return handle.jsonValue() as Promise<number>
}

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number }

interface LogGeometry {
  workBottom: number
  /** TASK-046: the log's place on the card, its "Log results" action. */
  opener: Box
  /** TASK-046: the form is held by the shared focused dialog. */
  held: boolean
  form: Box
  formRuleWidth: number
  formContent: { left: number; right: number }
  title: Box
  field: Box
  label: Box
  coachingTop: number | null
}

/** The EMOM's card and end log, read from the browser. */
async function readLog(scope: Page | Locator): Promise<LogGeometry> {
  return cardOf(scope).evaluate((flow, { list }) => {
    const box = (node: Element): Box => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
    }
    const form = flow.querySelector('dialog.clr-logging-overlay[open] form.clr-timed-log')!
    const formStyle = getComputedStyle(form)
    const movements = [...flow.querySelectorAll('ol, ul')].find((node) => node.getAttribute('aria-label') === list)!
    const field = form.querySelector('textarea')!
    const label = form.querySelector(`label[for="${field.id}"]`)!
    const opener = [...flow.querySelectorAll('.clr-timed-actions')].find((row) => [...row.querySelectorAll('button')].some((button) => button.textContent === 'Log results'))!
    // The grouped coaching disclosure (TASK-005), found by its accessible words; a one-movement EMOM has its movement's own.
    const coaching = [...flow.querySelectorAll('button')].find((button) => /^Coaching and notes/.test(button.textContent ?? ''))
    return {
      workBottom: Math.max(...[...movements.querySelectorAll('.clr-movement-identity')].map((node) => node.getBoundingClientRect().bottom), movements.getBoundingClientRect().bottom),
      opener: box(opener),
      held: form.closest('dialog.clr-logging-overlay') !== null,
      form: box(form),
      formRuleWidth: parseFloat(formStyle.borderTopWidth),
      formContent: {
        left: form.getBoundingClientRect().left + parseFloat(formStyle.paddingLeft),
        right: form.getBoundingClientRect().right - parseFloat(formStyle.paddingRight),
      },
      title: box(form.closest('dialog')!.querySelector('.clr-logging-overlay__title')!),
      field: box(field),
      label: box(label),
      coachingTop: coaching === undefined ? null : coaching.getBoundingClientRect().top,
    }
  }, { list: EMOM_WORK_LIST })
}

const TOLERANCE = 1

/** The end log read from the browser: after the work, before coaching, one full-width field. */
function expectLogContract(geometry: LogGeometry, label: string) {
  // TASK-046: on the card, the log's place is its "Log results" action; the
  // log itself is held by the focused dialog, which sets it apart (so no
  // interior rule is drawn inside it, P01). Round 7 draws no rest line.
  expect(geometry.opener.top, `${label}: the log after the work`).toBeGreaterThanOrEqual(geometry.workBottom - TOLERANCE)
  if (geometry.coachingTop !== null) {
    expect(geometry.coachingTop, `${label}: coaching after the log`).toBeGreaterThanOrEqual(geometry.opener.bottom - TOLERANCE)
  }
  expect(geometry.held, `${label}: the log held by the focused dialog`).toBe(true)
  expect(geometry.formRuleWidth, `${label}: no interior rule in the dialog`).toBe(0)
  expect(geometry.label.top, `${label}: the title, then the field's label`).toBeGreaterThanOrEqual(geometry.title.bottom - TOLERANCE)
  expect(geometry.label.bottom, `${label}: the label above its field`).toBeLessThanOrEqual(geometry.field.top + TOLERANCE)
  expect(geometry.field.left, `${label}: the notes span the log`).toBeLessThanOrEqual(geometry.formContent.left + TOLERANCE)
  expect(geometry.field.right, `${label}: the notes span the log`).toBeGreaterThanOrEqual(geometry.formContent.right - TOLERANCE)
}

/** The grouped coaching disclosure follows the Log results action and is the last child of the card's content. */
async function expectCoachingLast(scope: Page | Locator) {
  const coaching = cardOf(scope).getByRole('button', { name: EMOM_COACHING })
  await expect(coaching).toHaveCount(1)
  expect(await cardOf(scope).evaluate((flow) => {
    const coachingButton = [...flow.querySelectorAll('button')].find((button) => /^Coaching and notes/.test(button.textContent ?? ''))!
    const opener = [...flow.querySelectorAll('.clr-timed-actions button')].find((button) => button.textContent === 'Log results')!
    const content = flow.querySelector('.clr-movement-group')!
    const group = [...content.children].find((child) => child.contains(coachingButton))
    return {
      follows: (opener.compareDocumentPosition(coachingButton) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      last: group !== undefined && content.lastElementChild === group && !group.contains(opener),
    }
  })).toEqual({ follows: true, last: true })
}

/**
 * axe over the journey's screen after an interaction: every rule, every node
 * (the `visit` fixture scans each screen on arrival as well).
 */
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

/** Delivered-revision evidence of the whole block, read in one taller viewport at the same width. */
async function attachBlock(page: Page, name: string, scope: Page | Locator = page) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 2400 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await settle(page)
    await test.info().attach(`${name}.png`, { body: await stackOf(scope).screenshot({ caret: 'hide', animations: 'disabled' }), contentType: 'image/png' })
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

/** The saved EMOM row's result columns, as the app sent them. */
function resultColumns(body: Record<string, unknown>) {
  const { block_id, elapsed_seconds, completed_under_cap, rounds_completed, partial_round_reps, minutes_completed, highest_rung, perceived_effort, notes } = body
  return { block_id, elapsed_seconds, completed_under_cap, rounds_completed, partial_round_reps, minutes_completed, highest_rung, perceived_effort, notes }
}

const NO_TALLY = {
  elapsed_seconds: null, completed_under_cap: null, rounds_completed: null, partial_round_reps: null,
  minutes_completed: null, highest_rung: null, perceived_effort: null,
}

/** The History block holding the EMOM's result: the one that reads its note. */
function historyEmom(page: Page, note: string): Locator {
  return page.locator('[data-detail-block]').filter({ has: page.getByText(note, { exact: true }) })
}

/** The section the forward action arrived at (Round 7 heads the section and its block cards with its name). */
function sectionHeading(page: Page, title: string): Locator {
  return page.getByRole('heading', { name: title, exact: true }).first()
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-011 EMOM schedule and end logging without a completion counter', () => {
  test('JOURNEY-011 touch phone-390 Signal: minute progress and Now/Next without the Not started or Work captions through a boundary, the rest and a pause; the natural end opens the counter-free log; an exception note survives a failed save, is saved once with no minutes tally, and History reads it', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { skin: 'signal', failFirstSave: true })
    await openWorkout(page, visit)
    const card = cardOf(page)
    const [swing, burpee] = EMOM_MOVEMENTS

    // Ready: each movement's minutes and the minute it opens; no clock yet, so
    // no caption at all; Round 7 marks the movement after the opening minute's Next.
    await expect.poll(() => scheduleLines(page)).toEqual([])
    await expectNoRetiredCaption(page)
    await expect.poll(() => marked(page, 'Next')).toEqual([burpee])
    await expect(card.getByText('ODD MIN', { exact: true })).toBeVisible()
    await expect(card.getByText('EVEN MIN', { exact: true })).toBeVisible()
    await expect(card.getByText('Min 1 · 12 reps', { exact: true })).toBeVisible()
    await expect(logOf(page)).toHaveCount(0)
    await attachBlock(page, 'emom-ready-signal-phone-390')

    // Running: held at exact seconds of the block's own clock.
    await card.getByRole('button', { name: 'Start EMOM', exact: true }).tap()
    const start = await startedAt(page, app.emomBlockId)
    await page.clock.pauseAt(start + 10_000)
    await expect(timerOf(page)).toContainText('00:50')
    await expect.poll(() => scheduleLines(page)).toEqual(['Minute 1 of 10'])
    await expect.poll(() => marked(page, 'Now')).toEqual([swing])
    await expectNoRetiredCaption(page)
    await attachBlock(page, 'emom-running-signal-phone-390')

    // The transition into the minute's rest keeps its word and looks ahead.
    await page.clock.pauseAt(start + 46_000)
    await expect(timerOf(page)).toContainText('00:14')
    await expect.poll(() => scheduleLines(page)).toEqual(['Minute 1 of 10 · Rest'])
    await expect.poll(() => marked(page, 'Next')).toEqual([burpee])
    await expect(card.getByText('Min 3 · 12 reps', { exact: true })).toBeVisible()
    await attachBlock(page, 'emom-rest-signal-phone-390')

    // The boundary: minute two is the burpee's, with no tap and no caption.
    await page.clock.pauseAt(start + 61_000)
    await expect(timerOf(page)).toContainText('00:59')
    await expect.poll(() => scheduleLines(page)).toEqual(['Minute 2 of 10'])
    await expect.poll(() => marked(page, 'Now')).toEqual([burpee])
    await expect(card.getByText('Min 3 · 12 reps', { exact: true })).toBeVisible()
    await expectNoRetiredCaption(page)

    // Paused: the actual clock state in words, the minute's movement and its time held.
    await card.getByRole('button', { name: 'Pause', exact: true }).tap()
    await page.clock.pauseAt(start + 121_000)
    await expect(timerOf(page)).toContainText('00:59')
    await expect.poll(() => scheduleLines(page)).toEqual(['Paused'])
    await expect.poll(() => marked(page, 'Now')).toEqual([burpee])
    await expect(openerOf(page)).toHaveCount(0)
    await expect(logOf(page)).toHaveCount(0)
    await card.getByRole('button', { name: 'Resume', exact: true }).tap()
    await expect.poll(() => scheduleLines(page)).toEqual(['Minute 2 of 10'])

    // Every prescribed minute runs (the pause added its minute): Time
    // complete, and the log — opened by itself, or from the card's action.
    await page.clock.pauseAt(start + 60_000 + 600_000 + 5_000)
    await expect(timerOf(page)).toContainText('00:00')
    await expect.poll(() => scheduleLines(page)).toEqual(['Time complete'])
    await expect(card.getByText(/The clock has run every prescribed minute/)).toHaveCount(0)
    await ownOpening(page)
    // TASK-046: the card's real Log action opens the log in the focused dialog.
    await openLog(page)
    await expectNoTally(page)
    await expect(notesOf(page)).toHaveValue('')
    await expectCoachingLast(page)
    await settle(page)
    expectLogContract(await readLog(page), 'natural end @phone-390')
    await noHorizontalOverflow(page)
    await attachBlock(page, 'emom-ended-log-signal-phone-390')
    await page.clock.resume()
    await checkJourneyA11y(page)

    // An exception, by touch: the clock's own record does not move.
    const grid = await storedGrid(page, app.emomBlockId)
    await notesOf(page).tap()
    await notesOf(page).fill(EXCEPTION_NOTE)
    await expect(notesOf(page)).toHaveValue(EXCEPTION_NOTE)
    expect(await storedGrid(page, app.emomBlockId)).toEqual(grid)
    expect(Object.keys(grid ?? {}).sort()).toEqual(['startedAt', 'workDoneMinute'])
    await attachBlock(page, 'emom-ended-note-signal-phone-390')

    // The section's forward action saves. The first save is refused: the
    // athlete stays, with the note and the ended schedule intact. TASK-046:
    // the log is closed first (the workout behind it is inert); with the
    // failure dismissed, the reopened log reads the note, and the retry is
    // the same forward action the failure's Try again runs.
    await closeLog(page)
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('That didn’t save')
    expect(app.saves).toHaveLength(1)
    await expect.poll(() => scheduleLines(page)).toEqual(['Time complete'])
    await dialog.getByRole('button', { name: 'Close', exact: true }).tap()
    await expect(dialog).toHaveCount(0)
    await openLog(page)
    await expect(notesOf(page)).toHaveValue(EXCEPTION_NOTE)
    await closeLog(page)
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    await expect(sectionHeading(page, COOLDOWN_SECTION_TITLE)).toBeVisible()

    // Both attempts sent the same row: the note, and no minutes, time or completion.
    expect(app.saves).toHaveLength(2)
    for (const body of app.saves) expect(resultColumns(body)).toEqual({ block_id: app.emomBlockId, ...NO_TALLY, notes: EXCEPTION_NOTE })
    expect(await storedGrid(page, app.emomBlockId)).toEqual(grid)

    // History reads that row back: the note, and no minutes reading.
    await visit(`/history/${app.sessionId}`)
    const history = historyEmom(page, EXCEPTION_NOTE)
    await expect(history.getByText(EXCEPTION_NOTE, { exact: true })).toBeVisible()
    await expect(history.getByText('Minutes', { exact: true })).toHaveCount(0)
    await test.info().attach('history-emom-note-signal-phone-390.png', { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
    app.assertContained()
  })

  test('JOURNEY-011 keyboard phone-320 reduced motion: Finish early in minute 3 keeps FINISHED EARLY and the actual stop, never COMPLETE; the counter-free log by keyboard; a reload keeps the stop; the note is saved with no minutes tally or timing', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, { skin: 'clear', reducedMotion: true })
    await openWorkout(page, visit)
    const card = cardOf(page)

    const startButton = card.getByRole('button', { name: 'Start EMOM', exact: true })
    await startButton.focus()
    await page.keyboard.press('Enter')
    const start = await startedAt(page, app.emomBlockId)
    await page.clock.pauseAt(start + 130_000)
    await expect(timerOf(page)).toContainText('00:50')
    await expect.poll(() => scheduleLines(page)).toEqual(['Minute 3 of 10'])
    // The primary Finish early is the stop after Pause.
    await expect(card.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(card.getByRole('button', { name: 'Finish early', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')

    // The actual stop, truthfully: minute 3 of 10, Finished early — never Time complete.
    await expect.poll(() => scheduleLines(page)).toEqual(['Finished early'])
    await expect(card.getByText('Finished early, in minute 3 of 10. Continue when you are ready.', { exact: true })).toBeVisible()
    await expect(stackOf(page).getByText('Time complete', { exact: true })).toHaveCount(0)
    const stopped = { startedAt: new Date(start).toISOString(), workDoneMinute: null, finishedAt: new Date(start + 130_000).toISOString() }
    expect(await storedGrid(page, app.emomBlockId)).toEqual(stopped)

    // The clock running on never turns the early end into a completed schedule.
    await page.clock.pauseAt(start + 900_000)
    await expect.poll(() => scheduleLines(page)).toEqual(['Finished early'])
    expect(await storedGrid(page, app.emomBlockId)).toEqual(stopped)
    await page.clock.resume()

    // Round 7 opened the log as the attempt ended; Escape closes it, and the
    // card offers its "Log results" action.
    await ownOpening(page)
    if ((await logOf(page).count()) > 0) {
      await page.keyboard.press('Escape')
      await expect(logOf(page)).toHaveCount(0)
    }
    await expect(openerOf(page)).toBeVisible()

    // The notes are reached by keyboard: Tab from the top of the page.
    // TASK-046: Tab reaches the card's "Log results" action; Enter opens the
    // log with the focus on its X, and Tab reaches the notes.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    let reached = false
    for (let press = 0; press < 40 && !reached; press += 1) {
      await page.keyboard.press('Tab')
      reached = await openerOf(page).evaluate((opener) => opener === document.activeElement)
    }
    expect(reached, 'the Log results action is in the tab order').toBe(true)
    await page.keyboard.press('Enter')
    await expect(logOf(page)).toBeVisible()
    await expect(cardOf(page).locator('dialog.clr-logging-overlay[open]').getByRole('button', { name: 'Close log', exact: true })).toBeFocused()
    await expectNoTally(page)
    await settle(page)
    expectLogContract(await readLog(page), 'early @phone-320')
    reached = false
    for (let press = 0; press < 12 && !reached; press += 1) {
      await page.keyboard.press('Tab')
      reached = await notesOf(page).evaluate((field) => field === document.activeElement)
    }
    expect(reached, 'the notes field is in the tab order').toBe(true)
    await page.keyboard.type(EARLY_NOTE)
    await expect(notesOf(page)).toHaveValue(EARLY_NOTE)

    // Reduced motion: nothing in the log moves or loops beyond the app's hard cut.
    const timings = await logOf(page).evaluate((form) => form.getAnimations({ subtree: true }).map((animation) => {
      const timing = animation.effect!.getComputedTiming()
      return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
    }))
    for (const timing of timings) {
      expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
      expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
    }
    await noHorizontalOverflow(page)
    await attachBlock(page, 'emom-early-log-keyboard-reduced-phone-320')
    await checkJourneyA11y(page)

    // Close and reopen: the actual stop comes back; the note was this visit's
    // draft, so the log reads empty — exactly what would be saved.
    await page.reload()
    await expect(page.getByRole('list', { name: EMOM_WORK_LIST, exact: true })).toBeVisible()
    await settle(page)
    await expect.poll(() => scheduleLines(page)).toEqual(['Finished early'])
    expect(await storedGrid(page, app.emomBlockId)).toEqual(stopped)
    await openerOf(page).focus()
    await page.keyboard.press('Enter')
    await expect(notesOf(page)).toHaveValue('')
    await notesOf(page).focus()
    await page.keyboard.type(EARLY_NOTE)

    // Saved by keyboard: the note, and no minutes, elapsed time or completion.
    // TASK-046: Escape closes the log first.
    await page.keyboard.press('Escape')
    await expect(logOf(page)).toHaveCount(0)
    const next = page.getByRole('button', { name: 'Next section', exact: true })
    await next.focus()
    await page.keyboard.press('Enter')
    await expect(sectionHeading(page, COOLDOWN_SECTION_TITLE)).toBeVisible()
    expect(app.saves).toHaveLength(1)
    expect(resultColumns(app.saves[0])).toEqual({ block_id: app.emomBlockId, ...NO_TALLY, notes: EARLY_NOTE })

    await visit(`/history/${app.sessionId}`)
    const history = historyEmom(page, EARLY_NOTE)
    await expect(history.getByText(EARLY_NOTE, { exact: true })).toBeVisible()
    await expect(history.getByText('Minutes', { exact: true })).toHaveCount(0)
    await expect(history.getByText(/\d+ of 10/)).toHaveCount(0)
    app.assertContained()
  })

  test('JOURNEY-011 gallery emom and cards phone-390: the route’s own EmomBlock — the counter-free end log after every minute and after an early finish, and the ready card with its minute and Next and no caption — with no network', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await installDeterministicCapture(page, { skin: 'signal', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })

    // `?state=emom`: the accepted "EMOM results" — the route's own flow over
    // the gallery's EMOM, run past every minute by the state's own drive.
    await visit('/gallery/refinements?state=emom&open=1')
    const state = page.locator('[data-refinement-state="emom"]')
    await expect(state.getByRole('heading', { name: 'EMOM results', exact: true })).toBeVisible()
    await expect.poll(() => scheduleLines(state)).toEqual(['Time complete'])
    await expectNoRetiredCaption(state)
    await ownOpening(state)
    // TASK-046: the route's own "Log results" action opens the log.
    await openLog(state)
    await expectNoTally(state)
    await expect(notesOf(state)).toHaveValue('')
    await settle(page)
    expectLogContract(await readLog(state), 'gallery complete')
    await test.info().attach('gallery-emom-complete-signal-phone-390.png', { body: await state.screenshot({ caret: 'hide', animations: 'disabled' }), contentType: 'image/png' })
    await test.info().attach('gallery-emom-complete-log-signal-phone-390.png', { body: await page.screenshot({ caret: 'hide', animations: 'disabled' }), contentType: 'image/png' })
    await expect(state.getByText(/The clock has run every prescribed minute/)).toHaveCount(0)
    // Live over memory only.
    await notesOf(state).fill('Swings unbroken')
    await expect(notesOf(state)).toHaveValue('Swings unbroken')
    await noHorizontalOverflow(page)
    await checkJourneyA11y(page)
    await closeLog(page)

    // The same state finished early by its own controls: Finished early, the
    // minute it was in, and the same counter-free log.
    await visit('/gallery/refinements?state=emom')
    const early = page.locator('[data-refinement-state="emom"]')
    await cardOf(early).getByRole('button', { name: 'Start EMOM', exact: true }).tap()
    await cardOf(early).getByRole('button', { name: 'Finish early', exact: true }).tap()
    await expect.poll(() => scheduleLines(early)).toEqual(['Finished early'])
    await expect(early.getByText('Finished early, in minute 1 of 10. Continue when you are ready.', { exact: true })).toBeVisible()
    await expectNoRetiredCaption(early)
    await ownOpening(early)
    await openLog(early)
    await expectNoTally(early)
    await settle(page)
    expectLogContract(await readLog(early), 'gallery early')
    await test.info().attach('gallery-emom-early-log-signal-phone-390.png', { body: await page.screenshot({ caret: 'hide', animations: 'disabled' }), contentType: 'image/png' })
    await closeLog(page)

    // `?state=cards`: the timed cards' EMOM is the route's own flow, ready —
    // its minute and no caption; Round 7's gallery EMOM is one movement, so
    // every minute is its own and nothing is marked Next.
    await visit('/gallery/refinements?state=cards')
    const cards = page.locator('[data-refinement-state="cards"]')
    await expect(cardOf(cards)).toBeVisible()
    await expect.poll(() => scheduleLines(cards)).toEqual([])
    await expectNoRetiredCaption(cards)
    await expect.poll(() => marked(cards, 'Next')).toEqual([])
    await expect(cardOf(cards).getByText('Min 1 · 12 reps', { exact: true })).toBeVisible()
    await settle(page)
    await test.info().attach('gallery-cards-emom-ready-signal-phone-390.png', { body: await stackOf(cards).screenshot({ caret: 'hide', animations: 'disabled' }), contentType: 'image/png' })
    await cardOf(cards).getByRole('button', { name: 'Start EMOM', exact: true }).tap()
    await expect.poll(() => scheduleLines(cards)).toEqual(['Minute 1 of 10'])
    await expect.poll(() => marked(cards, 'Now')).toEqual(['kb swing'])
    await expect(timerOf(cards)).toBeVisible()
    await noHorizontalOverflow(page)
    await checkJourneyA11y(page)
    expect(await page.evaluate(() => localStorage.getItem('clear.workout-emom'))).toBeNull()
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
