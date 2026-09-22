import { emailForSlot } from '../scripts/e2e/namespace.mjs'

import { expect, test } from './fixtures'
import { backend } from './support/backend'

/**
 * ENV-07 — the one place the one-time code is exercised.
 *
 * Every other spec gets its session from `mintSession`, which is the whole
 * reason this file is short and alone. The OTP flow is slow, stateful and
 * rate-limited; running it inside every flow would buy one more proof of the
 * same thing and pay for it in every test.
 *
 * What it proves is the part a human normally performs: a six-digit code,
 * issued for a confirmed address and typed once, becomes a session through the
 * *public* verify endpoint with the *anon* key — the call a browser makes. No
 * inbox is involved, because `generate_link` hands the harness the same code
 * the mail would have carried.
 *
 * What it does not yet cover is the screen. AUTH-02 builds the send-and-verify
 * UI; when it lands, the browser half belongs here, in this file, and nowhere
 * else.
 */

test.describe('one-time code', () => {
  test.skip(!backend.available, backend.reason)

  test('a code issued without an inbox verifies into a session', async () => {
    const client = backend.client()
    const email = emailForSlot('a')

    await client.ensureConfirmedUser(email)

    const { emailOtp } = await client.generateOneTimeCode(email)
    expect(emailOtp, 'GoTrue issued no email OTP').toMatch(/^\d{6}$/)

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
    const client = backend.client()
    const email = emailForSlot('a')

    await client.ensureConfirmedUser(email)
    const { emailOtp } = await client.generateOneTimeCode(email)

    await client.verifyOneTimeCode({ email, token: emailOtp, type: 'email' })

    await expect(
      client.verifyOneTimeCode({ email, token: emailOtp, type: 'email' }),
    ).rejects.toThrow(/verifying a one-time code failed/)
  })
})
