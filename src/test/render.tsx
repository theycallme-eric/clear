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
import type { AuthClient } from '../data/auth'
import type { OtpClient } from '../data/otp'
import { AuthProvider } from '../state/auth-provider'
import { SignInClientsContext } from '../state/sign-in-context'
import { ToastHost } from '../ui/toast-host'
import { createFakeAuthClient, createFakeOtpClient } from './auth-double'

export interface ProviderOptions {
  /** AUTH-01's session client. Defaults to a settled, anonymous double. */
  auth?: AuthClient
  /** AUTH-02's one-time-code client. Defaults to a double that refuses codes. */
  otp?: OtpClient
}

/**
 * Exported for the few tests that build their own router and still need the
 * app's providers around it.
 */
export function AppProviders({
  children,
  auth,
  otp,
}: ProviderOptions & { children: ReactNode }) {
  const authClient = auth ?? createFakeAuthClient()
  const otpClient = otp ?? createFakeOtpClient()

  return (
    <StrictMode>
      {/* Same CORE-04 boundary main.tsx mounts, so tests see real crash behavior */}
      <ErrorBoundary>
        {/* Same AUTH-01 provider main.tsx mounts, over an injected client */}
        <AuthProvider client={authClient}>
          <SignInClientsContext value={{ auth: authClient, otp: otpClient }}>
            {children}
          </SignInClientsContext>
        </AuthProvider>
        {/* Same DS-05 root host main.tsx mounts, on the same root queue */}
        <ToastHost />
      </ErrorBoundary>
    </StrictMode>
  )
}

/**
 * Mounts a component inside the app's providers plus a memory router, so
 * anything using router hooks or <Link> renders as it does in the app.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...providers }: { route?: string } & ProviderOptions = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <AppProviders {...providers}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </AppProviders>
    ),
  })
}

/**
 * Mounts the real route tree at the given history entries — the full-app
 * variant for screen and navigation tests.
 */
export function renderApp(
  initialEntries: string[] = ['/'],
  providers: ProviderOptions = {},
): RenderResult {
  return render(
    <AppProviders {...providers}>
      <RouterProvider router={createTestRouter(initialEntries)} />
    </AppProviders>,
  )
}
