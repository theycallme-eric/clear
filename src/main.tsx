import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Load the immutable public CSS entry once, then retain the app-owned local
// font faces/fallbacks. Vite drops the exact vendor CDN import and scopes the
// app skin's CLEAR identity so alternate skins keep their public values.
// App motion and accessibility mechanisms follow so CORE-05 rules still win.
import './design-system/styles.css'
import './styles/skin-clear.css'
import './styles/app-motion.css'
// DS-06 atmosphere override; must follow the design-system motion layer.
import './styles/atmosphere.css'
import './styles/a11y.css'
import './styles/shell.css'
// REQ-006: the public Input unit end cap fits its unit text.
import './styles/fields.css'
// Shared app-owned text recipes, composed only from the pinned token layer.
import './styles/text-roles.css'

import { AppEntry } from './AppEntry'
import { ErrorBoundary } from './app/ErrorBoundary'
import { startFaviconSync } from './app/favicon'
import { registerServiceWorker } from './app/service-worker'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('CLEAR root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <AppEntry pathname={window.location.pathname} />
    </ErrorBoundary>
  </StrictMode>,
)

// PWA-01: after the render call, never before it — the shell installs behind
// the first paint, and a browser that refuses a worker changes nothing here.
registerServiceWorker()

// SET-01: the tab icon follows `data-skin` from here on — the stored skin the
// head script already applied, and every later change from the Settings picker.
startFaviconSync()
