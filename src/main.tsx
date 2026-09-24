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
import { BootGate } from './app/BootSequence'
import { ErrorBoundary } from './app/ErrorBoundary'
import { startFaviconSync } from './app/favicon'
import { appRouter } from './app/router'
import { registerServiceWorker } from './app/service-worker'
import { AuthProvider } from './state/auth-provider'
import { UserConstraintsContext } from './state/constraint-queries'
import { QueryClient, QueryClientContext } from './state/query'
import { SignInClientsContext } from './state/sign-in-context'
import { SummaryContext } from './state/summary-queries'
import { UserDataContext } from './state/user-queries'
import { WorkoutClientsContext } from './state/workout-queries'
import { ToastHost } from './ui/toast-host'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('CLEAR root element was not found')
}

// AUTH-01's session client and AUTH-02's OTP client, built once from the
// environment. The sign-in screen must hand its verified session to the same
// client the provider subscribed to, so both come from one place.
const { auth, otp, userData, summary, workout, constraints } = appAuthClients()

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
              {/* EXE-01: the session lifecycle and the block_results write */}
              <WorkoutClientsContext value={workout}>
                {/* SUM-01: the debrief's reads and its one write */}
                <SummaryContext value={summary}>
                  {/* DATA-05's read, which REQ-057's boot check is bound to */}
                  <UserConstraintsContext value={constraints}>
                    {/* REQ-057: the app's real init, shown while it happens and
                        handed off the moment it finishes — no gate, no delay */}
                    <BootGate>
                      <RouterProvider router={appRouter} />
                    </BootGate>
                  </UserConstraintsContext>
                </SummaryContext>
              </WorkoutClientsContext>
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

// SET-01: the tab icon follows `data-skin` from here on — the stored skin the
// head script already applied, and every later change, whether it came from the
// Settings picker or from `initSkin` tracking the OS contrast preference.
startFaviconSync()
