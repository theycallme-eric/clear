/**
 * EXE-04c — the AMRAP renderer: a window, a round counter, and a score. This is
 * the IA's `TimedRenderer` in its AMRAP mode (IA.md §3), composing the shipped
 * `TimerDisplay` as its `SectionTimer`.
 *
 * Everything the structure is comes from `workout_blocks`: the window is
 * `timer_seconds` and one round is the movements in their prescribed order. The
 * movements are listed rather than logged set by set — an AMRAP's unit of work is
 * the round, its members prescribe reps *per round* (contract §5), and `3 × 8`
 * under each one would describe a block nobody performed.
 *
 * Two places this renderer takes the requirement over the session plan it is
 * specced from, both deliberate and both recorded in the journal:
 *
 *   · **The round counter is live while the clock runs.** `amrap-logging.md`
 *     §"What NOT to Do" would put the stepper only in the completion state.
 *     EXE-04c calls incrementing a round "the highest-frequency interaction in
 *     the app", which is not true of a control that appears after the buzzer, so
 *     the counter is on the card from the moment the window opens and stays
 *     there afterwards. What the spec is actually protecting against — a modal, a
 *     form, a trip to another screen — is what a `+1` on a number avoids.
 *   · **A partial round is a number, not a note.** The spec's §2 collects "+ 8
 *     reps into round 6" as free text. EXE-04c requires `partial_round_reps`, and
 *     DATA-01d requires zero to be distinguishable from absence — neither is
 *     expressible in a sentence. It is a count, captured at the cap, and "no
 *     partial round recorded" is its own visible state.
 *
 * Score keeping is `amrap.ts`, which is pure, and `workout-persistence.ts`, which
 * writes it down on every tap: a refresh, a locked phone or a walk to the next
 * section and back all come back to the rounds the user had banked (SES-01). The
 * window itself is never stored as a tick count — `startedAt` is stamped once and
 * the remaining time is read against the clock, so the buzzer can go while the
 * tab is asleep.
 */
import { useId } from 'react'

import {
  Button,
  Check,
  IconButton,
  Minus,
  Play,
  Plus,
  Stop,
  TimerDisplay,
  X,
} from '../design-system/index'
import {
  amrapOutcome,
  amrapShape,
  amrapView,
  AMRAP_START,
  clampAmrapState,
  countRound,
  finishAmrap,
  setPartialRoundReps,
  startAmrap,
  type AmrapView,
} from '../state/amrap'
import { exerciseName, targetText } from '../state/prescription'
import {
  elapsedSeconds,
  formatElapsed,
  useElapsedSeconds,
} from '../state/workout-clock'
import {
  usePersistedAmrap,
  type ShellStorage,
} from '../state/workout-persistence'
import type { ExerciseProgress } from '../state/workout-progress'
import { BlockCompletionControl } from './block-completion-control'
import { Card } from './card'
import { Heading, HeadingSection } from './Heading'
import { StructureBadge } from './workout-chrome'
import type { BlockRendererProps } from './block-renderers'

export interface AmrapBlockProps extends BlockRendererProps {
  /** Injected by a test; the shell's own storage otherwise. */
  storage?: ShellStorage | null
  /** The wall clock the window is read against. */
  now?: () => number
}

export function AmrapBlock({ block, storage, now = Date.now }: AmrapBlockProps) {
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
  const elapsed = useElapsedSeconds(amrap.state.startedAt, now)
  const view = amrapView(amrap.state, shape, elapsed)

  const roundsLabelId = useId()

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
            <Window
              view={view}
              onStart={() => amrap.update(startAmrap(amrap.state, now()))}
              // Read from the clock at the moment of the tap rather than from the
              // rendered countdown: the repaint is throttled to twice a second,
              // and the time the user stopped at is the time they stopped at.
              onFinish={() =>
                amrap.update(
                  finishAmrap(
                    amrap.state,
                    shape,
                    elapsedSeconds(amrap.state.startedAt, now()),
                  ),
                )
              }
            />

            {/*
              Live from the moment the window opens, and still there once it has
              closed: one tap, on the card, with nothing to submit.
            */}
            {view.phase !== 'ready' && (
              <div
                className="clr-stack--tight"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <p id={roundsLabelId} style={labelStyle}>
                  Rounds completed
                </p>
                <Counter
                  labelledBy={roundsLabelId}
                  value={view.roundsCompleted}
                  decrementLabel="Take back a round"
                  incrementLabel="Add a completed round"
                  onChange={(delta) => amrap.update(countRound(amrap.state, delta))}
                />
              </div>
            )}

            {/*
              At the cap and nowhere else: how far into the round the buzzer
              caught the user is a question that only has an answer once it has.
            */}
            {view.phase === 'complete' && (
              <PartialRound
                reps={view.partialRoundReps}
                onChange={(reps) =>
                  amrap.update(setPartialRoundReps(amrap.state, reps))
                }
              />
            )}

            {/*
              The quickfix's label, on its own terms: two or more movements make
              a round worth naming, and a single-movement AMRAP is already
              obvious (`quickfix-amrap-round-label.md`).
            */}
            {shape.size > 1 && <p style={labelStyle}>Each round:</p>}

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
          </>
        )}

        {/*
          The score, through the one path every structure completes through. An
          AMRAP nobody started measured nothing — no rounds, no time — and says
          so by supplying nothing rather than a row of zeroes (DATA_MODEL §8).
        */}
        <BlockCompletionControl
          blockId={block.blockId}
          outcome={shape.size === 0 ? {} : amrapOutcome(view)}
          label="Complete AMRAP"
        />
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The window
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The clock, in whichever of its three states it is in.
 *
 * Running is the passive one on purpose: the phone is on the floor and the
 * countdown is all it is being asked to do (`amrap-logging.md`, design
 * principle). Complete is static and carries a tick — the window is settled, and
 * a red countdown at `00:00` would be urgency about a deadline that has passed.
 */
