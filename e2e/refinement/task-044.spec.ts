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
 * TASK-044 (REQ-019; C45; R82, R100, R115, R116; TASK-AC-A6979DFEDE2D,
 * TASK-AC-FCC746654DD9, TASK-AC-3830472CD65C; foundation provider for
 * JOURNEY-019) — the superset and circuit family adopts the shared focused
 * logging dialog on the real `/workout` route: the superset round (and its
 * movements' saved-set corrections), the circuit round and its Undo (TASK-021
 * drew `Round N recorded` in the dialog; checked here as this family's
 * moment), and the circuit movement entry.
 *
 * Entry (ENTRY-019): the superset block's Rest, a superset movement's saved
 * row Edit, the circuit's Finish round and a circuit movement's Rest on
 * `/workout`, behind the existing auth guard, on a contained synthetic
 * session. Action: open, enter or correct, close and reopen, save, retry,
 * take back. Result: each entry is the native modal `LoggingOverlay` — its one
 * title, the framed icon-only "Close log" X, the Balanced backdrop, the
 * workout behind it inert — holding the family's own fields (per-movement
 * Performed, load/unit/measure and Effort for a round; the movement's actual
 * entry for a circuit movement; round time, the circuit's rest and Take back
 * this round), its own draft, Save confirmation and the one rest; every write
 * is the original set-observation writer's, and an unticked movement is
 * never logged. Recovery: a refused write is held on this device and retried
 * under its own id; close/reopen and Escape keep the draft.
 *
 * Synthetic and contained: an intercepted session for a fictional user. The
 * only writes are the set observations the athlete makes and a section's own
 * block result when Next section leaves it, answered here and never
 * forwarded; no model call, no real row. The accepted gallery states are
 * memory-only and read nothing over the network.
 */
