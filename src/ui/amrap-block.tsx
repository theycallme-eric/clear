/**
 * EXE-04c — the AMRAP renderer: a window, then an optional result. This is the
 * IA's `TimedRenderer` in its AMRAP mode (IA.md §3), its `SectionTimer` the
 * shared whole timer body (`DeadlineTimer`, TASK-007: C19, R49).
 *
 * Everything the structure is comes from `workout_blocks`: the window is
 * `timer_seconds` and one round is the movements in their prescribed order. The
 * movements are listed rather than logged set by set — an AMRAP's unit of work is
 * the round, its members prescribe reps *per round* (contract §5), and `3 × 8`
 * under each one would describe a block nobody performed.
 *
 * REQ-014 (E02) decides the rest:
 *
 *   · **The window is hands-off.** While the clock runs there is nothing to
 *     enter — the countdown, the round, and the shared actions after it
 *     (TASK-006, C18): a secondary Pause, which freezes the window, beside the
 *     primary Finish early. There is no round goal either: an ordinary AMRAP
 *     prescribes a window, not a count.
 *   · **The result is optional and comes afterwards.** Once the window closes
 *     the athlete may record rounds and a partial round, or leave both blank.
 *     Blank is `null` all the way to the column and an entered zero is a zero;
 *     neither blocks the section's forward action. Stopping — the buzzer or
 *     Finish early — records the time and nothing else: no round and no
 *     partial round is ever inferred from it.
 *   · **A comparison only where it is like-for-like.** A recorded result is
 *     scored and set against identical earlier pieces through `likeForLike`;
 *     no history in hand, or none comparable, claims nothing beyond what was
 *     read. No expected-round range is predicted.
 *
 * A partial round is a number, not a note: DATA-01d requires zero to be
 * distinguishable from absence, so "no partial round recorded" is its own
 * visible state — the count's blank `—`, never a zero.
 *
 * TASK-009 (C25–C28; G08; R52, R54, R55, R56, R57, R79, R83, R85, R90): the
 * work and its prescription come first and the scoring after them (C25). The
 * result is the shared `TimedResultLog` in its simple hierarchy — the one
 * "Log results" title, then rounds and the partial round as one group (C26) —
 * each count the shared `QuantitySelector`: one wide frame holding framed
 * minus and plus actions around a distinct value (C27). The Clear rounds and
 * No partial round resets are gone with nothing in their place (C28): the
 * minus taps down to an explicit zero and stops there, so blank and zero stay
 * the two different answers they are, and nothing clears a value implicitly.
 *
 * Score keeping is `amrap.ts`, which is pure, and `workout-persistence.ts`, which
 * writes it down on every tap: a refresh, a locked phone or a walk to the next
 * section and back all come back to the result the user had entered (SES-01). The
 * window itself is never stored as a tick count — `startedAt` is stamped once and
 * the remaining time is read against the clock, so the buzzer can go while the
 * tab is asleep.
 *
 * TASK-015 (C37; AC-C37-01, AC-R015-01, AC-R015-02): after the counts, the
 * log draws each movement's next-round amount and actual load. The amount is
 * asked only once a rounds count is recorded — the partial belongs to the
 * round after it (TASK-030's `partialRoundFor`; an explicit 0 gives round 1)
 * and a round nobody counted has no next round — and a load only on a loaded
 * movement. "Reps into the next round" stays beside them: the conditioning
 * score reads it, and neither is derived from the other. The entries live on
 * the AMRAP's own record (`AmrapState.movements`), written on every keystroke
 * like its counts and read back after a reload; a change of the rounds count
 * clears the amounts (never carried to another round) and keeps the loads.
 * They reach the row through the shell's one completion path as the block's
 * timed report; once the row is saved the fields keep their values and are no
 * longer offered.
 *
 * Containment. The countdown is one frame of its own (TASK-007, C19, R49): it
 * stands above the block's card rather than inside it and fills the block's
 * width with its digits centred — never a short readout inside an empty wider
 * frame — and its warning is the shared one (TASK-008), with nothing added
 * around it. Everything else is one card: the round is its ruled sub-group
 * with its label inside, the settled time is the shared bare readout, and the
 * result is the shared log under its own rule (TASK-009).
 */
