import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import {
  AMRAP_COUNTS,
  AMRAP_WINDOW_SECONDS,
  AMRAP_WORK_LIST,
  COOLDOWN_SECTION_TITLE,
  amrapResultAcceptance,
  amrapResultSnapshot,
} from '../../src/test/amrap-result-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-009 (REQ-009; C25, C26, C27, C28; G08; R52, R54, R55, R56, R57, R79,
 * R83, R85, R90; JOURNEY-009) — the AMRAP's prescription and concise scoring
 * controls on the real `/workout` route.
 *
 * Entry: a running session, behind the existing auth guard, whose first
 * section holds the accepted AMRAP and whose second is a cooldown
 * (`src/test/amrap-result-fixture.ts`). Action: read the prescription, run
 * the window — Pause and Resume, then Finish early, or let the cap close it —
 * and enter the result by touch or by keyboard. Result, read from the browser
 * at phone widths: the work and its prescription come before any scoring; the
 * result is one simple log whose rounds and partial round are one group; each
 * count is one wide frame holding framed minus and plus actions around a
 * distinct value; Clear rounds and No partial round are gone, blank and an
 * explicit zero stay apart through a reload, the saved row and History.
 *
 * Synthetic and contained: an intercepted session for a fictional user. The
 * browser clock is Playwright's. The only writes allowed are the AMRAP's own
 * `block_results` insert on the section's forward action — recorded here as
 * the request the app sent, answered as PostgREST would, never forwarded — and
 * the one History read answers that recorded row back. This is the app's own
 * write and read contract on a synthetic origin, not backend persistence proof
 * (`e2e/design-0143/workout-amrap.spec.ts` is the backend lane).
 */
