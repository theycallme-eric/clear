import type { Page, Request, Response } from '@playwright/test'

import { namespaceId } from '../scripts/e2e/namespace.mjs'

import { expect, test } from './fixtures'
import { REQUIRED_JOURNEYS, REQUIRED_SCREENS } from './required-routes'
import { backend } from './support/backend'

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
 * Four properties are the point, and each is asserted rather than assumed:
 *
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

/** The inventory's route for a screen, so the walk cannot drift from it. */
function routeOf(screen: string): string {
  const entry = REQUIRED_SCREENS.find((candidate) => candidate.screen === screen)
  if (entry?.path == null) throw new Error(`"${screen}" has no required route`)
  return entry.path
}

interface GeneratedWorkout {
  requestId: string
  acceptance: {
    prompt_version: string
    contract_version: string
    workout: {
      title: string
      sections: { section_title: string }[]
    }
  }
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
  test.describe.configure({ mode: 'serial', retries: 0 })

  let email = ''
  let client: ReturnType<typeof backend.client>

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName
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

  test('walks every screen on the path and lands Home with the session in recents', async ({
    page,
    visit,
    checkA11y,
  }, testInfo) => {
    // One paid model call plus a dozen screens; the bound is explicit.
    test.setTimeout(300_000)

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
    expect((await verified).status(), 'the public verify endpoint refused the code').toBe(200)

    // ── Onboarding ─────────────────────────────────────────────────────────
    await expectScreen('Onboarding', routeOf('Onboarding'), 'Set up CLEAR')
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
    await expectScreen('Home', routeOf('Home'), 'Today')
    await page.getByRole('button', { name: 'Generate workout', exact: true }).click()

    // ── Generate ───────────────────────────────────────────────────────────
    await expectScreen('Generate', routeOf('Generate'), 'Generate workout')

    // Onboarding persisted Strength as the standing Goal. Generate deliberately
    // shows that Goal as context instead of asking for it again; a first-time
    // athlete only supplies the unresolved Focus (labelled Anchor in the UI).
    await expect(page.getByText(/^Goal: Strength/)).toBeVisible({ timeout: 30_000 })
    const anchor = page.getByRole('group', { name: 'Anchor', exact: true })
    await expect(anchor).toBeVisible({ timeout: 30_000 })
    await anchor.getByRole('button', { name: 'Full body', exact: true }).click()

    // Every generation request the page makes is counted: one press, one call.
    const generationRequests: Request[] = []
    const isGeneration = (url: string) => url.includes('/functions/v1/generate-workout')
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
    const payload: unknown = await response.json().catch(() => null)
    expect(
      response.status(),
      `generate-workout failed: ${JSON.stringify(payload)}`,
    ).toBe(200)
    expect(response.fromServiceWorker(), 'the workout came from a service worker').toBe(false)

    const body = payload as GeneratedWorkout
    const requestId = await response.request().headerValue('x-request-id')
    expect(requestId, 'the call carried no request id').toBeTruthy()
    expect(body.requestId, 'the answer is not for this request').toBe(requestId)
    expect(body.acceptance.prompt_version).toBeTruthy()
    expect(body.acceptance.contract_version).toBeTruthy()
    const workout = body.acceptance.workout
    expect(workout.title.trim()).not.toBe('')
    expect(workout.sections.length).toBeGreaterThan(0)

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

    // What Start persisted is exactly what the model returned.
    const user = await client.findUserByEmail(email)
    expect(user, 'the namespaced user vanished mid-run').toBeTruthy()
    const stored = await client.selectAsService('workout_sessions', {
      select: 'title,prompt_version,contract_version,completed_at',
      user_id: `eq.${String(user?.id)}`,
    })
    expect(stored.ok, 'reading the persisted session').toBe(true)
    expect(stored.body).toEqual([
      {
        title: workout.title,
        prompt_version: body.acceptance.prompt_version,
        contract_version: body.acceptance.contract_version,
        completed_at: expect.any(String) as unknown,
      },
    ])
  })
})

/** Section by section to the last one, then Finish — nothing skipped past. */
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