import { use, useMemo } from 'react'

import { partialRoundFor } from '../data/refinement-logging-rules'
import { Check } from '../design-system/index'
import {
  amrapOutcome,
  amrapShape,
  amrapView,
  AMRAP_START,
  clampAmrapState,
  finishAmrap,
  setAmrapMovement,
  setPartialRoundReps,
  setRoundsCompleted,
  startAmrap,
  type AmrapState,
  type AmrapView,
} from '../state/amrap'
import { AuthContext } from '../state/auth-context'
import { useBlockCompletion, type BlockOutcome, type TimedResultReport } from '../state/block-completion'
import {
  conditioningSections,
  likeForLike,
  type ConditioningSectionRead,
} from '../state/conditioning'
import { useConditioningHistoryQuery } from '../state/conditioning-queries'
import { amrapWindowDeadline } from '../state/countdown-urgency'
import { QueryClientContext } from '../state/query'
import { WorkoutClientsContext } from '../state/workout-queries'
import { targetText } from '../state/prescription'
import { useShellWeightUnit } from '../state/set-logging'
import {
  clockStopMoment,
  finishLabel,
  isClockPaused,
  pauseClock,
  resumeClock,
  type TimedLifecyclePhase,
} from '../state/timed-lifecycle'
import { formatCountdownReading } from '../state/timed-clock'
import {
  elapsedSeconds,
  formatElapsed,
  useElapsedSeconds,
} from '../state/workout-clock'
import {
  usePersistedAmrap,
  type ShellStorage,
} from '../state/workout-persistence'
import type { BlockProgress, ExerciseProgress } from '../state/workout-progress'
import { BlockCompletionControl } from './block-completion-control'
import { BlockPanel } from './block-renderers-frame'
import { Card } from './card'
import { MetricFrame } from './composition'
import { ConditioningScoreLine } from './conditioning-score'
import { GroupExerciseCoaching } from './exercise-coaching'
import { coachesAsGroup } from './group-coaching-context'
import { DeadlineTimer } from './refinements/deadline-timer'
import { liveMovementReadings } from './refinements/movement-readings'
import { TimedResultLog, UNSCOPED_WEIGHT_UNIT } from './refinements/timed-result-log'
import { WorkoutCard } from './refinements/workout-card'
import { useSectionLabel } from './section-label-context'
import { TimedWorkoutActions } from './timed-workout-flow'
import type { BlockRendererProps } from './block-renderers'

export interface AmrapBlockProps extends BlockRendererProps {
  /** Injected by a test; the shell's own storage otherwise. */
  storage?: ShellStorage | null
  /** The wall clock the window is read against. */
  now?: () => number
  /**
   * Injected by a test: the conditioning history, read. Omitted, the shell's
   * own history query is read when there is a signed-in shell to read it.
   */
  conditioningHistory?: readonly ConditioningSectionRead[] | null
}

