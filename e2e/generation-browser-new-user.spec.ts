import type { Page, Request } from '@playwright/test'

import { namespaceId } from '../scripts/e2e/namespace.mjs'
import { SECTIONS, SECTIONS_BY_GOAL, labelOf } from '../src/state/onboarding'
import { seededCatalog } from '../src/test/seed-catalog'

import { REQUIRED_SCREENS } from './required-routes'
import { expect, test } from './support/authenticated-session'
import { backend } from './support/backend'

/**
 * REQ-023 / TASK-021 — the critical browser lane for a new user: Welcome,
 * sign-up with a project-issued code, Onboarding, Home, Generate, Loading and
 * Review, on the mobile viewport, with the composition answered
 * deterministically.
 *
 * It is `core-loop.spec.ts`'s walk as far as Review with the paid call taken
 * out, so a route or state regression is caught on every run rather than only
 * on a bounded acceptance run. Four properties are the point, and each is
 * asserted rather than assumed:
 *
 *  * **New.** The user has never been onboarded, so the door leads to
 *    Onboarding and the saved state Generate reads is the one this walk's own
 *    choices wrote. It is read back out of the database before generating, and
 *    the composition is built from it — not from what the test expects it to be.
 *  * **No provider call.** Every `generate-*` request is answered here and
 *    never continued, so nothing reaches the function that would call the
 *    model, and the lane runs without the live-model opt-in. The answer is
 *    composed from the committed seed catalog — for each saved section, the
 *    first exercise tagged for it that the saved equipment can perform — as in
 *    `generation-browser-returning-user.spec.ts`.
 *  * **Every screen by route and heading.** Each step waits for its own path
 *    and its own `<h1>`, in order, and scans it with axe — so a redirect that
 *    skips a screen fails rather than passing quietly.
 *  * **It fails when it should.** Two controls hand the same assertions a
 *    redirect that lands on the wrong screen and an answer without its
 *    envelope, and require them to reject. Authentication is not their
 *    subject, so they take the shared session from
 *    `support/authenticated-session.ts` instead of signing in again.
 *
 * The walk owns its user: a namespaced `example.com` address, deleted
 * afterwards whatever the outcome.
 */

type SectionId = (typeof SECTIONS)[number]['value']

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

/** The inventory's route for a screen, so the walk cannot drift from it. */
function routeOf(screen: string): string {
  const entry = REQUIRED_SCREENS.find((candidate) => candidate.screen === screen)
  if (entry?.path == null) throw new Error(`"${screen}" has no required route`)
  return entry.path
}

/**
 * The screen is the route *and* its heading. The messages are what the
 * controls match on, so a control cannot pass on some unrelated failure.
 */
async function expectScreen(page: Page, screen: string, heading: string, timeout = 30_000) {
  const path = routeOf(screen)
  await expect(page, `${screen} is served at ${path}`).toHaveURL((url) => url.pathname === path, {
    timeout,
  })
  await expect(page.locator('main h1'), `${screen}'s heading`).toHaveAccessibleName(heading, {
    timeout,
  })
}

interface SavedState {
  sections: SectionId[]
  equipment: string[]
}

interface CandidateSet {
  section: SectionId
  candidates: { exercise_id: string; usable_equipment: string[] }[]
}

/**
 * Each saved section's candidates in the committed seed: tagged for the
 * section, and performable with the saved equipment. Sorted, so the first is
 * the same exercise on every run.
 */
function seedCandidates(saved: SavedState): CandidateSet[] {
  const owned = new Set(saved.equipment)
  return saved.sections.map((section) => ({
    section,
    candidates: seededCatalog()
      .filter((exercise) => exercise.sections.includes(section))
      .map((exercise) => ({
        exercise_id: exercise.id,
        usable_equipment: exercise.equipmentOptions.filter((item) => owned.has(item)).sort(),
      }))
      .filter((candidate) => candidate.usable_equipment.length > 0)
      .sort((a, b) => a.exercise_id.localeCompare(b.exercise_id)),
  }))
}

interface GenerationRequestBody {
  goal: string
  date: string
  focus: string
  requested_intensity: number
  requested_duration_mins: number
  location_id: string
  deload?: boolean
}

const DETERMINISTIC_TITLE = 'New athlete session'

