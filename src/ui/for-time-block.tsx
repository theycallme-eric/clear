/**
 * EXE-04b — the For Time renderer: a prescribed amount of work, raced against a
 * cap, and the two different ways that race can end.
 *
 * This is the IA's `TimedRenderer` in its For Time contract (IA.md §3), and the
 * whole structure is one measurement — how long it took — so the screen is built
 * around the one thing the requirement insists on: **the two completion paths are
 * reachable and visually distinct.**
 *
 *   · **Finished under the cap** is a result. The clock stops at the finish, not
 *     at the cap (`for-time.ts` freezes the elapsed reading between the two
 *     stamps), the readout keeps the selection-green treatment a good outcome
 *     gets, and it is stated in words with a tick.
 *   · **Cap reached** is a different result, not a missing one. The readout stops
 *     at the cap, takes the urgency treatment, and is stated in words with a
 *     warning glyph.
 *
 * **Urgency appears near the cap and nowhere else** (colour doctrine, ATOMIC.md
 * §3): red here is time pressure, never danger. So it is scoped to the last ten
 * seconds before the cap (TASK-008, C23: the shared warning's colour at ten,
 * held while paused) and to the capped outcome itself, and it never arrives as
 * hue alone — the words change ("Cap in 0:07 — finish now" while it runs), a
 * glyph appears beside them, and in the last five seconds of a running race the
 * readout breathes with the one soft screen-edge aura. The breathe is still
 * under reduced motion, which is exactly why the words have to carry it too.
 *
 * It draws with the shared block frame (`block-renderers-frame.tsx`): the one
 * card, the identity row and the single completion are `BlockPanel`'s, the
 * movements are rows of its list, and the clock is handed to its `timer` slot —
 * a timer is its own card, with its words inside it, and is never put inside
 * another.
 *
 * What this file does *not* own: the `block_results` write, which is the shell's
 * for every structure type (EXE-01). It supplies `elapsed_seconds` and
 * `completed_under_cap` through `BlockPanel`'s completion and nothing else — and
 * rung selection, which is a ladder's (EXE-04a) even when the ladder is performed
 * for time.
 *
 * **The result log** (TASK-010: C29, C30; R78, R86, R124). Once the race has
 * ended — by Finish or by the cap — the shared `TimedResultLog` follows the
 * work: "Work completed" with Complete beside Incomplete, then the existing
 * three-face effort. The clock cannot know whether all the work was done, so
 * completion is the athlete's answer with a starting point (`forTimeCompletion`):
 * Finish under the cap starts at Complete, the cap at Incomplete, and either
 * is one tap from the other. The answer is kept on the race's own record and
 * is what `completed_under_cap` saves. Effort is optional and is held here,
 * unanswered as `null`; since TASK-015 it is reported to the shell beside the
 * outcome and saved as the block's categorical `effort` (MIG-A, applied by the
 * owner's LIVE-PRE-1) — and never turned into the numeric `perceived_effort`.
 *
 * TASK-015 (C37; AC-C37-01, AC-R015-01, AC-R015-02): the log also asks each
 * movement's completed amount and actual load where they apply. A partial
 * belongs to round 1 only for a single pass answered Incomplete (TASK-030's
 * `partialRoundFor` over the block's real `rounds`); a multi-round race takes
 * loads only, with no partial round and no rounds count (owner decision). The
 * entries live on the race's own record (`ForTimeState.movements`), typed as
 * typed and read back after a reload; a change of answer clears the amounts
 * and keeps the loads; they reach the row through the shell's one completion
 * path as the block's timed report. Once saved, the fields keep their values
 * and are no longer offered.
 */
import { useMemo, useState, type CSSProperties } from 'react'

