import { REQUIRED_SCREENS, type RequiredScreen } from './required-routes'

/**
 * CORE-05 + REQ-010 — every screen the suite visits, derived from the required
 * inventory.
 *
 * "axe-core runs against every screen the suite visits" is only worth as much
 * as the set of screens the suite visits. That set used to be read off the
 * router, so a screen missing from the router was missing from here too and
 * nothing noticed. It is now derived from `required-routes.ts`, which states
 * what IA.md §4 requires independently of what is built: a screen can only
 * leave this list by leaving the requirement, and a required route the router
 * stops serving fails `src/test/required-routes.test.ts`.
 *
 * What each entry expects is what the credential-free preview shows a
 * signed-out visitor there — which is itself the behaviour worth scanning.
 * Protected and onboarding routes resolve through their guard to Welcome;
 * their signed-in states are covered by each screen's own unit tests and by
 * REQ-010's journey specs, which hold a minted session.
 */

export interface E2eScreen {
  /** The IA.md §4 screen this visit covers. */
  readonly screen: string
  /** The URL the suite navigates to. */
  readonly path: string
  /** The required route pattern this covers. */
  readonly route: string
  /** The full document title, including the app name. */
  readonly title: string
  /** The `<h1>`'s accessible name — the wordmark screens read 'CLEAR'. */
  readonly heading: string
}

const WELCOME = { title: 'Welcome · CLEAR', heading: 'CLEAR' }
const NOT_FOUND = { title: 'Page not found · CLEAR', heading: 'Page not found' }

/** The two screens a signed-out visitor is allowed to see as themselves. */
const PUBLIC_SCREENS: Readonly<Record<string, { title: string; heading: string }>> = {
  Welcome: WELCOME,
  'OTP Login': { title: 'Sign in · CLEAR', heading: 'Sign in' },
}

function signedOutView(entry: RequiredScreen): { title: string; heading: string } {
  // Not mounted yet, so the catch-all answers — and is scanned as it does.
  if (entry.pendingOwner !== undefined) return NOT_FOUND

  switch (entry.guard) {
    case 'public-only': {
      const view = PUBLIC_SCREENS[entry.screen]
      if (view === undefined) {
        throw new Error(`No signed-out view is recorded for "${entry.screen}"`)
      }
      return view
    }
    case 'protected':
    case 'onboarding':
      return WELCOME
    case 'none':
    case 'dev-only':
      return NOT_FOUND
  }
}

export const SCREENS: readonly E2eScreen[] = REQUIRED_SCREENS.flatMap((entry) => {
  // The transient Loading screen has no URL; it is reached inside the screens
  // named by `renderedWithin`, which are visited here on their own routes.
  // The gallery is development-only and a preview build does not contain it.
  if (entry.route === null || entry.path === null || entry.guard === 'dev-only') {
    return []
  }

  const view = signedOutView(entry)
  const route = entry.route

  return [entry.path, ...(entry.subPaths ?? [])].map((path) => ({
    screen: entry.screen,
    path,
    route,
    ...view,
  }))
})
