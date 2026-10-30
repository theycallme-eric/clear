import type { Page, Route } from '@playwright/test'

import { CONTRACT_VERSION, LEGACY_CONTRACT_VERSION, generationRequestSchema, generationSuccessSchema } from '../../src/state/schemas'
import { expect, test } from '../fixtures'
import {
  CORS, createAthlete, dayAgo, expectUnscoredBlockResults, must, prescription, trustedBrowserEligible,
  type Athlete, type Catalogued, type Persisted,
} from './disposable-athlete'

/**
 * REQ-016 / TASK-030 — JOURNEY-028, the no-feedback journey, walked once end
 * to end in a browser: generate → review → start → every section → finish →
 * Summary → save → History → the saved workout reopened.
 *
 * The athlete is a disposable, namespaced user on the real backend with a
 * customized saved setup (goal, sections, experience, place and note all
 * chosen, none the defaults) and mixed history — one older session that logged
 * RPE under the legacy contract and one newer one that logged none. Auth,
 * persistence, set logging, completion and every read are the real app on the
 * real database.
 *
 * Only the provider is replaced: every `generate-workout` POST is answered in
 * the browser with a contract-valid workout built from the request it answers,
 * parsed by the app's own success schema before it is sent, so no live model
 * is called and no paid generation is spent. A preflight is answered with CORS
 * so the stub is reachable from the app's origin.
 *
 * Two passes, each asserted on screen *and* in the stored rows:
 *
 *  1. **Nothing entered.** No set, weight, reps, RPE, timed result or feeling.
 *     The first Summary save fails (scoped synthetic 503), the page is
 *     reloaded, and the retry saves once. The reopened workout says "No sets
 *     logged" and "Not recorded" — nothing fabricated, nothing defaulted.
 *  2. **Partial entries.** A load with an explicit unit and no reps (its first
 *     write refused once and retried idempotently), reps with the load
 *     cleared, and a set logged with neither. A reload mid-workout keeps them;
 *     the reopened workout shows exactly those values, null never read as 0.
 *
 * Throughout, the older session's RPE stays readable and unrewritten.
 */

const TITLES = ['TASK-030 no-feedback session', 'TASK-030 partial-entry session'] as const
const OLD_TITLE = 'TASK-030 legacy RPE session'
const NEW_TITLE = 'TASK-030 unrated session'

const SETUP = {
  goal: 'strength',
  sections: ['warmup', 'primary_lift', 'accessory', 'cooldown'],
  experience: 'confident',
  locationName: 'TASK-030 garage',
  note: 'TASK-030 synthetic setup note',
} as const

/** Type, the model's stored title, its function, and the label the screens show. */
const SECTIONS = [
  ['warmup', 'Prepare', 'prep', 'Warm-up'],
  ['primary_lift', 'Main lift', 'primary', 'Primary lift'],
  ['accessory', 'Accessory', 'accessory', 'Accessory'],
  ['cooldown', 'Cool down', 'recovery', 'Cooldown'],
] as const

const heading = (page: Page, name: string) =>
  expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(name, { timeout: 30_000 })

/** The contract workout the stub answers with; the primary lift carries a prescribed RIR. */
function stubWorkout(title: string, [one, two]: Catalogued[]) {
  return {
    title,
    overview: null,
    estimated_duration_mins: 30,
    sections: SECTIONS.map(([section_type, section_title, session_function]) => ({
      section_type, section_title, section_notes: null,
      blocks: [{
        structure_type: 'standard', rounds: null, timer_type: 'none', timer_seconds: null,
        round_rest_seconds: null, rep_scheme: 'fixed', block_notes: null,
        exercises: [section_type === 'primary_lift'
          ? prescription(one, { session_function, sets: 2, target_value: 5, rest_seconds: 0, load_type: 'rir', load_value: 2 })
          : prescription(two, { session_function, sets: 1, rest_seconds: 0 })],
      }],
    })),
  }
}

/** A stored history session, not a model response. */
function historySession(title: string, offset: number, contract: string, catalog: Catalogued[], locationId: string) {
  return {
    date: dayAgo(offset), location_id: locationId, session_focus: 'lower_body', goal_preset: 'strength',
    requested_duration_mins: 30, effective_duration_target_mins: 30, computed_duration_mins: null,
    requested_intensity: 6, effective_intensity: 6, adjustment_reason: null, generation_notes: null,
    prompt_version: 'e2e', contract_version: contract,
    workout: stubWorkout(title, catalog),
  }
}

