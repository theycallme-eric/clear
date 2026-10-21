/**
 * EXE-03 — the EMOM renderer: fixed work at the top of every minute, and the
 * remainder of the minute as rest. This is the EMOM arm of the IA's
 * `TimedRenderer` (IA.md §3), and the readout inside it is its `SectionTimer` —
 * the one place in the app that composes the shipped `TimerDisplay`, because
 * unlike the session clock this really is a countdown with a deadline.
 *
 * `emom-clarity.md` is a list of four things the old screen failed to say, and
 * all four are said here:
 *
 *   · **Which minute it is.** `MIN 4 OF 10`, at the head of the card, in the
 *     data face and the timer's own colour (§1). The number comes from the
 *     block's `timer_seconds`; a block that carries no window says `MIN 4` and
 *     runs until the user completes it, rather than inventing a last minute.
 *   · **Which movement is active now.** The minute decides it —
 *     `((minute - 1) % movements) + 1` — so a 2-movement EMOM alternates and a
 *     3-movement one rotates (§2). The live movement is named in words (`NOW`,
 *     `NEXT`) and carries `aria-current`; the others are not dimmed into
 *     unreadability, because the athlete reads ahead to the next minute and a
 *     40%-opacity row is a contrast failure rather than a hint.
 *   · **The alternation pattern.** Each movement states the minutes it covers —
 *     `ODD MIN` / `EVEN MIN` for two, the actual minute numbers for three or
 *     more, nothing at all for one (§3).
 *   · **What the timer's colour means.** It is `TimerDisplay`'s own urgency
 *     threshold, and it is meaningful because the seconds handed to it are the
 *     seconds left of *this minute*: the readout turns to the urgency treatment
 *     in the last ten seconds of every minute and resets on the boundary
 *     (§4, option A). Nothing here sets a colour to say it.
 *
 * It draws with the shared block frame (`block-renderers-frame.tsx`): the one
 * card, the identity row and the single completion are `BlockPanel`'s, the
 * movements are rows of its list, and the countdown is handed to its `timer`
 * slot — `TimerDisplay` is already a card, and is never put inside another.
 *
 * Execution is hands-off (REQ-014). There is no set form, no "Minute done" and
 * no exertion prompt: each movement states the target its scheduled minute
 * prescribes — the same number every turn, or the next rung of a rising
 * sequence — and the clock moves it on. Rest is the block's and is honored
 * once per minute rather than once per movement, so the movements state none
 * of their own (`superset-circuit-clarity.md` §8) and the trailing window is
 * stated once at the foot of the card.
 *
 * Completion is the shell's, and this renderer supplies no outcome to it. The
 * clock running past a minute is the schedule, not work the athlete reported
 * (E01), so `minutes_completed` stays `null` rather than being filled from the
 * timer. The section's forward action is what saves the block.
 *
 * Where the user is comes from `emom.ts` as pure arithmetic over a stored
 * timestamp, and `workout-persistence.ts` writes that timestamp down — so a
 * refresh at 3:40 into a ten-minute EMOM comes back at 3:40 and not at zero
 * (SES-01). The block's own four states are the shell's: it owns loading and
 * error for the session, and a block with no active prescriptions left is a
 * real, drawable case rather than an empty view — everything in it was swapped
 * out, and it says so.
 */
import { Button, Play, TimerDisplay } from '../design-system/index'
import {
  clampEmomState,
  emomShape,
  emomView,
  EMOM_START,
  minuteAssignment,
  scheduledMinuteFor,
  startEmom,
  targetForMinute,
  type EmomShape,
  type EmomView,
} from '../state/emom'
import {
  exerciseName,
  prescribedTarget,
  prescriptionText,
  targetNumbers,
  targetText,
} from '../state/prescription'
import { useElapsedSeconds } from '../state/workout-clock'
import { usePersistedEmom, type ShellStorage } from '../state/workout-persistence'
import type { ExerciseProgress } from '../state/workout-progress'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel, type BlockMovementMarker } from './block-renderers-frame'
import { ExerciseCoaching } from './exercise-coaching'
import { ExerciseSwapControls } from './exercise-swap'
import { useInterfaceLoop } from './motion'

export interface EmomBlockProps extends BlockRendererProps {
  /** Injected by a test; the shell's own storage otherwise. */
  storage?: ShellStorage | null
  /** The wall clock the minute grid is read against. */
  now?: () => number
}

