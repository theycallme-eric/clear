import type { Page } from '@playwright/test'

import { REQUIRED_SCREENS } from './required-routes'
import { expect, test } from './support/authenticated-session'
import { backend } from './support/backend'

/**
 * REQ-019 / TASK-017 — one authenticated session continues from sign-in to
 * Generate, and is handed on as a fixture.
 *
 * The walk itself lives in `support/authenticated-session.ts`, because it *is*
 * the fixture: the session the generation browser lanes consume is the one the
 * journey established through the real screen, not a second one minted beside
 * it. This file holds that walk to its three promises:
 *
 *  * **One verification, one session.** Exactly one code is requested and
 *    exactly one is exchanged, and the session that exchange issued is the one
 *    found on Home and again on Generate.
 *  * **No generation.** The journey reaches the Generate screen and presses
 *    nothing. Not one request goes to a `generate-*` function.
 *  * **Consumable without a code.** A fresh page given the fixture opens Home
 *    and Generate as the same athlete, and neither `/auth/v1/otp` nor
 *    `/auth/v1/verify` is called to get it there — in the browser or on the
 *    journey's own count, which does not move.
 *
 * The code exchange and the screen have their own focused specs
 * (`auth-otp.spec.ts`, `auth-screen.spec.ts`); this one is about the session
 * surviving the trip.
 */

/** `src/data/auth.ts`'s `SESSION_STORAGE_KEY`. */
const SESSION_KEY = 'clear.auth.session'

/** The inventory's route for a screen, so the checks cannot drift from it. */
function routeOf(screen: string): string {
  const entry = REQUIRED_SCREENS.find((candidate) => candidate.screen === screen)
  if (entry?.path == null) throw new Error(`"${screen}" has no required route`)
  return entry.path
}

/** The screen is the route *and* its heading. */
async function expectScreen(page: Page, screen: string, heading: string) {
  const path = routeOf(screen)
  await expect(page, `${screen} is served at ${path}`).toHaveURL((url) => url.pathname === path, {
    timeout: 30_000,
  })
  await expect(page.locator('main h1'), `${screen}'s heading`).toHaveAccessibleName(heading, {
    timeout: 30_000,
  })
}

const storedUserId = (page: Page) =>
  page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : ((JSON.parse(raw) as { user?: { id?: string } }).user?.id ?? null)
  }, SESSION_KEY)

test.describe('one session from sign-in to Generate (REQ-019)', () => {
  test.skip(!backend.available, backend.reason)
  // One worker, so both tests read the same journey rather than one each.
  test.describe.configure({ mode: 'serial' })

  test('the journey verifies once and the same session reaches Home and Generate', ({
    authenticatedSession,
  }) => {
    const { journey, userId } = authenticatedSession

    expect(journey.screens).toEqual(['Welcome', 'OTP Login', 'Home', 'Generate'])
    expect(userId, 'the journey signed nobody in').toBeTruthy()

    expect(journey.codeRequests, 'the journey asked for more or fewer than one code').toBe(1)
    expect(journey.verificationRequests, 'the journey did not verify exactly once').toBe(1)

    expect(journey.sessionAt.home, 'Home holds a different session from the one verified').toBe(
      journey.sessionAt.verified,
    )
    expect(
      journey.sessionAt.generate,
      'Generate holds a different session from the one verified',
    ).toBe(journey.sessionAt.verified)

    expect(journey.generationRequests, 'the journey made a generation request').toBe(0)
  })

  test('another test consumes the fixture without a code being issued', async ({
    authenticatedPage: page,
    authenticatedSession,
    visit,
  }) => {
    const authentications: string[] = []
    const generations: string[] = []
    page.on('request', (request) => {
      const { pathname } = new URL(request.url())
      if (pathname.endsWith('/auth/v1/otp') || pathname.endsWith('/auth/v1/verify')) {
        authentications.push(pathname)
      }
      if (pathname.includes('/functions/v1/generate-')) generations.push(pathname)
    })

    await visit(routeOf('Home'))
    await expectScreen(page, 'Home', 'Today')
    expect(await storedUserId(page), 'Home is not the journey’s athlete').toBe(
      authenticatedSession.userId,
    )

    await visit(routeOf('Generate'))
    await expectScreen(page, 'Generate', 'Generate workout')
    expect(await storedUserId(page), 'Generate is not the journey’s athlete').toBe(
      authenticatedSession.userId,
    )
    await page.waitForLoadState('networkidle')

    expect(authentications, 'consuming the fixture authenticated again').toEqual([])
    expect(generations, 'consuming the fixture made a generation request').toEqual([])
    // The fixture is the same one the first test read: no second journey ran.
    expect(authenticatedSession.journey.verificationRequests).toBe(1)
    expect(authenticatedSession.journey.codeRequests).toBe(1)
  })
})
