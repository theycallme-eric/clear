import type { Locator, Page, Response } from '@playwright/test'

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
 * The second block is the screen (REQ-016, U14): the same project-issued code,
 * typed into `/login` after Welcome's one Get started entry, for a new and a
 * returning account alike. It asserts the 0.14.3 form contract on the rendered
 * page — one form card holding the step heading, the concise guidance, the
 * field, the inline change-email action and the typed failure; Verify and
 * Resend in the pinned footer — while a new user still lands Onboarding, a
 * returning one lands Home, a wrong or expired code is recovered from in
 * place, Resend waits out its cooldown, and Change email returns to email
 * entry. The one request replaced is delivery (`/auth/v1/otp`), which would
 * mail an undeliverable address; verification is the public endpoint.
 *
 * The third block is Welcome's composition (U13), which needs no backend: the
 * wordmark and one card holding the entry, centred, and still usable at a
 * short height and with enlarged text.
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
  'That code is not right. Check the digits, or resend a new code.',
  'That code has expired. Resend a new code to continue.',
]

/** `src/app/Login.tsx` — the cooldown Resend waits out after every send. */
const RESEND_COOLDOWN_SECONDS = 60

/** U14: the one passwordless entry, Welcome's action and the screen's title. */
const ENTRY = 'Get started'

/** A code of the same shape as the issued one that is certainly not it. */
function wrongCodeFor(issued: string): string {
  const last = Number(issued.slice(-1))
  return `${issued.slice(0, -1)}${(last + 1) % 10}`
}