export function EmomBlock({ block, storage, now = Date.now }: EmomBlockProps) {
  const shape = emomShape(block)

  // Restored once, and repaired: a record whose timestamp no clock can read
  // would otherwise freeze the grid at minute one.
  const emom = usePersistedEmom(
    block.blockId,
    (stored) => (stored === null ? EMOM_START : clampEmomState(stored)),
    storage,
  )

  // Read from the clock rather than accumulated, exactly as the session timer
  // is: a phone that locked for four minutes comes back to minute five.
  const elapsed = useElapsedSeconds(emom.state.startedAt, now)
  const view = emomView(emom.state, shape, elapsed)

  const start = () => {
    emom.update(startEmom(emom.state, now()))
  }

  const counting = shape.size > 0 && view.phase !== 'untimed' && view.phase !== 'ready'

  return (
    // No `completion` outcome: the clock is the schedule, and a scheduled
    // minute is not athlete-reported work (E01). The panel's default records
    // nothing observed, and the section's forward action saves the block.
    <BlockPanel block={block} timer={counting ? <MinuteCountdown view={view} /> : null}>
      {shape.size === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <>
          {view.phase === 'untimed' ? (
            // The block carries no clock, so there is no grid to draw and no
            // minute to assign a movement to. Saying which minute is active
            // would be inventing the one column the block does not have.
            <BlockPanel.Note>
              This block prescribes no clock. Work through the movements as prescribed.
            </BlockPanel.Note>
          ) : (
            <SectionTimer view={view} onStart={start} />
          )}

          <BlockPanel.MovementList label="Movements in this EMOM">
            {block.exercises.map((exercise) => (
              <EmomMovement
                key={exercise.exerciseId}
                exercise={exercise}
                shape={shape}
                view={view}
                marker={markerFor(exercise.position, view)}
              />
            ))}
          </BlockPanel.MovementList>

          {/*
            Once, at the foot of the card, and only when the block prescribes
            a window inside the minute: an EMOM that prescribes none rests for
            whatever is left of the minute, which is the structure rather than
            a number to print (`superset-circuit-clarity.md` §8).
          */}
          {shape.restSeconds > 0 && view.phase !== 'untimed' && (
            <BlockPanel.Note>{shape.restSeconds}s rest at the end of each minute</BlockPanel.Note>
          )}

          {/*
            The clock has run out, which is all it can say: the schedule is
            over, not a record of what was performed.
          */}
          {view.phase === 'finished' && (
            <BlockPanel.Note>
              The clock has run every prescribed minute. Continue when you are ready.
            </BlockPanel.Note>
          )}
        </>
      )}
    </BlockPanel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The clock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The last stretch of a minute, where the readout crosses into its low state.
 * Ten, which is the shipped `TimerDisplay`'s own default — stated here so the
 * loop claim below and the readout cannot disagree about when that is.
 */
const MINUTE_LOW_SECONDS = 10

/**
 * The countdown, as `BlockPanel`'s `timer`: the shipped `TimerDisplay`, which
 * is its own frame and is drawn beside the block's card rather than inside it.
 *
 * It is handed the seconds left of *this minute* rather than of the whole
 * block, which is what makes its urgency treatment mean "wrap up this minute"
 * and reset at every boundary. The low state is the shipped one and nothing
 * more: the stepped `--dur-alert` crossing and the dim to 80%, with no glow of
 * its own. The pulse is an `urgent` claim on the view's one loop for as long as
 * a minute is actually running out — it outranks a wait beside it, and it is
 * given up once the last minute has elapsed, so a finished clock at `00:00`
 * holds the low colours without pulsing for ever. Under reduced motion it is
 * still, with the digits, the colour and the phase word all unchanged.
 */
function MinuteCountdown({ view }: { view: EmomView }) {
  const low = view.secondsRemaining <= MINUTE_LOW_SECONDS
  const running = view.phase === 'work' || view.phase === 'rest'
  const loop = useInterfaceLoop('urgent', low && running)

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column' }}
      data-urgent={low ? 'true' : 'false'}
      {...loop}
    >
      <TimerDisplay seconds={view.secondsRemaining} lowThreshold={MINUTE_LOW_SECONDS} />
    </div>
  )
}

/**
 * The minute the user is in, inside the block's card: the minute out of the
 * window, the phase in words, and — before the clock runs — the one way in.
 * Once it is running there is nothing to press: every boundary moves the work
 * on by itself (REQ-014).
 *
 * Neither line is a live region: announcing a number every second makes the
 * rest of the screen unusable, so the phase word is what a screen reader is
 * meant to find.
 */