import { partialRoundFor } from '../data/refinement-logging-rules'
import { AlertTriangle, Check } from '../design-system/index'
import { useBlockCompletion, type TimedResultReport } from '../state/block-completion'
import {
  answerForTime,
  clampForTimeState,
  finishForTime,
  forTimeCompletion,
  forTimeOutcome,
  forTimeShape,
  setForTimeMovement,
  type ForTimeState,
  forTimeView,
  startForTime,
  forTimeLifecycle,
  forTimeTicking,
  FOR_TIME_START,
  type ForTimePhase,
  type ForTimeView,
} from '../state/for-time'
import { raceCapDeadline } from '../state/countdown-urgency'
import { prescriptionText } from '../state/prescription'
import { useShellWeightUnit } from '../state/set-logging'
import { finishLabel, pauseClock, resumeClock } from '../state/timed-lifecycle'
import { raceReading } from '../state/timed-clock'
import { formatElapsed, useElapsedSeconds } from '../state/workout-clock'
import {
  usePersistedForTime,
  type ShellStorage,
} from '../state/workout-persistence'
import type { ExerciseProgress } from '../state/workout-progress'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel } from './block-renderers-frame'
import { Card } from './card'
import { countdownWarningState } from './refinements/countdown-warning'
import { DeadlineTimer } from './refinements/deadline-timer'
import { liveMovementReadings } from './refinements/movement-readings'
import { UNSCOPED_WEIGHT_UNIT } from './refinements/timed-result-log'
import { TimedResultDialog } from './refinements/timed-result-dialog'
import type { SetEffort } from './set-effort'
import { TimedWorkoutActions } from './timed-workout-flow'

export interface ForTimeBlockProps extends BlockRendererProps {
  /** Injected by a test; the shell's own storage otherwise. */
  storage?: ShellStorage | null
  /** The wall clock the elapsed time is read against. */
  now?: () => number
}

export function ForTimeBlock({ block, storage, now = Date.now }: ForTimeBlockProps) {
  const shape = forTimeShape(block)

  // Restored once, repaired on the way in: a stamp that cannot be parsed, or a
  // finish before its start, is not a clock and is dropped rather than drawn.
  const clock = usePersistedForTime(
    block.blockId,
    (stored) => (stored === null ? FOR_TIME_START : clampForTimeState(stored)),
    storage,
  )

  // Read from the clock rather than accumulated, exactly as the session timer
  // is — and not read at all once the attempt has finished or while it is
  // paused: passing a null start switches the tick off, because a stopped
  // attempt's time is fixed by its stamps and repainting it twice a second
  // would change nothing.
  const elapsed = useElapsedSeconds(forTimeTicking(clock.state), now)
  const view = forTimeView(clock.state, shape, elapsed)

  const start = () => clock.moveTo(startForTime(clock.state, now()))
  const finish = () => clock.moveTo(finishForTime(clock.state, now()))

  // TASK-010: the result log's state. The completion answer lives on the
  // race's record; the effort is this mount's draft, reported to the shell
  // (TASK-015) and saved as the block's categorical effort, never a number.
  const { isBlockRecorded } = useBlockCompletion()
  const [effort, setEffort] = useState<SetEffort | null>(null)
  const answer = clock.state.workCompleted
  const completed = forTimeCompletion(view, answer)
  const ended = view.phase === 'finished' || view.phase === 'capped'
  const saved = isBlockRecorded(block.blockId)

  // What this structure observed: the seconds it took and whether the athlete
  // completed the work (TASK-010). A block nobody started observed neither,
  // and says so by supplying nothing rather than a zero (DATA_MODEL §8).
  const outcome = shape.size === 0 ? {} : forTimeOutcome(view, answer)

  // TASK-015 (C37): the per-movement entries on the race's own record. A
  // partial belongs to round 1 only for a single pass answered Incomplete
  // (TASK-030's `partialRoundFor` over the block's real `rounds`); a
  // multi-round race records no count, so it takes loads only. The report the
  // shell saves beside the row carries the effort and the typed entries.
  const weightUnit = useShellWeightUnit() ?? UNSCOPED_WEIGHT_UNIT
  const movements = clock.state.movements ?? NO_ENTRIES
  const partialRound = ended ? partialRoundFor({ family: 'for_time', outcome, block: { rounds: block.rounds } }) : null
  const timed = useMemo<TimedResultReport>(
    () => ({ family: 'for_time', effort, movements, weightUnit }),
    [effort, movements, weightUnit],
  )

  return (
    <BlockPanel
      block={block}
      timer={shape.size === 0 ? null : <ForTimeClock view={view} />}
      completion={{ outcome, timed }}
    >
      {shape.size === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <>
          <BlockPanel.Label>{shape.size === 1 ? 'The work:' : 'All of it:'}</BlockPanel.Label>

          <BlockPanel.MovementList label="Movements in this block">
            {block.exercises.map((exercise) => (
              <BlockPanel.MovementItem key={exercise.exerciseId}>
                <ForTimeMovement exercise={exercise} />
              </BlockPanel.MovementItem>
            ))}
          </BlockPanel.MovementList>

          {/*
            TASK-006 (C17, C18): the shared action slot, after the work and
            before the card's coaching — Start, then a secondary Pause or Resume
            beside the primary Finish. None of them exists once the attempt is
            over: a second Start would discard the time it took, and the cap
            cannot be un-reached.
          */}
          <TimedWorkoutActions
            phase={forTimeLifecycle(view.phase)}
            startLabel="Start For Time"
            finishLabel={finishLabel('for_time', shape.capSeconds !== null)}
            onStart={start}
            onPause={() => clock.moveTo(pauseClock(clock.state, now()))}
            onResume={() => clock.moveTo(resumeClock(clock.state, now()))}
            onFinish={finish}
          />

          {/*
            TASK-010 (C29, C30): the result, after the work, once the race has
            ended. Ready, running and paused ask for nothing. TASK-046 (C45;
            R100): one "Log results" action in its place opens the same log in
            the shared focused dialog.
          */}
          {ended && (
            <TimedResultDialog
              format="for_time"
              value={{ completed, effort }}
              askCompletion={view.capSeconds !== null}
              saved={saved}
              onChange={(next) => {
                if (next.completed !== null && next.completed !== completed) {
                  clock.moveTo(answerForTime(clock.state, next.completed))
                }
                if (next.effort !== effort) setEffort(next.effort)
              }}
              movements={{
                exercises: block.exercises,
                partialRound,
                weightUnit,
                values: movements,
                onChange: (exerciseId, entry) => clock.moveTo(setForTimeMovement(clock.state, exerciseId, entry)),
              }}
            />
          )}
        </>
      )}
    </BlockPanel>
  )
}

