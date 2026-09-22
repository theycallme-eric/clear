/**
 * ENV-07 — the privileged half of the harness: GoTrue's admin API and
 * PostgREST, spoken over `fetch`, with the service-role key.
 *
 * This file exists outside `src/` and can never be imported from it. That is
 * the requirement's "no test-only branches in `src/`" made structural rather
 * than promised: the app has no code path that knows this key exists, because
 * the code that uses it is not in the bundle's module graph at all.
 *
 * `fetch` is injected for the same reason DATA-03 injects it — so the whole
 * lifecycle is testable at its seams without a network, which is the only way
 * these functions get proved in a repository whose CI has no database.
 *
 * Nothing here logs a response body. A GoTrue session and a service-role key
 * are both secrets, and a stack trace that prints one is a leak with a long
 * half-life.
 */

/**
 * @typedef {object} ClientOptions
 * @property {string} url Supabase project URL, no trailing slash
 * @property {string} serviceRoleKey server-side secret; never reaches a browser
 * @property {string} anonKey browser-safe key, used for the public verify call
 * @property {typeof globalThis.fetch} [fetch]
 */

/** Thrown for every non-2xx response, carrying status but never the secret. */
export class AdminError extends Error {
  /** @param {string} what @param {number} status @param {string} detail */
  constructor(what, status, detail) {
    super(`${what} failed with ${status}${detail ? `: ${detail}` : ''}`)
    this.name = 'AdminError'
    this.status = status
  }
}

/** GoTrue pages its user list; 200 is far more than this namespace needs. */
const USER_PAGE_SIZE = 200

