import type { Locator, Page } from '@playwright/test'

import { namespaceId } from '../scripts/e2e/namespace.mjs'

import { expect, test } from './fixtures'
import { backend } from './support/backend'

/**
 * ENV-07 / REQ-015 — the one place the one-time code is exercised against the
 * backend directly.
 *
 * Every other spec gets its session from `mintSession`, which is the whole
 * reason this file is short and alone. The OTP flow is slow, stateful and
 * rate-limited; running it inside every flow would buy one more proof of the
 * same thing and pay for it in every test.
 *
 * What it proves is one part a human performs: a project-issued numeric code,
 * typed once, becomes a session through the *public* verify endpoint with the
 * *anon* key — the call a browser makes — and a code that has been spent, or
 * has expired, is refused there.
 *
 * It deliberately does not prove delivery. `generate_link` returns the code
 * without rendering the hosted email, so a live template that sends
 * `{{ .ConfirmationURL }}` can still pass this spec. The committed template,
 * read-only live drift check, and owner inbox acceptance cover that boundary.
 *
 * It owns its user. The address is namespaced to this spec and this project,
 * provisioned before the first test and deleted after the last, so the checks
 * never share an account — or its single live code — with the seeded slots
 * the RLS and Settings specs sign in as.
 *
 * The second block is the screen (REQ-016): the same project-issued code, typed
 * into `/login` in both of its modes. It asserts the 0.14.3 form contract on
 * the rendered page — one form card holding the step heading, the field and
 * the typed failure; the actions in the pinned footer — while a new user still
 * lands Onboarding, a returning one lands Home, and a wrong code is recovered
 * from in place. The one request replaced is delivery (`/auth/v1/otp`), which
 * would mail an undeliverable address; verification is the public endpoint.
 */

/** GoTrue's typed refusal for a code that is spent, superseded or stale. */
const REFUSED = { name: 'AdminError', status: 403, code: 'otp_expired' }

test.describe('one-time code', () => {
  test.skip(!backend.available, backend.reason)
  // One user holds one live code at a time, so the checks take turns.
  test.describe.configure({ mode: 'serial' })

  let email = ''
  let client: ReturnType<typeof backend.client>

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName
    email = `clear-e2e-${namespaceId()}-${testInfo.project.name}-otp@example.com`
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

  test('a code issued without an inbox verifies into a session', async () => {
    const { emailOtp } = await client.generateOneTimeCode(email)
    expect(emailOtp, 'GoTrue issued no email OTP').toMatch(/^\d{6,10}$/)

    const session = await client.verifyOneTimeCode({
      email,
      token: emailOtp,
      type: 'email',
    })

    expect(session.accessToken).toBeTruthy()
    expect(session.refreshToken).toBeTruthy()
    expect(session.userId).toBeTruthy()
  })

  test('the same code cannot be spent twice', async () => {
    const { emailOtp } = await client.generateOneTimeCode(email)

    await client.verifyOneTimeCode({ email, token: emailOtp, type: 'email' })

    await expect(
      client.verifyOneTimeCode({ email, token: emailOtp, type: 'email' }),
    ).rejects.toMatchObject(REFUSED)
  })

  test('an expired code is refused with a typed error', async () => {
    // The project's code lifetime cannot be shortened or its clock advanced
    // with these credentials, so the code is expired the way a person expires
    // one: by asking for another. The first was never spent — it is refused
    // because it is no longer the live code, and GoTrue answers that with the
    // same `otp_expired` it gives a code that has aged out.
    const { emailOtp: expired } = await client.generateOneTimeCode(email)
    const { emailOtp: live } = await client.generateOneTimeCode(email)
    expect(live, 'GoTrue reissued the same code').not.toBe(expired)

    await expect(
      client.verifyOneTimeCode({ email, token: expired, type: 'email' }),
    ).rejects.toMatchObject(REFUSED)

    // The refusal was of that code, not of the address: the live one still
    // verifies.
    const session = await client.verifyOneTimeCode({ email, token: live, type: 'email' })
    expect(session.accessToken).toBeTruthy()
  })
})

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

