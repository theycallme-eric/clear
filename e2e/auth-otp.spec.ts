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
 * What it does not yet cover is the screen. AUTH-02 builds the send-and-verify
 * UI; when it lands, the browser half belongs here, in this file, and nowhere
 * else.
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
