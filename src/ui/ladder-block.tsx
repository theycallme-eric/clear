/**
 * EXE-04a — the ladder block: one rep pattern, stated once, and the rung the
 * user actually reached.
 *
 * `ladder-for-time.md` opens with the defect this renderer exists to end: the
 * old card repeated `"2-4-6-8-10-8-6-4-2 each reps"` on *every* movement line,
 * which is both unreadable and a second source of truth for a pattern that
 * belongs to the block. So the hierarchy here is the spec's three tiers —
 * **LADDER** (the pattern, once) · **EACH RUNG** (what is performed at each of
 * those numbers) · the movements, named and nothing more.
 *
 * The rungs come from `target_sequence`, an `int[]`, through `state/ladder.ts`.
 * Nothing in this file splits a string, because the schema holds no string to
 * split (DATA_MODEL §`workout_exercises`).
 *
 * **How a ladder ends** is the other half. A For Time ladder has two endings
 * and they record different things (`ladder-for-time.md` §3): finishing the
 * pattern, or running into the cap having got part-way. The user says which,
 * and the cap-hit answer is what opens the rung selection — *how far did you
 * get?* — whose answer becomes `highest_rung` on the block's row.
 *
 * **Explicit timing** (REQ-018 / E03, TASK-033). A block carrying
 * `ladder_timing` is drawn as its rounds rather than its movements: every round
 * with its own rung target and the fixed companion work beside it, worked out
 * here so nobody adds anything up mid-workout. The three modes differ only in
 * what moves the user from one round to the next:
 *   · `scheduled_starts` — the schedule. Each round has a start offset, the
 *     block's own clock (a stored start stamp, so a refresh restores it from
 *     wall-clock time) marks the round that is live, and a countdown says when
 *     the next one starts. Nothing to press once it runs.
 *   · `for_time` — the athlete. Free-paced rounds have no start offsets and no
 *     live round: progress is never inferred from elapsed time, only declared.
 *   · `capped_window` — the athlete, inside one stated cap for the whole ladder.
 * Round count and interval length are the timing's own numbers, never
 * constants, and the global session clock is neither read nor changed here.
 *
 * What this renderer deliberately does **not** own:
 *   · **the clock.** `elapsed_seconds` and `completed_under_cap` are EXE-04b's,
 *     and a cap countdown invented here would be a second timer for the same
 *     structure. The ending is therefore *declared* rather than observed, and
 *     when EXE-04b lands it drives this same state from the real clock. A
 *     schedule's clock says which round is live and nothing more — it is never
 *     recorded as work performed.
 *   · **the write.** The outcome goes to `BlockCompletionControl` and the shell
 *     writes the row, once, for every structure type (EXE-01).
 *   · **the frame.** The one card, the identity row and the single completion
 *     are `BlockPanel`'s (`block-renderers-frame.tsx`), and the movements are
 *     rows of its list — never a card inside the card.
 *
 * `highest_rung` is the **rung number**, not the rep target — "which rung was
 * reached" (DATA_MODEL §`block_results`). The screen never says it that way:
 * a rung is identified to the user by its target, per the quickfix spec.
 */
import { useState, type ReactNode } from 'react'

import { Button, ChoiceGroup, Play, TimerDisplay } from '../design-system/index'
import type { BlockOutcome } from '../state/block-completion'
import { clampForTimeState, startForTime, FOR_TIME_START } from '../state/for-time'
import {
  explicitLadderTiming,
  ladderMovements,
  ladderRoundPlan,
  ladderRungs,
  ladderUnit,
  scheduledRoundAt,
  type LadderRoundPlan,
  type LadderRung,
} from '../state/ladder'
import { exerciseName, prescribedTarget, targetText } from '../state/prescription'
import type { LadderTiming } from '../state/schemas'
import { formatElapsed, useElapsedSeconds } from '../state/workout-clock'
import { usePersistedForTime, type ShellStorage } from '../state/workout-persistence'
import type { ExerciseProgress } from '../state/workout-progress'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel, type BlockMovementMarker } from './block-renderers-frame'
import { LadderRungs } from './ladder-rungs'
import { useInterfaceLoop } from './motion'

