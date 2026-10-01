import type { Page } from '@playwright/test'

import { namespaceId } from '../scripts/e2e/namespace.mjs'

import { expect, test } from './fixtures'
import { REQUIRED_SCREENS } from './required-routes'
import { backend } from './support/backend'

/**
 * REQ-016 / TASK-014 — the browser half of the focused authentication proof.
 *
 * `auth-otp.spec.ts` proves the code against the public endpoint with no screen
 * in the way. This file proves the screen: Welcome, then the one door at
 * `/login` in both of its modes, driven the way a person drives it — request a
 * code, type the project-issued digits, press Verify — with no paid model call
 * anywhere near it, so it can run wherever there is a project to run against.
 *
 * Three properties are asserted rather than assumed:
 *
 *  * **A real code through the real endpoint.** The code comes from the project
 *    (`generate_link`) and the screen verifies it at `/auth/v1/verify` with the
 *    anon key. The one thing replaced is the *delivery* request — `/auth/v1/otp`
 *    would mail an undeliverable address and spend the project's send budget —
 *    exactly as in `core-loop.spec.ts`. The request still has to be made.
 *  * **The profile decides where the door leads.** A new user lands Onboarding;
 *    a returning, onboarded user lands Home and never passes through
 *    `/onboarding` on the way.
 *  * **A refusal is typed.** A wrong code is refused by the public endpoint and
 *    the screen shows the sentence written in `src/data/otp.ts`, never the
 *    backend's own message.
 *
 * Every user is namespaced, provisioned before the run and deleted after it,
 * whatever the outcome.
 */

/** The inventory's route for a screen, so the walk cannot drift from it. */
function routeOf(screen: string): string {
  const entry = REQUIRED_SCREENS.find((candidate) => candidate.screen === screen)
  if (entry?.path == null) throw new Error(`"${screen}" has no required route`)
  return entry.path
}

/** `src/data/otp.ts` — GoTrue will not say whether a code is wrong or stale. */
const TYPED_CODE_ERRORS = [
  'That code is not right. Check the digits and try again.',
  'That code has expired. Request a new one.',
]

/** A code of the same shape as the issued one that is certainly not it. */
function wrongCodeFor(issued: string): string {
  const last = Number(issued.slice(-1))
  return `${issued.slice(0, -1)}${(last + 1) % 10}`
}

const SLOTS = ['new', 'returning', 'wrong-code'] as const
type Slot = (typeof SLOTS)[number]