function Window({
  view,
  onStart,
  onFinish,
}: {
  view: AmrapView
  onStart: () => void
  onFinish: () => void
}) {
  if (view.phase === 'ready') {
    return (
      <div
        className="clr-stack--tight"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
      >
        <p style={{ margin: 0 }}>{openingText(view)}</p>
        <Button variant="primary" size="lg" icon={<Play />} onClick={onStart}>
          Start AMRAP
        </Button>
      </div>
    )
  }

  if (view.phase === 'running') {
    return (
      <div
        className="clr-stack--tight"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
      >
        {view.capSeconds === null ? (
          <p style={{ margin: 0 }}>
            No window prescribed — the clock is yours, and it reads{' '}
            {formatElapsed(view.elapsedSeconds)}.
          </p>
        ) : (
          <TimerDisplay seconds={view.remainingSeconds} size="lg" />
        )}
        <Button variant="secondary" size="lg" icon={<Stop />} onClick={onFinish}>
          {view.capSeconds === null ? 'Finish' : 'Finish early'}
        </Button>
      </div>
    )
  }

  return (
    <div
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      <p style={labelStyle}>AMRAP complete</p>
      <p
        className="clr-row"
        style={{
          margin: 0,
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--label-xl-size)',
          fontWeight: 'var(--font-weight-bold)',
          letterSpacing: 'var(--tracking-data)',
          color: 'var(--text-disabled)',
        }}
      >
        {/* The tick is the cue; the colour is deliberately the quiet one. */}
        <Check />
        {formatElapsed(view.elapsedSeconds)} on the clock
      </p>
    </div>
  )
}

/** What the card says before the window opens. */
function openingText(view: AmrapView): string {
  return view.capSeconds === null
    ? 'As many rounds as possible. This block prescribes no window, so it ends when you do.'
    : `As many rounds as possible in ${formatElapsed(view.capSeconds)}.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Counting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A number and two taps. Both buttons are at least 48px square, because the
 * hands reaching for them are tired and wet (`amrap-logging.md` §1) — and the
 * number itself is timer-sized for the same reason.
 *
 * `output` rather than a `span`: its implicit `status` role announces the new
 * count once per tap, which is the whole feedback the interaction needs.
 */
function Counter({
  labelledBy,
  value,
  decrementLabel,
  incrementLabel,
  onChange,
}: {
  labelledBy: string
  value: number
  decrementLabel: string
  incrementLabel: string
  onChange: (delta: number) => void
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="clr-row"
      style={{ alignItems: 'center', gap: 'var(--spacing-300)' }}
    >
      <IconButton
        label={decrementLabel}
        icon={<Minus />}
        size="lg"
        disabled={value === 0}
        style={touchTarget}
        onClick={() => onChange(-1)}
      />
      <output
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--heading-h1-size)',
          fontWeight: 'var(--font-weight-bold)',
          letterSpacing: 'var(--tracking-data)',
          color: 'var(--text-timer)',
          minWidth: 'var(--spacing-1000)',
          textAlign: 'center',
        }}
      >
        {value}
      </output>
      <IconButton
        label={incrementLabel}
        icon={<Plus />}
        size="lg"
        style={touchTarget}
        onClick={() => onChange(1)}
      />
    </div>
  )
}

/**
 * The partial round, in the two states it genuinely has.
 *
 * Absent is a state and not an empty field: `null` says nobody recorded how far
 * into the next round the user was, `0` says the buzzer landed on the boundary,
 * and the card says which of the two it is holding in words. That is the
 * difference DATA-01d asks to be preserved, made visible before it is written.
 */
function PartialRound({
  reps,
  onChange,
}: {
  reps: number | null
  onChange: (reps: number | null) => void
}) {
  const labelId = useId()

  if (reps === null) {
    return (
      <div
        className="clr-stack--tight"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
      >
        <p style={{ margin: 0 }}>No partial round recorded.</p>
        <Button variant="quiet" icon={<Plus />} onClick={() => onChange(0)}>
          Partial round
        </Button>
      </div>
    )
  }

  return (
    <div
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      <p id={labelId} style={labelStyle}>
        Reps into the next round
      </p>
      <Counter
        labelledBy={labelId}
        value={reps}
        decrementLabel="One rep fewer in the partial round"
        incrementLabel="One more rep in the partial round"
        onChange={(delta) => onChange(reps + delta)}
      />
      <Button variant="quiet" icon={<X />} onClick={() => onChange(null)}>
        No partial round
      </Button>
    </div>
  )
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
 */
function Movement({ exercise }: { exercise: ExerciseProgress }) {
  const prescription = exercise.prescription

  return (
    <HeadingSection
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <Heading style={{ margin: 0, textTransform: 'uppercase' }}>
        {`${exercise.position}. ${exerciseName(prescription.exercise_id)}`}
      </Heading>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-data)',
          letterSpacing: 'var(--tracking-data)',
        }}
      >
        {targetText(prescription)}
      </p>
      {prescription.tempo === null ? null : (
        <p style={{ margin: 0 }}>Tempo {prescription.tempo}</p>
      )}
    </HeadingSection>
  )
}

/** 48px each way: the tap target the spec asks for, from the spacing scale. */
const touchTarget = {
  minWidth: 'var(--spacing-1000)',
  minHeight: 'var(--spacing-1000)',
} as const

const labelStyle = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
} as const
