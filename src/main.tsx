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

import { ErrorBoundary } from './app/ErrorBoundary'
import { appRouter } from './app/router'
import { ToastHost } from './ui/toast-host'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('CLEAR root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    {/* CORE-04: a render crash anywhere below shows a recoverable screen */}
    <ErrorBoundary>
      <RouterProvider router={appRouter} />
      {/* DS-05: the one toast host — every screen's toasts queue through it */}
      <ToastHost />
    </ErrorBoundary>
  </StrictMode>,
)
