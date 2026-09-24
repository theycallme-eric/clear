/**
 * Workout — `/workout` (EXE-01). The focus mode.
 *
 * IA.md §4: atmosphere `operational`, guard protected + active session, and
 * exactly two exits — completion and abandonment. This file is the shell that
 * enforces that, and it is worth being precise about what "focus mode" means
 * here, because the requirement is emphatic that it is not a trap on the user:
 *
 *   · **In-app navigation is blocked.** A router navigation away from
 *     `/workout` — a link, a redirect, or the browser's own Back — is
 *     intercepted by `useBlocker` and turned into the abandon confirm. Nothing
 *     leaves this route without the session ending first, so the session can
 *     never be stranded half-performed by a stray tap.
 *   · **Leaving the app is not.** No `beforeunload`, no "are you sure" on
 *     close, nothing that argues with the platform. Closing the tab or
 *     backgrounding the phone persists what there is to persist — the rows are
 *     already written, and `usePersistedSection` keeps the open section — and
 *     the session surfaces on Home for resumption (HOME-01).
 *   · **Another route with a session running asks rather than strands.**
 *     A deep link never reaches this file, so the answer lives above it:
 *     `ResumableSession` is Home's card, and `ActiveSessionPrompt` is the
 *     modal `AppChrome` mounts for everywhere else.
 *
 * The other thing the shell owns is **block completion**, and it owns it by
 * mounting `BlockCompletionProvider` around every renderer: one effort
 * question, one `block_results` write, for EMOM, AMRAP, For Time and the
 * ladders alike (EXE-01, read by OVR-03). The renderers (EXE-02…EXE-04c) reach
 * it through `useBlockCompletion` and supply only the fields their structure
 * observed; which renderer performs which structure is `BLOCK_RENDERERS`, and
 * none of them touches the write.
 *
 * The four states (CORE-04): loading is the session hydrating, error is a
 * lifecycle or persistence failure — shown as a blocking dialog, because a
 * workout that silently failed to record is the defect this screen exists to
 * prevent — populated is the shell, and empty is n/a: a session with no
 * sections is a validation failure, not an empty state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'

import { AppHeader, Button, ClearLogo, LogOut } from '../design-system/index'
import { BlockCompletionProvider } from '../state/block-completion-provider'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { useProfileQuery } from '../state/user-queries'
import type { AppError } from '../state/errors'
import { isErr } from '../state/errors'
import type { SessionSnapshot } from '../state/schemas'
import {
  clampSectionIndex,
  sessionProgress,
  startingSectionIndex,
  type SectionProgress,
} from '../state/workout-progress'
import { elapsedMinutes, useElapsedSeconds } from '../state/workout-clock'
import {
  defaultShellStorage,
  restoredSectionIndex,
  usePersistedSection,
  type ShellStorage,
} from '../state/workout-persistence'
import {
  isActiveSession,
  useActiveSessionQuery,
  useWorkoutClients,
} from '../state/workout-queries'
import { BlockSlot } from '../ui/block-renderers'
import { ErrorDialog } from '../ui/blocking-dialog'
import { SetSyncNotice } from '../ui/set-sync-notice'
import { ErrorView, LoadingView } from '../ui/view-state'
import {
  AbandonConfirmDialog,
  GlobalTimer,
  ProgressTracker,
  SectionHeader,
  WorkoutNavigation,
} from '../ui/workout-chrome'
import { AUTHENTICATED_HOME } from './guards'
import { Screen } from './Screen'

/**
 * Where completion lands. SUM-01 owns `/summary` and it is not routed yet, so
 * a finished workout goes Home rather than to a path that answers Not Found —
 * the same posture `guards.tsx` takes for `/onboarding`. This constant is the
 * one line SUM-01 changes.
 */
export const COMPLETION_ROUTE = AUTHENTICATED_HOME

/** Where abandoning lands: Home, where the session's remains are resumable. */
export const ABANDON_ROUTE = AUTHENTICATED_HOME

const SCREEN_TITLE = 'Workout'

// ─────────────────────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The state-dependent half of this route's guard (IA.md §1). Auth is the
 * route's `Protected`; whether there is a session to render is a fact about
 * the rows, and landing here without one redirects Home rather than rendering
 * an empty shell.
 */
