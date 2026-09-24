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
 *   · **Another route with a session running prompts rather than strands.**
 *     That is `ActiveSessionPrompt`, mounted in `AppChrome`, because a deep
 *     link never reaches this file.
 *
 * The other thing the shell owns is **block completion**. Every structure type
 * writes its `block_results` row through `completeBlock` here, and perceived
 * effort is captured once, by the one dialog, for all of them — so EMOM, AMRAP,
 * For Time and the ladders record it through a single path rather than each
 * renderer growing its own (EXE-01, read by OVR-03). The renderers
 * (EXE-02…EXE-04c) supply the structure-specific fields through
 * `BlockCompletionContext`; they never touch the write.
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
import {
  BlockCompletionContext,
  type BlockCompletionApi,
  type BlockOutcome,
} from '../state/block-completion'
import type { AppError } from '../state/errors'
import { isErr } from '../state/errors'
import type { SessionSnapshot } from '../state/schemas'
import {
  clampSectionIndex,
  sessionProgress,
  startingSectionIndex,
  type BlockProgress,
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
import { BlockEffortDialog } from '../ui/block-effort'
import { ConfirmDialog, ErrorDialog } from '../ui/blocking-dialog'
import { Card } from '../ui/card'
import { ErrorView, LoadingView } from '../ui/view-state'
import {
  GlobalTimer,
  ProgressTracker,
  SectionHeader,
  StructureBadge,
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

/** What the user is trying to do when the abandon confirm appears. */
type Exit =
  /** A blocked router navigation — a link, a redirect, or browser Back. */
  | { readonly kind: 'navigation' }
  /** The header's own Abandon control. */
  | { readonly kind: 'control' }

interface PendingBlock {
  readonly block: BlockProgress
  readonly outcome: BlockOutcome
}

interface WorkoutShellProps {
  snapshot: SessionSnapshot
  /** Publishes the session's end so every other screen agrees immediately. */
  onSessionEnded: (snapshot: SessionSnapshot | null) => void
  storage?: ShellStorage | null
}

function WorkoutShell({ snapshot, onSessionEnded, storage }: WorkoutShellProps) {
  const { sessions, blockResults } = useWorkoutClients()
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

  const [exit, setExit] = useState<Exit | null>(null)
  const [pending, setPending] = useState<PendingBlock | null>(null)
  const [recorded, setRecorded] = useState<readonly string[]>([])
  const [failure, setFailure] = useState<AppError | null>(null)
  const [busy, setBusy] = useState<'ending' | 'recording' | null>(null)

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

  useEffect(() => {
    if (blocker.state === 'blocked') setExit({ kind: 'navigation' })
  }, [blocker.state])

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
    setExit(null)
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  const confirmAbandon = useCallback(async () => {
    setBusy('ending')
    const result = await sessions.abandon(sessionId)
    setBusy(null)

    if (isErr(result)) {
      // The session is still running and still the user's. Nothing is
      // discarded on a failed abandon, and the confirm stays available.
      setExit(null)
      if (blocker.state === 'blocked') blocker.reset()
      setFailure(result.error)
      return
    }

    // Abandoned is a state, not a delete: the structure, the logs and the
    // lineage remain, which is what HOME-01 resumption reads.
    onSessionEnded(null)
    setExit(null)
    depart(ABANDON_ROUTE)
  }, [blocker, depart, onSessionEnded, sessionId, sessions])

  const finish = useCallback(async () => {
    setBusy('ending')
    // The elapsed time this screen measured, in whole minutes. The database
    // would measure it from `started_at` itself; the shell knows what the user
    // actually watched, so it says so.
    const result = await sessions.complete(sessionId, elapsedMinutes(seconds))
    setBusy(null)

    if (isErr(result)) {
      setFailure(result.error)
      return
    }

    onSessionEnded(null)
    depart(COMPLETION_ROUTE)
  }, [depart, onSessionEnded, seconds, sessionId, sessions])

  // The seam EXE-02…EXE-04c call. A block already written is refused here
  // rather than in each renderer: "captured once" is the shell's promise.
  const completion = useMemo<BlockCompletionApi>(
    () => ({
      completeBlock(blockId, outcome) {
        if (recorded.includes(blockId)) return
        const block = progress.sections
          .flatMap((entry) => entry.blocks)
          .find((candidate) => candidate.blockId === blockId)
        if (block === undefined) return
        setPending({ block, outcome })
      },
      isBlockRecorded(blockId) {
        return recorded.includes(blockId)
      },
    }),
    [progress.sections, recorded],
  )

  const recordEffort = useCallback(
    async (perceivedEffort: number) => {
      if (pending === null) return

      setBusy('recording')
      const result = await blockResults.record({
        blockId: pending.block.blockId,
        outcome: pending.outcome,
        perceivedEffort,
      })
      setBusy(null)

      if (isErr(result)) {
        // The outcome is kept: the dialog closes, the failure is shown, and the
        // block can be completed again. A performed block must never be lost
        // because one write failed.
        setPending(null)
        setFailure(result.error)
        return
      }

      setRecorded((current) => [...current, pending.block.blockId])
      setPending(null)
    },
    [blockResults, pending],
  )

  const canGoBack = index > 0
  const canGoForward = index < progress.total - 1

  return (
    <BlockCompletionContext value={completion}>
      <AppHeader
        meta={<GlobalTimer seconds={seconds} />}
        actions={
          <Button
            variant="quiet"
            icon={<LogOut />}
            onClick={() => setExit({ kind: 'control' })}
          >
            Abandon
          </Button>
        }
      >
        <ClearLogo size="sm" />
      </AppHeader>

      <Screen title={SCREEN_TITLE}>
        <div className="clr-stack">
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
                <BlockPanel
                  key={block.blockId}
                  block={block}
                  recorded={recorded.includes(block.blockId)}
                  onComplete={completion.completeBlock}
                />
              ))}
            </>
          )}

          <WorkoutNavigation
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onPrevious={() => section.setIndex(index - 1)}
            onNext={() => section.setIndex(index + 1)}
            onFinish={() => void finish()}
            busy={busy === 'ending'}
          />
        </div>
      </Screen>

      <ConfirmDialog
        open={exit !== null}
        critical
        title="Abandon workout?"
        confirmLabel="Abandon"
        cancelLabel="Keep going"
        onConfirm={() => void confirmAbandon()}
        onCancel={cancelExit}
      >
        Everything logged so far is kept, and the workout stops here. It stays on
        Home, where you can see what you did.
      </ConfirmDialog>

      <BlockEffortDialog
        open={pending !== null}
        identity={pending?.block.identity ?? null}
        outcome={pending?.outcome ?? null}
        saving={busy === 'recording'}
        onConfirm={(effort) => void recordEffort(effort)}
        onCancel={() => setPending(null)}
      />

      {failure !== null && (
        <ErrorDialog
          open
          error={failure}
          title="That didn’t save"
          onDismiss={() => setFailure(null)}
        />
      )}
    </BlockCompletionContext>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One block, as the shell knows it: its structure identity, how much is in it,
 * and the completion control the shell owns.
 *
 * The *contents* are not here and are not meant to be. `SectionRenderer`
 * dispatches on `structure_type` to the renderers in EXE-02…EXE-04c, and each
 * one calls `completeBlock` with what its structure observed. Until they land
 * the shell still owns the write, which is why this panel offers completion
 * with no outcome fields rather than nothing at all — the path OVR-03 reads is
 * live from day one.
 */
function BlockPanel({
  block,
  recorded,
  onComplete,
}: {
  block: BlockProgress
  recorded: boolean
  onComplete: (blockId: string, outcome: BlockOutcome) => void
}) {
  return (
    <Card>
      <div className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="clr-row" style={{ justifyContent: 'space-between' }}>
          <StructureBadge identity={block.identity} />
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--label-xs-size)',
              letterSpacing: 'var(--tracking-data)',
              color: 'var(--text-card-label)',
            }}
          >
            {block.exerciseCount} {block.exerciseCount === 1 ? 'movement' : 'movements'}
          </span>
        </div>
        <Button
          variant="secondary"
          size="lg"
          disabled={recorded}
          onClick={() => onComplete(block.blockId, {})}
        >
          {recorded ? 'Block recorded' : 'Complete block'}
        </Button>
      </div>
    </Card>
  )
}