const OWNER = '00000000-0000-4000-8000-000000004401'
const PLACE = '00000000-0000-4000-8000-000000004411'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The superset's block rest, after both movements. */
const PAIR_REST = 45
/** The circuit's one rest between rounds. */
const ROUND_REST = 40

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
    if (code !== null) throw new Error(`Synthetic TASK-044 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-044 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-044.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-044-public-placeholder',
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
  title: 'Synthetic TASK-044 superset and circuit workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: PLACE, goal_preset: 'balanced' },
  sections: [
    { title: 'Accessory', sectionType: 'accessory', blocks: [{
      structureType: 'superset', rounds: 3, roundRestSeconds: PAIR_REST,
      exercises: [
        { prescription: { exercise_id: 'bench-press', order_index: 0, modality: 'reps', target_value: 8, sets: 3 } },
        { prescription: { exercise_id: 'push-up', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'reps', target_value: 10, sets: 3 } },
      ],
    }] },
    { title: 'Conditioning', sectionType: 'conditioning', blocks: [{
      structureType: 'circuit', rounds: 3, roundRestSeconds: ROUND_REST,
      exercises: [
        { prescription: { exercise_id: 'goblet-squat', order_index: 0, equipment_used: 'kettlebell', target_value: 8, sets: 3 } },
        { prescription: { exercise_id: 'push-up', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, target_value: 10, sets: 3 } },
      ],
    }] },
  ],
}))
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
const BLOCK_IDS = new Set(WORKOUT.sections.flatMap((section) => section.blocks.map(({ block }) => block.id)))
/** Each movement's `workout_exercises.id`, by section and catalog id. */
function exerciseId(section: number, catalogId: string): string {
  const found = WORKOUT.sections[section].blocks.flatMap((block) => block.exercises)
    .find(({ exercise }) => exercise.exercise_id === catalogId)
  if (found === undefined) throw new Error(`no ${catalogId} in section ${section}`)
  return found.exercise.id
}
const BENCH = exerciseId(0, 'bench-press')
const PAIR_PUSH_UP = exerciseId(0, 'push-up')
const GOBLET = exerciseId(1, 'goblet-squat')

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  readonly reducedMotion?: boolean
  readonly skin?: Skin
}

/**
 * Reads answer the fixture; the writes the journey makes — a set observation,
 * inserted, corrected or cleared, and a section's block result — are answered
 * here and never forwarded. One set observation may be refused.
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
      if (name === 'profiles') return reply([onboardedProfile({ id: OWNER, goal_preset: 'balanced' })])
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
        id: `00000000-0000-4000-8000-4400000000${String(blockResults.length + 1).padStart(2, '0')}`,
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
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-044 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-044-session', refreshToken: 'synthetic-task-044-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-044@example.invalid' },
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
/** Every rest countdown on the page: the session's one rest and the circuit's rest. */
const restTimers = (page: Page) => page.getByRole('timer', { name: 'Time remaining', exact: true })

/** The superset's one card. */
function pairCard(page: Page): Locator {
  return content(page).locator('.clr-card').filter({
    has: page.getByRole('list', { name: 'Movements in this superset', exact: true }),
  })
}

/** The circuit's one card. */
function circuitCard(page: Page): Locator {
  return content(page).locator('.clr-card').filter({
    has: page.getByRole('list', { name: 'Movements in this circuit', exact: true }),
  })
}

/** One movement's row, by its heading, on the main screen. */
function movementRow(page: Page, heading: string): Locator {
  return content(page).locator('section').filter({
    has: page.getByRole('heading', { name: heading, exact: true }),
  }).last()
}

const roundClock = (card: Locator) => card.getByRole('group', { name: 'Round clock', exact: true })
const roundRecord = (card: Locator) => roundClock(card).getByRole('status')

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
  // The X is framed: the shared secondary icon button — chamfered, with the
  // shared hit area and its glyph — inside its emitting bleed, never quiet.
  expect(await close.evaluate((node) => ({
    framed: ['clr-chamfer', 'clr-btn', 'clr-hit'].every((name) => node.classList.contains(name)),
    quiet: node.classList.contains('clr-btn--quiet'),
    bleed: node.parentElement?.classList.contains('clr-bleed') ?? false,
    glyph: node.querySelector('svg') !== null,
  }))).toEqual({ framed: true, quiet: false, bleed: true, glyph: true })
  await expect(page.getByRole('button', { name: /^Minimi[sz]e$/ })).toHaveCount(0)
  await expect(page.locator('section.clr-set-sheet')).toHaveCount(0)
  // The Balanced backdrop on the native backdrop; the half-sheet layer stays closed.
  const backdrop = await dialog.evaluate((node) => getComputedStyle(node, '::backdrop').backdropFilter)
  expect(backdrop).toMatch(/blur\(/)
  await expect(page.locator('.clr-set-sheet-layer[data-open]')).toHaveCount(0)
  // Inert behind: no control of the workout can take focus while it is open.
  const behind = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    const controls = [...document.querySelectorAll<HTMLElement>('main#main button, .clr-workout-footer button')]
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

test.describe('TASK-044 superset and circuit logging in the shared focused dialog', () => {
  test('JOURNEY-019 superset round phone-390 touch: the block Rest opens Log round N in the modal log over an inert workout beside the block rest, close and Escape keep each movement draft and Performed, Log round saves only Performed movements through the original writer, and the rest ending closes the confirmation', async ({ page, visit, checkA11y }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page)
    await page.clock.install()
    await visit('/workout')
    await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()
    const pair = pairCard(page)
    await expect(pair).toBeVisible()

    // ── Entry: the block's one Rest opens the round in the focused log ──
    const rest = pair.getByRole('button', { name: 'Rest', exact: true })
    await expect(pair.getByRole('button', { name: 'Rest', exact: true })).toHaveCount(1)
    await rest.tap()
    let dialog = await expectFocusedLog(page, 'Log round 1')
    await expect(dialog.getByRole('button', { name: 'Close log' })).toBeFocused()
    await expect(rest).toHaveAttribute('aria-expanded', 'true')
    // The block's one rest, drawn in the log; none in the footer behind it.
    await expect(restBars(page)).toHaveCount(1)
    await expect(dialog.getByRole('region', { name: 'Rest', exact: true })).toContainText('Rest after round 1')
    expect(await restRemaining(page)).toBeLessThanOrEqual(PAIR_REST)
    const form1 = dialog.getByRole('form', { name: 'Log round 1 of bench press and push up' })
    // The round's fields: each movement one complete group — its name and
    // prescription, Performed, its own load/unit/measure and Effort. No
    // helper paragraph, no generic Notes.
    const bench = form1.getByRole('group', { name: 'A1 bench press, set 1' })
    const pushUp = form1.getByRole('group', { name: 'A2 push up, set 1' })
    await expect(form1.locator('.clr-logging-movement')).toHaveCount(2)
    await expect(bench.getByRole('checkbox', { name: 'Performed' })).not.toBeChecked()
    await expect(bench.getByLabel('Weight')).toBeVisible()
    await expect(bench.getByRole('combobox', { name: 'Unit' })).toBeVisible()
    await expect(bench.getByLabel('Reps')).toHaveValue('8')
    await expect(bench.getByRole('group', { name: 'Effort' })).toBeVisible()
    await expect(pushUp.getByRole('checkbox', { name: 'Performed' })).not.toBeChecked()
    await expect(pushUp.getByLabel('Weight')).toHaveCount(0)
    await expect(pushUp.getByLabel('Reps')).toHaveValue('10')
    await expect(dialog.getByText(/Tick each movement/)).toHaveCount(0)
    await expect(dialog.getByLabel(/notes/i)).toHaveCount(0)
    // Nothing identified as performed yet: there is no round to log.
    await expect(form1.getByRole('button', { name: 'Log round 1', exact: true })).toBeDisabled()
    await noHorizontalOverflow(page)
    await checkA11y()
    await attachScreen(page, 'superset-log-round-1-phone-390')

    // ── Draft retention: the X and Escape close; reopening hands back the draft ──
    await bench.getByLabel('Weight').fill('60')
    await bench.getByRole('combobox', { name: 'Unit' }).selectOption('kg')
    await bench.getByLabel('Reps').fill('7')
    await bench.getByRole('radio', { name: 'About right' }).check()
    await expect(bench.getByRole('checkbox', { name: 'Performed' })).toBeChecked()
    await dialog.getByRole('button', { name: 'Close log' }).tap()
    await expect(openLog(page)).toHaveCount(0)
    await expect(rest).toBeFocused()
    // The rest goes on, back in the footer.
    await expect(restBars(page)).toHaveCount(1)
    expect(app.attempts).toHaveLength(0)
    await rest.tap()
    dialog = await expectFocusedLog(page, 'Log round 1')
    await expect(dialog.getByLabel('Weight')).toHaveValue('60')
    await expect(bench.getByLabel('Reps')).toHaveValue('7')
    await expect(bench.getByRole('radio', { name: 'About right' })).toBeChecked()
    await expect(bench.getByRole('checkbox', { name: 'Performed' })).toBeChecked()
    await expect(pushUp.getByRole('checkbox', { name: 'Performed' })).not.toBeChecked()
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(rest).toBeFocused()
    await rest.tap()
    dialog = await expectFocusedLog(page, 'Log round 1')
    await expect(bench.getByLabel('Reps')).toHaveValue('7')
    expect(app.attempts).toHaveLength(0)

    // ── Save: only the Performed movement, through the original writer ──
    const before = await restRemaining(page)
    await dialog.getByRole('button', { name: 'Log round 1', exact: true }).tap()
    dialog = await expectFocusedLog(page, 'Round 1 logged')
    await expect.poll(() => app.mutations.length).toBe(1)
    expect(app.mutations[0]).toMatchObject({
      operation: 'insert', exercise_id: BENCH, set_number: 1,
      values: { weight: 60, actual_reps: 7, effort: 'about_right' },
    })
    // The unticked partner is not logged: no zero, no copy, no prefill.
    expect(app.attempts.some((attempt) => attempt.exercise_id === PAIR_PUSH_UP)).toBe(false)
    const status = dialog.locator('.clr-set-log > [role="status"]')
    await expect(status).toContainText('A1 bench press · Set 1 · 7 reps · 60 kg')
    await expect(status).toContainText('Saved')
    await expect(status).not.toContainText('push up')
    await expect(dialog.getByRole('form')).toHaveCount(0)
    // The same rest, running on, in the log.
    await expect(dialog.getByRole('region', { name: 'Rest', exact: true })).toBeVisible()
    expect(await restRemaining(page)).toBeLessThanOrEqual(before)
    await checkA11y()
    await attachScreen(page, 'superset-round-1-logged-phone-390')

    // ── The rest ending closes the log; nothing is opened or recorded ──
    await page.clock.fastForward((PAIR_REST + 2) * 1000)
    await expect(openLog(page)).toHaveCount(0)
    await expect(restBars(page)).toHaveCount(0)
    await expect(rest).toBeFocused()
    expect(app.attempts).toHaveLength(1)

    // ── Round 2, deliberately: only the partner, explicitly Performed ──
    await rest.tap()
    dialog = await expectFocusedLog(page, 'Log round 2')
    const round2 = dialog.getByRole('form', { name: 'Log round 2 of bench press and push up' })
    await expect(round2.getByRole('group', { name: 'A1 bench press, set 2' }).getByLabel('Weight')).toHaveValue('60')
    await round2.getByRole('group', { name: 'A2 push up, set 2' }).getByRole('checkbox', { name: 'Performed' }).check()
    await round2.getByRole('button', { name: 'Log round 2', exact: true }).tap()
    dialog = await expectFocusedLog(page, 'Round 2 logged')
    await expect.poll(() => app.mutations.length).toBe(2)
    expect(app.mutations[1]).toMatchObject({ operation: 'insert', exercise_id: PAIR_PUSH_UP, set_number: 2 })
    await expect(dialog.locator('.clr-set-log > [role="status"]')).toContainText('A2 push up · Set 2')
    await expect(dialog.locator('.clr-set-log > [role="status"]')).not.toContainText('bench press')
    await dialog.getByRole('button', { name: 'Close log' }).tap()
    await expect(openLog(page)).toHaveCount(0)
    await expect(rest).toBeFocused()
    await expect(movementRow(page, 'A1 bench press').getByRole('list', { name: 'Logged sets' })).toContainText('Set 1 · 7 reps · 60 kg')
    await expect(movementRow(page, 'A2 push up').getByRole('list', { name: 'Logged sets' }).getByRole('listitem')).toHaveCount(1)
    await expect(movementRow(page, 'A2 push up').getByRole('list', { name: 'Logged sets' })).toContainText('Set 2')
    app.assertContained()
  })

  test('JOURNEY-019 superset correction and retry phone-390 keyboard reduced motion: a refused round write is held on this device and retried under its own id; a movement Edit opens Edit set N in the log, close keeps the correction, Cancel and Save correction keep the writer, and Clear set asks with Keep set first', async ({ page, visit, checkA11y }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { reducedMotion: true })
    await visit('/workout')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const pair = pairCard(page)
    const rest = pair.getByRole('button', { name: 'Rest', exact: true })

    // ── A refused write: performed work is kept, never claimed as saved ──
    await rest.focus()
    await page.keyboard.press('Enter')
    let dialog = await expectFocusedLog(page, 'Log round 1')
    await expect(dialog.getByRole('button', { name: 'Close log' })).toBeFocused()
    const bench = dialog.getByRole('group', { name: 'A1 bench press, set 1' })
    await bench.getByLabel('Weight').fill('80')
    await bench.getByLabel('Reps').fill('6')
    await bench.getByLabel('Reps').focus()
    app.failNextMutation()
    await page.keyboard.press('Enter')
    dialog = await expectFocusedLog(page, 'Round 1 logged')
    await expect(dialog.getByRole('heading', { name: 'Round 1 logged' })).toBeFocused()
    const status = dialog.locator('.clr-set-log > [role="status"]')
    await expect(status).toContainText('On this device only')
    await expect(status).not.toContainText('Saved')
    expect(app.mutations).toHaveLength(0)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(status).toContainText('Saved')
    expect(app.mutations).toHaveLength(1)
    expect(app.attempts[1]).toEqual(app.attempts[0])
    expect(app.mutations[0]).toMatchObject({ operation: 'insert', exercise_id: BENCH, set_number: 1,
      values: { weight: 80, actual_reps: 6 } })
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await expect(rest).toBeFocused()

    // ── Correction: the movement's saved row Edit opens it in the same log ──
    const benchRow = movementRow(page, 'A1 bench press')
    const edit = benchRow.getByRole('button', { name: 'Edit set 1' })
    await edit.focus()
    await page.keyboard.press('Enter')
    dialog = await expectFocusedLog(page, 'Edit set 1')
    const form = dialog.getByRole('form', { name: 'Edit set 1 of bench press' })
    await expect(form.getByLabel('Weight')).toHaveValue('80')
    await expect(form.getByLabel('Reps')).toHaveValue('6')
    await expect(form.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(form.getByRole('button', { name: 'Save correction' })).toBeVisible()
    await expect(form.getByRole('button', { name: 'Clear set 1' })).toBeVisible()
    await checkA11y()
    await attachScreen(page, 'superset-edit-set-1-phone-390')

    // Close keeps the unsaved correction; reopening the same row hands it back.
    await form.getByLabel('Reps').fill('5')
    await dialog.getByRole('button', { name: 'Close log' }).focus()
    await page.keyboard.press('Enter')
    await expect(openLog(page)).toHaveCount(0)
    await expect(edit).toBeFocused()
    await page.keyboard.press('Enter')
    dialog = await expectFocusedLog(page, 'Edit set 1')
    await expect(dialog.getByLabel('Reps')).toHaveValue('5')
    expect(app.mutations).toHaveLength(1)

    // Cancel writes nothing and closes; Save correction corrects the same row.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(openLog(page)).toHaveCount(0)
    await expect(edit).toBeFocused()
    expect(app.mutations).toHaveLength(1)
    await page.keyboard.press('Enter')
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
    await expect(openLog(page)).toHaveCount(0)
    await expect(edit).toBeFocused()
    await expect(benchRow.getByRole('list', { name: 'Logged sets' })).toContainText('Set 1 · 5 reps · 80 kg')

    // Clear set asks first, over the log; Keep set is the safe action.
    await edit.click()
    dialog = await expectFocusedLog(page, 'Edit set 1')
    await dialog.getByRole('button', { name: 'Clear set 1' }).click()
    const confirm = page.getByRole('dialog', { name: 'Clear set 1 of bench press?' })
    await expect(confirm).toBeVisible()
    await expect(confirm.getByRole('button').first()).toHaveText('Keep set')
    await checkA11y()
    await attachScreen(page, 'superset-clear-confirmation-phone-390')
    await confirm.getByRole('button', { name: 'Keep set' }).click()
    await expect(confirm).toBeHidden()
    await expect(dialog).toBeVisible()
    expect(app.mutations).toHaveLength(2)
    await dialog.getByRole('button', { name: 'Clear set 1' }).click()
    await confirm.getByRole('button', { name: 'Clear set', exact: true }).click()
    await expect.poll(() => app.mutations.length).toBe(3)
    expect(app.mutations[2]).toMatchObject({ operation: 'clear', observation_id: app.mutations[0].observation_id })
    await expect(openLog(page)).toHaveCount(0)
    // The row is gone: focus falls back to the block's Rest.
    await expect(rest).toBeFocused()
    await expect(benchRow.getByRole('list', { name: 'Logged sets' })).toHaveCount(0)
    app.assertContained()
  })

  test('JOURNEY-019 circuit round, Undo and movement entry phone-320: Finish round opens Round N recorded in the modal log and Take back this round undoes it; a movement Rest opens its Log set N in the same log with its draft kept through close, saves and corrects through the original writer, and records no round and no second rest', async ({ page, visit, checkA11y }) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page)
    await page.clock.install()
    await visit('/workout')
    await page.getByRole('button', { name: 'Next section' }).click()
    await expect.poll(() => app.blockResults.length).toBe(1)
    const card = circuitCard(page)
    await expect(card).toBeVisible()
    await expect(roundRecord(card)).toHaveText('No rounds recorded')

    // ── Circuit round: Finish round opens Round 1 recorded; Undo takes it back ──
    await roundClock(card).getByRole('button', { name: 'Start round 1', exact: true }).click()
    await page.clock.fastForward(30_000)
    await roundClock(card).getByRole('button', { name: 'Finish round 1', exact: true }).click()
    let dialog = await expectFocusedLog(page, 'Round 1 recorded')
    await expect(dialog.getByRole('button', { name: 'Close log' })).toBeFocused()
    await expect(dialog.getByRole('status')).toContainText('round time recorded')
    await expect(dialog.getByText('Rest after round 1', { exact: true })).toBeVisible()
    // The circuit's own rest, drawn once — in the log while it is open.
    await expect(restTimers(page)).toHaveCount(1)
    await expect(roundRecord(card)).toHaveText('1 of 3 rounds recorded')
    await dialog.getByRole('button', { name: 'Take back this round', exact: true }).click()
    await expect(openLog(page)).toHaveCount(0)
    await expect(roundRecord(card)).toHaveText('No rounds recorded')
    await expect(restTimers(page)).toHaveCount(0)
    await roundClock(card).getByRole('button', { name: 'Finish round 1', exact: true }).click()
    dialog = await expectFocusedLog(page, 'Round 1 recorded')
    await expect(roundRecord(card)).toHaveText('1 of 3 rounds recorded')
    await noHorizontalOverflow(page)
    await attachScreen(page, 'circuit-round-1-recorded-phone-320')
    await dialog.getByRole('button', { name: 'Close log' }).click()
    await expect(openLog(page)).toHaveCount(0)
    await expect(restTimers(page)).toHaveCount(1)
    expect(app.attempts).toHaveLength(0)

    // ── Circuit movement entry: one tap opens Log set 1 in the focused log ──
    await card.getByRole('button', { name: 'Rest for goblet squat', exact: true }).click()
    dialog = await expectFocusedLog(page, 'Log set 1')
    await expect(dialog.getByRole('button', { name: 'Close log' })).toBeFocused()
    const entry = dialog.getByRole('form', { name: 'Log set 1 of goblet squat' })
    // The movement's existing actual entry: Weight, Unit, Reps and Effort; no
    // Performed tick, no round field.
    await expect(entry.getByLabel('Weight')).toBeVisible()
    await expect(entry.getByRole('combobox', { name: 'Unit' })).toBeVisible()
    await expect(entry.getByLabel('Reps')).toHaveValue('8')
    await expect(entry.getByRole('group', { name: 'Effort' })).toBeVisible()
    await expect(entry.getByRole('checkbox', { name: 'Performed' })).toHaveCount(0)
    // No movement rest is invented: the log draws no session rest, and the
    // circuit's rest between rounds stays the one countdown, on the card.
    await expect(dialog.getByRole('region', { name: 'Rest', exact: true })).toHaveCount(0)
    await expect(restTimers(page)).toHaveCount(1)
    await expect(dialog.getByRole('timer', { name: 'Time remaining' })).toHaveCount(0)
    await noHorizontalOverflow(page)
    await checkA11y()
    await attachScreen(page, 'circuit-movement-log-set-1-phone-320')

    // Close keeps the draft; the entry's own Rest reopens it unchanged.
    await entry.getByLabel('Weight').fill('16')
    await entry.getByRole('combobox', { name: 'Unit' }).selectOption('kg')
    await entry.getByLabel('Reps').fill('7')
    await dialog.getByRole('button', { name: 'Close log' }).click()
    await expect(openLog(page)).toHaveCount(0)
    const entryRest = card.getByRole('button', { name: 'Rest', exact: true })
    await expect(entryRest).toBeFocused()
    expect(app.attempts).toHaveLength(0)
    await entryRest.click()
    dialog = await expectFocusedLog(page, 'Log set 1')
    await expect(dialog.getByLabel('Weight')).toHaveValue('16')
    await expect(dialog.getByLabel('Reps')).toHaveValue('7')
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    await entryRest.click()
    dialog = await expectFocusedLog(page, 'Log set 1')

    // Save: the original writer; a set is not a round.
    await dialog.getByRole('button', { name: 'Log set 1', exact: true }).click()
    dialog = await expectFocusedLog(page, 'Set 1 logged')
    await expect.poll(() => app.mutations.length).toBe(1)
    expect(app.mutations[0]).toMatchObject({
      operation: 'insert', exercise_id: GOBLET, set_number: 1,
      values: { weight: 16, weight_unit: 'kg', actual_reps: 7 },
    })
    await expect(dialog.locator('.clr-set-log > [role="status"]')).toContainText('Set 1 · 7 reps · 16 kg')
    await expect(roundRecord(card)).toHaveText('1 of 3 rounds recorded')
    await expect(restTimers(page)).toHaveCount(1)
    await attachScreen(page, 'circuit-movement-set-1-logged-phone-320')
    await dialog.getByRole('button', { name: 'Close log' }).click()

    // Correction of the saved set, in the same log, through the same writer.
    await card.getByRole('button', { name: 'Edit set 1' }).click()
    dialog = await expectFocusedLog(page, 'Edit set 1')
    await dialog.getByLabel('Reps').fill('8')
    await dialog.getByRole('button', { name: 'Save correction' }).click()
    await expect.poll(() => app.mutations.length).toBe(2)
    expect(app.mutations[1]).toMatchObject({
      operation: 'correct', observation_id: app.mutations[0].observation_id, set_number: 1,
      values: { actual_reps: 8, weight: 16 },
    })
    await expectFocusedLog(page, 'Log set 2')
    await page.getByRole('button', { name: 'Close log' }).click()
    await expect(openLog(page)).toHaveCount(0)
    await card.getByRole('button', { name: 'Hide load entry for goblet squat', exact: true }).click()
    await expect(card.getByText('1 set logged', { exact: true })).toBeVisible()
    await expect(roundRecord(card)).toHaveText('1 of 3 rounds recorded')
    expect(app.mutations).toHaveLength(2)
    app.assertContained()
  })

  for (const skin of SKINS) {
    test(`accepted gallery states ${skin} phone-390: superset, circuit-round and circuit-movement open the route's own entry in the focused log, with nothing read or written over the network`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(150_000)
      await page.setViewportSize({ width: 390, height: 844 })
      await installDeterministicCapture(page, { skin, reducedMotion: true })
      const requests: string[] = []
      page.on('request', (request) => {
        if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
      })

      // ── superset: the route's SupersetBlock; Rest opens Log round 1 ──
      await visit('/gallery/refinements?state=superset')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      const superset = page.locator('[data-gallery-group-logging="superset"]')
      await expect(superset.getByRole('list', { name: 'Movements in this superset' })).toBeVisible()
      await superset.getByRole('button', { name: 'Rest', exact: true }).click()
      let dialog = page.getByRole('dialog', { name: 'Log round 1', exact: true })
      await expect(dialog).toBeVisible()
      expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true)
      await expect(dialog.getByRole('button', { name: 'Close log', exact: true })).toBeVisible()
      const row = dialog.getByRole('group', { name: 'A1 one arm row, set 1' })
      await expect(row.getByRole('checkbox', { name: 'Performed' })).toBeVisible()
      for (const field of ['Weight', 'Reps']) await expect(row.getByLabel(field, { exact: true })).toBeVisible()
      await expect(dialog.getByRole('group', { name: 'A2 bicep curl, set 1' })).toBeVisible()
      await expect(dialog.getByRole('region', { name: 'Rest', exact: true })).toContainText('Rest after round 1')
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-superset-${skin}-phone-390`)
      // The save is answered in memory and confirmed like the route's.
      await row.getByLabel('Reps').fill('9')
      await dialog.getByRole('button', { name: 'Log round 1', exact: true }).click()
      const saved = page.getByRole('dialog', { name: 'Round 1 logged', exact: true })
      await expect(saved).toBeVisible()
      await expect(saved.locator('.clr-set-log > [role="status"]')).toContainText('A1 one arm row · Set 1 · 9 reps')
      await page.keyboard.press('Escape')
      await expect(saved).toBeHidden()

      // ── circuit-round: the route's CircuitBlock; Finish round 1 opens Round 1 recorded ──
      await visit('/gallery/refinements?state=circuit-round')
      const circuitRound = page.locator('[data-gallery-circuit-round]')
      await circuitRound.getByRole('button', { name: 'Finish round 1', exact: true }).click()
      dialog = page.getByRole('dialog', { name: 'Round 1 recorded', exact: true })
      await expect(dialog).toBeVisible()
      expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true)
      await expect(dialog.getByRole('button', { name: 'Close log', exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Take back this round', exact: true })).toBeVisible()
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-circuit-round-${skin}-phone-390`)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()

      // ── circuit-movement: a movement Rest opens its Log set 1 ──
      await visit('/gallery/refinements?state=circuit-movement')
      const circuitMovement = page.locator('[data-gallery-group-logging="circuit-movement"]')
      await circuitMovement.getByRole('button', { name: 'Rest for goblet squat', exact: true }).click()
      dialog = page.getByRole('dialog', { name: 'Log set 1', exact: true })
      await expect(dialog).toBeVisible()
      expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true)
      await expect(dialog.getByRole('button', { name: 'Close log', exact: true })).toBeVisible()
      const entry = dialog.getByRole('form', { name: 'Log set 1 of goblet squat' })
      for (const field of ['Weight', 'Reps']) await expect(entry.getByLabel(field, { exact: true })).toBeVisible()
      await expect(entry.getByRole('checkbox', { name: 'Performed' })).toHaveCount(0)
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-circuit-movement-${skin}-phone-390`)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()

      expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
    })
  }
})
