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
 * pattern, or stopping part-way. The user says which, and the Incomplete
 * answer is what opens the rung selection — *how far did you get?* — whose
 * answer becomes `highest_rung` on the block's row.
 *
 * TASK-010 (C29, C30; R78, R87, R124): that question is now the shared result
 * log's — "Work completed" with Complete beside Incomplete in one row, then the
 * existing three-face effort (`TimedResultLog`). Its starting point follows
 * the work the ladder actually tracked and its clock, never a Finish alone:
 * nothing is tracked rung by rung yet (TASK-013 adds the live check-off), so
 * once the attempt has ended — Finish, the cap, or a schedule run out — it
 * starts at Incomplete with no rung, and only the athlete's own Complete
 * records the top rung. Before the attempt ends nothing is chosen, and the
 * athlete may still answer at any time, as before. The answer, the rung and
 * the effort are this renderer's draft (durable ladder drafts are TASK-032);
 * effort is never written, because no categorical block-effort field exists
 * yet (R116).
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
 * **Start, Pause, Resume and Finish** (TASK-006; C17, C18; R66, R67, R68). A
 * ladder raced against its cap — every mode but a schedule — runs EXE-04b's
 * own clock (`for-time.ts` and its persistence, drawn by `ForTimeClock`), not
 * a second timer invented here, with the shared `TimedWorkoutActions` in the
 * ladder's top slot: after its identity and cap, before the rung row and the
 * repetitive round list, so Start is reachable without scrolling past them.
 * Running, a secondary Pause sits beside the primary Finish.
 *
 * What this renderer deliberately does **not** own:
 *   · **a measurement from the clock.** `elapsed_seconds` and
 *     `completed_under_cap` are EXE-04b's to record, and the ladder records
 *     neither: its clock is the athlete's to watch, and the ending is still
 *     *declared* rather than observed. A schedule's clock says which round is
 *     live and nothing more — it is never recorded as work performed.
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

import { useBlockCompletion, type BlockOutcome } from '../state/block-completion'
import {
  clampForTimeState,
  finishForTime,
  forTimeLifecycle,
  forTimeTicking,
  forTimeView,
  startForTime,
  FOR_TIME_START,
  type ForTimePhase,
} from '../state/for-time'
import {
  explicitLadderTiming,
  ladderCapSeconds,
  ladderMovements,
  ladderRoundPlan,
  ladderRungs,
  ladderUnit,
  scheduledRoundAt,
  type LadderRoundPlan,
  type LadderRung,
} from '../state/ladder'
import { scheduleIntervalDeadline } from '../state/countdown-urgency'
import { prescribedTarget, targetText } from '../state/prescription'
import type { LadderTiming } from '../state/schemas'
import { useShellWeightUnit } from '../state/set-logging'
import { formatCountdownReading } from '../state/timed-clock'
import { finishLabel, pauseClock, resumeClock } from '../state/timed-lifecycle'
import { formatElapsed, useElapsedSeconds } from '../state/workout-clock'
import { usePersistedForTime, type ShellStorage } from '../state/workout-persistence'
import type { ExerciseProgress } from '../state/workout-progress'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel, type BlockMovementMarker } from './block-renderers-frame'
import { ForTimeClock } from './for-time-block'
import { LadderRungs } from './ladder-rungs'
import { DeadlineTimer } from './refinements/deadline-timer'
import { liveMovementReadings, type LiveMovementReadings } from './refinements/movement-readings'
import { TimedResultLog } from './refinements/timed-result-log'
import type { SetEffort } from './set-effort'
import { TimedWorkoutActions } from './timed-workout-flow'

/**
 * How the block ended, as the user says it (TASK-010: Complete or Incomplete).
 *
 * `unanswered` is a real third state rather than a default of either: a block
 * the user advanced past before its attempt ended, without answering, recorded
 * no ending, and guessing one would be inventing a measurement (DATA_MODEL §8).
 */
type Ending = 'unanswered' | 'complete' | 'incomplete'