/**
 * The deterministic composition: one block per saved section, holding that
 * section's first candidate by id with its first usable equipment.
 */
function compose(request: GenerationRequestBody, sets: CandidateSet[]) {
  return {
    date: request.date,
    location_id: request.location_id,
    session_focus: request.focus,
    goal_preset: request.goal,
    requested_duration_mins: request.requested_duration_mins,
    effective_duration_target_mins: request.requested_duration_mins,
    computed_duration_mins: null,
    requested_intensity: request.requested_intensity,
    effective_intensity: request.requested_intensity,
    adjustment_reason: null,
    generation_notes: null,
    prompt_version: 'e2e-deterministic',
    contract_version: 'e2e-deterministic',
    is_deload: request.deload ?? false,
    workout: {
      title: DETERMINISTIC_TITLE,
      overview: null,
      estimated_duration_mins: request.requested_duration_mins,
      sections: sets.map((set) => {
        const [candidate] = set.candidates
        return {
          section_type: set.section,
          section_title: labelOf(SECTIONS, set.section),
          section_notes: null,
          blocks: [
            {
              structure_type: 'standard',
              rounds: null,
              timer_type: 'none',
              timer_seconds: null,
              round_rest_seconds: null,
              rep_scheme: 'fixed',
              block_notes: null,
              exercises: [
                {
                  exercise_id: candidate.exercise_id,
                  equipment: candidate.usable_equipment[0],
                  session_function: 'accessory',
                  anchor_relationship: 'neutral',
                  modality: 'reps',
                  sets: 2,
                  per_side: false,
                  distance_unit: null,
                  rest_seconds: 60,
                  tempo: null,
                  load_type: 'none',
                  load_value: null,
                  is_interval_exercise: false,
                  target_kind: 'fixed',
                  target_value: 8,
                  target_min: null,
                  target_max: null,
                  target_sequence: null,
                },
              ],
            },
          ],
        }
      }),
    },
  }
}

/**
 * Deterministic composition, in place of the provider. Every request to a
 * generation function is answered here; none is continued to the network. The
 * answer is held until `release()`, so Loading cannot be skipped.
 *
 * `enveloped: false` sends the same composition without the
 * `{ requestId, acceptance }` envelope the function wraps it in — the break the
 * second control needs.
 */
async function answerGeneration(page: Page, saved: () => SavedState, enveloped = true) {
  const requests: Request[] = []
  const lane = { requests, answered: 0, composed: null as ReturnType<typeof compose> | null }
  let release!: () => void
  const held = new Promise<void>((done) => {
    release = done
  })

  await page.route('**/functions/v1/generate-*', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    requests.push(request)

    const resolved = seedCandidates(saved())
    // Per section: a saved section with nothing to compose from is named
    // rather than composed around.
    expect(
      resolved.filter((set) => set.candidates.length === 0).map((set) => set.section),
      'saved sections with no candidate',
    ).toEqual([])
    const composed = compose(request.postDataJSON() as GenerationRequestBody, resolved)
    lane.composed = composed

    await held
    lane.answered += 1
    await route.fulfill({
      status: 200,
      headers: CORS,
      json: enveloped
        ? { requestId: request.headers()['x-request-id'], acceptance: composed }
        : composed,
    })
  })

  return { lane, release }
}

/** Generate's one unresolved choice for an athlete with no history, then go. */
async function pressGenerate(page: Page) {
  const anchor = page.getByRole('group', { name: 'Anchor', exact: true })
  await expect(anchor).toBeVisible({ timeout: 30_000 })
  await anchor.getByRole('button', { name: 'Full body', exact: true }).click()
  await page.getByRole('button', { name: 'Generate workout', exact: true }).click()
}

/** Loading is transient and rendered in place of Generate, at its route. */
async function expectLoading(page: Page) {
  await expect(page.locator('main h1'), 'the Loading screen').toHaveAccessibleName(
    'Generating session',
  )
  await expect(page).toHaveURL((url) => url.pathname === routeOf('Generate'))
}

