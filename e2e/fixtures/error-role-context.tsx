/**
 * Local browser proof only (TASK-001): the actual account-load error owners
 * with existing synthetic clients. Served by the spec's own Vite server; never
 * built or shipped, and no account, database or generation traffic.
 *
 * - `profile` / `places`: the real Generate screen, with the signed-in and
 *   onboarded guard precondition held by mounting it under RootLayout without
 *   the guard. The first read of that query fails; Retry's read succeeds.
 * - `guard`: the real protected `/generate` route, whose guard owns its own
 *   account error. That is the guard's state, not Generate's.
 */
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

import { Generate } from '../../src/app/Generate'
import { RootLayout } from '../../src/app/RootLayout'
import { createTestRouter } from '../../src/app/router'
import { createError, ErrorCode, err, ok } from '../../src/state/errors'
import { AppProviders, signedIn } from '../../src/test/render'
import { createFakeUserDataClient, onboardedProfile } from '../../src/test/user-data-double'
import { QueryClient } from '../../src/state/query'

const params = new URLSearchParams(window.location.search)
document.documentElement.dataset.skin = params.get('skin') ?? 'clear'
const mode = params.get('mode') ?? 'profile'
const error = createError(ErrorCode.NETWORK_OFFLINE, { requestId: 'req_fixture_e1r2' })
const fixture = window as Window & { __profileReads?: number; __placeReads?: number }
fixture.__profileReads = 0
fixture.__placeReads = 0

const userData = createFakeUserDataClient({
  profile: async () => {
    const reads = (fixture.__profileReads = (fixture.__profileReads ?? 0) + 1)
    return mode === 'guard' || (mode === 'profile' && reads === 1) ? err(error) : ok(onboardedProfile())
  },
  locations: async () => {
    const reads = (fixture.__placeReads = (fixture.__placeReads ?? 0) + 1)
    return mode === 'places' && reads === 1 ? err(error) : ok([])
  },
})

const router = mode === 'guard'
  ? createTestRouter(['/generate'])
  : createMemoryRouter(
      // `/` is only a landing marker for the Home back control, not Home itself.
      [{ element: <RootLayout />, children: [{ path: '/generate', element: <Generate /> }, { path: '/', element: <p>Fixture: / reached</p> }] }],
      { initialEntries: ['/generate'] },
    )

createRoot(document.getElementById('root')!).render(
  <AppProviders {...signedIn({ userData, queryClient: new QueryClient() })}>
    <RouterProvider router={router} />
  </AppProviders>,
)
