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
 *   · **Which minute it is.** `MIN 4 OF 10`, directly under the countdown, in
 *     the data face and the timer's own colour (§1). The number comes from the
 *     block's `timer_seconds`; a block that carries no window says `MIN 4` and
 *     runs until the user completes it, rather than inventing a last minute.
 *   · **Which movement is active now.** The minute decides it —
 *     `((minute - 1) % movements) + 1` — so a 2-movement EMOM alternates and a
 *     3-movement one rotates (§2). The live movement is named in words (`NOW`,
 *     `NEXT`) and carries `aria-current`, with the rule down its left edge as
 *     the second cue rather than the only one; the others are not dimmed into
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
import { BlockCompletionControl } from './block-completion-control'
import { Card } from './card'
import { ExerciseSetLogger } from './set-logger'
import { StructureBadge } from './workout-chrome'

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
            {view.phase === 'untimed' ? (
              // The block carries no clock, so there is no grid to draw and no
              // minute to assign a movement to. Saying which minute is active
              // would be inventing the one column the block does not have.
              <p style={{ margin: 0 }}>
                This block prescribes no clock. Work through the movements as
                prescribed.
              </p>
            ) : (
              <SectionTimer view={view} onStart={start} onMinuteDone={minuteDone} />
            )}

            <ol
              aria-label="Movements in this EMOM"
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
                <EmomMovement
                  key={exercise.exerciseId}
                  exercise={exercise}
                  assignment={
                    view.phase === 'untimed'
                      ? null
                      : minuteAssignment(exercise.position, shape)
                  }
                  marker={markerFor(exercise.position, view)}
                />
              ))}
            </ol>

            {/*
              Once, at the foot of the card, and only when the block prescribes
              a window inside the minute: an EMOM that prescribes none rests for
              whatever is left of the minute, which is the structure rather than
              a number to print (`superset-circuit-clarity.md` §8).
            */}
            {shape.restSeconds > 0 && view.phase !== 'untimed' && (
              <p style={{ margin: 0 }}>
                {shape.restSeconds}s rest at the end of each minute
              </p>
            )}

            {view.phase === 'finished' && (
              <p style={{ margin: 0 }}>
                Every prescribed minute is done. Record the block when you are ready.
              </p>
            )}
          </>
        )}

        {/*
          The minutes the user actually got through — the outcome this structure
          observed, and the only field it supplies. An EMOM whose clock never
          ran observed nothing, and says so by supplying nothing rather than a
          zero (DATA_MODEL §8).
        */}
        <BlockCompletionControl
          blockId={block.blockId}
          outcome={observedOutcome(view)}
          label="Complete EMOM"
        />
      </div>
    </Card>
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
 * The minute the user is in: the countdown, the minute out of the window, the
 * phase in words, and the one control that belongs to the phase.
 *
 * `TimerDisplay` is handed the seconds left of *this minute* rather than of the
 * whole block, which is what makes its urgency treatment mean "wrap up this
 * minute" and reset at every boundary. The minute line is not a live region:
 * announcing a number every second makes the rest of the screen unusable, so
 * the phase word beside it is what a screen reader is meant to find.
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
      {view.phase !== 'ready' && <TimerDisplay seconds={view.secondsRemaining} />}

      <p style={{ ...labelStyle, color: 'var(--text-timer)' }}>{minuteText(view)}</p>
      <p style={labelStyle}>{PHASE_WORDS[view.phase]}</p>

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

type MovementMarker = 'now' | 'next' | null

/**
 * Which movement is live. During the rest remainder — and before the clock is
 * started — it is the movement the *next* minute opens with, labelled `NEXT`
 * rather than `NOW`: the user is resting, and being told to start is the one
 * thing the card must not say.
 */
function markerFor(position: number, view: EmomView): MovementMarker {
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

const MARKER_WORDS: Readonly<Record<'now' | 'next', string>> = {
  now: 'NOW',
  next: 'NEXT',
}

function EmomMovement({
  exercise,
  assignment,
  marker,
}: {
  exercise: ExerciseProgress
  assignment: string | null
  marker: MovementMarker
}) {
  const live = marker !== null

  return (
    <li
      // The words above are the message; `aria-current` is how the same fact
      // reaches a screen reader without it being read as decoration.
      aria-current={marker === 'now' ? 'step' : undefined}
      className="clr-stack--tight"
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Colour is never the only cue: the rule is the second one, under the
        // word. Transparent rather than absent when the movement is not live,
        // so nothing shifts on a minute boundary.
        borderLeft: `var(--border-width) solid ${
          live ? 'var(--border-frame-selection)' : 'transparent'
        }`,
        paddingLeft: 'var(--spacing-200)',
      }}
    >
      {(marker !== null || assignment !== null) && (
        <div
          className="clr-row"
          style={{ justifyContent: marker === null ? 'flex-end' : 'space-between' }}
        >
          {marker !== null && (
            <span style={{ ...labelStyle, color: 'var(--text-card-header)' }}>
              {MARKER_WORDS[marker]}
            </span>
          )}
          {assignment !== null && <span style={labelStyle}>{assignment}</span>}
        </div>
      )}

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
    </li>
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