const OWNER = '00000000-0000-4000-8000-000000000901'
const PLACE = '00000000-0000-4000-8000-000000000911'
const ROW_ID = '00000000-0000-4000-8000-000000000921'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The browser's clock at entry; the session has run for one minute. */
const ENTRY = Date.parse('2026-11-09T09:00:00.000Z')

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
    if (code !== null) throw new Error(`Synthetic TASK-009 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-009 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-009.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-009-public-placeholder',
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
  const running: SessionSnapshot = sessionSnapshotSchema.parse(amrapResultSnapshot(amrapResultAcceptance({ locationId: PLACE }), {
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
      // The AMRAP's own row, exactly as the app sent it. The first may be
      // refused, writing nothing, as a failed save would.
      const body = request.postDataJSON() as BlockResultBody | BlockResultBody[]
      const row = Array.isArray(body) ? body[0] : body
      saves.push(row)
      if (refusals > 0) {
        refusals -= 1
        return reply({ code: 'PGRST000', message: 'Controlled TASK-009 save boundary unavailable.' }, 503)
      }
      const answered = { id: ROW_ID, created_at: '2026-11-09T09:10:00.000Z', ...row }
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
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-009 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-009-session', refreshToken: 'synthetic-task-009-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-009@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    sessionId: running.session.id,
    amrapBlockId: running.sections[0].blocks[0].block.id,
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

/** JOURNEY-009's entry: the running session's `/workout`, the AMRAP ready. */
async function openWorkout(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByRole('list', { name: AMRAP_WORK_LIST, exact: true })).toBeVisible()
  await settle(page)
}

/** Time passes on the browser's own clock, and its interval repaints run. */
async function pass(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1000)
}

function cardOf(page: Page): Locator {
  return page.locator('[data-workout-card="workout"]').filter({
    has: page.getByRole('list', { name: AMRAP_WORK_LIST, exact: true }),
  })
}

/**
 * TASK-046 (C45; R43, R100): the AMRAP's card holds one "Log results" action
 * where its log was, and the log — the same form — opens in the shared
 * focused dialog titled "Log results" (the dialog's title is its one title).
 */
function openerOf(scope: Locator): Locator {
  return scope.locator('[data-timed-log-opener]').getByRole('button', { name: 'Log results', exact: true })
}

/** The AMRAP's log: the open focused dialog's one form, named by its title "Log results". */
function logOf(scope: Locator): Locator {
  return scope.page().locator('dialog.clr-accepted-log[open] form.clr-timed-log')
}

/** Opens the AMRAP's log from its card (unless it is open) and returns it. */
async function openLog(scope: Locator): Promise<Locator> {
  const opener = openerOf(scope)
  if ((await opener.getAttribute('aria-expanded')) !== 'true') await opener.click()
  const log = logOf(scope)
  await expect(log).toBeVisible()
  await expect(scope.page().getByRole('dialog', { name: 'Log results', exact: true })).toBeVisible()
  return log
}

/** Closes the open log with its framed X: the workout behind it is inert while it is open. */
async function closeLog(page: Page) {
  const open = page.locator('dialog.clr-accepted-log[open]')
  if ((await open.count()) === 0) return
  await open.getByRole('button', { name: 'Close log', exact: true }).click()
  await expect(open).toHaveCount(0)
}

/** One History reading — its label and its value — by the label's exact words. */
function historyReading(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('xpath=..')
}

function countOf(scope: Locator, label: string) {
  const group = scope.getByRole('group', { name: label, exact: true })
  const name = label.toLowerCase()
  return {
    group,
    value: group.locator('output'),
    minus: group.getByRole('button', { name: `Decrease ${name}`, exact: true }),
    plus: group.getByRole('button', { name: `Increase ${name}`, exact: true }),
  }
}

async function shown(scope: Locator, label: string): Promise<string> {
  return (await countOf(scope, label).value.getAttribute('data-quantity-value')) ?? ''
}

/** Every control the rejected reset/toggle design offered (C28, R57). */
const RETIRED = /^(clear rounds|no partial round|record rounds|partial round|reset|clear)\b/i

async function expectNoResetControls(scope: Locator) {
  await expect(scope.getByRole('button', { name: RETIRED })).toHaveCount(0)
  await expect(scope.getByText(/No rounds recorded|No partial round recorded|leave it blank/i)).toHaveCount(0)
  await expect(scope.locator('.clr-text-action')).toHaveCount(0)
}

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number }

interface CountGeometry {
  label: string
  labelBox: Box
  labelSize: number
  labelColor: string
  frame: Box
  frameClasses: string[]
  minus: Box
  plus: Box
  value: Box
  valueSize: number
  valueColor: string
  valueClipped: boolean
  /** The framed actions' own frame (the chamfer's border ring) and the skin's interaction role. */
  actionFrames: string[]
  disabledFrame: string
  interaction: string
  disabledRole: string
  timerRole: string
}

interface LogGeometry {
  card: Box
  /** TASK-046: the log's place on the card, its "Log results" action. */
  opener: Box
  form: Box
  /** TASK-046: the form is held by the shared focused dialog's frame. */
  held: boolean
  formRuleWidth: number
  formContent: { left: number; right: number }
  workBottom: number
  listBottom: number
  title: Box
  groups: Box[]
  /** TASK-015 (C37): the per-movement groups, which follow the counts' group. */
  movementGroups: Box[]
  counts: CountGeometry[]
}

/** The AMRAP's card and its open log, read from the browser. */
async function readLog(scope: Locator): Promise<LogGeometry> {
  return scope.locator('[data-workout-card="workout"]').first().evaluate((card, listName) => {
    const box = (node: Element): Box => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
    }
    const probe = (variable: string) => {
      const element = document.createElement('span')
      element.style.color = `var(${variable})`
      card.append(element)
      const color = getComputedStyle(element).color
      element.remove()
      return color
    }
    const form = document.querySelector('dialog.clr-accepted-log[open] form.clr-timed-log')!
    const dialog = form.closest('dialog')!
    const formStyle = getComputedStyle(form)
    const list = [...card.querySelectorAll('ol, ul')].find((node) => node.getAttribute('aria-label') === listName)!
    const work = [...card.querySelectorAll('[data-movement-identity]')].filter((node) => !form.contains(node))
    return {
      card: box(card),
      opener: box(card.querySelector('[data-timed-log-opener]')!),
      form: box(form),
      held: form.closest('[data-logging-frame]') !== null,
      formRuleWidth: parseFloat(formStyle.borderTopWidth),
      formContent: {
        left: form.getBoundingClientRect().left + parseFloat(formStyle.paddingLeft),
        right: form.getBoundingClientRect().right - parseFloat(formStyle.paddingRight),
      },
      workBottom: Math.max(...work.map((node) => node.getBoundingClientRect().bottom)),
      listBottom: list.getBoundingClientRect().bottom,
      title: box(dialog.querySelector('.clr-accepted-log__title')!),
      // TASK-015 (C37) added per-movement groups after the counts; the result
      // group is the one that is not a movement's (TASK-046 owns this repair).
      groups: [...form.querySelectorAll('.clr-timed-log__group:not(.clr-timed-log__group--movement)')].map(box),
      movementGroups: [...form.querySelectorAll('.clr-timed-log__group--movement')].map(box),
      counts: [...form.querySelectorAll('[data-quantity-field]')].map((field) => {
        const label = field.querySelector('.label')!
        const frame = field.querySelector('.clr-quantity')!
        const [minus, plus] = [...frame.querySelectorAll('button')]
        const value = frame.querySelector('output')!
        return {
          label: label.textContent ?? '',
          labelBox: box(label),
          labelSize: parseFloat(getComputedStyle(label).fontSize),
          labelColor: getComputedStyle(label).color,
          frame: box(frame),
          frameClasses: [...frame.classList],
          minus: box(minus),
          plus: box(plus),
          value: box(value),
          valueSize: parseFloat(getComputedStyle(value).fontSize),
          valueColor: getComputedStyle(value).color,
          valueClipped: value.scrollWidth > value.clientWidth + 1,
          actionFrames: [minus, plus].filter((button) => !button.disabled).map((button) => getComputedStyle(button, '::after').backgroundColor),
          disabledFrame: [minus, plus].filter((button) => button.disabled).map((button) => getComputedStyle(button, '::after').backgroundColor)[0] ?? '',
          interaction: probe('--interaction-500'),
          disabledRole: probe('--border-disabled'),
          timerRole: probe('--text-timer'),
        }
      }),
    }
  }, AMRAP_WORK_LIST)
}

const TOLERANCE = 1
/** `--control-height`, `--spacing-300`, `--spacing-400` and `--spacing-600`, in CSS pixels. */
const CONTROL = 40
const ROOMY = 12
const FIELD_GAP = 16
const GROUP_GAP = 24

/** C25–C27 read from the browser: the work first, one grouped log, one wide frame per count. */
function expectLogContract(geometry: LogGeometry, label: string) {
  // C25: the work and every prescription reading end before the log begins —
  // TASK-046: on the card, the log begins at its "Log results" action.
  expect(geometry.opener.top, `${label}: the log after the work`).toBeGreaterThanOrEqual(geometry.workBottom - TOLERANCE)
  expect(geometry.opener.top, `${label}: the log after the round list`).toBeGreaterThanOrEqual(geometry.listBottom - TOLERANCE)

  // C26: set apart, one title, then one group of both counts, rounds first.
  // TASK-046: the dialog's frame sets the log apart from the work, so its
  // inline rule is not drawn inside it (P01: no interior line).
  expect(geometry.held, `${label}: the log held by the focused frame`).toBe(true)
  expect(geometry.formRuleWidth, `${label}: no interior rule in the frame`).toBe(0)
  expect(geometry.groups, `${label}: one result group`).toHaveLength(1)
  // C25/C26 order: any per-movement groups (TASK-015) come after the counts' group.
  for (const movement of geometry.movementGroups) {
    expect(movement.top, `${label}: a movement group after the counts`).toBeGreaterThanOrEqual(geometry.groups[0].bottom - TOLERANCE)
  }
  expect(geometry.counts.map((count) => count.label), `${label}: rounds, then the partial round`).toEqual([...AMRAP_COUNTS])
  const [group] = geometry.groups
  expect(group.top - geometry.title.bottom, `${label}: the title stands apart from its group`).toBeGreaterThanOrEqual(GROUP_GAP - TOLERANCE)
  const [rounds, partial] = geometry.counts
  expect(partial.labelBox.top - rounds.frame.bottom, `${label}: the two counts sit together`).toBeLessThanOrEqual(FIELD_GAP + TOLERANCE)
  expect(partial.labelBox.top - rounds.frame.bottom).toBeGreaterThanOrEqual(FIELD_GAP - TOLERANCE)
  for (const count of geometry.counts) {
    expect(count.frame.top, `${label}: ${count.label} inside the group`).toBeGreaterThanOrEqual(group.top - TOLERANCE)
    expect(count.frame.bottom, `${label}: ${count.label} inside the group`).toBeLessThanOrEqual(group.bottom + TOLERANCE)
    expect(count.labelBox.bottom, `${label}: ${count.label}'s label before its frame`).toBeLessThanOrEqual(count.frame.top + TOLERANCE)
  }

  // C27: one wide frame — the log's whole width — holding minus, value, plus.
  for (const count of geometry.counts) {
    const name = `${label}: ${count.label}`
    expect(count.frameClasses, name).toEqual(expect.arrayContaining(['clr-quantity', 'clr-chamfer', 'clr-chamfer--sm', 'clr-chamfer--structure']))
    expect(count.frame.left, `${name} starts at the log's edge`).toBeLessThanOrEqual(geometry.formContent.left + TOLERANCE)
    expect(count.frame.right, `${name} ends at the log's edge`).toBeGreaterThanOrEqual(geometry.formContent.right - TOLERANCE)
    for (const [part, action] of [['minus', count.minus], ['plus', count.plus]] as const) {
      expect(Math.abs(action.width - CONTROL), `${name} ${part}: the shared control width`).toBeLessThanOrEqual(TOLERANCE)
      expect(Math.abs(action.height - CONTROL), `${name} ${part}: the shared control height`).toBeLessThanOrEqual(TOLERANCE)
      expect(action.top - count.frame.top, `${name} ${part}: the roomier inset`).toBeGreaterThanOrEqual(ROOMY - TOLERANCE)
      expect(count.frame.bottom - action.bottom, `${name} ${part}: the roomier inset`).toBeGreaterThanOrEqual(ROOMY - TOLERANCE)
    }
    expect(Math.abs(count.minus.left - count.frame.left - ROOMY), `${name}: minus at the frame's start`).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(count.frame.right - count.plus.right - ROOMY), `${name}: plus at the frame's end`).toBeLessThanOrEqual(TOLERANCE)
    expect(count.value.left, `${name}: the value between the actions`).toBeGreaterThanOrEqual(count.minus.right - TOLERANCE)
    expect(count.value.right).toBeLessThanOrEqual(count.plus.left + TOLERANCE)
    const valueCentre = count.value.left + count.value.width / 2
    expect(Math.abs(valueCentre - (count.frame.left + count.frame.width / 2)), `${name}: the value centred`).toBeLessThanOrEqual(TOLERANCE)
    for (const part of [count.minus, count.plus, count.value]) {
      const middle = part.top + part.height / 2
      expect(Math.abs(middle - (count.frame.top + count.frame.height / 2)), `${name}: one row`).toBeLessThanOrEqual(TOLERANCE)
    }
    // A distinct value: the timer role, larger than its label, never clipped.
    expect(count.valueColor, `${name}: the value in the timer role`).toBe(count.timerRole)
    expect(count.valueColor, `${name}: the value distinct from its label`).not.toBe(count.labelColor)
    expect(count.valueSize, `${name}: the value larger than its label`).toBeGreaterThan(count.labelSize)
    expect(count.valueClipped, `${name}: the value fits`).toBe(false)
    // Framed actions in the interaction role (pink in Signal).
    for (const frame of count.actionFrames) expect(frame, `${name}: framed in the interaction role`).toBe(count.interaction)
    // A disabled minus follows its real state: the shared disabled role (R83).
    if (count.disabledFrame !== '') expect(count.disabledFrame, `${name}: disabled minus`).toBe(count.disabledRole)
  }
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