/** No entry typed yet: one frozen object, so a report with nothing new is the same report. */
const NO_ENTRIES: ForTimeState['movements'] & object = Object.freeze({})

// ─────────────────────────────────────────────────────────────────────────────
// The clock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The race, as `BlockPanel`'s `timer`: one timer-role card holding the outcome
 * in words, the elapsed reading and the cap, drawn beside the block's card
 * rather than inside it. Nothing of the clock floats outside its own card.
 *
 * TASK-007 (C19, R67, R102): the elapsed reading is the shared whole timer
 * body (`DeadlineTimer`), filling the card's width with its digits centred —
 * the For Time block's and the timed ladder's functioning visible clock —
 * rather than a short readout beside the words. It reads the race's own
 * clock (`for-time.ts`, with TASK-006's pause) and nothing else (C21).
 *
 * App-owned rather than the export's `TimerDisplay` for the same reason the
 * shell's `GlobalTimer` is: `TimerDisplay` is a *countdown*, and what For Time
 * records is the time that has passed. The digits are decorative and the
 * accessible value is spoken in words, so a screen reader hears "six minutes
 * 23 seconds" rather than "06 colon 23", and hears it when the user asks:
 * `role="timer"` here is labelled, never live.
 *
 * Its warning is the shared one (TASK-008: C22, C23, C24, C61; R126: a
 * count-up cap warns on the cap, never on the number it shows), read from the
 * race's own deadline — the cap minus the elapsed time. From ten seconds before
 * the cap the card changes role, so bar, body and digits step to the low
 * colours over `--dur-alert`, and the cap line says "finish now". In the last
 * five, while the clock runs, the race's whole timer frame breathes with the
 * one soft screen-edge aura in the same phase — an `urgent` claim on the view's
 * one loop that outranks a wait beside it. Paused, the race holds its colour
 * and loses the breathe and the aura. The cap ends the warning; "Cap reached"
 * keeps its own outcome treatment (the timer-low role, its glyph and words),
 * which never breathes. The card no longer takes the shipped four-second
 * stepped micro-pulse (R133, R135). Under reduced motion the timer and the aura
 * hold a steady .5, with the words, digits and colour unchanged.
 */
export function ForTimeClock({
  view,
  words = PHASE_WORDS,
}: {
  view: ForTimeView
  /** The outcome in words, by phase. The timed ladder states its own ending. */
  words?: Readonly<Record<ForTimePhase, string>>
}) {
  const deadline = raceCapDeadline(view)
  const capped = view.phase === 'capped'
  const low = countdownWarningState(deadline.remaining, deadline.running).low || capped

  return (
    <div>
      <Card role={low ? 'timer-low' : 'timer'}>
        {/*
          The outcome in words, and the one thing here that changes without
          the user touching anything: the cap arrives on its own, so this is
          the status a screen reader is told about politely.
        */}
        <p role="status" style={statusStyle(view)}>
          <PhaseGlyph view={view} />
          {words[view.phase]}
        </p>

        <DeadlineTimer
          reading={raceReading(view.elapsedSeconds, view.remainingSeconds)}
          size="var(--label-xl-size)"
          deadline={deadline}
          lowOutcome={capped}
        />

        <CapLine view={view} />
      </Card>
    </div>
  )
}

/**
 * The cap, stated wherever the user is in the race.
 *
 * Before and after, it is the deadline as a fact. While the clock runs it is how
 * much of it is left, and inside the last seconds it is the sentence that carries
 * the urgency the colour is also carrying — the words change, not just the hue.
 */
function CapLine({ view }: { view: ForTimeView }) {
  if (view.capSeconds === null) {
    // No cap on the block: there is no deadline to state, and inventing one
    // would be inventing the structure's contract.
    return null
  }

  // Paused (TASK-006, C18), the cap is frozen with the clock: the same line,
  // and no urgency, because nothing is running out.
  if ((view.phase === 'running' || view.phase === 'paused') && view.remainingSeconds !== null) {
    return (
      <BlockPanel.Label style={view.urgent ? urgentLineStyle : undefined}>
        {view.urgent
          ? `Cap in ${formatElapsed(view.remainingSeconds)} — finish now`
          : `Cap in ${formatElapsed(view.remainingSeconds)}`}
      </BlockPanel.Label>
    )
  }

  return <BlockPanel.Label>{formatElapsed(view.capSeconds)} cap</BlockPanel.Label>
}

// ─────────────────────────────────────────────────────────────────────────────
// Which of the two endings this was
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_WORDS: Readonly<Record<ForTimeView['phase'], string>> = {
  ready: 'Ready',
  running: 'Racing the clock',
  // TASK-006 (C18): the frozen clock says so in words, not only by standing still.
  paused: 'Paused',
  finished: 'Finished under cap',
  capped: 'Cap reached',
}

/**
 * The glyph beside the status, because the two endings must not differ by colour
 * alone: a tick for the finish, a warning for the cap. Neither replaces the
 * words — both sit beside them.
 */
function PhaseGlyph({ view }: { view: ForTimeView }) {
  const glyph =
    view.phase === 'finished' ? <Check /> : view.phase === 'capped' ? <AlertTriangle /> : null

  if (glyph === null) return null
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', marginRight: 'var(--spacing-100)' }}>
      {glyph}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The work itself
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One prescribed movement, read from its columns and never parsed
 * (`prescription.ts`). There is no set-entry form here and that is the
 * structure's own argument: For Time is scored by the clock, the whole
 * prescription is memorised before the timer starts, and asking for a weight
 * between two rounds of a race is the interaction `ladder-for-time.md`'s "low
 * touch during execution" exists to refuse.
 */
function ForTimeMovement({ exercise }: { exercise: ExerciseProgress }) {
  const prescription = exercise.prescription
  // R31, C10 (TASK-003): the same name, compact equipment and prescribed load
  // Review shows, through its formatters and the profile's unit. A target,
  // never a performed weight.
  const readings = liveMovementReadings(prescription, useShellWeightUnit())

  return (
    <BlockPanel.Movement
      title={`${exercise.position}. ${readings.name}`}
      detail={prescriptionText(prescription)}
      load={readings.load}
      // C03, R132: the compact equipment beside the name, as Review shows it.
      context={readings.equipment}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const labelStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
}

/** The cap line, saying the thing that is about to happen. */
const urgentLineStyle: CSSProperties = {
  color: 'var(--text-timer-low)',
  fontWeight: 'var(--font-weight-bold)',
}

const PHASE_COLOURS: Readonly<Record<ForTimeView['phase'], string>> = {
  ready: 'var(--text-card-label)',
  running: 'var(--text-card-label)',
  paused: 'var(--text-card-label)',
  // The two endings, and the only two places this card leaves the label colour:
  // the timer's own colour for the result that beat the cap, its low colour for
  // the one the cap cut off (ATOMIC.md §3 — urgency is time pressure *and*
  // failure).
  finished: 'var(--text-timer)',
  capped: 'var(--text-timer-low)',
}

function statusStyle(view: ForTimeView): CSSProperties {
  return {
    ...labelStyle,
    display: 'flex',
    alignItems: 'center',
    color: PHASE_COLOURS[view.phase],
    fontWeight:
      view.phase === 'finished' || view.phase === 'capped'
        ? 'var(--font-weight-bold)'
        : labelStyle.fontWeight,
  }
}
