import { createHash } from 'node:crypto'

import type { Page } from '@playwright/test'

import { namespaceId } from '../../scripts/e2e/namespace.mjs'

import { test as base, expect } from '../fixtures'
import { REQUIRED_SCREENS } from '../required-routes'
import { backend } from './backend'

/**
 * REQ-019 / TASK-017 — one authenticated session, from the real sign-in screen
 * to Generate, and the fixture that hands that same session on.
 *
 * `authenticatedSession` is the release journey: Welcome, the one door at
 * `/login`, a project-issued code typed and verified through the public
 * endpoint, Home, and then the Generate screen — once per worker, in a context
 * of its own. It stops at Generate. Nothing is pressed there, so no generation
 * request leaves the browser, and every request the walk does make is counted
 * so a spec can assert on the numbers rather than trust this comment.
 *
 * `authenticatedPage` is how a generation browser lane consumes it: the test's
 * own page, with the session the journey established already in storage. No
 * code is requested, issued or verified to get there, however many tests in
 * the worker ask for it.
 *
 * It owns its user. A namespaced `example.com` address is provisioned and
 * onboarded before the walk — a returning athlete, so the door leads Home — and
 * deleted when the worker is done. Onboarding is written with a minted session
 * from Node, which is how every spec outside the one-time-code flow gets one;
 * the single verification the journey counts is the one the screen makes.
 *
 * Import `test` from here instead of `../fixtures` to use either. A spec that
 * asks for neither pays nothing: the journey runs only when it is requested.
 */

/** `src/data/auth.ts`'s `SESSION_STORAGE_KEY`. */
const SESSION_KEY = 'clear.auth.session'

/** The inventory's route for a screen, so the walk cannot drift from it. */
function routeOf(screen: string): string {
  const entry = REQUIRED_SCREENS.find((candidate) => candidate.screen === screen)
  if (entry?.path == null) throw new Error(`"${screen}" has no required route`)
  return entry.path
}

/**
 * A token is compared, never shown: a failed assertion prints its operands,
 * and a report is not a place for a credential.
 */
const fingerprint = (token: string) =>
  createHash('sha256').update(token).digest('hex').slice(0, 12)

interface StoredSession {
  accessToken?: string
  user?: { id?: string }
}

async function readStoredSession(page: Page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY)
  expect(raw, `no session is stored at ${new URL(page.url()).pathname}`).not.toBeNull()
  const parsed = JSON.parse(raw ?? '{}') as StoredSession
  expect(parsed.accessToken, 'the stored session has no access token').toBeTruthy()
  return { raw: raw ?? '', token: fingerprint(parsed.accessToken ?? ''), userId: parsed.user?.id }
}

export interface AuthenticatedSession {
  readonly email: string
  readonly userId: string
  /** The app's own stored session, exactly as the journey left it. */
  readonly storageValue: string
  /** What the journey did to get it, counted off the wire. */
  readonly journey: {
    /** The screens reached, in order, each by route and heading. */
    readonly screens: readonly string[]
    /** `POST /auth/v1/otp` — the request for a code. */
    readonly codeRequests: number
    /** `POST /auth/v1/verify` — the exchange of a code for a session. */
    readonly verificationRequests: number
    /** Anything sent to a `generate-*` function. */
    readonly generationRequests: number
    /** Fingerprints of the access token: as issued, on Home, on Generate. */
    readonly sessionAt: { readonly verified: string; readonly home: string; readonly generate: string }
  }
}

interface TestFixtures {
  /** The test's page, already carrying the journey's session. */
  authenticatedPage: Page
}

