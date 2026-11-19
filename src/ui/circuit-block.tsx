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
 *
 * A3 TASK-107 (REQ-021; C48, G13; R18; JOURNEY-021) — the recorded round in
 * Round 7's dialog (`LoggingOverlay`, the presentation's logging dialog;
 * gallery state `circuit-round`), wired to this one circuit controller in
 * place of Round 7's in-memory round clock:
 *
 *   · **Finish round N opens `Round N recorded`.** Round 7's dialog: the title
 *     and its icon-only Close log X, then the round time read back from the
 *     stored history (`circuit.state.history`; a round whose clock never ran
 *     says only that it was recorded), the circuit's own rest between rounds
 *     at the dialog's full width, and Take back this round.
 *   · **One controller, one clock.** The dialog holds no clock and no record:
 *     its rest is `circuit.ts`'s rest, read from the same stamp and drawn in
 *     the dialog instead of beside the card while the dialog holds it (one
 *     clock, drawn once); Take back this round is `takeBackRound`, the card's
 *     Take back a round, and the round re-opened resumes its own clock.
 *   · **The rest decides how long it stays.** A round recorded into a rest
 *     closes when that rest ends — run out, or ended from the card's Start
 *     round — and records nothing more. With no rest to run (none prescribed,
 *     or the last round) the confirmation shows and the dialog then closes
 *     itself (owner decision 5, 2026-11-16). The X and Escape close it without
 *     changing anything; the rest goes on, back on the card.
 *   · **Focus returns to the round clock's control** once the dialog has
 *     closed, however it closed. Not persisted: a reload comes back to the
 *     card, never to the dialog.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { LoggingOverlay } from './logging-overlay'
import { useWorkoutExperiencePresentation } from './workout-experience-presentation'