export function Workout({ storage }: { storage?: ShellStorage | null }) {
  const query = useActiveSessionQuery()
  const navigate = useNavigate()

  const snapshot = query.state.status === 'ready' ? query.state.data : null
  const active = isActiveSession(snapshot)

  // A redirect is an effect, not a render: `<Navigate>` here would compete
  // with the blocker below, which is mounted by the shell one render later.
  useEffect(() => {
    if (query.state.status === 'ready' && !active) {
      void navigate(AUTHENTICATED_HOME, { replace: true })
    }
  }, [active, navigate, query.state.status])

  switch (query.state.status) {
    case 'loading':
      return (
        <Screen title={SCREEN_TITLE}>
          <LoadingView label="Loading session" />
        </Screen>
      )
    case 'error':
      return (
        <Screen title={SCREEN_TITLE}>
          <ErrorView
            error={query.state.error}
            title="Your session didn’t load"
            actionLabel="Try again"
            onRetry={query.refetch}
          />
        </Screen>
      )
    case 'ready':
      if (snapshot === null || !active) {
        // The redirect above is in flight. Rendering the shell for one frame
        // would start a timer for a session that is not running.
        return (
          <Screen title={SCREEN_TITLE}>
            <LoadingView label="Returning home" />
          </Screen>
        )
      }
      return (
        <WorkoutShell
          key={snapshot.session.id}
          snapshot={snapshot}
          onSessionEnded={query.publish}
          storage={storage}
        />
      )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────────

interface WorkoutShellProps {
  snapshot: SessionSnapshot
  /** Publishes the session's end so every other screen agrees immediately. */
  onSessionEnded: (snapshot: SessionSnapshot | null) => void
  storage?: ShellStorage | null
}

function WorkoutShell({ snapshot, onSessionEnded, storage }: WorkoutShellProps) {
  const { sessions } = useWorkoutClients()
  const navigate = useNavigate()

  const progress = useMemo(() => sessionProgress(snapshot), [snapshot])
  const sessionId = snapshot.session.id

  // Where to start: the section the shell had open when the tab was closed,
  // and otherwise the first one the rows say is unfinished. The restored value
  // is read once — it is where the user *was*, not a second source of truth.
  const shellStorage = storage === undefined ? defaultShellStorage() : storage
  const [restored] = useState(() => restoredSectionIndex(shellStorage, sessionId))
  const section = usePersistedSection(
    sessionId,
    clampSectionIndex(restored ?? startingSectionIndex(progress), progress),
    shellStorage,
  )
  const index = clampSectionIndex(section.index, progress)
  const current: SectionProgress | undefined = progress.sections[index]

  const seconds = useElapsedSeconds(snapshot.session.started_at)

  const [askedToExit, setAskedToExit] = useState(false)
  const [failure, setFailure] = useState<AppError | null>(null)
  const [ending, setEnding] = useState(false)

  /** Every block in the session, which is what a completion names. */
  const blocks = useMemo(
    () => progress.sections.flatMap((entry) => entry.blocks),
    [progress.sections],
  )

  /**
   * Every active prescription in the session, which is what a logged set is
   * attributed to. Taken from the same derivation as the blocks, so a set can
   * only be written against an exercise the user is actually performing.
   */
  const exercises = useMemo(() => blocks.flatMap((block) => block.exercises), [blocks])

  // The unit every set this session writes is stamped with. `weight_unit` is
  // NOT NULL on the row and is the profile's *at write time*; with no profile
  // in hand there is nothing to stamp, and the provider refuses the set rather
  // than guessing between kilograms and pounds.
  const profile = useProfileQuery()
  const weightUnit =
    profile.state.status === 'ready' ? (profile.state.data?.weight_unit ?? null) : null

  // Set synchronously, because the blocker is consulted during the navigation
  // this handler starts — a state flag would still be false when it is read.
  const leaving = useRef(false)

  // The focus-mode trap. Browser Back arrives here as a POP the blocker sees
  // exactly like a link click, which is why the confirm is the same confirm.
  const blocker = useBlocker(
    useCallback(
      ({
        currentLocation,
        nextLocation,
      }: {
        currentLocation: { pathname: string }
        nextLocation: { pathname: string }
      }) => !leaving.current && currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  )

  /**
   * The confirm is open for two reasons and they are asked the same way: the
   * header's Abandon control, and a navigation the blocker is holding — a
   * link, a redirect, or browser Back. The second is derived rather than
   * copied into state by an effect, so a blocked navigation and the dialog it
   * raises can never disagree about whether there is a question outstanding.
   */
  const blocked = blocker.state === 'blocked'
  const exiting = blocked || askedToExit

  /** Leaves the route for real: the one place `leaving` is lifted. */
  const depart = useCallback(
    (to: string) => {
      leaving.current = true
      section.forget()
      if (blocker.state === 'blocked') {
        blocker.proceed()
        return
      }
      void navigate(to, { replace: true })
    },
    [blocker, navigate, section],
  )

  const cancelExit = useCallback(() => {
    setAskedToExit(false)
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  const confirmAbandon = useCallback(async () => {
    setEnding(true)
    const result = await sessions.abandon(sessionId)
    setEnding(false)

    if (isErr(result)) {
      // The session is still running and still the user's. Nothing is
      // discarded on a failed abandon, and the confirm stays available.
      setAskedToExit(false)
      if (blocker.state === 'blocked') blocker.reset()
      setFailure(result.error)
      return
    }

    // Abandoned is a state, not a delete: the structure, the logs and the
    // lineage remain, which is what HOME-01 resumption reads.
    onSessionEnded(null)
    setAskedToExit(false)
    depart(ABANDON_ROUTE)
  }, [blocker, depart, onSessionEnded, sessionId, sessions])

  const finish = useCallback(async () => {
    setEnding(true)
    // The elapsed time this screen measured, in whole minutes. The database
    // would measure it from `started_at` itself; the shell knows what the user
    // actually watched, so it says so.
    const result = await sessions.complete(sessionId, elapsedMinutes(seconds))
    setEnding(false)

    if (isErr(result)) {
      setFailure(result.error)
      return
    }

    onSessionEnded(null)
    depart(COMPLETION_ROUTE)
  }, [depart, onSessionEnded, seconds, sessionId, sessions])

  const canGoBack = index > 0
  const canGoForward = index < progress.total - 1

  return (
    // The one completion path, mounted around every renderer: the effort
    // question and the `block_results` write belong to it, for every structure
    // type, and to no renderer inside it.
    <BlockCompletionProvider blocks={blocks} onFailure={setFailure}>
      {/*
        The other write execution produces, on the same terms: one path, one
        row per set, written at log time, and the same error surface. A
        renderer reaches it through `useSetLogging` and never sees the client.
      */}
      <SetLoggingProvider
        sessionId={sessionId}
        exercises={exercises}
        weightUnit={weightUnit}
        onFailure={setFailure}
        storage={storage}
      >
        <AppHeader
          meta={<GlobalTimer seconds={seconds} />}
          actions={
            <Button
              variant="quiet"
              icon={<LogOut />}
              onClick={() => setAskedToExit(true)}
            >
              Abandon
            </Button>
          }
        >
          <ClearLogo size="sm" />
        </AppHeader>

        <Screen title={SCREEN_TITLE}>
          <div className="clr-stack">
            {/*
              EXE-07's one statement about unsynced work. It is here rather
              than in the error dialog because a queue that is retrying is not
              a failed action: it must not interrupt a set, and it must say the
              count once rather than once per set.
            */}
            <SetSyncNotice />

            <ProgressTracker
              progress={progress}
              currentIndex={index}
              onSelect={section.setIndex}
            />

            {current === undefined ? null : (
              <>
                <SectionHeader
                  section={current}
                  position={index + 1}
                  total={progress.total}
                />
                {current.blocks.map((block) => (
                  <BlockSlot key={block.blockId} block={block} />
                ))}
              </>
            )}

            <WorkoutNavigation
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onPrevious={() => section.setIndex(index - 1)}
              onNext={() => section.setIndex(index + 1)}
              onFinish={() => void finish()}
              busy={ending}
            />
          </div>
        </Screen>

        <AbandonConfirmDialog
          open={exiting}
          onConfirm={() => void confirmAbandon()}
          onCancel={cancelExit}
        />

        {failure !== null && (
          <ErrorDialog
            open
            error={failure}
            title="That didn’t save"
            onDismiss={() => setFailure(null)}
          />
        )}
      </SetLoggingProvider>
    </BlockCompletionProvider>
  )
}
