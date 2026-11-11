import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { sessionSnapshotSchema, type SessionSnapshot } from '../../src/state/schemas'
import {
  COOLDOWN_SECTION_TITLE as EMOM_COOLDOWN_TITLE,
  EMOM_MINUTES,
  EMOM_NOTES_LABEL,
  EMOM_WORK_LIST,
  emomEndLogAcceptance,
  emomEndLogSnapshot,
} from '../../src/test/emom-end-log-fixture'
import {
  ACTUALS_AMRAP_WORK_LIST,
  ACTUALS_FOR_TIME_WORK_LIST,
  ACTUALS_LADDER_WORK_LIST,
  ACTUALS_RACE_SECTION_TITLE,
  ACTUALS_SECTION_TITLE,
  timedActualsAcceptance,
  timedActualsSnapshot,
} from '../../src/test/timed-actuals-fixture'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-046 (REQ-019; C45; G07; R43, R82, R100, R115, R116;
 * TASK-AC-1C4999D342BC, TASK-AC-47129E192333, TASK-AC-E2222DBA54CA;
 * foundation provider for JOURNEY-019) — the four timed-result families adopt
 * the shared focused logging dialog through their real entry points on
 * `/workout`: the EMOM's end of schedule, the AMRAP's closed window, For
 * Time's finish or cap and the ladder's log.
 *
 * Entry (ENTRY-019): a running session behind the existing auth guard, on a
 * contained synthetic account — the EMOM end-log session
 * (`emom-end-log-fixture.ts`) and the per-movement actuals session with an
 * AMRAP, a single-pass For Time and a four-rung ladder
 * (`timed-actuals-fixture.ts`). Action: run each attempt, open its log from
 * the card's "Log results" action, enter or correct, close and reopen, save
 * through the section's forward action and retry a refused save.
 *
 * Result: each log is the native modal `LoggingOverlay` titled "Log results"
 * — the framed icon-only "Close log" X focused on open, the Balanced
 * backdrop, the workout behind inert — holding the family's own fields
 * (notes; rounds and partial reps; Work completed, rounds, movement entries
 * and effort) and nothing of another family's. The X and Escape keep every
 * entry; the clocks run on behind it; the ladder's Undo finish closes it and
 * resumes the attempt; a refused save keeps every entry and its retry writes
 * the same rows through the section's one forward action (the original
 * writer: `block_results`, then `block_movement_results`).
 *
 * Synthetic and contained: intercepted reads and writes for a fictional
 * user, answered as PostgREST would and never forwarded. The accepted gallery
 * states (reference eded158cfd928d382c9a9409e2c372270312741d) are the route's
 * own blocks over memory and read nothing over the network.
 */
