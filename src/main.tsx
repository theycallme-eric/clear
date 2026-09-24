import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

// Design system CSS — order matters: foundation → motion → app skin → other
// skins → app motion → app accessibility mechanisms (last so CORE-05 rules win)
import './design-system/css/foundation.css'
import './design-system/css/motion.css'
import './styles/skin-clear.css'
import './design-system/css/skins.css'
import './styles/app-motion.css'
// DS-06 atmosphere override; must follow the design-system motion layer.
import './styles/atmosphere.css'
import './styles/a11y.css'

import { appAuthClients } from './app/auth-client'
import { ErrorBoundary } from './app/ErrorBoundary'
import { appRouter } from './app/router'
import { registerServiceWorker } from './app/service-worker'
import { AuthProvider } from './state/auth-provider'
import { QueryClient, QueryClientContext } from './state/query'
import { SignInClientsContext } from './state/sign-in-context'
import { SummaryContext } from './state/summary-queries'
import { UserDataContext } from './state/user-queries'
import { ToastHost } from './ui/toast-host'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('CLEAR root element was not found')
}

// AUTH-01's session client and AUTH-02's OTP client, built once from the
// environment. The sign-in screen must hand its verified session to the same
// client the provider subscribed to, so both come from one place.
const { auth, otp, userData, summary } = appAuthClients()

// AUTH-03: the one cache. It is handed to the provider as AUTH-01's `QueryCache`
// port, which is what makes `signOut` empty it — the next user never reads the
// last one's profile or locations.
const queryClient = new QueryClient()

createRoot(rootElement).render(
  <StrictMode>
    {/* CORE-04: a render crash anywhere below shows a recoverable screen */}
    <ErrorBoundary>
      {/* AUTH-01: the session, above the router so every screen can read it */}
      <AuthProvider client={auth} queryCache={queryClient}>
        <QueryClientContext value={queryClient}>
          <UserDataContext value={userData}>
            <SignInClientsContext value={{ auth, otp }}>
              {/* SUM-01: the debrief's reads and its one write */}
              <SummaryContext value={summary}>
                <RouterProvider router={appRouter} />
              </SummaryContext>
            </SignInClientsContext>
          </UserDataContext>
        </QueryClientContext>
      </AuthProvider>
      {/* DS-05: the one toast host — every screen's toasts queue through it */}
      <ToastHost />
    </ErrorBoundary>
  </StrictMode>,
)

// PWA-01: after the render call, never before it — the shell installs behind
// the first paint, and a browser that refuses a worker changes nothing here.
registerServiceWorker()
