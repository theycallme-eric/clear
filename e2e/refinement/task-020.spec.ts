import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import type { Locator, Page, Route } from '@playwright/test'

import { readE2eEnv } from '../../scripts/e2e/env.mjs'
import { blockResultRowSchema, exerciseSetLogRowSchema, sessionSnapshotSchema, type BlockResultRow } from '../../src/state/schemas'
import { isSetObservationMutation, type SetObservationAck, type SetObservationMutation } from '../../src/state/set-observation-mutation'
import { fixtureLocation, onboardedProfile } from '../../src/test/user-data-double'
import { definitionFixture, snapshotFixture } from '../../src/test/workout-double'
import { installDeterministicCapture } from '../design-0143/fixtures'
import { expect, test as scanned } from '../fixtures'

/**
 * TASK-020 (REQ-020; C46, G12; R07, R17; AC-C46-01, AC-R020-01, AC-R020-02;
 * JOURNEY-020) — the deliberate Save confirmation and the existing rest's
 * lifecycle on the real `/workout` route.
 *
 * Entry (ENTRY-020): a set or superset round is open in the shared
 * set-logging sheet during the existing rest — the card's Rest opened it and
 * started the prescribed rest, behind the existing auth guard. Action: Save,
 * optionally collapse early, wait for the rest to end, then deliberately open
 * the next entry. Result: the sheet confirms the saved entry — `Set N logged`
 * or `Round N logged`, each movement's own actuals and effort read back, and
 * the same rest clock in the same place — without jumping to the next form;
 * the rest ending collapses it; an early Minimize is never undone; only the
 * card's Rest opens set N + 1. Add 30s and Skip rest stay the rest's own; a
 * rest ending or its final-seconds warning records nothing. Recovery: a
 * refused write is confirmed only as held on this device and retries under
 * its own id; keyboard, touch and reduced motion reach all of it.
 *
 * Synthetic and contained: an intercepted session for a fictional user. The
 * only writes are the set observations the athlete makes and the section's
 * own block result when Next section leaves it, answered here and never
 * forwarded; no model call, no real row.
 */
