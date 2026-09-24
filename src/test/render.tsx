/**
 * The one place tests mount the app's providers. When a new app-level
 * provider lands (Supabase client, query cache, …), add it to AppProviders
 * and every test picks it up — no test wires providers by hand.
 */
import { render, type RenderResult } from '@testing-library/react'
import { StrictMode, useMemo, type ReactElement, type ReactNode } from 'react'
import { MemoryRouter, RouterProvider } from 'react-router-dom'

import { ErrorBoundary } from '../app/ErrorBoundary'
import { createTestRouter } from '../app/router'
import type { AuthClient } from '../data/auth'
import type { OtpClient } from '../data/otp'
import type { UserDataClient } from '../data/user-data'
import { AuthProvider } from '../state/auth-provider'
import { QueryClient, QueryClientContext } from '../state/query'
import { SignInClientsContext } from '../state/sign-in-context'
import {
  locationsQueryKey,
  profileQueryKey,
  UserDataContext,
} from '../state/user-queries'
import { ToastHost } from '../ui/toast-host'
import { createFakeAuthClient, createFakeOtpClient, signedInEvent } from './auth-double'
import {
  createFakeUserDataClient,
  FIXTURE_USER_ID,
  fixtureLocation,
  onboardedProfile,
} from './user-data-double'

export interface ProviderOptions {
  /** AUTH-01's session client. Defaults to a settled, anonymous double. */
  auth?: AuthClient
  /** AUTH-02's one-time-code client. Defaults to a double that refuses codes. */
  otp?: OtpClient
  /** AUTH-03's profile and locations reads. Defaults to an onboarded user. */
  userData?: UserDataClient
  /** AUTH-03's cache. Defaults to one already warm for the fixture user. */
  queryClient?: QueryClient
}

/**
 * A cache that already holds the fixture user's profile and locations.
 *
 * Seeded rather than fetched, and the reason is about what a test is allowed to
 * assume: a query resolves in a microtask, so an unseeded cache makes *every*
 * protected screen start on its loading state, and every existing synchronous
 * assertion about a screen would have to become an `await`. Warming the cache
 * says the thing that is actually true of the default fixture — a returning,
 * onboarded user whose data is already in hand — and leaves the four states to
 * the tests that are about them, which supply their own client.
 */
export function createWarmQueryClient(): QueryClient {
  const client = new QueryClient()
  client.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile())
  client.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
  return client
}

/**
 * The providers for a signed-in, onboarded visitor — what a protected route
 * needs before it will render anything. Spread into `renderApp`'s options.
 */
export function signedIn(overrides: ProviderOptions = {}): ProviderOptions {
  return {
    auth: createFakeAuthClient({ settled: signedInEvent() }),
    ...overrides,
  }
}

/**
 * Exported for the few tests that build their own router and still need the
 * app's providers around it.
 */
export function AppProviders({
  children,
  auth,
  otp,
  userData,
  queryClient,
}: ProviderOptions & { children: ReactNode }) {
  // Memoised, not rebuilt per render: the cache *is* the query state, and a
  // fresh one on every render would reset every query the moment one resolved.
  const authClient = useMemo(() => auth ?? createFakeAuthClient(), [auth])
  const otpClient = useMemo(() => otp ?? createFakeOtpClient(), [otp])
  const userDataClient = useMemo(() => userData ?? createFakeUserDataClient(), [userData])
  const cache = useMemo(() => queryClient ?? createWarmQueryClient(), [queryClient])

  return (
    <StrictMode>
      {/* Same CORE-04 boundary main.tsx mounts, so tests see real crash behavior */}
      <ErrorBoundary>
        {/* Same AUTH-01 provider main.tsx mounts, over an injected client */}
        <AuthProvider client={authClient} queryCache={cache}>
          {/* Same AUTH-03 cache and reads main.tsx mounts */}
          <QueryClientContext value={cache}>
            <UserDataContext value={userDataClient}>
              <SignInClientsContext value={{ auth: authClient, otp: otpClient }}>
                {children}
              </SignInClientsContext>
            </UserDataContext>
          </QueryClientContext>
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
