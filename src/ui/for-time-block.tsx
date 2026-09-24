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
 * What this file does *not* own: the `block_results` write, which is the shell's
 * for every structure type (EXE-01). It supplies `elapsed_seconds` and
 * `completed_under_cap` through `BlockCompletionControl` and nothing else — and
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
import { BlockCompletionControl } from './block-completion-control'
import { Card } from './card'
import { Heading, HeadingSection } from './Heading'
import { StructureBadge } from './workout-chrome'

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
            {/*
              The outcome in words, and the one thing here that changes without
              the user touching anything: the cap arrives on its own, so this is
              the status a screen reader is told about politely.
            */}
            <p role="status" style={statusStyle(view)}>
              <PhaseGlyph view={view} />
              {PHASE_WORDS[view.phase]}
            </p>

            <ElapsedReadout view={view} />

            <CapLine view={view} />

            <p style={labelStyle}>{shape.size === 1 ? 'The work:' : 'All of it:'}</p>

            <ol
              aria-label="Movements in this block"
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
                  <ForTimeMovement exercise={exercise} />
                </li>
              ))}
            </ol>

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

        {/*
          What this structure observed: the seconds it took and whether they
          beat the cap. A block nobody started observed neither, and says so by
          supplying nothing rather than a zero (DATA_MODEL §8).
        */}
        <BlockCompletionControl
          blockId={block.blockId}
          outcome={shape.size === 0 ? {} : forTimeOutcome(view)}
          label="Record For Time"
        />
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The readout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The elapsed time, and the only number this block is scored on.
 *
 * App-owned rather than the export's `TimerDisplay` for the same reason the
 * shell's `GlobalTimer` is: `TimerDisplay` is a *countdown*, and what For Time
 * records is the time that has passed. The export's timer treatments are still
 * what dresses it — `--timer` at rest, `--timer-low` under time pressure — so the
 * urgency vocabulary is the system's and not this file's invention.
 *
 * The digits are decorative and the accessible value is spoken in words, so a
 * screen reader hears "six minutes 23 seconds" rather than "06 colon 23", and
 * hears it when the user asks: `role="timer"` here is labelled, never live.
 */
function ElapsedReadout({ view }: { view: ForTimeView }) {
  const low = view.urgent || view.phase === 'capped'

  return (
    <div
      role="timer"
      aria-label="Block time"
      className={[
        'clr-chamfer clr-chamfer--md',
        low ? 'clr-chamfer--timer-low' : 'clr-chamfer--timer',
        // Only while the seconds are actually running out. A capped block is
        // over; pulsing it would animate a number that has stopped moving.
        view.urgent ? 'pulse-micro' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        display: 'inline-flex',
        justifyContent: 'center',
        padding: 'var(--spacing-200) var(--spacing-500)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--label-xl-size)',
          fontWeight: 'var(--font-weight-bold)',
          letterSpacing: 'var(--tracking-data)',
          color: low ? 'var(--text-timer-low)' : 'var(--text-timer)',
        }}
      >
        {formatElapsed(view.elapsedSeconds)}
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
      <p style={view.urgent ? urgentLineStyle : labelStyle}>
        {view.urgent
          ? `Cap in ${formatElapsed(view.remainingSeconds)} — finish now`
          : `Cap in ${formatElapsed(view.remainingSeconds)}`}
      </p>
    )
  }

  return <p style={labelStyle}>{formatElapsed(view.capSeconds)} cap</p>
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
    <HeadingSection
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <Heading style={{ margin: 0, textTransform: 'uppercase' }}>
        {exercise.position}. {exerciseName(prescription.exercise_id)}
      </Heading>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-data)',
          letterSpacing: 'var(--tracking-data)',
        }}
      >
        {prescriptionText(prescription)}
      </p>
    </HeadingSection>
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

/** The same label, saying the thing that is about to happen. */
const urgentLineStyle: CSSProperties = {
  ...labelStyle,
  color: 'var(--text-negative)',
  fontWeight: 'var(--font-weight-bold)',
}

const PHASE_COLOURS: Readonly<Record<ForTimeView['phase'], string>> = {
  ready: 'var(--text-card-label)',
  running: 'var(--text-card-label)',
  // The two endings, and the only two places this card leaves the label colour:
  // selection for the result that beat the cap, urgency for the one the cap cut
  // off (ATOMIC.md §3 — urgency is time pressure *and* failure).
  finished: 'var(--text-timer)',
  capped: 'var(--text-negative)',
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