const SCREEN_SLOTS = ['new', 'returning', 'wrong-code', 'expired-code', 'change-email'] as const
type ScreenSlot = (typeof SCREEN_SLOTS)[number]

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
   * step heading, its concise guidance and the field in its element frame, plus
   * only the named in-card actions; the named actions in the pinned footer
   * below it; nothing wider than the viewport.
   */
  async function expectFormCard(
    page: Page,
    step: {
      heading: string
      guidance: RegExp
      field: Locator
      cardActions: RegExp[]
      actions: (string | RegExp)[]
    },
  ) {
    const main = page.locator('main')
    const card = main.locator('.clr-card')
    await expect(card).toHaveCount(1)
    await expect(card.locator('.clr-card__bar')).toBeVisible()
    await expect(card.getByRole('heading', { level: 2, name: step.heading })).toBeVisible()
    await expect(card.getByText(step.guidance)).toBeVisible()
    await expect(card.locator('.clr-field.clr-chamfer--sm').filter({ has: step.field })).toBeVisible()
    await expect(card.locator('h1')).toHaveCount(0)

    const footer = main.locator('.clr-footer')
    await expect(card.getByRole('button')).toHaveText(step.cardActions)
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

  /** Delivery alone is replaced; returns how many sends the screen asked for. */
  async function replaceDelivery(page: Page) {
    const sent: string[] = []
    await page.route('**/auth/v1/otp', async (route) => {
      const body = route.request().postDataJSON() as { email?: unknown } | null
      sent.push(typeof body?.email === 'string' ? body.email : '')
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })
    return sent
  }

  const EMAIL_STEP = { heading: 'Your email', guidance: /^New or returning, enter your email/ }
  const CODE_STEP = { heading: 'Your code', guidance: /^Enter the code sent to / }
  const CODE_ACTIONS = ['Verify', /^Resend/]

  /** The form card at the code step, for the address the code went to. */
  async function expectCodeStep(page: Page, address: string) {
    const code = page.getByLabel('Code')
    await expectFormCard(page, {
      ...CODE_STEP,
      field: code,
      cardActions: [/^Change email/],
      actions: CODE_ACTIONS,
    })
    await expect(page.locator('main .clr-card').getByText(address, { exact: true })).toBeVisible()
    return code
  }

  /**
   * Welcome's one Get started entry, then a code for `address`. The same entry
   * serves new and returning accounts; there is no mode to choose.
   */
  async function requestCode(
    page: Page,
    visit: (path: string) => Promise<void>,
    checkA11y: () => Promise<void>,
    address: string,
  ) {
    await visit('/welcome')
    const entries = page.locator('main').getByRole('button')
    await expect(entries).toHaveText([ENTRY])
    await entries.click()
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.search === '')
    await expect(page.locator('main h1')).toHaveAccessibleName(ENTRY)

    const sent = await replaceDelivery(page)

    const emailField = page.getByLabel('Email')
    await expectFormCard(page, {
      ...EMAIL_STEP,
      field: emailField,
      cardActions: [],
      actions: ['Send code'],
    })
    await checkA11y()
    await emailField.fill(address)
    await page.getByRole('button', { name: 'Send code', exact: true }).click()

    await expect(page.getByLabel('Code')).toBeFocused()
    expect(sent, 'the Login screen never asked for a code').toEqual([address])
    await expect(page.locator('main h1')).toHaveAccessibleName(ENTRY)
    const code = await expectCodeStep(page, address)
    await checkA11y()
    return { code, sent }
  }

  /** A code refused in place: the typed sentence and glyph, in the card. */
  async function expectRefusedInPlace(page: Page, refused: Response, code: Locator) {
    expect(refused.status(), 'the public verify endpoint accepted the code').toBeGreaterThanOrEqual(
      400,
    )
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
    // Still /login, with the recovery paths on screen.
    await expect(page).toHaveURL((url) => url.pathname === '/login')
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

  test('a new user gets started in the form card and lands Onboarding', async ({
    page,
    visit,
    checkA11y,
  }) => {
    await requestCode(page, visit, checkA11y, emails.new)

    const response = await submitCode(page, await issueCode(emails.new))
    expect(response.status(), 'the public verify endpoint refused the code').toBe(200)

    await expectLanded(page, '/onboarding', 'Set up CLEAR')
  })

  test('a returning user gets started through the same entry and lands Home', async ({
    page,
    visit,
    checkA11y,
  }) => {
    // Every path the document passes through, pushState included.
    const paths: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) paths.push(new URL(frame.url()).pathname)
    })

    await requestCode(page, visit, checkA11y, emails.returning)

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
    const { code } = await requestCode(page, visit, checkA11y, address)

    const refused = await submitCode(page, wrongCodeFor(await issueCode(address)))
    await expectRefusedInPlace(page, refused, code)
    await expectCodeStep(page, address)
    await checkA11y()

    // The refusal did not strand the user: a fresh code goes through.
    const accepted = await submitCode(page, await issueCode(address))
    expect(accepted.status(), 'the public verify endpoint refused the code').toBe(200)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expectLanded(page, '/onboarding', 'Set up CLEAR')
  })

  test('an expired code is refused in place and Resend recovers after its cooldown', async ({
    page,
    visit,
    checkA11y,
  }) => {
    // The cooldown is a minute of wall time; the page's clock is moved instead.
    await page.clock.install()
    const address = emails['expired-code']
    const { code, sent } = await requestCode(page, visit, checkA11y, address)

    // Expired the way a person expires one: a newer code supersedes it.
    const expired = await issueCode(address)
    await issueCode(address)
    const refused = await submitCode(page, expired)
    await expectRefusedInPlace(page, refused, code)

    // Resend is the recovery, and it says how long it is holding.
    const resend = page.locator('main .clr-footer').getByRole('button', { name: /^Resend/ })
    await expect(resend).toBeDisabled()
    await expect(resend).toHaveText(/^Resend in \d+s$/)
    await checkA11y()

    await page.clock.fastForward((RESEND_COOLDOWN_SECONDS + 1) * 1_000)
    await expect(resend).toHaveText('Resend code')
    await expect(resend).toBeEnabled()
    await resend.click()
    await expect(page.locator('main [role="status"]')).toContainText(`Code sent to ${address}`)
    expect(sent, 'Resend did not ask for a new code').toEqual([address, address])
    await expect(resend).toBeDisabled()

    const accepted = await submitCode(page, await issueCode(address))
    expect(accepted.status(), 'the public verify endpoint refused the new code').toBe(200)
    await expectLanded(page, '/onboarding', 'Set up CLEAR')
  })

  test('Change email returns to email entry and the corrected address verifies', async ({
    page,
    visit,
    checkA11y,
  }) => {
    const address = emails['change-email']
    const typo = address.replace('@example.com', '@exmaple.com')
    const { sent } = await requestCode(page, visit, checkA11y, typo)

    await page.locator('main .clr-card').getByRole('button', { name: /^Change email/ }).click()

    // Back at email entry, caret in the field, the address kept to correct.
    const emailField = page.getByLabel('Email')
    await expect(emailField).toBeFocused()
    await expect(emailField).toHaveValue(typo)
    await expectFormCard(page, {
      ...EMAIL_STEP,
      field: emailField,
      cardActions: [],
      actions: ['Send code'],
    })
    await expect(page.getByRole('button', { name: 'Send code', exact: true })).toBeEnabled()
    await checkA11y()

    await emailField.fill(address)
    await page.getByRole('button', { name: 'Send code', exact: true }).click()
    await expect(page.getByLabel('Code')).toBeFocused()
    expect(sent, 'the corrected address was not sent a code').toEqual([typo, address])
    await expectCodeStep(page, address)

    const accepted = await submitCode(page, await issueCode(address))
    expect(accepted.status(), 'the public verify endpoint refused the code').toBe(200)
    await expectLanded(page, '/onboarding', 'Set up CLEAR')
  })
})

