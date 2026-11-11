/**
 * EXE-04a — the ladder block: one rep pattern, stated once, and the rung the
 * user actually reached.
 *
 * `ladder-for-time.md` opens with the defect this renderer exists to end: the
 * old card repeated `"2-4-6-8-10-8-6-4-2 each reps"` on *every* movement line,
 * which is both unreadable and a second source of truth for a pattern that
 * belongs to the block.
 *
 * **The compact prescription** (TASK-012; C35; R70, R71, R72, R94, R95, R117).
 * Every ladder — legacy or explicitly timed — states its prescription through
 * the one shared owner, `LadderPrescription` (`refinements/ladder.tsx`): one
 * concise line per movement for the whole progression (`2 → 24 reps · +2 per
 * round`, the fixed companion's `4 reps`), then every round as a compact tile
 * in the ×/· notation, the fixed companion in each. It replaces the read-only
 * rung row, the "Each rung" caption, the movement rows with their "between
 * each rung" annotation and the long per-round list with its "— same every
 * round" suffix, which all said the same pattern again (R70, R95). The
 * read-only rung row is no longer drawn at all: TASK-013 moved the reached
 * reading and the "how far" question into the result log as rep-first tiles.
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
 * the work the ladder actually tracked and its clock, never a Finish alone.
 * Before the attempt ends nothing is chosen, and the athlete may still answer
 * at any time, as before. Effort stays this renderer's memory (unstored);
 * since TASK-015 it is reported to the shell and saved as the block's
 * categorical `effort`, never a number. TASK-015 also asks each movement's
 * completed amount for the round after the stated prefix, and its load, on
 * the durable draft (`useLadderResult`).
 *
 * **Ordered live progress and its handoff** (TASK-013; C33, C34, C36; R69,
 * R77, R88, R89, R92, R93, R99, R118, R124). While a raced ladder's clock runs
 * or is paused, its round tiles are the live check-off: a tap selects every
 * round through the one tapped, a tap inside the selection leaves the rounds
 * before it, and the count says how many (`LadderPrescription`'s `progress`).
 * The attempt — its clock, that progress, the answer and the rung — is
 * TASK-032's durable ladder record (`usePersistedLadder`, one clock, never the
 * For Time record beside it), so a reload or a closed tab keeps all of it.
 * When the attempt ends — the athlete's Finish or the cap — the tracked
 * progress is imported into the editable log (`finishLadderAttempt` and the
 * lazy carry at the cap): every round checked starts the log at Complete, a
 * prefix at Incomplete through its last round, and nothing tracked leaves the
 * athlete's own answer, starting at Incomplete with no round stated. Finish
 * alone never selects every round, and no planned target becomes an actual:
 * the only value recorded is `highest_rung`, the rounds completed through.
 * The log draws the rounds as rep-first tiles (`LadderCompletion`): the
 * athlete corrects them there, Complete selects every round, Incomplete
 * clears the round to be stated again, and the round after the stated prefix
 * is named as where any partial work belongs (its entry is TASK-015's).
 *
 * **Accidental Finish recovery** (TASK-014; C38, C39, C60; R124, R130, R141;
 * P04). While the athlete's Finish can be undone (TASK-032's `undo`), the log
 * offers the quiet `Undo finish · Resume ladder` under Complete / Incomplete
 * and before Rounds completed, its text at the count's left edge, with no
 * confirmation. It returns the same attempt as though Finish had not
 * occurred (`undoFinish`): a running clock runs on from the same start, so
 * the time spent finished counts and none is granted; a paused one is paused
 * again at the same moment; live progress comes back from the log's rounds,
 * the log's entries stay, and its ending answer goes back to what it was
 * before Finish. The original cap stays the authority: the action is
 * withdrawn the moment undoing would resume at or past it, and the cap itself
 * is never undone. A saved result ends it: the shell's word that the row
 * exists closes the durable attempt in the same act (`onBlockRecorded`), so a
 * reload never finds a saved attempt open. Neither Finish nor Undo completes
 * or leaves the workout: that stays the shell's forward action.
 *
 * A scheduled ladder (`scheduled_starts`) keeps its start stamp, answer and
 * round in the same durable record, with no cap (TASK-032's
 * `ladderRaceCapSeconds` gives a schedule none, and none is invented here):
 * its own clock marks the live round (`Now`), so it offers no check-off, and
 * its end is its schedule's, which starts the log as TASK-010 does.
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
 * own clock (`for-time.ts`'s race state, kept in the ladder's durable attempt
 * since TASK-013 and drawn by `ForTimeClock`), not a second timer invented
 * here, with the shared `TimedWorkoutActions` in the ladder's top slot: after
 * its identity and cap, before the round list, so Start is reachable without
 * scrolling past it. Running, a secondary Pause sits beside the primary Finish.
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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'

import { useBlockCompletion, type BlockOutcome, type TimedResultReport } from '../state/block-completion'
import { forTimeTicking, type ForTimePhase } from '../state/for-time'
import {
  explicitLadderTiming,
  ladderRoundPlan,
  ladderRungs,
  ladderUnit,
  scheduledRoundAt,
  type LadderRoundPlan,
  type LadderRung,
} from '../state/ladder'
import {
  ladderAttemptView,
  ladderPartialRound,
  ladderRaceCapSeconds,
  type LadderAttempt,
  type LadderAttemptView,
} from '../state/ladder-recovery'
import { scheduleIntervalDeadline } from '../state/countdown-urgency'
import type { LadderTiming } from '../state/schemas'
import { useShellWeightUnit } from '../state/set-logging'
import { formatCountdownReading } from '../state/timed-clock'
import { finishLabel } from '../state/timed-lifecycle'
import { formatElapsed, useElapsedSeconds } from '../state/workout-clock'
import { usePersistedLadder, type PersistedLadder, type ShellStorage } from '../state/workout-persistence'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel, type BlockMovementMarker } from './block-renderers-frame'
import { ForTimeClock } from './for-time-block'
import { DeadlineTimer } from './refinements/deadline-timer'
import { LadderPrescription, type LadderRoundContext, type LadderRoundsProgress } from './refinements/ladder'
import { UNSCOPED_WEIGHT_UNIT } from './refinements/timed-result-log'
import { TimedResultDialog } from './refinements/timed-result-dialog'
import type { SetEffort } from './set-effort'
import { TimedWorkoutActions } from './timed-workout-flow'

/** No entry typed yet: one frozen object, so a report with nothing new is the same report. */
const NO_ENTRIES: Readonly<Record<string, never>> = Object.freeze({})