/**
 * How the block ended, as the user says it.
 *
 * `undeclared` is a real third state rather than a default of either: a block
 * the user advanced past without answering recorded no ending, and guessing one
 * would be inventing a measurement (DATA_MODEL §8).
 */
type Ending = 'undeclared' | 'finished' | 'capped'

const FINISHED_OPTION = { value: 'finished', label: 'Finished the ladder' }

const ENDING_OPTIONS = [FINISHED_OPTION, { value: 'capped', label: 'Hit the time cap' }]

/**
 * A schedule has no cap to hit; what stops it short is falling behind the
 * starts. The answer opens the same question, and records the same rung.
 */
const SCHEDULED_ENDING_OPTIONS = [
  FINISHED_OPTION,
  { value: 'capped', label: 'Fell behind the schedule' },
]

/**
 * The outcome the block's row gets.
 *
 * Finishing reaches the last rung, so that is what is recorded — the ladder was
 * climbed to the top, and the fact is the rung, not a zero. A cap hit records
 * the rung the user chose, and records nothing at all if they chose none:
 * advancing without answering is allowed (`ladder-for-time.md` §3), and a
 * `highest_rung` nobody stated would be a guess.
 */
function ladderOutcome(
  ending: Ending,
  reached: number | null,
  rungs: readonly LadderRung[],
): BlockOutcome {
  if (rungs.length === 0) return {}

  switch (ending) {
    case 'finished':
      return { highestRung: rungs.length }
    case 'capped':
      return reached === null ? {} : { highestRung: reached }
    case 'undeclared':
      return {}
  }
}

export interface LadderBlockProps extends BlockRendererProps {
  /** Injected by a test; the shell's own storage otherwise. */
  storage?: ShellStorage | null
  /** The wall clock a schedule is read against. */
  now?: () => number
}

export function LadderBlock({ block, storage, now }: LadderBlockProps) {
  const timing = explicitLadderTiming(block)

  if (timing === null) return <LegacyLadder block={block} />
  if (timing.mode === 'scheduled_starts') {
    return <ScheduledLadder block={block} timing={timing} storage={storage} now={now} />
  }
  return <TimedLadder block={block} timing={timing} live={null} />
}

/** A ladder with no explicit timing: exactly the EXE-04a block. */
function LegacyLadder({ block }: BlockRendererProps) {
  const [ending, setEnding] = useState<Ending>('undeclared')
  const [reached, setReached] = useState<number | null>(null)

  const rungs = ladderRungs(block.exercises)
  const unit = ladderUnit(block.exercises)
  const { laddered, interval } = ladderMovements(block.exercises)

  return (
    <BlockPanel
      block={block}
      completion={{ outcome: ladderOutcome(ending, reached, rungs) }}
    >
      {block.exercises.length === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <>
          {rungs.length === 0 ? (
            // A ladder scheme with no sequence on any movement: the block is
            // malformed, and saying so is better than drawing an empty rail.
            <BlockPanel.Note>
              This ladder prescribes no rungs — perform the movements as written.
            </BlockPanel.Note>
          ) : (
            <RungsRow rungs={rungs} unit={unit} ending={ending} reached={reached} onReach={setReached} />
          )}

          {/*
            "Do all of these at each of those numbers." One movement needs no
            such line — the rungs already imply it (quickfix spec §1).
          */}
          {laddered.length > 1 && <BlockPanel.Label>Each rung</BlockPanel.Label>}

          <BlockPanel.MovementList label="Movements in this ladder">
            {laddered.map((movement) => (
              <BlockPanel.MovementItem key={movement.exerciseId}>
                <LadderMovement movement={movement} companions={interval} />
              </BlockPanel.MovementItem>
            ))}
            {/*
              A block whose scheme is a ladder but whose movements carry no
              sequence still has movements to name. They are listed plainly
              rather than as companions to a ladder that does not exist.
            */}
            {laddered.length === 0 &&
              interval.map((movement) => (
                <BlockPanel.MovementItem key={movement.exerciseId}>
                  <LadderMovement movement={movement} companions={[]} />
                </BlockPanel.MovementItem>
              ))}
          </BlockPanel.MovementList>

          {rungs.length === 0 ? null : (
            <EndingChoice
              options={ENDING_OPTIONS}
              ending={ending}
              onEnding={setEnding}
              onReach={setReached}
            />
          )}
        </>
      )}
    </BlockPanel>
  )
}

