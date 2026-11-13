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
import { useEffect, useRef, useState } from 'react'

import { Button } from '../design-system/index'
import { SetLoggingConfirmation } from './set-logging-sheet'
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
  const presentation=useWorkoutExperiencePresentation()
  const [savedRound,setSavedRound]=useState<number|null>(null)
  const setSheetOpen=sheet.setOpen
  useEffect(()=>{if(savedRound===null||restTimer.remainingSeconds>0)return;const id=setTimeout(()=>{setSavedRound(null);setEntry(null);setSheetOpen(false)},0);return()=>clearTimeout(id)},[savedRound,restTimer.remainingSeconds,setSheetOpen])

  // The block's Rest action (REQ-012): open the round sheet and, when no rest
  // is running, start the block's one rest. Log round N only saves.
  const openRound = () => {
    const seconds = prescribedRestSeconds(block.roundRestSeconds)
    const closing = movements[movements.length - 1]
    const resting = restTimer.rest !== null && restTimer.remainingSeconds > 0
    if (seconds !== null && closing !== undefined && !resting) {
      restTimer.start({ exerciseId: closing.exerciseId, label: `round ${round}`, seconds })
    }
    sheet.setOpen(true)
  }

  const collapse = () => {
    sheet.setOpen(false)
    logButton.current?.focus()
  }

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

      {sheet.place(
        savedRound !== null ? <SetLoggingConfirmation label={movements.every(exercise => loggedSets(exercise.exerciseId).some(set => set.setNumber === savedRound)) ? `Round ${savedRound} logged` : `Round ${savedRound} entries logged`} onCollapse={collapse}/> : <SupersetRoundSheet
          movements={movements.map((exercise) => ({
            exercise,
            ordinal: supersetOrdinal(exercise.position),
          }))}
          round={round}
          held={entry}
          onLogged={presentation ? ()=>setSavedRound(round) : undefined}
          onHeld={setEntry}
          onCollapse={collapse}
        />,
      )}
    </>
  )
}
