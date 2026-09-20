import {
  createBrowserRouter,
  createMemoryRouter,
  type RouteObject,
} from 'react-router-dom'

import { AppChrome } from './AppChrome'
import { AppShell } from './AppShell'
import { NotFound } from './NotFound'

export const routes: RouteObject[] = [
  {
    element: <AppChrome />,
    children: [
      { path: '/', element: <AppShell /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const appRouter = createBrowserRouter(routes)

export function createTestRouter(initialEntries: string[]) {
  return createMemoryRouter(routes, { initialEntries })
}