test.describe('Welcome composition (U13)', () => {
  /**
   * The wordmark and one card holding the line, its guidance and the single
   * entry; the group centred in the scroller when it fits, and every part
   * reachable, with nothing sideways, when it does not.
   */
  async function expectWelcomeCard(page: Page, { centred }: { centred: boolean }) {
    const main = page.locator('main')
    const card = main.locator('.clr-card')
    await expect(card).toHaveCount(1)
    await expect(card.locator('p')).toHaveText(['Strength training, simplified.'])
    await expect(main.getByRole('button')).toHaveText([ENTRY])
    const entry = card.getByRole('button', { name: ENTRY, exact: true })
    await expect(main.locator('h1')).toHaveAccessibleName('CLEAR')

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      'the document scrolls sideways',
    ).toBe(true)

    const scroller = main.locator('.clr-scroll-region__scroller')
    const heading = main.locator('h1')
    const [scrollerBox, headingBox, cardBox] = await Promise.all([
      scroller.boundingBox(),
      heading.boundingBox(),
      card.boundingBox(),
    ])
    if (scrollerBox === null || headingBox === null || cardBox === null) {
      throw new Error('the Welcome group has no box')
    }
    expect(cardBox.x, 'the card starts inside the scroller').toBeGreaterThanOrEqual(scrollerBox.x)
    expect(cardBox.x + cardBox.width, 'the card ends inside the scroller').toBeLessThanOrEqual(
      scrollerBox.x + scrollerBox.width + 1,
    )
    // Never clipped above: the wordmark is reachable at the top.
    expect(headingBox.y, 'the wordmark is cut off above').toBeGreaterThanOrEqual(scrollerBox.y - 1)

    if (centred) {
      const above = headingBox.y - scrollerBox.y
      const below = scrollerBox.y + scrollerBox.height - (cardBox.y + cardBox.height)
      expect(Math.abs(above - below), 'the group is not centred').toBeLessThanOrEqual(
        Math.max(48, scrollerBox.height * 0.1),
      )
    }

    // The entry is reachable and works at any size.
    await entry.scrollIntoViewIfNeeded()
    await expect(entry).toBeInViewport()
  }

  test('settled: one centred card holds the line and the one entry', async ({
    page,
    visit,
    checkA11y,
  }) => {
    await visit('/welcome')
    await expectWelcomeCard(page, { centred: true })
    await checkA11y()

    await page.getByRole('button', { name: ENTRY, exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/login')
    await expect(page.locator('main h1')).toHaveAccessibleName(ENTRY)
  })

  test('short height: the card scrolls instead of clipping', async ({ page, visit, checkA11y }) => {
    const viewport = page.viewportSize()
    await page.setViewportSize({ width: viewport?.width ?? 375, height: 320 })
    await visit('/welcome')
    await expectWelcomeCard(page, { centred: false })
    await checkA11y()
  })

  test('enlarged text: the card stays one usable column', async ({ page, visit, checkA11y }) => {
    await visit('/welcome')
    // The same enlargement `app-shell.spec.ts` proves the label tier against.
    await page.addStyleTag({
      content:
        '.clr-screen { --label-sm-size: 18px; --label-md-size: 20px; --label-lg-size: 24px; --paragraph-md-size: 20px; }',
    })
    await expectWelcomeCard(page, { centred: false })
    expect(
      await page.locator('main :is(p, button, h1)').evaluateAll(
        (elements) =>
          elements.filter((element) => {
            const style = getComputedStyle(element)
            return (
              /(hidden|clip)/.test(style.overflowX) &&
              style.textOverflow !== 'ellipsis' &&
              element.scrollWidth > element.clientWidth + 1
            )
          }).length,
      ),
      'text is clipped',
    ).toBe(0)
    await checkA11y()
  })
})
