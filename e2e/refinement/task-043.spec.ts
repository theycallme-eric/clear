import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { blockResultRowSchema, exerciseSetLogRowSchema, sessionSnapshotSchema, type BlockResultRow, type ExerciseSetLogRow } from '../../src/state/schemas'
import { isSetObservationMutation, type SetObservationAck, type SetObservationMutation } from '../../src/state/set-observation-mutation'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-043 (REQ-019; C45; R82, R100, R115, R116; TASK-AC-4E98D150903F,
 * TASK-AC-2990AF36316E, TASK-AC-342CDDB7111A; foundation provider for
 * JOURNEY-019) — the standard block's set-logging family adopts the shared
 * focused logging dialog on the real `/workout` route: the anchor/primary
 * lift, another lift, a timed movement, a distance movement, an extra set and
 * a saved-set correction.
 *
 * Entry (ENTRY-019): the movement card's own Rest (or a saved row's Edit) on
 * `/workout`, behind the existing auth guard, on a contained synthetic
 * session. Action: open, enter or correct, close and reopen, save, retry.
 * Result: each entry is the native modal `LoggingOverlay` — its one title,
 * the framed icon-only "Close log" X, the Balanced backdrop, the workout
 * behind it inert — holding the logger's own fields, draft, Save
 * confirmation and the session's one rest; every write is the original
 * set-observation writer's. Recovery: a refused write is held on this device
 * and retried under its own id; close/reopen keeps the draft; Escape is the
 * X. A superset's round (TASK-044) is checked to stay on its half-sheet, so
 * no other family is claimed.
 *
 * Synthetic and contained: an intercepted session for a fictional user. The
 * only writes are the set observations the athlete makes and a section's own
 * block result when Next section leaves it, answered here and never
 * forwarded; no model call, no real row. The accepted gallery states are
 * memory-only and read nothing over the network.
 */
