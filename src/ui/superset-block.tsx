/**
 * EXE-02 — the superset block: two (or more) movements performed back to back,
 * logged set by set like any other, and resting only once the pair is done.
 *
 * `StandardBlock` established what a set-logging renderer is; this one adds the
 * single thing that makes a superset a superset rather than two movements that
 * happen to share a card, and `superset-circuit-clarity.md` is emphatic that it
 * is exactly one thing — **the pairing**:
 *
 *   · **Order is the prescription.** A1 is performed, then A2, then back to A1.
 *     The ordinals come from `ExerciseProgress.position`, which
 *     `sessionProgress` derives by sorting on `order_index` — so the labels
 *     cannot drift from the order the rows prescribe, whatever order the read
 *     answered in (§1).
 *   · **Rest is the block's, and it comes after both movements.** The
 *     transition from A1 to A2 has no rest by definition, so a per-movement
 *     rest line here would state a rest the user is not meant to take (§2).
 *     The number is `workout_blocks.round_rest_seconds` — the block is where
 *     the clock lives, once, so the two members cannot disagree about it
 *     (DATA-01c §5) — and a block with no rest renders no rest line at all,
 *     never `Rest: 0s`.
 *   · **The pair is one unit.** The shared card/badge and explicit round
 *     order carry the grouping. Owner-selected B05-04/R28 replaces the older
 *     inner rail with shared peer separators; no final divider is drawn.
 *
 *   · **The round is logged once** (REQ-016). The block's Rest action opens one
 *     sheet with each movement's own fields and effort (`SupersetRoundSheet`)
 *     and starts the round's one rest (REQ-012); its Log round N saves only
 *     the movements the athlete identifies, as one round.
 *   · **Save confirms, then the rest ends it** (TASK-020: C46, R07; A3
 *     TASK-106). Under Round 7's logging dialog (owner decision 1) the round
 *     is entered in `LoggingOverlay`, titled `Log round N`, and an accepted
 *     round becomes `Round N logged` — each ticked movement's own actuals,
 *     effort and sync status read back — beside the same running rest. That
 *     rest ending closes the dialog; Close log ends it early; only the
 *     block's Rest opens round N + 1. Focus returns to Rest once the dialog
 *     has closed. Each movement's saved-set Edit opens its correction in the
 *     same dialog (TASK-044).
 *
 * Everything else is deliberately `StandardBlock`'s: `ExerciseSetLogger` reads
 * the structured prescription and corrects each saved set through the shell's one path,
 * and completion is the frame's own with an empty outcome — a superset runs no
 * clock, and a zero it never watched would be a measurement (DATA_MODEL §8).
 *
 * It draws with the shared block frame (`block-renderers-frame.tsx`): the one
 * card, the identity row and the single completion are `BlockPanel`'s, and the
 * pair are rows of its list — never a card inside the card.
 */
import { useRef, useState } from 'react'

import { Button } from '../design-system/index'
import { LoggingOverlay } from './logging-overlay'
import { focusIsInSetSheet, setSheetTitle, useSaveConfirmation } from './set-save-confirmation'
import { useWorkoutExperiencePresentation } from './workout-experience-presentation'
import { prescribedRestSeconds, useRestTimer } from '../state/rest'
import { useSetLogging } from '../state/set-logging'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel } from './block-renderers-frame'
import { ActionGroup } from './composition'
import {
  ExerciseSetLogger,
  SupersetRoundSheet,
  supersetRound,
  type RoundDraft,
} from './set-logger'
import { useSetLoggingSheetPlacement } from './set-logging-sheet-context'

/**
 * The label for one member of the pair: `A1`, `A2`, `A3`.
 *
 * One letter for the block and a number for the position within it, which is
 * the notation the whole app writes supersets in. A block is the group, so the
 * letter does not vary inside one.
 */
function supersetOrdinal(position: number): string {
  return `A${position}`
}

/**
 * How the block's rest is stated, or `null` when it prescribes none.
 *
 * "After both" is the whole point of the line: it is the pair's rest, taken
 * once the second movement is done, not a rest between them.
 */
function supersetRestText(seconds: number | null, movements: number): string | null {
  if (seconds === null || seconds <= 0) return null
  return `Rest ${seconds}s ${afterPhrase(movements)}`
}

function afterPhrase(movements: number): string {
  if (movements === 2) return 'after both movements'
  // A superset whose partner was swapped out is still a block with rest after
  // it; and a trio is a superset the generator is allowed to write.
  if (movements <= 1) return 'after the movement'
  return `after all ${movements} movements`
}

export function SupersetBlock({ block }: BlockRendererProps) {
  return (
    <BlockPanel block={block}>
      {block.exercises.length === 0 ? <BlockPanel.EmptyNote /> : <SupersetRound block={block} />}
    </BlockPanel>
  )
}

/**
 * The pair and its one Log round. Only a block with movements to perform
 * reaches the shell's set logging, so an emptied block asks it for nothing.
 */