/** Answer every generate POST locally; count them; never forward one. */
async function stubProvider(page: Page, athlete: Athlete) {
  const posts: Array<{ title: string; focus: string }> = []
  // Registered first so the exact stub below takes precedence. Any other
  // generation POST is blocked, never forwarded to a real model.
  await page.route('**/functions/v1/generate-*', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (route.request().method() !== 'POST') return route.fallback()
    await route.abort('blockedbyclient')
    throw new Error('Unexpected generation POST refused; the provider was not called.')
  })
  await page.route('**/functions/v1/generate-workout', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() !== 'POST') return route.fallback()
    const sent = generationRequestSchema.parse(request.postDataJSON())
    const title = TITLES[posts.length] ?? `${TITLES[1]} ${posts.length}`
    posts.push({ title, focus: sent.focus })
    const body = generationSuccessSchema.parse({
      requestId: sent.request_id,
      acceptance: {
        date: sent.date, location_id: sent.location_id, session_focus: sent.focus, goal_preset: sent.goal,
        requested_duration_mins: sent.requested_duration_mins,
        effective_duration_target_mins: sent.requested_duration_mins, computed_duration_mins: null,
        requested_intensity: sent.requested_intensity, effective_intensity: sent.requested_intensity,
        adjustment_reason: null, generation_notes: sent.notes, prompt_version: 'e2e-stub',
        contract_version: CONTRACT_VERSION, is_deload: false,
        workout: stubWorkout(title, athlete.catalog),
      },
    })
    return route.fulfill({ status: 200, headers: { ...CORS, 'x-request-id': sent.request_id }, json: body })
  })
  return posts
}

/** One scoped synthetic failure on a REST write; real answers otherwise. */
async function failOnce(page: Page, tail: string, method: 'POST' | 'PATCH') {
  let failed = 0
  const pattern = `**/rest/v1/${tail}*`
  const handler = async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.method() !== method || failed > 0 ||
      !new URL(request.url()).pathname.endsWith(`/rest/v1/${tail}`)) return route.fallback()
    failed += 1
    return route.fulfill({ status: 503, headers: CORS,
      json: { code: 'PGRST000', message: 'Controlled TASK-030 boundary unavailable.' } })
  }
  await page.route(pattern, handler)
  return { failed: () => failed, dispose: () => page.unroute(pattern, handler) }
}

type StoredLog = { set_number: number; actual_reps: number | null; weight: number | null; weight_unit: string; rpe: number | null; actual_duration_seconds: number | null; is_warmup_set: boolean }
type StoredSession = {
  id: string; title: string; mood: number | null; session_notes: string | null; completed_at: string | null; contract_version: string
  sections: { order_index: number; blocks: { id: string; exercises: { order_index: number; exercise_id: string; load_type: string; load_value: number | null; logs: StoredLog[] }[] }[] }[]
}

async function storedSession(athlete: Athlete, title: string): Promise<StoredSession> {
  const rows = must<StoredSession[]>(await athlete.client.selectAsService('workout_sessions', {
    select: 'id,title,mood,session_notes,completed_at,contract_version,' +
      'sections:workout_sections(order_index,blocks:workout_blocks(id,exercises:workout_exercises(' +
      'order_index,exercise_id,load_type,load_value,logs:exercise_set_logs(set_number,actual_reps,weight,' +
      'weight_unit,rpe,actual_duration_seconds,is_warmup_set))))',
    user_id: `eq.${athlete.userId}`, title: `eq.${title}`,
  }), 'Stored session read')
  expect(rows, `exactly one stored "${title}"`).toHaveLength(1)
  const [session] = rows
  session.sections.sort((a, b) => a.order_index - b.order_index)
  for (const section of session.sections) {
    for (const block of section.blocks) {
      for (const exercise of block.exercises) exercise.logs.sort((a, b) => a.set_number - b.set_number)
    }
  }
  return session
}

const logsOf = (session: StoredSession) =>
  session.sections.map((section) => section.blocks.flatMap((block) => block.exercises.flatMap((exercise) => exercise.logs)))