test.describe('sign-in and create-account screen (REQ-016)', () => {
  test.skip(!backend.available, backend.reason)
  test.describe.configure({ mode: 'serial' })

  let client: ReturnType<typeof backend.client>
  let emails: Record<Slot, string>

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName
    client = backend.client()
    emails = Object.fromEntries(
      SLOTS.map((slot) => [
        slot,
        `clear-e2e-${namespaceId()}-${testInfo.project.name}-auth-screen-${slot}@example.com`,
      ]),
    ) as Record<Slot, string>

    for (const email of Object.values(emails)) {
      // A cancelled prior run may have left this exact address behind. Only it
      // is deleted; auth deletion cascades to everything the user owned.
      const prior = await client.findUserByEmail(email)
      if (prior) await client.deleteUser(prior.id)
      await client.ensureConfirmedUser(email)
    }

    // The returning user has finished onboarding before they reach the door.
    const session = await client.mintSession(emails.returning)
    const onboarded = await client.rpcAs(
      'complete_onboarding',
      {
        p_location_name: 'Auth screen gym',
        p_location_tier: 'home',
        p_equipment: ['bodyweight', 'dumbbells'],
        p_experience_level: 'some',
        p_goal_preset: 'balanced',
        p_sections: ['warmup', 'primary_lift', 'cooldown'],
        p_avoid_patterns: [],
        p_note: null,
      },
      session.accessToken,
    )
    expect(onboarded.ok, `onboarding the returning user (status ${onboarded.status})`).toBe(true)
  })

  test.afterAll(async () => {
    if (!client) return
    for (const email of Object.values(emails ?? {})) {
      const provisioned = await client.findUserByEmail(email)
      if (provisioned) await client.deleteUser(provisioned.id)
      expect(await client.findUserByEmail(email), 'a namespaced user outlived the run').toBeFalsy()
    }
  })

  /** The screen is the route *and* its heading; then it is scanned. */
  async function expectScreen(
    page: Page,
    checkA11y: () => Promise<void>,
    screen: string,
    heading: string,
  ) {
    const path = routeOf(screen)
    await expect(page, `${screen} is served at ${path}`).toHaveURL(
      (url) => url.pathname === path,
      { timeout: 30_000 },
    )
    await expect(page.locator('main h1'), `${screen}'s heading`).toHaveAccessibleName(heading, {
      timeout: 30_000,
    })
    await checkA11y()
  }

  /**
   * From Welcome through the chosen entry to the code field: the delivery
   * request is observed and answered here, and nothing else is replaced.
   */
  async function requestCode(
    page: Page,
    visit: (path: string) => Promise<void>,
    checkA11y: () => Promise<void>,
    entry: 'Create account' | 'Sign in',
    email: string,
  ) {
    await visit(routeOf('Welcome'))
    await expectScreen(page, checkA11y, 'Welcome', 'CLEAR')
    await page.getByRole('button', { name: entry, exact: true }).click()

    await expectScreen(page, checkA11y, 'OTP Login', entry)
    expect(new URL(page.url()).searchParams.get('mode')).toBe(
      entry === 'Create account' ? 'create' : null,
    )

    // Delivery only: see the header.
    let deliveryRequested = false
    await page.route('**/auth/v1/otp', async (route) => {
      deliveryRequested = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // `Input` renders its required marker inside the associated label, so the
    // fields are found by accessible name rather than by exact label text.
    const emailField = page.getByLabel('Email')
    await expect(emailField).toBeVisible({ timeout: 30_000 })
    await emailField.fill(email)
    await page.getByRole('button', { name: 'Send code', exact: true }).click()

    const code = page.getByLabel('Code')
    await expect(code).toBeFocused()
    expect(deliveryRequested, 'the Login screen never asked for a code').toBe(true)
    // The verify step is the same screen with a different field: scan it too.
    await expectScreen(page, checkA11y, 'OTP Login', entry)
    return code
  }

  /** Type a code, press Verify, and return the public endpoint's answer. */
  async function submitCode(page: Page, token: string) {
    await page.getByLabel('Code').fill(token)
    const verified = page.waitForResponse(
      (response) =>
        response.url().includes('/auth/v1/verify') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Verify', exact: true }).click()
    return verified
  }

  async function issueCode(email: string) {
    const { emailOtp } = await client.generateOneTimeCode(email)
    expect(emailOtp, 'the project issued no numeric code').toMatch(/^\d{6,10}$/)
    return emailOtp
  }

  test('a new user creates an account from Welcome and lands Onboarding', async ({
    page,
    visit,
    checkA11y,
  }) => {
    await requestCode(page, visit, checkA11y, 'Create account', emails.new)

    const response = await submitCode(page, await issueCode(emails.new))
    expect(response.status(), 'the public verify endpoint refused the code').toBe(200)

    await expectScreen(page, checkA11y, 'Onboarding', 'Set up CLEAR')
  })

  test('a returning onboarded user signs in and is not sent to onboarding', async ({
    page,
    visit,
    checkA11y,
  }) => {
    // Every path the document passes through, pushState included.
    const paths: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) paths.push(new URL(frame.url()).pathname)
    })

    await requestCode(page, visit, checkA11y, 'Sign in', emails.returning)

    const response = await submitCode(page, await issueCode(emails.returning))
    expect(response.status(), 'the public verify endpoint refused the code').toBe(200)

    await expectScreen(page, checkA11y, 'Home', 'Today')
    expect(paths, 'an onboarded user was routed through onboarding').not.toContain(
      routeOf('Onboarding'),
    )
  })

  test('a wrong code shows a typed error and the right one still verifies', async ({
    page,
    visit,
    checkA11y,
  }) => {
    const email = emails['wrong-code']
    const code = await requestCode(page, visit, checkA11y, 'Sign in', email)

    const refused = await submitCode(page, wrongCodeFor(await issueCode(email)))
    expect(refused.status(), 'the public verify endpoint accepted a wrong code').toBeGreaterThanOrEqual(400)
    const raw = (await refused.json().catch(() => null)) as { msg?: unknown } | null

    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    const shown = (await alert.innerText()).trim()
    expect(TYPED_CODE_ERRORS, 'the error is not one of the typed sentences').toContain(shown)
    if (typeof raw?.msg === 'string') {
      expect(shown, 'the backend message reached the screen').not.toContain(raw.msg)
    }

    // Severity is not colour alone, and the caret is back on the refused field.
    await expect(alert.locator('svg')).toBeVisible()
    await expect(code).toHaveAttribute('aria-invalid', 'true')
    await expect(code).toBeFocused()
    await expectScreen(page, checkA11y, 'OTP Login', 'Sign in')

    // The refusal did not strand the user: a fresh code goes through.
    const accepted = await submitCode(page, await issueCode(email))
    expect(accepted.status(), 'the public verify endpoint refused the code').toBe(200)
    await expect(alert).toHaveCount(0)
    await expectScreen(page, checkA11y, 'Onboarding', 'Set up CLEAR')
  })
})