const OWNER = '00000000-0000-4000-8000-000000004601'
const PLACE = '00000000-0000-4000-8000-000000004611'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The browser's clock at entry; the session has run for one minute. */
const ENTRY = Date.parse('2026-11-11T09:00:00.000Z')
const SKINS = ['clear', 'vapour', 'signal', 'mono'] as const
const LOG_TITLE = 'Log results'
const UNDO_FINISH = 'Undo finish · Resume ladder'
const EXCEPTION_NOTE = 'Dropped to 10 swings from minute 7.'

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
    if (code !== null) throw new Error(`Synthetic TASK-046 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-046 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-046.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-046-public-placeholder',
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

type Skin = (typeof SKINS)[number]
type Row = Record<string, unknown>
interface Sent { method: string; table: string; filter: string | null; body: Row | null; refused: boolean }

const UNIQUE_VIOLATION = { code: '23505', message: 'duplicate key value violates unique constraint', details: null }

async function syntheticApp(
  page: Page,
  running: SessionSnapshot,
  options: { skin?: Skin; reducedMotion?: boolean; refuseFirstBlockWrite?: boolean } = {},
) {
  const sent: Sent[] = []
  const blockRows = new Map<string, Row>()
  const movementRows = new Map<string, Row>()
  const unexpected: string[] = []
  let refusals = options.refuseFirstBlockWrite ? 1 : 0
  let minted = 0
  const mint = () => `00000000-0000-4000-8000-${String(4600 + (minted += 1)).padStart(12, '0')}`
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
        if (refusals > 0) {
          refusals -= 1
          sent.push({ method: 'POST', table: 'block_results', filter: null, body: row, refused: true })
          return reply({ code: 'PGRST000', message: 'Controlled TASK-046 save boundary unavailable.' }, 503)
        }
        sent.push({ method: 'POST', table: 'block_results', filter: null, body: row, refused: false })
        const blockId = String(row?.block_id)
        if (blockRows.has(blockId)) return reply(UNIQUE_VIOLATION, 409)
        const answered = { id: mint(), created_at: '2026-11-11T09:10:00.000Z', effort: null, ...row }
        blockRows.set(blockId, answered)
        return reply([answered], 201)
      }
      if (request.method() === 'PATCH') {
        const blockId = filterOf(url, 'block_id')
        sent.push({ method: 'PATCH', table: 'block_results', filter: blockId, body: row, refused: false })
        const stored = blockId === null ? undefined : blockRows.get(blockId)
        if (stored === undefined) return reply([], 200)
        const corrected = { ...stored, ...row }
        blockRows.set(blockId!, corrected)
        return reply([corrected], 200)
      }
    }
    if (url.pathname.endsWith('/rest/v1/block_movement_results')) {
      const exerciseId = request.method() === 'POST' ? String(row?.workout_exercise_id) : filterOf(url, 'workout_exercise_id')
      sent.push({ method: request.method(), table: 'block_movement_results', filter: request.method() === 'POST' ? null : exerciseId, body: row, refused: false })
      if (request.method() === 'POST') {
        if (movementRows.has(exerciseId!)) return reply(UNIQUE_VIOLATION, 409)
        const answered = { prescription_revision_status: 'active', created_at: '2026-11-11T09:10:00.000Z', updated_at: '2026-11-11T09:10:00.000Z', ...row }
        movementRows.set(exerciseId!, answered)
        return reply([answered], 201)
      }
      if (request.method() === 'PATCH') {
        const stored = exerciseId === null ? undefined : movementRows.get(exerciseId)
        if (stored === undefined) return reply([], 200)
        const restated = { ...stored, ...row }
        movementRows.set(exerciseId!, restated)
        return reply([restated], 200)
      }
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(running)
      if (name === 'session_as_performed') {
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
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-046 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-046-session', refreshToken: 'synthetic-task-046-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-046@example.invalid' },
    }))
  }, { owner: OWNER })

  const blocks = running.sections[0].blocks
  return {
    blockIds: blocks.map((block) => block.block.id),
    exerciseIds: blocks.map((block) => block.exercises.map((entry) => entry.exercise.id)),
    sent,
    blockRow: (blockId: string) => blockRows.get(blockId) ?? null,
    movementRow: (exerciseId: string) => movementRows.get(exerciseId) ?? null,
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

const emomSession = () => sessionSnapshotSchema.parse(emomEndLogSnapshot(emomEndLogAcceptance({ locationId: PLACE }), {
  userId: OWNER, startedAt: new Date(ENTRY - 60_000).toISOString(),
}))
const actualsSession = () => sessionSnapshotSchema.parse(timedActualsSnapshot(timedActualsAcceptance({ locationId: PLACE }), {
  userId: OWNER, startedAt: new Date(ENTRY - 60_000).toISOString(),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await Promise.all([...document.fonts].map((face) => face.load().catch(() => undefined)))
    await document.fonts.ready
  })
}

async function pass(page: Page, seconds: number) {
  await page.clock.runFor(seconds * 1000)
}

function cardOf(scope: Page | Locator, list: string): Locator {
  const page = 'page' in scope ? scope.page() : scope
  return scope.locator('[data-workout-card="workout"]').filter({
    has: page.getByRole('list', { name: list, exact: true }),
  })
}

/** The open focused logging dialog (any title). */
const openLog = (page: Page) => page.locator('dialog.clr-accepted-log[open]')
/** The card's one "Log results" action. */
const openerOf = (card: Locator) => card.locator('[data-timed-log-opener]').getByRole('button', { name: LOG_TITLE, exact: true })

/**
 * The selected focused dialog, open over an inert screen: the native modal
 * named "Log results", the framed icon-only "Close log" X in its header (the
 * opening focus), the Balanced backdrop; the family's one form named by the
 * dialog's title, with no title of its own.
 */
async function expectFocusedLog(page: Page, format: 'emom' | 'amrap' | 'for_time' | 'ladder') {
  const dialog = page.getByRole('dialog', { name: LOG_TITLE, exact: true })
  await expect(dialog).toBeVisible()
  await expect(openLog(page)).toHaveCount(1)
  expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true)
  const head = dialog.locator('[data-logging-head]')
  await expect(head.getByRole('heading', { name: LOG_TITLE, exact: true })).toBeVisible()
  const close = head.getByRole('button', { name: 'Close log', exact: true })
  await expect(close).toBeVisible()
  await expect(close).toBeFocused()
  expect((await close.textContent())?.trim()).toBe('')
  expect(await close.evaluate((node) => ({
    framed: ['clr-chamfer', 'clr-btn', 'clr-hit'].every((name) => node.classList.contains(name)),
    quiet: node.classList.contains('clr-btn--quiet'),
    bleed: node.parentElement?.classList.contains('clr-bleed') ?? false,
    glyph: node.querySelector('svg') !== null,
  }))).toEqual({ framed: true, quiet: false, bleed: true, glyph: true })
  expect(await dialog.evaluate((node) => getComputedStyle(node, '::backdrop').backdropFilter)).toMatch(/blur\(/)
  // The family's one form: named by the dialog's title, no heading of its own.
  const form = dialog.locator('form.clr-timed-log')
  await expect(form).toHaveCount(1)
  await expect(form).toHaveAttribute('data-timed-format', format)
  expect(await form.evaluate((node) => {
    const labelled = node.getAttribute('aria-labelledby')
    return labelled !== null && document.getElementById(labelled)?.textContent === 'Log results'
  })).toBe(true)
  await expect(form.getByRole('heading', { name: LOG_TITLE, exact: true })).toHaveCount(0)
  // No other family's fields: no set entry, no workout feedback, no rest-day reason.
  await expect(dialog.getByRole('group', { name: 'How do you feel?', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('combobox')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /^Log set|^Log round|^Save/ })).toHaveCount(0)
  // Inert behind: nothing on the screen can take focus while it is open.
  const behind = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    const controls = [...document.querySelectorAll<HTMLElement>('main#main button, main#main input, main#main textarea, .clr-workout-footer button')]
    const reachable = controls.filter((control) => {
      control.focus()
      return document.activeElement === control
    }).length
    active?.focus()
    return reachable
  })
  expect(behind).toBe(0)
  return { dialog, form }
}

async function closeWithX(page: Page, opener: Locator) {
  await openLog(page).getByRole('button', { name: 'Close log', exact: true }).click()
  await expect(openLog(page)).toHaveCount(0)
  await expect(opener).toBeFocused()
}

async function chosen(group: Locator): Promise<string[]> {
  return group.getByRole('radio').evaluateAll((radios) =>
    radios.filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.textContent ?? ''))
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

async function attachScreen(page: Page, name: string) {
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ animations: 'disabled', caret: 'hide' }), contentType: 'image/png' })
}

/** `a` follows `b` in the document. */
async function follows(a: Locator, b: Locator): Promise<boolean> {
  const handle = await b.elementHandle()
  return a.evaluate((node, other) => (other!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, handle)
}

/** The stack beside a card: its block clock. */
const clockOf = (card: Locator) => card.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " clr-stack ")][1]').getByRole('timer').first()

function seconds(text: string | null): number {
  const digits = /(\d\d):(\d\d)/.exec(text ?? '')
  if (digits === null) throw new Error(`no clock digits in ${text}`)
  return Number(digits[1]) * 60 + Number(digits[2])
}

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-046 the four timed-result families in the shared focused dialog', () => {
  test('JOURNEY-019 EMOM phone-390 touch: the end of the schedule offers a real Log results action that opens the counter-free end log in the modal dialog, close and Escape keep the note, a refused save keeps it and its retry writes it once to the block’s notes through the section’s forward action', async ({ page, visit, checkA11y }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, emomSession(), { skin: 'clear', refuseFirstBlockWrite: true })
    await visit('/workout')
    await expect(page.getByRole('list', { name: EMOM_WORK_LIST, exact: true })).toBeVisible()
    await settle(page)
    const card = cardOf(page, EMOM_WORK_LIST)
    const opener = openerOf(card)

    // Ready, running and paused: no log is offered.
    await expect(card.locator('[data-timed-log-opener]')).toHaveCount(0)
    await card.getByRole('button', { name: 'Start EMOM', exact: true }).tap()
    await pass(page, 75)
    await card.getByRole('button', { name: 'Pause', exact: true }).tap()
    await expect(card.locator('[data-timed-log-opener]')).toHaveCount(0)
    await card.getByRole('button', { name: 'Resume', exact: true }).tap()

    // Every prescribed minute runs: R43's real Log action, primary, in the
    // shared action row after the work and before the card's coaching.
    await pass(page, EMOM_MINUTES * 60)
    await expect(card.getByText('COMPLETE', { exact: true })).toBeVisible()
    await expect(opener).toBeVisible()
    await expect(opener).toHaveClass(/clr-btn--primary/)
    await expect(card.locator('[data-timed-log-opener]')).toHaveClass(/clr-timed-actions/)
    expect(await follows(opener, card.getByRole('list', { name: EMOM_WORK_LIST, exact: true }))).toBe(true)
    expect(await follows(card.locator('[data-coaching-group]'), opener)).toBe(true)
    await expect(card.locator('form.clr-timed-log')).toHaveCount(0)
    await expect(card.getByText(/The clock has run every prescribed minute/)).toHaveCount(0)

    // The log: the EMOM's own end log — the optional notes alone, no minutes
    // counter, no completion question, no effort.
    await opener.tap()
    const { dialog, form } = await expectFocusedLog(page, 'emom')
    await expect(opener).toHaveAttribute('aria-expanded', 'true')
    const notes = form.getByRole('textbox', { name: EMOM_NOTES_LABEL, exact: true })
    await expect(notes).toHaveValue('')
    await expect(form.locator('output, .clr-quantity, input[type="number"], [role="radiogroup"]')).toHaveCount(0)
    await expect(form.getByText(/minutes? completed/i)).toHaveCount(0)
    await notes.tap()
    await notes.fill(EXCEPTION_NOTE)
    await noHorizontalOverflow(page)
    await checkA11y()
    await attachScreen(page, 'emom-end-log-dialog-clear-phone-390')

    // Close with the X: the note is the block's draft and comes back.
    await closeWithX(page, opener)
    await expect(opener).toHaveAttribute('aria-expanded', 'false')
    await opener.tap()
    await expectFocusedLog(page, 'emom')
    await expect(dialog.getByRole('textbox', { name: EMOM_NOTES_LABEL, exact: true })).toHaveValue(EXCEPTION_NOTE)
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(opener).toBeFocused()
    // The clock record was never touched by the note.
    expect(await page.evaluate((id) => JSON.parse(localStorage.getItem('clear.workout-emom') ?? '{}')[id] ?? null, app.blockIds[0]))
      .not.toHaveProperty('notes')

    // The section's forward action is the writer. The first save is refused:
    // the athlete stays, and the reopened log still holds the note.
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    const failed = page.getByRole('dialog', { name: /didn’t save/ })
    await expect(failed).toBeVisible()
    await failed.getByRole('button', { name: 'Close', exact: true }).tap()
    await expect(failed).toHaveCount(0)
    await opener.tap()
    await expectFocusedLog(page, 'emom')
    await expect(dialog.getByRole('textbox', { name: EMOM_NOTES_LABEL, exact: true })).toHaveValue(EXCEPTION_NOTE)
    await closeWithX(page, opener)
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    await expect(page.getByRole('heading', { name: EMOM_COOLDOWN_TITLE, exact: true })).toBeVisible()

    // Both attempts sent the same row: the note as written, no minutes tally.
    const writes = app.sent.filter((write) => write.table === 'block_results')
    expect(writes.map((write) => [write.method, write.refused])).toEqual([['POST', true], ['POST', false]])
    for (const write of writes) {
      expect(write.body).toMatchObject({ block_id: app.blockIds[0], notes: EXCEPTION_NOTE, minutes_completed: null, elapsed_seconds: null, perceived_effort: null })
    }
    app.assertContained()
  })

  test('JOURNEY-019 AMRAP, For Time and ladder phone-320 keyboard reduced motion: each log opens from its card into the modal dialog with its own fields, the clock runs on behind it, Undo finish closes it and resumes the ladder, close and Escape keep every entry, a refused save keeps them and its retry writes each block’s row and movement rows once, and the saved log is no longer offered', async ({ page, visit, checkA11y }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, actualsSession(), { skin: 'clear', reducedMotion: true, refuseFirstBlockWrite: true })
    await visit('/workout')
    await expect(page.getByRole('list', { name: ACTUALS_LADDER_WORK_LIST, exact: true })).toBeVisible()
    await settle(page)
    const [amrapId, forTimeId, ladderId] = app.blockIds
    const [, , [goblet]] = app.exerciseIds
    const amrap = cardOf(page, ACTUALS_AMRAP_WORK_LIST)
    const forTime = cardOf(page, ACTUALS_FOR_TIME_WORK_LIST)
    const ladder = cardOf(page, ACTUALS_LADDER_WORK_LIST)
    const press = async (control: Locator, key = 'Enter') => {
      await control.focus()
      await page.keyboard.press(key)
    }

    // ── Ladder: its log is drawn before the attempt ends, so its action is
    // secondary beside Start; the race clock runs on behind the open log. ──
    await expect(amrap.locator('[data-timed-log-opener]')).toHaveCount(0)
    await expect(forTime.locator('[data-timed-log-opener]')).toHaveCount(0)
    const ladderOpener = openerOf(ladder)
    await expect(ladderOpener).not.toHaveClass(/clr-btn--primary/)
    await press(ladder.getByRole('button', { name: 'Start ladder', exact: true }))
    await pass(page, 40)
    const before = seconds(await clockOf(ladder).textContent())
    await press(ladderOpener)
    let log = await expectFocusedLog(page, 'ladder')
    expect(await chosen(log.form.getByRole('group', { name: 'Work completed', exact: true }))).toEqual([])
    await pass(page, 30)
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(ladderOpener).toBeFocused()
    expect(Math.abs(seconds(await clockOf(ladder).textContent()) - before)).toBe(30)

    // Two rounds checked live, then Finish: the action turns primary and the
    // log carries the two rounds in, Incomplete.
    const live = ladder.getByRole('list', { name: ACTUALS_LADDER_WORK_LIST, exact: true })
    await press(live.getByRole('button', { name: /^Round 2\b/ }))
    await press(ladder.getByRole('button', { name: 'Finish', exact: true }))
    await expect(ladderOpener).toHaveClass(/clr-btn--primary/)
    await press(ladderOpener)
    log = await expectFocusedLog(page, 'ladder')
    expect(await chosen(log.form.getByRole('group', { name: 'Work completed', exact: true }))).toEqual(['Incomplete'])
    await expect(log.form.getByRole('group', { name: 'Rounds completed', exact: true }).getByRole('status')).toHaveText(/^2 of 4 rounds completed/)

    // Undo finish, by keyboard: the log closes in the same act, the attempt
    // runs again with its two rounds, and the focus is on its Pause.
    await press(log.form.getByRole('button', { name: UNDO_FINISH, exact: true }))
    await expect(openLog(page)).toHaveCount(0)
    await expect(ladder.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()
    await expect(live.getByRole('button', { name: /^Round 2\b/ })).toHaveAttribute('aria-pressed', 'true')
    await pass(page, 20)
    await press(ladder.getByRole('button', { name: 'Finish', exact: true }))
    await press(ladderOpener)
    log = await expectFocusedLog(page, 'ladder')
    const gobletAmount = log.form.getByRole('spinbutton', { name: 'Round 3 · goblet squat', exact: true })
    const gobletLoad = log.form.getByRole('spinbutton', { name: 'Weight · goblet squat', exact: true })
    await gobletAmount.focus()
    await page.keyboard.type('5')
    await page.keyboard.press('Tab')
    await expect(gobletLoad).toBeFocused()
    await page.keyboard.type('16')
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await press(ladderOpener)
    log = await expectFocusedLog(page, 'ladder')
    await expect(log.form.getByRole('spinbutton', { name: 'Round 3 · goblet squat', exact: true })).toHaveValue('5')
    await expect(log.form.getByRole('spinbutton', { name: 'Weight · goblet squat', exact: true })).toHaveValue('16')
    // Reduced motion: nothing in the log moves or loops beyond the hard cut.
    const timings = await log.form.evaluate((form) => form.getAnimations({ subtree: true }).map((animation) => {
      const timing = animation.effect!.getComputedTiming()
      return { duration: Number(timing.duration), iterations: Number(timing.iterations) }
    }))
    for (const timing of timings) {
      expect(timing.duration, JSON.stringify(timings)).toBeLessThanOrEqual(0.01)
      expect(timing.iterations, JSON.stringify(timings)).toBeLessThanOrEqual(1)
    }
    await noHorizontalOverflow(page)
    await checkA11y()
    await attachScreen(page, 'ladder-log-dialog-reduced-phone-320')
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)

    // ── AMRAP: Finish early; the counts in the log, by keyboard ──
    await press(amrap.getByRole('button', { name: 'Start AMRAP', exact: true }))
    await pass(page, 120)
    await press(amrap.getByRole('button', { name: 'Finish early', exact: true }))
    const amrapOpener = openerOf(amrap)
    await expect(amrapOpener).toHaveClass(/clr-btn--primary/)
    await press(amrapOpener)
    log = await expectFocusedLog(page, 'amrap')
    await expect(log.form.getByRole('group', { name: 'Work completed', exact: true })).toHaveCount(0)
    await press(log.form.getByRole('button', { name: 'Increase rounds completed', exact: true }))
    await page.keyboard.press('Enter')
    await expect(log.form.getByRole('status', { name: 'Rounds completed', exact: true })).toHaveText('2')
    await expect(log.form.getByRole('status', { name: 'Reps into the next round', exact: true })).toHaveAttribute('data-quantity-value', 'blank')
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(amrapOpener).toBeFocused()
    await press(amrapOpener)
    log = await expectFocusedLog(page, 'amrap')
    await expect(log.form.getByRole('status', { name: 'Rounds completed', exact: true })).toHaveText('2')
    await page.keyboard.press('Escape')

    // ── For Time: Finish under the cap starts at Complete; corrected to
    // Incomplete with an effort; the clock stopped at the finish. ──
    await press(forTime.getByRole('button', { name: 'Start For Time', exact: true }))
    await pass(page, 90)
    await press(forTime.getByRole('button', { name: 'Finish', exact: true }))
    const forTimeOpener = openerOf(forTime)
    await press(forTimeOpener)
    log = await expectFocusedLog(page, 'for_time')
    const completion = log.form.getByRole('group', { name: 'Work completed', exact: true })
    expect(await chosen(completion)).toEqual(['Complete'])
    await press(completion.getByRole('radio', { name: 'Incomplete', exact: true }), 'Space')
    await expect.poll(() => chosen(completion)).toEqual(['Incomplete'])
    await press(log.form.getByRole('group', { name: 'Effort · optional', exact: true }).getByRole('radio', { name: 'Too hard', exact: true }), 'Space')
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(forTimeOpener).toBeFocused()

    // ── Save: the section's one forward action. The first block write is
    // refused; every log keeps its entries for the retry. ──
    await press(page.getByRole('button', { name: 'Next section', exact: true }))
    const failed = page.getByRole('dialog', { name: /didn’t save/ })
    await expect(failed).toBeVisible()
    await press(failed.getByRole('button', { name: 'Close', exact: true }))
    await expect(failed).toHaveCount(0)
    await press(forTimeOpener)
    log = await expectFocusedLog(page, 'for_time')
    expect(await chosen(log.form.getByRole('group', { name: 'Work completed', exact: true }))).toEqual(['Incomplete'])
    expect(await chosen(log.form.getByRole('group', { name: 'Effort · optional', exact: true }))).toEqual(['Too hard'])
    await page.keyboard.press('Escape')
    await press(amrapOpener)
    log = await expectFocusedLog(page, 'amrap')
    await expect(log.form.getByRole('status', { name: 'Rounds completed', exact: true })).toHaveText('2')
    await page.keyboard.press('Escape')
    await press(page.getByRole('button', { name: 'Next section', exact: true }))
    await expect(page.getByRole('heading', { name: ACTUALS_RACE_SECTION_TITLE, exact: true })).toBeVisible()

    // The rows the original writers sent: each block once, the movement entry once.
    const blockWrites = app.sent.filter((write) => write.table === 'block_results' && write.method === 'POST')
    expect(blockWrites.filter((write) => write.refused)).toHaveLength(1)
    expect(app.blockRow(amrapId)).toMatchObject({ rounds_completed: 2, partial_round_reps: null, elapsed_seconds: 120, perceived_effort: null })
    expect(app.blockRow(forTimeId)).toMatchObject({ completed_under_cap: false, elapsed_seconds: 90, effort: 'too_hard', perceived_effort: null })
    expect(app.blockRow(ladderId)).toMatchObject({ highest_rung: 2, perceived_effort: null })
    expect(app.movementRow(goblet)).toMatchObject({ workout_exercise_id: goblet, round_number: 3, actual_reps: 5, weight: 16 })
    expect(app.sent.filter((write) => write.table === 'block_movement_results' && write.method === 'POST')).toHaveLength(1)

    // Back to the saved section: the For Time's log keeps its saved answer and
    // no longer offers it — there is no correction writer for a saved row.
    await press(page.getByRole('button', { name: 'Previous', exact: true }))
    await expect(page.getByRole('heading', { name: ACTUALS_SECTION_TITLE, exact: true })).toBeVisible()
    await expect(forTime.getByText('Block saved', { exact: true })).toBeVisible()
    await press(forTimeOpener)
    log = await expectFocusedLog(page, 'for_time')
    for (const radio of await log.form.getByRole('group', { name: 'Work completed', exact: true }).getByRole('radio').all()) {
      await expect(radio).toBeDisabled()
    }
    expect(await chosen(log.form.getByRole('group', { name: 'Work completed', exact: true }))).toEqual(['Incomplete'])
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    app.assertContained()
  })

  for (const skin of SKINS) {
    test(`accepted gallery states ${skin} phone-390: emom, amrap, for_time and ladder open the route’s own log from its card into the focused dialog, close and reopen keep the entry, with nothing read or written over the network`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(150_000)
      await page.setViewportSize({ width: 390, height: 844 })
      await installDeterministicCapture(page, { skin, reducedMotion: true })
      const requests: string[] = []
      page.on('request', (request) => {
        if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
      })

      // ── emom: the schedule run to its end ──
      await visit('/gallery/refinements?state=emom')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      const emom = page.locator('[data-gallery-emom="complete"]')
      await expect(emom.locator('form.clr-timed-log')).toHaveCount(0)
      let opener = openerOf(emom)
      await opener.click()
      let log = await expectFocusedLog(page, 'emom')
      await log.form.getByRole('textbox', { name: EMOM_NOTES_LABEL, exact: true }).fill('Short rest in minute 6')
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-emom-${skin}-phone-390`)
      await closeWithX(page, opener)
      await opener.click()
      log = await expectFocusedLog(page, 'emom')
      await expect(log.form.getByRole('textbox', { name: EMOM_NOTES_LABEL, exact: true })).toHaveValue('Short rest in minute 6')
      await page.keyboard.press('Escape')
      await expect(openLog(page)).toHaveCount(0)

      // ── amrap: finished early, three rounds and a zero ──
      await visit('/gallery/refinements?state=amrap')
      const amrap = page.locator('[data-gallery-amrap="early"]')
      opener = openerOf(amrap)
      await opener.click()
      log = await expectFocusedLog(page, 'amrap')
      await expect(log.form.getByRole('status', { name: 'Rounds completed', exact: true })).toHaveText('3')
      await log.form.getByRole('button', { name: 'Increase rounds completed', exact: true }).click()
      await expect(log.form.getByRole('status', { name: 'Rounds completed', exact: true })).toHaveText('4')
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-amrap-${skin}-phone-390`)
      await closeWithX(page, opener)
      await opener.click()
      log = await expectFocusedLog(page, 'amrap')
      await expect(log.form.getByRole('status', { name: 'Rounds completed', exact: true })).toHaveText('4')
      await page.keyboard.press('Escape')

      // ── for_time: the cap, Incomplete ──
      await visit('/gallery/refinements?state=for_time')
      const race = page.locator('[data-gallery-race="for-time-cap"]')
      opener = openerOf(race)
      await opener.click()
      log = await expectFocusedLog(page, 'for_time')
      expect(await chosen(log.form.getByRole('group', { name: 'Work completed', exact: true }))).toEqual(['Incomplete'])
      await log.form.getByRole('group', { name: 'Effort · optional', exact: true }).getByRole('radio', { name: 'About right', exact: true }).click()
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-for-time-${skin}-phone-390`)
      await closeWithX(page, opener)
      await opener.click()
      log = await expectFocusedLog(page, 'for_time')
      expect(await chosen(log.form.getByRole('group', { name: 'Effort · optional', exact: true }))).toEqual(['About right'])
      await page.keyboard.press('Escape')

      // ── ladder: finished with nothing tracked, Incomplete ──
      await visit('/gallery/refinements?state=ladder')
      const ladder = page.locator('[data-gallery-race="ladder-finish"]')
      opener = openerOf(ladder)
      await opener.click()
      log = await expectFocusedLog(page, 'ladder')
      expect(await chosen(log.form.getByRole('group', { name: 'Work completed', exact: true }))).toEqual(['Incomplete'])
      await log.form.getByRole('group', { name: 'Rounds completed', exact: true }).getByRole('button', { name: /^Round 2: / }).click()
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-ladder-${skin}-phone-390`)
      await closeWithX(page, opener)
      await opener.click()
      log = await expectFocusedLog(page, 'ladder')
      await expect(log.form.getByRole('group', { name: 'Rounds completed', exact: true }).getByRole('status')).toHaveText(/^2 of 4 rounds completed/)
      await page.keyboard.press('Escape')
      await expect(openLog(page)).toHaveCount(0)

      expect(await page.evaluate(() => ['clear.workout-amraps', 'clear.workout-for-time', 'clear.workout-ladders', 'clear.workout-emom'].map((key) => localStorage.getItem(key))))
        .toEqual([null, null, null, null])
      expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
    })
  }
})