/**
 * A session id for a bare completion seam that supplies none (a test mounting
 * a renderer outside the shell). The shell's own provider always names the
 * session, and every record it files is read back only under that name.
 */
const UNSCOPED_SESSION = 'unscoped-session'

/**
 * TASK-014 (C38, C39; R124, R130, R141): the accepted quiet action's words
 * (reference `GalleryLadderFlow`), which are also its accessible name.
 */
const UNDO_FINISH_LABEL = 'Undo finish · Resume ladder'

/** One ladder attempt, as every ladder renderer reads and moves it. */
interface LadderAttemptHandle {
  /** TASK-032's durable attempt: the clock, ordered progress and the result draft. */
  readonly ladder: PersistedLadder
  /** What the attempt is now: clock, lifecycle, progress, draft and outcome. */
  readonly view: LadderAttemptView
  readonly rungs: readonly LadderRung[]
  /** The server's word that the block's row exists (`isBlockRecorded`). */
  readonly recorded: boolean
  /** TASK-014: undo the athlete's Finish, keeping the focus with the attempt. */
  readonly undoFinish: () => void
  /** TASK-014: the race's lead control (Pause or Resume once the attempt is back). */
  readonly leadRef: RefObject<HTMLButtonElement | null>
}

/**
 * TASK-014 (AC-R014-03): the stamp an Undo's clock runs from while that Undo
 * can still run out — a running attempt finished under a cap — so the read
 * model is re-derived each second and the action is withdrawn the moment
 * undoing would resume the clock at or past its original cap. A paused
 * Finish never runs out (its clock is not moving), and nothing ticks once Undo
 * is unavailable.
 */
