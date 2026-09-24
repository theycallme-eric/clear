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
 * Three deliberate choices:
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
 */
import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Button } from '../design-system/index'
import { isErr } from '../state/errors'
import { showErrorToast } from '../state/toasts'
import { isActiveSession, useActiveSessionQuery, useWorkoutClients } from '../state/workout-queries'
import { AppDialog } from '../ui/app-dialog'
import { clearWorkoutShellState, defaultShellStorage } from '../state/workout-persistence'

/** The route the prompt exists to send people back to. */
export const WORKOUT_ROUTE = '/workout'

export function ActiveSessionPrompt() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { sessions } = useWorkoutClients()
  const query = useActiveSessionQuery()
  const [abandoning, setAbandoning] = useState(false)

  const snapshot = query.state.status === 'ready' ? query.state.data : null
  // On `/workout` the shell is already showing it; anywhere else a running
  // session is a question that has to be answered before anything else.
  const open = pathname !== WORKOUT_ROUTE && isActiveSession(snapshot)

  const resume = useCallback(() => {
    void navigate(WORKOUT_ROUTE)
  }, [navigate])

  const abandon = useCallback(async () => {
    if (snapshot === null) return

    setAbandoning(true)
    const result = await sessions.abandon(snapshot.session.id)
    setAbandoning(false)

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
    <AppDialog
      open
      title="You have a workout in progress"
      onClose={resume}
      actions={
        <>
          <Button variant="primary" onClick={resume}>
            Resume workout
          </Button>
          <Button variant="critical" loading={abandoning} onClick={() => void abandon()}>
            Abandon it
          </Button>
        </>
      }
    >
      {snapshot.session.title} is still running. Resume it, or abandon it and keep
      what was logged.
    </AppDialog>
  )
}
