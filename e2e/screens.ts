/**
 * CORE-05 — every screen the app routes to, in one list.
 *
 * "axe-core runs against every screen the suite visits" is only worth as much
 * as the set of screens the suite visits, so the set is stated here once and
 * every spec that walks screens reads it. `src/test/e2e-harness.test.ts`
 * compares it against the route table in `src/app/router.tsx`: a screen added
 * to the app and not to this list fails the unit suite, which is what stops
 * "every screen" from quietly meaning "the two we remembered".
 */

export interface E2eScreen {
  /** The URL the suite navigates to. */
  readonly path: string
  /** The route pattern in `src/app/router.tsx` this covers. */
  readonly route: string
  /** The full document title, including the app name. */
  readonly title: string
  /** The `<h1>`'s accessible name — the wordmark screens read 'CLEAR'. */
  readonly heading: string
}

export const SCREENS: readonly E2eScreen[] = [
  // The root route is protected. With the credential-free preview fixture it
  // must resolve through the public-only guard to Welcome, not pretend the
  // authenticated app shell is visible.
  { path: '/', route: '/', title: 'Welcome · CLEAR', heading: 'CLEAR' },
  { path: '/welcome', route: '/welcome', title: 'Welcome · CLEAR', heading: 'CLEAR' },
  { path: '/login', route: '/login', title: 'Sign in · CLEAR', heading: 'Sign in' },
  // A screen, not a gap: the catch-all route renders one, and a 404 that is
  // inaccessible is still inaccessible.
  {
    path: '/does-not-exist',
    route: '*',
    title: 'Page not found · CLEAR',
    heading: 'Page not found',
  },
]