export function AmrapBlock({
  block,
  storage,
  now = Date.now,
  conditioningHistory,
}: AmrapBlockProps) {
  const shape = amrapShape(block)

  // Restored once, repaired against the block as it is *now*: a cap shortened
  // since the last render cannot leave a logged time longer than the window.
  const amrap = usePersistedAmrap(
    block.blockId,
    (stored) => (stored === null ? AMRAP_START : clampAmrapState(stored, shape)),
    storage,
  )

  // Read from the clock rather than accumulated, exactly as the session timer
  // is: a phone that locked through the buzzer comes back to a closed window.
  // A paused window reads its pause and does not tick (TASK-006, C18).
  const elapsed = useElapsedSeconds(amrapTicking(amrap.state), now)
  const view = amrapView(amrap.state, shape, elapsed)

  const sectionLabel = useSectionLabel()
  const outcome = shape.size === 0 ? {} : amrapOutcome(view)

  // TASK-015 (C37): the per-movement entries on the AMRAP's own record, the
  // round they belong to from the recorded count, and the report the shell
  // saves beside the row. Saved, the fields keep their values, no longer offered.
  const { isBlockRecorded } = useBlockCompletion()
  const saved = isBlockRecorded(block.blockId)
  const weightUnit = useShellWeightUnit() ?? UNSCOPED_WEIGHT_UNIT
  const movements = amrap.state.movements ?? NO_ENTRIES
  const partialRound = view.phase === 'complete' ? partialRoundFor({ family: 'amrap', outcome }) : null
  const timed = useMemo<TimedResultReport>(
    () => ({ family: 'amrap', effort: null, movements, weightUnit }),
    [movements, weightUnit],
  )

  return (
    <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
      {/*
        The shipped timer card, beside the block's card and never within it. Only
        a window that is open and has a deadline has anything to count down —
        frozen where it was while the window is paused (TASK-006). Its warning
        is the shared one, read from the window's own deadline (TASK-008: C22,
        C23, C24, C61): colour from ten seconds left, and the breathe with the
        one soft screen-edge aura in the last five while the window runs.
      */}
      {shape.size > 0 && (view.phase === 'running' || view.phase === 'paused') && view.capSeconds !== null && (
        <DeadlineTimer
          reading={formatCountdownReading(view.remainingSeconds)}
          size="var(--heading-h1-size)"
          deadline={amrapWindowDeadline(view)}
        />
      )}
      {/*
        TASK-003 (C08, C09): the block's card and static header are the shared
        `WorkoutCard` every other live block and Review draw — the section
        label, the format-only badge below it and the window beside the badge
        (`AMRAP`, `8 MIN`) — rather than a header row of its own.
      */}
      <WorkoutCard
        context="workout"
        title={
          sectionLabel ??
          `${block.exerciseCount} ${block.exerciseCount === 1 ? 'movement' : 'movements'}`
        }
        structure={block.identity}
        // C16, R29 (TASK-005): an AMRAP is performed as a group, so its
        // movements' coaching and notes are one disclosure at the foot of the
        // card — each movement still its own guidance read and note writer.
        coaching={coachesAsGroup(block) ? <GroupExerciseCoaching format={block.identity.format} exercises={block.exercises} /> : undefined}
      >
        {shape.size === 0 ? (
          <p style={{ margin: 0 }}>
            Nothing left to perform in this block — every movement in it was swapped
            out.
          </p>
        ) : (
          <>
            <Window view={view} />

            {/*
              C25 (TASK-009, R54): the work and its prescription come before any
              scoring — planned work first, the athlete's reported result after
              it, kept apart. The quickfix's label, on its own terms: two or
              more movements make a round worth naming, and a single-movement
              AMRAP is already obvious (`quickfix-amrap-round-label.md`).
            */}
            <Card heading={shape.size > 1 ? 'Each round:' : undefined}>
              <ol
                aria-label="Movements in this AMRAP"
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
                  <li key={exercise.exerciseId}>
                    <Movement exercise={exercise} />
                  </li>
                ))}
              </ol>
            </Card>

            {/*
              TASK-006 (C17, C18; R48): the shared action slot, after the round's
              work and prescription and before the card's coaching — Start AMRAP,
              then a secondary Pause beside the primary Finish early.
            */}
            <TimedWorkoutActions
              phase={amrapLifecycle(view)}
              startLabel="Start AMRAP"
              finishLabel={finishLabel('amrap', view.capSeconds !== null)}
              onStart={() => amrap.update(startAmrap(amrap.state, now()))}
              onPause={() => amrap.update(pauseClock(amrap.state, now()))}
              onResume={() => amrap.update(resumeClock(amrap.state, now()))}
              // Read from the clock at the moment of the tap rather than from the
              // rendered countdown: the repaint is throttled to twice a second,
              // and the time the user stopped at is the time they stopped at — a
              // paused window's, its pause.
              onFinish={() =>
                amrap.update(
                  finishAmrap(
                    amrap.state,
                    shape,
                    elapsedSeconds(amrap.state.startedAt, clockStopMoment(amrap.state, now())),
                  ),
                )
              }
            />

            {/*
              After the work and nowhere before the window has closed: the
              result is optional, written on every tap, with nothing to submit
              (C26, C27). Blank is a state of its own rather than a zero, and
              nothing here clears it back or fills it in (C28).
            */}
            {view.phase === 'complete' && (
              <>
                <TimedResultLog
                  format="amrap"
                  value={{
                    roundsCompleted: view.roundsCompleted,
                    partialRoundReps: view.partialRoundReps,
                  }}
                  onChange={(next) =>
                    amrap.update(
                      setPartialRoundReps(
                        setRoundsCompleted(amrap.state, next.roundsCompleted),
                        next.partialRoundReps,
                      ),
                    )
                  }
                  saved={saved}
                  movements={{
                    exercises: block.exercises,
                    partialRound,
                    weightUnit,
                    values: movements,
                    onChange: (exerciseId, entry) => amrap.update(setAmrapMovement(amrap.state, exerciseId, entry)),
                  }}
                />
                {conditioningHistory === undefined ? (
                  <AmrapComparison block={block} outcome={outcome} />
                ) : (
                  <ConditioningScoreLine
                    {...likeForLike(block, outcome, conditioningHistory)}
                  />
                )}
              </>
            )}
          </>
        )}

        {/*
          The score, through the one path every structure completes through. An
          AMRAP nobody started measured nothing — no rounds, no time — and says
          so by supplying nothing rather than a row of zeroes (DATA_MODEL §8).
        */}
        <BlockCompletionControl blockId={block.blockId} outcome={outcome} timed={timed} />
      </WorkoutCard>
    </div>
  )
}

