/**
 * Swapping a movement — in Review, before the workout starts (U37).
 *
 * Two components, and the split is the one every seam in this app uses: the
 * control asks, the provider changes. `ExerciseSwapControls` sits on a
 * movement's row and does nothing but say which slot the user means;
 * `SwapDialog` renders the alternatives the provider fetched and reports the
 * one that was picked. Neither knows where the database is, and neither can —
 * the only import either has from the state layer is the seam itself.
 *
 * The controls draw nothing when the seam is absent, and the active workout is
 * deliberately where it is absent: no swap is on offer there, so none is drawn
 * and none can be tapped (`swap-context.ts` states why this seam is nullable
 * where set logging's is not).
 *
 * Two accessibility rules are load-bearing here rather than incidental. Every
 * control names the movement it acts on — three cards on a screen means three
 * buttons called "Swap", and a screen reader user would have no way to tell
 * which is which. And the dialog carries all four states (CORE-04): the list is
 * a read, reads fail, and a swap panel that renders nothing while it loads is
 * indistinguishable from one that found nothing.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

import { AppDialog } from './app-dialog'
import { Button, ChevronLeft, EmptyState, RefreshCw, TextAction } from '../design-system/index'
import { exerciseName } from '../state/prescription'
import { useExerciseSwap, type SwapOptionsState } from '../state/swap-context'
import type { SwapOption } from '../state/swap'
import { FittedScrollRegion } from './fitted-scroll-region'
import { ErrorView, LoadingView } from './view-state'
import './exercise-swap.css'

// ─────────────────────────────────────────────────────────────────────────────
// On the movement's card
// ─────────────────────────────────────────────────────────────────────────────

/** Quiet trailing actions; the caller chooses the reading row each belongs to. */
const ACTIONS_STYLE: CSSProperties = {
  gap: 'var(--spacing-200)',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
}

function swapButtonIn(scope: Element, slot: string): HTMLButtonElement | undefined {
  return [...scope.querySelectorAll<HTMLButtonElement>('button[data-exercise-swap-slot]')]
    .find((button) => button.getAttribute('data-exercise-swap-slot') === slot)
}

/** Default paired controls share a wrapper; Review's separate controls share their movement row. */
function swapReturnScope(undo: Element, slot: string): HTMLElement | null {
  for (let scope = undo.parentElement; scope !== null; scope = scope.parentElement) {
    if (swapButtonIn(scope, slot) !== undefined) return scope
  }
  return null
}

const OPTION_LIST_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
}

/**
 * One alternative: a full-width framed choice, read from its leading edge
 * (B05-05.2). The movement name keeps the button's bold label; the equipment
 * sits under it as the quieter secondary reading.
 */
const OPTION_STYLE: CSSProperties = {
  width: '100%',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: 'var(--spacing-100)',
  textAlign: 'start',
}

/**
 * One step above the equipment: on a phone the Review scroller lifts the
 * data-label tier (shell.css U06), and the dialog renders inside it.
 */
const OPTION_LABEL_STYLE: CSSProperties = {
  width: '100%',
  fontSize: 'var(--label-md-size)',
  lineHeight: 'var(--label-md-line-height)',
  overflowWrap: 'anywhere',
}

/** The equipment, in the terse data-face label every block caption uses. */
const EQUIPMENT_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  lineHeight: 'var(--label-xs-line-height)',
  fontWeight: 'var(--font-weight-regular)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-secondary)',
  maxWidth: '100%',
  overflowWrap: 'anywhere',
}

export interface ExerciseSwapControlsProps {
  /** The slot the controls act on, as the provider names it. */
  slot: string
  /** The catalog id of the movement the slot currently prescribes. */
  exerciseId: string
  /** Default keeps the existing paired API; Review places Undo after its readings. */
  actions?: 'both' | 'swap' | 'undo'
}

/**
 * Swap this movement, and — once it has been swapped — put the previous one
 * back. Undo is drawn only for a slot that has a predecessor, because an undo
 * that cannot name what it restores is a button with no meaning.
 *
 * Both are the public `TextAction`: the quietest action a card holds, so a
 * movement's row gains no frame of its own and keeps the 40px target. While a
 * write is in flight they are disabled and busy rather than animated — the
 * dialog's loader is the one loop on screen.
 */
