/**
 * EXE-06 — swapping a movement while the workout is running.
 *
 * Two components, and the split is the one every seam in this shell uses: the
 * control asks, the shell writes. `ExerciseSwapControls` sits on a movement's
 * card and does nothing but say which slot the user means;
 * `SwapDialog` renders the alternatives the shell fetched and reports the one
 * that was picked. Neither knows where the database is, and neither can — the
 * only import either has from the state layer is the seam itself.
 *
 * The controls draw nothing when the seam is absent. A card rendered outside
 * the workout shell — a preview, a test of a block renderer — has no session to
 * revise, and "no swap on offer" is the honest thing to show rather than a
 * control that would throw on tap (`swap-context.ts` states why this seam is
 * nullable where set logging's is not).
 *
 * Two accessibility rules are load-bearing here rather than incidental. Every
 * control names the movement it acts on — three cards on a screen means three
 * buttons called "Swap", and a screen reader user would have no way to tell
 * which is which. And the dialog carries all four states (CORE-04): the list is
 * a read, reads fail, and a swap panel that renders nothing while it loads is
 * indistinguishable from one that found nothing.
 */
import { AppDialog } from './app-dialog'
import { AlertTriangle, Button, EmptyState, RefreshCw } from '../design-system/index'
import { exerciseName } from '../state/prescription'
import { useExerciseSwap, type SwapOptionsState } from '../state/swap-context'
import type { SwapOption } from '../state/swap'
import type { ExerciseProgress } from '../state/workout-progress'
import { LoadingView } from './view-state'

// ─────────────────────────────────────────────────────────────────────────────
// On the movement's card
// ─────────────────────────────────────────────────────────────────────────────

export interface ExerciseSwapControlsProps {
  exercise: ExerciseProgress
}

/**
 * Swap this movement, and — once it has been swapped — put the previous one
 * back. Undo is drawn only for a slot that has a predecessor, because an undo
 * that cannot name what it restores is a button with no meaning.
 */
export function ExerciseSwapControls({ exercise }: ExerciseSwapControlsProps) {
  const swap = useExerciseSwap()
  if (swap === null) return null

  const name = exerciseName(exercise.prescription.exercise_id)
  const previous = swap.undoTarget(exercise.exerciseId)
  const busy = swap.isBusy(exercise.exerciseId)

  return (
    <div className="clr-row" style={{ gap: 'var(--spacing-200)', flexWrap: 'wrap' }}>
      <Button
        variant="quiet"
        icon={<RefreshCw />}
        aria-label={`Swap ${name}`}
        loading={busy}
        onClick={() => swap.open(exercise.exerciseId)}
      >
        Swap
      </Button>

      {previous === null ? null : (
        <Button
          variant="quiet"
          aria-label={`Undo swap — back to ${exerciseName(previous)}`}
          loading={busy}
          onClick={() => swap.undo(exercise.exerciseId)}
        >
          Undo swap
        </Button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The alternatives
// ─────────────────────────────────────────────────────────────────────────────

export interface SwapDialogProps {
  open: boolean
  /** The catalog id of the movement being replaced; null when nothing is open. */
  exerciseId: string | null
  options: SwapOptionsState
  /** A write is in flight: the list stops accepting a second pick. */
  busy: boolean
  onRetry: () => void
  onChoose: (option: SwapOption) => void
  onClose: () => void
}

/**
 * The slot's alternatives, in all four states.
 *
 * The empty state is not a failure and does not read as one: an over-filtered
 * slot means this location has nothing else that fits here, and the action it
 * offers is to keep going, not to retry a read that worked.
 */
export function SwapDialog({
  open,
  exerciseId,
  options,
  busy,
  onRetry,
  onChoose,
  onClose,
}: SwapDialogProps) {
  const name = exerciseId === null ? '' : exerciseName(exerciseId)

  return (
    <AppDialog
      open={open}
      title={exerciseId === null ? 'Swap movement' : `Swap ${name}`}
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          Keep {name}
        </Button>
      }
    >
      <SwapOptionsView
        options={options}
        busy={busy}
        onRetry={onRetry}
        onChoose={onChoose}
      />
    </AppDialog>
  )
}

function SwapOptionsView({
  options,
  busy,
  onRetry,
  onChoose,
}: Pick<SwapDialogProps, 'options' | 'busy' | 'onRetry' | 'onChoose'>) {
  switch (options.status) {
    case 'loading':
      return <LoadingView label="Finding alternatives" />

    case 'error':
      return (
        <div role="alert">
          <EmptyState
            icon={
              <span style={{ color: 'var(--icon-toast-negative)', display: 'flex' }}>
                <AlertTriangle />
              </span>
            }
            title="Alternatives didn’t load"
            message={options.error.message}
            actionLabel="Try again"
            onAction={onRetry}
          />
        </div>
      )

    case 'empty':
      return (
        <EmptyState
          title="Nothing else fits this slot"
          message="Everything this location can do here is already in the workout."
        />
      )

    case 'ready':
      return (
        <ul
          aria-label="Alternatives"
          className="clr-stack--tight"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}
        >
          {options.options.map((option) => (
            <li key={option.exerciseId}>
              <Button
                variant="secondary"
                size="lg"
                disabled={busy}
                onClick={() => onChoose(option)}
                style={{ width: '100%', justifyContent: 'flex-start' }}
              >
                {option.name}
                <span
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 'var(--label-xs-size)',
                    letterSpacing: 'var(--tracking-data)',
                    marginInlineStart: 'var(--spacing-200)',
                  }}
                >
                  {equipmentText(option.equipment)}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )
  }
}

/** The equipment a replacement would be performed with, said plainly. */
export function equipmentText(equipment: string): string {
  return equipment.replaceAll('-', ' ').replaceAll('_', ' ').toUpperCase()
}
