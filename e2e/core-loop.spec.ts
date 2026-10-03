import type { Page, Request, Response } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { namespaceId } from '../scripts/e2e/namespace.mjs'
import { createGenerationDatabase } from '../supabase/functions/_shared/generate.ts'
import { GENERATION_SINGLE_ATTEMPT_ACCEPT, generationRequestSchema, generationSuccessSchema, type GenerationOutput } from '../src/state/schemas'
import { EQUIPMENT, GOALS, SECTIONS, TIERS } from '../src/state/onboarding'
import {
  assertReleaseGate,
  buildReleaseEvidence,
  writeReleaseEvidence,
} from '../scripts/generation-reliability/release-gate.mjs'

import { expect, test } from './fixtures'
import { REQUIRED_JOURNEYS, REQUIRED_SCREENS } from './required-routes'
import { backend } from './support/backend'
import { assertSingleAttemptDeployment, createGenerationBudget, MODEL_ROUTE } from './support/generation-budget'
import { liveModelEnabled, liveModelReason } from './support/live-model'

/**
 * REQ-010 / TASK-018 — the new-user core loop, walked in a browser on the
 * mobile viewport: Welcome, sign-up with a project-issued code, Onboarding,
 * Home, Generate, Loading, Review, Workout, Summary and back to Home.
 *
 * In the release lane (`release-e2e` in `.github/workflows/e2e.yml`) this runs
 * against the deployed production origin, after the workflow has verified the
 * deployment's SHA is `main`'s exact head. Locally it drives the dev server
 * against the same project.
 *
 * Six properties are the point, and each is asserted rather than assumed:
 *
 *  * **Last, not first (REQ-026).** Before a user is provisioned the release
 *    gate is asked whether the fast contract, composition and critical browser
 *    lanes have passed for the exact commit checked out (`npm run gr:lanes`
 *    records them). If one has not, the journey refuses with that lane's name
 *    and nothing is created or requested.
 *  * **Evidence either way (REQ-024).** Pass or fail, the request id, HTTP
 *    status, typed error code and failure class are written to
 *    `release-evidence/<commit>/release-journey.json` and attached to the
 *    report. The artifact is built from an allow-list: no address, token,
 *    message or response body reaches it.
 *  * **Its own user.** A namespaced `example.com` address is provisioned before
 *    the walk and deleted after it, whatever the outcome. Nothing depends on a
 *    pre-seeded account.
 *  * **A real code.** The code is issued by the project (`generate_link`) and
 *    typed into the Login screen, which verifies it through the public endpoint
 *    with the anon key. The one thing replaced is the *delivery* request —
 *    `/auth/v1/otp` would mail an undeliverable address and spend the
 *    project's send budget — and delivery is owned by the template drift check.
 *  * **A real generation.** Exactly one `generate-workout` call leaves the
 *    browser, it is answered by the deployed function over the network, and
 *    the workout Review renders — and Start persists — is the one that answer
 *    carried. A fixture, a fabricated workout or a silent retry fails here.
 *  * **Every screen by route and heading.** Each step waits for its own path
 *    and its own `<h1>`, in order, and scans it with axe — so a redirect that
 *    skips a screen fails rather than passing quietly.
 */

const JOURNEY = REQUIRED_JOURNEYS.find((journey) => journey.id === 'new-user')

// Only the committed, non-personal configuration is used. No real account,
// notes, history or live owner profile is copied into this disposable user.
const MIRROR = JSON.parse(readFileSync(resolve(process.cwd(),
  'src/test/generation-reliability/owner-mirror.json'), 'utf8')) as {
  goal: string; tier: string; equipment: string[]; enabledSections: string[]
}
function labelOf(options: readonly { value: string; label: string }[], value: string) {
  const option = options.find((candidate) => candidate.value === value)
  if (!option) throw new Error('The acceptance fixture contains an unknown configuration value.')
  return option.label
}

/** The inventory's route for a screen, so the walk cannot drift from it. */
function routeOf(screen: string): string {
  const entry = REQUIRED_SCREENS.find((candidate) => candidate.screen === screen)
  if (entry?.path == null) throw new Error(`"${screen}" has no required route`)
  return entry.path
}