test.describe('critical browser lane: a new user, sign-up to Review (REQ-023)', () => {
  test.skip(!backend.available, backend.reason)
  test.describe.configure({ mode: 'serial', retries: 0 })

  let email = ''
  let userId = ''
  let client: ReturnType<typeof backend.client>

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName
    email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-new-user-lane@example.com`
    client = backend.client()
    // A cancelled prior run may have left this exact address behind. Only it
    // is deleted; auth deletion cascades to everything the user owned.
    const prior = await client.findUserByEmail(email)
    if (prior) await client.deleteUser(prior.id)
    // Confirmed, and nothing else: no profile choices, no location.
    userId = (await client.ensureConfirmedUser(email)).id
  })

  test.afterAll(async () => {
    if (!client) return
    const provisioned = await client.findUserByEmail(email)
    if (provisioned) await client.deleteUser(provisioned.id)
    expect(await client.findUserByEmail(email), 'the namespaced user outlived the run').toBeFalsy()
  })

  test('signs up, completes onboarding, generates deterministically and reaches Review with every section', async ({
    page,
    visit,
    checkA11y,
  }) => {
    test.setTimeout(180_000)

    const visited: string[] = []
    const screen = async (name: string, heading: string) => {
      await expectScreen(page, name, heading)
      await checkA11y()
      visited.push(name)
    }

    // Registered before anything loads; the saved state is filled in once
    // onboarding has written it.
    let saved: SavedState | null = null
    const { lane, release } = await answerGeneration(page, () => {
      if (saved === null) throw new Error('generation was requested before onboarding was read')
      return saved
    })

    // ── Welcome ────────────────────────────────────────────────────────────
    await visit(routeOf('Welcome'))
    await screen('Welcome', 'CLEAR')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()

    // ── OTP Login (the create-account entry to the same door) ──────────────
    await screen('OTP Login', 'Create account')

    // Delivery only, as in `core-loop.spec.ts`: `/auth/v1/otp` would mail an
    // undeliverable address. The request still has to be made.
    let deliveryRequested = false
    await page.route('**/auth/v1/otp', async (route) => {
      deliveryRequested = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    const emailField = page.getByLabel('Email')
    await expect(emailField).toBeVisible({ timeout: 30_000 })
    await emailField.fill(email)
    await page.getByRole('button', { name: 'Send code', exact: true }).click()
    const code = page.getByLabel('Code')
    await expect(code).toBeFocused()
    expect(deliveryRequested, 'the Login screen never asked for a code').toBe(true)

    const { emailOtp } = await client.generateOneTimeCode(email)
    expect(emailOtp, 'the project issued no numeric code').toMatch(/^\d{6,10}$/)
    await code.fill(emailOtp)
    const verified = page.waitForResponse(
      (response) =>
        response.url().includes('/auth/v1/verify') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Verify', exact: true }).click()
    expect((await verified).status(), 'the public verify endpoint refused the code').toBe(200)

    // ── Onboarding (a new user is not sent Home) ───────────────────────────
    await screen('Onboarding', 'Set up CLEAR')
    const next = page.getByRole('button', { name: 'Next', exact: true })

    await page.getByRole('radio', { name: /^Full gym/ }).click()
    await next.click()
    await page.getByRole('radio', { name: /^Some experience/ }).click()
    await next.click()
    await page.getByRole('radio', { name: /^Strength/ }).click()
    await next.click()
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Here’s your setup' })).toBeVisible()
    await checkA11y()
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click()

    // ── Home ───────────────────────────────────────────────────────────────
    await screen('Home', 'Today')

    // What onboarding saved, read back rather than presumed.
    const profile = await client.selectAsService('profiles', {
      select: 'goal_preset,enabled_sections',
      id: `eq.${userId}`,
    })
    expect(profile.ok, 'reading the saved profile').toBe(true)
    const [{ goal_preset: goal, enabled_sections: sections }] = profile.body as {
      goal_preset: string
      enabled_sections: SectionId[]
    }[]
    expect(goal).toBe('strength')
    expect(sections, 'a new Strength athlete starts on the Goal’s preset').toEqual(
      SECTIONS_BY_GOAL.strength,
    )

    const locations = await client.selectAsService('locations', {
      select: 'location_equipment(equipment_id)',
      user_id: `eq.${userId}`,
    })
    expect(locations.ok, 'reading the saved location').toBe(true)
    const stored = locations.body as { location_equipment: { equipment_id: string }[] }[]
    expect(stored).toHaveLength(1)
    saved = { sections, equipment: stored[0].location_equipment.map((row) => row.equipment_id) }

    const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
    await expect(generate, 'Home’s Generate action is not available').toBeEnabled({
      timeout: 30_000,
    })
    await generate.click()

    // ── Generate ───────────────────────────────────────────────────────────
    await screen('Generate', 'Generate workout')
    // The saved Goal is shown as context rather than asked for again.
    await expect(page.getByText(/^Goal: Strength/)).toBeVisible({ timeout: 30_000 })
    await pressGenerate(page)

    // ── Loading ────────────────────────────────────────────────────────────
    await expectLoading(page)
    await checkA11y()
    visited.push('Loading')
    release()

    // ── Review ─────────────────────────────────────────────────────────────
    await screen('Review', DETERMINISTIC_TITLE)

    // Section by section, never "something rendered".
    expect(lane.composed?.workout.sections.map((section) => section.section_type)).toEqual(sections)
    expect(sections.length).toBeGreaterThan(0)
    for (const section of sections) {
      await expect(
        page.getByText(labelOf(SECTIONS, section), { exact: true }).first(),
        `Review shows the "${section}" section`,
      ).toBeVisible()
    }

    expect(visited, 'a screen on the path was skipped').toEqual([
      'Welcome',
      'OTP Login',
      'Onboarding',
      'Home',
      'Generate',
      'Loading',
      'Review',
    ])

    // One press, one request, answered here: nothing reached the provider.
    expect(lane.requests, 'generation was retried or repeated').toHaveLength(1)
    expect(lane.answered, 'a generation request was not answered deterministically').toBe(1)
    const response = await lane.requests[0].response()
    expect(response?.fromServiceWorker(), 'the workout came from a service worker').toBe(false)
  })

  // The controls. Neither can edit the app, so each produces the broken
  // behaviour from outside it and hands that to the journey's own assertion.

  test('control: a redirect that lands on another screen fails the journey’s step', async ({
    authenticatedPage: page,
    visit,
  }) => {
    // The shared session belongs to an onboarded athlete, so the door sends
    // them Home — for this journey, the redirect a broken guard would make.
    await visit(routeOf('Onboarding'))
    await expectScreen(page, 'Home', 'Today')

    await expect(expectScreen(page, 'Onboarding', 'Set up CLEAR', 5_000)).rejects.toThrow(
      /Onboarding is served at/,
    )
  })

  test('control: an answer without its envelope does not reach Review', async ({
    authenticatedPage: page,
    authenticatedSession,
    visit,
  }) => {
    test.setTimeout(120_000)

    // What `authenticated-session.ts` onboarded its athlete with.
    const locations = await client.selectAsService('locations', {
      select: 'location_equipment(equipment_id)',
      user_id: `eq.${authenticatedSession.userId}`,
    })
    expect(locations.ok, 'reading the shared athlete’s location').toBe(true)
    const stored = locations.body as { location_equipment: { equipment_id: string }[] }[]
    const profile = await client.selectAsService('profiles', {
      select: 'enabled_sections',
      id: `eq.${authenticatedSession.userId}`,
    })
    expect(profile.ok, 'reading the shared athlete’s profile').toBe(true)
    const saved: SavedState = {
      sections: (profile.body as { enabled_sections: SectionId[] }[])[0].enabled_sections,
      equipment: stored[0].location_equipment.map((row) => row.equipment_id),
    }

    const { lane, release } = await answerGeneration(page, () => saved, false)

    await visit(routeOf('Generate'))
    await expectScreen(page, 'Generate', 'Generate workout')
    await pressGenerate(page)
    await expectLoading(page)
    release()

    // The same composition the journey is given, minus the envelope: the
    // request was made and answered, and Review is still not reached.
    await expect(expectScreen(page, 'Review', DETERMINISTIC_TITLE, 10_000)).rejects.toThrow(
      /Review is served at/,
    )
    expect(lane.answered, 'the unwrapped answer was never sent').toBeGreaterThan(0)
    expect(lane.composed?.workout.title).toBe(DETERMINISTIC_TITLE)
    await expect(page).toHaveURL((url) => url.pathname === routeOf('Generate'))
  })
})