const OWNER = '00000000-0000-4000-8000-000000004301'
const PLACE = '00000000-0000-4000-8000-000000004311'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
const SQUAT_REST = 60

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
    if (code !== null) throw new Error(`Synthetic TASK-043 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-043 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-043.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-043-public-placeholder',
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

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic TASK-043 set logging workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: PLACE, goal_preset: 'strength' },
  sections: [
    { title: 'Strength', sectionType: 'primary_lift', blocks: [{ exercises: [
      { prescription: { exercise_id: 'back-squat', order_index: 0, sets: 2, target_value: 5, rest_seconds: SQUAT_REST } },
    ] }] },
    { title: 'Accessory', sectionType: 'accessory', blocks: [{ exercises: [
      { prescription: { exercise_id: 'romanian-deadlift', order_index: 0, sets: 3, target_value: 8, rest_seconds: 45 } },
      { prescription: { exercise_id: 'plank', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
        load_value: null, modality: 'time', target_value: 30, sets: 2, rest_seconds: 30 } },
      { prescription: { exercise_id: 'farmer-carry', order_index: 2, equipment_used: 'dumbbell', modality: 'distance',
        distance_unit: 'm', target_value: 40, sets: 2, rest_seconds: 45 } },
    ] }] },
    { title: 'Conditioning', sectionType: 'conditioning', blocks: [{
      structureType: 'superset', rounds: 2, roundRestSeconds: 45,
      exercises: [
        { prescription: { exercise_id: 'bench-press', order_index: 0, modality: 'reps', target_value: 8, sets: 2 } },
        { prescription: { exercise_id: 'push-up', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'reps', target_value: 10, sets: 2 } },
      ],
    }] },
  ],
}))
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
const EXERCISE_ID = new Map(WORKOUT_EXERCISES.map((exercise) => [exercise.exercise_id, exercise.id]))
const BLOCK_IDS = new Set(WORKOUT.sections.flatMap((section) => section.blocks.map(({ block }) => block.id)))

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  readonly reducedMotion?: boolean
  readonly skin?: Skin
}

/**
 * Reads answer the fixture; the one write the journey makes — a set
 * observation, inserted, corrected or cleared — is answered here and never
 * forwarded. One may be refused.
 */
async function syntheticApp(page: Page, options: AppOptions = {}) {
  const unexpected: string[] = []
  const attempts: SetObservationMutation[] = []
  const mutations: SetObservationMutation[] = []
  const blockResults: BlockResultRow[] = []
  const heads = new Map<string, SetObservationAck['head']>()
  let failNext = false
  const guard = await installDeterministicCapture(page, { skin: options.skin ?? 'clear', reducedMotion: options.reducedMotion ?? true })

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
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'strength' })])
      if (name === 'locations') return reply([fixtureLocation({ id: PLACE, user_id: OWNER, tier: 'full', is_default: true })])
      if (name === 'exercise_definitions') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return reply(WORKOUT_EXERCISES.filter((exercise) => id === undefined || exercise.exercise_id === id)
          .map((exercise) => definitionFixture({ id: exercise.exercise_id })))
      }
      if (name === 'workout_exercises') return reply(WORKOUT_EXERCISES)
      return reply([])
    }
    if (request.method() === 'POST' && name === 'block_results') {
      const insert = (request.postDataJSON() as Record<string, unknown>[])[0]
      if (!BLOCK_IDS.has(String(insert.block_id))) unexpected.push(`block_results for ${String(insert.block_id)}`)
      const row = blockResultRowSchema.parse({ elapsed_seconds: null, completed_under_cap: null,
        rounds_completed: null, partial_round_reps: null, minutes_completed: null, highest_rung: null,
        perceived_effort: null, notes: null, ...insert,
        id: `00000000-0000-4000-8000-4300000000${String(blockResults.length + 1).padStart(2, '0')}`,
        created_at: new Date().toISOString() })
      blockResults.push(row)
      return reply([row], 201)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(WORKOUT)
      if (name === 'session_as_performed') return reply(null)
      if (name === 'mutate_set_observation') {
        const p = request.postDataJSON() as Record<string, unknown> & { p_values: Record<string, unknown> }
        const mutation = {
          observation_id: p.p_observation_id, mutation_id: p.p_mutation_id, revision: p.p_revision,
          expected_revision: p.p_expected_revision, operation: p.p_operation,
          exercise_id: p.p_exercise_id, set_number: p.p_set_number, values: p.p_values,
        }
        if (!isSetObservationMutation(mutation)) {
          unexpected.push(`invalid ${name}`)
          return reply({ outcome: 'invalid' }, 400)
        }
        attempts.push(mutation)
        const previous = heads.get(mutation.observation_id)
        if (previous?.mutation_id === mutation.mutation_id) {
          return reply({ outcome: 'replayed', mutation, head: previous })
        }
        if (failNext) {
          failNext = false
          return reply({ code: 'PGRST000', message: 'Synthetic refused write.' }, 503)
        }
        let row: ExerciseSetLogRow | null = null
        if (mutation.operation !== 'clear') {
          row = exerciseSetLogRowSchema.parse({
            id: mutation.observation_id, workout_exercise_id: mutation.exercise_id,
            prescription_revision_status: 'active', set_number: mutation.set_number,
            actual_reps: null, actual_duration_seconds: null, actual_distance: null,
            actual_distance_unit: null, weight: null, weight_unit: 'kg', rpe: null,
            is_warmup_set: false, created_at: new Date().toISOString(), effort: null,
            ...(previous?.row ?? {}), ...mutation.values,
            mutation_revision: mutation.revision, last_mutation_id: mutation.mutation_id,
          })
        }
        const ack: SetObservationAck = { outcome: 'applied', mutation,
          head: { revision: mutation.revision, mutation_id: mutation.mutation_id, cleared: row === null, row } }
        mutations.push(mutation)
        heads.set(mutation.observation_id, ack.head)
        return reply(ack)
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-043 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-043-session', refreshToken: 'synthetic-task-043-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-043@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    attempts, mutations, blockResults,
    failNextMutation() { failNext = true },
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

/** The one movement card, by its heading, on the main screen. */
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
 * The selected focused dialog, open over an inert workout: the native modal
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
  await expect(dialog.getByRole('heading')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Minimi[sz]e$/ })).toHaveCount(0)
  await expect(page.locator('section.clr-set-sheet')).toHaveCount(0)
  // The Balanced backdrop on the native backdrop; the half-sheet layer stays closed.
  const backdrop = await dialog.evaluate((node) => getComputedStyle(node, '::backdrop').backdropFilter)
  expect(backdrop).toMatch(/blur\(/)
  await expect(page.locator('.clr-set-sheet-layer[data-open]')).toHaveCount(0)
  // Inert behind: no control of the workout can take focus while it is open.
  const behind = await page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>('main#main button, .clr-workout-footer button')]
    return controls.filter((control) => {
      control.focus()
      return document.activeElement === control
    }).length
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

test.describe('TASK-043 standard set logging in the shared focused dialog', () => {
  test('JOURNEY-019 anchor and extra set phone-390 touch: Rest opens the modal log with its X over an inert workout, close and Escape keep the draft, Log set saves through the original writer beside the one rest, and the extra set is logged as set 3', async ({ page, visit, checkA11y }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page)
    await page.clock.install()
    await visit('/workout')
    await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()

    // ── Entry: the anchor's Rest opens the focused log and its prescribed rest ──
    const squat = card(page, 'back squat')
    const rest = squat.getByRole('button', { name: 'Rest', exact: true })
    await rest.tap()
    let dialog = await expectFocusedLog(page, 'Log set 1')
    await expect(dialog.getByRole('button', { name: 'Close log' })).toBeFocused()
    await expect(rest).toHaveAttribute('aria-expanded', 'true')
    // The one rest, drawn in the log; none in the footer behind it.
    await expect(restBars(page)).toHaveCount(1)
    await expect(dialog.getByRole('region', { name: 'Rest', exact: true })).toBeVisible()
    expect(await restRemaining(page)).toBeLessThanOrEqual(SQUAT_REST)
    const form1 = dialog.getByRole('form', { name: 'Log set 1 of back squat' })
    // The anchor's fields: Weight, Unit, Reps and its optional Effort; no Notes or Performed.
    await expect(form1.getByLabel('Weight')).toBeVisible()
    await expect(form1.getByRole('combobox', { name: 'Unit' })).toBeVisible()
    await expect(form1.getByLabel('Reps')).toHaveValue('5')
    await expect(form1.getByRole('group', { name: 'Effort' })).toBeVisible()
    await expect(form1.getByLabel(/notes/i)).toHaveCount(0)
    await expect(form1.getByRole('checkbox', { name: 'Performed' })).toHaveCount(0)
    await noHorizontalOverflow(page)
    await checkA11y()
    await attachScreen(page, 'anchor-log-set-1-phone-390')

    // ── Draft retention: the X and Escape close; reopening hands back the draft ──
    await form1.getByLabel('Weight').fill('100')
    await form1.getByRole('combobox', { name: 'Unit' }).selectOption('kg')
    await form1.getByLabel('Reps').fill('4')
    await form1.getByRole('radio', { name: 'About right' }).check()
    await dialog.getByRole('button', { name: 'Close log' }).tap()
    await expect(openLog(page)).toHaveCount(0)
    await expect(rest).toBeFocused()
    await expect(restBars(page)).toHaveCount(1)
    expect(app.attempts).toHaveLength(0)
    await rest.tap()
    dialog = await expectFocusedLog(page, 'Log set 1')
    await expect(dialog.getByLabel('Weight')).toHaveValue('100')
    await expect(dialog.getByLabel('Reps')).toHaveValue('4')
    await expect(dialog.getByRole('radio', { name: 'About right' })).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(rest).toBeFocused()
    await rest.tap()
    dialog = await expectFocusedLog(page, 'Log set 1')
    await expect(dialog.getByLabel('Reps')).toHaveValue('4')
    expect(app.attempts).toHaveLength(0)

    // ── Save: the original writer, then the confirmation beside the same rest ──
    const before = await restRemaining(page)
    await dialog.getByRole('button', { name: 'Log set 1', exact: true }).tap()
    dialog = await expectFocusedLog(page, 'Set 1 logged')
    await expect.poll(() => app.mutations.length).toBe(1)
    expect(app.mutations[0]).toMatchObject({
      operation: 'insert', exercise_id: EXERCISE_ID.get('back-squat'), set_number: 1,
      values: { weight: 100, weight_unit: 'kg', actual_reps: 4, effort: 'about_right' },
    })
    const status = dialog.locator('.clr-set-sheet__saved[role="status"]')
    await expect(status).toContainText('Set 1 · 4 reps · 100 kg')
    await expect(status).toContainText('Saved')
    await expect(dialog.getByRole('form')).toHaveCount(0)
    expect(await restRemaining(page)).toBeLessThanOrEqual(before)
    await checkA11y()
    await attachScreen(page, 'anchor-set-1-logged-phone-390')

    // ── The rest ending closes the log; nothing is opened or recorded ──
    await page.clock.fastForward((SQUAT_REST + 2) * 1000)
    await expect(openLog(page)).toHaveCount(0)
    await expect(restBars(page)).toHaveCount(0)
    await expect(rest).toBeFocused()
    expect(app.attempts).toHaveLength(1)

    // ── Set 2, then the extra set: its own number and entry, the same writer ──
    await rest.tap()
    dialog = await expectFocusedLog(page, 'Log set 2')
    await expect(dialog.getByLabel('Weight')).toHaveValue('100')
    await dialog.getByRole('button', { name: 'Log set 2', exact: true }).tap()
    await expectFocusedLog(page, 'Set 2 logged')
    await expect.poll(() => app.mutations.length).toBe(2)
    await page.getByRole('button', { name: 'Close log' }).tap()
    await expect(squat.getByText('Extra set 3', { exact: true })).toBeVisible()
    await rest.tap()
    dialog = await expectFocusedLog(page, 'Log set 3')
    await dialog.getByLabel('Reps').fill('3')
    await dialog.getByRole('button', { name: 'Log set 3', exact: true }).tap()
    await expectFocusedLog(page, 'Set 3 logged')
    await expect.poll(() => app.mutations.length).toBe(3)
    expect(app.mutations[2]).toMatchObject({
      operation: 'insert', exercise_id: EXERCISE_ID.get('back-squat'), set_number: 3,
      values: { actual_reps: 3, weight: 100 },
    })
    await attachScreen(page, 'extra-set-3-logged-phone-390')
    await page.getByRole('button', { name: 'Close log' }).tap()
    await expect(squat.getByRole('list', { name: 'Logged sets' }).getByRole('listitem')).toHaveCount(3)
    app.assertContained()
  })

  test('JOURNEY-019 saved-set correction and retry phone-390 keyboard reduced motion: a refused write is held on this device and retried under its own id; Edit opens Edit set N in the log, Cancel and Save correction keep the writer, and Clear set asks with Keep set first', async ({ page, visit, checkA11y }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { reducedMotion: true })
    await visit('/workout')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    // ── A refused write: performed work is kept, never claimed as saved ──
    const squat = card(page, 'back squat')
    const rest = squat.getByRole('button', { name: 'Rest', exact: true })
    await rest.focus()
    await page.keyboard.press('Enter')
    let dialog = await expectFocusedLog(page, 'Log set 1')
    await expect(dialog.getByRole('button', { name: 'Close log' })).toBeFocused()
    await dialog.getByLabel('Weight').fill('80')
    await dialog.getByLabel('Reps').fill('6')
    await dialog.getByLabel('Reps').focus()
    app.failNextMutation()
    await page.keyboard.press('Enter')
    dialog = await expectFocusedLog(page, 'Set 1 logged')
    await expect(dialog.getByRole('heading', { name: 'Set 1 logged' })).toBeFocused()
    const status = dialog.locator('.clr-set-sheet__saved[role="status"]')
    await expect(status).toContainText('On this device only')
    await expect(status).not.toContainText('Saved')
    expect(app.mutations).toHaveLength(0)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(status).toContainText('Saved')
    expect(app.mutations).toHaveLength(1)
    expect(app.attempts[1]).toEqual(app.attempts[0])
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(rest).toBeFocused()

    // ── Correction: the saved row's Edit opens it in the same log ──
    const edit = squat.getByRole('button', { name: 'Edit set 1' })
    await edit.focus()
    await page.keyboard.press('Enter')
    dialog = await expectFocusedLog(page, 'Edit set 1')
    const form = dialog.getByRole('form', { name: 'Edit set 1 of back squat' })
    await expect(form.getByLabel('Weight')).toHaveValue('80')
    await expect(form.getByLabel('Reps')).toHaveValue('6')
    await expect(form.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(form.getByRole('button', { name: 'Save correction' })).toBeVisible()
    await expect(form.getByRole('button', { name: 'Clear set 1' })).toBeVisible()
    await checkA11y()
    await attachScreen(page, 'set-correction-edit-set-1-phone-390')

    // Close keeps the unsaved correction; reopening the same row hands it back.
    await form.getByLabel('Reps').fill('5')
    await dialog.getByRole('button', { name: 'Close log' }).focus()
    await page.keyboard.press('Enter')
    await expect(openLog(page)).toHaveCount(0)
    await edit.focus()
    await page.keyboard.press('Enter')
    dialog = await expectFocusedLog(page, 'Edit set 1')
    await expect(dialog.getByLabel('Reps')).toHaveValue('5')
    expect(app.mutations).toHaveLength(1)

    // Cancel writes nothing; Save correction writes the correction of the same row.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expectFocusedLog(page, 'Log set 2')
    expect(app.mutations).toHaveLength(1)
    await page.getByRole('button', { name: 'Close log' }).click()
    await edit.click()
    dialog = await expectFocusedLog(page, 'Edit set 1')
    await expect(dialog.getByLabel('Reps')).toHaveValue('6')
    await dialog.getByLabel('Reps').fill('5')
    await dialog.getByRole('radio', { name: 'Too hard' }).check()
    await dialog.getByRole('button', { name: 'Save correction' }).click()
    await expect.poll(() => app.mutations.length).toBe(2)
    expect(app.mutations[1]).toMatchObject({
      operation: 'correct', observation_id: app.mutations[0].observation_id, set_number: 1,
      values: { actual_reps: 5, weight: 80, effort: 'too_hard' },
    })
    await expectFocusedLog(page, 'Log set 2')
    await page.getByRole('button', { name: 'Close log' }).click()
    await expect(squat.getByRole('list', { name: 'Logged sets' })).toContainText('Set 1 · 5 reps · 80 kg')

    // Clear set asks first, over the log; Keep set is the safe action.
    await edit.click()
    dialog = await expectFocusedLog(page, 'Edit set 1')
    await dialog.getByRole('button', { name: 'Clear set 1' }).click()
    const confirm = page.getByRole('dialog', { name: 'Clear set 1 of back squat?' })
    await expect(confirm).toBeVisible()
    const actions = confirm.getByRole('button')
    await expect(actions.first()).toHaveText('Keep set')
    await checkA11y()
    await attachScreen(page, 'set-correction-clear-confirmation-phone-390')
    await confirm.getByRole('button', { name: 'Keep set' }).click()
    await expect(confirm).toBeHidden()
    await expect(dialog).toBeVisible()
    expect(app.mutations).toHaveLength(2)
    await dialog.getByRole('button', { name: 'Clear set 1' }).click()
    await confirm.getByRole('button', { name: 'Clear set', exact: true }).click()
    await expect.poll(() => app.mutations.length).toBe(3)
    expect(app.mutations[2]).toMatchObject({ operation: 'clear', observation_id: app.mutations[0].observation_id })
    await expect(openLog(page)).toHaveCount(0)
    await expect(rest).toBeFocused()
    await expect(squat.getByRole('list', { name: 'Logged sets' })).toHaveCount(0)
    app.assertContained()
  })

  for (const { size, viewport } of [
    { size: 'phone-320', viewport: { width: 320, height: 568 } },
  ]) {
    test(`JOURNEY-019 other lift, timed and distance movement ${size}: each opens the focused log with its own fields and saves through the original writer, while a superset round stays on its half-sheet (TASK-044)`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(150_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page)
      await visit('/workout')
      await page.getByRole('button', { name: 'Next section' }).click()
      await expect.poll(() => app.blockResults.length).toBe(1)

      // ── Other lift: Weight, Unit and Reps ──
      const rdl = card(page, 'romanian deadlift').getByRole('button', { name: 'Rest', exact: true })
      await rdl.click()
      let dialog = await expectFocusedLog(page, 'Log set 1')
      await expect(dialog.getByText(/^romanian deadlift · /)).toBeVisible()
      await dialog.getByLabel('Weight').fill('70')
      await dialog.getByRole('combobox', { name: 'Unit' }).selectOption('lb')
      await dialog.getByRole('button', { name: 'Log set 1', exact: true }).click()
      await expectFocusedLog(page, 'Set 1 logged')
      await expect.poll(() => app.mutations.length).toBe(1)
      expect(app.mutations[0]).toMatchObject({
        exercise_id: EXERCISE_ID.get('romanian-deadlift'), set_number: 1,
        values: { weight: 70, weight_unit: 'lb', actual_reps: 8 },
      })
      await noHorizontalOverflow(page)
      await attachScreen(page, `other-lift-set-1-logged-${size}`)
      await page.getByRole('button', { name: 'Close log' }).click()

      // ── Timed movement: Seconds only, no load fields for the unloaded plank ──
      const plank = card(page, 'plank').getByRole('button', { name: 'Rest', exact: true })
      await plank.click()
      dialog = await expectFocusedLog(page, 'Log set 1')
      await expect(dialog.getByLabel('Seconds')).toHaveValue('30')
      await expect(dialog.getByLabel('Weight')).toHaveCount(0)
      await expect(dialog.getByLabel('Reps')).toHaveCount(0)
      await dialog.getByLabel('Seconds').fill('28')
      await dialog.getByRole('radio', { name: 'Too hard' }).check()
      await checkA11y()
      await attachScreen(page, `timed-movement-log-set-1-${size}`)
      await dialog.getByRole('button', { name: 'Log set 1', exact: true }).click()
      await expectFocusedLog(page, 'Set 1 logged')
      await expect.poll(() => app.mutations.length).toBe(2)
      expect(app.mutations[1]).toMatchObject({
        exercise_id: EXERCISE_ID.get('plank'), set_number: 1,
        values: { actual_duration_seconds: 28, actual_reps: null, weight: null, effort: 'too_hard' },
      })
      await page.getByRole('button', { name: 'Close log' }).click()

      // ── Distance movement: Weight, Unit and Distance in metres ──
      const carry = card(page, 'farmer carry').getByRole('button', { name: 'Rest', exact: true })
      await carry.click()
      dialog = await expectFocusedLog(page, 'Log set 1')
      // No distance is suggested: the measure starts blank, never a guessed zero.
      await expect(dialog.getByLabel('Distance (m)')).toHaveValue('')
      await expect(dialog.getByLabel('Weight')).toBeVisible()
      await dialog.getByLabel('Weight').fill('24')
      await dialog.getByRole('combobox', { name: 'Unit' }).selectOption('kg')
      await dialog.getByLabel('Distance (m)').fill('35')
      await noHorizontalOverflow(page)
      await attachScreen(page, `distance-movement-log-set-1-${size}`)
      await dialog.getByRole('button', { name: 'Log set 1', exact: true }).click()
      await expectFocusedLog(page, 'Set 1 logged')
      await expect.poll(() => app.mutations.length).toBe(3)
      expect(app.mutations[2]).toMatchObject({
        exercise_id: EXERCISE_ID.get('farmer-carry'), set_number: 1,
        values: { actual_distance: 35, actual_distance_unit: 'm', weight: 24, weight_unit: 'kg', actual_reps: null },
      })
      // The one rest throughout: the latest movement's, in the open log.
      await expect(restBars(page)).toHaveCount(1)
      await page.getByRole('button', { name: 'Close log' }).click()

      // ── Not this family: the superset's round stays on its half-sheet ──
      await page.getByRole('button', { name: 'Next section' }).click()
      await expect.poll(() => app.blockResults.length).toBe(2)
      const pair = content(page).locator('.clr-card').filter({
        has: page.getByRole('list', { name: 'Movements in this superset' }),
      })
      await pair.getByRole('button', { name: 'Rest', exact: true }).click()
      await expect(page.getByRole('form', { name: 'Log round 1 of bench press and push up' })).toBeVisible()
      await expect(page.locator('section.clr-set-sheet')).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Minimize', exact: true })).toBeVisible()
      await expect(openLog(page)).toHaveCount(0)
      await page.getByRole('button', { name: 'Minimize', exact: true }).click()
      expect(app.mutations).toHaveLength(3)
      app.assertContained()
    })
  }

  for (const skin of SKINS) {
    test(`accepted gallery states ${skin} phone-390: anchor, other-lift, timed-movement, distance-movement, extra-set and set-correction open the route's own entry in the focused log, with nothing read or written over the network`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(150_000)
      await page.setViewportSize({ width: 390, height: 844 })
      await installDeterministicCapture(page, { skin, reducedMotion: true })
      const requests: string[] = []
      page.on('request', (request) => {
        if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
      })
      const states = [
        { id: 'anchor', movement: 'back squat', open: 'Rest', title: 'Log set 1', fields: ['Weight', 'Reps'] },
        { id: 'other-lift', movement: 'romanian deadlift', open: 'Rest', title: 'Log set 1', fields: ['Weight', 'Reps'] },
        { id: 'timed-movement', movement: 'plank', open: 'Rest', title: 'Log set 1', fields: ['Seconds'] },
        { id: 'distance-movement', movement: 'farmer carry', open: 'Rest', title: 'Log set 1', fields: ['Weight', 'Distance (m)'] },
        { id: 'extra-set', movement: 'back squat', open: 'Rest', title: 'Log set 4', fields: ['Weight', 'Reps'] },
        { id: 'set-correction', movement: 'back squat', open: 'Edit set 1', title: 'Edit set 1', fields: ['Weight', 'Reps'] },
      ] as const
      for (const state of states) {
        await visit(`/gallery/refinements?state=${state.id}`)
        await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
        const scope = page.locator(`[data-gallery-set-logging="${state.id}"]`)
        await expect(scope.getByRole('heading', { name: state.movement, exact: true })).toBeVisible()
        if (state.id === 'extra-set') await expect(scope.getByText('Extra set 4', { exact: true })).toBeVisible()
        await scope.getByRole('button', { name: state.open, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: state.title, exact: true })
        await expect(dialog).toBeVisible()
        expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true)
        await expect(dialog.getByRole('button', { name: 'Close log', exact: true })).toBeVisible()
        for (const field of state.fields) await expect(dialog.getByLabel(field, { exact: true })).toBeVisible()
        if (state.id === 'timed-movement') await expect(dialog.getByLabel('Weight')).toHaveCount(0)
        if (state.id === 'set-correction') {
          await expect(dialog.getByRole('button', { name: 'Save correction' })).toBeVisible()
          await expect(dialog.getByRole('button', { name: 'Clear set 1' })).toBeVisible()
        }
        await noHorizontalOverflow(page)
        await checkA11y()
        await attachScreen(page, `gallery-${state.id}-${skin}-phone-390`)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
      }
      // The anchor's save is answered in memory and confirmed like the route's.
      await visit('/gallery/refinements?state=anchor')
      await page.locator('[data-gallery-set-logging="anchor"]').getByRole('button', { name: 'Rest', exact: true }).click()
      await page.getByRole('button', { name: 'Log set 1', exact: true }).click()
      const saved = page.getByRole('dialog', { name: 'Set 1 logged', exact: true })
      await expect(saved).toBeVisible()
      await expect(saved.locator('.clr-set-sheet__saved[role="status"]')).toContainText('Set 1 · 5 reps')
      expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
    })
  }
})