function undoExpiry(attempt: LadderAttempt, view: LadderAttemptView): string | null {
  if (!view.undo.available || attempt.originalCapSeconds === null) return null
  return attempt.checkpoint?.pausedAt === null ? attempt.clock.startedAt : null
}

/**
 * TASK-013 (C36; R118, R124): the ladder's one attempt — its race clock, its
 * live progress and its result draft — restored from and written to TASK-032's
 * durable record (`usePersistedLadder`, `clear.workout-ladders`) under the
 * session, block and attempt it belongs to. One clock: a ladder clock an older
 * build kept under the For Time key is adopted once, never run beside this one.
 * `capSeconds` is stamped as the attempt's original cap when it is created
 * (`ladderRaceCapSeconds`; none for a schedule), and every reading after that
 * uses it. The read model is re-derived each second while the clock runs, as
 * every timed block's is (`useElapsedSeconds`).
 */
function useLadderAttempt(
  block: BlockRendererProps['block'],
  capSeconds: number | null,
  storage: ShellStorage | null | undefined,
  now: () => number,
): LadderAttemptHandle {
  const { isBlockRecorded, sessionId, onBlockRecorded } = useBlockCompletion()
  const recorded = isBlockRecorded(block.blockId)
  const rungs = ladderRungs(block.exercises)
  const ladder = usePersistedLadder({
    sessionId: sessionId ?? UNSCOPED_SESSION,
    blockId: block.blockId,
    capSeconds,
    rungCount: rungs.length,
    recorded,
    storage,
    now,
  })
  const { markRecorded, undoFinish: undo } = ladder

  // TASK-014 (AC-R014-03): a successful save ends Undo. The shell says the
  // row exists in the same act as its insert is answered, before the forward
  // action moves on and this renderer unmounts, so the durable record is
  // closed — not left open to an Undo after a reload.
  useEffect(() => onBlockRecorded?.(block.blockId, markRecorded), [block.blockId, markRecorded, onBlockRecorded])

  const view = ladderAttemptView(ladder.attempt, { rungCount: rungs.length, now: now(), recorded })
  useElapsedSeconds(forTimeTicking(ladder.attempt.clock) ?? undoExpiry(ladder.attempt, view), now)

  // TASK-014: the Undo the athlete pressed is gone once the attempt is back;
  // when it held the focus, the focus goes to the race's lead control.
  const leadRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    leadRef.current?.focus()
  })
  const undoFinish = useCallback(() => {
    const focused = document.activeElement
    refocus.current = focused instanceof Element && focused.closest('[data-timed-undo]') !== null
    undo()
  }, [undo])

  return { ladder, view, rungs, recorded, undoFinish, leadRef }
}

/**
 * TASK-013 (C34, R118): live ordered check-off, offered only while the
 * attempt's clock runs or is paused (`canTrack`) — never before Start, after
 * Finish or the cap, or once saved — and only for the rungs the ladder has.
 */
function liveProgress({ ladder, view, rungs }: LadderAttemptHandle): LadderRoundsProgress | null {
  if (!view.canTrack || rungs.length === 0) return null
  return { completedThrough: view.progress, rounds: rungs.length, onProgress: ladder.track }
}