async function expectPinnedAction(page: Page, name: string) {
  const action = page.getByRole('button', { name, exact: true })
  const foot = action.locator('xpath=ancestor::*[contains(@class,"clr-scroll-region__foot")]')
  await expect(foot, `${name} stays in the measured footer`).toBeVisible()
  const box = await foot.boundingBox()
  const viewport = page.viewportSize()
  expect(box, `${name}'s footer has no box`).not.toBeNull()
  expect(viewport, 'the project has no fixed viewport').not.toBeNull()
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1)
}

async function reachByKeyboard(page: Page, name: string) {
  const action = page.getByRole('button', { name, exact: true })
  for (let step = 0; step < 60; step += 1) {
    if (await action.evaluate((node) => node === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  expect(await action.evaluate((node) => node === document.activeElement), `${name} is keyboard reachable`).toBe(true)
}

test.describe('core loop: a new user, sign-up to Home (REQ-010)', () => {
  test.skip(!backend.available, backend.reason)
  test.skip(!liveModelEnabled, liveModelReason)
  test.describe.configure({ mode: 'serial', retries: 0 })
  test.use({ serviceWorkers: 'block' })

  let email = ''
  let client: ReturnType<typeof backend.client>
  let commit = ''
  let dispatchBudget: ReturnType<typeof createGenerationBudget> | undefined

  /** What the journey saw of its one generation; only this reaches the evidence. */
  const observed = {
    generationRequests: 0,
    requestId: null as string | null,
    status: null as number | null,
    code: null as string | null,
    accepted: false,
  }

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName
    // Refuses, naming the lane, before anything is provisioned or requested.
    commit = assertReleaseGate().commit
    await assertSingleAttemptDeployment(backend.generationEndpoint())
    email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-core-loop@example.com`
    client = backend.client()
    // A cancelled prior run may have left this exact address behind. Only it
    // is deleted; auth deletion cascades to everything the user owned.
    const prior = await client.findUserByEmail(email)
    if (prior) await client.deleteUser(prior.id)
    await client.ensureConfirmedUser(email)
  })

  test.afterAll(async () => {
    if (!client) return
    const provisioned = await client.findUserByEmail(email)
    if (provisioned) await client.deleteUser(provisioned.id)
    expect(await client.findUserByEmail(email), 'the namespaced user outlived the run').toBeFalsy()
  })

  test.afterEach(async ({ browserName }, testInfo) => {
    void browserName
    const evidence = buildReleaseEvidence({
      ...observed,
      commit,
      passed: testInfo.status === 'passed',
    })
    const path = writeReleaseEvidence(process.cwd(), evidence)
    await testInfo.attach('release-evidence', { path, contentType: 'application/json' })
    await testInfo.attach('generation-dispatch-budget', {
      body: Buffer.from(JSON.stringify(dispatchBudget?.snapshot() ?? { attempted: 0, forwarded: 0, blocked: 0 })),
      contentType: 'application/json',
    })
  })

  test('walks every screen on the path and lands Home with the session in recents', async ({
    page,
    visit,
    checkA11y,
  }, testInfo) => {
    // One paid model call plus a dozen screens; the bound is explicit.
    test.setTimeout(300_000)

    const endpoint = backend.generationEndpoint()
    const budget = createGenerationBudget(endpoint)
    dispatchBudget = budget
    // Guard before navigation, on every origin and model-backed route. Abort
    // a duplicate or mismatched request before it can reach any backend.
    await page.route(MODEL_ROUTE, async (route) => {
      const request = route.request()
      if (request.method() !== 'POST') return route.continue()
      const allowed = budget.allow(request.url())
      observed.generationRequests = budget.snapshot().forwarded
      if (!allowed) return route.abort('blockedbyclient')
      observed.requestId = await request.headerValue('x-request-id')
      // Relay the genuine network response, never a fixture. Browser redirect
      // handling could otherwise escape the exact-endpoint guard.
      const response = await route.fetch({
        headers: { ...request.headers(), accept: GENERATION_SINGLE_ATTEMPT_ACCEPT },
        maxRedirects: 0,
        maxRetries: 0,
        timeout: 180_000,
      })
      if (response.status() >= 300 && response.status() < 400) {
        await route.abort('blockedbyclient')
        throw new Error('Generation redirected; the acceptance run stopped without following it.')
      }
      await route.fulfill({ response })
    })

    expect(JOURNEY?.steps).toEqual([
      'Welcome',
      'OTP Login',
      'Onboarding',
      'Home',
      'Generate',
      'Loading',
      'Review',
      'Workout',
      'Summary',
      'Home',
    ])

    const visited: string[] = []

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

    // ── Welcome ────────────────────────────────────────────────────────────
    await visit(routeOf('Welcome'))
    await expectScreen('Welcome', routeOf('Welcome'), 'CLEAR')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()

    // ── OTP Login (the create-account entry to the same door) ──────────────
    await expectScreen('OTP Login', routeOf('OTP Login'), 'Create account')

    // Delivery only: see the header. The request still has to be made.
    let deliveryRequested = false
    await page.route('**/auth/v1/otp', async (route) => {
      deliveryRequested = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // `Input` renders its required marker inside the associated label. Use the
    // field name rather than an exact raw-label-text match so the browser test
    // follows the accessible control instead of coupling itself to that visual
    // marker (the same locator contract used by focus-ownership.spec.ts).
    const code = page.getByLabel('Code')
    const emailField = page.getByLabel('Email')
    await expect(emailField).toBeVisible({ timeout: 30_000 })
    await emailField.fill(email)
    await page.getByRole('button', { name: 'Send code', exact: true }).click()
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
    const verifiedResponse = await verified
    expect(verifiedResponse.status(), 'the public verify endpoint refused the code').toBe(200)
    // Use only this disposable athlete's public-login session in memory for
    // read-only context checks. No credential value is asserted or recorded.
    const accessToken: unknown = (await verifiedResponse.json()).access_token
    const publicKey = await verifiedResponse.request().headerValue('apikey')
    if (typeof accessToken !== 'string' || !publicKey) {
      throw new Error('Public login supplied no usable context-reader session.')
    }
    const contextReader = createGenerationDatabase({
      url: endpoint.replace(/\/functions\/v1\/generate-workout$/, ''),
      anonKey: publicKey,
      accessToken,
    })

    // ── Onboarding ─────────────────────────────────────────────────────────
    await expectScreen('Onboarding', routeOf('Onboarding'), 'Set up CLEAR')
    const next = page.getByRole('button', { name: 'Next', exact: true })

    await page.getByRole('radio', { name: new RegExp(`^${labelOf(TIERS, MIRROR.tier)}`) }).click()
    const equipment = page.getByRole('group', { name: 'Equipment', exact: true })
    for (const option of EQUIPMENT) {
      await equipment.getByRole('checkbox', { name: option.label, exact: true })
        .setChecked(MIRROR.equipment.includes(option.value))
    }
    await next.click()
    await page.getByRole('radio', { name: /^Some experience/ }).click()
    await next.click()
    await page.getByRole('radio', { name: new RegExp(`^${labelOf(GOALS, MIRROR.goal)}`) }).click()
    const sections = page.getByRole('group', { name: 'Sections', exact: true })
    for (const option of SECTIONS) {
      await sections.getByRole('checkbox', { name: option.label, exact: true })
        .setChecked(MIRROR.enabledSections.includes(option.value))
    }
    await next.click()
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Here’s your setup' })).toBeVisible()
    await checkA11y()
    await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
    const contextUser = await client.findUserByEmail(email)
    if (!contextUser) throw new Error('The disposable context-reader athlete is absent.')
    expect(await contextReader.experience?.(contextUser.id)).toEqual({ ok: true, value: 'some' })
    expect(await contextReader.recentHistory(contextUser.id)).toEqual({
      ok: true, value: { focuses: [], patterns: [], exerciseIds: [] },
    })

    // ── Home ───────────────────────────────────────────────────────────────
    await expectScreen('Home', routeOf('Home'), 'Today')
    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()

    // ── Generate ───────────────────────────────────────────────────────────
    await expectScreen('Generate', routeOf('Generate'), 'Generate workout')

    // Onboarding persisted the fixture's standing Goal and customized sections.
    // Generate shows that Goal as context instead of asking for it again; a first-time
    // athlete only supplies the unresolved Focus (labelled Anchor in the UI).
    await expect(page.getByText(new RegExp(`^Goal: ${labelOf(GOALS, MIRROR.goal)}`))).toBeVisible({ timeout: 30_000 })
    const anchor = page.getByRole('group', { name: 'Anchor', exact: true })
    await expect(anchor).toBeVisible({ timeout: 30_000 })
    await anchor.getByRole('button', { name: 'Upper body', exact: true }).click()

    // Every generation request the page makes is counted: one press, one call.
    const generationRequests: Request[] = []
    const isGeneration = (url: string) => url === endpoint
    page.on('request', (request) => {
      if (isGeneration(request.url()) && request.method() === 'POST') {
        generationRequests.push(request)
      }
    })
    const generated: Promise<Response> = page.waitForResponse(
      (response) => isGeneration(response.url()) && response.request().method() === 'POST',
      { timeout: 180_000 },
    )

    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()

    // ── Loading (transient, in place of Generate) ──────────────────────────
    await expect(page.locator('main h1'), 'the Loading screen').toHaveAccessibleName(
      'Generating session',
    )
    await expect(page).toHaveURL((url) => url.pathname === routeOf('Generate'))
    await checkA11y()
    visited.push('Loading')

    // The deployed function's answer, read off the wire rather than the app.
    const response = await generated
    expect(await response.headerValue('x-generation-attempt-limit')).toBe('1')
    const payload: unknown = await response.json().catch(() => null)
    observed.status = response.status()
    const refusal = (payload as { code?: unknown } | null)?.code
    observed.code = typeof refusal === 'string' ? refusal : null
    expect(
      response.status(),
      `generate-workout failed: ${JSON.stringify(payload)}`,
    ).toBe(200)
    expect(response.fromServiceWorker(), 'the workout came from a service worker').toBe(false)
    expect(budget.snapshot()).toEqual({ attempted: 1, forwarded: 1, blocked: 0 })

    const body = generationSuccessSchema.parse(payload)
    const sent = generationRequestSchema.parse(response.request().postDataJSON())
    expect(sent.goal).toBe(MIRROR.goal)
    expect(sent.focus).toBe('upper_body')
    expect(sent.requested_duration_mins).toBe(45)
    const requestId = await response.request().headerValue('x-request-id')
    expect(requestId, 'the call carried no request id').toBeTruthy()
    expect(body.requestId, 'the answer is not for this request').toBe(requestId)
    expect(body.acceptance.prompt_version).toBeTruthy()
    expect(body.acceptance.contract_version).toBeTruthy()
    const workout = body.acceptance.workout
    expect(workout.title.trim()).not.toBe('')
    expect(workout.sections.length).toBeGreaterThan(0)
    // Enabled parts are available choices, not a requirement to pad every
    // heading into this session. Domain validation still owns IDs/equipment.
    for (const section of workout.sections) {
      expect(MIRROR.enabledSections).toContain(section.section_type)
    }
    observed.accepted = true

    // ── Review ─────────────────────────────────────────────────────────────
    await expectScreen('Review', routeOf('Review'), workout.title)
    for (const section of workout.sections) {
      await expect(page.getByText(section.section_title, { exact: true }).first()).toBeVisible()
    }
    await expectPinnedAction(page, 'Start workout')
    await reachByKeyboard(page, 'Start workout')
    await page.screenshot({ path: testInfo.outputPath('vibe-c-review.png') })
    await page.getByRole('button', { name: 'Start workout', exact: true }).click()

    // ── Workout ────────────────────────────────────────────────────────────
    await expectScreen('Workout', routeOf('Workout'), 'Workout')
    await expectPinnedAction(
      page,
      workout.sections.length > 1 ? 'Next section' : 'Finish workout',
    )
    await page.screenshot({ path: testInfo.outputPath('vibe-c-workout.png') })
    await walkToFinish(page, workout.sections.length)

    // ── Summary ────────────────────────────────────────────────────────────
    await expectScreen('Summary', routeOf('Summary'), 'Nice work')
    await expect(page.getByText(`${workout.title}, done.`)).toBeVisible()
    await page.getByRole('radio', { name: /Ready/ }).click()
    await expectPinnedAction(page, 'Save and close')
    await reachByKeyboard(page, 'Save and close')
    await page.screenshot({ path: testInfo.outputPath('vibe-c-summary.png') })
    await page.getByRole('button', { name: 'Save and close', exact: true }).click()

    // ── Home, with the session in recents ──────────────────────────────────
    await expectScreen('Home', routeOf('Home'), 'Today')
    await expect(
      page.getByRole('list', { name: 'Recent workouts' }).getByText(workout.title),
    ).toBeVisible({ timeout: 30_000 })

    expect(visited, 'a screen on the path was skipped').toEqual(JOURNEY?.steps)
    expect(generationRequests, 'generation was retried or repeated').toHaveLength(1)
    expect(budget.snapshot()).toEqual({ attempted: 1, forwarded: 1, blocked: 0 })

    // Verify stored prescription structure, not only a success banner/title.
    // Contract-only relationship labels and the model's diagnostic time estimate
    // have no stored columns; this claim is limited to actual persisted fields.
    const user = await client.findUserByEmail(email)
    expect(user, 'the namespaced user vanished mid-run').toBeTruthy()
    const stored = await client.selectAsService('workout_sessions', {
      select: 'title,overview,prompt_version,contract_version,completed_at,' +
        'sections:workout_sections(order_index,section_type,section_title,section_notes,' +
        'blocks:workout_blocks(order_index,structure_type,rounds,timer_type,timer_seconds,' +
        'round_rest_seconds,rep_scheme,block_notes,' +
        'exercises:workout_exercises(order_index,exercise_id,equipment_used,modality,sets,' +
        'target_kind,target_value,target_min,target_max,target_sequence,per_side,distance_unit,' +
        'rest_seconds,tempo,load_type,load_value,is_interval_exercise)))',
      user_id: `eq.${String(user?.id)}`,
    })
    expect(stored.ok, 'reading the persisted session').toBe(true)
    const ordered = (stored.body as StoredComposition[]).map((session) => ({
      ...session,
      sections: session.sections.sort(byOrder).map((section) => ({
        ...section,
        blocks: section.blocks.sort(byOrder).map((block) => ({
          ...block,
          exercises: block.exercises.sort(byOrder),
        })),
      })),
    }))
    expect(ordered).toEqual([
      {
        title: workout.title,
        overview: workout.overview,
        prompt_version: body.acceptance.prompt_version,
        contract_version: body.acceptance.contract_version,
        completed_at: expect.any(String) as unknown,
        sections: workout.sections.map((section, sectionIndex) => ({
          ...section,
          order_index: sectionIndex,
          blocks: section.blocks.map((block, blockIndex) => ({
            ...block,
            order_index: blockIndex,
            exercises: block.exercises.map((exercise, exerciseIndex) => {
              const { equipment, session_function, anchor_relationship, ...prescription } = exercise
              void session_function
              void anchor_relationship
              return { ...prescription, equipment_used: equipment, order_index: exerciseIndex }
            }),
          })),
        })),
      },
    ])
    // Navigation completion is not performed training. This exercises the real
    // authenticated embedded history query without another provider request.
    expect(await contextReader.recentHistory(contextUser.id)).toEqual({
      ok: true, value: { focuses: ['upper_body'], patterns: [], exerciseIds: [] },
    })
    // Success must leave the actual non-personal workout available for coaching
    // review after disposable-user cleanup. Never attach the whole acceptance,
    // request/response, auth, user/location IDs or athlete-supplied notes.
    expect(body.acceptance.generation_notes, 'the disposable canary has no athlete notes').toBeNull()
    await testInfo.attach('non-personal-generated-workout', {
      body: Buffer.from(JSON.stringify({
        target: {
          goal: body.acceptance.goal_preset,
          focus: body.acceptance.session_focus,
          duration_mins: body.acceptance.effective_duration_target_mins,
          intensity: body.acceptance.effective_intensity,
          prompt_version: body.acceptance.prompt_version,
          contract_version: body.acceptance.contract_version,
        },
        workout,
      }, null, 2)),
      contentType: 'application/json',
    })
  })
})

type StoredExercise = Omit<GenerationOutput['sections'][number]['blocks'][number]['exercises'][number],
  'equipment' | 'session_function' | 'anchor_relationship'> & { equipment_used: string; order_index: number }
type StoredBlock = Omit<GenerationOutput['sections'][number]['blocks'][number], 'exercises'> &
  { order_index: number; exercises: StoredExercise[] }
type StoredSection = Omit<GenerationOutput['sections'][number], 'blocks'> &
  { order_index: number; blocks: StoredBlock[] }
type StoredComposition = { sections: StoredSection[]; [key: string]: unknown }
const byOrder = (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index

/** Navigation to Finish; not a claim that every prescribed set was performed. */
async function walkToFinish(page: Page, sections: number) {
  const nav = page.getByRole('navigation', { name: 'Workout sections' })
  const nextSection = nav.getByRole('button', { name: 'Next section', exact: true })
  const finish = nav.getByRole('button', { name: 'Finish workout', exact: true })

  await expect(nextSection.or(finish)).toBeVisible({ timeout: 30_000 })
  for (let step = 1; step < sections && (await nextSection.isVisible()); step += 1) {
    await nextSection.click()
  }
  await expect(finish, 'the last section offers no Finish').toBeVisible()
  await finish.click()
}