/**
 * The outcome the block's row gets.
 *
 * Complete reaches the last rung, so that is what is recorded — the ladder was
 * climbed to the top, and the fact is the rung, not a zero. Incomplete records
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
    case 'complete':
      return { highestRung: rungs.length }
    case 'incomplete':
      return reached === null ? {} : { highestRung: reached }
    case 'unanswered':
      return {}
  }
}

/**
 * TASK-010 (C29, C30; AC-R010-01): the ladder's result draft — the athlete's
 * Complete or Incomplete, the rung reached and the optional effort.
 *
 * The answer starts where the tracked work and the clock put it, and never at
 * every rung: until the attempt has ended nothing is chosen; once it has (the
 * athlete's Finish, the cap, or a schedule run out) it starts at Incomplete
 * with no rung, because no rung was tracked (TASK-013 imports live check-off
 * here). The athlete's own answer, given before or after, always wins.
 *
 * A starting point belongs to the unsaved draft only. Once the block's result
 * is saved, the saved row is the answer; a renderer that no longer holds the
 * draft (its section was left and reopened) knows only that a row exists, so
 * it claims no answer rather than a starting point the row may contradict.
 * Reading the saved ladder result back is TASK-032 / TASK-048.
 */
function useLadderResult(block: BlockRendererProps['block'], ended: boolean) {
  const { isBlockRecorded } = useBlockCompletion()
  const [answer, setAnswer] = useState<Exclude<Ending, 'unanswered'> | null>(null)
  const [reached, setReached] = useState<number | null>(null)
  const [effort, setEffort] = useState<SetEffort | null>(null)

  const saved = isBlockRecorded(block.blockId)
  const rungs = ladderRungs(block.exercises)
  const ending: Ending = answer ?? (ended && !saved ? 'incomplete' : 'unanswered')
  const completed = ending === 'unanswered' ? null : ending === 'complete'

  return {
    ending,
    reached,
    setReached,
    outcome: ladderOutcome(ending, reached, rungs),
    log:
      rungs.length === 0 ? null : (
        <TimedResultLog
          format="ladder"
          value={{ completed, effort }}
          saved={saved}
          onChange={(next) => {
            if (next.completed !== null && next.completed !== completed) {
              setAnswer(next.completed ? 'complete' : 'incomplete')
              // The rung only means something for an incomplete ladder;
              // completing it reached them all.
              if (next.completed) setReached(null)
            }
            if (next.effort !== effort) setEffort(next.effort)
          }}
        />
      ),
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

  if (timing === null) return <LegacyLadder block={block} storage={storage} now={now} />
  if (timing.mode === 'scheduled_starts') {
    return <ScheduledLadder block={block} timing={timing} storage={storage} now={now} />
  }
  return <RacedLadder block={block} timing={timing} storage={storage} now={now} />
}

// ─────────────────────────────────────────────────────────────────────────────
// The ladder's race against its cap — TASK-006 (C17, C18; G05; R66, R67, R68)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ladder's clock in words. Finish ends the attempt, which is not a claim
 * that every rung was climbed (R69): how the ladder ended stays the athlete's
 * to say below, so the clock says Finished rather than For Time's
 * "Finished under cap".
 */
const LADDER_CLOCK_WORDS: Readonly<Record<ForTimePhase, string>> = {
  ready: 'Ready',
  running: 'Racing the clock',
  paused: 'Paused',
  finished: 'Finished',
  capped: 'Cap reached',
}

/**
 * A ladder raced against its cap — every ladder but a schedule — runs one
 * visible clock (R67: the same Start and stop as other For Time work), on the
 * For Time state owner and its persistence, so a refresh reads it back and a
 * paused ladder comes back paused. Its actions are the shared lifecycle in the
 * ladder's top slot (R66): Start ladder, then a secondary Pause beside the
 * primary Finish (R68). The clock is drawn beside the card once started; before
 * that the header and the timing line already state the cap.
 *
 * It records nothing (DATA_MODEL §8): how the ladder ended, and the rung
 * reached, are still declared below — the clock never fills them in.
 */
function useLadderRace(
  block: BlockRendererProps['block'],
  capSeconds: number | null,
  storage: ShellStorage | null | undefined,
  now: () => number,
): { actions: ReactNode; timer: ReactNode; ended: boolean } {
  const clock = usePersistedForTime(
    block.blockId,
    (stored) => (stored === null ? FOR_TIME_START : clampForTimeState(stored)),
    storage,
  )
  const shape = {
    capSeconds: capSeconds === null ? null : Math.max(1, Math.trunc(capSeconds)),
    size: block.exercises.length,
  }
  const view = forTimeView(clock.state, shape, useElapsedSeconds(forTimeTicking(clock.state), now))

  // TASK-010: the attempt has ended — the athlete's Finish or the cap.
  const ended = view.phase === 'finished' || view.phase === 'capped'
  if (block.exercises.length === 0) return { actions: null, timer: null, ended }
  return {
    ended,
    actions: (
      <TimedWorkoutActions
        placement="top"
        phase={forTimeLifecycle(view.phase)}
        startLabel="Start ladder"
        finishLabel={finishLabel('ladder', shape.capSeconds !== null)}
        onStart={() => clock.moveTo(startForTime(clock.state, now()))}
        onPause={() => clock.moveTo(pauseClock(clock.state, now()))}
        onResume={() => clock.moveTo(resumeClock(clock.state, now()))}
        onFinish={() => clock.moveTo(finishForTime(clock.state, now()))}
      />
    ),
    timer: view.phase === 'ready' ? null : <ForTimeClock view={view} words={LADDER_CLOCK_WORDS} />,
  }
}

interface ClockedLadderProps extends BlockRendererProps {
  storage?: ShellStorage | null
  now?: () => number
}

/** An explicit `for_time` or `capped_window` ladder: its rounds, raced against its cap. */
function RacedLadder({
  block,
  timing,
  storage,
  now = Date.now,
}: ClockedLadderProps & { timing: LadderTiming }) {
  const race = useLadderRace(block, ladderCapSeconds(timing) ?? block.timerSeconds, storage, now)
  return (
    <TimedLadder
      block={block}
      timing={timing}
      live={null}
      ended={race.ended}
      timer={race.timer}
      actions={race.actions}
    />
  )
}

/** A ladder with no explicit timing: the EXE-04a block, raced against the block's cap. */
function LegacyLadder({ block, storage, now = Date.now }: ClockedLadderProps) {
  const race = useLadderRace(block, block.timerSeconds, storage, now)
  const result = useLadderResult(block, race.ended)
  const { ending, reached, setReached } = result

  const rungs = ladderRungs(block.exercises)
  const unit = ladderUnit(block.exercises)
  const { laddered, interval } = ladderMovements(block.exercises)

  return (
    <BlockPanel
      block={block}
      timer={race.timer}
      completion={{ outcome: result.outcome }}
    >
      {block.exercises.length === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <>
          {/* R66: the ladder's top action, after its identity and cap. */}
          {race.actions}

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

          {/* TASK-010 (C29, C30): the ladder's result log, after its work. */}
          {result.log}
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
  if (ending === 'incomplete') {
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
      // it is complete — with every rung climbed.
      reached={ending === 'complete' ? rungs.length : null}
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
  const weightUnit = useShellWeightUnit()
  // R31, C10 (TASK-003): the same name, compact equipment and prescribed load
  // Review shows, through its formatters and the profile's unit.
  const readings = liveMovementReadings(movement.prescription, weightUnit)
  return (
    <BlockPanel.Movement
      title={readings.name}
      load={readings.load}
      // C03, R132: the compact equipment beside the name, as Review shows it.
      context={readings.equipment}
    >
      {companions.map((companion) => {
        const companionReadings = liveMovementReadings(companion.prescription, weightUnit)
        return (
          <BlockPanel.Note key={companion.exerciseId}>
            {targetText(companion.prescription)} {companionReadings.name}
            <PrescribedLoad readings={companionReadings} /> between each rung
          </BlockPanel.Note>
        )
      })}
    </BlockPanel.Movement>
  )
}

/**
 * C10 (TASK-003): a movement's prescribed load inside a ladder's target line,
 * ` · 15 kg`, read through `liveMovementReadings` like every other live
 * movement — a target, never a performed weight, and nothing when the
 * prescription carries no load or its `Bodyweight` is said by the equipment.
 */
function PrescribedLoad({ readings }: { readings: LiveMovementReadings }) {
  if (readings.load === null) return null
  return (
    <>
      {' · '}
      <span data-movement-load="">{readings.load}</span>
    </>
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
      // TASK-010: a schedule that has run every round has ended its attempt.
      ended={view.phase === 'complete'}
      timer={block.exercises.length === 0 ? null : <IntervalCountdown view={view} />}
      // TASK-006 (C17): the schedule's one way in, in the ladder's shared top
      // slot. Its lifecycle is its own: once it runs, every round starts on
      // the clock, so there is nothing to pause or finish.
      actions={
        block.exercises.length === 0 ? null : (
          <TimedWorkoutActions
            placement="top"
            phase={view.phase === 'ready' ? 'ready' : 'ended'}
            startLabel="Start schedule"
            onStart={() => clock.moveTo(startForTime(clock.state, now()))}
          />
        )
      }
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
  ended,
  timer,
  actions,
}: {
  block: BlockRendererProps['block']
  timing: LadderTiming
  live: ScheduleView | null
  /** TASK-010: whether the attempt has ended — Finish, the cap, or the schedule run out. */
  ended: boolean
  timer?: ReactNode
  /** The ladder's top action slot (TASK-006, R66): after its identity and cap. */
  actions?: ReactNode
}) {
  const result = useLadderResult(block, ended)
  const { ending, reached, setReached } = result

  const rungs = ladderRungs(block.exercises)
  const unit = ladderUnit(block.exercises)
  const { laddered } = ladderMovements(block.exercises)
  const plan = ladderRoundPlan(block.exercises, timing)

  return (
    <BlockPanel
      block={block}
      timer={timer}
      completion={{ outcome: result.outcome }}
    >
      {block.exercises.length === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <>
          <BlockPanel.Label>{timingSummary(timing, block.timerSeconds)}</BlockPanel.Label>

          {live !== null && <ScheduleStatus view={live} rounds={timing.rounds} />}

          {/*
            R66 (TASK-006): the long ladder's exception — its actions near the
            top, after its identity and cap, so they are reachable without the
            repetitive round list below. One slot, never sticky or repeated.
          */}
          {actions}

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

          {/* TASK-010 (C29, C30): the ladder's result log, after its work. */}
          {result.log}
        </>
      )}
    </BlockPanel>
  )
}

/**
 * The timing in one line: how many rounds, and what moves them on. Every number
 * is the stored timing's; none is a default.
 */
export function timingSummary(timing: LadderTiming, blockTimerSeconds: number | null): string {
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

export const PACING_NOTES: Readonly<Record<LadderTiming['mode'], string>> = {
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
  const weightUnit = useShellWeightUnit()
  // C10 (TASK-003): each target line states the movement's prescribed load
  // beside it, as Review does, through the same readings.
  return (
    <BlockPanel.Movement
      title={`Round ${round.number}`}
      detail={round.startSeconds === null ? undefined : `Starts at ${formatElapsed(round.startSeconds)}`}
    >
      {laddered.map((movement) => {
        const readings = liveMovementReadings(movement.prescription, weightUnit)
        return (
          <BlockPanel.Note key={movement.exerciseId}>
            {roundTarget(movement, round.number)} {readings.name}
            <PrescribedLoad readings={readings} />
          </BlockPanel.Note>
        )
      })}
      {round.companions.map((companion) => {
        const readings = liveMovementReadings(companion.prescription, weightUnit)
        return (
          <BlockPanel.Note key={companion.exerciseId}>
            {targetText(companion.prescription)} {readings.name}
            <PrescribedLoad readings={readings} />
            {' '}— same every round
          </BlockPanel.Note>
        )
      })}
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
 * The schedule's place, inside the block's card: the round out of the total
 * and the phase in words. Its one way in is the ladder's shared top action
 * slot, just below (TASK-006). Not a live region: a number announced every
 * second would make the rest of the screen unusable.
 */
function ScheduleStatus({ view, rounds }: { view: ScheduleView; rounds: number }) {
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
 * shared whole timer body (TASK-007, C19), filling the block's width with its
 * digits centred, drawn beside the block's card. It counts the current
 * interval rather than the block, so its warning means "the next round is
 * about to start" and resets at every boundary. The warning is the shared one
 * (TASK-008: C22, C23, C24, C61; R126 names interval countdowns): colour from
 * ten seconds left, the breathe with the one soft screen-edge aura in the last
 * five while the schedule runs, and nothing once the schedule has run out.
 */
function IntervalCountdown({ view }: { view: ScheduleView }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <DeadlineTimer reading={formatCountdownReading(view.secondsRemaining)} deadline={scheduleIntervalDeadline(view)} />
    </div>
  )
}
