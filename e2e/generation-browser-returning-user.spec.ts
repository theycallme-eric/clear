import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Request } from '@playwright/test'

import { namespaceId } from '../scripts/e2e/namespace.mjs'
import { GOALS, SECTIONS, SECTIONS_BY_GOAL, labelOf } from '../src/state/onboarding'
import { seededCatalog } from '../src/test/seed-catalog'

import { expect, test } from './fixtures'
import { REQUIRED_SCREENS } from './required-routes'
import { backend } from './support/backend'

/**
 * REQ-023 / REQ-025 / TASK-022 — the critical browser lane for a returning
 * user whose saved profile is the owner's: Welcome, sign-in with a
 * project-issued code, Home, Generate, Loading and Review, on the mobile
 * viewport, with the composition answered deterministically.
 *
 * Four properties are the point, and each is asserted rather than assumed:
 *
 *  * **The owner's configuration, not a fresh default.** The profile is the
 *    committed owner-mirror fixture (`npm run gr:matrix -- --deployed`): its
 *    Goal, enabled sections, tier and equipment are written by the product's
 *    own onboarding transaction and then read back out of the database. The
 *    fixture must enable a section its Goal's preset does not and a section the
 *    catalog repair filled, or this is the default user under another name.
 *  * **Returning.** The user is onboarded before the walk, so the door leads
 *    Home. A navigation to Onboarding at any point fails the lane.
 *  * **No provider call.** Every `generate-*` request is answered here and
 *    never continued, so nothing reaches the function that would call the
 *    model, and the lane runs without the live-model opt-in. The answer is
 *    composed from the committed seed catalog — for each saved section, the
 *    first exercise tagged for it that the saved equipment can perform — so a
 *    saved section the catalog cannot fill fails here rather than being
 *    papered over by a hand-built workout. The seed rather than the hosted
 *    candidate RPC, because this lane is about routes and state: candidate
 *    resolution on a database is the database lane's to assert, and the hosted
 *    catalog only matches the seed once the repair migration is released.
 *  * **Every screen by route and heading.** Each step waits for its own path
 *    and its own `<h1>`, in order, and scans it with axe.
 *
 * It owns its user: a namespaced `example.com` address, deleted afterwards
 * whatever the outcome.
 */

const OWNER_MIRROR_PATH = 'src/test/generation-reliability/owner-mirror.json'
const LEDGER_PATH = 'docs/process/generation-reliability/section-mapping-ledger.json'

interface OwnerMirror {
  goal: keyof typeof SECTIONS_BY_GOAL
  enabledSections: (typeof SECTIONS)[number]['value'][]
  tier: string
  equipment: string[]
  exclusions: unknown[]
}

interface Ledger {
  rows: { before: { sections: string[] }; after: { sections: string[] } }[]
}