/** No entry typed yet: one frozen object, so a report with nothing new is the same report. */
const NO_ENTRIES: AmrapState['movements'] & object = Object.freeze({})

// ─────────────────────────────────────────────────────────────────────────────
// The window
// ─────────────────────────────────────────────────────────────────────────────

/** The start the window ticks from: none before Start, while paused or once it closed. */
function amrapTicking(state: AmrapState): string | null {
  return state.endedAtSeconds === null && !isClockPaused(state) ? state.startedAt : null
}

/** The window's place, as the shared Start/Pause/Resume/Finish actions read it. */
function amrapLifecycle(view: AmrapView): TimedLifecyclePhase {
  return view.phase === 'complete' ? 'ended' : view.phase
}

/**
 * The card's side of the clock, in whichever of its states it is in. The
 * countdown itself is the block's whole timer body, above the card, and its
 * actions are the shared slot after the round (TASK-006, C17).
 *
 * Running is the passive one on purpose: the phone is on the floor and the
 * countdown is all it is being asked to do (`amrap-logging.md`, design
 * principle). Paused says so in words, with the window frozen above it.
 * Complete is static and carries a tick — the window is settled, and a red
 * countdown at `00:00` would be urgency about a deadline that has passed.
 * Whether the cap or the user settled it is said in words.
 */
