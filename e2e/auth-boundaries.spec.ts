import type { Page } from '@playwright/test'

import { namespaceId } from '../scripts/e2e/namespace.mjs'

import { expect, test } from './fixtures'
import { REQUIRED_SCREENS } from './required-routes'
import { backend } from './support/backend'

/**
 * REQ-017 / TASK-015 — what happens *after* a code has verified, proved as
 * three separate boundaries rather than as one walk that can only say "the
 * user did not reach Home".
 *
 *  * **Route guard.** A verified new user is sent to Onboarding and, once
 *    onboarded, Home; a verified returning user is sent straight Home with the
 *    Generate action available.
 *  * **Profile loading.** A profile read that fails renders the error with a
 *    retry, on the route that was asked for. It never redirects to Onboarding:
 *    a profile that 500s is not a new user (defect D1).
 *  * **Session continuity.** A reload on Home keeps the athlete signed in and
 *    on Home, with no second trip through the public verify endpoint.
 *
 * **Every failure names its boundary.** Each check runs inside `atBoundary`,
 * which prefixes whatever fails — an assertion, a timed-out click, a refused
 * request — with the boundary it belongs to. Provisioning is the fourth name:
 * the sessions come from the public verify endpoint with the anon key, so a
 * failure there is reported as `public verification` and not as a guard bug.
 *
 * The code itself is not typed here. The one-time-code exchange has its own
 * spec (`auth-otp.spec.ts`) and the screen has another (`auth-screen.spec.ts`);
 * these checks start from the session those prove, minted by the harness.
 *
 * It owns its users. Two namespaced `example.com` addresses — one that has
 * never onboarded, one that has — are provisioned before the first test and
 * deleted after the last, so nothing depends on a seeded account.
 */

type Boundary = 'public verification' | 'route guard' | 'profile loading' | 'session continuity'

/** Run a check so that anything it throws says which boundary failed. */
async function atBoundary<T>(boundary: Boundary, check: () => Promise<T>): Promise<T> {
  try {
    return await check()
  } catch (error) {
    const label = `[${boundary}]`
    if (error instanceof Error) {
      if (!error.message.startsWith(label)) error.message = `${label} ${error.message}`
      throw error
    }
    throw new Error(`${label} ${String(error)}`, { cause: error })
  }
}

/** `src/data/auth.ts`'s `SESSION_STORAGE_KEY`. */
const SESSION_KEY = 'clear.auth.session'

/** The inventory's route for a screen, so the checks cannot drift from it. */
function routeOf(screen: string): string {
  const entry = REQUIRED_SCREENS.find((candidate) => candidate.screen === screen)
  if (entry?.path == null) throw new Error(`"${screen}" has no required route`)
  return entry.path
}

const HOME = routeOf('Home')
const ONBOARDING = routeOf('Onboarding')

const HOME_HEADING = 'Today'
const ONBOARDING_HEADING = 'Set up CLEAR'

/** The screen is the route *and* its heading. */
async function expectScreen(page: Page, path: string, heading: string) {
  await expect(page, `expected the route ${path}`).toHaveURL((url) => url.pathname === path, {
    timeout: 30_000,
  })
  await expect(page.locator('main h1'), `expected the heading "${heading}"`).toHaveAccessibleName(
    heading,
    { timeout: 30_000 },
  )
}

/** Home is generation-ready when its Generate action can be pressed. */
async function expectGenerateAvailable(page: Page) {
  const generate = page.getByRole('button', { name: 'Generate workout', exact: true })
  await expect(generate, 'Home has no Generate action').toBeVisible({ timeout: 30_000 })
  await expect(generate, 'Home’s Generate action is disabled').toBeEnabled()
}

const storedSession = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY)

