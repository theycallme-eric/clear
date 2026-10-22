/**
 * The swap seam: what a movement's row may do about being the wrong movement.
 *
 * Only Review provides it (U37, `swap-provider.tsx`), and a slot is named by
 * its `prescriptionSiteKey`. The active workout deliberately does not: with no
 * provider, `useExerciseSwap` answers `null` and every control draws nothing,
 * so a swap can be neither shown nor invoked mid-workout.
 *
 * That is why this seam answers `null` rather than throwing, unlike
 * `useSetLogging`. A set logged outside its one write path is work the user
 * did and the app lost; a swap offered where there is no provider is simply
 * not on offer, and drawing no control is the correct answer, not a crash.
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
  /** The slot whose alternatives are open, or null for none. */
  readonly openFor: string | null
  /** Opens the alternatives for one slot. */
  open(slot: string): void
  close(): void
  /** The open slot's alternatives. `loading` while nothing is open. */
  readonly options: SwapOptionsState
  /** Re-runs the candidate read: the one recovery action on its error state. */
  retry(): void
  /** Swaps the open slot for this alternative. */
  choose(option: SwapOption): void
  /**
   * The exercise an undo would restore this slot to — a catalog id — or null
   * when the slot has nothing to go back to.
   */
  undoTarget(slot: string): string | null
  /** Restores the exercise this slot replaced. */
  undo(slot: string): void
  /** Whether a swap or an undo is in flight for this slot. */
  isBusy(slot: string): boolean
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
