/**
 * EXE-03 / REQ-014 (U40) — the circuit renderer: the whole circuit, on one
 * card, that asks nothing of the athlete in order to be performed. This is the
 * IA's `CircuitRenderer` (IA.md §3), and the rest bar it raises at a round
 * boundary is its `RestTimerBar`.
 *
 * Everything the structure is comes from `workout_blocks` and from nothing
 * else: the round count, the movements in their prescribed order, and the
 * shared rest between rounds (`round_rest_seconds`). The clarity spec's whole
 * argument for circuits is that the block owns those numbers — a circuit whose
 * members each carried their own rest is exactly the "Rest: 0s" noise
 * `superset-circuit-clarity.md` §8 exists to remove — so this file reads
 * `BlockProgress` and computes nothing of its own about the prescription.
 *
 * Hands-off, as 0.14.3 has it:
 *   · **The complete ordered work is always on the card.** Every movement with
 *     its per-round target, the total rounds and the shared rest — no movement
 *     is hidden behind a position, and none is marked as the one to do now,
 *     because the screen does not know and must not pretend to.
 *   · **Nothing is compulsory.** There is no per-movement step. Recording a
 *     round is one optional tap, and it is what starts the shared rest; the
 *     section's forward action saves the block with or without it.
 *   · **Load entry is compact and optional.** Each movement is one read-only
 *     row with a quiet `Log load and reps` action; the set form appears only
 *     for the movement the athlete opened, and writes through the shell's one
 *     set path (`ExerciseSetLogger`).
 *   · **Rounds are observations, never inferred.** `rounds_completed` is the
 *     count of rounds the athlete recorded. Time passing, rest expiring and the
 *     prescribed count prove nothing; an untouched circuit supplies no count,
 *     and a mistaken tap can be taken back to that same nothing.
 *
 * `circuit.ts` holds the round arithmetic as a pure function and
 * `workout-persistence.ts` writes it down on every tap, so a refresh in the
 * middle of a rest comes back to the rest with the time that is left (SES-01).
 *
 * It draws with the shared block frame (`block-renderers-frame.tsx`): the one
 * card, the identity row and the single completion are `BlockPanel`'s, the
 * movements are rows of its list, and the rest countdown goes to its `timer`
 * slot — `TimerDisplay` is already a card, and is never put inside another.
 */
import { useState } from 'react'

import {
  Button,
  Check,
  Rest,
  TextAction,
  TimerDisplay,
} from '../design-system/index'
import {
  advanceCircuit,
  circuitShape,
  circuitView,
  clampCircuitState,
  CIRCUIT_START,
  type CircuitShape,
  type CircuitState,
  type CircuitView,
} from '../state/circuit'
import { exerciseName, targetText } from '../state/prescription'
import { useSetLogging } from '../state/set-logging'
import { useElapsedSeconds } from '../state/workout-clock'
import {
  usePersistedCircuit,
  type ShellStorage,
} from '../state/workout-persistence'
import type { ExerciseProgress } from '../state/workout-progress'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel } from './block-renderers-frame'
import { ExerciseCoaching } from './exercise-coaching'
import { ExerciseSetLogger } from './set-logger'
import { useInterfaceLoop } from './motion'

export interface CircuitBlockProps extends BlockRendererProps {
  /** Injected by a test; the shell's own storage otherwise. */
  storage?: ShellStorage | null
  /** The wall clock the shared rest is read against. */
  now?: () => number
}

