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
 *   · **Nothing is compulsory.** There is no per-movement step. The round
 *     clock is optional: Start round 1 starts it, Finish round records the
 *     round and starts the shared rest, and the next round's clock starts when
 *     that rest ends (REQ-017). The section's forward action saves the block
 *     with or without any of it.
 *   · **Load entry is compact and optional.** Each movement is one read-only
 *     row with a quiet `Rest` entry action, which opens the shared
 *     half-sheet for that movement only and writes through the shell's one
 *     set path (`ExerciseSetLogger`). It is never the round clock's control.
 *   · **Round times are durations.** Each finished round's elapsed time is
 *     listed; its stored wall-clock start and end are kept but not drawn.
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
  Play,
  Rest,
  TextAction,
  TimerDisplay,
} from '../design-system/index'
import {
  circuitShape,
  circuitView,
  clampCircuitState,
  CIRCUIT_START,
  endRest,
  finishRound,
  roundDuration,
  startRound,
  takeBackRound,
  type CircuitView,
  type RoundTiming,
} from '../state/circuit'
import { exerciseName, targetText } from '../state/prescription'
import { movementCountdownSeconds } from '../state/movement-countdown'
import { useSetLogging } from '../state/set-logging'
import { formatElapsed, spokenElapsed, useElapsedSeconds } from '../state/workout-clock'
import {
  usePersistedCircuit,
  type ShellStorage,
} from '../state/workout-persistence'
import type { ExerciseProgress } from '../state/workout-progress'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel } from './block-renderers-frame'
import { ExerciseCoaching } from './exercise-coaching'
import { ExerciseSetLogger } from './set-logger'
import { MovementCountdown } from './movement-countdown'
import { useInterfaceLoop } from './motion'
import { TimerFrame } from './workout-chrome'

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
  // The round's own elapsed clock (REQ-017), read the same way. While a rest
  // runs its start is the rest's end, so it is running only in the work phase.
  const roundStartedAt = circuit.state.roundStartedAt ?? null
  const roundSeconds = useElapsedSeconds(roundStartedAt, now)
  const roundClock = view.phase === 'work' && roundStartedAt !== null ? roundSeconds : null

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
            roundClock={roundClock}
            onStartRound={() => circuit.advanceTo(startRound(circuit.state, shape, now()))}
            onFinishRound={() =>
              circuit.advanceTo(finishRound(circuit.state, shape, now()))
            }
            onEndRest={() => circuit.advanceTo(endRest(circuit.state, shape, now()))}
            onTakeBack={() => circuit.advanceTo(takeBackRound(circuit.state, shape))}
          />

          <RoundHistory history={circuit.state.history ?? []} />

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

/** `No rounds recorded`, `1 of 3 rounds recorded`, `2 rounds recorded`. */
function roundsRecordedText(view: CircuitView): string {
  if (view.roundsCompleted === 0) return 'No rounds recorded'
  const noun = view.rounds === null && view.roundsCompleted === 1 ? 'round' : 'rounds'
  return view.rounds === null
    ? `${view.roundsCompleted} ${noun} recorded`
    : `${view.roundsCompleted} of ${view.rounds} ${noun} recorded`
}

/**
 * The optional round clock, in the phase the circuit is in (REQ-017). The
 * first round's clock is started with Start round 1; while it runs, Finish
 * round records the round and starts the shared rest; the next round's clock
 * starts when that rest ends, or from Start round if it is ended early. None
 * of it is needed to move on, and none of it logs a movement: these are clock
 * controls, kept apart from each movement's own optional logging.
 */
