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
import { SignInClientsContext } from './state/sign-in-context'
import { ToastHost } from './ui/toast-host'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('CLEAR root element was not found')
}

// AUTH-01's session client and AUTH-02's OTP client, built once from the
// environment. The sign-in screen must hand its verified session to the same
// client the provider subscribed to, so both come from one place.
const { auth, otp } = appAuthClients()

createRoot(rootElement).render(
  <StrictMode>
    {/* CORE-04: a render crash anywhere below shows a recoverable screen */}
    <ErrorBoundary>
      {/* AUTH-01: the session, above the router so every screen can read it */}
      <AuthProvider client={auth}>
        <SignInClientsContext value={{ auth, otp }}>
          <RouterProvider router={appRouter} />
        </SignInClientsContext>
      </AuthProvider>
      {/* DS-05: the one toast host — every screen's toasts queue through it */}
      <ToastHost />
    </ErrorBoundary>
  </StrictMode>,
)

// PWA-01: after the render call, never before it — the shell installs behind
// the first paint, and a browser that refuses a worker changes nothing here.
registerServiceWorker()
