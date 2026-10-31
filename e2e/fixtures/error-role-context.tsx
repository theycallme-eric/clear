/** Local browser proof only: real owners and existing synthetic clients. */
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import '../../src/design-system/styles.css'
import '../../src/styles/skin-clear.css'
import '../../src/styles/app-motion.css'
import '../../src/styles/atmosphere.css'
import '../../src/styles/a11y.css'
import '../../src/styles/shell.css'
import '../../src/styles/fields.css'
import '../../src/styles/text-roles.css'

import { createTestRouter } from '../../src/app/router'
import { Generate } from '../../src/app/Generate'
import { RootLayout } from '../../src/app/RootLayout'
import { EmptyState } from '../../src/design-system/index'
import { createError, ErrorCode, err, ok } from '../../src/state/errors'
import { AppProviders, createWarmQueryClient, signedIn } from '../../src/test/render'
import { createFakeUserDataClient, onboardedProfile } from '../../src/test/user-data-double'
import { AppDialog } from '../../src/ui/app-dialog'
import { Card } from '../../src/ui/card'
import { ErrorView } from '../../src/ui/view-state'

const params = new URLSearchParams(window.location.search)
document.documentElement.dataset.skin = params.get('skin') ?? 'clear'
const error = createError(ErrorCode.NETWORK_OFFLINE)
const failure = <ErrorView error={error} title="Account did not load" />
const mode = params.get('mode') ?? 'dialog'
const fixture = window as Window & { __pilotProfileReads?: number; __pilotPlaceReads?: number }

let content
if (mode === 'generate' || mode === 'places' || mode === 'guard') {
  const queryClient = createWarmQueryClient()
  queryClient.clear()
  fixture.__pilotProfileReads = 0
  fixture.__pilotPlaceReads = 0
  const userData = createFakeUserDataClient({
    profile: async () => {
      fixture.__pilotProfileReads = (fixture.__pilotProfileReads ?? 0) + 1
      return mode === 'places' ? ok(onboardedProfile()) : err(error)
    },
    locations: async () => {
      fixture.__pilotPlaceReads = (fixture.__pilotPlaceReads ?? 0) + 1
      return err(error)
    },
  })
  // Hold the signed-in/onboarded guard precondition to exercise Generate itself.
  // The separate guard mode verifies the real protected route's account error.
  const router = mode === 'guard'
    ? createTestRouter(['/generate'])
    : createMemoryRouter([{ element: <RootLayout />, children: [{ path: '/generate', element: <Generate /> }] }], { initialEntries: ['/generate'] })
  content = <AppProviders {...signedIn({ userData, queryClient })}><RouterProvider router={router} /></AppProviders>
} else if (mode === 'contained') {
  content = <Card role="interaction" heading="Host card">{failure}</Card>
} else if (mode === 'empty') {
  content = <EmptyState title="Nothing saved" message="Ordinary empty state control" />
} else {
  content = <AppDialog open title="Shared dialog context">{failure}</AppDialog>
}

createRoot(document.getElementById('root')!).render(content)