/**
 * The rung row: the pattern while it is performed, the question once the user
 * says it stopped short (`ladder-for-time.md` §3, Path B). One row, two modes —
 * never both at once.
 */
function RungsRow({
  rungs,
  unit,
  ending,
  reached,
  onReach,
}: {
  rungs: readonly LadderRung[]
  unit: string
  ending: Ending
  reached: number | null
  onReach: (rung: number) => void
}) {
  if (ending === 'capped') {
    return (
      <LadderRungs
        rungs={rungs}
        unit={unit}
        label="How far did you get?"
        reached={reached}
        onSelect={onReach}
      />
    )
  }

  return (
    <LadderRungs
      rungs={rungs}
      unit={unit}
      label="Ladder"
      // Read-only while the block is being performed, and still read-only once
      // it is finished — with every rung climbed.
      reached={ending === 'finished' ? rungs.length : null}
    />
  )
}

function EndingChoice({
  options,
  ending,
  onEnding,
  onReach,
}: {
  options: readonly { value: string; label: string }[]
  ending: Ending
  onEnding: (ending: Ending) => void
  onReach: (rung: number | null) => void
}) {
  return (
    <ChoiceGroup
      legend="How did this block end?"
      options={[...options]}
      value={ending === 'undeclared' ? '' : ending}
      onChange={(value) => {
        const chosen = Array.isArray(value) ? value[0] : value
        onEnding(chosen === 'capped' ? 'capped' : 'finished')
        // The rung only means something for a cap hit; finishing reached
        // them all.
        if (chosen !== 'capped') onReach(null)
      }}
    />
  )
}

/**
 * One movement of the ladder: its name, and nothing that repeats the pattern.
 *
 * The companions are the `ladder_fixed_interval` case — a fixed target
 * performed between each rung, which the spec says is an annotation under the
 * primary movement rather than a peer card of its own. Stated under every
 * laddered movement because it is performed between the rungs of the ladder,
 * which all of them share.
 */
