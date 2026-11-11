import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { savedSessionRow } from '../../src/dev/gallery-refinement-overview-data'
import { restDayRowSchema, sessionSnapshotSchema, workoutSessionRowSchema, type RestDayRow, type WorkoutSessionRow } from '../../src/state/schemas'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-045 (REQ-019; C45; R82, R100, R115, R116; TASK-AC-AF9A8D51EC8F,
 * TASK-AC-6F80AE2AEA26, TASK-AC-1ADE4EF9CF05; foundation provider for
 * JOURNEY-019) — the notes, feedback and rest-day family adopts the shared
 * focused logging dialog through its real entry points:
 *
 * - movement note: a movement's Coaching and notes panel on `/workout` (a
 *   standard lift's own panel and a grouped section), "Add note — <movement>"
 *   opening `Notes — <movement>`;
 * - workout feedback: `/summary`'s Debrief card, "Log workout feedback"
 *   opening `Workout feedback` with the feeling, the notes and Save and close;
 * - rest day / reason change: Home's Mark Rest Day / Change reason opening
 *   `Log rest day` with the native Reason select, Save rest day and Cancel.
 *
 * Entry (ENTRY-019): behind the existing auth guard, on a contained synthetic
 * account. Action: open, enter or correct, close and reopen, save and retry.
 * Result: each entry is the native modal `LoggingOverlay` — its one title, the
 * framed icon-only "Close log" X, the Balanced backdrop, the screen behind it
 * inert — holding its own fields and draft over the original writer
 * (`workout_exercises.exercise_notes`, `workout_sessions` mood and
 * session_notes, `mark_rest_day` with note null). Recovery: a refused write
 * keeps the draft and its retry stores it; the note's X and Escape keep the
 * draft; the rest day's X is its Cancel. A note leaves the session's one rest
 * running and records no performed work.
 *
 * Synthetic and contained: intercepted reads for a fictional user. The only
 * writes are the ones the journey makes, answered here and never forwarded;
 * no model call, no real row. The accepted gallery states are memory-only and
 * read nothing over the network.
 */
