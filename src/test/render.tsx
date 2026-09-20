/**
 * The one place tests mount the app's providers. When a new app-level
 * provider lands (Supabase client, query cache, …), add it to AppProviders
 * and every test picks it up — no test wires providers by hand.
 */
import { render, type RenderResult } from '@testing-library/react'
import { StrictMode, type ReactElement, type ReactNode } from 'react'
import { MemoryRouter, RouterProvider } from 'react-router-dom'

import { ErrorBoundary } from '../app/ErrorBoundary'
import { createTestRouter } from '../app/router'

function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      {/* Same CORE-04 boundary main.tsx mounts, so tests see real crash behavior */}
      <ErrorBoundary>{children}</ErrorBoundary>
    </StrictMode>
  )
}

/**
 * Mounts a component inside the app's providers plus a memory router, so
 * anything using router hooks or <Link> renders as it does in the app.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/' }: { route?: string } = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <AppProviders>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </AppProviders>
    ),
  })
}

/**
 * Mounts the real route tree at the given history entries — the full-app
 * variant for screen and navigation tests.
 */
export function renderApp(initialEntries: string[] = ['/']): RenderResult {
  return render(
    <AppProviders>
      <RouterProvider router={createTestRouter(initialEntries)} />
    </AppProviders>,
  )
}
