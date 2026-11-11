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
 * slot — the shared whole timer body (`DeadlineTimer`, TASK-007: C19, R103),
 * one frame filling the block's width with its digits centred, never put
 * inside another frame. It reads the circuit's own rest, never the session's
 * one rest between sets (C21).
 *
 * TASK-021 (REQ-021; C48, G13; R18, R103, R104, R105; V13) — the recorded
 * round, confirmed in the shared focused logging dialog (`LoggingOverlay`,
 * accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `?state=circuit-round`; LOGGING-FIELDS "Circuit round / take back"):
 *
 *   · **Finish round N opens `Round N recorded`.** The dialog's own header —
 *     the title and the framed icon-only "Close log" X, aligned to the
 *     title's visible top however it wraps — then the round's recorded time
 *     read back from the stored history, the circuit's own rest between
 *     rounds as the shared whole timer body at the dialog's full content
 *     width (R103), and Take back this round.
 *   · **One controller, the same semantics.** The dialog holds no clock and
 *     no record: its rest is `circuit.ts`'s rest, read from the same stamp,
 *     moved off the card while the dialog draws it so it is never drawn
 *     twice; Take back this round is `takeBackRound`, exactly the card's Take
 *     back a round. Nothing about a ladder or another format's state machine
 *     is involved, and nothing is written but the circuit's own record.
 *   · **The rest decides how long it stays.** A round recorded into a rest
 *     closes when that rest ends — running out, or ended early from the
 *     card's Start round — and the next round's clock runs as before; it is
 *     never reopened. A round recorded with no rest after it (none
 *     prescribed, or the last round) stays until it is closed. The X and
 *     Escape close it without changing anything: the rest goes on, back on
 *     the card. Focus returns to the round clock's own control.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import {
  Button,
  Check,
  Play,
  Rest,
  TextAction,
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
import { circuitRestDeadline } from '../state/countdown-urgency'
import { exerciseName, targetText } from '../state/prescription'
import { movementCountdownSeconds, useMovementCountdown } from '../state/movement-countdown'
import { useSetLogging } from '../state/set-logging'
import { formatCountdownReading, roundReading } from '../state/timed-clock'
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
import { liveMovementReadings } from './refinements/movement-readings'
import { DeadlineTimer } from './refinements/deadline-timer'
import { LoggingOverlay } from './refinements/logging-overlay'

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

  // TASK-021: the round just recorded, while its dialog may be showing. Not
  // persisted — a reload comes back to the card, never to the dialog.
  const [recorded, setRecorded] = useState<RecordedRound | null>(null)
  const recordedOpen =
    recorded !== null &&
    // Taken back, from the dialog or the card: there is nothing to confirm.
    view.roundsCompleted >= recorded.round &&
    // Recorded into a rest: the dialog lasts as long as that rest.
    (!recorded.rested || resting)
  const recordedTiming =
    recorded === null
      ? undefined
      : [...(circuit.state.history ?? [])].reverse().find((timing) => timing.round === recorded.round)

  // Focus returns to the round clock's own control once the dialog has
  // closed, however it closed — the X, Escape, Take back this round or the
  // rest ending — when it would otherwise be left on the page itself.
  const roundClockGroup = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !recordedOpen) returnFocusToRoundClock(roundClockGroup.current)
    wasOpen.current = recordedOpen
  }, [recordedOpen])

  const finish = () => {
    const next = finishRound(circuit.state, shape, now())
    if (next === circuit.state) return
    circuit.advanceTo(next)
    setRecorded({ round: view.round, rested: next.restStartedAt !== null })
  }
  const takeBack = () => {
    circuit.advanceTo(takeBackRound(circuit.state, shape))
    setRecorded(null)
  }

  return (
    <BlockPanel
      block={block}
      // The round boundary's one countdown: the shared whole timer body, a
      // real deadline, beside the card. Its warning is the shared one, read
      // from the rest's own deadline (TASK-008: C22, C23, C24, C61): colour
      // from ten seconds left, the breathe with the one soft screen-edge aura
      // in the last five.
      // While the recorded round's dialog is open it draws this same rest at
      // its full width (TASK-021), so the card does not draw it a second time.
      timer={
        resting && !recordedOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <DeadlineTimer reading={formatCountdownReading(view.restRemaining)} deadline={circuitRestDeadline(view)} />
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

          <RecordedRoundLog
            open={recordedOpen}
            round={recorded?.round ?? view.round}
            timing={recordedTiming}
            view={view}
            resting={resting}
            onClose={() => setRecorded(null)}
            onTakeBack={takeBack}
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
  groupRef,
  view,
  roundClock,
  onStartRound,
  onFinishRound,
  onEndRest,
  onTakeBack,
}: {
  /** The group, so focus can come back to its control (TASK-021). */
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

/**
 * The running round's elapsed time: a count-up, so the shared whole timer
 * body, filling the card's width with its caption and digits centred (C19).
 */
function RoundElapsed({ round, seconds }: { round: number; seconds: number }) {
  return (
    <DeadlineTimer
      reading={roundReading(round, seconds)}
      caption={`Round ${round}`}
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
// The recorded round (TASK-021)
// ─────────────────────────────────────────────────────────────────────────────

/** The round Finish round just recorded, and whether a rest began with it. */
interface RecordedRound {
  readonly round: number
  readonly rested: boolean
}

/**
 * The page has lost focus when it is nowhere, on the page itself, or still on
 * a control inside a dialog that has closed.
 */
function returnFocusToRoundClock(group: HTMLElement | null) {
  if (group === null || !group.isConnected) return
  const active = group.ownerDocument.activeElement
  const dialog = active?.closest('dialog') ?? null
  const stranded =
    active === null ||
    active === group.ownerDocument.body ||
    !active.isConnected ||
    (dialog !== null && !dialog.open)
  if (stranded) group.querySelector<HTMLButtonElement>('button')?.focus()
}

/**
 * `Round N recorded`: the shared focused logging dialog (R7 reviewed circuit
 * confirmation, V13; LOGGING-FIELDS "Circuit round / take back"). Its header
 * is the overlay's — the title and the framed icon-only X (R104, R105). Under
 * it, the recorded round time read back from the stored history (a round
 * whose clock never ran says only that it was recorded), the circuit's own
 * rest at the dialog's full content width (R103), and Take back this round.
 * Portalled to the document body as the other focused logs are, so nothing on
 * the card is inherited into it.
 */
function RecordedRoundLog({
  open,
  round,
  timing,
  view,
  resting,
  onClose,
  onTakeBack,
}: {
  open: boolean
  round: number
  timing: RoundTiming | undefined
  view: CircuitView
  resting: boolean
  onClose: () => void
  onTakeBack: () => void
}) {
  const seconds = timing === undefined ? null : roundDuration(timing)
  return createPortal(
    <LoggingOverlay open={open} title={`Round ${round} recorded`} onClose={onClose}>
      {open ? (
        <div
          data-circuit-recorded-round=""
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--logging-section-gap)', minWidth: 0 }}
        >
          <BlockPanel.Note role="status">
            {seconds === null ? (
              'Round recorded'
            ) : (
              <>
                <span aria-hidden="true" style={{ fontFamily: 'var(--font-data)' }}>{formatElapsed(seconds)}</span>
                <span className="a11y-hidden">{spokenElapsed(seconds)}</span> round time recorded
              </>
            )}
          </BlockPanel.Note>

          {resting ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--logging-label-gap)', minWidth: 0 }}>
              <BlockPanel.Label>Rest after round {round}</BlockPanel.Label>
              <DeadlineTimer
                reading={formatCountdownReading(view.restRemaining)}
                deadline={circuitRestDeadline(view)}
              />
            </div>
          ) : null}

          <div className="clr-timed-actions">
            <Button variant="secondary" onClick={onTakeBack}>
              Take back this round
            </Button>
          </div>
        </div>
      ) : null}
    </LoggingOverlay>,
    document.body,
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
  const [open, setOpen] = useState(false)
  const prescription = exercise.prescription
  const name = exerciseName(prescription.exercise_id)
  const sets = loggedSets(exercise.exerciseId)
  const logged = sets.length
  const taken = new Set(sets.map((set) => set.setNumber))
  let nextSet = 1
  while (taken.has(nextSet)) nextSet += 1
  const countdownSeconds = movementCountdownSeconds(prescription, nextSet)
  // R31, R132: the same name, compact equipment and prescribed load the open
  // logger and Review show.
  const { equipment, load: prescribedLoad } = liveMovementReadings(prescription, weightUnit)
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
          title={name}
          ordinal={`${exercise.position}.`}
          detail={targetText(prescription)}
          // R31: the same prescribed load the open logger and Review show.
          load={prescribedLoad}
          // The same compact equipment the open logger shows (R132).
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