export function CircuitBlock({ block, storage, now = Date.now }: CircuitBlockProps) {
  const shape = circuitShape(block)

  // Restored once, repaired against the block as it is *now*: a movement
  // swapped out since the last render shortens the circuit, and the record
  // must still describe a circuit that exists.
  const circuit = usePersistedCircuit(
    block.blockId,
    (stored) => (stored === null ? CIRCUIT_START : clampCircuitState(stored, shape)),
    storage,
  )

  // Read from the clock rather than accumulated, exactly as the session timer
  // is: a phone that locked during the rest comes back to the right number.
  const restElapsed = useElapsedSeconds(circuit.state.restStartedAt, now)
  const view = circuitView(circuit.state, shape, restElapsed)

  const resting = shape.size > 0 && view.phase === 'rest'
  const urgent = resting && view.restRemaining <= 10
  const loop = useInterfaceLoop('urgent', urgent)

  return (
    <BlockPanel
      block={block}
      // The round boundary's one countdown: the shipped `TimerDisplay`, a real
      // deadline with urgency in its last seconds, beside the card.
      timer={
        resting ? (
          <div
            style={{ display: 'flex', flexDirection: 'column' }}
            data-urgent={urgent ? 'true' : 'false'}
            {...loop}
          >
            <TimerDisplay seconds={view.restRemaining} />
          </div>
        ) : null
      }
      // The rounds the athlete recorded — the only field this structure
      // supplies. None recorded is no count at all, never an observed zero.
      completion={{
        outcome: shape.size === 0 || view.roundsCompleted === 0
          ? {}
          : { roundsCompleted: view.roundsCompleted },
      }}
    >
      {shape.size === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <>
          {/*
            At the top of the card, directly under the countdown it raises: on
            a phone the tap and the rest it starts are in view together, and
            the work below scrolls without taking the clock with it.
          */}
          <RoundRecord
            view={view}
            onFinishRound={() =>
              circuit.advanceTo(finishRound(circuit.state, shape, now()))
            }
            onEndRest={() =>
              circuit.advanceTo(advanceCircuit(circuit.state, shape, now()))
            }
            onTakeBack={() => circuit.advanceTo(takeBackRound(circuit.state, shape))}
          />

          <BlockPanel.Label>Each round:</BlockPanel.Label>

          <BlockPanel.MovementList label="Movements in this circuit">
            {block.exercises.map((exercise) => (
              <BlockPanel.MovementItem key={exercise.exerciseId}>
                <CircuitMovement exercise={exercise} />
              </BlockPanel.MovementItem>
            ))}
          </BlockPanel.MovementList>

          {/*
            Once, below the work, and only when there is rest to take: a
            circuit that prescribes none says nothing rather than `Rest: 0s`
            (superset-circuit-clarity.md §8).
          */}
          {shape.restSeconds > 0 && (
            <BlockPanel.Note>{shape.restSeconds}s rest between rounds</BlockPanel.Note>
          )}
        </>
      )}
    </BlockPanel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The rounds the athlete recorded
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One round recorded, from wherever the athlete is: the boundary, with its
 * shared rest stamped if the block prescribes any. There is no movement-by-
 * movement position to walk through first.
 */
function finishRound(state: CircuitState, shape: CircuitShape, now: number): CircuitState {
  return advanceCircuit(
    { round: state.round, position: shape.size, restStartedAt: null },
    shape,
    now,
  )
}

/**
 * The last recorded round, un-recorded: a mistaken tap is corrected back to
 * what was actually observed, and the rest it started goes with it.
 */
function takeBackRound(state: CircuitState, shape: CircuitShape): CircuitState {
  const last = shape.rounds === null ? state.round : Math.min(state.round, shape.rounds + 1)
  return { round: Math.max(1, last - 1), position: 1, restStartedAt: null }
}

/** `No rounds recorded`, `1 of 3 rounds recorded`, `2 rounds recorded`. */
function roundsRecordedText(view: CircuitView): string {
  if (view.roundsCompleted === 0) return 'No rounds recorded'
  const noun = view.rounds === null && view.roundsCompleted === 1 ? 'round' : 'rounds'
  return view.rounds === null
    ? `${view.roundsCompleted} ${noun} recorded`
    : `${view.roundsCompleted} of ${view.rounds} ${noun} recorded`
}

/**
 * The optional round record, in the phase the circuit is in. While the rest
 * runs, its own button ends it; otherwise one secondary tap records the round
 * the athlete just finished. Neither is needed to move on.
 */
function RoundRecord({
  view,
  onFinishRound,
  onEndRest,
  onTakeBack,
}: {
  view: CircuitView
  onFinishRound: () => void
  onEndRest: () => void
  onTakeBack: () => void
}) {
  return (
    <div
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      <BlockPanel.Label role="status">{roundsRecordedText(view)}</BlockPanel.Label>

      {view.phase === 'rest' && (
        <>
          <BlockPanel.Label>Rest between rounds</BlockPanel.Label>
          <Button variant="secondary" size="lg" icon={<Rest />} onClick={onEndRest}>
            Start round {view.round}
          </Button>
        </>
      )}

      {view.phase === 'work' && (
        <Button variant="secondary" size="lg" icon={<Check />} onClick={onFinishRound}>
          Finish round {view.round}
        </Button>
      )}

      {view.phase === 'finished' && (
        <BlockPanel.Note>Every prescribed round is recorded.</BlockPanel.Note>
      )}

      {view.roundsCompleted > 0 && (
        <TextAction onClick={onTakeBack}>Take back a round</TextAction>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// One movement of the round
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One movement, as the round prescribes it: its name, its per-round target
 * and its tempo, read rather than logged. `targetText` rather than
 * `prescriptionText`: the set count belongs to the block's rounds here.
 *
 * Load entry is a quiet action under it, opened per movement. Opened, the row
 * is the shared set logger — the one place a set is written from — and its
 * coaching; closed, the movement still offers its coaching on demand and says
 * how many sets are already logged, so a closed row never hides a record.
 */
function CircuitMovement({ exercise }: { exercise: ExerciseProgress }) {
  const { loggedSets } = useSetLogging()
  const [open, setOpen] = useState(false)
  const prescription = exercise.prescription
  const name = exerciseName(prescription.exercise_id)
  const logged = loggedSets(exercise.exerciseId).length

  if (open) {
    return (
      <>
        <ExerciseSetLogger
          exercise={exercise}
          ordinal={`${exercise.position}.`}
          // No rest per movement, stated or counted: a circuit rests once per
          // round, and that countdown is the round boundary's (EXE-05).
          statesRest={false}
          restSeconds={null}
        />
        <div>
          <TextAction
            aria-expanded="true"
            aria-label={`Hide load entry for ${name}`}
            onClick={() => setOpen(false)}
          >
            Hide load entry
          </TextAction>
        </div>
      </>
    )
  }

  return (
    <BlockPanel.Movement
      title={`${exercise.position}. ${name}`}
      detail={targetText(prescription)}
    >
      {prescription.tempo === null ? null : (
        <BlockPanel.Note>Tempo {prescription.tempo}</BlockPanel.Note>
      )}
      {logged === 0 ? null : (
        <BlockPanel.Note>
          {logged} {logged === 1 ? 'set' : 'sets'} logged
        </BlockPanel.Note>
      )}
      <div>
        <TextAction
          aria-expanded="false"
          aria-label={`Log load and reps for ${name}`}
          onClick={() => setOpen(true)}
        >
          Log load and reps
        </TextAction>
      </div>
      <ExerciseCoaching exercise={exercise} />
    </BlockPanel.Movement>
  )
}