export function ExerciseSwapControls({ slot, exerciseId, actions = 'both' }: ExerciseSwapControlsProps) {
  const swap = useExerciseSwap()
  const returnAfterUndo = useRef<{ scope: HTMLElement; exerciseId: string } | null>(null)
  useLayoutEffect(() => {
    const pending = returnAfterUndo.current
    returnAfterUndo.current = null
    if (pending === null || swap === null || pending.exerciseId !== exerciseId || !pending.scope.isConnected) return
    const button = swapButtonIn(pending.scope, slot)
    if (button !== undefined && !button.disabled) button.focus()
  }, [exerciseId, slot, swap])
  if (swap === null) return null

  const name = exerciseName(exerciseId)
  const previous = swap.undoTarget(slot)
  if (actions === 'undo' && previous === null) return null
  const busy = swap.isBusy(slot)

  return (
    <div className="clr-row" style={ACTIONS_STYLE}>
      {actions === 'undo' ? null : (
        <TextAction
          aria-label={`Swap ${name}`}
          data-exercise-swap-slot={slot}
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={() => swap.open(slot)}
        >
          <RefreshCw size={16} />
          Swap
        </TextAction>
      )}

      {actions === 'swap' || previous === null ? null : (
        <TextAction
          aria-label={`Undo swap — back to ${exerciseName(previous)}`}
          aria-busy={busy || undefined}
          disabled={busy}
          onClick={(event) => {
            const scope = swapReturnScope(event.currentTarget, slot)
            // Undo removes its own focused action. Restore only this explicit action's slot,
            // after the composition commit has restored the actual Swap label/button.
            returnAfterUndo.current = scope === null ? null : { scope, exerciseId: previous }
            swap.undo(slot)
          }}
        >
          Undo swap
        </TextAction>
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
 * B05 REQ-010: a modal overlay over the owning Review, widened to the screen's
 * content width (exercise-swap.css). The list scrolls inside its own region;
 * the title and the Keep return sit outside it, so both stay reachable.
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
      className="clr-swap-dialog"
      title={exerciseId === null ? 'Swap movement' : `Swap ${name}`}
      onClose={onClose}
      actions={
        <Button variant="secondary" icon={<ChevronLeft size={16} />} onClick={onClose}>
          Keep {name}
        </Button>
      }
    >
      {open && (
        <SwapOptionsView
          options={options}
          busy={busy}
          onRetry={onRetry}
          onChoose={onChoose}
        />
      )}
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
        <ErrorView
          error={options.error}
          title="Alternatives didn’t load"
          actionLabel="Try again"
          onRetry={onRetry}
        />
      )

    case 'empty':
      return (
        <EmptyState
          title="Nothing else fits this slot"
          message="Everything this location can do here is already in the workout."
        />
      )

    case 'ready':
      return <SwapOptionList options={options.options} busy={busy} onChoose={onChoose} />
  }
}

/**
 * The list's frame: as tall as the list, and never taller than the viewport
 * leaves once the dialog's title, padding and Keep action are drawn. The
 * dialog element itself does not scroll (0.14.3 clears its max-height), so a
 * long list can place its final choice outside the visible panel. This is a
 * possible local overflow mechanism; the exact reported installed-iPhone cause
 * remains unknown (REQ-020). Containment keeps the title and safe action on
 * screen while the list scrolls.
 */
const LIST_FRAME_MAX_HEIGHT =
  'max(calc(var(--control-height) * 3), calc(100dvh - var(--spacing-600) * 10' +
  ' - env(safe-area-inset-top) - env(safe-area-inset-bottom)))'

/**
 * The alternatives, inside the public `ScrollRegion` — the one vertical
 * scrolling contract (ATOMIC §3.3), never a local overflow box. The region
 * fills a parent of definite height, so the frame takes the list's measured
 * height and the cap above clamps it; a short list leaves no empty band.
 */
function SwapOptionList({
  options,
  busy,
  onChoose,
}: {
  options: readonly SwapOption[]
  busy: boolean
  onChoose: (option: SwapOption) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const [listHeight, setListHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const list = listRef.current
    if (list === null) return
    const measure = () => setListHeight(list.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  return (
    <div data-swap-list-frame style={{ height: listHeight, maxHeight: LIST_FRAME_MAX_HEIGHT }}>
      <FittedScrollRegion fit={false}>
        <ul ref={listRef} aria-label="Alternatives" className="clr-stack--tight clr-swap-dialog__options" style={OPTION_LIST_STYLE}>
          {options.map((option) => (
            <li key={option.exerciseId}>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => onChoose(option)}
                style={OPTION_STYLE}
              >
                <span data-swap-option-label style={OPTION_LABEL_STYLE}>{option.name}</span>
                <span style={EQUIPMENT_STYLE}>{equipmentText(option.equipment)}</span>
              </Button>
            </li>
          ))}
        </ul>
      </FittedScrollRegion>
    </div>
  )
}

/** The equipment a replacement would be performed with, said plainly. */
export function equipmentText(equipment: string): string {
  return equipment.replaceAll('-', ' ').replaceAll('_', ' ').toUpperCase()
}
