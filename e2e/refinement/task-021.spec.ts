import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import {
  blockResultRowSchema,
  exerciseSetLogRowSchema,
  sessionSnapshotSchema,
  type BlockResultRow,
  type ExerciseSetLogRow,
} from '../../src/state/schemas'
import { isSetObservationMutation, type SetObservationAck, type SetObservationMutation } from '../../src/state/set-observation-mutation'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-021 (REQ-021; C48, G13; R18, R103, R104, R105; V13; AC-C48-01,
 * AC-R021-01, AC-R021-02; JOURNEY-021) — the circuit's round recording, Undo,
 * active round time and round-time history on the real `/workout` route, with
 * the recorded round confirmed in the shared focused logging dialog, and the
 * recorded rounds and an optional movement actual read back on
 * `/history/:id`.
 *
 * Entry (ENTRY-021): a running session, behind the existing auth guard, whose
 * first section is a three-round circuit with 45 seconds between rounds
 * (goblet squat, push-up, kettlebell swing), on a contained synthetic
 * session. Action: start round 1, finish it, inspect `Round 1 recorded`, take
 * it back, record it again, close the log, let the rest end, record round 2
 * into a rest that ends with the log open, log one optional movement actual,
 * leave the section through a refused save and its retry, and open History.
 * Result: the log is the native modal `LoggingOverlay` — its one title, the
 * framed icon-only "Close log" X at the title's top, the workout behind inert
 * — holding the recorded round time, the circuit's own rest as the whole
 * timer body at the log's full content width and Take back this round; the
 * one circuit controller's record (`clear.workout-circuits`) is all that
 * changes; round times, active time, history and the actual survive, and the
 * saved row carries only the recorded round count. Recovery: Escape is the
 * X, a reload mid-rest comes back to the card and its rest (never the log), a
 * refused save keeps everything and its retry saves the same count.
 *
 * Synthetic and contained: an intercepted session for a fictional user. The
 * only writes are the set observation the athlete makes and the section's own
 * block results when Next section leaves it, answered here and never
 * forwarded; History reads back exactly those rows. No model call, no real
 * row. The accepted gallery state is memory-only and reads nothing over the
 * network.
 */
