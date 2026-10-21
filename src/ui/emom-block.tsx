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
 *     unreadability, because their set fields stay usable and a 40%-opacity
 *     input is a contrast failure rather than a hint.
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
 * Two rules from the shared clarity spec shape the rest of the card. Rest is
 * the block's and is honored once per minute rather than once per movement, so
 * the movements state none of their own (`superset-circuit-clarity.md` §8) and
 * the trailing window is stated once at the foot of the card. And completion is
 * the shell's: this renderer supplies `minutes_completed` and nothing else,
 * through the one control every structure composes.
 *
 * Where the user is comes from `emom.ts` as pure arithmetic over a stored
 * timestamp, and `workout-persistence.ts` writes that timestamp down — so a
 * refresh at 3:40 into a ten-minute EMOM comes back at 3:40 and not at zero
 * (SES-01). The block's own four states are the shell's: it owns loading and
 * error for the session, and a block with no active prescriptions left is a
 * real, drawable case rather than an empty view — everything in it was swapped
 * out, and it says so.
 */
import { Button, Check, Play, TimerDisplay } from '../design-system/index'
import type { BlockOutcome } from '../state/block-completion'
import {
  clampEmomState,
  emomShape,
  emomView,
  EMOM_START,
  markMinuteDone,
  minuteAssignment,
  startEmom,
  type EmomView,
} from '../state/emom'
import { useElapsedSeconds } from '../state/workout-clock'
import { usePersistedEmom, type ShellStorage } from '../state/workout-persistence'
import type { ExerciseProgress } from '../state/workout-progress'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel, type BlockMovementMarker } from './block-renderers-frame'
import { useInterfaceLoop } from './motion'
import { ExerciseSetLogger } from './set-logger'

export interface EmomBlockProps extends BlockRendererProps {
  /** Injected by a test; the shell's own storage otherwise. */
  storage?: ShellStorage | null
  /** The wall clock the minute grid is read against. */
  now?: () => number
}

export function EmomBlock({ block, storage, now = Date.now }: EmomBlockProps) {
  const shape = emomShape(block)

  // Restored once, repaired against the block as it is *now*: a record whose
  // timestamp no clock can read, or whose marked minute is outside this block's
  // window, would otherwise freeze the grid at minute one.
  const emom = usePersistedEmom(
    block.blockId,
    (stored) => (stored === null ? EMOM_START : clampEmomState(stored, shape)),
    storage,
  )

  // Read from the clock rather than accumulated, exactly as the session timer
  // is: a phone that locked for four minutes comes back to minute five.
  const elapsed = useElapsedSeconds(emom.state.startedAt, now)
  const view = emomView(emom.state, shape, elapsed)

  const start = () => {
    emom.update(startEmom(emom.state, now()))
  }
  const minuteDone = () => {
    emom.update(markMinuteDone(emom.state, view))
  }

  const counting = shape.size > 0 && view.phase !== 'untimed' && view.phase !== 'ready'

  return (
    <BlockPanel
      block={block}
      timer={counting ? <MinuteCountdown view={view} /> : null}
      // The minutes the user actually got through — the outcome this structure
      // observed, and the only field it supplies. An EMOM whose clock never
      // ran observed nothing, and says so by supplying nothing rather than a
      // zero (DATA_MODEL §8).
      completion={{ outcome: observedOutcome(view) }}
    >
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
            <SectionTimer view={view} onStart={start} onMinuteDone={minuteDone} />
          )}

          <BlockPanel.MovementList label="Movements in this EMOM">
            {block.exercises.map((exercise) => (
              <EmomMovement
                key={exercise.exerciseId}
                exercise={exercise}
                assignment={
                  view.phase === 'untimed' ? null : minuteAssignment(exercise.position, shape)
                }
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

          {view.phase === 'finished' && (
            <BlockPanel.Note>
              Every prescribed minute is done. Record the block when you are ready.
            </BlockPanel.Note>
          )}
        </>
      )}
    </BlockPanel>
  )
}

/** What the EMOM watched, or nothing when its clock never started. */
function observedOutcome(view: EmomView): BlockOutcome {
  if (view.phase === 'untimed' || view.phase === 'ready') return {}
  return { minutesCompleted: view.minutesCompleted }
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
 * window, the phase in words, and the one control that belongs to the phase.
 *
 * Neither line is a live region: announcing a number every second makes the
 * rest of the screen unusable, so the phase word is what a screen reader is
 * meant to find.
 */
function SectionTimer({
  view,
  onStart,
  onMinuteDone,
}: {
  view: EmomView
  onStart: () => void
  onMinuteDone: () => void
}) {
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

      {/*
        One control, and only while there is work at the top of the minute to
        finish. During the rest remainder there is nothing to press: the next
        boundary flips the work back on its own, which is the whole contract.
      */}
      {view.phase === 'work' && (
        <Button variant="primary" size="lg" icon={<Check />} onClick={onMinuteDone}>
          Minute done
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
 * One movement of the rotation, as a row of the block's list. The live one is
 * `BlockPanel.MovementItem`'s to mark — a word, and `aria-current` — so colour
 * is never the cue.
 */
function EmomMovement({
  exercise,
  assignment,
  marker,
}: {
  exercise: ExerciseProgress
  assignment: string | null
  marker: BlockMovementMarker
}) {
  return (
    <BlockPanel.MovementItem marker={marker}>
      {assignment !== null && <BlockPanel.Label>{assignment}</BlockPanel.Label>}

      {/*
        Rest is the block's, stated once per minute at the foot of the card: a
        per-movement rest line here would be a rest the user is not meant to
        take.
      */}
      <ExerciseSetLogger
        exercise={exercise}
        ordinal={`${exercise.position}.`}
        statesRest={false}
      />
    </BlockPanel.MovementItem>
  )
}