function SectionTimer({ view, onStart }: { view: EmomView; onStart: () => void }) {
  return (
    <div
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      <BlockPanel.Label style={{ color: 'var(--text-timer)' }}>{minuteText(view)}</BlockPanel.Label>
      <BlockPanel.Label>{PHASE_WORDS[view.phase]}</BlockPanel.Label>

      {view.phase === 'ready' && (
        <Button variant="primary" size="lg" icon={<Play />} onClick={onStart}>
          Start EMOM
        </Button>
      )}
    </div>
  )
}

/** `MIN 4 OF 10`, or `MIN 4` for a block that carries no window. */
function minuteText(view: EmomView): string {
  return view.minutes === null
    ? `MIN ${view.minute}`
    : `MIN ${view.minute} OF ${view.minutes}`
}

const PHASE_WORDS: Readonly<Record<EmomView['phase'], string>> = {
  untimed: 'NO CLOCK',
  ready: 'NOT STARTED',
  work: 'WORK',
  rest: 'REST',
  finished: 'COMPLETE',
}

// ─────────────────────────────────────────────────────────────────────────────
// The rotation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which movement is live. During the rest remainder — and before the clock is
 * started — it is the movement the *next* minute opens with, labelled `NEXT`
 * rather than `NOW`: the user is resting, and being told to start is the one
 * thing the card must not say.
 */
function markerFor(position: number, view: EmomView): BlockMovementMarker {
  switch (view.phase) {
    case 'work':
      return position === view.activePosition ? 'now' : null
    case 'ready':
      return position === view.activePosition ? 'next' : null
    case 'rest':
      return position === view.nextPosition ? 'next' : null
    case 'untimed':
    case 'finished':
      return null
  }
}

/**
 * One movement of the rotation, as a row of the block's list, read rather than
 * logged. The live one is `BlockPanel.MovementItem`'s to mark — a word, and
 * `aria-current` — so colour is never the cue.
 *
 * Its target is the one its scheduled minute prescribes: the current minute
 * when the movement is live, otherwise its next turn. A sequence also states
 * its whole progression, so a rising target is never a surprise at the
 * boundary. Rest is the block's, stated once per minute at the foot of the
 * card: a per-movement rest line here would be a rest the user is not meant to
 * take.
 */
function EmomMovement({
  exercise,
  shape,
  view,
  marker,
}: {
  exercise: ExerciseProgress
  shape: EmomShape
  view: EmomView
  marker: BlockMovementMarker
}) {
  const prescription = exercise.prescription
  const timed = view.phase !== 'untimed'
  const assignment = timed ? minuteAssignment(exercise.position, shape) : null
  const target = prescribedTarget(prescription)

  return (
    <BlockPanel.MovementItem marker={marker}>
      {assignment !== null && <BlockPanel.Label>{assignment}</BlockPanel.Label>}

      <BlockPanel.Movement
        title={`${exercise.position}. ${exerciseName(prescription.exercise_id)}`}
        detail={timed ? scheduledTargetText(exercise, shape, view) : prescriptionText(prescription)}
      >
        {timed && target?.kind === 'sequence' && (
          <BlockPanel.Note>
            Each turn: {targetNumbers(target)}
          </BlockPanel.Note>
        )}
        {prescription.tempo === null ? null : (
          <BlockPanel.Note>Tempo {prescription.tempo}</BlockPanel.Note>
        )}

        {/* EXE-06 and EXE-05, on demand: neither is an entry the minute asks for. */}
        <ExerciseSwapControls exercise={exercise} />
        <ExerciseCoaching exercise={exercise} />
      </BlockPanel.Movement>
    </BlockPanel.MovementItem>
  )
}

/**
 * The target a movement's scheduled minute prescribes, in words. Once the
 * clock has nothing further for it — finished, or past the window — the row
 * states the prescription's target as written rather than a minute's.
 */
function scheduledTargetText(
  exercise: ExerciseProgress,
  shape: EmomShape,
  view: EmomView,
): string {
  const prescription = exercise.prescription
  const minute = scheduledMinuteFor(exercise.position, view, shape)
  if (minute === null) return targetText(prescription)

  const target = targetForMinute(prescription, minute, shape.size)
  return `MIN ${minute} · ${targetText(prescription, target)}`
}
