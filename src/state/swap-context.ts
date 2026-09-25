/**
 * EXE-06's seam: what a movement's card may do about being the wrong movement.
 *
 * The shape mirrors `set-logging.ts` and `block-completion.ts` — a context the
 * shell provides and the renderers consume — with one deliberate difference:
 * `useExerciseSwap` answers `null` outside the shell instead of throwing.
 *
 * The two seams are refusing different things. A set logged outside the shell's
 * one write path is work the user did and the app lost, so `useSetLogging`
 * throws rather than let that happen quietly. A swap offered outside the shell
 * is not a lost set — it is an affordance for a session that is not running.
 * A card rendered without this provider is therefore a card with nothing to
 * swap, and drawing no control is the correct answer rather than a crash.
 */
import { createContext, use } from 'react'

import type { AppError } from './errors'
import type { SwapOption } from './swap'

/**
 * The alternatives for the open slot, in all four states CORE-04 requires.
 * `empty` is its own arm rather than a ready list with nothing in it, because
 * "this location has nothing else that fits here" is a different sentence from
 * "here are your options" and the two must not share copy.
 */
export type SwapOptionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: AppError }
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly options: readonly SwapOption[] }

export interface ExerciseSwapApi {
  /** The prescription whose alternatives are open, or null for none. */
  readonly openFor: string | null
  /** Opens the alternatives for one active prescription. */
  open(workoutExerciseId: string): void
  close(): void
  /** The open slot's alternatives. `loading` while nothing is open. */
  readonly options: SwapOptionsState
  /** Re-runs the candidate read: the one recovery action on its error state. */
  retry(): void
  /** Swaps the open slot for this alternative. */
  choose(option: SwapOption): void
  /**
   * The exercise an undo would restore this slot to — the catalog id of the
   * row it replaced — or null when the slot has never been swapped.
   */
  undoTarget(workoutExerciseId: string): string | null
  /** Restores the exercise this slot replaced. Logged sets are untouched. */
  undo(workoutExerciseId: string): void
  /** Whether a swap or an undo is in flight for this prescription. */
  isBusy(workoutExerciseId: string): boolean
}

export const ExerciseSwapContext = createContext<ExerciseSwapApi | null>(null)

/**
 * The renderers' half of the seam, and `null` where there is no session to
 * revise. See the note above: a missing provider means no swap is on offer,
 * which is a state to render rather than an error to raise.
 */
export function useExerciseSwap(): ExerciseSwapApi | null {
  return use(ExerciseSwapContext)
}