const OWNER = '00000000-0000-4000-8000-000000002001'
const PLACE = '00000000-0000-4000-8000-000000002011'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
}
/** The squat's prescribed rest, and the superset's one rest after the pair. */
const SQUAT_REST = 60
const ROUND_REST = 45

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
    if (code !== null) throw new Error(`Synthetic TASK-020 server exited (${code}) before ${origin} was ready`)
    try {
      if ((await fetch(origin)).ok && (await fetch(own)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((settle) => setTimeout(settle, 250))
  }
  throw new Error(`Synthetic TASK-020 origin ${origin} did not start`)
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
          VITE_SUPABASE_URL: 'https://synthetic-task-020.supabase.invalid',
          VITE_SUPABASE_ANON_KEY: 'synthetic-task-020-public-placeholder',
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

type Viewport = { width: number; height: number }
/** The approved mobile scope: the narrow phone and the project's own phone. */
const VIEWPORTS: ReadonlyArray<{ name: string; viewport: Viewport }> = [
  { name: 'phone-320', viewport: { width: 320, height: 568 } },
  { name: 'phone-390', viewport: { width: 390, height: 844 } },
]

const WORKOUT = sessionSnapshotSchema.parse(snapshotFixture({
  userId: OWNER,
  title: 'Synthetic TASK-020 save and rest workout',
  startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  session: { location_id: PLACE, goal_preset: 'strength' },
  sections: [
    { title: 'Strength', sectionType: 'primary_lift', blocks: [{ exercises: [
      { prescription: { exercise_id: 'back-squat', order_index: 0, sets: 4, target_value: 5, rest_seconds: SQUAT_REST } },
    ] }] },
    { title: 'Accessory', sectionType: 'accessory', blocks: [{
      structureType: 'superset', rounds: 3, roundRestSeconds: ROUND_REST,
      exercises: [
        { prescription: { exercise_id: 'bench-press', order_index: 0, modality: 'reps', target_value: 8, sets: 3 } },
        { prescription: { exercise_id: 'plank', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'time', target_value: 30, sets: 3 } },
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
}

/**
 * Reads answer the fixture; the one write the journey makes — a set
 * observation — is answered here and never forwarded. One may be refused.
 */
async function syntheticApp(page: Page, options: AppOptions = {}) {
  const unexpected: string[] = []
  const attempts: SetObservationMutation[] = []
  const mutations: SetObservationMutation[] = []
  const blockResults: BlockResultRow[] = []
  const heads = new Map<string, SetObservationAck['head']>()
  let failNext = false
  const guard = await installDeterministicCapture(page, { skin: 'clear', reducedMotion: options.reducedMotion ?? true })

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
      // Every other read is an empty answer: no history, anchors or favorites.
      return reply([])
    }
    if (request.method() === 'POST' && name === 'block_results') {
      // Next section records the section's own (empty) block outcome.
      const insert = (request.postDataJSON() as Record<string, unknown>[])[0]
      if (!BLOCK_IDS.has(String(insert.block_id))) unexpected.push(`block_results for ${String(insert.block_id)}`)
      const row = blockResultRowSchema.parse({ elapsed_seconds: null, completed_under_cap: null,
        rounds_completed: null, partial_round_reps: null, minutes_completed: null, highest_rung: null,
        perceived_effort: null, notes: null, ...insert,
        id: `00000000-0000-4000-8000-2000000000${String(blockResults.length + 1).padStart(2, '0')}`,
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
        return reply(ack)
      }
      if (['streak_sessions', 'constraints_in_force', 'anchor_evidence', 'conditioning_history'].includes(name)) {
        return reply([])
      }
    }
    unexpected.push(`${request.method()} ${url.pathname}`)
    return reply({ code: 'PGRST000', message: 'Unexpected synthetic TASK-020 request.' }, 503)
  }
  await page.route('**/rest/v1/**', handler)
  await page.route('**/auth/v1/**', handler)
  await page.route('**/functions/v1/**', handler)
  await page.addInitScript(({ owner }) => {
    localStorage.setItem('clear.auth.session', JSON.stringify({
      accessToken: 'synthetic-task-020-session', refreshToken: 'synthetic-task-020-refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { id: owner, email: 'synthetic-task-020@example.invalid' },
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
const sheet = (page: Page) => page.locator('section.clr-set-sheet')
const restBars = (page: Page) => page.getByRole('region', { name: 'Rest', exact: true })

/** The one movement card, by its heading, on the main screen. */
function card(page: Page, name: string): Locator {
  return content(page).locator('section').filter({
    has: page.getByRole('heading', { name, exact: true }),
  }).last()
}

function supersetCard(page: Page): Locator {
  return content(page).locator('.clr-card').filter({
    has: page.getByRole('list', { name: 'Movements in this superset' }),
  })
}

async function restRemaining(page: Page): Promise<number> {
  await expect(restBars(page)).toHaveCount(1)
  const text = await restBars(page).getByRole('timer', { name: 'Time remaining' }).textContent()
  const digits = /(\d\d):(\d\d)/.exec(text ?? '')
  if (digits === null) throw new Error(`no rest digits in ${text}`)
  return Number(digits[1]) * 60 + Number(digits[2])
}

type Reading = { seconds: number; at: number }

/**
 * The one rest, read again: `advanced` seconds on from `previous` — a
 * restarted or second rest would read higher. Real time also passes under
 * `page.clock`, so allow the wall-clock time between the readings.
 */
async function expectRestFrom(page: Page, previous: Reading | number, advanced = 0): Promise<Reading> {
  const from = typeof previous === 'number' ? { seconds: previous, at: Date.now() } : previous
  const current = await restRemaining(page)
  const real = Math.ceil((Date.now() - from.at) / 1000) + 1
  expect(current).toBeLessThanOrEqual(from.seconds - advanced)
  expect(current).toBeGreaterThanOrEqual(from.seconds - advanced - real)
  return { seconds: current, at: Date.now() }
}

/** The sheet, then the whole phone screen, attached to the case. */
async function attachSheet(page: Page, name: string) {
  await expect(sheet(page)).toBeVisible()
  await test.info().attach(`${name}-sheet.png`, {
    body: await sheet(page).screenshot({ animations: 'disabled', caret: 'hide' }), contentType: 'image/png',
  })
  await attachScreen(page, name)
}

async function attachScreen(page: Page, name: string) {
  await test.info().attach(`${name}.png`, {
    body: await page.screenshot({ animations: 'disabled', caret: 'hide' }), contentType: 'image/png',
  })
}

/** The saved-entry confirmation: title, read-back and no form, beside the one rest. */
async function expectConfirmation(page: Page, title: string) {
  await expect(sheet(page)).toHaveCount(1)
  await expect(sheet(page).getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(sheet(page).getByRole('form')).toHaveCount(0)
  const status = sheet(page).locator('.clr-set-sheet__frame > [role="status"]')
  await expect(status).toBeVisible()
  return status
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

// ─────────────────────────────────────────────────────────────────────────────
// The proof
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TASK-020 deliberate Save confirmation and existing rest lifecycle', () => {
  for (const { name: size, viewport } of VIEWPORTS) {
    test(`JOURNEY-020 ${size}: Log set and Log round confirm the saved entry beside the same rest, collapse at its end without opening the next form, keep an early collapse, and open the next entry only from Rest`, async ({ page, visit, checkA11y }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      const app = await syntheticApp(page)
      await page.clock.install()
      await visit('/workout')
      await expect(page.getByRole('heading', { level: 1, name: 'Workout', exact: true })).toBeVisible()

      // ── Entry: Rest opens set 1 during the prescribed rest ───────────────
      const squat = card(page, 'back squat')
      const rest = squat.getByRole('button', { name: 'Rest', exact: true })
      await rest.click()
      const form1 = page.getByRole('form', { name: 'Log set 1 of back squat' })
      await expect(form1).toBeVisible()
      let remaining = await expectRestFrom(page, SQUAT_REST)
      await page.clock.fastForward(5000)
      remaining = await expectRestFrom(page, remaining, 5)
      await form1.getByLabel('Weight').fill('100')
      await form1.getByRole('combobox', { name: 'Unit' }).selectOption('kg')
      await form1.getByLabel('Reps').fill('5')
      await form1.getByRole('radio', { name: 'About right' }).check()

      // ── Save: confirmation and the same rest, no next form ───────────────
      await form1.getByRole('button', { name: 'Log set 1', exact: true }).click()
      const status = await expectConfirmation(page, 'Set 1 logged')
      await expect(status).toContainText('Set 1 · 5 reps · 100 kg')
      await expect(status.getByRole('img', { name: 'Effort: about right' })).toBeVisible()
      await expect(status).toContainText('Saved')
      await expect(page.getByRole('form', { name: 'Log set 2 of back squat' })).toHaveCount(0)
      await expect.poll(() => app.mutations.length).toBe(1)
      expect(app.mutations[0]).toMatchObject({
        operation: 'insert', exercise_id: EXERCISE_ID.get('back-squat'), set_number: 1,
        values: { weight: 100, weight_unit: 'kg', actual_reps: 5, effort: 'about_right' },
      })
      // The rest is the sheet's same timer card, before the confirmation.
      await expect(sheet(page).getByRole('region', { name: 'Rest', exact: true })).toBeVisible()
      expect(await sheet(page).evaluate((section) => {
        const restCard = section.querySelector('[aria-label="Rest"]')!
        const saved = section.querySelector('.clr-set-sheet__frame > [role="status"]')!
        return Boolean(restCard.compareDocumentPosition(saved) & Node.DOCUMENT_POSITION_FOLLOWING)
      })).toBe(true)
      remaining = await expectRestFrom(page, remaining)
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachSheet(page, `confirmation-set-1-${size}`)

      // ── The rest runs on beside it, then its end collapses and resets ────
      await page.clock.fastForward(10_000)
      remaining = await expectRestFrom(page, remaining, 10)
      await expectConfirmation(page, 'Set 1 logged')
      await page.clock.fastForward((remaining.seconds + 2) * 1000)
      await expect(sheet(page)).toHaveCount(0)
      await expect(restBars(page)).toHaveCount(0)
      await expect(rest).toBeFocused()
      await expect(rest).toHaveAttribute('aria-expanded', 'false')
      await page.clock.fastForward(60_000)
      await expect(sheet(page)).toHaveCount(0)
      expect(app.attempts).toHaveLength(1)
      await checkA11y()
      await attachScreen(page, `collapsed-at-rest-end-${size}`)

      // ── Deliberately: set 2 opens on a fresh prescribed rest ─────────────
      await rest.click()
      const form2 = page.getByRole('form', { name: 'Log set 2 of back squat' })
      await expect(form2).toBeVisible()
      await expect(form2.getByLabel('Weight')).toHaveValue('100')
      remaining = await expectRestFrom(page, SQUAT_REST)
      await page.clock.fastForward(3000)
      await form2.getByRole('button', { name: 'Log set 2', exact: true }).click()
      await expectConfirmation(page, 'Set 2 logged')
      await expect.poll(() => app.mutations.length).toBe(2)

      // ── Early collapse: the rest ending never reopens it ─────────────────
      await page.getByRole('button', { name: 'Minimize', exact: true }).click()
      await expect(sheet(page)).toHaveCount(0)
      await expect(rest).toBeFocused()
      // R17: collapsed, the same rest is the footer's shared timer card.
      remaining = await expectRestFrom(page, remaining, 3)
      await attachScreen(page, `early-collapse-${size}`)
      await page.clock.fastForward((remaining.seconds + 2) * 1000)
      await expect(restBars(page)).toHaveCount(0)
      await page.clock.fastForward(30_000)
      await expect(sheet(page)).toHaveCount(0)
      expect(app.attempts).toHaveLength(2)

      // ── The superset round: per-movement actuals, one rest ───────────────
      await page.getByRole('button', { name: 'Next section' }).click()
      // Leaving the section records its own block outcome — never a set.
      await expect.poll(() => app.blockResults.length).toBe(1)
      expect(app.attempts).toHaveLength(2)
      const pair = supersetCard(page)
      await expect(pair).toBeVisible()
      const pairRest = pair.getByRole('button', { name: 'Rest', exact: true })
      await pairRest.click()
      const round = page.getByRole('form', { name: 'Log round 1 of bench press and plank' })
      await expect(round).toBeVisible()
      let roundRest = await expectRestFrom(page, ROUND_REST)
      const bench = round.getByRole('group', { name: 'A1 bench press, set 1' })
      const plank = round.getByRole('group', { name: 'A2 plank, set 1' })
      await bench.getByLabel('Weight').fill('135')
      await bench.getByRole('combobox', { name: 'Unit' }).selectOption('lb')
      await bench.getByLabel('Reps').fill('7')
      await bench.getByRole('radio', { name: 'Too easy' }).check()
      await plank.getByLabel('Seconds').fill('28')
      await plank.getByRole('radio', { name: 'About right' }).check()
      await page.clock.fastForward(4000)
      await round.getByRole('button', { name: 'Log round 1', exact: true }).click()
      const roundStatus = await expectConfirmation(page, 'Round 1 logged')
      await expect(roundStatus).toContainText('A1 bench press · Set 1 · 7 reps · 135 lb')
      await expect(roundStatus).toContainText('A2 plank · Set 1 · 28 sec')
      await expect(roundStatus.getByRole('img', { name: 'Effort: too easy' })).toBeVisible()
      await expect(roundStatus.getByRole('img', { name: 'Effort: about right' })).toBeVisible()
      await expect(page.getByRole('form', { name: 'Log round 2 of bench press and plank' })).toHaveCount(0)
      await expect(sheet(page).getByRole('region', { name: 'Rest', exact: true })).toContainText('Rest after round 1')
      await expect.poll(() => app.mutations.length).toBe(4)
      expect(app.mutations.slice(2).map((mutation) => [mutation.exercise_id, mutation.set_number])).toEqual([
        [EXERCISE_ID.get('bench-press'), 1], [EXERCISE_ID.get('plank'), 1],
      ])
      expect(app.mutations[2].values).toMatchObject({ actual_reps: 7, weight: 135, weight_unit: 'lb', effort: 'too_easy' })
      expect(app.mutations[3].values).toMatchObject({ actual_duration_seconds: 28, effort: 'about_right' })
      roundRest = await expectRestFrom(page, roundRest, 4)
      await noHorizontalOverflow(page)
      await checkA11y()
      await attachSheet(page, `confirmation-round-1-${size}`)

      await page.clock.fastForward((roundRest.seconds + 2) * 1000)
      await expect(sheet(page)).toHaveCount(0)
      await expect(pairRest).toBeFocused()
      await page.clock.fastForward(30_000)
      await expect(sheet(page)).toHaveCount(0)
      expect(app.attempts).toHaveLength(4)
      await pairRest.click()
      await expect(page.getByRole('form', { name: 'Log round 2 of bench press and plank' })).toBeVisible()
      await page.getByRole('button', { name: 'Minimize', exact: true }).click()
      expect(app.attempts).toHaveLength(4)
      app.assertContained()
    })
  }

  test('AC-R020-02 keyboard, reduced motion and a refused save phone-390: Add 30s keeps the confirmation, its final-seconds warning and Skip rest record nothing, a refused write is confirmed only as held on this device, and a draft is never closed by expiry', async ({ page, visit, checkA11y }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const app = await syntheticApp(page, { reducedMotion: true })
    await page.clock.install()
    await visit('/workout')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    // Keyboard only: Rest, the entry, and Log set 1 by Enter.
    const squat = card(page, 'back squat')
    const rest = squat.getByRole('button', { name: 'Rest', exact: true })
    await rest.focus()
    await page.keyboard.press('Enter')
    const form1 = page.getByRole('form', { name: 'Log set 1 of back squat' })
    await expect(form1).toBeVisible()
    let remaining = await expectRestFrom(page, SQUAT_REST)
    await form1.getByLabel('Reps').fill('6')
    await form1.getByLabel('Reps').focus()
    app.failNextMutation()
    await page.keyboard.press('Enter')

    // A refused write: held on this device, never said to be saved.
    const status = await expectConfirmation(page, 'Set 1 logged')
    await expect(sheet(page).getByRole('heading', { name: 'Set 1 logged', exact: true })).toBeFocused()
    await expect(status).toContainText('Set 1 · 6 reps')
    await expect(status).toContainText('On this device only')
    await expect(status).not.toContainText('Saved')
    expect(app.mutations).toHaveLength(0)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(status).toContainText('Saved')
    expect(app.mutations).toHaveLength(1)
    expect(app.attempts[1]).toEqual(app.attempts[0])
    remaining = await expectRestFrom(page, remaining)

    // Add 30s is the rest's own, and the confirmation stays beside it.
    const sheetRest = sheet(page).getByRole('region', { name: 'Rest', exact: true })
    await sheetRest.getByRole('button', { name: 'Add 30s' }).focus()
    await page.keyboard.press('Enter')
    // The same period, 30 s longer: not restarted from the prescription.
    await expect.poll(() => restRemaining(page)).toBeGreaterThan(SQUAT_REST)
    remaining = await expectRestFrom(page, remaining.seconds + 30)
    await expectConfirmation(page, 'Set 1 logged')

    // Its final-seconds warning records nothing and ends nothing.
    await page.clock.fastForward((remaining.seconds - 6) * 1000)
    await expect(sheet(page).getByText('Final 10 seconds', { exact: true })).toBeVisible()
    await expectConfirmation(page, 'Set 1 logged')
    expect(app.attempts).toHaveLength(2)
    await checkA11y()
    await attachSheet(page, 'confirmation-final-seconds-reduced-motion-phone-390')

    // Skip rest ends the rest, and with it the confirmation; focus returns.
    await sheetRest.getByRole('button', { name: 'Skip rest' }).focus()
    await page.keyboard.press('Enter')
    await expect(sheet(page)).toHaveCount(0)
    await expect(restBars(page)).toHaveCount(0)
    await expect(rest).toBeFocused()
    expect(app.attempts).toHaveLength(2)

    // A deliberately opened draft is not closed or saved by its rest ending.
    await page.keyboard.press('Enter')
    const form2 = page.getByRole('form', { name: 'Log set 2 of back squat' })
    await expect(form2).toBeVisible()
    await form2.getByLabel('Reps').fill('4')
    await page.clock.fastForward((SQUAT_REST + 2) * 1000)
    await expect(restBars(page)).toHaveCount(0)
    await expect(form2).toBeVisible()
    await expect(form2.getByLabel('Reps')).toHaveValue('4')
    expect(app.attempts).toHaveLength(2)

    // Saved with no rest running, it is confirmed until the athlete collapses it.
    await form2.getByRole('button', { name: 'Log set 2', exact: true }).click()
    await expectConfirmation(page, 'Set 2 logged')
    await expect.poll(() => app.mutations.length).toBe(2)
    expect(app.mutations[1]).toMatchObject({ set_number: 2, values: { actual_reps: 4 } })
    await page.clock.fastForward(120_000)
    await expectConfirmation(page, 'Set 2 logged')
    await page.getByRole('button', { name: 'Minimize', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(sheet(page)).toHaveCount(0)
    await expect(rest).toBeFocused()
    expect(app.attempts).toHaveLength(3)
    app.assertContained()
  })
})
