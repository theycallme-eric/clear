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
 * §3): red here is time pressure, never danger. So it is scoped to the last
 * `FOR_TIME_URGENCY_SECONDS` of a *running* cap and to the capped outcome itself,
 * and it never arrives as hue alone — the words change ("Cap in 0:07 — finish
 * now"), a glyph appears beside them, and the readout pulses while the seconds
 * are actually running out. The pulse is disabled under `prefers-reduced-motion`
 * (motion.css), which is exactly why the words have to carry it too.
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
 */
import type { CSSProperties } from 'react'

import { AlertTriangle, Button, Check, Play, Stop } from '../design-system/index'
import {
  clampForTimeState,
  finishForTime,
  forTimeOutcome,
  forTimeShape,
  forTimeView,
  startForTime,
  FOR_TIME_START,
  type ForTimeView,
} from '../state/for-time'
import { exerciseName, prescriptionText } from '../state/prescription'
import { formatElapsed, spokenElapsed, useElapsedSeconds } from '../state/workout-clock'
import {
  usePersistedForTime,
  type ShellStorage,
} from '../state/workout-persistence'
import type { ExerciseProgress } from '../state/workout-progress'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel } from './block-renderers-frame'
import { Card } from './card'
import { useInterfaceLoop } from './motion'

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
  // is — and not read at all once the attempt has finished: passing a null start
  // switches the tick off, because a finished attempt's time is the distance
  // between its two stamps and repainting it twice a second would change nothing.
  const elapsed = useElapsedSeconds(
    clock.state.finishedAt === null ? clock.state.startedAt : null,
    now,
  )
  const view = forTimeView(clock.state, shape, elapsed)

  const start = () => clock.moveTo(startForTime(clock.state, now()))
  const finish = () => clock.moveTo(finishForTime(clock.state, now()))

  return (
    <BlockPanel
      block={block}
      timer={shape.size === 0 ? null : <ForTimeClock view={view} />}
      // What this structure observed: the seconds it took and whether they
      // beat the cap. A block nobody started observed neither, and says so by
      // supplying nothing rather than a zero (DATA_MODEL §8).
      completion={{
        outcome: shape.size === 0 ? {} : forTimeOutcome(view),
        label: 'Record For Time',
      }}
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
            One forward control, and which one it is *is* the phase: starting
            the race, or ending it. Neither exists once the attempt is over —
            a second Start would discard the time it took, and the cap cannot
            be un-reached.
          */}
          {view.phase === 'ready' && (
            <Button variant="primary" size="lg" icon={<Play />} onClick={start}>
              Start For Time
            </Button>
          )}

          {view.phase === 'running' && (
            <Button variant="primary" size="lg" icon={<Stop />} onClick={finish}>
              Finish
            </Button>
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
 * The race, as `BlockPanel`'s `timer`: one timer-role card holding the outcome
 * in words, the elapsed reading and the cap, drawn beside the block's card
 * rather than inside it. Nothing of the clock floats outside its own card.
 *
 * The low state is the shipped one and nothing more. The card changes role, so
 * bar, body and digits step to the low colours over `--dur-alert`, and the
 * whole card takes `.clr-pulse-micro` — the dim to 80% — with no glow of its
 * own. The pulse is an `urgent` claim on the view's one loop, held only while
 * the seconds are actually running out: it outranks a wait beside it, it is
 * still under reduced motion with the words, digits and colour unchanged, and a
 * capped block gives it up — pulsing it would animate a number that has stopped
 * moving.
 */
function ForTimeClock({ view }: { view: ForTimeView }) {
  const low = view.urgent || view.phase === 'capped'
  const loop = useInterfaceLoop('urgent', view.urgent)

  return (
    // The pulse runs on the wrapper so bar and body dim together.
    <div
      className={view.urgent ? 'clr-pulse-micro' : undefined}
      data-urgent={view.urgent ? 'true' : 'false'}
      {...loop}
    >
      <Card role={low ? 'timer-low' : 'timer'}>
        <div className="clr-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {/*
            The outcome in words, and the one thing here that changes without
            the user touching anything: the cap arrives on its own, so this is
            the status a screen reader is told about politely.
          */}
          <p role="status" style={statusStyle(view)}>
            <PhaseGlyph view={view} />
            {PHASE_WORDS[view.phase]}
          </p>

          <ElapsedReadout view={view} low={low} />
        </div>

        <CapLine view={view} />
      </Card>
    </div>
  )
}

/**
 * The elapsed time, and the only number this block is scored on.
 *
 * App-owned rather than the export's `TimerDisplay` for the same reason the
 * shell's `GlobalTimer` is: `TimerDisplay` is a *countdown*, and what For Time
 * records is the time that has passed. The digits are still drawn the way
 * `TimerDisplay` draws them — each one tumbles when it changes, the colon holds
 * still, and the colour crosses into the low state on the frame's own schedule,
 * `--dur-alert`, stepped.
 *
 * The digits are decorative and the accessible value is spoken in words, so a
 * screen reader hears "six minutes 23 seconds" rather than "06 colon 23", and
 * hears it when the user asks: `role="timer"` here is labelled, never live.
 */
function ElapsedReadout({ view, low }: { view: ForTimeView; low: boolean }) {
  return (
    <div role="timer" aria-label="Block time" style={{ display: 'inline-flex' }}>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--label-xl-size)',
          fontWeight: 'var(--font-weight-bold)',
          letterSpacing: 'var(--tracking-data)',
          color: low ? 'var(--text-timer-low)' : 'var(--text-timer)',
          transition: 'color var(--dur-alert) var(--step-4)',
        }}
      >
        {formatElapsed(view.elapsedSeconds)
          .split('')
          .map((char, index) => (
            <span
              key={`${index}-${char}`}
              className={char === ':' ? undefined : 'clr-tumble'}
              style={{
                display: 'inline-block',
                minWidth: char === ':' ? undefined : '0.62em',
                textAlign: 'center',
              }}
            >
              {char}
            </span>
          ))}
      </span>
      <span className="a11y-hidden">{spokenElapsed(view.elapsedSeconds)}</span>
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

  if (view.phase === 'running' && view.remainingSeconds !== null) {
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

  return (
    <BlockPanel.Movement
      title={`${exercise.position}. ${exerciseName(prescription.exercise_id)}`}
      detail={prescriptionText(prescription)}
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