function Window({ view }: { view: AmrapView }) {
  if (view.phase === 'ready') {
    return <p style={{ margin: 0 }}>{openingText(view)}</p>
  }

  if (view.phase === 'running' || view.phase === 'paused') {
    return (
      <div
        className="clr-stack--tight"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
      >
        {view.phase === 'paused' && <span style={labelStyle}>Paused</span>}
        {view.capSeconds === null && (
          <p style={{ margin: 0 }}>
            No window prescribed — the clock is yours, and it reads{' '}
            {formatElapsed(view.elapsedSeconds)}.
          </p>
        )}
        <p style={CONTEXT_STYLE}>Nothing to enter now. Record your rounds afterwards if you like.</p>
      </div>
    )
  }

  return (
    <MetricFrame>
      <span style={labelStyle}>AMRAP complete</span>
      <p className="clr-row" style={READOUT_STYLE}>
        {/* The tick is the cue that the window is settled. */}
        <Check />
        {formatElapsed(view.elapsedSeconds)} on the clock
      </p>
      {view.expired && <p style={CONTEXT_STYLE}>Cap reached</p>}
    </MetricFrame>
  )
}

/** What the card says before the window opens. */
function openingText(view: AmrapView): string {
  return view.capSeconds === null
    ? 'As many rounds as possible. This block prescribes no window, so it ends when you do.'
    : `As many rounds as possible in ${formatElapsed(view.capSeconds)}.`
}

// ─────────────────────────────────────────────────────────────────────────────
// The score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The recorded result's score, and the like-for-like comparison when the
 * conditioning history holds an identical earlier piece (OVR-03). Outside the
 * signed-in shell — a gallery, a renderer test — there is no history to read,
 * and the score stands alone with no claim about rows nobody read.
 */
function AmrapComparison({ block, outcome }: { block: BlockProgress; outcome: BlockOutcome }) {
  const canRead =
    use(WorkoutClientsContext) !== null &&
    use(AuthContext) !== null &&
    use(QueryClientContext) !== null
  return canRead ? (
    <HistoryComparison block={block} outcome={outcome} />
  ) : (
    <ConditioningScoreLine {...likeForLike(block, outcome, null)} />
  )
}

function HistoryComparison({ block, outcome }: { block: BlockProgress; outcome: BlockOutcome }) {
  const query = useConditioningHistoryQuery()
  // Loading and failed reads are both "not in hand": the score, and no claim.
  const history = useMemo(
    () => (query.state.status === 'ready' ? conditioningSections(query.state.data) : null),
    [query.state],
  )
  return <ConditioningScoreLine {...likeForLike(block, outcome, history)} />
}

// ─────────────────────────────────────────────────────────────────────────────
// The round's movements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One movement of the round, as the prescription states it per round.
 *
 * `targetText` rather than `prescriptionText`: the set count belongs to the
 * block's rounds here, and `3 × 8 reps` under a movement inside an AMRAP would
 * be a second, wrong answer to "how many".
 *
 * C03 (TASK-002): drawn as the live movement every other structure draws
 * (`BlockPanel.Movement`, the shared `LiveMovement`), so its compact equipment
 * sits beside the name as Review shows it (R132). It is a heading one level
 * below the round, as before.
 */
function Movement({ exercise }: { exercise: ExerciseProgress }) {
  const prescription = exercise.prescription
  // R31, C10 (TASK-003): the same name, compact equipment and prescribed load
  // Review shows, through its formatters and the profile's unit. A target,
  // never a performed weight.
  const readings = liveMovementReadings(prescription, useShellWeightUnit())

  return (
    <BlockPanel.Movement
      title={`${exercise.position}. ${readings.name}`}
      detail={targetText(prescription)}
      load={readings.load}
      context={readings.equipment}
    >
      {prescription.tempo === null ? null : (
        <BlockPanel.Note>Tempo {prescription.tempo}</BlockPanel.Note>
      )}
    </BlockPanel.Movement>
  )
}

/** The settled time: the data face, as every other readout's value is. */
const READOUT_STYLE = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xl-size)',
  fontWeight: 'var(--font-weight-bold)',
  letterSpacing: 'var(--tracking-data)',
} as const

/** What ended the window: context for the time, and quieter than it. */
const CONTEXT_STYLE = { margin: 0, color: 'var(--text-secondary)' } as const

const labelStyle = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
} as const