interface WorkerFixtures {
  /** The one session the journey established for this worker. */
  authenticatedSession: AuthenticatedSession
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  authenticatedSession: [
    async ({ browser }, use, workerInfo) => {
      const email = `clear-e2e-${namespaceId()}-${workerInfo.project.name}-session-${workerInfo.parallelIndex}@example.com`
      const client = backend.client()

      // A cancelled prior run may have left this exact address behind. Only it
      // is deleted; auth deletion cascades to everything the user owned.
      const prior = await client.findUserByEmail(email)
      if (prior) await client.deleteUser(prior.id)
      await client.ensureConfirmedUser(email)

      try {
        // A returning athlete with a location, so Home is generation-ready.
        const provisioning = await client.mintSession(email)
        const onboarded = await client.rpcAs(
          'complete_onboarding',
          {
            p_location_name: 'Session journey gym',
            p_location_tier: 'home',
            p_equipment: ['bodyweight', 'dumbbells'],
            p_experience_level: 'some',
            p_goal_preset: 'balanced',
            p_sections: ['warmup', 'primary_lift', 'cooldown'],
            p_avoid_patterns: [],
            p_note: null,
          },
          provisioning.accessToken,
        )
        expect(onboarded.ok, `onboarding the journey's user (status ${onboarded.status})`).toBe(true)

        // The project's own device, origin and preview headers: a worker
        // fixture is not given the test's context, so it builds the same one.
        const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, extraHTTPHeaders } =
          workerInfo.project.use
        const context = await browser.newContext({
          baseURL,
          viewport,
          userAgent,
          deviceScaleFactor,
          isMobile,
          hasTouch,
          extraHTTPHeaders,
        })

        try {
          const page = await context.newPage()
          const screens: string[] = []

          let codeRequests = 0
          let verificationRequests = 0
          let generationRequests = 0
          context.on('request', (request) => {
            const { pathname } = new URL(request.url())
            if (pathname.includes('/functions/v1/generate-')) generationRequests += 1
            if (request.method() !== 'POST') return
            if (pathname.endsWith('/auth/v1/otp')) codeRequests += 1
            if (pathname.endsWith('/auth/v1/verify')) verificationRequests += 1
          })

          /** The screen is the route *and* its heading. */
          const expectScreen = async (screen: string, heading: string) => {
            const path = routeOf(screen)
            await expect(page, `${screen} is served at ${path}`).toHaveURL(
              (url) => url.pathname === path,
              { timeout: 30_000 },
            )
            await expect(page.locator('main h1'), `${screen}'s heading`).toHaveAccessibleName(
              heading,
              { timeout: 30_000 },
            )
            screens.push(screen)
          }

          // ── Welcome ──────────────────────────────────────────────────────
          await page.goto(routeOf('Welcome'))
          await expectScreen('Welcome', 'CLEAR')
          await page.getByRole('button', { name: 'Sign in', exact: true }).click()

          // ── OTP Login ────────────────────────────────────────────────────
          await expectScreen('OTP Login', 'Sign in')

          // Delivery only, as in `auth-screen.spec.ts`: `/auth/v1/otp` would
          // mail an undeliverable address. The request still has to be made.
          await page.route('**/auth/v1/otp', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
          )

          const emailField = page.getByLabel('Email')
          await expect(emailField).toBeVisible({ timeout: 30_000 })
          await emailField.fill(email)
          await page.getByRole('button', { name: 'Send code', exact: true }).click()
          const code = page.getByLabel('Code')
          await expect(code).toBeFocused()

          const { emailOtp } = await client.generateOneTimeCode(email)
          expect(emailOtp, 'the project issued no numeric code').toMatch(/^\d{6,10}$/)
          await code.fill(emailOtp)
          const verifying = page.waitForResponse(
            (response) =>
              response.url().includes('/auth/v1/verify') && response.request().method() === 'POST',
          )
          await page.getByRole('button', { name: 'Verify', exact: true }).click()
          const verified = await verifying
          expect(verified.status(), 'the public verify endpoint refused the code').toBe(200)
          const issued = (await verified.json()) as { access_token?: string; user?: { id?: string } }
          expect(issued.access_token, 'verification returned no session').toBeTruthy()

          // ── Home ─────────────────────────────────────────────────────────
          await expectScreen('Home', 'Today')
          const home = await readStoredSession(page)
          const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
          await expect(generate, 'Home’s Generate action is not available').toBeEnabled({
            timeout: 30_000,
          })
          await generate.click()

          // ── Generate (reached, and left alone) ───────────────────────────
          await expectScreen('Generate', 'Generate workout')
          // Whatever the screen loads on arrival has to have gone out before
          // the counts are read.
          await page.waitForLoadState('networkidle')
          const atGenerate = await readStoredSession(page)

          expect(home.userId, 'Home is signed in as someone else').toBe(issued.user?.id)
          expect(atGenerate.userId, 'Generate is signed in as someone else').toBe(issued.user?.id)

          await use({
            email,
            userId: issued.user?.id ?? '',
            storageValue: atGenerate.raw,
            journey: {
              screens,
              codeRequests,
              verificationRequests,
              generationRequests,
              sessionAt: {
                verified: fingerprint(issued.access_token ?? ''),
                home: home.token,
                generate: atGenerate.token,
              },
            },
          })
        } finally {
          await context.close()
        }
      } finally {
        const provisioned = await client.findUserByEmail(email)
        if (provisioned) await client.deleteUser(provisioned.id)
      }
    },
    // A dozen network round trips and four screens, once per worker.
    { scope: 'worker', timeout: 180_000 },
  ],

  authenticatedPage: async ({ page, authenticatedSession }, use) => {
    // Only once: a reload must find the app's own session, not this one
    // written over it.
    await page.addInitScript(
      ({ key, value }) => {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
      },
      { key: SESSION_KEY, value: authenticatedSession.storageValue },
    )
    await use(page)
  },
})

export { expect }