test.describe('after verification: route guard, profile loading, session continuity (REQ-017)', () => {
  test.skip(!backend.available, backend.reason)
  // Each user is one profile row the checks read and one of them writes.
  test.describe.configure({ mode: 'serial' })

  let newEmail = ''
  let returningEmail = ''
  let client: ReturnType<typeof backend.client>

  /** Put a verified session in the browser before any app script runs. */
  async function signIn(page: Page, email: string) {
    const { accessToken, refreshToken, userId } = await atBoundary('public verification', () =>
      client.mintSession(email),
    )
    const stored = JSON.stringify({
      accessToken,
      refreshToken,
      // GoTrue's default access token lasts an hour; a check takes seconds.
      expiresAt: Date.now() + 50 * 60 * 1000,
      user: { id: userId, email },
    })

    // Only once: a reload must find the app's own session, not this one
    // written over it.
    await page.addInitScript(
      ({ key, value }) => {
        if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
      },
      { key: SESSION_KEY, value: stored },
    )
  }

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName
    const prefix = `clear-e2e-${namespaceId()}-${testInfo.project.name}-boundaries`
    newEmail = `${prefix}-new@example.com`
    returningEmail = `${prefix}-returning@example.com`
    client = backend.client()

    await atBoundary('public verification', async () => {
      // A cancelled prior run may have left these exact addresses behind. Only
      // they are deleted; auth deletion cascades to everything the user owned.
      for (const email of [newEmail, returningEmail]) {
        const prior = await client.findUserByEmail(email)
        if (prior) await client.deleteUser(prior.id)
        await client.ensureConfirmedUser(email)
      }

      // A returning user is one whose profile says onboarding is done. The
      // write is made as that user, through the same policy the app uses.
      const session = await client.mintSession(returningEmail)
      const onboarded = await client.updateAs(
        'profiles',
        { id: `eq.${session.userId}` },
        { onboarded_at: new Date().toISOString() },
        session.accessToken,
      )
      expect(onboarded.ok, `marking the profile onboarded (status ${onboarded.status})`).toBe(true)
      expect(onboarded.body, 'the returning user has no profile row to mark').toHaveLength(1)
    })
  })

  test.afterAll(async () => {
    if (!client) return
    for (const email of [newEmail, returningEmail]) {
      const provisioned = await client.findUserByEmail(email)
      if (provisioned) await client.deleteUser(provisioned.id)
      expect(await client.findUserByEmail(email), 'a namespaced user outlived the run').toBeFalsy()
    }
  })

  test('[route guard] a verified new user is sent to Onboarding and, once onboarded, Home', async ({
    page,
    visit,
    checkA11y,
  }) => {
    await signIn(page, newEmail)

    await atBoundary('route guard', async () => {
      // Home is what was asked for; the gate is what answers.
      await visit(HOME)
      await expectScreen(page, ONBOARDING, ONBOARDING_HEADING)

      const next = page.getByRole('button', { name: 'Next', exact: true })
      await page.getByRole('radio', { name: /^Full gym/ }).click()
      await next.click()
      await page.getByRole('radio', { name: /^Some experience/ }).click()
      await next.click()
      await page.getByRole('radio', { name: /^Strength/ }).click()
      await next.click()
      await page.getByRole('button', { name: 'Skip', exact: true }).click()
      await page.getByRole('button', { name: 'Finish setup', exact: true }).click()

      await expectScreen(page, HOME, HOME_HEADING)
      await expectGenerateAvailable(page)
      await checkA11y()

      // The same rule read from the other end: Onboarding is now closed.
      await visit(ONBOARDING)
      await expectScreen(page, HOME, HOME_HEADING)
    })
  })

  test('[route guard] a verified returning user is sent straight Home with Generate available', async ({
    page,
    visit,
  }) => {
    await signIn(page, returningEmail)

    await atBoundary('route guard', async () => {
      let sawOnboarding = false
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame() && new URL(frame.url()).pathname === ONBOARDING) {
          sawOnboarding = true
        }
      })

      await visit(HOME)
      await expectScreen(page, HOME, HOME_HEADING)
      await expectGenerateAvailable(page)
      expect(sawOnboarding, 'a returning user was detoured through Onboarding').toBe(false)
    })
  })

  test('[profile loading] a failed profile load shows the error with retry and never Onboarding', async ({
    page,
    visit,
  }) => {
    await signIn(page, returningEmail)

    await atBoundary('profile loading', async () => {
      // Only the profile read fails. The session is intact and every other
      // request is answered by the project, so the guard has nothing else to
      // blame and nothing else to route on.
      let failing = true
      let failedReads = 0
      await page.route('**/rest/v1/profiles*', async (route) => {
        if (!failing || route.request().method() !== 'GET') return route.continue()
        failedReads += 1
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'simulated profile failure' }),
        })
      })

      let sawOnboarding = false
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame() && new URL(frame.url()).pathname === ONBOARDING) {
          sawOnboarding = true
        }
      })

      // A signed-in athlete's first profile read is the boot sequence's first
      // check, so that is the screen that owns this failure: it names what
      // could not be read and offers the one retry.
      const failure = page.getByRole('alert').filter({ hasText: 'Could not read your profile' })
      const retry = failure.getByRole('button', { name: 'Retry', exact: true })

      async function expectProfileError() {
        await expect(failure, 'the profile error is not shown').toBeVisible({ timeout: 30_000 })
        await expect(retry, 'the profile error offers no retry').toBeEnabled()
        await expect(page, 'the failed profile load left the requested route').toHaveURL(
          (url) => url.pathname === HOME,
        )
        await expect(
          page.getByRole('heading', { name: ONBOARDING_HEADING }),
          'a failed profile load rendered Onboarding',
        ).toHaveCount(0)
        expect(sawOnboarding, 'a failed profile load redirected to Onboarding').toBe(false)
      }

      await visit(HOME)
      await expectProfileError()
      expect(failedReads, 'the profile read was never attempted').toBeGreaterThan(0)

      // A retry that fails again is still an error, not a new user.
      const readsBeforeRetry = failedReads
      await retry.click()
      await expect
        .poll(() => failedReads, { message: 'Retry did not re-read the profile' })
        .toBeGreaterThan(readsBeforeRetry)
      await expectProfileError()

      // And a retry that succeeds lands where the athlete was going.
      failing = false
      await retry.click()
      await expectScreen(page, HOME, HOME_HEADING)
      await expectGenerateAvailable(page)
      expect(sawOnboarding, 'recovering from a profile error went through Onboarding').toBe(false)
    })
  })

  test('[session continuity] a reload on Home keeps the athlete signed in and on Home', async ({
    page,
    visit,
    checkA11y,
  }) => {
    await signIn(page, returningEmail)

    await atBoundary('session continuity', async () => {
      await visit(HOME)
      await expectScreen(page, HOME, HOME_HEADING)
      const before = await storedSession(page)
      expect(before, 'no session was stored before the reload').not.toBeNull()

      // Re-authenticating is a code request or a code exchange. Neither may
      // leave the browser because of a reload.
      const reauthentications: string[] = []
      page.on('request', (request) => {
        const { pathname } = new URL(request.url())
        if (pathname.endsWith('/auth/v1/otp') || pathname.endsWith('/auth/v1/verify')) {
          reauthentications.push(pathname)
        }
      })

      await page.reload()

      await expectScreen(page, HOME, HOME_HEADING)
      await expectGenerateAvailable(page)
      await checkA11y()

      const after = await storedSession(page)
      expect(after, 'the reload dropped the stored session').not.toBeNull()
      const user = (raw: string | null) =>
        (JSON.parse(raw ?? '{}') as { user?: { id?: string } }).user?.id
      expect(user(after), 'the reload changed who is signed in').toBe(user(before))
      expect(reauthentications, 'the reload re-authenticated the athlete').toEqual([])
    })
  })
})