/**
 * The ladder's result log (TASK-010: C29, C30; TASK-013: C33, C34, C36): the
 * athlete's Complete or Incomplete, the rounds completed through and the
 * optional effort.
 *
 * The answer and the rounds are the durable attempt's draft. When the attempt
 * ends, its tracked progress is imported into that draft (TASK-032's carry):
 * every round checked starts at Complete, a prefix at Incomplete through its
 * last round. With nothing tracked, the draft is the athlete's own answer, and
 * once the attempt has ended — the athlete's Finish, the cap, or a schedule
 * run out — an unanswered draft starts at Incomplete with no round stated
 * (TASK-010), drawn but not recorded: never every round, and never a round
 * nobody stated. The athlete corrects any of it: Complete is every round, a
 * tile states the rounds through it (every round is Complete), and Incomplete
 * clears the round to be stated again rather than keeping the top one.
 *
 * A starting point belongs to the unsaved draft only. Once the block's result
 * is saved, the saved row is the answer; a renderer that no longer holds the
 * draft (the server reports a row this device did not see saved) claims no
 * answer rather than a starting point the row may contradict (TASK-032's
 * `saved-elsewhere`). Reading the saved result back is TASK-048's.
 *
 * Effort stays this renderer's memory (unstored), reported to the shell as the
 * block's categorical effort (TASK-015) and never a number.
 *
 * TASK-015 (C37; AC-C37-01, AC-R015-01): the per-movement partial and load
 * entries are the durable draft's `movements` (TASK-032's owner, built for
 * them), so they survive a reload and an Undo; a partial belongs to the round
 * after the stated prefix (`ladderPartialRound`, the same round the log names
 * as where partial work belongs) and is asked only while one is stated and a
 * rung is left; a change of rung clears the amounts and keeps the loads (the
 * owner's `editLadderDraft`). They reach the row through the shell's one
 * completion path as the block's timed report, with the rung count the
 * partial's round is bounded by.
 */