const OWNER = '00000000-0000-4000-8000-000000002101'
const PLACE = '00000000-0000-4000-8000-000000002111'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The circuit's one rest between rounds. */
const ROUND_REST = 45
const CIRCUIT_KEY = 'clear.workout-circuits'

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
    if (code !== null) throw new Error(`Synthetic TASK-021 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-021 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-021.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-021-public-placeholder',
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
  title: 'Synthetic TASK-021 circuit workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: PLACE, goal_preset: 'balanced' },
  sections: [
    { title: 'Conditioning', sectionType: 'conditioning', blocks: [{
      structureType: 'circuit', rounds: 3, roundRestSeconds: ROUND_REST,
      exercises: [
        { prescription: { exercise_id: 'goblet-squat', order_index: 0, equipment_used: 'kettlebell', target_value: 8, sets: 3 } },
        { prescription: { exercise_id: 'push-up', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, target_value: 10, sets: 3 } },
        { prescription: { exercise_id: 'kettlebell-swing', order_index: 2, equipment_used: 'kettlebell', target_value: 15, sets: 3 } },
      ],
    }] },
    { title: 'Accessory', sectionType: 'accessory', blocks: [{ exercises: [
      { prescription: { exercise_id: 'romanian-deadlift', order_index: 0, sets: 2, target_value: 8, rest_seconds: 60 } },
    ] }] },
  ],
}))
const WORKOUT_EXERCISES = WORKOUT.sections.flatMap((section) => section.blocks
  .flatMap((block) => block.exercises.map(({ exercise }) => exercise)))
const EXERCISE_ID = new Map(WORKOUT_EXERCISES.map((exercise) => [exercise.exercise_id, exercise.id]))
const BLOCK_IDS = new Set(WORKOUT.sections.flatMap((section) => section.blocks.map(({ block }) => block.id)))
const CIRCUIT_BLOCK_ID = WORKOUT.sections[0].blocks[0].block.id

// ─────────────────────────────────────────────────────────────────────────────
// The synthetic app
// ─────────────────────────────────────────────────────────────────────────────

interface AppOptions {
  readonly reducedMotion?: boolean
  readonly skin?: Skin
}

/**
 * Reads answer the fixture. The writes the journey makes — one set
 * observation and the sections' block results — are answered here and never
 * forwarded; one block save may be refused. History reads back exactly these.
 */
async function syntheticApp(page: Page, options: AppOptions = {}) {
  const unexpected: string[] = []
  const mutations: SetObservationMutation[] = []
  const blockAttempts: Record<string, unknown>[] = []
  const blockResults: BlockResultRow[] = []
  const rows = new Map<string, ExerciseSetLogRow>()
  const heads = new Map<string, SetObservationAck['head']>()
  let refuseNextBlockSave = false
  const guard = await installDeterministicCapture(page, { skin: options.skin ?? 'clear', reducedMotion: options.reducedMotion ?? false })

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
      // Every other read is an empty answer: no history, anchors or favorites.
      return reply([])
    }
    if (request.method() === 'POST' && name === 'block_results') {
      const insert = (request.postDataJSON() as Record<string, unknown>[])[0]
      blockAttempts.push(insert)
      if (!BLOCK_IDS.has(String(insert.block_id))) unexpected.push(`block_results for ${String(insert.block_id)}`)
      if (refuseNextBlockSave) {
        refuseNextBlockSave = false
        return reply({ code: 'PGRST000', message: 'Controlled TASK-021 save boundary unavailable.' }, 503)
      }
      const row = blockResultRowSchema.parse({ elapsed_seconds: null, completed_under_cap: null,
        rounds_completed: null, partial_round_reps: null, minutes_completed: null, highest_rung: null,
        perceived_effort: null, notes: null, ...insert,
        id: `00000000-0000-4000-8000-2100000000${String(blockResults.length + 1).padStart(2, '0')}`,
        created_at: new Date().toISOString() })
      blockResults.push(row)
      return reply([row], 201)
    }
    if (request.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (name === 'resume_session' || name === 'session_snapshot') return reply(WORKOUT)
      if (name === 'session_as_performed') {
        // History reads back the rows this origin was sent — and nothing else.
        return reply({
          reconstruction: 'performed',
          as_of: WORKOUT.session.started_at,
          session: WORKOUT.session,
          state: WORKOUT.state,
          sections: WORKOUT.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => ({
              ...block,
              block_result: blockResults.find((row) => row.block_id === block.block.id) ?? null,
              exercises: block.exercises.map((entry) => ({
                ...entry,
                set_logs: [...rows.values()].filter((row) => row.workout_exercise_id === entry.exercise.id),
                movement_result: null,
              })),
            })),
          })),
        })
      }
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
        const previous = heads.get(mutation.observation_id)
        if (previous?.mutation_id === mutation.mutation_id) {
          return reply({ outcome: 'replayed', mutation, head: previous })
        }
        const row = exerciseSetLogRowSchema.parse({
          id: mutation.observation_id, workout_exercise_id: mutation.exercise_id,
          prescription_revision_status: 'active', set_number: mutation.set_number,
          actual_reps: null, actual_duration_seconds: null, actual_distance: null,
          actual_distance_unit: null, weight: null, weight_unit: 'kg', rpe: null,
          is_warmup_set: false, created_at: new Date().toISOString(), effort: null,
          ...(previous?.row ?? {}), ...mutation.values,
          mutation_revision: mutation.revision, last_mutation_id: mutation.mutation_id,
        })
        const ack: SetObservationAck = { outcome: 'applied', mutation,
          head: { revision: mutation.revision, mutation_id: mutation.mutation_id, cleared: false, row } }
        mutations.push(mutation)
        heads.set(mutation.observation_id, ack.head)
        rows.set(row.id, row)
        return reply(ack)
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-021 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-021-session', refreshToken: 'synthetic-task-021-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-021@example.invalid' },
    }))
  }, { owner: OWNER })

  return {
    mutations, blockAttempts, blockResults,
    refuseNextBlockSave() { refuseNextBlockSave = true },
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
const restTimers = (page: Page) => page.getByRole('timer', { name: 'Time remaining', exact: true })

/** The circuit's one card. */
function circuitCard(scope: Page | Locator): Locator {
  const page = 'page' in scope ? scope.page() : scope
  return scope.locator('.clr-card').filter({ has: page.getByRole('list', { name: 'Movements in this circuit', exact: true }) })
}

const roundClock = (card: Locator) => card.getByRole('group', { name: 'Round clock', exact: true })
const roundRecord = (card: Locator) => roundClock(card).getByRole('status')
const roundTimes = (page: Page) => page.getByRole('list', { name: 'Round times', exact: true })

/** The circuit's stored record — the one controller's own state. */
const storedCircuit = (page: Page) =>
  page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key) ?? '{}')[id] ?? null, { key: CIRCUIT_KEY, id: CIRCUIT_BLOCK_ID })

/**
 * Every stored workout-format record (`clear.workout-*`, less the shell's own
 * open-section record), so a write by any other format's state machine — a
 * ladder, a race, an EMOM or an AMRAP — would show.
 */
const formatKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key.startsWith('clear.workout-') && key !== 'clear.workout-shell').sort())

/**
 * The moment the current round's clock started, from the circuit's record.
 * Polled from the test side: the page's own timers are Playwright's clock.
 */
async function roundStartedAt(page: Page): Promise<number> {
  let started: number | null = null
  await expect.poll(async () => {
    const record = await storedCircuit(page) as { roundStartedAt?: string | null } | null
    started = record?.roundStartedAt == null ? null : Date.parse(record.roundStartedAt)
    return started
  }).not.toBeNull()
  return started!
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    void document.body.offsetHeight
    await document.fonts.ready
  })
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

async function attachScreen(page: Page, name: string) {
  await test.info().attach(`${name}.png`, {
    body: await page.screenshot({ animations: 'disabled', caret: 'hide' }), contentType: 'image/png',
  })
}

interface RecordedGeometry {
  titleTop: number
  titleLines: number
  closeTop: number
  closeText: string
  body: { left: number; right: number }
  timer: { left: number; right: number } | null
  digitsCentre: number | null
  timerCentre: number | null
  takeBack: { left: number; right: number }
}

/** The log's header, timer and action, measured in the browser. */
async function readRecordedLog(dialog: Locator): Promise<RecordedGeometry> {
  return dialog.evaluate((node) => {
    const rect = (element: Element) => element.getBoundingClientRect()
    const title = node.querySelector('[data-logging-head] h1, [data-logging-head] h2, [data-logging-head] h3')!
    const close = node.querySelector('[data-logging-head] button[aria-label="Close log"]')!
    const body = node.querySelector('.clr-accepted-log__body')!
    const style = getComputedStyle(body)
    const bodyBox = rect(body)
    const frame = node.querySelector('[data-timer-frame="body"]')
    const timerBody = frame?.querySelector('[role="timer"]') ?? null
    const digits = timerBody?.querySelector(':scope > span[aria-hidden="true"]:not(.clr-accepted-timer__caption)') ?? null
    const takeBack = [...node.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Take back this round')!
    const lineHeight = parseFloat(getComputedStyle(title).lineHeight) || parseFloat(getComputedStyle(title).fontSize) * 1.2
    return {
      titleTop: rect(title).top,
      titleLines: Math.max(1, Math.round(rect(title).height / lineHeight)),
      closeTop: rect(close).top,
      closeText: close.textContent?.trim() ?? '',
      body: {
        left: bodyBox.left + parseFloat(style.paddingLeft),
        right: bodyBox.right - parseFloat(style.paddingRight),
      },
      timer: frame === null ? null : { left: rect(frame).left, right: rect(frame).right },
      digitsCentre: digits === null ? null : (rect(digits).left + rect(digits).right) / 2,
      timerCentre: timerBody === null ? null : (rect(timerBody).left + rect(timerBody).right) / 2,
      takeBack: { left: rect(takeBack).left, right: rect(takeBack).right },
    }
  })
}

const TOLERANCE = 1.5

/**
 * `Round N recorded`, as AC-R021-02 asks: the native modal named by its one
 * title over an inert workout, the framed icon-only X at the title's visible
 * top (one line or wrapped), the recorded round time, the circuit's rest — if
 * one runs — as the whole timer body across the log's full content width with
 * its digits centred, and Take back this round.
 */
async function expectRecordedLog(page: Page, round: number, options: { roundTime: string; resting: boolean }) {
  const title = `Round ${round} recorded`
  const dialog = page.getByRole('dialog', { name: title, exact: true })
  await expect(dialog).toBeVisible()
  await expect(openLog(page)).toHaveCount(1)
  expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true)
  const head = dialog.locator('[data-logging-head]')
  await expect(head.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(dialog.getByRole('heading')).toHaveCount(1)
  await expect(head.getByRole('button', { name: 'Close log', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /close/i })).toHaveCount(1)
  await expect(dialog.getByText(/^close$/i)).toHaveCount(0)
  // The Balanced backdrop on the native backdrop only.
  expect(await dialog.evaluate((node) => getComputedStyle(node, '::backdrop').backdropFilter)).toMatch(/blur\(/)
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

  const status = dialog.getByRole('status')
  await expect(status).toContainText(`${options.roundTime}`)
  await expect(status).toContainText('round time recorded')
  await expect(dialog.getByRole('button', { name: 'Take back this round', exact: true })).toBeVisible()
  // Nothing guessed: no movement actuals, no rest controls of its own.
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /add|skip/i })).toHaveCount(0)
  // No half-sheet, and the rest drawn once — in the log while it is open.
  await expect(page.locator('section.clr-set-sheet')).toHaveCount(0)
  if (options.resting) {
    await expect(dialog.getByText(`Rest after round ${round}`, { exact: true })).toBeVisible()
    await expect(restTimers(page)).toHaveCount(1)
    await expect(dialog.getByRole('timer', { name: 'Time remaining', exact: true })).toBeVisible()
  } else {
    await expect(dialog.getByRole('timer')).toHaveCount(0)
  }

  await settle(page)
  const geometry = await readRecordedLog(dialog)
  expect(geometry.closeText, 'the X has no visible word').toBe('')
  expect(Math.abs(geometry.closeTop - geometry.titleTop), `X frame top at the title's visible top (${geometry.titleLines} line(s))`).toBeLessThanOrEqual(2)
  if (options.resting) {
    expect(geometry.timer).not.toBeNull()
    expect(Math.abs(geometry.timer!.left - geometry.body.left), 'timer starts at the content edge').toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(geometry.timer!.right - geometry.body.right), 'timer ends at the content edge').toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(geometry.digitsCentre! - geometry.timerCentre!), 'digits centred').toBeLessThanOrEqual(2)
  } else {
    expect(geometry.timer).toBeNull()
  }
  expect(Math.abs(geometry.takeBack.left - geometry.body.left)).toBeLessThanOrEqual(TOLERANCE)
  expect(Math.abs(geometry.takeBack.right - geometry.body.right)).toBeLessThanOrEqual(TOLERANCE)
  return { dialog, geometry }
}

