/** The authenticated product runtime. Loaded only outside /gallery. */
import { RouterProvider } from 'react-router-dom'

import { appAuthClients } from './auth-client'
import { BootGate } from './BootSequence'
import { appRouter } from './router'
import { AuthProvider } from '../state/auth-provider'
import { UserConstraintsContext } from '../state/constraint-queries'
import { GenerationClientContext } from '../state/generation'
import { QueryClient, QueryClientContext } from '../state/query'
import { RestDayContext } from '../state/rest-day-queries'
import { SignInClientsContext } from '../state/sign-in-context'
import { SummaryContext } from '../state/summary-queries'
import { UserDataContext } from '../state/user-queries'
import { WorkoutClientsContext } from '../state/workout-queries'
import { ToastHost } from '../ui/toast-host'

// AUTH-01's session client and AUTH-02's OTP client, built once from the
// environment. The sign-in screen must hand its verified session to the same
// client the provider subscribed to, so both come from one place.
const { auth, otp, userData, summary, restDays, workout, constraints, generation } = appAuthClients()

// AUTH-03: the one cache. It is handed to the provider as AUTH-01's `QueryCache`
// port, which is what makes `signOut` empty it — the next user never reads the
// last one's profile or locations.
const queryClient = new QueryClient()

export default function AppRuntime() {
  return (
    <>
      {/* AUTH-01: the session, above the router so every screen can read it */}
      <AuthProvider client={auth} queryCache={queryClient}>
        <QueryClientContext value={queryClient}>
          <UserDataContext value={userData}>
            <SignInClientsContext value={{ auth, otp }}>
              {/* EXE-01: the session lifecycle and the block_results write */}
              <WorkoutClientsContext value={workout}>
                {/* SUM-01: the debrief's reads and its one write */}
                <SummaryContext value={summary}>
                  {/* HOME-02: one source for the week strip and streak rules */}
                  <RestDayContext value={restDays}>
                    {/* DATA-05's read, which REQ-057's boot check is bound to */}
                    <UserConstraintsContext value={constraints}>
                      {/* GEN-03: the generation call used by Home and Generate */}
                      <GenerationClientContext value={generation}>
                        {/* REQ-057: the app's real init, shown while it happens and
                            handed off the moment it finishes — no gate, no delay */}
                        <BootGate>
                          <RouterProvider router={appRouter} />
                        </BootGate>
                      </GenerationClientContext>
                    </UserConstraintsContext>
                  </RestDayContext>
                </SummaryContext>
              </WorkoutClientsContext>
            </SignInClientsContext>
          </UserDataContext>
        </QueryClientContext>
      </AuthProvider>
      {/* DS-05: the one toast host — every screen's toasts queue through it */}
      <ToastHost />
    </>
  )
}
