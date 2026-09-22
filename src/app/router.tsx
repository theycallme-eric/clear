import { lazy, Suspense } from 'react'
import {
  createBrowserRouter,
  createMemoryRouter,
  type RouteObject,
} from 'react-router-dom'

import { AppChrome } from './AppChrome'
import { AppShell } from './AppShell'
import { Login } from './Login'
import { NotFound } from './NotFound'
import { RootLayout } from './RootLayout'
import { Welcome } from './Welcome'

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
          { path: '/', element: <AppShell /> },
          // AUTH-02's two public-only screens. Each carries its own guard for
          // now; AUTH-03 lifts that to the route tree.
          { path: '/welcome', element: <Welcome /> },
          { path: '/login', element: <Login /> },
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