function SupersetRound({ block }: BlockRendererProps) {
  const movements = block.exercises
  const rest = supersetRestText(block.roundRestSeconds, movements.length)
  const { loggedSets } = useSetLogging()
  const sheet = useSetLoggingSheetPlacement(`round:${block.blockId}`)
  const logButton = useRef<HTMLButtonElement>(null)
  // The round being entered, kept here so a collapsed sheet loses nothing.
  const [entry, setEntry] = useState<RoundDraft | null>(null)
  const round = supersetRound(movements.map((exercise) => loggedSets(exercise.exerciseId)))
  const restTimer = useRestTimer()
  // Round 7 (owner decision 1): the round is entered in the logging dialog.
  const inDialog = useWorkoutExperiencePresentation()?.loggingOverlay !== undefined
  // A3 TASK-106: drawn from opening until the native dialog has closed.
  const [held, setHeld] = useState(false)
  const [leaving, setLeaving] = useState<{ title: string; confirmed: number | null } | null>(null)
  const pendingFocus = useRef(false)

  // TASK-020 (C46; R07, R17): Log round N is confirmed beside the round's
  // running rest, not replaced by round N + 1's form. The rest ending closes
  // the dialog; Close log ends it early; the block's Rest opens the next.
  const saved = useSaveConfirmation({
    open: sheet.open,
    recorded: (round) =>
      movements.some((exercise) => loggedSets(exercise.exerciseId).some((set) => set.setNumber === round)),
    // A block with no round rest has nothing to wait for (A3 TASK-106).
    restPrescribed: prescribedRestSeconds(block.roundRestSeconds) !== null,
    onRestEnd: () => {
      const inSheet = focusIsInSetSheet()
      setLeaving({ title: overlayTitle, confirmed: confirmedRound })
      sheet.setOpen(false)
      if (inSheet) returnFocus()
    },
  })
  const confirmedRound = saved.confirmed
  const overlayTitle = setSheetTitle({
    mode: 'new',
    entryName: `round ${round}`,
    confirmation: confirmedRound === null ? undefined : { entryName: `round ${confirmedRound}`, reading: null },
  })

  // While the dialog is open the workout behind it is inert, so Rest takes
  // focus back only once the native dialog has closed (TASK-044, A3).
  const returnFocus = () => {
    if (inDialog) pendingFocus.current = true
    else logButton.current?.focus()
  }
  const afterDialogClose = () => {
    setHeld(false)
    setLeaving(null)
    if (!pendingFocus.current) return
    pendingFocus.current = false
    logButton.current?.focus()
  }

  // The block's Rest action (REQ-012): open the round sheet and, when no rest
  // is running, start the block's one rest. Log round N only saves.
  const openRound = () => {
    const seconds = prescribedRestSeconds(block.roundRestSeconds)
    const closing = movements[movements.length - 1]
    const resting = restTimer.rest !== null && restTimer.remainingSeconds > 0
    if (seconds !== null && closing !== undefined && !resting) {
      restTimer.start({ exerciseId: closing.exerciseId, label: `round ${round}`, seconds })
    }
    // A deliberate Rest is the next entry: any confirmation is over (AC-037:
    // reopening during the rest goes to the next round, the rest running on).
    saved.reset()
    setHeld(true)
    setLeaving(null)
    sheet.setOpen(true)
  }

  const collapse = () => {
    // An early close ends the confirmation; the rest ending reopens nothing.
    saved.reset()
    setLeaving({ title: overlayTitle, confirmed: null })
    sheet.setOpen(false)
    returnFocus()
  }

  // While the dialog closes itself it goes on showing the round it confirmed.
  const shownRound = inDialog && !sheet.open ? leaving?.confirmed ?? null : confirmedRound
  const roundSheet = (
    <SupersetRoundSheet
      movements={movements.map((exercise) => ({
        exercise,
        ordinal: supersetOrdinal(exercise.position),
      }))}
      round={round}
      held={entry}
      onHeld={setEntry}
      confirmed={shownRound}
      onSaved={saved.confirm}
      onCollapse={collapse}
    />
  )

  return (
    <>
      {/*
        The alternation in words. Two movements are the pair the spec
        describes; one is what is left of it after a swap, and saying
        "alternate" of a single movement would be a lie.
      */}
      {movements.length > 1 && (
        <BlockPanel.Label>
          One round:{' '}
          {movements.map((exercise) => supersetOrdinal(exercise.position)).join(' → ')} — no rest between movements
        </BlockPanel.Label>
      )}

      {/*
        The shared ordered rows communicate the pair without an additional
        vertical frame. The card keeps its own normal accent bar.
      */}
      <div>
        <BlockPanel.MovementList label="Movements in this superset">
          {movements.map((exercise) => (
            <BlockPanel.MovementItem key={exercise.exerciseId}>
              <ExerciseSetLogger
                exercise={exercise}
                ordinal={supersetOrdinal(exercise.position)}
                // Rest here is the block's, stated once below the pair,
                // and started once per round, by the block's Rest (EXE-05).
                statesRest={false}
                restSeconds={null}
                // REQ-016: entered together, by the block's one action.
                logging={{ round }}
                onReturnToRound={() => logButton.current?.focus()}
              />
            </BlockPanel.MovementItem>
          ))}
        </BlockPanel.MovementList>
      </div>

      {rest === null ? null : <BlockPanel.Note>{rest}</BlockPanel.Note>}

      <ActionGroup>
        <Button
          buttonRef={logButton}
          variant="secondary"
          aria-expanded={sheet.open}
          onClick={openRound}
        >
          Rest
        </Button>
      </ActionGroup>

      {inDialog ? sheet.place(
        // The logging dialog: its title is the round's one title — `Log round
        // N`, then `Round N logged` — and its X and Escape close it. The form
        // is drawn only while open; the round's draft is held here, in `entry`.
        <LoggingOverlay
          open={sheet.open}
          title={sheet.open || leaving === null ? overlayTitle : leaving.title}
          onClose={collapse}
          onAfterClose={afterDialogClose}
        >
          {sheet.open || shownRound !== null ? roundSheet : null}
        </LoggingOverlay>,
        held,
      ) : sheet.place(roundSheet)}
    </>
  )
}
