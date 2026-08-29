import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

// Design system CSS — order matters: foundation → motion → app skin → other skins
import './design-system/css/foundation.css'
import './design-system/css/motion.css'
import './styles/skin-clear.css'
import './design-system/css/skins.css'

// Skin persistence — the inline script in index.html set data-skin before first paint;
// this sets up the media query listener for prefers-contrast changes.
import { initSkin } from './design-system/skin'
initSkin()

import { appRouter } from './app/router'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('CLEAR root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={appRouter} />
  </StrictMode>,
)