/** Seconds of the one rest left, read from wherever it is drawn. */
async function restLeft(page: Page): Promise<number> {
  await expect(restTimers(page)).toHaveCount(1)
  const text = await restTimers(page).textContent()
  const digits = /(\d\d):(\d\d)/.exec(text ?? '')
  if (digits === null) throw new Error(`no rest digits in ${text}`)
  return Number(digits[1]) * 60 + Number(digits[2])
}

/**
 * axe paces itself on the page's timers, which a paused Playwright clock holds
 * still. So the scan runs on a flowing clock, and the clock is paused again
 * exactly `SCAN_SECONDS` after the moment it was resumed — every reading after
 * a scan is that much later, never an unknown amount.
 */
const SCAN_SECONDS = 5

async function scanPaused(page: Page, checkA11y: () => Promise<void>) {
  const at = await page.evaluate(() => Date.now())
  await page.clock.resume()
  await checkA11y()
  await page.clock.pauseAt(at + SCAN_SECONDS * 1000)
}

/** One History reading — its label and its value — by the label's exact words. */
function historyReading(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('xpath=..')
}

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-021 circuit round, Undo and measurement behaviour', () => {
  test('JOURNEY-021 touch phone-390: Finish round opens Round N recorded with its X at the title top and the circuit rest at full width; Take back this round, Close log and the rest ending keep round times, active time and history; an optional actual and the recorded rounds survive a refused save and read back in History', async ({ page, visit, checkA11y }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page)
    await page.clock.install()
    await visit('/workout')
    const card = circuitCard(content(page))
    await expect(card).toBeVisible()
    await expect(roundRecord(card)).toHaveText('No rounds recorded')

    // ── Entry: round 1's clock, 32 seconds in ──
    await roundClock(card).getByRole('button', { name: 'Start round 1', exact: true }).tap()
    const round1 = await roundStartedAt(page)
    await page.clock.pauseAt(round1 + 32_000)
    await expect(page.getByRole('timer', { name: 'Round 1 time', exact: true })).toContainText('00:32')
    await expect(roundRecord(card)).toHaveText('No rounds recorded')

    // ── Finish round 1: the recorded round in the shared focused log ──
    await roundClock(card).getByRole('button', { name: 'Finish round 1', exact: true }).tap()
    let { dialog } = await expectRecordedLog(page, 1, { roundTime: '00:32', resting: true })
    await expect(dialog.getByRole('button', { name: 'Close log', exact: true })).toBeFocused()
    expect(await restLeft(page)).toBe(ROUND_REST)
    await expect(roundRecord(card)).toHaveText('1 of 3 rounds recorded')
    expect(await storedCircuit(page)).toMatchObject({ round: 2, history: [{ round: 1 }] })
    await noHorizontalOverflow(page)
    await attachScreen(page, 'round-1-recorded-phone-390')
    await scanPaused(page, checkA11y)

    // The rest runs on in the log.
    expect(await restLeft(page)).toBe(ROUND_REST - SCAN_SECONDS)
    await page.clock.runFor(5_000)
    expect(await restLeft(page)).toBe(ROUND_REST - SCAN_SECONDS - 5)

    // ── Take back this round: no count, no rest, round 1's own clock resumed ──
    await dialog.getByRole('button', { name: 'Take back this round', exact: true }).tap()
    await expect(openLog(page)).toHaveCount(0)
    await expect(roundRecord(card)).toHaveText('No rounds recorded')
    await expect(restTimers(page)).toHaveCount(0)
    await expect(page.getByRole('timer', { name: 'Round 1 time', exact: true })).toContainText('00:42')
    await expect(roundTimes(page)).toHaveCount(0)
    const finish1 = roundClock(card).getByRole('button', { name: 'Finish round 1', exact: true })
    await expect(finish1).toBeFocused()
    expect(await storedCircuit(page)).toMatchObject({ round: 1, restStartedAt: null, history: [] })

    // ── Recorded again, then closed with the X: the rest goes on, on the card ──
    await page.clock.runFor(3_000)
    await finish1.tap()
    ;({ dialog } = await expectRecordedLog(page, 1, { roundTime: '00:45', resting: true }))
    await dialog.getByRole('button', { name: 'Close log', exact: true }).tap()
    await expect(openLog(page)).toHaveCount(0)
    const startRound2 = roundClock(card).getByRole('button', { name: 'Start round 2', exact: true })
    await expect(startRound2).toBeFocused()
    expect(await restLeft(page)).toBe(ROUND_REST)
    // Beside the card, never inside it.
    await expect(card.getByRole('timer', { name: 'Time remaining', exact: true })).toHaveCount(0)
    await expect(roundRecord(card)).toHaveText('1 of 3 rounds recorded')
    await expect(roundTimes(page).getByRole('listitem')).toHaveCount(1)
    await expect(roundTimes(page).getByRole('listitem').first()).toContainText('00:45')
    await attachScreen(page, 'round-1-closed-rest-on-card-phone-390')

    // The rest ends by itself: nothing more is recorded; round 2's clock runs.
    await page.clock.runFor((ROUND_REST + 1) * 1000)
    await expect(restTimers(page)).toHaveCount(0)
    await expect(roundRecord(card)).toHaveText('1 of 3 rounds recorded')
    await expect(page.getByRole('timer', { name: 'Round 2 time', exact: true })).toContainText('00:01')
    await expect(openLog(page)).toHaveCount(0)

    // ── Round 2 recorded into a rest that ends with the log open ──
    await page.clock.runFor(19_000)
    await roundClock(card).getByRole('button', { name: 'Finish round 2', exact: true }).tap()
    await expectRecordedLog(page, 2, { roundTime: '00:20', resting: true })
    await page.clock.runFor((ROUND_REST + 1) * 1000)
    await expect(openLog(page)).toHaveCount(0)
    await expect(roundClock(card).getByRole('button', { name: 'Finish round 3', exact: true })).toBeFocused()
    await expect(roundRecord(card)).toHaveText('2 of 3 rounds recorded')
    await expect(roundTimes(page).getByRole('listitem')).toHaveText([/Round 1\s*00:45/, /Round 2\s*00:20/])
    // One controller: only the circuit's own record was ever written.
    expect(await formatKeys(page)).toEqual([CIRCUIT_KEY])

    // ── An optional movement actual, through the circuit's own entry ──
    await page.clock.resume()
    await card.getByRole('button', { name: 'Rest for goblet squat', exact: true }).tap()
    // TASK-044: the circuit's movement entry is the focused logging dialog (was the half-sheet).
    const sheet = page.locator('dialog.clr-accepted-log[open]')
    const form = sheet.getByRole('form', { name: 'Log set 1 of goblet squat', exact: true })
    await form.getByLabel('Weight').fill('16')
    await form.getByLabel('Reps').fill('8')
    await form.getByRole('button', { name: 'Log set 1', exact: true }).tap()
    await expect.poll(() => app.mutations.length).toBe(1)
    expect(app.mutations[0]).toMatchObject({
      operation: 'insert', exercise_id: EXERCISE_ID.get('goblet-squat'), set_number: 1,
      values: { weight: 16, actual_reps: 8 },
    })
    await sheet.getByRole('button', { name: 'Close log', exact: true }).tap()
    await card.getByRole('button', { name: 'Hide load entry for goblet squat', exact: true }).tap()
    await expect(card.getByText('1 set logged', { exact: true })).toBeVisible()
    // Logging an actual records no round.
    await expect(roundRecord(card)).toHaveText('2 of 3 rounds recorded')

    // ── Save recovery: a refused save keeps everything; the retry saves the count ──
    app.refuseNextBlockSave()
    await page.getByRole('button', { name: 'Next section', exact: true }).tap()
    const refused = page.getByRole('dialog').filter({ hasText: 'That didn’t save' })
    await expect(refused).toBeVisible()
    await expect(roundRecord(card)).toHaveText('2 of 3 rounds recorded')
    await expect(roundTimes(page).getByRole('listitem')).toHaveCount(2)
    await refused.getByRole('button', { name: 'Try again', exact: true }).tap()
    await expect(page.getByRole('heading', { name: 'Accessory', exact: true }).first()).toBeVisible()
    const circuitRows = app.blockAttempts.filter((row) => row.block_id === CIRCUIT_BLOCK_ID)
    expect(circuitRows).toHaveLength(2)
    for (const row of circuitRows) {
      expect(row).toMatchObject({
        rounds_completed: 2, completed_under_cap: null, partial_round_reps: null, minutes_completed: null, highest_rung: null,
      })
    }

    // ── History reads the saved count and the actual back ──
    await visit(`/history/${WORKOUT.session.id}`)
    await expect(historyReading(page, 'Rounds')).toHaveText('Rounds2 of 3')
    await expect(page.getByText(/16 kg/).first()).toBeVisible()
    await expect(page.getByText(/8 reps/).first()).toBeVisible()
    await attachScreen(page, 'history-circuit-phone-390')
    app.assertContained()
  })

  test('JOURNEY-021 keyboard phone-320 reduced motion Signal: Enter records the round into the log with focus on its X, Tab reaches Take back this round, Escape returns to the round clock, the final seconds stay still in the log, and a reload mid-rest comes back to the card and its rest, never to the log', async ({ page, visit, checkA11y }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 320, height: 568 })
    const app = await syntheticApp(page, { reducedMotion: true, skin: 'signal' })
    await page.clock.install()
    await visit('/workout')
    const card = circuitCard(content(page))
    await expect(card).toBeVisible()

    const start1 = roundClock(card).getByRole('button', { name: 'Start round 1', exact: true })
    await start1.focus()
    await page.keyboard.press('Enter')
    const round1 = await roundStartedAt(page)
    await page.clock.pauseAt(round1 + 15_000)
    const finish1 = roundClock(card).getByRole('button', { name: 'Finish round 1', exact: true })
    await finish1.focus()
    await page.keyboard.press('Enter')

    const { dialog, geometry } = await expectRecordedLog(page, 1, { roundTime: '00:15', resting: true })
    test.info().annotations.push({ type: 'title lines at 320', description: String(geometry.titleLines) })
    const close = dialog.getByRole('button', { name: 'Close log', exact: true })
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Take back this round', exact: true })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()
    await noHorizontalOverflow(page)
    await attachScreen(page, 'round-1-recorded-keyboard-signal-phone-320')
    await scanPaused(page, checkA11y)

    // The final seconds, in the log: the shared warning, still under reduced
    // motion, its one edge above the log.
    await page.clock.runFor((ROUND_REST - SCAN_SECONDS - 3) * 1000)
    expect(await restLeft(page)).toBe(3)
    const logTimer = openLog(page).getByRole('timer', { name: 'Time remaining', exact: true })
    await expect(logTimer).toHaveAttribute('data-urgent', 'true')
    await expect(logTimer).toHaveAttribute('data-loop', 'still')
    await expect(page.locator('[data-countdown-edge]')).toHaveCount(1)
    expect(await page.locator('[data-countdown-edge]').evaluate((edge) => edge.parentElement?.matches('dialog.clr-accepted-log[open]'))).toBe(true)
    await attachScreen(page, 'round-1-final-seconds-reduced-motion-phone-320')

    // Escape is the X: nothing changes, focus returns to the round clock, and
    // the same rest — its last seconds — is back on the card.
    await page.keyboard.press('Escape')
    await expect(openLog(page)).toHaveCount(0)
    const start2 = roundClock(card).getByRole('button', { name: 'Start round 2', exact: true })
    await expect(start2).toBeFocused()
    await expect(roundRecord(card)).toHaveText('1 of 3 rounds recorded')
    expect(await restLeft(page)).toBe(3)
    await expect(page.locator('[data-countdown-edge]')).toHaveCount(1)
    expect(await page.locator('[data-countdown-edge]').evaluate((edge) => edge.parentElement === document.body)).toBe(true)

    // The card's Start round 2 is still the rest's early end.
    await page.keyboard.press('Enter')
    await expect(restTimers(page)).toHaveCount(0)
    await page.clock.runFor(10_000)
    await expect(page.getByRole('timer', { name: 'Round 2 time', exact: true })).toContainText('00:10')
    const finish2 = roundClock(card).getByRole('button', { name: 'Finish round 2', exact: true })
    await finish2.focus()
    await page.keyboard.press('Enter')
    await expectRecordedLog(page, 2, { roundTime: '00:10', resting: true })

    // Reloaded mid-rest: the card, its rest and its history — never the log.
    // (The boot runs on the page's timers, so the clock flows through the
    // reload and is paused again 15 seconds after it was resumed.)
    const before = await page.evaluate(() => Date.now())
    await page.clock.resume()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Workout', { timeout: 30_000 })
    await page.clock.pauseAt(before + 15_000)
    await expect(circuitCard(content(page))).toBeVisible()
    await expect(openLog(page)).toHaveCount(0)
    await expect(roundRecord(card)).toHaveText('2 of 3 rounds recorded')
    expect(await restLeft(page)).toBe(ROUND_REST - 15)
    await expect(roundTimes(page).getByRole('listitem')).toHaveText([/Round 1\s*00:15/, /Round 2\s*00:10/])
    await page.clock.runFor((ROUND_REST - 15 + 1) * 1000)
    await expect(restTimers(page)).toHaveCount(0)
    await expect(roundClock(card).getByRole('button', { name: 'Finish round 3', exact: true })).toBeVisible()
    await expect(openLog(page)).toHaveCount(0)
    expect(await formatKeys(page)).toEqual([CIRCUIT_KEY])
    expect(app.mutations).toHaveLength(0)
    expect(app.blockAttempts).toHaveLength(0)
    app.assertContained()
  })

  for (const skin of SKINS) {
    test(`accepted gallery state circuit-round ${skin} phone-390: the route's own CircuitBlock records round 1 into the shared log with its X, round time, full-width rest and Take back this round, with nothing read or written over the network`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width: 390, height: 844 })
      await installDeterministicCapture(page, { skin, reducedMotion: true })
      const requests: string[] = []
      page.on('request', (request) => {
        if (/\/(rest|auth|functions)\/v1\//.test(request.url())) requests.push(`${request.method()} ${request.url()}`)
      })
      await visit('/gallery/refinements?state=circuit-round')
      await expect(page.locator('html')).toHaveAttribute('data-skin', skin)
      const scope = page.locator('[data-gallery-circuit-round]')
      const card = circuitCard(scope)
      await expect(card).toBeVisible()
      await expect(roundRecord(card)).toHaveText('No rounds recorded')
      await expect(page.getByRole('timer', { name: 'Round 1 time', exact: true })).toBeVisible()

      await roundClock(card).getByRole('button', { name: 'Finish round 1', exact: true }).click()
      const { dialog } = await expectRecordedLog(page, 1, { roundTime: '00:', resting: true })
      const seconds = Number(/00:(\d\d)/.exec((await dialog.getByRole('status').textContent()) ?? '')?.[1])
      expect(seconds).toBeGreaterThanOrEqual(32)
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachScreen(page, `gallery-circuit-round-${skin}-phone-390`)

      await dialog.getByRole('button', { name: 'Take back this round', exact: true }).click()
      await expect(openLog(page)).toHaveCount(0)
      await expect(roundRecord(card)).toHaveText('No rounds recorded')
      await expect(roundClock(card).getByRole('button', { name: 'Finish round 1', exact: true })).toBeFocused()
      // The route's storage is untouched: the gallery's record is in memory.
      expect(await page.evaluate((key) => localStorage.getItem(key), CIRCUIT_KEY)).toBeNull()
      expect(requests, 'the gallery reads and writes nothing over the network').toEqual([])
    })
  }
})
