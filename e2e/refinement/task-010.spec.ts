import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import {
  COMPLETION_ANSWERS,
  COOLDOWN_SECTION_TITLE,
  EFFORT_LEGEND,
  EFFORT_WORDS,
  FOR_TIME_WORK_LIST,
  LADDER_CAP,
  LADDER_ROUNDS,
  LADDER_WORK_LIST,
  WORK_COMPLETED,
  completionEffortAcceptance,
  completionEffortSnapshot,
} from '../../src/test/completion-effort-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-010 (REQ-010; C29, C30; R63, R76, R78, R80, R86, R87, R116, R124;
 * AC-C29-01, AC-C30-01, AC-R010-01, AC-R010-02; JOURNEY-010) — completion
 * choices and the existing effort faces on the real `/workout` route.
 *
 * Entry: a running session, behind the existing auth guard, whose first
 * section holds the accepted For Time results sample and the accepted
 * four-round ladder, and whose second is a cooldown
 * (`src/test/completion-effort-fixture.ts`). Action: end each race — by Finish,
 * or by letting the cap run out — choose Complete or Incomplete and an
 * optional effort face, by touch or by keyboard, then correct the result.
 * Result, read from the browser at phone widths: Complete and Incomplete share
 * one row; the answer starts where the tracked work and the clock put it (For
 * Time: Finish Complete, the cap Incomplete; the ladder, with nothing tracked,
 * Incomplete and no rung) and is the athlete's to correct; the existing three
 * faces stay optional and unanswered as null; a reload, a refused save and its
 * retry, the saved row and History keep the answer; effort is never a number.
 *
 * Synthetic and contained: an intercepted session for a fictional user. The
 * browser clock is Playwright's. The only writes allowed are the section's
 * own `block_results` inserts on its forward action — recorded here as the
 * requests the app sent, answered as PostgREST would, never forwarded — and
 * the one History read answers those recorded rows back. This is the app's
 * own write and read contract on a synthetic origin, not backend persistence
 * proof (`e2e/design-0143/workout-ladder.spec.ts` is the ladder's backend lane).
 */
const OWNER = '00000000-0000-4000-8000-000000001001'
const PLACE = '00000000-0000-4000-8000-000000001011'
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
    if (code !== null) throw new Error(`Synthetic TASK-010 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-010 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-010.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-010-public-placeholder',
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
  const running: SessionSnapshot = sessionSnapshotSchema.parse(completionEffortSnapshot(completionEffortAcceptance({ locationId: PLACE }), {
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
      // Each block's own row, exactly as the app sent it. The first may be
      // refused, writing nothing, as a failed save would.
      const body = request.postDataJSON() as BlockResultBody | BlockResultBody[]
      const row = Array.isArray(body) ? body[0] : body
      saves.push(row)
      if (refusals > 0) {
        refusals -= 1
        return reply({ code: 'PGRST000', message: 'Controlled TASK-010 save boundary unavailable.' }, 503)
      }
      const id = `00000000-0000-4000-8000-${String(1100 + stored.size).padStart(12, '0')}`
      const answered = { id, created_at: '2026-11-09T09:10:00.000Z', ...row }
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
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-010 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-010-session', refreshToken: 'synthetic-task-010-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-010@example.invalid' },
    }))
  }, { owner: OWNER })

  const [forTime, ladder] = running.sections[0].blocks.map((entry) => entry.block.id)
  return {
    sessionId: running.session.id,
    forTimeBlockId: forTime,
    ladderBlockId: ladder,
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

/** JOURNEY-010's entry: the running session's `/workout`, the For Time and the ladder ready. */
async function openWorkout(page: Page, visit: (path: string) => Promise<void>) {
  await visit('/workout')
  await expect(page).toHaveURL(/\/workout$/)
  await expect(page.getByRole('list', { name: FOR_TIME_WORK_LIST, exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: LADDER_WORK_LIST, exact: true })).toBeVisible()
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
  return card.getByRole('group', { name: WORK_COMPLETED, exact: true })
}

function effortOf(card: Locator): Locator {
  return card.getByRole('group', { name: EFFORT_LEGEND, exact: true })
}

/** The words of a question's checked answers — none, or one. */
async function chosen(group: Locator): Promise<string[]> {
  return group.getByRole('radio').evaluateAll((radios) =>
    radios.filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.textContent ?? ''))
}

/** One History reading — its label and its value — by the label's exact words. */
function historyReading(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('xpath=..')
}

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number }

interface ChoiceGeometry {
  legend: Box
  row: Box
  chips: Box[]
  words: string[]
  checked: boolean[]
  ticks: number[]
  frames: string[]
  focused: boolean[]
  clipped: boolean[]
}

interface ResultLogGeometry {
  form: Box
  formContent: { left: number; right: number }
  workBottom: number
  title: Box
  groups: Box[]
  completion: ChoiceGeometry | null
  effort: ChoiceGeometry
  selectedRole: string
  unselectedRole: string
}

/**
 * One card's result log, read from the browser once its own finite
 * transitions (the chips' tick fade, on the real document timeline) have
 * landed.
 */
async function readResultLog(card: Locator): Promise<ResultLogGeometry> {
  return card.first().evaluate(async (root, legends) => {
    const settling = root.querySelector('form.clr-timed-log')!.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    await Promise.all(settling.map((animation) => animation.finished.catch(() => undefined)))
    const box = (node: Element): Box => {
      const rect = node.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }
    }
    const probe = (variable: string) => {
      const element = document.createElement('span')
      element.style.color = `var(${variable})`
      root.append(element)
      const color = getComputedStyle(element).color
      element.remove()
      return color
    }
    const form = root.querySelector('form.clr-timed-log')!
    const formStyle = getComputedStyle(form)
    const work = [...root.querySelectorAll('[data-movement-identity], [role="list"], ol, ul')].filter((node) => !form.contains(node))
    const question = (legend: string): ChoiceGeometry | null => {
      const fieldset = [...form.querySelectorAll('fieldset')].find((node) => node.querySelector('legend')?.textContent === legend)
      if (fieldset === undefined) return null
      const row = fieldset.querySelector('[role="radiogroup"]')!
      const radios = [...row.querySelectorAll<HTMLElement>('[role="radio"]')]
      return {
        legend: box(fieldset.querySelector('legend')!),
        row: box(row),
        chips: radios.map((radio) => box(radio)),
        words: radios.map((radio) => radio.textContent ?? ''),
        checked: radios.map((radio) => radio.getAttribute('aria-checked') === 'true'),
        ticks: radios.map((radio) => Number(getComputedStyle(radio.querySelector('svg')!).opacity)),
        frames: radios.map((radio) => getComputedStyle(radio, '::after').backgroundColor),
        focused: radios.map((radio) => radio === document.activeElement),
        clipped: radios.map((radio) => radio.scrollWidth > radio.clientWidth + 1),
      }
    }
    return {
      form: box(form),
      formContent: {
        left: form.getBoundingClientRect().left + parseFloat(formStyle.paddingLeft),
        right: form.getBoundingClientRect().right - parseFloat(formStyle.paddingRight),
      },
      workBottom: Math.max(...work.map((node) => node.getBoundingClientRect().bottom)),
      title: box(form.querySelector('.clr-timed-log__title')!),
      // TASK-015 (C37): the per-movement groups sit between the result and
      // the effort and are not result groups; the two this contract reads
      // are the result group and the effort group.
      groups: [...form.querySelectorAll('.clr-timed-log__group:not(.clr-timed-log__group--movement)')].map(box),
      completion: question(legends.completion),
      effort: question(legends.effort)!,
      selectedRole: probe('--border-selected'),
      unselectedRole: probe('--border-unselected'),
    }
  }, { completion: WORK_COMPLETED, effort: EFFORT_LEGEND })
}

const TOLERANCE = 1
/** `--spacing-600`, the log's gap between its title and groups, in CSS pixels. */
const GROUP_GAP = 24

/** C29, C30 and AC-R010-02 read from the browser: after the work, one row of two answers, then the three faces. */
function expectResultLogContract(geometry: ResultLogGeometry, label: string) {
  expect(geometry.form.top, `${label}: the log after the work`).toBeGreaterThanOrEqual(geometry.workBottom - TOLERANCE)
  expect(geometry.groups, `${label}: the result group, then the effort group`).toHaveLength(2)
  expect(geometry.groups[0].top - geometry.title.bottom, `${label}: the title stands apart`).toBeGreaterThanOrEqual(GROUP_GAP - TOLERANCE)
  expect(geometry.groups[1].top - geometry.groups[0].bottom, `${label}: the groups stand apart`).toBeGreaterThanOrEqual(GROUP_GAP - TOLERANCE)

  // C29: Complete and Incomplete in one row, sharing it evenly, the log's whole width.
  const completion = geometry.completion!
  expect(completion.words, `${label}: the two answers`).toEqual([...COMPLETION_ANSWERS])
  const [complete, incomplete] = completion.chips
  expect(completion.legend.bottom, `${label}: the question above its row`).toBeLessThanOrEqual(completion.row.top + TOLERANCE)
  expect(Math.abs(complete.top - incomplete.top), `${label}: one row`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(complete.height - incomplete.height), `${label}: one row height`).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(complete.width - incomplete.width), `${label}: equal shares`).toBeLessThanOrEqual(TOLERANCE)
  expect(incomplete.left, `${label}: side by side`).toBeGreaterThan(complete.right - TOLERANCE)
  expect(complete.left, `${label}: from the log's start`).toBeLessThanOrEqual(geometry.formContent.left + TOLERANCE)
  expect(incomplete.right, `${label}: to the log's end`).toBeGreaterThanOrEqual(geometry.formContent.right - TOLERANCE)
  expect(completion.clipped, `${label}: neither answer clipped`).toEqual([false, false])

  // C30, AC-R010-02: the three faces, in their one row, unclipped.
  expect(geometry.effort.words, `${label}: the existing faces`).toEqual([...EFFORT_WORDS])
  const faceTops = geometry.effort.chips.map((chip) => chip.top)
  expect(Math.max(...faceTops) - Math.min(...faceTops), `${label}: the faces in one row`).toBeLessThanOrEqual(TOLERANCE)
  expect(geometry.effort.clipped, `${label}: no face clipped`).toEqual([false, false, false])

  // Selection is a tick as well as the selected role; nothing else wears
  // either. (A focused chip's frame wears the shared focus treatment instead.)
  for (const choice of [completion, geometry.effort]) {
    choice.checked.forEach((checked, index) => {
      expect(choice.ticks[index], `${label}: ${choice.words[index]} tick`).toBe(checked ? 1 : 0)
      if (choice.focused[index]) return
      expect(choice.frames[index], `${label}: ${choice.words[index]} frame`).toBe(checked ? geometry.selectedRole : geometry.unselectedRole)
    })
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

/** A saved row's result columns, as the app sent them. */
function resultColumns(body: Record<string, unknown>) {
  const { block_id, elapsed_seconds, completed_under_cap, rounds_completed, partial_round_reps, minutes_completed, highest_rung, perceived_effort, notes } = body
  return { block_id, elapsed_seconds, completed_under_cap, rounds_completed, partial_round_reps, minutes_completed, highest_rung, perceived_effort, notes }
}

const NOTHING_RECORDED = {
  elapsed_seconds: null, completed_under_cap: null, rounds_completed: null, partial_round_reps: null,
  minutes_completed: null, highest_rung: null, perceived_effort: null, notes: null,
}

const storedRace = (page: Page, blockId: string) =>
  page.evaluate((id) => JSON.parse(localStorage.getItem('clear.workout-for-time') ?? '{}')[id] ?? null, blockId)

// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-010 completion choices and existing effort faces', () => {
  test('JOURNEY-010 touch phone-390 Signal: For Time Finish opens Complete beside Incomplete in one row; the athlete corrects to Incomplete and answers effort with a face; a reload, a refused save and its retry, the saved row and History keep the answer, and effort is never a number', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { skin: 'signal', failFirstSave: true })
    await openWorkout(page, visit)
    const card = cardOf(page, FOR_TIME_WORK_LIST)

    // Ready, running and paused: nothing to judge, so no log.
    await expect(logOf(card)).toHaveCount(0)
    await card.getByRole('button', { name: 'Start For Time', exact: true }).tap()
    await pass(page, 30)
    await expect(logOf(card)).toHaveCount(0)
    await card.getByRole('button', { name: 'Pause', exact: true }).tap()
    await expect(logOf(card)).toHaveCount(0)
    await card.getByRole('button', { name: 'Resume', exact: true }).tap()
    await pass(page, 60)
    await card.getByRole('button', { name: 'Finish', exact: true }).tap()

    // Finish under the cap: Complete beside Incomplete, starting at Complete;
    // the three faces unanswered. Nothing is stored until the athlete answers.
    await expect(logOf(card)).toBeVisible()
    await settle(page)
    expect(await chosen(completionOf(card))).toEqual(['Complete'])
    expect(await chosen(effortOf(card))).toEqual([])
    expectResultLogContract(await readResultLog(card), 'For Time finished @phone-390')
    expect(await storedRace(page, app.forTimeBlockId)).not.toHaveProperty('workCompleted')
    await attachCard(page, card, 'for-time-finished-complete-signal-phone-390')

    // Finish proves nothing: the athlete corrects it with one tap.
    await completionOf(card).getByRole('radio', { name: 'Incomplete', exact: true }).tap()
    expect(await chosen(completionOf(card))).toEqual(['Incomplete'])
    expect(await storedRace(page, app.forTimeBlockId)).toMatchObject({ workCompleted: false })

    // Effort: a face, cleared back to unanswered, then another.
    await effortOf(card).getByRole('radio', { name: 'Too hard', exact: true }).tap()
    expect(await chosen(effortOf(card))).toEqual(['Too hard'])
    await card.getByRole('button', { name: 'Clear effort for this block', exact: true }).tap()
    expect(await chosen(effortOf(card))).toEqual([])
    await effortOf(card).getByRole('radio', { name: 'About right', exact: true }).tap()
    await settle(page)
    expectResultLogContract(await readResultLog(card), 'For Time corrected @phone-390')
    await attachCard(page, card, 'for-time-incomplete-effort-signal-phone-390')
    await checkJourneyA11y(page)

    // Close and reopen: the reload keeps the athlete's Incomplete — never the
    // clock's Complete. Effort is a draft held only while the block is open:
    // nothing stores or saves it yet (R116; TASK-030, TASK-031, TASK-047), so
    // it comes back unanswered, never as a guessed face.
    await page.reload()
    await expect(page.getByRole('list', { name: FOR_TIME_WORK_LIST, exact: true })).toBeVisible()
    await settle(page)
    expect(await chosen(completionOf(card))).toEqual(['Incomplete'])
    expect(await chosen(effortOf(card))).toEqual([])
    await expect(card.locator('xpath=ancestor::*[contains(@class,"clr-stack")][1]').getByRole('timer', { name: 'Block time', exact: true })).toContainText('01:30')
    await effortOf(card).getByRole('radio', { name: 'Too easy', exact: true }).tap()

    // The forward action saves; the first save is refused. The athlete stays,
    // with nothing discarded and nothing filled in.
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('That didn’t save')
    expect(await chosen(completionOf(card))).toEqual(['Incomplete'])
    expect(await chosen(effortOf(card))).toEqual(['Too easy'])
    await dialog.getByRole('button', { name: 'Try again', exact: true }).tap()
    await expect(page.getByRole('heading', { name: COOLDOWN_SECTION_TITLE, exact: true })).toBeVisible()

    // The For Time's row, both times it was sent: the athlete's Incomplete as
    // false, the time it took — and the face never turned into a number. The
    // ladder nobody started records nothing.
    const forTimeRows = app.saves.filter((body) => body.block_id === app.forTimeBlockId)
    expect(forTimeRows).toHaveLength(2)
    for (const body of forTimeRows) {
      expect(resultColumns(body)).toEqual({ ...NOTHING_RECORDED, block_id: app.forTimeBlockId, elapsed_seconds: 90, completed_under_cap: false })
    }
    const ladderRows = app.saves.filter((body) => body.block_id === app.ladderBlockId)
    expect(ladderRows.map(resultColumns)).toEqual([{ ...NOTHING_RECORDED, block_id: app.ladderBlockId }])
    // TASK-015 (AC-R015-02; MIG-A applied by the owner's LIVE-PRE-1): the
    // chosen face travels with the For Time's row as its categorical `effort`
    // — the category word, in its own column — while the numeric effort
    // column stays null and no category is ever written into it. The ladder,
    // with no face chosen, names no effort column at all.
    for (const body of forTimeRows) {
      expect(body.effort).toBe('too_easy')
      expect(body.perceived_effort).toBeNull()
      expect(Object.keys(body).sort()).toEqual([...Object.keys(resultColumns(body)), 'effort'].sort())
    }
    for (const body of ladderRows) {
      expect(JSON.stringify(body)).not.toMatch(/too_hard|about_right|too_easy/)
      expect(Object.keys(body).sort()).toEqual(Object.keys(resultColumns(body)).sort())
    }

    // History reads the row back: stopped before its cap, as Incomplete.
    await visit(`/history/${app.sessionId}`)
    await expect(historyReading(page, 'Cap')).toHaveText('CapIncomplete')
    await expect(historyReading(page, 'Elapsed')).toHaveText('Elapsed01:30')
    await expect(page.getByText('Effort', { exact: true })).toHaveCount(0)
    await test.info().attach('history-for-time-incomplete-signal-phone-390.png', { body: await page.screenshot({ caret: 'hide' }), contentType: 'image/png' })
    app.assertContained()
  })

  test('JOURNEY-010 keyboard phone-320 reduced motion: the ladder’s cap opens Incomplete with no rung; Complete and the effort faces are reached and chosen by keyboard; the saved row records the top rung and no effort', async ({ page, visit }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, { skin: 'clear', reducedMotion: true })
    await openWorkout(page, visit)
    const card = cardOf(page, LADDER_WORK_LIST)

    // Before the attempt ends the question is there, unanswered.
    expect(await chosen(completionOf(card))).toEqual([])
    const start = card.getByRole('button', { name: 'Start ladder', exact: true })
    await start.focus()
    await page.keyboard.press('Enter')
    await expect(card.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await pass(page, LADDER_CAP + 5)

    // The cap with nothing tracked: Incomplete, and how far is asked — no rung claimed.
    // TASK-013 (C33, C34): how far is the log's rep-first "Rounds completed",
    // in place of the rung radios: no tile pressed, and no count of zero.
    await expect.poll(() => chosen(completionOf(card))).toEqual(['Incomplete'])
    const howFar = card.getByRole('group', { name: 'Rounds completed', exact: true })
    await expect(howFar).toBeVisible()
    await expect(howFar.locator('button[aria-pressed="true"]')).toHaveCount(0)
    await expect(howFar.getByRole('status')).toHaveText('No rounds marked yet')
    await settle(page)
    expectResultLogContract(await readResultLog(card), 'ladder capped @phone-320')
    await noHorizontalOverflow(page)
    await attachCard(page, card, 'ladder-cap-incomplete-reduced-phone-320')

    // Keyboard: the row is one stop on the chosen answer; the arrows choose.
    const incomplete = completionOf(card).getByRole('radio', { name: 'Incomplete', exact: true })
    await incomplete.focus()
    await page.keyboard.press('ArrowLeft')
    const complete = completionOf(card).getByRole('radio', { name: 'Complete', exact: true })
    await expect(complete).toBeFocused()
    expect(await chosen(completionOf(card))).toEqual(['Complete'])
    // TASK-013 (C34, C36; R69): Complete reads every rung completed, pressed
    // and counted, still correctable in the log.
    await expect(howFar.locator('button[aria-pressed="true"]')).toHaveCount(LADDER_ROUNDS)
    await expect(howFar.getByRole('status')).toHaveText(`${LADDER_ROUNDS} of ${LADDER_ROUNDS} rounds completed`)

    // TASK-013 (C34): each rung is now a real control, so Tab passes through
    // the rounds — one stop each, in order — before the faces.
    for (let round = 1; round <= LADDER_ROUNDS; round += 1) {
      await page.keyboard.press('Tab')
      await expect(howFar.getByRole('button', { name: new RegExp(`^Round ${round}: `) })).toBeFocused()
    }

    // Tab reaches the faces' one stop; Home/End and the arrows choose; Tab
    // reaches the compact Clear, which hands the caret back to the question.
    await page.keyboard.press('Tab')
    await expect(effortOf(card).getByRole('radio', { name: 'Too hard', exact: true })).toBeFocused()
    await page.keyboard.press('End')
    await expect(effortOf(card).getByRole('radio', { name: 'Too easy', exact: true })).toBeFocused()
    expect(await chosen(effortOf(card))).toEqual(['Too easy'])
    await page.keyboard.press('Home')
    expect(await chosen(effortOf(card))).toEqual(['Too hard'])
    await page.keyboard.press('ArrowRight')
    await expect(effortOf(card).getByRole('radio', { name: 'About right', exact: true })).toBeFocused()
    expect(await chosen(effortOf(card))).toEqual(['About right'])
    await page.keyboard.press('Tab')
    await expect(card.getByRole('button', { name: 'Clear effort for this block', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    expect(await chosen(effortOf(card))).toEqual([])
    await expect(effortOf(card).getByRole('radio', { name: 'Too hard', exact: true })).toBeFocused()
    await page.keyboard.press('Space')
    expect(await chosen(effortOf(card))).toEqual(['Too hard'])

    // Reduced motion: nothing in the log moves or loops beyond the app's hard cut.
    const timings = await logOf(card).evaluate((form) => form.getAnimations({ subtree: true }).map((animation) => {
      const timing = animation.effect!.getComputedTiming()
      return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
    }))
    for (const timing of timings) {
      expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
      expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
    }
    await settle(page)
    expectResultLogContract(await readResultLog(card), 'ladder complete @phone-320')
    await noHorizontalOverflow(page)
    await attachCard(page, card, 'ladder-complete-effort-keyboard-reduced-phone-320')
    await checkJourneyA11y(page)

    // Saved by keyboard: the top rung the athlete declared, nothing from the
    // clock, and no effort.
    const next = page.getByRole('button', { name: 'Next section', exact: true })
    await next.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: COOLDOWN_SECTION_TITLE, exact: true })).toBeVisible()
    expect(app.saves.map(resultColumns)).toEqual([
      { ...NOTHING_RECORDED, block_id: app.forTimeBlockId },
      { ...NOTHING_RECORDED, block_id: app.ladderBlockId, highest_rung: LADDER_ROUNDS },
    ])

    await visit(`/history/${app.sessionId}`)
    await expect(historyReading(page, 'Highest rung')).toHaveText(`Highest rung${LADDER_ROUNDS}`)
    await expect(page.getByText('Effort', { exact: true })).toHaveCount(0)
    app.assertContained()
  })

  test('JOURNEY-010 gallery for_time and ladder phone-390: the route’s own logs, completion at the route’s starting point and the effort faces unanswered, live over memory only, with no network', async ({ page, visit }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await installDeterministicCapture(page, { skin: 'signal', reducedMotion: true })
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
    })

    const states = [
      { id: 'for_time', title: 'For Time results', list: FOR_TIME_WORK_LIST, attempts: [['for-time-finish', 'Complete'], ['for-time-cap', 'Incomplete']] },
      { id: 'ladder', title: 'Ladder results', list: LADDER_WORK_LIST, attempts: [['ladder-finish', 'Incomplete'], ['ladder-cap', 'Incomplete']] },
    ] as const
    for (const state of states) {
      await visit(`/gallery/refinements?state=${state.id}`)
      const root = page.locator(`[data-refinement-state="${state.id}"]`)
      await expect(root.getByRole('heading', { name: state.title, exact: true })).toBeVisible()
      for (const [attempt, starts] of state.attempts) {
        const scope = root.locator(`[data-gallery-race="${attempt}"]`)
        const card = cardOf(scope, state.list)
        await expect(logOf(card)).toBeVisible()
        await settle(page)
        expect(await chosen(completionOf(card)), attempt).toEqual([starts])
        expect(await chosen(effortOf(card)), attempt).toEqual([])
        expectResultLogContract(await readResultLog(card), `gallery ${attempt}`)
        if (state.id === 'ladder') {
          // TASK-013 (C33, C34): how far is the log's rep-first "Rounds completed", nothing stated.
          const rounds = card.getByRole('group', { name: 'Rounds completed', exact: true })
          await expect(rounds).toBeVisible()
          await expect(rounds.getByRole('status')).toHaveText('No rounds marked yet')
        }
        await test.info().attach(`gallery-${attempt}-signal-phone-390.png`, { body: await scope.screenshot({ caret: 'hide' }), contentType: 'image/png' })
      }
      // Live over memory only.
      const finish = cardOf(root.locator(`[data-gallery-race="${state.attempts[0][0]}"]`), state.list)
      const other = state.id === 'for_time' ? 'Incomplete' : 'Complete'
      await completionOf(finish).getByRole('radio', { name: other, exact: true }).tap()
      expect(await chosen(completionOf(finish))).toEqual([other])
      await effortOf(finish).getByRole('radio', { name: 'About right', exact: true }).tap()
      expect(await chosen(effortOf(finish))).toEqual(['About right'])
      await noHorizontalOverflow(page)
      await checkJourneyA11y(page)
    }
    expect(await page.evaluate(() => localStorage.getItem('clear.workout-for-time'))).toBeNull()
    expect(await page.evaluate(() => localStorage.getItem('clear.workout-ladders'))).toBeNull()
    expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
  })
})