const readJson = <T>(path: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T

const MIRROR = readJson<OwnerMirror>(OWNER_MIRROR_PATH)

/** Sections the catalog repair gave candidates to, read off its ledger. */
const REPAIRED_SECTIONS = new Set(
  readJson<Ledger>(LEDGER_PATH).rows.flatMap((row) =>
    row.after.sections.filter((section) => !row.before.sections.includes(section)),
  ),
)

/** What makes the fixture customized: sections beyond its Goal's preset. */
const CUSTOMIZED_SECTIONS = MIRROR.enabledSections.filter(
  (section) => !SECTIONS_BY_GOAL[MIRROR.goal].includes(section),
)

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

interface CandidateSet {
  section: OwnerMirror['enabledSections'][number]
  candidates: { exercise_id: string; usable_equipment: string[] }[]
}

/**
 * Each saved section's candidates in the committed seed: tagged for the
 * section, and performable with the saved equipment. Sorted, so the first is
 * the same exercise on every run.
 */
function seedCandidates(): CandidateSet[] {
  const owned = new Set(MIRROR.equipment)
  return MIRROR.enabledSections.map((section) => ({
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

const DETERMINISTIC_TITLE = 'Owner mirror session'

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

test.describe('critical browser lane: a returning user with the owner’s saved profile (REQ-023, REQ-025)', () => {
  test.skip(!backend.available, backend.reason)
  test.describe.configure({ mode: 'serial', retries: 0 })

  let email = ''
  let userId = ''
  let client: ReturnType<typeof backend.client>

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName
    email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-owner-mirror@example.com`
    client = backend.client()
    // A cancelled prior run may have left this exact address behind. Only it
    // is deleted; auth deletion cascades to everything the user owned.
    const prior = await client.findUserByEmail(email)
    if (prior) await client.deleteUser(prior.id)
    userId = (await client.ensureConfirmedUser(email)).id

    // The saved state is made by the product's own onboarding transaction,
    // from the fixture's values and nothing else.
    const { accessToken } = await client.mintSession(email)
    const onboarded = await client.rpcAs(
      'complete_onboarding',
      {
        p_location_name: 'Owner mirror gym',
        p_location_tier: MIRROR.tier,
        p_equipment: MIRROR.equipment,
        p_experience_level: 'some',
        p_goal_preset: MIRROR.goal,
        p_sections: MIRROR.enabledSections,
        p_avoid_patterns: [],
        p_note: null,
      },
      accessToken,
    )
    expect(onboarded.ok, `onboarding the owner mirror (status ${onboarded.status})`).toBe(true)
  })

  test.afterAll(async () => {
    if (!client) return
    const provisioned = await client.findUserByEmail(email)
    if (provisioned) await client.deleteUser(provisioned.id)
    expect(await client.findUserByEmail(email), 'the namespaced user outlived the run').toBeFalsy()
  })

  test('the saved profile is the owner-mirror fixture, not a fresh default', async () => {
    expect(CUSTOMIZED_SECTIONS, 'the fixture enables nothing beyond its Goal’s preset').not.toEqual(
      [],
    )
    expect(
      MIRROR.enabledSections.filter((section) => REPAIRED_SECTIONS.has(section)),
      'the fixture enables no repaired section',
    ).not.toEqual([])
    // The fixture records exclusion scopes without their targets, so a
    // non-empty list could not be reproduced here and must not pass unnoticed.
    expect(MIRROR.exclusions, 'the fixture gained exclusions this lane does not reproduce').toEqual(
      [],
    )

    const profile = await client.selectAsService('profiles', {
      select: 'goal_preset,enabled_sections,onboarded_at',
      id: `eq.${userId}`,
    })
    expect(profile.ok, 'reading the saved profile').toBe(true)
    expect(profile.body).toEqual([
      {
        goal_preset: MIRROR.goal,
        enabled_sections: MIRROR.enabledSections,
        onboarded_at: expect.any(String) as unknown,
      },
    ])

    const locations = await client.selectAsService('locations', {
      select: 'tier,location_equipment(equipment_id)',
      user_id: `eq.${userId}`,
    })
    expect(locations.ok, 'reading the saved location').toBe(true)
    const saved = locations.body as { tier: string; location_equipment: { equipment_id: string }[] }[]
    expect(saved).toHaveLength(1)
    expect(saved[0].tier).toBe(MIRROR.tier)
    expect(saved[0].location_equipment.map((row) => row.equipment_id).sort()).toEqual(
      [...MIRROR.equipment].sort(),
    )
  })

  test('signs in, generates deterministically and reaches Review with every saved section', async ({
    page,
    visit,
    checkA11y,
  }) => {
    test.setTimeout(180_000)

    const visited: string[] = []
    const paths: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) paths.push(new URL(frame.url()).pathname)
    })

    /** The screen is the route *and* its heading; then it is scanned. */
    async function expectScreen(screen: string, path: string, heading: string) {
      await expect(page, `${screen} is served at ${path}`).toHaveURL(
        (url) => url.pathname === path,
        { timeout: 30_000 },
      )
      await expect(page.locator('main h1'), `${screen}'s heading`).toHaveAccessibleName(heading, {
        timeout: 30_000,
      })
      await checkA11y()
      visited.push(screen)
    }

    // ── Deterministic composition, in place of the provider ────────────────
    // Registered before anything loads. Every request to a generation function
    // is answered here; none is continued to the network.
    const generationRequests: Request[] = []
    let answered = 0
    let composed: ReturnType<typeof compose> | null = null
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
      generationRequests.push(request)

      const body = request.postDataJSON() as GenerationRequestBody
      const resolved = seedCandidates()
      // Per section: a saved section with nothing to compose from is the
      // defect this lane exists for, and it is named rather than composed around.
      expect(
        resolved.filter((set) => set.candidates.length === 0).map((set) => set.section),
        'saved sections with no candidate',
      ).toEqual([])
      composed = compose(body, resolved)

      // Held until Loading has been asserted, so the screen cannot be skipped.
      await held
      answered += 1
      await route.fulfill({
        status: 200,
        headers: CORS,
        json: { requestId: request.headers()['x-request-id'], acceptance: composed },
      })
    })

    // ── Welcome ────────────────────────────────────────────────────────────
    await visit(routeOf('Welcome'))
    await expectScreen('Welcome', routeOf('Welcome'), 'CLEAR')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    // ── OTP Login ──────────────────────────────────────────────────────────
    await expectScreen('OTP Login', routeOf('OTP Login'), 'Sign in')

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

    // ── Home (a returning user is not sent to Onboarding) ──────────────────
    await expectScreen('Home', routeOf('Home'), 'Today')
    const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
    await expect(generate, 'Home’s Generate action is not available').toBeEnabled({
      timeout: 30_000,
    })
    await generate.click()

    // ── Generate ───────────────────────────────────────────────────────────
    await expectScreen('Generate', routeOf('Generate'), 'Generate workout')

    // The saved Goal is shown as context rather than asked for again; with no
    // history yet, the athlete supplies only the Focus (labelled Anchor).
    await expect(
      page.getByText(new RegExp(`^Goal: ${labelOf(GOALS, MIRROR.goal)}`)),
    ).toBeVisible({ timeout: 30_000 })
    const anchor = page.getByRole('group', { name: 'Anchor', exact: true })
    await expect(anchor).toBeVisible({ timeout: 30_000 })
    await anchor.getByRole('button', { name: 'Full body', exact: true }).click()
    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()

    // ── Loading (transient, in place of Generate) ──────────────────────────
    await expect(page.locator('main h1'), 'the Loading screen').toHaveAccessibleName(
      'Generating session',
    )
    await expect(page).toHaveURL((url) => url.pathname === routeOf('Generate'))
    await checkA11y()
    visited.push('Loading')
    release()

    // ── Review ─────────────────────────────────────────────────────────────
    await expectScreen('Review', routeOf('Review'), DETERMINISTIC_TITLE)

    // Section by section, never "something rendered": every saved section,
    // which includes the ones beyond the preset and the repaired ones.
    const workout = (composed as ReturnType<typeof compose> | null)?.workout
    expect(workout?.sections.map((section) => section.section_type)).toEqual(
      MIRROR.enabledSections,
    )
    for (const section of MIRROR.enabledSections) {
      await expect(
        page.getByText(labelOf(SECTIONS, section), { exact: true }).first(),
        `Review shows the saved "${section}" section`,
      ).toBeVisible()
    }

    expect(visited, 'a screen on the path was skipped').toEqual([
      'Welcome',
      'OTP Login',
      'Home',
      'Generate',
      'Loading',
      'Review',
    ])
    expect(paths, 'a returning user was routed to Onboarding').not.toContain(
      routeOf('Onboarding'),
    )

    // One press, one request, answered here: nothing reached the provider.
    expect(generationRequests, 'generation was retried or repeated').toHaveLength(1)
    expect(answered, 'a generation request was not answered deterministically').toBe(1)
    const response = await generationRequests[0].response()
    expect(response?.fromServiceWorker(), 'the workout came from a service worker').toBe(false)
  })
})