const OWNER = '00000000-0000-4000-8000-000000004501'
const PLACE = '00000000-0000-4000-8000-000000004511'
const COMPLETED = '00000000-0000-4000-8000-000000004521'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The back squat's prescribed rest, started by its Rest. */
const SQUAT_REST = 90

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
    if (code !== null) throw new Error(`Synthetic TASK-045 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-045 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-045.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-045-public-placeholder',
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

const SKINS = ['clear', 'vapour', 'signal', 'mono'] as const
type Skin = (typeof SKINS)[number]

/** A local calendar day, `daysAgo` days before today, and an evening instant on it. */
function localDay(daysAgo: number) {
  const at = new Date()
  at.setDate(at.getDate() - daysAgo)
  at.setHours(18, 0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return { date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, instant: at.toISOString() }
}

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic TASK-045 notes workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: PLACE, goal_preset: 'balanced' },
  sections: [
    { title: 'Primary lift', sectionType: 'primary_lift', blocks: [
      { structureType: 'standard', exercises: [
        { prescription: { exercise_id: 'back-squat', order_index: 0, sets: 3, target_value: 5, rest_seconds: SQUAT_REST } },
      ] },
      { structureType: 'superset', rounds: 3, roundRestSeconds: 45, exercises: [
        { prescription: { exercise_id: 'bench-press', order_index: 0, modality: 'reps', target_value: 8, sets: 3 } },
        { prescription: { exercise_id: 'push-up', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'reps', target_value: 10, sets: 3 } },
      ] },
    ] },
  ],
}))
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
function exerciseId(catalogId: string): string {
  const found = WORKOUT_EXERCISES.find((exercise) => exercise.exercise_id === catalogId)
  if (found === undefined) throw new Error(`no ${catalogId}`)
  return found.id
}
const SQUAT = exerciseId('back-squat')
const PUSH_UP = exerciseId('push-up')

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  readonly reducedMotion?: boolean
  readonly skin?: Skin
  /** Today's mark already stored, if any. */
  readonly restToday?: RestDayRow['reason']
  /** The notes workout is the active session (`/workout`). */
  readonly active?: boolean
}

interface Write {
  readonly table: string
  readonly id: string | null
  readonly body: unknown
  readonly stored: boolean
}

/**
 * Reads answer the fixture; the writes the family makes — a movement note, the
 * debrief and a rest-day mark — are answered here and never forwarded. Each
 * kind of write can be refused once.
 */
async function syntheticApp(page: Page, options: AppOptions = {}) {
  const unexpected: string[] = []
  const writes: Write[] = []
  const refuse = new Set<string>()
  const today = localDay(0)
  const yesterday = localDay(1)
  let completed: WorkoutSessionRow = workoutSessionRowSchema.parse(savedSessionRow({
    sessionId: COMPLETED, userId: OWNER, date: yesterday.date, completedAt: yesterday.instant,
  }))
  const now = new Date().toISOString()
  let marks: RestDayRow[] = options.restToday === undefined ? [] : [restDayRowSchema.parse({
    id: '00000000-0000-4000-8000-000000004531', user_id: OWNER, day: today.date, reason: options.restToday,
    note: null, created_at: now, updated_at: now,
  })]
  const notes = new Map<string, string | null>()
  const guard = await installDeterministicCapture(page, { skin: options.skin ?? 'clear', reducedMotion: options.reducedMotion ?? true })

  const handler = async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const reply = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, json: body }).catch(() => undefined)
    const refused = (table: string) => {
      if (!refuse.has(table)) return false
      refuse.delete(table)
      return true
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/functions/v1/')) {
      unexpected.push(`${request.method()} ${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (request.method() === 'GET') {
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(WORKOUT_EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (name === 'workout_exercises') {
        return reply(WORKOUT_EXERCISES.map((exercise) => notes.has(exercise.id)
          ? { ...exercise, exercise_notes: notes.get(exercise.id) } : exercise))
      }
      if (name === 'workout_sessions') return reply([completed])
      if (name === 'rest_days') return reply(marks)
      // Every other read is an empty answer: no anchors, favorites or history beyond this.
      return reply([])
    }
    if (request.method() === 'PATCH') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '') ?? null
      const body = request.postDataJSON() as Record<string, unknown>
      if (name === 'workout_exercises') {
        const row = WORKOUT_EXERCISES.find((exercise) => exercise.id === id)
        const stored = row !== undefined && !refused(name)
        writes.push({ table: name, id, body, stored })
        if (!stored) return reply({ code: 'PGRST000', message: 'Synthetic refused write.' }, 503)
        notes.set(row.id, body.exercise_notes as string | null)
        return reply([{ ...row, exercise_notes: body.exercise_notes }])
      }
      if (name === 'workout_sessions') {
        const stored = id === completed.id && !refused(name)
        writes.push({ table: name, id, body, stored })
        if (!stored) return reply({ code: 'PGRST000', message: 'Synthetic refused write.' }, 503)
        completed = workoutSessionRowSchema.parse({ ...completed, ...body })
        return reply([completed])
      }
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      const body = request.postDataJSON() as Record<string, unknown>
      if (name === 'resume_session') return reply(options.active === true ? WORKOUT : null)
      if (name === 'session_snapshot') return reply(WORKOUT)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'streak_sessions') {
        const rows = [{ session_id: completed.id, completed_at: completed.completed_at, counts_for_streak: true }]
        return reply(body.p_limit === 1 ? rows.slice(0, 1) : rows)
      }
      if (name === 'mark_rest_day') {
        const stored = !refused(name)
        writes.push({ table: name, id: null, body, stored })
        if (!stored) return reply({ code: 'PGRST000', message: 'Synthetic refused write.' }, 503)
        const at = new Date().toISOString()
        const row = restDayRowSchema.parse({
          id: '00000000-0000-4000-8000-000000004532', user_id: OWNER, day: body.p_day, reason: body.p_reason,
          note: body.p_note ?? null, created_at: at, updated_at: at,
        })
        marks = [row, ...marks.filter((mark) => mark.day !== row.day)]
        return reply(row)
      }
      if (['constraints_in_force', 'anchor_evidence', 'conditioning_history', 'generation_refusal_diagnostics',
        'generation_candidate_sets_for_goal', 'generation_candidate_sets'].includes(name)) return reply([])
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-045 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-045-session', refreshToken: 'synthetic-task-045-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-045@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    writes,
    today,
    /** The next write to this table (or rpc) is refused. */
    refuseNext(table: string) { refuse.add(table) },
    assertContained() {
      expect(unexpected, 'Every API request has an explicit synthetic disposition').toEqual([])
      expect(guard.blockedGenerations()).toBe(0)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the screen
// ─────────────────────────────────────────────────────────────────────────────

const content = (page: Page) => page.locator('main#main > .clr-scroll-region > .clr-scroll-region__scroller')
/** The open focused logging dialog (any title). */
const openLog = (page: Page) => page.locator('dialog.clr-accepted-log[open]')
const restBars = (page: Page) => page.getByRole('region', { name: 'Rest', exact: true })

/** One movement's own section on the workout, by its heading. */
function card(page: Page, name: string): Locator {
  return content(page).locator('section').filter({
    has: page.getByRole('heading', { name, exact: true }),
  }).last()
}

async function restRemaining(page: Page): Promise<number> {
  await expect(restBars(page)).toHaveCount(1)
  const text = await restBars(page).getByRole('timer', { name: 'Time remaining' }).textContent()
  const digits = /(\d\d):(\d\d)/.exec(text ?? '')
  if (digits === null) throw new Error(`no rest digits in ${text}`)
  return Number(digits[1]) * 60 + Number(digits[2])
}

/**
 * The selected focused dialog, open over an inert screen: the native modal
 * named by its one title, the framed icon-only "Close log" X in its header,
 * the Balanced backdrop, and no half-sheet anywhere.
 */
async function expectFocusedLog(page: Page, title: string) {
  const dialog = page.getByRole('dialog', { name: title, exact: true })
  await expect(dialog).toBeVisible()
  await expect(openLog(page)).toHaveCount(1)
  expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true)
  // One title, then one X, in the header.
  const head = dialog.locator('[data-logging-head]')
  await expect(head.getByRole('heading', { name: title, exact: true })).toBeVisible()
  const close = head.getByRole('button', { name: 'Close log', exact: true })
  await expect(close).toBeVisible()
  expect((await close.textContent())?.trim()).toBe('')
  await expect(dialog.getByRole('button', { name: 'Close log' })).toHaveCount(1)
  // The X is framed: the shared secondary icon button — chamfered, with the
  // shared hit area and its glyph — inside its emitting bleed, never quiet.
  expect(await close.evaluate((node) => ({
    framed: ['clr-chamfer', 'clr-btn', 'clr-hit'].every((name) => node.classList.contains(name)),
    quiet: node.classList.contains('clr-btn--quiet'),
    bleed: node.parentElement?.classList.contains('clr-bleed') ?? false,
    glyph: node.querySelector('svg') !== null,
  }))).toEqual({ framed: true, quiet: false, bleed: true, glyph: true })
  await expect(page.locator('section.clr-set-sheet')).toHaveCount(0)
  // The Balanced backdrop on the native backdrop.
  const backdrop = await dialog.evaluate((node) => getComputedStyle(node, '::backdrop').backdropFilter)
  expect(backdrop).toMatch(/blur\(/)
  // Inert behind: no control of the screen can take focus while it is open.
  const behind = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    const controls = [...document.querySelectorAll<HTMLElement>('main#main button, main#main textarea, main#main select, .clr-workout-footer button')]
    const reachable = controls.filter((control) => {
      control.focus()
      return document.activeElement === control
    }).length
    active?.focus()
    return reachable
  })
  expect(behind).toBe(0)
  return dialog
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

async function attachScreen(page: Page, name: string) {
  await test.info().attach(`${name}.png`, {
    body: await page.screenshot({ animations: 'disabled', caret: 'hide' }), contentType: 'image/png',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-045 notes, feedback and rest days in the shared focused dialog', () => {
  test('JOURNEY-019 movement note phone-390 touch: Add note opens Notes for that movement in the modal log beside the one running rest, close and Escape keep the draft, a refused write keeps the text and its retry stores it through the original writer, and a grouped section keeps its own note', async ({ page, visit, checkA11y }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { active: true })
    await page.clock.install()
    await visit('/workout')
    await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()

    // ── The session's one rest is running: the squat's Rest starts it ──
    const squat = card(page, 'back squat')
    await squat.getByRole('button', { name: 'Rest', exact: true }).tap()
    let dialog = await expectFocusedLog(page, 'Log set 1')
    await dialog.getByRole('button', { name: 'Close log' }).tap()
    await expect(openLog(page)).toHaveCount(0)
    const running = await restRemaining(page)
    expect(running).toBeLessThanOrEqual(SQUAT_REST)

    // ── Entry: the movement's own panel opens the note in the focused log ──
    const panel = squat.getByRole('button', { name: 'Coaching and notes — back squat', exact: true })
    await panel.tap()
    const opener = squat.getByRole('button', { name: 'Add note — back squat', exact: true })
    await expect(opener).toBeVisible()
    await expect(squat.getByRole('textbox', { name: /^Notes — / })).toHaveCount(0)
    await opener.tap()
    dialog = await expectFocusedLog(page, 'Notes — back squat')
    await expect(dialog.getByRole('button', { name: 'Close log' })).toBeFocused()
    // Its one field and its own Save; no other family's fields.
    const field = dialog.getByRole('textbox', { name: 'Notes — back squat' })
    await expect(field).toHaveValue('')
    await expect(dialog.getByRole('button', { name: 'Save note — back squat', exact: true })).toBeVisible()
    await expect(dialog.getByRole('group', { name: 'Effort' })).toHaveCount(0)
    await expect(dialog.getByLabel('Weight')).toHaveCount(0)
    // The rest is not this log's: still the one rest, behind it, still running.
    await expect(restBars(page)).toHaveCount(1)
    await expect(dialog.getByRole('region', { name: 'Rest', exact: true })).toHaveCount(0)
    await page.clock.runFor(3_000)
    expect(await restRemaining(page)).toBeLessThan(running)
    await noHorizontalOverflow(page)
    await checkA11y()
    await attachScreen(page, 'movement-note-open-phone-390')

    // ── Draft retention: the X and Escape close; reopening hands back the draft ──
    await field.fill('Brace before the descent')
    await dialog.getByRole('button', { name: 'Close log' }).tap()
    await expect(openLog(page)).toHaveCount(0)
    const edit = squat.getByRole('button', { name: 'Edit note — back squat', exact: true })
    await expect(edit).toBeFocused()
    await edit.tap()
    dialog = await expectFocusedLog(page, 'Notes — back squat')
    await expect(dialog.getByRole('textbox', { name: 'Notes — back squat' })).toHaveValue('Brace before the descent')
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(edit).toBeFocused()
    expect(app.writes).toEqual([])

    // ── A refused write keeps the text, marks the field and says so ──
    await edit.tap()
    dialog = await expectFocusedLog(page, 'Notes — back squat')
    app.refuseNext('workout_exercises')
    await dialog.getByRole('button', { name: 'Save note — back squat' }).tap()
    await expect(dialog.getByText('Your note didn’t save. It is still in the field — try again.')).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: /^Notes — back squat/ })).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByRole('textbox', { name: /^Notes — back squat/ })).toHaveValue('Brace before the descent')
    await expect(dialog.getByRole('status').filter({ hasText: 'Not saved' })).toHaveCount(1)
    await checkA11y()
    await attachScreen(page, 'movement-note-refused-phone-390')
    // Closed, the failure is still said beside the opener; reopened, it is still the field's.
    await dialog.getByRole('button', { name: 'Close log' }).tap()
    await expect(squat.getByRole('status').filter({ hasText: 'Not saved' })).toHaveCount(1)
    await edit.tap()
    dialog = await expectFocusedLog(page, 'Notes — back squat')
    await expect(dialog.getByRole('textbox', { name: /^Notes — back squat/ })).toHaveValue('Brace before the descent')

    // ── Retry: the original writer stores it on the same prescription row ──
    await dialog.getByRole('button', { name: 'Save note — back squat' }).tap()
    await expect(dialog.getByRole('status').filter({ hasText: 'Note saved' })).toHaveCount(1)
    await expect(dialog.getByText('Your note didn’t save. It is still in the field — try again.')).toHaveCount(0)
    expect(app.writes).toEqual([
      { table: 'workout_exercises', id: SQUAT, body: { exercise_notes: 'Brace before the descent' }, stored: false },
      { table: 'workout_exercises', id: SQUAT, body: { exercise_notes: 'Brace before the descent' }, stored: true },
    ])
    await dialog.getByRole('button', { name: 'Close log' }).tap()
    await expect(squat.getByRole('status').filter({ hasText: 'Note saved' })).toHaveCount(1)
    // Still the one rest, still running; a note is not performed work.
    await expect(restBars(page)).toHaveCount(1)
    await expect(squat.getByRole('button', { name: 'Rest', exact: true })).toBeVisible()

    // ── A grouped section's note is its own, in the same dialog contract ──
    const group = content(page).getByRole('button', { name: /^Coaching and notes — SUPERSET/ })
    await group.scrollIntoViewIfNeeded()
    await group.tap()
    const pushUp = content(page).getByRole('group', { name: 'push up', exact: true })
    await pushUp.getByRole('button', { name: 'Add note — push up', exact: true }).tap()
    dialog = await expectFocusedLog(page, 'Notes — push up')
    await expect(dialog.getByRole('textbox', { name: 'Notes — push up' })).toHaveValue('')
    await dialog.getByRole('textbox', { name: 'Notes — push up' }).fill('Hands under shoulders')
    await dialog.getByRole('button', { name: 'Save note — push up' }).tap()
    await expect(dialog.getByRole('status').filter({ hasText: 'Note saved' })).toHaveCount(1)
    expect(app.writes.at(-1)).toEqual({ table: 'workout_exercises', id: PUSH_UP, body: { exercise_notes: 'Hands under shoulders' }, stored: true })
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(pushUp.getByRole('button', { name: 'Edit note — push up', exact: true })).toBeFocused()
    expect(app.writes.every((write) => write.table === 'workout_exercises')).toBe(true)
    app.assertContained()
  })

  test('JOURNEY-019 workout feedback phone-390 keyboard reduced motion: Log workout feedback opens Workout feedback in the modal log with the feeling and notes, close keeps the draft, a refused save keeps it in place and its retry saves both through the original writer and leaves for Home', async ({ page, visit, checkA11y }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { reducedMotion: true })
    await visit('/summary')
    await expect(page.getByRole('heading', { level: 1, name: 'Nice work' })).toBeVisible()
    // No pinned Save and close: the debrief's one entry is its card's opener.
    await expect(page.getByRole('button', { name: 'Save and close' })).toHaveCount(0)
    await expect(page.getByRole('radiogroup')).toHaveCount(0)
    const opener = page.getByRole('button', { name: 'Log workout feedback', exact: true })
    await opener.focus()
    await page.keyboard.press('Enter')
    let dialog = await expectFocusedLog(page, 'Workout feedback')
    await expect(dialog.getByRole('button', { name: 'Close log' })).toBeFocused()
    // The existing fields: five feelings, optional notes, Save and close.
    const feelings = dialog.getByRole('radio')
    await expect(feelings).toHaveCount(5)
    for (const radio of await feelings.all()) await expect(radio).not.toBeChecked()
    const notes = dialog.getByRole('textbox', { name: /Notes · optional/ })
    await expect(notes).toHaveValue('')
    await expect(dialog.getByRole('button', { name: 'Save and close' })).toBeEnabled()
    await noHorizontalOverflow(page)
    await checkA11y()
    await attachScreen(page, 'workout-feedback-open-phone-390')

    // ── Keyboard: the feeling by arrows, the notes typed; Escape keeps both ──
    await dialog.getByRole('radio', { name: '1, Spent' }).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(dialog.getByRole('radio', { name: '4, Ready' })).toBeChecked()
    // The radio group moves focus on the next frame; let it land before leaving it.
    await expect(dialog.getByRole('radio', { name: '4, Ready' })).toBeFocused()
    await notes.focus()
    await page.keyboard.type('Overhead felt heavy today.')
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(opener).toBeFocused()
    expect(app.writes).toEqual([])
    await page.keyboard.press('Enter')
    dialog = await expectFocusedLog(page, 'Workout feedback')
    await expect(dialog.getByRole('radio', { name: '4, Ready' })).toBeChecked()
    await expect(dialog.getByRole('textbox', { name: /Notes · optional/ })).toHaveValue('Overhead felt heavy today.')

    // ── A refused save: in place, the draft kept, nothing left behind ──
    app.refuseNext('workout_sessions')
    await dialog.getByRole('button', { name: 'Save and close' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/summary$/)
    await expect(dialog.getByRole('radio', { name: '4, Ready' })).toBeChecked()
    await expect(dialog.getByRole('textbox', { name: /Notes · optional/ })).toHaveValue('Overhead felt heavy today.')
    await checkA11y()
    await attachScreen(page, 'workout-feedback-refused-phone-390')

    // ── Retry: both columns through the original writer, then Home ──
    await dialog.getByRole('button', { name: 'Save and close' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/$/)
    expect(app.writes).toEqual([
      { table: 'workout_sessions', id: COMPLETED, body: { mood: 4, session_notes: 'Overhead felt heavy today.' }, stored: false },
      { table: 'workout_sessions', id: COMPLETED, body: { mood: 4, session_notes: 'Overhead felt heavy today.' }, stored: true },
    ])
    await expect(openLog(page)).toHaveCount(0)
    app.assertContained()
  })

  test('JOURNEY-019 rest day and reason change phone-320 touch: Mark Rest Day opens Log rest day in the modal log with the Reason picker focused, the X cancels, a refused save keeps the choice and its retry marks the day with no note; Change reason reopens at the saved reason', async ({ page, visit, checkA11y }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page)
    await visit('/')
    const rest = page.getByRole('region', { name: 'Rest day', exact: true })
    const mark = rest.getByRole('button', { name: 'Mark Rest Day', exact: true })
    await mark.scrollIntoViewIfNeeded()
    await expect(mark).toHaveAttribute('aria-expanded', 'false')
    await mark.tap()
    let dialog = await expectFocusedLog(page, 'Log rest day')
    await expect(mark).toHaveAttribute('aria-expanded', 'true')
    // The existing native picker, focused, with its effect helper; no Notes field.
    const picker = dialog.getByRole('combobox', { name: 'Reason' })
    await expect(picker).toBeFocused()
    await expect(picker).toHaveValue('rest')
    expect(await picker.evaluate((node) => node.tagName)).toBe('SELECT')
    expect(await picker.locator('option').allTextContents()).toEqual(['Rest day', 'Injured', 'Unwell', 'Away'])
    await expect(dialog.getByRole('textbox')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Save rest day' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await noHorizontalOverflow(page)
    await checkA11y()
    await attachScreen(page, 'rest-day-open-phone-320')

    // ── The X is Cancel: the choice is discarded, focus back on the trigger ──
    await picker.selectOption('sick')
    await dialog.getByRole('button', { name: 'Close log' }).tap()
    await expect(openLog(page)).toHaveCount(0)
    await expect(mark).toBeFocused()
    await mark.tap()
    dialog = await expectFocusedLog(page, 'Log rest day')
    await expect(dialog.getByRole('combobox', { name: 'Reason' })).toHaveValue('rest')
    expect(app.writes).toEqual([])

    // ── A refused save: the alert in the log, the choice kept for the retry ──
    await dialog.getByRole('combobox', { name: 'Reason' }).selectOption('sick')
    app.refuseNext('mark_rest_day')
    await dialog.getByRole('button', { name: 'Save rest day' }).tap()
    await expect(dialog.getByRole('alert')).toHaveText('The rest day wasn’t saved. Try again.')
    await expect(dialog.getByRole('combobox', { name: 'Reason' })).toHaveValue('sick')
    await checkA11y()
    await attachScreen(page, 'rest-day-refused-phone-320')
    await dialog.getByRole('button', { name: 'Save rest day' }).tap()
    await expect(openLog(page)).toHaveCount(0)
    await expect(rest.getByRole('status')).toHaveText('Rest day saved.')
    await expect(rest.getByText('Today: Unwell.')).toBeVisible()
    expect(app.writes).toEqual([
      { table: 'mark_rest_day', id: null, body: { p_day: app.today.date, p_reason: 'sick', p_note: null }, stored: false },
      { table: 'mark_rest_day', id: null, body: { p_day: app.today.date, p_reason: 'sick', p_note: null }, stored: true },
    ])
    const change = rest.getByRole('button', { name: 'Change reason', exact: true })
    await expect(change).toBeFocused()

    // ── Change reason: the same log, opened at the saved reason; Escape cancels ──
    await change.tap()
    dialog = await expectFocusedLog(page, 'Log rest day')
    await expect(dialog.getByRole('combobox', { name: 'Reason' })).toHaveValue('sick')
    await dialog.getByRole('combobox', { name: 'Reason' }).selectOption('vacation')
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(change).toBeFocused()
    await change.tap()
    dialog = await expectFocusedLog(page, 'Log rest day')
    await expect(dialog.getByRole('combobox', { name: 'Reason' })).toHaveValue('sick')
    await dialog.getByRole('button', { name: 'Cancel' }).tap()
    await expect(openLog(page)).toHaveCount(0)
    expect(app.writes).toHaveLength(2)
    app.assertContained()
  })

  for (const skin of SKINS) {
    test(`accepted gallery states ${skin} phone-390: movement-note, workout-feedback and rest-day open the route's own entry in the focused log, with nothing read or written over the network`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(150_000)
      await page.setViewportSize({ width: 390, height: 844 })
      await installDeterministicCapture(page, { skin, reducedMotion: true })
      const requests: string[] = []
      page.on('request', (request) => {
        if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
      })

      // ── movement-note: the route's Coaching and notes panel ──
      await visit('/gallery/refinements?state=movement-note')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      const standard = page.locator('[data-gallery-logging-moment="standard"]')
      await standard.getByRole('button', { name: 'Coaching and notes — back squat', exact: true }).click()
      await standard.getByRole('button', { name: 'Add note — back squat', exact: true }).click()
      let dialog = await expectFocusedLog(page, 'Notes — back squat')
      await dialog.getByRole('textbox', { name: 'Notes — back squat' }).fill('Brace first')
      await dialog.getByRole('button', { name: 'Save note — back squat' }).click()
      await expect(dialog.getByRole('status').filter({ hasText: 'Note saved' })).toHaveCount(1)
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-movement-note-${skin}-phone-390`)
      await dialog.getByRole('button', { name: 'Close log' }).click()
      await expect(openLog(page)).toHaveCount(0)
      // The grouped section whose write is refused keeps its text and says so.
      const superset = page.locator('[data-gallery-logging-moment="superset"]')
      await superset.getByRole('button', { name: /^Coaching and notes/ }).click()
      await superset.getByRole('button', { name: 'Add note — push up', exact: true }).click()
      dialog = await expectFocusedLog(page, 'Notes — push up')
      await dialog.getByRole('textbox', { name: 'Notes — push up' }).fill('Hands under shoulders')
      await dialog.getByRole('button', { name: 'Save note — push up' }).click()
      await expect(dialog.getByText('Your note didn’t save. It is still in the field — try again.')).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: /^Notes — push up/ })).toHaveValue('Hands under shoulders')
      await checkA11y()
      await page.keyboard.press('Escape')
      await expect(openLog(page)).toHaveCount(0)

      // ── workout-feedback: Summary's own WorkoutFeedback ──
      await visit('/gallery/refinements?state=workout-feedback')
      const fresh = page.locator('[data-gallery-logging-moment="fresh"]')
      await fresh.getByRole('button', { name: 'Log workout feedback', exact: true }).click()
      dialog = await expectFocusedLog(page, 'Workout feedback')
      await expect(dialog.getByRole('radio')).toHaveCount(5)
      await expect(dialog.getByRole('textbox', { name: /Notes · optional/ })).toBeVisible()
      await dialog.getByRole('radio', { name: '3, Flat' }).click()
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-workout-feedback-${skin}-phone-390`)
      await dialog.getByRole('button', { name: 'Save and close' }).click()
      await expect(openLog(page)).toHaveCount(0)
      await expect(fresh.getByRole('status')).toContainText('feeling 3')
      const stored = page.locator('[data-gallery-logging-moment="stored"]')
      await stored.getByRole('button', { name: 'Log workout feedback', exact: true }).click()
      dialog = await expectFocusedLog(page, 'Workout feedback')
      await expect(dialog.getByRole('radio', { name: '4, Ready' })).toBeChecked()
      await dialog.getByRole('button', { name: 'Save and close' }).click()
      await expect(dialog.getByRole('alert')).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: /Notes · optional/ })).toHaveValue('Overhead felt heavy today.')
      await checkA11y()
      await page.keyboard.press('Escape')
      await expect(openLog(page)).toHaveCount(0)

      // ── rest-day: Home's own RestDayControl ──
      await visit('/gallery/refinements?state=rest-day')
      const unmarked = page.locator('[data-gallery-logging-moment="unmarked"]')
      await unmarked.getByRole('button', { name: 'Mark Rest Day', exact: true }).click()
      dialog = await expectFocusedLog(page, 'Log rest day')
      await expect(dialog.getByRole('combobox', { name: 'Reason' })).toBeFocused()
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-rest-day-${skin}-phone-390`)
      await dialog.getByRole('combobox', { name: 'Reason' }).selectOption('injury')
      await dialog.getByRole('button', { name: 'Save rest day' }).click()
      await expect(openLog(page)).toHaveCount(0)
      await expect(unmarked.getByText('Today: Injured.')).toBeVisible()
      const marked = page.locator('[data-gallery-logging-moment="marked"]')
      await marked.getByRole('button', { name: 'Change reason', exact: true }).click()
      dialog = await expectFocusedLog(page, 'Log rest day')
      await dialog.getByRole('button', { name: 'Save rest day' }).click()
      await expect(dialog.getByRole('alert')).toHaveText('The rest day wasn’t saved. Try again.')
      await dialog.getByRole('button', { name: 'Close log' }).click()
      await expect(openLog(page)).toHaveCount(0)

      expect(requests).toEqual([])
    })
  }
})