function useLadderResult(
  block: BlockRendererProps['block'],
  { ladder, view, rungs, recorded, undoFinish }: LadderAttemptHandle,
  ended: boolean,
): { outcome: BlockOutcome; timed: TimedResultReport; log: ReactNode } {
  const [effort, setEffort] = useState<SetEffort | null>(null)
  // TASK-047 (REQ-031): the log's optional notes, a draft of this mount as
  // the effort is, reported as the block's existing `notes` once typed.
  const [notes, setNotes] = useState('')
  const saved = recorded || !view.editable
  const draft = view.draft
  const completed = draft?.completed ?? (ended && view.editable ? false : null)
  const completedThrough = completed === true ? rungs.length : (draft?.highestRung ?? null)
  const weightUnit = useShellWeightUnit() ?? UNSCOPED_WEIGHT_UNIT
  const movements = draft?.movements ?? NO_ENTRIES
  const partialRound = completed === false ? ladderPartialRound(completedThrough, rungs.length) : null
  const rungCount = rungs.length
  const timed = useMemo<TimedResultReport>(
    () => ({ family: 'ladder', effort, movements, weightUnit, rungCount }),
    [effort, movements, rungCount, weightUnit],
  )

  const outcome = view.outcome
  const reported = useMemo<BlockOutcome>(
    () => (notes.trim() !== '' ? { ...outcome, notes } : outcome),
    [notes, outcome],
  )

  return {
    outcome: reported,
    timed,
    log:
      rungs.length === 0 ? null : (
        // TASK-046 (C45; R100): one "Log results" action where the log was,
        // primary once the attempt has ended, opening the same log in the
        // shared focused dialog; Undo finish closes it as it resumes.
        <TimedResultDialog
          openerVariant={ended ? 'primary' : 'secondary'}
          format="ladder"
          value={{ completed, effort }}
          saved={saved}
          rounds={
            completed === null
              ? null
              : {
                  rungs,
                  unit: ladderUnit(block.exercises),
                  completedThrough,
                  // AC-R013-01: partial work belongs to the round after the prefix.
                  partialRound,
                  onChange: (through) => ladder.editDraft({ completed: through === rungs.length, highestRung: through }),
                }
          }
          // TASK-014 (C38, C39): while the athlete's Finish can be undone.
          completionAction={view.undo.available ? { label: UNDO_FINISH_LABEL, onAction: undoFinish } : null}
          // TASK-015 (C37): the entries for the round after the prefix, and the loads.
          movements={
            completed === null
              ? null
              : {
                  exercises: block.exercises,
                  partialRound,
                  weightUnit,
                  values: movements,
                  onChange: (exerciseId, entry) => ladder.editDraft({ movements: { [exerciseId]: entry } }),
                }
          }
          onChange={(next) => {
            if (next.completed !== null && next.completed !== completed) {
              // Complete is every round; Incomplete states its round again,
              // never keeping the top one Complete recorded.
              ladder.editDraft(next.completed ? { completed: true } : { completed: false, highestRung: null })
            }
            if (next.effort !== effort) setEffort(next.effort)
          }}
          // TASK-047: the block's notes, after the effort.
          notes={{ value: notes, onChange: setNotes }}
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
 * visible clock (R67: the same Start and stop as other For Time work): the
 * attempt's race clock, so a refresh reads it back and a paused ladder comes
 * back paused. Its actions are the shared lifecycle in the ladder's top slot
 * (R66): Start ladder, then a secondary Pause beside the primary Finish (R68),
 * and nothing once the attempt has ended or its result is saved. The clock is
 * drawn beside the card once started; before that the header and the timing
 * line already state the cap.
 *
 * It records nothing (DATA_MODEL §8): the clock never fills in how the ladder
 * ended. Finish carries what the athlete checked off into the log (TASK-013).
 */
function ladderRace(
  block: BlockRendererProps['block'],
  { ladder, view, leadRef }: LadderAttemptHandle,
): { actions: ReactNode; timer: ReactNode } {
  if (block.exercises.length === 0) return { actions: null, timer: null }
  return {
    actions: (
      <TimedWorkoutActions
        placement="top"
        phase={view.lifecycle}
        startLabel="Start ladder"
        finishLabel={finishLabel('ladder', ladder.attempt.originalCapSeconds !== null)}
        onStart={ladder.start}
        onPause={ladder.pause}
        onResume={ladder.resume}
        onFinish={ladder.finish}
        leadRef={leadRef}
      />
    ),
    timer: view.clock.phase === 'ready' ? null : <ForTimeClock view={view.clock} words={LADDER_CLOCK_WORDS} />,
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
  const attempt = useLadderAttempt(block, ladderRaceCapSeconds(block), storage, now)
  const race = ladderRace(block, attempt)
  return (
    <TimedLadder
      block={block}
      timing={timing}
      live={null}
      attempt={attempt}
      ended={attempt.view.ended}
      progress={liveProgress(attempt)}
      timer={race.timer}
      actions={race.actions}
    />
  )
}

/** A ladder with no explicit timing: the EXE-04a block, raced against the block's cap. */
function LegacyLadder({ block, storage, now = Date.now }: ClockedLadderProps) {
  const attempt = useLadderAttempt(block, ladderRaceCapSeconds(block), storage, now)
  const race = ladderRace(block, attempt)
  const result = useLadderResult(block, attempt, attempt.view.ended)
  const weightUnit = useShellWeightUnit()

  return (
    <BlockPanel
      block={block}
      timer={race.timer}
      completion={{ outcome: result.outcome, timed: result.timed }}
    >
      {block.exercises.length === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <>
          {/* R66: the ladder's top action, after its identity and cap. */}
          {race.actions}

          {attempt.rungs.length === 0 && (
            // A ladder scheme with no sequence on any movement: the block is
            // malformed, and saying so is better than drawing an empty grid.
            <BlockPanel.Note>
              This ladder prescribes no rungs — perform the movements as written.
            </BlockPanel.Note>
          )}

          {/*
            TASK-012 (C35): the whole prescription, once — each movement's
            progression or fixed target, then every rung as a round. With no
            explicit timing the rounds are the ladder's own rungs; a block whose
            movements carry no sequence still names them, with no rounds.
            TASK-013 (C34): while the clock runs or is paused, the rounds are
            the live ordered check-off.
          */}
          <LadderPrescription exercises={block.exercises} weightUnit={weightUnit} progress={liveProgress(attempt)} />

          {/* TASK-010, TASK-013: the ladder's result log, after its work. */}
          {result.log}
        </>
      )}
    </BlockPanel>
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
 * The clock is one stored start stamp — the race clock of the ladder's durable
 * attempt since TASK-013 (`usePersistedLadder`), with no cap, because a
 * schedule has none and none is invented — so a background or refresh reads
 * the schedule back from wall-clock time rather than restarting it, and the
 * answer and round given at its end survive a reload too. A schedule started
 * by an older build (its stamp under the For Time key) is adopted once. The
 * schedule's own clock marks the live round, so it offers no check-off; its
 * end is its schedule's. The global session clock is a different clock and is
 * never touched.
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
  const attempt = useLadderAttempt(block, null, storage, now)
  const startedAt = attempt.ladder.attempt.clock.startedAt
  const view = scheduleView(timing, startedAt, useElapsedSeconds(startedAt, now))

  return (
    <TimedLadder
      block={block}
      timing={timing}
      live={view}
      attempt={attempt}
      // TASK-010: a schedule that has run every round has ended its attempt.
      ended={view.phase === 'complete'}
      progress={null}
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
            onStart={attempt.ladder.start}
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
  attempt,
  ended,
  progress,
  timer,
  actions,
}: {
  block: BlockRendererProps['block']
  timing: LadderTiming
  live: ScheduleView | null
  /** The ladder's one durable attempt (TASK-013, over TASK-032). */
  attempt: LadderAttemptHandle
  /** TASK-010: whether the attempt has ended — Finish, the cap, or the schedule run out. */
  ended: boolean
  /** TASK-013: the live ordered check-off while the race can track it; null otherwise. */
  progress: LadderRoundsProgress | null
  timer?: ReactNode
  /** The ladder's top action slot (TASK-006, R66): after its identity and cap. */
  actions?: ReactNode
}) {
  const result = useLadderResult(block, attempt, ended)
  const weightUnit = useShellWeightUnit()

  const plan = ladderRoundPlan(block.exercises, timing)
  const pacing = PACING_NOTES[timing.mode]

  return (
    <BlockPanel
      block={block}
      timer={timer}
      completion={{ outcome: result.outcome, timed: result.timed }}
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

          {/*
            TASK-012 (C35, R95): every round as a compact tile — its rung
            target and the fixed companion work, the round count the timing's
            own — instead of the long per-round list. A schedule's start and
            its live round are still each tile's, from the block's own clock.
            TASK-013 (C34): while a raced ladder's clock runs or is paused, the
            tiles are the live ordered check-off, with its count.
          */}
          <LadderPrescription
            exercises={block.exercises}
            rounds={timing.rounds}
            weightUnit={weightUnit}
            roundContext={(number) => roundContext(plan[number - 1], live)}
            progress={progress}
          />

          {pacing !== null && <BlockPanel.Note>{pacing}</BlockPanel.Note>}

          {live?.phase === 'complete' && (
            // The schedule is over, which is all the clock can say — not a
            // record of what was performed.
            <BlockPanel.Note>
              The clock has run every scheduled round. Say how the block ended below.
            </BlockPanel.Note>
          )}

          {/* TASK-010, TASK-013: the ladder's result log, after its work. */}
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

/**
 * The one line of pacing a mode needs beyond its timing line, or none.
 *
 * TASK-012 (AC-R012-02; R71): the capped window's paragraph — "Move through the
 * rounds at your own pace inside the cap. Nothing here moves on by itself — you
 * say how far you got." — was crossed out and is removed, with nothing
 * written in its place: the timing line already states the one cap, and the
 * result log asks how far. The other modes' lines were not part of that
 * removal and are unchanged.
 */
export const PACING_NOTES: Readonly<Record<LadderTiming['mode'], string | null>> = {
  scheduled_starts:
    'Each round starts on the clock. Whatever is left of its interval is your rest.',
  for_time:
    'Start each round when you finish the last. Nothing here moves on by itself — you say how far you got.',
  capped_window: null,
}

/** The live round is `Now` and the one after it `Next`; only a schedule has either. */
function roundMarker(round: LadderRoundPlan, live: ScheduleView | null): BlockMovementMarker {
  if (live === null) return null
  if (live.phase === 'ready') return round.number === 1 ? 'next' : null
  if (live.round === null) return null
  return round.number === live.round ? 'now' : null
}

/**
 * What a round's tile adds to its prescription: a schedule's own start for it
 * and the live round's marker (`Now`, or `Next` before the schedule starts),
 * both read from the block's clock. Free-paced and capped rounds have neither.
 */
function roundContext(round: LadderRoundPlan | undefined, live: ScheduleView | null): LadderRoundContext | null {
  if (round === undefined) return null
  return {
    marker: roundMarker(round, live),
    detail: round.startSeconds === null ? null : `Starts at ${formatElapsed(round.startSeconds)}`,
  }
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
