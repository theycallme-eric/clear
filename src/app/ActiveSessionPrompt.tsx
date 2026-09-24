/**
 * EXE-01 — the other half of the focus mode, and the half a deep link needs.
 *
 * `/workout` blocks in-app navigation *out*. It cannot do anything about
 * arriving somewhere else with a session already running: a bookmark, a
 * notification, a restored tab, or a second tab opened on Home while the first
 * one is mid-workout. The requirement's instruction for that case is explicit —
 * prompt to resume or abandon rather than silently stranding the session — so
 * this sits in `AppChrome`, above every route, and asks.
 *
 * Four deliberate choices:
 *
 *   · **It asks about `active` sessions only.** A `prescribed` session has not
 *     been started; it belongs to Review, and interrupting a user to ask about
 *     a workout they have not begun would be the prompt crying wolf.
 *   · **A failed read prompts nobody.** `resume_session` answering an error is
 *     an unanswered question, and offering to abandon a session the app could
 *     not confirm exists is how a session gets destroyed by a flaky network.
 *     Only a `ready` answer that *is* a running session opens this dialog.
 *   · **There is no dismissal.** Both actions resolve the session's ambiguity;
 *     a third that closed the dialog and left it running would recreate exactly
 *     the stranded state the requirement is about. Escape lands on Resume,
 *     the safe choice, which is also the first action in DOM order.
 *   · **Abandoning is confirmed, here as everywhere.** This dialog arrives
 *     unbidden, so its destructive answer is one reflex away from a workout
 *     nobody meant to end. Answering it opens `AbandonConfirmDialog` — the
 *     shell's question, in the shell's words — and the prompt steps aside
 *     while it stands, so there is one modal on screen and one decision in it.
 *
 * Where it does *not* ask is as much of the rule as where it does: a route
 * that surfaces the running session itself has already asked, in the page,
 * without blocking anything. `/workout` is the shell, and `/` is Home's
 * `ResumableSession` card — the requirement's own instruction that leaving the
 * app "surfaces resumption on Home".
 */
import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Button } from '../design-system/index'
import { isErr } from '../state/errors'
import { showErrorToast } from '../state/toasts'
import { isActiveSession, useActiveSessionQuery, useWorkoutClients } from '../state/workout-queries'
import { AppDialog } from '../ui/app-dialog'
import { AbandonConfirmDialog } from '../ui/workout-chrome'
import { clearWorkoutShellState, defaultShellStorage } from '../state/workout-persistence'
import { AUTHENTICATED_HOME } from './guards'

/** The route the prompt exists to send people back to. */
export const WORKOUT_ROUTE = '/workout'

/**
 * The routes that show the running session in the page, and therefore need no
 * modal to say it exists: the shell itself, and Home's resumption card.
 */
const ROUTES_THAT_SURFACE_THE_SESSION: readonly string[] = [
  WORKOUT_ROUTE,
  AUTHENTICATED_HOME,
]

export function ActiveSessionPrompt() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { sessions } = useWorkoutClients()
  const query = useActiveSessionQuery()
  const [abandoning, setAbandoning] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const snapshot = query.state.status === 'ready' ? query.state.data : null
  // Somewhere the session is not already on the screen, a running session is a
  // question that has to be answered before anything else.
  const open =
    !ROUTES_THAT_SURFACE_THE_SESSION.includes(pathname) && isActiveSession(snapshot)

  const resume = useCallback(() => {
    void navigate(WORKOUT_ROUTE)
  }, [navigate])

  const abandon = useCallback(async () => {
    if (snapshot === null) return

    setAbandoning(true)
    const result = await sessions.abandon(snapshot.session.id)
    setAbandoning(false)
    setConfirming(false)

    if (isErr(result)) {
      // Nothing is discarded and the prompt stays: the session is still
      // running, and saying otherwise would be the silent stranding again.
      showErrorToast(result.error)
      return
    }

    clearWorkoutShellState(defaultShellStorage())
    query.publish(null)
  }, [query, sessions, snapshot])

  if (!open || snapshot === null) return null

  return (
    <>
      <AppDialog
        open={!confirming}
        title="You have a workout in progress"
        onClose={resume}
        actions={
          <>
            <Button variant="primary" onClick={resume}>
              Resume workout
            </Button>
            <Button variant="critical" loading={abandoning} onClick={() => setConfirming(true)}>
              Abandon it
            </Button>
          </>
        }
      >
        {snapshot.session.title} is still running. Resume it, or abandon it and keep
        what was logged.
      </AppDialog>

      <AbandonConfirmDialog
        open={confirming}
        onConfirm={() => void abandon()}
        // Back to the question, not out of it: declining the abandon leaves the
        // session running, which is still something the user has to answer.
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
