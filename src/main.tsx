import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

// Design system CSS — order matters: foundation → motion → app skin → other
// skins → app accessibility mechanisms (last so CORE-05 rules win)
import './design-system/css/foundation.css'
import './design-system/css/motion.css'
import './styles/skin-clear.css'
import './design-system/css/skins.css'
import './styles/a11y.css'

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