/** The open section, by the header card's own heading and position. */
async function expectSection(page: Page, index: number) {
  const [, , , label] = SECTIONS[index]
  await expect(page.getByRole('heading', { level: 2, name: label, exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(`Section ${index + 1} / ${SECTIONS.length}`, { exact: false }).first()).toBeVisible()
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Workout sections' })
const nextSection = (page: Page) => nav(page).getByRole('button', { name: 'Next section', exact: true })
const finishWorkout = (page: Page) => nav(page).getByRole('button', { name: 'Finish workout', exact: true })

/** Generate from the saved setup; the provider is the stub. */
async function generate(page: Page, visit: (path: string) => Promise<void>, title: string) {
  await visit('/generate')
  await heading(page, 'Generate')
  // A returning athlete's Focus is recommended from history; a first one is asked.
  const anchor = page.getByRole('group', { name: 'Anchor', exact: true })
  const focus = page.getByText(/^Focus:/)
  await expect(anchor.or(focus).first()).toBeVisible({ timeout: 30_000 })
  if (await anchor.isVisible()) await anchor.getByRole('button', { name: 'Lower body', exact: true }).click()
  await page.getByRole('button', { name: 'Generate workout', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/review', { timeout: 30_000 })
  await heading(page, title)
}

test.describe('REQ-016 no-feedback journey (TASK-030, JOURNEY-028)', () => {
  test.describe.configure({ mode: 'serial', retries: 0 })
  test.use({ serviceWorkers: 'block' })
  test.skip(!trustedBrowserEligible, 'Public preview has no privileged test key; not acceptance evidence.')

  let athlete: Athlete | undefined
  let oldSession: Persisted
  let oldExercise = ''

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName
    athlete = await createAthlete(testInfo, 't030', SETUP)
    // Mixed history: an older legacy-contract session that logged RPE, and a
    // newer one, after collection was removed, that logged reps and no RPE.
    oldSession = await athlete.persist(historySession(OLD_TITLE, 9, LEGACY_CONTRACT_VERSION, athlete.catalog, athlete.locationId))
    await athlete.start(oldSession)
    oldExercise = oldSession.sections[1].blocks[0].exercises[0].exercise.id
    await athlete.logSet(oldExercise, { set_number: 1, actual_reps: 5, weight: 60, weight_unit: 'kg', rpe: 8 })
    await athlete.complete(oldSession)
    const newSession = await athlete.persist(historySession(NEW_TITLE, 2, CONTRACT_VERSION, athlete.catalog, athlete.locationId))
    await athlete.start(newSession)
    await athlete.logSet(newSession.sections[1].blocks[0].exercises[0].exercise.id,
      { set_number: 1, actual_reps: 6, weight: null, weight_unit: 'kg', rpe: null })
    await athlete.complete(newSession)
  })

  test.afterAll(async () => {
    await athlete?.dispose()
  })

  test('the saved setup is customized and returning, not a fresh default', async () => {
    if (!athlete) throw new Error('TASK-030 fixture athlete was not created')
    const [profile] = must<Array<{ goal_preset: string; enabled_sections: string[]; experience_level: string }>>(
      await athlete.client.selectAsService('profiles', {
        select: 'goal_preset,enabled_sections,experience_level', id: `eq.${athlete.userId}`,
      }), 'Profile read')
    expect(profile).toEqual({ goal_preset: SETUP.goal, enabled_sections: [...SETUP.sections], experience_level: SETUP.experience })
    const history = must<Array<{ title: string; completed_at: string | null }>>(
      await athlete.client.selectAsService('workout_sessions', {
        select: 'title,completed_at', user_id: `eq.${athlete.userId}`, order: 'date.asc',
      }), 'History read')
    expect(history.map((row) => row.title)).toEqual([OLD_TITLE, NEW_TITLE])
    expect(history.every((row) => row.completed_at !== null)).toBe(true)
  })

  test('generate → review → start → every section → finish → summary → save → history detail, nothing and partial entered', async ({
    page, visit, checkA11y,
  }) => {
    test.setTimeout(300_000)
    if (!athlete) throw new Error('TASK-030 fixture athlete was not created')
    await athlete.signIn(page)
    const posts = await stubProvider(page, athlete)

    // ── Pass 1: nothing entered ───────────────────────────────────────────
    await generate(page, visit, TITLES[0])
    for (const [, , , label] of SECTIONS) {
      await expect(page.getByRole('button', { name: new RegExp(`^${label} `) })).toBeVisible()
    }
    await checkA11y()
    await page.getByRole('button', { name: 'Start workout', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/workout', { timeout: 30_000 })
    await heading(page, 'Workout')
    // No effort control anywhere in the journey (set/block exertion collection is removed).
    await expect(page.getByLabel(/RPE|effort|exertion/i)).toHaveCount(0)
    for (let index = 0; index < SECTIONS.length; index += 1) {
      await expectSection(page, index)
      if (index < SECTIONS.length - 1) await nextSection(page).click()
    }
    await finishWorkout(page).click()

    await expect(page).toHaveURL((url) => url.pathname === '/summary', { timeout: 30_000 })
    await heading(page, 'Nice work')
    await expect(page.getByText(`${TITLES[0]}, done.`)).toBeVisible()
    // Feeling is offered, not required: nothing is chosen.
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(0)
    await checkA11y()

    // A save that fails says so and stays; a reload keeps the debrief; one retry saves once.
    const debriefWrite = await failOnce(page, 'workout_sessions', 'PATCH')
    await page.getByRole('button', { name: 'Save and close', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 })
    await heading(page, 'Nice work')
    expect(debriefWrite.failed()).toBe(1)
    await page.reload()
    await heading(page, 'Nice work')
    await expect(page.getByText(`${TITLES[0]}, done.`)).toBeVisible()
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Save and close', exact: true }).click()
    await heading(page, 'Today')
    await debriefWrite.dispose()
    expect(debriefWrite.failed()).toBe(1)

    const first = await storedSession(athlete, TITLES[0])
    expect(first.completed_at).not.toBeNull()
    expect(first.contract_version).toBe(CONTRACT_VERSION)
    expect({ mood: first.mood, notes: first.session_notes }).toEqual({ mood: null, notes: null })
    expect(logsOf(first).flat(), 'no performed set was fabricated').toEqual([])
    // A prescribed load stays a prescription; it is never recorded as performed.
    expect(first.sections[1].blocks[0].exercises[0]).toMatchObject({ load_type: 'rir', load_value: 2 })
    await expectUnscoredBlockResults(athlete, first.sections.flatMap((section) => section.blocks.map((block) => block.id)))

    // Reopen from History: the row is the saved workout, its durable address
    // the detail, which says what was not recorded rather than inventing it.
    await visit('/history')
    const firstRow = page.getByRole('list', { name: 'Workout history' }).getByRole('link', { name: TITLES[0] })
    await expect(firstRow).toHaveAttribute('href', `/history/${first.id}`)
    await visit(`/history/${first.id}`)
    await heading(page, TITLES[0])
    const sections = page.getByRole('region', { name: 'Sections' })
    await expect(sections.getByText('No sets logged', { exact: true })).toHaveCount(SECTIONS.length)
    await expect(sections.getByRole('table')).toHaveCount(0)
    await expect(page.getByText('Not recorded', { exact: true }).first()).toBeVisible()
    await checkA11y()

    // ── Pass 2: partial entries ───────────────────────────────────────────
    await generate(page, visit, TITLES[1])
    await page.getByRole('button', { name: 'Start workout', exact: true }).click()
    await heading(page, 'Workout')
    await expectSection(page, 0)
    await nextSection(page).click()

    // Main lift, set 1: a load in an explicitly chosen unit and no reps. Its
    // first write is refused once; the queued set is retried under its own id.
    await expectSection(page, 1)
    const setOne = page.getByRole('form', { name: /^Log set 1 of / })
    await expect(setOne).toBeVisible()
    await setOne.getByLabel(/^Weight/).fill('42.5')
    await setOne.getByLabel('Reps', { exact: true }).fill('')
    await setOne.getByLabel('Unit').selectOption('lb')
    const setWrite = await failOnce(page, 'exercise_set_logs', 'POST')
    await setOne.getByRole('button', { name: 'Log set 1', exact: true }).click()
    await expect.poll(() => setWrite.failed(), { timeout: 30_000 }).toBe(1)
    await expect(page.getByText('Set 1 · 42.5 lb', { exact: true })).toBeVisible({ timeout: 30_000 })

    // Set 2: reps, with the carried-forward load cleared.
    const setTwo = page.getByRole('form', { name: /^Log set 2 of / })
    await expect(setTwo).toBeVisible({ timeout: 30_000 })
    await setTwo.getByLabel(/^Weight/).fill('')
    await setTwo.getByLabel('Reps', { exact: true }).fill('6')
    await setTwo.getByRole('button', { name: 'Log set 2', exact: true }).click()
    await expect(page.getByText('Set 2 · 6 reps', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Saved', { exact: true })).toHaveCount(2, { timeout: 60_000 })
    await setWrite.dispose()

    // A reload keeps what was entered, as the database holds it.
    await page.reload()
    await heading(page, 'Workout')
    await expect(page.getByText('Set 1 · 42.5 lb', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Set 2 · 6 reps', { exact: true })).toBeVisible()
    await expectSection(page, 1)
    await nextSection(page).click()

    // Accessory: a set logged with nothing measured is performed, not zero.
    await expectSection(page, 2)
    const bare = page.getByRole('form', { name: /^Log set 1 of / })
    await bare.getByLabel(/^Weight/).fill('')
    await bare.getByLabel('Reps', { exact: true }).fill('')
    await bare.getByRole('button', { name: 'Log set 1', exact: true }).click()
    await expect(page.getByText('Set 1', { exact: true })).toBeVisible({ timeout: 30_000 })
    await nextSection(page).click()
    await expectSection(page, 3)
    await finishWorkout(page).click()

    await heading(page, 'Nice work')
    await expect(page.getByText(`${TITLES[1]}, done.`)).toBeVisible()
    await page.getByRole('button', { name: 'Save and close', exact: true }).click()
    await heading(page, 'Today')

    const second = await storedSession(athlete, TITLES[1])
    expect(second.completed_at).not.toBeNull()
    expect(second.mood).toBeNull()
    const absent = { rpe: null, actual_duration_seconds: null, is_warmup_set: false }
    expect(logsOf(second)).toEqual([
      [],
      [
        { set_number: 1, actual_reps: null, weight: 42.5, weight_unit: 'lb', ...absent },
        { set_number: 2, actual_reps: 6, weight: null, weight_unit: expect.any(String), ...absent },
      ],
      [{ set_number: 1, actual_reps: null, weight: null, weight_unit: expect.any(String), ...absent }],
      [],
    ])
    await expectUnscoredBlockResults(athlete, second.sections.flatMap((section) => section.blocks.map((block) => block.id)))

    await visit(`/history/${second.id}`)
    await heading(page, TITLES[1])
    const lift = page.getByRole('table').first()
    await expect(lift.getByRole('row')).toHaveCount(3)
    const [one, two] = [lift.getByRole('row').nth(1), lift.getByRole('row').nth(2)]
    await expect(one.getByRole('cell').nth(0)).toHaveText('42.5 lb')
    await expect(one.getByRole('cell').nth(1)).toHaveText(/not logged/)
    await expect(one.getByRole('cell').nth(2)).toHaveText(/not logged/)
    await expect(two.getByRole('cell').nth(0)).toHaveText(/not logged/)
    await expect(two.getByRole('cell').nth(1)).toHaveText('6 reps')
    await expect(two.getByRole('cell').nth(2)).toHaveText(/not logged/)
    await expect(page.getByRole('region', { name: 'Sections' }).getByText('No sets logged', { exact: true })).toHaveCount(2)
    await checkA11y()

    // ── Mixed history: the older RPE stays readable and unrewritten ──────
    const old = await storedSession(athlete, OLD_TITLE)
    expect(old.contract_version).toBe(LEGACY_CONTRACT_VERSION)
    expect(logsOf(old)[1]).toEqual([{ set_number: 1, actual_reps: 5, weight: 60, weight_unit: 'kg', ...absent, rpe: 8 }])
    const unrated = await storedSession(athlete, NEW_TITLE)
    expect(logsOf(unrated)[1]).toEqual([{ set_number: 1, actual_reps: 6, weight: null, weight_unit: 'kg', ...absent }])
    await visit(`/history/${old.id}`)
    await heading(page, OLD_TITLE)
    await expect(page.getByRole('table').first().getByRole('cell', { name: 'RPE 8' })).toBeVisible()

    // Two generations, both answered by the stub; nothing reached a provider.
    expect(posts.map((post) => post.title)).toEqual([...TITLES])
  })
})
