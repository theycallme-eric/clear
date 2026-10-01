import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AdminError, createAdminClient } from '../../scripts/e2e/client.mjs'

/**
 * REQ-015 — the two things the focused one-time-code spec leans on that can be
 * proved without a Supabase project.
 *
 * The spec itself (`e2e/auth-otp.spec.ts`) only runs where the backend
 * credentials are, so its isolation and the shape of the refusal it asserts on
 * are pinned here, in the lane every pull request runs.
 */

const e2eDir = resolve(import.meta.dirname, '../../e2e')
const OTP_SPEC = 'auth-otp.spec.ts'

describe('the one-time-code backend path', () => {
  it('is verified directly by the focused spec and by no other', () => {
    const specs = readdirSync(e2eDir).filter((name) => name.endsWith('.spec.ts'))
    expect(specs).toContain(OTP_SPEC)

    // `mintSession` is how every other spec gets a session. Calling the public
    // verify exchange by hand is this one spec's job.
    const callers = specs.filter((name) =>
      readFileSync(resolve(e2eDir, name), 'utf-8').includes('verifyOneTimeCode'),
    )
    expect(callers).toEqual([OTP_SPEC])
  })

  it('surfaces a refused code as a typed error, not as prose', async () => {
    const client = createAdminClient({
      url: 'https://project.example',
      serviceRoleKey: 'service-role',
      anonKey: 'anon',
      fetch: async () =>
        new Response(
          JSON.stringify({
            code: 403,
            error_code: 'otp_expired',
            msg: 'Token has expired or is invalid',
          }),
          { status: 403 },
        ),
    })

    const refusal = await client
      .verifyOneTimeCode({ email: 'clear-e2e-local-a@example.com', token: '123456' })
      .catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(AdminError)
    expect(refusal).toMatchObject({ status: 403, code: 'otp_expired' })
  })
})
