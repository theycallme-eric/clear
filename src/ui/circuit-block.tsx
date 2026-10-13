/**
 * EXE-03 — the circuit renderer: rounds × movements, and the one tap that
 * moves between them. This is the IA's `CircuitRenderer` (IA.md §3), and the
 * rest bar it raises at a round boundary is its `RestTimerBar`.
 *
 * Everything the structure is comes from `workout_blocks` and from nothing
 * else: the round count, the movements in their prescribed order, and the
 * shared rest between rounds (`round_rest_seconds`). The clarity spec's whole
 * argument for circuits is that the block owns those numbers — a circuit whose
 * members each carried their own rest is exactly the "Rest: 0s" noise
 * `superset-circuit-clarity.md` §8 exists to remove — so this file reads
 * `BlockProgress` and computes nothing of its own about the prescription.
 *
 * What it does own is *where the user is*, and that is the part the database
 * cannot answer. `circuit.ts` holds the arithmetic as a pure function and
 * `workout-persistence.ts` writes it down on every tap, so a refresh in the
 * middle of round three comes back to the middle of round three rather than to
 * the top of the block (SES-01).
 *
 * Two rules the spec is explicit about, both visible below:
 *   · rest is honored **once per round**, not once per exercise — it is the
 *     block's, it is shown once as `60s REST BETWEEN ROUNDS`, and it is
 *     counted down once at each round boundary;
 *   · the current movement is named in words (`NOW`, `NEXT`) and carries
 *     `aria-current`, because position is never colour alone.
 *
 * It draws with the shared block frame (`block-renderers-frame.tsx`): the one
 * card, the identity row and the single completion are `BlockPanel`'s, the
 * movements are rows of its list, and the rest countdown goes to its `timer`
 * slot — `TimerDisplay` is already a card, and is never put inside another.
 */
import { Button, ChevronRight, Rest, TimerDisplay } from '../design-system/index'
import {
  advanceCircuit,
  circuitShape,
  circuitView,
  clampCircuitState,
  CIRCUIT_START,
  type CircuitView,
} from '../state/circuit'
import { useElapsedSeconds } from '../state/workout-clock'
import {
  usePersistedCircuit,
  type ShellStorage,
} from '../state/workout-persistence'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel, type BlockMovementMarker } from './block-renderers-frame'
import { ExerciseSetLogger } from './set-logger'

export interface CircuitBlockProps extends BlockRendererProps {
  /** Injected by a test; the shell's own storage otherwise. */
  storage?: ShellStorage | null
  /** The wall clock the shared rest is read against. */
  now?: () => number
}

