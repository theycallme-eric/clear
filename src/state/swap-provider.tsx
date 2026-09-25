/**
 * EXE-06 — the one path a mid-workout swap is written through.
 *
 * `swap.ts` is the arithmetic: what may replace a slot, what the replacement
 * prescribes, what the session looks like afterwards, what an undo goes back
 * to. This file is where that arithmetic meets a database, and it is the
 * mirror of `set-logging-provider.tsx` and `block-completion-provider.tsx` —
 * the same split, for the same reason. One writer, so "a swap appends a
 * revision and supersedes its predecessor" is a property of one module rather
 * than a habit every renderer has to keep.
 *
 * What it owns:
 *
 *   · **The candidate read.** `generation_candidate_sets`, the same retrieval
 *     generation uses, asked *now* and against the location this session is
 *     being performed at — so a piece of equipment the user has since removed
 *     from that location is not offered, and a limitation they have since
 *     recorded is not either. One read serves every slot in the session, keyed
 *     in the query cache, because the sets are per session and not per slot.
 *   · **The write, and the snapshot after it.** `swap_session_exercise`
 *     answers both rows; `applySwap` turns them into the session the shell now
 *     holds. Nothing is re-read: a swap that succeeded and a re-read that
 *     failed would leave the screen prescribing a superseded movement, and the
 *     next set would be logged against it.
 *   · **Publishing that snapshot.** The shell hands it to the active-session
 *     query, which is what makes the replacement the prescription
 *     `SetLoggingProvider` resolves an id against. Later sets attach to the
 *     replacement because the session says so, not because a renderer
 *     remembered to re-key.
 *   · **Undo.** The same write, reading the predecessor's row — the prior
 *     exercise is prescribed again in the same slot. The sets logged against
 *     it stay where they are: nothing in this file touches `exercise_set_logs`,
 *     and there is no path here that could.
 *
 * What it deliberately does not do is decide eligibility. Equipment, the
 * user's exclusions and every limitation are predicates in SQL (GEN-02a); a
 * filter written here would be a second opinion the database never gave.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { createError, ErrorCode, isErr, type AppError } from './errors'
import { useQuery } from './query'
import type { SessionSnapshot } from './schemas'
import {
  applySwap,
  exercisesInUse,
  locateSlot,
  prescriptionFor,
  swapOptions,
  undoTarget as undoTargetIn,
} from './swap'
import {
  ExerciseSwapContext,
  type ExerciseSwapApi,
  type SwapOptionsState,
} from './swap-context'
import { useWorkoutClients } from './workout-queries'
import { SwapDialog } from '../ui/exercise-swap'

/** The candidate sets for one session, cached for every slot in it. */
export function swapCandidatesQueryKey(sessionId: string): string {
  return `swap-candidates:${sessionId}`
}

export interface SwapProviderProps {
  /** The session being performed, as the shell currently holds it. */
  snapshot: SessionSnapshot
  /**
   * Publishes the session a swap produced, so every reader — the renderers,
   * and the set-logging attribution behind them — agrees immediately.
   */
  onSwapped: (snapshot: SessionSnapshot) => void
  /** Where a refused swap is shown: the shell's one error surface. */
  onFailure: (error: AppError) => void
  children: ReactNode
}

export function SwapProvider({
  snapshot,
  onSwapped,
  onFailure,
  children,
}: SwapProviderProps) {
  const { sessions, candidates } = useWorkoutClients()

  const [openFor, setOpenFor] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const session = snapshot.session

  // Asked only once something is open: a session nobody is revising has no
  // business running generation's retrieval.
  const query = useQuery(
    openFor === null ? null : swapCandidatesQueryKey(session.id),
    useCallback(
      () =>
        candidates.retrieve({
          userId: session.user_id,
          focus: session.session_focus,
          // The location this session is being performed at, resolved by the
          // query now rather than by the candidate set generation captured.
          locationId: session.location_id,
          sessionId: session.id,
        }),
      [candidates, session.id, session.location_id, session.session_focus, session.user_id],
    ),
  )

  const slot = openFor === null ? null : locateSlot(snapshot, openFor)

  const options = useMemo<SwapOptionsState>(() => {
    if (slot === null) return { status: 'loading' }

    switch (query.state.status) {
      case 'loading':
        return { status: 'loading' }
      case 'error':
        return { status: 'error', error: query.state.error }
      case 'ready': {
        const available = swapOptions(
          query.state.data,
          slot.sectionType,
          slot.exercise,
          exercisesInUse(snapshot),
        )
        return available.length === 0 ? { status: 'empty' } : { status: 'ready', options: available }
      }
    }
  }, [query.state, slot, snapshot])

  /**
   * One write, whichever direction it goes in. A swap and an undo differ only
   * in which row the prescription is read from — the replacement's slot is the
   * outgoing row either way — so they share a path rather than a shape.
   */
  const revise = useCallback(
    async (
      outgoingId: string,
      prescribed: { readonly exerciseId: string; readonly equipment: string },
      source: 'active' | 'predecessor',
    ) => {
      const located = locateSlot(snapshot, outgoingId)
      if (located === null) return

      const row =
        source === 'active'
          ? located.exercise
          : (undoTargetIn(snapshot, outgoingId) ?? located.exercise)

      const prescription = prescriptionFor(row, prescribed, located.sectionType)
      if (prescription === null) {
        onFailure(
          createError(ErrorCode.VALIDATION_INVALID_FORMAT, {
            details: { field: 'target_kind', workoutExerciseId: outgoingId },
          }),
        )
        return
      }

      setBusy(outgoingId)
      const result = await sessions.swap(outgoingId, prescription)
      setBusy(null)

      if (isErr(result)) {
        // Nothing was written, so nothing is republished: the slot still
        // prescribes what it prescribed, and the control stays available.
        onFailure(result.error)
        return
      }

      setOpenFor(null)
      onSwapped(applySwap(snapshot, result.value))
    },
    [onFailure, onSwapped, sessions, snapshot],
  )

  const api = useMemo<ExerciseSwapApi>(
    () => ({
      openFor,
      open(workoutExerciseId) {
        if (locateSlot(snapshot, workoutExerciseId) === null) return
        setOpenFor(workoutExerciseId)
      },
      close() {
        setOpenFor(null)
      },
      options,
      retry: query.refetch,
      choose(option) {
        if (openFor === null) return
        void revise(openFor, option, 'active')
      },
      undoTarget(workoutExerciseId) {
        return undoTargetIn(snapshot, workoutExerciseId)?.exercise_id ?? null
      },
      undo(workoutExerciseId) {
        const previous = undoTargetIn(snapshot, workoutExerciseId)
        if (previous === null) return
        void revise(
          workoutExerciseId,
          { exerciseId: previous.exercise_id, equipment: previous.equipment_used },
          'predecessor',
        )
      },
      isBusy(workoutExerciseId) {
        return busy === workoutExerciseId
      },
    }),
    [busy, openFor, options, query.refetch, revise, snapshot],
  )

  return (
    <ExerciseSwapContext value={api}>
      {children}
      <SwapDialog
        open={slot !== null}
        exerciseId={slot?.exercise.exercise_id ?? null}
        options={options}
        busy={busy !== null}
        onRetry={query.refetch}
        onChoose={api.choose}
        onClose={api.close}
      />
    </ExerciseSwapContext>
  )
}