const SCREEN_SLOTS = ['new', 'returning', 'wrong-code'] as const
type ScreenSlot = (typeof SCREEN_SLOTS)[number]

type Entry = 'create' | 'sign-in'

const ENTRIES: Record<Entry, { path: string; heading: string }> = {
  create: { path: '/login?mode=create', heading: 'Create account' },
  'sign-in': { path: '/login', heading: 'Sign in' },
}

test.describe('one-time code screen (REQ-016)', () => {
  test.skip(!backend.available, backend.reason)
  test.describe.configure({ mode: 'serial' })

  let client: ReturnType<typeof backend.client>
  let emails: Record<ScreenSlot, string>

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName
    client = backend.client()
    emails = Object.fromEntries(
      SCREEN_SLOTS.map((slot) => [
        slot,
        `clear-e2e-${namespaceId()}-${testInfo.project.name}-otp-screen-${slot}@example.com`,
      ]),
    ) as Record<ScreenSlot, string>

    for (const address of Object.values(emails)) {
      const prior = await client.findUserByEmail(address)
      if (prior) await client.deleteUser(prior.id)
      await client.ensureConfirmedUser(address)
    }

    // The returning user has finished onboarding before they reach the door.
    const session = await client.mintSession(emails.returning)
    const onboarded = await client.rpcAs(
      'complete_onboarding',
      {
        p_location_name: 'One-time code gym',
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
    for (const address of Object.values(emails ?? {})) {
      const provisioned = await client.findUserByEmail(address)
      if (provisioned) await client.deleteUser(provisioned.id)
      expect(
        await client.findUserByEmail(address),
        'a namespaced user outlived the run',
      ).toBeFalsy()
    }
  })

  /**
   * The form contract as it renders: one card, with its accent bar, holding the
   * step heading and the field in its element frame; the named actions in the
   * pinned footer below it; nothing wider than the viewport.
   */
  async function expectFormCard(
    page: Page,
    step: { heading: string; field: Locator; actions: (string | RegExp)[] },
  ) {
    const main = page.locator('main')
    const card = main.locator('.clr-card')
    await expect(card).toHaveCount(1)
    await expect(card.locator('.clr-card__bar')).toBeVisible()
    await expect(card.getByRole('heading', { level: 2, name: step.heading })).toBeVisible()
    await expect(card.locator('.clr-field.clr-chamfer--sm').filter({ has: step.field })).toBeVisible()
    await expect(card.locator('h1')).toHaveCount(0)

    const footer = main.locator('.clr-footer')
    await expect(card.getByRole('button')).toHaveCount(0)
    for (const name of step.actions) {
      await expect(footer.getByRole('button', { name })).toBeVisible()
    }

    const cardBox = await card.boundingBox()
    const footerBox = await footer.boundingBox()
    const viewport = page.viewportSize()
    if (cardBox === null || footerBox === null || viewport === null) {
      throw new Error('the form card or its footer has no box')
    }
    expect(cardBox.x, 'the card starts inside the viewport').toBeGreaterThanOrEqual(0)
    expect(cardBox.x + cardBox.width, 'the card ends inside the viewport').toBeLessThanOrEqual(
      viewport.width,
    )
    expect(footerBox.y + footerBox.height, 'the footer is pinned on screen').toBeLessThanOrEqual(
      viewport.height,
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      'the document scrolls sideways',
    ).toBe(true)
  }

  /** Open the door in one mode and ask for a code; delivery alone is replaced. */
  async function requestCode(
    page: Page,
    visit: (path: string) => Promise<void>,
    checkA11y: () => Promise<void>,
    entry: Entry,
    address: string,
  ) {
    const { path, heading } = ENTRIES[entry]
    await visit(path)
    await expect(page.locator('main h1')).toHaveAccessibleName(heading)

    let deliveryRequested = false
    await page.route('**/auth/v1/otp', async (route) => {
      deliveryRequested = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    const emailField = page.getByLabel('Email')
    await expectFormCard(page, {
      heading: 'Your email',
      field: emailField,
      actions: ['Send code'],
    })
    await emailField.fill(address)
    await page.getByRole('button', { name: 'Send code', exact: true }).click()

    const code = page.getByLabel('Code')
    await expect(code).toBeFocused()
    expect(deliveryRequested, 'the Login screen never asked for a code').toBe(true)
    await expect(page.locator('main h1')).toHaveAccessibleName(heading)
    await expectFormCard(page, {
      heading: 'Your code',
      field: code,
      actions: ['Verify', /^Resend/, /^Use a different email/],
    })
    await checkA11y()
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

  async function issueCode(address: string) {
    const { emailOtp } = await client.generateOneTimeCode(address)
    expect(emailOtp, 'the project issued no numeric code').toMatch(/^\d{6,10}$/)
    return emailOtp
  }

  async function expectLanded(page: Page, path: string, heading: string) {
    await expect(page).toHaveURL((url) => url.pathname === path, { timeout: 30_000 })
    await expect(page.locator('main h1')).toHaveAccessibleName(heading, { timeout: 30_000 })
  }

  test('a new user creates an account in the form card and lands Onboarding', async ({
    page,
    visit,
    checkA11y,
  }) => {
    await requestCode(page, visit, checkA11y, 'create', emails.new)

    const response = await submitCode(page, await issueCode(emails.new))
    expect(response.status(), 'the public verify endpoint refused the code').toBe(200)

    await expectLanded(page, '/onboarding', 'Set up CLEAR')
  })

  test('a returning user signs in through the form card and lands Home', async ({
    page,
    visit,
    checkA11y,
  }) => {
    // Every path the document passes through, pushState included.
    const paths: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) paths.push(new URL(frame.url()).pathname)
    })

    await requestCode(page, visit, checkA11y, 'sign-in', emails.returning)

    const response = await submitCode(page, await issueCode(emails.returning))
    expect(response.status(), 'the public verify endpoint refused the code').toBe(200)

    await expectLanded(page, '/', 'Today')
    expect(paths, 'an onboarded user was routed through onboarding').not.toContain('/onboarding')
  })

  test('a wrong code is refused inside the form card and the right one recovers', async ({
    page,
    visit,
    checkA11y,
  }) => {
    const address = emails['wrong-code']
    const code = await requestCode(page, visit, checkA11y, 'sign-in', address)

    const refused = await submitCode(page, wrongCodeFor(await issueCode(address)))
    expect(
      refused.status(),
      'the public verify endpoint accepted a wrong code',
    ).toBeGreaterThanOrEqual(400)
    const raw = (await refused.json().catch(() => null)) as { msg?: unknown } | null

    // The typed sentence, with its glyph, inside the card — not on the atmosphere.
    const alert = page.locator('main .clr-card').getByRole('alert')
    await expect(alert).toBeVisible()
    const shown = (await alert.innerText()).trim()
    expect(TYPED_CODE_ERRORS, 'the error is not one of the typed sentences').toContain(shown)
    if (typeof raw?.msg === 'string') {
      expect(shown, 'the backend message reached the screen').not.toContain(raw.msg)
    }
    await expect(alert.locator('svg')).toBeVisible()

    // The refused field is the invalid element frame, and the caret is back on it.
    await expect(code).toHaveAttribute('aria-invalid', 'true')
    await expect(code).toBeFocused()
    await expect(
      page.locator('main .clr-card .clr-field').filter({ has: code }).locator('.clr-field__glyph'),
    ).toBeVisible()
    await expectFormCard(page, {
      heading: 'Your code',
      field: code,
      actions: ['Verify', /^Resend/, /^Use a different email/],
    })
    await checkA11y()

    // The refusal did not strand the user: a fresh code goes through.
    const accepted = await submitCode(page, await issueCode(address))
    expect(accepted.status(), 'the public verify endpoint refused the code').toBe(200)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expectLanded(page, '/onboarding', 'Set up CLEAR')
  })
})