export function CircuitBlock({ block, storage, now = Date.now }: CircuitBlockProps) {
  const shape = circuitShape(block)

  // Restored once, repaired against the block as it is *now*: a movement
  // swapped out since the last render shortens the circuit, and the user
  // belongs at a position that still exists.
  const circuit = usePersistedCircuit(
    block.blockId,
    (stored) => (stored === null ? CIRCUIT_START : clampCircuitState(stored, shape)),
    storage,
  )

  // Read from the clock rather than accumulated, exactly as the session timer
  // is: a phone that locked during the rest comes back to the right number.
  const restElapsed = useElapsedSeconds(circuit.state.restStartedAt, now)
  const view = circuitView(circuit.state, shape, restElapsed)

  const advance = () => {
    // The displayed work action must advance, not consume a tap clearing a
    // rest whose deadline has already passed. Active-rest skip stays unchanged.
    const state =
      view.phase === 'work' && circuit.state.restStartedAt !== null
        ? { ...circuit.state, restStartedAt: null }
        : circuit.state
    circuit.advanceTo(advanceCircuit(state, shape, now()))
  }

  const resting = shape.size > 0 && view.phase === 'rest'

  return (
    <BlockPanel
      block={block}
      // The round boundary's one countdown: the shipped `TimerDisplay`, a real
      // deadline with urgency in its last seconds, beside the card.
      timer={resting ? <TimerDisplay seconds={view.restRemaining} /> : null}
      // The rounds the user actually got through — the outcome this structure
      // observed, and the only field it supplies. A circuit with nothing left
      // to perform observed no rounds at all, and says so by supplying
      // nothing rather than a zero (DATA_MODEL §8).
      completion={{
        outcome: shape.size === 0 ? {} : { roundsCompleted: view.roundsCompleted },
        label: 'Complete circuit',
      }}
    >
      {shape.size === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <>
          <BlockPanel.Label>{positionText(view)}</BlockPanel.Label>

          {view.phase === 'rest' && <RoundRest view={view} onSkip={advance} />}

          <BlockPanel.Label>Each round:</BlockPanel.Label>

          <BlockPanel.MovementList label="Movements in this circuit">
            {block.exercises.map((exercise) => (
              <BlockPanel.MovementItem
                key={exercise.exerciseId}
                marker={markerFor(exercise.position, view)}
              >
                {/*
                  No rest bar per movement: a circuit rests once per round, and
                  that countdown is the round boundary's (EXE-05).
                */}
                <ExerciseSetLogger
                  exercise={exercise}
                  ordinal={`${exercise.position}.`}
                  restSeconds={null}
                />
              </BlockPanel.MovementItem>
            ))}
          </BlockPanel.MovementList>

          {/*
            Once, at the bottom, and only when there is rest to take: a
            circuit that prescribes none says nothing rather than `Rest: 0s`
            (superset-circuit-clarity.md §8).
          */}
          {shape.restSeconds > 0 && (
            <BlockPanel.Note>{shape.restSeconds}s rest between rounds</BlockPanel.Note>
          )}

          {/*
            One forward control, wherever the user is. While the rest is
            running it is the rest's own button — two "Start round 3"s, one
            under the rest line and one at the foot of the card, would be the
            same tap twice over.
          */}
          {view.phase === 'work' && (
            <Button variant="primary" size="lg" icon={<ChevronRight />} onClick={advance}>
              {advanceLabel(view)}
            </Button>
          )}

          {view.phase === 'finished' && (
            <BlockPanel.Note>
              Every prescribed round is done. Record the block when you are ready.
            </BlockPanel.Note>
          )}
        </>
      )}
    </BlockPanel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Where the user is
// ─────────────────────────────────────────────────────────────────────────────

/** `Round 2 of 3 · Movement 1 of 3`, or the same without a round count. */
function positionText(view: CircuitView): string {
  const round = view.rounds === null ? `Round ${view.round}` : `Round ${view.round} of ${view.rounds}`

  switch (view.phase) {
    case 'finished':
      return `${round} · Complete`
    case 'rest':
      return `${round} · Rest`
    case 'work':
      return `${round} · Movement ${view.position} of ${view.size}`
  }
}

/**
 * The forward action while the user is working, worded for what the tap
 * actually does — the last movement of a round says it finishes the round,
 * because that one tap is also what starts the next one.
 */
function advanceLabel(view: CircuitView): string {
  return view.position < view.size ? 'Next movement' : `Finish round ${view.round}`
}

/**
 * Which movement is live. During rest it is the one the next round opens with
 * — labelled `NEXT` rather than `NOW`, because the user is resting and being
 * told to start would be wrong. The word and `aria-current` are
 * `BlockPanel.MovementItem`'s to draw.
 */
function markerFor(position: number, view: CircuitView): BlockMovementMarker {
  if (view.phase === 'finished') return null
  if (view.phase === 'rest') return position === 1 ? 'next' : null
  return position === view.position ? 'now' : null
}

// ─────────────────────────────────────────────────────────────────────────────
// The shared rest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The round boundary, inside the block's card: the rest in words, and the one
 * control that ends it. The countdown itself is `BlockPanel`'s `timer`.
 *
 * The button is the same `advance` the movements use, so ending the rest early
 * and letting it run out arrive at the same state rather than at two.
 */
function RoundRest({ view, onSkip }: { view: CircuitView; onSkip: () => void }) {
  return (
    <div
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      <BlockPanel.Label>Rest between rounds</BlockPanel.Label>
      <Button variant="primary" size="lg" icon={<Rest />} onClick={onSkip}>
        Start round {view.round}
      </Button>
    </div>
  )
}