/** Delivered-revision evidence of the whole card, read in one taller viewport at the same width. */
async function attachCard(page: Page, name: string) {
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width, height: 2400 })
  try {
    await page.evaluate(() => document.querySelectorAll('.clr-scroll-region__scroller').forEach((scroller) => scroller.scrollTo(0, 0)))
    await settle(page)
    await test.info().attach(`${name}.png`, { body: await cardOf(page).screenshot({ caret: 'hide' }), contentType: 'image/png' })
  } finally {
    await page.setViewportSize(viewport)
    await settle(page)
  }
}

/** The saved AMRAP row's result columns, as the app sent them. */
function resultColumns(body: Record<string, unknown>) {
  const { block_id, elapsed_seconds, completed_under_cap, rounds_completed, partial_round_reps, minutes_completed, highest_rung, perceived_effort, notes } = body
  return { block_id, elapsed_seconds, completed_under_cap, rounds_completed, partial_round_reps, minutes_completed, highest_rung, perceived_effort, notes }
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-009 AMRAP prescription and concise scoring controls', () => {
  test('JOURNEY-009 touch phone-390 Signal: the work precedes the grouped log; the framed counts tap up and down to an explicit zero beside a blank; a reload, a failed save and its retry, the saved row and History keep them apart', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { skin: 'signal', failFirstSave: true })
    await openWorkout(page, visit)
    const card = cardOf(page)

    // Ready: the prescription to read, and no score asked for.
    await expect(card.getByText('As many rounds as possible in 08:00.', { exact: true })).toBeVisible()
    await expect(card.getByRole('list', { name: AMRAP_WORK_LIST, exact: true }).getByRole('listitem')).toHaveCount(2)
    await expect(openerOf(card)).toHaveCount(0)
    await expect(logOf(card)).toHaveCount(0)
    await attachCard(page, 'amrap-ready-signal-phone-390')

    // Running, paused and resumed: still nothing to enter.
    await card.getByRole('button', { name: 'Start AMRAP', exact: true }).tap()
    await pass(page, 30)
    await expect(openerOf(card)).toHaveCount(0)
    await expect(logOf(card)).toHaveCount(0)
    await card.getByRole('button', { name: 'Pause', exact: true }).tap()
    await expect(card.getByText('Paused', { exact: true })).toBeVisible()
    await expect(openerOf(card)).toHaveCount(0)
    await expect(logOf(card)).toHaveCount(0)
    await card.getByRole('button', { name: 'Resume', exact: true }).tap()
    await pass(page, 65)
    await card.getByRole('button', { name: 'Finish early', exact: true }).tap()
    await expect(card.getByText('01:35 on the clock')).toBeVisible()

    // Ended: the work, then one log whose counts are blank — stopping records nothing.
    // TASK-046: the card's "Log results" action opens it in the focused dialog.
    await expect(openerOf(card)).toBeVisible()
    await openerOf(card).tap()
    await expect(logOf(card)).toBeVisible()
    await settle(page)
    expectLogContract(await readLog(page.locator('main')), 'ended @phone-390')
    await expectNoResetControls(card)
    await expectNoResetControls(logOf(card))
    for (const label of AMRAP_COUNTS) {
      const count = countOf(logOf(card), label)
      await expect(count.value).toHaveAttribute('data-quantity-value', 'blank')
      await expect(count.value).toContainText('—')
      await expect(count.value).toContainText('Not recorded')
      await expect(count.minus).toBeDisabled()
    }
    const stored = () => page.evaluate((blockId) => JSON.parse(localStorage.getItem('clear.workout-amraps') ?? '{}')[blockId], app.amrapBlockId)
    expect(await stored()).toMatchObject({ endedAtSeconds: 95, roundsCompleted: null, partialRoundReps: null })
    await attachCard(page, 'amrap-ended-blank-signal-phone-390')
    // The framed actions are the Signal skin's pink.
    const signal = await readLog(page.locator('main'))
    expect(signal.counts[0].interaction).toBe('rgb(255, 46, 166)')
    expect(signal.counts[0].actionFrames).toEqual(['rgb(255, 46, 166)'])

    // Up three and back down three: an explicit zero, and the minus stops there.
    const rounds = countOf(logOf(card), 'Rounds completed')
    for (let tap = 0; tap < 3; tap += 1) await rounds.plus.tap()
    await expect(rounds.value).toHaveText('3')
    await expect(rounds.minus).toBeEnabled()
    for (let tap = 0; tap < 3; tap += 1) await rounds.minus.tap()
    await expect(rounds.value).toHaveText('0')
    await expect(rounds.value).toHaveAttribute('data-quantity-value', '0')
    await expect(rounds.minus).toBeDisabled()
    // The partial round was never touched: still blank, not zero.
    expect(await shown(logOf(card), 'Reps into the next round')).toBe('blank')
    expect(await stored()).toMatchObject({ roundsCompleted: 0, partialRoundReps: null })
    await expectNoResetControls(card)
    await expectNoResetControls(logOf(card))
    await attachCard(page, 'amrap-ended-zero-and-blank-signal-phone-390')
    await checkJourneyA11y(page)

    // Close and reopen: the reload comes back to the zero and the blank.
    await page.reload()
    await expect(page.getByRole('list', { name: AMRAP_WORK_LIST, exact: true })).toBeVisible()
    await settle(page)
    await expect(card.getByText('01:35 on the clock')).toBeVisible()
    await openLog(card)
    expect(await shown(logOf(card), 'Rounds completed')).toBe('0')
    expect(await shown(logOf(card), 'Reps into the next round')).toBe('blank')
    expectLogContract(await readLog(page.locator('main')), 'reloaded @phone-390')

    // The section's forward action saves. The first save is refused: the
    // athlete stays, with nothing discarded and nothing filled in. TASK-046:
    // the log is closed first (the workout behind it is inert); with the
    // failure dismissed, the reopened log reads the same counts, and the
    // retry is the same forward action the failure's Try again runs.
    await closeLog(page)
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('That didn’t save')
    expect(app.saves).toHaveLength(1)
    expect(await stored()).toMatchObject({ roundsCompleted: 0, partialRoundReps: null })
    await dialog.getByRole('button', { name: 'Close', exact: true }).tap()
    await expect(dialog).toHaveCount(0)
    await openLog(card)
    expect(await shown(logOf(card), 'Rounds completed')).toBe('0')
    expect(await shown(logOf(card), 'Reps into the next round')).toBe('blank')
    await closeLog(page)
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    await expect(page.getByRole('heading', { name: COOLDOWN_SECTION_TITLE, exact: true })).toBeVisible()

    // Both attempts sent the same row: the zero as 0, the blank as null, the
    // time the athlete stopped at, and no completion claimed from stopping.
    expect(app.saves).toHaveLength(2)
    const expected = {
      block_id: app.amrapBlockId, elapsed_seconds: 95, completed_under_cap: null,
      rounds_completed: 0, partial_round_reps: null,
      minutes_completed: null, highest_rung: null, perceived_effort: null, notes: null,
    }
    for (const body of app.saves) expect(resultColumns(body)).toEqual(expected)

    // History reads that row back: Rounds 0, and no partial round reading.
    await visit(`/history/${app.sessionId}`)
    await expect(historyReading(page, 'Rounds')).toHaveText('Rounds0')
    await expect(page.getByText('Partial round', { exact: true })).toHaveCount(0)
    await test.info().attach('history-amrap-signal-phone-390.png', { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
    app.assertContained()
  })

  test('JOURNEY-009 keyboard phone-320 reduced motion: the cap closes the window with nothing entered; the counts are reached and operated by keyboard; blank rounds and an explicit zero partial round are saved as null and 0', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, { skin: 'clear', reducedMotion: true })
    await openWorkout(page, visit)
    const card = cardOf(page)

    const start = card.getByRole('button', { name: 'Start AMRAP', exact: true })
    await start.focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await pass(page, AMRAP_WINDOW_SECONDS + 5)

    // The cap ended it: the time, "Cap reached", and both counts blank.
    await expect(card.getByText('Cap reached', { exact: true })).toBeVisible()
    await expect(card.getByText('08:00 on the clock')).toBeVisible()
    // TASK-046: the card's "Log results" action, by keyboard, opens the log.
    await openerOf(card).focus()
    await page.keyboard.press('Enter')
    await expect(logOf(card)).toBeVisible()
    for (const label of AMRAP_COUNTS) expect(await shown(logOf(card), label)).toBe('blank')
    await expectNoResetControls(card)
    await expectNoResetControls(logOf(card))
    await settle(page)
    expectLogContract(await readLog(page.locator('main')), 'cap @phone-320')
    await noHorizontalOverflow(page)

    // Keyboard: the minus is not a stop while blank; the plus is, and the
    // output is read rather than focused.
    const rounds = countOf(logOf(card), 'Rounds completed')
    const partial = countOf(logOf(card), 'Reps into the next round')
    await rounds.plus.focus()
    await page.keyboard.press('Tab')
    await expect(partial.plus).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await expect(partial.value).toHaveText('2')
    await expect(partial.plus).toBeFocused()
    // Back to the minus, which is a stop now, and down to an explicit zero.
    await page.keyboard.press('Shift+Tab')
    await expect(partial.minus).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(partial.value).toHaveText('0')
    await expect(partial.minus).toBeDisabled()
    expect(await shown(logOf(card), 'Rounds completed')).toBe('blank')
    await expect(rounds.minus).toBeDisabled()

    // Reduced motion: nothing in the log moves or loops beyond the app's hard cut.
    const timings = await logOf(card).evaluate((form) => form.getAnimations({ subtree: true }).map((animation) => {
      const timing = animation.effect!.getComputedTiming()
      return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
    }))
    for (const timing of timings) {
      expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
      expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
    }
    await noHorizontalOverflow(page)
    await attachCard(page, 'amrap-cap-blank-and-zero-reduced-phone-320')
    await checkJourneyA11y(page)

    // Saved by keyboard: the blank rounds as null, the observed zero as 0, the
    // cap's time — and no rounds inferred from the cap. TASK-046: Escape
    // closes the log first.
    await page.keyboard.press('Escape')
    await expect(logOf(card)).toHaveCount(0)
    const next = page.getByRole('button', { name: 'Next section', exact: true })
    await next.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: COOLDOWN_SECTION_TITLE, exact: true })).toBeVisible()
    expect(app.saves).toHaveLength(1)
    expect(resultColumns(app.saves[0])).toEqual({
      block_id: app.amrapBlockId, elapsed_seconds: AMRAP_WINDOW_SECONDS, completed_under_cap: null,
      rounds_completed: null, partial_round_reps: 0,
      minutes_completed: null, highest_rung: null, perceived_effort: null, notes: null,
    })

    await visit(`/history/${app.sessionId}`)
    await expect(historyReading(page, 'Partial round')).toHaveText('Partial round0 reps')
    await expect(page.getByText('Rounds', { exact: true })).toHaveCount(0)
    app.assertContained()
  })

  test('JOURNEY-009 gallery amrap phone-390: the route’s own AMRAP ended by its cap and ended early, work first, the grouped log and framed counts, blank beside an explicit zero, with no network', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await installDeterministicCapture(page, { skin: 'signal', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })
    await visit('/gallery/refinements?state=amrap')
    const state = page.locator('[data-refinement-state="amrap"]')
    await expect(state.getByRole('heading', { name: 'AMRAP results', exact: true })).toBeVisible()

    for (const [attempt, values] of [['cap', ['blank', 'blank']], ['early', ['3', '0']]] as const) {
      const scope = state.locator(`[data-gallery-amrap="${attempt}"]`)
      // TASK-046: the route's own "Log results" action opens the log.
      await openLog(scope)
      await settle(page)
      expectLogContract(await readLog(scope), `gallery ${attempt}`)
      await expectNoResetControls(scope)
      await expectNoResetControls(logOf(scope))
      for (const [index, label] of AMRAP_COUNTS.entries()) expect(await shown(logOf(scope), label)).toBe(values[index])
      await test.info().attach(`gallery-amrap-${attempt}-signal-phone-390.png`, { body: await scope.screenshot({ caret: 'hide' }), contentType: 'image/png' })
      await test.info().attach(`gallery-amrap-${attempt}-log-signal-phone-390.png`, { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
      await closeLog(page)
    }
    await expect(state.locator('[data-gallery-amrap="cap"]').getByText('Cap reached', { exact: true })).toBeVisible()
    await expect(state.locator('[data-gallery-amrap="early"]').getByText('05:23 on the clock')).toBeVisible()

    // Live over memory only.
    const capScope = state.locator('[data-gallery-amrap="cap"]')
    await openLog(capScope)
    const cap = countOf(logOf(capScope), 'Rounds completed')
    await cap.plus.tap()
    await expect(cap.value).toHaveText('1')
    await closeLog(page)
    const earlyScope = state.locator('[data-gallery-amrap="early"]')
    await openLog(earlyScope)
    await expect(countOf(logOf(earlyScope), 'Reps into the next round').minus).toBeDisabled()
    await noHorizontalOverflow(page)
    await checkJourneyA11y(page)
    expect(await page.evaluate(() => localStorage.getItem('clear.workout-amraps'))).toBeNull()
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