/** @param {ClientOptions} options */
export function createAdminClient(options) {
  const { url, serviceRoleKey, anonKey } = options
  const doFetch = options.fetch ?? globalThis.fetch

  if (!url) throw new Error('createAdminClient needs a Supabase URL')
  if (!serviceRoleKey) throw new Error('createAdminClient needs a service-role key')
  if (!anonKey) throw new Error('createAdminClient needs an anon key')

  const base = url.replace(/\/+$/, '')

  /**
   * @param {string} path
   * @param {RequestInit & { key?: string }} [init]
   */
  async function call(path, init = {}) {
    const { key = serviceRoleKey, headers, ...rest } = init
    const response = await doFetch(`${base}${path}`, {
      ...rest,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...headers,
      },
    })

    const text = await response.text()
    const body = text === '' ? null : JSON.parse(text)
    return { ok: response.ok, status: response.status, body }
  }

  /** @param {string} what @param {{ok: boolean, status: number, body: any}} r */
  function must(what, r) {
    if (!r.ok) {
      // A GoTrue error carries `msg` or `error_description`; PostgREST carries
      // `message`. None of the three ever contains a credential.
      const detail =
        r.body?.msg ?? r.body?.error_description ?? r.body?.message ?? ''
      throw new AdminError(what, r.status, String(detail))
    }
    return r.body
  }

  return {
    /** @param {string} email */
    async findUserByEmail(email) {
      const body = must(
        'listing users',
        await call(`/auth/v1/admin/users?page=1&per_page=${USER_PAGE_SIZE}`),
      )
      const users = Array.isArray(body) ? body : (body?.users ?? [])
      return users.find((user) => user.email === email) ?? null
    },

    /**
     * Create a user GoTrue already considers confirmed, so no inbox is ever
     * involved. Idempotent: an existing user is returned as-is, and the race
     * where two runners create the same address at once resolves by re-reading
     * rather than failing.
     *
     * @param {string} email
     */
    async ensureConfirmedUser(email) {
      const existing = await this.findUserByEmail(email)
      if (existing) return existing

      const created = await call('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, email_confirm: true }),
      })

      if (created.ok) return created.body

      // 422 is GoTrue's "this address is already registered" — which is the
      // outcome we wanted anyway.
      if (created.status === 422) {
        const raced = await this.findUserByEmail(email)
        if (raced) return raced
      }

      return must('creating a confirmed user', created)
    },

    /** @param {string} userId */
    async deleteUser(userId) {
      const deleted = await call(`/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
      })
      // Already gone is the state we asked for, not a failure.
      if (deleted.status === 404) return
      must('deleting a user', deleted)
    },

    /**
     * Ask GoTrue for a one-time code without sending mail.
     *
     * `generate_link` returns both halves of the OTP flow: the six-digit
     * `email_otp` a person would type, and the `hashed_token` a magic link
     * carries. The harness uses the second to mint sessions in bulk; AUTH-02's
     * focused test uses the first, which is the real code path a user walks.
     *
     * @param {string} email
     */
    async generateOneTimeCode(email) {
      const body = must(
        'generating a one-time code',
        await call('/auth/v1/admin/generate_link', {
          method: 'POST',
          body: JSON.stringify({ type: 'magiclink', email }),
        }),
      )
      const properties = body?.properties ?? body
      const emailOtp = properties?.email_otp
      const hashedToken = properties?.hashed_token

      // Both halves or neither: a caller that has to null-check a credential
      // ends up asserting its way around the check instead of trusting it.
      if (typeof emailOtp !== 'string' || typeof hashedToken !== 'string') {
        throw new Error('GoTrue returned no one-time code for this address')
      }

      return { emailOtp, hashedToken }
    },

    /**
     * Exchange a one-time code for a session through the *public* endpoint,
     * with the anon key — the same call the app will make. Verifying through
     * the admin key instead would prove nothing about what a browser can do.
     *
     * @param {{ email?: string, token: string, type?: string }} params
     */
    async verifyOneTimeCode({ email, token, type = 'email' }) {
      const body = must(
        'verifying a one-time code',
        await call('/auth/v1/verify', {
          key: anonKey,
          method: 'POST',
          body: JSON.stringify(
            type === 'magiclink' ? { type, token } : { type, email, token },
          ),
        }),
      )
      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        userId: body.user?.id ?? null,
      }
    },

    /**
     * A session for an already-confirmed user, minted directly. This is what
     * keeps the OTP screen out of every other flow.
     *
     * @param {string} email
     */
    async mintSession(email) {
      const { hashedToken } = await this.generateOneTimeCode(email)
      return this.verifyOneTimeCode({ token: hashedToken, type: 'magiclink' })
    },

    /**
     * Insert rows as the service role, ignoring ones that are already there.
     * `resolution=ignore-duplicates` is what makes the seed re-runnable: the
     * second run is a no-op rather than a primary-key violation.
     *
     * @param {string} table
     * @param {Record<string, unknown>[]} rows
     */
    async insertRows(table, rows) {
      const response = await call(`/rest/v1/${table}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      })
      must(`seeding ${table}`, response)
    },

    /**
     * Read as a given user's access token rather than as the service role —
     * which is the only way an RLS policy is actually exercised.
     *
     * @param {string} table
     * @param {Record<string, string>} query
     * @param {string} accessToken
     */
    async selectAs(table, query, accessToken) {
      const search = new URLSearchParams({ select: '*', ...query })
      const response = await call(`/rest/v1/${table}?${search}`, {
        key: anonKey,
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      return response
    },

    /**
     * Attempt a write as a given user. Returns the raw response: a refusal is
     * the expected outcome here, so it must not throw.
     *
     * @param {string} table
     * @param {Record<string, unknown>} row
     * @param {string} accessToken
     */
    async insertAs(table, row, accessToken) {
      return call(`/rest/v1/${table}`, {
        key: anonKey,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(row),
      })
    },

    /**
     * Attempt an update as a given user. A policy that filters rather than
     * refuses answers 200 with an empty array, which is also a denial — the
     * caller asserts on both shapes.
     *
     * @param {string} table
     * @param {Record<string, string>} query
     * @param {Record<string, unknown>} patch
     * @param {string} accessToken
     */
    async updateAs(table, query, patch, accessToken) {
      const search = new URLSearchParams(query)
      return call(`/rest/v1/${table}?${search}`, {
        key: anonKey,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(patch),
      })
    },
  }
}
