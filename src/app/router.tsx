import { lazy, Suspense } from 'react'
import {
  createBrowserRouter,
  createMemoryRouter,
  type RouteObject,
} from 'react-router-dom'

import { AppChrome } from './AppChrome'
import { Generate } from './Generate'
import { Protected, PublicOnly } from './guards'
import { Home } from './Home'
import { Login } from './Login'
import { LocationSettings } from './LocationSettings'
import { NotFound } from './NotFound'
import { RootLayout } from './RootLayout'
import { Settings } from './Settings'
import { Summary } from './Summary'
import { Welcome } from './Welcome'
import { Workout } from './Workout'

/**
 * DS-07's gallery, in development only.
 *
 * `import.meta.env.DEV` is a compile-time constant: in a build it is `false`,
 * the conditional folds to an empty list, and the `import()` inside the dead
 * branch goes with it — so no chunk, no stylesheet and no specimen text is ever
 * emitted for `/dev/gallery`. That is what makes "excluded from production
 * bundles" a property of the build rather than a promise, and
 * `src/dev/prod-exclusion.test.ts` proves it against real build output.
 *
 * The gallery declares its own sections below `dev/gallery/*`, so the app router
 * knows one path rather than four.
 */
const DevGallery = import.meta.env.DEV
  ? lazy(async () => ({
      default: (await import('../dev/GalleryRoute')).GalleryRoute,
    }))
  : null

const devRoutes: RouteObject[] = DevGallery
  ? [
      {
        path: 'dev/gallery/*',
        // A `React.lazy` element rather than a route-level `lazy`: the route
        // tree stays synchronous, so a gallery URL gets its atmosphere and its
        // shell on the first paint and only the gallery's own contents wait for
        // their chunk.
        element: (
          <Suspense fallback={null}>
            <DevGallery />
          </Suspense>
        ),
      },
    ]
  : []

// A pathless layout route, so DS-06's atmosphere mounts once above every screen.
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      {
        element: <AppChrome />,
        children: [
          // AUTH-03 — the guard is the route's, not the screen's. IA.md §1
          // calls that out explicitly: whether a visitor may see a screen is a
          // property of the route they asked for, so a screen cannot forget to
          // ask, and a reader can see the whole guard map in one place.
          //
          // `/onboarding` is absent on purpose. ONB-01 (M2) owns it, and until
          // it exists `Protected` renders `AccountSetupPending` rather than
          // redirecting anyone to a path that answers Not Found.
          {
            path: '/',
            element: (
              <Protected title="CLEAR">
                <Home />
              </Protected>
            ),
          },
          // EXE-01 — `protected + active session` (IA.md §1). Auth is the
          // guard's; whether there is a session to render is a fact about the
          // rows, and `Workout` redirects Home when there is not.
          {
            path: '/workout',
            element: (
              <Protected title="Workout">
                <Workout />
              </Protected>
            ),
          },
          // GEN-04 — `protected` (IA.md §1). What the screen needs before it
          // can be filled in is a place to train, which is a fact about the
          // rows rather than the route, so the screen asks for it and offers
          // the way to add one when there is none.
          {
            path: '/generate',
            element: (
              <Protected title="Generate workout">
                <Generate />
              </Protected>
            ),
          },
          {
            path: '/welcome',
            element: (
              <PublicOnly title="Welcome">
                <Welcome />
              </PublicOnly>
            ),
          },
          // SUM-01 — `protected` is the whole of the route's guard. "A
          // completed session" is not a question a route can answer: it is a
          // fact about the data, so the screen asks for it and redirects Home
          // when there is none (IA.md §1, state-dependent guards).
          {
            path: '/summary',
            element: (
              <Protected title="Summary">
                <Summary />
              </Protected>
            ),
          },
          {
            path: '/login',
            element: (
              <PublicOnly title="Sign in">
                <Login />
              </PublicOnly>
            ),
          },
          // SET-01 — `protected` (IA.md §1). The hub answers every question
          // onboarding asked; its four sub-views are SET-02's, and none of
          // them is routed until the screen behind it exists.
          {
            path: '/settings',
            element: (
              <Protected title="Settings">
                <Settings />
              </Protected>
            ),
          },
          {
            path: '/settings/locations',
            element: (
              <Protected title="Places and equipment">
                <LocationSettings />
              </Protected>
            ),
          },
          ...devRoutes,
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]

export const appRouter = createBrowserRouter(routes)

export function createTestRouter(initialEntries: string[]) {
  return createMemoryRouter(routes, { initialEntries })
}