function RoundRecord({
  view,
  roundClock,
  onStartRound,
  onFinishRound,
  onEndRest,
  onTakeBack,
}: {
  view: CircuitView
  /** The running round's elapsed seconds; null when no round clock runs. */
  roundClock: number | null
  onStartRound: () => void
  onFinishRound: () => void
  onEndRest: () => void
  onTakeBack: () => void
}) {
  return (
    <div
      role="group"
      aria-label="Round clock"
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

      {view.phase === 'work' && roundClock === null && (
        <Button variant="secondary" size="lg" icon={<Play />} onClick={onStartRound}>
          Start round {view.round}
        </Button>
      )}

      {view.phase === 'work' && roundClock !== null && (
        <>
          <RoundElapsed round={view.round} seconds={roundClock} />
          <Button variant="secondary" size="lg" icon={<Check />} onClick={onFinishRound}>
            Finish round {view.round}
          </Button>
        </>
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

/** The running round's elapsed time: a count-up, so the shared timer frame. */
function RoundElapsed({ round, seconds }: { round: number; seconds: number }) {
  return (
    <TimerFrame
      label={`Round ${round} time`}
      caption={`Round ${round}`}
      text={formatElapsed(seconds)}
      spoken={spokenElapsed(seconds)}
      size="var(--label-lg-size)"
    />
  )
}

/**
 * Each finished round's elapsed duration, in order. Only the duration is
 * shown: the wall-clock start and end stay in the stored history, and are not
 * drawn (REQ-017 — the owner crossed both out).
 */
function RoundHistory({ history }: { history: readonly RoundTiming[] }) {
  if (history.length === 0) return null

  return (
    <div className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
      <BlockPanel.Label aria-hidden="true">Round times</BlockPanel.Label>
      <ol aria-label="Round times" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {history.map((timing) => (
          <li
            key={`${timing.round}:${timing.startedAt}`}
            className="clr-row"
            style={{ justifyContent: 'space-between', gap: 'var(--spacing-200)' }}
          >
            <BlockPanel.Label>Round {timing.round}</BlockPanel.Label>
            <BlockPanel.Note style={{ fontFamily: 'var(--font-data)' }}>
              <span aria-hidden="true">{formatElapsed(roundDuration(timing))}</span>
              <span className="a11y-hidden">{spokenElapsed(roundDuration(timing))}</span>
            </BlockPanel.Note>
          </li>
        ))}
      </ol>
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
  const sets = loggedSets(exercise.exerciseId)
  const logged = sets.length
  const taken = new Set(sets.map((set) => set.setNumber))
  let nextSet = 1
  while (taken.has(nextSet)) nextSet += 1
  const countdownSeconds = movementCountdownSeconds(prescription, nextSet)

  return (
    <>
      {open ? (
        <ExerciseSetLogger
          exercise={exercise}
          ordinal={`${exercise.position}.`}
          // No rest per movement, stated or counted: a circuit rests once per
          // round, and that countdown is the round boundary's (EXE-05).
          statesRest={false}
          restSeconds={null}
          // The circuit movement owns this clock independently of optional
          // load entry. Opening the logger must not create a second one.
          showCountdown={false}
          // Its rest is the round boundary's, so its entry only opens the sheet.
          // The row's one tap opens the shared half-sheet straight away
          // (REQ-017); its Minimize and Cancel leave the movement unlogged.
          openSheetOnMount
        />
      ) : (
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
              aria-label={`Rest for ${name}`}
              onClick={() => setOpen(true)}
            >
              Rest
            </TextAction>
          </div>
          <ExerciseCoaching exercise={exercise} />
        </BlockPanel.Movement>
      )}

      {/* A fixed child of this movement's row: load entry can mount/unmount
          beside it without replacing the clock or losing its deadline. */}
      {countdownSeconds === null ? null : (
        <MovementCountdown
          key={`${nextSet}:${countdownSeconds}`}
          seconds={countdownSeconds}
          movement={name}
        />
      )}

      {open ? (
        <div>
          <TextAction
            aria-expanded="true"
            aria-label={`Hide load entry for ${name}`}
            onClick={() => setOpen(false)}
          >
            Hide load entry
          </TextAction>
        </div>
      ) : null}
    </>
  )
}
