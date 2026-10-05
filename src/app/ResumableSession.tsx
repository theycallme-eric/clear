/**
 * EXE-01 on Home — the resumable session, surfaced where the user lands.
 *
 * The focus shell makes leaving `/workout` in-app impossible without ending
 * the session first. It can do nothing about the user leaving the *app*, and
 * the requirement is explicit that this is allowed: closing the tab or
 * backgrounding the phone persists what there is to persist, and resumption
 * surfaces on Home. This is that surface.
 *
 * It is deliberately not a modal. A session that is named, timed and offering
 * both answers in the page is not stranded, and a standing card says the true
 * thing a dialog cannot — that the workout is waiting rather than that the app
 * is stuck. `ActiveSessionPrompt` is the modal half, and it stands down here
 * for exactly that reason: Home already asks the question.
 *
 * Three behaviours are the requirement rather than the design:
 *
 *   · **Abandoning is confirmed.** `AbandonConfirmDialog` is the same question
 *     the shell asks, in the same words, and nothing is ended before it is
 *     answered.
 *   · **A failed read offers nothing to abandon.** The error state says the
 *     check failed and offers to try again. Offering to end a session the app
 *     could not confirm exists is how one gets destroyed by a flaky network.
 *   · **A `prescribed` session is not resumable.** It has not been started;
 *     it belongs to Review, and resuming it here would drop the user into a
 *     workout they never agreed to be in.
 *
 * The ordinary Train Today fallback remains usable while the read is in flight
 * and when it answers empty. A failed read adds a retry without removing those
 * actions; a confirmed active session replaces them with the resume card.
 */
import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'

import { Button, LogOut, Progress, Pulse } from '../design-system/index'
import { isErr } from '../state/errors'
import type { SessionSnapshot } from '../state/schemas'
import { showErrorToast } from '../state/toasts'
import { useElapsedSeconds } from '../state/workout-clock'
import { clearWorkoutShellState, defaultShellStorage } from '../state/workout-persistence'
import { sessionProgress, startingSectionIndex } from '../state/workout-progress'
import {
  isActiveSession,
  useActiveSessionQuery,
  useWorkoutClients,
} from '../state/workout-queries'
import { Card } from '../ui/card'
import { ErrorView } from '../ui/view-state'
import { AbandonConfirmDialog, GlobalTimer } from '../ui/workout-chrome'

/** The slot's name: the same group the ordinary actions head, once answered. */
const RESUMABLE_HEADING = 'Train today'

export function ResumableSession({
  fallback = null,
  query,
}: {
  fallback?: ReactNode
  query: ReturnType<typeof useActiveSessionQuery>
}) {
  if (query.state.status === 'error') {
    return (
      <section className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        {fallback}
        <ErrorView
          error={query.state.error}
          title="Couldn’t check for a workout in progress"
          onRetry={query.refetch}
        />
      </section>
    )
  }

  const snapshot =
    query.state.status === 'ready' &&
    query.state.data !== null &&
    isActiveSession(query.state.data)
      ? query.state.data
      : null

  return (
    // A plain section, not a `HeadingSection`: the card's title is one of
    // Home's own regions rather than something nested inside one, so it heads
    // at the level `Screen` hands its children (CORE-05).
    <section className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
      {snapshot === null ? fallback : (
        <ResumableCard
          key={snapshot.session.id}
          snapshot={snapshot}
          onSessionEnded={() => query.publish(null)}
        />
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The card
// ─────────────────────────────────────────────────────────────────────────────

function ResumableCard({
  snapshot,
  onSessionEnded,
}: {
  snapshot: SessionSnapshot
  /** Publishes the end, so nothing else on the app agrees a session is running. */
  onSessionEnded: () => void
}) {
  const { sessions } = useWorkoutClients()

  // The same wall-clock reading the shell shows: a tab closed for an hour comes
  // back with the hour in it, because nothing here counts its own ticks.
  const seconds = useElapsedSeconds(snapshot.session.started_at)
  const progress = sessionProgress(snapshot)
  const next = progress.sections[startingSectionIndex(progress)]

  const [confirming, setConfirming] = useState(false)
  const [abandoning, setAbandoning] = useState(false)

  const abandon = useCallback(async () => {
    setAbandoning(true)
    const result = await sessions.abandon(snapshot.session.id)
    setAbandoning(false)
    setConfirming(false)

    if (isErr(result)) {
      // Nothing is discarded on a failed abandon: the session is still running
      // and still the user's, and the card keeps saying so.
      showErrorToast(result.error)
      return
    }

    clearWorkoutShellState(defaultShellStorage())
    onSessionEnded()
  }, [onSessionEnded, sessions, snapshot.session.id])

  return (
    <>
      <Card heading={RESUMABLE_HEADING}>
        <div
          className="clr-stack--tight"
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <p style={labelStyle}>
            <Pulse size={16} /> In progress · {snapshot.session.title}
          </p>

          <GlobalTimer seconds={seconds} />

          <Progress
            value={progress.completed}
            max={progress.total}
            segments={progress.total}
            label={`${progress.completed} of ${progress.total} sections done`}
          />

          {next !== undefined && <p style={{ margin: 0 }}>Picks up at {next.title}.</p>}

          <div className="clr-row">
            {/* Quiet, and second: the destructive answer never sits beside the
                forward one as an equal. The critical framing belongs to the
                confirm, which is where the consequence is actually taken. */}
            <Button
              variant="quiet"
              icon={<LogOut />}
              loading={abandoning}
              onClick={() => setConfirming(true)}
            >
              Abandon
            </Button>
          </div>
        </div>
      </Card>

      <AbandonConfirmDialog
        open={confirming}
        onConfirm={() => void abandon()}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}

const labelStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-100)',
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
}