function LadderMovement({
  movement,
  companions,
}: {
  movement: ExerciseProgress
  companions: readonly ExerciseProgress[]
}) {
  return (
    <BlockPanel.Movement title={exerciseName(movement.prescription.exercise_id)}>
      {companions.map((companion) => (
        <BlockPanel.Note key={companion.exerciseId}>
          {targetText(companion.prescription)}{' '}
          {exerciseName(companion.prescription.exercise_id)} between each rung
        </BlockPanel.Note>
      ))}
    </BlockPanel.Movement>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Explicit timing — REQ-018 / E03
// ─────────────────────────────────────────────────────────────────────────────

/** Where a schedule is, read off the block's own clock. */
interface ScheduleView {
  readonly phase: 'ready' | 'running' | 'complete'
  /** The round whose start has passed and whose interval has not; null otherwise. */
  readonly round: number | null
  /** Seconds until the next start, or until the schedule ends on its last round. */
  readonly secondsRemaining: number
}

function scheduleView(
  timing: Extract<LadderTiming, { mode: 'scheduled_starts' }>,
  startedAt: string | null,
  elapsed: number,
): ScheduleView {
  if (startedAt === null) {
    return { phase: 'ready', round: null, secondsRemaining: timing.interval_seconds }
  }

  const round = scheduledRoundAt(timing, elapsed)
  if (round === null) return { phase: 'complete', round: null, secondsRemaining: 0 }

  return {
    phase: 'running',
    round,
    secondsRemaining: round * timing.interval_seconds - elapsed,
  }
}

/** The last stretch of an interval, where the countdown crosses into its low state. */
const INTERVAL_LOW_SECONDS = 10

/**
 * A scheduled ladder: the round list, the live round marked from the block's
 * own clock, and the countdown to the next start beside the card.
 *
 * The clock is one stored start stamp — the For Time record shape, read through
 * the same persistence — so a background or refresh reads the schedule back from
 * wall-clock time rather than restarting it. The global session clock is a
 * different clock and is never touched.
 */
function ScheduledLadder({
  block,
  timing,
  storage,
  now = Date.now,
}: {
  block: BlockRendererProps['block']
  timing: Extract<LadderTiming, { mode: 'scheduled_starts' }>
  storage?: ShellStorage | null
  now?: () => number
}) {
  const clock = usePersistedForTime(
    block.blockId,
    (stored) => (stored === null ? FOR_TIME_START : clampForTimeState(stored)),
    storage,
  )
  const view = scheduleView(timing, clock.state.startedAt, useElapsedSeconds(clock.state.startedAt, now))

  return (
    <TimedLadder
      block={block}
      timing={timing}
      live={view}
      timer={block.exercises.length === 0 ? null : <IntervalCountdown view={view} />}
      onStart={() => clock.moveTo(startForTime(clock.state, now()))}
    />
  )
}

/**
 * A ladder with explicit timing, drawn as its rounds.
 *
 * `live` is the schedule's reading and exists only for `scheduled_starts`; the
 * free-paced and capped modes pass `null`, so no round is ever marked from time
 * that has passed.
 */
function TimedLadder({
  block,
  timing,
  live,
  timer,
  onStart,
}: {
  block: BlockRendererProps['block']
  timing: LadderTiming
  live: ScheduleView | null
  timer?: ReactNode
  onStart?: () => void
}) {
  const [ending, setEnding] = useState<Ending>('undeclared')
  const [reached, setReached] = useState<number | null>(null)

  const rungs = ladderRungs(block.exercises)
  const unit = ladderUnit(block.exercises)
  const { laddered } = ladderMovements(block.exercises)
  const plan = ladderRoundPlan(block.exercises, timing)

  return (
    <BlockPanel
      block={block}
      timer={timer}
      completion={{ outcome: ladderOutcome(ending, reached, rungs) }}
    >
      {block.exercises.length === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <>
          <BlockPanel.Label>{timingSummary(timing, block.timerSeconds)}</BlockPanel.Label>

          {live !== null && onStart !== undefined && (
            <ScheduleStatus view={live} rounds={timing.rounds} onStart={onStart} />
          )}

          {rungs.length > 0 && (
            <RungsRow rungs={rungs} unit={unit} ending={ending} reached={reached} onReach={setReached} />
          )}

          <BlockPanel.MovementList label="Rounds in this ladder">
            {plan.map((round) => (
              <BlockPanel.MovementItem key={round.number} marker={roundMarker(round, live)}>
                <LadderRound round={round} laddered={laddered} />
              </BlockPanel.MovementItem>
            ))}
          </BlockPanel.MovementList>

          <BlockPanel.Note>{PACING_NOTES[timing.mode]}</BlockPanel.Note>

          {live?.phase === 'complete' && (
            // The schedule is over, which is all the clock can say — not a
            // record of what was performed.
            <BlockPanel.Note>
              The clock has run every scheduled round. Say how the block ended below.
            </BlockPanel.Note>
          )}

          {rungs.length > 0 && (
            <EndingChoice
              options={timing.mode === 'scheduled_starts' ? SCHEDULED_ENDING_OPTIONS : ENDING_OPTIONS}
              ending={ending}
              onEnding={setEnding}
              onReach={setReached}
            />
          )}
        </>
      )}
    </BlockPanel>
  )
}

/**
 * The timing in one line: how many rounds, and what moves them on. Every number
 * is the stored timing's; none is a default.
 */
function timingSummary(timing: LadderTiming, blockTimerSeconds: number | null): string {
  const rounds = `${timing.rounds} rounds`
  switch (timing.mode) {
    case 'scheduled_starts':
      return `${rounds} · a new round every ${formatElapsed(timing.interval_seconds)}`
    case 'for_time':
      return blockTimerSeconds === null
        ? `${rounds} · for time, at your pace`
        : `${rounds} · for time, at your pace · ${formatElapsed(blockTimerSeconds)} cap`
    case 'capped_window':
      return `${rounds} · ${formatElapsed(timing.cap_seconds)} cap on the whole ladder`
  }
}

const PACING_NOTES: Readonly<Record<LadderTiming['mode'], string>> = {
  scheduled_starts:
    'Each round starts on the clock. Whatever is left of its interval is your rest.',
  for_time:
    'Start each round when you finish the last. Nothing here moves on by itself — you say how far you got.',
  capped_window:
    'Move through the rounds at your own pace inside the cap. Nothing here moves on by itself — you say how far you got.',
}

/** The live round is `Now` and the one after it `Next`; only a schedule has either. */
function roundMarker(round: LadderRoundPlan, live: ScheduleView | null): BlockMovementMarker {
  if (live === null) return null
  if (live.phase === 'ready') return round.number === 1 ? 'next' : null
  if (live.round === null) return null
  return round.number === live.round ? 'now' : null
}

/**
 * One round, precomputed: its start (scheduled only), each laddered movement's
 * target at this rung, and the companion work, unchanged every round.
 */
function LadderRound({
  round,
  laddered,
}: {
  round: LadderRoundPlan
  laddered: readonly ExerciseProgress[]
}) {
  return (
    <BlockPanel.Movement
      title={`Round ${round.number}`}
      detail={round.startSeconds === null ? undefined : `Starts at ${formatElapsed(round.startSeconds)}`}
    >
      {laddered.map((movement) => (
        <BlockPanel.Note key={movement.exerciseId}>
          {roundTarget(movement, round.number)} {exerciseName(movement.prescription.exercise_id)}
        </BlockPanel.Note>
      ))}
      {round.companions.map((companion) => (
        <BlockPanel.Note key={companion.exerciseId}>
          {targetText(companion.prescription)} {exerciseName(companion.prescription.exercise_id)}
          {' '}— same every round
        </BlockPanel.Note>
      ))}
    </BlockPanel.Movement>
  )
}

/** A movement's target at one rung, in its own unit and per-side wording. */
function roundTarget(movement: ExerciseProgress, roundNumber: number): string {
  const target = prescribedTarget(movement.prescription)
  if (target?.kind !== 'sequence') return targetText(movement.prescription, target)

  const value = target.rungs[roundNumber - 1]
  return value === undefined
    ? 'No target'
    : targetText(movement.prescription, { kind: 'fixed', value })
}

/**
 * The schedule's place, inside the block's card: the round out of the total,
 * the phase in words, and — before it runs — the one way in. Not a live region:
 * a number announced every second would make the rest of the screen unusable.
 */
function ScheduleStatus({
  view,
  rounds,
  onStart,
}: {
  view: ScheduleView
  rounds: number
  onStart: () => void
}) {
  return (
    <div
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      {view.round !== null && (
        <BlockPanel.Label style={{ color: 'var(--text-timer)' }}>
          ROUND {view.round} OF {rounds}
        </BlockPanel.Label>
      )}
      <BlockPanel.Label>{SCHEDULE_WORDS[view.phase]}</BlockPanel.Label>

      {view.phase === 'ready' && (
        <Button variant="primary" size="lg" icon={<Play />} onClick={onStart}>
          Start schedule
        </Button>
      )}
    </div>
  )
}

const SCHEDULE_WORDS: Readonly<Record<ScheduleView['phase'], string>> = {
  ready: 'NOT STARTED',
  running: 'ON THE CLOCK',
  complete: 'COMPLETE',
}

/**
 * The countdown to the next scheduled start, as `BlockPanel`'s `timer`: the
 * shipped `TimerDisplay`, drawn beside the block's card. It counts the current
 * interval rather than the block, so its low state means "the next round is
 * about to start" and resets at every boundary — and it is given up once the
 * schedule has run out.
 */
function IntervalCountdown({ view }: { view: ScheduleView }) {
  const low = view.secondsRemaining <= INTERVAL_LOW_SECONDS
  const running = view.phase === 'running'
  const loop = useInterfaceLoop('urgent', low && running)

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column' }}
      data-urgent={low && running ? 'true' : 'false'}
      {...loop}
    >
      <TimerDisplay seconds={view.secondsRemaining} lowThreshold={INTERVAL_LOW_SECONDS} />
    </div>
  )
}
