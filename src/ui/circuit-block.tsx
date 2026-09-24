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
import type { ExerciseProgress } from '../state/workout-progress'
import { BlockCompletionControl } from './block-completion-control'
import { Card } from './card'
import { ExerciseSetLogger } from './set-logger'
import { StructureBadge } from './workout-chrome'
import type { BlockRendererProps } from './block-renderers'

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
    circuit.advanceTo(advanceCircuit(circuit.state, shape, now()))
  }

  return (
    <Card>
      <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="clr-row" style={{ justifyContent: 'space-between' }}>
          <StructureBadge identity={block.identity} />
          <span style={labelStyle}>
            {block.exerciseCount} {block.exerciseCount === 1 ? 'movement' : 'movements'}
          </span>
        </div>

        {shape.size === 0 ? (
          <p style={{ margin: 0 }}>
            Nothing left to perform in this block — every movement in it was swapped
            out.
          </p>
        ) : (
          <>
            <p style={labelStyle}>{positionText(view)}</p>

            {view.phase === 'rest' && <RoundRest view={view} onSkip={advance} />}

            <p style={labelStyle}>Each round:</p>

            <ol
              aria-label="Movements in this circuit"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-300)',
              }}
            >
              {block.exercises.map((exercise) => (
                <CircuitMovement
                  key={exercise.exerciseId}
                  exercise={exercise}
                  marker={markerFor(exercise.position, view)}
                />
              ))}
            </ol>

            {/*
              Once, at the bottom, and only when there is rest to take: a
              circuit that prescribes none says nothing rather than `Rest: 0s`
              (superset-circuit-clarity.md §8).
            */}
            {shape.restSeconds > 0 && (
              <p style={{ margin: 0 }}>
                {shape.restSeconds}s rest between rounds
              </p>
            )}

            {/*
              One forward control, wherever the user is. While the rest is
              running it is the rest bar's own button — two "Start round 3"s,
              one in the bar and one at the foot of the card, would be the same
              tap twice over.
            */}
            {view.phase === 'work' && (
              <Button
                variant="primary"
                size="lg"
                icon={<ChevronRight />}
                onClick={advance}
              >
                {advanceLabel(view)}
              </Button>
            )}

            {view.phase === 'finished' && (
              <p style={{ margin: 0 }}>
                Every prescribed round is done. Record the block when you are ready.
              </p>
            )}
          </>
        )}

        {/*
          The rounds the user actually got through — the outcome this structure
          observed, and the only field it supplies. A circuit with nothing left
          to perform observed no rounds at all, and says so by supplying
          nothing rather than a zero (DATA_MODEL §8).
        */}
        <BlockCompletionControl
          blockId={block.blockId}
          outcome={shape.size === 0 ? {} : { roundsCompleted: view.roundsCompleted }}
          label="Complete circuit"
        />
      </div>
    </Card>
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

type MovementMarker = 'now' | 'next' | null

/**
 * Which movement is live. During rest it is the one the next round opens with
 * — labelled `NEXT` rather than `NOW`, because the user is resting and being
 * told to start would be wrong.
 */
function markerFor(position: number, view: CircuitView): MovementMarker {
  if (view.phase === 'finished') return null
  if (view.phase === 'rest') return position === 1 ? 'next' : null
  return position === view.position ? 'now' : null
}

const MARKER_WORDS: Readonly<Record<'now' | 'next', string>> = {
  now: 'Now',
  next: 'Next',
}

function CircuitMovement({
  exercise,
  marker,
}: {
  exercise: ExerciseProgress
  marker: MovementMarker
}) {
  return (
    <li
      // The status word above is the message; `aria-current` is how the same
      // fact reaches a screen reader without it being read as decoration.
      aria-current={marker === 'now' ? 'step' : undefined}
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {marker !== null && <p style={labelStyle}>{MARKER_WORDS[marker]}</p>}
      <ExerciseSetLogger exercise={exercise} ordinal={`${exercise.position}.`} />
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The shared rest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The round boundary: one countdown, taken once, between two rounds.
 *
 * `TimerDisplay` is the shipped countdown and this is what it is for — a real
 * deadline, urgency in the last seconds, digits that tumble. The button beside
 * it is the same `advance` the movements use, so ending the rest early and
 * letting it run out arrive at the same state rather than at two.
 */
function RoundRest({ view, onSkip }: { view: CircuitView; onSkip: () => void }) {
  return (
    <div
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      <p style={labelStyle}>Rest between rounds</p>
      <TimerDisplay seconds={view.restRemaining} />
      <Button variant="primary" size="lg" icon={<Rest />} onClick={onSkip}>
        Start round {view.round}
      </Button>
    </div>
  )
}

const labelStyle = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
} as const