import {
  Button,
  Check,
  Play,
  Rest,
  TextAction,
} from '../design-system/index'
import { CountdownDisplay } from './timer-display'
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
import { movementCountdownSeconds, useMovementCountdown } from '../state/movement-countdown'
import { distinctLoadText, equipmentName, loadText } from '../state/review'
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
import { MovementCountdownView } from './movement-countdown'
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

  // A3 TASK-107: the round Finish round just recorded, while its dialog shows
  // it (open, or leaving through its exit). Only under the presentation's
  // logging dialog, as Round 7 had it; never persisted.
  const confirms = useWorkoutExperiencePresentation()?.loggingOverlay !== undefined
  const [recorded, setRecorded] = useState<RecordedRound | null>(null)
  const recordedOpen =
    recorded !== null &&
    !recorded.closed &&
    // Taken back: there is nothing to confirm.
    view.roundsCompleted >= recorded.round &&
    // Recorded into a rest: the dialog lasts as long as that rest.
    (!recorded.rested || resting)
  // The round time, read back from the stored history.
  const recordedTiming =
    recorded === null
      ? undefined
      : [...(circuit.state.history ?? [])].reverse().find((timing) => timing.round === recorded.round)

  // Owner decision 5 (2026-11-16): with no rest to run, the confirmation shows
  // and the dialog then closes itself, on the frame after it opened.
  useEffect(() => {
    if (recorded === null || recorded.rested || recorded.closed) return
    const frame = requestAnimationFrame(() => {
      setRecorded((current) => (current === recorded ? { ...current, closed: true } : current))
    })
    return () => cancelAnimationFrame(frame)
  }, [recorded])

  // Focus returns to the round clock's own control once the dialog has closed.
  const roundClockGroup = useRef<HTMLDivElement>(null)

  const finish = () => {
    const next = finishRound(circuit.state, shape, now())
    if (next === circuit.state) return
    circuit.advanceTo(next)
    if (confirms) setRecorded({ round: view.round, rested: next.restStartedAt !== null, closed: false })
  }
  const takeBack = () => circuit.advanceTo(takeBackRound(circuit.state, shape))

  return (
    <BlockPanel
      block={block}
      // The round boundary's one countdown: the shipped `TimerDisplay`, a real
      // deadline with urgency in its last seconds, beside the card. While the
      // recorded round's dialog holds this same rest (A3 TASK-107), the card
      // does not draw it a second time.
      timer={
        resting && recorded === null ? (
          <div
            style={{ display: 'flex', flexDirection: 'column' }}
            data-urgent={urgent ? 'true' : 'false'}
                >
            <CountdownDisplay seconds={view.restRemaining} />
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
            groupRef={roundClockGroup}
            view={view}
            roundClock={roundClock}
            onStartRound={() => circuit.advanceTo(startRound(circuit.state, shape, now()))}
            onFinishRound={finish}
            onEndRest={() => circuit.advanceTo(endRest(circuit.state, shape, now()))}
            onTakeBack={takeBack}
          />

          {/* Drawn in place (Round 7), beside the round clock rather than in
              its group, so the group's one status stays the rounds recorded. */}
          {confirms && (
            <RecordedRoundLog
              open={recordedOpen}
              recorded={recorded}
              fallbackRound={view.round}
              timing={recordedTiming}
              view={view}
              onClose={() => setRecorded((current) => (current === null ? null : { ...current, closed: true }))}
              onAfterClose={() => {
                setRecorded(null)
                returnFocusToRoundClock(roundClockGroup.current)
              }}
              onTakeBack={takeBack}
            />
          )}

          <RoundHistory history={circuit.state.history ?? []} />

          <BlockPanel.Label>Each round:</BlockPanel.Label>

          <BlockPanel.MovementList label="Movements in this circuit">
            {block.exercises.map((exercise) => (
              <BlockPanel.MovementItem key={exercise.exerciseId}>
                {/* A3 TASK-106 (TASK-044, C21): a movement's entry shows the
                    session's one rest, as every set entry does; the circuit's
                    rest between rounds stays its own clock, drawn once, on the
                    card. Round 7 drew the round's rest in the entry's place,
                    which left the session's running rest drawn nowhere while
                    the entry was open. */}
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
  groupRef,
  view,
  roundClock,
  onStartRound,
  onFinishRound,
  onEndRest,
  onTakeBack,
}: {
  /** The group, so focus can come back to its control (A3 TASK-107). */
  groupRef: RefObject<HTMLDivElement | null>
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
      ref={groupRef}
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
// The recorded round (A3 TASK-107)
// ─────────────────────────────────────────────────────────────────────────────

/** The round Finish round just recorded, while its dialog shows it. */
interface RecordedRound {
  readonly round: number
  /** A rest between rounds began with it: the dialog lasts as long as that rest. */
  readonly rested: boolean
  /** Closed by its X or Escape, or done with no rest to wait for: leaving. */
  readonly closed: boolean
}

/**
 * Once the dialog has closed, focus goes back to the round clock's own
 * control — whatever it now is: Start round N in a rest, Finish round N while
 * a round's clock runs, Take back a round once every round is recorded.
 */
function returnFocusToRoundClock(group: HTMLElement | null) {
  if (group === null || !group.isConnected) return
  group.querySelector<HTMLButtonElement>('button')?.focus()
}

/**
 * `Round N recorded`: Round 7's dialog (gallery state `circuit-round`). Its
 * header is the overlay's — the title and the icon-only X. Under it the round
 * time read back from the stored history, the circuit's own rest while one
 * runs, and Take back this round. Its body stays drawn while it leaves.
 */
function RecordedRoundLog({
  open,
  recorded,
  fallbackRound,
  timing,
  view,
  onClose,
  onAfterClose,
  onTakeBack,
}: {
  open: boolean
  recorded: RecordedRound | null
  /** The title while nothing is recorded (the dialog is closed then). */
  fallbackRound: number
  timing: RoundTiming | undefined
  view: CircuitView
  onClose: () => void
  onAfterClose: () => void
  onTakeBack: () => void
}) {
  const seconds = timing === undefined ? null : roundDuration(timing)
  return (
    <LoggingOverlay
      open={open}
      title={`Round ${recorded?.round ?? fallbackRound} recorded`}
      onClose={onClose}
      onAfterClose={onAfterClose}
    >
      {recorded === null ? null : (
        <>
          <p role="status">{seconds === null ? 'Round recorded' : `${formatElapsed(seconds)} round time recorded`}</p>
          {view.phase === 'rest' && <div aria-label="Rest between rounds"><CountdownDisplay seconds={view.restRemaining} /></div>}
          <Button variant="secondary" onClick={onTakeBack}>Take back this round</Button>
        </>
      )}
    </LoggingOverlay>
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
  const { loggedSets, weightUnit } = useSetLogging()
  const presentation = useWorkoutExperiencePresentation()
  const [open, setOpen] = useState(false)
  const prescription = exercise.prescription
  const name = exerciseName(prescription.exercise_id)
  const equipment = equipmentName(prescription.equipment_used)
  const guidance = presentation?.suggestedLoads?.[prescription.exercise_id]
  const load = distinctLoadText(guidance === undefined ? (prescription.load_type === null ? null : loadText(prescription.load_type, prescription.load_value, weightUnit)) : guidance, equipment)

  const sets = loggedSets(exercise.exerciseId)
  const logged = sets.length
  const taken = new Set(sets.map((set) => set.setNumber))
  let nextSet = 1
  while (taken.has(nextSet)) nextSet += 1
  const countdownSeconds = movementCountdownSeconds(prescription, nextSet)
  // The row holds the movement's one clock, armed for the set it times, so
  // load entry opening or closing swaps the card it is drawn in without
  // replacing the clock or losing its deadline (B05-06).
  const clock = useMovementCountdown(
    countdownSeconds ?? 0,
    Date.now,
    `${nextSet}:${countdownSeconds}`,
  )
  const countdown =
    countdownSeconds === null ? null : <MovementCountdownView clock={clock} movement={name} />

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
          // load entry. Opening the logger draws it; it never creates another.
          countdown={countdown}
          // Its rest is the round boundary's, so its entry only opens the sheet.
          // The row's one tap opens the shared half-sheet straight away
          // (REQ-017); its Minimize and Cancel leave the movement unlogged.
          openSheetOnMount
        />
      ) : (
        <BlockPanel.Movement
          title={`${exercise.position}. ${name}`}
          detail={targetText(prescription)}
          load={load}
          // The same equipment tier the open logger shows (B05-04).
          context={equipment}
        >
          {prescription.tempo === null ? null : (
            <BlockPanel.Note>Tempo {prescription.tempo}</BlockPanel.Note>
          )}
          {logged === 0 ? null : (
            <BlockPanel.Note>
              {logged} {logged === 1 ? 'set' : 'sets'} logged
            </BlockPanel.Note>
          )}
          {countdown}
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
