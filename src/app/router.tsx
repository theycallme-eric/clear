import {
  createBrowserRouter,
  createMemoryRouter,
  type RouteObject,
} from 'react-router-dom'

import { AppChrome } from './AppChrome'
import { AppShell } from './AppShell'
import { NotFound } from './NotFound'
import { RootLayout } from './RootLayout'

// A pathless layout route, so DS-06's atmosphere mounts once above every screen.
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      {
        element: <AppChrome />,
        children: [
          { path: '/', element: <AppShell /> },
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
