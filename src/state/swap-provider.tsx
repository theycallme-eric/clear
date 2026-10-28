/**
 * U37 — the one place an exercise is swapped: Review, before the session exists.
 *
 * A swap used to be offered mid-workout (EXE-06), written through
 * `swap_session_exercise` as a revision row. It is not any more: an active
 * workout mounts no swap seam, so no card in it can draw or invoke one
 * (`Workout.tsx`). What remains is the swap the athlete makes while reading
 * the briefing, and there nothing has been written — the workout is the
 * acceptance payload in memory, and Start persists whatever they settled on.
 * So this provider changes that payload and calls no database write at all.
 *
 * What it owns:
 *
 *   · **The candidate read.** Generation's goal-scoped retrieval for this
 *     composition's chosen goal, user, focus and location — so
 *     the alternatives respect the original constraints: equipment at that
 *     location, the user's exclusions and every limitation are predicates in
 *     SQL (GEN-02a), and `swapOptions` narrows only to the slot's own section
 *     and away from movements already in the workout. A filter written here
 *     would be a second opinion the database never gave. Each disclosure reads
 *     again: saved limitations/equipment may have changed since another workout
 *     was reviewed, and an app-wide cached list is not current eligibility.
 *   · **The revised composition.** `swapInComposition` changes the movement and
 *     its equipment and nothing about how much of it; the screen holds the
 *     result and is told which slot changed, because anything it keyed to that
 *     slot (a load override) was about the movement that is no longer there.
 *   · **Undo.** Back to the movement generation composed for the slot, offered
 *     only while that movement is not already elsewhere in the workout.
 *
 * Slots are named by `prescriptionSiteKey`, the same position Review's load
 * suggestions use, so there is one definition of "which prescription".
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'

import type { SectionCandidates } from '../data/candidates'
import { isErr } from './errors'
import type { QueryState } from './query'
import type { SessionAcceptance } from './schemas'
import {
  compositionSlot,
  compositionSwapOptions,
  exercisesInComposition,
  swapInComposition,
} from './swap'
import {
  ExerciseSwapContext,
  type ExerciseSwapApi,
  type SwapOptionsState,
} from './swap-context'
import { toastQueue } from './toasts'
import { useWorkoutClients } from './workout-queries'
import { SwapDialog } from '../ui/exercise-swap'

interface CandidateRead {
  readonly source: SessionAcceptance
  readonly userId: string
  readonly site: string
  readonly state: QueryState<SectionCandidates[]>
}

export interface ReviewSwapProviderProps {
  /** The signed-in user; with none there is nothing to read, and no swap. */
  userId: string | null
  /** What generation composed: the movement an undo goes back to. */
  original: SessionAcceptance
  /** The composition as the screen currently holds it. */
  composition: SessionAcceptance
  /** Hands the revised composition back, with the slot that changed. */
  onSwapped: (next: SessionAcceptance, site: string) => void
  /** True while Start persists the composition: nothing may change it then. */
  locked?: boolean
  children: ReactNode
}

export function ReviewSwapProvider({
  userId,
  original,
  composition,
  onSwapped,
  locked = false,
  children,
}: ReviewSwapProviderProps) {
  const { candidates } = useWorkoutClients()
  const [read, setRead] = useState<CandidateRead | null>(null)
  // A new composition cannot display a previous composition's open dialog.
  const current = read?.source === original && read.userId === userId ? read : null
  const openFor = current?.site ?? null

  const focus = composition.session_focus
  const locationId = composition.location_id
  const goal = composition.goal_preset

  // This read belongs to the tap, not to the shared query cache. Closing,
  // retrying or opening another slot replaces the pending identity, so a late
  // answer cannot overwrite the current dialog. No model or database write.
  const load = useCallback((site: string) => {
    if (userId === null) return
    const pending: CandidateRead = { source: original, userId, site, state: { status: 'loading' } }
    setRead(pending)
    void candidates.retrieve({ userId, focus, locationId, goal }).then((result) => {
      setRead((latest) => latest !== pending ? latest : {
        ...pending,
        state: isErr(result)
          ? { status: 'error', error: result.error }
          : { status: 'ready', data: result.value },
      })
    })
  }, [candidates, focus, goal, locationId, original, userId])

  const retry = useCallback(() => {
    if (!locked && openFor !== null) load(openFor)
  }, [load, locked, openFor])

  const slot = openFor === null ? null : compositionSlot(composition, openFor)

  const options = useMemo<SwapOptionsState>(() => {
    if (current === null || openFor === null || slot === null) return { status: 'loading' }

    switch (current.state.status) {
      case 'loading':
        return { status: 'loading' }
      case 'error':
        return { status: 'error', error: current.state.error }
      case 'ready': {
        const available = compositionSwapOptions(current.state.data, composition, openFor)
        return available.length === 0 ? { status: 'empty' } : { status: 'ready', options: available }
      }
    }
  }, [composition, current, openFor, slot])

  const undoTarget = useCallback(
    (site: string) => {
      const before = compositionSlot(original, site)
      const now = compositionSlot(composition, site)
      if (before === null || now === null) return null
      if (before.prescription.exercise_id === now.prescription.exercise_id) return null
      // An undo that would put the same movement in the workout twice is not
      // offered: it would undo one constraint by breaking another.
      if (exercisesInComposition(composition).has(before.prescription.exercise_id)) return null
      return before.prescription
    },
    [composition, original],
  )

  const api = useMemo<ExerciseSwapApi>(
    () => ({
      openFor,
      open(site) {
        if (locked || userId === null || compositionSlot(composition, site) === null) return
        load(site)
      },
      close() {
        setRead(null)
      },
      options,
      retry,
      choose(option) {
        if (locked || openFor === null || options.status !== 'ready') return
        if (!options.options.some((available) => available.exerciseId === option.exerciseId && available.equipment === option.equipment)) return
        const site = openFor
        setRead(null)
        onSwapped(swapInComposition(composition, site, option), site)
        // REQ-020: the pick is confirmed through the app's one toast queue —
        // the dialog has closed, and Review is where the user now reads it.
        toastQueue.show({ variant: 'positive', message: `Swapped in ${option.name}.` })
      },
      undoTarget(site) {
        return undoTarget(site)?.exercise_id ?? null
      },
      undo(site) {
        if (locked) return
        const previous = undoTarget(site)
        if (previous === null) return
        onSwapped(
          swapInComposition(composition, site, {
            exerciseId: previous.exercise_id,
            equipment: previous.equipment,
          }),
          site,
        )
      },
      // Nothing is written here; what can be in flight is Start persisting
      // the composition, and a swap then would change a screen that no
      // longer matches what is being saved.
      isBusy() {
        return locked
      },
    }),
    [composition, load, locked, onSwapped, openFor, options, retry, undoTarget, userId],
  )

  return (
    <ExerciseSwapContext value={api}>
      {children}
      <SwapDialog
        open={slot !== null}
        exerciseId={slot?.prescription.exercise_id ?? null}
        options={options}
        busy={locked}
        onRetry={retry}
        onChoose={api.choose}
        onClose={api.close}
      />
    </ExerciseSwapContext>
  )
}
