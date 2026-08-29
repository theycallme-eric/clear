import {
  createBrowserRouter,
  createMemoryRouter,
  type RouteObject,
} from 'react-router-dom'

import { AppShell } from './AppShell'
import { NotFound } from './NotFound'

export const routes: RouteObject[] = [
  { path: '/', element: <AppShell /> },
  { path: '*', element: <NotFound /> },
]

export const appRouter = createBrowserRouter(routes)

export function createTestRouter(initialEntries: string[]) {
  return createMemoryRouter(routes, { initialEntries })
}
